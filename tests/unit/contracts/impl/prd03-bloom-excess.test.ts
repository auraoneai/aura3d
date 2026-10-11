import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BLOOM_BRIGHT_EXTRACT_GLSL, nativeBloomResponseGain, normalizeNativeBloomOptions } from "../../../../packages/rendering/src/webgl2/LegacyPost";
import { resolveBloomPyramidPlan, resolveBloomPyramidResponseGain } from "../../../../packages/rendering/src/postprocess/NativeBloomPyramid";

/**
 * PRD-03 S9 "no hidden gain" (GPU lane run 38141069039): flag-on bloom halo
 * energy at strength 2/4/8 scaled with the full source energy (ratios 2.19 /
 * 3.84 against the 3 / 7 the excess predicts) because the native HDR bright
 * extract gated the whole colour (`source * weight`) instead of keeping the
 * excess over threshold. Flag-on (`v2` stamp) now selects the §6.6 soft-knee
 * excess weight (the `bloom.glsl` prefilter twin); flag-off keeps the legacy
 * gate byte-identical.
 */

/** JS mirror of the flag-on HDR branch: returned luma = weighted luma. */
function excessLuma(luma: number, threshold: number, knee: number): number {
  const soft0 = Math.min(Math.max(luma - threshold + knee, 0), 2 * knee);
  const soft = (soft0 * soft0) / (4 * knee + 1e-5);
  return (Math.max(soft, luma - threshold) / Math.max(luma, 1e-5)) * luma;
}

describe("S9 native HDR bright extract keeps the excess over threshold (flag-on)", () => {
  it("v2 bloom options select the excess weight; flag-off options do not", () => {
    expect(normalizeNativeBloomOptions({ v2: true, threshold: 1, knee: 0.25 }).excess).toBe(true);
    expect(normalizeNativeBloomOptions({ threshold: 0.8 })).not.toHaveProperty("excess");
  });

  it("flag-on: unauthored quality runs the 5-mip pyramid with no response gain; flag-off unchanged", () => {
    const v2 = normalizeNativeBloomOptions({ v2: true, threshold: 1 });
    expect(v2.quality).toBe("cinematic");
    expect(normalizeNativeBloomOptions({ v2: true, quality: "balanced" }).quality).toBe("balanced");
    const plan = resolveBloomPyramidPlan(320, 320, "cinematic", true);
    expect(nativeBloomResponseGain(plan, v2)).toBe(1);
    const legacy = normalizeNativeBloomOptions({ threshold: 0.8 });
    expect(legacy.quality).toBe("performance");
    expect(nativeBloomResponseGain(plan, legacy)).toBe(resolveBloomPyramidResponseGain(plan));
  });

  it("the fragment branches on u_excess and keeps the legacy gate for flag-off", () => {
    expect(BLOOM_BRIGHT_EXTRACT_GLSL).toContain("uniform int u_excess;");
    expect(BLOOM_BRIGHT_EXTRACT_GLSL).toContain("max(soft, luma - u_threshold) / max(luma, 1e-5)");
    expect(BLOOM_BRIGHT_EXTRACT_GLSL).toContain("outColor = source * weight;");
  });

  it("strength 2/4/8 at threshold 1 extract 1:3:7; at or below the knee floor nothing", () => {
    const knee = 0.25;
    const e2 = excessLuma(2, 1, knee);
    expect(e2).toBeCloseTo(1, 6);
    expect(excessLuma(4, 1, knee) / e2).toBeCloseTo(3, 6);
    expect(excessLuma(8, 1, knee) / e2).toBeCloseTo(7, 6);
    expect(excessLuma(0.5, 1, knee)).toBe(0);
    expect(excessLuma(0.75, 1, knee)).toBe(0);
    // Inside the knee: quadratic and continuous with the linear branch at T + knee.
    expect(excessLuma(1, 1, knee)).toBeCloseTo(knee / 4, 4);
    expect(excessLuma(1 + knee, 1, knee)).toBeCloseTo(knee, 4);
  });

  const tool = (() => {
    try {
      execFileSync("glslangValidator", ["--version"], { stdio: "ignore" });
      return "glslangValidator";
    } catch {
      return null;
    }
  })();
  it.runIf(process.env.A3D_REQUIRE_GLSLANG === "1")("glslangValidator is installed (A3D_REQUIRE_GLSLANG)", () => {
    expect(tool, "glslangValidator missing (apt-get install glslang-tools)").not.toBeNull();
  });
  it.runIf(tool !== null)("the bright-extract fragment compiles with glslangValidator", () => {
    const dir = mkdtempSync(join(tmpdir(), "prd03-bloom-bright-"));
    const file = join(dir, "bloom_bright_extract.frag");
    writeFileSync(file, BLOOM_BRIGHT_EXTRACT_GLSL);
    let log = "";
    try {
      log = execFileSync(tool!, ["-S", "frag", file], { encoding: "utf8" });
    } catch (error) {
      log = String((error as { stdout?: string }).stdout ?? error);
    }
    expect(log, log).not.toMatch(/ERROR/);
  });
});
