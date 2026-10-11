// Input map + touch stick + autorun driver — extracted from boot.ts for 14-LOC.
import { game as engineGame, type GameInputController } from "@aura3d/engine";
import type { GalleryCtx } from "./state";

export function createGalleryInput(): GameInputController {
  return engineGame.input({
    actions: {
      moveUp: ["KeyW", "ArrowUp"],
      moveDown: ["KeyS", "ArrowDown"],
      moveLeft: ["KeyA", "ArrowLeft"],
      moveRight: ["KeyD", "ArrowRight"],
      sneak: ["ShiftLeft", "ShiftRight"],
      sprint: ["KeyX"],
      lift: ["KeyE"],
      pause: ["KeyP", "Escape"],
      restart: ["KeyR"]
    },
    axes: {
      moveX: { negative: "moveLeft", positive: "moveRight" },
      moveZ: { negative: "moveUp", positive: "moveDown" }
    },
    bufferMs: 80  });
}

export function wireGalleryTouch(ctx: GalleryCtx, deps: {
  target: HTMLElement;
  unlockAudio: () => void;
}) {
  const { target, unlockAudio } = deps;
  
  // Touch zones on the canvas: left half = move stick (drag direction), right
  // half hold = lift, right-half quick tap toggles sneak, right-half flick = sprint
  // while held. Same contract the lane-swipe preset promises.
  
  const canvasEl = (): HTMLElement | null => target.querySelector("canvas");
  function wireTouch() {
    const canvas = canvasEl();
    if (!canvas) return;
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", (event) => {
      ctx.touchEngaged = true;
      const rect = canvas.getBoundingClientRect();
      const nx = (event.clientX - rect.left) / Math.max(1, rect.width);
      ctx.activePointer = { id: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, lift: nx > 0.5, moved: false };
      if (nx > 0.5) ctx.touchLiftHeld = true;
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!ctx.activePointer || event.pointerId !== ctx.activePointer.id) return;
      const dx = event.clientX - ctx.activePointer.startX;
      const dy = event.clientY - ctx.activePointer.startY;
      ctx.activePointer.x = event.clientX;
      ctx.activePointer.y = event.clientY;
      if (Math.hypot(dx, dy) > 12) ctx.activePointer.moved = true;
      const rect = canvas.getBoundingClientRect();
      const nx = (ctx.activePointer.startX - rect.left) / Math.max(1, rect.width);
      if (nx <= 0.5) {
        const mag = Math.hypot(dx, dy);
        if (mag > 18) {
          ctx.touchMoveX = Math.max(-1, Math.min(1, dx / 64));
          ctx.touchMoveZ = Math.max(-1, Math.min(1, dy / 64));
        }
      } else if (dx > 56) {
        ctx.touchSprint = true;
      }
    });
    const release = (event: PointerEvent) => {
      if (!ctx.activePointer || event.pointerId !== ctx.activePointer.id) return;
      const wasLift = ctx.activePointer.lift;
      const moved = ctx.activePointer.moved;
      ctx.activePointer = null;
      ctx.touchMoveX = 0;
      ctx.touchMoveZ = 0;
      ctx.touchSprint = false;
      if (wasLift) {
        ctx.touchLiftHeld = false;
        if (!moved) ctx.touchSneak = !ctx.touchSneak;
      }
    };
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);
  }
  wireTouch();
  
  // ---- autorun ----------------------------------------------------------------------
  // Scripted inputs through the same ThiefPlayer.update path: seek phase sprints
  // toward guard-1's live position until a real alert lands (filling detection
  // through the real LOS chain), then orbit phase sneak-walks around the foyer so
  // the meter drains while the rig keeps proving facing + tracks.
  function autorunInputs(): { moveX: number; moveZ: number; gait: "walk" | "sneak" | "sprint"; liftHeld: boolean } {
    ctx.autorunClock += 1 / 60;
    const thief = ctx.runtime.thief.snapshot();
    if (ctx.autorunPhase === "seek") {
      const guard = ctx.runtime.guards[0]!;
      const dx = guard.x - thief.x;
      const dz = guard.z - thief.z;
      const mag = Math.hypot(dx, dz) || 1;
      if (ctx.runtime.guards.some((candidate) => candidate.state === "alert")) ctx.autorunPhase = "orbit";
      return { moveX: dx / mag, moveZ: dz / mag, gait: "sprint", liftHeld: false };
    }
    // Orbit the foyer lane: keeps the rig moving silently (sneak) so the meter
    // drains and the round never reaches caught before the shots are taken.
    const t = ctx.autorunClock * 0.9;
    const cx = Math.cos(t) * 2.4;
    const cz = 4.55 + Math.sin(t) * 0.8;
    const dx = cx - thief.x;
    const dz = cz - thief.z;
    const mag = Math.hypot(dx, dz) || 1;
    return { moveX: dx / mag, moveZ: dz / mag, gait: "sneak", liftHeld: false };
  }

  return { autorunInputs };
}
