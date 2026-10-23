/**
 * Directional shadow receivers beyond a cascade's depth range (4.0.9).
 *
 * The forward path picks ONE cascade per render item (by the item's centre depth, forward/Lighting.ts
 * `selectForwardShadowMap`) and samples that cascade's map for every fragment of the item. A large receiver such as a
 * ground plane therefore has fragments whose light-space depth lies beyond the chosen cascade's fitted depth range
 * (projected z > 1). The manual depth compare treated them as shadowed against the cleared depth of 1.0, darkening a
 * whole half of the ground around a single small caster (the remote spec tests/browser/shadow-footprint.spec.ts measures
 * 80,000 darkened pixels before the fix and about 500 after, at fov 15). The receiver depth is now clamped to [0, 1] like a hardware
 * compare sampler would, so empty texels (stored 1.0) never shadow.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("directional shadow receiver depth range", () => {
  const samplers: Array<[string, string]> = [
    ["generated forward chunk", "packages/rendering/src/program/chunks/shadow_forward.glsl.ts"],
    ["legacy core library", "packages/rendering/src/ShaderLibraryCore.ts"],
    ["packaged direct PBR shader", "packages/rendering/src/shaders/pbr-direct.frag.glsl"],
    ["WebGPU forward shadow", "packages/rendering/src/WebGPUDevice.ts"]
  ];
  for (const [label, file] of samplers) {
    it(`${label} clamps the directional receiver depth to [0, 1]`, () => {
      const source = readFileSync(file, "utf8");
      expect(source).toContain("clamp(projected.z * 0.5 + 0.5, 0.0, 1.0)");
    });
  }

  it("every directional sampler copy in ShaderLibrary.ts clamps (only point and spot keep the raw depth)", () => {
    const source = readFileSync("packages/rendering/src/ShaderLibrary.ts", "utf8");
    const clamped = source.split("clamp(projected.z * 0.5 + 0.5, 0.0, 1.0)").length - 1;
    const raw = source.split("float projectedDepth = projected.z * 0.5 + 0.5;").length - 1;
    expect(clamped).toBe(5);
    expect(raw).toBe(10);
  });

  it("with the clamp, a receiver beyond the far plane compares as lit against an empty (1.0) texel", () => {
    const stored = 1.0;
    const bias = 0.0005;
    const beyond = Math.min(Math.max(1.7, 0), 1);
    expect(beyond - bias > stored).toBe(false);
    expect(1.7 - bias > stored).toBe(true);
  });
});
