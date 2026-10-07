/**
 * §6.7 GameFxLayer backend B ("particle-pass") — every `burst`/`trail` forwards
 * to C-20 `app.effects`. The 10 GameFxKind names are a prefix of AuraVfxKind,
 * so no mapping table is needed. Trail takes a node id (C-24) or a tweenable
 * node carrying `id`.
 */
import type { GameFxKind, GameFxLayerLike, Vec3Like } from "./Juice.js";
import type { TweenableNode } from "./tween.js";

export interface FxPassEffects {
  burst(kind: GameFxKind, position: Vec3Like, options?: { count?: number; speed?: number; color?: string; normal?: Vec3Like; seed?: number }): unknown;
  trail(target: string | { node: string }, options: { width: number; life: number; color?: string }): { stop(): void };
  readonly liveCount: number;
}

export interface FxParticlePass extends GameFxLayerLike {
  trail(target: string | (TweenableNode & { readonly id: string }), options: { width: number; life: number; color?: string }): { stop(): void };
  readonly backend: "particle-pass";
}

export function createFxParticlePass(effects: FxPassEffects): FxParticlePass {
  return {
    backend: "particle-pass",
    get liveCount() {
      return effects.liveCount;
    },
    burst(kind, position, options) {
      effects.burst(kind, position, options);
    },
    trail(target, options) {
      const ref = typeof target === "string" ? target : { node: target.id };
      return effects.trail(ref, options);
    }
  };
}
