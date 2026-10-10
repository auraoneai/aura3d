// Mouse aim + twin-stick touch + LMB fire + scroll/pause guards — extracted
// from boot.ts for 14-LOC. `sticks` shape and gesture math unchanged.
import type { Game } from "@aura3d/game";
import type { PlayerState, PlayerUpgrades } from "../gameplay/player";
import { DEFAULT_PLAYER_TUNING } from "../gameplay/player";
import type { SwarmRunCtx } from "./state";

export interface SwarmSticks {
  moveId: number; moveCx: number; moveCy: number; moveX: number; moveZ: number;
  aimId: number; aimCx: number; aimCy: number; aimX: number; aimZ: number; aimFire: boolean;
}

export function wireSwarmSticks(ctx: SwarmRunCtx, deps: {
  target: HTMLElement;
  unlockAudio: () => void;
  player: PlayerState;
  upgrades: PlayerUpgrades;
  game: Game;
  firePulse: () => void;
}): SwarmSticks {
  const { target, player, upgrades, game } = deps;

  window.addEventListener("keydown", (e) => {
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  }, { passive: false });

  // Mouse aim: unproject the pointer through the top-down offset length.
  target.addEventListener("pointermove", (event) => {
    const r = target.getBoundingClientRect();
    const worldPerPixel = (2 * 10.2 * Math.tan((44 * Math.PI) / 360)) / Math.max(1, r.height);
    const ndcX = (event.clientX - r.left) / Math.max(1, r.width) - 0.5;
    const ndcZ = (event.clientY - r.top) / Math.max(1, r.height) - 0.5;
    const wx = ndcX * r.width * worldPerPixel;
    const wz = ndcZ * r.height * worldPerPixel;
    const len = Math.hypot(wx, wz);
    if (len > 0.08) ctx.mouseAim = { x: wx / len, z: wz / len };
  });

  // Touch twin-stick: left half drag = move, right half drag = aim + auto-fire.
  const sticks: SwarmSticks = {
    moveId: -1, moveCx: 0, moveCy: 0, moveX: 0, moveZ: 0,
    aimId: -1, aimCx: 0, aimCy: 0, aimX: 0, aimZ: 0, aimFire: false
  };
  target.addEventListener("pointerdown", (e) => {
    deps.unlockAudio();
    const half = e.clientX < target.clientWidth / 2;
    if (half && sticks.moveId < 0) {
      sticks.moveId = e.pointerId;
      sticks.moveCx = e.clientX;
      sticks.moveCy = e.clientY;
    } else if (!half && sticks.aimId < 0) {
      sticks.aimId = e.pointerId;
      sticks.aimCx = e.clientX;
      sticks.aimCy = e.clientY;
    }
  });
  target.addEventListener("pointermove", (e) => {
    const dx = (e.clientX - (e.pointerId === sticks.moveId ? sticks.moveCx : sticks.aimCx)) / 56;
    const dy = (e.clientY - (e.pointerId === sticks.moveId ? sticks.moveCy : sticks.aimCy)) / 56;
    const len = Math.hypot(dx, dy);
    const k = len > 1 ? 1 / len : 1;
    if (e.pointerId === sticks.moveId) {
      sticks.moveX = dx * k;
      sticks.moveZ = dy * k;
    } else if (e.pointerId === sticks.aimId) {
      sticks.aimX = dx * k;
      sticks.aimZ = dy * k;
      sticks.aimFire = len > 0.35;
      if (len > 0.08) ctx.mouseAim = { x: (dx * k) / Math.max(0.001, len), z: (dy * k) / Math.max(0.001, len) };
    }
  });
  const endStick = (e: PointerEvent) => {
    if (e.pointerId === sticks.moveId) {
      sticks.moveId = -1;
      sticks.moveX = 0;
      sticks.moveZ = 0;
    }
    if (e.pointerId === sticks.aimId) {
      sticks.aimId = -1;
      sticks.aimFire = false;
    }
  };
  target.addEventListener("pointerup", endStick);
  target.addEventListener("pointercancel", endStick);

  // LMB also fires (desktop twin-stick convention).
  target.addEventListener("mousedown", (e) => {
    if (e.button === 0 && ctx.runState === "wave-active" && !game.session.paused && player.fireCooldownRemaining <= 0) {
      deps.firePulse();
      player.fireCooldownRemaining = DEFAULT_PLAYER_TUNING.fireCooldownSeconds * upgrades.fireRateMultiplier;
    }
  });

  // T2.6: hidden tab auto-pauses the session.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) game.session.pause("visibility");
    else game.session.resume();
  });

  return sticks;
}
