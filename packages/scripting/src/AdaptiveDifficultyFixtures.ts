export type AdaptiveDifficultyMetricType =
  | "win-rate"
  | "death-rate"
  | "completion-time"
  | "damage-taken"
  | "damage-dealt"
  | "accuracy"
  | "resource-efficiency"
  | "progression-rate"
  | "retry-count";

export type AdaptiveDifficultyStrategy = "gradual" | "immediate" | "predictive" | "manual";

export type AdaptiveDifficultyChangeType =
  | "enemy-health"
  | "enemy-damage"
  | "enemy-count"
  | "resource-drop-rate"
  | "experience-multiplier"
  | "timer-multiplier"
  | "checkpoint-frequency";

export interface AdaptiveDifficultyFixtureOptions {
  readonly strategy?: AdaptiveDifficultyStrategy;
  readonly recentDeaths?: number;
  readonly completionTimeSeconds?: number;
  readonly accuracy?: number;
  readonly resourceEfficiency?: number;
  readonly progressionRate?: number;
  readonly playerSkill?: number;
  readonly seed?: number;
}

export interface AdaptiveDifficultyMetricSummary {
  readonly type: AdaptiveDifficultyMetricType;
  readonly count: number;
  readonly mean: number;
  readonly median: number;
  readonly standardDeviation: number;
  readonly min: number;
  readonly max: number;
  readonly recentTrend: "improving" | "stable" | "declining";
}

export interface AdaptiveDifficultyTriggeredRule {
  readonly id: string;
  readonly metric: AdaptiveDifficultyMetricType;
  readonly strategy: AdaptiveDifficultyStrategy;
  readonly changeType: AdaptiveDifficultyChangeType;
  readonly target: number;
  readonly threshold: number;
  readonly rawMultiplier: number;
  readonly appliedMultiplier: number;
  readonly cooldownSeconds: number;
  readonly reason: string;
}

export interface AdaptiveDifficultyAdjustment {
  readonly enemyHealth: number;
  readonly enemyDamage: number;
  readonly enemyCount: number;
  readonly resourceDropRate: number;
  readonly experienceMultiplier: number;
  readonly timerMultiplier: number;
  readonly checkpointMultiplier: number;
}

export interface AdaptiveDifficultyFixture {
  readonly id: "v4-old-branch-adaptive-difficulty-fixture";
  readonly source: "origin-master-ai-balancing-smart-difficulty-adapted";
  readonly strategy: AdaptiveDifficultyStrategy;
  readonly metrics: readonly AdaptiveDifficultyMetricSummary[];
  readonly triggeredRules: readonly AdaptiveDifficultyTriggeredRule[];
  readonly adjustment: AdaptiveDifficultyAdjustment;
  readonly appliedChangeCount: number;
  readonly blockedClaims: readonly string[];
  readonly hash: string;
  readonly claimBoundary: string;
}

type RuleDefinition = {
  readonly id: string;
  readonly metric: AdaptiveDifficultyMetricType;
  readonly changeType: AdaptiveDifficultyChangeType;
  readonly direction: "above" | "below";
  readonly threshold: number;
  readonly multiplier: number;
  readonly target: number;
  readonly reason: string;
};

const rules: readonly RuleDefinition[] = [
  {
    id: "death-rate-relief",
    metric: "death-rate",
    changeType: "enemy-damage",
    direction: "above",
    threshold: 0.34,
    multiplier: 0.82,
    target: 0.18,
    reason: "Recent deaths exceed the bounded comfort threshold, so incoming damage is softened."
  },
  {
    id: "slow-completion-timer",
    metric: "completion-time",
    changeType: "timer-multiplier",
    direction: "above",
    threshold: 92,
    multiplier: 1.18,
    target: 72,
    reason: "Completion time is above target, so objective timers are relaxed."
  },
  {
    id: "low-accuracy-resource-support",
    metric: "accuracy",
    changeType: "resource-drop-rate",
    direction: "below",
    threshold: 0.46,
    multiplier: 1.22,
    target: 0.58,
    reason: "Accuracy is below target, so health/ammo resource availability is raised."
  },
  {
    id: "high-skill-enemy-presence",
    metric: "win-rate",
    changeType: "enemy-count",
    direction: "above",
    threshold: 0.72,
    multiplier: 1.1,
    target: 0.58,
    reason: "Win rate is above target, so bounded encounter density can increase."
  },
  {
    id: "resource-efficiency-reward",
    metric: "resource-efficiency",
    changeType: "experience-multiplier",
    direction: "above",
    threshold: 0.68,
    multiplier: 1.08,
    target: 0.56,
    reason: "Resource efficiency is above target, so reward pacing is slightly increased."
  },
  {
    id: "retry-checkpoint-support",
    metric: "retry-count",
    changeType: "checkpoint-frequency",
    direction: "above",
    threshold: 2.4,
    multiplier: 1.2,
    target: 1.4,
    reason: "Retry count is high, so checkpoint spacing is tightened."
  }
];

export function sampleAdaptiveDifficultyFixture(options: AdaptiveDifficultyFixtureOptions = {}): AdaptiveDifficultyFixture {
  const strategy = options.strategy ?? "gradual";
  const seed = integer(options.seed ?? 0x3d2025, "seed");
  const playerSkill = clamp01(finite(options.playerSkill ?? 0.42, "playerSkill"));
  const recentDeaths = clamp(finite(options.recentDeaths ?? 3, "recentDeaths"), 0, 12);
  const completionTimeSeconds = clamp(finite(options.completionTimeSeconds ?? 108, "completionTimeSeconds"), 15, 420);
  const accuracy = clamp01(finite(options.accuracy ?? 0.41, "accuracy"));
  const resourceEfficiency = clamp01(finite(options.resourceEfficiency ?? 0.74, "resourceEfficiency"));
  const progressionRate = clamp01(finite(options.progressionRate ?? 0.52, "progressionRate"));

  const metricSamples = {
    "win-rate": sampleSeries(0.34 + playerSkill * 0.44, 0.06, seed, 0),
    "death-rate": sampleSeries(recentDeaths / 8, 0.09, seed, 11),
    "completion-time": sampleSeries(completionTimeSeconds, 8.5, seed, 23),
    "damage-taken": sampleSeries(0.56 + recentDeaths * 0.045, 0.08, seed, 37),
    "damage-dealt": sampleSeries(0.42 + accuracy * 0.45, 0.06, seed, 41),
    accuracy: sampleSeries(accuracy, 0.045, seed, 53),
    "resource-efficiency": sampleSeries(resourceEfficiency, 0.05, seed, 61),
    "progression-rate": sampleSeries(progressionRate, 0.07, seed, 71),
    "retry-count": sampleSeries(recentDeaths * 0.75, 0.28, seed, 83)
  } satisfies Record<AdaptiveDifficultyMetricType, readonly number[]>;

  const metrics = (Object.keys(metricSamples) as AdaptiveDifficultyMetricType[]).map((type) => summarizeMetric(type, metricSamples[type]));
  const byType = new Map(metrics.map((metric) => [metric.type, metric]));
  const triggeredRules = rules
    .filter((rule) => ruleTriggered(byType.get(rule.metric), rule))
    .map((rule, index) => triggeredRule(rule, strategy, index));
  const adjustment = applyRules(triggeredRules);

  return {
    id: "v4-old-branch-adaptive-difficulty-fixture",
    source: "origin-master-ai-balancing-smart-difficulty-adapted",
    strategy,
    metrics,
    triggeredRules,
    adjustment,
    appliedChangeCount: triggeredRules.length,
    blockedClaims: [
      "production dynamic difficulty adjustment service",
      "machine-learning or reinforcement-learning personalization",
      "player-profile telemetry backend",
      "live economy balancing",
      "Unity/Unreal AI middleware parity"
    ],
    hash: stableHash([
      strategy,
      ...metrics.map((metric) => `${metric.type}:${metric.mean}:${metric.recentTrend}`),
      ...triggeredRules.map((rule) => `${rule.id}:${rule.appliedMultiplier}`),
      Object.values(adjustment).join(":")
    ].join("|")),
    claimBoundary: "Deterministic adaptive-difficulty metric/rule telemetry adapted from old balancing and smart difficulty concepts; this is bounded runtime evidence, not production DDA, ML personalization, telemetry backend, live economy balancing, or Unity/Unreal AI middleware parity."
  };
}

function summarizeMetric(type: AdaptiveDifficultyMetricType, values: readonly number[]): AdaptiveDifficultyMetricSummary {
  const sorted = [...values].sort((left, right) => left - right);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const firstHalf = values.slice(0, Math.max(1, Math.floor(values.length / 2)));
  const secondHalf = values.slice(Math.floor(values.length / 2));
  const firstMean = firstHalf.reduce((sum, value) => sum + value, 0) / firstHalf.length;
  const secondMean = secondHalf.reduce((sum, value) => sum + value, 0) / secondHalf.length;
  const trendDelta = secondMean - firstMean;
  return {
    type,
    count: values.length,
    mean: round(mean),
    median: round(sorted[Math.floor(sorted.length / 2)] ?? mean),
    standardDeviation: round(Math.sqrt(variance)),
    min: round(sorted[0] ?? mean),
    max: round(sorted[sorted.length - 1] ?? mean),
    recentTrend: Math.abs(trendDelta) < 0.025 ? "stable" : isLowerBetter(type) ? trendDelta < 0 ? "improving" : "declining" : trendDelta > 0 ? "improving" : "declining"
  };
}

function triggeredRule(rule: RuleDefinition, strategy: AdaptiveDifficultyStrategy, index: number): AdaptiveDifficultyTriggeredRule {
  const smoothing = strategy === "immediate" ? 1 : strategy === "predictive" ? 0.72 : strategy === "manual" ? 0 : 0.55;
  const appliedMultiplier = strategy === "manual" ? 1 : 1 + (rule.multiplier - 1) * smoothing;
  return {
    id: rule.id,
    metric: rule.metric,
    strategy,
    changeType: rule.changeType,
    target: rule.target,
    threshold: rule.threshold,
    rawMultiplier: rule.multiplier,
    appliedMultiplier: round(appliedMultiplier),
    cooldownSeconds: 12 + index * 4,
    reason: rule.reason
  };
}

function applyRules(triggeredRules: readonly AdaptiveDifficultyTriggeredRule[]): AdaptiveDifficultyAdjustment {
  const adjustment: AdaptiveDifficultyAdjustment = {
    enemyHealth: 1,
    enemyDamage: 1,
    enemyCount: 1,
    resourceDropRate: 1,
    experienceMultiplier: 1,
    timerMultiplier: 1,
    checkpointMultiplier: 1
  };
  const mutable = { ...adjustment };
  for (const rule of triggeredRules) {
    if (rule.changeType === "enemy-health") mutable.enemyHealth *= rule.appliedMultiplier;
    else if (rule.changeType === "enemy-damage") mutable.enemyDamage *= rule.appliedMultiplier;
    else if (rule.changeType === "enemy-count") mutable.enemyCount *= rule.appliedMultiplier;
    else if (rule.changeType === "resource-drop-rate") mutable.resourceDropRate *= rule.appliedMultiplier;
    else if (rule.changeType === "experience-multiplier") mutable.experienceMultiplier *= rule.appliedMultiplier;
    else if (rule.changeType === "timer-multiplier") mutable.timerMultiplier *= rule.appliedMultiplier;
    else mutable.checkpointMultiplier *= rule.appliedMultiplier;
  }
  return {
    enemyHealth: round(mutable.enemyHealth),
    enemyDamage: round(mutable.enemyDamage),
    enemyCount: round(mutable.enemyCount),
    resourceDropRate: round(mutable.resourceDropRate),
    experienceMultiplier: round(mutable.experienceMultiplier),
    timerMultiplier: round(mutable.timerMultiplier),
    checkpointMultiplier: round(mutable.checkpointMultiplier)
  };
}

function ruleTriggered(metric: AdaptiveDifficultyMetricSummary | undefined, rule: RuleDefinition): boolean {
  if (!metric) return false;
  return rule.direction === "above" ? metric.mean > rule.threshold : metric.mean < rule.threshold;
}

function sampleSeries(center: number, amplitude: number, seed: number, salt: number): readonly number[] {
  return Array.from({ length: 9 }, (_, index) => {
    const wave = Math.sin((seed + salt + index * 17) * 0.37) * amplitude;
    const drift = (index - 4) * amplitude * 0.08;
    return round(Math.max(0, center + wave + drift));
  });
}

function isLowerBetter(type: AdaptiveDifficultyMetricType): boolean {
  return type === "death-rate" || type === "completion-time" || type === "damage-taken" || type === "retry-count";
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function integer(value: number, label: string): number {
  if (!Number.isInteger(value)) throw new RangeError(`Adaptive difficulty fixture ${label} must be an integer.`);
  return value;
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`Adaptive difficulty fixture ${label} must be finite.`);
  return value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function round(value: number): number {
  return Number(value.toFixed(4));
}
