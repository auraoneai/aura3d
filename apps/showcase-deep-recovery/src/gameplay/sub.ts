/**
 * 6-DOF submarine movement model, authored hydrodynamic drag, buoyancy, and collision bounds.
 */
import { WORLD_BOUNDS, WRECK_OBSTACLES, type Vec3 } from "./reef";

export interface SubmarineState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number; // heading rad
  pitch: number; // trim rad
  roll: number; // bank rad
  speed: number;
  throttle: number; // -1 .. 1
  heaveInput: number; // -1 (dive) .. 1 (surface)
  turnInput: number; // -1 (left) .. 1 (right)
  sprint: boolean;
  impactSpeedLastFrame: number;
}

export interface SubmarineConfig {
  readonly maxForwardSpeed: number; // 12 m/s
  readonly maxReverseSpeed: number; // 5 m/s
  readonly maxHeaveSpeed: number; // 6 m/s
  readonly turnRate: number; // 1.8 rad/s
  readonly pitchRate: number; // 1.2 rad/s
  readonly acceleration: number; // 14 m/s^2
  readonly dragLinear: number; // water drag
  readonly dragAngular: number;
  readonly neutralBuoyancyForce: number;
}

export const DEFAULT_SUB_CONFIG: SubmarineConfig = {
  maxForwardSpeed: 12.0,
  maxReverseSpeed: 5.0,
  maxHeaveSpeed: 6.5,
  turnRate: 1.8,
  pitchRate: 1.2,
  acceleration: 14.0,
  dragLinear: 1.8,
  dragAngular: 3.5,
  neutralBuoyancyForce: 0.15
};

export function initialSubmarineState(): SubmarineState {
  return {
    x: 0,
    y: -6.0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: 0,
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0,
    heaveInput: 0,
    turnInput: 0,
    sprint: false,
    impactSpeedLastFrame: 0
  };
}

export function updateSubmarine(
  state: SubmarineState,
  inputs: { throttle: number; heave: number; turn: number; pitch: number; sprint: boolean },
  towDrag: number,
  dt: number,
  config: SubmarineConfig = DEFAULT_SUB_CONFIG
): SubmarineState {
  // Speed multiplier under sprint or tow drag
  const speedCapMultiplier = (inputs.sprint ? 1.4 : 1.0) / (1.0 + towDrag);
  const accelMultiplier = 1.0 / (1.0 + towDrag * 0.8);

  // Turn and pitch
  const nextYaw = state.yaw + inputs.turn * config.turnRate * dt;
  const nextPitch = Math.max(-0.6, Math.min(0.6, state.pitch + inputs.pitch * config.pitchRate * dt));
  // Dynamic roll bank during turns
  const targetRoll = -inputs.turn * 0.25;
  const nextRoll = state.roll + (targetRoll - state.roll) * Math.min(1, 8.0 * dt);

  // Forward thrust vector based on yaw & pitch
  // Heading convention: yaw 0 faces +Z, +yaw turns right (+X)
  const forwardX = Math.sin(nextYaw) * Math.cos(nextPitch);
  const forwardY = Math.sin(nextPitch);
  const forwardZ = Math.cos(nextYaw) * Math.cos(nextPitch);

  const thrust = inputs.throttle * config.acceleration * accelMultiplier;
  const thrustX = forwardX * thrust;
  const thrustY = forwardY * thrust + inputs.heave * config.acceleration * 0.8;
  const thrustZ = forwardZ * thrust;

  // Apply acceleration + drag
  let nextVx = state.vx + (thrustX - state.vx * config.dragLinear) * dt;
  let nextVy = state.vy + (thrustY - state.vy * config.dragLinear + config.neutralBuoyancyForce) * dt;
  let nextVz = state.vz + (thrustZ - state.vz * config.dragLinear) * dt;

  // Cap speed
  const maxSpd = config.maxForwardSpeed * speedCapMultiplier;
  const curSpd = Math.hypot(nextVx, nextVy, nextVz);
  if (curSpd > maxSpd) {
    const scale = maxSpd / curSpd;
    nextVx *= scale;
    nextVy *= scale;
    nextVz *= scale;
  }

  // Integrate position
  let nextX = state.x + nextVx * dt;
  let nextY = state.y + nextVy * dt;
  let nextZ = state.z + nextVz * dt;
  let impactSpeed = 0;

  // World bounds clamp & collision
  if (nextX < WORLD_BOUNDS.minX) { nextX = WORLD_BOUNDS.minX; impactSpeed = Math.max(impactSpeed, Math.abs(nextVx)); nextVx = 0; }
  if (nextX > WORLD_BOUNDS.maxX) { nextX = WORLD_BOUNDS.maxX; impactSpeed = Math.max(impactSpeed, Math.abs(nextVx)); nextVx = 0; }
  if (nextZ < WORLD_BOUNDS.minZ) { nextZ = WORLD_BOUNDS.minZ; impactSpeed = Math.max(impactSpeed, Math.abs(nextVz)); nextVz = 0; }
  if (nextZ > WORLD_BOUNDS.maxZ) { nextZ = WORLD_BOUNDS.maxZ; impactSpeed = Math.max(impactSpeed, Math.abs(nextVz)); nextVz = 0; }
  if (nextY > WORLD_BOUNDS.surfaceY) { nextY = WORLD_BOUNDS.surfaceY; nextVy = Math.min(0, nextVy); }
  if (nextY < WORLD_BOUNDS.seabedY) { nextY = WORLD_BOUNDS.seabedY; impactSpeed = Math.max(impactSpeed, Math.abs(nextVy)); nextVy = 0; }

  // Obstacle collisions
  for (const obs of WRECK_OBSTACLES) {
    const dx = nextX - obs.x;
    const dz = nextZ - obs.z;
    const dist2D = Math.hypot(dx, dz);
    const inY = nextY >= obs.y - obs.height / 2 && nextY <= obs.y + obs.height / 2;

    if (inY && dist2D < obs.radius + 1.2) {
      const pushX = (dx / (dist2D || 1)) * (obs.radius + 1.2);
      const pushZ = (dz / (dist2D || 1)) * (obs.radius + 1.2);
      nextX = obs.x + pushX;
      nextZ = obs.z + pushZ;
      impactSpeed = Math.max(impactSpeed, curSpd);
      nextVx *= 0.2;
      nextVz *= 0.2;
    }
  }

  return {
    x: nextX,
    y: nextY,
    z: nextZ,
    vx: nextVx,
    vy: nextVy,
    vz: nextVz,
    yaw: nextYaw,
    pitch: nextPitch,
    roll: nextRoll,
    speed: curSpd,
    throttle: inputs.throttle,
    heaveInput: inputs.heave,
    turnInput: inputs.turn,
    sprint: inputs.sprint,
    impactSpeedLastFrame: impactSpeed
  };
}
