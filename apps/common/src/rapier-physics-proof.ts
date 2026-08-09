import { game } from "@aura3d/engine";

/** Route-level evidence that the selected Rapier physical runtime is actually executing. */
export function createShowcaseRapierPhysicsProof(routeId: string) {
  const angularWorld = game.collisionWorld({
    backend: "rapier",
    gravity: [0, -9.81, 0],
    fixedDelta: 1 / 120,
    solverIterations: 10,
    enableSleeping: false
  });
  angularWorld.addBox(`${routeId}-angular-floor`, [5, 0.25, 5], {
    type: "static",
    position: [0, -0.25, 0]
  });
  const initialRotation = zRotation(Math.PI / 6);
  const cornerBox = angularWorld.addBox(`${routeId}-angular-box`, [0.5, 0.5, 0.5], {
    position: [0, 2, 0],
    material: { friction: 0.7, restitution: 0 },
    rigidBody: {
      rotation: initialRotation,
      linearDamping: 0.01,
      angularDamping: 0.01,
      friction: 0.7
    }
  });
  let maxAngularSpeed = 0;
  for (let frame = 0; frame < 480; frame += 1) {
    angularWorld.step(1 / 120);
    maxAngularSpeed = Math.max(maxAngularSpeed, Math.hypot(...cornerBox.body.angularVelocity));
  }
  const quaternionDot = cornerBox.body.rotation.reduce(
    (sum, component, index) => sum + component * initialRotation[index]!,
    0
  );

  const collisionWorld = game.collisionWorld({
    backend: "rapier",
    gravity: [0, 0, 0],
    fixedDelta: 1 / 60,
    solverIterations: 8,
    enableSleeping: false,
    continuousCollision: {
      mode: "adaptive-substeps",
      maxSubSteps: 256,
      motionThreshold: 0.5
    }
  });
  collisionWorld.addBox(`${routeId}-ccd-wall`, [0.05, 1, 1], {
    type: "static",
    position: [0, 0, 0]
  });
  const fastBody = collisionWorld.addBox(`${routeId}-ccd-fast-body`, [0.05, 0.05, 0.05], {
    position: [-2, 0, 0],
    velocity: [240, 0, 0]
  });
  collisionWorld.step(1 / 60);
  const backend = collisionWorld.snapshot().backend;

  return {
    collisionWorld,
    evidence: {
      selection: "rapier" as const,
      angularContactProvider: "@dimforge/rapier3d-compat@0.20.0" as const,
      angularContactResponse:
        maxAngularSpeed > 0.25
        && 1 - Math.abs(quaternionDot) > 0.02
        && cornerBox.body.rotation.every(Number.isFinite),
      maxAngularSpeed,
      continuousCollisionProvider: backend.continuousCollision.provider,
      continuousCollisionMode: backend.continuousCollision.mode,
      continuousCollisionActive: backend.continuousCollision.active,
      continuousCollisionSubSteps: backend.continuousCollision.lastSubSteps,
      continuousCollisionRequiredSubSteps: backend.continuousCollision.lastRequiredSubSteps,
      fastMoverDidNotTunnel: fastBody.position[0] < -0.1 && fastBody.velocity[0] <= 0,
      continuousCollisionOwnership:
        "Rapier native CCD owns swept physical collision; Aura3D additionally bounds travel per public step for an explicit overflow guarantee."
    }
  };
}

function zRotation(angle: number): readonly [number, number, number, number] {
  return [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)];
}
