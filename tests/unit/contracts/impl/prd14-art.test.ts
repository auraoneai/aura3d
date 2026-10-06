/**
 * T1.1 / T1.2 (PRD 14 §14.1) — C-35 implementation conformance:
 * `defineArtDirection` fatal rules (one failing fixture each + one passing
 * fixture, plus a multi-violation collection check) and the
 * `GAME_VISUAL_CATEGORY_LIST` ⇔ C-32 `GAME_VISUAL_CATEGORIES` equality.
 */

import { describe, expect, it } from "vitest";
import {
  AuraArtDirectionError,
  GAME_VISUAL_CATEGORY_LIST,
  auditArtDirection,
  defineArtDirection,
  type ArtDirectionSnapshot,
  type GameArtDirection
} from "@aura3d/game/art";
import { GAME_VISUAL_CATEGORIES } from "../../../../tools/quality-gate/src/contracts";

const VALID: GameArtDirection = {
  id: "showcase-bank-shot",
  genre: "billiards",
  fantasy: "A basement pool hall at midnight under one warm cone of light.",
  rebuildTier: "S-presentation",
  wave: 1,
  references: [
    { file: "hall-key.png", source: "https://example.com/hall", licence: "reference-only", why: "Warm key falloff across felt and the density of the dark room edges." },
    { file: "felt-close.png", source: "internal mood board", licence: "reference-only", why: "Felt sheen at grazing angles and the lacquer specular on rails." },
    { file: "framing.png", source: "https://example.com/frame", licence: "reference-only", why: "Top-down table framing holding the full play surface in view." }
  ],
  palette: { primary: ["#0b3d2e", "#f5e6c8"], accent: "#d4a017" },
  lighting: {
    key: { type: "spot", colorTemperatureK: 3200, shadow: true },
    fill: "ibl+bounce",
    practicals: 2,
    environment: { hdri: "poolHallWarm", background: "enclosed" },
    exposureEV: 0.4
  },
  framing: { rig: "topDown", subjectHeightFraction: [0.5, 0.7], fovDeg: [35, 45], mobile: "both" },
  assets: [
    { role: "hero", assetKey: "bankShotTable", maxTriangles: 40000, minTriangles: 2000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "prop", assetKey: "bankShotBall", maxTriangles: 4000, textureSet: "BC+N", maxTextureSize: 512 }
  ],
  vfx: [{ event: "pot", kind: "confetti-burst" }],
  audio: [{ event: "strike", cue: "ballStrike", variants: 4 }],
  signatureEffect: "ball streak under the key cone",
  criticalCategories: ["material_quality", "lighting", "shadows"],
  tiers: {
    low: { particles: 64, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    medium: { particles: 128, shadowMap: 1024, cascades: 2, textureMax: 2048 },
    high: { particles: 256, shadowMap: 2048, cascades: 3, textureMax: 2048 },
    ultra: { particles: 512, shadowMap: 2048, cascades: 4, textureMax: 4096 }
  }
};

const CLEAN_SNAPSHOT: ArtDirectionSnapshot = {
  lights: [{ type: "directional", shadow: true, intensity: 2.2 }],
  hasAmbient: false,
  environment: { kind: "hdri", background: true },
  models: [
    { assetKey: "bankShotTable", triangles: 40000, textures: 3, unlit: false, overridesTextures: false },
    { assetKey: "bankShotBall", triangles: 3000, textures: 2, unlit: false, overridesTextures: false }
  ],
  materials: [{ name: "tableFelt", emissiveIntensity: 0 }],
  drawCalls: 110
};

function violationsOf(mutate: (d: GameArtDirection) => void): readonly string[] {
  const direction = structuredClone(VALID) as GameArtDirection;
  mutate(direction);
  try {
    defineArtDirection(direction);
  } catch (error) {
    if (error instanceof AuraArtDirectionError) return error.violations;
    throw error;
  }
  return [];
}

describe("T1.1 defineArtDirection", () => {
  it("accepts the passing fixture unchanged", () => {
    const direction = structuredClone(VALID) as GameArtDirection;
    expect(defineArtDirection(direction)).toBe(direction);
  });

  it("rejects fewer than 3 references", () => {
    const violations = violationsOf((d) => { (d as { references: unknown[] }).references = d.references.slice(0, 2); });
    expect(violations.some((v) => v.includes("references"))).toBe(true);
  });

  it('rejects fill "ambient"', () => {
    const violations = violationsOf((d) => { (d.lighting as { fill: string }).fill = "ambient"; });
    expect(violations.some((v) => v.includes('lighting.fill'))).toBe(true);
  });

  it("rejects a hero role without minTriangles", () => {
    const violations = violationsOf((d) => {
      (d.assets[0] as { minTriangles?: number }).minTriangles = undefined;
    });
    expect(violations.some((v) => v.includes("minTriangles"))).toBe(true);
  });

  it('rejects textureSet "BC" on a hero role', () => {
    const violations = violationsOf((d) => {
      (d.assets[0] as { textureSet: string }).textureSet = "BC";
    });
    expect(violations.some((v) => v.includes('textureSet "BC"'))).toBe(true);
  });

  it("rejects standIns[].request not matching R-14-NN", () => {
    const violations = violationsOf((d) => {
      (d as { standIns: unknown[] }).standIns = [{ feature: "camera rig", file: "src/v2/scene/camera.ts", request: "FIXME-later", removeWhen: "C-22 real" }];
    });
    expect(violations.some((v) => v.includes("R-14-NN"))).toBe(true);
  });

  it("collects every violation instead of stopping at the first", () => {
    const direction = structuredClone(VALID) as GameArtDirection;
    (direction as { references: unknown[] }).references = [];
    (direction.lighting as { fill: string }).fill = "ambient";
    try {
      defineArtDirection(direction);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(AuraArtDirectionError);
      const violations = (error as AuraArtDirectionError).violations;
      expect(violations.length).toBeGreaterThanOrEqual(2);
      expect(violations.some((v) => v.includes("references"))).toBe(true);
      expect(violations.some((v) => v.includes("lighting.fill"))).toBe(true);
    }
  });
});

describe("T1.1 auditArtDirection scene rules", () => {
  it("accepts the clean snapshot against the passing direction", () => {
    expect(auditArtDirection(VALID, CLEAN_SNAPSHOT)).toEqual([]);
  });

  it("rejects 2 shadowed directionals in a non-stealth genre", () => {
    const snapshot: ArtDirectionSnapshot = {
      ...CLEAN_SNAPSHOT,
      lights: [
        { type: "directional", shadow: true, intensity: 2.2 },
        { type: "directional", shadow: true, intensity: 0.9 }
      ]
    };
    const violations = auditArtDirection(VALID, snapshot);
    expect(violations.map((v) => v.rule)).toContain("too-many-practicals");
  });

  it("rejects an ambient light in the mounted scene", () => {
    const snapshot: ArtDirectionSnapshot = {
      ...CLEAN_SNAPSHOT,
      lights: [...CLEAN_SNAPSHOT.lights, { type: "ambient", shadow: false, intensity: 0.4 }],
      hasAmbient: true
    };
    const violations = auditArtDirection(VALID, snapshot);
    expect(violations.map((v) => v.rule)).toContain("ambient-light");
  });
});

describe("T1.2 GAME_VISUAL_CATEGORY_LIST", () => {
  it("deep-equals C-32 GAME_VISUAL_CATEGORIES in order", () => {
    expect(GAME_VISUAL_CATEGORY_LIST).toEqual(GAME_VISUAL_CATEGORIES);
    expect(GAME_VISUAL_CATEGORY_LIST).toHaveLength(27);
  });
});
