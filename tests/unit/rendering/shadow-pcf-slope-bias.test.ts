import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regression coverage for the PCF shadow-acne defect found while building the
 * cascaded/PCF shadow evidence route for FS-501.
 *
 * Symptom: with shadows enabled and *no caster in the scene at all*, the receiver plane
 * darkened by a mean RGB-sum of 15.3 across ~19,900 pixels. The darkening scaled with the
 * PCF kernel radius (0.5 -> 1.75, 1.5 -> 15.3, 3.0 -> 26.3), which is the signature of the
 * receiver shadowing itself rather than of any real occluder.
 *
 * Two independent bugs produced it, and both are asserted here against the shipped shader
 * source so a future refactor cannot silently reintroduce either one.
 */
const SHADER_LIBRARY_PATH = "packages/rendering/src/ShaderLibrary.ts";

describe("PCF slope-scaled depth bias", () => {
  it("scales the slope bias by each PCF sample's own texel distance", () => {
    // Bug 1: the bias was computed once for the kernel centre and reused for every tap.
    // A tap N texels away on a sloped receiver sees a depth difference proportional to N,
    // so a centre-only bias under-compensates every outer sample. The comparison depth
    // must therefore be derived inside the sampling loop, per sample.
    const source = readShaderLibrary();

    expect(source).toContain("float sampleTexelDistance = max(1.0, length(sampleData.xy));");
    expect(source).toContain("slopeTexelBias * sampleTexelDistance");

    // The pre-fix formulation hoisted a single `receiverDepth` above the loop. If that name
    // reappears as a loop-invariant declaration, the per-sample bias has been undone.
    expect(source).not.toContain("float slopeReceiverBias =");

    // Every shadow-factor helper that samples a PCF kernel must compute its comparison
    // depth inside the loop. Count both together so a partially-reverted refactor fails.
    const perSampleDepthDeclarations = countOccurrences(
      source,
      "float receiverDepth = projectedDepth -"
    );
    const shadowLoops = countOccurrences(source, "float sampleTexelDistance = max(1.0, length(sampleData.xy));");
    expect(shadowLoops).toBeGreaterThanOrEqual(9);
    expect(perSampleDepthDeclarations).toBe(shadowLoops);
  });

  it("derives the slope bias from the tangent of the receiver/light angle, not from (1 - N.L)", () => {
    // Bug 2: the magnitude used `(1.0 - normalDotLight)`, but the depth gradient across one
    // shadow texel is tan(angle). The linear form collapses toward zero far faster than the
    // real gradient grows, so it under-biases exactly the grazing angles that need the most
    // compensation. Per-sample scaling alone only reduced measured acne 15.31 -> 14.91;
    // switching to the tangent form took it to 0.64.
    const source = readShaderLibrary();

    expect(source).toContain(
      "float slopeTangent = min(sqrt(max(1.0 - normalDotLight * normalDotLight, 0.0)) / max(normalDotLight, 0.05), 8.0);"
    );
    expect(source).toContain("float slopeTexelBias = slopeTangent *");

    // The old linear magnitude must not survive anywhere in the shadow path.
    expect(source).not.toContain("(1.0 - normalDotLight) * u_shadowMapSlopeBias");
    expect(source).not.toContain("(1.0 - normalDotLight) * u_pointShadowSlopeBias");
  });

  it("keeps the tangent bounded so a perpendicular receiver cannot demand unbounded bias", () => {
    // As normalDotLight approaches zero the true tangent diverges. An unbounded bias would
    // push the comparison depth past every stored depth and erase real shadows
    // (peter-panning) instead of merely removing acne, so the clamp is part of the fix
    // rather than defensive padding.
    const source = readShaderLibrary();
    expect(source).toContain("max(normalDotLight, 0.05)");
    expect(source).toContain(", 8.0);");
  });

  it("models the measured acne relationship the fix relies on", () => {
    // Independent of the shader text: this pins the arithmetic claim behind the fix, namely
    // that required compensation grows with both sample distance and slope tangent. If
    // either factor is dropped the outer taps of a wide kernel are under-biased.
    const texel = 1 / 1024;
    const slopeBias = 1.2;

    const requiredBias = (normalDotLight: number, texelDistance: number): number => {
      const tangent = Math.min(
        Math.sqrt(Math.max(1 - normalDotLight * normalDotLight, 0)) / Math.max(normalDotLight, 0.05),
        8
      );
      return tangent * slopeBias * texel * texelDistance;
    };

    // A grazing receiver needs far more compensation than a face-on one.
    expect(requiredBias(0.15, 1)).toBeGreaterThan(requiredBias(0.95, 1) * 5);
    // An outer tap of a radius-3 kernel needs ~3x the centre tap's compensation.
    expect(requiredBias(0.5, 3)).toBeCloseTo(requiredBias(0.5, 1) * 3, 10);
    // The clamp bounds the worst case rather than letting it diverge.
    expect(requiredBias(0.0001, 1)).toBe(8 * slopeBias * texel);
  });
});

function readShaderLibrary(): string {
  return readFileSync(resolve(process.cwd(), SHADER_LIBRARY_PATH), "utf8");
}

function countOccurrences(source: string, needle: string): number {
  return source.split(needle).length - 1;
}
