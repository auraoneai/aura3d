/**
 * Composed rim collider, backboard, net sensor, and heat progression hoop modes.
 */
import { HOOP_BASE_POSITION, BACKBOARD_POSITION, RIM_DIMENSIONS } from "./court";

export type HoopMode = "open" | "spots" | "pressure" | "fire" | "gold";
export type DefenderTelegraph = "inactive" | "windup" | "contest" | "recover";
export type ShotResult = "swish" | "rim-in" | "bank" | "rim-out" | "brick" | "violation" | "blocked";

export interface HoopState {
  x: number;
  y: number;
  z: number;
  mode: HoopMode;
  swayOffset: number;
  defenderActive: boolean;
  defenderX: number;
  defenderY: number;
  defenderZ: number;
  defenderTelegraph: DefenderTelegraph;
  contestAimOffset: number;
}

export const RESTITUTION = {
  rim: 0.6,
  board: 0.7,
  ground: 0.75,
  defender: 0.4
} as const;

export function initialHoopState(heat: number): HoopState {
  const mode = modeForHeat(heat);
  return {
    x: HOOP_BASE_POSITION.x,
    y: HOOP_BASE_POSITION.y,
    z: HOOP_BASE_POSITION.z,
    mode,
    swayOffset: 0,
    defenderActive: heat === 3,
    defenderX: 0,
    defenderY: 0.9,
    defenderZ: 2.2,
    defenderTelegraph: "inactive",
    contestAimOffset: 0
  };
}

function modeForHeat(heat: number): HoopMode {
  if (heat === 2) return "spots";
  if (heat === 3) return "pressure";
  if (heat === 4) return "fire";
  if (heat >= 5) return "gold";
  return "open";
}

export function updateHoop(state: HoopState, heat: number, timeSeconds: number, currentSpotX: number): HoopState {
  const mode = modeForHeat(heat);
  const sway = 0;

  let defY = 0.9;
  let defX = 0;
  let defZ = 2.2;
  const defActive = heat === 3;
  let defenderTelegraph: DefenderTelegraph = "inactive";
  if (defActive) {
    // Fully deterministic 1.6 s telegraph: crouch, contest, then recover.
    const cycle = (timeSeconds % 1.6);
    defenderTelegraph = cycle < 0.6 ? "windup" : cycle < 1.1 ? "contest" : "recover";
    if (defenderTelegraph === "contest") {
      const jumpNorm = (cycle - 0.6) / 0.5;
      defY = 0.9 + Math.sin(jumpNorm * Math.PI) * 1.2;
    }
    // Defender shades towards current spot's half-court
    defX = currentSpotX * 0.4;
  }

  return {
    ...state,
    mode,
    x: HOOP_BASE_POSITION.x + sway,
    y: HOOP_BASE_POSITION.y,
    z: HOOP_BASE_POSITION.z,
    swayOffset: sway,
    defenderActive: defActive,
    defenderX: defX,
    defenderY: defY,
    defenderZ: defZ,
    defenderTelegraph,
    // The visible shade direction creates a small documented release offset;
    // it never edits the result after launch.
    contestAimOffset: defActive ? defX * (defenderTelegraph === "contest" ? 0.08 : 0.04) : 0
  };
}

export interface BallCollisionOutcome {
  hitRim: boolean;
  hitBoard: boolean;
  hitDefender: boolean;
  scored: boolean;
  reboundVx: number;
  reboundVy: number;
  reboundVz: number;
}

/**
 * Checks ball physics interactions with composed rim, backboard, defender, and net sensor.
 */
export function testHoopCollision(
  ballPos: { x: number; y: number; z: number },
  ballPrevPos: { x: number; y: number; z: number },
  ballVel: { vx: number; vy: number; vz: number },
  hoop: HoopState,
  ballRadius = 0.12,
  rimSequenceArmed = false
): BallCollisionOutcome {
  let hitRim = false;
  let hitBoard = false;
  let hitDefender = false;
  let scored = false;
  let { vx, vy, vz } = ballVel;

  // 1. Check Defender Block in Heat 3
  if (hoop.defenderActive) {
    const dx = Math.abs(ballPos.x - hoop.defenderX);
    const dy = Math.abs(ballPos.y - hoop.defenderY);
    const dz = Math.abs(ballPos.z - hoop.defenderZ);
    if (dx < 0.45 && dy < 0.95 && dz < 0.25 && vy > -2) {
      hitDefender = true;
      vx = -vx * RESTITUTION.defender + (ballPos.x - hoop.defenderX) * 0.8;
      vy = -vy * RESTITUTION.defender;
      vz = -Math.abs(vz) * RESTITUTION.defender - 2;
      return { hitRim, hitBoard, hitDefender, scored: false, reboundVx: vx, reboundVy: vy, reboundVz: vz };
    }
  }

  // 2. Check Backboard Collision
  // Backboard is centered at (hoop.x, 3.35, -0.35), size (1.8, 1.05, 0.05)
  const bbZ = BACKBOARD_POSITION.z;
  const bbMinX = hoop.x - BACKBOARD_POSITION.width / 2;
  const bbMaxX = hoop.x + BACKBOARD_POSITION.width / 2;
  const bbMinY = BACKBOARD_POSITION.y - BACKBOARD_POSITION.height / 2;
  const bbMaxY = BACKBOARD_POSITION.y + BACKBOARD_POSITION.height / 2;

  if (
    ballPos.x >= bbMinX &&
    ballPos.x <= bbMaxX &&
    ballPos.y >= bbMinY &&
    ballPos.y <= bbMaxY
  ) {
    if (ballPrevPos.z > bbZ + ballRadius && ballPos.z <= bbZ + ballRadius) {
      hitBoard = true;
      vz = Math.abs(vz) * RESTITUTION.board;
      vy = vy * 0.85; // Authored backboard friction
    }
  }

  // 3. Composed Rim Contact & Net Sensor Passage
  const rimRadius = RIM_DIMENSIONS.radius;
  const distToRimCenter = Math.hypot(ballPos.x - hoop.x, ballPos.z - hoop.z);

  // Net Sensor: ball passes downwards through the cylinder inside the rim
  const passedThroughY = ballPrevPos.y >= hoop.y && ballPos.y <= hoop.y;
  if (rimSequenceArmed && passedThroughY && distToRimCenter < rimRadius - 0.03 && vy < 0) {
    scored = true;
    vy *= 0.3; // Net drag slows ball exit
    vx *= 0.5;
    vz *= 0.5;
  } else if (Math.abs(ballPos.y - hoop.y) < RIM_DIMENSIONS.pipeRadius + ballRadius) {
    // Ball near rim plane: check collision with the circular rim tube
    const distFromTube = Math.abs(distToRimCenter - rimRadius);
    if (distFromTube < RIM_DIMENSIONS.pipeRadius + ballRadius) {
      hitRim = true;
      // Normal from rim tube to ball center
      const angle = Math.atan2(ballPos.z - hoop.z, ballPos.x - hoop.x);
      const nx = Math.cos(angle);
      const nz = Math.sin(angle);

      // Bounce normal
      const dot = vx * nx + vz * nz;
      if (dot < 0) {
        vx = (vx - 2 * dot * nx) * RESTITUTION.rim;
        vz = (vz - 2 * dot * nz) * RESTITUTION.rim;
        vy = Math.abs(vy) * RESTITUTION.rim + 1.2;
      }
    }
  }

  return {
    hitRim,
    hitBoard,
    hitDefender,
    scored,
    reboundVx: vx,
    reboundVy: vy,
    reboundVz: vz
  };
}
