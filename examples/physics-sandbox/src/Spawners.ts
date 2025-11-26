/**
 * Physics Object Spawners
 *
 * Provides factory methods for creating various physics objects
 * including basic shapes, compound objects, and preset configurations.
 */

import { Vector3, PhysicsWorld, RigidBody, BodyType, Quaternion, Color, HingeConstraint } from 'g3d';

export interface SpawnedObject {
  bodies: RigidBody[];
  visualData: Map<RigidBody, any>;
}

/**
 * Factory for spawning physics objects
 */
export class Spawners {
  private physicsWorld: PhysicsWorld;

  constructor(physicsWorld: PhysicsWorld) {
    this.physicsWorld = physicsWorld;
  }

  /**
   * Spawns a basic box
   */
  public spawnBox(position: Vector3, size: Vector3 = new Vector3(1, 1, 1), mass: number = 1): SpawnedObject {
    const body = new RigidBody({
      type: BodyType.Dynamic,
      position: position.clone(),
      mass
    });

    this.physicsWorld.addRigidBody(body);

    const visualData = new Map();
    visualData.set(body, {
      size,
      color: new Color(0.8, 0.3, 0.3, 1),
      type: 'box'
    });

    return { bodies: [body], visualData };
  }

  /**
   * Spawns a sphere
   */
  public spawnSphere(position: Vector3, radius: number = 0.5, mass: number = 1): SpawnedObject {
    const body = new RigidBody({
      type: BodyType.Dynamic,
      position: position.clone(),
      mass
    });

    this.physicsWorld.addRigidBody(body);

    const visualData = new Map();
    visualData.set(body, {
      size: new Vector3(radius * 2, radius * 2, radius * 2),
      color: new Color(0.3, 0.3, 0.8, 1),
      type: 'sphere'
    });

    return { bodies: [body], visualData };
  }

  /**
   * Spawns a capsule
   */
  public spawnCapsule(position: Vector3, radius: number = 0.5, height: number = 2, mass: number = 1): SpawnedObject {
    const body = new RigidBody({
      type: BodyType.Dynamic,
      position: position.clone(),
      mass
    });

    this.physicsWorld.addRigidBody(body);

    const visualData = new Map();
    visualData.set(body, {
      size: new Vector3(radius * 2, height, radius * 2),
      color: new Color(0.3, 0.8, 0.3, 1),
      type: 'capsule'
    });

    return { bodies: [body], visualData };
  }

  /**
   * Spawns a cylinder
   */
  public spawnCylinder(position: Vector3, radius: number = 0.5, height: number = 2, mass: number = 1): SpawnedObject {
    const body = new RigidBody({
      type: BodyType.Dynamic,
      position: position.clone(),
      mass
    });

    this.physicsWorld.addRigidBody(body);

    const visualData = new Map();
    visualData.set(body, {
      size: new Vector3(radius * 2, height, radius * 2),
      color: new Color(0.8, 0.8, 0.3, 1),
      type: 'cylinder'
    });

    return { bodies: [body], visualData };
  }

  /**
   * Creates a tower stack
   */
  public spawnTower(position: Vector3, height: number = 10): SpawnedObject {
    const bodies: RigidBody[] = [];
    const visualData = new Map();
    const boxSize = new Vector3(1, 0.5, 1);

    for (let i = 0; i < height; i++) {
      const boxPos = position.add(new Vector3(0, i * boxSize.y + boxSize.y / 2, 0));
      const body = new RigidBody({
        type: BodyType.Dynamic,
        position: boxPos,
        mass: 1
      });

      this.physicsWorld.addRigidBody(body);
      bodies.push(body);

      visualData.set(body, {
        size: boxSize,
        color: new Color(0.7, 0.4 + i * 0.05, 0.4, 1),
        type: 'box'
      });
    }

    return { bodies, visualData };
  }

  /**
   * Creates a pyramid
   */
  public spawnPyramid(position: Vector3, levels: number = 5): SpawnedObject {
    const bodies: RigidBody[] = [];
    const visualData = new Map();
    const boxSize = new Vector3(1, 0.5, 1);

    for (let level = 0; level < levels; level++) {
      const width = levels - level;
      for (let x = 0; x < width; x++) {
        const offset = -(width - 1) * boxSize.x / 2;
        const boxPos = position.add(
          new Vector3(
            offset + x * boxSize.x,
            level * boxSize.y + boxSize.y / 2,
            0
          )
        );

        const body = new RigidBody({
          type: BodyType.Dynamic,
          position: boxPos,
          mass: 1
        });

        this.physicsWorld.addRigidBody(body);
        bodies.push(body);

        visualData.set(body, {
          size: boxSize,
          color: new Color(0.8, 0.5, 0.3, 1),
          type: 'box'
        });
      }
    }

    return { bodies, visualData };
  }

  /**
   * Creates a wall
   */
  public spawnWall(position: Vector3, width: number = 8, height: number = 6): SpawnedObject {
    const bodies: RigidBody[] = [];
    const visualData = new Map();
    const boxSize = new Vector3(1, 0.5, 1);

    for (let y = 0; y < height; y++) {
      const boxesInRow = width - (y % 2);
      const offset = (y % 2) * boxSize.x / 2;

      for (let x = 0; x < boxesInRow; x++) {
        const boxPos = position.add(
          new Vector3(
            (x - boxesInRow / 2) * boxSize.x + offset,
            y * boxSize.y + boxSize.y / 2,
            0
          )
        );

        const body = new RigidBody({
          type: BodyType.Dynamic,
          position: boxPos,
          mass: 1
        });

        this.physicsWorld.addRigidBody(body);
        bodies.push(body);

        visualData.set(body, {
          size: boxSize,
          color: new Color(0.6, 0.4, 0.3, 1),
          type: 'box'
        });
      }
    }

    return { bodies, visualData };
  }

  /**
   * Creates a chain or rope
   */
  public spawnChain(start: Vector3, end: Vector3, segments: number = 10): SpawnedObject {
    const bodies: RigidBody[] = [];
    const visualData = new Map();
    const linkSize = new Vector3(0.3, 0.3, 1);

    const direction = end.sub(start);
    const segmentLength = direction.length() / segments;
    const stepDir = direction.normalize().scale(segmentLength);

    let previousBody: RigidBody | null = null;

    for (let i = 0; i < segments; i++) {
      const pos = start.add(stepDir.scale(i + 0.5));
      const body = new RigidBody({
        type: BodyType.Dynamic,
        position: pos,
        mass: 0.5
      });

      this.physicsWorld.addRigidBody(body);
      bodies.push(body);

      visualData.set(body, {
        size: linkSize,
        color: new Color(0.5, 0.5, 0.5, 1),
        type: 'box'
      });

      if (previousBody) {
        const anchor = previousBody.position.add(body.position).scale(0.5);
        const constraint = new HingeConstraint(
          previousBody,
          body,
          anchor,
          new Vector3(0, 0, 1)
        );
        this.physicsWorld.addConstraint(constraint);
      }

      previousBody = body;
    }

    return { bodies, visualData };
  }

  /**
   * Creates Newton's cradle
   */
  public spawnNewtonsCradle(position: Vector3, balls: number = 5): SpawnedObject {
    const bodies: RigidBody[] = [];
    const visualData = new Map();
    const radius = 0.5;
    const spacing = radius * 2.1;
    const stringLength = 5;

    for (let i = 0; i < balls; i++) {
      const ballPos = position.add(
        new Vector3(
          (i - balls / 2) * spacing,
          -stringLength,
          0
        )
      );

      const ball = new RigidBody({
        type: BodyType.Dynamic,
        position: ballPos,
        mass: 1
      });

      this.physicsWorld.addRigidBody(ball);
      bodies.push(ball);

      visualData.set(ball, {
        size: new Vector3(radius * 2, radius * 2, radius * 2),
        color: new Color(0.8, 0.8, 0.8, 1),
        type: 'sphere'
      });

      const anchor = position.add(new Vector3((i - balls / 2) * spacing, 0, 0));
      const anchorBody = new RigidBody({
        type: BodyType.Static,
        position: anchor
      });
      this.physicsWorld.addRigidBody(anchorBody);

      const constraint = new HingeConstraint(
        anchorBody,
        ball,
        anchor,
        new Vector3(0, 0, 1)
      );
      this.physicsWorld.addConstraint(constraint);
    }

    return { bodies, visualData };
  }

  /**
   * Creates dominoes in a line
   */
  public spawnDominoes(start: Vector3, count: number = 20, spacing: number = 1.2): SpawnedObject {
    const bodies: RigidBody[] = [];
    const visualData = new Map();
    const dominoSize = new Vector3(0.5, 2, 1);

    for (let i = 0; i < count; i++) {
      const pos = start.add(new Vector3(i * spacing, dominoSize.y / 2, 0));
      const body = new RigidBody({
        type: BodyType.Dynamic,
        position: pos,
        mass: 0.5
      });

      this.physicsWorld.addRigidBody(body);
      bodies.push(body);

      visualData.set(body, {
        size: dominoSize,
        color: new Color(0.9, 0.9, 0.9, 1),
        type: 'box'
      });
    }

    return { bodies, visualData };
  }

  /**
   * Creates a wrecking ball
   */
  public spawnWreckingBall(position: Vector3, chainLength: number = 10): SpawnedObject {
    const bodies: RigidBody[] = [];
    const visualData = new Map();

    const anchor = new RigidBody({
      type: BodyType.Static,
      position: position.clone()
    });
    this.physicsWorld.addRigidBody(anchor);

    const ballRadius = 1.5;
    const ballPos = position.add(new Vector3(0, -chainLength, 0));
    const ball = new RigidBody({
      type: BodyType.Dynamic,
      position: ballPos,
      mass: 10
    });

    this.physicsWorld.addRigidBody(ball);
    bodies.push(ball);

    visualData.set(ball, {
      size: new Vector3(ballRadius * 2, ballRadius * 2, ballRadius * 2),
      color: new Color(0.3, 0.3, 0.3, 1),
      type: 'sphere'
    });

    const constraint = new HingeConstraint(
      anchor,
      ball,
      position,
      new Vector3(0, 0, 1)
    );
    this.physicsWorld.addConstraint(constraint);

    return { bodies, visualData };
  }

  /**
   * Creates a compound vehicle-like object
   */
  public spawnVehicle(position: Vector3): SpawnedObject {
    const bodies: RigidBody[] = [];
    const visualData = new Map();

    const chassis = new RigidBody({
      type: BodyType.Dynamic,
      position: position.clone(),
      mass: 5
    });

    this.physicsWorld.addRigidBody(chassis);
    bodies.push(chassis);

    visualData.set(chassis, {
      size: new Vector3(3, 0.5, 1.5),
      color: new Color(0.8, 0.2, 0.2, 1),
      type: 'box'
    });

    const wheelRadius = 0.4;
    const wheelPositions = [
      new Vector3(-1, -0.5, -0.8),
      new Vector3(-1, -0.5, 0.8),
      new Vector3(1, -0.5, -0.8),
      new Vector3(1, -0.5, 0.8)
    ];

    for (const wheelOffset of wheelPositions) {
      const wheel = new RigidBody({
        type: BodyType.Dynamic,
        position: position.add(wheelOffset),
        mass: 0.5
      });

      this.physicsWorld.addRigidBody(wheel);
      bodies.push(wheel);

      visualData.set(wheel, {
        size: new Vector3(wheelRadius * 2, wheelRadius * 2, wheelRadius * 2),
        color: new Color(0.2, 0.2, 0.2, 1),
        type: 'sphere'
      });

      const constraint = new HingeConstraint(
        chassis,
        wheel,
        position.add(wheelOffset),
        new Vector3(0, 0, 1)
      );
      this.physicsWorld.addConstraint(constraint);
    }

    return { bodies, visualData };
  }

  /**
   * Creates a ragdoll
   */
  public spawnRagdoll(position: Vector3): SpawnedObject {
    const bodies: RigidBody[] = [];
    const visualData = new Map();

    const torso = new RigidBody({
      type: BodyType.Dynamic,
      position: position.clone(),
      mass: 5
    });
    this.physicsWorld.addRigidBody(torso);
    bodies.push(torso);
    visualData.set(torso, {
      size: new Vector3(1, 1.5, 0.5),
      color: new Color(0.7, 0.5, 0.4, 1),
      type: 'box'
    });

    const head = new RigidBody({
      type: BodyType.Dynamic,
      position: position.add(new Vector3(0, 1.2, 0)),
      mass: 1
    });
    this.physicsWorld.addRigidBody(head);
    bodies.push(head);
    visualData.set(head, {
      size: new Vector3(0.5, 0.5, 0.5),
      color: new Color(0.8, 0.6, 0.5, 1),
      type: 'sphere'
    });

    const limbSize = new Vector3(0.3, 1, 0.3);
    const limbs = [
      { offset: new Vector3(-0.7, 0.5, 0), name: 'left_arm' },
      { offset: new Vector3(0.7, 0.5, 0), name: 'right_arm' },
      { offset: new Vector3(-0.3, -1.5, 0), name: 'left_leg' },
      { offset: new Vector3(0.3, -1.5, 0), name: 'right_leg' }
    ];

    for (const limb of limbs) {
      const body = new RigidBody({
        type: BodyType.Dynamic,
        position: position.add(limb.offset),
        mass: 1
      });

      this.physicsWorld.addRigidBody(body);
      bodies.push(body);

      visualData.set(body, {
        size: limbSize,
        color: new Color(0.7, 0.5, 0.4, 1),
        type: 'box'
      });

      const constraint = new HingeConstraint(
        torso,
        body,
        position.add(limb.offset.scale(0.5)),
        new Vector3(0, 0, 1)
      );
      this.physicsWorld.addConstraint(constraint);
    }

    return { bodies, visualData };
  }
}
