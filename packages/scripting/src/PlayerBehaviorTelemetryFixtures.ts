export type PlayerSkillLevel = "beginner" | "novice" | "intermediate" | "advanced" | "expert";
export type PlayerPlaystyle = "aggressive" | "defensive" | "balanced" | "stealth" | "exploration" | "speedrun" | "completionist";
export type PlayerEngagementLevel = "casual" | "regular" | "dedicated" | "hardcore";
export type PlayerEventCategory = "combat" | "movement" | "interaction" | "progression" | "economy" | "social" | "custom";
export type PlayerEventSeverity = "low" | "medium" | "high" | "critical";

export interface PlayerBehaviorTelemetryOptions {
  readonly seed?: number;
  readonly playerId?: string;
  readonly sessionSeconds?: number;
  readonly combatEvents?: number;
  readonly movementEvents?: number;
  readonly interactionEvents?: number;
  readonly progressionEvents?: number;
  readonly successEvents?: number;
}

export interface PlayerSkillAssessmentTelemetry {
  readonly area: string;
  readonly level: number;
  readonly confidence: number;
  readonly sampleSize: number;
}

export interface PlayerBehaviorPatternTelemetry {
  readonly name: string;
  readonly frequency: number;
  readonly confidence: number;
}

export interface PlayerBehaviorTelemetryFixture {
  readonly source: "origin-master-player-profile-event-analysis-adapted";
  readonly playerId: string;
  readonly profile: {
    readonly skillLevel: PlayerSkillLevel;
    readonly playstyle: PlayerPlaystyle;
    readonly engagement: PlayerEngagementLevel;
    readonly skills: readonly PlayerSkillAssessmentTelemetry[];
    readonly preferences: readonly { readonly category: string; readonly value: string; readonly strength: number }[];
    readonly patterns: readonly PlayerBehaviorPatternTelemetry[];
    readonly totalPlaytimeMs: number;
    readonly sessionCount: number;
  };
  readonly events: {
    readonly total: number;
    readonly byCategory: Record<PlayerEventCategory, number>;
    readonly bySeverity: Record<PlayerEventSeverity, number>;
    readonly successRate: number;
    readonly avgDurationMs: number;
    readonly eventsPerMinute: number;
  };
  readonly sessionAnalysis: {
    readonly durationMs: number;
    readonly dominantPlaystyle: PlayerPlaystyle;
    readonly skillEstimate: PlayerSkillLevel;
    readonly insights: readonly {
      readonly type: string;
      readonly confidence: number;
      readonly evidence: readonly string[];
      readonly recommendations: readonly string[];
    }[];
  };
  readonly productionReadiness: {
    readonly playerProfileTelemetry: true;
    readonly eventTrackingTelemetry: true;
    readonly behaviorPatternTelemetry: true;
    readonly adaptiveSystemInputTelemetry: true;
  };
  readonly blockedClaims: readonly string[];
  readonly claimBoundary: string;
  readonly hash: string;
}

export function samplePlayerBehaviorTelemetryFixture(options: PlayerBehaviorTelemetryOptions = {}): PlayerBehaviorTelemetryFixture {
  const seed = normalizeSeed(options.seed ?? 0xb34a);
  const playerId = normalizePlayerId(options.playerId ?? "v4-runtime-player");
  const sessionSeconds = positive(options.sessionSeconds ?? 180, "sessionSeconds");
  const combat = count(options.combatEvents ?? 12, "combatEvents");
  const movement = count(options.movementEvents ?? 18, "movementEvents");
  const interaction = count(options.interactionEvents ?? 7, "interactionEvents");
  const progression = count(options.progressionEvents ?? 5, "progressionEvents");
  const success = count(options.successEvents ?? 24, "successEvents");
  const total = combat + movement + interaction + progression;
  const successRate = Number((success / Math.max(1, total)).toFixed(4));
  const eventsPerMinute = Number((total / Math.max(1, sessionSeconds / 60)).toFixed(3));
  const combatRatio = combat / Math.max(1, total);
  const movementRatio = movement / Math.max(1, total);
  const interactionRatio = interaction / Math.max(1, total);
  const progressionRatio = progression / Math.max(1, total);
  const playstyle = detectPlaystyle({ combatRatio, movementRatio, interactionRatio, progressionRatio, successRate, eventsPerMinute });
  const skillScore = successRate * 0.4 + Math.min(eventsPerMinute / 10, 1) * 0.3 + Math.min(4 / Math.max(1, total), 1) * 0.3;
  const skillLevel = skillForScore(skillScore);
  const engagement = sessionSeconds > 900 ? "hardcore" : sessionSeconds > 420 ? "dedicated" : sessionSeconds > 180 ? "regular" : "casual";
  const skills: readonly PlayerSkillAssessmentTelemetry[] = [
    skill("combat", clamp01(successRate * 0.7 + combatRatio * 0.3), combat),
    skill("navigation", clamp01(0.45 + movementRatio * 0.65), movement),
    skill("objective-routing", clamp01(0.36 + progressionRatio * 1.1), progression),
    skill("interaction", clamp01(0.42 + interactionRatio * 1.15), interaction)
  ];
  const patterns: readonly PlayerBehaviorPatternTelemetry[] = [
    { name: `${playstyle}-loop`, frequency: Number(Math.max(1, eventsPerMinute).toFixed(3)), confidence: Number((0.62 + successRate * 0.24).toFixed(3)) },
    { name: "objective-retry", frequency: Number((Math.max(0, total - success) / Math.max(1, sessionSeconds / 60)).toFixed(3)), confidence: Number((0.5 + (1 - successRate) * 0.32).toFixed(3)) }
  ];
  const insights = [
    {
      type: "playstyle",
      confidence: patterns[0]?.confidence ?? 0.6,
      evidence: [`combat=${combat}`, `movement=${movement}`, `progression=${progression}`],
      recommendations: [playstyle === "aggressive" ? "offer-combat-optional-objective" : "offer-navigation-shortcut"]
    },
    {
      type: "skill-estimate",
      confidence: Number((0.58 + skillScore * 0.3).toFixed(3)),
      evidence: [`successRate=${successRate}`, `eventsPerMinute=${eventsPerMinute}`],
      recommendations: [skillScore > 0.6 ? "raise-optional-challenge" : "keep-assistive-checkpoints"]
    }
  ] as const;
  const core = {
    playerId,
    skillLevel,
    playstyle,
    engagement,
    successRate,
    eventsPerMinute,
    skills,
    patterns,
    insights
  };
  return {
    source: "origin-master-player-profile-event-analysis-adapted",
    playerId,
    profile: {
      skillLevel,
      playstyle,
      engagement,
      skills,
      preferences: [
        { category: "difficulty", value: skillScore > 0.6 ? "advanced" : "adaptive", strength: Number((0.62 + seededUnit(seed) * 0.22).toFixed(3)) },
        { category: "route", value: movementRatio > combatRatio ? "exploration" : "direct", strength: Number((0.56 + seededUnit(seed ^ 0x2735) * 0.2).toFixed(3)) }
      ],
      patterns,
      totalPlaytimeMs: Math.round(sessionSeconds * 1000),
      sessionCount: 3 + Math.round(seededUnit(seed ^ 0x9e37) * 4)
    },
    events: {
      total,
      byCategory: {
        combat,
        movement,
        interaction,
        progression,
        economy: 0,
        social: 0,
        custom: 0
      },
      bySeverity: {
        low: movement,
        medium: interaction + progression,
        high: combat,
        critical: 0
      },
      successRate,
      avgDurationMs: Number((180 + seededUnit(seed ^ 0xf00d) * 140).toFixed(2)),
      eventsPerMinute
    },
    sessionAnalysis: {
      durationMs: Math.round(sessionSeconds * 1000),
      dominantPlaystyle: playstyle,
      skillEstimate: skillLevel,
      insights
    },
    productionReadiness: {
      playerProfileTelemetry: true,
      eventTrackingTelemetry: true,
      behaviorPatternTelemetry: true,
      adaptiveSystemInputTelemetry: true
    },
    blockedClaims: [
      "production player modeling certification",
      "privacy/compliance analytics certification",
      "cloud telemetry pipeline parity",
      "Unity Analytics/Remote Config parity",
      "Unreal Insights gameplay telemetry parity"
    ],
    claimBoundary: "This fixture ports old smart PlayerProfile/EventTracker/BehaviorAnalyzer concepts into deterministic local runtime telemetry. It does not claim production player modeling, privacy/compliance analytics certification, cloud telemetry pipelines, Unity Analytics, or Unreal Insights parity.",
    hash: stableHash(JSON.stringify(core))
  };
}

function detectPlaystyle(stats: { readonly combatRatio: number; readonly movementRatio: number; readonly interactionRatio: number; readonly progressionRatio: number; readonly successRate: number; readonly eventsPerMinute: number }): PlayerPlaystyle {
  if (stats.combatRatio > 0.45 && stats.eventsPerMinute > 8) return "aggressive";
  if (stats.movementRatio > 0.45 && stats.combatRatio < 0.35) return "exploration";
  if (stats.successRate > 0.7 && stats.combatRatio < 0.4) return "stealth";
  if (stats.eventsPerMinute > 10 && stats.progressionRatio > 0.2) return "speedrun";
  if (stats.interactionRatio > 0.35) return "completionist";
  if (stats.combatRatio > 0.3 && stats.successRate > 0.6) return "defensive";
  return "balanced";
}

function skillForScore(score: number): PlayerSkillLevel {
  if (score < 0.2) return "beginner";
  if (score < 0.4) return "novice";
  if (score < 0.6) return "intermediate";
  if (score < 0.8) return "advanced";
  return "expert";
}

function skill(area: string, level: number, sampleSize: number): PlayerSkillAssessmentTelemetry {
  return {
    area,
    level: Number(level.toFixed(4)),
    confidence: Number(Math.min(1, Math.max(0.1, sampleSize / 40)).toFixed(3)),
    sampleSize
  };
}

function count(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative finite number.`);
  return Math.trunc(value);
}

function positive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive finite number.`);
  return value;
}

function normalizeSeed(seed: number): number {
  if (!Number.isInteger(seed) || seed < 0) throw new Error("seed must be a non-negative integer.");
  return seed >>> 0;
}

function normalizePlayerId(playerId: string): string {
  const normalized = playerId.trim();
  if (normalized.length === 0) throw new Error("playerId is required.");
  return normalized;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
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
