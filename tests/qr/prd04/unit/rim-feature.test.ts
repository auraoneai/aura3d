/**
 * rim-feature.test.ts — `prd04.rim` (#88, R-14-14 §8.10): view-dependent rim
 * emission as a C-02 ShaderFeature on the generated path.
 *
 *  - select iff `u_prd04RimStrength > 0`; the define is emitted only when active;
 *  - bindUniforms forwards the material params with defaults (white, power 3);
 *  - generator-compatible (body hook is a pure call chunk; pars resolved
 *    requires-first at global scope);
 *  - in a lit program the call runs inside main() after `a3dEmissive` exists and
 *    before the final colour sum; unlit programs compile the call out (#ifdef A3D_LIT).
 * Structural checks only; the WebGL2 compile is the macos-14 program-compile spec.
 */
import { describe, expect, it } from "vitest";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import "../../../../packages/rendering/src/lanes/prd01";
import "../../../../packages/rendering/src/lanes/prd04";
import { rimFeature } from "../../../../packages/rendering/src/materials/features";
import { featureGeneratorIncompatibility } from "../../../../packages/rendering/src/program/FeatureSelect";
import { generateProgramImpl } from "../../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures } from "../../../../packages/rendering/src/program/ProgramFeatures";
import { shaderChunk, type ProgramFeatures } from "../../../../packages/rendering/src/contracts/program";
import { QUALITY_TIERS } from "../../../../packages/rendering/src/contracts/quality";
import type { RenderItem } from "../../../../packages/rendering/src";

const FLAGS = resolveQrFlags({ env: { A3D_QR: "core,materials" } });
const LIGHT1 = { dir: 1, point: 0, spot: 0, rect: 0, clustered: false, hemisphere: false } as const;

const itemWith = (params: Record<string, unknown>) =>
  ({ material: { getParameter: (n: string) => params[n] } }) as unknown as RenderItem;

const select = (params: Record<string, unknown>) =>
  rimFeature.select({ item: itemWith(params), pass: "forward" as never, tier: QUALITY_TIERS.high, flags: FLAGS as never });

const gen = (partial: Partial<ProgramFeatures>) =>
  generateProgramImpl(normalizeProgramFeatures(partial), { flags: FLAGS as never });

function mainBody(src: string): string {
  const start = src.indexOf("void main() {");
  expect(start).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === "{") depth++;
    if (src[i] === "}" && --depth === 0) return src.slice(start + "void main() {".length, i);
  }
  throw new Error("unbalanced main()");
}

describe("prd04.rim (#88)", () => {
  it("selects iff u_prd04RimStrength > 0", () => {
    expect(select({ u_prd04RimStrength: 0.8 })).toBe(true);
    expect(select({ u_prd04RimStrength: 0 })).toBeUndefined();
    expect(select({})).toBeUndefined();
  });

  it("emits A3D_PRD04_RIM only when active", () => {
    expect(rimFeature.defines?.(true)).toEqual({ A3D_PRD04_RIM: 1 });
    expect(rimFeature.defines?.(false as never)).toEqual({});
  });

  it("bindUniforms forwards params with white / power-3 defaults", () => {
    const seen = new Map<string, unknown>();
    rimFeature.bindUniforms?.(true, itemWith({ u_prd04RimStrength: 1.5 }), (n, v) => seen.set(n, v));
    expect(seen.get("u_prd04RimStrength")).toBe(1.5);
    expect(Array.from(seen.get("u_prd04RimColor") as Float32Array)).toEqual([1, 1, 1]);
    expect(seen.get("u_prd04RimPower")).toBe(3);
  });

  it("is generator-compatible and its chunks are registered", () => {
    expect(featureGeneratorIncompatibility(rimFeature)).toBeUndefined();
    expect(shaderChunk("a3d_prd04_rim_call")).toBeDefined();
    expect(shaderChunk("a3d_prd04_rim_pars")).toBeDefined();
  });

  it("lit program: uniforms at global scope, call in main after a3dEmissive and before the colour sum", () => {
    const out = gen({ lighting: "lit", lights: LIGHT1, features: { "prd04.rim": true } });
    const body = mainBody(out.fragment);
    expect(body).not.toMatch(/^\s*uniform\s/m);
    expect(out.fragment.slice(0, out.fragment.indexOf("void main() {"))).toContain("uniform float u_prd04RimStrength;");
    const emissive = body.indexOf("vec3 a3dEmissive =");
    const rim = body.indexOf("a3dEmissive += u_prd04RimColor");
    const sum = body.indexOf("vec3 a3dColor =");
    expect(emissive).toBeGreaterThan(-1);
    expect(rim).toBeGreaterThan(emissive);
    expect(sum).toBeGreaterThan(rim);
  });

  it("without the feature, no rim code is emitted", () => {
    expect(gen({ lighting: "lit", lights: LIGHT1 }).fragment).not.toContain("u_prd04RimStrength");
  });
});
