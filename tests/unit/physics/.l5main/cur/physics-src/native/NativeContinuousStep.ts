import type { Collider } from "../Collider.js";
import { Constraint } from "../Constraint.js";
import { RigidBody, type Quat } from "../RigidBody.js";
import { Shape, rotateVec3ByQuat, validateFiniteVec3, type PlaneShape, type Vec3 } from "../Shape.js";
import { nativeInertia, nativeInverseInertia, nativeLocalCenterOfMass } from "./NativeMassProperties.js";
import { nativeCastPair, type NativeCCDInterval, type NativeCCDResult } from "./NativeCCD.js";
import { nativeCastAcceleratedPair, type NativeAcceleratedCCDInterval } from "./NativeAcceleratedCCD.js";

type V = [number, number, number];
const add = (a: Vec3, b: Vec3): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: Vec3, n: number): V => [a[0] * n, a[1] * n, a[2] * n];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const magnitude = (v: Vec3): number => Math.hypot(...v);
const isArray = (value: unknown): boolean => Array.isArray(value);
const EPS = 256 * Number.EPSILON;
export const NATIVE_CONTINUOUS_DEFAULT_MAX_IMPACTS = 256;
export const NATIVE_CONTINUOUS_MAX_IMPACTS = 4096;

/** The caller supplies all permitted collider pairs and their effective material coefficients. */
export interface NativeContinuousPair {
  readonly first: Collider;
  readonly second: Collider;
  readonly restitution: number;
  readonly friction: number;
}
export type NativeContinuousSensorPair = readonly [number, number];
export interface NativeContinuousStepInput {
  readonly bodies: readonly RigidBody[];
  readonly pairs: readonly NativeContinuousPair[];
  /** Complete collider inventory for supplied bodies; required if any body spins. */
  readonly colliders?: readonly Collider[];
  readonly duration: number;
  /** Uniform acceleration on dynamic bodies, in addition to pending force / mass. */
  readonly acceleration: Vec3;
  /** Disabled constraints and certified zero-response ball/socket or spring joints are supported. */
  readonly constraints: readonly unknown[];
  /** Pairs already active immediately before this interval. */
  readonly activeSensors?: readonly NativeContinuousSensorPair[];
  /** Prior contact witnesses, including solid pairs, for begin/end continuity. */
  readonly activeContacts?: readonly NativeContinuousContact[];
  readonly maxImpacts?: number;
}
export interface NativeContinuousContact {
  /** Collider ids in increasing order; the normal points from first to second. */
  readonly pair: NativeContinuousSensorPair;
  readonly sensor: boolean;
  readonly normal: Vec3;
  readonly point: Vec3;
  /** Exact prior solver state for continuing an analytically supported plane contact. */
  readonly supportState?: NativeContinuousSupportState;
}
export interface NativeContinuousSupportState {
  readonly sphereBodyId: number;
  readonly planeBodyId: number;
  readonly spherePosition: Vec3;
  readonly sphereRotation: Quat;
  readonly sphereVelocity: Vec3;
  readonly sphereAngularVelocity: Vec3;
  readonly planePosition: Vec3;
  readonly planeRotation: Quat;
  readonly normal: Vec3;
  readonly constant: number;
  readonly radius: number;
}
export interface NativeContinuousContactTransition extends NativeContinuousContact {
  readonly type: "begin" | "end" | "persist";
  readonly time: number;
  readonly fraction: number;
}
export interface NativeContinuousSensorEvent {
  readonly type: "enter" | "exit";
  readonly time: number;
  readonly fraction: number;
  readonly pair: NativeContinuousSensorPair;
  readonly normal: Vec3;
  readonly point: Vec3;
}
export interface NativeContinuousImpact {
  readonly time: number;
  readonly fraction: number;
  readonly pair: NativeContinuousSensorPair;
  readonly normal: Vec3;
  readonly point: Vec3;
  readonly impulse: number;
}
export interface NativeContinuousStepResult {
  readonly bodies: readonly { readonly id: number; readonly position: Vec3; readonly rotation: Quat; readonly velocity: Vec3; readonly angularVelocity: Vec3; readonly sleeping: boolean }[];
  readonly impacts: readonly NativeContinuousImpact[];
  readonly sensorEvents: readonly NativeContinuousSensorEvent[];
  readonly activeSensors: readonly NativeContinuousSensorPair[];
  readonly contactTransitions: readonly NativeContinuousContactTransition[];
  readonly activeContacts: readonly NativeContinuousContact[];
  /** Translational trajectory path and event-batch count, not a solver-parity claim. */
  readonly diagnostics: {
    readonly trajectory: "constant-acceleration" | "independent-damping" | "shared-damping-clock";
    readonly impactBatches: number;
    readonly maxImpacts: number;
  };
}
type BodyState = {
  readonly original: RigidBody;
  readonly body: RigidBody;
  readonly localCenter: Vec3;
  readonly awakeAcceleration: Vec3;
  readonly awakeAngularAcceleration: Vec3;
  baseAcceleration: Vec3;
  acceleration: Vec3;
  support: PlaneSupport | undefined;
};
type PairState = { readonly first: Collider; readonly second: Collider; readonly a: BodyState; readonly b: BodyState; readonly restitution: number; readonly friction: number; readonly sensor: boolean; readonly key: string; readonly ids: NativeContinuousSensorPair };
type PlaneSupport = { readonly pair: PairState; readonly sphere: BodyState; readonly plane: BodyState; readonly normal: Vec3; readonly constant: number; readonly radius: number };
type Cast = { readonly pair: PairState; readonly result: NativeCCDResult };
type Row = { readonly pair: PairState; readonly normal: Vec3; readonly point: Vec3; readonly approach: number };

/**
 * Compute a fixed-orientation linear step without mutating the caller's bodies.
 * Only prefiltered central impulses, supported analytic acceleration pairs,
 * rotation-invariant centered spheres with principal-axis spin/torque, and
 * zero-response ball/socket or spring joints are supported. Unpaired bodies
 * admit exact exponential damping; interacting bodies admit a common linear
 * damping rate when their external acceleration and angular motion are zero.
 * Sleepers remain frozen until connected to an awake body or struck. A centered sphere can sustain
 * one frictionless static-plane support under constant acceleration. Positive friction is allowed
 * when its tangential impulse is zero; other impacts throw. The caller supplies
 * effective coefficients, a complete collider inventory for spins, and applies
 * the returned states.
 * Simultaneous impacts are solved as a deterministic complementarity problem.
 */
export function nativeContinuousStep(input: NativeContinuousStepInput): NativeContinuousStepResult {
  if (!Number.isFinite(input.duration) || input.duration <= 0) throw new Error("Native continuous step duration must be finite and positive.");
  if (!isArray(input.bodies) || !isArray(input.pairs) || (input.colliders !== undefined && !isArray(input.colliders)) || (input.activeSensors !== undefined && !isArray(input.activeSensors)) || (input.activeContacts !== undefined && !isArray(input.activeContacts))) {
    throw new Error("Native continuous bodies, pairs, colliders, active sensors, and active contacts must be arrays.");
  }
  validateFiniteVec3(input.acceleration, "native continuous acceleration");
  if (!Array.isArray(input.constraints)) throw new Error("Native continuous constraints must be an array.");
  const maxImpacts = input.maxImpacts ?? NATIVE_CONTINUOUS_DEFAULT_MAX_IMPACTS;
  if (!Number.isInteger(maxImpacts) || maxImpacts < 1 || maxImpacts > NATIVE_CONTINUOUS_MAX_IMPACTS) throw new Error(`Native continuous maxImpacts must be an integer from 1 to ${NATIVE_CONTINUOUS_MAX_IMPACTS}.`);
  const states = new Map<number, BodyState>();
  for (const original of input.bodies) {
    if (states.has(original.id)) throw new Error("Native continuous bodies must have unique ids.");
    validateFiniteVec3(original.position, "native continuous body position");
    validateFiniteVec3(original.velocity, "native continuous body velocity");
    validateFiniteVec3(original.angularVelocity, "native continuous angular velocity");
    if (original.angularVelocity.some((value) => value !== 0) && original.type !== "dynamic") throw new Error("Native continuous step does not support static or kinematic angular motion.");
    const force = original.pendingForce(), torque = original.pendingTorque();
    validateFiniteVec3(force, "native continuous pending force");
    validateFiniteVec3(torque, "native continuous pending torque");
    if (![original.linearDamping, original.angularDamping].every((value) => Number.isFinite(value) && value >= 0)) throw new Error("Native continuous damping must be finite and non-negative.");
    if (original.sleeping && (original.velocity.some((value) => value !== 0) || original.angularVelocity.some((value) => value !== 0))) {
      throw new Error("Native continuous sleeping bodies require zero linear and angular velocity.");
    }
    if (original.type === "static" && original.velocity.some((value) => value !== 0)) throw new Error("Native continuous static bodies must have zero velocity.");
    if (original.type === "dynamic" ? !Number.isFinite(original.inverseMass) || original.inverseMass <= 0 || Math.abs(original.inverseMass * original.mass - 1) > EPS : original.inverseMass !== 0) {
      throw new Error("Native continuous step requires consistent body inverse masses.");
    }
    const localCenter = nativeLocalCenterOfMass(original);
    validateFiniteVec3(localCenter, "native continuous center of mass");
    const body = new RigidBody(original.id, { type: original.type, position: original.position, rotation: original.rotation, velocity: original.velocity, angularVelocity: original.angularVelocity, sleeping: original.sleeping, ...(original.type === "dynamic" ? { mass: original.mass } : {}) });
    const awakeAcceleration: Vec3 = original.type === "dynamic" ? add(input.acceleration, mul(force, original.inverseMass)) : [0, 0, 0];
    const awakeAngularAcceleration: Vec3 = original.type === "dynamic" ? nativeInverseInertia(original, torque) : [0, 0, 0];
    validateFiniteVec3(awakeAcceleration, "native continuous body acceleration");
    validateFiniteVec3(awakeAngularAcceleration, "native continuous body angular acceleration");
    const acceleration = original.sleeping ? [0, 0, 0] as V : awakeAcceleration;
    states.set(original.id, { original, body, localCenter, awakeAcceleration, awakeAngularAcceleration, baseAcceleration: acceleration, acceleration, support: undefined });
  }
  const spinning = [...states.values()].filter((state) => state.body.angularVelocity.some((value) => value !== 0) || state.original.pendingTorque().some((value) => value !== 0));
  if (spinning.length && !input.colliders) throw new Error("Native continuous spin requires a complete collider inventory.");
  const inventory = new Map<number, Collider>();
  for (const collider of input.colliders ?? []) {
    if (inventory.has(collider.id) || !states.has(collider.bodyId)) throw new Error("Native continuous collider inventory must have unique ids and supplied owners.");
    Shape.validate(collider.shape);
    inventory.set(collider.id, collider);
  }
  for (const state of spinning) {
    const owned = [...inventory.values()].filter((collider) => collider.bodyId === state.body.id);
    if (owned.length === 0 || owned.some((collider) => collider.shape.kind !== "sphere")) throw new Error("Native continuous spin supports only bodies with centered sphere colliders.");
    if (state.localCenter.some((value) => value !== 0)) throw new Error("Native continuous spin requires a centered center of mass.");
    const rotationLength = Math.hypot(...state.original.rotation);
    if (!Number.isFinite(rotationLength) || Math.abs(rotationLength - 1) > 1e-6) throw new Error("Native continuous spin requires a unit rotation.");
    const omega = state.body.angularVelocity, angularAcceleration = state.awakeAngularAcceleration;
    requirePrincipalDirection(state.original, omega, "spin");
    if (state.original.pendingTorque().some((value) => value !== 0)) {
      if (magnitude(angularAcceleration) === 0) throw new Error("Native continuous pending torque requires responsive principal inertia.");
      requirePrincipalDirection(state.original, angularAcceleration, "torque");
      if (!parallel(omega, angularAcceleration) || !parallel(state.original.pendingTorque(), angularAcceleration)) {
        throw new Error("Native continuous pending torque must follow the principal spin axis.");
      }
    }
  }
  const pairs: PairState[] = [], usedPairs = new Set<string>(), colliders = new Map<number, Collider>();
  for (const descriptor of input.pairs) {
    const first = descriptor.first.id < descriptor.second.id ? descriptor.first : descriptor.second;
    const second = first === descriptor.first ? descriptor.second : descriptor.first;
    const a = states.get(first.bodyId), b = states.get(second.bodyId), key = `${first.id}:${second.id}`;
    if (!a || !b || a === b || first.id === second.id) throw new Error("Native continuous pairs require distinct colliders on supplied bodies.");
    if (usedPairs.has(key)) throw new Error("Native continuous pairs must be unique.");
    for (const collider of [first, second]) {
      const existing = colliders.get(collider.id);
      if (existing && existing !== collider) throw new Error("Native continuous collider ids must be unique.");
      if (input.colliders && inventory.get(collider.id) !== collider) throw new Error("Native continuous collider inventory must contain every paired collider.");
      colliders.set(collider.id, collider);
    }
    if (!first.canCollideWith(second)) throw new Error("Native continuous pairs must pass collider filters.");
    const sensor = first.sensor || second.sensor;
    if (!Number.isFinite(descriptor.restitution) || descriptor.restitution < 0 || descriptor.restitution > 1) throw new Error("Native continuous restitution must be between zero and one.");
    if (!Number.isFinite(descriptor.friction) || descriptor.friction < 0) throw new Error("Native continuous friction must be finite and non-negative.");
    usedPairs.add(key);
    pairs.push({ first, second, a, b, restitution: descriptor.restitution, friction: descriptor.friction, sensor, key, ids: [first.id, second.id] });
  }
  pairs.sort((a, b) => a.first.id - b.first.id || a.second.id - b.second.id);
  const constrained = certifyPassiveConstraints(input.constraints, states);
  const pairMap = new Map(pairs.map((pair) => [pair.key, pair]));
  const active = new Map<string, NativeContinuousContact | undefined>();
  for (const contact of input.activeContacts ?? []) {
    if (!contact.pair || contact.pair.length !== 2 || contact.pair[0] >= contact.pair[1]) throw new Error("Native continuous active contacts require increasing collider ids.");
    const key = `${contact.pair[0]}:${contact.pair[1]}`, pair = pairMap.get(key);
    if (!pair || pair.sensor !== contact.sensor || active.has(key)) throw new Error("Native continuous active contacts must be unique supplied pairs with matching sensor state.");
    validateFiniteVec3(contact.normal, "native continuous prior contact normal");
    validateFiniteVec3(contact.point, "native continuous prior contact point");
    const length = magnitude(contact.normal);
    if (Math.abs(length - 1) > 1e-6) throw new Error("Native continuous prior contact normal must be unit length.");
    if (contact.supportState) validateSupportState(contact.supportState);
    active.set(key, { pair: pair.ids, sensor: pair.sensor, normal: [...contact.normal] as V, point: [...contact.point] as V, ...(contact.supportState ? { supportState: contact.supportState } : {}) });
  }
  const sensorIds = new Set<string>();
  for (const ids of input.activeSensors ?? []) {
    if (ids.length !== 2 || ids[0] === ids[1]) throw new Error("Native continuous active sensor pair must contain distinct collider ids.");
    const key = ids[0] < ids[1] ? `${ids[0]}:${ids[1]}` : `${ids[1]}:${ids[0]}`;
    if (!pairMap.get(key)?.sensor || sensorIds.has(key)) throw new Error("Native continuous active sensor pairs must be unique supplied sensor pairs.");
    sensorIds.add(key);
    if (!active.has(key)) active.set(key, undefined);
  }
  if ([...states.values()].some((state) => state.original.type === "dynamic" && state.original.linearDamping !== 0)) {
    if (pairs.length === 0) return stepDampedIndependent(states, input.duration, maxImpacts);
    return stepDampedInteractions(input, states, constrained);
  }
  const events: NativeContinuousSensorEvent[] = [], transitions: NativeContinuousContactTransition[] = [], impacts: NativeContinuousImpact[] = [];
  const emit = (pair: PairState, type: "begin" | "end" | "persist", time: number, normal: Vec3, point: Vec3) => {
    validateFiniteVec3(normal, "native continuous contact normal");
    validateFiniteVec3(point, "native continuous contact point");
    if (Math.abs(magnitude(normal) - 1) > 1e-6) throw new Error("Native continuous contact normal must be unit length.");
    const contact: NativeContinuousContact = { pair: pair.ids, sensor: pair.sensor, normal: [...normal] as V, point: [...point] as V };
    transitions.push({ ...contact, type, time, fraction: time / input.duration });
    if (pair.sensor && type !== "persist") events.push({ type: type === "begin" ? "enter" : "exit", time, fraction: time / input.duration, pair: pair.ids, normal: contact.normal, point: contact.point });
    if (type === "end") active.delete(pair.key); else active.set(pair.key, contact);
  };
  let elapsed = 0, solvedImpacts = 0;
  let lastImpactPairs = new Map<string, number>(), lastImpactedBodies = new Set<BodyState>();
  let initial = true;
  while (true) {
    recomputeSupports(states, pairs, lastImpactPairs, lastImpactedBodies, initial ? active : undefined);
    // A physical dynamic contact joins sleeping islands; sensors and static
    // supports do not. Repeat at most once per sleeping body as waking can
    // change acceleration and reveal another touching connection.
    for (let count = 0; count < states.size && wakeTouching(pairs, constrained); count++) {
      recomputeSupports(states, pairs, lastImpactPairs, lastImpactedBodies, initial ? active : undefined);
    }
    checkPassiveConstraintMotion(input.constraints, states);
    initial = false;
    lastImpactPairs = new Map();
    lastImpactedBodies = new Set();
    const remaining = input.duration - elapsed;
    const casts = pairs.map((pair) => cast(pair, remaining));
    let earliest = Infinity;
    for (const item of casts) if (!item.pair.sensor && item.result.kind === "contact") {
      for (const interval of item.result.intervals) {
        if (interval.fraction === 0 && interval.initial === "penetrating") throw new Error("Native continuous step does not support initially penetrating solid contacts.");
        if (interval.motion === "entering") {
          const speed = normalSpeedAt(item.pair, interval.normal, interval.point, remaining * interval.fraction);
          if (speed >= 0) {
            if (interval.fraction === 0 && speed === 0 && dot(sub(item.pair.b.acceleration, item.pair.a.acceleration), interval.normal) < 0) {
              throw new Error("Native continuous step does not support sustained contact forces under acceleration.");
            }
            throw new Error("Native continuous step received an inconsistent entering contact normal.");
          }
          earliest = Math.min(earliest, interval.fraction);
        }
      }
    }
    const hasImpact = earliest !== Infinity;
    const stop = hasImpact ? Math.max(0, Math.min(1, earliest)) : 1;
    processContacts(casts, active, emit, elapsed, remaining, stop, !hasImpact);
    const travel = remaining * stop;
    for (const state of states.values()) {
      state.body.position = add(add(state.body.position, mul(state.body.velocity, travel)), accelerationDrift(state.acceleration, travel));
      state.body.velocity = add(state.body.velocity, mul(state.acceleration, travel));
      if (state.support) correctSupportedState(state.support, travel);
      const angular = dampedMotion(state.body.angularVelocity, state.body.sleeping ? [0, 0, 0] : state.awakeAngularAcceleration, state.original.angularDamping, travel);
      state.body.rotation = advanceRotation(state.body.rotation, angular.displacement, 1);
      state.body.angularVelocity = angular.velocity;
      validateFiniteVec3(state.body.position, "native continuous advanced position");
      validateFiniteVec3(state.body.velocity, "native continuous advanced velocity");
    }
    const nextElapsed = elapsed + travel;
    if (travel > 0 && nextElapsed === elapsed) throw new Error("Native continuous step cannot resolve the next event at this time precision.");
    if (hasImpact && stop < 1 && nextElapsed >= input.duration) throw new Error("Native continuous step cannot resolve the remaining interval at this time precision.");
    elapsed = Math.min(input.duration, nextElapsed);
    if (!hasImpact) {
      settleContactBoundary(pairs, active, emit, input.duration);
      break;
    }
    if (++solvedImpacts > maxImpacts) throw new Error("Native continuous step exceeded its impact limit.");
    const rows: Row[] = [];
    for (const item of casts) {
      if (item.pair.sensor || item.result.kind !== "contact") continue;
      const eligible = item.result.intervals.some((interval) => interval.fraction <= stop && (interval.exitFraction === undefined || interval.exitFraction >= stop));
      if (!eligible) continue;
      const entry = item.result.intervals.find((interval) => interval.fraction === stop && interval.motion === "entering" && "entryBounds" in interval) as NativeAcceleratedCCDInterval | undefined;
      let witness = entry ? certifiedPlaneImpact(item.pair, entry) : undefined;
      if (!witness) {
        const probe = cast(item.pair, Math.max(input.duration - elapsed, input.duration));
        if (probe.result.kind !== "contact" || probe.result.fraction > EPS) continue;
        if (probe.result.initial === "penetrating") throw new Error("Native continuous step encountered a penetrating impact.");
        witness = probe.result;
      }
      const approach = normalSpeedAt(item.pair, witness.normal, witness.point, 0);
      if (item.pair.a.body.inverseMass + item.pair.b.body.inverseMass === 0) {
        if (approach < 0) throw new Error("Native continuous step cannot resolve an impact without dynamic mass.");
        continue;
      }
      rows.push({ pair: item.pair, normal: witness.normal, point: witness.point, approach });
    }
    if (rows.length === 0) throw new Error("Native continuous step could not reconstruct simultaneous contact.");
    if (rows.length > 8) throw new Error("Native continuous step supports at most eight simultaneous contacts.");
    const impulses = solveContacts(rows);
    if (!impulses.some((value) => value > 0)) throw new Error("Native continuous step could not resolve an entering contact.");
    if (rows.some((row, index) => impulses[index]! > 0 && (constrained.has(row.pair.a) || constrained.has(row.pair.b)))) {
      throw new Error("Native continuous constraint impact requires a coupled solver.");
    }
    for (let i = 0; i < rows.length; i++) if (impulses[i]! > 0) validateCentral(rows[i]!);
    const velocities = new Map([...states.values()].map((state) => [state, [...state.body.velocity] as V]));
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!, impulse = impulses[i]!;
      if (!(impulse > 0)) continue;
      velocities.set(row.pair.a, sub(velocities.get(row.pair.a)!, mul(row.normal, impulse * row.pair.a.body.inverseMass)));
      velocities.set(row.pair.b, add(velocities.get(row.pair.b)!, mul(row.normal, impulse * row.pair.b.body.inverseMass)));
    }
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!, impulse = impulses[i]!;
      if (!(impulse > 0) || row.pair.friction === 0) continue;
      const before = sub(pointVelocity(row.pair.b, row.point, row.pair.b.body.velocity), pointVelocity(row.pair.a, row.point, row.pair.a.body.velocity));
      const after = sub(pointVelocity(row.pair.b, row.point, velocities.get(row.pair.b)!), pointVelocity(row.pair.a, row.point, velocities.get(row.pair.a)!));
      if (hasTangentialVelocity(before, row.normal) || hasTangentialVelocity(after, row.normal)) {
        throw new Error("Native continuous step does not support an impact requiring tangential friction.");
      }
    }
    for (const [state, velocity] of velocities) {
      validateFiniteVec3(velocity, "native continuous impact velocity");
      state.body.velocity = velocity;
    }
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!, impulse = impulses[i]!;
      if (!(impulse > 0)) continue;
      impacts.push({ time: elapsed, fraction: elapsed / input.duration, pair: row.pair.ids, normal: row.normal, point: row.point, impulse });
      wakeState(row.pair.a);
      wakeState(row.pair.b);
      lastImpactPairs.set(row.pair.key, Math.max(Math.abs(row.approach), magnitude(velocities.get(row.pair.a)!), magnitude(velocities.get(row.pair.b)!)));
      lastImpactedBodies.add(row.pair.a);
      lastImpactedBodies.add(row.pair.b);
    }
    if (elapsed === input.duration) {
      recomputeSupports(states, pairs, lastImpactPairs, lastImpactedBodies);
      for (let count = 0; count < states.size && wakeTouching(pairs, constrained); count++) {
        recomputeSupports(states, pairs, lastImpactPairs, lastImpactedBodies);
      }
      checkPassiveConstraintMotion(input.constraints, states);
      const finalCasts = pairs.map((pair) => cast(pair, input.duration));
      processContacts(finalCasts, active, emit, input.duration, input.duration, 0, true);
      settleContactBoundary(pairs, active, emit, input.duration);
      elapsed = input.duration;
      break;
    }
  }
  for (const pair of pairs) if (active.has(pair.key)) {
    const result = cast(pair, 0).result;
    if (result.kind !== "contact" || result.fraction !== 0) throw new Error("Native continuous step could not reconstruct an active contact witness.");
    const witness = sphereWitnessAt(pair, 0) ?? result;
    emit(pair, "persist", input.duration, witness.normal, witness.point);
  }
  events.sort((a, b) => a.time - b.time || a.pair[0] - b.pair[0] || a.pair[1] - b.pair[1] || (a.type === b.type ? 0 : a.type === "enter" ? -1 : 1));
  const order = { begin: 0, end: 1, persist: 2 } as const;
  transitions.sort((a, b) => a.time - b.time || a.pair[0] - b.pair[0] || a.pair[1] - b.pair[1] || order[a.type] - order[b.type]);
  const finalContacts = pairs.flatMap((pair) => {
    const contact = active.get(pair.key);
    if (!contact) return [];
    const support = pair.a.support?.pair === pair ? pair.a.support : pair.b.support?.pair === pair ? pair.b.support : undefined;
    return [{ ...contact, ...(support ? { supportState: createSupportState(support) } : {}) }];
  });
  return {
    bodies: [...states.values()].map(({ body }) => ({ id: body.id, position: [...body.position] as V, rotation: [...body.rotation] as [number, number, number, number], velocity: [...body.velocity] as V, angularVelocity: [...body.angularVelocity] as V, sleeping: body.sleeping })),
    impacts,
    sensorEvents: events,
    activeSensors: finalContacts.filter((contact) => contact.sensor).map((contact) => contact.pair),
    contactTransitions: transitions,
    activeContacts: finalContacts,
    diagnostics: { trajectory: "constant-acceleration", impactBatches: solvedImpacts, maxImpacts }
  };
}

function parallel(a: Vec3, b: Vec3): boolean {
  const aLength = magnitude(a), bLength = magnitude(b);
  if (!Number.isFinite(aLength) || !Number.isFinite(bLength)) throw new Error("Native continuous spin exceeds its inertia range.");
  if (aLength === 0 || bLength === 0) return true;
  const aUnit: V = [a[0] / aLength, a[1] / aLength, a[2] / aLength];
  const bUnit: V = [b[0] / bLength, b[1] / bLength, b[2] / bLength];
  return magnitude(cross(aUnit, bUnit)) <= 1024 * Number.EPSILON;
}

function requirePrincipalDirection(body: RigidBody, direction: Vec3, label: string): void {
  if (magnitude(direction) === 0) return;
  const momentum = nativeInertia(body, direction);
  if (magnitude(momentum) === 0 || !parallel(direction, momentum)) {
    throw new Error(`Native continuous step does not support non-principal gyroscopic ${label}.`);
  }
}

/** Exact solution of dv/dt = acceleration - damping * v, plus its integral. */
function dampedMotion(velocity: Vec3, acceleration: Vec3, damping: number, time: number): { velocity: V; displacement: V } {
  const x = damping * time;
  if (!Number.isFinite(x)) throw new Error("Native continuous damping exceeds its numeric time range.");
  const decay = Math.exp(-x);
  let integral: number, accelerationIntegral = 0;
  if (x < 1e-4) {
    integral = time * (1 - x / 2 + x * x / 6 - x ** 3 / 24 + x ** 4 / 120);
    if (acceleration.some((value) => value !== 0)) {
      accelerationIntegral = time * time * (0.5 - x / 6 + x * x / 24 - x ** 3 / 120 + x ** 4 / 720);
    }
  } else {
    integral = -Math.expm1(-x) / damping;
    if (acceleration.some((value) => value !== 0)) accelerationIntegral = (time - integral) / damping;
  }
  if (!Number.isFinite(integral) || !Number.isFinite(accelerationIntegral)) throw new Error("Native continuous damping exceeds its numeric integration range.");
  const result = add(mul(velocity, decay), mul(acceleration, integral));
  const displacement = add(mul(velocity, integral), mul(acceleration, accelerationIntegral));
  validateFiniteVec3(result, "native continuous damped velocity");
  validateFiniteVec3(displacement, "native continuous damped displacement");
  return { velocity: result, displacement };
}

function stepDampedIndependent(states: ReadonlyMap<number, BodyState>, duration: number, maxImpacts: number): NativeContinuousStepResult {
  const bodies = [...states.values()].map((state) => {
    const body = state.body;
    const acceleration = body.sleeping ? [0, 0, 0] as V : state.awakeAcceleration;
    const alpha = body.sleeping ? [0, 0, 0] as V : state.awakeAngularAcceleration;
    const linear = dampedMotion(body.velocity, acceleration, body.type === "dynamic" ? state.original.linearDamping : 0, duration);
    const angular = dampedMotion(body.angularVelocity, alpha, body.type === "dynamic" ? state.original.angularDamping : 0, duration);
    const position = add(body.position, linear.displacement);
    validateFiniteVec3(position, "native continuous advanced position");
    return { id: body.id, position, rotation: advanceRotation(body.rotation, angular.displacement, 1), velocity: linear.velocity, angularVelocity: angular.velocity, sleeping: body.sleeping };
  });
  return { bodies, impacts: [], sensorEvents: [], activeSensors: [], contactTransitions: [], activeContacts: [], diagnostics: { trajectory: "independent-damping", impactBatches: 0, maxImpacts } };
}

/** A common damped velocity scale gives every collision one shared geometric clock. */
function stepDampedInteractions(input: NativeContinuousStepInput, states: ReadonlyMap<number, BodyState>, constrained: ReadonlySet<BodyState>): NativeContinuousStepResult {
  const dynamic = [...states.values()].filter((state) => state.body.type === "dynamic");
  const damping = dynamic[0]!.original.linearDamping;
  if (damping <= 0 || dynamic.some((state) => state.original.linearDamping !== damping)) {
    throw new Error("Native continuous interacting damping requires the same positive linear damping on every dynamic body.");
  }
  if (dynamic.some((state) => state.awakeAcceleration.some((value) => value !== 0))) {
    throw new Error("Native continuous interacting damping requires zero net acceleration.");
  }
  if ([...states.values()].some((state) => state.body.angularVelocity.some((value) => value !== 0) || state.original.pendingTorque().some((value) => value !== 0))) {
    throw new Error("Native continuous interacting damping does not support angular motion or torque.");
  }
  if (dynamic.some((state) => state.localCenter.some((value) => value !== 0))) throw new Error("Native continuous interacting damping requires centered dynamic mass.");
  if ([...states.values()].some((state) => state.body.type === "kinematic" && state.body.velocity.some((value) => value !== 0))) {
    throw new Error("Native continuous interacting damping does not support moving kinematic bodies.");
  }
  const exponent = damping * input.duration;
  // Beyond this range the inverse clock loses event-time precision as the
  // geometric duration approaches its finite asymptote.
  if (!Number.isFinite(exponent) || exponent > 16) throw new Error("Native continuous damping exceeds its collision clock precision limit.");
  const span = -Math.expm1(-exponent) / damping;
  if (!Number.isFinite(span) || span <= 0 || damping * span >= 1) throw new Error("Native continuous damping cannot represent the collision clock.");
  const bodies = [...states.values()].map(({ body }) => new RigidBody(body.id, {
    type: body.type, position: body.position, rotation: body.rotation, velocity: body.velocity,
    angularVelocity: body.angularVelocity, sleeping: body.sleeping, ...(body.type === "dynamic" ? { mass: body.mass } : {})
  }));
  const result = nativeContinuousStep({ ...input, bodies, duration: span, acceleration: [0, 0, 0], constraints: [] });
  if (result.impacts.some((impact) => {
    const pair = input.pairs.find((item) => item.first.id === impact.pair[0] && item.second.id === impact.pair[1] || item.first.id === impact.pair[1] && item.second.id === impact.pair[0]);
    return pair && (constrained.has(states.get(pair.first.bodyId)!) || constrained.has(states.get(pair.second.bodyId)!));
  })) throw new Error("Native continuous constraint impact requires a coupled solver.");
  const physicalTime = (time: number): number => {
    if (time === 0) return 0;
    if (time === span) return input.duration;
    const value = -Math.log1p(-damping * time) / damping;
    if (!Number.isFinite(value) || value < 0 || value > input.duration) throw new Error("Native continuous damping cannot reconstruct the impact time.");
    return value;
  };
  const atTime = <T extends { readonly time: number; readonly fraction: number }>(event: T): T => {
    const time = physicalTime(event.time);
    return { ...event, time, fraction: time / input.duration };
  };
  const decay = Math.exp(-exponent);
  const impacts = result.impacts.map((event) => ({ ...atTime(event), impulse: event.impulse * Math.exp(-damping * physicalTime(event.time)) }));
  impacts.sort((a, b) => a.time - b.time || a.pair[0] - b.pair[0] || a.pair[1] - b.pair[1]);
  const sensorEvents = result.sensorEvents.map(atTime);
  sensorEvents.sort((a, b) => a.time - b.time || a.pair[0] - b.pair[0] || a.pair[1] - b.pair[1] || (a.type === b.type ? 0 : a.type === "enter" ? -1 : 1));
  const order = { begin: 0, end: 1, persist: 2 } as const;
  const contactTransitions = result.contactTransitions.map(atTime);
  contactTransitions.sort((a, b) => a.time - b.time || a.pair[0] - b.pair[0] || a.pair[1] - b.pair[1] || order[a.type] - order[b.type]);
  return {
    ...result,
    bodies: result.bodies.map((body) => ({ ...body, velocity: states.get(body.id)!.body.type === "dynamic" ? mul(body.velocity, decay) : body.velocity })),
    impacts, sensorEvents, contactTransitions,
    diagnostics: { ...result.diagnostics, trajectory: "shared-damping-clock" }
  };
}

function certifyPassiveConstraints(constraints: readonly unknown[], states: ReadonlyMap<number, BodyState>): Set<BodyState> {
  const seen = new Set<Constraint>(), constrained = new Set<BodyState>();
  for (const value of constraints) {
    if (!(value instanceof Constraint) || seen.has(value)) throw new Error("Native continuous constraints must be unique Constraint instances.");
    seen.add(value);
    const a = states.get(value.bodyA.id), b = states.get(value.bodyB.id);
    if (!a || !b || a.original !== value.bodyA || b.original !== value.bodyB) throw new Error("Native continuous constraints require their supplied body instances.");
  }
  // A dynamic island joined by enabled constraints wakes together, even if a
  // satisfied joint does not itself generate an impulse. Iterate to a fixed
  // point so the result does not depend on constraint insertion order.
  for (let pass = 0; pass < states.size; pass++) {
    let changed = false;
    for (const joint of seen) {
      if (!joint.isEnabled()) continue;
      const a = states.get(joint.bodyA.id)!, b = states.get(joint.bodyB.id)!;
      const driven = (state: BodyState): boolean => state.body.type === "dynamic" ? !state.body.sleeping :
        state.original.poseOverridden || state.original.velocityOverridden || state.body.type === "kinematic" && state.body.velocity.some((component) => component !== 0);
      if (a.body.type === "dynamic" && a.body.sleeping && driven(b)) { wakeState(a); changed = true; }
      if (b.body.type === "dynamic" && b.body.sleeping && driven(a)) { wakeState(b); changed = true; }
    }
    if (!changed) break;
  }
  for (const value of seen) {
    const a = states.get(value.bodyA.id)!, b = states.get(value.bodyB.id)!;
    if (!value.isEnabled()) continue;
    if (value.type !== "ball-socket" && value.type !== "spring") throw new Error("Native continuous active constraints require a coupled solver for this joint type.");
    if ([a, b].some((state) => state.body.angularVelocity.some((component) => component !== 0) || state.original.pendingTorque().some((component) => component !== 0))) {
      throw new Error("Native continuous constraints with angular motion require a coupled solver.");
    }
    const anchorA = add(a.body.position, rotateVec3ByQuat(value.localAnchorA, a.body.rotation));
    const anchorB = add(b.body.position, rotateVec3ByQuat(value.localAnchorB, b.body.rotation));
    const separation = sub(anchorB, anchorA);
    if (value.type === "ball-socket" ? separation.some((component) => component !== 0) : magnitude(separation) !== value.restLength) {
      throw new Error("Native continuous constraint requires an initially satisfied joint.");
    }
    const sameMotion = equalNumbers(a.body.velocity, b.body.velocity) && equalNumbers(a.baseAcceleration, b.baseAcceleration);
    const dampingA = a.body.type === "dynamic" && !a.body.sleeping ? a.original.linearDamping : 0;
    const dampingB = b.body.type === "dynamic" && !b.body.sleeping ? b.original.linearDamping : 0;
    const stationary = a.body.velocity.every((component) => component === 0) && a.baseAcceleration.every((component) => component === 0);
    if (!sameMotion || (dampingA !== dampingB && !stationary)) throw new Error("Native continuous constraint requires identical unforced relative motion.");
    constrained.add(a); constrained.add(b);
  }
  return constrained;
}

/** A support can alter motion without producing an impact impulse. */
function checkPassiveConstraintMotion(constraints: readonly unknown[], states: ReadonlyMap<number, BodyState>): void {
  for (const value of constraints) {
    if (!(value instanceof Constraint) || !value.isEnabled()) continue;
    const a = states.get(value.bodyA.id)!, b = states.get(value.bodyB.id)!;
    if (!equalNumbers(a.body.velocity, b.body.velocity) || !equalNumbers(a.acceleration, b.acceleration)) {
      throw new Error("Native continuous constraint support requires a coupled solver.");
    }
  }
}

function wakeState(state: BodyState): void {
  if (state.body.type !== "dynamic" || !state.body.sleeping) return;
  state.body.wake();
  state.baseAcceleration = state.awakeAcceleration;
  state.acceleration = state.awakeAcceleration;
}

function wakeTouching(pairs: readonly PairState[], constrained: ReadonlySet<BodyState>): boolean {
  let changed = false;
  for (const pair of pairs) {
    if (pair.sensor) continue;
    const driven = (state: BodyState): boolean => state.body.type === "dynamic" ? !state.body.sleeping :
      state.original.poseOverridden || state.original.velocityOverridden || state.body.type === "kinematic" && state.body.velocity.some((value) => value !== 0);
    const aWakes = pair.a.body.type === "dynamic" && pair.a.body.sleeping && driven(pair.b);
    const bWakes = pair.b.body.type === "dynamic" && pair.b.body.sleeping && driven(pair.a);
    if (!aWakes && !bWakes) continue;
    const result = cast(pair, 0).result;
    if (result.kind !== "contact" || result.initial !== "touching") continue;
    if (aWakes && constrained.has(pair.a) || bWakes && constrained.has(pair.b)) throw new Error("Native continuous waking a constrained body requires a coupled solver.");
    if (aWakes) wakeState(pair.a);
    if (bWakes) wakeState(pair.b);
    changed = true;
  }
  return changed;
}

function validateSupportState(state: NativeContinuousSupportState): void {
  if (!Number.isInteger(state.sphereBodyId) || state.sphereBodyId <= 0 || !Number.isInteger(state.planeBodyId) || state.planeBodyId <= 0 || state.sphereBodyId === state.planeBodyId) throw new Error("Native continuous support state requires distinct body ids.");
  for (const vector of [state.spherePosition, state.sphereVelocity, state.sphereAngularVelocity, state.planePosition, state.normal]) validateFiniteVec3(vector, "native continuous support state vector");
  for (const rotation of [state.sphereRotation, state.planeRotation]) if (!rotation || rotation.length !== 4 || !rotation.every(Number.isFinite)) throw new Error("Native continuous support state requires finite rotations.");
  if (!Number.isFinite(state.constant) || !Number.isFinite(state.radius) || state.radius <= 0) throw new Error("Native continuous support state requires finite plane and sphere geometry.");
}

function createSupportState(support: PlaneSupport): NativeContinuousSupportState {
  const { sphere, plane, normal, constant, radius } = support;
  return {
    sphereBodyId: sphere.body.id, planeBodyId: plane.body.id,
    spherePosition: [...sphere.body.position] as V, sphereRotation: [...sphere.body.rotation] as [number, number, number, number],
    sphereVelocity: [...sphere.body.velocity] as V, sphereAngularVelocity: [...sphere.body.angularVelocity] as V,
    planePosition: [...plane.body.position] as V, planeRotation: [...plane.body.rotation] as [number, number, number, number],
    normal: [...normal] as V, constant, radius
  };
}

function equalNumbers(first: readonly number[], second: readonly number[]): boolean {
  return first.length === second.length && first.every((value, index) => Object.is(value, second[index]));
}

function planeGeometry(plane: BodyState, shape: PlaneShape): { normal: Vec3; constant: number } {
  const rotationLength = Math.hypot(...plane.body.rotation);
  if (!Number.isFinite(rotationLength) || rotationLength === 0) throw new Error("Native continuous support plane has an invalid rotation.");
  const rotation = plane.body.rotation.map((value) => value / rotationLength) as [number, number, number, number];
  const raw = rotateVec3ByQuat(shape.normal, rotation), normalLength = magnitude(raw);
  if (!Number.isFinite(normalLength) || normalLength === 0) throw new Error("Native continuous support plane has an invalid normal.");
  const normal = mul(raw, 1 / normalLength), constant = shape.constant / normalLength;
  if (!Number.isFinite(constant)) throw new Error("Native continuous support plane exceeds its numeric range.");
  return { normal, constant };
}

function certifiedPlaneImpact(pair: PairState, interval: NativeAcceleratedCCDInterval): Pick<NativeCCDInterval, "normal" | "point"> | undefined {
  const sphereFirst = pair.first.shape.kind === "sphere" && pair.second.shape.kind === "plane";
  const sphereSecond = pair.second.shape.kind === "sphere" && pair.first.shape.kind === "plane";
  if (!sphereFirst && !sphereSecond) return undefined;
  const sphere = sphereFirst ? pair.a : pair.b, plane = sphereFirst ? pair.b : pair.a;
  const shape = sphereFirst ? pair.first.shape : pair.second.shape, planeShape = sphereFirst ? pair.second.shape : pair.first.shape;
  if (shape.kind !== "sphere" || planeShape.kind !== "plane" || sphere.body.type !== "dynamic" || plane.body.type !== "static") return undefined;
  if (interval.fraction < interval.entryBounds[0] || interval.fraction > interval.entryBounds[1]) throw new Error("Native continuous plane impact is outside its certified time bounds.");
  const { normal, constant } = planeGeometry(plane, planeShape), relative = sub(sphere.body.position, plane.body.position);
  const gap = dot(normal, relative) - constant - shape.radius;
  const scale = Math.max(magnitude(relative), Math.abs(constant), shape.radius, Number.MIN_VALUE);
  const expectedNormal = sphereFirst ? mul(normal, -1) : normal, point = sub(sphere.body.position, mul(normal, shape.radius));
  if (!Number.isFinite(gap) || !Number.isFinite(scale) || Math.abs(gap) > EPS * scale ||
      magnitude(sub(expectedNormal, interval.normal)) > EPS || magnitude(sub(point, interval.point)) > EPS * scale) {
    throw new Error("Native continuous plane impact lost its certified geometric witness.");
  }
  return { normal: interval.normal, point: interval.point };
}

function recomputeSupports(states: ReadonlyMap<number, BodyState>, pairs: readonly PairState[], lastImpactPairs: ReadonlyMap<string, number>, lastImpactedBodies: ReadonlySet<BodyState>, priorContacts?: ReadonlyMap<string, NativeContinuousContact | undefined>): void {
  const previous = new Map([...states.values()].map((state) => [state, state.support]));
  for (const state of states.values()) { state.acceleration = state.baseAcceleration; state.support = undefined; }
  for (const pair of pairs) {
    if (pair.sensor) continue;
    const sphereFirst = pair.first.shape.kind === "sphere" && pair.second.shape.kind === "plane";
    const sphereSecond = pair.second.shape.kind === "sphere" && pair.first.shape.kind === "plane";
    if (!sphereFirst && !sphereSecond) continue;
    const sphere = sphereFirst ? pair.a : pair.b, plane = sphereFirst ? pair.b : pair.a;
    const sphereShape = sphereFirst ? pair.first.shape : pair.second.shape;
    const planeShape = sphereFirst ? pair.second.shape : pair.first.shape;
    if (sphereShape.kind !== "sphere" || planeShape.kind !== "plane" || sphere.body.type !== "dynamic" || plane.body.type !== "static") continue;
    const { normal, constant } = planeGeometry(plane, planeShape);
    const relativePosition = sub(sphere.body.position, plane.body.position);
    const gap = dot(normal, relativePosition) - constant - sphereShape.radius;
    const scale = Math.max(magnitude(relativePosition), sphereShape.radius, Math.abs(constant), Number.MIN_VALUE);
    const tolerance = EPS * scale;
    if (!Number.isFinite(gap) || !Number.isFinite(tolerance)) throw new Error("Native continuous support exceeds its numeric range.");
    const wasSupported = previous.get(sphere)?.pair === pair && !lastImpactedBodies.has(sphere);
    const impactScale = lastImpactPairs.get(pair.key), certifiedImpact = impactScale !== undefined;
    const prior = priorContacts?.get(pair.key), cached = prior?.supportState;
    const contactNormal = sphereFirst ? mul(normal, -1) : normal;
    const contactPoint = sub(sphere.body.position, mul(normal, sphereShape.radius));
    const sameWitness = !!prior && equalNumbers(prior.normal, contactNormal) && equalNumbers(prior.point, contactPoint);
    const certifiedPrior = !!cached && sameWitness && cached.sphereBodyId === sphere.body.id && cached.planeBodyId === plane.body.id &&
      equalNumbers(cached.spherePosition, sphere.body.position) && equalNumbers(cached.sphereRotation, sphere.original.rotation) &&
      equalNumbers(cached.sphereVelocity, sphere.body.velocity) && equalNumbers(cached.sphereAngularVelocity, sphere.body.angularVelocity) &&
      equalNumbers(cached.planePosition, plane.body.position) && equalNumbers(cached.planeRotation, plane.original.rotation) &&
      equalNumbers(cached.normal, normal) && Object.is(cached.constant, constant) && Object.is(cached.radius, sphereShape.radius);
    const speed = dot(normal, sphere.body.velocity), normalAcceleration = dot(normal, sphere.baseAcceleration);
    const velocityTolerance = EPS * Math.max(magnitude(sphere.body.velocity), Number.MIN_VALUE);
    let certifiedBoundary = false;
    if (!wasSupported && !certifiedImpact && !certifiedPrior && Math.abs(gap) <= tolerance) {
      // A rounded dot product can be zero even when the supplied floating-point
      // geometry is just inside or outside. Certify the initial boundary and
      // normal velocity with the exact-sign instantaneous CCD predicate.
      const motion = (collider: Collider, state: BodyState) => ({ collider, body: state.body, velocity: state.body.velocity, acceleration: [0, 0, 0] as Vec3, angularVelocity: [0, 0, 0] as Vec3, angularAcceleration: [0, 0, 0] as Vec3 });
      const initial = nativeCastAcceleratedPair(motion(pair.first, pair.a), motion(pair.second, pair.b), 0);
      if (initial.kind === "separated") continue;
      if (initial.initial === "penetrating") throw new Error("Native continuous step does not support a penetrating plane contact.");
      if (sameWitness && (initial.motion === "entering" || initial.motion === "separating") && Math.abs(speed) <= velocityTolerance) throw new Error("Native continuous plane support has ambiguous unmatched prior velocity.");
      if (initial.motion === "entering" || initial.motion === "separating") continue;
      certifiedBoundary = true;
    }
    if (gap < 0 && !(gap >= -tolerance && (wasSupported || certifiedImpact || certifiedPrior || certifiedBoundary))) throw new Error("Native continuous step does not support a penetrating plane contact.");
    if (gap > 0 && !(gap <= tolerance && (wasSupported || certifiedImpact || certifiedPrior || certifiedBoundary))) continue;
    const certifiedInelasticVelocity = certifiedImpact && pair.restitution === 0 && Math.abs(speed) <= EPS * Math.max(impactScale, magnitude(sphere.body.velocity), Number.MIN_VALUE);
    if (speed !== 0 && !(((wasSupported || certifiedPrior || certifiedBoundary) && Math.abs(speed) <= velocityTolerance) || certifiedInelasticVelocity)) continue;
    if (!(normalAcceleration < 0)) continue;
    if (sphere.localCenter.some((value) => value !== 0)) throw new Error("Native continuous plane support requires a centered sphere center of mass.");
    if (sphere.support) throw new Error("Native continuous step does not support multiple simultaneous plane supports.");
    const point = sub(sphere.body.position, mul(normal, sphereShape.radius));
    if (pair.friction > 0 && (hasTangentialVelocity(pointVelocity(sphere, point, sphere.body.velocity), normal) || hasTangentialVelocity(sphere.baseAcceleration, normal))) {
      throw new Error("Native continuous plane support does not support tangential friction.");
    }
    if (pair.friction > 0 && !sphere.body.sleeping &&
        (magnitude(cross(sphere.awakeAngularAcceleration, normal)) !== 0 || sphere.original.angularDamping !== 0 && magnitude(cross(sphere.body.angularVelocity, normal)) !== 0)) {
      throw new Error("Native continuous plane support does not support evolving tangential friction.");
    }
    sphere.acceleration = sub(sphere.baseAcceleration, mul(normal, normalAcceleration / dot(normal, normal)));
    const support: PlaneSupport = { pair, sphere, plane, normal, constant, radius: sphereShape.radius };
    sphere.support = support;
    correctSupportedState(support, 0, certifiedInelasticVelocity ? impactScale : 0);
  }
}

/** Remove only floating-point residual from the analytic plane constraint. */
function correctSupportedState(support: PlaneSupport, elapsed: number, impactScale = 0): void {
  const { sphere, plane, normal, constant, radius } = support, normalSquared = dot(normal, normal);
  const gap = dot(normal, sub(sphere.body.position, plane.body.position)) - constant - radius;
  const positionScale = Math.max(magnitude(sub(sphere.body.position, plane.body.position)), radius, Math.abs(constant), magnitude(sphere.body.velocity) * elapsed, magnitude(sphere.baseAcceleration) * elapsed * elapsed, Number.MIN_VALUE);
  if (!Number.isFinite(gap) || !Number.isFinite(positionScale) || Math.abs(gap) > EPS * positionScale) throw new Error("Native continuous plane support lost numeric contact precision.");
  sphere.body.position = sub(sphere.body.position, mul(normal, gap / normalSquared));
  const speed = dot(normal, sphere.body.velocity), velocityScale = Math.max(magnitude(sphere.body.velocity), magnitude(sphere.baseAcceleration) * elapsed, impactScale, Number.MIN_VALUE);
  if (!Number.isFinite(speed) || !Number.isFinite(velocityScale) || Math.abs(speed) > EPS * velocityScale) throw new Error("Native continuous plane support lost numeric velocity precision.");
  sphere.body.velocity = sub(sphere.body.velocity, mul(normal, speed / normalSquared));
}

function advanceRotation(rotation: Quat, angularVelocity: Vec3, time: number): [number, number, number, number] {
  const speed = magnitude(angularVelocity);
  if (speed === 0 || time === 0) return [...rotation];
  const angle = speed * time;
  if (!Number.isFinite(angle) || angle > 1e12) throw new Error("Native continuous spin exceeds its numeric angle range.");
  const sine = Math.sin(angle * 0.5) / speed, dx = angularVelocity[0] * sine, dy = angularVelocity[1] * sine, dz = angularVelocity[2] * sine, dw = Math.cos(angle * 0.5);
  const [x, y, z, w] = rotation;
  const result: [number, number, number, number] = [dw * x + dx * w + dy * z - dz * y, dw * y - dx * z + dy * w + dz * x, dw * z + dx * y - dy * x + dz * w, dw * w - dx * x - dy * y - dz * z];
  const length = Math.hypot(...result);
  if (!Number.isFinite(length) || length === 0) throw new Error("Native continuous spin produced an invalid rotation.");
  return result.map((value) => value / length) as [number, number, number, number];
}

function accelerationDrift(acceleration: Vec3, time: number): V {
  if (acceleration.every((value) => value === 0)) return [0, 0, 0];
  const squared = time * time;
  if (!Number.isFinite(squared)) throw new Error("Native continuous acceleration exceeds its numeric time range.");
  const result = mul(acceleration, 0.5 * squared);
  validateFiniteVec3(result, "native continuous acceleration drift");
  return result;
}

function equalAcceleration(a: BodyState, b: BodyState): boolean { return a.acceleration.every((value, index) => value === b.acceleration[index]); }
function supportsRelativeAcceleration(first: Collider, second: Collider): boolean {
  return first.shape.kind === "sphere" && (second.shape.kind === "sphere" || second.shape.kind === "plane") ||
    second.shape.kind === "sphere" && first.shape.kind === "plane";
}

function cast(pair: PairState, span: number): Cast {
  const support = pair.a.support?.pair === pair ? pair.a.support : pair.b.support?.pair === pair ? pair.b.support : undefined;
  if (support) {
    const normal = pair.a === support.sphere ? mul(support.normal, -1) : [...support.normal] as V;
    const point = sub(support.sphere.body.position, mul(support.normal, support.radius));
    const relative = sub(pair.b.body.velocity, pair.a.body.velocity), relativeAcceleration = sub(pair.b.acceleration, pair.a.acceleration);
    const interval: NativeCCDInterval = { fraction: 0, exitFraction: undefined, initial: "touching", motion: magnitude(relative) === 0 && magnitude(relativeAcceleration) === 0 ? "stationary" : "tangent", normal, point };
    return { pair, result: { kind: "contact", ...interval, intervals: [interval] } };
  }
  if (!equalAcceleration(pair.a, pair.b)) {
    if (!supportsRelativeAcceleration(pair.first, pair.second)) throw new Error("Native continuous unequal-acceleration pairs require sphere/sphere or sphere/plane geometry.");
    // Validated spinning bodies are centered spheres, so rotation does not
    // alter their geometry; their angular state remains integrated separately.
    const motion = (collider: Collider, state: BodyState) => ({ collider, body: state.body, velocity: state.body.velocity, acceleration: state.acceleration, angularVelocity: [0, 0, 0] as Vec3, angularAcceleration: [0, 0, 0] as Vec3 });
    return { pair, result: nativeCastAcceleratedPair(motion(pair.first, pair.a), motion(pair.second, pair.b), span) };
  }
  const result = nativeCastPair(
    { collider: pair.first, body: pair.a.body, displacement: mul(pair.a.body.velocity, span), angularDisplacement: [0, 0, 0] },
    { collider: pair.second, body: pair.b.body, displacement: mul(pair.b.body.velocity, span), angularDisplacement: [0, 0, 0] }
  );
  if (result.kind !== "contact") return { pair, result };
  const intervals = result.intervals.map((interval) => ({
    ...interval,
    point: add(interval.point, accelerationDrift(pair.a.acceleration, span * interval.fraction)),
    ...(interval.exitPoint && interval.exitFraction !== undefined ? { exitPoint: add(interval.exitPoint, accelerationDrift(pair.a.acceleration, span * interval.exitFraction)) } : {})
  }));
  return { pair, result: { kind: "contact", ...intervals[0]!, intervals } };
}

function pointVelocity(state: BodyState, point: Vec3, linearVelocity: Vec3): V {
  const center = add(state.body.position, rotateVec3ByQuat(state.localCenter, state.body.rotation));
  return add(linearVelocity, cross(state.body.angularVelocity, sub(point, center)));
}
function normalSpeedAt(pair: PairState, normal: Vec3, point: Vec3, time: number): number {
  const at = (state: BodyState): V => {
    const position = add(add(state.body.position, mul(state.body.velocity, time)), accelerationDrift(state.acceleration, time));
    const center = add(position, rotateVec3ByQuat(state.localCenter, state.body.rotation));
    const angular = dampedMotion(state.body.angularVelocity, state.body.sleeping ? [0, 0, 0] : state.awakeAngularAcceleration, state.original.angularDamping, time).velocity;
    return add(add(state.body.velocity, mul(state.acceleration, time)), cross(angular, sub(point, center)));
  };
  return dot(sub(at(pair.b), at(pair.a)), normal);
}
function hasTangentialVelocity(velocity: Vec3, normal: Vec3): boolean {
  const tangent = sub(velocity, mul(normal, dot(velocity, normal)));
  return magnitude(tangent) > EPS * Math.max(magnitude(velocity), Number.MIN_VALUE);
}

type ContactEmitter = (pair: PairState, type: "begin" | "end" | "persist", time: number, normal: Vec3, point: Vec3) => void;

function processContacts(casts: readonly Cast[], active: Map<string, NativeContinuousContact | undefined>, emit: ContactEmitter, start: number, span: number, stop: number, includeBoundary: boolean): void {
  for (const { pair, result } of casts) {
    const intervals = result.kind === "contact" ? result.intervals : [];
    if (active.has(pair.key) && (intervals.length === 0 || intervals[0]!.fraction > 0)) {
      const previous = active.get(pair.key);
      if (!previous) throw new Error("Native continuous step needs the prior witness for an already-separated contact.");
      emit(pair, "end", start, previous.normal, previous.point);
    }
    let reverse: NativeCCDResult | undefined;
    for (const [index, interval] of intervals.entries()) {
      if (interval.fraction > stop) break;
      const enter = start + span * Math.min(stop, Math.max(0, interval.fraction));
      const entryWitness = sphereWitnessAt(pair, span * interval.fraction) ?? interval;
      if (!active.has(pair.key)) emit(pair, "begin", enter, entryWitness.normal, entryWitness.point);
      else if (interval.fraction === 0) active.set(pair.key, { pair: pair.ids, sensor: pair.sensor, normal: entryWitness.normal, point: entryWitness.point });
      const exit = interval.exitFraction;
      const beforeBoundary = exit !== undefined && (includeBoundary ? exit <= stop : exit < stop);
      if (beforeBoundary) {
        let witness: Pick<NativeCCDInterval, "normal" | "point"> = entryWitness;
        if (exit !== interval.fraction) {
          const analytic = interval.exitNormal && interval.exitPoint ? { normal: interval.exitNormal, point: interval.exitPoint } : sphereWitnessAt(pair, span * exit!);
          if (analytic) witness = analytic;
          else {
            if (!equalAcceleration(pair.a, pair.b)) throw new Error("Native continuous accelerated CCD did not provide an exit witness.");
            reverse ??= reverseCast(pair, span);
            const target = 1 - exit!;
            const matched = reverse.kind === "contact" && reverse.intervals.length === intervals.length ? reverse.intervals[intervals.length - 1 - index] : undefined;
            if (matched && Math.abs(matched.fraction - target) > 1024 * Number.EPSILON * Math.max(1, Math.abs(target))) {
              throw new Error("Native continuous step could not match the reversed exit interval.");
            }
            if (!matched) throw new Error("Native continuous step could not reconstruct the exit witness.");
            witness = { normal: matched.normal, point: add(matched.point, accelerationDrift(pair.a.acceleration, span * exit!)) };
          }
        }
        emit(pair, "end", start + span * Math.min(stop, Math.max(0, exit!)), witness.normal, witness.point);
      }
    }
  }
}

function sphereWitnessAt(pair: PairState, time: number): Pick<NativeCCDInterval, "normal" | "point"> | undefined {
  const shapeA = pair.first.shape, shapeB = pair.second.shape;
  if (shapeA.kind !== "sphere" || shapeB.kind !== "sphere") return undefined;
  const a = add(add(pair.a.body.position, mul(pair.a.body.velocity, time)), accelerationDrift(pair.a.acceleration, time));
  const b = add(add(pair.b.body.position, mul(pair.b.body.velocity, time)), accelerationDrift(pair.b.acceleration, time));
  const difference = sub(b, a), distance = magnitude(difference);
  if (!Number.isFinite(distance) || distance === 0) throw new Error("Native continuous step cannot determine a sphere contact normal.");
  const normal = mul(difference, 1 / distance), pointA = add(a, mul(normal, shapeA.radius)), pointB = sub(b, mul(normal, shapeB.radius));
  return { normal, point: mul(add(pointA, pointB), 0.5) };
}

function reverseCast(pair: PairState, span: number): NativeCCDResult {
  const endBody = (state: BodyState): RigidBody => new RigidBody(state.body.id, {
    type: state.body.type,
    position: add(state.body.position, mul(state.body.velocity, span)),
    rotation: state.body.rotation,
    velocity: state.body.velocity,
    ...(state.body.type === "dynamic" ? { mass: state.body.mass } : {})
  });
  const a = endBody(pair.a), b = endBody(pair.b);
  return nativeCastPair(
    { collider: pair.first, body: a, displacement: mul(pair.a.body.velocity, -span), angularDisplacement: [0, 0, 0] },
    { collider: pair.second, body: b, displacement: mul(pair.b.body.velocity, -span), angularDisplacement: [0, 0, 0] }
  );
}

function settleContactBoundary(pairs: readonly PairState[], active: Map<string, NativeContinuousContact | undefined>, emit: ContactEmitter, time: number): void {
  for (const pair of pairs) {
    if (!active.has(pair.key)) continue;
    const { result } = cast(pair, time);
    if (result.kind === "contact" && result.initial === "touching" && result.motion === "separating" && result.exitFraction !== undefined && result.exitFraction <= EPS) {
      const witness = sphereWitnessAt(pair, 0) ?? result;
      emit(pair, "end", time, witness.normal, witness.point);
    }
  }
}

function validateCentral(row: Row): void {
  for (const state of [row.pair.a, row.pair.b]) {
    if (state.body.inverseMass === 0) continue;
    const center = add(state.body.position, rotateVec3ByQuat(state.localCenter, state.body.rotation));
    validateFiniteVec3(center, "native continuous world center of mass");
    const lever = sub(row.point, center), angular = magnitude(cross(lever, row.normal));
    const tolerance = EPS * Math.max(magnitude(lever), magnitude(center), magnitude(row.point), Number.MIN_VALUE);
    if (!Number.isFinite(angular) || !Number.isFinite(tolerance)) throw new Error("Native continuous center-of-mass calculation exceeds its numeric range.");
    if (angular > tolerance) throw new Error("Native continuous step does not support an off-center impact requiring rotational response.");
  }
}

function influence(a: Row, b: Row): number {
  let sum = 0;
  for (const [bodyA, signA] of [[a.pair.a, -1], [a.pair.b, 1]] as const) {
    for (const [bodyB, signB] of [[b.pair.a, -1], [b.pair.b, 1]] as const) {
      if (bodyA === bodyB) sum += signA * signB * bodyA.body.inverseMass * dot(a.normal, b.normal);
    }
  }
  if (!Number.isFinite(sum)) throw new Error("Native continuous contact matrix exceeds its numeric range.");
  return sum;
}

/** Find a non-negative impulse satisfying every simultaneous normal constraint. */
function solveContacts(rows: readonly Row[]): number[] {
  const matrix = rows.map((a) => rows.map((b) => influence(a, b)));
  const target = rows.map((row) => -row.pair.restitution * Math.min(0, row.approach));
  const velocityScale = Math.max(Number.MIN_VALUE, ...rows.map((row, i) => Math.max(Math.abs(row.approach), target[i]!)));
  const velocityTolerance = 1024 * Number.EPSILON * velocityScale;
  for (let mask = 0; mask < 2 ** rows.length; mask++) {
    const selected = rows.map((_, i) => i).filter((i) => (mask & (1 << i)) !== 0);
    const solution = solveLinear(selected.map((i) => selected.map((j) => matrix[i]![j]!)), selected.map((i) => target[i]! - rows[i]!.approach));
    if (!solution) continue;
    const impulseScale = Math.max(Number.MIN_VALUE, ...solution.map(Math.abs)), impulseTolerance = 1024 * Number.EPSILON * impulseScale;
    if (solution.some((value) => value < -impulseTolerance)) continue;
    const impulses = rows.map(() => 0);
    selected.forEach((index, i) => { impulses[index] = Math.max(0, solution[i]!); });
    let valid = true;
    for (let i = 0; i < rows.length; i++) {
      let residual = rows[i]!.approach - target[i]!;
      for (let j = 0; j < rows.length; j++) residual += matrix[i]![j]! * impulses[j]!;
      if (!Number.isFinite(residual) || residual < -velocityTolerance || (impulses[i]! > 0 && Math.abs(residual) > velocityTolerance)) { valid = false; break; }
    }
    if (valid) return impulses;
  }
  throw new Error("Native continuous simultaneous contacts have no supported impulse solution.");
}

function solveLinear(matrix: number[][], rhs: number[]): number[] | undefined {
  if (rhs.length === 0) return [];
  const rows = matrix.map((row, index) => [...row, rhs[index]!]);
  const scale = Math.max(...matrix.flat().map(Math.abs));
  if (!Number.isFinite(scale) || scale === 0) return undefined;
  for (let column = 0; column < rhs.length; column++) {
    let pivot = column;
    for (let i = column + 1; i < rhs.length; i++) if (Math.abs(rows[i]![column]!) > Math.abs(rows[pivot]![column]!)) pivot = i;
    if (Math.abs(rows[pivot]![column]!) <= 256 * Number.EPSILON * scale) return undefined;
    [rows[column], rows[pivot]] = [rows[pivot]!, rows[column]!];
    const divisor = rows[column]![column]!;
    for (let j = column; j <= rhs.length; j++) rows[column]![j] = rows[column]![j]! / divisor;
    for (let i = 0; i < rhs.length; i++) if (i !== column) {
      const factor = rows[i]![column]!;
      for (let j = column; j <= rhs.length; j++) rows[i]![j] = rows[i]![j]! - factor * rows[column]![j]!;
    }
  }
  const result = rows.map((row) => row[rhs.length]!);
  return result.every(Number.isFinite) ? result : undefined;
}
