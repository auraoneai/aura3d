import { describe, expect, it } from "vitest";
import { inspectProductionGlb } from "../../packages/assets/src/asset-corpus";

// The manifest-summary case ("pins real imported GLB assets instead of
// primitive-only proof") read a `fixtures/asset-corpus/manifest.json` revision
// that was never committed; it is retired (docs/project/status/retired-tests.md).
// The flagship structure case reads the tracked Khronos fixtures directly
// (sources, licenses and SHA-256 in fixtures/asset-corpus/khronos-sources.json).
describe("production real asset corpus", () => {
  it("extracts actual glTF scene structure from flagship files", () => {
    const helmet = inspectProductionGlb("fixtures/asset-corpus/damaged-helmet.glb");
    const character = inspectProductionGlb("fixtures/asset-corpus/cesium-man.glb");
    const morph = inspectProductionGlb("fixtures/asset-corpus/animated-morph-cube.glb");

    expect(helmet.validGlb).toBe(true);
    expect(helmet.texturedPbrMaterialCount).toBeGreaterThan(0);
    expect(helmet.textureCount).toBeGreaterThan(0);
    expect(character.skinCount).toBeGreaterThan(0);
    expect(character.animationCount).toBeGreaterThan(0);
    expect(morph.morphTargetPrimitiveCount).toBeGreaterThan(0);
    expect(morph.animationCount).toBeGreaterThan(0);
  });
});
