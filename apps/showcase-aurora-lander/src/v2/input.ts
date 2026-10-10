// Input map + timed flight controls + touch zones — extracted for 14-LOC.
import { game as engineGame, type GameInputController } from "@aura3d/engine";
import type { Game } from "@aura3d/game";
export type TimedFlightControl = "thrust" | "left" | "right";

const FIXED_DT = 1 / 60;
import type { AuroraCtx } from "./state";

export function createLanderInput(): GameInputController {
  return engineGame.input({
    actions: {
      thrust: ["KeyW", "ArrowUp"],
      left: ["KeyA", "ArrowLeft"],
      right: ["KeyD", "ArrowRight"],
      restart: ["KeyR"],
      quickRestart: ["Space"],
      ghostToggle: ["KeyG"],
      pause: ["KeyP"]
    },
    axes: {
      steer: { negative: "left", positive: "right" }
    },
    bufferMs: 80  });
}

export function wireLanderInput(ctx: AuroraCtx, deps: {
  target: HTMLElement;
  game: Game;
  unlockAudio: () => void;
}) {
  const { target, game, unlockAudio } = deps;
  
  window.addEventListener("keydown", (e) => {
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  }, { passive: false });
  
  // Preserve the real elapsed duration of held flight controls until the
  // fixed-step sim consumes them — a complete key hold can begin and end between
  // presented frames on a software renderer.
  type TimedFlightControl = "thrust" | "left" | "right";
  const timedControlForCode: Readonly<Record<string, TimedFlightControl | undefined>> = {
    KeyW: "thrust", ArrowUp: "thrust",
    KeyA: "left", ArrowLeft: "left",
    KeyD: "right", ArrowRight: "right"
  };
  const timedControlStartedAt = new Map<TimedFlightControl, number>();
  const timedControlSeconds = new Map<TimedFlightControl, number>();
  const addTimedControlSeconds = (control: TimedFlightControl, seconds: number): void => {
    timedControlSeconds.set(control, Math.min(2, (timedControlSeconds.get(control) ?? 0) + Math.max(0, seconds)));
  };
  const syncTimedFlightControls = (nowMs: number): void => {
    for (const [control, startedAt] of timedControlStartedAt) {
      addTimedControlSeconds(control, (nowMs - startedAt) / 1000);
      timedControlStartedAt.set(control, nowMs);
    }
  };
  const consumeTimedFlightControl = (control: TimedFlightControl): number => {
    const available = timedControlSeconds.get(control) ?? 0;
    if (available <= 0) return 0;
    const consumed = Math.min(FIXED_DT, available);
    timedControlSeconds.set(control, Math.max(0, available - FIXED_DT));
    return consumed / FIXED_DT;
  };
  window.addEventListener("keydown", (event) => {
    const control = timedControlForCode[event.code];
    if (!control || event.repeat || timedControlStartedAt.has(control)) return;
    timedControlStartedAt.set(control, performance.now());
  });
  window.addEventListener("keyup", (event) => {
    const control = timedControlForCode[event.code];
    if (!control) return;
    const startedAt = timedControlStartedAt.get(control);
    if (startedAt !== undefined) addTimedControlSeconds(control, (performance.now() - startedAt) / 1000);
    timedControlStartedAt.delete(control);
  });
  
  // Touch: dpad-4btn preset + pointer zones — left/right thirds steer RCS, the
  // centre third burns the main engine at a fixed rate. Held states are tracked
  // per pointer id so a second finger can join mid-flight.
  const touchThrustZone = { left: 0.34, right: 0.66 };
  const touchHeld = new Map<number, "thrust" | "left" | "right">();
  const touchHoldFor = (clientX: number): "thrust" | "left" | "right" => {
    const w = Math.max(1, target.clientWidth || window.innerWidth);
    const f = clientX / w;
    if (f < touchThrustZone.left) return "left";
    if (f > touchThrustZone.right) return "right";
    return "thrust";
  };
  target.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
    touchHeld.set(e.pointerId, touchHoldFor(e.clientX));
  });
  target.addEventListener("pointerup", (e) => { touchHeld.delete(e.pointerId); });
  target.addEventListener("pointercancel", (e) => { touchHeld.delete(e.pointerId); });
  
  // T2.6: hidden tab auto-pauses the session.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) game.session.pause("visibility");
    else game.session.resume();
  });

  return { syncTimedFlightControls, consumeTimedFlightControl, touchHeld, touchHoldFor, timedControlSeconds };
}
