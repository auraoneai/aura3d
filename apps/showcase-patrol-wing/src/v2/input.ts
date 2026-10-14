import { game as engineGame, type GameInputController } from "@aura3d/engine";
import type { Game } from "@aura3d/game";
import type { FlightInput } from "../gameplay/flight";
import type { PatrolCtx } from "./state";
import { RING_GATES, RING_COUNT } from "../legacy/sky";

// ------------------------------------------------------------- input ---------

export function createPatrolInput(): GameInputController {
  return engineGame.input({
  actions: {
    pitchUp: ["KeyS", "ArrowDown"],
    pitchDown: ["KeyW", "ArrowUp"],
    rollLeft: ["KeyA", "ArrowLeft"],
    rollRight: ["KeyD", "ArrowRight"],
    yawLeft: ["KeyQ"],
    yawRight: ["KeyE"],
    throttleUp: ["ShiftLeft", "ShiftRight"],
    throttleDown: ["ControlLeft", "ControlRight"],
    fire: ["Space"],
    reset: ["KeyR"],
    pause: ["KeyP"]
  },
  bufferMs: 90
  });
}

export function readFlightInput(ctx: PatrolCtx, input: GameInputController): FlightInput {
  const rollTouch = ctx.touchDrive?.roll ?? 0;
  const pitchTouch = ctx.touchDrive?.pitch ?? 0;
  const base: FlightInput = {
    pitchUp: input.held("pitchUp") || pitchTouch < -0.3,
    pitchDown: input.held("pitchDown") || pitchTouch > 0.3,
    rollLeft: input.held("rollLeft") || rollTouch < -0.3,
    rollRight: input.held("rollRight") || rollTouch > 0.3,
    yawLeft: input.held("yawLeft") || input.held("rollLeft") || rollTouch < -0.55,
    yawRight: input.held("yawRight") || input.held("rollRight") || rollTouch > 0.55,
    throttleUp: input.held("throttleUp") || ctx.touchThrottle > 0,
    throttleDown: input.held("throttleDown") || ctx.touchThrottle < 0
  };
  if (!ctx.autopilotEnabled && !ctx.scenarioTakeoff) return base;

  // Deterministic sortie autopilot: throttle up, climb out west, steer onto
  // the next gate, fire when a drone sits inside the nose cone.
  if (ctx.scenarioTakeoff && ctx.flight.grounded !== "airborne") {
    return { ...base, throttleUp: true };
  }
  const pos = ctx.flight.position;
  const gate = RING_GATES[Math.min(ctx.rings.nextRing, RING_COUNT - 1)]!;
  const dx = gate.position[0] - pos[0];
  const dy = gate.position[1] - pos[1];
  const dz = gate.position[2] - pos[2];
  // Nose is +x: steer the authored yaw toward the next gate bearing.
  const f = ctx.flight.forward;
  const fwdYaw = Math.atan2(-f[2], f[0]);
  const gateYaw = Math.atan2(-dz, dx);
  let err = gateYaw - fwdYaw;
  while (err > Math.PI) err -= Math.PI * 2;
  while (err < -Math.PI) err += Math.PI * 2;
  const pitchErr = Math.atan2(dy, Math.hypot(dx, dz)) - Math.asin(Math.max(-1, Math.min(1, f[1])));
  return {
    ...base,
    yawLeft: err > 0.12,
    yawRight: err < -0.12,
    rollLeft: err > 0.28,
    rollRight: err < -0.28,
    pitchUp: pitchErr > 0.1,
    pitchDown: pitchErr < -0.12,
    throttleUp: ctx.flight.throttle < 0.9,
    throttleDown: false
  };
}

// ------------------------------------------------------------ touch ---------
// createGame stub ships touch:null (declarative only), so real touch input
// rides manual pointer zones on the canvas — same approach as deep-recovery:
// left-half drag = drive stick (x roll / y pitch), right-half top hold =
// throttle up, right-half bottom hold = throttle down, right-middle tap =
// fire. `ctx.touchEngaged` proves the zone path fired for the spec.
export function wirePatrolTouch(ctx: PatrolCtx, deps: { game: Game; unlockAudio: () => void }): void {
  const { game, unlockAudio } = deps;
  const canvas = game.app.canvas;
  if (canvas) {
  canvas.style.touchAction = "none";
  const zones = new Map<number, { x0: number; y0: number; role: "drive" | "fire" | "throttle" }>();
  canvas.addEventListener("pointerdown", (event) => {
    unlockAudio();
    const rect = canvas.getBoundingClientRect();
    const nx = (event.clientX - rect.left) / Math.max(1, rect.width);
    const ny = (event.clientY - rect.top) / Math.max(1, rect.height);
    let role: "drive" | "fire" | "throttle";
    if (nx < 0.5) role = "drive";
    else if (ny < 0.34) role = "throttle";
    else if (ny > 0.72) role = "fire";
    else role = "fire";
    zones.set(event.pointerId, { x0: event.clientX, y0: event.clientY, role });
    if (role === "throttle") ctx.touchThrottle = ny < 0.34 ? 1 : -1;
    if (role === "fire") ctx.touchFire = true;
    if (role === "drive") ctx.touchDrive = { roll: 0, pitch: 0 };
    ctx.touchEngaged = true;
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic evidence pointers may have no native capture target.
    }
  });
  canvas.addEventListener("pointermove", (event) => {
    const zone = zones.get(event.pointerId);
    if (!zone) return;
    if (zone.role === "drive") {
      const rect = canvas.getBoundingClientRect();
      ctx.touchDrive = {
        roll: ((event.clientX - zone.x0) / Math.max(1, rect.width)) * 4,
        pitch: ((event.clientY - zone.y0) / Math.max(1, rect.height)) * 4
      };
    }
  });
  const releaseZone = (event: PointerEvent) => {
    const zone = zones.get(event.pointerId);
    if (!zone) return;
    zones.delete(event.pointerId);
    if (zone.role === "drive") ctx.touchDrive = null;
    if (zone.role === "fire") ctx.touchFire = false;
    if (zone.role === "throttle") ctx.touchThrottle = 0;
  };
  canvas.addEventListener("pointerup", releaseZone);
  canvas.addEventListener("pointercancel", releaseZone);
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) game.session.pause("visibility");
  else game.session.resume();
});
}
