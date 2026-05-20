import type { PlayerBehaviorTelemetryFixture, PlayerPlaystyle, PlayerSkillLevel } from "./PlayerBehaviorTelemetryFixtures";

export type GeneratedContentType = "level" | "quest" | "enemy_encounter" | "puzzle" | "reward" | "narrative";
export type GeneratedContentDifficulty = "trivial" | "easy" | "moderate" | "challenging" | "extreme";
export type AdaptiveAiStrategy = "mirror" | "counter" | "exploit" | "match_skill" | "challenge";

export interface ProceduralContentAdaptationOptions {
  readonly seed?: number;
  readonly playerTelemetry: PlayerBehaviorTelemetryFixture;
  readonly strategy?: AdaptiveAiStrategy;
}

export interface GeneratedContentTelemetry {
  readonly id: string;
  readonly type: GeneratedContentType;
  readonly difficulty: GeneratedContentDifficulty;
  readonly estimatedDurationMs: number;
  readonly tags: readonly string[];
  readonly parameters: {
    readonly size?: number;
    readonly enemyCount?: number;
    readonly resourceCount?: number;
    readonly hasSecretAreas?: boolean;
    readonly hasTimeLimit?: boolean;
    readonly layout?: "linear" | "branching";
    readonly objectiveCount?: number;
    readonly rewardTier?: string;
  };
}

export interface ProceduralContentAdaptationFixture {
  readonly source: "origin-master-content-generator-adaptive-ai-adapted";
  readonly content: readonly GeneratedContentTelemetry[];
  readonly adaptiveAi: {
    readonly strategy: AdaptiveAiStrategy;
    readonly behaviorMode: "passive" | "balanced" | "aggressive" | "tactical" | "adaptive";
    readonly aggression: number;
    readonly defensiveness: number;
    readonly tacticalAwareness: number;
    readonly reactionSpeed: number;
    readonly accuracy: number;
    readonly abilityUsage: number;
    readonly coordination: number;
  };
  readonly productionReadiness: {
    readonly contentGenerationTelemetry: true;
    readonly playstyleCustomizationTelemetry: true;
    readonly skillScalingTelemetry: true;
    readonly adaptiveAiParameterTelemetry: true;
  };
  readonly blockedClaims: readonly string[];
  readonly claimBoundary: string;
  readonly hash: string;
}

export function sampleProceduralContentAdaptationFixture(options: ProceduralContentAdaptationOptions): ProceduralContentAdaptationFixture {
  const seed = normalizeSeed(options.seed ?? 0xc067);
  const profile = options.playerTelemetry.profile;
  const difficulty = difficultyForSkill(profile.skillLevel);
  const playstyle = profile.playstyle;
  const content: readonly GeneratedContentTelemetry[] = [
    generateLevel(seed, difficulty, playstyle),
    generateEncounter(seed ^ 0x1138, difficulty, playstyle),
    generateReward(seed ^ 0x9821, difficulty, profile.skillLevel),
    generateQuest(seed ^ 0xa77a, difficulty, playstyle)
  ];
  const adaptiveAi = adaptiveAiFor(options.strategy ?? "counter", playstyle, profile.skillLevel, options.playerTelemetry.events.successRate);
  const core = { content, adaptiveAi, playerHash: options.playerTelemetry.hash };
  return {
    source: "origin-master-content-generator-adaptive-ai-adapted",
    content,
    adaptiveAi,
    productionReadiness: {
      contentGenerationTelemetry: true,
      playstyleCustomizationTelemetry: true,
      skillScalingTelemetry: true,
      adaptiveAiParameterTelemetry: true
    },
    blockedClaims: [
      "production procedural content generation parity",
      "runtime-authored quest/narrative generation",
      "Unity Adaptive Performance/Game Foundation parity",
      "Unreal PCG Framework/MassAI parity",
      "LLM-authored live content generation"
    ],
    claimBoundary: "This fixture ports old ContentGenerator/AdaptiveAI concepts into deterministic content-plan and adaptive-parameter telemetry. It does not create production PCG levels, generate live narrative, or claim Unity/Unreal PCG or AI-system parity.",
    hash: stableHash(JSON.stringify(core))
  };
}

function generateLevel(seed: number, difficulty: GeneratedContentDifficulty, playstyle: PlayerPlaystyle): GeneratedContentTelemetry {
  const multiplier = difficultyMultiplier(difficulty);
  return {
    id: "content-level-1",
    type: "level",
    difficulty,
    estimatedDurationMs: Math.round(240000 * multiplier),
    tags: ["procedural", "level", playstyle],
    parameters: {
      size: Math.round(90 * multiplier),
      enemyCount: playstyle === "stealth" ? Math.round(4 * multiplier) : Math.round(7 * multiplier),
      resourceCount: playstyle === "exploration" || playstyle === "completionist" ? Math.round(10 * multiplier) : Math.round(6 * multiplier),
      hasSecretAreas: playstyle === "exploration" || playstyle === "completionist",
      hasTimeLimit: playstyle === "speedrun",
      layout: seededUnit(seed) > 0.5 ? "branching" : "linear"
    }
  };
}

function generateEncounter(seed: number, difficulty: GeneratedContentDifficulty, playstyle: PlayerPlaystyle): GeneratedContentTelemetry {
  const multiplier = difficultyMultiplier(difficulty);
  return {
    id: "content-encounter-1",
    type: "enemy_encounter",
    difficulty,
    estimatedDurationMs: Math.round(95000 * multiplier),
    tags: ["combat", "encounter", playstyle === "defensive" ? "cover" : "pressure"],
    parameters: {
      enemyCount: Math.max(1, Math.round((playstyle === "aggressive" ? 6 : 4) * multiplier)),
      resourceCount: Math.max(1, Math.round((1 + seededUnit(seed) * 3) * multiplier)),
      layout: playstyle === "defensive" ? "branching" : "linear"
    }
  };
}

function generateReward(seed: number, difficulty: GeneratedContentDifficulty, skill: PlayerSkillLevel): GeneratedContentTelemetry {
  return {
    id: "content-reward-1",
    type: "reward",
    difficulty,
    estimatedDurationMs: 0,
    tags: ["reward", "loot", skill],
    parameters: {
      rewardTier: skill === "expert" || skill === "advanced" ? "rare" : seededUnit(seed) > 0.55 ? "uncommon" : "standard",
      resourceCount: Math.round(2 + seededUnit(seed ^ 0x55aa) * 4)
    }
  };
}

function generateQuest(seed: number, difficulty: GeneratedContentDifficulty, playstyle: PlayerPlaystyle): GeneratedContentTelemetry {
  return {
    id: "content-quest-1",
    type: "quest",
    difficulty,
    estimatedDurationMs: Math.round(360000 * difficultyMultiplier(difficulty)),
    tags: ["quest", playstyle === "exploration" ? "optional" : "objective"],
    parameters: {
      objectiveCount: Math.round(2 + seededUnit(seed) * 3),
      hasSecretAreas: playstyle === "completionist" || playstyle === "exploration"
    }
  };
}

function adaptiveAiFor(strategy: AdaptiveAiStrategy, playstyle: PlayerPlaystyle, skill: PlayerSkillLevel, successRate: number): ProceduralContentAdaptationFixture["adaptiveAi"] {
  const skillScale = skill === "expert" ? 1 : skill === "advanced" ? 0.85 : skill === "intermediate" ? 0.65 : skill === "novice" ? 0.48 : 0.35;
  const counterAggression = playstyle === "defensive" || playstyle === "stealth" ? 0.72 : playstyle === "aggressive" ? 0.48 : 0.58;
  return {
    strategy,
    behaviorMode: strategy === "counter" || strategy === "challenge" ? "adaptive" : "balanced",
    aggression: Number(Math.min(1, counterAggression + skillScale * 0.12).toFixed(3)),
    defensiveness: Number((playstyle === "aggressive" ? 0.72 : 0.48 + skillScale * 0.16).toFixed(3)),
    tacticalAwareness: Number((0.42 + skillScale * 0.44).toFixed(3)),
    reactionSpeed: Number((0.82 + skillScale * 0.38).toFixed(3)),
    accuracy: Number((0.36 + skillScale * 0.36 + successRate * 0.08).toFixed(3)),
    abilityUsage: Number((0.3 + skillScale * 0.48).toFixed(3)),
    coordination: Number((0.38 + skillScale * 0.32).toFixed(3))
  };
}

function difficultyForSkill(skill: PlayerSkillLevel): GeneratedContentDifficulty {
  if (skill === "beginner") return "easy";
  if (skill === "novice" || skill === "intermediate") return "moderate";
  if (skill === "advanced") return "challenging";
  return "extreme";
}

function difficultyMultiplier(difficulty: GeneratedContentDifficulty): number {
  if (difficulty === "trivial") return 0.6;
  if (difficulty === "easy") return 0.8;
  if (difficulty === "moderate") return 1;
  if (difficulty === "challenging") return 1.28;
  return 1.55;
}

function normalizeSeed(seed: number): number {
  if (!Number.isInteger(seed) || seed < 0) throw new Error("seed must be a non-negative integer.");
  return seed >>> 0;
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
