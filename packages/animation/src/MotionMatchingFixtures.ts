import type { Vec3 } from "./Keyframe.js";

export interface MotionMatchingFixtureOptions {
  readonly currentPosition?: Vec3;
  readonly moveDirection?: Vec3;
  readonly facingDirection?: Vec3;
  readonly speed?: number;
  readonly elapsedSeconds?: number;
  readonly previousPoseId?: string;
  readonly seed?: number;
}

export interface MotionMatchingTrajectorySample {
  readonly time: number;
  readonly position: Vec3;
  readonly direction: Vec3;
}

export interface MotionMatchingPoseCandidate {
  readonly id: string;
  readonly clip: "idle" | "walk" | "run" | "strafe" | "turn" | "jump";
  readonly time: number;
  readonly tags: readonly string[];
  readonly rootVelocity: Vec3;
  readonly footLeft: Vec3;
  readonly footRight: Vec3;
  readonly trajectory: readonly MotionMatchingTrajectorySample[];
}

export interface MotionMatchingCandidateScore {
  readonly poseId: string;
  readonly clip: MotionMatchingPoseCandidate["clip"];
  readonly tags: readonly string[];
  readonly velocityCost: number;
  readonly facingCost: number;
  readonly trajectoryCost: number;
  readonly continuityCost: number;
  readonly totalCost: number;
}

export interface MotionMatchingFixtureSample {
  readonly id: "external-parity-old-branch-motion-matching-fixture";
  readonly source: "origin-master-motion-matching-system-adapted";
  readonly databasePoseCount: number;
  readonly candidateScores: readonly MotionMatchingCandidateScore[];
  readonly selectedPoseId: string;
  readonly selectedClip: MotionMatchingPoseCandidate["clip"];
  readonly selectedTags: readonly string[];
  readonly selectedTime: number;
  readonly transitioned: boolean;
  readonly blendWeight: number;
  readonly transitionDurationSeconds: number;
  readonly queryTrajectory: readonly MotionMatchingTrajectorySample[];
  readonly querySpeed: number;
  readonly queryFacingAlignment: number;
  readonly bestCost: number;
  readonly secondBestCost: number;
  readonly costMargin: number;
  readonly hash: string;
  readonly claimBoundary: string;
}

const predictionTimes = [0.2, 0.45, 0.75] as const;

export function sampleMotionMatchingFixture(options: MotionMatchingFixtureOptions = {}): MotionMatchingFixtureSample {
  const seed = options.seed ?? 0x3d2025;
  if (!Number.isInteger(seed)) throw new RangeError("Motion matching fixture seed must be an integer.");
  const currentPosition = vec3(options.currentPosition ?? [0, 0, 0], "currentPosition");
  const moveDirection = normalize(vec3(options.moveDirection ?? [1, 0, 0.18], "moveDirection"));
  const facingDirection = normalize(vec3(options.facingDirection ?? [1, 0, 0], "facingDirection"));
  const speed = clamp(finite(options.speed ?? 0.74, "speed"), 0, 1);
  const elapsedSeconds = Math.max(0, finite(options.elapsedSeconds ?? 0, "elapsedSeconds"));
  const maxSpeed = 6.2;
  const queryVelocity = scale(moveDirection, speed * maxSpeed);
  const queryTrajectory = predictionTimes.map((time) => ({
    time,
    position: roundVec3(add(currentPosition, scale(queryVelocity, time))),
    direction: roundVec3(normalize(lerpVec3(moveDirection, facingDirection, Math.min(1, time * 0.8))))
  }));
  const database = createMotionDatabase(seed);
  const previousPoseId = options.previousPoseId ?? database[0]?.id ?? "idle-0";
  const scored = database
    .map((candidate) => scoreCandidate(candidate, queryVelocity, facingDirection, queryTrajectory, previousPoseId))
    .sort((left, right) => left.totalCost - right.totalCost);
  const selected = scored[0];
  if (!selected) throw new Error("Motion matching fixture database is empty.");
  const selectedPose = database.find((candidate) => candidate.id === selected.poseId);
  if (!selectedPose) throw new Error("Motion matching fixture selected an unknown pose.");
  const secondBestCost = scored[1]?.totalCost ?? selected.totalCost;
  const transitioned = selected.poseId !== previousPoseId;
  const transitionDurationSeconds = 0.18;
  const blendWeight = transitioned ? clamp(elapsedSeconds / transitionDurationSeconds, 0, 1) : 1;
  return {
    id: "external-parity-old-branch-motion-matching-fixture",
    source: "origin-master-motion-matching-system-adapted",
    databasePoseCount: database.length,
    candidateScores: scored.slice(0, 6),
    selectedPoseId: selected.poseId,
    selectedClip: selected.clip,
    selectedTags: selected.tags,
    selectedTime: selectedPose.time,
    transitioned,
    blendWeight: Number(blendWeight.toFixed(4)),
    transitionDurationSeconds,
    queryTrajectory,
    querySpeed: Number(length(queryVelocity).toFixed(4)),
    queryFacingAlignment: Number(dot(moveDirection, facingDirection).toFixed(4)),
    bestCost: selected.totalCost,
    secondBestCost,
    costMargin: Number((secondBestCost - selected.totalCost).toFixed(5)),
    hash: hashMotionFixture(scored, queryTrajectory),
    claimBoundary: "Deterministic pose-database scoring, trajectory prediction, tag filtering, continuity cost, and transition telemetry adapted from the old motion-matching system; this is bounded runtime evidence, not a full animation database, inertialization, pose application, foot locking, or Unity/Unreal animation middleware parity."
  };
}

function createMotionDatabase(seed: number): readonly MotionMatchingPoseCandidate[] {
  const clips: readonly MotionMatchingPoseCandidate["clip"][] = ["idle", "walk", "run", "strafe", "turn", "jump"];
  return clips.flatMap((clip, clipIndex) => {
    const speed = clip === "idle" ? 0 : clip === "walk" ? 2.1 : clip === "run" ? 5.8 : clip === "strafe" ? 3.2 : clip === "turn" ? 0.9 : 3.8;
    const angle = clip === "strafe" ? Math.PI / 2 : clip === "turn" ? 0.62 : seeded01(seed + clipIndex * 41) * 0.14 - 0.07;
    const direction: Vec3 = [Math.cos(angle), 0, Math.sin(angle)];
    return [0, 1, 2].map((poseIndex) => {
      const time = Number((poseIndex * 0.18 + seeded01(seed + clipIndex * 101 + poseIndex) * 0.04).toFixed(4));
      const phase = poseIndex / 3;
      return {
        id: `${clip}-${poseIndex}`,
        clip,
        time,
        tags: clip === "idle" ? ["idle"] : clip === "jump" ? ["action", "airborne"] : ["locomotion", clip],
        rootVelocity: roundVec3(scale(direction, speed * (0.92 + phase * 0.12))),
        footLeft: roundVec3([-0.16, Math.sin(phase * Math.PI * 2) * 0.08, 0.08]),
        footRight: roundVec3([0.16, Math.sin((phase + 0.5) * Math.PI * 2) * 0.08, -0.08]),
        trajectory: predictionTimes.map((predictionTime) => ({
          time: predictionTime,
          position: roundVec3(scale(direction, speed * predictionTime)),
          direction: roundVec3(direction)
        }))
      };
    });
  });
}

function scoreCandidate(
  candidate: MotionMatchingPoseCandidate,
  queryVelocity: Vec3,
  facingDirection: Vec3,
  queryTrajectory: readonly MotionMatchingTrajectorySample[],
  previousPoseId: string
): MotionMatchingCandidateScore {
  const velocityCost = distance(candidate.rootVelocity, queryVelocity);
  const facingCost = 1 - clamp(dot(normalize(candidate.trajectory[0]?.direction ?? [1, 0, 0]), facingDirection), -1, 1);
  const trajectoryCost = queryTrajectory.reduce((sum, query, index) => {
    const candidateSample = candidate.trajectory[index] ?? candidate.trajectory[candidate.trajectory.length - 1]!;
    return sum + distance(candidateSample.position, subtract(query.position, queryTrajectory[0]?.position ?? [0, 0, 0]));
  }, 0) / Math.max(1, queryTrajectory.length);
  const continuityCost = candidate.id === previousPoseId ? 0 : candidate.clip === previousPoseId.split("-")[0] ? 0.12 : 0.34;
  const totalCost = velocityCost * 0.46 + facingCost * 1.2 + trajectoryCost * 0.38 + continuityCost;
  return {
    poseId: candidate.id,
    clip: candidate.clip,
    tags: candidate.tags,
    velocityCost: Number(velocityCost.toFixed(5)),
    facingCost: Number(facingCost.toFixed(5)),
    trajectoryCost: Number(trajectoryCost.toFixed(5)),
    continuityCost: Number(continuityCost.toFixed(5)),
    totalCost: Number(totalCost.toFixed(5))
  };
}

function hashMotionFixture(scores: readonly MotionMatchingCandidateScore[], trajectory: readonly MotionMatchingTrajectorySample[]): string {
  let hash = 0x811c9dc5;
  for (const score of scores) {
    for (const char of `${score.poseId}:${score.totalCost}:${score.velocityCost}`) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  }
  for (const sample of trajectory) {
    for (const value of [sample.time, ...sample.position, ...sample.direction]) {
      const scaled = Math.round(value * 10_000);
      hash ^= scaled & 0xff;
      hash = Math.imul(hash, 0x01000193) >>> 0;
      hash ^= (scaled >>> 8) & 0xff;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  }
  return hash.toString(16).padStart(8, "0");
}

function vec3(value: readonly number[], label: string): Vec3 {
  if (value.length !== 3 || value.some((entry) => !Number.isFinite(entry))) {
    throw new RangeError(`Motion matching fixture ${label} must contain three finite numbers.`);
  }
  return [value[0]!, value[1]!, value[2]!];
}

function roundVec3(value: Vec3): Vec3 {
  return [Number(value[0].toFixed(4)), Number(value[1].toFixed(4)), Number(value[2].toFixed(4))];
}

function add(left: Vec3, right: Vec3): Vec3 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function subtract(left: Vec3, right: Vec3): Vec3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function scale(value: Vec3, scalar: number): Vec3 {
  return [value[0] * scalar, value[1] * scalar, value[2] * scalar];
}

function lerpVec3(left: Vec3, right: Vec3, weight: number): Vec3 {
  return [
    left[0] + (right[0] - left[0]) * weight,
    left[1] + (right[1] - left[1]) * weight,
    left[2] + (right[2] - left[2]) * weight
  ];
}

function dot(left: Vec3, right: Vec3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function length(value: Vec3): number {
  return Math.hypot(value[0], value[1], value[2]);
}

function distance(left: Vec3, right: Vec3): number {
  return length(subtract(left, right));
}

function normalize(value: Vec3): Vec3 {
  const valueLength = length(value);
  if (valueLength <= 1e-6) return [1, 0, 0];
  return scale(value, 1 / valueLength);
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`Motion matching fixture ${label} must be finite.`);
  return value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function seeded01(seed: number): number {
  let value = seed >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return ((value >>> 0) % 10_000) / 10_000;
}
