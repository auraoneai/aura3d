// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraVec3, AuraColor, AuraSceneNode, AuraModelNode, AuraPrimitiveNode, AuraNodePhysicsSpec, AuraPhysicsStepOptions, AuraPhysicsDebugSnapshot, AuraPhysicsSceneSummary, AuraPhysicsWorldController, AuraSceneSnapshot } from "./types.js";
import type { ColliderDescriptor, CollisionEvent, ConstraintDescriptor, Contact, DebugLine, PhysicsShape, PhysicsSnapshot, PhysicsWorldDescriptor, RaycastHit, RaycastOptions, RigidBody, RigidBodyDescriptor, PhysicsVehicleController, PhysicsWheelSpec, PhysicsCharacterController, PhysicsCharacterControllerDescriptor, ScenePhysicsNode, SphereCastHit } from "@aura3d/physics";
import { AuraSceneBuilder } from "./scene.js";
import { PhysicsDebugDraw, PhysicsStepper, ScenePhysicsBridge, Shape as PhysicsShapeFactory } from "@aura3d/physics/solverless";
import { PhysicsWorld } from "@aura3d/physics/world";
import { markAuraLazySystemLoaded, markAuraLazySystemRequested } from "../lazySystemEvidence.js";
import { material } from "./material.js";
import { performanceNow } from "../platform.js";
import { primitive, primitives } from "./primitives.js";
import { primitiveSize, flattenSceneSnapshot, scaleToVec3, normalizeSceneSnapshot } from "../sceneMath.js";
import { round } from "../GameRuntime.js";

type AuraPhysicsBodyOptions = RigidBodyDescriptor & {
  readonly shape?: PhysicsShape;
  readonly sensor?: boolean;
  readonly material?: ColliderDescriptor["material"];
};

function toRigidBodyDescriptor(options: AuraPhysicsBodyOptions): RigidBodyDescriptor {
  const { shape: _shape, sensor: _sensor, material: _material, ...bodyDescriptor } = options;
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

function createPhysicsWorldController(descriptor: PhysicsWorldDescriptor = {}): AuraPhysicsWorldController {
  let world = new PhysicsWorld(descriptor);
  const stepper = new PhysicsStepper(world.fixedDelta);
  const bridge = new ScenePhysicsBridge();
  const debugDraw = new PhysicsDebugDraw();
  const bodyDescriptors: RigidBodyDescriptor[] = [];
  const colliderDescriptors: Array<{ readonly bodyId: number; readonly descriptor: ColliderDescriptor }> = [];
  const constraintDescriptors: Array<{
    readonly type: ConstraintDescriptor["type"];
    readonly bodyAId: number;
    readonly bodyBId: number;
    readonly localAnchorA?: AuraVec3;
    readonly localAnchorB?: AuraVec3;
    readonly restLength?: number;
    readonly stiffness?: number;
    readonly axis?: AuraVec3;
  }> = [];
  let resetCount = 0;

  // Vehicle and character controllers are recorded and rebuilt on reset(). Bodies,
  // colliders and constraints were already replayed, but a controller left pointing
  // at a destroyed chassis would hand a game a handle that silently does nothing -
  // which is exactly how a restart ends up with a car that will not drive. Ids are
  // stable across the replay, so re-attaching by id is enough.
  const vehicleRecords: Array<{
    readonly chassisId: number;
    readonly wheels: PhysicsWheelSpec[];
    axes: { up: 0 | 1 | 2; forward: 0 | 1 | 2 } | null;
    readonly live: { handle: PhysicsVehicleController };
  }> = [];
  const characterRecords: Array<{
    readonly bodyId: number;
    readonly descriptor: PhysicsCharacterControllerDescriptor;
    readonly live: { handle: PhysicsCharacterController };
  }> = [];

  const rebuildPhysicalControllers = (): void => {
    for (const record of vehicleRecords) {
      record.live.handle = world.createVehicleController(record.chassisId);
      for (const spec of record.wheels) record.live.handle.addWheel(spec);
      // Axides are chassis-frame state the solver needs to project tyre forces at all.
      // Replaying only the wheels would hand a reset car back its springs with the
      // default frame, which reads as a car that drives sideways or not at all.
      if (record.axes) record.live.handle.setAxes(record.axes.up, record.axes.forward);
    }
    for (const record of characterRecords) {
      record.live.handle = world.createCharacterController(record.bodyId, record.descriptor);
    }
  };

  const controller: AuraPhysicsWorldController = {
    kind: "aura-physics-world",
    createBody(options: AuraPhysicsBodyOptions = {}) {
      const bodyDescriptor = toRigidBodyDescriptor(options);
      const body = world.createRigidBody(bodyDescriptor);
      bodyDescriptors.push(bodyDescriptor);
      if (options.shape) {
        const colliderDescriptor = {
          shape: options.shape,
          sensor: options.sensor,
          material: options.material
        } satisfies ColliderDescriptor;
        world.createCollider(body, colliderDescriptor);
        colliderDescriptors.push({ bodyId: body.id, descriptor: colliderDescriptor });
      }
      return body;
    },
    createCollider(body, descriptor) {
      const collider = world.createCollider(body, descriptor);
      const bodyId = typeof body === "number" ? body : body.id;
      colliderDescriptors.push({ bodyId, descriptor });
      return collider;
    },
    createVehicleController(chassis, wheels = []) {
      const chassisId = typeof chassis === "number" ? chassis : chassis.id;
      const handle = world.createVehicleController(chassisId);
      for (const spec of wheels) handle.addWheel(spec);
      const record = { chassisId, wheels: [...wheels], axes: null as { up: 0 | 1 | 2; forward: 0 | 1 | 2 } | null, live: { handle } };
      vehicleRecords.push(record);
      const target = () => record.live.handle;
      const proxy: PhysicsVehicleController = {
        get wheelCount() { return target().wheelCount; },
        addWheel: (spec) => { record.wheels.push(spec); target().addWheel(spec); return proxy; },
        setWheelTuning: (i, t) => { target().setWheelTuning(i, t); return proxy; },
        setWheelCommand: (i, c) => { target().setWheelCommand(i, c); return proxy; },
        setBrakes: (b) => { target().setBrakes(b); return proxy; },
        setAxes: (up, forward) => { record.axes = { up, forward }; target().setAxes(up, forward); return proxy; },
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
          const at = vehicleRecords.indexOf(record);
          if (at >= 0) vehicleRecords.splice(at, 1);
          target().dispose();
        },
      };
      return proxy;
    },
    createCharacterController(body, descriptor = {}) {
      const bodyId = typeof body === "number" ? body : body.id;
      const handle = world.createCharacterController(bodyId, descriptor);
      const record = { bodyId, descriptor, live: { handle } };
      characterRecords.push(record);
      const target = () => record.live.handle;
      const proxy: PhysicsCharacterController = {
        get bodyId() { return record.bodyId; },
        setAutoStep: (h, w, d) => { target().setAutoStep(h, w, d); return proxy; },
        setMaxSlopeClimbAngle: (r) => { target().setMaxSlopeClimbAngle(r); return proxy; },
        setMinSlopeSlideAngle: (r) => { target().setMinSlopeSlideAngle(r); return proxy; },
        setSnapToGround: (d) => { target().setSnapToGround(d); return proxy; },
        setSlideEnabled: (e) => { target().setSlideEnabled(e); return proxy; },
        setCharacterMass: (m) => { target().setCharacterMass(m); return proxy; },
        setApplyImpulsesToDynamicBodies: (e) => { target().setApplyImpulsesToDynamicBodies(e); return proxy; },
        move: (desired) => target().move(desired),
        position: () => target().position(),
        grounded: () => target().grounded(),
        resetTo: (position) => target().resetTo(position),
        dispose: () => {
          const at = characterRecords.indexOf(record);
          if (at >= 0) characterRecords.splice(at, 1);
          target().dispose();
        },
      };
      return proxy;
    },
    createConstraint(descriptor) {
      const constraint = world.createConstraint(descriptor);
      constraintDescriptors.push({
        type: descriptor.type,
        bodyAId: descriptor.bodyA.id,
        bodyBId: descriptor.bodyB.id,
        localAnchorA: descriptor.localAnchorA,
        localAnchorB: descriptor.localAnchorB,
        restLength: descriptor.restLength,
        stiffness: descriptor.stiffness,
        axis: descriptor.axis
      });
      return constraint;
    },
    bindNode(body, node, mode = "dynamic") {
      const bodyId = typeof body === "number" ? body : body.id;
      bridge.bind({ bodyId, node, mode });
    },
    step(options: number | AuraPhysicsStepOptions = {}) {
      bridge.pushKinematic(world);
      const resolved = typeof options === "number" ? { dt: options, steps: 1 } : options;
      const steps = resolved.steps ?? 1;
      const dt = resolved.dt ?? world.fixedDelta;
      let events: readonly CollisionEvent[] = [];
      if (steps === 1) {
        events = world.step(dt);
      } else {
        for (let index = 0; index < steps; index += 1) events = world.step(dt);
      }
      bridge.pullDynamic(world, 1);
      return events;
    },
    reset() {
      world = new PhysicsWorld(descriptor);
      stepper.reset();
      const recreatedBodies = new Map<number, RigidBody>();
      bodyDescriptors.forEach((bodyDescriptor, index) => {
        const body = world.createRigidBody(bodyDescriptor);
        recreatedBodies.set(index + 1, body);
      });
      for (const colliderDescriptor of colliderDescriptors) {
        const body = recreatedBodies.get(colliderDescriptor.bodyId);
        if (body) world.createCollider(body, colliderDescriptor.descriptor);
      }
      for (const constraintDescriptor of constraintDescriptors) {
        const bodyA = recreatedBodies.get(constraintDescriptor.bodyAId);
        const bodyB = recreatedBodies.get(constraintDescriptor.bodyBId);
        if (!bodyA || !bodyB) continue;
        world.createConstraint({
          type: constraintDescriptor.type,
          bodyA,
          bodyB,
          localAnchorA: constraintDescriptor.localAnchorA,
          localAnchorB: constraintDescriptor.localAnchorB,
          restLength: constraintDescriptor.restLength,
          stiffness: constraintDescriptor.stiffness,
          axis: constraintDescriptor.axis
        });
      }
      rebuildPhysicalControllers();
      bridge.pullDynamic(world, 1);
      resetCount += 1;
    },
    contacts() {
      return world.snapshot().contacts;
    },
    liveContactCount() {
      return world.snapshot().contacts.length;
    },
    raycast(origin, direction, options) {
      return world.raycast(origin, direction, options);
    },
    sphereCast(origin, radius, direction, options) {
      return world.sphereCast(origin, radius, direction, options);
    },
    debug() {
      const snapshot = world.snapshot();
      const lines = debugDraw.buildLines(world);
      const nodes = createPhysicsDebugNodes(snapshot, lines);
      return {
        bodyCount: snapshot.stats.bodies,
        colliderCount: snapshot.stats.colliders,
        contactCount: snapshot.contacts.length,
        sleepingBodyCount: snapshot.stats.sleepingBodies,
        lines,
        nodes
      };
    },
    debugNodes() {
      const snapshot = world.snapshot();
      return createPhysicsDebugNodes(snapshot, debugDraw.buildLines(world));
    },
    snapshot() {
      const snapshot = world.snapshot();
      return {
        kind: "aura-physics-world",
        backend: snapshot.backend,
        bodies: snapshot.stats.bodies,
        colliders: snapshot.stats.colliders,
        contacts: snapshot.contacts.length,
        steps: snapshot.stats.steps,
        resets: resetCount,
        debugLines: debugDraw.buildLines(world).length,
        snapshot
      };
    }
  };

  return controller;
}

function resolveAgentPhysicsShape(spec: AuraNodePhysicsSpec): PhysicsShape {
  if (typeof spec.shape === "object") return spec.shape;
  const shape = spec.shape ?? "box";
  if (shape === "sphere") return PhysicsShapeFactory.sphere(spec.radius ?? 0.5);
  if (shape === "capsule") return PhysicsShapeFactory.capsule(spec.radius ?? 0.25, spec.halfHeight ?? 0.55);
  if (shape === "plane") return PhysicsShapeFactory.plane(spec.normal ?? [0, 1, 0], spec.constant ?? 0);
  const halfExtents = spec.halfExtents ?? [0.5, 0.5, 0.5];
  return PhysicsShapeFactory.box(halfExtents[0], halfExtents[1], halfExtents[2]);
}

export const physics = {
  world: (descriptor: PhysicsWorldDescriptor = {}): AuraPhysicsWorldController => createPhysicsWorldController(descriptor),
  worldAsync: async (descriptor: PhysicsWorldDescriptor = {}): Promise<AuraPhysicsWorldController> => {
    markAuraLazySystemRequested("physics-backend", "physics.worldAsync");
    const started = performanceNow();
    await import("@aura3d/physics");
    markAuraLazySystemLoaded("physics-backend", performanceNow() - started);
    return createPhysicsWorldController(descriptor);
  },
  worldFromScene: (sceneValue: AuraSceneBuilder | AuraSceneSnapshot, descriptor: PhysicsWorldDescriptor = {}): AuraPhysicsWorldController => {
    const controller = createPhysicsWorldController(descriptor);
    populatePhysicsWorldFromScene(controller, flattenSceneSnapshot(normalizeSceneSnapshot(sceneValue)).nodes);
    return controller;
  },
  worldFromSceneAsync: async (sceneValue: AuraSceneBuilder | AuraSceneSnapshot, descriptor: PhysicsWorldDescriptor = {}): Promise<AuraPhysicsWorldController> => {
    markAuraLazySystemRequested("physics-backend", "physics.worldFromSceneAsync");
    const started = performanceNow();
    await import("@aura3d/physics");
    markAuraLazySystemLoaded("physics-backend", performanceNow() - started);
    const controller = createPhysicsWorldController(descriptor);
    populatePhysicsWorldFromScene(controller, flattenSceneSnapshot(normalizeSceneSnapshot(sceneValue)).nodes);
    return controller;
  },
  body: (options: AuraPhysicsBodyOptions = {}): AuraPhysicsBodyOptions => ({ ...options }),
  collider: (descriptor: ColliderDescriptor): ColliderDescriptor => descriptor,
  box: (x = 0.5, y = 0.5, z = 0.5): PhysicsShape => PhysicsShapeFactory.box(x, y, z),
  sphere: (radius = 0.5): PhysicsShape => PhysicsShapeFactory.sphere(radius),
  capsule: (radius = 0.25, halfHeight = 0.55): PhysicsShape => PhysicsShapeFactory.capsule(radius, halfHeight),
  plane: (normal: AuraVec3 = [0, 1, 0], constant = 0): PhysicsShape => PhysicsShapeFactory.plane(normal, constant),
  constraint: (descriptor: ConstraintDescriptor): ConstraintDescriptor => descriptor,
  bindNode: (world: AuraPhysicsWorldController, body: RigidBody | number, node: ScenePhysicsNode, mode?: "dynamic" | "kinematic"): void => world.bindNode(body, node, mode),
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

interface AuraRuntimeScenePhysics {
  bindObject(node: AuraModelNode | AuraPrimitiveNode, object: {
    position?: { set(x: number, y: number, z: number): void };
    quaternion?: { set(x: number, y: number, z: number, w: number): void };
  }): void;
  step(deltaSeconds: number): void;
}

function populatePhysicsWorldFromScene(controller: AuraPhysicsWorldController, nodes: readonly AuraSceneNode[]): void {
  for (const node of nodes) {
    if ((node.kind !== "model" && node.kind !== "primitive") || !node.physics) continue;
    const body = controller.createBody({
      type: node.physics.type ?? "dynamic",
      position: node.position ?? [0, 0, 0],
      rotation: eulerToQuat(node.rotation ?? [0, 0, 0]),
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
    if (node.physics.type !== "static") {
      controller.bindNode(body, scenePhysicsNodeAdapter(node), node.physics.type === "kinematic" ? "kinematic" : "dynamic");
    }
  }
}

function scenePhysicsNodeAdapter(node: AuraModelNode | AuraPrimitiveNode): ScenePhysicsNode {
  return {
    getWorldPosition: () => node.position ?? [0, 0, 0],
    getWorldQuaternion: () => {
      const nodeWithPhysicsRotation = node as { physicsRotation?: readonly [number, number, number, number] };
      return nodeWithPhysicsRotation.physicsRotation ?? eulerToQuat(node.rotation ?? [0, 0, 0]);
    },
    setWorldPosition: (position) => {
      (node as { position?: AuraVec3 }).position = [position[0], position[1], position[2]];
    },
    setWorldQuaternion: (rotation) => {
      (node as { physicsRotation?: readonly [number, number, number, number] }).physicsRotation = [rotation[0], rotation[1], rotation[2], rotation[3]];
      (node as { rotation?: AuraVec3 }).rotation = quatToEuler(rotation);
    }
  };
}

export function createRuntimeScenePhysics(snapshot: AuraSceneSnapshot): AuraRuntimeScenePhysics | undefined {
  const physicsNodes = snapshot.nodes.filter((node): node is AuraModelNode | AuraPrimitiveNode =>
    (node.kind === "model" || node.kind === "primitive") && Boolean(node.physics)
  );
  if (physicsNodes.length === 0) return undefined;

  // WS-2.2: solver resolved through the on-demand cache rather than a static import.
  const world = new PhysicsWorld({ gravity: [0, -9.81, 0], fixedDelta: 1 / 60, enableSleeping: true });
  const stepper = new PhysicsStepper(world.fixedDelta);
  const debugDraw = new PhysicsDebugDraw();
  const bindings: Array<{
    readonly node: AuraModelNode | AuraPrimitiveNode;
    readonly body: RigidBody;
    object?: {
      position?: { set(x: number, y: number, z: number): void };
      quaternion?: { set(x: number, y: number, z: number, w: number): void };
    };
  }> = [];

  for (const node of physicsNodes) {
    const spec = node.physics;
    if (!spec) continue;
    const body = world.createRigidBody({
      type: spec.type ?? "dynamic",
      position: node.position ?? [0, 0, 0],
      rotation: eulerToQuat(node.rotation ?? [0, 0, 0]),
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
    bindings.push({ node, body });
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
      const binding = bindings.find((entry) => entry.node === node);
      if (binding) binding.object = object;
    },
    step(deltaSeconds) {
      const clampedDelta = Math.max(0, Math.min(0.12, deltaSeconds));
      const result = stepper.advance(clampedDelta, world);
      if (result.steps === 0) return;
      for (const binding of bindings) {
        if (binding.body.type !== "dynamic") continue;
        const position = [binding.body.position[0], binding.body.position[1], binding.body.position[2]] as AuraVec3;
        const rotation = binding.body.rotation;
        (binding.node as { position?: AuraVec3 }).position = position;
        (binding.node as { physicsRotation?: readonly [number, number, number, number] }).physicsRotation = [rotation[0], rotation[1], rotation[2], rotation[3]];
        binding.object?.position?.set(position[0], position[1], position[2]);
        binding.object?.quaternion?.set(rotation[0], rotation[1], rotation[2], rotation[3]);
      }
      writeSummary();
    }
  };
}

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

function quatToEuler(rotation: readonly [number, number, number, number]): AuraVec3 {
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

export function resolveNodePhysicsShape(node: AuraModelNode | AuraPrimitiveNode, spec: AuraNodePhysicsSpec): PhysicsShape {
  if (typeof spec.shape === "object" || spec.halfExtents || spec.radius || spec.halfHeight || spec.shape) return resolveAgentPhysicsShape(spec);
  if (node.kind === "primitive") {
    const size = primitiveSize(node);
    const scale = scaleToVec3(node.scale);
    if (node.primitive === "sphere") return PhysicsShapeFactory.sphere(Math.max(size[0] * scale[0], size[1] * scale[1], size[2] * scale[2]) * 0.5);
    if (node.primitive === "capsule") return PhysicsShapeFactory.capsule(Math.max(size[0] * scale[0], size[2] * scale[2]) * 0.25, Math.max(0.1, size[1] * scale[1] * 0.5));
    if (node.primitive === "torus") return PhysicsShapeFactory.sphere(Math.max(size[0] * scale[0], size[1] * scale[1], size[2] * scale[2]) * 0.5);
    if (node.primitive === "plane") return PhysicsShapeFactory.plane();
    if (node.primitive === "cylinder") return PhysicsShapeFactory.capsule(Math.max(size[0] * scale[0], size[2] * scale[2]) * 0.25, Math.max(0.1, size[1] * scale[1] * 0.5));
    return PhysicsShapeFactory.box(Math.max(0.02, size[0] * scale[0] * 0.5), Math.max(0.02, size[1] * scale[1] * 0.5), Math.max(0.02, size[2] * scale[2] * 0.5));
  }
  const bounds = node.asset.bounds ?? [1, 1, 1] as const;
  return PhysicsShapeFactory.box(Math.max(0.02, bounds[0] * 0.5), Math.max(0.02, bounds[1] * 0.5), Math.max(0.02, bounds[2] * 0.5));
}
