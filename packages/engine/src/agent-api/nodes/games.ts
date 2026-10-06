// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraVec3, AuraSceneNode, AuraMiniGolfMetrics, AuraMiniGolfStateController, AuraMiniGolfPointerPoint, AuraMiniGolfShotInput } from "./types.js";
import type { Contact, RigidBody } from "@aura3d/physics";
import { AuraSceneBuilder, scene } from "./scene.js";
import { MINI_GOLF_LAYOUT, prefabs } from "./prefabs/index.js";
import { PhysicsWorld } from "@aura3d/physics/world";
import { Shape as PhysicsShapeFactory } from "@aura3d/physics/solverless";
import { camera } from "./camera.js";
import { createFightingGameKit, fighting as fightingGameKit } from "../game-kits/fighting";
import { lights } from "./lights.js";
import { material } from "./material.js";
import { physics } from "./physics.js";
import { timeline } from "./timeline.js";

function createMiniGolfStateController(): AuraMiniGolfStateController {
  const start: AuraVec3 = MINI_GOLF_LAYOUT.ballStart;
  const cup: AuraVec3 = MINI_GOLF_LAYOUT.cupCenter;
  const obstacle: AuraVec3 = MINI_GOLF_LAYOUT.obstacleCenter;
  let world: PhysicsWorld;
  let ballBody: RigidBody;
  let ballColliderId = 0;
  let cupColliderId = 0;
  let obstacleColliderId = 0;
  let shots = 0;
  let score = 0;
  let collisions = 0;
  let cupTriggered = false;
  let resets = 0;
  let aimVector: AuraVec3 = MINI_GOLF_LAYOUT.aimVector;

  const buildWorld = () => {
    world = new PhysicsWorld({
      gravity: [0, -9.81, 0],
      fixedDelta: 1 / 60,
      solverIterations: 6,
      enableSleeping: true,
      sleepVelocityThreshold: 0.035,
      sleepDelay: 0.55
    });
    const green = world.createRigidBody({ type: "static", position: [0, -0.03, -0.4], friction: 0.94, restitution: 0.08 });
    world.createCollider(green, { shape: PhysicsShapeFactory.plane([0, 1, 0], 0), material: { friction: 0.94, restitution: 0.08 } });
    const leftWall = world.createRigidBody({ type: "static", position: [-2.52, 0.12, -0.4], restitution: 0.48 });
    world.createCollider(leftWall, { shape: PhysicsShapeFactory.box(0.04, 0.11, 1.64), material: { friction: 0.72, restitution: 0.48 } });
    const rightWall = world.createRigidBody({ type: "static", position: [2.52, 0.12, -0.4], restitution: 0.48 });
    world.createCollider(rightWall, { shape: PhysicsShapeFactory.box(0.04, 0.11, 1.64), material: { friction: 0.72, restitution: 0.48 } });
    const backWall = world.createRigidBody({ type: "static", position: [0, 0.12, -2.08], restitution: 0.48 });
    world.createCollider(backWall, { shape: PhysicsShapeFactory.box(2.525, 0.11, 0.04), material: { friction: 0.72, restitution: 0.48 } });
    const obstacleBody = world.createRigidBody({ type: "static", position: obstacle, restitution: 0.72 });
    obstacleColliderId = world.createCollider(obstacleBody, { shape: PhysicsShapeFactory.capsule(0.18, 0.28), material: { friction: 0.48, restitution: 0.72 } }).id;
    const cupBody = world.createRigidBody({ type: "static", position: cup });
    cupColliderId = world.createCollider(cupBody, { shape: PhysicsShapeFactory.sphere(0.32), sensor: true }).id;
    ballBody = world.createRigidBody({
      type: "dynamic",
      position: start,
      mass: 0.045,
      friction: 0.18,
      restitution: 0.54,
      linearDamping: 0.08,
      angularDamping: 0.16
    });
    ballColliderId = world.createCollider(ballBody, {
      shape: PhysicsShapeFactory.sphere(0.16),
      material: { friction: 0.18, restitution: 0.54 }
    }).id;
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
      const nextVector = normalizeAuraVec3(options.vector ?? aimVector);
      aimVector = nextVector;
      shots += 1;
      ballBody.wake();
      const power = Math.max(0.05, Math.min(2.4, options.power ?? 1.2));
      ballBody.applyImpulse([nextVector[0] * power * 0.32, Math.max(0.008, nextVector[1] * power * 0.04), nextVector[2] * power * 0.32]);
      return snapshot();
    },
    step(steps = 60) {
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
      shots = 0;
      score = 0;
      collisions = 0;
      cupTriggered = false;
      aimVector = MINI_GOLF_LAYOUT.aimVector;
      resets += 1;
      buildWorld();
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
    snapshot
  };
}

export function normalizeAuraVec3(vector: AuraVec3): AuraVec3 {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function miniGolfPointerShotFromDrag(start: AuraMiniGolfPointerPoint, end: AuraMiniGolfPointerPoint): AuraMiniGolfShotInput {
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

export const games = {
  miniGolf: (): readonly AuraSceneNode[] => prefabs.miniGolfHole(),
  miniGolfHole: (): readonly AuraSceneNode[] => prefabs.miniGolfHole(),
  miniGolfCourse: (): readonly AuraSceneNode[] => prefabs.miniGolfCourse(),
  createMiniGolfState: (): AuraMiniGolfStateController => createMiniGolfStateController(),
  miniGolfPointerShot: miniGolfPointerShotFromDrag,
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
