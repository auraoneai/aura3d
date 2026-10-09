// Input wiring — extracted from boot.ts for 14-LOC. Charge state and the held
// key set live on `io` so boot's frame loop keeps reading the same values;
// listeners attach in the same order as before.
import type { BallState } from "../gameplay/shot";
import type { GameScoreState } from "../gameplay/scoring";

export interface RooftopIo {
  readonly charge: { charging: boolean; power: number; direction: number; pitch: number };
  readonly held: Set<string>;
}

export interface RooftopInputDeps {
  target: HTMLElement;
  unlockAudio(): void;
  pauseOrResume(): void;
  fullReset(): void;
  getBallState(): BallState;
  getScoreState(): GameScoreState;
  getSpotIndex(): number;
  setSpotIndex(v: number): void;
  spots: readonly { id: number }[];
  resetBallToSpot(): void;
  syncStaticNodes(): void;
  releaseShot(power: number, pitch: number): boolean;
  crossFade(actor: "scorer" | "defender", clip: string, seconds?: number): void;
}

export function createRooftopIo(): RooftopIo {
  return {
    charge: { charging: false, power: 0, direction: 1, pitch: 0 },
    held: new Set<string>(),
  };
}

export function wireRooftopInput(io: RooftopIo, deps: RooftopInputDeps): void {
  const { charge, held } = io;
  const { target } = deps;

  window.addEventListener("keydown", (e) => {
    if (!e.repeat) held.add(e.code);
    if (e.code === "Space" && !e.repeat && !deps.getBallState().inFlight && deps.getScoreState().state === "playing") {
      charge.charging = true;
      charge.power = 0;
      charge.direction = 1;
      deps.crossFade("scorer", "Load", 0.2);
    }
    if (e.repeat) return;
    if (e.code === "KeyP" || e.code === "Escape") {
      deps.pauseOrResume();
    } else if (e.code === "KeyR") {
      deps.fullReset();
    } else if (!deps.getBallState().inFlight && deps.getScoreState().state === "playing") {
      if (e.code === "KeyA" || e.code === "ArrowLeft") {
        deps.setSpotIndex((deps.getSpotIndex() - 1 + deps.spots.length) % deps.spots.length);
        deps.resetBallToSpot();
        deps.syncStaticNodes();
      } else if (e.code === "KeyD" || e.code === "ArrowRight") {
        deps.setSpotIndex((deps.getSpotIndex() + 1) % deps.spots.length);
        deps.resetBallToSpot();
        deps.syncStaticNodes();
      }
    }
  }, { passive: true });
  window.addEventListener("keyup", (e) => {
    held.delete(e.code);
    if (e.code === "Space" && charge.charging) {
      charge.charging = false;
      deps.releaseShot(charge.power, charge.pitch);
    }
  });
  window.addEventListener("keydown", (e) => {
    if (["Space", "KeyA", "KeyD", "KeyW", "KeyS", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.code)) {
      e.preventDefault();
    }
  }, { passive: false });

  // Touch (§7.2.1 preset "aim-drag"): horizontal drag = pitch, vertical drag =
  // spot change; press-and-hold charges, release shoots.
  const touch = { downAt: 0, x: 0, y: 0, charging: false };
  target.addEventListener("pointerdown", (e) => {
    deps.unlockAudio();
    touch.downAt = performance.now();
    touch.x = e.clientX;
    touch.y = e.clientY;
    if (!deps.getBallState().inFlight && deps.getScoreState().state === "playing") {
      touch.charging = true;
      charge.charging = true;
      charge.power = 0;
      charge.direction = 1;
      deps.crossFade("scorer", "Load", 0.2);
    }
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  });
  target.addEventListener("pointermove", (e) => {
    if (!touch.charging) return;
    const dy = (e.clientY - touch.y) / 240;
    const dx = (e.clientX - touch.x) / 240;
    charge.pitch = Math.max(-1, Math.min(1, -dy * 1.4));
    if (Math.abs(dx) > 0.5 && Math.abs(dx) > Math.abs(dy)) {
      const delta = dx > 0 ? 1 : -1;
      deps.setSpotIndex((deps.getSpotIndex() + delta + deps.spots.length) % deps.spots.length);
      touch.x = e.clientX;
      deps.resetBallToSpot();
      deps.syncStaticNodes();
      charge.charging = true;
      touch.charging = true;
    }
  });
  target.addEventListener("pointerup", () => {
    if (touch.charging) {
      touch.charging = false;
      charge.charging = false;
      deps.releaseShot(charge.power, charge.pitch);
    }
    touch.downAt = 0;
  });
  target.addEventListener("pointercancel", () => { touch.charging = false; charge.charging = false; touch.downAt = 0; });
}
