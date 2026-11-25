import type {QuantumStrategy} from './strategy-catalog.mjs';
export declare function createStrategyReferenceXml(strategy: QuantumStrategy): string;
export declare function createStrategyBootstrap(strategies: readonly QuantumStrategy[]): string;
