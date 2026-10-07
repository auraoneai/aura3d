// apps/aura-clash-showcase/src/v2/scene/fx.ts — fight juice (T2.4).
// §6.9.3 vfx[]: hit-impact → K9 spark burst stand-in (fx.burst "spark") +
// hit-stop 0.07 s on the actors (game.session.hitStop — C-24 actor scope),
// dash → trail, landing/knockdown → dust, KO → slow-mo + ring. SSR wet
// floor + rain are stand-ins (R-14-14): deck clearcoat reads wet under the
// neon practicals; rain lands with C-21.
import type { GameCombatEvent, GameSession } from "@aura3d/engine";

export interface AuraClashFxHooks {
  readonly game: {
    readonly fx: {
      burst(kind: string, position: readonly [number, number, number], o?: {
        count?: number; speed?: number; color?: string; seed?: number;
      }): void;
      trail(target: string, o?: { width?: number; life?: number; color?: string }): void;
      readonly liveCount: number;
    };
    readonly session: GameSession;
  };
  readonly app: {
    readonly camera?: {
      readonly shake?: { add(amount: number): void };
    };
  };
  /** §14.4 hit flash: runtime handle parked under the deck, shown 80 ms. */
  readonly hitFlash?: {
    setPosition(x: number, y: number, z: number): unknown;
  } | null;
}

let koFired = false;
let hitFlashUntilMs = -1;
const HIT_FLASH_MS = 80;

/** Consume the fighting kit's combat events; call once per frame. */
export function auraClashFxFrame(
  hooks: AuraClashFxHooks,
  events: readonly GameCombatEvent[],
  nowMs = performance.now()
): void {
  // Flash window elapsed → park the node again (below the deck, still
  // visible:true so the runtime never re-syncs a hidden node).
  if (hitFlashUntilMs >= 0 && nowMs >= hitFlashUntilMs) {
    hitFlashUntilMs = -1;
    hooks.hitFlash?.setPosition(0, -3, 0);
  }
  for (const ev of events) {
    const p = ev.position ?? [0, 0.9, 0];
    switch (ev.type) {
      case "hit":
        hooks.game.fx.burst("spark", [p[0], p[1], p[2]], {
          count: 14, speed: 5.5, color: "#ffd24d", seed: ev.frame
        });
        hooks.game.fx.burst("ring", [p[0], p[1], p[2]], {
          count: 1, speed: 0.4, color: "#ff2d78"
        });
        // §6.9.3: per-actor hit-stop 0.07 s (C-24 actor-scoped).
        hooks.game.session.hitStop(0.07, {
          actors: ev.targetId && ev.attackerId ? [ev.attackerId, ev.targetId] : undefined
        });
        hooks.app.camera?.shake?.add(0.12);
        if (hooks.hitFlash) {
          hooks.hitFlash.setPosition(p[0], p[1] + 0.06, p[2]);
          hitFlashUntilMs = nowMs + HIT_FLASH_MS;
        }
        break;
      case "blocked":
        hooks.game.fx.burst("spark", [p[0], p[1], p[2]], {
          count: 8, speed: 3.2, color: "#39d6ff", seed: ev.frame
        });
        break;
      case "push":
      case "whiff":
        hooks.game.fx.burst("streak", [p[0], p[1], p[2]], {
          count: 4, speed: 2.6, color: "#5b6b7c", seed: ev.frame
        });
        break;
      case "knockout":
        if (!koFired) {
          koFired = true;
          hooks.game.session.slowMo(0.35, 1100);
          hooks.app.camera?.shake?.add(0.55);
          hooks.game.fx.burst("ring", [p[0], p[1], p[2]], {
            count: 26, speed: 1.1, color: "#ff2d78", seed: ev.frame
          });
          hooks.game.fx.burst("dust", [p[0], 0.05, p[2]], {
            count: 18, speed: 1.6, color: "#35414f"
          });
        }
        break;
      case "round-reset":
        koFired = false;
        hitFlashUntilMs = -1;
        hooks.hitFlash?.setPosition(0, -3, 0);
        break;
      default:
        break;
    }
  }
}
