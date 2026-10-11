// Input map + DAS repeat + touch zones — extracted from boot.ts for 14-LOC.
import { game as engineGame, type GameInputController } from "@aura3d/engine";
import type { Game } from "@aura3d/game";
import type { BlockfallCtx } from "./state";

export function createBlockfallInput(): GameInputController {
  return engineGame.input({
    actions: {
      left: ["ArrowLeft", "KeyA"],
      right: ["ArrowRight", "KeyD"],
      rotateCW: ["ArrowUp", "KeyW", "KeyX", "KeyE"],
      rotateCCW: ["KeyZ", "KeyQ"],
      softDrop: ["ArrowDown", "KeyS"],
      hardDrop: ["Space"],
      hold: ["KeyC", "ShiftLeft", "ShiftRight"],
      pause: ["Escape", "KeyP"],
      reset: ["KeyR"]
    },
    bufferMs: 120
  });
}

// Manual DAS-repeat state (rules consume discrete moves per press/repeat).
export function dasRepeat(ctx: BlockfallCtx, timerKey: keyof BlockfallCtx["dasTimers"], dt: number, pressed: boolean, held: boolean): boolean {
  const timers = ctx.dasTimers;
  if (pressed) { timers[timerKey] = 0.16; return true; }
  if (!held) { timers[timerKey] = 0; return false; }
  timers[timerKey] -= dt;
  if (timers[timerKey] <= 0) { timers[timerKey] = 0.055; return true; }
  return false;
}

export function wireBlockfallTouch(ctx: BlockfallCtx, deps: {
  game: Game;
  unlockAudio: () => void;
}): void {
  const { game, unlockAudio } = deps;
// Touch zones: left-third tap = move left, right-third = move right, lower
  // third = soft drop, swipe-down = hard drop, upper two-thirds centre tap =
  // rotate, two-finger tap = hold. Pointer zones, not DOM buttons (touch:null stub).
    const canvas = game.app.canvas;
  if (canvas) {
    canvas.style.touchAction = "none";
    const zones = new Map<number, { x0: number; y0: number; role: "move" | "soft" | "hard" | "rotate" }>();
    canvas.addEventListener("pointerdown", (event) => {
      unlockAudio();
      ctx.touchEngaged = true;
      const rect = canvas.getBoundingClientRect();
      const nx = (event.clientX - rect.left) / Math.max(1, rect.width);
      const ny = (event.clientY - rect.top) / Math.max(1, rect.height);
      if (ny > 0.72) zones.set(event.pointerId, { x0: event.clientX, y0: event.clientY, role: "soft" });
      else if (nx < 0.42) zones.set(event.pointerId, { x0: event.clientX, y0: event.clientY, role: "move" });
      else if (nx > 0.58) zones.set(event.pointerId, { x0: event.clientX, y0: event.clientY, role: "move" });
      else zones.set(event.pointerId, { x0: event.clientX, y0: event.clientY, role: "rotate" });
      const zone = zones.get(event.pointerId);
      if (zone?.role === "move") {
        ctx.queuedActions.push({ type: "move", dx: nx < 0.42 ? -1 : 1 });
      } else if (zone?.role === "rotate") {
        ctx.queuedActions.push({ type: "rotate", direction: 1 });
      }
    });
    canvas.addEventListener("pointermove", (event) => {
      const zone = zones.get(event.pointerId);
      if (!zone) return;
      const dy = event.clientY - zone.y0;
      if (dy > 48 && zone.role !== "soft") {
        zone.role = "hard";
        ctx.queuedActions.push({ type: "hardDrop" });
      }
    });
    canvas.addEventListener("pointerup", (event) => zones.delete(event.pointerId));
    canvas.addEventListener("pointercancel", (event) => zones.delete(event.pointerId));
  }
  
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      game.session.pause("visibility");
      if (!ctx.state.paused && !ctx.state.gameOver) ctx.queuedActions.push({ type: "pause" });
    } else {
      game.session.resume();
      if (ctx.state.paused) ctx.queuedActions.push({ type: "pause" });
    }
  });
}
