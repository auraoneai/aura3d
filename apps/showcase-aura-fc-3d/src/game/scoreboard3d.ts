// Aura FC 3D — FC47-H1 SDF in-world score on the gantry screen (GU47 WP-19, lane g09).
//
// The engine's text3D has no runtime setText, so the score is a reel: one SDF text node per digit per slot (home
// tens/units, a dash, away tens/units), all built hidden except the shown digits, toggled with setVisible when the
// score changes. Expected cost: 3-5 visible SDF quads draws (one per shown slot).

import { game, material, text3D } from "@aura3d/engine";
import { PITCH_HZ } from "./dims";

export const SCORE_SLOTS = ["h1", "h0", "a1", "a0"] as const;
type Slot = (typeof SCORE_SLOTS)[number];
const SLOT_X: Readonly<Record<Slot, number>> = { h1: -2.9, h0: -1.8, a1: 1.8, a0: 2.9 };
/** In front of the scoreboard screen face (scene.ts fc-scoreboard-screen at z -(PITCH_HZ + 9.2), 0.3 deep). */
const SCORE_Z = -(PITCH_HZ + 9.0);
const SCORE_Y = 6.7;
const SCORE_SIZE = 1.3;

export const scoreDigitId = (slot: Slot, digit: number): string => `fc-score-${slot}-${digit}`;
export const SCORE_DASH_ID = "fc-score-dash";

/** Every reel node id, in build order. */
export function scoreReelIds(): string[] {
  const ids = [SCORE_DASH_ID];
  for (const slot of SCORE_SLOTS) for (let d = slot.endsWith("1") ? 1 : 0; d <= 9; d++) ids.push(scoreDigitId(slot, d));
  return ids;
}

/** Every reel node. Primitives carry no build-time visibility, so the first bindScoreboardText update hides the rest. */
export function scoreboardTextNodes(color: string): any[] {
  const mat = material.emissive({ name: "fc score digits", color, emissive: color, emissiveIntensity: 1.6 });
  const node = (id: string, text: string, x: number) =>
    text3D(text, { name: id, material: mat, size: SCORE_SIZE, depth: 0.02, backend: "sdf", sdfOcclusion: "show" })
      .position(x, SCORE_Y, SCORE_Z)
      .runtime(game.runtimeNode(id, { tags: ["scoreboard", "text3d"] }));
  const out: any[] = [node(SCORE_DASH_ID, "-", 0)];
  for (const slot of SCORE_SLOTS) {
    for (let d = slot.endsWith("1") ? 1 : 0; d <= 9; d++) out.push(node(scoreDigitId(slot, d), String(d), SLOT_X[slot]));
  }
  return out;
}

/** Node ids that show `score` (capped at 99 per side); every other reel node is hidden. */
export function visibleScoreIds(score: readonly [number, number]): Set<string> {
  const ids = new Set<string>([SCORE_DASH_ID]);
  const put = (side: "h" | "a", value: number) => {
    const v = Math.max(0, Math.min(99, Math.floor(value)));
    ids.add(scoreDigitId(`${side}0` as Slot, v % 10));
    if (v >= 10) ids.add(scoreDigitId(`${side}1` as Slot, Math.floor(v / 10)));
  };
  put("h", score[0]); put("a", score[1]);
  return ids;
}

/** Read back the score the reel shows (the in-world score must match the sim state). */
export function shownScore(visible: ReadonlySet<string>): [number, number] {
  const side = (s: "h" | "a") => {
    let v = 0;
    for (let d = 0; d <= 9; d++) {
      if (visible.has(scoreDigitId(`${s}0` as Slot, d))) v += d;
      if (d > 0 && visible.has(scoreDigitId(`${s}1` as Slot, d))) v += 10 * d;
    }
    return v;
  };
  return [side("h"), side("a")];
}

/** Bind the reel to an app: returns an update(score) that toggles only on change. */
export function bindScoreboardText(app: any): (score: readonly [number, number]) => ReadonlySet<string> {
  const handles = new Map<string, any>();
  for (const id of scoreReelIds()) { try { handles.set(id, app.nodes.require(id)); } catch { /* missing: skip */ } }
  let key = "";
  let shown: ReadonlySet<string> = new Set();
  return (score) => {
    const k = `${score[0]}:${score[1]}`;
    if (k === key) return shown;
    key = k;
    shown = visibleScoreIds(score);
    for (const [id, h] of handles) h?.setVisible?.(shown.has(id));
    return shown;
  };
}
