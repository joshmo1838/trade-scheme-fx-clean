import { randomUUID, createDecipheriv } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { STRATEGIES } from '../../lib/quantum/strategy-catalog.mjs';
import { signals } from '../../lib/quantum/research.ts';
import { mapQuantumDemoSignal } from '../../lib/quantum/demo-contracts.mjs';
import { contractAvailabilityReason } from '../../lib/quantum/contract-availability.mjs';
import { demoExecutionReadiness, demoQuoteExpectedValue } from '../../lib/quantum/demo-execution-eligibility.mjs';
import { newRecoveryState, settleRecovery, tenXChecks } from '../../lib/quantum/demo-ten-x-checks.mjs';
import { isVerifiedDemoAccount, isFreshPublicTick, validBrokerProposal, verifiedBuyResponse, verifiedFinalContract, safeToPurchase } from '../../lib/quantum/demo-worker-safety.mjs';

const FLAGS = ['DERIV_DEMO_TRADING_ENABLED','DERIV_DEMO_BROKER_BUY_ENABLED','SENFX_QUANTUM_DEMO_BROKER_EXECUTION_ENABLED'];
if (!FLAGS.every(name => process.env[name] === 'true')) {
  console.log('[quantum-demo] Disabled; all broker execution flags default off.');
  process.exit(0);
}
const USER = process.env.DERIV_DEMO_PILOT_USER_ID || '';
const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENCRYPTION_KEY = (process.env.DERIV_TOKEN_ENCRYPTION_KEY || '').trim();
if (!/^[0-9a-f-]{36}$/i.test(USER) || !URL || !KEY || !/^[0-9a-f]{64}$/i.test(ENCRYPTION_KEY)) throw Error('Quantum Demo worker private configuration unavailable.');
if (typeof WebSocket !== 'function') throw Error('Node 22+ WebSocket is required.');

const db = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const API = 'https://api.derivws.com';
const PUBLIC_WS = 'wss://api.derivws.com/trading/v1/options/ws/public';
const WORKER_ID = 'quantum_' + randomUUID().replaceAll('-', '');
const HISTORY_SIZE = 300;
const POLL_MS = 4000;
const SETTLE_MAX_MS = 8 * 60_000;
const BUY_COOLDOWN_MS = 30_000;
const history = [];
let publicSocket = null;
let trading = null;
let control = null;
let busy = false;
let stopped = false;
let lastTickEpoch = 0;
let lastBuyAt = 0;
let lastError = '';
let feedRetryAttempt = 0;
let feedRetryAt = 0;
let feedConnectedAt = 0;
let lastNoEntryCode = '';
let lastNoEntryAt = 0;
let recovery = newRecoveryState();

function log(message, detail = '') { console.log('[quantum-demo] ' + message + (detail ? ' · ' + String(detail).slice(0, 120) : '')); }
async function rpc(name, args) { const { data, error } = await db.rpc(name, args); if (error) throw Error('Ledger RPC unavailable: ' + name); return data; }
async function readControl() {
  const { data, error } = await db.from('quantum_demo_bot_control').select('*').eq('user_id', USER).maybeSingle();
  if (error) throw Error('Control ledger unavailable.');
  return data;
}
async function acquireLease(row) {
  const result = await rpc('quantum_demo_worker_heartbeat', { p_user_id: USER, p_worker_id: WORKER_ID, p_version: row.control_version });
  return result?.owned === true;
}
function closeTrading() { if (trading) { trading.close(); trading = null; } }
function closeFeed() { if (publicSocket) { const socket = publicSocket; publicSocket = null; socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null; try { socket.close(); } catch {} } history.length = 0; lastTickEpoch = 0; }
async function stopRun(reason) {
  lastError = reason;
  await db.from('quantum_demo_bot_control').update({ last_error: reason.slice(0, 180), updated_at: new Date().toISOString() }).eq('user_id', USER);
  try { await rpc('quantum_demo_control', { p_user_id: USER, p_account_id: control?.account_id || '', p_action: 'stop', p_expected_version: null, p_bot_id: null, p_stake: null, p_stop_loss: null, p_take_profit: null }); } catch { /* DB lease expires fail-closed if stop acknowledgement is unavailable. */ }
  closeFeed(); closeTrading(); log('Run paused fail-closed', reason);
}
async function readDemoAccount(stake, currency = 'USD') {
  const { data: row, error } = await db.from('deriv_connections').select('encrypted_token,token_iv,token_tag,expires_at,status,active_account_id,active_account_type').eq('user_id', USER).maybeSingle();
  if (error || !row || row.status !== 'connected' || row.active_account_type !== 'demo' || !row.active_account_id || new Date(row.expires_at).getTime() <= Date.now()) throw Error('Selected Deriv Demo account is not active.');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'hex'), Buffer.from(row.token_iv, 'base64'));
  decipher.setAuthTag(Buffer.from(row.token_tag, 'base64'));
  const token = Buffer.concat([decipher.update(Buffer.from(row.encrypted_token, 'base64')), decipher.final()]).toString('utf8');
  const response = await fetch(API + '/trading/v1/options/accounts', { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw Error('Deriv Demo account verification failed.');
  const payload = await response.json();
  const account = Array.isArray(payload?.data) ? payload.data.find(x => x?.account_id === row.active_account_id) : null;
  if (!isVerifiedDemoAccount(account, row.active_account_id, stake, currency)) throw Error('Deriv did not verify the selected virtual Demo account, currency, or balance.');
  return { token, account };
}
async function openDemoSession(token, accountId) {
  const response = await fetch(API + '/trading/v1/options/accounts/' + encodeURIComponent(accountId) + '/otp', { method: 'POST', headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw Error('Deriv Demo session could not be verified.');
  const payload = await response.json(); const otpUrl = new URL(payload?.data?.url || 'https://invalid.local');
  if (otpUrl.protocol !== 'wss:' || otpUrl.hostname !== 'api.derivws.com' || otpUrl.pathname !== '/trading/v1/options/ws/demo' || !otpUrl.searchParams.has('otp')) throw Error('Deriv issued a non-Demo trading session.');
  const ws = new WebSocket(otpUrl); await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Demo WebSocket connection timed out.')), 10_000);
    ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    ws.addEventListener('error', () => { clearTimeout(timer); reject(Error('Demo WebSocket connection failed.')); }, { once: true });
  });
  let requestId = 500; let closed = false; const pending = new Map();
  const failPending = () => { for (const [id, p] of pending) { clearTimeout(p.timer); p.reject(Error('Demo session disconnected.')); pending.delete(id); } };
  ws.addEventListener('message', event => { let msg; try { msg = JSON.parse(String(event.data)); } catch { return; } const p = pending.get(Number(msg.req_id)); if (!p) return; if (msg.error) { clearTimeout(p.timer); pending.delete(Number(msg.req_id)); p.reject(Error('Deriv rejected ' + p.type + ': ' + String(msg.error.code || 'UNKNOWN'))); return; } if (msg.msg_type === p.type) { clearTimeout(p.timer); pending.delete(Number(msg.req_id)); p.resolve(msg); } });
  ws.addEventListener('close', () => { closed = true; failPending(); }); ws.addEventListener('error', () => { closed = true; failPending(); });
  const request = (type, body, timeout = 8000) => { if (closed || ws.readyState !== WebSocket.OPEN) return Promise.reject(Error('Demo session is closed.')); const id = ++requestId; return new Promise((resolve, reject) => { const timer = setTimeout(() => { pending.delete(id); reject(Error(type + ' timed out.')); }, timeout); pending.set(id, { type, resolve, reject, timer }); try { ws.send(JSON.stringify({ ...body, req_id: id })); } catch { clearTimeout(timer); pending.delete(id); reject(Error('Could not send Deriv request.')); } }); };
  return { request, close: () => { closed = true; failPending(); try { ws.close(); } catch {} } };
}
async function unresolvedCount() {
  const [quantum, demo, legacy] = await Promise.all([
    db.from('quantum_demo_bot_orders').select('id', { count: 'exact', head: true }).eq('user_id', USER).in('status', ['reserved','buy_unknown','open']),
    db.from('deriv_demo_orders').select('id', { count: 'exact', head: true }).eq('user_id', USER).in('status', ['reserved','buy_unknown','open']),
    db.from('senfx_demo_bot_orders').select('id', { count: 'exact', head: true }).eq('user_id', USER).in('status', ['reserved','buy_unknown','open']),
  ]);
  if ([quantum,demo,legacy].some(x => x.error || !Number.isInteger(x.count))) throw Error('Shared Demo order ledger cannot be verified.');
  return quantum.count + demo.count + legacy.count;
}
async function recordProblem(reason) { lastError = reason; await db.from('quantum_demo_bot_control').update({ last_error: reason.slice(0,180), updated_at: new Date().toISOString() }).eq('user_id', USER); }
async function recordNoEntry(code) {
  const now = Date.now();
  if (code === lastNoEntryCode && now - lastNoEntryAt < 60_000 && lastError === 'No entry: ' + code) return;
  lastNoEntryCode = code; lastNoEntryAt = now;
  await recordProblem('No entry: ' + code);
  log('No entry', code);
}
async function settleContract(session, orderId, purchase, contract, stake) {
  const started = Date.now();
  while (Date.now() - started < SETTLE_MAX_MS) {
    const reply = await session.request('proposal_open_contract', { proposal_open_contract: 1, contract_id: Number(purchase.contractId) }, 10_000);
    const final = verifiedFinalContract(reply?.proposal_open_contract, { contractId: purchase.contractId, market: control?.market_symbol || 'R_100', contractType: contract.contract_type, stake, currency: control?.currency || 'USD', accountId: control?.account_id, buyTransactionId: purchase.buyTransactionId, ...(contract.barrier !== undefined ? { barrier: contract.barrier } : {}), ...(contract.multiplier !== undefined ? { multiplier: contract.multiplier } : {}) });
    if (final) {
      const result = await rpc('quantum_demo_settle', { p_user_id: USER, p_order_id: orderId, p_contract_id: final.contractId, p_tx_id: purchase.buyTransactionId, p_status: final.finalStatus, p_buy: final.buyPrice, p_sell: final.sellPrice });
      if (result?.settled !== true) throw Error('Deriv settlement could not be recorded; purchases remain blocked.');
      recovery = settleRecovery(recovery, { finalStatus: final.finalStatus, profit: final.profit, settledAt: Date.now() });
      log('Deriv Demo contract settled', final.finalStatus + ' · ' + final.contractId);
      return result;
    }
    if (reply?.proposal_open_contract?.is_sold) throw Error('Final Deriv contract did not match the reserved order.');
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  throw Error('Deriv contract has not settled; reconcile it before another purchase.');
}
async function reconcilePendingOrders() {
  const { data: rows, error } = await db.from('quantum_demo_bot_orders').select('id,account_id,control_version,bot_id,market_symbol,contract_type,contract_family,multiplier,barrier,stake,buy_price,buy_transaction_id,contract_id,buy_requested_at,status').eq('user_id', USER).in('status', ['buy_unknown','open']).order('created_at', { ascending: true }).limit(2);
  if (error) throw Error('Uncertain Demo orders cannot be reconciled from the ledger.');
  if (!rows?.length) return;
  busy = true;
  try {
    for (const order of rows) {
      if (order.account_id !== control?.account_id) throw Error('Uncertain order belongs to a different Demo account.');
      const { token, account } = await readDemoAccount(0.01, order.currency || 'USD');
      if (account.account_id !== order.account_id) throw Error('Selected Demo account changed; uncertain order remains blocked.');
      const session = await openDemoSession(token, account.account_id);
      try {
        let transaction = null;
        if (order.status === 'buy_unknown') {
          const from = Math.max(0, Math.floor(new Date(order.buy_requested_at).getTime() / 1000) - 5);
          const statement = await session.request('statement', { statement: 1, action_type: 'buy', date_from: from, date_to: Math.floor(Date.now() / 1000), description: 1, limit: 999 });
          const candidates = (statement?.statement?.transactions || []).filter(item =>
            item.action_type === 'buy' && Number.isSafeInteger(item.contract_id) && Number.isSafeInteger(item.transaction_id) &&
            Math.abs(Math.abs(Number(item.amount)) - Number(order.stake)) < 0.011 &&
            Number(item.transaction_time) >= from &&
            typeof item.shortcode === 'string' && item.shortcode.startsWith(`${order.contract_type}_${order.market_symbol}_`));
          const verified = [];
          for (const candidate of candidates) {
            const reply = await session.request('proposal_open_contract', { proposal_open_contract: 1, contract_id: candidate.contract_id }, 10_000);
            const contract = reply?.proposal_open_contract;
            const buyPrice = Number(contract?.buy_price);
            if (String(contract?.contract_id) !== String(candidate.contract_id) || String(contract?.account_id) !== String(order.account_id) ||
              contract?.underlying_symbol !== order.market_symbol || contract?.contract_type !== order.contract_type || contract?.currency !== (order.currency || 'USD') ||
              String(contract?.transaction_ids?.buy) !== String(candidate.transaction_id) ||
              Math.abs(Math.abs(Number(candidate.amount)) - buyPrice) > 0.011 || buyPrice > Number(order.stake) ||
              (order.barrier !== null && String(contract?.barrier ?? '') !== String(order.barrier)) ||
              (order.multiplier !== null && Number(contract?.multiplier) !== Number(order.multiplier))) continue;
            const purchase = { contractId: String(candidate.contract_id), buyTransactionId: String(candidate.transaction_id), buyPrice };
            transaction = purchase; verified.push({ reply, purchase });
          }
          if (verified.length !== 1) { await recordProblem(verified.length ? 'Multiple Deriv purchases match an uncertain order; manual reconciliation is required.' : 'No matching Deriv statement transaction yet; the order remains blocked.'); continue; }
          transaction = verified[0].purchase;
          const opened = await db.from('quantum_demo_bot_orders').update({ status: 'open', contract_id: transaction.contractId, buy_transaction_id: transaction.buyTransactionId, buy_price: transaction.buyPrice, opened_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', order.id).eq('status', 'buy_unknown').select('id').maybeSingle();
          if (opened.error || !opened.data) throw Error('Matched Deriv purchase could not be reconciled into the order ledger.');
          const final = verifiedFinalContract(verified[0].reply?.proposal_open_contract, { contractId: transaction.contractId, market: order.market_symbol, contractType: order.contract_type, stake: Number(order.stake), currency: order.currency || 'USD', accountId: order.account_id, buyTransactionId: transaction.buyTransactionId, ...(order.barrier !== null ? { barrier: order.barrier } : {}), ...(order.multiplier !== null ? { multiplier: Number(order.multiplier) } : {}) });
          if (final) {
            const result = await rpc('quantum_demo_settle', { p_user_id: USER, p_order_id: order.id, p_contract_id: final.contractId, p_tx_id: transaction.buyTransactionId, p_status: final.finalStatus, p_buy: final.buyPrice, p_sell: final.sellPrice });
            if (result?.settled !== true) throw Error('Recovered contract settlement was rejected by the Demo ledger.');
            log('Uncertain purchase reconciled and settled', final.contractId);
          } else log('Uncertain purchase reconciled to an open contract', transaction.contractId);
        } else {
          transaction = { contractId: String(order.contract_id), buyTransactionId: String(order.buy_transaction_id), buyPrice: Number(order.buy_price) };
          const reply = await session.request('proposal_open_contract', { proposal_open_contract: 1, contract_id: Number(transaction.contractId) }, 10_000);
          const final = verifiedFinalContract(reply?.proposal_open_contract, { contractId: transaction.contractId, market: order.market_symbol, contractType: order.contract_type, stake: Number(order.stake), currency: order.currency || 'USD', accountId: order.account_id, buyTransactionId: transaction.buyTransactionId, ...(order.barrier !== null ? { barrier: order.barrier } : {}), ...(order.multiplier !== null ? { multiplier: Number(order.multiplier) } : {}) });
          if (final) {
            const result = await rpc('quantum_demo_settle', { p_user_id: USER, p_order_id: order.id, p_contract_id: final.contractId, p_tx_id: transaction.buyTransactionId, p_status: final.finalStatus, p_buy: final.buyPrice, p_sell: final.sellPrice });
            if (result?.settled !== true) throw Error('Recovered contract settlement was rejected by the Demo ledger.');
            log('Open Demo contract reconciled and settled', final.contractId);
          }
        }
      } finally { session.close(); }
    }
  } finally { busy = false; }
}
async function executeCandidate(row, candidate, signal) {
  if (busy || stopped) return; busy = true;
  let orderId = null; let marked = false; let sentBuy = false;
  try {
    const latest = await readControl();
    if (!latest || latest.mode !== 'running' || latest.control_version !== row.control_version || latest.bot_id !== candidate.botId || latest.account_id !== row.account_id || !await acquireLease(row)) throw Error('Run stopped or worker lease changed before quote.');
    if (Date.now() - Number(candidate.tickEpoch) * 1000 > 10_000) throw Error('Signal tick became stale before quote.');
    const currency = row.currency || 'USD';
    const market = row.market_symbol || 'R_100';
    const strategy = STRATEGIES.find(item => item.id === candidate.botId);
    const contractFamily = row.contract_family || 'OPTIONS';
    const configuration = {
      marketSymbol: market, currency, contractFamily,
      contractType: candidate.contract.contract_type,
      duration: contractFamily === 'MULTIPLIER' ? null : Number(candidate.contract.duration ?? 1),
      durationUnit: contractFamily === 'MULTIPLIER' ? null : String(candidate.contract.duration_unit || 't'),
      barrier: candidate.contract.barrier ?? null,
      multiplier: contractFamily === 'MULTIPLIER' ? Number(candidate.contract.multiplier ?? row.multiplier) : null,
    };
    const readiness = demoExecutionReadiness(strategy, configuration);
    if (!readiness.allowed) { await recordNoEntry(readiness.code); return; }
    const { token, account } = await readDemoAccount(Number(row.stake), currency);
    if (account.account_id !== row.account_id) throw Error('Selected Demo account changed while the run was active.');
    trading = await openDemoSession(token, account.account_id);
    const availability = await trading.request('contracts_for', { contracts_for: market });
    const unsupported = contractAvailabilityReason(availability?.contracts_for?.available, candidate.contract, row.market_category);
    if (unsupported) { await recordProblem(unsupported); log('Skipped unsupported contract', unsupported); return; }
    const proposalRequest = { proposal: 1, amount: Number(row.stake), basis: 'stake', currency, underlying_symbol: market,
      ...(row.contract_family === 'MULTIPLIER' ? { contract_type: candidate.contract.contract_type, multiplier: candidate.contract.multiplier,
        limit_order: { stop_loss: Number(row.per_trade_stop_loss), take_profit: Number(row.per_trade_take_profit) } } : candidate.contract) };
    const quoteReply = await trading.request('proposal', proposalRequest);
    const quoteAt = Date.now(); const quote = quoteReply?.proposal;
    const quoteIdentity = { market, currency, contractType: candidate.contract.contract_type,
      ...(candidate.contract.multiplier !== undefined ? { multiplier: candidate.contract.multiplier, stopLoss: Number(row.per_trade_stop_loss), takeProfit: Number(row.per_trade_take_profit) } : {}) };
    if (!validBrokerProposal(quote, Number(row.stake), quoteIdentity)) { await recordProblem('Deriv quote failed price or selected contract identity checks.'); return; }
    const economics = demoQuoteExpectedValue(readiness, quote);
    if (!economics.allowed) { await recordNoEntry(economics.code); return; }
    const stillCurrent = signals(history)[STRATEGIES.findIndex(x => x.id === row.bot_id)];
    if (stillCurrent.kind !== signal.kind || (stillCurrent.barrier ?? null) !== (signal.barrier ?? null)) { await recordProblem('Signal changed while the Demo quote was being prepared.'); return; }
    const currentControl = await readControl();
    if (!currentControl || currentControl.mode !== 'running' || currentControl.control_version !== row.control_version || !await acquireLease(row)) throw Error('Stop or lease change before reservation.');
    const checks = tenXChecks({ account, flags: { authorized: USER === process.env.DERIV_DEMO_PILOT_USER_ID, realMoneyDisabled: account.account_type === 'demo' }, control: { mode: 'running', control_version: row.control_version, currency }, leaseOwned: true, stake: Number(row.stake), bot: { id: candidate.botId, market, minTicks: HISTORY_SIZE }, signal: { ...signal, prediction: signal.kind }, marketHistory: history, now: Date.now(), quote, proposal: proposalRequest, recovery, unresolvedCount: await unresolvedCount(), previousBuyAt: lastBuyAt });
    if (!checks.passed) { await recordProblem('Golden Rule / 10X skipped this signal: ' + checks.failed.join(', ')); return; }
    const { data: created, error } = await db.from('quantum_demo_bot_orders').insert({ request_id: randomUUID(), user_id: USER, account_id: account.account_id, control_version: row.control_version, bot_id: candidate.botId, market_symbol: market, signal_kind: signal.kind, contract_type: candidate.contract.contract_type, contract_family: row.contract_family || 'OPTIONS', multiplier: row.contract_family === 'MULTIPLIER' ? candidate.contract.multiplier : null, barrier: candidate.contract.barrier ?? null, duration: row.contract_family === 'MULTIPLIER' ? null : 1, duration_unit: row.contract_family === 'MULTIPLIER' ? null : 't', tick_epoch: candidate.tickEpoch, currency, stake: Number(row.stake), ask_price: Number(quote.ask_price), payout: Number(quote.payout), proposal_id: quote.id, quote_expires_at: new Date(quoteAt + 12_000).toISOString(), status: 'quoted' }).select('id').single();
    if (error || !created?.id) throw Error('Could not persist Demo proposal reservation.'); orderId = created.id;
    const reserve = await rpc('quantum_demo_reserve', { p_user_id: USER, p_order_id: orderId, p_version: row.control_version });
    if (reserve?.allowed !== true) { orderId = null; await recordProblem('Order reservation refused: ' + String(reserve?.code || 'UNKNOWN')); return; }
    const owned = await acquireLease(row); const unresolved = await unresolvedCount();
    const allowed = safeToPurchase({ operatorAllowed: true, globalBuyFlag: process.env.DERIV_DEMO_BROKER_BUY_ENABLED === 'true', workerAuthorized: process.env.SENFX_QUANTUM_DEMO_BROKER_EXECUTION_ENABLED === 'true', runVersion: row.control_version, controlVersion: currentControl.control_version, leaseValid: owned, accountVerified: isVerifiedDemoAccount(account, account.account_id, Number(row.stake), currency), proposalVerified: validBrokerProposal(quote, Number(row.stake), quoteIdentity) && quoteAt + 12_000 > Date.now(), unresolvedOrders: unresolved });
    if (!allowed || Date.now() - quoteAt > 12_000) throw Error('Final Demo purchase gate failed or quote expired.');
    const marker = await rpc('quantum_demo_mark_attempt', { p_user_id: USER, p_order_id: orderId, p_version: row.control_version });
    if (marker?.allowed !== true) throw Error('Attempt marker refused; no purchase sent.'); marked = true;
    const afterMarker = await readControl();
    if (!afterMarker || afterMarker.mode !== 'running' || afterMarker.control_version !== row.control_version || !await acquireLease(row)) throw Error('Stop reached before broker purchase; unresolved attempt remains blocked.');
    sentBuy = true;
    const buyReply = await trading.request('buy', { buy: quote.id, price: Number(quote.ask_price) }, 12_000);
    const purchase = verifiedBuyResponse(buyReply, Number(quote.ask_price));
    if (!purchase) throw Error('Purchase response uncertain. No retry; reconcile the Demo statement.');
    const { data: opened, error: openError } = await db.from('quantum_demo_bot_orders').update({ status: 'open', contract_id: purchase.contractId, buy_transaction_id: purchase.buyTransactionId, buy_price: purchase.buyPrice, opened_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', orderId).eq('status', 'buy_unknown').select('id').maybeSingle();
    if (openError || !opened) throw Error('Broker purchase confirmed but ledger update failed; no retry.');
    const settlement = await settleContract(trading, orderId, purchase, candidate.contract, Number(row.stake));
    lastBuyAt = Date.now(); lastError = '';
    if (Number(settlement.sessionProfit) >= Number(row.session_take_profit) || Number(settlement.sessionProfit) <= -Number(row.session_stop_loss)) log('Session risk limit reached; run stopped.');
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Demo execution error.';
    if (orderId && !marked) await db.from('quantum_demo_bot_orders').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', orderId).eq('status', 'quoted');
    await stopRun(marked || sentBuy ? 'Purchase outcome uncertain; reconcile Deriv contract before restarting.' : reason);
  } finally { closeTrading(); busy = false; }
}
function scheduleFeedRetry(ws, reason) {
  if (stopped || (ws && publicSocket !== ws)) return;
  publicSocket = null;
  feedConnectedAt = 0;
  const delay = Math.min(30_000, 1_000 * (2 ** Math.min(feedRetryAttempt, 5)));
  feedRetryAttempt = Math.min(feedRetryAttempt + 1, 5);
  feedRetryAt = Date.now() + delay;
  log('Public market feed disconnected; retry scheduled', delay + 'ms');
  void recordProblem(reason);
  try { if (ws && ws.readyState !== WebSocket.CLOSED) ws.close(); } catch {}
}
function startFeed() {
  if (publicSocket || stopped || Date.now() < feedRetryAt) return;
  const subscribedMarket = control?.market_symbol || 'R_100';
  let ws;
  try { ws = new WebSocket(PUBLIC_WS); publicSocket = ws; }
  catch { scheduleFeedRetry(null, 'Selected market feed could not open; retry scheduled.'); return; }
  ws.onopen = () => {
    if (publicSocket !== ws || stopped) return;
    feedConnectedAt = Date.now();
    try { ws.send(JSON.stringify({ ticks: subscribedMarket, subscribe: 1 })); }
    catch { scheduleFeedRetry(ws, 'Selected market feed subscription could not be sent; retry scheduled.'); }
  };
  ws.onmessage = event => {
    if (publicSocket !== ws || stopped) return;
    let msg; try { msg = JSON.parse(String(event.data)); } catch { scheduleFeedRetry(ws, 'Malformed public tick response; retry scheduled.'); return; }
    if (msg.error) { scheduleFeedRetry(ws, 'Deriv public feed rejected the selected market subscription; retry scheduled.'); return; }
    if (msg.msg_type !== 'tick') return;
    const tick = msg.tick; const epoch = Number(tick?.epoch); const quote = Number(tick?.quote); const pip = Number(tick?.pip_size);
    const parsed = { symbol: tick?.symbol, epoch, quote, pip_size: pip, price: quote, digit: 0 };
    if (tick?.symbol !== subscribedMarket || !Number.isSafeInteger(epoch) || epoch <= lastTickEpoch || !Number.isFinite(quote) || quote <= 0 || !Number.isInteger(pip) || !isFreshPublicTick({ ...parsed, digit: Math.floor(Math.abs(quote * (10 ** pip)) + 1e-7) % 10 }, Date.now())) return;
    if (Date.now() - feedConnectedAt >= 15_000) feedRetryAttempt = 0;
    feedRetryAt = 0;
    lastTickEpoch = epoch; history.push({ symbol: subscribedMarket, epoch, quote, pip_size: pip }); if (history.length > HISTORY_SIZE) history.shift();
    if (lastError) {
      lastError = '';
      void db.from('quantum_demo_bot_control').update({ last_error: null, updated_at: new Date().toISOString() }).eq('user_id', USER);
    }
    if (history.length < HISTORY_SIZE || busy) return;
    void (async () => {
      const row = control;
      if (!row || row.mode !== 'running') return;
      const index = STRATEGIES.findIndex(x => x.id === row.bot_id); if (index < 0) { await stopRun('Current 4.0 bot ID is not in the strategy catalog.'); return; }
      const signal = signals(history)[index]; if (signal.kind === 'SKIP') return;
      if (Date.now() - lastBuyAt < BUY_COOLDOWN_MS) return;
      const contract = row.contract_family === 'MULTIPLIER'
        ? (signal.kind === 'RISE' ? { contract_family: 'MULTIPLIER', contract_type: 'MULTUP', multiplier: Number(row.multiplier) }
          : signal.kind === 'FALL' ? { contract_family: 'MULTIPLIER', contract_type: 'MULTDOWN', multiplier: Number(row.multiplier) } : null)
        : mapQuantumDemoSignal(row.bot_id, signal);
      if (!contract) { await recordProblem('Current signal has no safe contract mapping for the selected Blockly trade type.'); return; }
      await executeCandidate(row, { botId: row.bot_id, tickEpoch: epoch, contract }, signal);
    })().catch(() => { void stopRun('Current 4.0 signal could not be evaluated safely.'); });
  };
  ws.onerror = () => scheduleFeedRetry(ws, 'Selected market feed disconnected; retry scheduled.');
  ws.onclose = () => scheduleFeedRetry(ws, 'Selected market feed closed; retry scheduled.');
}
async function poll() {
  if (stopped || busy) return;
  try {
    let row = await readControl();
    if (row && row.user_id === USER && ['USD','AUD'].includes(row.currency) && row.mode === 'running' && !await acquireLease(row)) throw Error('Another worker owns the current run lease.');
    control = row;
    await reconcilePendingOrders();
    row = await readControl();
    if (!row || row.mode !== 'running') { control = null; closeFeed(); return; }
    if (row.user_id !== USER || !row.account_id || !['USD','AUD'].includes(row.currency) || !/^[A-Za-z0-9_]{2,30}$/.test(row.market_symbol || '')) throw Error('Run control is not tied to a verified Demo account and selected market/currency.');
    if (!await acquireLease(row)) throw Error('Another worker owns the current run lease.');
    if (control && control.control_version !== row.control_version) closeFeed();
    control = row;
    if (await unresolvedCount() > 0) {
      await recordProblem('A Demo order is still unresolved; no new purchase will be permitted until reconciliation completes.');
      closeFeed(); return;
    }
    if (!publicSocket && Date.now() >= feedRetryAt) startFeed();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Demo worker safety check failed.';
    if (control?.mode === 'running') await stopRun(message);
    else await recordProblem(message);
  }
}
process.once('SIGTERM', () => { stopped = true; closeFeed(); closeTrading(); });
process.once('SIGINT', () => { stopped = true; closeFeed(); closeTrading(); });
log('4.0 Demo worker started; no buys until a signed-in user selects a Demo run.');
setInterval(() => void poll(), POLL_MS); void poll();
