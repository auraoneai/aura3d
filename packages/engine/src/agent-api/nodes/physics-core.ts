// Physics operations parameterized by the importing entry's world access.

import type { AuraVec3, AuraColor, AuraTransformSpec, AuraSceneNode, AuraModelNode, AuraPrimitiveNode, AuraNodePhysicsSpec, AuraPhysicsStepOptions, AuraPhysicsDebugSnapshot, AuraPhysicsSceneSummary, AuraPhysicsWorldController, AuraSceneSnapshot } from "./types.js";
import type { ColliderDescriptor, CollisionEvent, Constraint, ConstraintDescriptor, Contact, DebugLine, PhysicsShape, PhysicsSnapshot, PhysicsWorldDescriptor, RaycastHit, RaycastOptions, RigidBody, RigidBodyDescriptor, PhysicsVehicleController, PhysicsWheelSpec, PhysicsCharacterController, PhysicsCharacterControllerDescriptor, ScenePhysicsNode, SphereCastHit } from "@aura3d/physics/solverless";
import type { AuraSceneBuilder } from "./scene.js";
import { PhysicsDebugDraw, PhysicsStepper, ScenePhysicsBridge, Shape as PhysicsShapeFactory } from "@aura3d/physics/solverless";
import type { PhysicsWorld } from "@aura3d/physics/solverless";
import type { PhysicsWorldAccess, PhysicsWorldConstructor } from "../physics/PhysicsWorldAccess.js";
import { markAuraLazySystemLoaded, markAuraLazySystemRequested } from "../lazySystemEvidence.js";
import { material } from "./material.js";
import { performanceNow } from "../platform.js";
import { primitive, primitives } from "./primitives.js";
import { primitiveSize, flattenSceneSnapshot, scaleToVec3, normalizeSceneSnapshot, resolveModelFitScale, shouldNormalizeModelNode } from "../sceneMath.js";
import { composeTRSInto, decomposeMatrix, localMatrixOf, multiplyMat4Into } from "../sceneGraph.js";
import { assertValidPivot, assertValidPivotTree, hasNonzeroPivot } from "../pivotGuard.js";
import { parentTransformOf, worldTransformOf } from "../compiler/sceneGraph.js";
import { round } from "../GameRuntimeCore.js";
import { normalizeGeometryAttributes, type AuraCustomGeometrySpec } from "../RootGeometry.js";

type AuraPhysicsBodyOptions = RigidBodyDescriptor & {
  readonly shape?: PhysicsShape;
  readonly sensor?: boolean;
  readonly material?: ColliderDescriptor["material"];
  readonly filter?: ColliderDescriptor["filter"];
};

/**
 * Physics bodies are centred on the rendered geometry (or custom-geometry
 * bounds) centre. Pivoted hierarchies, fitted models, instances and look-at
 * need additional collider and parent-motion contracts; reject them before
 * allocating a world. A single root box — including one with custom geometry
 * or a transform animation — has a complete rigid mapping in both renderer
 * paths, and its collider is rebuilt when its pivot, scale, size or geometry
 * changes (see {@link pivotPhysicsColliderSync}).
 */
export function assertScenePhysicsPivotSupport(nodes: readonly AuraSceneNode[]): void {
  assertValidPivotTree(nodes);
  const finiteVector = (value: unknown): value is AuraVec3 => Array.isArray(value) && value.length === 3 && Array.from(value).every((item) => typeof item === "number" && Number.isFinite(item));
  const visit = (node: AuraSceneNode, parented: boolean, ancestorPivot: boolean): void => {
    const pivot = "pivot" in node ? node.pivot : undefined;
    assertValidPivot(pivot);
    const ownPivot = hasNonzeroPivot(pivot);
    if (node.kind === "group") {
      for (const child of node.children) visit(child, true, ancestorPivot || ownPivot);
      return;
    }
    if ((node.kind !== "model" && node.kind !== "primitive") || !node.physics) return;
    const inherited = parentTransformOf(node)?.hasPivot === true;
    const instancePivot = node.instances?.some((instance) => hasNonzeroPivot(instance.pivot)) === true;
    if (!ancestorPivot && !ownPivot && !inherited && !instancePivot) return;
    const scale = scaleToVec3(node.scale);
    const position = node.position ?? [0, 0, 0];
    const rotation = node.rotation ?? [0, 0, 0];
    const size = node.kind === "primitive" ? primitiveSize(node) : undefined;
    const halfSize = finiteVector(size) && finiteVector(scale)
      ? size.map((value, axis) => value * scale[axis]! * 0.5)
      : [];
    const manualBox = node.physics.shape === "box" || node.physics.halfExtents !== undefined;
    const manualHalfSize = node.physics.halfExtents ?? [0.5, 0.5, 0.5];
    const matchingCollider = halfSize.length === 3 && halfSize.every((value) => Number.isFinite(value) && value >= 0.02) &&
      (!manualBox || (finiteVector(manualHalfSize) && halfSize.every((value, axis) =>
        Math.abs(value - manualHalfSize[axis]!) <= Math.max(1e-7, Math.abs(value) * 1e-6))));
    const supported = !parented && !ancestorPivot && ownPivot && node.kind === "primitive" && node.primitive === "box" &&
      (node.geometry === undefined || pivotedGeometryBounds(node) !== undefined) && node.instances === undefined && node.lookAt === undefined &&
      node.quaternion === undefined && (node.rotationOrder === undefined || node.rotationOrder === "ZYX") &&
      (node.physics.shape === undefined || node.physics.shape === "box") &&
      finiteVector(scale) && scale.every((value) => value > 0) && finiteVector(position) && finiteVector(rotation) &&
      finiteVector(size) && size.every((value) => value > 0) && matchingCollider &&
      parentTransformOf(node) === undefined && worldTransformOf(node) === undefined;
    if (!supported) {
      throw new RangeError("PIVOT_PHYSICS_UNSUPPORTED: pivoted physics supports only an unparented, finite, positive-scale box without instances or look-at.");
    }
    // Overflow must be detected before any world or body is allocated.
    nodePhysicsPosition(node);
    resolveNodePhysicsShape(node, node.physics);
  };
  for (const node of nodes) visit(node, false, false);
}

type PivotColliderWorld = Pick<PhysicsWorld, "createCollider" | "removeCollider" | "colliders">;

/** Result of replacing a pivoted body's collider. */
export interface PivotPhysicsColliderRebuild {
  /** Collider centre in the body frame (custom-geometry bounds centre), if any. */
  readonly offset: AuraVec3 | undefined;
  /** Whether the node carries a nonzero pivot after the rebuild. */
  readonly pivoted: boolean;
}

/**
 * Stage-then-commit collider synchronization for a root primitive body that is
 * (or becomes) pivoted. `prepare` validates the current node against the
 * supported pivoted-physics contract and, when the pivot, scale, size or custom
 * geometry differ from the collider that was built, returns a commit that
 * replaces the body's colliders and reseats the body at the drawn geometry
 * centre. Nothing is mutated until every staged commit is known to succeed.
 * Nodes that were never pivoted keep the unpivoted semantics (no rebuild).
 * Changing the physics declaration itself still requires a scene rebuild.
 */
export function pivotPhysicsColliderSync(node: AuraModelNode | AuraPrimitiveNode):
  ((world: PivotColliderWorld, body: RigidBody) => (() => PivotPhysicsColliderRebuild) | undefined) | undefined {
  if (node.kind !== "primitive" && !hasNonzeroPivot(node.pivot)) return undefined;
  const physics = node.physics;
  const bodyType = physics?.type;
  let built = pivotColliderKey(node);
  return (world, body) => {
    const pivoted = hasNonzeroPivot(node.pivot);
    if (!pivoted && !built.pivoted) return undefined;
    if (node.physics !== physics || node.physics?.type !== bodyType) {
      throw new RangeError("PIVOT_PHYSICS_UNSUPPORTED: changing a pivoted body's physics declaration requires rebuilding the scene.");
    }
    if (pivoted) assertScenePhysicsPivotSupport([node]);
    const next = pivotColliderKey(node);
    if (samePivotColliderKey(next, built)) return undefined;
    const spec = node.physics!;
    const shape = resolveNodePhysicsShape(node, spec);
    const offset = resolveNodePhysicsOffset(node);
    const position = nodePhysicsPosition(node, offset);
    return () => {
      for (const collider of world.colliders()) if (collider.bodyId === body.id) world.removeCollider(collider.id);
      world.createCollider(body, {
        shape,
        ...(spec.sensor === undefined ? {} : { sensor: spec.sensor }),
        material: { friction: spec.friction ?? 0.5, restitution: spec.restitution ?? 0 }
      });
      body.setPosition(position);
      built = next;
      return { offset, pivoted };
    };
  };
}

interface PivotColliderKey {
  readonly pivoted: boolean;
  readonly values: readonly number[];
  readonly geometry: unknown;
}

function pivotColliderKey(node: AuraModelNode | AuraPrimitiveNode): PivotColliderKey {
  const pivot = node.pivot ?? [0, 0, 0];
  const size = node.kind === "primitive" ? primitiveSize(node) : [1, 1, 1];
  return {
    pivoted: hasNonzeroPivot(node.pivot),
    values: [...pivot, ...scaleToVec3(node.scale), ...size],
    geometry: node.kind === "primitive" ? node.geometry : undefined
  };
}

function samePivotColliderKey(a: PivotColliderKey, b: PivotColliderKey): boolean {
  return a.pivoted === b.pivoted && a.geometry === b.geometry && a.values.every((value, index) => Object.is(value, b.values[index]));
}

/**
 * Bounds of a pivoted primitive's custom geometry in the node's scaled frame
 * (positions ⊙ size ⊙ scale), used as its box collider when no explicit
 * physics shape is declared. Undefined when the geometry is absent or invalid.
 */
function pivotedGeometryBounds(node: AuraModelNode | AuraPrimitiveNode): { readonly halfExtents: AuraVec3; readonly centre: AuraVec3 } | undefined {
  if (node.kind !== "primitive" || node.geometry === undefined || !hasNonzeroPivot(node.pivot)) return undefined;
  let positions: ArrayLike<number>;
  try {
    positions = normalizeGeometryAttributes(node.geometry as AuraCustomGeometrySpec).positions;
  } catch {
    return undefined;
  }
  if (positions.length < 3) return undefined;
  const size = primitiveSize(node);
  const scale = scaleToVec3(node.scale);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index + 2 < positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = positions[index + axis]! * size[axis]! * scale[axis]!;
      if (!Number.isFinite(value)) return undefined;
      if (value < min[axis]!) min[axis] = value;
      if (value > max[axis]!) max[axis] = value;
    }
  }
  return {
    halfExtents: [0, 1, 2].map((axis) => Math.max(0.02, (max[axis]! - min[axis]!) * 0.5)) as unknown as AuraVec3,
    centre: [0, 1, 2].map((axis) => (max[axis]! + min[axis]!) * 0.5) as unknown as AuraVec3
  };
}

function usesPivotedGeometryCollider(node: AuraModelNode | AuraPrimitiveNode): boolean {
  const spec = node.physics;
  return node.kind === "primitive" && spec !== undefined && spec.shape === undefined && spec.halfExtents === undefined &&
    spec.radius === undefined && spec.halfHeight === undefined && pivotedGeometryBounds(node) !== undefined;
}

/**
 * Translate between a model's authored origin and the centre of its box. The
 * offset is already scaled in the body's local frame; it must rotate with the
 * body, including when the solver writes a new orientation back to the scene.
 */
export function offsetPhysicsPosition(
  position: AuraVec3,
  rotation: readonly [number, number, number, number],
  offset: AuraVec3,
  direction: 1 | -1
): AuraVec3 {
  const length = Math.hypot(...rotation);
  if (!position.every(Number.isFinite) || !rotation.every(Number.isFinite) || !Number.isFinite(length) || length === 0) {
    throw new RangeError("MODEL_COLLIDER_UNSUPPORTED_TRANSFORM: model physics requires a finite position and nonzero rotation.");
  }
  const q = rotation.map((value) => value / length) as [number, number, number, number];
  const matrix = composeTRSInto(new Float32Array(16), [0, 0, 0], q, [1, 1, 1]);
  const result: AuraVec3 = [
    position[0] + direction * (matrix[0]! * offset[0] + matrix[4]! * offset[1] + matrix[8]! * offset[2]),
    position[1] + direction * (matrix[1]! * offset[0] + matrix[5]! * offset[1] + matrix[9]! * offset[2]),
    position[2] + direction * (matrix[2]! * offset[0] + matrix[6]! * offset[1] + matrix[10]! * offset[2])
  ];
  if (!result.every(Number.isFinite) || !Float32Array.from(result).every(Number.isFinite)) {
    throw new RangeError("MODEL_COLLIDER_UNSUPPORTED_TRANSFORM: the model bounds centre must be finite.");
  }
  return result;
}

/** Physics origin for a supported pivoted box or a bounds-derived model. */
export function nodePhysicsPosition(node: AuraModelNode | AuraPrimitiveNode, modelOffset?: AuraVec3): AuraVec3 {
  if (!hasNonzeroPivot(node.pivot)) {
    const origin = node.position ?? [0, 0, 0];
    const offset = modelOffset ?? resolveNodePhysicsOffset(node);
    return offset ? offsetPhysicsPosition(origin, nodeRotationQuaternion(node), offset, 1) : origin;
  }
  let matrix: Float32Array;
  try {
    matrix = localMatrixOf(node, new Float32Array(16));
  } catch (error) {
    if (error instanceof RangeError && error.message.startsWith("PIVOT_UNSUPPORTED_NONFINITE")) {
      throw new RangeError("PIVOT_PHYSICS_UNSUPPORTED: pivoted pose is not finite.");
    }
    throw error;
  }
  if (!matrix.every(Number.isFinite)) throw new RangeError("PIVOT_PHYSICS_UNSUPPORTED: pivoted pose is not finite.");
  const origin: AuraVec3 = [matrix[12]!, matrix[13]!, matrix[14]!];
  const offset = modelOffset ?? resolveNodePhysicsOffset(node);
  return offset ? offsetPhysicsPosition(origin, nodeRotationQuaternion(node), offset, 1) : origin;
}

/** Recover authored translation from a rigid body's geometry-centred pose. */
export function nodePositionFromPhysics(node: AuraModelNode | AuraPrimitiveNode, position: AuraVec3, rotation: readonly [number, number, number, number], modelOffset?: AuraVec3): AuraVec3 {
  if (!hasNonzeroPivot(node.pivot)) {
    const offset = modelOffset ?? resolveNodePhysicsOffset(node);
    return offset ? offsetPhysicsPosition(position, rotation, offset, -1) : [position[0], position[1], position[2]];
  }
  const pivot = node.pivot!;
  const offset = modelOffset ?? resolveNodePhysicsOffset(node);
  // The body sits at the collider centre; recover the geometry origin first.
  if (offset) position = offsetPhysicsPosition(position, rotation, offset, -1);
  const matrix = composeTRSInto(new Float32Array(16), [0, 0, 0], rotation, scaleToVec3(node.scale));
  const result: AuraVec3 = [
    position[0] - pivot[0] + matrix[0]! * pivot[0] + matrix[4]! * pivot[1] + matrix[8]! * pivot[2],
    position[1] - pivot[1] + matrix[1]! * pivot[0] + matrix[5]! * pivot[1] + matrix[9]! * pivot[2],
    position[2] - pivot[2] + matrix[2]! * pivot[0] + matrix[6]! * pivot[1] + matrix[10]! * pivot[2]
  ];
  if (!result.every(Number.isFinite) || !Float32Array.from(result).every(Number.isFinite)) {
    throw new RangeError("PIVOT_PHYSICS_UNSUPPORTED: rigid pose cannot be represented by a finite pivoted translation.");
  }
  return result;
}

function toRigidBodyDescriptor(options: AuraPhysicsBodyOptions): RigidBodyDescriptor {
  const { shape: _shape, sensor: _sensor, material: _material, filter: _filter, ...bodyDescriptor } = options;
  return bodyDescriptor;
}

function createPhysicsDebugNodes(snapshot: PhysicsSnapshot, lines: readonly DebugLine[]): readonly AuraSceneNode[] {
  const nodes: AuraSceneNode[] = [];
  const bodyPositions = new Map(snapshot.bodies.map((body) => [body.id, body.position] as const));

  lines.slice(0, 80).forEach((line, index) => {
    const midpoint: AuraVec3 = [
      (line.from[0] + line.to[0]) / 2,
      (line.from[1] + line.to[1]) / 2,
      (line.from[2] + line.to[2]) / 2
    ];
    const dx = line.to[0] - line.from[0];
    const dz = line.to[2] - line.from[2];
    const length = Math.max(0.04, Math.hypot(dx, line.to[1] - line.from[1], dz));
    nodes.push(primitives.box({
      name: `physics collider debug line ${index + 1}`,
      material: material.emissive({ color: debugLineColor(line.color), emissive: debugLineColor(line.color), opacity: 0.72 })
    }).position(...midpoint).rotate(0, -Math.atan2(dz, dx), 0).scale([length, 0.012, 0.012]).toJSON());
  });

  snapshot.contacts.slice(0, 32).forEach((contact, index) => {
    const a = bodyPositions.get(contact.bodyA) ?? [0, 0, 0] as const;
    const b = bodyPositions.get(contact.bodyB) ?? a;
    const midpoint: AuraVec3 = [
      (a[0] + b[0]) / 2,
      (a[1] + b[1]) / 2,
      (a[2] + b[2]) / 2
    ];
    const color = contact.sensor ? "#facc15" : "#ff5151";
    nodes.push(
      primitives.sphere({
        name: `${contact.sensor ? "sensor" : "solid"} physics contact patch ${index + 1}`,
        material: material.emissive({ color, emissive: color, opacity: 0.82 })
      }).position(...midpoint).scale(Math.max(0.045, 0.05 + contact.penetration * 0.2)).toJSON(),
      primitives.box({
        name: `physics contact normal vector ${index + 1}`,
        material: material.emissive({ color: "#ff5151", emissive: "#ff5151" })
      }).position(
        midpoint[0] + contact.normal[0] * 0.12,
        midpoint[1] + contact.normal[1] * 0.12,
        midpoint[2] + contact.normal[2] * 0.12
      ).rotate(0, -Math.atan2(contact.normal[2], contact.normal[0]), 0).scale([0.28, 0.016, 0.016]).toJSON()
    );
  });

  snapshot.bodies.slice(0, 80).forEach((body, index) => {
    const color = body.sleeping ? "#64748b" : body.type === "dynamic" ? "#22c55e" : "#60a5fa";
    nodes.push(primitives.sphere({
      name: `${body.sleeping ? "sleeping" : "active"} physics body state indicator ${index + 1}`,
      material: material.emissive({ color, emissive: color, opacity: 0.76 })
    }).position(body.position[0], body.position[1] + 0.12, body.position[2]).scale(0.045).toJSON());
  });

  return nodes;
}

function debugLineColor(color: readonly [number, number, number]): AuraColor {
  const channel = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 255).toString(16).padStart(2, "0");
  return `#${channel(color[0])}${channel(color[1])}${channel(color[2])}`;
}

/** Copy authored descriptors so later caller mutations cannot alter reset state. */
function copyPhysicsDescriptor<T>(value: T): T {
  if (Array.isArray(value)) return value.map(copyPhysicsDescriptor) as T;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, copyPhysicsDescriptor(entry)])) as T;
  }
  return value;
}

function createPhysicsWorldController(
  descriptor: PhysicsWorldDescriptor,
  World: PhysicsWorldConstructor,
  beforeSimulationHook?: (colliders: PivotColliderWorld) => void
): AuraPhysicsWorldController {
  const worldDescriptor = copyPhysicsDescriptor(descriptor);
  let world = new World(worldDescriptor);
  const bridge = new ScenePhysicsBridge();
  const debugDraw = new PhysicsDebugDraw();
  let disposed = false;
  let resetCount = 0;

  type BodyRecord = { readonly id: number; readonly descriptor: RigidBodyDescriptor; live: RigidBody; proxy: RigidBody };
  type ConstraintRecord = { readonly bodyAId: number; readonly bodyBId: number; readonly options: Omit<ConstraintDescriptor, "bodyA" | "bodyB">; live: Constraint; proxy: Constraint };
  const bodyRecords: BodyRecord[] = [];
  const colliderRecords: Array<{ readonly id: number; readonly bodyId: number; readonly descriptor: ColliderDescriptor }> = [];
  const constraintRecords: ConstraintRecord[] = [];
  const vehicleRecords: Array<{
    readonly chassisId: number;
    readonly wheels: PhysicsWheelSpec[];
    axes: { up: 0 | 1 | 2; forward: 0 | 1 | 2 } | null;
    live: PhysicsVehicleController;
    disposed: boolean;
  }> = [];
  const characterRecords: Array<{
    readonly bodyId: number;
    descriptor: PhysicsCharacterControllerDescriptor;
    live: PhysicsCharacterController;
    disposed: boolean;
  }> = [];

  const assertActive = (): void => {
    if (disposed) throw new Error("Aura physics world has been disposed.");
  };
  const bodyRecord = (body: RigidBody | number): BodyRecord => {
    assertActive();
    const record = typeof body === "number"
      ? bodyRecords.find((entry) => entry.id === body)
      : bodyRecords.find((entry) => entry.proxy === body);
    if (!record) throw new Error(`Body ${typeof body === "number" ? body : body.id} does not belong to this Aura physics world.`);
    return record;
  };
  // This stable view keeps bridge ownership intact when reset swaps the solver.
  const bridgeWorld = { getBody: (id: number) => bodyRecords.find((entry) => entry.id === id)?.live };

  // Collider replacement keeps reset() records in step with the live world.
  const colliderOwner: PivotColliderWorld = {
    colliders: () => world.colliders(),
    removeCollider: (id) => {
      world.removeCollider(id);
      const index = colliderRecords.findIndex((record) => record.id === id);
      if (index >= 0) colliderRecords.splice(index, 1);
    },
    createCollider: (body, descriptor) => controller.createCollider(body, descriptor)
  };
  const beforeSimulation = beforeSimulationHook ? () => beforeSimulationHook(colliderOwner) : undefined;
  const controller: AuraPhysicsWorldController = {
    kind: "aura-physics-world",
    createBody(options: AuraPhysicsBodyOptions = {}) {
      assertActive();
      if (!options.shape && (options.sensor !== undefined || options.material !== undefined || options.filter !== undefined)) {
        throw new Error("A body sensor, material or filter requires a shape; alternatively call createCollider().");
      }
      const bodyDescriptor = copyPhysicsDescriptor(toRigidBodyDescriptor(options));
      const body = world.createRigidBody(bodyDescriptor);
      let collider: ReturnType<PhysicsWorld["createCollider"]> | undefined;
      const colliderDescriptor = options.shape ? copyPhysicsDescriptor({
        shape: options.shape, sensor: options.sensor, material: options.material, filter: options.filter
      } satisfies ColliderDescriptor) : undefined;
      try {
        if (colliderDescriptor) collider = world.createCollider(body, colliderDescriptor);
      } catch (error) {
        world.removeRigidBody(body.id);
        throw error;
      }
      const record = { id: body.id, descriptor: bodyDescriptor, live: body } as BodyRecord;
      record.proxy = new Proxy(body, {
        get(_target, key) {
          assertActive();
          const value = Reflect.get(record.live, key, record.live);
          return typeof value === "function" ? value.bind(record.live) : value;
        },
        set(_target, key, value) {
          assertActive();
          return Reflect.set(record.live, key, value, record.live);
        }
      });
      bodyRecords.push(record);
      if (collider && colliderDescriptor) colliderRecords.push({ id: collider.id, bodyId: record.id, descriptor: colliderDescriptor });
      return record.proxy;
    },
    getBody(id) {
      assertActive();
      return bodyRecords.find((entry) => entry.id === id)?.proxy;
    },
    createCollider(body, descriptor) {
      const record = bodyRecord(body);
      const copied = copyPhysicsDescriptor(descriptor);
      const collider = world.createCollider(record.live, copied);
      colliderRecords.push({ id: collider.id, bodyId: record.id, descriptor: copied });
      return collider;
    },
    createConstraint(descriptor) {
      const bodyA = bodyRecord(descriptor.bodyA);
      const bodyB = bodyRecord(descriptor.bodyB);
      const { bodyA: _a, bodyB: _b, ...options } = descriptor;
      const copied = copyPhysicsDescriptor(options);
      const live = world.createConstraint({ ...copied, bodyA: bodyA.live, bodyB: bodyB.live });
      const record = { bodyAId: bodyA.id, bodyBId: bodyB.id, options: copied, live } as ConstraintRecord;
      record.proxy = new Proxy(live, {
        get(_target, key) {
          assertActive();
          if (key === "bodyA") return bodyRecord(record.bodyAId).proxy;
          if (key === "bodyB") return bodyRecord(record.bodyBId).proxy;
          const value = Reflect.get(record.live, key, record.live);
          return typeof value === "function" ? value.bind(record.live) : value;
        },
        set(_target, key, value) {
          assertActive();
          return Reflect.set(record.live, key, value, record.live);
        }
      });
      constraintRecords.push(record);
      return record.proxy;
    },
    createVehicleController(chassis, wheels = []) {
      const chassisRecord = bodyRecord(chassis);
      const handle = world.createVehicleController(chassisRecord.live);
      try { for (const spec of wheels) handle.addWheel(spec); }
      catch (error) { handle.dispose(); throw error; }
      const record = { chassisId: chassisRecord.id, wheels: copyPhysicsDescriptor([...wheels]), axes: null as { up: 0 | 1 | 2; forward: 0 | 1 | 2 } | null, live: handle, disposed: false };
      vehicleRecords.push(record);
      const target = () => {
        assertActive();
        if (record.disposed) throw new Error("Physics vehicle controller has been disposed.");
        return record.live;
      };
      const proxy: PhysicsVehicleController = {
        get wheelCount() { return target().wheelCount; },
        addWheel: (spec) => { target().addWheel(spec); record.wheels.push(copyPhysicsDescriptor(spec)); return proxy; },
        setWheelTuning: (i, tuning) => { target().setWheelTuning(i, tuning); record.wheels[i] = { ...record.wheels[i]!, ...copyPhysicsDescriptor(tuning) }; return proxy; },
        setWheelCommand: (i, command) => { target().setWheelCommand(i, command); return proxy; },
        setBrakes: (brake) => { target().setBrakes(brake); return proxy; },
        setAxes: (up, forward) => { target().setAxes(up, forward); record.axes = { up, forward }; return proxy; },
        wheelState: (i) => target().wheelState(i),
        wheelStates: () => target().wheelStates(),
        isGrounded: () => target().isGrounded(),
        groundedWheelCount: () => target().groundedWheelCount(),
        currentSpeed: () => target().currentSpeed(),
        step: (dt) => target().step(dt),
        position: () => target().position(),
        rotation: () => target().rotation(),
        linearVelocity: () => target().linearVelocity(),
        angularVelocity: () => target().angularVelocity(),
        resetToPose: (pose) => { target().resetToPose(pose); return proxy; },
        clearCommands: () => { target().clearCommands(); return proxy; },
        dispose: () => {
          if (record.disposed) return;
          target().dispose();
          record.disposed = true;
        }
      };
      return proxy;
    },
    createCharacterController(body, descriptor = {}) {
      const recordBody = bodyRecord(body);
      const handle = world.createCharacterController(recordBody.live, descriptor);
      const record = { bodyId: recordBody.id, descriptor: copyPhysicsDescriptor(descriptor), live: handle, disposed: false };
      characterRecords.push(record);
      const target = () => {
        assertActive();
        if (record.disposed) throw new Error("Physics character controller has been disposed.");
        return record.live;
      };
      const proxy: PhysicsCharacterController = {
        get bodyId() { target(); return record.bodyId; },
        setAutoStep: (height, width, dynamic) => { target().setAutoStep(height, width, dynamic); record.descriptor = { ...record.descriptor, autoStepHeight: height, autoStepMinWidth: width, autoStepIncludeDynamicBodies: dynamic }; return proxy; },
        setMaxSlopeClimbAngle: (radians) => { target().setMaxSlopeClimbAngle(radians); record.descriptor = { ...record.descriptor, maxSlopeClimbAngle: radians }; return proxy; },
        setMinSlopeSlideAngle: (radians) => { target().setMinSlopeSlideAngle(radians); record.descriptor = { ...record.descriptor, minSlopeSlideAngle: radians }; return proxy; },
        setSnapToGround: (distance) => { target().setSnapToGround(distance); record.descriptor = { ...record.descriptor, snapToGroundDistance: distance }; return proxy; },
        setSlideEnabled: (enabled) => { target().setSlideEnabled(enabled); record.descriptor = { ...record.descriptor, slideEnabled: enabled }; return proxy; },
        setCharacterMass: (mass) => { target().setCharacterMass(mass); record.descriptor = { ...record.descriptor, characterMass: mass }; return proxy; },
        setApplyImpulsesToDynamicBodies: (enabled) => { target().setApplyImpulsesToDynamicBodies(enabled); record.descriptor = { ...record.descriptor, applyImpulsesToDynamicBodies: enabled }; return proxy; },
        move: (desired) => target().move(desired),
        position: () => target().position(),
        grounded: () => target().grounded(),
        resetTo: (position) => target().resetTo(position),
        dispose: () => {
          if (record.disposed) return;
          target().dispose();
          record.disposed = true;
        }
      };
      return proxy;
    },
    bindNode(body, node, mode = "dynamic") {
      const record = bodyRecord(body);
      if (mode === "kinematic" && record.live.type !== "kinematic") throw new Error("A kinematic scene binding requires a kinematic body.");
      if (mode === "dynamic" && record.live.type !== "dynamic") throw new Error("A dynamic scene binding requires a dynamic body.");
      bridge.bind({ bodyId: record.id, node, mode });
    },
    unbindNode(body) { bridge.unbind(bodyRecord(body).id); },
    step(options: number | AuraPhysicsStepOptions = {}) {
      assertActive();
      const resolved = typeof options === "number" ? { dt: options, steps: 1 } : options;
      const steps = resolved.steps ?? 1;
      const dt = resolved.dt ?? world.fixedDelta;
      if (!Number.isInteger(steps) || steps <= 0) throw new Error("Physics step count must be a positive integer.");
      if (!Number.isFinite(dt) || dt <= 0) throw new Error("Physics step dt must be finite and positive.");
      beforeSimulation?.();
      bridge.pushKinematic(bridgeWorld);
      const events: CollisionEvent[] = [];
      for (let index = 0; index < steps; index += 1) events.push(...world.step(dt));
      bridge.pullDynamic(bridgeWorld, 1);
      return events;
    },
    reset() {
      assertActive();
      beforeSimulation?.();
      const next = new World(worldDescriptor);
      const bodies = new Map<number, RigidBody>();
      const constraints: Constraint[] = [];
      const vehicles: PhysicsVehicleController[] = [];
      const characters: PhysicsCharacterController[] = [];
      try {
        // Preserve externally visible numeric IDs, including holes left by a rejected creation.
        let nextBodyId = 1;
        for (const record of bodyRecords) {
          while (nextBodyId < record.id) { const placeholder = next.createRigidBody(); next.removeRigidBody(placeholder.id); nextBodyId++; }
          bodies.set(record.id, next.createRigidBody(copyPhysicsDescriptor(record.descriptor)));
          nextBodyId++;
        }
        let nextColliderId = 1;
        for (const record of colliderRecords) {
          const body = bodies.get(record.bodyId)!;
          while (nextColliderId < record.id) {
            const placeholder = next.createCollider(body, { shape: PhysicsShapeFactory.sphere(0.5) });
            next.removeCollider(placeholder.id);
            nextColliderId++;
          }
          next.createCollider(body, copyPhysicsDescriptor(record.descriptor));
          nextColliderId++;
        }
        for (const record of constraintRecords) {
          const options = copyPhysicsDescriptor(record.options);
          const constraint = next.createConstraint({
            ...options,
            ...(options.type === "motorised-hinge" ? { motorSpeed: record.live.motorSpeed() } : {}),
            bodyA: bodies.get(record.bodyAId)!, bodyB: bodies.get(record.bodyBId)!
          });
          constraint.setEnabled(record.live.isEnabled());
          constraints.push(constraint);
        }
        for (const record of vehicleRecords) {
          if (record.disposed) continue;
          const handle = next.createVehicleController(bodies.get(record.chassisId)!);
          for (const wheel of record.wheels) handle.addWheel(copyPhysicsDescriptor(wheel));
          if (record.axes) handle.setAxes(record.axes.up, record.axes.forward);
          vehicles.push(handle);
        }
        for (const record of characterRecords) {
          if (!record.disposed) characters.push(next.createCharacterController(bodies.get(record.bodyId)!, copyPhysicsDescriptor(record.descriptor)));
        }
      } catch (error) {
        next.dispose();
        throw error;
      }
      const previous = world;
      world = next;
      for (const record of bodyRecords) record.live = bodies.get(record.id)!;
      constraintRecords.forEach((record, index) => { record.live = constraints[index]!; });
      let vehicleIndex = 0;
      for (const record of vehicleRecords) if (!record.disposed) record.live = vehicles[vehicleIndex++]!;
      let characterIndex = 0;
      for (const record of characterRecords) if (!record.disposed) record.live = characters[characterIndex++]!;
      previous.dispose();
      bridge.pullDynamic(bridgeWorld, 1);
      resetCount += 1;
    },
    dispose() {
      if (disposed) return;
      bridge.dispose();
      world.dispose();
      disposed = true;
    },
    contacts() { assertActive(); beforeSimulation?.(); return world.snapshot().contacts; },
    liveContactCount() { assertActive(); beforeSimulation?.(); return world.snapshot().contacts.length; },
    raycast(origin, direction, options) { assertActive(); beforeSimulation?.(); return world.raycast(origin, direction, options); },
    sphereCast(origin, radius, direction, options) { assertActive(); beforeSimulation?.(); return world.sphereCast(origin, radius, direction, options); },
    debug() {
      assertActive();
      beforeSimulation?.();
      const snapshot = world.snapshot();
      const lines = debugDraw.buildLines(world);
      return { bodyCount: snapshot.stats.bodies, colliderCount: snapshot.stats.colliders, contactCount: snapshot.contacts.length, sleepingBodyCount: snapshot.stats.sleepingBodies, lines, nodes: createPhysicsDebugNodes(snapshot, lines) };
    },
    debugNodes() { assertActive(); beforeSimulation?.(); const snapshot = world.snapshot(); return createPhysicsDebugNodes(snapshot, debugDraw.buildLines(world)); },
    snapshot() {
      assertActive();
      beforeSimulation?.();
      const snapshot = world.snapshot();
      return { kind: "aura-physics-world", backend: snapshot.backend, bodies: snapshot.stats.bodies, colliders: snapshot.stats.colliders, contacts: snapshot.contacts.length, steps: snapshot.stats.steps, resets: resetCount, debugLines: debugDraw.buildLines(world).length, snapshot };
    }
  };
  return controller;
}

function resolveAgentPhysicsShape(spec: AuraNodePhysicsSpec): PhysicsShape {
  if (spec.density !== undefined) throw new Error("Physics node density is not supported; supply an explicit mass instead.");
  if (typeof spec.shape === "object" && spec.shape !== null) {
    if (spec.halfExtents || spec.radius !== undefined || spec.halfHeight !== undefined || spec.normal || spec.constant !== undefined) {
      throw new Error("A complete physics shape cannot be combined with shape-specific dimensions.");
    }
    return spec.shape;
  }
  if (spec.shape === null) throw new Error("Physics shape cannot be null.");
  const shape = spec.shape ?? "box";
  if (shape !== "box" && spec.halfExtents !== undefined) throw new Error("halfExtents applies only to box physics shapes.");
  if (shape !== "sphere" && shape !== "capsule" && spec.radius !== undefined) throw new Error("radius applies only to sphere or capsule physics shapes.");
  if (shape !== "capsule" && spec.halfHeight !== undefined) throw new Error("halfHeight applies only to capsule physics shapes.");
  if (shape !== "plane" && (spec.normal !== undefined || spec.constant !== undefined)) throw new Error("normal and constant apply only to plane physics shapes.");
  if (shape === "sphere") return PhysicsShapeFactory.sphere(spec.radius ?? 0.5);
  if (shape === "capsule") return PhysicsShapeFactory.capsule(spec.radius ?? 0.25, spec.halfHeight ?? 0.55);
  if (shape === "plane") return PhysicsShapeFactory.plane(spec.normal ?? [0, 1, 0], spec.constant ?? 0);
  if (shape !== "box") throw new Error(`Unsupported physics shape '${String(shape)}'. Use a shape created by physics.mesh(), physics.convexHull(), or physics.heightfield().`);
  const halfExtents = spec.halfExtents ?? [0.5, 0.5, 0.5];
  return PhysicsShapeFactory.box(halfExtents[0], halfExtents[1], halfExtents[2]);
}

function createPhysicsWorldFromScene(
  sceneValue: AuraSceneBuilder | AuraSceneSnapshot,
  descriptor: PhysicsWorldDescriptor,
  World: PhysicsWorldConstructor
): AuraPhysicsWorldController {
  const snapshot = normalizeSceneSnapshot(sceneValue);
  assertScenePhysicsPivotSupport(snapshot.nodes);
  const assertModelHierarchy = (nodes: readonly AuraSceneNode[], parented: boolean): void => {
    for (const node of nodes) {
      if (node.kind === "group") assertModelHierarchy(node.children, true);
      else if (parented && (node.kind === "model" || node.kind === "primitive") && usesModelBoundsCollider(node)) {
        // This standalone bridge flattens into detached nodes; it has no live
        // ancestor binding to push/pull a model pose after the first step.
        throw new RangeError("MODEL_COLLIDER_UNSUPPORTED_PARENT: worldFromScene requires bounds-collider models at the scene root.");
      }
    }
  };
  assertModelHierarchy(snapshot.nodes, false);
  const flattened = flattenSceneSnapshot(snapshot).nodes;
  assertScenePhysicsPivotSupport(flattened);
  // One body per instance (S5-WP19-04): instanced physics nodes expand first.
  const nodes = expandScenePhysicsInstances(flattened);
  const guards = nodes.flatMap((node) => {
    if ((node.kind !== "model" && node.kind !== "primitive") || !node.physics) return [];
    // Validate before allocating the solver, including the offset and pose.
    if (usesModelBoundsCollider(node)) nodePhysicsPosition(node);
    const guard = fixedModelBoundsPhysicsGuard(node);
    return guard ? [guard] : [];
  });
  const colliderSyncs: Array<{ readonly body: RigidBody; readonly prepare: NonNullable<ReturnType<typeof pivotPhysicsColliderSync>> }> = [];
  const controller = createPhysicsWorldController(descriptor, World, (colliders) => {
    for (const guard of guards) guard();
    // Stage every replacement before mutating any collider.
    const commits = colliderSyncs.flatMap(({ body, prepare }) => { const commit = prepare(colliders, body); return commit ? [commit] : []; });
    for (const commit of commits) commit();
  });
  try {
    for (const { node, body } of populatePhysicsWorldFromScene(controller, nodes)) {
      const prepare = pivotPhysicsColliderSync(node);
      if (prepare) colliderSyncs.push({ body, prepare });
    }
    return controller;
  } catch (error) {
    controller.dispose();
    throw error;
  }
}

function createPhysicsNamespace(access: PhysicsWorldAccess) {
  const requireWorld = (): PhysicsWorldConstructor => access.requireReady();
  const preloadWorld = (): Promise<void> => access.preload();
  return {
    world: (descriptor: PhysicsWorldDescriptor = {}): AuraPhysicsWorldController => createPhysicsWorldController(descriptor, requireWorld()),
    worldAsync: async (descriptor: PhysicsWorldDescriptor = {}): Promise<AuraPhysicsWorldController> => {
      markAuraLazySystemRequested("physics-backend", "physics.worldAsync");
      const started = performanceNow();
      await preloadWorld();
      markAuraLazySystemLoaded("physics-backend", performanceNow() - started);
      return createPhysicsWorldController(descriptor, requireWorld());
    },
    worldFromScene: (sceneValue: AuraSceneBuilder | AuraSceneSnapshot, descriptor: PhysicsWorldDescriptor = {}): AuraPhysicsWorldController => {
      return createPhysicsWorldFromScene(sceneValue, descriptor, requireWorld());
    },
    worldFromSceneAsync: async (sceneValue: AuraSceneBuilder | AuraSceneSnapshot, descriptor: PhysicsWorldDescriptor = {}): Promise<AuraPhysicsWorldController> => {
      markAuraLazySystemRequested("physics-backend", "physics.worldFromSceneAsync");
      const started = performanceNow();
      await preloadWorld();
      markAuraLazySystemLoaded("physics-backend", performanceNow() - started);
      return createPhysicsWorldFromScene(sceneValue, descriptor, requireWorld());
    },
    body: (options: AuraPhysicsBodyOptions = {}): AuraPhysicsBodyOptions => ({ ...options }),
    collider: (descriptor: ColliderDescriptor): ColliderDescriptor => descriptor,
    box: (x = 0.5, y = 0.5, z = 0.5): PhysicsShape => PhysicsShapeFactory.box(x, y, z),
    sphere: (radius = 0.5): PhysicsShape => PhysicsShapeFactory.sphere(radius),
    capsule: (radius = 0.25, halfHeight = 0.55): PhysicsShape => PhysicsShapeFactory.capsule(radius, halfHeight),
    plane: (normal: AuraVec3 = [0, 1, 0], constant = 0): PhysicsShape => PhysicsShapeFactory.plane(normal, constant),
    mesh: (vertices: readonly AuraVec3[], indices: readonly number[]): PhysicsShape => PhysicsShapeFactory.mesh(vertices, indices),
    convexHull: (vertices: readonly AuraVec3[], indices: readonly number[]): PhysicsShape => PhysicsShapeFactory.convexHull(vertices, indices),
    heightfield: (rows: readonly (readonly number[])[], cellSize = 1): PhysicsShape => PhysicsShapeFactory.heightfield(rows, cellSize),
    constraint: (descriptor: ConstraintDescriptor): ConstraintDescriptor => descriptor,
    bindNode: (world: AuraPhysicsWorldController, body: RigidBody | number, node: ScenePhysicsNode, mode?: "dynamic" | "kinematic"): void => world.bindNode(body, node, mode),
    unbindNode: (world: AuraPhysicsWorldController, body: RigidBody | number): void => world.unbindNode(body),
    dispose: (world: AuraPhysicsWorldController): void => world.dispose(),
    step: (world: AuraPhysicsWorldController, options?: number | AuraPhysicsStepOptions): readonly CollisionEvent[] => world.step(options),
    contacts: (world: AuraPhysicsWorldController): readonly Contact[] => world.contacts(),
    liveContactCount: (world: AuraPhysicsWorldController): number => world.liveContactCount(),
    raycast: (world: AuraPhysicsWorldController, origin: AuraVec3, direction: AuraVec3, options?: RaycastOptions): RaycastHit | undefined => world.raycast(origin, direction, options),
    sphereCast: (world: AuraPhysicsWorldController, origin: AuraVec3, radius: number, direction: AuraVec3, options?: RaycastOptions): SphereCastHit | undefined => world.sphereCast(origin, radius, direction, options),
    debug: (world: AuraPhysicsWorldController): AuraPhysicsDebugSnapshot => world.debug(),
    debugNodes: (world: AuraPhysicsWorldController): readonly AuraSceneNode[] => world.debugNodes(),
    sceneBinding: (node: ScenePhysicsNode): ScenePhysicsNode => node,
    nodeSpec: (spec: AuraNodePhysicsSpec): AuraNodePhysicsSpec => spec,
    resolveShape: resolveAgentPhysicsShape
  } as const;
}

/** @internal Build a physics namespace owned by one entry's access object. */
export function createPhysicsWithAccess(access: PhysicsWorldAccess): ReturnType<typeof createPhysicsNamespace> {
  if (!access || typeof access.preload !== "function" || typeof access.requireReady !== "function") {
    throw new TypeError("A physics world access with preload() and requireReady() is required.");
  }
  return createPhysicsNamespace(access);
}

export interface AuraRuntimeScenePhysics {
  bindObject(node: AuraModelNode | AuraPrimitiveNode, object: {
    position?: { set(x: number, y: number, z: number): void };
    quaternion?: { set(x: number, y: number, z: number, w: number): void };
  }): void;
  step(deltaSeconds: number): void;
  dispose(): void;
}

/** The batch node and instance slot an expanded per-instance physics node came from. */
export interface InstancePhysicsOrigin {
  readonly batch: AuraModelNode | AuraPrimitiveNode;
  readonly index: number;
  /** The batch node's world matrix the instance transform was composed with. */
  readonly batchMatrix: Float32Array;
}

const instancePhysicsOrigins = new WeakMap<object, InstancePhysicsOrigin>();

/** Where an expanded per-instance physics node came from, if it is one. */
export function instancePhysicsOriginOf(node: object): InstancePhysicsOrigin | undefined {
  return instancePhysicsOrigins.get(node);
}

function batchWorldMatrix(node: AuraModelNode | AuraPrimitiveNode): Float32Array {
  const world = worldTransformOf(node);
  if (world) return new Float32Array(world.matrix);
  return localMatrixOf({
    ...(node.position ? { position: node.position } : {}),
    ...(node.rotation ? { rotation: node.rotation } : {}),
    ...(node.rotationOrder ? { rotationOrder: node.rotationOrder } : {}),
    ...(node.quaternion ? { quaternion: node.quaternion } : {}),
    ...(node.scale !== undefined ? { scale: node.scale } : {})
  }, new Float32Array(16));
}

/**
 * S5-WP19-04: an instanced node (`instances.model`, `instances.<primitive>`)
 * with physics gets one rigid body per instance. Each instance's transform is
 * composed with the batch node's transform into a detached single node (no
 * `instances`) that every body builder consumes unchanged, so the collider
 * option, explicit shapes and bounds colliders resolve per instance. Returns
 * undefined for a node without instances; an empty batch expands to no nodes.
 */
export function expandInstancePhysicsNodes(node: AuraModelNode | AuraPrimitiveNode): readonly (AuraModelNode | AuraPrimitiveNode)[] | undefined {
  const transforms = node.instances;
  if (transforms === undefined || !node.physics) return undefined;
  if (node.lookAt !== undefined) {
    throw new RangeError("INSTANCE_PHYSICS_UNSUPPORTED_LOOK_AT: a physics instance batch cannot use lookAt; use a rotation or quaternion.");
  }
  const batchMatrix = batchWorldMatrix(node);
  const {
    instances: _instances, instanceColors: _colors, ...rest
  } = node as AuraModelNode & { instances?: unknown; instanceColors?: unknown };
  const base = { ...rest } as Record<string, unknown>;
  for (const key of ["instanceCulling", "instanceLod", "placements", "instanceWind", "instanceColorTarget", "rotation", "rotationOrder", "quaternion", "lookAt"]) delete base[key];
  return transforms.map((transform, index) => {
    if (transform.lookAt !== undefined) {
      throw new RangeError(`INSTANCE_PHYSICS_UNSUPPORTED_LOOK_AT: instance ${index} of a physics batch cannot use lookAt; use a rotation or quaternion.`);
    }
    const composed = new Float32Array(16);
    multiplyMat4Into(composed, batchMatrix, localMatrixOf(transform, new Float32Array(16)));
    const world = decomposeMatrix(composed);
    if (world.sheared || !composed.every(Number.isFinite) || !world.quaternion.every(Number.isFinite) ||
        world.scale.some((value) => !Number.isFinite(value) || value === 0)) {
      throw new RangeError(`PHYSICS_UNSUPPORTED_WORLD_TRANSFORM: instance ${index} of a physics batch has a sheared, singular, or non-finite world transform.`);
    }
    const length = Math.hypot(...world.quaternion);
    const quaternion = world.quaternion.map((value) => value / length) as [number, number, number, number];
    const expanded = {
      ...base,
      ...(node.name !== undefined ? { name: `${node.name}[${index}]` } : {}),
      position: [world.position[0], world.position[1], world.position[2]] as AuraVec3,
      quaternion,
      scale: [world.scale[0], world.scale[1], world.scale[2]] as AuraVec3
    } as unknown as AuraModelNode | AuraPrimitiveNode;
    instancePhysicsOrigins.set(expanded, { batch: node, index, batchMatrix });
    return expanded;
  });
}

/** Expand every instanced physics node in a flat list into its per-instance nodes. */
export function expandScenePhysicsInstances(nodes: readonly AuraSceneNode[]): AuraSceneNode[] {
  return nodes.flatMap((node): AuraSceneNode[] => (node.kind === "model" || node.kind === "primitive") ? [...(expandInstancePhysicsNodes(node) ?? [node])] : [node]);
}

function invertAffineInto(out: Float32Array, m: Float32Array): Float32Array {
  const [a00, a01, a02, , a10, a11, a12, , a20, a21, a22, , tx, ty, tz] = m as unknown as number[];
  const b01 = a22 * a11 - a12 * a21, b11 = -a22 * a10 + a12 * a20, b21 = a21 * a10 - a11 * a20;
  const det = a00 * b01 + a01 * b11 + a02 * b21;
  if (!Number.isFinite(det) || det === 0) throw new RangeError("PHYSICS_UNSUPPORTED_WORLD_TRANSFORM: an instance batch transform is singular.");
  const inv = 1 / det;
  out[0] = b01 * inv; out[1] = (-a22 * a01 + a02 * a21) * inv; out[2] = (a12 * a01 - a02 * a11) * inv; out[3] = 0;
  out[4] = b11 * inv; out[5] = (a22 * a00 - a02 * a20) * inv; out[6] = (-a12 * a00 + a02 * a10) * inv; out[7] = 0;
  out[8] = b21 * inv; out[9] = (-a21 * a00 + a01 * a20) * inv; out[10] = (a11 * a00 - a01 * a10) * inv; out[11] = 0;
  out[12] = -(out[0] * tx! + out[4] * ty! + out[8] * tz!);
  out[13] = -(out[1] * tx! + out[5] * ty! + out[9] * tz!);
  out[14] = -(out[2] * tx! + out[6] * ty! + out[10] * tz!);
  out[15] = 1;
  return out;
}

/**
 * Map a per-instance body pose back to the batch's local instance transform
 * (the inverse of {@link expandInstancePhysicsNodes}); the instance keeps its
 * authored scale, rotation convention and pivot.
 */
export function instanceTransformFromPhysics(
  expanded: AuraModelNode | AuraPrimitiveNode,
  bodyPosition: AuraVec3,
  bodyRotation: readonly [number, number, number, number],
  modelOffset?: AuraVec3
): AuraTransformSpec {
  const origin = instancePhysicsOrigins.get(expanded);
  if (!origin) throw new Error("INSTANCE_PHYSICS_UNBOUND: node is not an expanded physics instance.");
  const authored = origin.batch.instances?.[origin.index] ?? {};
  const worldOrigin = nodePositionFromPhysics(expanded, bodyPosition, bodyRotation, modelOffset);
  const world = composeTRSInto(new Float32Array(16), worldOrigin, bodyRotation, scaleToVec3(expanded.scale));
  const local = new Float32Array(16);
  multiplyMat4Into(local, invertAffineInto(new Float32Array(16), origin.batchMatrix), world);
  const pose = decomposeMatrix(local);
  const length = Math.hypot(...pose.quaternion);
  const quaternion = pose.quaternion.map((value) => value / length) as [number, number, number, number];
  const next: { -readonly [K in keyof AuraTransformSpec]: AuraTransformSpec[K] } = { ...authored, position: [local[12]!, local[13]!, local[14]!] };
  writeNodeRotationFromBody(next, quaternion, (euler) => { next.rotation = euler; });
  return next;
}

function populatePhysicsWorldFromScene(controller: AuraPhysicsWorldController, nodes: readonly AuraSceneNode[]): Array<{ readonly node: AuraModelNode | AuraPrimitiveNode; readonly body: RigidBody }> {
  const created: Array<{ readonly node: AuraModelNode | AuraPrimitiveNode; readonly body: RigidBody }> = [];
  for (const node of nodes) {
    if ((node.kind !== "model" && node.kind !== "primitive") || !node.physics) continue;
    const body = controller.createBody({
      type: node.physics.type ?? "dynamic",
      position: nodePhysicsPosition(node),
      rotation: nodeRotationQuaternion(node),
      mass: node.physics.mass,
      friction: node.physics.friction,
      restitution: node.physics.restitution,
      shape: resolveNodePhysicsShape(node, node.physics),
      sensor: node.physics.sensor,
      material: {
        friction: node.physics.friction ?? 0.5,
        restitution: node.physics.restitution ?? 0
      }
    });
    created.push({ node, body });
    if (node.physics.type !== "static") {
      const origin = instancePhysicsOriginOf(node);
      controller.bindNode(body, origin ? instancePhysicsNodeAdapter(node, origin) : scenePhysicsNodeAdapter(node), node.physics.type === "kinematic" ? "kinematic" : "dynamic");
    }
  }
  return created;
}

/** Write a per-instance body back into its batch's instance transform (and the expanded node). */
function instancePhysicsNodeAdapter(node: AuraModelNode | AuraPrimitiveNode, origin: InstancePhysicsOrigin): ScenePhysicsNode {
  const offset = resolveNodePhysicsOffset(node);
  let pendingPosition: AuraVec3 | undefined;
  return {
    getWorldPosition: () => nodePhysicsPosition(node, offset),
    getWorldQuaternion: () => nodeRotationQuaternion(node),
    setWorldPosition: (position) => { pendingPosition = [position[0], position[1], position[2]]; },
    setWorldQuaternion: (rotation) => {
      const position = pendingPosition ?? nodePhysicsPosition(node, offset);
      pendingPosition = undefined;
      writeInstancePhysicsPose(node, origin, position, rotation, offset);
    }
  };
}

function writeInstancePhysicsPose(
  node: AuraModelNode | AuraPrimitiveNode,
  origin: InstancePhysicsOrigin,
  position: AuraVec3,
  rotation: readonly [number, number, number, number],
  offset: AuraVec3 | undefined
): void {
  const local = instanceTransformFromPhysics(node, position, rotation, offset);
  (node as { position?: AuraVec3 }).position = nodePositionFromPhysics(node, position, rotation, offset);
  (node as { quaternion?: readonly [number, number, number, number] }).quaternion = [rotation[0], rotation[1], rotation[2], rotation[3]];
  const instances = origin.batch.instances as AuraTransformSpec[] | undefined;
  if (instances && origin.index < instances.length) instances[origin.index] = local;
}

function scenePhysicsNodeAdapter(node: AuraModelNode | AuraPrimitiveNode): ScenePhysicsNode {
  let pendingPosition: AuraVec3 | undefined;
  const initialOffset = resolveNodePhysicsOffset(node);
  // A primitive's custom-geometry collider centre follows a collider rebuild.
  const offsetOf = (): AuraVec3 | undefined => node.kind === "primitive" ? resolveNodePhysicsOffset(node) : initialOffset;
  return {
    getWorldPosition: () => nodePhysicsPosition(node, offsetOf()),
    getWorldQuaternion: () => {
      const nodeWithPhysicsRotation = node as { physicsRotation?: readonly [number, number, number, number] };
      return nodeWithPhysicsRotation.physicsRotation ?? nodeRotationQuaternion(node);
    },
    setWorldPosition: (position) => {
      if (hasNonzeroPivot(node.pivot) || offsetOf()) {
        // The bridge publishes position before rotation; wait for both so the
        // pivot compensation uses the same interpolated rigid-body pose.
        pendingPosition = [position[0], position[1], position[2]];
        return;
      }
      (node as { position?: AuraVec3 }).position = [position[0], position[1], position[2]];
    },
    setWorldQuaternion: (rotation) => {
      if (pendingPosition) {
        (node as { position?: AuraVec3 }).position = nodePositionFromPhysics(node, pendingPosition, rotation, offsetOf());
        pendingPosition = undefined;
      }
      (node as { physicsRotation?: readonly [number, number, number, number] }).physicsRotation = [rotation[0], rotation[1], rotation[2], rotation[3]];
      writeNodeRotationFromBody(node, rotation, (euler) => {
        (node as { rotation?: AuraVec3 }).rotation = euler;
      });
    }
  };
}

/** @internal Bind a scene runtime to one entry's physics access. */
export function createRuntimeScenePhysicsWithAccess(
  access: PhysicsWorldAccess,
  snapshot: AuraSceneSnapshot
): AuraRuntimeScenePhysics | undefined {
  return createRuntimeScenePhysicsUsing(snapshot, () => access.requireReady());
}

function createRuntimeScenePhysicsUsing(
  snapshot: AuraSceneSnapshot,
  requireWorld: () => PhysicsWorldConstructor
): AuraRuntimeScenePhysics | undefined {
  assertScenePhysicsPivotSupport(snapshot.nodes);
  const physicsNodes = expandScenePhysicsInstances(snapshot.nodes).filter((node): node is AuraModelNode | AuraPrimitiveNode =>
    (node.kind === "model" || node.kind === "primitive") && Boolean(node.physics)
  );
  if (physicsNodes.length === 0) return undefined;
  for (const node of physicsNodes) {
    if (usesModelBoundsCollider(node)) nodePhysicsPosition(node);
  }

  const World = requireWorld();
  const world = new World({ gravity: [0, -9.81, 0], fixedDelta: 1 / 60, enableSleeping: true });
  try {
    return createRuntimeScenePhysicsForWorld(snapshot, physicsNodes, world);
  } catch (error) {
    world.dispose();
    throw error;
  }
}

function createRuntimeScenePhysicsForWorld(
  snapshot: AuraSceneSnapshot,
  physicsNodes: readonly (AuraModelNode | AuraPrimitiveNode)[],
  world: PhysicsWorld
): AuraRuntimeScenePhysics {
  const stepper = new PhysicsStepper(world.fixedDelta);
  const debugDraw = new PhysicsDebugDraw();
  let disposed = false;
  const bindings: Array<{
    readonly node: AuraModelNode | AuraPrimitiveNode;
    readonly body: RigidBody;
    readonly syncCollider?: NonNullable<ReturnType<typeof pivotPhysicsColliderSync>>;
    readonly checkModel?: () => void;
    modelOffset?: AuraVec3;
    object?: {
      position?: { set(x: number, y: number, z: number): void };
      quaternion?: { set(x: number, y: number, z: number, w: number): void };
    };
  }> = [];

  for (const node of physicsNodes) {
    const spec = node.physics;
    if (!spec) continue;
    const modelOffset = resolveNodePhysicsOffset(node);
    const body = world.createRigidBody({
      type: spec.type ?? "dynamic",
      position: nodePhysicsPosition(node, modelOffset),
      rotation: nodeRotationQuaternion(node),
      mass: spec.mass,
      friction: spec.friction,
      restitution: spec.restitution,
      linearDamping: spec.type === "dynamic" ? 0.08 : undefined,
      angularDamping: spec.type === "dynamic" ? 0.08 : undefined
    });
    world.createCollider(body, {
      shape: resolveNodePhysicsShape(node, spec),
      sensor: spec.sensor,
      material: {
        friction: spec.friction ?? 0.5,
        restitution: spec.restitution ?? 0
      }
    });
    const syncCollider = pivotPhysicsColliderSync(node);
    const checkModel = fixedModelBoundsPhysicsGuard(node);
    bindings.push({ node, body, ...(syncCollider ? { syncCollider } : {}), ...(checkModel ? { checkModel } : {}), ...(modelOffset ? { modelOffset } : {}) });
  }

  const writeSummary = () => {
    const worldSnapshot = world.snapshot();
    (snapshot as { physics?: AuraPhysicsSceneSummary }).physics = {
      kind: "aura-physics-world",
      backend: worldSnapshot.backend,
      bodies: worldSnapshot.stats.bodies,
      colliders: worldSnapshot.stats.colliders,
      contacts: worldSnapshot.contacts.length,
      steps: worldSnapshot.stats.steps,
      resets: 0,
      debugLines: debugDraw.buildLines(world).length,
      snapshot: worldSnapshot
    };
  };
  writeSummary();

  return {
    bindObject(node, object) {
      if (disposed) throw new Error("Runtime scene physics has been disposed.");
      const binding = bindings.find((entry) => entry.node === node);
      if (binding) binding.object = object;
    },
    step(deltaSeconds) {
      if (disposed) throw new Error("Runtime scene physics has been disposed.");
      if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) throw new Error("Runtime physics delta must be finite and non-negative.");
      const colliderCommits: Array<() => void> = [];
      for (const binding of bindings) {
        const commit = binding.syncCollider?.(world, binding.body);
        if (commit) colliderCommits.push(() => {
          const { offset } = commit();
          if (offset) binding.modelOffset = offset; else delete binding.modelOffset;
        });
        binding.checkModel?.();
        if (binding.modelOffset && binding.body.type !== "static" && parentTransformOf(binding.node)) {
          throw new RangeError("MODEL_COLLIDER_UNSUPPORTED_PARENT: preview physics cannot synchronize a moving bounds collider through a parent.");
        }
      }
      // Every replacement was validated above; rebuild the changed colliders.
      for (const commit of colliderCommits) commit();
      for (const binding of bindings) {
        if (binding.body.type !== "kinematic") continue;
        binding.body.setPosition(nodePhysicsPosition(binding.node, binding.modelOffset));
        binding.body.setRotation(nodeRotationQuaternion(binding.node));
      }
      const clampedDelta = Math.max(0, Math.min(0.12, deltaSeconds));
      const result = stepper.advance(clampedDelta, world);
      if (result.steps === 0) return;
      for (const binding of bindings) {
        if (binding.body.type !== "dynamic") continue;
        const position = [binding.body.position[0], binding.body.position[1], binding.body.position[2]] as AuraVec3;
        const rotation = binding.body.rotation;
        const instanceOrigin = instancePhysicsOriginOf(binding.node);
        if (instanceOrigin) {
          writeInstancePhysicsPose(binding.node, instanceOrigin, position, rotation, binding.modelOffset);
          continue;
        }
        const nodePosition = nodePositionFromPhysics(binding.node, position, rotation, binding.modelOffset);
        (binding.node as { position?: AuraVec3 }).position = nodePosition;
        (binding.node as { physicsRotation?: readonly [number, number, number, number] }).physicsRotation = [rotation[0], rotation[1], rotation[2], rotation[3]];
        if (hasNonzeroPivot(binding.node.pivot) || binding.modelOffset) {
          writeNodeRotationFromBody(binding.node, rotation, (euler) => { (binding.node as { rotation?: AuraVec3 }).rotation = euler; });
        }
        const objectPosition = binding.modelOffset ? nodePosition : position;
        binding.object?.position?.set(objectPosition[0], objectPosition[1], objectPosition[2]);
        binding.object?.quaternion?.set(rotation[0], rotation[1], rotation[2], rotation[3]);
      }
      writeSummary();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      bindings.length = 0;
      world.dispose();
    }
  };
}

type AuraPhysicsEulerOrder = "XYZ" | "YXZ" | "ZXY" | "ZYX" | "YZX" | "XZY";
type AuraPhysicsQuat = readonly [number, number, number, number];

/**
 * Node rotation as the renderer composes it: `quaternion` wins, otherwise `rotation` in the
 * node's `rotationOrder` (default "ZYX", `Rz·Ry·Rx`, see `sceneGraph.ts`). Physics bodies are
 * seeded from this so a rotated body starts where the node is drawn (anim-phys-01).
 */
export function nodeRotationQuaternion(node: {
  readonly rotation?: AuraVec3 | undefined;
  readonly rotationOrder?: AuraPhysicsEulerOrder | undefined;
  readonly quaternion?: AuraPhysicsQuat | undefined;
}): AuraPhysicsQuat {
  if (node.quaternion) return [node.quaternion[0], node.quaternion[1], node.quaternion[2], node.quaternion[3]];
  return orderedEulerToQuat(node.rotation ?? [0, 0, 0], node.rotationOrder ?? "ZYX");
}

/** Sign of the second term of x, y, z, w per Euler order (three.js `setFromEuler`). */
const EULER_QUAT_SIGNS: Readonly<Record<AuraPhysicsEulerOrder, readonly [number, number, number, number]>> = {
  XYZ: [1, -1, 1, -1],
  YXZ: [1, -1, -1, 1],
  ZXY: [-1, 1, 1, -1],
  ZYX: [-1, 1, -1, 1],
  YZX: [1, 1, -1, -1],
  XZY: [-1, -1, 1, 1]
};

/** Euler -> quaternion for any order, three.js `Quaternion.setFromEuler` semantics. */
export function orderedEulerToQuat(euler: AuraVec3, order: AuraPhysicsEulerOrder): AuraPhysicsQuat {
  const c1 = Math.cos(euler[0] / 2);
  const c2 = Math.cos(euler[1] / 2);
  const c3 = Math.cos(euler[2] / 2);
  const s1 = Math.sin(euler[0] / 2);
  const s2 = Math.sin(euler[1] / 2);
  const s3 = Math.sin(euler[2] / 2);
  const [sx, sy, sz, sw] = EULER_QUAT_SIGNS[order];
  return [
    s1 * c2 * c3 + sx * c1 * s2 * s3,
    c1 * s2 * c3 + sy * s1 * c2 * s3,
    c1 * c2 * s3 + sz * s1 * s2 * c3,
    c1 * c2 * c3 + sw * s1 * s2 * s3
  ];
}

/** Quaternion -> Euler in `order`, three.js `Euler.setFromRotationMatrix` semantics. */
export function quatToOrderedEuler(rotation: AuraPhysicsQuat, order: AuraPhysicsEulerOrder): AuraVec3 {
  const [x, y, z, w] = rotation;
  const m11 = 1 - 2 * (y * y + z * z), m12 = 2 * (x * y - w * z), m13 = 2 * (x * z + w * y);
  const m21 = 2 * (x * y + w * z), m22 = 1 - 2 * (x * x + z * z), m23 = 2 * (y * z - w * x);
  const m31 = 2 * (x * z - w * y), m32 = 2 * (y * z + w * x), m33 = 1 - 2 * (x * x + y * y);
  const clamp = (value: number) => Math.min(1, Math.max(-1, value));
  const nearPole = (value: number) => Math.abs(value) >= 0.9999999;
  switch (order) {
    case "XYZ": {
      const ey = Math.asin(clamp(m13));
      return nearPole(m13) ? [Math.atan2(m32, m22), ey, 0] : [Math.atan2(-m23, m33), ey, Math.atan2(-m12, m11)];
    }
    case "YXZ": {
      const ex = Math.asin(-clamp(m23));
      return nearPole(m23) ? [ex, Math.atan2(-m31, m11), 0] : [ex, Math.atan2(m13, m33), Math.atan2(m21, m22)];
    }
    case "ZXY": {
      const ex = Math.asin(clamp(m32));
      return nearPole(m32) ? [ex, 0, Math.atan2(m21, m11)] : [ex, Math.atan2(-m31, m33), Math.atan2(-m12, m22)];
    }
    case "ZYX": {
      const ey = Math.asin(-clamp(m31));
      return nearPole(m31) ? [0, ey, Math.atan2(-m12, m22)] : [Math.atan2(m32, m33), ey, Math.atan2(m21, m11)];
    }
    case "YZX": {
      const ez = Math.asin(clamp(m21));
      return nearPole(m21) ? [0, Math.atan2(m13, m33), ez] : [Math.atan2(-m23, m22), Math.atan2(-m31, m11), ez];
    }
    case "XZY": {
      const ez = Math.asin(-clamp(m12));
      return nearPole(m12) ? [Math.atan2(-m23, m33), 0, ez] : [Math.atan2(m32, m22), Math.atan2(m13, m11), ez];
    }
  }
}

/**
 * Write a body's world rotation back onto a scene node in the convention the renderer reads:
 * a quaternion-authored node gets its quaternion, otherwise `rotation` in its `rotationOrder`.
 */
export function writeNodeRotationFromBody(
  target: object,
  rotation: AuraPhysicsQuat,
  setRotation: (euler: AuraVec3) => void
): void {
  const node = target as { quaternion?: AuraPhysicsQuat | undefined; rotationOrder?: AuraPhysicsEulerOrder | undefined };
  if (node.quaternion) {
    node.quaternion = [rotation[0], rotation[1], rotation[2], rotation[3]];
  }
  setRotation(quatToOrderedEuler(rotation, node.rotationOrder ?? "ZYX"));
}

/**
 * XYZ-order (`Rx·Ry·Rz`) Euler -> quaternion. Kept for existing callers; it is NOT the
 * renderer's default order. Seed physics bodies from scene nodes with `nodeRotationQuaternion`.
 */
export function eulerToQuat(rotation: AuraVec3): readonly [number, number, number, number] {
  const [x, y, z] = rotation;
  const c1 = Math.cos(x / 2);
  const c2 = Math.cos(y / 2);
  const c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2);
  const s2 = Math.sin(y / 2);
  const s3 = Math.sin(z / 2);
  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3
  ];
}

export function quatToEuler(rotation: readonly [number, number, number, number]): AuraVec3 {
  const [x, y, z, w] = rotation;
  const sinrCosp = 2 * (w * x + y * z);
  const cosrCosp = 1 - 2 * (x * x + y * y);
  const roll = Math.atan2(sinrCosp, cosrCosp);
  const sinp = 2 * (w * y - z * x);
  const pitch = Math.abs(sinp) >= 1 ? Math.sign(sinp) * Math.PI / 2 : Math.asin(sinp);
  const sinyCosp = 2 * (w * z + x * y);
  const cosyCosp = 1 - 2 * (y * y + z * z);
  const yaw = Math.atan2(sinyCosp, cosyCosp);
  return [roll, pitch, yaw];
}

/**
 * Collider for a capsule or cylinder primitive whose physics spec names no dimensions. The
 * primitive's `size` is [diameter, total height, diameter]. When the body is at least as tall
 * as it is wide, a capsule spanning exactly that height fits it (radius half the diameter,
 * cylindrical half-height the total half-height minus one cap radius). A short, wide body
 * (a disc, a coin, a squat capsule) would degenerate to a sphere as small as its height, far
 * inside the visible shape, so it gets a box with the visible radius and height (anim-phys-04).
 */
function derivedCapsule(size: AuraVec3, scale: AuraVec3): PhysicsShape {
  const halfTotal = Math.max(0.02, size[1] * scale[1] * 0.5);
  const halfX = Math.max(0.01, size[0] * scale[0] * 0.5);
  const halfZ = Math.max(0.01, size[2] * scale[2] * 0.5);
  const radius = Math.max(halfX, halfZ);
  if (radius > halfTotal + 1e-6) return PhysicsShapeFactory.box(halfX, halfTotal, halfZ);
  const halfHeight = halfTotal - radius;
  // As tall as it is wide: the capsule has no cylindrical part (capsule() rejects 0).
  if (halfHeight <= 1e-6) return PhysicsShapeFactory.sphere(radius);
  return PhysicsShapeFactory.capsule(radius, halfHeight);
}

/** An unspecified model shape is the sole route that derives a collider from asset bounds. */
export function usesModelBoundsCollider(node: AuraModelNode | AuraPrimitiveNode): node is AuraModelNode {
  const spec = node.physics;
  return node.kind === "model" && spec !== undefined && spec.shape === undefined &&
    spec.halfExtents === undefined && spec.radius === undefined && spec.halfHeight === undefined &&
    spec.normal === undefined && spec.constant === undefined;
}

function modelBoundsCollider(node: AuraModelNode): { readonly shape: ReturnType<typeof PhysicsShapeFactory.box>; readonly offset: AuraVec3 } {
  if (node.instances !== undefined) {
    throw new RangeError("MODEL_COLLIDER_UNSUPPORTED_INSTANCES: a single bounds collider cannot represent model instances.");
  }
  if (node.lookAt !== undefined || ["float", "orbit", "turntable"].includes(node.animation?.clip ?? "")) {
    throw new RangeError("MODEL_COLLIDER_UNSUPPORTED_MOTION: bounds colliders cannot follow lookAt or transform animation.");
  }
  const world = worldTransformOf(node);
  if (world && (world.sheared || !world.matrix.every(Number.isFinite) || !world.quaternion.every(Number.isFinite) ||
      world.scale.some((value) => !Number.isFinite(value) || value === 0))) {
    throw new RangeError("PHYSICS_UNSUPPORTED_WORLD_TRANSFORM: a model bounds collider requires a finite, non-singular, non-sheared world transform.");
  }
  if (node.quaternion !== undefined) {
    if (!Array.isArray(node.quaternion) || node.quaternion.length !== 4 || !node.quaternion.every(Number.isFinite)) {
      throw new RangeError("MODEL_COLLIDER_UNSUPPORTED_TRANSFORM: model rotation must be a finite unit quaternion.");
    }
    const length = Math.hypot(...node.quaternion);
    if (!Number.isFinite(length) || Math.abs(length - 1) > 1e-5) {
      throw new RangeError("MODEL_COLLIDER_UNSUPPORTED_TRANSFORM: model rotation must be a finite unit quaternion.");
    }
  }
  for (const fit of [node.targetHeight, node.targetLength, node.targetMaxDimension]) {
    if (fit !== undefined && (typeof fit !== "number" || !Number.isFinite(fit) || fit <= 0)) {
      throw new RangeError("MODEL_COLLIDER_INVALID_FIT: model fit dimensions must be finite and positive.");
    }
  }

  const vector = (value: unknown, label: string, positive = false): AuraVec3 => {
    if (!Array.isArray(value) || value.length < 3 ||
        ![value[0], value[1], value[2]].every((item) => typeof item === "number" && Number.isFinite(item) && (!positive || item > 0))) {
      throw new RangeError(`MODEL_COLLIDER_INVALID_BOUNDS: ${label} must contain three finite${positive ? " positive" : ""} components.`);
    }
    return [value[0], value[1], value[2]];
  };
  const metadata = node.asset.metadata?.boundsMetadata;
  let size: AuraVec3;
  let center: AuraVec3 | undefined;
  if (metadata?.min !== undefined || metadata?.max !== undefined) {
    const min = vector(metadata.min, "bounds minimum");
    const max = vector(metadata.max, "bounds maximum");
    size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    if (!size.every((value) => Number.isFinite(value) && value > 0)) {
      throw new RangeError("MODEL_COLLIDER_INVALID_BOUNDS: bounds maximum must exceed minimum on every axis.");
    }
    center = [min[0] + size[0] / 2, min[1] + size[1] / 2, min[2] + size[2] / 2];
  } else if (metadata?.size !== undefined) {
    size = vector(metadata.size, "bounds size", true);
    if (metadata.center !== undefined) center = vector(metadata.center, "bounds center");
  } else {
    if (metadata?.center !== undefined) {
      throw new RangeError("MODEL_COLLIDER_INVALID_BOUNDS: bounds center requires metadata size or min/max.");
    }
    if (node.asset.bounds === undefined || node.asset.bounds === null) {
      // Never default to unit bounds: a guessed box would collide where nothing is drawn.
      const error = new RangeError(`MODEL_COLLIDER_MISSING_BOUNDS: model '${node.asset.id}' has no asset bounds or bounds metadata; add bounds to the asset (aura3d assets inspect) or declare an explicit physics shape.`);
      Object.assign(error, { code: "MODEL_COLLIDER_MISSING_BOUNDS" });
      throw error;
    }
    size = vector(node.asset.bounds, "asset bounds", true);
  }
  const normalize = shouldNormalizeModelNode(node);
  if (!normalize && !center) {
    throw new RangeError("MODEL_COLLIDER_MISSING_CENTER: world-scale bounds require metadata min/max or size and center.");
  }
  const scale = scaleToVec3(node.scale);
  if (node.scale === null || !Array.isArray(scale) || scale.length !== 3 ||
      !Array.from(scale).every((value) => typeof value === "number" && Number.isFinite(value) && value !== 0)) {
    throw new RangeError("MODEL_COLLIDER_INVALID_SCALE: a bounds collider requires three finite nonzero scale components.");
  }
  const fitScale = resolveModelFitScale(node, [
    Math.max(0.001, size[0]), Math.max(0.001, size[1]), Math.max(0.001, size[2])
  ], normalize);
  // Both renderer paths centre X/Z and ground min-Y only when normalizing.
  // World scale retains the original asset-space centre.
  const localCenter = normalize ? [0, size[1] / 2, 0] as const : center!;
  const offset: AuraVec3 = [
    localCenter[0] * scale[0] * fitScale,
    localCenter[1] * scale[1] * fitScale,
    localCenter[2] * scale[2] * fitScale
  ];
  const halfExtents: AuraVec3 = [
    size[0] * Math.abs(scale[0]) * fitScale / 2,
    size[1] * Math.abs(scale[1]) * fitScale / 2,
    size[2] * Math.abs(scale[2]) * fitScale / 2
  ];
  if (!offset.every(Number.isFinite) || !halfExtents.every((value) => Number.isFinite(value) && value > 0 && Math.fround(value) > 0) ||
      !Float32Array.from([...offset, ...halfExtents]).every(Number.isFinite)) {
    throw new RangeError("MODEL_COLLIDER_INVALID_SCALE: scaled model bounds must produce finite positive half extents and a finite centre.");
  }
  return { shape: PhysicsShapeFactory.box(halfExtents[0], halfExtents[1], halfExtents[2]), offset };
}

/** Centre relative to the node origin, in the rigid body's scaled local frame. */
export function resolveNodePhysicsOffset(node: AuraModelNode | AuraPrimitiveNode): AuraVec3 | undefined {
  if (usesPivotedGeometryCollider(node)) {
    const centre = pivotedGeometryBounds(node)!.centre;
    return centre.some((value) => value !== 0) ? centre : undefined;
  }
  return usesModelBoundsCollider(node) ? modelBoundsCollider(node).offset : undefined;
}

/** Detect changes that would require replacing a model's fixed bounds collider. */
export function fixedModelBoundsPhysicsGuard(node: AuraModelNode | AuraPrimitiveNode): (() => void) | undefined {
  if (!usesModelBoundsCollider(node)) return undefined;
  const initial = modelBoundsCollider(node);
  const scale = [...scaleToVec3(node.scale)];
  const declaration = node.physics;
  const type = declaration?.type;
  const staticPosition = type === "static" ? nodePhysicsPosition(node, initial.offset) : undefined;
  const staticRotation = type === "static" ? nodeRotationQuaternion(node) : undefined;
  return () => {
    if (node.physics !== declaration || node.physics?.type !== type || !usesModelBoundsCollider(node)) {
      throw new RangeError("MODEL_COLLIDER_CHANGED: changing a bounds collider declaration requires rebuilding it.");
    }
    const current = modelBoundsCollider(node);
    const currentScale = scaleToVec3(node.scale);
    const changed = (value: number, previous: number) =>
      Math.abs(value - previous) > 1e-6 * Math.max(1e-12, Math.abs(value), Math.abs(previous));
    if (currentScale.some((value, axis) => changed(value, scale[axis]!)) ||
        current.shape.halfExtents.some((value, axis) => changed(value, initial.shape.halfExtents[axis]!)) ||
        current.offset.some((value, axis) => changed(value, initial.offset[axis]!))) {
      throw new RangeError("MODEL_COLLIDER_SCALE_CHANGED: changing model scale, fit, or bounds requires rebuilding its collider.");
    }
    if (staticPosition && staticRotation) {
      const position = nodePhysicsPosition(node, current.offset);
      const rotation = nodeRotationQuaternion(node);
      const length = Math.hypot(...rotation) * Math.hypot(...staticRotation);
      const dot = rotation.reduce((sum, value, axis) => sum + value * staticRotation[axis]!, 0) / length;
      if (position.some((value, axis) => Math.abs(value - staticPosition[axis]!) > 1e-5 * Math.max(1, Math.abs(value), Math.abs(staticPosition[axis]!))) ||
          !Number.isFinite(dot) || Math.abs(Math.abs(dot) - 1) > 1e-5) {
        throw new RangeError("MODEL_COLLIDER_POSE_CHANGED: moving a static model requires rebuilding its collider.");
      }
    }
  };
}

export function resolveNodePhysicsShape(node: AuraModelNode | AuraPrimitiveNode, spec: AuraNodePhysicsSpec): PhysicsShape {
  if (spec.density !== undefined) throw new Error("Physics node density is not supported; supply an explicit mass instead.");
  if (node.kind === "model" && [spec.halfExtents, spec.radius, spec.halfHeight, spec.normal, spec.constant].some((value) => value === null)) {
    throw new RangeError("MODEL_COLLIDER_INVALID_SHAPE: explicit shape dimensions cannot be null.");
  }
  if (typeof spec.shape === "object" || spec.halfExtents || spec.radius || spec.halfHeight || spec.shape) return resolveAgentPhysicsShape(spec);
  if (usesPivotedGeometryCollider(node)) {
    const [x, y, z] = pivotedGeometryBounds(node)!.halfExtents;
    return PhysicsShapeFactory.box(x, y, z);
  }
  if (node.kind === "primitive") {
    const size = primitiveSize(node);
    const scale = scaleToVec3(node.scale);
    if (node.primitive === "sphere") return PhysicsShapeFactory.sphere(Math.max(size[0] * scale[0], size[1] * scale[1], size[2] * scale[2]) * 0.5);
    if (node.primitive === "capsule") return derivedCapsule(size, scale);
    if (node.primitive === "torus") return PhysicsShapeFactory.sphere(Math.max(size[0] * scale[0], size[1] * scale[1], size[2] * scale[2]) * 0.5);
    if (node.primitive === "plane") return PhysicsShapeFactory.plane();
    if (node.primitive === "cylinder") return derivedCapsule(size, scale);
    return PhysicsShapeFactory.box(Math.max(0.02, size[0] * scale[0] * 0.5), Math.max(0.02, size[1] * scale[1] * 0.5), Math.max(0.02, size[2] * scale[2] * 0.5));
  }
  if (spec.shape !== undefined || spec.halfExtents !== undefined || spec.radius !== undefined || spec.halfHeight !== undefined ||
      spec.normal !== undefined || spec.constant !== undefined) return resolveAgentPhysicsShape(spec);
  return modelBoundsCollider(node).shape;
}
