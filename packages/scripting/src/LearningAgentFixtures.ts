export interface LearningAgentFixtureOptions {
  readonly seed?: number;
  readonly targetDistance?: number;
  readonly health?: number;
  readonly energy?: number;
  readonly nearbyCount?: number;
}

export interface LearningAgentFixture {
  readonly source: "origin-master-ml-agent-adapted";
  readonly observation: {
    readonly featureSize: number;
    readonly normalizedPosition: readonly [number, number, number];
    readonly normalizedVelocity: readonly [number, number, number];
    readonly targetDistance: number;
    readonly health: number;
    readonly energy: number;
    readonly nearbyEntitySlots: number;
    readonly featureHash: string;
  };
  readonly behaviorCloning: {
    readonly demonstrations: number;
    readonly trainLoss: number;
    readonly validationLoss: number;
    readonly trainAccuracy: number;
    readonly validationAccuracy: number;
    readonly earlyStoppingEpoch: number;
    readonly selectedAction: "move-to-target" | "hold-position" | "recover";
  };
  readonly reinforcementLearning: {
    readonly gamma: number;
    readonly lambda: number;
    readonly clipRange: number;
    readonly policyLoss: number;
    readonly valueLoss: number;
    readonly totalLoss: number;
    readonly avgAdvantage: number;
    readonly avgReturn: number;
    readonly entropy: number;
    readonly klDivergence: number;
    readonly explainedVariance: number;
  };
  readonly reward: {
    readonly progress: number;
    readonly survival: number;
    readonly energyPenalty: number;
    readonly proximityBonus: number;
    readonly total: number;
  };
  readonly productionReadiness: {
    readonly featureExtractionTelemetry: true;
    readonly behaviorCloningTelemetry: true;
    readonly ppoStatsTelemetry: true;
    readonly rewardBreakdownTelemetry: true;
  };
  readonly blockedClaims: readonly string[];
  readonly claimBoundary: string;
  readonly hash: string;
}

export function sampleLearningAgentFixture(options: LearningAgentFixtureOptions = {}): LearningAgentFixture {
  const seed = normalizeSeed(options.seed ?? 0x1ea5);
  const targetDistance = positive(options.targetDistance ?? 6.2, "targetDistance");
  const health = clamp01(options.health ?? 0.72);
  const energy = clamp01(options.energy ?? 0.58);
  const nearbyEntitySlots = Math.max(0, Math.min(5, Math.trunc(options.nearbyCount ?? 3)));
  const normalizedPosition: readonly [number, number, number] = [
    Number((seededUnit(seed) * 0.12).toFixed(4)),
    0,
    Number((seededUnit(seed ^ 0x5167) * 0.08).toFixed(4))
  ];
  const normalizedVelocity: readonly [number, number, number] = [
    Number((0.06 + seededUnit(seed ^ 0x78ab) * 0.04).toFixed(4)),
    0,
    Number((seededUnit(seed ^ 0x4312) * 0.02).toFixed(4))
  ];
  const featureCore = [
    ...normalizedPosition,
    ...normalizedVelocity,
    1,
    0,
    0,
    Number((targetDistance / 100).toFixed(4)),
    health,
    energy,
    nearbyEntitySlots
  ];
  const progress = Number(Math.max(0, 1 - targetDistance / 12).toFixed(4));
  const survival = Number((health * 0.35).toFixed(4));
  const energyPenalty = Number(((1 - energy) * -0.18).toFixed(4));
  const proximityBonus = Number((nearbyEntitySlots > 0 ? 0.08 : 0).toFixed(4));
  const totalReward = Number((progress + survival + energyPenalty + proximityBonus).toFixed(4));
  const selectedAction = health < 0.35 ? "recover" : targetDistance > 1.5 ? "move-to-target" : "hold-position";
  const behaviorCloning = {
    demonstrations: 24 + nearbyEntitySlots * 4,
    trainLoss: Number((0.18 - progress * 0.06).toFixed(4)),
    validationLoss: Number((0.22 - progress * 0.05).toFixed(4)),
    trainAccuracy: Number((0.74 + progress * 0.12).toFixed(4)),
    validationAccuracy: Number((0.7 + progress * 0.1).toFixed(4)),
    earlyStoppingEpoch: 7 + nearbyEntitySlots,
    selectedAction
  } satisfies LearningAgentFixture["behaviorCloning"];
  const reinforcementLearning = {
    gamma: 0.99,
    lambda: 0.95,
    clipRange: 0.2,
    policyLoss: Number((-0.04 - progress * 0.03).toFixed(4)),
    valueLoss: Number((0.21 - totalReward * 0.08).toFixed(4)),
    totalLoss: Number((0.15 - totalReward * 0.05).toFixed(4)),
    avgAdvantage: Number((totalReward * 0.42).toFixed(4)),
    avgReturn: totalReward,
    entropy: Number((0.52 - progress * 0.08).toFixed(4)),
    klDivergence: Number((0.009 + seededUnit(seed ^ 0xacab) * 0.004).toFixed(4)),
    explainedVariance: Number((0.66 + progress * 0.18).toFixed(4))
  };
  const core = {
    featureCore,
    behaviorCloning,
    reinforcementLearning,
    reward: { progress, survival, energyPenalty, proximityBonus, total: totalReward }
  };
  return {
    source: "origin-master-ml-agent-adapted",
    observation: {
      featureSize: 27,
      normalizedPosition,
      normalizedVelocity,
      targetDistance,
      health,
      energy,
      nearbyEntitySlots,
      featureHash: stableHash(JSON.stringify(featureCore))
    },
    behaviorCloning,
    reinforcementLearning,
    reward: core.reward,
    productionReadiness: {
      featureExtractionTelemetry: true,
      behaviorCloningTelemetry: true,
      ppoStatsTelemetry: true,
      rewardBreakdownTelemetry: true
    },
    blockedClaims: [
      "real neural-network training",
      "ONNX runtime inference parity",
      "Unity ML-Agents parity",
      "Unreal Learning Agents parity",
      "production reinforcement-learning deployment"
    ],
    claimBoundary: "This fixture ports old ML-agent concepts into deterministic feature-extraction, behavior-cloning, PPO-stat, and reward telemetry. It does not train neural networks, run ONNX inference, or claim Unity ML-Agents or Unreal Learning Agents parity.",
    hash: stableHash(JSON.stringify(core))
  };
}

function positive(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative finite number.`);
  return Number(value.toFixed(4));
}

function normalizeSeed(seed: number): number {
  if (!Number.isInteger(seed) || seed < 0) throw new Error("seed must be a non-negative integer.");
  return seed >>> 0;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function seededUnit(seed: number): number {
  let value = seed >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return (value >>> 0) / 0xffffffff;
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
