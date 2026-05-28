import { describe, expect, it } from "vitest";
import { createDefaultAssetResolver } from "../../../packages/ai-scene/src";
import { createNeonAlleyIR, expectDiagnosticShape } from "./fixtures";

describe("AuraScene asset resolver", () => {
  it("resolves local assets and emits placeholder diagnostics for missing requirements", async () => {
    const resolver = createDefaultAssetResolver({
      manifest: {
        assets: [
          {
            id: "robot-expressive",
            semantic: "robot",
            tags: ["character", "robot", "expressive"],
            uri: "/fixtures/threejs-parity/assets/character/robot-expressive.glb",
            license: "fixture",
            source: "local-fixture"
          }
        ]
      }
    });
    const ir = createNeonAlleyIR();

    const result = await resolver.resolve(ir.assetRequirements, { sceneId: ir.sceneId });

    expect(result.networkUsed).toBe(false);
    expect(result.assets).toEqual([
      expect.objectContaining({
        requirementId: "asset_robot",
        assetId: "robot-expressive",
        uri: "/fixtures/threejs-parity/assets/character/robot-expressive.glb",
        provenance: expect.objectContaining({
          source: "local-fixture",
          license: "fixture"
        })
      })
    ]);
    expect(result.placeholders).toEqual([
      expect.objectContaining({
        requirementId: "asset_flower",
        semantic: "glowing flower",
        placeholderKind: "primitive"
      })
    ]);
    expect(result.missing).toEqual([
      expect.objectContaining({
        requirementId: "asset_flower",
        required: false
      })
    ]);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "AURA_ASSET_PLACEHOLDER_USED",
        path: "assetRequirements[asset_flower]",
        severity: "warning"
      })
    ]));
    for (const diagnostic of result.diagnostics) expectDiagnosticShape(diagnostic);
  });

  it("does not fetch remote assets during deterministic resolution", async () => {
    const resolver = createDefaultAssetResolver();
    const originalFetch = globalThis.fetch;
    let networkUsed = false;
    globalThis.fetch = (async () => {
      networkUsed = true;
      throw new Error("Asset resolver must not fetch during unit tests.");
    }) as typeof fetch;
    try {
      const result = await resolver.resolve(createNeonAlleyIR().assetRequirements);

      expect(networkUsed).toBe(false);
      expect(result.networkUsed).toBe(false);
      expect(result.placeholders.length).toBeGreaterThan(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
