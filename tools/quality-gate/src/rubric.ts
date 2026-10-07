/**
 * T4.1/T4.4/T4.5 — judge rubric templates, validators, blind A/B, calibration set.
 *
 * Templates reproduce the research-21 (game) and research-23 (benchmark)
 * judgement structure verbatim in field order: per-image descriptions, the
 * 27-category score table with one-line justifications, explicit difference
 * classes, dominant causes, competitiveWithModernThree, and a ≥200-char
 * critique (benchmark: differences + harnessFairness instead).
 */
import { createHash } from "node:crypto";
import { GAME_VISUAL_CATEGORIES, RUBRIC_PROMPT_VERSION } from "./contracts";
import type {
  BenchmarkJudgementRecord, DifferenceClass, GameJudgementRecord, JudgeIdentityExt
} from "./types";

export { RUBRIC_PROMPT_VERSION };

export const BENCHMARK_PROMPT = [
  "You are judging a side-by-side of two rendered frames of the same scene.",
  "Left and right are randomized; engine identity is hidden. One is the Aura3D render, one is the three.js reference.",
  "",
  "Respond with JSON only, matching this shape exactly:",
  '{ "descriptions": { "A": "<what image A shows>", "B": "<what image B shows>" },',
  '  "differences": [{ "text": "<what differs>", "cls": "equivalent|aura3d-better|minor-aura3d-deficiency|major-aura3d-deficiency|implementation-bug|missing-capability", "cause": "<best cause guess>" }],',
  '  "scores": { "A": <0-10 in 0.5 steps>, "B": <0-10> },',
  '  "harnessFairness": { "fair": <bool>, "notes": "<framing/crop/lighting issues in the comparison itself>" } }',
  "",
  "Score against modern browser 3D practice, not against the other image alone."
].join("\n");

export const GAME_PROMPT = [
  `You are an art director + rendering engineer reviewing browser-game screenshots against the ${GAME_VISUAL_CATEGORIES.length}-category rubric.`,
  "Describe each image, then score every category 0-10, then name dominant causes with percent weights,",
  'then answer "is this competitive with modern three.js browser games?" and write a >=200-char critique.',
  "",
  `Categories: ${GAME_VISUAL_CATEGORIES.join(", ")}`,
  "",
  'Respond with JSON only: { "descriptions": [...], "scores": { <category>: <n> }, "dominantCauses": [{ "cause": ..., "percent": ... }], "competitiveWithModernThree": <bool>, "critique": "<=200+ chars>" }'
].join("\n");

/** §6.8 calibration set — frozen baseline lives in history/calibration-baseline.json. */
export interface CalibrationItem {
  readonly id: string;
  readonly group: "known-bad" | "known-mid" | "known-good" | "broken-control";
  /** Expected score band / constraint from §6.8. */
  readonly expected: { readonly min?: number; readonly max?: number };
  readonly sourceRef: string;
}

export const CALIBRATION_ITEMS: readonly CalibrationItem[] = [
  { id: "orbital-defense-3.0.1", group: "known-bad", expected: { min: 1.0, max: 2.0 }, sourceRef: "history/calibration-baseline.json#orbital-defense-3.0.1" },
  { id: "benchmark-14-aura", group: "known-bad", expected: { min: 0.5, max: 1.5 }, sourceRef: "history/calibration-baseline.json#benchmark-14-aura" },
  { id: "three-r185-contract", group: "known-mid", expected: { min: 4.0, max: 7.0 }, sourceRef: "history/calibration-baseline.json#three-r185-contract" },
  { id: "ref-showcase-three", group: "known-good", expected: { min: 7.0 }, sourceRef: "history/calibration-baseline.json#ref-showcase-three" }
];

/** Broken-control rule (§6.8): must score ≥2 below its source frame. */
export const BROKEN_CONTROL_MARGIN = 2.0;
/** A judge drifting > 1.0 from the frozen baseline is replaced for the round. */
export const JUDGE_DRIFT_LIMIT = 1.0;

/** Max |score - baseline| across shared calibration items; > JUDGE_DRIFT_LIMIT rejects. */
export function computeDrift(
  scores: Readonly<Record<string, number>>,
  baseline: Readonly<Record<string, number>>
): number {
  let drift = 0;
  for (const [id, expected] of Object.entries(baseline)) {
    const seen = scores[id];
    if (seen === undefined) continue;
    drift = Math.max(drift, Math.abs(seen - expected));
  }
  return drift;
}

/** §7.3 validators (T-U1). Structural, not semantic — full schemas in the conformance test. */

const DIFFERENCE_CLASSES: readonly DifferenceClass[] = [
  "equivalent", "aura3d-better", "minor-aura3d-deficiency",
  "major-aura3d-deficiency", "implementation-bug", "missing-capability"
];

export function validateBenchmarkJudgement(raw: unknown): BenchmarkJudgementRecord {
  const r = raw as BenchmarkJudgementRecord;
  if (!r || typeof r.itemId !== "string") throw new Error("BenchmarkJudgement: itemId required");
  if (!r.judge || typeof r.judge.id !== "string") throw new Error("BenchmarkJudgement: judge.id required");
  if (r.blindKey !== "A-is-aura" && r.blindKey !== "B-is-aura") throw new Error("BenchmarkJudgement: blindKey required");
  if (!r.descriptions || typeof r.descriptions.aura !== "string" || typeof r.descriptions.reference !== "string") {
    throw new Error("BenchmarkJudgement: descriptions required");
  }
  for (const d of r.differences ?? []) {
    if (!DIFFERENCE_CLASSES.includes(d.cls)) throw new Error(`BenchmarkJudgement: bad cls ${String(d.cls)}`);
  }
  if (typeof r.scores?.aura !== "number" || typeof r.scores?.reference !== "number") {
    throw new Error("BenchmarkJudgement: scores required");
  }
  if (typeof r.harnessFairness?.fair !== "boolean") throw new Error("BenchmarkJudgement: harnessFairness required");
  return r;
}

export function validateGameJudgement(raw: unknown): GameJudgementRecord {
  const r = raw as GameJudgementRecord;
  if (!r || typeof r.itemId !== "string") throw new Error("GameJudgement: itemId required");
  if (!r.judge || typeof r.judge.id !== "string") throw new Error("GameJudgement: judge.id required");
  if (typeof r.critique !== "string" || r.critique.length < 200) {
    throw new Error("GameJudgement: critique must be >= 200 chars");
  }
  if (typeof r.competitiveWithModernThree !== "boolean") {
    throw new Error("GameJudgement: competitiveWithModernThree required");
  }
  for (const key of Object.keys(r.scores ?? {})) {
    if (!GAME_VISUAL_CATEGORIES.includes(key)) throw new Error(`GameJudgement: unknown category ${key}`);
  }
  return r;
}

/** T4.4 blind A/B. `leftIsAura` is derived from a seeded coin; the mapping is stored only in blindKey. */
export interface JudgePacket {
  readonly itemId: string;
  /** Slot-neutral images: A on the left of the composite turn, B on the right. */
  readonly imageA: string;
  readonly imageB: string;
  readonly prompt: string;
  readonly blindKey: "A-is-aura" | "B-is-aura";
}

export function buildPacket(input: {
  itemId: string;
  auraImage: string;
  referenceImage: string;
  seed: string;
  kind: "benchmark" | "game";
}): JudgePacket {
  // Deterministic seeded draw — repeatable per (item, round) so the reveal is auditable.
  const bit = createHash("sha256").update(`${input.seed}:${input.itemId}`).digest()[0] & 1;
  const aIsAura = bit === 0;
  return {
    itemId: input.itemId,
    imageA: aIsAura ? input.auraImage : input.referenceImage,
    imageB: aIsAura ? input.referenceImage : input.auraImage,
    prompt: input.kind === "benchmark" ? BENCHMARK_PROMPT : GAME_PROMPT,
    blindKey: aIsAura ? "A-is-aura" : "B-is-aura"
  };
}

/** Reveal a blind packet's engine mapping — callers log this into the round record. */
export function revealBlind(packet: JudgePacket): { a: "aura" | "reference"; b: "aura" | "reference" } {
  return packet.blindKey === "A-is-aura" ? { a: "aura", b: "reference" } : { a: "reference", b: "aura" };
}

export type { JudgeIdentityExt };
