/**
 * T1.3 (PRD 14 §14.1) — `auditArtDirection` on a synthetic snapshot: an
 * ambient light, a 4-triangle unlit model and a non-practical material at
 * emissiveIntensity 0.4 must yield exactly `ambient-light`,
 * `asset-unlit-card` and `emissive-fill`.
 */

import { describe, expect, it } from "vitest";
import {
  auditArtDirection,
  type ArtDirectionSnapshot,
  type GameArtDirection
} from "@aura3d/game/art";

const DIRECTION: GameArtDirection = {
  id: "showcase-bank-shot",
  genre: "billiards",
  fantasy: "A basement pool hall at midnight under one warm cone of light.",
  rebuildTier: "S-presentation",
  wave: 1,
  references: [
    { file: "a.png", source: "https://example.com/a", licence: "reference-only", why: "Warm key falloff across felt and dark room edge density." },
    { file: "b.png", source: "internal mood board", licence: "reference-only", why: "Felt sheen at grazing angles and lacquer specular on rails." },
    { file: "c.png", source: "https://example.com/c", licence: "reference-only", why: "Top-down table framing holding the full play surface." }
  ],
  palette: { primary: ["#0b3d2e"], accent: "#d4a017" },
  lighting: {
    key: { type: "directional", colorTemperatureK: 3200, shadow: true },
    fill: "ibl",
    practicals: 1,
    environment: { preset: "studio", background: "enclosed" },
    exposureEV: 0.4
  },
  framing: { rig: "topDown", subjectHeightFraction: [0.5, 0.7], fovDeg: [35, 45], mobile: "both" },
  assets: [
    { role: "hero", assetKey: "bankShotTable", maxTriangles: 40000, minTriangles: 2000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "prop", assetKey: "bankShotPosterCard", maxTriangles: 4000, textureSet: "BC", maxTextureSize: 512 }
  ],
  vfx: [],
  audio: [],
  signatureEffect: "ball streak",
  criticalCategories: ["lighting", "shadows"],
  tiers: {
    low: { particles: 64, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    medium: { particles: 128, shadowMap: 1024, cascades: 2, textureMax: 2048 },
    high: { particles: 256, shadowMap: 2048, cascades: 3, textureMax: 2048 },
    ultra: { particles: 512, shadowMap: 2048, cascades: 4, textureMax: 4096 }
  }
};

describe("T1.3 auditArtDirection", () => {
  it("flags exactly ambient-light, asset-unlit-card and emissive-fill on the synthetic snapshot", () => {
    const snapshot: ArtDirectionSnapshot = {
      lights: [
        { type: "ambient", shadow: false, intensity: 0.5 },
        { type: "directional", shadow: true, intensity: 2.0 }
      ],
      hasAmbient: true,
      environment: { kind: "preset", background: true },
      models: [
        { assetKey: "bankShotTable", triangles: 40000, textures: 3, unlit: false, overridesTextures: false },
        { assetKey: "bankShotPosterCard", triangles: 4, textures: 1, unlit: true, overridesTextures: false }
      ],
      materials: [
        { name: "glowStrip", node: "ceiling-strip", emissiveIntensity: 0.4, practical: false }
      ],
      drawCalls: 80
    };
    const violations = auditArtDirection(DIRECTION, snapshot);
    expect(violations.map((v) => v.rule).sort()).toEqual(["ambient-light", "asset-unlit-card", "emissive-fill"].sort());
  });

  it("fires no-shadowed-key when nothing casts", () => {
    const snapshot: ArtDirectionSnapshot = {
      lights: [{ type: "directional", shadow: false, intensity: 2.0 }],
      hasAmbient: false,
      environment: { kind: "hdri", background: true },
      models: [{ assetKey: "bankShotTable", triangles: 40000, textures: 3, unlit: false, overridesTextures: false }],
      materials: [],
      drawCalls: 80
    };
    expect(auditArtDirection(DIRECTION, snapshot).map((v) => v.rule)).toEqual(["no-shadowed-key"]);
  });

  it("fires draws-over-tier-budget only when a budget is supplied", () => {
    const snapshot: ArtDirectionSnapshot = {
      lights: [{ type: "directional", shadow: true, intensity: 2.0 }],
      hasAmbient: false,
      environment: { kind: "hdri", background: true },
      models: [{ assetKey: "bankShotTable", triangles: 40000, textures: 3, unlit: false, overridesTextures: false }],
      materials: [],
      drawCalls: 400
    };
    expect(auditArtDirection(DIRECTION, snapshot)).toEqual([]);
    expect(auditArtDirection(DIRECTION, snapshot, { drawCallsBudget: 300 }).map((v) => v.rule)).toEqual(["draws-over-tier-budget"]);
  });
});
