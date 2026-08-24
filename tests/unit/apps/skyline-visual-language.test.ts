import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SKYLINE_SHARD_GEOMETRY,
  SKYLINE_VISUAL_LANGUAGE,
  skylineVisualLanguageEvidence,
  skylineVisualRoleSignature
} from "../../../apps/showcase-skyline-runner/src/visual-language";

describe("Skyline shape-plus-color language", () => {
  it("defines a complete and distinct signature for every gameplay role", () => {
    const evidence = skylineVisualLanguageEvidence();
    expect(evidence.roleCount).toBe(8);
    expect(evidence.uniqueSignatureCount).toBe(evidence.roleCount);
    expect(evidence.everyRoleHasShapeAndTwoColors).toBe(true);
    expect(Object.keys(SKYLINE_VISUAL_LANGUAGE)).toEqual([
      "safe-surface",
      "hazard",
      "collectible",
      "ember-charge",
      "relay",
      "finish",
      "player",
      "ghost"
    ]);
  });

  it("uses silhouette as well as color for every role", () => {
    const signatures = Object.values(SKYLINE_VISUAL_LANGUAGE).map((spec) => skylineVisualRoleSignature(spec.role));
    expect(new Set(signatures).size).toBe(signatures.length);
    expect(SKYLINE_VISUAL_LANGUAGE.collectible.shape).toContain("faceted-diamond");
    expect(SKYLINE_VISUAL_LANGUAGE.hazard.shape).toContain("crossed-warning-mark");
    expect(SKYLINE_VISUAL_LANGUAGE.relay.shape).toContain("ring-on-post");
    expect(SKYLINE_VISUAL_LANGUAGE.finish.shape).toContain("stepped-gold-mast");
    expect(SKYLINE_VISUAL_LANGUAGE.player.shape).not.toBe(SKYLINE_VISUAL_LANGUAGE.collectible.shape);
  });

  it("builds the shard as indexed faceted geometry rather than another sphere", () => {
    expect(SKYLINE_SHARD_GEOMETRY.kind).toBe("aura-custom-geometry");
    expect(SKYLINE_SHARD_GEOMETRY.positions).toHaveLength(6);
    expect(SKYLINE_SHARD_GEOMETRY.indices).toHaveLength(24);
    expect(Math.max(...SKYLINE_SHARD_GEOMETRY.indices)).toBeLessThan(SKYLINE_SHARD_GEOMETRY.positions.length);
  });

  it("mounts the role vocabulary through public Aura3D scene geometry", () => {
    const source = readFileSync("apps/showcase-skyline-runner/src/main.ts", "utf8");
    expect(source).toContain("geometry.custom(SKYLINE_SHARD_GEOMETRY");
    expect(source).toContain('primitive: "torus"');
    expect(source).toContain("skylineHazardLanguageNodes");
    expect(source).toContain("skylineRelayLanguageNodes");
    expect(source).toContain('tags: ["player", "character", "typed-primary-asset", "player-language", "shape-plus-color"]');
    expect(source).not.toContain('return primitives.sphere({\n        name: "sky shard glitter "');
    expect(source).not.toContain("[0, 1, 2, 3].map((index) => primitives.sphere");
  });
});

