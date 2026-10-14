/**
 * Vault Breakers in-world scoreboard (PRD VB-09).
 *
 * The back panel carries the live score as extruded 3D text — a physical
 * score-reel: one text3D node per digit per slot, toggled visible by the
 * controller. The DOM panel mirrors it, but the 3D text is the proof (text3D
 * catalog is uppercase alphanumerics + spaces only; every string here obeys).
 */
import { game, material, text3D, type AuraSceneNode } from "@aura3d/engine";

export const SCORE_DIGITS = 6;
/** Prebuilt mission lines (finite set — see missions.missionLine()). */
export const MISSION_LINES: readonly string[] = [
  "HIT TARGET BANKS  0 DOWN 5 TO GO",
  "HIT TARGET BANKS  1 DOWN 4 TO GO",
  "HIT TARGET BANKS  2 DOWN 3 TO GO",
  "HIT TARGET BANKS  3 DOWN 2 TO GO",
  "HIT TARGET BANKS  4 DOWN 1 TO GO",
  "CLEAR 5 BANKS  ORBIT 1 OF 3",
  "CLEAR 5 BANKS  ORBIT 2 OF 3",
  "HIT TARGET BANKS  5 DOWN 0 TO GO",
  "VAULT IS OPEN"
];

const NEON_GOLD = "#ffcc00";
const NEON_CYAN = "#00e5ff";
const LABEL_MATERIAL = material.emissive({ name: "sb label", color: "#00e5ff", emissive: "#00b8d4" });
const DIGIT_MATERIAL = material.emissive({ name: "sb digit", color: "#ffcc00", emissive: "#ff8800" });
const MISSION_MATERIAL = material.emissive({ name: "sb mission", color: "#00ffcc", emissive: "#00cc99" });

function textNode(id: string, text: string, x: number, y: number, size: number, mat: ReturnType<typeof material.emissive>): AuraSceneNode {
  return text3D(text, { name: id, material: mat, size, depth: 0.035, letterSpacing: 0.02, backend: "sdf" })
    .position(x, y, -4.05)
    .runtime(game.runtimeNode(id, { tags: ["scoreboard", "text3d"] }))
    .toJSON();
}

export interface ScoreboardNodes {
  readonly nodes: readonly AuraSceneNode[];
  readonly nodeIds: readonly string[];
}

/** Build every scoreboard node; all start hidden except the static labels. */
export function createScoreboardNodes(): ScoreboardNodes {
  const nodes: AuraSceneNode[] = [];
  const ids: string[] = [];
  const push = (id: string, node: AuraSceneNode, visible: boolean): void => {
    void visible; // visibility is controlled at runtime through node handles
    nodes.push(node);
    ids.push(id);
  };

  push("sb-label-score", textNode("sb-label-score", "SCORE", -2.45, 1.92, 0.15, LABEL_MATERIAL), true);
  push("sb-label-ball", textNode("sb-label-ball", "BALL", 1.72, 1.92, 0.15, LABEL_MATERIAL), true);
  push("sb-label-mult", textNode("sb-label-mult", "MULT", 2.42, 1.92, 0.15, LABEL_MATERIAL), true);
  push("sb-label-banks", textNode("sb-label-banks", "BANKS", 1.72, 1.28, 0.15, LABEL_MATERIAL), true);
  push("sb-label-mission", textNode("sb-label-mission", "MISSION", -2.72, 1.28, 0.13, LABEL_MATERIAL), true);

  for (let slot = 0; slot < SCORE_DIGITS; slot += 1) {
    for (let digit = 0; digit <= 9; digit += 1) {
      const id = `sb-score-${slot}-${digit}`;
      push(id, textNode(id, String(digit), -2.1 + slot * 0.62, 1.62, 0.3, DIGIT_MATERIAL), digit === 0);
    }
  }
  for (let digit = 0; digit <= 3; digit += 1) {
    const id = `sb-ball-${digit}`;
    push(id, textNode(id, String(digit), 1.72, 1.62, 0.3, DIGIT_MATERIAL), digit === 1);
  }
  for (const mult of [1, 2, 4, 6]) {
    const id = `sb-mult-${mult}`;
    push(id, textNode(id, "X" + mult, 2.42, 1.62, 0.24, DIGIT_MATERIAL), mult === 1);
  }
  for (let banks = 0; banks <= 5; banks += 1) {
    const id = `sb-banks-${banks}`;
    push(id, textNode(id, String(banks), 1.72, 0.98, 0.3, DIGIT_MATERIAL), banks === 0);
  }
  for (let line = 0; line < MISSION_LINES.length; line += 1) {
    const id = `sb-mission-${line}`;
    push(id, textNode(id, MISSION_LINES[line]!, 0.05, 0.98, 0.115, MISSION_MATERIAL), line === 0);
  }
  return { nodes, nodeIds: ids };
}

export interface ScoreboardReadout {
  readonly score: number;
  readonly ball: number;
  readonly multiplier: number;
  readonly banksDown: number;
  readonly missionLine: string;
}

/** Pure mapping from game state to node-id -> visible (unit-testable). */
export function scoreboardVisibility(readout: ScoreboardReadout): ReadonlyMap<string, boolean> {
  const map = new Map<string, boolean>();
  const scoreText = String(Math.min(999999, Math.max(0, Math.round(readout.score)))).padStart(SCORE_DIGITS, "0");
  for (let slot = 0; slot < SCORE_DIGITS; slot += 1) {
    const shown = scoreText[slot]!;
    for (let digit = 0; digit <= 9; digit += 1) {
      map.set(`sb-score-${slot}-${digit}`, String(digit) === shown);
    }
  }
  for (let digit = 0; digit <= 3; digit += 1) {
    map.set(`sb-ball-${digit}`, digit === Math.min(3, Math.max(1, readout.ball)));
  }
  for (const mult of [1, 2, 4, 6]) {
    map.set(`sb-mult-${mult}`, mult === readout.multiplier);
  }
  for (let banks = 0; banks <= 5; banks += 1) {
    map.set(`sb-banks-${banks}`, banks === Math.min(5, Math.max(0, readout.banksDown)));
  }
  const missionIndex = MISSION_LINES.indexOf(readout.missionLine);
  for (let line = 0; line < MISSION_LINES.length; line += 1) {
    map.set(`sb-mission-${line}`, line === (missionIndex >= 0 ? missionIndex : 0));
  }
  return map;
}
