# Deriv JSON schema bundle — inventory and adoption

User-provided `schemas.zip`, archived unchanged in ChatGPT Library at `/Trade Scheme FX/Deriv API/Deriv-WebSocket-Schemas-2026-11-23.zip` (2026-11-23). ZIP inspection: 127 JSON files, including `rest-api-openapi.json` and 126 request/response schema files (63 request/response pairs). Original bundle is the canonical source; this inventory is not a replacement for the schemas.

## Adoption priorities

1. **Public market data:** `ticks`, `ticks_history`, `active_symbols`, `contracts_for`, `trading_times`, `ping`, `time`, `forget`, `forget_all`. Use request/response schema validation in read-only tests; preserve tick freshness and deduplication.
2. **Demo account connection:** `get_accounts`, `ws_demo`, `balance`, `portfolio`, `statement`, `transaction`, `proposal_open_contract`. Validate auth scopes and account identity; do not log OTPs/tokens.
3. **Bot control:** `auto_list`, `auto_list_strategies`, `auto_get`, `auto_start`, `auto_pause`, `auto_resume`, `auto_stop`. The supplied `auto_start_request.schema.json` requires `auto_start`, `contract_template`, `strategy_id`, and `strategy_parameters`. This is a wire contract only, not proof that 15 existing strategies are compatible or that broker automation is available.
4. **Trading contract research:** `proposal`, `buy`, `sell`, `cancel`, `bulk_purchase`, `contract_update`, `contract_update_history`, `contracts_list`, `profit_table`. Only offline schema validation until explicit separately reviewed Demo purchase authorization; Real purchases remain disabled.
5. **Financial and partner features:** payment agent, wallet transfer/exchange, markup, partner analytics and client tags. Inventory only; no money movement.
6. **Legacy migration:** `legacy_accounts`, `legacy_statement`, `legacy_migration_status`. Deprecated; isolate.

## Implementation safeguards

- Compare each schema to current official Deriv API docs and the installed Deriv API connector before treating it as authoritative.
- Build local fixture-based validation tests first. Never use synthetic outcomes as evidence of live trading.
- Do not commit private tokens, OTP URLs, real account identifiers or personal details.
- Keep existing 15 paper bots and release gate unchanged; no automatic broker activation or production merge.
- Record each operation's status as `not reviewed`, `schema validated`, `demo verified`, or `production verified`, never infer a later state.
