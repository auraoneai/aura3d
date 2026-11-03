/** Provider-bound mini-game state and namespace, with entry-supplied scene bindings. */

import type { AuraVec3, AuraSceneNode, AuraMiniGolfMetrics, AuraMiniGolfStateController, AuraMiniGolfPointerPoint, AuraMiniGolfShotInput } from "./types.js";
import type { Contact, RigidBody } from "@aura3d/physics/solverless";
import type { AuraSceneBuilder } from "./scene.js";
import { Shape as PhysicsShapeFactory } from "@aura3d/physics/solverless";
import type { PhysicsWorldAccess, PhysicsWorldConstructor } from "../physics/PhysicsWorldAccess.js";
import { lazyNamespace } from "../lazyNamespace.js";


type DisposableMiniGolfStateController = AuraMiniGolfStateController & { dispose(): void };

/** Dependencies are supplied by the caller's entry, avoiding a legacy prefab/bootstrap import. */
export interface GamesBindings {
  readonly layout: typeof import("./prefabs/index.js").MINI_GOLF_LAYOUT;
  readonly prefabs: Pick<typeof import("./prefabs/index.js").prefabs, "miniGolfHole" | "miniGolfCourse">;
  readonly scene: typeof import("./scene.js").scene;
  readonly camera: typeof import("./camera.js").camera;
  readonly lights: typeof import("./lights.js").lights;
  readonly timeline: typeof import("./timeline.js").timeline;
  readonly fightingGameKit: typeof import("../game-kits/fighting.js").fighting;
  readonly createFightingGameKit: typeof import("../game-kits/fighting.js").createFightingGameKit;
}

function createMiniGolfStateController(access: PhysicsWorldAccess, bindings: GamesBindings): DisposableMiniGolfStateController {
  const { layout: MINI_GOLF_LAYOUT, prefabs } = bindings;
  const start: AuraVec3 = MINI_GOLF_LAYOUT.ballStart;
  const cup: AuraVec3 = MINI_GOLF_LAYOUT.cupCenter;
  const obstacle: AuraVec3 = MINI_GOLF_LAYOUT.obstacleCenter;
  let world: InstanceType<PhysicsWorldConstructor>;
  let ballBody: RigidBody;
  let ballColliderId = 0;
  let cupColliderId = 0;
  let obstacleColliderId = 0;
  let shots = 0;
  let score = 0;
  let collisions = 0;
  let cupTriggered = false;
  let resets = 0;
  let disposed = false;
  let aimVector: AuraVec3 = MINI_GOLF_LAYOUT.aimVector;
  const assertAlive = () => {
    if (disposed) throw new Error("MINI_GOLF_DISPOSED: This mini-golf state has been disposed.");
  };

  const buildWorld = () => {
    const World = access.requireReady();
    const nextWorld = new World({
      gravity: [0, -9.81, 0],
      fixedDelta: 1 / 60,
      solverIterations: 6,
      enableSleeping: true,
      sleepVelocityThreshold: 0.035,
      sleepDelay: 0.55
    });
    // Build into local state first: a failed reset must not destroy or alter
    // the previously usable world. Dispose a partially constructed replacement.
    try {
      const green = nextWorld.createRigidBody({ type: "static", position: [0, -0.03, -0.4], friction: 0.94, restitution: 0.08 });
      nextWorld.createCollider(green, { shape: PhysicsShapeFactory.plane([0, 1, 0], 0), material: { friction: 0.94, restitution: 0.08 } });
      const leftWall = nextWorld.createRigidBody({ type: "static", position: [-2.52, 0.12, -0.4], restitution: 0.48 });
      nextWorld.createCollider(leftWall, { shape: PhysicsShapeFactory.box(0.04, 0.11, 1.64), material: { friction: 0.72, restitution: 0.48 } });
      const rightWall = nextWorld.createRigidBody({ type: "static", position: [2.52, 0.12, -0.4], restitution: 0.48 });
      nextWorld.createCollider(rightWall, { shape: PhysicsShapeFactory.box(0.04, 0.11, 1.64), material: { friction: 0.72, restitution: 0.48 } });
      const backWall = nextWorld.createRigidBody({ type: "static", position: [0, 0.12, -2.08], restitution: 0.48 });
      nextWorld.createCollider(backWall, { shape: PhysicsShapeFactory.box(2.525, 0.11, 0.04), material: { friction: 0.72, restitution: 0.48 } });
      const obstacleBody = nextWorld.createRigidBody({ type: "static", position: obstacle, restitution: 0.72 });
      const nextObstacleColliderId = nextWorld.createCollider(obstacleBody, { shape: PhysicsShapeFactory.capsule(0.18, 0.28), material: { friction: 0.48, restitution: 0.72 } }).id;
      const cupBody = nextWorld.createRigidBody({ type: "static", position: cup });
      const nextCupColliderId = nextWorld.createCollider(cupBody, { shape: PhysicsShapeFactory.sphere(0.32), sensor: true }).id;
      const nextBallBody = nextWorld.createRigidBody({
        type: "dynamic",
        position: start,
        mass: 0.045,
        friction: 0.18,
        restitution: 0.54,
        linearDamping: 0.08,
        angularDamping: 0.16
      });
      const nextBallColliderId = nextWorld.createCollider(nextBallBody, {
        shape: PhysicsShapeFactory.sphere(0.16),
        material: { friction: 0.18, restitution: 0.54 }
      }).id;
      const previousWorld = world;
      world = nextWorld;
      ballBody = nextBallBody;
      obstacleColliderId = nextObstacleColliderId;
      cupColliderId = nextCupColliderId;
      ballColliderId = nextBallColliderId;
      previousWorld?.dispose();
    } catch (error) {
      // Preserve the construction error if cleanup also fails.
      if (world !== nextWorld) {
        try { nextWorld.dispose(); } catch { /* construction failure wins */ }
      }
      throw error;
    }
  };

  const maybeRecordCup = () => {
    if (cupTriggered) return;
    const distanceToCup = Math.hypot(ballBody.position[0] - cup[0], ballBody.position[1] - cup[1], ballBody.position[2] - cup[2]);
    if (distanceToCup <= 0.38) {
      cupTriggered = true;
      score += 1;
      ballBody.setVelocity([0, 0, 0]);
      ballBody.setAngularVelocity([0, 0, 0]);
      ballBody.setPosition(cup);
      ballBody.sleep();
    }
  };

  const maybeRecordObstacle = (contacts: readonly Contact[]) => {
    const hitObstacle = contacts.some((contact) =>
      (contact.colliderA === obstacleColliderId && contact.colliderB === ballColliderId) ||
      (contact.colliderB === obstacleColliderId && contact.colliderA === ballColliderId)
    );
    const distanceToObstacle = Math.hypot(ballBody.position[0] - obstacle[0], ballBody.position[1] - obstacle[1], ballBody.position[2] - obstacle[2]);
    if (hitObstacle || distanceToObstacle <= 0.36) collisions += 1;
  };

  const snapshot = (): AuraMiniGolfMetrics => {
    assertAlive();
    const worldSnapshot = world.snapshot();
    return {
      physicsBackend: worldSnapshot.backend.active,
      deterministicReplayId: `mini-golf-rapier-v2-${shots}-${score}-${collisions}-${resets}`,
      replayFrame: worldSnapshot.stats.steps,
      captureTime: Number((worldSnapshot.stats.steps * world.fixedDelta).toFixed(3)),
      shots,
      score,
      collisions,
      contacts: worldSnapshot.contacts.length,
      cupTriggered,
      resets,
      selected: "white physics golf ball",
      aimVector,
      ballPosition: [ballBody.position[0], ballBody.position[1], ballBody.position[2]],
      followCameraTarget: "white physics golf ball",
      settled: ballBody.sleeping || Math.hypot(ballBody.velocity[0], ballBody.velocity[1], ballBody.velocity[2]) < 0.035
    };
  };

  buildWorld();

  return {
    kind: "aura-mini-golf-state",
    shoot(options = {}) {
      assertAlive();
      const nextVector = normalizeAuraVec3(options.vector ?? aimVector);
      aimVector = nextVector;
      shots += 1;
      ballBody.wake();
      const power = Math.max(0.05, Math.min(2.4, options.power ?? 1.2));
      ballBody.applyImpulse([nextVector[0] * power * 0.32, Math.max(0.008, nextVector[1] * power * 0.04), nextVector[2] * power * 0.32]);
      return snapshot();
    },
    step(steps = 60) {
      assertAlive();
      const resolvedSteps = Math.max(1, Math.min(600, Math.floor(steps)));
      for (let index = 0; index < resolvedSteps; index += 1) {
        const events = world.step();
        maybeRecordObstacle(events.map((event) => event.contact));
        maybeRecordObstacle(world.snapshot().contacts);
        const cupEvent = events.some((event) =>
          (event.contact.colliderA === cupColliderId && event.contact.colliderB === ballColliderId) ||
          (event.contact.colliderB === cupColliderId && event.contact.colliderA === ballColliderId)
        );
        if (cupEvent) {
          ballBody.setPosition(cup);
        }
        maybeRecordCup();
      }
      return snapshot();
    },
    reset() {
      assertAlive();
      buildWorld();
      shots = 0;
      score = 0;
      collisions = 0;
      cupTriggered = false;
      aimVector = MINI_GOLF_LAYOUT.aimVector;
      resets += 1;
      return snapshot();
    },
    nodes() {
      const metrics = snapshot();
      return prefabs.miniGolfHole({
        ballPosition: metrics.ballPosition,
        shots: metrics.shots,
        score: metrics.score,
        collisions: metrics.collisions,
        contacts: metrics.contacts,
        cupTriggered: metrics.cupTriggered,
        aimVector: metrics.aimVector
      });
    },
    snapshot,
    dispose() {
      if (disposed) return;
      disposed = true;
      world.dispose();
    }
  };
}

export function normalizeAuraVec3(vector: AuraVec3): AuraVec3 {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function miniGolfPointerShotFromDrag(MINI_GOLF_LAYOUT: GamesBindings["layout"], start: AuraMiniGolfPointerPoint, end: AuraMiniGolfPointerPoint): AuraMiniGolfShotInput {
  const dragX = start.x - end.x;
  const dragY = start.y - end.y;
  const distance = Math.hypot(dragX, dragY);
  if (distance < 4) {
    return { vector: MINI_GOLF_LAYOUT.aimVector, power: 0.86 };
  }
  const vector = normalizeAuraVec3([
    Math.max(-1.6, Math.min(1.6, dragX / 96)),
    0,
    Math.max(-1.6, Math.min(1.6, dragY / 96))
  ]);
  return {
    vector,
    power: Number(Math.max(0.42, Math.min(1.75, distance / 96)).toFixed(3))
  };
}

/** @internal Bind mini-game state creation to one engine entry's physics access. */
export function createGamesWithPhysicsWorldAccess(access: PhysicsWorldAccess, bindings: GamesBindings) {
  return lazyNamespace(() => {
    const { layout, prefabs, scene, camera, lights, timeline, fightingGameKit, createFightingGameKit } = bindings;
    return {
      miniGolf: (): readonly AuraSceneNode[] => prefabs.miniGolfHole(),
      miniGolfHole: (): readonly AuraSceneNode[] => prefabs.miniGolfHole(),
      miniGolfCourse: (): readonly AuraSceneNode[] => prefabs.miniGolfCourse(),
      createMiniGolfState: (): DisposableMiniGolfStateController => createMiniGolfStateController(access, bindings),
      miniGolfPointerShot: (start: AuraMiniGolfPointerPoint, end: AuraMiniGolfPointerPoint) => miniGolfPointerShotFromDrag(layout, start, end),
      fighting: fightingGameKit,
      createFightingGameKit,
      miniGolfScene: (): AuraSceneBuilder =>
        scene()
          .background("#12321d")
          .addMany(prefabs.miniGolfHole())
          .add(lights.studio({ intensity: 1.15 }))
          .camera(camera.follow({ targetNode: "white physics golf ball", distance: 4.2 }))
          .timeline(timeline.loop({ seconds: 8 }))
    } as const;
  });
}

