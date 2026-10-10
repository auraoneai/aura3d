// Input map — extracted from boot.ts for 14-LOC.
import { game as engineGame } from "@aura3d/engine";

export function createSwarmInput() {
  return engineGame.input({
    actions: {
      up: ["KeyW", "ArrowUp"],
      down: ["KeyS", "ArrowDown"],
      left: ["KeyA", "ArrowLeft"],
      right: ["KeyD", "ArrowRight"],
      fire: ["KeyJ"],
      burst: ["Space", "KeyK"],
      dash: ["ShiftLeft", "ShiftRight"],
      pause: ["KeyP", "Escape"],
      reset: ["KeyR"]
    },
    axes: {
      moveX: { negative: "left", positive: "right" },
      moveZ: { negative: "up", positive: "down" }
    },
    bufferMs: 120
  });
}
