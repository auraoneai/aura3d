// Input map + touch zones — extracted from boot.ts for 14-LOC.
import { game as engineGame, type GameInputController } from "@aura3d/engine";
import type { Game } from "@aura3d/game";

const touchDrive = new Map<number, { startX: number; startY: number; x: number; y: number }>();
const touchHeave = new Set<number>();

export function touchInputs(): { throttle: number; turn: number; heave: number } {
  let throttle = 0;
  let turn = 0;
  for (const t of touchDrive.values()) {
    throttle += Math.max(-1, Math.min(1, (t.startY - t.y) / 90));
    turn += Math.max(-1, Math.min(1, (t.x - t.startX) / 90));
  }
  const heave = touchHeave.size > 0 ? 1 : 0;
  return { throttle, turn, heave };
}

export function createDeepInput(): GameInputController {
  return engineGame.input({
    actions: {
      thrust: ["KeyW", "ArrowUp"],
      reverse: ["KeyS", "ArrowDown"],
      turnLeft: ["KeyA", "ArrowLeft"],
      turnRight: ["KeyD", "ArrowRight"],
      surface: ["KeyE", "PageUp"],
      dive: ["KeyQ", "PageDown"],
      sprint: ["ShiftLeft", "ShiftRight"],
      ping: ["Space"],
      grapple: ["KeyF"],
      repair: ["KeyC"],
      pause: ["KeyP"],
      reset: ["KeyR"]
    },
    bufferMs: 90
  });
}

export function wireDeepTouch(deps: {
  target: HTMLElement;
  game: Game;
  handlePing: () => void;
  handleGrappleToggle: () => void;
}): void {
  const { target, game, handlePing, handleGrappleToggle } = deps;
  target.addEventListener("pointerdown", (e) => {
    const rect = target.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / Math.max(1, rect.width);
    const fy = (e.clientY - rect.top) / Math.max(1, rect.height);
    if (fx < 0.5) {
      touchDrive.set(e.pointerId, { startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY });
    } else if (fy < 0.34) {
      handlePing();
    } else if (fy < 0.67) {
      handleGrappleToggle();
    } else {
      touchHeave.add(e.pointerId);
    }
  });
  target.addEventListener("pointermove", (e) => {
    const held = touchDrive.get(e.pointerId);
    if (held) { held.x = e.clientX; held.y = e.clientY; }
  });
  const touchEnd = (e: PointerEvent) => { touchDrive.delete(e.pointerId); touchHeave.delete(e.pointerId); };
  target.addEventListener("pointerup", touchEnd);
  target.addEventListener("pointercancel", touchEnd);

  // T2.6: hidden tab auto-pauses the session.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) game.session.pause("visibility");
    else game.session.resume();
  });
}
