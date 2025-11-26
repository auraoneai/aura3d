/**
 * Physics Benchmarks
 *
 * Performance benchmarks for physics operations:
 * - Broad phase (1K bodies)
 * - Narrow phase (100 contacts)
 * - Constraint solver (100 constraints)
 * - Full step (100 bodies)
 */

import { bench, describe } from 'vitest';
import { RigidBody, BodyType } from '../../physics/RigidBody';
import { Collider, AABB, AABBUtils } from '../../physics/Collider';
import { CollisionFilter } from '../../physics/CollisionDetection';
import { Vector3 } from '../../math/Vector3';
import { Quaternion } from '../../math/Quaternion';
import { Matrix4 } from '../../math/Matrix4';
import { BoxShape } from '../../physics/shapes/BoxShape';

describe('Rigid Body Benchmarks', () => {
  bench('Create 1K rigid bodies', () => {
    const bodies: RigidBody[] = [];
    for (let i = 0; i < 1_000; i++) {
      bodies.push(new RigidBody({
        type: BodyType.Dynamic,
        mass: 1.0,
        position: new Vector3(i * 2, 0, 0)
      }));
    }
  });

  bench('Apply forces to 1K bodies', () => {
    const bodies: RigidBody[] = [];
    for (let i = 0; i < 1_000; i++) {
      bodies.push(new RigidBody({
        type: BodyType.Dynamic,
        mass: 1.0
      }));
    }

    const force = new Vector3(0, 100, 0);
    for (const body of bodies) {
      body.applyForce(force);
    }
  });

  bench('Apply impulses to 1K bodies', () => {
    const bodies: RigidBody[] = [];
    for (let i = 0; i < 1_000; i++) {
      bodies.push(new RigidBody({
        type: BodyType.Dynamic,
        mass: 1.0
      }));
    }

    const impulse = new Vector3(0, 10, 0);
    for (const body of bodies) {
      body.applyImpulse(impulse);
    }
  });

  bench('Integrate 1K bodies', () => {
    const bodies: RigidBody[] = [];
    for (let i = 0; i < 1_000; i++) {
      const body = new RigidBody({
        type: BodyType.Dynamic,
        mass: 1.0,
        position: new Vector3(i * 2, 10, 0)
      });
      body.applyForce(new Vector3(0, 100, 0));
      bodies.push(body);
    }

    const gravity = new Vector3(0, -9.81, 0);
    const dt = 1/60;

    for (const body of bodies) {
      body.integrate(dt, gravity);
    }
  });

  bench('Wake/sleep state updates (1K bodies)', () => {
    const bodies: RigidBody[] = [];
    for (let i = 0; i < 1_000; i++) {
      const body = new RigidBody({
        type: BodyType.Dynamic,
        mass: 1.0
      });
      // Some sleeping, some awake
      if (i % 2 === 0) {
        body.sleep();
      }
      bodies.push(body);
    }

    for (const body of bodies) {
      if (body.isSleeping) {
        body.wakeUp();
      }
    }
  });
});

describe('Broad Phase Benchmarks', () => {
  bench('AABB computation (1K bodies)', () => {
    const bodies: RigidBody[] = [];
    const aabbs: AABB[] = [];

    for (let i = 0; i < 1_000; i++) {
      const body = new RigidBody({
        type: BodyType.Dynamic,
        position: new Vector3(
          Math.random() * 100 - 50,
          Math.random() * 100,
          Math.random() * 100 - 50
        )
      });
      bodies.push(body);
    }

    for (const body of bodies) {
      const transform = body.getWorldMatrix();
      const halfExtents = new Vector3(1, 1, 1);
      const center = transform.getPosition();
      aabbs.push({
        min: center.sub(halfExtents),
        max: center.add(halfExtents)
      });
    }
  });

  bench('AABB intersection tests (1K bodies)', () => {
    const aabbs: AABB[] = [];

    for (let i = 0; i < 1_000; i++) {
      const center = new Vector3(
        Math.random() * 100 - 50,
        Math.random() * 100,
        Math.random() * 100 - 50
      );
      const halfExtents = new Vector3(1, 1, 1);
      aabbs.push({
        min: center.sub(halfExtents),
        max: center.add(halfExtents)
      });
    }

    let intersections = 0;
    for (let i = 0; i < aabbs.length; i++) {
      for (let j = i + 1; j < aabbs.length; j++) {
        if (AABBUtils.overlaps(aabbs[i], aabbs[j])) {
          intersections++;
        }
      }
    }
  });

  bench('Naive broad phase (100 bodies)', () => {
    const bodies: RigidBody[] = [];
    const pairs: [RigidBody, RigidBody][] = [];

    for (let i = 0; i < 100; i++) {
      const body = new RigidBody({
        type: BodyType.Dynamic,
        position: new Vector3(
          Math.random() * 50 - 25,
          Math.random() * 50,
          Math.random() * 50 - 25
        )
      });
      bodies.push(body);
    }

    // Naive O(n²) broad phase
    for (let i = 0; i < bodies.length; i++) {
      if (bodies[i].type === BodyType.Static) continue;

      for (let j = i + 1; j < bodies.length; j++) {
        // Skip static-static pairs
        if (bodies[i].type === BodyType.Static && bodies[j].type === BodyType.Static) {
          continue;
        }

        pairs.push([bodies[i], bodies[j]]);
      }
    }
  });

  bench('Sort and sweep broad phase (1K bodies)', () => {
    const bodies: RigidBody[] = [];
    const aabbs: (AABB & { body: RigidBody })[] = [];

    // Setup
    for (let i = 0; i < 1_000; i++) {
      const body = new RigidBody({
        type: BodyType.Dynamic,
        position: new Vector3(
          Math.random() * 200 - 100,
          Math.random() * 200,
          Math.random() * 200 - 100
        )
      });
      const transform = body.getWorldMatrix();
      const center = transform.getPosition();
      const halfExtents = new Vector3(1, 1, 1);
      aabbs.push({
        min: center.sub(halfExtents),
        max: center.add(halfExtents),
        body
      });
      bodies.push(body);
    }

    // Sort by X axis
    aabbs.sort((a, b) => a.min.x - b.min.x);

    // Sweep and prune
    const pairs: [RigidBody, RigidBody][] = [];
    for (let i = 0; i < aabbs.length; i++) {
      for (let j = i + 1; j < aabbs.length; j++) {
        // Early exit if no overlap on X axis
        if (aabbs[j].min.x > aabbs[i].max.x) break;

        // Check Y and Z axes
        if (AABBUtils.overlaps(aabbs[i], aabbs[j])) {
          pairs.push([aabbs[i].body, aabbs[j].body]);
        }
      }
    }
  });
});

describe('Narrow Phase Benchmarks', () => {
  bench('Sphere-sphere collision (100K tests)', () => {
    const sphereA = { center: new Vector3(0, 0, 0), radius: 1 };
    const sphereB = { center: new Vector3(1.5, 0, 0), radius: 1 };

    let collisions = 0;
    for (let i = 0; i < 100_000; i++) {
      const distance = sphereA.center.distanceTo(sphereB.center);
      const sumRadii = sphereA.radius + sphereB.radius;
      if (distance <= sumRadii) {
        collisions++;
      }
    }
  });

  bench('Box-box collision (100K tests)', () => {
    const boxA = {
      min: new Vector3(-1, -1, -1),
      max: new Vector3(1, 1, 1)
    };
    const boxB = {
      min: new Vector3(0.5, 0.5, 0.5),
      max: new Vector3(2, 2, 2)
    };

    let collisions = 0;
    for (let i = 0; i < 100_000; i++) {
      if (AABBUtils.overlaps(boxA, boxB)) {
        collisions++;
      }
    }
  });

  bench('Generate contact points (1K collisions)', () => {
    const contacts: Array<{ point: Vector3; normal: Vector3; depth: number }> = [];

    for (let i = 0; i < 1_000; i++) {
      const bodyA = new RigidBody({
        position: new Vector3(0, 0, 0)
      });
      const bodyB = new RigidBody({
        position: new Vector3(1.5, 0, 0)
      });

      const separation = bodyA.position.sub(bodyB.position);
      const distance = separation.length();
      const normal = separation.normalize();
      const depth = 2.0 - distance; // Assuming radius = 1 for both

      if (depth > 0) {
        contacts.push({
          point: bodyA.position.add(normal.scale(-1)),
          normal: normal,
          depth: depth
        });
      }
    }
  });
});

describe('Constraint Solver Benchmarks', () => {
  bench('Position constraint solving (100 constraints, 10 iterations)', () => {
    const bodies: RigidBody[] = [];
    const constraints: Array<{ bodyA: RigidBody; bodyB: RigidBody; distance: number }> = [];

    // Create chain of connected bodies
    for (let i = 0; i < 100; i++) {
      const body = new RigidBody({
        type: i === 0 ? BodyType.Static : BodyType.Dynamic,
        position: new Vector3(i * 2, 0, 0),
        mass: 1.0
      });
      bodies.push(body);

      if (i > 0) {
        constraints.push({
          bodyA: bodies[i - 1],
          bodyB: bodies[i],
          distance: 2.0
        });
      }
    }

    // Apply gravity
    const gravity = new Vector3(0, -9.81, 0);
    for (const body of bodies) {
      if (body.type === BodyType.Dynamic) {
        body.applyForce(gravity.scale(body.mass));
      }
    }

    // Solve constraints
    for (let iter = 0; iter < 10; iter++) {
      for (const constraint of constraints) {
        const { bodyA, bodyB, distance } = constraint;
        const delta = bodyB.position.sub(bodyA.position);
        const currentDistance = delta.length();
        const correction = (currentDistance - distance) / currentDistance;
        const correctionVector = delta.scale(correction * 0.5);

        if (bodyA.type === BodyType.Dynamic) {
          bodyA.position.addInPlace(correctionVector);
        }
        if (bodyB.type === BodyType.Dynamic) {
          bodyB.position.addInPlace(correctionVector.scale(-1));
        }
      }
    }
  });

  bench('Velocity constraint solving (100 constraints, 10 iterations)', () => {
    const bodies: RigidBody[] = [];
    const constraints: Array<{
      bodyA: RigidBody;
      bodyB: RigidBody;
      normal: Vector3;
      depth: number;
    }> = [];

    // Create stacked bodies
    for (let i = 0; i < 100; i++) {
      const body = new RigidBody({
        type: i === 0 ? BodyType.Static : BodyType.Dynamic,
        position: new Vector3(0, i * 2, 0),
        mass: 1.0
      });
      body.linearVelocity = new Vector3(
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
        Math.random() * 2 - 1
      );
      bodies.push(body);

      if (i > 0) {
        constraints.push({
          bodyA: bodies[i - 1],
          bodyB: bodies[i],
          normal: new Vector3(0, 1, 0),
          depth: 0.1
        });
      }
    }

    // Solve velocity constraints
    for (let iter = 0; iter < 10; iter++) {
      for (const constraint of constraints) {
        const { bodyA, bodyB, normal } = constraint;

        const relativeVel = bodyB.linearVelocity.sub(bodyA.linearVelocity);
        const normalVel = relativeVel.dot(normal);

        if (normalVel < 0) {
          const restitution = 0.5;
          const impulse = -(1 + restitution) * normalVel;
          const impulseVector = normal.scale(impulse);

          if (bodyA.type === BodyType.Dynamic) {
            bodyA.linearVelocity.addInPlace(impulseVector.scale(-bodyA.inverseMass));
          }
          if (bodyB.type === BodyType.Dynamic) {
            bodyB.linearVelocity.addInPlace(impulseVector.scale(bodyB.inverseMass));
          }
        }
      }
    }
  });
});

describe('Full Physics Step Benchmarks', () => {
  bench('Complete physics step (100 bodies)', () => {
    const bodies: RigidBody[] = [];
    const gravity = new Vector3(0, -9.81, 0);
    const dt = 1/60;

    // Setup scene
    for (let i = 0; i < 100; i++) {
      const body = new RigidBody({
        type: i === 0 ? BodyType.Static : BodyType.Dynamic,
        position: new Vector3(
          Math.random() * 20 - 10,
          Math.random() * 20 + 10,
          Math.random() * 20 - 10
        ),
        mass: Math.random() * 5 + 1
      });
      bodies.push(body);
    }

    // Physics step
    // 1. Apply forces
    for (const body of bodies) {
      if (body.type === BodyType.Dynamic) {
        body.applyForce(gravity.scale(body.mass));
      }
    }

    // 2. Integrate
    for (const body of bodies) {
      body.integrate(dt, gravity);
    }

    // 3. Broad phase
    const pairs: [RigidBody, RigidBody][] = [];
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        if (bodies[i].type === BodyType.Static && bodies[j].type === BodyType.Static) {
          continue;
        }
        pairs.push([bodies[i], bodies[j]]);
      }
    }

    // 4. Narrow phase (simplified)
    const collisions: Array<{
      bodyA: RigidBody;
      bodyB: RigidBody;
      normal: Vector3;
      depth: number;
    }> = [];

    for (const [bodyA, bodyB] of pairs) {
      const separation = bodyA.position.sub(bodyB.position);
      const distance = separation.length();
      if (distance < 2.0) { // Assuming radius = 1
        collisions.push({
          bodyA,
          bodyB,
          normal: separation.normalize(),
          depth: 2.0 - distance
        });
      }
    }

    // 5. Solve collisions
    for (const collision of collisions) {
      const { bodyA, bodyB, normal, depth } = collision;

      // Position correction
      const correction = normal.scale(depth * 0.5);
      if (bodyA.type === BodyType.Dynamic) {
        bodyA.position.addInPlace(correction);
      }
      if (bodyB.type === BodyType.Dynamic) {
        bodyB.position.addInPlace(correction.scale(-1));
      }

      // Velocity correction
      const relativeVel = bodyB.linearVelocity.sub(bodyA.linearVelocity);
      const normalVel = relativeVel.dot(normal);
      if (normalVel < 0) {
        const impulse = -(1 + 0.5) * normalVel / (bodyA.inverseMass + bodyB.inverseMass);
        const impulseVector = normal.scale(impulse);

        if (bodyA.type === BodyType.Dynamic) {
          bodyA.linearVelocity.addInPlace(impulseVector.scale(-bodyA.inverseMass));
        }
        if (bodyB.type === BodyType.Dynamic) {
          bodyB.linearVelocity.addInPlace(impulseVector.scale(bodyB.inverseMass));
        }
      }
    }
  });

  bench('Multi-step simulation (100 bodies, 60 frames)', () => {
    const bodies: RigidBody[] = [];
    const gravity = new Vector3(0, -9.81, 0);
    const dt = 1/60;

    // Setup
    for (let i = 0; i < 100; i++) {
      const body = new RigidBody({
        type: i === 0 ? BodyType.Static : BodyType.Dynamic,
        position: new Vector3(
          Math.random() * 20 - 10,
          20 + i * 0.5,
          Math.random() * 20 - 10
        ),
        mass: 1.0
      });
      bodies.push(body);
    }

    // Simulate 60 frames
    for (let frame = 0; frame < 60; frame++) {
      for (const body of bodies) {
        if (body.type === BodyType.Dynamic && !body.isSleeping) {
          body.integrate(dt, gravity);
        }
      }
    }
  });
});

describe('Collision Filtering Benchmarks', () => {
  bench('Layer mask filtering (10K tests)', () => {
    const filter = new CollisionFilter();

    // Setup layers
    filter.setLayerMask(0, 0xFF); // Default layer collides with everything
    filter.setLayerMask(1, 0xFE); // Layer 1 doesn't collide with layer 0
    filter.setLayerMask(2, 0xFC); // Layer 2 doesn't collide with layers 0-1

    const colliders: Collider[] = [];
    for (let i = 0; i < 10_000; i++) {
      const collider = new Collider({
        shape: new BoxShape(new Vector3(1, 1, 1)),
        layer: i % 3,
        layerMask: 0xFF
      });
      colliders.push(collider);
    }

    let canCollide = 0;
    for (let i = 0; i < colliders.length; i++) {
      for (let j = i + 1; j < Math.min(i + 10, colliders.length); j++) {
        if (filter.canCollide(colliders[i], colliders[j])) {
          canCollide++;
        }
      }
    }
  });
});
