# SENFX OpenAI Research – isolated opt-in integration

This is an optional **human-triggered research explanation**, not an automated execution engine or a new strategy. All 15 existing SENFX paper-research bots keep their original conditions, predictions, paper controls, and safeguards. This route does not authorize or submit Deriv broker purchases.

## Environment setup (Preview first)

1. In OpenAI Platform, create a dedicated project key named `SENFX AI Scanner`. Keep the raw key out of GitHub, browser code, chat messages, screenshots, and logs.
2. In **Vercel > trade-scheme-fx-clean > Settings > Environment Variables**, configure the secret `OPENAI_API_KEY` for the intended isolated **Preview** only. Avoid a `NEXT_PUBLIC_` prefix; do not configure it for public client access.
3. Add `SENFX_OPENAI_RESEARCH_ENABLED=true` to that same Preview environment. It defaults to OFF for every environment. Optionally set `SENFX_OPENAI_MODEL=gpt-4.1-mini` (or another Responses-compatible project model).
4. Redeploy the **preview branch only** after CI passes, with all broker execution flags OFF. Keep production AI flag OFF; do not change production or its pending release gate.
5. Sign in, open the preview's `/bot-library` page, select a strategy, wait for adequate recent public ticks, then press **Explain recent ticks with OpenAI**. This sends bounded aggregate research observations server-side to OpenAI **only on the manual click**. Confirm response, 60-second best-effort throttle, and no Deriv buys. If the key is missing or AI is disabled, the button remains unavailable.
6. Verify all 15 selections; audit errors for no raw keys, no private Deriv token, no real/demo buy calls. Complete security and budget/rate-limit review before any production rollout.

## Limitations / safety

- Browser reported Deriv public tick samples are validated for shape, freshness, ordering and size, but **not independently authenticated by the API**. The AI output is descriptive and is not evidence of a predictive edge.
- This endpoint is authenticated, same-origin, server-only, and enabled only by explicit opt-in. It calls the OpenAI **Responses API** with `store:false`, bounded input, short output and timeout. No request or response is connected to a trade or strategy decision.
- Current memory-only per-user cooldown is a best-effort expense safeguard and **not a globally enforced, production-grade usage quota**. Add persistent per-tenant quota, spend alerts and audit logging before opening this to broad customer traffic.
- OpenAI Platform API usage is billed separately from a ChatGPT subscription. Set a usage budget and monitoring before enabling it.
- The original protected production release, production database backup/restore gate, and demo/real broker execution flags are not changed by this work.
