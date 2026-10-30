import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BLOOM_WEIGHT_GLSL,
  bloomPrefilterExcess,
  resolveBloomWeight,
  selectiveBloomActive
} from "../../../../packages/rendering/src/postprocess/NativeBloomPyramid";
import { QUALITY_TIERS } from "../../../../packages/rendering/src/contracts/quality";
import { createRootPostPipeline } from "../../../../packages/engine/src/agent-api/postBridge";
import { effects } from "../../../../packages/engine/src/agent-api/nodes/effects.composite";

/**
 * GU47 E-C WP-3 item 7: per-material `bloom` weight (0..2, default 1) carried
 * in HDR alpha and applied by the bloom prefilter. The weight write (E-D's
 * forward shader) and the live prefilter read (webgl2/LegacyPost.ts) are
 * handoffs; this proves the weight math, the shader helper and the bridge flag.
 */

describe("bloom weight math", () => {
  it("clamps the material weight to [0, 2] and defaults to 1", () => {
    expect(resolveBloomWeight(undefined)).toBe(1);
    expect(resolveBloomWeight(Number.NaN)).toBe(1);
    expect(resolveBloomWeight(0)).toBe(0);
    expect(resolveBloomWeight(1.5)).toBe(1.5);
    expect(resolveBloomWeight(9)).toBe(2);
    expect(resolveBloomWeight(-1)).toBe(0);
  });

  it("is selective only when a weight differs from 1", () => {
    expect(selectiveBloomActive([])).toBe(false);
    expect(selectiveBloomActive([1, undefined, 1])).toBe(false);
    expect(selectiveBloomActive([1, 0])).toBe(true);
    expect(selectiveBloomActive([3])).toBe(true);
  });

  it("weight 1 reproduces the unweighted prefilter exactly; weight 0 removes the texel", () => {
    const lamp: [number, number, number] = [8, 6, 3];
    const off = bloomPrefilterExcess(lamp, 1, 1, 0.25, false);
    expect(bloomPrefilterExcess(lamp, 1, 1, 0.25, true)).toEqual(off);
    expect(off[0]).toBeGreaterThan(0);
    // A white wall above threshold at weight 0 contributes nothing.
    expect(bloomPrefilterExcess([1.4, 1.4, 1.4], 0, 1, 0.25, true)).toEqual([0, 0, 0]);
    // Weight 2 doubles the excess; the clamp keeps 5 at 2.
    const doubled = bloomPrefilterExcess(lamp, 2, 1, 0.25, true);
    expect(doubled[0]).toBeCloseTo(off[0] * 2, 9);
    expect(bloomPrefilterExcess(lamp, 5, 1, 0.25, true)).toEqual(doubled);
    // Selective off ignores alpha entirely (today's behaviour for any alpha).
    expect(bloomPrefilterExcess(lamp, 0.3, 1, 0.25, false)).toEqual(off);
  });
});

describe("bridge: pipeline.bloom.selective", () => {
  const derive = (...nodes: unknown[]) =>
    createRootPostPipeline({ nodes } as never, undefined, undefined, QUALITY_TIERS.high).options;
  const bloomNode = () => effects.bloom({ intensity: 0.5 }).toJSON();
  const box = (material: Record<string, unknown>) => ({ kind: "primitive", primitive: "box", material });

  it("turns on when a material declares a weight other than 1", () => {
    expect(derive(bloomNode(), box({ color: "#fff", bloom: 0 }), box({ color: "#fa0", emissive: "#fa0" })).bloom?.selective).toBe(true);
  });

  it("leaves the bag unchanged when every weight is 1 (or absent)", () => {
    const base = derive(bloomNode(), box({ color: "#fff" }));
    const ones = derive(bloomNode(), box({ color: "#fff", bloom: 1 }));
    expect(ones).toEqual(base);
    expect(base.bloom && "selective" in base.bloom).toBe(false);
  });

  it("needs a bloom effect to mean anything", () => {
    expect(derive(box({ bloom: 0 })).bloom).toBeUndefined();
  });
});

function glslang(): string | null {
  try {
    execFileSync("glslangValidator", ["--version"], { stdio: "ignore" });
    return "glslangValidator";
  } catch {
    return null;
  }
}

describe("BLOOM_WEIGHT_GLSL (glslangValidator, when installed)", () => {
  const tool = glslang();
  it.runIf(tool !== null)("compiles inside a prefilter-shaped GLSL ES 3.00 fragment", () => {
    const source = `#version 300 es
precision highp float;
uniform sampler2D u_source;
uniform float u_threshold;
uniform float u_softKnee;
uniform int u_bloomSelective;
out vec4 outColor;
${BLOOM_WEIGHT_GLSL}
void main() {
  vec4 source = texelFetch(u_source, ivec2(gl_FragCoord.xy), 0);
  float luma = dot(source.rgb, vec3(0.2126, 0.7152, 0.0722));
  float knee = max(u_softKnee, 0.0);
  float soft = clamp(luma - u_threshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-5);
  float excessWeight = max(soft, luma - u_threshold) / max(luma, 1e-5) * auraBloomWeight(source.a, u_bloomSelective);
  outColor = vec4(source.rgb * excessWeight, source.a);
}
`;
    const dir = mkdtempSync(join(tmpdir(), "gu47-ec-bloom-"));
    const file = join(dir, "prefilter.frag");
    writeFileSync(file, source);
    expect(() => execFileSync(tool!, [file], { stdio: "pipe" })).not.toThrow();
  });
});
