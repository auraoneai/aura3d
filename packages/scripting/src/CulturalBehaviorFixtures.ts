export type CulturalCommunicationStyle = "direct" | "balanced" | "indirect";
export type CulturalPersonalSpace = "close" | "medium" | "distant";
export type CulturalRelationship = "stranger" | "acquaintance" | "friend" | "family" | "superior" | "subordinate";
export type ProxemicZone = "intimate" | "personal" | "social" | "public";

export interface CulturalBehaviorFixtureOptions {
  readonly seed?: number;
  readonly relationship?: CulturalRelationship;
  readonly initiatorPosition?: readonly [number, number, number];
  readonly targetPosition?: readonly [number, number, number];
  readonly message?: string;
}

export interface CultureDescriptor {
  readonly id: string;
  readonly name: string;
  readonly individualismScore: number;
  readonly powerDistanceScore: number;
  readonly uncertaintyAvoidanceScore: number;
  readonly communicationStyle: CulturalCommunicationStyle;
  readonly personalSpacePreference: CulturalPersonalSpace;
  readonly eyeContactNorm: "low" | "moderate" | "high";
  readonly greetingStyle: "formal" | "casual" | "bow" | "handshake";
}

export interface CulturalEntityFixture {
  readonly id: string;
  readonly cultureId: string;
  readonly position: readonly [number, number, number];
  readonly personalityVariance: number;
}

export interface CulturalBehaviorFixture {
  readonly source: "origin-master-cultural-ai-adapted";
  readonly cultures: readonly CultureDescriptor[];
  readonly entities: readonly CulturalEntityFixture[];
  readonly proxemics: {
    readonly relationship: CulturalRelationship;
    readonly distanceMeters: number;
    readonly acceptableDistanceMeters: number;
    readonly zone: ProxemicZone;
    readonly comfort: number;
    readonly approachAllowed: boolean;
  };
  readonly communication: {
    readonly input: string;
    readonly formatted: string;
    readonly directness: CulturalCommunicationStyle;
    readonly formality: "formal" | "neutral" | "informal";
    readonly audienceAdapted: boolean;
  };
  readonly socialNorms: {
    readonly greetingExpected: string;
    readonly eyeContactExpected: string;
    readonly hierarchyAware: boolean;
    readonly normViolations: readonly string[];
  };
  readonly gesture: {
    readonly id: string;
    readonly allowed: boolean;
    readonly intensity: number;
  };
  readonly decision: {
    readonly selectedAction: "approach" | "wait" | "request-distance" | "formal-greeting";
    readonly score: number;
    readonly reason: string;
  };
  readonly productionReadiness: {
    readonly proxemicTelemetry: true;
    readonly communicationStyleTelemetry: true;
    readonly socialNormTelemetry: true;
    readonly gestureBoundaryTelemetry: true;
  };
  readonly blockedClaims: readonly string[];
  readonly claimBoundary: string;
  readonly hash: string;
}

const collectivistCulture: CultureDescriptor = {
  id: "collective-formal",
  name: "Collective Formal Fixture",
  individualismScore: 0.28,
  powerDistanceScore: 0.68,
  uncertaintyAvoidanceScore: 0.74,
  communicationStyle: "indirect",
  personalSpacePreference: "distant",
  eyeContactNorm: "moderate",
  greetingStyle: "formal"
};

const directCulture: CultureDescriptor = {
  id: "direct-pragmatic",
  name: "Direct Pragmatic Fixture",
  individualismScore: 0.72,
  powerDistanceScore: 0.36,
  uncertaintyAvoidanceScore: 0.42,
  communicationStyle: "direct",
  personalSpacePreference: "medium",
  eyeContactNorm: "high",
  greetingStyle: "handshake"
};

export function sampleCulturalBehaviorFixture(options: CulturalBehaviorFixtureOptions = {}): CulturalBehaviorFixture {
  const seed = normalizeSeed(options.seed ?? 0xc017);
  const relationship = options.relationship ?? "superior";
  const initiatorPosition = options.initiatorPosition ?? [0, 0, 0] as const;
  const targetPosition = options.targetPosition ?? [0.82, 0, 0.34] as const;
  const initiator: CulturalEntityFixture = {
    id: "npc-diplomat",
    cultureId: collectivistCulture.id,
    position: initiatorPosition,
    personalityVariance: Number((0.08 + seededUnit(seed) * 0.08).toFixed(3))
  };
  const target: CulturalEntityFixture = {
    id: "player-envoy",
    cultureId: directCulture.id,
    position: targetPosition,
    personalityVariance: Number((0.1 + seededUnit(seed ^ 0x9e37) * 0.06).toFixed(3))
  };
  const distanceMeters = distance(initiator.position, target.position);
  const acceptableDistanceMeters = acceptableDistance(collectivistCulture, relationship);
  const comfort = comfortLevel(distanceMeters, acceptableDistanceMeters);
  const approachAllowed = distanceMeters >= acceptableDistanceMeters * 0.7;
  const formality = determineFormality(collectivistCulture, directCulture, relationship);
  const input = options.message ?? "Could you help me with the gate plan?";
  const formatted = formatMessage(input, collectivistCulture, directCulture, relationship, formality);
  const normViolations = [
    ...(approachAllowed ? [] : ["personal-space-too-close"]),
    ...(relationship === "superior" && !formatted.toLowerCase().startsWith("please") ? ["missing-hierarchy-marker"] : [])
  ];
  const selectedAction = !approachAllowed
    ? "request-distance"
    : formality === "formal"
      ? "formal-greeting"
      : "approach";
  const core = {
    relationship,
    distanceMeters,
    acceptableDistanceMeters,
    comfort,
    selectedAction,
    formatted
  };
  return {
    source: "origin-master-cultural-ai-adapted",
    cultures: [collectivistCulture, directCulture],
    entities: [initiator, target],
    proxemics: {
      relationship,
      distanceMeters,
      acceptableDistanceMeters,
      zone: zoneForDistance(distanceMeters),
      comfort,
      approachAllowed
    },
    communication: {
      input,
      formatted,
      directness: collectivistCulture.communicationStyle,
      formality,
      audienceAdapted: formatted !== input
    },
    socialNorms: {
      greetingExpected: collectivistCulture.greetingStyle,
      eyeContactExpected: collectivistCulture.eyeContactNorm,
      hierarchyAware: relationship === "superior" || relationship === "subordinate",
      normViolations
    },
    gesture: {
      id: collectivistCulture.greetingStyle === "bow" ? "bow" : "measured-handshake",
      allowed: comfort >= 0.35,
      intensity: Number((0.42 + comfort * 0.38).toFixed(3))
    },
    decision: {
      selectedAction,
      score: Number(((approachAllowed ? 0.52 : 0.18) + comfort * 0.36 + (formality === "formal" ? 0.08 : 0)).toFixed(3)),
      reason: normViolations.length > 0 ? normViolations.join(",") : "proxemics-and-formality-within-bounds"
    },
    productionReadiness: {
      proxemicTelemetry: true,
      communicationStyleTelemetry: true,
      socialNormTelemetry: true,
      gestureBoundaryTelemetry: true
    },
    blockedClaims: [
      "real cultural modeling certification",
      "LLM-driven NPC dialogue parity",
      "Unity Behavior Designer or ML-Agents social AI parity",
      "Unreal MassAI/SmartObject social simulation parity",
      "human-subject validated intercultural behavior"
    ],
    claimBoundary: "This fixture ports old cultural AI concepts into deterministic proxemics, communication-style, social-norm, gesture, and decision telemetry for runtime evidence. It does not claim validated cultural modeling, generated NPC dialogue, or Unity/Unreal social-AI parity.",
    hash: stableHash(JSON.stringify(core))
  };
}

function acceptableDistance(culture: CultureDescriptor, relationship: CulturalRelationship): number {
  const base = relationship === "family" ? 0.3 : relationship === "friend" ? 0.6 : relationship === "acquaintance" ? 1.0 : relationship === "superior" || relationship === "subordinate" ? 1.25 : 1.5;
  const space = culture.personalSpacePreference === "close" ? 0.7 : culture.personalSpacePreference === "distant" ? 1.4 : 1;
  const individualism = 1 - culture.individualismScore * 0.2;
  const hierarchy = 1 + culture.powerDistanceScore * 0.15;
  return Number((base * space * individualism * hierarchy).toFixed(3));
}

function formatMessage(message: string, speaker: CultureDescriptor, audience: CultureDescriptor, relationship: CulturalRelationship, formality: CulturalBehaviorFixture["communication"]["formality"]): string {
  let formatted = message.trim();
  const indirect = speaker.communicationStyle === "indirect" || audience.communicationStyle === "indirect";
  if (indirect && !/\b(could|would|might)\b/i.test(formatted)) {
    formatted = `I was wondering if you might ${formatted.charAt(0).toLowerCase()}${formatted.slice(1)}`;
  }
  if (formality === "formal") {
    formatted = formatted.replace(/\bhey\b/gi, "Hello").replace(/\byeah\b/gi, "yes").replace(/\bgonna\b/gi, "going to");
  }
  if (relationship === "superior" && !formatted.toLowerCase().startsWith("please")) {
    formatted = `Please, ${formatted.charAt(0).toLowerCase()}${formatted.slice(1)}`;
  }
  return formatted;
}

function determineFormality(speaker: CultureDescriptor, audience: CultureDescriptor, relationship: CulturalRelationship): CulturalBehaviorFixture["communication"]["formality"] {
  if (relationship === "superior" || speaker.powerDistanceScore > 0.6 || audience.powerDistanceScore > 0.6) return "formal";
  if (relationship === "friend" || relationship === "family") return "informal";
  return "neutral";
}

function zoneForDistance(distanceMeters: number): ProxemicZone {
  if (distanceMeters < 0.45) return "intimate";
  if (distanceMeters < 1.2) return "personal";
  if (distanceMeters < 3.6) return "social";
  return "public";
}

function comfortLevel(distanceMeters: number, acceptableDistanceMeters: number): number {
  const deviation = Math.abs(distanceMeters - acceptableDistanceMeters);
  return Number(Math.max(0, 1 - deviation / Math.max(0.001, acceptableDistanceMeters * 0.5)).toFixed(3));
}

function distance(left: readonly [number, number, number], right: readonly [number, number, number]): number {
  return Number(Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]).toFixed(3));
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
