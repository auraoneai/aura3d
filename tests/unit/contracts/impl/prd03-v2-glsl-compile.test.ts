import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withDefines } from "../../../../packages/rendering/src/post/v2Stages";
import * as bloom from "../../../../packages/rendering/src/post/shaders/bloom.glsl";
import * as composite from "../../../../packages/rendering/src/post/shaders/composite.glsl";
import * as depthDownsample from "../../../../packages/rendering/src/post/shaders/depthDownsample.glsl";
import * as displayGrade from "../../../../packages/rendering/src/post/shaders/displayGrade.glsl";
import * as dof from "../../../../packages/rendering/src/post/shaders/dof.glsl";
import * as exposure from "../../../../packages/rendering/src/post/shaders/exposure.glsl";
import * as finalize from "../../../../packages/rendering/src/post/shaders/finalize.glsl";
import * as fxaa from "../../../../packages/rendering/src/post/shaders/fxaa.glsl";
import * as godrays from "../../../../packages/rendering/src/post/shaders/godrays.glsl";
import * as gtao from "../../../../packages/rendering/src/post/shaders/gtao.glsl";
import * as gtaoDenoise from "../../../../packages/rendering/src/post/shaders/gtaoDenoise.glsl";
import * as motionBlur from "../../../../packages/rendering/src/post/shaders/motionBlur.glsl";
import * as smaa from "../../../../packages/rendering/src/post/shaders/smaa.glsl";
import * as taa from "../../../../packages/rendering/src/post/shaders/taa.glsl";

/**
 * Every v2 post fragment, in the form v2Stages compiles it, is valid
 * GLSL ES 3.00. GPU-lane run 38138763970 found three shapes that aborted the
 * whole v2 frame (black output wherever GTAO, god rays, DoF or motion blur
 * was active):
 *  - `#define` lines prepended before `#version 300 es` (GTAO, god rays, DoF
 *    gather, MB tile-max), which makes the source GLSL ES 1.00;
 *  - GTAO_APPLY_GLSL calling `aoWeight` without the bilateral helpers.
 * The validator runs when glslangValidator is installed; the lane gate sets
 * A3D_REQUIRE_GLSLANG=1 so it cannot be skipped there.
 */

const MODULES = { bloom, composite, depthDownsample, displayGrade, dof, exposure, finalize, fxaa, godrays, gtao, gtaoDenoise, motionBlur, smaa, taa };

/** The defines v2Stages adds per shader (values from the default "high" tier). */
const DEFINES: Record<string, Record<string, number>> = {
  GTAO_GLSL: { AURA_GTAO_DIRECTIONS: 2, AURA_GTAO_STEPS: 4 },
  GODRAYS_GLSL: { AURA_GODRAY_SAMPLES: 32 },
  DOF_GATHER_GLSL: { DOF_RINGS: 3 },
  MB_TILE_MAX_GLSL: { MB_TILE_SIZE: 20 }
};

function fragments(): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const [module, exports] of Object.entries(MODULES)) {
    for (const [name, value] of Object.entries(exports as Record<string, unknown>)) {
      if (typeof value !== "string" || !value.includes("void main")) continue;
      // Vertex sources are compiled separately by the device; only fragments here.
      if (/gl_Position\s*=/.test(value)) continue;
      out.push([`${module}.${name}`, DEFINES[name] ? withDefines(value, DEFINES[name]!) : value]);
    }
  }
  return out;
}

function validator(): string | null {
  try {
    execFileSync("glslangValidator", ["--version"], { stdio: "ignore" });
    return "glslangValidator";
  } catch {
    return null;
  }
}

describe("v2 post fragments compile as GLSL ES 3.00", () => {
  const cases = fragments();

  it("finds the v2 fragments", () => {
    expect(cases.length).toBeGreaterThan(20);
  });

  it.each(cases)("%s starts with #version 300 es", (_name, source) => {
    expect(source.startsWith("#version 300 es")).toBe(true);
  });

  it("withDefines keeps #version first", () => {
    const out = withDefines("#version 300 es\nprecision highp float;\nvoid main(){}", { A: 1, B: 2 });
    expect(out.split("\n").slice(0, 3)).toEqual(["#version 300 es", "#define A 1", "#define B 2"]);
  });

  const tool = validator();
  it.runIf(process.env.A3D_REQUIRE_GLSLANG === "1")("glslangValidator is installed (A3D_REQUIRE_GLSLANG)", () => {
    expect(tool, "glslangValidator missing (apt-get install glslang-tools)").not.toBeNull();
  });
  it.runIf(tool !== null).each(cases)("%s compiles with glslangValidator", (name, source) => {
    const dir = mkdtempSync(join(tmpdir(), "prd03-v2glsl-"));
    const file = join(dir, `${name.replace(/[^\w.]/g, "_")}.frag`);
    writeFileSync(file, source);
    let log = "";
    try {
      log = execFileSync(tool!, ["-S", "frag", file], { encoding: "utf8" });
    } catch (error) {
      log = String((error as { stdout?: string }).stdout ?? error);
    }
    expect(log, log).not.toMatch(/ERROR/);
  });
});

describe("god-ray tint coercion (S12 black frames)", () => {
  it("accepts the bridge's {r,g,b} object, an array, and falls back on bad input", async () => {
    const { godRayColor } = await import("../../../../packages/rendering/src/post/v2Stages");
    expect(godRayColor({ r: 0.44, g: 0.52, b: 0.73 })).toEqual([0.44, 0.52, 0.73]);
    expect(godRayColor([0.1, 0.2, 0.3])).toEqual([0.1, 0.2, 0.3]);
    expect(godRayColor(undefined)).toEqual([1, 0.96, 0.9]);
    expect(godRayColor({ r: Number.NaN, g: 0.5 })).toEqual([1, 0.5, 0.9]);
    for (const v of godRayColor({ r: 0.44, g: 0.52, b: 0.73 })) expect(Number.isFinite(v)).toBe(true);
  });
});
