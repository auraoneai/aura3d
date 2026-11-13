import { describe, expect, it } from "vitest";
import { CRITTER_ASSET_IDS } from "../../../apps/showcase-cross-hop/src/aura-assets";
import {
  CROSS_HOP_PROCEDURAL_MATERIALS,
  buildProceduralCritterNode,
  inspectProceduralCritterMeshQuality
} from "../../../apps/showcase-cross-hop/src/art/proceduralModels";
import { throatPuffScale } from "../../../apps/showcase-cross-hop/src/game/diorama";

const FROG_CAST = ["hop", "goldenHop", "roboFrog", "knightToad", "astroFrog"] as const;

describe("Cross Hop sculpted organic tree-frog & critter cast", () => {
  it("sculpts Hop & Golden Hop with smooth emerald-jade skin (#2eb85c), golden-amber eyes, proud dorsal spots, webbed feet at y=0, and animated vocal sac", () => {
    const hop = inspectProceduralCritterMeshQuality("hop", 1.05);
    expect(hop.cacheReused).toBe(true);
    expect(hop.vertexCount).toBeGreaterThanOrEqual(4500);
    expect(hop.materialGroupCount).toBe(8);
    expect(hop.hasAnimatedVocalSac).toBe(true);
    expect(hop.bodySpec.colors).toBeUndefined();

    // Exact moist emerald-jade skin, leaf-green spots, cream belly, sticky mint pads, golden-amber iris & obsidian pupil
    expect(CROSS_HOP_PROCEDURAL_MATERIALS.frogEmeraldSkin.color).toBe("#2eb85c");
    expect((CROSS_HOP_PROCEDURAL_MATERIALS.frogEmeraldSkin as { clearcoat?: number }).clearcoat).toBeGreaterThanOrEqual(0.7);
    expect(hop.materials[0]).toBe(CROSS_HOP_PROCEDURAL_MATERIALS.frogEmeraldSkin);
    expect(hop.materials[1]).toBe(CROSS_HOP_PROCEDURAL_MATERIALS.critterCreamBelly);
    expect(hop.materials[2]).toBe(CROSS_HOP_PROCEDURAL_MATERIALS.frogLeafSpot);
    expect(hop.materials[3]).toBe(CROSS_HOP_PROCEDURAL_MATERIALS.frogMintToePad);
    expect(hop.materials[4]).toBe(CROSS_HOP_PROCEDURAL_MATERIALS.frogGoldenIris);
    expect(hop.materials[5]).toBe(CROSS_HOP_PROCEDURAL_MATERIALS.critterEyePupil);
    expect(hop.materials[6]).toBe(CROSS_HOP_PROCEDURAL_MATERIALS.critterCatchlight);
    expect(hop.materials[7]).toBe(CROSS_HOP_PROCEDURAL_MATERIALS.critterRosyBlush);

    // Poised crouched amphibian proportions fitted cleanly onto 0.94 m lilypads & 1.0 m columns
    const spanX = hop.bounds.max[0] - hop.bounds.min[0];
    const spanZ = hop.bounds.max[2] - hop.bounds.min[2];
    expect(hop.bounds.min[1]).toBeCloseTo(0, 4);
    expect(hop.bounds.max[1]).toBeCloseTo(1.05, 4);
    expect(spanX).toBeGreaterThan(0.75);
    expect(spanX).toBeLessThan(1.02);
    expect(spanZ).toBeGreaterThan(0.75);
    expect(spanZ).toBeLessThan(1.04);

    // Verify dorsal leaf-green spots (material group 2) sit proudly on the rear/upper back (z < 0, y > 0.35) for chase-camera visibility
    const spotGroup = hop.bodySpec.groups?.find((g) => g.materialIndex === 2);
    expect(spotGroup).toBeDefined();
    let rearDorsalSpotTris = 0;
    const idx = hop.bodySpec.indices!;
    const pos = hop.bodySpec.positions;
    for (let i = spotGroup!.start; i < spotGroup!.start + spotGroup!.count; i += 3) {
      const v0 = idx[i]! * 3;
      const y = pos[v0 + 1]!;
      const z = pos[v0 + 2]!;
      if (z < -0.02 && y > 0.35) rearDorsalSpotTris += 1;
    }
    expect(rearDorsalSpotTris).toBeGreaterThan(80);

    // Verify vocal-sac runtime node is wired for live throat-puff animation
    const hopNodeJson = JSON.stringify(buildProceduralCritterNode("hop", { name: "player", targetHeight: 1.05 }).toJSON());
    expect(hopNodeJson).toContain("player-vocal-sac");

    const golden = inspectProceduralCritterMeshQuality("goldenHop", 1.05);
    expect(golden.hasAnimatedVocalSac).toBe(true);
    expect(golden.materialGroupCount).toBe(8);
    expect(golden.materials[0]).toBe(CROSS_HOP_PROCEDURAL_MATERIALS.sovereign24kGold);
    expect(golden.materials[7]).toBe(CROSS_HOP_PROCEDURAL_MATERIALS.crownRubyGem);
  });

  it("enforces smooth unit-length shared-vertex normals, zero vertexColors washout, and zero flat-box seams across all frog variants & critters", () => {
    for (const id of CRITTER_ASSET_IDS) {
      const q = inspectProceduralCritterMeshQuality(id, 1.05);
      expect(q.cacheReused).toBe(true);
      expect(q.bodySpec.colors).toBeUndefined();
      expect(q.bounds.min[1]).toBeCloseTo(0, 4);
      expect(q.bounds.max[1]).toBeCloseTo(1.05, 4);

      const normals = q.bodySpec.normals!;
      const positions = q.bodySpec.positions;
      const indices = q.bodySpec.indices!;
      expect(normals.length).toBe(positions.length);
      // Shared-vertex indexed manifold: average valence > 1 tri-corner per vertex (never toFlatShaded 3-unique-verts-per-tri soup)
      expect(indices.length).toBeGreaterThan((positions.length / 3) * 3.8);

      for (let i = 0; i < normals.length; i += 3) {
        const nx = normals[i]!;
        const ny = normals[i + 1]!;
        const nz = normals[i + 2]!;
        expect(Number.isFinite(nx) && Number.isFinite(ny) && Number.isFinite(nz)).toBe(true);
        expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 3);
      }
    }

    // Specifically verify all 5 frog/toad heroes have high-density smooth sculpted geometry & Astro Frog keeps its glass bubble dome
    for (const frogId of FROG_CAST) {
      const q = inspectProceduralCritterMeshQuality(frogId, 1.05);
      expect(q.vertexCount).toBeGreaterThanOrEqual(3200);
      expect(q.materialGroupCount).toBeGreaterThanOrEqual(5);
    }
    expect(inspectProceduralCritterMeshQuality("astroFrog", 1.05).hasGlassDome).toBe(true);
  });

  it("animates secondary vocal-sac throat-puff on anticipation, airborne tuck, landing cushion, and idle ribbit cadence", () => {
    const antic = throatPuffScale(0, true, -1, 0.07, false);
    const apex = throatPuffScale(0, true, -1, 0.43, false);
    const land = throatPuffScale(0, false, 0.09, 1, false);
    expect(antic[2]).toBeGreaterThan(1.15);
    expect(apex[2]).toBeLessThan(1.0);
    expect(land[2]).toBeGreaterThan(1.2);
    expect(land[1]).toBeGreaterThan(1.15);

    // Reduced motion attenuates throat-puff amplitude cleanly
    const landReduced = throatPuffScale(0, false, 0.09, 1, true);
    expect(landReduced[2] - 1).toBeLessThanOrEqual((land[2] - 1) * 0.26);

    // Idle ribbit cadence varies smoothly over time without ever going negative or NaN
    const idleSamples = [0.1, 0.45, 0.85, 1.35, 1.9].map((t) => throatPuffScale(t, false, -1, 0, false)[2]);
    expect(Math.max(...idleSamples)).toBeGreaterThan(1.05);
    expect(Math.min(...idleSamples)).toBeGreaterThanOrEqual(1.0);
  });
});
