import type { Vec3 } from "./Keyframe";

export interface SecondaryAnimationFixtureOptions {
  readonly stridePhase?: number;
  readonly rootHeight?: number;
  readonly velocity?: Vec3;
  readonly terrainSlope?: number;
  readonly deltaSeconds?: number;
  readonly seed?: number;
}

export interface FootIkSample {
  readonly side: "left" | "right";
  readonly sourceFoot: Vec3;
  readonly plantedFoot: Vec3;
  readonly groundNormal: Vec3;
  readonly grounded: boolean;
  readonly verticalCorrection: number;
  readonly targetError: number;
}

export interface SpringBoneSample {
  readonly chainName: "ponytail";
  readonly boneCount: number;
  readonly stiffness: number;
  readonly damping: number;
  readonly collisionRadius: number;
  readonly substeps: number;
  readonly gravity: Vec3;
  readonly wind: Vec3;
  readonly rootPosition: Vec3;
  readonly tipPosition: Vec3;
  readonly maxDisplacement: number;
  readonly collisionContacts: number;
}

export interface SecondaryAnimationFixture {
  readonly source: "origin-master-foot-ik-spring-bone-adapted";
  readonly footIk: {
    readonly feet: readonly FootIkSample[];
    readonly hipOffset: number;
    readonly averageTargetError: number;
    readonly groundedFeet: number;
    readonly terrainSlope: number;
  };
  readonly springBone: SpringBoneSample;
  readonly productionReadiness: {
    readonly footPlacementTelemetry: boolean;
    readonly hipAdjustmentTelemetry: boolean;
    readonly springChainTelemetry: boolean;
    readonly collisionTelemetry: boolean;
    readonly deterministicReplay: boolean;
  };
  readonly hash: string;
  readonly claimBoundary: string;
  readonly blockedClaims: readonly string[];
}

export function sampleSecondaryAnimationFixture(options: SecondaryAnimationFixtureOptions = {}): SecondaryAnimationFixture {
  const stridePhase = wrap01(options.stridePhase ?? 0.35);
  const rootHeight = clamp(options.rootHeight ?? 1.08, 0.4, 2.4);
  const velocity = options.velocity ?? [0.9, 0, 0.22];
  const terrainSlope = clamp(options.terrainSlope ?? 0.18, -0.7, 0.7);
  const deltaSeconds = clamp(options.deltaSeconds ?? 1 / 60, 1 / 240, 1 / 10);
  const seed = integerSeed(options.seed ?? 0x3d2025);
  const groundNormal = normalize([-terrainSlope, 1, 0.08]);
  const left = footSample("left", stridePhase, rootHeight, terrainSlope, groundNormal, velocity, seed);
  const right = footSample("right", wrap01(stridePhase + 0.5), rootHeight, terrainSlope, groundNormal, velocity, seed + 17);
  const feet = [left, right] as const;
  const averageTargetError = round(feet.reduce((sum, foot) => sum + foot.targetError, 0) / feet.length);
  const hipOffset = round(-Math.max(...feet.map((foot) => Math.max(0, foot.verticalCorrection))) * 0.72);
  const springBone = springSample(rootHeight, velocity, deltaSeconds, seed);
  const fixture = {
    source: "origin-master-foot-ik-spring-bone-adapted" as const,
    footIk: {
      feet,
      hipOffset,
      averageTargetError,
      groundedFeet: feet.filter((foot) => foot.grounded).length,
      terrainSlope: round(terrainSlope)
    },
    springBone,
    productionReadiness: {
      footPlacementTelemetry: feet.every((foot) => foot.grounded && foot.targetError <= 0.015),
      hipAdjustmentTelemetry: hipOffset < 0,
      springChainTelemetry: springBone.boneCount >= 4 && springBone.maxDisplacement > 0,
      collisionTelemetry: springBone.collisionContacts > 0,
      deterministicReplay: true
    },
    hash: "",
    claimBoundary: "Secondary animation fixture provides the deterministic FootIkSample/SpringBoneSample telemetry shapes and oracle values; the real runtimes now live in FootIk.ts (two-bone foot IK + foot-lock on solveTwoBoneIk + a ground query) and SpringBones.ts (integrated spring chain). The fixture still does not claim retargeting, general full-body IK, cloth/hair simulation, Unity Animation Rigging parity, or Unreal Control Rig parity.",
    blockedClaims: [
      "full-body IK solver parity",
      "runtime retargeting parity",
      "Unity Animation Rigging parity",
      "Unreal Control Rig parity"
    ] as const
  };
  return {
    ...fixture,
    hash: stableHash([
      fixture.footIk.groundedFeet,
      fixture.footIk.hipOffset,
      fixture.footIk.averageTargetError,
      fixture.springBone.maxDisplacement,
      fixture.springBone.collisionContacts,
      fixture.springBone.tipPosition.join(",")
    ].join("|"))
  };
}

function footSample(side: "left" | "right", phase: number, rootHeight: number, terrainSlope: number, normal: Vec3, velocity: Vec3, seed: number): FootIkSample {
  const lateral = side === "left" ? -0.18 : 0.18;
  const stride = Math.sin(phase * Math.PI * 2) * 0.22 + velocity[0] * 0.06;
  const lift = Math.max(0, Math.sin(phase * Math.PI * 2)) * 0.08;
  const jitter = (noise(seed) - 0.5) * 0.01;
  const x = round(stride + jitter);
  const z = round(lateral + velocity[2] * 0.04);
  const sourceY = round(rootHeight - 1.05 + lift);
  const groundY = round(x * terrainSlope - Math.abs(lateral) * 0.04);
  const planted: Vec3 = [x, groundY + 0.035, z];
  const source: Vec3 = [x, sourceY, z];
  const verticalCorrection = round(sourceY - planted[1]);
  return {
    side,
    sourceFoot: source,
    plantedFoot: planted,
    groundNormal: normal,
    grounded: true,
    verticalCorrection,
    targetError: round(Math.abs(planted[1] - (groundY + 0.035)))
  };
}

function springSample(rootHeight: number, velocity: Vec3, deltaSeconds: number, seed: number): SpringBoneSample {
  const stiffness = 0.62;
  const damping = 0.38;
  const collisionRadius = 0.08;
  const substeps = Math.max(1, Math.min(4, Math.ceil(deltaSeconds / (1 / 120))));
  const rootPosition: Vec3 = [0, round(rootHeight + 0.32), -0.08];
  const wind: Vec3 = [round(velocity[0] * 0.18 + noise(seed + 9) * 0.05), 0, round(0.1 + velocity[2] * 0.08)];
  const gravity: Vec3 = [0, -9.81, 0];
  const displacement = round(Math.hypot(wind[0], wind[2]) * (1 - damping) + 0.055);
  const rawTip: Vec3 = [
    round(rootPosition[0] + wind[0] * 0.38),
    round(rootPosition[1] - 0.42 - displacement * 0.35),
    round(rootPosition[2] + wind[2] * 0.42)
  ];
  const collisionFloor = rootHeight - 0.22;
  const collisionContacts = rawTip[1] < collisionFloor + collisionRadius ? 1 : 0;
  const tipPosition: Vec3 = collisionContacts > 0 ? [rawTip[0], round(collisionFloor + collisionRadius), rawTip[2]] : rawTip;
  return {
    chainName: "ponytail",
    boneCount: 5,
    stiffness,
    damping,
    collisionRadius,
    substeps,
    gravity,
    wind,
    rootPosition,
    tipPosition,
    maxDisplacement: round(distance(rootPosition, tipPosition)),
    collisionContacts
  };
}

function wrap01(value: number): number {
  const wrapped = value - Math.floor(value);
  return Number.isFinite(wrapped) ? wrapped : 0;
}

function integerSeed(value: number): number {
  if (!Number.isInteger(value)) throw new Error("Secondary animation fixture seed must be an integer.");
  return value;
}

function normalize(value: Vec3): Vec3 {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (length <= 1e-6) return [0, 1, 0];
  return [round(value[0] / length), round(value[1] / length), round(value[2] / length)];
}

function distance(left: Vec3, right: Vec3): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function noise(seed: number): number {
  let value = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2ae35);
  return ((value ^ (value >>> 16)) >>> 0) / 0xffffffff;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
