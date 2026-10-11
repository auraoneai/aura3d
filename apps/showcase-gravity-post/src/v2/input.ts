// Input map + aim control + pointer/keyboard listeners — extracted for 14-LOC.
import { game as engineGame, type GameInputController } from "@aura3d/engine";
import type { Game } from "@aura3d/game";
import { skipFlyby, updateFlyby } from "../gameplay/flyby";
import type { GravityCtx } from "./state";

const AIM_DRAG_PIXEL_RANGE = 190;
const KEYBOARD_AIM_RATE = 1.05;
const KEYBOARD_POWER_RATE = 0.5;
const KEYBOARD_MIN_POWER = 0.08;
export const MIN_LAUNCH_POWER = 0.18;
export const MAX_LAUNCH_SPEED = 2.85;

export function createGravityInput(): GameInputController {
  return engineGame.input({
    actions: {
      burnPrograde: ["KeyW", "ArrowUp"],
      burnRetro: ["KeyS", "ArrowDown"],
      warp: ["Space"],
      next: ["KeyN"],
      retry: ["KeyR"],
      pause: ["KeyP"],
      aimCounterClockwise: ["ArrowLeft", "KeyA"],
      aimClockwise: ["ArrowRight", "KeyD"],
      powerDown: ["KeyZ"],
      powerUp: ["KeyX"],
      // §6.9.13 P0 (wave-3 day-0): Enter launches along the active aim — the
      // drag gesture stays authoritative while a pointer is held.
      launch: ["Enter"]
    },
    bufferMs: 90
  });
}

export function wireGravityAim(ctx: GravityCtx, deps: {
  game: Game;
  input: GameInputController;
  unlockAudio: () => void;
  originStation(): { readonly x: number; readonly z: number };
  destinationStation(): { readonly x: number; readonly z: number };
  launchWithPrediction(dir: readonly [number, number], speed: number, by: "pointer" | "keyboard" | "autopilot"): void;
}) {
  const { game, input, unlockAudio, originStation, destinationStation, launchWithPrediction } = deps;
  
  function resetKeyboardAim(): void {
    const from = originStation();
    const to = destinationStation();
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    ctx.keyboardAimBearing = Math.hypot(dx, dz) > 1e-6 ? Math.atan2(dx, dz) : 0;
    ctx.keyboardAimPower = 0.6;
  }
  resetKeyboardAim();
  
  function keyboardAimVector(): { dirX: number; dirZ: number; power: number } {
    return {
      dirX: Math.sin(ctx.keyboardAimBearing),
      dirZ: Math.cos(ctx.keyboardAimBearing),
      power: ctx.keyboardAimPower
    };
  }
  
  function currentAimVector(): { dirX: number; dirZ: number; power: number } | null {
    const dx = ctx.aimCurrent.x - ctx.aimStart.x;
    const dy = ctx.aimCurrent.y - ctx.aimStart.y;
    const lengthPx = Math.hypot(dx, dy);
    if (lengthPx < 6) return null;
    const power = Math.min(1, lengthPx / AIM_DRAG_PIXEL_RANGE);
    return { dirX: dx / lengthPx, dirZ: dy / lengthPx, power };
  }
  
  function activeAimVector(): { dirX: number; dirZ: number; power: number } | null {
    return ctx.aiming ? currentAimVector() : keyboardAimVector();
  }
  
  function steerKeyboardAim(dt: number): void {
    if (input.held("aimCounterClockwise")) ctx.keyboardAimBearing -= KEYBOARD_AIM_RATE * dt;
    if (input.held("aimClockwise")) ctx.keyboardAimBearing += KEYBOARD_AIM_RATE * dt;
    if (input.held("powerUp")) ctx.keyboardAimPower = Math.min(1, ctx.keyboardAimPower + KEYBOARD_POWER_RATE * dt);
    if (input.held("powerDown")) ctx.keyboardAimPower = Math.max(KEYBOARD_MIN_POWER, ctx.keyboardAimPower - KEYBOARD_POWER_RATE * dt);
  }
  
  function launchActiveAim(by: "pointer" | "keyboard" | "autopilot"): boolean {
    const vector = activeAimVector();
    if (!vector || vector.power < MIN_LAUNCH_POWER) return false;
    const speed = MIN_LAUNCH_POWER + vector.power * (MAX_LAUNCH_SPEED - MIN_LAUNCH_POWER);
    launchWithPrediction([vector.dirX, vector.dirZ], speed, by);
    return true;
  }
  
  const canvas = game.app.canvas;
  if (canvas) {
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", (event) => {
      unlockAudio();
      if (ctx.pod.state !== "ready" || ctx.paused || ctx.flyby.active) return;
      ctx.aiming = true;
      ctx.aimStart.x = event.clientX;
      ctx.aimStart.y = event.clientY;
      ctx.aimCurrent.x = event.clientX;
      ctx.aimCurrent.y = event.clientY;
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        // Synthetic evidence pointers may have no native capture target.
      }
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!ctx.aiming) return;
      ctx.aimCurrent.x = event.clientX;
      ctx.aimCurrent.y = event.clientY;
    });
    const releaseAim = (): void => {
      if (!ctx.aiming) return;
      ctx.aiming = false;
      const vector = currentAimVector();
      if (vector && vector.power >= MIN_LAUNCH_POWER) {
        const speed = MIN_LAUNCH_POWER + vector.power * (MAX_LAUNCH_SPEED - MIN_LAUNCH_POWER);
        launchWithPrediction([vector.dirX, vector.dirZ], speed, "pointer");
      }
    };
    canvas.addEventListener("pointerup", releaseAim);
    canvas.addEventListener("pointercancel", releaseAim);
  }
  
  window.addEventListener("keydown", () => {
    unlockAudio();
    if (ctx.flyby.active) {
      skipFlyby(ctx.flyby);
      updateFlyby(ctx.flyby, 0);
    }
  });
  
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) game.session.pause("visibility");
    else game.session.resume();
  });

  return { resetKeyboardAim, keyboardAimVector, currentAimVector, activeAimVector,
           steerKeyboardAim, launchActiveAim };
}
