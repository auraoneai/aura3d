export type NetworkReplicationMode = "all-clients" | "owner-only" | "all-except-owner" | "none";

export interface NetworkReplicationFixtureOptions {
  readonly seed?: number;
  readonly tickRate?: number;
  readonly latencyMs?: number;
  readonly jitterMs?: number;
  readonly interestRadius?: number;
  readonly clientPosition?: readonly [number, number, number];
}

export interface NetworkInputFrame {
  readonly sequence: number;
  readonly timestampMs: number;
  readonly forward: boolean;
  readonly right: boolean;
  readonly fire: boolean;
}

export interface NetworkEntityState {
  readonly id: string;
  readonly ownerId: string;
  readonly replicationMode: NetworkReplicationMode;
  readonly position: readonly [number, number, number];
  readonly velocity: readonly [number, number, number];
  readonly health: number;
  readonly ammo: number;
  readonly animation: string;
  readonly timestampMs: number;
  readonly lastProcessedInput: number;
}

export interface NetworkPredictionSummary {
  readonly inputCount: number;
  readonly predictedSequence: number;
  readonly acknowledgedSequence: number;
  readonly pendingInputs: number;
  readonly predictionError: number;
  readonly smoothCorrection: readonly [number, number, number];
  readonly replayedPosition: readonly [number, number, number];
  readonly reconciliationAccepted: boolean;
}

export interface NetworkDeltaSummary {
  readonly changedFields: readonly string[];
  readonly removedFields: readonly string[];
  readonly fullSnapshotBytes: number;
  readonly deltaBytes: number;
  readonly compressionRatio: number;
  readonly reconstructedMatches: boolean;
  readonly bytesSaved: number;
}

export interface NetworkInterestSummary {
  readonly playerId: string;
  readonly radius: number;
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly unchanged: readonly string[];
  readonly relevant: readonly string[];
  readonly culled: readonly string[];
  readonly gridCellCount: number;
}

export interface NetworkInterpolationSummary {
  readonly sampleTimestampMs: number;
  readonly beforeTimestampMs: number;
  readonly afterTimestampMs: number;
  readonly interpolatedPosition: readonly [number, number, number];
  readonly extrapolatedPosition: readonly [number, number, number];
}

export interface NetworkReplicationFixture {
  readonly source: "origin-master-net-prediction-replication-adapted";
  readonly claimBoundary: string;
  readonly blockedClaims: readonly string[];
  readonly tickRate: number;
  readonly latencyMs: number;
  readonly jitterMs: number;
  readonly inputFrames: readonly NetworkInputFrame[];
  readonly clientPredicted: NetworkEntityState;
  readonly serverAuthoritative: NetworkEntityState;
  readonly prediction: NetworkPredictionSummary;
  readonly delta: NetworkDeltaSummary;
  readonly interest: NetworkInterestSummary;
  readonly interpolation: NetworkInterpolationSummary;
  readonly hash: string;
}

type MutableEntityState = {
  id: string;
  ownerId: string;
  replicationMode: NetworkReplicationMode;
  position: [number, number, number];
  velocity: [number, number, number];
  health: number;
  ammo: number;
  animation: string;
  timestampMs: number;
  lastProcessedInput: number;
};

const source = "origin-master-net-prediction-replication-adapted" as const;
const blockedClaims = [
  "real socket transport",
  "authoritative production multiplayer server",
  "matchmaking/lobby service parity",
  "rollback netcode parity",
  "voice chat transport parity",
  "anti-cheat security parity",
  "Unity Netcode parity",
  "Unreal replication parity"
] as const;

export function sampleNetworkReplicationFixture(options: NetworkReplicationFixtureOptions = {}): NetworkReplicationFixture {
  const seed = integerOption(options.seed ?? 2026, "seed");
  const tickRate = positiveNumber(options.tickRate ?? 60, "tickRate");
  const latencyMs = nonNegativeNumber(options.latencyMs ?? 64, "latencyMs");
  const jitterMs = nonNegativeNumber(options.jitterMs ?? 11, "jitterMs");
  const interestRadius = positiveNumber(options.interestRadius ?? 18, "interestRadius");
  const clientPosition = vec3Option(options.clientPosition ?? [0, 0, 0], "clientPosition");
  const inputFrames = buildInputFrames(seed, tickRate, latencyMs, jitterMs);
  const initial = entityState({
    id: "net-player",
    ownerId: "player-a",
    replicationMode: "all-clients",
    position: [0, 0, 0],
    velocity: [0, 0, 0],
    health: 100,
    ammo: 30,
    animation: "idle",
    timestampMs: 1_000,
    lastProcessedInput: 99
  });
  const clientPredicted = inputFrames.reduce((state, input) => applyInput(state, input, 1 / tickRate), initial);
  const acknowledgedSequence = inputFrames[2]?.sequence ?? inputFrames[0]?.sequence ?? 100;
  const serverAuthoritative = entityState({
    ...clientPredicted,
    position: [
      round3(clientPredicted.position[0] - 0.18),
      round3(clientPredicted.position[1]),
      round3(clientPredicted.position[2] + 0.14)
    ],
    velocity: [round3(clientPredicted.velocity[0] * 0.88), 0, round3(clientPredicted.velocity[2] * 0.9)],
    health: 92,
    ammo: 29,
    timestampMs: clientPredicted.timestampMs - latencyMs,
    lastProcessedInput: acknowledgedSequence
  });
  const pending = inputFrames.filter((input) => input.sequence > acknowledgedSequence);
  const error = vectorDelta(serverAuthoritative.position, clientPredicted.position);
  const smoothCorrection: [number, number, number] = [round3(error[0] * 0.18), round3(error[1] * 0.18), round3(error[2] * 0.18)];
  const replayed = pending.reduce((state, input) => applyInput(state, input, 1 / tickRate), serverAuthoritative);
  const baseSnapshot = stateMap(initial);
  const currentSnapshot = stateMap(serverAuthoritative);
  const delta = createDeltaSummary(baseSnapshot, currentSnapshot);
  const interest = createInterestSummary(clientPosition, interestRadius);
  const interpolation = createInterpolationSummary();
  const prediction: NetworkPredictionSummary = {
    inputCount: inputFrames.length,
    predictedSequence: clientPredicted.lastProcessedInput,
    acknowledgedSequence,
    pendingInputs: pending.length,
    predictionError: round3(vectorLength(error)),
    smoothCorrection,
    replayedPosition: replayed.position,
    reconciliationAccepted: delta.reconstructedMatches && pending.length > 0 && vectorLength(error) > 0
  };
  const hash = stableHash([
    source,
    tickRate,
    latencyMs,
    jitterMs,
    prediction.predictionError,
    prediction.pendingInputs,
    delta.changedFields.join(","),
    interest.relevant.join(","),
    interpolation.interpolatedPosition.join(",")
  ].join("|"));
  return {
    source,
    claimBoundary: "This fixture adapts old local networking algorithms into deterministic runtime telemetry only; it does not open sockets, run a server, synchronize browsers, or claim production multiplayer.",
    blockedClaims,
    tickRate,
    latencyMs,
    jitterMs,
    inputFrames,
    clientPredicted,
    serverAuthoritative,
    prediction,
    delta,
    interest,
    interpolation,
    hash
  };
}

function buildInputFrames(seed: number, tickRate: number, latencyMs: number, jitterMs: number): NetworkInputFrame[] {
  const start = 2_000 + (seed % 29) + Math.round(latencyMs * 0.25);
  const step = Math.round(1_000 / tickRate);
  return Array.from({ length: 6 }, (_, index) => ({
    sequence: 100 + index,
    timestampMs: start + index * step + Math.round(Math.sin(seed + index) * jitterMs),
    forward: index !== 4,
    right: index >= 1 && index <= 3,
    fire: index === 2
  }));
}

function applyInput(state: NetworkEntityState, input: NetworkInputFrame, deltaSeconds: number): NetworkEntityState {
  const speed = input.fire ? 4.4 : 5.2;
  const vx = input.right ? speed : round3(state.velocity[0] * 0.55);
  const vz = input.forward ? -speed : round3(state.velocity[2] * 0.45);
  return entityState({
    ...state,
    position: [
      round3(state.position[0] + vx * deltaSeconds),
      round3(state.position[1]),
      round3(state.position[2] + vz * deltaSeconds)
    ],
    velocity: [round3(vx), 0, round3(vz)],
    ammo: input.fire ? Math.max(0, state.ammo - 1) : state.ammo,
    animation: input.forward || input.right ? "run" : "idle",
    timestampMs: input.timestampMs,
    lastProcessedInput: input.sequence
  });
}

function createDeltaSummary(base: ReadonlyMap<string, unknown>, current: ReadonlyMap<string, unknown>): NetworkDeltaSummary {
  const changedFields: string[] = [];
  const removedFields: string[] = [];
  const reconstructed = new Map(base);
  for (const [key, value] of current) {
    if (!valuesEqual(base.get(key), value)) {
      changedFields.push(key);
      reconstructed.set(key, value);
    }
  }
  for (const key of base.keys()) {
    if (!current.has(key)) {
      removedFields.push(key);
      reconstructed.delete(key);
    }
  }
  const fullSnapshotBytes = estimateSnapshotBytes(current);
  const deltaBytes = 18 + changedFields.reduce((sum, key) => sum + key.length + estimateValueBytes(current.get(key)), 0) + removedFields.reduce((sum, key) => sum + key.length + 1, 0);
  return {
    changedFields: changedFields.sort(),
    removedFields: removedFields.sort(),
    fullSnapshotBytes,
    deltaBytes,
    compressionRatio: round3(deltaBytes / fullSnapshotBytes),
    reconstructedMatches: mapsEqual(reconstructed, current),
    bytesSaved: fullSnapshotBytes - deltaBytes
  };
}

function createInterestSummary(clientPosition: readonly [number, number, number], radius: number): NetworkInterestSummary {
  const previous = new Set(["net-player", "net-distant-prop"]);
  const entities: readonly NetworkEntityState[] = [
    entityState({ id: "net-player", ownerId: "player-a", replicationMode: "all-clients", position: [1, 0, -2], velocity: [0, 0, 0], health: 92, ammo: 29, animation: "run", timestampMs: 2_096, lastProcessedInput: 105 }),
    entityState({ id: "net-enemy-alpha", ownerId: "server", replicationMode: "all-clients", position: [8, 0, -6], velocity: [0, 0, 0], health: 60, ammo: 0, animation: "alert", timestampMs: 2_096, lastProcessedInput: -1 }),
    entityState({ id: "net-loot-health", ownerId: "server", replicationMode: "all-clients", position: [-5, 0, 3], velocity: [0, 0, 0], health: 1, ammo: 0, animation: "idle", timestampMs: 2_096, lastProcessedInput: -1 }),
    entityState({ id: "net-owner-secret", ownerId: "player-b", replicationMode: "owner-only", position: [2, 0, 1], velocity: [0, 0, 0], health: 100, ammo: 0, animation: "idle", timestampMs: 2_096, lastProcessedInput: -1 }),
    entityState({ id: "net-distant-prop", ownerId: "server", replicationMode: "all-clients", position: [48, 0, 2], velocity: [0, 0, 0], health: 1, ammo: 0, animation: "idle", timestampMs: 2_096, lastProcessedInput: -1 })
  ];
  const relevant = entities
    .filter((entity) => shouldReplicate(entity, "player-a") && vectorLength(vectorDelta(entity.position, clientPosition)) <= radius)
    .map((entity) => entity.id)
    .sort();
  const next = new Set(relevant);
  const added = relevant.filter((id) => !previous.has(id));
  const removed = [...previous].filter((id) => !next.has(id)).sort();
  const unchanged = relevant.filter((id) => previous.has(id));
  const culled = entities.map((entity) => entity.id).filter((id) => !next.has(id)).sort();
  const gridCells = new Set(entities.map((entity) => `${Math.floor(entity.position[0] / 16)}:${Math.floor(entity.position[2] / 16)}`));
  return {
    playerId: "player-a",
    radius,
    added,
    removed,
    unchanged,
    relevant,
    culled,
    gridCellCount: gridCells.size
  };
}

function createInterpolationSummary(): NetworkInterpolationSummary {
  const before = entityState({
    id: "net-enemy-alpha",
    ownerId: "server",
    replicationMode: "all-clients",
    position: [4, 0, -3],
    velocity: [1.6, 0, -0.8],
    health: 60,
    ammo: 0,
    animation: "run",
    timestampMs: 1_000,
    lastProcessedInput: -1
  });
  const after = entityState({
    id: before.id,
    ownerId: before.ownerId,
    replicationMode: before.replicationMode,
    position: [5, 0, -3.5],
    velocity: [before.velocity[0], before.velocity[1], before.velocity[2]],
    health: before.health,
    ammo: before.ammo,
    animation: before.animation,
    timestampMs: 1_050,
    lastProcessedInput: before.lastProcessedInput
  });
  const sampleTimestampMs = 1_025;
  const t = (sampleTimestampMs - before.timestampMs) / (after.timestampMs - before.timestampMs);
  const interpolatedPosition: [number, number, number] = [
    round3(before.position[0] + (after.position[0] - before.position[0]) * t),
    round3(before.position[1] + (after.position[1] - before.position[1]) * t),
    round3(before.position[2] + (after.position[2] - before.position[2]) * t)
  ];
  const extrapolatedPosition: [number, number, number] = [
    round3(after.position[0] + after.velocity[0] * 0.1),
    round3(after.position[1] + after.velocity[1] * 0.1),
    round3(after.position[2] + after.velocity[2] * 0.1)
  ];
  return {
    sampleTimestampMs,
    beforeTimestampMs: before.timestampMs,
    afterTimestampMs: after.timestampMs,
    interpolatedPosition,
    extrapolatedPosition
  };
}

function stateMap(state: NetworkEntityState): ReadonlyMap<string, unknown> {
  return new Map<string, unknown>([
    ["x", state.position[0]],
    ["y", state.position[1]],
    ["z", state.position[2]],
    ["vx", state.velocity[0]],
    ["vz", state.velocity[2]],
    ["health", state.health],
    ["ammo", state.ammo],
    ["animation", state.animation],
    ["lastProcessedInput", state.lastProcessedInput]
  ]);
}

function entityState(state: MutableEntityState): NetworkEntityState {
  return {
    id: state.id,
    ownerId: state.ownerId,
    replicationMode: state.replicationMode,
    position: [round3(state.position[0]), round3(state.position[1]), round3(state.position[2])],
    velocity: [round3(state.velocity[0]), round3(state.velocity[1]), round3(state.velocity[2])],
    health: Math.max(0, Math.round(state.health)),
    ammo: Math.max(0, Math.round(state.ammo)),
    animation: state.animation,
    timestampMs: Math.round(state.timestampMs),
    lastProcessedInput: Math.round(state.lastProcessedInput)
  };
}

function shouldReplicate(entity: NetworkEntityState, playerId: string): boolean {
  if (entity.replicationMode === "none") return false;
  if (entity.replicationMode === "owner-only") return entity.ownerId === playerId;
  if (entity.replicationMode === "all-except-owner") return entity.ownerId !== playerId;
  return true;
}

function vectorDelta(left: readonly [number, number, number], right: readonly [number, number, number]): [number, number, number] {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function vectorLength(value: readonly [number, number, number]): number {
  return Math.hypot(value[0], value[1], value[2]);
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (typeof left === "number" && typeof right === "number") return Math.abs(left - right) < 0.0001;
  return left === right;
}

function mapsEqual(left: ReadonlyMap<string, unknown>, right: ReadonlyMap<string, unknown>): boolean {
  if (left.size !== right.size) return false;
  for (const [key, value] of left) {
    if (!valuesEqual(value, right.get(key))) return false;
  }
  return true;
}

function estimateSnapshotBytes(snapshot: ReadonlyMap<string, unknown>): number {
  let bytes = 16;
  for (const [key, value] of snapshot) {
    bytes += key.length + estimateValueBytes(value);
  }
  return bytes;
}

function estimateValueBytes(value: unknown): number {
  if (typeof value === "number") return 9;
  if (typeof value === "string") return 3 + value.length;
  if (typeof value === "boolean") return 2;
  return 1;
}

function vec3Option(value: readonly [number, number, number], name: string): [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3 || value.some((entry) => typeof entry !== "number" || !Number.isFinite(entry))) {
    throw new RangeError(`${name} must be a finite vec3.`);
  }
  return [value[0], value[1], value[2]];
}

function integerOption(value: number, name: string): number {
  if (!Number.isInteger(value)) throw new RangeError(`${name} must be an integer.`);
  return value;
}

function positiveNumber(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be positive.`);
  return value;
}

function nonNegativeNumber(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be non-negative.`);
  return value;
}

function round3(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
