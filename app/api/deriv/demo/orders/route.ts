import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  DEMO_DAILY_LOSS_LIMIT,
  DEMO_MARKETS,
  DEMO_STAKE,
  getDerivDemoContext,
  getDemoStatement,
  getDemoWebSocketUrl,
  requestOnDemoWebSocket,
  safeDemoError,
} from "@/lib/deriv/demo-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 20;

const noStore = { "Cache-Control": "no-store, max-age=0" };
const FINAL_STATUSES = new Set(["won", "lost", "sold"]);

function jsonError(message: string, status = 400, code = "INVALID_REQUEST") {
  return NextResponse.json({ success: false, error: message, code }, { status, headers: noStore });
}

async function readJson(request: NextRequest) {
  const raw = await request.text();
  if (raw.length > 8_192) throw new Error("Request is too large.");
  try { return JSON.parse(raw); }
  catch { throw new Error("Invalid JSON request."); }
}

function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) throw new Error("A same-origin request is required.");
  try {
    if (new URL(origin).origin !== request.nextUrl.origin) throw new Error("Cross-origin request rejected.");
  } catch {
    throw new Error("Cross-origin request rejected.");
  }
}

async function readOrder(admin: any, userId: string, orderId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) throw new Error("Invalid Demo order ID.");
  const { data, error } = await admin.from("deriv_demo_orders")
    .select("id,request_id,user_id,account_id,currency,market_symbol,contract_type,duration,duration_unit,stake_amount,proposal_id,ask_price,payout,longcode,status,risk_date,buy_requested_at,contract_id,buy_price,sell_price,profit,contract_status,quote_expires_at,opened_at,settled_at")
    .eq("id", orderId).eq("user_id", userId).maybeSingle();
  if (error || !data) throw new Error("Demo order was not found.");
  return data;
}


async function reconcileBuyOrder(
  context: Awaited<ReturnType<typeof getDerivDemoContext>>,
  order: any,
  submittedContractId?: string,
  submittedTransactionId?: string,
) {
  if (order.status === "open" && order.contract_id && order.buy_transaction_id) {
    if (submittedContractId && submittedContractId !== String(order.contract_id)) {
      return { state: "mismatch" as const, reason: "The supplied contract does not match the saved Demo order." };
    }
    return {
      state: "open" as const,
      orderId: order.id,
      contractId: String(order.contract_id),
      transactionId: String(order.buy_transaction_id),
      buyPrice: Number(order.buy_price),
    };
  }

  if (!["reserved", "buy_unknown"].includes(order.status) || !order.buy_requested_at) {
    return { state: "waiting" as const, reason: "This order has no recorded buy attempt yet. Risk remains reserved." };
  }

  const appId = process.env.DERIV_CLIENT_ID;
  if (!appId) return { state: "waiting" as const, reason: "Deriv application ID is not configured. Risk remains reserved." };

  const buyRequestedAt = new Date(order.buy_requested_at).getTime();
  if (!Number.isFinite(buyRequestedAt)) return { state: "waiting" as const, reason: "The buy-attempt timestamp is invalid. Risk remains reserved." };

  const statementMessage = await getDemoStatement(context, Math.floor(buyRequestedAt / 1000));
  const transactions = statementMessage?.statement?.transactions;
  if (!Array.isArray(transactions)) return { state: "waiting" as const, reason: "Deriv did not return a usable statement. Risk remains reserved." };

  const earliest = Math.floor(buyRequestedAt / 1000) - 8;
  const latest = Math.floor(Date.now() / 1000) + 5;
  const matches = transactions.filter((transaction: any) => {
    const transactionTime = Number(transaction.transaction_time);
    const amount = Math.abs(Number(transaction.amount));
    return transaction.action_type === "buy" &&
      String(transaction.app_id) === String(appId) &&
      Math.abs(amount - Number(order.stake_amount)) <= 0.01 &&
      typeof transaction.longcode === "string" &&
      transaction.longcode === order.longcode &&
      Number.isFinite(transactionTime) && transactionTime >= earliest && transactionTime <= latest &&
      /^\\d{1,30}$/.test(String(transaction.contract_id || "")) &&
      /^\\d{1,30}$/.test(String(transaction.transaction_id || "")) &&
      (!submittedContractId || String(transaction.contract_id) === submittedContractId) &&
      (!submittedTransactionId || String(transaction.transaction_id) === submittedTransactionId);
  });

  if (matches.length === 0) {
    if (Date.now() - buyRequestedAt < 15_000) {
      return { state: "waiting" as const, reason: "No matching buy appears in Deriv statement yet. Wait a few seconds and check again; do not retry the purchase." };
    }
    const { data: rejected, error: rejectError } = await context.admin.rpc("senfx_demo_reject_order", {
      p_user_id: context.user.id,
      p_order_id: order.id,
      p_reason: "Deriv statement returned no matching buy transaction after the reconciliation window.",
    });
    if (rejectError || !rejected?.rejected) {
      return { state: "waiting" as const, reason: "No buy was found, but SENFX could not safely release the reservation. Contact support before continuing." };
    }
    return { state: "rejected" as const, reason: "Deriv statement confirms no Demo contract was purchased. The reservation has been released." };
  }

  if (matches.length !== 1) {
    return { state: "waiting" as const, reason: "More than one matching Deriv buy was found. SENFX kept the risk reserved for manual reconciliation." };
  }

  const transaction = matches[0];
  const contractId = String(transaction.contract_id);
  const transactionId = String(transaction.transaction_id);
  const wsUrl = await getDemoWebSocketUrl(context);
  const reqId = Date.now() % 2_000_000_000;
  const verification: any = await requestOnDemoWebSocket(wsUrl, {
    proposal_open_contract: 1,
    contract_id: Number(contractId),
    req_id: reqId,
  }, "proposal_open_contract");
  const contract = verification?.proposal_open_contract;

  const dateStart = Number(contract?.date_start);
  const dateExpiry = Number(contract?.date_expiry);
  const actualBuyPrice = Number(contract?.buy_price);
  const transactionAmount = Math.abs(Number(transaction.amount));
  const durationSeconds = dateExpiry - dateStart;

  if (
    String(contract?.contract_id) !== contractId ||
    contract?.underlying_symbol !== order.market_symbol ||
    contract?.contract_type !== order.contract_type ||
    contract?.currency !== order.currency ||
    typeof contract?.longcode !== "string" ||
    contract.longcode !== order.longcode ||
    !Number.isFinite(actualBuyPrice) ||
    Math.abs(actualBuyPrice - transactionAmount) > 0.01 ||
    actualBuyPrice <= 0 || actualBuyPrice > DEMO_STAKE ||
    !Number.isFinite(durationSeconds) || Math.abs(durationSeconds - 300) > 2
  ) {
    return { state: "waiting" as const, reason: "Deriv found a buy, but its contract details do not match the saved 5-minute Demo quote. Risk remains reserved while the order is reviewed." };
  }

  const { data: confirmed, error: confirmError } = await context.admin.rpc("senfx_demo_confirm_order", {
    p_user_id: context.user.id,
    p_order_id: order.id,
    p_contract_id: contractId,
    p_transaction_id: transactionId,
    p_buy_price: actualBuyPrice,
  });
  if (confirmError || !confirmed?.confirmed) {
    return { state: "waiting" as const, reason: "Deriv confirmed the contract, but SENFX could not save the order. Risk remains reserved; do not purchase again." };
  }

  return {
    state: "open" as const,
    orderId: order.id,
    contractId,
    transactionId,
    buyPrice: actualBuyPrice,
    contractStatus: contract.status || "open",
    isSold: contract.is_sold === 1,
    isExpired: contract.is_expired === 1,
  };
}

function safeRisk(risk: any, orders: any[]) {
  const dailyLoss = Number(risk?.realized_loss ?? 0);
  const reservedLoss = Number(risk?.reserved_loss ?? 0);
  const limit = Number(risk?.daily_loss_limit ?? DEMO_DAILY_LOSS_LIMIT);
  return {
    dailyLoss,
    reservedLoss,
    dailyLossLimit: limit,
    remainingLossBudget: Math.max(0, limit - dailyLoss - reservedLoss),
    limitReached: dailyLoss + reservedLoss + DEMO_STAKE > limit,
    orders,
  };
}

export async function GET() {
  try {
    if (process.env.DERIV_DEMO_TRADING_ENABLED !== "true") {
      return NextResponse.json({ enabled: false, error: "Deriv Demo execution is not enabled for this deployment." }, { status: 503, headers: noStore });
    }

    const context = await getDerivDemoContext();
    const riskDate = new Date().toISOString().slice(0, 10);
    const [riskResult, orderResult] = await Promise.all([
      context.admin.from("deriv_demo_daily_risk")
        .select("risk_date,currency,daily_loss_limit,realized_loss,reserved_loss")
        .eq("user_id", context.user.id)
        .eq("account_id", context.account.account_id)
        .eq("risk_date", riskDate)
        .maybeSingle(),
      context.admin.from("deriv_demo_orders")
        .select("id,market_symbol,contract_type,duration,duration_unit,stake_amount,currency,status,contract_id,buy_price,sell_price,profit,contract_status,created_at,opened_at,settled_at")
        .eq("user_id", context.user.id)
        .eq("account_id", context.account.account_id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    if (riskResult.error || orderResult.error) {
      console.error("SENFX Demo dashboard lookup failed:", {
        riskCode: riskResult.error?.code,
        ordersCode: orderResult.error?.code,
      });
      return jsonError("Could not load Demo risk and order history. Apply the SENFX Demo execution migration.", 503, "DEMO_SCHEMA_MISSING");
    }

    const orders = orderResult.data || [];
    return NextResponse.json({
      enabled: true,
      account: {
        accountId: context.account.account_id,
        accountType: "demo",
        currency: context.account.currency,
        balance: Number(context.account.balance),
      },
      riskDate,
      ...safeRisk(riskResult.data, orders),
      activeOrder: orders.find((order: any) => ["reserved", "open", "buy_unknown"].includes(order.status)) || null,
    }, { headers: noStore });
  } catch (error) {
    const safe = safeDemoError(error);
    return NextResponse.json({ enabled: false, error: safe.error, code: safe.code }, { status: safe.status, headers: noStore });
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    if (process.env.DERIV_DEMO_TRADING_ENABLED !== "true") {
      return jsonError("Deriv Demo execution is not enabled for this deployment.", 503, "DEMO_EXECUTION_DISABLED");
    }

    const body = await readJson(request);
    const action = body?.action;
    const context = await getDerivDemoContext();

    if (action === "reserve") {
      const requestId = body?.requestId;
      const proposalId = body?.proposalId;
      const marketSymbol = body?.marketSymbol;
      const direction = body?.direction;
      const currency = body?.currency;
      const askPrice = Number(body?.askPrice);
      const payout = Number(body?.payout);
      const longcode = typeof body?.longcode === "string" ? body.longcode.slice(0, 500) : null;

      if (typeof requestId !== "string" || !/^[0-9a-f-]{36}$/i.test(requestId)) return jsonError("A valid request ID is required.");
      if (typeof proposalId !== "string" || !/^[A-Za-z0-9_-]{24,128}$/.test(proposalId)) return jsonError("Deriv returned an invalid proposal ID.");
      if (typeof marketSymbol !== "string" || !DEMO_MARKETS.has(marketSymbol)) return jsonError("This market is not enabled for SENFX Demo execution.");
      if (direction !== "CALL" && direction !== "PUT") return jsonError("Choose Rise (CALL) or Fall (PUT).");
      if (currency !== context.account.currency) return jsonError("The quote currency does not match your selected Demo account.");
      if (!Number.isFinite(askPrice) || askPrice <= 0 || askPrice > DEMO_STAKE) return jsonError("The quoted stake must not exceed 10 account-currency units.");
      if (!Number.isFinite(payout) || payout <= 0) return jsonError("Deriv did not return a valid potential payout.");

      const { data: order, error: insertError } = await context.admin.from("deriv_demo_orders")
        .insert({
          request_id: requestId,
          user_id: context.user.id,
          account_id: context.account.account_id,
          currency: context.account.currency,
          market_symbol: marketSymbol,
          contract_type: direction,
          duration: 5,
          duration_unit: "m",
          stake_amount: DEMO_STAKE,
          proposal_id: proposalId,
          ask_price: askPrice,
          payout,
          longcode,
          status: "quoted",
          quote_expires_at: new Date(Date.now() + 20_000).toISOString(),
        })
        .select("id")
        .single();

      if (insertError || !order) {
        console.error("SENFX Demo order quote save failed:", insertError?.code);
        return jsonError("Could not save the Demo quote. Refresh the price and try once.", 503, "QUOTE_SAVE_FAILED");
      }

      const { data: reservation, error: reserveError } = await context.admin.rpc("senfx_demo_reserve_order", {
        p_user_id: context.user.id,
        p_order_id: order.id,
      });

      if (reserveError || !reservation?.allowed) {
        await context.admin.from("deriv_demo_orders").update({ status: "rejected", updated_at: new Date().toISOString() })
          .eq("id", order.id).eq("user_id", context.user.id);
        if (reserveError) {
          console.error("SENFX Demo risk reservation failed:", reserveError.code);
          return jsonError("The server could not reserve the Demo risk budget. No buy request was sent.", 503, "RISK_RESERVATION_FAILED");
        }
        return NextResponse.json({
          success: false,
          error: reservation?.reason || "The Demo risk limit blocked this trade.",
          risk: reservation,
        }, { status: 409, headers: noStore });
      }

      return NextResponse.json({
        success: true,
        orderId: order.id,
        stakeAmount: DEMO_STAKE,
        risk: reservation,
        instruction: "Risk is reserved. Submit the proposal ID once on the currently connected Deriv Demo WebSocket.",
      }, { headers: noStore });
    }

    if (action === "buy-attempt") {
      const order = await readOrder(context.admin, context.user.id, String(body?.orderId || ""));
      const { data, error } = await context.admin.rpc("senfx_demo_mark_buy_attempt", {
        p_user_id: context.user.id,
        p_order_id: order.id,
      });
      if (error || !data?.marked) {
        return jsonError("SENFX could not mark the buy attempt. No purchase should be sent.", 409, "BUY_ATTEMPT_NOT_MARKED");
      }
      return NextResponse.json({ success: true, buyRequestedAt: data.buyRequestedAt }, { headers: noStore });
    }

    if (action === "confirm" || action === "reconcile") {
      const order = await readOrder(context.admin, context.user.id, String(body?.orderId || ""));
      const contractId = typeof body?.contractId === "string" && /^\\d{1,30}$/.test(body.contractId)
        ? body.contractId
        : undefined;
      const transactionId = typeof body?.transactionId === "string" && /^\\d{1,30}$/.test(body.transactionId)
        ? body.transactionId
        : undefined;
      const result = await reconcileBuyOrder(context, order, contractId, transactionId);
      if (result.state === "open") {
        return NextResponse.json({ success: true, ...result }, { headers: noStore });
      }
      if (result.state === "rejected") {
        return NextResponse.json({ success: true, ...result }, { headers: noStore });
      }
      return NextResponse.json({
        success: false,
        state: result.state,
        error: result.reason,
        riskRemainsReserved: true,
      }, { status: 409, headers: noStore });
    }

    if (action === "buy-unknown") {
      const order = await readOrder(context.admin, context.user.id, String(body?.orderId || ""));
      const { data, error } = await context.admin.rpc("senfx_demo_mark_buy_unknown", {
        p_user_id: context.user.id,
        p_order_id: order.id,
      });
      if (error || !data?.updated) return jsonError("Could not preserve the unresolved Demo reservation.", 503, "UNKNOWN_ORDER_UPDATE_FAILED");
      return NextResponse.json({ success: true, riskRemainsReserved: true }, { headers: noStore });
    }

    if (action === "cancel") {
      const order = await readOrder(context.admin, context.user.id, String(body?.orderId || ""));
      const { data, error } = await context.admin.rpc("senfx_demo_cancel_order", {
        p_user_id: context.user.id,
        p_order_id: order.id,
        p_reason: typeof body?.reason === "string" ? body.reason.slice(0, 160) : "Deriv rejected the Demo purchase.",
      });
      if (error || !data?.cancelled) return jsonError("SENFX could not release this reservation. It remains held for safety.", 409, "DEMO_RESERVATION_NOT_RELEASED");
      return NextResponse.json({ success: true, cancelled: true }, { headers: noStore });
    }

    if (action === "settle") {
      const order = await readOrder(context.admin, context.user.id, String(body?.orderId || ""));
      if (FINAL_STATUSES.has(order.status)) {
        const today = new Date().toISOString().slice(0, 10);
        const { data: risk } = await context.admin.from("deriv_demo_daily_risk")
          .select("daily_loss_limit,realized_loss,reserved_loss")
          .eq("user_id", context.user.id).eq("account_id", order.account_id).eq("risk_date", order.risk_date || today).maybeSingle();
        return NextResponse.json({
          success: true, settled: true, status: order.status, profit: Number(order.profit || 0),
          dailyLoss: Number(risk?.realized_loss || 0), reservedLoss: Number(risk?.reserved_loss || 0),
          dailyLossLimit: Number(risk?.daily_loss_limit || DEMO_DAILY_LOSS_LIMIT),
          remainingLossBudget: Math.max(0, Number(risk?.daily_loss_limit || DEMO_DAILY_LOSS_LIMIT) - Number(risk?.realized_loss || 0) - Number(risk?.reserved_loss || 0)),
        }, { headers: noStore });
      }
      if (order.status !== "open" || !order.contract_id) {
        if (order.status === "buy_unknown") {
          return jsonError("This purchase is unresolved. Its risk reservation remains held; do not place another trade.", 409, "BUY_REQUIRES_RECONCILIATION");
        }
        return jsonError("No confirmed open Demo contract was found.", 409, "ORDER_NOT_OPEN");
      }

      const wsUrl = await getDemoWebSocketUrl(context);
      const reqId = Date.now() % 2_000_000_000;
      const statusMessage: any = await requestOnDemoWebSocket(wsUrl, {
        proposal_open_contract: 1,
        contract_id: Number(order.contract_id),
        req_id: reqId,
      }, "proposal_open_contract");
      const contract = statusMessage?.proposal_open_contract;

      if (String(contract?.contract_id) !== String(order.contract_id)) {
        return jsonError("Deriv did not confirm this contract ID.", 409, "CONTRACT_NOT_VERIFIED");
      }
      const isFinal = contract?.is_sold === 1 || contract?.is_expired === 1 || FINAL_STATUSES.has(String(contract?.status || "").toLowerCase());
      if (!isFinal) {
        return NextResponse.json({
          success: true, settled: false, status: "open",
          contractStatus: contract?.status || "open",
          currentProfit: Number(contract?.profit || 0),
          isValidToSell: contract?.is_valid_to_sell === 1,
        }, { headers: noStore });
      }

      const profit = Number(contract?.profit);
      if (!Number.isFinite(profit)) return jsonError("Deriv did not return a final contract profit. Reservation remains held.", 503, "FINAL_PROFIT_MISSING");

      const contractStatus = String(contract?.status || (contract?.is_sold === 1 ? "sold" : profit < 0 ? "lost" : "won")).toLowerCase();
      const finalStatus = contract?.is_sold === 1 || contractStatus === "sold" ? "sold" : profit < 0 ? "lost" : "won";
      const sellPrice = contract?.sell_price == null ? null : Number(contract.sell_price);

      const { data: settled, error: settleError } = await context.admin.rpc("senfx_demo_settle_order", {
        p_user_id: context.user.id,
        p_order_id: order.id,
        p_final_status: finalStatus,
        p_profit: profit,
        p_sell_price: Number.isFinite(sellPrice) ? sellPrice : null,
        p_contract_status: contractStatus,
      });

      if (settleError || !settled?.settled) {
        console.error("SENFX Demo settlement failed:", settleError?.code);
        return jsonError("Deriv reports the contract finished, but SENFX could not update its risk ledger. Do not place another trade.", 503, "DEMO_SETTLEMENT_FAILED");
      }

      return NextResponse.json({ success: true, ...settled }, { headers: noStore });
    }

    return jsonError("Unsupported Demo order action.");
  } catch (error) {
    const safe = safeDemoError(error);
    if (safe.status >= 500) console.error("SENFX Demo order route failure:", safe.code);
    return NextResponse.json(
      { success: false, error: safe.error, code: safe.code },
      { status: safe.status },
    );
  }
}
