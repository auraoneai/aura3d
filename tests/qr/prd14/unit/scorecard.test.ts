import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import {
  buildScorecard, isGPanelRound, verdict,
  type GameScorecard, type HumanReviewDoc
} from "../../../../tools/quality-gate/src/scorecard";
import { GAME_VISUAL_CATEGORIES } from "../../../../tools/quality-gate/src/contracts";
import { validateJsonSchema } from "./helpers/schema";

/**
 * T1.6 — tools/quality-gate/src/scorecard.ts (§6.3, §7.3).
 */
const VISUAL_SEVENS = Object.fromEntries(GAME_VISUAL_CATEGORIES.map((c) => [c, 7]));

const JUDGE = { kind: "vision-model" as const, id: "vision-panel", model: "test" };
const CRITICAL = { environment_world: 7, lighting: 7 };

function visionJudgement(gameId: string, scores: Record<string, number> = VISUAL_SEVENS) {
  return {
    gameId, round: "IC-4", judge: JUDGE,
    scores, observations: [], captureRunId: "run-1", rubricPromptVersion: "rubric-v1-qr0",
    competitiveWithModernThree: true
  };
}

function humanDoc(gameId: string, id: string, notes?: string): HumanReviewDoc {
  return {
    schema: "aura3d.human-review/1", gameId, round: "IC-4",
    human: {
      judge: { kind: "human", id },
      device: "Test Rig / Chromium", tier: "high", playedMinutes: 6,
      visual: VISUAL_SEVENS,
      nonVisual: { sound_audio: 7, controls: 7.5, physics_feel: 7, game_feel: 7, loading_transitions: 7 },
      measuredFps: { p50: 60, p95: 55 },
      competitiveWithModernThree: true,
      notes: notes ?? "x".repeat(220)
    }
  };
}

function opts(gameId: string, over: Record<string, unknown> = {}) {
  return {
    gameId, commit: "abc1234", round: "IC-4", captureRunId: "run-1",
    panel: { round: "IC-4", date: "2026-11-05", commit: "abc1234", captureRunId: "run-1", qrFlags: [], judges: [JUDGE], benchmark: [], games: [visionJudgement(gameId)] },
    humanForms: [humanDoc(gameId, "h1"), humanDoc(gameId, "h2"), humanDoc(gameId, "h3")],
    acceptance: { minOverall: 7, minVisualCategory: 5, critical: CRITICAL, minNonVisual: { sound_audio: 6, controls: 7, game_feel: 6.5, loading_transitions: 6 } },
    integratedCritical: ["C-24", "C-25"],
    ...over
  } as const;
}

describe("buildScorecard + verdict (T1.6)", () => {
  it("accepts all-7 vision + all-7 humans on a G-PANEL round", () => {
    const card = buildScorecard(opts("showcase-bank-shot"));
    expect(card.verdict).toBe("accepted");
    expect(card.countedRound).toBe(0);
  });

  it("refuses on a screening (non-G-PANEL) round", () => {
    expect(() => buildScorecard(opts("showcase-bank-shot", { round: "IC-5" }))).toThrow(/G-PANEL|screening/);
    expect(() => verdict({ ...buildless("IC-5"), verdict: "rejected", countedRound: 0 } as GameScorecard)).toThrow();
  });

  it("rejects when one critical category sits at target − 0.5", () => {
    const weak = { ...VISUAL_SEVENS, lighting: 6.5 };
    const card = buildScorecard(opts("showcase-bank-shot", {
      panel: { round: "IC-4", date: "x", commit: "x", captureRunId: "run-1", qrFlags: [], judges: [JUDGE], benchmark: [], games: [visionJudgement("showcase-bank-shot", weak)] }
    }));
    expect(card.verdict).toBe("rejected");
    expect(card.countedRound).toBe(1);
    expect(card.findings.join("\n")).toContain("lighting");
  });

  it("countedRound stays 0 when an integrated-critical contract is in degradations", () => {
    const weak = { ...VISUAL_SEVENS, lighting: 6.5 };
    const card = buildScorecard(opts("showcase-bank-shot", {
      panel: { round: "IC-4", date: "x", commit: "x", captureRunId: "run-1", qrFlags: [], judges: [JUDGE], benchmark: [], games: [visionJudgement("showcase-bank-shot", weak)] },
      runReport: { games: [{ id: "showcase-bank-shot", runs: [{ run: "desktop", diagnostics: { degradations: ["C-25"] } }] }] }
    }));
    expect(card.verdict).toBe("rejected");
    expect(card.enginePending).toEqual(["C-25"]);
    expect(card.countedRound).toBe(0);
  });

  it("throws when a human review is missing notes", () => {
    expect(() => buildScorecard(opts("showcase-bank-shot", {
      humanForms: [humanDoc("showcase-bank-shot", "h1", ""), humanDoc("showcase-bank-shot", "h2"), humanDoc("showcase-bank-shot", "h3")]
    }))).toThrow(/notes/);
  });

  it("rejects with fewer than 3 human reviewers", () => {
    const card = buildScorecard(opts("showcase-bank-shot", { humanForms: [humanDoc("showcase-bank-shot", "h1"), humanDoc("showcase-bank-shot", "h2")] }));
    expect(card.verdict).toBe("rejected");
    expect(card.findings.join("\n")).toContain("human");
  });

  it("isGPanelRound marks IC-4/8/12 G-PANEL and IC-1/5/baseline screening", () => {
    for (const r of ["IC-4", "IC-8", "IC-12", "IC-40"]) expect(isGPanelRound(r)).toBe(true);
    for (const r of ["IC-1", "IC-3", "IC-5", "baseline-c08d8acb", "screening-2"]) expect(isGPanelRound(r)).toBe(false);
  });
});

function buildless(round: string) {
  return {
    schema: "aura3d.game-scorecard/1" as const, gameId: "g", commit: "c", round,
    qrFlags: [], enginePending: [], captureRunId: "r",
    env: { runner: "t", gpu: "t", browser: "t" },
    vision: [], human: [], perf: [], findings: []
  };
}

/* ------------------------------ T1.7 form ------------------------------ */

describe("human-review form (T1.7)", () => {
  const dir = fileURLToPath(new URL("../../../../tools/quality-gate/forms/", import.meta.url));
  const schema = JSON.parse(readFileSync(`${dir}/human-review.schema.json`, "utf8"));
  const example = JSON.parse(readFileSync(`${dir}/example.json`, "utf8"));

  it("schema validates the exported example", () => {
    expect(validateJsonSchema(example, schema)).toEqual([]);
  });

  it("schema rejects a short-notes export", () => {
    const bad = { ...example, human: { ...example.human, notes: "too short" } };
    expect(validateJsonSchema(bad, schema).length).toBeGreaterThan(0);
  });

  it("schema rejects a missing visual category", () => {
    const visual = { ...example.human.visual } as Record<string, number>;
    delete visual.shadows;
    const bad = { ...example, human: { ...example.human, visual } };
    expect(validateJsonSchema(bad, schema).length).toBeGreaterThan(0);
  });

  it("form html makes no network calls (no fetch/XHR/src/http refs)", () => {
    const html = readFileSync(`${dir}/index.html`, "utf8");
    expect(html).not.toMatch(/fetch\(|XMLHttpRequest|src="http|href="http|@import|url\(http/);
  });
});
