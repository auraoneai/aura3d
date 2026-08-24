import type { AuraBodyHandle, AuraPhysicsRuntime, GameInputController } from "@aura3d/engine";
import {
  EYE_HEIGHT,
  LOOK_AHEAD,
  PLAYER_START,
  WALK_Y,
  lookDirection,
  rightDirection,
  type FpsRunState
} from "./state";

const WALK_SPEED = 4.6;
const SPRINT_SPEED = 7.4;
const LOOK_SENS = 0.0024;
const PITCH_LIMIT = 1.15;

export function applyTouchLook(state: FpsRunState, dx: number, dy: number, reducedMotion: boolean): void {
  const scale = reducedMotion ? 0.45 : 1;
  state.yaw -= dx * 0.006 * scale;
  state.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, state.pitch - dy * 0.006 * scale));
}

export function updateLook(state: FpsRunState, input: GameInputController, reducedMotion: boolean): void {
  const scale = reducedMotion ? 0.45 : 1;
  state.yaw -= input.axis("lookX") * LOOK_SENS * scale;
  state.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, state.pitch - input.axis("lookY") * LOOK_SENS * scale));
}

export function updatePlayer(
  state: FpsRunState,
  input: GameInputController,
  physics: AuraPhysicsRuntime,
  playerBody: AuraBodyHandle,
  dt: number
): void {
  const grounded = physics.queries.raycast(
    [playerBody.position()[0], playerBody.position()[1], playerBody.position()[2]],
    [0, -1, 0],
    { maxDistance: 1.15, ignore: [playerBody.id] }
  );
  state.grounded = Boolean(grounded);
  state.sprinting = input.held("sprint");

  const forward = lookDirection(state.yaw, 0);
  const right = rightDirection(state.yaw);
  const wishX = right[0] * input.axis("moveX") + forward[0] * input.axis("moveZ");
  const wishZ = right[2] * input.axis("moveX") + forward[2] * input.axis("moveZ");
  const length = Math.hypot(wishX, wishZ);
  const speed = state.sprinting ? SPRINT_SPEED : WALK_SPEED;
  const vx = length > 0.001 ? (wishX / length) * speed : 0;
  const vz = length > 0.001 ? (wishZ / length) * speed : 0;
  const at = playerBody.position();
  playerBody.teleport([at[0], WALK_Y, at[2]]);
  playerBody.setVelocity([vx, 0, vz]);

  if (state.hp <= 0 && state.status === "playing") {
    state.status = "lost";
    state.objective = "Down. Press R to reset";
  }

  void dt;
}

export function playerEye(playerBody: AuraBodyHandle): readonly [number, number, number] {
  const at = playerBody.position();
  return [at[0], EYE_HEIGHT, at[2]];
}

export function lookTargetPoint(playerBody: AuraBodyHandle, state: FpsRunState): readonly [number, number, number] {
  const eye = playerEye(playerBody);
  // The runtime follow target owns both axes. Keeping pitch out of this point
  // left hitscan truth correct but let the authored camera target overwrite the
  // vertical mouse-look result every frame.
  const dir = lookDirection(state.yaw, state.pitch);
  return [eye[0] + dir[0] * LOOK_AHEAD, eye[1] + dir[1] * LOOK_AHEAD, eye[2] + dir[2] * LOOK_AHEAD];
}

export function resetPlayer(playerBody: AuraBodyHandle): void {
  playerBody.teleport([...PLAYER_START]);
}
