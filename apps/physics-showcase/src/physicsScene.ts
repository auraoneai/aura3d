import { PhysicsWorld, Shape, type RigidBody, type PhysicsSnapshot } from "@aura3d/physics";

export interface PhysicsBodyView {
  readonly body: RigidBody;
  readonly kind: "box" | "sphere";
  readonly radius: number;
  readonly halfExtents: readonly [number, number, number];
  readonly material: "blue" | "gold" | "red" | "green";
}

export interface PhysicsSceneFixture {
  readonly world: PhysicsWorld;
  readonly bodies: readonly PhysicsBodyView[];
  readonly anchor: RigidBody;
  readonly pendulum: RigidBody;
}

export function createPhysicsScene(): PhysicsSceneFixture {
  const world = new PhysicsWorld({ gravity: [0, -9.81, 0], fixedDelta: 1 / 60, solverIterations: 4, enableSleeping: false });
  const floor = world.createRigidBody({ type: "static", position: [0, -0.68, 0], friction: 0.9, restitution: 0.12 });
  world.createCollider(floor, { shape: Shape.box(1.9, 0.05, 1.25), material: { friction: 0.9, restitution: 0.08 } });

  const ramp = world.createRigidBody({ type: "static", position: [-0.9, -0.24, -0.25], friction: 0.7, restitution: 0.2 });
  world.createCollider(ramp, { shape: Shape.box(0.48, 0.06, 0.9), material: { friction: 0.7, restitution: 0.1 } });

  const anchor = world.createRigidBody({ type: "static", position: [1.0, 0.78, 0], friction: 0.6 });
  world.createCollider(anchor, { shape: Shape.sphere(0.08), sensor: true });
  const pendulum = world.createRigidBody({ type: "dynamic", position: [1.0, 0.18, 0], mass: 1.4, restitution: 0.72, friction: 0.32, linearDamping: 0.01 });
  world.createCollider(pendulum, { shape: Shape.sphere(0.18), material: { restitution: 0.72, friction: 0.3 } });
  world.createConstraint({ type: "spring", bodyA: anchor, bodyB: pendulum, restLength: 0.62, stiffness: 0.22 });

  const bodies: PhysicsBodyView[] = [
    { body: floor, kind: "box", radius: 0, halfExtents: [1.9, 0.05, 1.25], material: "blue" },
    { body: ramp, kind: "box", radius: 0, halfExtents: [0.48, 0.06, 0.9], material: "green" },
    { body: anchor, kind: "sphere", radius: 0.08, halfExtents: [0.08, 0.08, 0.08], material: "red" },
    { body: pendulum, kind: "sphere", radius: 0.18, halfExtents: [0.18, 0.18, 0.18], material: "gold" }
  ];

  for (let index = 0; index < 8; index += 1) {
    const isSphere = index % 2 === 0;
    const body = world.createRigidBody({
      type: "dynamic",
      position: [-0.72 + (index % 4) * 0.24, 0.42 + Math.floor(index / 4) * 0.32, -0.24 + (index % 3) * 0.18],
      mass: isSphere ? 0.75 : 1.05,
      restitution: isSphere ? 0.62 : 0.28,
      friction: 0.48,
      linearDamping: 0.006
    });
    if (isSphere) {
      world.createCollider(body, { shape: Shape.sphere(0.12), material: { restitution: 0.62, friction: 0.42 } });
      bodies.push({ body, kind: "sphere", radius: 0.12, halfExtents: [0.12, 0.12, 0.12], material: index % 4 === 0 ? "red" : "blue" });
    } else {
      world.createCollider(body, { shape: Shape.box(0.13, 0.13, 0.13), material: { restitution: 0.22, friction: 0.55 } });
      bodies.push({ body, kind: "box", radius: 0, halfExtents: [0.13, 0.13, 0.13], material: index % 3 === 0 ? "green" : "gold" });
    }
  }

  return { world, bodies, anchor, pendulum };
}

export function stepPhysicsScene(fixture: PhysicsSceneFixture, dt: number, gravityScale: number): PhysicsSnapshot {
  fixture.world.gravity[1] = -9.81 * gravityScale;
  const step = fixture.world.fixedDelta;
  let remaining = Math.min(0.05, dt);
  while (remaining > 0) {
    fixture.world.step(Math.min(step, remaining));
    remaining -= step;
  }
  return fixture.world.snapshot();
}

export function applyShowcaseImpulse(fixture: PhysicsSceneFixture, strength: number): void {
  for (const view of fixture.bodies) {
    if (view.body.type !== "dynamic") continue;
    const side = view.body.position[0] < 0 ? 1 : -1;
    view.body.applyImpulse([side * strength * 0.22, strength * 0.34, 0.2 - view.body.position[2] * 0.25]);
  }
}

export function raycastImpulse(fixture: PhysicsSceneFixture, strength: number): number {
  const hit = fixture.world.raycast([0, 1.2, 3.1], [0, -0.24, -1], { maxDistance: 5 });
  if (!hit) return 0;
  const body = fixture.world.getBody(hit.bodyId);
  if (!body || body.type !== "dynamic") return 0;
  body.applyImpulse([hit.normal[0] * strength, Math.abs(hit.normal[1]) * strength + strength * 0.3, hit.normal[2] * strength - strength * 0.4]);
  return hit.bodyId;
}
