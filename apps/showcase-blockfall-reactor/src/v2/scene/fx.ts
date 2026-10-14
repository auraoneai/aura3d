// apps/showcase-blockfall-reactor/src/v2/scene/fx.ts — clear/lock fx wiring.
// fx.burst accents only answer real observed events: a lock flash on every
// lock, a hard-drop streak while a piece lands, the scaled clear burst whose
// colour cycles the jewel palette, a level-up flare, and a game-over wash
// accent. Reduced motion suppresses the shard geometry inside createClearFx
// while the beat nodes and cues still fire (§6.9.16 fx notes).
const JEWEL_BURST: readonly [string, string, string] = ["#19d9ee", "#52e77a", "#ffd83d"];

export interface BlockfallFx {
  /** Small cyan pop at the piece's lock position. */
  lockFlash(x: number, y: number): void;
  /** Falling trail along a hard drop (active column centre). */
  hardDropTrail(x: number, yTop: number, yBottom: number): void;
  /** Row burst: colour cycles the jewel palette by cleared-line count. */
  clearBurst(rowY: number, lines: number): void;
  /** Green flare at the reactor meter on level-up. */
  levelUpFlare(): void;
  /** Red wash accent on game over. */
  gameOverAccent(): void;
}

export function wireBlockfallFx(game: {
  fx: {
    burst(kind: "spark" | "dust" | "debris" | "ring" | "streak" | "pickup" | "explosion-small" | "muzzle" | "splash" | "bubble", position: readonly [number, number, number], opts?: { count?: number; speed?: number; color?: string }): void;
  };
}): BlockfallFx {
  return {
    lockFlash(x, y) {
      game.fx.burst("spark", [x, y, 0.4], { count: 10, speed: 2.4, color: "#69eff4" });
    },
    hardDropTrail(x, yTop, yBottom) {
      const span = Math.max(0.4, yBottom - yTop);
      for (let index = 0; index < 3; index += 1) {
        game.fx.burst("streak", [x, yTop + span * (index / 3), 0.34], { count: 6, speed: 0.9, color: "#7ef7ff" });
      }
    },
    clearBurst(rowY, lines) {
      const color = JEWEL_BURST[Math.min(3, Math.max(0, lines - 1)) % JEWEL_BURST.length];
      game.fx.burst("explosion-small", [0, rowY, 0.45], { count: 16 + lines * 8, speed: 3.4, color });
      if (lines >= 4) {
        game.fx.burst("ring", [0, rowY, 0.5], { count: 1, speed: 4.2, color: "#ffe866" });
      }
    },
    levelUpFlare() {
      game.fx.burst("spark", [1.52, 2.4, 0.4], { count: 22, speed: 3.0, color: "#77ff96" });
    },
    gameOverAccent() {
      game.fx.burst("dust", [0, 2.24, 0.5], { count: 26, speed: 1.4, color: "#ff4d5f" });
    }
  };
}
