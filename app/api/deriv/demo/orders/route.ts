import { NextRequest, NextResponse } from "next/server";
import {
  DEMO_DAILY_LOSS_LIMIT,
  DEMO_MARKETS,
  DEMO_STAKE,
  DemoApiError,
  getDerivDemoContext,
  getDemoStatement,
  openDerivDemoSession,
  safeDemoError,
} from "@/lib/deriv/demo-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 25;

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
    .select("id,request_id,user_id,account_id,currency,market_symbol,contract_type,duration,duration_unit,stake_amount,proposal_id,ask_price,payout,longcode,status,risk_date,buy_requested_at,contract_id,buy_transaction_id,buy_price,sell_price,profit,contract_status,quote_expires_at,opened_at,settled_at")
    .eq("id", orderId).eq("user_id", userId).maybeSingle();
  if (error || !data) throw new Error("Demo order was not found.");
  return data;
}

function parseDemoShortcode(shortcode: unknown, order: any) {
  if (typeof shortcode !== "string") return null;
  const parts = shortcode.split("_");
  const symbolParts = String(order.market_symbol).split("_");
  const symbolEnd = 1 + symbolParts.length;
  if (parts[0] !== order.contract_type ||
      parts.slice(1, symbolEnd).join("_") !== order.market_symbol) return null;

  const payout = Number(parts[symbolEnd]);
  const start = Number(parts[symbolEnd + 1]);
  const expiry = Number(parts[symbolEnd + 2]);
  if (!Number.isFinite(payout) || !Number.isFinite(start) || !Number.isFinite(expiry)) return null;
  if (Math.abs(payout - Number(order.payout)) > 0.02 || Math.abs(expiry - start - 300) > 2) return null;
  return { payout, start, expiry };
}

async function reconcileBuyOrder(
  context: Awaited<ReturnType<typeof getDerivDemoContext>>,
  order: any,
  submittedContractId?: string,
  submittedTransactionId?: string,
) {
  if (order.account_id !== context.account.account_id) {
    return { state: "waiting" as const, reason: "This Demo order belongs to a different account. Switch back to that Demo account to reconcile it." };
  }
  if (order.status === "open" && order.contract_id && order.buy_transaction_id) {
    if (submittedContractId && submittedContractId !== String(order.contract_id)) {
      return { state: "mismatch" as const, reason: "The supplied Deriv contract does not match the saved Demo order." };
    }
    if (submittedTransactionId && submittedTransactionId !== String(order.buy_transaction_id)) {
      return { state: "mismatch" as const, reason: "The supplied Deriv transaction does not match the saved Demo order." };
    }
    return {
      state: "open" as const,
      orderId: order.id,
      contractId: String(order.contract_id),
      transactionId: String(order.buy_transaction_id),
      buyPrice: Number(order.buy_price),
    };
  }

  if (order.status === "reserved" && !order.buy_requested_at) {
    const { data, error } = await context.admin.rpc("senfx_demo_cancel_order", {
      p_user_id: context.user.id,
      p_order_id: order.id,
      p_reason: "No buy request was sent after the risk reservation.",
    });
    if (error || !data?.cancelled) {
      return { state: "waiting" as const, reason: "No buy attempt was recorded, but SENFX could not release the unused reservation. Contact support." };
    }
    return { state: "rejected" as const, reason: "No Deriv buy was sent. The unused risk reservation has been released." };
  }

  if (!["reserved", "buy_unknown"].includes(order.status) || !order.buy_requested_at) {
    return { state: "waiting" as const, reason: "This order has no recorded buy attempt. Risk remains reserved." };
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
  const candidates = transactions.filter((transaction: any) => {
    const transactionTime = Number(transaction.transaction_time);
    const amount = Math.abs(Number(transaction.amount));
    return transaction.action_type === "buy" &&
      String(transaction.app_id) === String(appId) &&
      Math.abs(amount - Number(order.stake_amount)) <= 0.01 &&
      Number.isFinite(transactionTime) && transactionTime >= earliest && transactionTime <= latest &&
      /^\d{1,30}$/.test(String(transaction.contract_id || "")) &&
      /^\d{1,30}$/.test(String(transaction.transaction_id || "")) &&
      (!submittedContractId || String(transaction.contract_id) === submittedContractId) &&
      (!submittedTransactionId || String(transaction.transaction_id) === submittedTransactionId);
  });

  const matchingBuys = candidates.filter((transaction: any) =>
    parseDemoShortcode(transaction.shortcode, order) !== null
  );

  if (matchingBuys.length === 0) {
    if (candidates.length > 0 || submittedContractId || submittedTransactionId) {
      return { state: "waiting" as const, reason: "Deriv shows a plausible recent buy, but SENFX cannot verify its shortcode against the saved contract terms. The reservation remains held for manual review." };
    }
    if (Date.now() - buyRequestedAt < 15_000) {
      return { state: "waiting" as const, reason: "No matching buy appears in Deriv statement yet. Wait a few seconds and check again; do not retry the purchase." };
    }
    const { data, error } = await context.admin.rpc("senfx_demo_reject_order", {
      p_user_id: context.user.id,
      p_order_id: order.id,
      p_reason: "Complete Deriv statement returned no buy for this application, stake and time window.",
    });
    if (error || !data?.rejected) {
      return { state: "waiting" as const, reason: "No buy was found, but SENFX could not safely release the reservation. Contact support before continuing." };
    }
    return { state: "rejected" as const, reason: "Deriv statement confirms no Demo contract was purchased. The reservation has been released." };
  }

  if (matchingBuys.length !== 1) {
    return { state: "waiting" as const, reason: "Multiple recent Demo purchases match this application's contract terms and time window. SENFX kept the risk reserved for manual reconciliation." };
  }

  const transaction = matchingBuys[0];
  const contractId = String(transaction.contract_id);
  const transactionId = String(transaction.transaction_id);
  const parsedShortcode = parseDemoShortcode(transaction.shortcode, order);

  const session = await openDerivDemoSession(context);
  try {
    const statusMessage: any = await session.request("proposal_open_contract", {
      proposal_open_contract: 1,
      contract_id: Number(contractId),
    });
    const contract = statusMessage?.proposal_open_contract;
    const actualBuyPrice = Number(contract?.buy_price);
    const actualPayout = Number(contract?.payout);
    const dateStart = Number(contract?.date_start);
    const dateExpiry = Number(contract?.date_expiry);
    const transactionAmount = Math.abs(Number(transaction.amount));

    if (
      !parsedShortcode ||
      String(contract?.contract_id) !== contractId ||
      contract?.underlying_symbol !== order.market_symbol ||
      contract?.contract_type !== order.contract_type ||
      contract?.currency !== order.currency ||
      typeof contract?.longcode !== "string" ||
      contract.longcode !== order.longcode ||
      !Number.isFinite(actualBuyPrice) ||
      Math.abs(actualBuyPrice - transactionAmount) > 0.01 ||
      Math.abs(actualBuyPrice - Number(order.ask_price)) > 0.01 ||
      !Number.isFinite(actualPayout) ||
      Math.abs(actualPayout - parsedShortcode.payout) > 0.02 ||
      Math.abs(actualPayout - Number(order.payout)) > 0.02 ||
      Math.abs(dateStart - parsedShortcode.start) > 2 ||
      Math.abs(dateExpiry - parsedShortcode.expiry) > 2 ||
      actualBuyPrice <= 0 || actualBuyPrice > DEMO_STAKE ||
      Math.abs((dateExpiry - dateStart) - 300) > 2
    ) {
      return { state: "waiting" as const, reason: "Deriv found a buy, but its contract details do not match the saved five-minute Demo quote. Risk remains reserved while the order is reviewed." };
    }

    const { data, error } = await context.admin.rpc("senfx_demo_confirm_order", {
      p_user_id: context.user.id,
      p_order_id: order.id,
      p_contract_id: contractId,
      p_transaction_id: transactionId,
      p_buy_price: actualBuyPrice,
    });
    if (error || !data?.confirmed) {
      return { state: "waiting" as const, reason: "Deriv confirmed the contract, but SENFX could not save the order. Risk remains reserved; do not purchase again." };
    }

    return {
      state: "open" as const,
      orderId: order.id,
      contractId,
      transactionId,
      buyPrice: actualBuyPrice,
      contractStatus: contract.status || "open",
    };
  } finally {
    session.close();
  }
}

function isFinalContract(contract: any) {
  const status = String(contract?.status || "").toLowerCase();
  return contract?.is_sold === 1 || contract?.is_expired === 1 || FINAL_STATUSES.has(status);
}

async function settleVerifiedContract(
  context: Awaited<ReturnType<typeof getDerivDemoContext>>,
  order: any,
  contract: any,
) {
  const profit = Number(contract?.profit);
  if (!Number.isFinite(profit)) {
    return { settled: false, reason: "Deriv did not return a final contract profit. The risk reservation remains held." };
  }

  const status = String(contract?.status || "").toLowerCase();
  const finalStatus = contract?.is_sold === 1 || status === "sold"
    ? "sold"
    : profit < 0 ? "lost" : "won";
  const sellPrice = contract?.sell_price == null ? null : Number(contract.sell_price);
  const { data, error } = await context.admin.rpc("senfx_demo_settle_order", {
    p_user_id: context.user.id,
    p_order_id: order.id,
    p_final_status: finalStatus,
    p_profit: profit,
    p_sell_price: Number.isFinite(sellPrice) ? sellPrice : null,
    p_contract_status: status || finalStatus,
  });
  if (error || !data?.settled) {
    console.error("SENFX Demo settlement failed:", error?.code);
    return { settled: false, reason: "Deriv reports the contract finished, but SENFX could not update its risk ledger. Do not place another trade." };
  }
  return data;
}

async function getVerifiedContract(
  session: Awaited<ReturnType<typeof openDerivDemoSession>>,
  order: any,
) {
  const response: any = await session.request("proposal_open_contract", {
    proposal_open_contract: 1,
    contract_id: Number(order.contract_id),
  });
  const contract = response?.proposal_open_contract;
  if (
    String(contract?.contract_id) !== String(order.contract_id) ||
    contract?.underlying_symbol !== order.market_symbol ||
    contract?.contract_type !== order.contract_type ||
    contract?.currency !== order.currency
  ) {
    throw new DemoApiError("Deriv contract details do not match the SENFX order record.", 409, "CONTRACT_DETAILS_MISMATCH");
  }
  return contract;
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
        .select("id,market_symbol,contract_type,duration,duration_unit,stake_amount,currency,status,contract_id,buy_price,sell_price,profit,contract_status,created_at,opened_at,settled_at,buy_requested_at")
        .eq("user_id", context.user.id)
        .eq("account_id", context.account.account_id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    if (riskResult.error || orderResult.error) {
      console.error("SENFX Demo dashboard lookup failed:", { riskCode: riskResult.error?.code, ordersCode: orderResult.error?.code });
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
  let session: Awaited<ReturnType<typeof openDerivDemoSession>> | null = null;

  try {
    assertSameOrigin(request);
    if (process.env.DERIV_DEMO_TRADING_ENABLED !== "true") {
      return jsonError("Deriv Demo execution is not enabled for this deployment.", 503, "DEMO_EXECUTION_DISABLED");
    }
    const body = await readJson(request);
    const action = body?.action;
    const context = await getDerivDemoContext();

    if (action === "quote") {
      const marketSymbol = body?.marketSymbol;
      const direction = body?.direction;
      if (typeof marketSymbol !== "string" || !DEMO_MARKETS.has(marketSymbol)) return jsonError("This market is not enabled for SENFX Demo execution.");
      if (direction !== "CALL" && direction !== "PUT") return jsonError("Choose Rise (CALL) or Fall (PUT).");

      const { data: activeOrders, error: activeError } = await context.admin.from("deriv_demo_orders")
        .select("id")
        .eq("user_id", context.user.id)
        .eq("account_id", context.account.account_id)
        .in("status", ["reserved", "open", "buy_unknown"])
        .limit(1);
      if (activeError) return jsonError("Could not check for an existing Demo order.", 503, "ACTIVE_ORDER_CHECK_FAILED");
      if (activeOrders && activeOrders.length > 0) return jsonError("Settle or reconcile your active Demo order before requesting another quote.", 409, "ACTIVE_ORDER_EXISTS");

      const minuteAgo = new Date(Date.now() - 60_000).toISOString();
      const { count: recentQuoteCount, error: quoteRateError } = await context.admin
        .from("deriv_demo_orders")
        .select("id", { count: "exact", head: true })
        .eq("user_id", context.user.id)
        .eq("account_id", context.account.account_id)
        .gte("created_at", minuteAgo);
      if (quoteRateError) return jsonError("Could not verify quote request limits. Try again.", 503, "QUOTE_RATE_CHECK_FAILED");
      if ((recentQuoteCount || 0) >= 8) return jsonError("Too many quote requests. Please wait one minute before requesting another price.", 429, "QUOTE_RATE_LIMIT");

      // Only one live quote is needed per customer/account. Older unconfirmed
      // quotes cannot be submitted after the customer requests a new one.
      const { error: expireQuotesError } = await context.admin.from("deriv_demo_orders")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("user_id", context.user.id)
        .eq("account_id", context.account.account_id)
        .eq("status", "quoted");
      if (expireQuotesError) {
        console.error("SENFX old quote cleanup failed:", expireQuotesError.code);
        return jsonError("Could not expire your previous quote. No new quote was requested.", 503, "QUOTE_CLEANUP_FAILED");
      }

      session = await openDerivDemoSession(context);
      const proposalResponse: any = await session.request("proposal", {
        proposal: 1,
        amount: DEMO_STAKE,
        basis: "stake",
        contract_type: direction,
        currency: context.account.currency,
        duration: 5,
        duration_unit: "m",
        subscribe: 1,
        underlying_symbol: marketSymbol,
      });
      const proposal = proposalResponse?.proposal;
      const askPrice = Number(proposal?.ask_price);
      const payout = Number(proposal?.payout);
      const proposalId = String(proposal?.id || "");
      const dateStart = Number(proposal?.date_start);
      const dateExpiry = Number(proposal?.date_expiry);
      if (
        !/^[A-Za-z0-9_-]{32,128}$/.test(proposalId) ||
        !Number.isFinite(askPrice) || askPrice <= 0 || askPrice > DEMO_STAKE ||
        !Number.isFinite(payout) || payout <= 0 ||
        !Number.isFinite(dateStart) || !Number.isFinite(dateExpiry) ||
        Math.abs(dateExpiry - dateStart - 300) > 2 ||
        typeof proposal?.longcode !== "string"
      ) {
        return jsonError("Deriv returned a proposal that does not meet SENFX's fixed five-minute, 10-unit Demo rules.", 502, "INVALID_DERIV_PROPOSAL");
      }

      const { data: order, error } = await context.admin.from("deriv_demo_orders").insert({
        request_id: crypto.randomUUID(),
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
        longcode: proposal.longcode.slice(0, 500),
        status: "quoted",
        quote_expires_at: new Date(Date.now() + 20_000).toISOString(),
      }).select("id").single();

      if (error || !order) {
        console.error("SENFX Demo quote save failed:", error?.code);
        return jsonError("Could not save the verified Deriv quote. No order was sent.", 503, "QUOTE_SAVE_FAILED");
      }

      return NextResponse.json({
        success: true,
        orderId: order.id,
        quote: {
          askPrice,
          payout,
          longcode: proposal.longcode,
          currency: context.account.currency,
          marketSymbol,
          direction,
          durationMinutes: 5,
          stakeAmount: DEMO_STAKE,
        },
      }, { headers: noStore });
    }

    if (action === "cancel-quote") {
      const order = await readOrder(context.admin, context.user.id, String(body?.orderId || ""));
      if (order.account_id !== context.account.account_id) return jsonError("This quote belongs to a different Demo account.", 409, "DEMO_ACCOUNT_MISMATCH");
      const { data, error } = await context.admin.rpc("senfx_demo_cancel_order", {
        p_user_id: context.user.id,
        p_order_id: order.id,
        p_reason: "Customer cancelled the unsubmitted Demo quote.",
      });
      if (error || !data?.cancelled) return jsonError("Could not cancel this unused quote.", 409, "QUOTE_CANCEL_FAILED");
      return NextResponse.json({ success: true, cancelled: true }, { headers: noStore });
    }

    if (action === "buy") {
      const order = await readOrder(context.admin, context.user.id, String(body?.orderId || ""));
      if (order.account_id !== context.account.account_id) return jsonError("This quote belongs to a different Demo account.", 409, "DEMO_ACCOUNT_MISMATCH");
      if (order.status !== "quoted") return jsonError("This quote is no longer available. Request a new price.", 409, "QUOTE_NOT_AVAILABLE");
      if (new Date(order.quote_expires_at).getTime() <= Date.now()) {
        await context.admin.from("deriv_demo_orders").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", order.id).eq("user_id", context.user.id);
        return jsonError("The quote expired. Request a fresh price.", 409, "QUOTE_EXPIRED");
      }

      session = await openDerivDemoSession(context);
      const freshResponse: any = await session.request("proposal", {
        proposal: 1,
        amount: DEMO_STAKE,
        basis: "stake",
        contract_type: order.contract_type,
        currency: context.account.currency,
        duration: 5,
        duration_unit: "m",
        subscribe: 1,
        underlying_symbol: order.market_symbol,
      });
      const proposal = freshResponse?.proposal;
      const freshId = String(proposal?.id || "");
      const freshAsk = Number(proposal?.ask_price);
      const freshPayout = Number(proposal?.payout);
      const start = Number(proposal?.date_start);
      const expiry = Number(proposal?.date_expiry);
      if (
        !/^[A-Za-z0-9_-]{32,128}$/.test(freshId) ||
        !Number.isFinite(freshAsk) || freshAsk <= 0 || freshAsk > DEMO_STAKE ||
        !Number.isFinite(freshPayout) || freshPayout <= 0 ||
        !Number.isFinite(start) || !Number.isFinite(expiry) || Math.abs(expiry - start - 300) > 2 ||
        typeof proposal?.longcode !== "string"
      ) {
        return jsonError("Deriv did not return a valid fresh proposal. No buy request was sent.", 502, "INVALID_FRESH_PROPOSAL");
      }

      if (Math.abs(freshAsk - Number(order.ask_price)) > 0.01 ||
          Math.abs(freshPayout - Number(order.payout)) > 0.02 ||
          proposal.longcode !== order.longcode) {
        const { error: quoteUpdateError } = await context.admin.from("deriv_demo_orders").update({
          proposal_id: freshId,
          ask_price: freshAsk,
          payout: freshPayout,
          longcode: proposal.longcode.slice(0, 500),
          quote_expires_at: new Date(Date.now() + 20_000).toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", order.id).eq("user_id", context.user.id);
        if (quoteUpdateError) {
          console.error("SENFX updated quote persistence failed:", quoteUpdateError.code);
          return jsonError("Deriv's quote changed and SENFX could not save the new terms. No buy request was sent.", 503, "QUOTE_UPDATE_FAILED");
        }
        return NextResponse.json({
          success: false,
          quoteChanged: true,
          error: "Deriv's latest price or payout changed. Review the updated quote before confirming again.",
          quote: {
            orderId: order.id,
            askPrice: freshAsk,
            payout: freshPayout,
            longcode: proposal.longcode,
            currency: context.account.currency,
            marketSymbol: order.market_symbol,
            direction: order.contract_type,
            durationMinutes: 5,
            stakeAmount: DEMO_STAKE,
          },
        }, { status: 409, headers: noStore });
      }

      // Record the exact streaming proposal that will be bought on this same
      // authenticated server session. The original browser-visible quote is never
      // sent to Deriv for purchase.
      const { error: freshProposalSaveError } = await context.admin.from("deriv_demo_orders").update({
        proposal_id: freshId,
        ask_price: freshAsk,
        payout: freshPayout,
        longcode: proposal.longcode.slice(0, 500),
        quote_expires_at: new Date(Date.now() + 20_000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", order.id).eq("user_id", context.user.id);
      if (freshProposalSaveError) {
        console.error("SENFX fresh proposal save failed:", freshProposalSaveError.code);
        return jsonError("SENFX could not save the fresh Deriv proposal. No buy request was sent.", 503, "FRESH_PROPOSAL_SAVE_FAILED");
      }

      const { data: reservation, error: reserveError } = await context.admin.rpc("senfx_demo_reserve_order", {
        p_user_id: context.user.id,
        p_order_id: order.id,
      });
      if (reserveError || !reservation?.allowed) {
        if (reserveError) console.error("SENFX Demo risk reservation failed:", reserveError.code);
        return jsonError(reservation?.reason || "SENFX could not reserve the Demo risk budget. No buy request was sent.", reserveError ? 503 : 409, "RISK_RESERVATION_FAILED");
      }

      const { data: attempt, error: attemptError } = await context.admin.rpc("senfx_demo_mark_buy_attempt", {
        p_user_id: context.user.id,
        p_order_id: order.id,
      });
      if (attemptError || !attempt?.marked) {
        await context.admin.rpc("senfx_demo_cancel_order", {
          p_user_id: context.user.id,
          p_order_id: order.id,
          p_reason: "Buy attempt was not started because the server could not mark it.",
        });
        return jsonError("SENFX could not safely mark the purchase attempt. No buy request was sent.", 503, "BUY_ATTEMPT_NOT_MARKED");
      }

      let buyResponse: any;
      try {
        buyResponse = await session.request("buy", {
          buy: freshId,
          price: DEMO_STAKE,
        }, 12_000);
      } catch (error) {
        if (error instanceof DemoApiError && error.code === "DERIV_REQUEST_REJECTED") {
          const { data, error: rejectError } = await context.admin.rpc("senfx_demo_reject_order", {
            p_user_id: context.user.id,
            p_order_id: order.id,
            p_reason: "Deriv returned an explicit buy rejection. No contract was created.",
          });
          if (!rejectError && data?.rejected) {
            return jsonError(error.message, 400, "DERIV_BUY_REJECTED");
          }
        }
        await context.admin.rpc("senfx_demo_mark_buy_unknown", {
          p_user_id: context.user.id,
          p_order_id: order.id,
        });
        return jsonError("Deriv did not conclusively confirm the purchase. The full 10-unit reservation remains held. Check the Deriv statement; do not retry.", 503, "BUY_CONFIRMATION_UNKNOWN");
      }

      const contractId = String(buyResponse?.buy?.contract_id || "");
      const transactionId = String(buyResponse?.buy?.transaction_id || "");
      if (!/^\d{1,30}$/.test(contractId) || !/^\d{1,30}$/.test(transactionId)) {
        await context.admin.rpc("senfx_demo_mark_buy_unknown", {
          p_user_id: context.user.id,
          p_order_id: order.id,
        });
        return jsonError("Deriv's buy response was incomplete. The full 10-unit reservation remains held for statement reconciliation.", 503, "BUY_RESPONSE_INCOMPLETE");
      }

      const verification: any = await session.request("proposal_open_contract", {
        proposal_open_contract: 1,
        contract_id: Number(contractId),
      });
      const contract = verification?.proposal_open_contract;
      const actualBuyPrice = Number(contract?.buy_price);
      const actualPayout = Number(contract?.payout);
      const actualStart = Number(contract?.date_start);
      const actualExpiry = Number(contract?.date_expiry);
      if (
        String(contract?.contract_id) !== contractId ||
        contract?.underlying_symbol !== order.market_symbol ||
        contract?.contract_type !== order.contract_type ||
        contract?.currency !== order.currency ||
        !Number.isFinite(actualBuyPrice) ||
        Math.abs(actualBuyPrice - Number(order.ask_price)) > 0.01 ||
        !Number.isFinite(actualPayout) ||
        Math.abs(actualPayout - Number(order.payout)) > 0.02 ||
        typeof contract?.longcode !== "string" ||
        contract.longcode !== order.longcode ||
        !Number.isFinite(actualStart) || !Number.isFinite(actualExpiry) ||
        Math.abs(actualExpiry - actualStart - 300) > 2
      ) {
        await context.admin.rpc("senfx_demo_mark_buy_unknown", {
          p_user_id: context.user.id,
          p_order_id: order.id,
        });
        return jsonError("Deriv created a contract, but its verified terms do not match the quote. Risk remains reserved for review.", 409, "CONTRACT_DETAILS_MISMATCH");
      }

      const { data: confirmed, error: confirmError } = await context.admin.rpc("senfx_demo_confirm_order", {
        p_user_id: context.user.id,
        p_order_id: order.id,
        p_contract_id: contractId,
        p_transaction_id: transactionId,
        p_buy_price: actualBuyPrice,
      });
      if (confirmError || !confirmed?.confirmed) {
        await context.admin.rpc("senfx_demo_mark_buy_unknown", {
          p_user_id: context.user.id,
          p_order_id: order.id,
        });
        return jsonError("The contract exists but SENFX could not save the verified order. Its risk remains reserved.", 503, "ORDER_CONFIRM_FAILED");
      }

      return NextResponse.json({
        success: true,
        orderId: order.id,
        contractId,
        transactionId,
        status: contract.status || "open",
        buyPrice: actualBuyPrice,
        risk: reservation,
      }, { headers: noStore });
    }

    if (action === "reconcile") {
      const order = await readOrder(context.admin, context.user.id, String(body?.orderId || ""));
      const contractId = typeof body?.contractId === "string" && /^\d{1,30}$/.test(body.contractId) ? body.contractId : undefined;
      const transactionId = typeof body?.transactionId === "string" && /^\d{1,30}$/.test(body.transactionId) ? body.transactionId : undefined;
      const result = await reconcileBuyOrder(context, order, contractId, transactionId);
      if (result.state === "open" || result.state === "rejected") {
        return NextResponse.json({ success: true, ...result }, { headers: noStore });
      }
      return NextResponse.json({
        success: false,
        state: result.state,
        error: result.reason,
        riskRemainsReserved: true,
      }, { status: 409, headers: noStore });
    }

    if (action === "status" || action === "settle" || action === "sell") {
      const order = await readOrder(context.admin, context.user.id, String(body?.orderId || ""));
      if (order.account_id !== context.account.account_id) {
        return jsonError("This Demo order belongs to a different selected account. Switch back to the original Demo account.", 409, "DEMO_ACCOUNT_MISMATCH");
      }
      if (order.status !== "open" || !order.contract_id) {
        if (order.status === "buy_unknown") return jsonError("This purchase is unresolved. Its reservation remains held. Reconcile the Deriv statement; do not retry.", 409, "BUY_REQUIRES_RECONCILIATION");
        return jsonError("No confirmed open Demo contract was found.", 409, "ORDER_NOT_OPEN");
      }

      session = await openDerivDemoSession(context);
      let contract = await getVerifiedContract(session, order);
      if (action === "sell" && !isFinalContract(contract)) {
        if (contract?.is_valid_to_sell !== 1) {
          return jsonError("Deriv does not currently allow this Demo contract to be sold.", 409, "CONTRACT_NOT_SELLABLE");
        }
        await session.request("sell", {
          sell: Number(order.contract_id),
          price: 0,
        });
        contract = await getVerifiedContract(session, order);
      }

      if (isFinalContract(contract)) {
        const result = await settleVerifiedContract(context, order, contract);
        if (!result.settled) {
          return jsonError(result.reason || "Settlement could not be verified.", 503, "DEMO_SETTLEMENT_FAILED");
        }
        return NextResponse.json({ success: true, settled: true, ...result }, { headers: noStore });
      }

      if (action === "settle") {
        return NextResponse.json({ success: true, settled: false, status: "open" }, { headers: noStore });
      }
      return NextResponse.json({
        success: true,
        settled: false,
        status: "open",
        contractStatus: contract?.status || "open",
        currentProfit: Number(contract?.profit || 0),
        isValidToSell: contract?.is_valid_to_sell === 1,
      }, { headers: noStore });
    }

    return jsonError("Unsupported Demo order action.");
  } catch (error) {
    const safe = safeDemoError(error);
    if (safe.status >= 500) console.error("SENFX Demo order route failure:", safe.code);
    return NextResponse.json(
      { success: false, error: safe.error, code: safe.code },
      { status: safe.status, headers: noStore },
    );
  } finally {
    session?.close();
  }
}
