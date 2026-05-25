export type CloudFixtureServiceStatus = "offline-cache" | "queued" | "synced" | "simulated-match" | "blocked";

export interface CloudServiceFixtureOptions {
  readonly seed?: number;
  readonly playerId?: string;
  readonly score?: number;
  readonly offlineMode?: boolean;
  readonly sessionSeconds?: number;
}

export interface CloudServiceFixture {
  readonly source: "origin-master-cloud-services-adapted";
  readonly services: {
    readonly authentication: {
      readonly provider: "guest";
      readonly authenticated: false;
      readonly offlineUserId: string;
      readonly tokenIssued: false;
      readonly status: CloudFixtureServiceStatus;
    };
    readonly cloudSave: {
      readonly saveId: "runtime-progress";
      readonly version: number;
      readonly checksum: string;
      readonly queuedUploads: number;
      readonly conflictResolution: "last-write-wins" | "merge" | "manual";
      readonly status: CloudFixtureServiceStatus;
    };
    readonly achievements: {
      readonly unlocked: readonly string[];
      readonly inProgress: readonly { readonly id: string; readonly progress: number }[];
      readonly totalPoints: number;
      readonly status: CloudFixtureServiceStatus;
    };
    readonly leaderboard: {
      readonly id: "runtime-score";
      readonly score: number;
      readonly rank: number;
      readonly timeFrame: "daily" | "weekly" | "all-time";
      readonly cachedEntries: number;
      readonly status: CloudFixtureServiceStatus;
    };
    readonly remoteConfig: {
      readonly activated: true;
      readonly abTestGroup: "control" | "variant-a" | "variant-b";
      readonly parameterCount: number;
      readonly difficultyScale: number;
      readonly eventMultiplier: number;
      readonly status: CloudFixtureServiceStatus;
    };
    readonly matchmaking: {
      readonly queue: "casual-runtime";
      readonly region: "local";
      readonly ticketId: string;
      readonly estimatedWaitMs: number;
      readonly matchedPlayers: number;
      readonly status: CloudFixtureServiceStatus;
    };
    readonly contentDelivery: {
      readonly manifestId: "runtime-content";
      readonly assetCount: number;
      readonly cacheHits: number;
      readonly integrityHashes: readonly string[];
      readonly status: CloudFixtureServiceStatus;
    };
  };
  readonly productionReadiness: {
    readonly cloudServiceTelemetry: true;
    readonly offlineQueueTelemetry: true;
    readonly remoteConfigTelemetry: true;
    readonly leaderboardTelemetry: true;
    readonly matchmakingTelemetry: true;
    readonly contentDeliveryTelemetry: true;
  };
  readonly blockedClaims: readonly string[];
  readonly claimBoundary: string;
  readonly hash: string;
}

export function sampleCloudServiceFixture(options: CloudServiceFixtureOptions = {}): CloudServiceFixture {
  const seed = normalizeSeed(options.seed ?? 0xc10d);
  const playerId = normalizePlayerId(options.playerId ?? "external-parity-runtime-player");
  const score = positiveInteger(options.score ?? 12_400, "score");
  const sessionSeconds = positiveInteger(options.sessionSeconds ?? 180, "sessionSeconds");
  const offlineMode = options.offlineMode ?? true;
  const abTestGroup = seededChoice(seed, ["control", "variant-a", "variant-b"] as const);
  const difficultyScale = Number((0.86 + seededUnit(seed ^ 0x55a5) * 0.24).toFixed(3));
  const eventMultiplier = Number((1 + Math.min(0.5, sessionSeconds / 1800)).toFixed(3));
  const version = 3 + Math.floor(seededUnit(seed ^ 0x911) * 6);
  const savePayload = JSON.stringify({ playerId, score, sessionSeconds, version });
  const cloudSaveChecksum = stableHash(savePayload);
  const achievements = [
    { id: "first-run", points: 10, progress: 1 },
    { id: "collector", points: 25, progress: Math.min(1, score / 20_000) },
    { id: "speed-clear", points: 50, progress: Math.min(1, sessionSeconds <= 240 ? 1 : 240 / sessionSeconds) }
  ] as const;
  const unlocked = achievements.filter((achievement) => achievement.progress >= 1).map((achievement) => achievement.id);
  const inProgress = achievements.filter((achievement) => achievement.progress < 1).map((achievement) => ({
    id: achievement.id,
    progress: Number(achievement.progress.toFixed(3))
  }));
  const rank = Math.max(1, Math.round(5000 / Math.max(1, score / 500)));
  const integrityHashes = [
    stableHash(`runtime-content:${seed}:arena`),
    stableHash(`runtime-content:${seed}:hero`),
    stableHash(`runtime-content:${seed}:config`)
  ] as const;
  const status: CloudFixtureServiceStatus = offlineMode ? "offline-cache" : "queued";
  const fixture: Omit<CloudServiceFixture, "hash"> = {
    source: "origin-master-cloud-services-adapted",
    services: {
      authentication: {
        provider: "guest",
        authenticated: false,
        offlineUserId: `guest-${stableHash(playerId).slice(0, 6)}`,
        tokenIssued: false,
        status
      },
      cloudSave: {
        saveId: "runtime-progress",
        version,
        checksum: cloudSaveChecksum,
        queuedUploads: offlineMode ? 1 : 0,
        conflictResolution: "last-write-wins",
        status: offlineMode ? "queued" : "synced"
      },
      achievements: {
        unlocked,
        inProgress,
        totalPoints: achievements.filter((achievement) => achievement.progress >= 1).reduce((sum, achievement) => sum + achievement.points, 0),
        status
      },
      leaderboard: {
        id: "runtime-score",
        score,
        rank,
        timeFrame: "weekly",
        cachedEntries: 5 + Math.floor(seededUnit(seed ^ 0x7717) * 8),
        status
      },
      remoteConfig: {
        activated: true,
        abTestGroup,
        parameterCount: 4,
        difficultyScale,
        eventMultiplier,
        status
      },
      matchmaking: {
        queue: "casual-runtime",
        region: "local",
        ticketId: `ticket-${stableHash(`${playerId}:${score}`).slice(0, 8)}`,
        estimatedWaitMs: Math.round(1500 + seededUnit(seed ^ 0x4d47) * 3000),
        matchedPlayers: 2,
        status: "simulated-match"
      },
      contentDelivery: {
        manifestId: "runtime-content",
        assetCount: integrityHashes.length,
        cacheHits: offlineMode ? integrityHashes.length : Math.max(1, integrityHashes.length - 1),
        integrityHashes,
        status
      }
    },
    productionReadiness: {
      cloudServiceTelemetry: true,
      offlineQueueTelemetry: true,
      remoteConfigTelemetry: true,
      leaderboardTelemetry: true,
      matchmakingTelemetry: true,
      contentDeliveryTelemetry: true
    },
    blockedClaims: [
      "real cloud authentication backend",
      "production cloud-save conflict resolution",
      "hosted CDN/content-delivery parity",
      "real multiplayer matchmaking service",
      "Unity Gaming Services parity",
      "Unreal Online Services parity",
      "privacy/compliance/security certification"
    ],
    claimBoundary: "This fixture ports old cloud-service concepts into deterministic local telemetry. It does not contact a backend, issue real auth tokens, upload saves, submit leaderboards, run CDN delivery, create multiplayer matches, or claim Unity Gaming Services or Unreal Online Services parity."
  };
  return {
    ...fixture,
    hash: stableHash(JSON.stringify(fixture))
  };
}

function normalizeSeed(seed: number): number {
  if (!Number.isInteger(seed) || seed < 0) throw new Error("seed must be a non-negative integer.");
  return seed >>> 0;
}

function normalizePlayerId(playerId: string): string {
  const trimmed = playerId.trim();
  if (trimmed.length === 0) throw new Error("playerId must not be empty.");
  return trimmed;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer.`);
  return value;
}

function seededChoice<T>(seed: number, values: readonly T[]): T {
  return values[Math.min(values.length - 1, Math.floor(seededUnit(seed) * values.length))] as T;
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
