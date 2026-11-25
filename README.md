# Trade Scheme FX 4.0 — initial manual overlay
This is a development scaffold, NOT the complete 31-section application. It adds 17 navigation destinations, animated dashboard, provisional bot cards, outline editor, chart integration and an experimental public tick viewer. All order execution is disabled. No database changes, credentials, or legacy worker changes are included.

## Install on Windows
1. Clone or download the existing repository branch feature/trade-scheme-fx-4-master-build. Do not use main.
2. Copy the included app folder into the repository root, merging folders. Only app/dashboard/v4 files are supplied.
3. Open app/dashboard/trading-workspace.tsx. Add `import MasterWorkspace from './v4/workspace';` with the other imports. In the existing TradingWorkspace function replace ONLY the contents of `<section className="workspaceMain"> ... </section>` with `<section className="workspaceMain"><MasterWorkspace /></section>`. Keep the existing header, account menu, signout and authentication unchanged. Remove the now-unused LiveCandleChart import if necessary.
4. Run `npm ci`, `npm run typecheck`, `npm run build`, then `npm run dev`. Use the existing authorized environment setup; never paste secrets into GitHub.
5. Commit to the development branch and use Vercel preview. Do not merge until verified.

## Limitations
The feed endpoint and symbols are provisional and need live verification; ticks without explicit precision are excluded from digit counts. No historical retrieval, deduplication, reconnection, full visual builder, XML, AI predictions, hedge quotes, execution, persistent transactions or customer-specific storage are implemented. Bot names are provisional; strategies are not implemented. Existing legacy workers and automations are outside this package. ROADMAP.md is the full requested specification, not a completion report. No full repository build or browser test has been run here.
