import { game, type GameInputController } from "@aura3d/engine";
import type { FpsRunState } from "./state";

export function createFpsInput(): GameInputController {
  return game.input({
    actions: {
      forward: ["KeyW", "ArrowUp"],
      back: ["KeyS", "ArrowDown"],
      left: ["KeyA", "ArrowLeft"],
      right: ["KeyD", "ArrowRight"],
      // Jump is intentionally not bound: walk height is locked on this route.
      sprint: ["ShiftLeft", "ShiftRight"],
      fire: ["KeyJ", "KeyF"],
      reload: ["KeyR"],
      pause: ["KeyP"],
      reset: ["KeyT"]
    },
    axes: {
      moveX: { negative: "left", positive: "right" },
      moveZ: { negative: "back", positive: "forward" },
      lookX: { pointerDelta: "x" },
      lookY: { pointerDelta: "y" }
    },
    bufferMs: 120
  });
}

export function bindPointerLock(canvas: HTMLCanvasElement | undefined, state: FpsRunState): () => void {
  if (!canvas) return () => undefined;

  const onChange = () => {
    state.pointerLockActive = document.pointerLockElement === canvas;
    state.lmbHeld = false;
  };
  const onError = () => {
    state.pointerLockActive = false;
    state.lmbHeld = false;
  };
  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    canvas.focus();
    state.pointerLockRequested += 1;
  };
  const onPointerUp = (event: PointerEvent) => {
    if (event.button === 0) state.lmbHeld = false;
  };
  const onBlur = () => {
    state.lmbHeld = false;
  };

  document.addEventListener("pointerlockchange", onChange);
  document.addEventListener("pointerlockerror", onError);
  canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("blur", onBlur);
  canvas.tabIndex = 0;

  return () => {
    document.removeEventListener("pointerlockchange", onChange);
    document.removeEventListener("pointerlockerror", onError);
    canvas.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("blur", onBlur);
  };
}
