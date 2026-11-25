# SENFX Quantum Intelligence — research foundation

Five TypeScript modules from the preceding manual implementation, packaged in repository-relative paths. Extract into a separate development branch of the existing Next.js repository, preserving existing files. Run `npm run build` and verify the preview before merging. No secrets or database migrations required for these files.

These are additive research utilities, not a complete trading engine. The registry contains proposed strategies, not trained models. Golden Rule and risk checks do not authorize orders. Dashboard wiring, persistent storage, backtesting, authenticated demo execution and strategy validation remain outstanding. Real-money and broker execution are disabled. Tick history is in memory; same-second ticks are rejected by the initial timestamp rule. Risk defaults: stake 10, daily loss 50, drawdown 100, one open contract. These are illustrative limits, not optimized settings.
