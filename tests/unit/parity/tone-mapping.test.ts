/**
 * threejs-parity L7-02 / SH-08 (docs/workflows/threejs-parity-gaps.md §6, R-07):
 * the shipped Cineon GLSL operator must match the CPU reference
 * (`post/ToneOperators.ts:cineonToneMapping`) within 1/255 across an HDR ramp,
 * and must agree with three 0.185.1's own `CineonToneMapping` chunk. There is no
 * GPU in unit tests, so the GLSL function body is lifted from the shipped shader
 * source and evaluated per channel — Cineon is purely component-wise
 * (`max`/`pow`/arithmetic on `vec3`), so a scalar evaluation of the same text is
 * an exact twin of what the fragment shader computes.
 */

import { describe, expect, it } from "vitest";
// @ts-expect-error three ships its GLSL chunks as untyped JS modules
import threeToneMappingChunk from "three/src/renderers/shaders/ShaderChunk/tonemapping_pars_fragment.glsl.js";
import {
  TONE_MAPPING_OPERATORS_GLSL,
  TONE_MAP_OPERATOR_FUNCTIONS,
  outputFragmentGlsl
} from "../../../packages/rendering/src/output/ToneMappingOperators.glsl";
import { cineonToneMapping } from "../../../packages/rendering/src/post/ToneOperators";

/** Pulls `vec3 <name>( vec3 color ) { ... }` out of a GLSL source string. */
function extractOperatorBody(source: string, name: string): string {
  const header = new RegExp(`vec3\\s+${name}\\s*\\(\\s*vec3\\s+color\\s*\\)\\s*\\{`);
  const match = header.exec(source);
  if (!match) throw new Error(`GLSL operator ${name} not found`);
  let depth = 1;
  let i = match.index + match[0].length;
  const start = i;
  for (; i < source.length && depth > 0; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") depth -= 1;
  }
  return source.slice(start, i - 1);
}

/** Scalar JS twin of a component-wise GLSL operator body (see file comment). */
function scalarTwin(body: string): (channel: number) => number {
  const js = body
    .replace(/\/\/[^\n]*/g, "")
    .replace(/vec3\s*\(([^()]*)\)/g, "($1)")
    .replace(/\bmax\s*\(/g, "Math.max(")
    .replace(/\bpow\s*\(/g, "Math.pow(");
  const fn = new Function("color", "toneMappingExposure", `${js}\nreturn color;`) as (
    color: number,
    toneMappingExposure: number
  ) => number;
  return (channel) => fn(channel, 1);
}

const ramp = (): number[] => {
  const values: number[] = [0, 0.004, 0.0041];
  for (let i = 0; i <= 256; i += 1) values.push((i / 256) * 16); // 0 … 16 linear HDR
  for (let i = 0; i <= 64; i += 1) values.push((i / 64) * 0.25); // dense toe
  return values;
};

const to8Bit = (v: number): number => Math.round(Math.min(1, Math.max(0, v)) * 255);

describe("parity L7-02 — Cineon tone mapping (SH-08)", () => {
  const shipped = scalarTwin(extractOperatorBody(TONE_MAPPING_OPERATORS_GLSL, "CineonToneMapping"));
  const three = scalarTwin(extractOperatorBody(threeToneMappingChunk as string, "CineonToneMapping"));

  it("shipped GLSL stays within 1/255 of the CPU reference across an HDR ramp", () => {
    let worst = 0;
    for (const value of ramp()) {
      const [r, g, b] = cineonToneMapping([value, value, value], 1);
      for (const cpu of [r, g, b]) {
        worst = Math.max(worst, Math.abs(to8Bit(shipped(value)) - to8Bit(cpu)));
      }
    }
    expect(worst).toBeLessThanOrEqual(1);
  });

  it("shipped GLSL matches three 0.185.1's CineonToneMapping (exposure = 1)", () => {
    let worst = 0;
    for (const value of ramp()) {
      worst = Math.max(worst, Math.abs(shipped(value) - three(value)));
    }
    expect(worst).toBeLessThanOrEqual(1e-9);
  });

  it("is a real curve: black stays black, output rises monotonically", () => {
    expect(shipped(0)).toBe(0);
    let previous = -1;
    for (const value of ramp().sort((a, b) => a - b)) {
      const out = shipped(value);
      expect(out).toBeGreaterThanOrEqual(previous - 1e-12);
      previous = out;
    }
    expect(shipped(8)).toBeGreaterThan(0.9);
  });

  it("the output pass selects Cineon through the operator table", () => {
    expect(TONE_MAP_OPERATOR_FUNCTIONS["cineon"]).toBe("CineonToneMapping");
    const fragment = outputFragmentGlsl({ toneMapping: "cineon", backgroundCoverage: false, overlay: false });
    expect(fragment).toContain("#define TONE_MAP(c) CineonToneMapping(c)");
    expect(fragment).toContain("vec3 CineonToneMapping");
  });
});
