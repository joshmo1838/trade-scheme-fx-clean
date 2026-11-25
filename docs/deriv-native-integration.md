# Native Deriv integration

Upstream: vendor/deriv-trading-bot, pinned official template. All 17 workspace modules are in scope.

| Module | Integration target |
|---|---|
| Dashboard | Verified account, balance, market and session status |
| Bot Builder | Native Blockly editor and XML |
| Free Bots | Validated strategy templates |
| Premium AI Bots | Validated strategy templates |
| Bulk Trader | Original 15 strategies and existing Demo controls |
| Automated | Existing owner-controlled Demo execution |
| Auto AI | Research signals and validated strategy mapping |
| Volt AI | Research signals |
| Signal AI | Research signals |
| Analysis Tools | Public tick statistics |
| Charts | Native market chart and public feed |
| Manual Trader | Demo proposal and explicitly authorized execution adapter |
| Hedging Tool | Contract compatibility and exposure validation |
| Apex Bot | Validated strategy mapping |
| Quick Bot | Validated strategy mapping |
| Speedbot | Validated strategy mapping and existing cooldown |
| Copy Trader | Research/configuration only until authorized source and execution semantics validated |

Single execution authority: existing Railway Demo worker. Upstream browser engine must not independently buy. Real-money execution remains disabled. Do not claim arbitrary XML is executable until server-side validation and strategy mapping exist. Preserve existing original strategies and production settings. All mappings above are implementation targets, not completed functionality.
