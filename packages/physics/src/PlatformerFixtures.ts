export type PlatformerAnimationState =
  | "idle"
  | "walk"
  | "run"
  | "jump"
  | "fall"
  | "doubleJump"
  | "wallSlide"
  | "land";

export type PlatformerPlatformKind = "static" | "moving" | "rotating" | "falling" | "bouncy" | "disappearing";
export type PlatformerCollectibleKind = "coin" | "gem" | "power-up";

export interface PlatformerFixtureOptions {
  readonly seed?: number;
  readonly elapsedSeconds?: number;
}

export interface PlatformerPlatformSummary {
  readonly kind: PlatformerPlatformKind;
  readonly count: number;
}

export interface PlatformerCollectibleSummary {
  readonly kind: PlatformerCollectibleKind;
  readonly count: number;
  readonly scoreValue: number;
}

export interface PlatformerControllerFixture {
  readonly id: "external-parity-old-branch-platformer-controller-fixture";
  readonly source: "origin-master-platformer-controller-adapted";
  readonly config: {
    readonly walkSpeed: number;
    readonly runSpeed: number;
    readonly jumpForce: number;
    readonly doubleJumpForce: number;
    readonly wallJumpForce: number;
    readonly airControl: number;
    readonly coyoteTimeSeconds: number;
    readonly jumpBufferSeconds: number;
    readonly maxFallSpeed: number;
  };
  readonly controller: {
    readonly grounded: boolean;
    readonly coyoteJumpAccepted: boolean;
    readonly bufferedJumpAccepted: boolean;
    readonly doubleJumpAccepted: boolean;
    readonly wallJumpAccepted: boolean;
    readonly horizontalSpeed: number;
    readonly verticalVelocity: number;
    readonly stateSequence: readonly PlatformerAnimationState[];
    readonly finalState: PlatformerAnimationState;
  };
  readonly camera: {
    readonly distance: number;
    readonly minDistance: number;
    readonly maxDistance: number;
    readonly height: number;
    readonly followSpeed: number;
    readonly verticalAngle: number;
    readonly collisionAdjustedDistance: number;
    readonly shakeAmount: number;
    readonly lockOnSupported: boolean;
  };
  readonly level: {
    readonly startPosition: readonly [number, number, number];
    readonly goalPosition: readonly [number, number, number];
    readonly platformSummaries: readonly PlatformerPlatformSummary[];
    readonly collectibleSummaries: readonly PlatformerCollectibleSummary[];
    readonly checkpointCount: number;
    readonly hazardCount: number;
    readonly movingPlatformPathCount: number;
    readonly totalPlatforms: number;
    readonly totalCollectibles: number;
    readonly totalScoreValue: number;
    readonly goalDistance: number;
  };
  readonly hash: string;
  readonly claimBoundary: string;
}

const platformSummaries: readonly PlatformerPlatformSummary[] = [
  { kind: "static", count: 6 },
  { kind: "moving", count: 1 },
  { kind: "rotating", count: 1 },
  { kind: "falling", count: 3 },
  { kind: "bouncy", count: 1 },
  { kind: "disappearing", count: 2 }
];

const collectibleSummaries: readonly PlatformerCollectibleSummary[] = [
  { kind: "coin", count: 5, scoreValue: 100 },
  { kind: "gem", count: 2, scoreValue: 500 },
  { kind: "power-up", count: 1, scoreValue: 1000 }
];

export function samplePlatformerControllerFixture(options: PlatformerFixtureOptions = {}): PlatformerControllerFixture {
  const seed = integer(options.seed ?? 0x3d2025, "seed");
  const elapsedSeconds = finiteNonNegative(options.elapsedSeconds ?? 0.32, "elapsedSeconds");
  const coyoteTimeSeconds = 0.15;
  const jumpBufferSeconds = 0.1;
  const timeSinceGrounded = 0.08 + hash01(seed, 1) * 0.03;
  const timeSinceJumpPressed = 0.04 + hash01(seed, 2) * 0.02;
  const coyoteJumpAccepted = timeSinceGrounded <= coyoteTimeSeconds;
  const bufferedJumpAccepted = timeSinceJumpPressed <= jumpBufferSeconds;
  const doubleJumpAccepted = coyoteJumpAccepted && bufferedJumpAccepted;
  const wallJumpAccepted = hash01(seed, 3) > 0.25;
  const horizontalSpeed = Number((5 + hash01(seed, 4) * 3).toFixed(4));
  const verticalVelocity = Number((12 - elapsedSeconds * 9.8).toFixed(4));
  const stateSequence: readonly PlatformerAnimationState[] = [
    "idle",
    horizontalSpeed > 6.5 ? "run" : "walk",
    "jump",
    doubleJumpAccepted ? "doubleJump" : "fall",
    wallJumpAccepted ? "wallSlide" : "fall",
    "land"
  ];
  const totalPlatforms = platformSummaries.reduce((sum, entry) => sum + entry.count, 0);
  const totalCollectibles = collectibleSummaries.reduce((sum, entry) => sum + entry.count, 0);
  const totalScoreValue = collectibleSummaries.reduce((sum, entry) => sum + entry.count * entry.scoreValue, 0);
  const startPosition = [0, 2, 0] as const;
  const goalPosition = [56, 9, 0] as const;
  const goalDistance = Number(Math.hypot(goalPosition[0] - startPosition[0], goalPosition[1] - startPosition[1], goalPosition[2] - startPosition[2]).toFixed(4));
  return {
    id: "external-parity-old-branch-platformer-controller-fixture",
    source: "origin-master-platformer-controller-adapted",
    config: {
      walkSpeed: 5,
      runSpeed: 8,
      jumpForce: 12,
      doubleJumpForce: 10,
      wallJumpForce: 14,
      airControl: 0.3,
      coyoteTimeSeconds,
      jumpBufferSeconds,
      maxFallSpeed: 30
    },
    controller: {
      grounded: false,
      coyoteJumpAccepted,
      bufferedJumpAccepted,
      doubleJumpAccepted,
      wallJumpAccepted,
      horizontalSpeed,
      verticalVelocity,
      stateSequence,
      finalState: "land"
    },
    camera: {
      distance: 8,
      minDistance: 3,
      maxDistance: 15,
      height: 2,
      followSpeed: 8,
      verticalAngle: Number((0.3 + hash01(seed, 5) * 0.1).toFixed(4)),
      collisionAdjustedDistance: Number((8 - hash01(seed, 6) * 1.5).toFixed(4)),
      shakeAmount: Number((0.18 * Math.pow(0.95, elapsedSeconds * 60)).toFixed(4)),
      lockOnSupported: true
    },
    level: {
      startPosition,
      goalPosition,
      platformSummaries,
      collectibleSummaries,
      checkpointCount: 2,
      hazardCount: 3,
      movingPlatformPathCount: 2,
      totalPlatforms,
      totalCollectibles,
      totalScoreValue,
      goalDistance
    },
    hash: hashPlatformer(seed, elapsedSeconds, horizontalSpeed, verticalVelocity, totalPlatforms, totalCollectibles, goalDistance),
    claimBoundary: "Deterministic platformer controller, third-person camera, and level-layout telemetry adapted from the old platformer example; this is not a full character controller replacement, collision solver, camera occlusion system, or Unity/Unreal controller parity claim."
  };
}

function hashPlatformer(...values: readonly number[]): string {
  let hash = 0x811c9dc5;
  for (const value of values) {
    const scaled = Math.round(value * 10_000);
    hash ^= scaled & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
    hash ^= (scaled >>> 8) & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function hash01(seed: number, salt: number): number {
  let value = Math.imul(seed + salt * 1013904223, 1664525) + 1013904223;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function finiteNonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`Platformer fixture ${label} must be finite and non-negative.`);
  return value;
}

function integer(value: number, label: string): number {
  if (!Number.isInteger(value)) throw new RangeError(`Platformer fixture ${label} must be an integer.`);
  return value;
}
