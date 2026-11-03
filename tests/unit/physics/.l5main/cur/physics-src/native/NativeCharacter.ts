import type { Collider } from "../Collider.js";
import type { PhysicsCharacterController, PhysicsCharacterControllerDescriptor, PhysicsCharacterMovement } from "../PhysicalCharacterController.js";
import type { RigidBody } from "../RigidBody.js";
import { addVec3, dotVec3, lengthVec3, normalizeVec3, rotateVec3ByQuat, scaleVec3, subVec3, validateFiniteVec3, type Vec3 } from "../Shape.js";
import { nativeApplyImpulseAtPoint, nativeCenterOfMass, nativeInverseInertia } from "./NativeMassProperties.js";

/** A swept collider's first contact, in world space. The normal points away from the obstacle. */
export interface NativeCharacterSweepHit {
  readonly fraction: number;
  readonly normal: Vec3;
  readonly point: Vec3;
  readonly collider: Collider;
  readonly body: RigidBody;
}

export interface NativeCharacterSweepRequest {
  readonly body: RigidBody;
  readonly collider: Collider;
  readonly position: Vec3;
  readonly displacement: Vec3;
  /** Required clearance around the character collider, in world units. */
  readonly offset: number;
}

/** Continuous contact and full-shape clearance along a proposed landing path. */
export interface NativeCharacterSupportPathRequest {
  readonly body: RigidBody;
  readonly collider: Collider;
  readonly origin: Vec3;
  readonly displacement: Vec3;
  readonly offset: number;
  readonly maxSlopeClimbAngle: number;
  /** Dynamic geometry must always block clearance; this permits it as support. */
  readonly includeDynamicBodies: boolean;
  /** Require the center's projection to stay over a supporting face. */
  readonly requireCenterSupport: boolean;
}

export type NativeCharacterSupportPathResult =
  | { readonly status: "certified" }
  | { readonly status: "blocked" }
  | { readonly status: "unsupported"; readonly reason: string; readonly firstUncovered?: number };

/**
 * The world owns exact shape casts and filters. `sweep` must ignore this body's
 * colliders and sensors, respect both collision masks, and return the earliest
 * hit in the inclusive interval [0, 1]. Zero-time contacts that are tangent
 * or separating must not mask later blocking hits. Queries must not mutate world state.
 */
export interface NativeCharacterHost {
  readonly fixedDelta: number;
  sweep(request: NativeCharacterSweepRequest): NativeCharacterSweepHit | undefined;
  /** Prove continuous walkable support and shape clearance over the proposed landing path. */
  certifySupportPath?(request: NativeCharacterSupportPathRequest): NativeCharacterSupportPathResult;
  isActive?(body: RigidBody, collider: Collider): boolean;
}

type MutableVec3 = [number, number, number];
const EPSILON = 1e-8;

function number(value: number, name: string, minimum = 0): number {
  if (!Number.isFinite(value) || value < minimum) throw new RangeError(`${name} must be finite and at least ${minimum}.`);
  return value;
}

function angle(value: number, name: string): number {
  number(value, name);
  if (value > Math.PI / 2) throw new RangeError(`${name} must not exceed pi/2.`);
  return value;
}

function bool(value: boolean, name: string): boolean {
  if (typeof value !== "boolean") throw new TypeError(`${name} must be boolean.`);
  return value;
}

function copy(value: Vec3): MutableVec3 { return [value[0], value[1], value[2]]; }
function cross(a: Vec3, b: Vec3): MutableVec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** Independently authored kinematic movement over a host's exact swept-shape query. */
export function createNativeCharacter(
  body: RigidBody,
  collider: Collider,
  host: NativeCharacterHost,
  descriptor: PhysicsCharacterControllerDescriptor = {}
): PhysicsCharacterController {
  if (body.type !== "kinematic") throw new Error("A native character requires a kinematic body.");
  if (collider.bodyId !== body.id) throw new Error("Character collider must belong to the character body.");
  if (collider.sensor) throw new Error("A native character cannot use a sensor collider.");
  if (collider.shape.kind !== "sphere" && collider.shape.kind !== "box" && collider.shape.kind !== "capsule") {
    throw new Error(`Native character shape '${collider.shape.kind}' is not supported by the required swept-shape contract.`);
  }
  if (!host || typeof host.sweep !== "function") throw new TypeError("Native character host requires an exact sweep function.");
  number(host.fixedDelta, "character fixedDelta", Number.EPSILON);
  const allowed = new Set(["offset", "autoStepHeight", "autoStepMinWidth", "autoStepIncludeDynamicBodies", "maxSlopeClimbAngle", "snapToGroundDistance", "minSlopeSlideAngle", "slideEnabled", "characterMass", "applyImpulsesToDynamicBodies"]);
  for (const key of Object.keys(descriptor)) if (!allowed.has(key)) throw new Error(`Unsupported character option '${key}'.`);
  if (descriptor.autoStepHeight === undefined && (descriptor.autoStepMinWidth !== undefined || descriptor.autoStepIncludeDynamicBodies !== undefined)) {
    throw new Error("Character autostep width and dynamic-body option require autoStepHeight.");
  }
  const offset = number(descriptor.offset ?? 0.01, "character offset", Number.EPSILON);
  let stepHeight = descriptor.autoStepHeight === undefined ? 0 : number(descriptor.autoStepHeight, "autostep height");
  let stepWidth = number(descriptor.autoStepMinWidth ?? 0.2, "autostep minimum width");
  let stepDynamic = bool(descriptor.autoStepIncludeDynamicBodies ?? false, "autostep includeDynamicBodies");
  let maxSlope = angle(descriptor.maxSlopeClimbAngle ?? Math.PI / 4, "maximum climb angle");
  let minSlide = angle(descriptor.minSlopeSlideAngle ?? Math.PI / 4, "minimum slide angle");
  let snapDistance = number(descriptor.snapToGroundDistance ?? 0, "snap distance");
  let slideEnabled = bool(descriptor.slideEnabled ?? true, "slideEnabled");
  let characterMass = number(descriptor.characterMass ?? 1, "character mass", Number.EPSILON);
  let pushDynamic = bool(descriptor.applyImpulsesToDynamicBodies ?? false, "applyImpulsesToDynamicBodies");
  let grounded = false;
  let disposed = false;

  const assertActive = (): void => {
    if (disposed || (host.isActive && !host.isActive(body, collider))) throw new Error("Native character controller is disposed.");
  };

  const cast = (position: Vec3, displacement: Vec3): NativeCharacterSweepHit | undefined => {
    validateFiniteVec3(position, "character sweep position");
    validateFiniteVec3(displacement, "character sweep displacement");
    if (lengthVec3(displacement) <= EPSILON) return undefined;
    const hit = host.sweep({ body, collider, position: copy(position), displacement: copy(displacement), offset });
    if (!hit) return undefined;
    number(hit.fraction, "character hit fraction");
    if (hit.fraction > 1) throw new Error("Character hit fraction must be within [0, 1].");
    validateFiniteVec3(hit.point, "character hit point");
    validateFiniteVec3(hit.normal, "character hit normal");
    if (lengthVec3(hit.normal) <= EPSILON) throw new Error("Character hit normal must be non-zero.");
    if (hit.collider.sensor || hit.collider.bodyId !== hit.body.id || hit.body.id === body.id || !collider.canCollideWith(hit.collider)) {
      throw new Error("Character host returned a sensor, self, mismatched or filtered collision.");
    }
    const normal = normalizeVec3(hit.normal);
    if (hit.fraction <= EPSILON && dotVec3(displacement, normal) >= -64 * Number.EPSILON * lengthVec3(displacement)) {
      throw new Error("Character host returned a non-blocking zero-time contact.");
    }
    return { ...hit, normal, point: copy(hit.point) };
  };

  const canWalk = (normal: Vec3): boolean => normal[1] > EPSILON && normal[1] >= Math.cos(maxSlope) - 1e-8;

  const supportRadius = (normal: Vec3): number => {
    const shape = collider.shape;
    if (shape.kind === "sphere") return shape.radius + offset;
    if (shape.kind === "capsule") {
      return shape.radius + offset + shape.halfHeight * Math.abs(dotVec3(normal, rotateVec3ByQuat([0, 1, 0], body.rotation)));
    }
    if (shape.kind === "box") {
      const axes: readonly Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      return offset + axes.reduce((sum, axis, index) => sum + shape.halfExtents[index]! * Math.abs(dotVec3(normal, rotateVec3ByQuat(axis, body.rotation))), 0);
    }
    throw new Error("Unsupported character shape during autostep.");
  };

  /**
   * Try an up/across/down route without changing either body. The support
   * certificate is deliberately stronger than a pair of downward samples: it
   * must cover the entire requested minimum width and exclude intervening
   * geometry. A failed route leaves the ordinary collision response in charge.
   */
  const tryStep = (position: Vec3, rest: Vec3, hit: NativeCharacterSweepHit): { position: MutableVec3; remaining: MutableVec3 } | undefined => {
    const horizontalLength = Math.hypot(rest[0], rest[2]);
    if (horizontalLength <= EPSILON || rest[1] > EPSILON) return undefined;
    const direction: Vec3 = [rest[0] / horizontalLength, 0, rest[2] / horizontalLength];
    if (dotVec3(direction, hit.normal) >= -EPSILON) return undefined;

    // A rounded character can meet a lower corner before reaching full side
    // clearance. A tilted face can also lean toward the upward sweep. Retreat
    // far enough for both the horizontal support radius and the full ascent.
    const horizontalNormal = normalizeVec3([hit.normal[0], 0, hit.normal[2]]);
    const radius = supportRadius(horizontalNormal);
    const separation = dotVec3(subVec3(position, hit.point), horizontalNormal);
    const scale = Math.max(1, radius, ...position.map(Math.abs), ...hit.point.map(Math.abs));
    const margin = EPSILON * Math.max(1, radius) + 64 * Number.EPSILON * scale;
    const horizontalNormalLength = Math.hypot(hit.normal[0], hit.normal[2]);
    const normalSeparation = dotVec3(subVec3(position, hit.point), hit.normal);
    const ascentClearance = (supportRadius(hit.normal) - normalSeparation - Math.min(0, hit.normal[1] * stepHeight)) / horizontalNormalLength;
    const requiredClearance = Math.max(radius - separation, ascentClearance);
    if (!Number.isFinite(requiredClearance) || !Number.isFinite(margin)) throw new Error("Character autostep clearance exceeds the finite numeric range.");
    const clearance = requiredClearance > margin ? requiredClearance + margin : 0;
    if (!Number.isFinite(clearance)) throw new Error("Character autostep clearance exceeds the finite numeric range.");
    const retreat = scaleVec3(horizontalNormal, clearance);
    if (cast(position, retreat)) return undefined;
    const cleared = addVec3(position, retreat);
    const up: Vec3 = [0, stepHeight, 0];
    if (cast(cleared, up)) return undefined;
    const raised = addVec3(cleared, up);
    validateFiniteVec3(raised, "character step height");

    // A collision witness lies on the obstacle, so projecting it onto the
    // direction of travel locates the beginning of its top face without
    // assuming a particular character radius or box orientation.
    const entryDistance = Math.max(0, dotVec3(subVec3(hit.point, cleared), direction));
    const probeDistance = entryDistance + stepWidth;
    if (!Number.isFinite(probeDistance)) throw new Error("Character autostep probe exceeds the finite numeric range.");
    if (cast(raised, scaleVec3(direction, probeDistance))) return undefined;

    const entry = addVec3(raised, scaleVec3(direction, entryDistance));
    const down: Vec3 = [0, -stepHeight, 0];
    const support = cast(entry, down);
    if (!support || !canWalk(support.normal) || (support.body.type === "dynamic" && !stepDynamic)) return undefined;
    const landing = addVec3(entry, scaleVec3(down, support.fraction));
    if (landing[1] <= position[1] + EPSILON) return undefined;

    // Follow the tangent plane at the landing. The host either proves this
    // entire path (including clearance), reports an obstruction, or names the
    // geometry it cannot prove. Never substitute a handful of point samples.
    const widthTravel: MutableVec3 = [direction[0] * stepWidth, 0, direction[2] * stepWidth];
    widthTravel[1] = -dotVec3(widthTravel, support.normal) / support.normal[1];
    if (!widthTravel.every(Number.isFinite)) throw new Error("Character autostep support path exceeds the finite numeric range.");
    if (landing[1] + widthTravel[1] > raised[1] + EPSILON) return undefined;
    if (!host.certifySupportPath) throw new Error("Autostep selection is unsupported without a continuous support certificate.");
    const certificate = host.certifySupportPath({
      body, collider, origin: copy(landing), displacement: copy(widthTravel), offset,
      maxSlopeClimbAngle: maxSlope, includeDynamicBodies: stepDynamic, requireCenterSupport: true
    });
    if (certificate.status === "blocked") return undefined;
    if (certificate.status === "unsupported") {
      // A gap in the conservative planar intervals fails this candidate, but
      // does not assert that all possible curved contacts are absent.
      if (certificate.firstUncovered !== undefined) return undefined;
      throw new Error(`Autostep selection is unsupported: ${certificate.reason}`);
    }

    // The room probe may look past this frame's desired movement, but the
    // actual position must never advance farther than the caller requested.
    const available = Math.max(0, horizontalLength - dotVec3(retreat, direction));
    const travelled = Math.min(entryDistance, available);
    const actualEntry = addVec3(raised, scaleVec3(direction, travelled));
    const actualSupport = cast(actualEntry, down);
    if (!actualSupport || !canWalk(actualSupport.normal) || (actualSupport.body.type === "dynamic" && !stepDynamic)) return undefined;
    const actualLanding = addVec3(actualEntry, scaleVec3(down, actualSupport.fraction));
    if (actualLanding[1] <= position[1] + EPSILON) return undefined;
    return {
      position: copy(actualLanding),
      remaining: [rest[0] - retreat[0] - direction[0] * travelled, rest[1], rest[2] - retreat[2] - direction[2] * travelled]
    };
  };

  const controller: PhysicsCharacterController = {
    bodyId: body.id,
    setAutoStep(height, minWidth, includeDynamicBodies = false) {
      assertActive();
      const h = number(height, "autostep height");
      const width = number(minWidth, "autostep minimum width");
      const dynamic = bool(includeDynamicBodies, "autostep includeDynamicBodies");
      stepHeight = h; stepWidth = width; stepDynamic = dynamic;
      return controller;
    },
    setMaxSlopeClimbAngle(value) { assertActive(); maxSlope = angle(value, "maximum climb angle"); return controller; },
    setMinSlopeSlideAngle(value) { assertActive(); minSlide = angle(value, "minimum slide angle"); return controller; },
    setSnapToGround(value) { assertActive(); snapDistance = number(value, "snap distance"); return controller; },
    setSlideEnabled(value) { assertActive(); slideEnabled = bool(value, "slideEnabled"); return controller; },
    setCharacterMass(value) { assertActive(); characterMass = number(value, "character mass", Number.EPSILON); return controller; },
    setApplyImpulsesToDynamicBodies(value) { assertActive(); pushDynamic = bool(value, "applyImpulsesToDynamicBodies"); return controller; },
    move(desired): PhysicsCharacterMovement {
      assertActive();
      validateFiniteVec3(desired, "character movement");
      const start = copy(body.position);
      let position = copy(start);
      let remaining = copy(desired);
      let landed = false;
      let wasGrounded = grounded;
      if (!wasGrounded && stepHeight > EPSILON && desired[1] <= 0 && Math.hypot(desired[0], desired[2]) > EPSILON) {
        const ground = cast(start, [0, -offset * 1.5, 0]);
        wasGrounded = !!ground && canWalk(ground.normal) && ground.fraction * offset * 1.5 <= EPSILON;
      }
      let collisions = 0;
      const pushes: Array<{ body: RigidBody; point: Vec3; impulse: Vec3 }> = [];
      const contactNormals: MutableVec3[] = [];
      for (let iteration = 0; iteration < 8 && lengthVec3(remaining) > EPSILON; iteration += 1) {
        const hit = cast(position, remaining);
        if (!hit) { position = addVec3(position, remaining); remaining = [0, 0, 0]; break; }
        collisions += 1;
        const travelled = scaleVec3(remaining, hit.fraction);
        // Previous contacts constrain a shared corner only while no meaningful
        // travel has carried the character away from that contact location.
        if (lengthVec3(travelled) > EPSILON) contactNormals.length = 0;
        position = addVec3(position, travelled);
        let rest = scaleVec3(remaining, 1 - hit.fraction);
        if (canWalk(hit.normal) && remaining[1] <= 0) landed = true;
        if (!canWalk(hit.normal) && (wasGrounded || landed) && stepHeight > EPSILON &&
          Math.hypot(rest[0], rest[2]) > EPSILON && (hit.body.type !== "dynamic" || stepDynamic)) {
          const stepped = tryStep(position, rest, hit);
          if (stepped) {
            position = stepped.position;
            remaining = stepped.remaining;
            landed = true;
            contactNormals.length = 0;
            continue;
          }
        }
        if (pushDynamic && hit.body.type === "dynamic") {
          const arm = subVec3(hit.point, nativeCenterOfMass(hit.body));
          const obstacleVelocity = addVec3(hit.body.velocity, cross(hit.body.angularVelocity, arm));
          const relative = subVec3(scaleVec3(remaining, 1 / host.fixedDelta), obstacleVelocity);
          const approach = Math.max(0, -dotVec3(relative, hit.normal));
          const angular = nativeInverseInertia(hit.body, cross(arm, hit.normal));
          const denominator = 1 / characterMass + hit.body.inverseMass + dotVec3(hit.normal, cross(angular, arm));
          const impulse = approach / denominator;
          if (!Number.isFinite(impulse)) throw new Error("Character push produces a non-finite impulse.");
          if (impulse > 0) pushes.push({ body: hit.body, point: hit.point, impulse: scaleVec3(hit.normal, -impulse) });
        }
        const into = dotVec3(rest, hit.normal);
        if (!slideEnabled) rest = [0, 0, 0];
        else if (into < 0) rest = subVec3(rest, scaleVec3(hit.normal, into));
        const slopeAngle = Math.acos(Math.max(-1, Math.min(1, hit.normal[1])));
        if (slideEnabled && hit.normal[1] > 0 && !canWalk(hit.normal) && rest[1] > 0) {
          // A steep face cannot turn horizontal movement into upward climbing.
          const wall = normalizeVec3([hit.normal[0], 0, hit.normal[2]]);
          rest[1] = Math.min(0, remaining[1]);
          const intoWall = dotVec3(rest, wall);
          if (intoWall < 0) rest = subVec3(rest, scaleVec3(wall, intoWall));
        } else if (hit.normal[1] > 0 && remaining[1] < 0 && Math.hypot(remaining[0], remaining[2]) <= EPSILON &&
          (!slideEnabled || slopeAngle < minSlide)) {
          rest = [0, 0, 0];
        }
        if (slideEnabled) {
          // Successive projections onto two non-orthogonal contacts can
          // alternately push into each other. Resolve their intersection in
          // one step, preserving the component along their shared edge.
          for (const previous of contactNormals) {
            if (dotVec3(rest, previous) >= -EPSILON) continue;
            const edge = cross(hit.normal, previous);
            const edgeLength = lengthVec3(edge);
            if (edgeLength > EPSILON) {
              const axis = scaleVec3(edge, 1 / edgeLength);
              rest = scaleVec3(axis, dotVec3(rest, axis));
            } else {
              const intoPrevious = dotVec3(rest, previous);
              if (intoPrevious < 0) rest = subVec3(rest, scaleVec3(previous, intoPrevious));
            }
            if (contactNormals.some((normal) => dotVec3(rest, normal) < -EPSILON) || dotVec3(rest, hit.normal) < -EPSILON) {
              rest = [0, 0, 0];
              break;
            }
          }
          if (!contactNormals.some((normal) => dotVec3(normal, hit.normal) > 1 - EPSILON)) contactNormals.push(copy(hit.normal));
        }
        const stoppedProgress = hit.fraction <= EPSILON && lengthVec3(subVec3(rest, remaining)) <= EPSILON;
        remaining = rest;
        if (stoppedProgress) break;
      }
      if (lengthVec3(remaining) > EPSILON) throw new Error("Character movement exceeded its collision-iteration limit; no movement was applied.");
      let finalGrounded = false;
      if (desired[1] <= 0) {
        const probeDistance = Math.max(offset * 1.5, snapDistance);
        const down: Vec3 = [0, -probeDistance, 0];
        const ground = cast(position, down);
        if (ground && canWalk(ground.normal)) {
          const distance = probeDistance * ground.fraction;
          if (snapDistance > 0 && distance <= snapDistance + EPSILON && (grounded || landed || desired[1] < 0)) {
            position = addVec3(position, scaleVec3(down, ground.fraction));
            finalGrounded = true;
          } else if (distance <= EPSILON) finalGrounded = true;
        }
      }
      // Queries above are side-effect-free, so a validation error cannot leave a partial move.
      body.setPosition(position);
      for (const push of pushes) nativeApplyImpulseAtPoint(push.body, push.impulse, push.point);
      grounded = finalGrounded;
      return { requested: copy(desired), applied: subVec3(position, start), grounded, collisions, position: copy(position) };
    },
    position() { assertActive(); return copy(body.position); },
    grounded() { assertActive(); return grounded; },
    resetTo(position) {
      assertActive();
      validateFiniteVec3(position, "character reset position");
      body.setPosition(position);
      body.previousPosition = copy(position);
      body.setVelocity([0, 0, 0]);
      body.setAngularVelocity([0, 0, 0]);
      grounded = false;
      return copy(position);
    },
    dispose() { disposed = true; }
  };
  return controller;
}
