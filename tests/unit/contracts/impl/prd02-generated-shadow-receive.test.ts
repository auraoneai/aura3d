/**
 * #1225: the generated forward program samples the bound forward shadow map.
 *
 * Under A3D_QR_CORE (default-on since #1238) allow-listed materials draw on
 * the C-02 generated program. Its `fragment:lights` loop had no shadow
 * receive, so forward/Lighting.ts (which binds `u_shadowMap*` only when the
 * program reflects them) dropped every shadow map: GPU run 38186424018 showed
 * 12-shadows byte-identical to its no-shadows control (luma 203.78 both).
 */
import { describe, expect, it } from "vitest";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll } from "vitest";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import "../../../../packages/rendering/src/lanes/prd01";
import type { ProgramFeatures } from "../../../../packages/rendering/src/contracts/program";
import { generateProgramImpl } from "../../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures } from "../../../../packages/rendering/src/program/ProgramFeatures";
import { SHADOW_FORWARD_FACTOR_GLSL } from "../../../../packages/rendering/src/program/chunks/shadow_forward.glsl";

const FLAGS = resolveQrFlags({ options: { A3D_QR_CORE: true, A3D_QR_LIGHTING: true } });
const ONE_DIR = { dir: 1, point: 0, spot: 0, rect: 0, clustered: false, hemisphere: false } as const;
const CLUSTERED = { dir: 2, point: 8, spot: 0, rect: 0, clustered: true, hemisphere: false } as const;
const SHADOWED = { cascades: 1, pcfTaps: 4, localShadows: 0, contact: false } as const;
const UNSHADOWED = { cascades: 0, pcfTaps: 4, localShadows: 0, contact: false } as const;

function gen(partial: Partial<ProgramFeatures>) {
  return generateProgramImpl(normalizeProgramFeatures(partial), { flags: FLAGS });
}

const dir = mkdtempSync(join(tmpdir(), "a3d-shadow-forward-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function validate(name: string, source: string): string {
  const file = join(dir, `${name}.frag`);
  writeFileSync(file, source);
  const run = spawnSync("glslangValidator", ["-S", "frag", file], { encoding: "utf8" });
  if (run.error) throw new Error(`glslangValidator unavailable: ${run.error.message} (install glslang-tools / brew install glslang)`);
  return run.status === 0 ? "" : `${run.stdout}${run.stderr}`;
}

/** Strip `//` comments and collapse whitespace so only GLSL tokens compare. */
function tokens(glsl: string): string {
  return glsl.replace(/\/\/[^\n]*/g, "").replace(/\s+/g, " ").trim();
}

describe("generated forward program: shadow receive (#1225)", () => {
  it("a draw with a shadow map declares the forward shadow uniforms and scales the caster's radiance", () => {
    const out = gen({ lighting: "lit", lights: ONE_DIR, shadows: SHADOWED });
    for (const name of ["u_shadowMapTexture", "u_shadowMapMatrix", "u_shadowMapEnabled", "u_shadowMapStrength", "u_shadowPcfSamples", "u_shadowMapNormalBias"]) {
      expect(out.fragment).toContain(name);
    }
    expect(out.fragment).toMatch(/radiance \*= a3dForwardLightShadow\(u_lightData\[i \* 6 \+ 2\]\.w, u_lightData\[i \* 6 \+ 3\]\.z/);
  });

  it("a draw without a shadow map is unchanged (no shadow uniforms, no factor)", () => {
    const out = gen({ lighting: "lit", lights: ONE_DIR, shadows: UNSHADOWED });
    expect(out.fragment).not.toContain("u_shadowMapMatrix");
    expect(out.fragment).not.toContain("a3dForwardLightShadow");
  });

  it("unlit and depth programs never receive", () => {
    expect(gen({ lighting: "unlit", shadows: SHADOWED }).fragment).not.toContain("a3dForwardLightShadow");
    expect(gen({ pass: "depth", shadows: SHADOWED }).fragment).not.toContain("a3dForwardLightShadow");
  });

  it("the clustered path applies the factor from the cluster texture", () => {
    const out = gen({ lighting: "lit", lights: CLUSTERED, shadows: SHADOWED });
    expect(out.fragment).toContain("texelFetch(u_clusterLightData, ivec2(3, lightIndex), 0).z");
  });

  it("the factor is token-identical to the legacy ShaderLibraryCore a3dForwardShadowFactor", () => {
    const core = readFileSync("packages/rendering/src/ShaderLibraryCore.ts", "utf8");
    const start = core.indexOf("float a3dForwardShadowFactor(");
    const end = core.indexOf("\nfloat a3dPointShadowFaceIndex(", start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    expect(tokens(SHADOW_FORWARD_FACTOR_GLSL)).toBe(tokens(core.slice(start, end)));
  });

  it.each([
    ["bucketed", ONE_DIR],
    ["clustered", CLUSTERED]
  ] as const)("%s shadowed fragment compiles (glslangValidator)", (name, lights) => {
    expect(validate(`shadowed-${name}`, gen({ lighting: "lit", lights, shadows: SHADOWED }).fragment)).toBe("");
  });
});
