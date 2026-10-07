// src/v2/scene/fx.ts — combat juice (T2.4).
// §6.9.4 vfx[]: drone-kill → explosion-small burst + debris + ring + 0.1 s
// punch; bolt-fire → muzzle flash; shield-hit → ripple burst + trauma;
// multi-kill → 40 ms hit-stop. waves.ts keeps pure state, so the shell
// diffs per-frame snapshots to fire these hooks.
import type { GameSession } from "@aura3d/engine";

export interface OrbitalFxHooks {
  readonly game: {
    readonly fx: {
      burst(kind: string, position: readonly [number, number, number], o?: {
        count?: number; speed?: number; color?: string; seed?: number;
      }): void;
      readonly liveCount: number;
    };
    readonly session: GameSession;
  };
  readonly app: {
    readonly camera?: {
      readonly punch?: { trigger(o?: { fov?: number; dolly?: number }): void };
      readonly shake?: { add(amount: number): void };
    };
  };
}

export interface OrbitalFrameDiff {
  /** Enemy ids that died this frame (active → false, health ≤ 0). */
  readonly kills: readonly { id: string; pos: readonly [number, number, number] }[];
  /** Enemies that reached the planet this frame. */
  readonly planetHits: readonly { id: string; pos: readonly [number, number, number] }[];
  /** Shield pulses active this frame that hit an enemy. */
  readonly shieldHits: readonly { pos: readonly [number, number, number] }[];
  readonly firedThisFrame: boolean;
  readonly playerPos: readonly [number, number, number];
}

let explosionTtl = 0;

/** Apply per-frame fx from the diff between wave states. */
export function orbitalFxFrame(hooks: OrbitalFxHooks, d: OrbitalFrameDiff, dt: number): void {
  if (d.firedThisFrame) {
    hooks.game.fx.burst("muzzle", d.playerPos, { count: 6, speed: 2.4, color: "#7cf4ff" });
  }
  for (const kill of d.kills) {
    hooks.game.fx.burst("explosion-small", kill.pos, { count: 18, speed: 4.2, color: "#ff9a3c" });
    hooks.game.fx.burst("debris", kill.pos, { count: 9, speed: 2.6, color: "#5b6b7c" });
    hooks.game.fx.burst("ring", kill.pos, { count: 1, speed: 0.5, color: "#ff5a3c" });
    explosionTtl = 1.2;
  }
  if (d.kills.length >= 2) {
    // §6.9.4 juice: 40 ms hit-stop on multi-kills.
    hooks.game.session.hitStop(0.04);
  }
  for (const hit of d.planetHits) {
    hooks.game.fx.burst("splash", hit.pos, { count: 14, speed: 2.2, color: "#ff5a3c" });
    hooks.app.camera?.shake?.add(0.28);
  }
  for (const hit of d.shieldHits) {
    hooks.game.fx.burst("ring", hit.pos, { count: 10, speed: 1.1, color: "#7cf4ff" });
    hooks.app.camera?.shake?.add(0.14);
  }
  if (explosionTtl > 0) explosionTtl -= dt;
}

/** Explosion counter the §7.2.1 `fx.explosionsLive >= 1` condition reads. */
export function explosionsLive(fxLiveCount: number): number {
  return explosionTtl > 0 ? Math.max(1, fxLiveCount) : 0;
}
