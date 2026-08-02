import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createProductTurntableRenderKit } from "../../../packages/rendering/src/index";

/**
 * Regression coverage for two lighting defects found while closing the root quality gate's
 * product-turntable case.
 *
 * Both had the same shape: a value was published in reported metadata but never reached the
 * rendered frame, so the report described lighting the renderer was not doing.
 */
describe("environment ambient contribution", () => {
  it("adds the ambient term to the procedural environment instead of replacing it", () => {
    // The shader used `mix(ambientEnvironment, procedural..., proceduralEnvironmentWeight)`.
    // Because a procedural map is present in the normal case, the weight is 1 and the ambient
    // term was discarded outright: raising the turntable kit's ambient intensity from 0.18 to
    // 3.0 produced a byte-identical frame (salientRatio 0.10083 both times). Ambient light and
    // a sky gradient are separate contributions, so they must sum.
    const source = readFileSync(resolve(process.cwd(), "packages/rendering/src/ShaderLibrary.ts"), "utf8");

    const additive = "vec3 environmentDiffuse = ambientEnvironment + proceduralDiffuse * u_environmentMapIntensity * proceduralEnvironmentWeight;";
    const replaced = "vec3 environmentDiffuse = mix(ambientEnvironment, proceduralDiffuse * u_environmentMapIntensity, proceduralEnvironmentWeight);";

    expect(source).toContain(additive);
    expect(source).not.toContain(replaced);
    // Every lit shader variant must carry the fix, not just the first one.
    expect(source.split(additive).length - 1).toBeGreaterThanOrEqual(6);
  });

  it("keeps the packaged direct-PBR shader in step with the fixed library source", () => {
    // The packaged GLSL is asserted byte-identical to the compiled library elsewhere; this
    // pins the specific line so a partial hand-edit of one file is caught directly.
    const packaged = readFileSync(resolve(process.cwd(), "packages/rendering/src/shaders/pbr-direct.frag.glsl"), "utf8");
    expect(packaged).toContain("vec3 environmentDiffuse = ambientEnvironment + proceduralDiffuse * u_environmentMapIntensity * proceduralEnvironmentWeight;");
    expect(packaged).not.toContain("mix(ambientEnvironment,");
  });
});

describe("product turntable lighting presets drive the render", () => {
  it("derives the submitted light rig from the active preset rather than hardcoded values", () => {
    // `createProductTurntableCollectedLights()` took no arguments and hardcoded a 2.35 key,
    // 0.52 fill, and 0.92 rim. Every preset therefore rendered an identical frame while
    // `fixture.lighting` reported different numbers, making the preset a self-reported claim.
    const studio = createProductTurntableRenderKit({ elapsedSeconds: 0, canvasWidth: 320, canvasHeight: 240, lightingPreset: "studio" });
    const dramatic = createProductTurntableRenderKit({ elapsedSeconds: 0, canvasWidth: 320, canvasHeight: 240, lightingPreset: "dramatic" });

    try {
      const intensities = (kit: typeof studio): readonly number[] =>
        Array.from(kit.source.collectedLights ?? []).map((light) => light.intensity);

      const studioIntensities = intensities(studio);
      const dramaticIntensities = intensities(dramatic);

      expect(studioIntensities).not.toEqual(dramaticIntensities);
      // Dramatic declares keyIntensity 2.5 against studio's 1.5, so its key must be brighter.
      expect(Math.max(...dramaticIntensities)).toBeGreaterThan(Math.max(...studioIntensities));
      // Studio keeps its previously tuned absolute key value, so the change is not a retune.
      expect(Math.max(...studioIntensities)).toBeCloseTo(2.35, 4);
    } finally {
      studio.dispose();
      dramatic.dispose();
    }
  });

  it("submits the preset's ambient intensity as the environment ambient term", () => {
    // `ambientIntensity` was declared by every preset and never submitted at all: the rig had
    // no ambient light and the environment bundle carried its own unrelated 0.18.
    const studio = createProductTurntableRenderKit({ elapsedSeconds: 0, canvasWidth: 320, canvasHeight: 240, lightingPreset: "studio" });
    const dramatic = createProductTurntableRenderKit({ elapsedSeconds: 0, canvasWidth: 320, canvasHeight: 240, lightingPreset: "dramatic" });

    // `environmentLighting` is `false | EnvironmentLightingOptions`, and `false` would itself be
    // a failure here, so assert it is an object before reading the ambient term.
    const ambientIntensity = (kit: typeof studio): number => {
      const environmentLighting = kit.source.environmentLighting;
      expect(typeof environmentLighting).toBe("object");
      if (typeof environmentLighting !== "object" || environmentLighting === null) {
        throw new Error("expected environment lighting options");
      }
      return environmentLighting.intensity;
    };

    try {
      expect(ambientIntensity(studio)).toBeCloseTo(studio.fixture.lighting.ambientIntensity, 4);
      expect(ambientIntensity(dramatic)).toBeCloseTo(dramatic.fixture.lighting.ambientIntensity, 4);
      // Dramatic declares 0.05 ambient against studio's 0.2, so the two must actually differ.
      expect(ambientIntensity(studio)).toBeGreaterThan(ambientIntensity(dramatic));
    } finally {
      studio.dispose();
      dramatic.dispose();
    }
  });

  it("honours the preset's shadow enablement rather than always enabling shadows", () => {
    // The `soft` preset declares `shadowEnabled: false`, which previously changed nothing.
    const soft = createProductTurntableRenderKit({ elapsedSeconds: 0, canvasWidth: 320, canvasHeight: 240, lightingPreset: "soft" });
    const studio = createProductTurntableRenderKit({ elapsedSeconds: 0, canvasWidth: 320, canvasHeight: 240, lightingPreset: "studio" });

    try {
      const shadowEnabled = (kit: typeof soft): boolean =>
        typeof kit.source.shadow === "object" && kit.source.shadow !== null && kit.source.shadow.enabled === true;

      expect(soft.fixture.lighting.shadowEnabled).toBe(false);
      expect(shadowEnabled(soft)).toBe(false);
      expect(shadowEnabled(studio)).toBe(true);
      // A caster light must not advertise shadow casting when the preset disables shadows.
      expect(Array.from(soft.source.collectedLights ?? []).some((light) => light.castsShadow)).toBe(false);
    } finally {
      soft.dispose();
      studio.dispose();
    }
  });
});
