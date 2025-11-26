/**
 * Balancing Module
 *
 * Provides dynamic difficulty adjustment based on player performance.
 * Tracks metrics, applies balance changes, and maintains change history.
 *
 * @module ai/balancing
 */

export {
  BalancingSystem,
  DifficultyLevel,
  AdjustmentStrategy,
} from './BalancingSystem';

export type {
  BalancingSystemConfig,
  BalanceRule
} from './BalancingSystem';

export {
  DifficultyMetrics,
  MetricType,
} from './DifficultyMetrics';

export type {
  DifficultyMetricsConfig,
  MetricDataPoint,
  MetricStats
} from './DifficultyMetrics';

export {
  AppliedBalanceChange,
  BalanceChangeType
} from './AppliedBalanceChange';

export type {
  AppliedBalanceChangeConfig,
  BalanceChange,
} from './AppliedBalanceChange';
