import { Geometry, UnlitMaterial, type RenderItem } from "@aura3d/engine/rendering";
import { composeMat4, quatFromEuler, type Mat4 } from "@aura3d/scene";

/**
 * AC-A5 — spring-joint stage props.
 *
 * Two hanging neon signs on spring joints react to nearby slams. Pure physics flavor: set dressing
 * only, non-gameplay, positioned **outside** the combat lane bounds (fighters clamp at
 * |x| ≤ 2.85; the closest sign surface stays past that even at full deflection), and disabled
 * under reduced motion (rendered static at their rest pose, impulses ignored).
 *
 * The spring is a deterministic damped harmonic oscillator stepped at a fixed dt, so the settled
 * state is reproducible exactly (`tests/unit/apps/clash-sign-joints.test.ts`).
 */

export interface SpringJointSignState {
  /** Swing angle in radians around the hang pivot (z axis). */
  readonly angle: number;
  readonly angularVelocity: number;
}

/** Damped-spring constants shared by both signs. Tuned for a visible wobble that settles fast. */
export const SIGN_SPRING = Object.freeze({
  stiffness: 46,
  damping: 6.4,
  /** Hard clamp so a slam can never fling a sign anywhere near the lane. */
  maxAbsAngle: 0.34,
  settleEpsilon: 1e-4
});

/** Hang geometry: pivot height, arm length, and the fixed pivot x positions. */
export const SIGN_HANG = Object.freeze({
  armLength: 0.44,
  boardWidth: 0.72,
  boardHeight: 0.3,
  pivotX: 3.58 as const,
  pivotY: 2.62,
  pivotZ: -0.34
});

/** The innermost |x| any part of a sign can reach, at the clamped maximum deflection. */
export function signMinimumLaneDistanceX(): number {
  const swing = Math.sin(SIGN_SPRING.maxAbsAngle) * SIGN_HANG.armLength;
  return SIGN_HANG.pivotX - swing - SIGN_HANG.boardWidth / 2;
}

export function isSpringJointSignSettled(state: SpringJointSignState): boolean {
  return Math.abs(state.angle) < SIGN_SPRING.settleEpsilon && Math.abs(state.angularVelocity) < SIGN_SPRING.settleEpsilon;
}

/**
 * Step one sign's spring by a fixed dt with an optional angular impulse (radians/s added to the
 * velocity, signed by which side of the arena the slam landed on).
 */
export function stepSpringJointSign(state: SpringJointSignState, impulse: number, dt: number): SpringJointSignState {
  let angle = state.angle;
  let velocity = state.angularVelocity + impulse;
  // Semi-implicit Euler at the route's frame step: deterministic for a fixed dt.
  const acceleration = -SIGN_SPRING.stiffness * angle - SIGN_SPRING.damping * velocity;
  velocity += acceleration * dt;
  angle += velocity * dt;
  if (angle > SIGN_SPRING.maxAbsAngle) {
    angle = SIGN_SPRING.maxAbsAngle;
    velocity = Math.min(0, velocity);
  } else if (angle < -SIGN_SPRING.maxAbsAngle) {
    angle = -SIGN_SPRING.maxAbsAngle;
    velocity = Math.max(0, velocity);
  }
  return { angle, angularVelocity: velocity };
}

const REST_STATE: SpringJointSignState = Object.freeze({ angle: 0, angularVelocity: 0 });

export interface HangingNeonSigns {
  /** Advance both springs one fixed frame. Impulses are ignored under reduced motion. */
  step(input: { readonly dt: number; readonly slamImpulse: number; readonly reducedMotion: boolean }): void;
  /** Current per-sign state, left then right (for evidence/tests). */
  states(): readonly [SpringJointSignState, SpringJointSignState];
  collect(input: { readonly reducedMotion: boolean }): RenderItem[];
}

export function createHangingNeonSigns(): HangingNeonSigns {
  const rodGeometry = Geometry.cylinder({ radius: 0.02, height: 1, segments: 6 });
  const boardGeometry = Geometry.litCube(1);
  const tubeGeometry = Geometry.litCube(1);
  const housingMaterial = new UnlitMaterial({ name: "hanging-sign-housing", color: [0.09, 0.095, 0.12, 1] });
  const leftTube = new UnlitMaterial({ name: "hanging-sign-neon-left", color: [0.16, 1, 0.78, 1] });
  const rightTube = new UnlitMaterial({ name: "hanging-sign-neon-right", color: [1, 0.36, 0.62, 1] });
  let left: SpringJointSignState = { ...REST_STATE };
  let right: SpringJointSignState = { ...REST_STATE };
  const renderSide = (side: -1 | 1, tube: typeof leftTube, state: SpringJointSignState, reducedMotion: boolean): RenderItem[] => {
    const angle = reducedMotion ? 0 : state.angle;
    const pivotX = side * SIGN_HANG.pivotX;
    // Pendulum kinematics: the board swings on the rod below the pivot.
    const swingX = pivotX + Math.sin(angle) * SIGN_HANG.armLength;
    const swingY = SIGN_HANG.pivotY - Math.cos(angle) * SIGN_HANG.armLength;
    return [
      {
        label: `aura-clash-rendered-stage:hanging-sign-${side === -1 ? "left" : "right"}-rod`,
        geometry: rodGeometry,
        material: housingMaterial,
        modelMatrix: composeMat4(
          [(pivotX + swingX) / 2, (SIGN_HANG.pivotY + swingY) / 2, SIGN_HANG.pivotZ],
          quatFromEuler(0, 0, angle),
          [1, SIGN_HANG.armLength, 1]
        ) as Mat4,
        includeInAutoFrame: false
      },
      {
        label: `aura-clash-rendered-stage:hanging-sign-${side === -1 ? "left" : "right"}`,
        geometry: boardGeometry,
        material: housingMaterial,
        modelMatrix: composeMat4(
          [swingX, swingY - SIGN_HANG.boardHeight / 2, SIGN_HANG.pivotZ],
          quatFromEuler(0, 0, angle),
          [SIGN_HANG.boardWidth, SIGN_HANG.boardHeight, 0.06]
        ) as Mat4,
        includeInAutoFrame: false
      },
      {
        label: `aura-clash-rendered-stage:hanging-sign-${side === -1 ? "left" : "right"}-neon`,
        geometry: tubeGeometry,
        material: tube,
        modelMatrix: composeMat4(
          [swingX, swingY - SIGN_HANG.boardHeight / 2, SIGN_HANG.pivotZ + 0.04],
          quatFromEuler(0, 0, angle),
          [SIGN_HANG.boardWidth * 0.82, SIGN_HANG.boardHeight * 0.4, 0.02]
        ) as Mat4,
        includeInAutoFrame: false
      }
    ];
  };
  return {
    step({ dt, slamImpulse, reducedMotion }) {
      if (reducedMotion || slamImpulse === 0) {
        // No new motion; an existing swing still settles deterministically toward rest.
        if (!reducedMotion) {
          left = stepSpringJointSign(left, 0, dt);
          right = stepSpringJointSign(right, 0, dt);
        }
        return;
      }
      // A slam on one side kicks that side's sign away from the lane; the far sign follows weaker.
      const nearSide: -1 | 1 = slamImpulse > 0 ? -1 : 1;
      const strength = Math.min(1.4, Math.abs(slamImpulse));
      left = stepSpringJointSign(left, nearSide === -1 ? strength : strength * 0.45, dt);
      right = stepSpringJointSign(right, nearSide === 1 ? -strength : -strength * 0.45, dt);
    },
    states() {
      return [{ ...left }, { ...right }] as const;
    },
    collect({ reducedMotion }) {
      return [
        ...renderSide(-1, leftTube, left, reducedMotion),
        ...renderSide(1, rightTube, right, reducedMotion)
      ];
    }
  };
}
