import type { AuraNodeInput } from "../nodes/types.js";
import type { GameRacingRoute, GameRacingSurfaceQuery } from "../GameGenreKits.js";
import { createGameRacingSurfaceQuery } from "../GameGenreKits.js";
import { material } from "../nodes/material.js";
import { primitives } from "../nodes/primitives.js";

export interface GrandPrixRoadwayOptions {
  readonly route?: GameRacingRoute;
  readonly surfaceQuery?: GameRacingSurfaceQuery;
  readonly roadHalfWidth?: number;
  readonly roadSurfaceY?: number;
  readonly segmentCount?: number;
  readonly startProgress?: number;
  readonly centerX?: number;
  readonly centerZ?: number;
  readonly floorSize?: number;
  readonly palette?: {
    readonly desertFloor?: string;
    readonly asphalt?: string;
    readonly curbRed?: string;
    readonly curbWhite?: string;
    readonly centerDash?: string;
    readonly startLineWhite?: string;
    readonly startLineDark?: string;
  };
}

export interface ArcadeKartPlayerState {
  status: "running" | "finished";
  frame: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  speed: number;
  heading: number;
  driftYaw: number;
  driftDir: number;
  roll: number;
  progress: number;
  signedTrackOffset: number;
  lap: number;
  checkpoint: number;
  lapTime: number;
  driftCharge: number;
  wasDrifting: boolean;
  activeBoostTimer: number;
}

export interface ArcadeKartStepControls {
  readonly throttle: boolean;
  readonly brake: boolean;
  readonly steer: number;
  readonly drift: boolean;
  readonly boost: boolean;
}

export interface ArcadeKartStepResult {
  readonly state: ArcadeKartPlayerState;
  readonly miniTurboTriggered: boolean;
  readonly checkpointCleared: number | null;
  readonly lapAdvanced: number | null;
  readonly raceFinished: boolean;
}

export interface ArcadeKartRivalSpec {
  readonly id: string;
  readonly name: string;
  readonly startProgress: number;
  readonly baseLane: number;
  readonly cruiseSpeed: number;
  readonly weaveAmp: number;
  readonly weaveFreq: number;
  progress: number;
  lap: number;
  speed: number;
  spinTimer: number;
  lateralOffset: number;
  x: number;
  z: number;
  heading: number;
}

export interface ArcadeKartGameKitOptions {
  readonly route: GameRacingRoute;
  readonly surfaceQuery?: GameRacingSurfaceQuery;
  readonly startProgress?: number;
  readonly lapsToWin?: number;
  readonly roadHalfWidth?: number;
  readonly maxSpeed?: number;
  readonly boostMaxSpeed?: number;
  readonly acceleration?: number;
  readonly boostAcceleration?: number;
}

export interface ArcadeKartGameKit {
  readonly kind: "aura-arcade-kart-kit";
  readonly surfaceQuery: GameRacingSurfaceQuery;
  readonly roadHalfWidth: number;
  readonly lapsToWin: number;
  readonly state: ArcadeKartPlayerState;
  sampleOffset(progress: number, lateralOffset?: number): {
    readonly x: number;
    readonly z: number;
    readonly heading: number;
  };
  normalizeStartRelativeProgress(progress: number): number;
  reset(startProgress?: number, lateralOffset?: number): ArcadeKartPlayerState;
  triggerBoost(durationSeconds?: number, minBoostSpeed?: number): void;
  applySpinHazard(speedPenaltyMultiplier?: number, minRemainingSpeed?: number): void;
  stepPlayer(dt: number, controls: ArcadeKartStepControls): ArcadeKartStepResult;
  stepRival(dt: number, elapsedClock: number, rival: ArcadeKartRivalSpec, raceStarted?: boolean): void;
  resolveKartBump(
    other: { x: number; z: number; speed?: number },
    minDist?: number
  ): boolean;
  buildRoadwayNodes(options?: Omit<GrandPrixRoadwayOptions, "route" | "surfaceQuery">): AuraNodeInput[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export function buildGrandPrixRoadwayNodes(options: GrandPrixRoadwayOptions): AuraNodeInput[] {
  const surfaceQuery =
    options.surfaceQuery ??
    (options.route ? createGameRacingSurfaceQuery(options.route) : undefined);
  if (!surfaceQuery) {
    throw new Error("buildGrandPrixRoadwayNodes requires either options.surfaceQuery or options.route.");
  }

  const roadHalfWidth = options.roadHalfWidth ?? 7.8;
  const roadSurfaceY = options.roadSurfaceY ?? 0;
  const segmentCount = Math.max(16, options.segmentCount ?? 84);
  const startProgress = options.startProgress ?? 0.04;
  const centerX = options.centerX ?? 50;
  const centerZ = options.centerZ ?? 29;
  const floorSize = options.floorSize ?? 440;

  const sampleOffset = (progress: number, lateralOffset = 0) => {
    const norm = ((progress % 1) + 1) % 1;
    const sample = surfaceQuery.sampleAt(norm);
    const normalX = -Math.sin(sample.heading);
    const normalZ = Math.cos(sample.heading);
    return {
      x: Number((sample.x + normalX * lateralOffset).toFixed(3)),
      z: Number((sample.y + normalZ * lateralOffset).toFixed(3)),
      heading: sample.heading
    };
  };

  const desertSandMat = material.pbr({
    color: options.palette?.desertFloor ?? "#c88a58",
    roughness: 0.94,
    metallic: 0.02
  });
  const asphaltMat = material.pbr({
    color: options.palette?.asphalt ?? "#1e2430",
    roughness: 0.78,
    metallic: 0.06
  });
  const curbRedMat = material.pbr({
    color: options.palette?.curbRed ?? "#dc2626",
    roughness: 0.55,
    metallic: 0.08
  });
  const curbWhiteMat = material.pbr({
    color: options.palette?.curbWhite ?? "#f8fafc",
    roughness: 0.52,
    metallic: 0.08
  });
  const centerDashMat = material.emissive({
    color: options.palette?.centerDash ?? "#fbbf24",
    emissive: options.palette?.centerDash ?? "#f59e0b",
    emissiveIntensity: 0.45,
    roughness: 0.4
  });
  const startFinishWhiteMat = material.emissive({
    color: options.palette?.startLineWhite ?? "#ffffff",
    emissive: "#e2e8f0",
    emissiveIntensity: 0.35,
    roughness: 0.35
  });
  const startFinishDarkMat = material.pbr({
    color: options.palette?.startLineDark ?? "#0f172a",
    roughness: 0.5,
    metallic: 0.1
  });

  const nodes: AuraNodeInput[] = [
    primitives
      .box({
        name: "grand-prix-desert-canyon-floor",
        size: [floorSize, 0.4, floorSize],
        material: desertSandMat,
        receiveShadow: true
      })
      .position(centerX, roadSurfaceY - 0.28, centerZ)
  ];

  const roadWidth = roadHalfWidth * 2;
  const curbWidth = 0.85;
  const curbOffset = roadHalfWidth + curbWidth * 0.42;

  for (let i = 0; i < segmentCount; i += 1) {
    const p0 = i / segmentCount;
    const p1 = (i + 1) / segmentCount;
    const s0 = surfaceQuery.sampleAt(p0);
    const s1 = surfaceQuery.sampleAt(p1);
    const midX = (s0.x + s1.x) * 0.5;
    const midZ = (s0.y + s1.y) * 0.5;
    const dx = s1.x - s0.x;
    const dz = s1.y - s0.y;
    const segLen = Math.hypot(dx, dz);
    const angle = Math.atan2(dz, dx);
    const yaw = -angle;
    const normalX = -Math.sin(angle);
    const normalZ = Math.cos(angle);

    nodes.push(
      primitives
        .box({
          name: `gp-asphalt-segment-${i}`,
          size: [segLen + 2.1, 0.12, roadWidth],
          material: asphaltMat,
          receiveShadow: true
        })
        .position(midX, roadSurfaceY - 0.06, midZ)
        .rotate(0, yaw, 0)
    );

    const isEven = i % 2 === 0;
    nodes.push(
      primitives
        .box({
          name: `gp-curb-left-${i}`,
          size: [segLen + 0.45, 0.18, curbWidth],
          material: isEven ? curbRedMat : curbWhiteMat,
          receiveShadow: true
        })
        .position(midX + normalX * curbOffset, roadSurfaceY - 0.01, midZ + normalZ * curbOffset)
        .rotate(0, yaw, 0),
      primitives
        .box({
          name: `gp-curb-right-${i}`,
          size: [segLen + 0.45, 0.18, curbWidth],
          material: isEven ? curbWhiteMat : curbRedMat,
          receiveShadow: true
        })
        .position(midX - normalX * curbOffset, roadSurfaceY - 0.01, midZ - normalZ * curbOffset)
        .rotate(0, yaw, 0)
    );

    if (isEven) {
      nodes.push(
        primitives
          .box({
            name: `gp-center-dash-${i}`,
            size: [segLen * 0.55, 0.14, 0.28],
            material: centerDashMat
          })
          .position(midX, roadSurfaceY - 0.04, midZ)
          .rotate(0, yaw, 0)
      );
    }
  }

  const sfSample = surfaceQuery.sampleAt(startProgress);
  const sfYaw = -sfSample.heading;
  nodes.push(
    primitives
      .box({
        name: "gp-start-finish-line-base",
        size: [1.4, 0.145, roadWidth - 0.4],
        material: startFinishWhiteMat
      })
      .position(sfSample.x, roadSurfaceY - 0.035, sfSample.y)
      .rotate(0, sfYaw, 0)
  );
  for (let c = -3; c <= 3; c += 1) {
    const checkerPose = sampleOffset(startProgress, c * 2.0);
    nodes.push(
      primitives
        .box({
          name: `gp-start-finish-checker-${c + 3}`,
          size: [0.68, 0.155, 1.0],
          material: startFinishDarkMat
        })
        .position(checkerPose.x, roadSurfaceY - 0.03, checkerPose.z)
        .rotate(0, sfYaw, 0)
    );
  }

  return nodes;
}

export function createArcadeKartGameKit(options: ArcadeKartGameKitOptions): ArcadeKartGameKit {
  const surfaceQuery = options.surfaceQuery ?? createGameRacingSurfaceQuery(options.route);
  const startProgress = options.startProgress ?? 0.04;
  const lapsToWin = Math.max(1, options.lapsToWin ?? 3);
  const roadHalfWidth = options.roadHalfWidth ?? (options.route.width ?? 16) * 0.5;
  const baseTopSpeed = options.maxSpeed ?? 34.5;
  const boostTopSpeed = options.boostMaxSpeed ?? 44.5;
  const baseAccel = options.acceleration ?? 36.0;
  const boostAccel = options.boostAcceleration ?? 54.0;
  const checkpoints = options.route.checkpoints ?? [];

  const sampleOffset = (progress: number, lateralOffset = 0) => {
    const norm = ((progress % 1) + 1) % 1;
    const sample = surfaceQuery.sampleAt(norm);
    const normalX = -Math.sin(sample.heading);
    const normalZ = Math.cos(sample.heading);
    return {
      x: Number((sample.x + normalX * lateralOffset).toFixed(3)),
      z: Number((sample.y + normalZ * lateralOffset).toFixed(3)),
      heading: sample.heading
    };
  };

  const normalizeStartRelativeProgress = (progress: number): number => {
    return (((progress - startProgress) % 1) + 1) % 1;
  };

  const initialPose = sampleOffset(startProgress, 0);
  const state: ArcadeKartPlayerState = {
    status: "running",
    frame: 0,
    x: initialPose.x,
    y: 0,
    z: initialPose.z,
    vx: 0,
    vy: 0,
    vz: 0,
    speed: 0,
    heading: initialPose.heading,
    driftYaw: 0,
    driftDir: 0,
    roll: 0,
    progress: startProgress,
    signedTrackOffset: 0,
    lap: 1,
    checkpoint: 0,
    lapTime: 0,
    driftCharge: 0,
    wasDrifting: false,
    activeBoostTimer: 0
  };

  return {
    kind: "aura-arcade-kart-kit",
    surfaceQuery,
    roadHalfWidth,
    lapsToWin,
    state,
    sampleOffset,
    normalizeStartRelativeProgress,
    reset(resetProgress = startProgress, lateralOffset = 0) {
      const pose = sampleOffset(resetProgress, lateralOffset);
      state.status = "running";
      state.frame = 0;
      state.x = pose.x;
      state.y = 0;
      state.z = pose.z;
      state.vx = 0;
      state.vy = 0;
      state.vz = 0;
      state.speed = 0;
      state.heading = pose.heading;
      state.driftYaw = 0;
      state.driftDir = 0;
      state.roll = 0;
      state.progress = resetProgress;
      state.signedTrackOffset = lateralOffset;
      state.lap = 1;
      state.checkpoint = 0;
      state.lapTime = 0;
      state.driftCharge = 0;
      state.wasDrifting = false;
      state.activeBoostTimer = 0;
      return state;
    },
    triggerBoost(durationSeconds = 1.4, minBoostSpeed = 32) {
      state.activeBoostTimer = Math.max(state.activeBoostTimer, durationSeconds);
      state.speed = Math.min(boostTopSpeed, Math.max(state.speed + 9.5, minBoostSpeed));
    },
    applySpinHazard(speedPenaltyMultiplier = 0.42, minRemainingSpeed = 7.5) {
      state.speed = Math.max(minRemainingSpeed, state.speed * speedPenaltyMultiplier);
      state.driftYaw = 0.65;
    },
    stepPlayer(dt, controls) {
      let miniTurboTriggered = false;
      let checkpointCleared: number | null = null;
      let lapAdvanced: number | null = null;
      let raceFinished = false;

      if (state.status === "finished") {
        return {
          state,
          miniTurboTriggered,
          checkpointCleared,
          lapAdvanced,
          raceFinished
        };
      }

      if (state.activeBoostTimer > 0) {
        state.activeBoostTimer = Math.max(0, state.activeBoostTimer - dt);
      }

      const prevProgress = state.progress;
      state.frame += 1;

      const contactBefore = surfaceQuery.query({ x: state.x, y: state.z });
      const offAsphalt = contactBefore.trackOffset > roadHalfWidth + 0.6;
      const effectiveBoost = controls.boost || state.activeBoostTimer > 0;

      const topSpeed = effectiveBoost
        ? boostTopSpeed
        : offAsphalt
          ? baseTopSpeed * 0.78
          : baseTopSpeed;
      const accel = effectiveBoost ? boostAccel : baseAccel;
      const reverseAccel = 24.0;

      const forwardInput = (controls.throttle || state.activeBoostTimer > 0 ? 1 : 0) - (controls.brake ? 1 : 0);
      if (forwardInput > 0) {
        state.speed = Math.min(topSpeed, state.speed + accel * dt);
      } else if (forwardInput < 0) {
        state.speed = Math.max(-14, state.speed - reverseAccel * dt);
      } else {
        state.speed *= Math.exp(-2.1 * dt);
        if (Math.abs(state.speed) < 0.05) state.speed = 0;
      }

      if (effectiveBoost && state.speed < 24) {
        state.speed = Math.min(topSpeed, state.speed + 22 * dt);
      }

      if (offAsphalt && !effectiveBoost && state.speed > topSpeed) {
        state.speed *= Math.exp(-2.4 * dt);
      }

      const canDrift = controls.drift && state.speed > 7.5;
      if (canDrift) {
        if (!state.wasDrifting) {
          if (state.y <= 0.02) {
            state.vy = 3.2;
          }
          if (Math.abs(controls.steer) > 0.05) {
            state.driftDir = Math.sign(controls.steer);
          } else if (state.driftDir === 0) {
            state.driftDir = 1;
          }
        } else if (Math.abs(controls.steer) > 0.15 && state.driftDir === 0) {
          state.driftDir = Math.sign(controls.steer);
        }
        const targetDriftYaw = -controls.steer * 0.24 - state.driftDir * 0.12;
        state.driftYaw += (targetDriftYaw - state.driftYaw) * Math.min(1, dt * 10);

        const steerIntensity = Math.max(0.4, Math.abs(controls.steer));
        state.driftCharge = Math.min(100, state.driftCharge + dt * 72 * steerIntensity);
        state.wasDrifting = true;
      } else {
        if (state.wasDrifting && state.driftCharge >= 30) {
          state.activeBoostTimer = Math.max(state.activeBoostTimer, 1.35);
          state.speed = Math.min(boostTopSpeed, state.speed + 9.5);
          miniTurboTriggered = true;
        }
        state.driftCharge = Math.max(0, state.driftCharge - dt * 95);
        state.driftYaw *= Math.exp(-10 * dt);
        state.driftDir = 0;
        state.wasDrifting = false;
      }

      const steerDir = state.speed >= -0.2 ? 1 : -1;
      const speedTurnFactor = Math.min(1, Math.max(0.45, Math.abs(state.speed) / 8.0));
      const steerRate = canDrift ? 2.85 : 2.35;
      if (Math.abs(controls.steer) > 1e-3) {
        state.heading = wrapAngle(
          state.heading + controls.steer * steerRate * speedTurnFactor * steerDir * dt
        );
      } else if (state.speed > 1.5 && contactBefore.trackOffset <= roadHalfWidth + 2.0) {
        const flowTarget = sampleOffset(
          (contactBefore.progress + 0.026) % 1,
          clamp(contactBefore.signedTrackOffset * 0.6, -3.0, 3.0)
        );
        const desiredHeading = Math.atan2(flowTarget.z - state.z, flowTarget.x - state.x);
        const headingError = wrapAngle(desiredHeading - state.heading);
        state.heading = wrapAngle(
          state.heading + clamp(headingError, -0.95, 0.95) * Math.min(1, dt * 4.8)
        );
      }
      if (canDrift && state.driftDir !== 0) {
        state.heading = wrapAngle(state.heading + state.driftDir * 0.42 * dt);
      }

      const fx = Math.cos(state.heading);
      const fz = Math.sin(state.heading);
      state.vx = fx * state.speed;
      state.vz = fz * state.speed;
      state.x += state.vx * dt;
      state.z += state.vz * dt;

      if (state.y > 0 || state.vy !== 0) {
        state.vy -= 22.0 * dt;
        state.y += state.vy * dt;
        if (state.y <= 0) {
          state.y = 0;
          state.vy = 0;
        }
      }

      state.roll = -controls.steer * Math.min(1, Math.abs(state.speed) / 18) * 0.1;

      const contactAfter = surfaceQuery.query({ x: state.x, y: state.z });
      const lineSampleAfter = surfaceQuery.sampleAt(contactAfter.progress);
      const maxCanyonOffset = roadHalfWidth + 4.5;
      if (contactAfter.trackOffset > roadHalfWidth - 0.4 && Math.abs(controls.steer) <= 1e-3) {
        const roadDiff = wrapAngle(contactAfter.tangentHeading - state.heading);
        state.heading = wrapAngle(state.heading + roadDiff * Math.min(1, dt * 4.5));
      }
      if (contactAfter.trackOffset > maxCanyonOffset) {
        const dx = state.x - lineSampleAfter.x;
        const dz = state.z - lineSampleAfter.y;
        const dist = Math.hypot(dx, dz) || 1;
        state.x = lineSampleAfter.x + (dx / dist) * maxCanyonOffset;
        state.z = lineSampleAfter.y + (dz / dist) * maxCanyonOffset;
        state.speed *= 0.9;
        const roadDiff = wrapAngle(contactAfter.tangentHeading - state.heading);
        state.heading = wrapAngle(state.heading + roadDiff * Math.min(1, dt * 6.0));
      }

      state.signedTrackOffset = contactAfter.signedTrackOffset;
      state.progress = contactAfter.progress;
      state.lapTime += dt;

      if (checkpoints.length > 0) {
        const nextCheckpointIdx = state.checkpoint % checkpoints.length;
        const targetCpProgress = checkpoints[nextCheckpointIdx] ?? 0.14;
        const cpDist = Math.min(
          Math.abs(state.progress - targetCpProgress),
          1 - Math.abs(state.progress - targetCpProgress)
        );
        if (cpDist <= 0.045) {
          state.checkpoint += 1;
          checkpointCleared = nextCheckpointIdx + 1;
        }
      }

      const prevRel = normalizeStartRelativeProgress(prevProgress);
      const currRel = normalizeStartRelativeProgress(state.progress);
      const minCheckpointsForLap = Math.max(1, Math.floor(checkpoints.length * 0.65));
      if (prevRel > 0.82 && currRel < 0.18 && state.checkpoint >= state.lap * minCheckpointsForLap) {
        if (state.lap >= lapsToWin) {
          state.status = "finished";
          raceFinished = true;
        } else {
          state.lap += 1;
          state.lapTime = 0;
          lapAdvanced = state.lap;
        }
      }

      return {
        state,
        miniTurboTriggered,
        checkpointCleared,
        lapAdvanced,
        raceFinished
      };
    },
    stepRival(dt, elapsedClock, rival, raceStarted = true) {
      if (rival.spinTimer > 0) {
        rival.spinTimer = Math.max(0, rival.spinTimer - dt);
        rival.speed = Math.max(3.5, rival.speed * Math.exp(-3.2 * dt));
      } else if (raceStarted) {
        const targetSpeed = rival.cruiseSpeed + Math.sin(elapsedClock * 1.4 + rival.weaveFreq) * 1.6;
        rival.speed += (targetSpeed - rival.speed) * Math.min(1, dt * 3.0);
      } else {
        rival.speed = 0;
      }

      const prevProg = rival.progress;
      const trackLength = Math.max(120, surfaceQuery.length);
      const deltaProgress = (rival.speed * dt) / trackLength;
      rival.progress = (rival.progress + deltaProgress) % 1;

      const prevRel = normalizeStartRelativeProgress(prevProg);
      const currRel = normalizeStartRelativeProgress(rival.progress);
      if (prevRel > 0.85 && currRel < 0.15) {
        rival.lap = Math.min(lapsToWin, rival.lap + 1);
      }

      rival.lateralOffset =
        rival.baseLane + Math.sin(elapsedClock * rival.weaveFreq + rival.startProgress * 10) * rival.weaveAmp;
      const pose = sampleOffset(rival.progress, rival.lateralOffset);
      rival.x = pose.x;
      rival.z = pose.z;
      rival.heading = pose.heading;
    },
    resolveKartBump(other, minDist = 2.8) {
      const dx = state.x - other.x;
      const dz = state.z - other.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.01 && dist < minDist) {
        const nx = dx / dist;
        const nz = dz / dist;
        const overlap = minDist - dist;
        state.x += nx * overlap * 0.75;
        state.z += nz * overlap * 0.75;
        other.x -= nx * overlap * 0.25;
        other.z -= nz * overlap * 0.25;
        return true;
      }
      return false;
    },
    buildRoadwayNodes(roadOptions = {}) {
      return buildGrandPrixRoadwayNodes({
        ...roadOptions,
        route: options.route,
        surfaceQuery,
        roadHalfWidth: roadOptions.roadHalfWidth ?? roadHalfWidth,
        startProgress: roadOptions.startProgress ?? startProgress
      });
    }
  };
}

export const arcadeKart = {
  create: createArcadeKartGameKit,
  roadNodes: buildGrandPrixRoadwayNodes
} as const;
