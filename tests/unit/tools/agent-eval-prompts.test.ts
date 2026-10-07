/**
 * T0.3 — schema and content checks for benchmarks/agent-eval/prompts.json
 * (PRD-13 §16.1, §18.3). The 12 standard prompts are verbatim from the PRD;
 * rubric categories must be real C-32 ids (plus the play-through categories
 * controls/game_feel on game prompts).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GAME_VISUAL_CATEGORIES } from "../../../tools/quality-gate/src/contracts";

const PROMPTS_PATH = resolve(__dirname, "../../../benchmarks/agent-eval/prompts.json");

const EXPECTED_TEXT: Record<string, string> = {
  P01: "Build a product page hero for this sneaker (./sneaker.glb) that the visitor can orbit.",
  P02: "Show a vintage film camera on a slowly turning stand, lit like a premium product shot.",
  P03: "Make a car paint configurator with three paint colours and visible reflections.",
  P04: "An animated knight idling and waving in a small stone courtyard.",
  P05: "A robot walking in a loop on a stage while the camera slowly orbits it.",
  P06: "A misty pine-forest clearing at golden hour.",
  P07: "A cosy cabin interior at night lit by a fireplace and two lamps.",
  P08: "A 3D platformer level: collect five coins and reach the flag.",
  P09: "A one-lap time-trial racing game on a coastal track.",
  P10: "A one-versus-one arena fighting game with two characters.",
  P11: "A top-down arena shooter in space with waves of drones.",
  P12: "A rainy neon street at night with a slow dolly toward a parked motorbike."
};

const PLAY_THROUGH_CATEGORIES = ["controls", "game_feel"] as const;
const ALLOWED_RUBRIC = new Set([...GAME_VISUAL_CATEGORIES, ...PLAY_THROUGH_CATEGORIES]);

interface EvalPrompt {
  readonly id: string;
  readonly category: string;
  readonly genre?: string;
  readonly text: string;
  readonly allowedAssets: readonly string[];
  readonly rubricCategories: readonly string[];
  readonly referenceFrames: readonly string[];
}

const doc = JSON.parse(readFileSync(PROMPTS_PATH, "utf8")) as { schema: string; prompts: EvalPrompt[] };
const prompts = doc.prompts;

describe("agent-eval prompts.json", () => {
  it("declares the aura3d.agent-eval-prompts/1 schema and 12 prompts", () => {
    expect(doc.schema).toBe("aura3d.agent-eval-prompts/1");
    expect(prompts).toHaveLength(12);
  });

  it("has unique PNN ids", () => {
    const ids = prompts.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^P\d{2}$/);
  });

  it("matches the §18.3 category split 3/2/2/4/1", () => {
    const counts = new Map<string, number>();
    for (const p of prompts) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    expect(counts.get("product")).toBe(3);
    expect(counts.get("character")).toBe(2);
    expect(counts.get("environment")).toBe(2);
    expect(counts.get("game")).toBe(4);
    expect(counts.get("cinematic")).toBe(1);
    expect([...counts.keys()].sort()).toEqual(["character", "cinematic", "environment", "game", "product"]);
  });

  it("carries the verbatim §18.3 prompt text", () => {
    for (const p of prompts) {
      expect(EXPECTED_TEXT[p.id], `${p.id} text`).toBe(p.text);
    }
    expect(Object.keys(EXPECTED_TEXT)).toHaveLength(prompts.length);
  });

  it("uses only real rubric categories, with controls/game_feel on every game prompt", () => {
    for (const p of prompts) {
      expect(p.rubricCategories.length).toBeGreaterThan(0);
      for (const category of p.rubricCategories) {
        expect(ALLOWED_RUBRIC.has(category), `${p.id}: unknown rubric category "${category}"`).toBe(true);
      }
      if (p.category === "game") {
        expect(p.genre, `${p.id}: game prompt needs a genre`).toBeTruthy();
        expect(p.rubricCategories).toEqual(expect.arrayContaining([...PLAY_THROUGH_CATEGORIES]));
      }
    }
  });

  it("grants allowedAssets only to P01, pointing at the committed sneaker.glb", () => {
    for (const p of prompts) {
      if (p.id === "P01") {
        expect(p.allowedAssets).toEqual(["benchmark/assets/sneaker.glb"]);
        expect(existsSync(resolve(__dirname, "../../../benchmark/assets/sneaker.glb"))).toBe(true);
      } else {
        expect(p.allowedAssets ?? []).toEqual([]);
      }
    }
  });

  it("names threejs.org reference frames for every prompt", () => {
    for (const p of prompts) {
      expect(p.referenceFrames.length).toBeGreaterThan(0);
      for (const frame of p.referenceFrames) expect(frame).toMatch(/^[a-z0-9_]+$/);
    }
  });
});
