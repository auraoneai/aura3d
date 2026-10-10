// Input map — extracted from boot.ts for 14-LOC.
import { game as engineGame } from "@aura3d/engine";

export function createSkylineInput() {
  return engineGame.input({
    actions: {
      left: ["KeyA", "ArrowLeft"],
      right: ["KeyD", "ArrowRight"],
      jump: ["KeyW", "ArrowUp", "Space"],
      dash: ["ShiftLeft", "KeyK"],
      fire: ["KeyJ", "KeyL"],
      pause: ["KeyP"],
      reset: ["KeyR"]
    },
    axes: { moveX: { negative: "left", positive: "right" } },
    bufferMs: 120
  });
}
