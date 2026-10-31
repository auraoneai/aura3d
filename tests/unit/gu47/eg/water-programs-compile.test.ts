/**
 * GU47 phase 2: no `world.water` program ever compiled, so water never drew. On the remote runner the receipt warned:
 * "prd10.water: water program "0" failed to build ... '#version' directive must occur before anything else". Three bugs:
 * `waterShaderSources` prefixed its `#define` before `#version 300 es`; the water fragment stages read `u_cameraPosition`
 * (the shared fog stub) without declaring it; and the underwater fragment read `u_waterHeight` without declaring it.
 * This test compiles each stage as GLSL ES 3.00 with glslangValidator when it is on PATH; the `#version`-first check
 * always runs.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { underwaterShaderSources, waterShaderSources } from "../../../../packages/rendering/src/world/water/WaterMaterial";

const programs = {
  "water (scene copy)": waterShaderSources({ hasScene: true, planar: false }),
  "water (scene copy, planar)": waterShaderSources({ hasScene: true, planar: true }),
  "water (Low)": waterShaderSources({ hasScene: false, planar: false }),
  underwater: underwaterShaderSources()
};

function hasGlslang(): boolean {
  try {
    execFileSync("glslangValidator", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe("world.water programs compile", () => {
  it("every stage starts with #version 300 es", () => {
    for (const src of Object.values(programs)) {
      expect(src.vertex.startsWith("#version 300 es\n")).toBe(true);
      expect(src.fragment.startsWith("#version 300 es\n")).toBe(true);
    }
  });

  it("the scene-copy define still reaches the fragment stage", () => {
    expect(programs["water (scene copy)"].fragment).toContain("#define A3D_PRD10_WATER_HAS_SCENE 1\n");
    expect(programs["water (Low)"].fragment).toContain("#define A3D_PRD10_WATER_HAS_SCENE 0\n");
  });

  it.runIf(hasGlslang())("every stage compiles as GLSL ES 3.00 (glslangValidator)", () => {
    const dir = mkdtempSync(join(tmpdir(), "a3d-water-"));
    const failures: string[] = [];
    for (const [name, src] of Object.entries(programs)) {
      for (const [stage, code] of [["vert", src.vertex], ["frag", src.fragment]] as const) {
        const file = join(dir, `${name.replace(/[^a-z]+/g, "-")}.${stage}`);
        writeFileSync(file, code);
        try {
          execFileSync("glslangValidator", [file], { stdio: "pipe" });
        } catch (error) {
          failures.push(`${name} ${stage}: ${String((error as { stdout?: Buffer }).stdout ?? error).slice(0, 300)}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});
