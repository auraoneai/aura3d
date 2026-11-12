import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { lookAt, lookParams } from "../../../examples/saiyan-snake-way-port/art/colorScript";
import { skyRunnerPartSculptedSpec } from "../../../examples/saiyan-snake-way-port/art/proceduralModels";
import { HERO_PARTS } from "../../../examples/saiyan-snake-way-port/hero";
import { RUNNER_MODELS, runnerModelForLook } from "../../../examples/saiyan-snake-way-port/models";
import { createRun, STEP, stepRun } from "../../../examples/saiyan-snake-way-port/sim";
import { RUNNER_STYLES, runnerIndexForLook, runnerStylesForLook } from "../../../examples/saiyan-snake-way-port/styles";
import { loadRunner } from "../../../examples/saiyan-snake-way-port/world";

const ORIGINAL_SHA = "5e8a08af3b60c2a36aed4b0d3197c2d1846cf7cfc26a1322d366232cc035b9f4";
const SCRIPT_SHA = "7a1ea836817674f965fe1e42691acb15a51e6812d5519a441fd841584c5c3f7b";

describe("Serpentine procedural sky-runner & original look parity", () => {
  it("ships zero static Meshy GLB files on disk and builds sculpted geometry for every runner part", () => {
    const assetsDir = resolve("examples/saiyan-snake-way-port/assets");
    const glbs = existsSync(assetsDir) ? readdirSync(assetsDir).filter((f) => f.endsWith(".glb")) : [];
    expect(glbs).toEqual([]);
    for (const part of HERO_PARTS) {
      const spec = skyRunnerPartSculptedSpec(part.id);
      expect(spec.positions.length).toBeGreaterThanOrEqual(24);
      expect(spec.normals?.length).toBe(spec.positions.length);
      expect((spec.indices?.length ?? 0)).toBeGreaterThanOrEqual(36);
    }
  });

  it("resolves loadRunner to null so the sculpted procedural sky-runner renders with zero GLB fetches", async () => {
    for (const mode of ["original", "script"] as const) {
      const ref = runnerModelForLook(mode);
      expect(ref.kind).toBe("aura-asset-ref");
      expect(ref.hash).toBe(`sha256-${mode === "original" ? ORIGINAL_SHA : SCRIPT_SHA}`);
      expect(ref.url.startsWith("/procedural/serpentine/")).toBe(true);
      expect(ref).toBe(RUNNER_MODELS[mode]);
      const loaded = await loadRunner({ width: 640, height: 360 } as HTMLCanvasElement, mode);
      expect(loaded).toBeNull();
    }
  });

  it("restores exact TIDE style only in original mode and keeps stored choices", () => {
    const original = runnerStylesForLook("original"), script = runnerStylesForLook("script");
    expect(script).toBe(RUNNER_STYLES);
    expect(script[0]).toMatchObject({ tagline: "Red lacquer robe, cyan surge. Calm and quick.", tint: [1, 0.97, 0.95], wash: [0.12, 0.03, 0.02] });
    expect(original[0]).toEqual({ ...script[0], tagline: "Teal suit, cyan surge. Calm and quick.", tint: [0.9, 0.95, 0.95], wash: [0.05, 0.2, 0.22] });
    expect(original.slice(1)).toEqual(script.slice(1));
    for (const mode of ["original", "script"] as const) {
      expect(runnerIndexForLook(mode, null)).toBe(mode === "script" ? 1 : 0);
      expect(runnerIndexForLook(mode, "invalid")).toBe(mode === "script" ? 1 : 0);
      for (const i of [0, 1, 2]) expect(runnerIndexForLook(mode, String(i))).toBe(i);
      expect(runnerIndexForLook(mode, "99")).toBe(2);
      expect(runnerIndexForLook(mode, "-1")).toBe(0);
    }
  });

  it("keeps identical simulation snapshots while either look reads the run", () => {
    const run = (search: string) => {
      const state = createRun(), look = lookParams(search);
      for (let i = 0; i < 600; i++) {
        stepRun(state, i === 50 ? { taps: ["Space"] } : i === 100 ? { taps: ["KeyD"] } : {}, STEP);
        lookAt(state.s, look);
      }
      return state;
    };
    expect(run("?look=original")).toEqual(run(""));
  });
});
