/**
 * GU47 WP-11 TT-H2 / TT-A2 (partial): text on the stadium in the World Tour look.
 *
 * - TT-H2: "AURA SLAM" and "WORLD TOUR" on the two rear sponsor boards (above their LED ribbon) and the venue name on the
 *   front of the rear stand: 3 text nodes, 3 draws. Requested with the SDF backend; the engine renders the extruded glyph
 *   mesh until its SDF sampler lands (`AuraText3DGeometry.method`), so the text is crisp geometry either way.
 * - TT-A2: the stand line also carries the live score ("NEW YORK  2-1  30-15"), rewritten with `handle.setGeometry` when
 *   the venue or the score changes (`debug().scoreboard.text` reports the same string the frame shows). The tennis-only
 *   scoreboard frame is a WP-36 asset; the live text moves onto it when it is admitted.
 * - The sponsor boards' LED ribbon pulses on an ace (skipped under reduced motion).
 * Presentation only: reads the score, never writes it.
 */
import { createAuraText3DGeometry, game, material, text3D, type AuraMaterialSpec, type AuraRuntimeNodeHandle } from "@aura3d/engine";
import type { NodeInput } from "./rigPort";

export const BOARD_IDS = { left: "board-aura-slam", right: "board-world-tour", stand: "board-venue-score" } as const;
export const BOARD_TEXTS = { left: "AURA SLAM", right: "WORLD TOUR" } as const;
/** Cap height of the sponsor-board text (metres): above the 0.18 m LED ribbon on the 0.78 m board. */
export const BOARD_TEXT_SIZE = 0.22;
/** Cap height of the stand line (metres): clear of the sponsor boards in the broadcast camera's line of sight. */
export const STAND_TEXT_SIZE = 0.34;
/** Sponsor boards (view/scene.ts statics): x +-4.3, front face z -10.68; the text sits in front of the ribbon. */
const BOARD_Z = -10.64;
const BOARD_Y = 0.535;
const BOARD_X = 4.3;
/** Rear stand tier 1 (view/spectators.ts): front face z -11.7. */
const STAND_Z = -11.665;
const STAND_Y = 0.5;

const LED_TEXT = "#fbfbf5";

/** Width of a text line as `createAuraText3DGeometry` lays it out (5x7 cells, letter spacing size x 0.14). */
export function textWidth(text: string, size: number): number {
  const spacing = size * 0.14;
  const cell = size / 7;
  let width = 0;
  for (const ch of text) width += ch === " " ? size * 0.5 + spacing : cell * 5 + spacing;
  return Math.max(0, width - spacing);
}

const POINTS = ["0", "15", "30", "40"] as const;

/** Tennis point call for a game in progress (deuce and advantage once both reach 40). */
export function pointsText(player: number, rival: number): string {
  const p = Math.max(0, Math.floor(player || 0));
  const r = Math.max(0, Math.floor(rival || 0));
  if (p >= 3 && r >= 3) return p === r ? "40-40" : p > r ? "AD-40" : "40-AD";
  return `${POINTS[Math.min(3, p)]}-${POINTS[Math.min(3, r)]}`;
}

export interface ScoreLike { readonly playerGames?: number; readonly aiGames?: number; readonly playerPoints?: number; readonly aiPoints?: number }

/** The stand line: venue name, games, points (uppercase; only glyphs the text mesh has). */
export function standLineText(venueName: string, score: ScoreLike | null | undefined): string {
  const name = venueName.toUpperCase().replace(/[^A-Z0-9 .-]/g, "");
  if (!score) return name;
  return `${name}  ${Math.max(0, score.playerGames ?? 0)}-${Math.max(0, score.aiGames ?? 0)}  ${pointsText(score.playerPoints ?? 0, score.aiPoints ?? 0)}`;
}

const ledMaterial = (): AuraMaterialSpec => material.emissive({ color: LED_TEXT, emissive: LED_TEXT, emissiveIntensity: 0.55 });

function textNode(id: string, text: string, size: number, x: number, y: number, z: number): NodeInput {
  return text3D(text, { name: id, size, backend: "sdf", material: ledMaterial(), castShadow: false })
    .position(x - textWidth(text, size) / 2, y, z)
    .runtime(game.runtimeNode(id)) as unknown as NodeInput;
}

/** The three text nodes (World Tour look only). */
export function buildBoardNodes(standText: string): NodeInput[] {
  return [
    textNode(BOARD_IDS.left, BOARD_TEXTS.left, BOARD_TEXT_SIZE, -BOARD_X, BOARD_Y, BOARD_Z),
    textNode(BOARD_IDS.right, BOARD_TEXTS.right, BOARD_TEXT_SIZE, BOARD_X, BOARD_Y, BOARD_Z),
    textNode(BOARD_IDS.stand, standText, STAND_TEXT_SIZE, 0, STAND_Y, STAND_Z)
  ];
}

/** Seconds the LED ribbon stays bright after an ace. */
export const LED_PULSE_SECONDS = 0.6;

export interface BoardsController {
  /** Rewrites the stand line when its text changes; returns the text shown. */
  setStandText(text: string): string;
  /** Starts the LED ribbon pulse (no-op under reduced motion). */
  pulse(reducedMotion: boolean): void;
  /** Advances the pulse; `trim` is the venue ribbon colour. */
  step(dt: number, trim: string): void;
  readonly standText: string;
  readonly pulsing: boolean;
}

/** Drives the live stand line and the ribbon pulse on the resolved handles (either may be missing on test doubles). */
export function createBoardsController(stand: AuraRuntimeNodeHandle | undefined, ribbon: AuraRuntimeNodeHandle | undefined, initialText: string): BoardsController {
  let shown = initialText;
  let pulseLeft = 0;
  let lit = false;
  return {
    get standText() { return shown; },
    get pulsing() { return pulseLeft > 0; },
    setStandText(text) {
      if (text === shown || text.length === 0) return shown;
      shown = text;
      if (stand) {
        try {
          const geometry = createAuraText3DGeometry(text, { size: STAND_TEXT_SIZE }).geometry;
          (stand as { setGeometry?: (g: unknown) => unknown }).setGeometry?.(geometry);
          stand.setPosition(-textWidth(text, STAND_TEXT_SIZE) / 2, STAND_Y, STAND_Z);
        } catch { /* text mesh unavailable on this build */ }
      }
      return shown;
    },
    pulse(reducedMotion) {
      if (!reducedMotion) pulseLeft = LED_PULSE_SECONDS;
    },
    step(dt, trim) {
      if (pulseLeft > 0) pulseLeft = Math.max(0, pulseLeft - (Number.isFinite(dt) ? Math.max(0, dt) : 0));
      const want = pulseLeft > 0;
      if (want === lit || !ribbon) return;
      lit = want;
      try {
        ribbon.setMaterial(want ? material.emissive({ color: trim, emissive: trim, emissiveIntensity: 2.4 }) : material.pbr({ color: trim, roughness: 0.55 }));
      } catch { /* optional */ }
    }
  };
}
