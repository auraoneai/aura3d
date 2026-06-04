import { describe, expect, it } from "vitest";
import { createCinematicAssetResolver } from "../../../packages/ai-scene/src/AuraCinematicAssetResolver";
import { AURA_CINEMATIC_ASSET_MANIFEST, type AuraCinematicAssetManifest } from "../../../packages/ai-scene/src/AuraCinematicAssetManifest";
import { createNorthStarCinematicSceneIntent } from "../../../packages/ai-scene/src/AuraCinematicSceneIntent";

describe("Aura cinematic asset resolver", () => {
  it("semantically resolves the north-star robot, flower, rainy alley, wet pavement, and neon practical with provenance", () => {
    const intent = createNorthStarCinematicSceneIntent();
    const resolver = createCinematicAssetResolver();

    const report = resolver.resolve(intent.assetRequirements);

    expect(report.networkUsed).toBe(false);
    expect(report.unresolved).toEqual([]);
    expect(report.resolved).toEqual(expect.arrayContaining([
      expect.objectContaining({
        intentId: "asset-robot-expressive",
        assetId: "robot-expressive",
        strategy: "manifest-asset",
        provenance: expect.objectContaining({
          source: "repository fixture",
          license: "repository fixture"
        })
      }),
      expect.objectContaining({
        intentId: "asset-glowing-flower",
        assetId: "glowing-flower",
        strategy: "procedural-mesh",
        provenance: expect.objectContaining({
          generated: true,
          license: "MIT-compatible repository fixture"
        })
      }),
      expect.objectContaining({
        intentId: "asset-rainy-neon-alley",
        assetId: "rainy-neon-alley",
        strategy: "procedural-set",
        storyBlocking: expect.objectContaining({
          robot: expect.objectContaining({ position: [-0.7, 0, 0.35] }),
          flower: expect.objectContaining({ position: [0.2, 0.02, -1.2] }),
          camera: expect.objectContaining({ position: [0, 0.9, 4.2] })
        })
      }),
      expect.objectContaining({
        intentId: "asset-wet-pavement",
        assetId: "wet-pavement",
        strategy: "renderer-material"
      }),
      expect.objectContaining({
        intentId: "asset-neon-practical-light",
        assetId: "neon-practical-light",
        lightMetadata: expect.objectContaining({ castsLight: true })
      })
    ]));
    expect(report.proceduralSets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "rainy-neon-alley",
        renderables: expect.arrayContaining([
          expect.objectContaining({ id: "alley-wet-pavement", rendererOwned: true }),
          expect.objectContaining({ id: "neon-practical-left", role: "practical-light", rendererOwned: true })
        ])
      })
    ]));
    expect(report.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "AURA_CINEMATIC_ASSET_RESOLVED", severity: "info" })
    ]));
  });

  it("rejects DOM/CSS-only substitutes in diagnostics instead of accepting them for major cinematic assets", () => {
    const intent = createNorthStarCinematicSceneIntent().assetRequirements.find((requirement) => requirement.id === "asset-glowing-flower");
    if (!intent) throw new Error("missing flower intent");
    const manifest: AuraCinematicAssetManifest = {
      schema: "aura3d.cinematic-assets/1.0",
      generatedAt: "2026-05-27T00:00:00.000Z",
      entries: [
        {
          id: "css-flower",
          label: "CSS Flower Overlay",
          category: "prop",
          kind: "dom-css-overlay",
          uri: "data:text/css,.flower{}",
          semanticTags: ["glowing-flower", "flower", "emissive"],
          moodTags: ["hopeful", "neon"],
          materialTags: ["glow"],
          visualQuality: 1,
          materialReadiness: 1,
          rendererOwned: false,
          substituteKind: "dom-css-only",
          provenance: {
            source: "test",
            sourceTitle: "css overlay",
            license: "test fixture",
            generated: true
          }
        }
      ]
    };

    const report = createCinematicAssetResolver({ manifest }).resolve([intent]);

    expect(report.resolved).toEqual([]);
    expect(report.unresolved).toEqual([
      expect.objectContaining({
        intentId: "asset-glowing-flower",
        required: true
      })
    ]);
    expect(report.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "AURA_CINEMATIC_DOM_CSS_SUBSTITUTE_REJECTED",
        severity: "error",
        message: expect.stringContaining("DOM/CSS-only")
      }),
      expect.objectContaining({
        code: "AURA_CINEMATIC_ASSET_UNRESOLVED",
        severity: "error"
      })
    ]));
  });

  it("covers required cinematic fixture categories in the curated manifest", () => {
    const categories = new Set(AURA_CINEMATIC_ASSET_MANIFEST.entries.map((entry) => entry.category));

    expect(categories).toEqual(new Set([
      "character-robot",
      "vehicle",
      "prop",
      "product",
      "urban-environment",
      "nature-environment",
      "studio-environment",
      "architectural-interior",
      "emissive-neon-panel",
      "ground-stage-surface",
      "hdr-environment"
    ]));
  });
});
