import { game } from "@aura3d/engine";

/**
 * Route-level proof for the Phase 2 physics-backend decision. cannon-es 0.20.0
 * supplies angular contact response; fast-body protection is Aura3D's explicit
 * adaptive-substep wrapper because cannon-es does not expose native swept TOI.
 */
export function createShowcaseCannonPhysicsProof(routeId: string) {
  const angularWorld = game.collisionWorld({
    backend: "cannon-es",
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
    backend: "cannon-es",
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
      selection: "cannon-es" as const,
      angularContactProvider: "cannon-es@0.20.0" as const,
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
      // WS-4.3 removed the second solver, so there is no longer a fallback backend whose
      // limits need disclosing. What still needs disclosing is which layer owns fast-body
      // protection: cannon-es exposes no native swept TOI, so the guarantee above comes
      // from Aura3D's adaptive-substep wrapper, not from the solver.
      continuousCollisionOwnership:
        "cannon-es exposes no native swept TOI; fast-body protection is Aura3D's adaptive-substep wrapper above the solver."
    }
  };
}

function zRotation(angle: number): readonly [number, number, number, number] {
  return [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)];
}
