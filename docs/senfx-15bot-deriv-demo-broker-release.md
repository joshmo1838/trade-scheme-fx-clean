# SENFX — 15-bot Deriv virtual Demo broker release plan

This is **actual Deriv Demo broker execution**, not public-tick paper hit testing. The
worker stays **OFF by default** and this PR must remain unmerged until all release
requirements below have been met. Real-money accounts and `/ws/real` are excluded.

## What is implemented on this feature branch

- All 15 SENFX strategies have broker contract adapters, explicit symbols and
  allowed contract types. The directional `breakout-higher-lower` adapter is a
  Rise/Fall **proxy**, NOT a barrier-based Higher/Lower contract. Verify that
  substitution with the owner before its first broker purchase.
- Authenticated, **read-only** Deriv Demo `contracts_for` and `proposal`
  diagnostics. These do not buy contracts.
- Dedicated `senfx_demo_bot_*` tables and service-only PostgreSQL RPCs for
  Start/Stop, 20-second single-worker lease, quote risk reservation,
  once-only buy attempt recording, unused-reservation cancellation, and
  broker-confirmed contract settlement. All prior `deriv_demo_orders` rows
  and historical virtual losses are preserved.
- `GET/POST /api/deriv/demo/bots/control`: exact admin allowlist,
  signed-in authorization, customer Start All consent, fail-closed release
  flags, worker-heartbeat verification, and unconditional owner Stop All
  (including if Deriv authorization has expired).
- `worker/senfx-deriv-demo-15bot-worker.mjs`:
  long-lived, single-replica virtual Demo-only worker, 15-strategy scanner
  on actual Deriv public ticks, broker Demo OAuth verification,
  authentic `contracts_for`/proposal, atomic risk reservation, attempt marker
  **before** a single `buy` request, and Deriv contract settlement polling.
  Never retries unknown broker buys.

## Default risk settings

| Control | Required value |
| --- | --- |
| Account | Authorized admin's active **USD Demo** account only |
| Stake | Exact **$1 USD virtual** per contract |
| Shared daily virtual-loss ceiling | **$10 USD** (including tracked manual SENFX Demo losses) |
| Attempt ceiling | At most **30** per UTC day |
| Positions | **One** unresolved broker contract per owner across all 15 bots |
| Minimum time between purchased attempts | **30 seconds** |
| Stop cooldown before re-arming | **60 seconds** |
| Worker | One lease owner, heartbeat every four seconds, lease expires after 20 seconds |
| Uncertain buy | Keep reserved, stop entire run, reconcile broker statement; **never retry** |

## Environment flags — explicit independent releases

All must be `true` in the **dedicated standalone Demo worker environment**
for buys, and the owner must separately arm the run through Start All:

- `SENFX_DEMO_15BOT_CONTROL_ENABLED`
- `SENFX_DEMO_15BOT_BROKER_EXECUTION_ENABLED`
- `DERIV_DEMO_TRADING_ENABLED`
- `DERIV_DEMO_BROKER_BUY_ENABLED`

Also requires privately stored `DERIV_DEMO_PILOT_USER_ID`,
`NEXT_PUBLIC_SUPABASE_URL` (or `SUPABASE_URL`),
`SUPABASE_SERVICE_ROLE_KEY`, and `DERIV_TOKEN_ENCRYPTION_KEY`.
Never send tokens to browser, source control, logs or a chat.

These four switches are **NOT** enabled in production by this PR.

## Release prerequisites

1. **Both** GitHub safety/validation workflows succeed on the exact final PR SHA.
   Verify mock broker responses: digit types, direction types, expiration,
   network failure *after* marking the buy, Stop-All race, crash/restart
   reconciliation, and 15 independent tick strategy evaluations.
2. Confirm true Deriv contract support for all fifteen mappings from the
   **signed-in admin Demo account**. A READY Vercel preview or unit test
   alone cannot prove Deriv supports a proposed contract or exact duration.
3. Obtain a **current recoverable production backup** preserving the two
   earlier settled virtual-money purchases and their grants. Older QA clone
   cannot substitute for this after-history backup.
4. Apply the staged SQL to isolated restored QA and verify the full
   transaction/role/trigger test suite; check for no open/unknown trades.
5. Review interaction with the separate PR #64 repeatable manual Demo
   release; do **not** merge both risk models blindly.
6. Deploy code and database **with broker BUY flags OFF**; confirm a
   dedicated single-replica, long-running worker service is available.
   Vercel request functions cannot replace this continuously running worker.
   Confirm any incremental hosting cost before provisioning a new service.
7. Verify protected admin Start/Stop and user consent. Run **one** broker
   virtual-money pilot through the new 15-bot stack and independently
   reconcile its Deriv contract/transaction IDs and risk before considering
   repeated automated buying.
8. If any stage fails, leave buys disabled. Do not use real-money trading.

## Emergency response

Use **Emergency Stop All Demo Bots** to change the durable control version.
This blocks new reservations and buy markers even if the last worker process
is stale. It cannot cancel a buy already submitted to Deriv. For
`buy_unknown`, keep risk reserved; compare the Deriv Demo account
statement and `proposal_open_contract` before allowing another order.

**Not a profit guarantee:** Fifteen strategies generate research hypotheses
and their win/loss distribution is not established by the two previous
virtual-money broker trades. Do not label paper “hits” as broker returns.
