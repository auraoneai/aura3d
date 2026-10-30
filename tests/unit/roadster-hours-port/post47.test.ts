import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { customPassFragmentSource } from "../../../packages/rendering/src/post/v2Stages";
import { SALTWIND_LOOK } from "../../../examples/roadster-hours-port/art/look";
import { ROAD_PASS_GLSL, ROAD_PASS_NAME, autoExposureFor, roadPass, streakFor } from "../../../examples/roadster-hours-port/art/post";

const glslang = spawnSync("glslangValidator", ["--version"]).status === 0;

describe("Saltwind Highway road post pass (RH47-07/08)", () => {
  it("is one shader pass per route reading colour and depth, heat only on Redline", () => {
    for (const row of Object.values(SALTWIND_LOOK)) {
      const pass = roadPass(row);
      expect(pass.name).toBe(ROAD_PASS_NAME);
      expect(pass.insertAt).toBe("before-tonemap");
      expect(pass.inputs).toEqual(["color", "depth"]);
      expect(pass.uniforms?.u_heatAmount).toBe(row.id === "redline" ? 1 : 0);
      expect(pass.uniforms?.u_heatStart).toBe(40);
    }
  });

  it.skipIf(!glslang)("compiles after the engine's custom-pass prelude", () => {
    const dir = mkdtempSync(join(tmpdir(), "rh-post-"));
    try {
      writeFileSync(join(dir, "p.frag"), customPassFragmentSource(ROAD_PASS_GLSL));
      const result = spawnSync("glslangValidator", [join(dir, "p.frag")], { encoding: "utf8" });
      expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("streaks grow with speed and nitro and are off on reduced motion", () => {
    expect(streakFor(20, false, false)).toBe(0);
    expect(streakFor(74, false, false)).toBeGreaterThan(streakFor(50, false, false));
    expect(streakFor(60, true, false)).toBeGreaterThan(streakFor(60, false, false));
    expect(streakFor(200, true, false)).toBeLessThanOrEqual(1);
    expect(streakFor(74, true, true)).toBe(0);
  });

  it("auto-exposure only on Halo", () => {
    expect(autoExposureFor(SALTWIND_LOOK.halo)).toMatchObject({ meteringMask: "center-weighted" });
    expect(autoExposureFor(SALTWIND_LOOK.sunbreak)).toBe(false);
    expect(autoExposureFor(null)).toBe(false);
  });
});
