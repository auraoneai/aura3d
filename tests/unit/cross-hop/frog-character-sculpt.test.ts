import { describe, expect, it } from "vitest";
import { CRITTER_ASSET_IDS } from "../../../apps/showcase-cross-hop/src/aura-assets";
import {
  CROSS_HOP_PROCEDURAL_MATERIALS,
  buildHeroVehicleMultiMaterialNode,
  buildProceduralCritterNode,
  buildProceduralVehicleSpec,
  inspectProceduralCritterMeshQuality
} from "../../../apps/showcase-cross-hop/src/art/proceduralModels";
import { critterOverrides } from "../../../apps/showcase-cross-hop/src/game/critterLook";
import { throatPuffScale } from "../../../apps/showcase-cross-hop/src/game/diorama";
import { LANE_D } from "../../../apps/showcase-cross-hop/src/game/themes";
import { MOVER_LENGTH, TRAIN_CAR_LENGTH } from "../../../apps/showcase-cross-hop/src/game/world";

const FROG_CAST = ["hop", "goldenHop", "roboFrog", "knightToad", "astroFrog"] as const;

describe("Cross Hop 10/10 studio-grade tree-frog mascot, critter cast & compound-curve fleet", () => {
  it("sculpts Hop with 2x Loop-subdivided frog anatomy, matte-satin vertex-painted emerald-to-cream skin, raised golden periscope eyes + rear-3/4 catchlights, coral bandana & tangerine webbed feet", () => {
    const hop = inspectProceduralCritterMeshQuality("hop", 1.05);
    expect(hop.cacheReused).toBe(true);
    expect(hop.vertexCount).toBeGreaterThanOrEqual(7500);
    expect(hop.materialGroupCount).toBe(8);
    expect(hop.hasAnimatedVocalSac).toBe(true);

    // Warm toy-satin amphibian skin (zero glossy cucumber-blob plastic or metallic flanks!)
    const skinMat = CROSS_HOP_PROCEDURAL_MATERIALS.frogEmeraldSkin as {
      color?: string;
      roughness?: number;
      metalness?: number;
      clearcoat?: number;
    };
    expect(skinMat.color).toBe("#ffffff");
    expect(skinMat.roughness).toBeGreaterThanOrEqual(0.48);
    expect(skinMat.roughness).toBeLessThanOrEqual(0.56);
    expect(skinMat.metalness ?? 0).toBe(0);
    expect(skinMat.clearcoat ?? 0).toBeLessThanOrEqual(0.14);

    const hopSkinOverride = critterOverrides("hop")[0]!;
    expect(hopSkinOverride.roughness).toBeGreaterThanOrEqual(0.48);
    expect(hopSkinOverride.roughness).toBeLessThanOrEqual(0.56);
    expect(hopSkinOverride.clearcoat ?? 0).toBeLessThanOrEqual(0.14);

    expect(hop.materials[0]).toBe(CROSS_HOP_PROCEDURAL_MATERIALS.frogEmeraldSkin);
    expect(hop.materials[1]).toBe(CROSS_HOP_PROCEDURAL_MATERIALS.critterCreamBelly);
    expect(hop.materials[2]).toBe(CROSS_HOP_PROCEDURAL_MATERIALS.frogLeafSpot);
    expect(hop.materials[3]).toBe(CROSS_HOP_PROCEDURAL_MATERIALS.frogTangerineFoot);
    expect(hop.materials[4]).toBe(CROSS_HOP_PROCEDURAL_MATERIALS.frogGoldenIris);
    expect(hop.materials[5]).toBe(CROSS_HOP_PROCEDURAL_MATERIALS.critterEyePupil);
    expect(hop.materials[6]).toBe(CROSS_HOP_PROCEDURAL_MATERIALS.critterCatchlight);
    expect(hop.materials[7]).toBe(CROSS_HOP_PROCEDURAL_MATERIALS.frogCoralBandana);

    // Poised crouched amphibian proportions fitted cleanly onto 0.94 m lilypads & 1.0 m columns
    const spanX = hop.bounds.max[0] - hop.bounds.min[0];
    const spanZ = hop.bounds.max[2] - hop.bounds.min[2];
    expect(hop.bounds.min[1]).toBeCloseTo(0, 4);
    expect(hop.bounds.max[1]).toBeCloseTo(1.05, 4);
    expect(spanX).toBeGreaterThan(0.75);
    expect(spanX).toBeLessThan(1.02);
    expect(spanZ).toBeGreaterThan(0.75);
    expect(spanZ).toBeLessThan(1.04);

    // Verify linear-space vertex-painted emerald-to-lime-to-cream skin + cavity AO (zero black-dot spots!)
    const pos = hop.bodySpec.positions;
    const nrm = hop.bodySpec.normals!;
    const col = hop.bodySpec.colors!;
    const idx = hop.bodySpec.indices!;
    expect(col).toBeDefined();
    expect(col.length).toBe((pos.length / 3) * 4);

    const skinGroup = hop.bodySpec.groups!.find((g) => g.materialIndex === 0)!;
    let sunlitEmeraldVerts = 0;
    let creamyVentralVerts = 0;
    for (let i = skinGroup.start; i < skinGroup.start + skinGroup.count; i += 3) {
      const vi = idx[i]!;
      const y = pos[vi * 3 + 1]!;
      const ny = nrm[vi * 3 + 1]!;
      const r = col[vi * 4]!;
      const g = col[vi * 4 + 1]!;
      const b = col[vi * 4 + 2]!;
      if (y > 0.55 && ny > 0.55 && g > 0.35 && g > r * 2.0) sunlitEmeraldVerts += 1;
      if (y < 0.48 && ny < -0.35 && r > 0.55 && g > 0.55 && b > 0.30) creamyVentralVerts += 1;
    }
    expect(sunlitEmeraldVerts).toBeGreaterThan(120);
    expect(creamyVentralVerts).toBeGreaterThan(40);

    // Verify flared bright-tangerine webbed feet & suction toe-pads grounded at y = 0
    const footGroup = hop.bodySpec.groups!.find((g) => g.materialIndex === 3)!;
    let minFootY = Infinity;
    let maxFootAbsX = 0;
    let tangerineTris = 0;
    for (let i = footGroup.start; i < footGroup.start + footGroup.count; i += 3) {
      const vi = idx[i]!;
      const ax = Math.abs(pos[vi * 3]!);
      const y = pos[vi * 3 + 1]!;
      if (y < minFootY) minFootY = y;
      if (ax > maxFootAbsX) maxFootAbsX = ax;
      if (col[vi * 4]! > col[vi * 4 + 1]! * 1.4 && col[vi * 4 + 1]! > col[vi * 4 + 2]! * 2.0) {
        tangerineTris += 1;
      }
    }
    expect(minFootY).toBeLessThan(0.01);
    expect(maxFootAbsX).toBeGreaterThan(0.36);
    expect(tangerineTris).toBeGreaterThan(150);

    // Verify coral-orange explorer neckerchief + rear knot & fluttering tails (-Z) for chase-camera mascot charm
    const bandanaGroup = hop.bodySpec.groups!.find((g) => g.materialIndex === 7)!;
    let rearBandanaTris = 0;
    for (let i = bandanaGroup.start; i < bandanaGroup.start + bandanaGroup.count; i += 3) {
      const vi = idx[i]!;
      if (pos[vi * 3 + 2]! < -0.02 && pos[vi * 3 + 1]! > 0.52 && col[vi * 4]! > 0.45) {
        rearBandanaTris += 1;
      }
    }
    expect(rearBandanaTris).toBeGreaterThan(120);

    // Verify raised periscope golden-amber eyes, wrap-around horizontal pupils & pure-white catchlights reach top crown for rear-3/4 chase visibility
    const irisGroup = hop.bodySpec.groups!.find((g) => g.materialIndex === 4)!;
    const pupilGroup = hop.bodySpec.groups!.find((g) => g.materialIndex === 5)!;
    const catchGroup = hop.bodySpec.groups!.find((g) => g.materialIndex === 6)!;
    let maxIrisY = 0;
    let highPupilTris = 0;
    let highCatchlightTris = 0;
    for (let i = irisGroup.start; i < irisGroup.start + irisGroup.count; i += 3) {
      const y = pos[idx[i]! * 3 + 1]!;
      if (y > maxIrisY) maxIrisY = y;
    }
    for (let i = pupilGroup.start; i < pupilGroup.start + pupilGroup.count; i += 3) {
      if (pos[idx[i]! * 3 + 1]! > 0.88) highPupilTris += 1;
    }
    for (let i = catchGroup.start; i < catchGroup.start + catchGroup.count; i += 3) {
      const vi = idx[i]!;
      if (pos[vi * 3 + 1]! > 0.92 && col[vi * 4]! > 0.98 && col[vi * 4 + 1]! > 0.98 && col[vi * 4 + 2]! > 0.98) {
        highCatchlightTris += 1;
      }
    }
    expect(maxIrisY).toBeGreaterThan(0.98);
    expect(highPupilTris).toBeGreaterThan(40);
    expect(highCatchlightTris).toBeGreaterThan(30);

    // Verify vocal-sac runtime node is wired for live throat-puff animation
    const hopNodeJson = JSON.stringify(buildProceduralCritterNode("hop", { name: "player", targetHeight: 1.05 }).toJSON());
    expect(hopNodeJson).toContain("player-vocal-sac");

    const golden = inspectProceduralCritterMeshQuality("goldenHop", 1.05);
    expect(golden.hasAnimatedVocalSac).toBe(true);
    expect(golden.materialGroupCount).toBe(8);
    expect(golden.materials[0]).toBe(CROSS_HOP_PROCEDURAL_MATERIALS.sovereign24kGold);
    expect(golden.materials[7]).toBe(CROSS_HOP_PROCEDURAL_MATERIALS.crownRubyGem);
  });

  it("enforces smooth unit-length shared-vertex normals, valid linear cavity-AO colors, and high-density sculpts across all 12 critters", () => {
    for (const id of CRITTER_ASSET_IDS) {
      const q = inspectProceduralCritterMeshQuality(id, 1.05);
      expect(q.cacheReused).toBe(true);
      expect(q.bounds.min[1]).toBeCloseTo(0, 4);
      expect(q.bounds.max[1]).toBeCloseTo(1.05, 4);

      const normals = q.bodySpec.normals!;
      const positions = q.bodySpec.positions;
      const indices = q.bodySpec.indices!;
      const colors = q.bodySpec.colors!;
      expect(normals.length).toBe(positions.length);
      expect(colors).toBeDefined();
      expect(colors.length).toBe((positions.length / 3) * 4);
      // Shared-vertex indexed manifold: average valence > 1 tri-corner per vertex (never toFlatShaded 3-unique-verts-per-tri soup)
      expect(indices.length).toBeGreaterThan((positions.length / 3) * 3.8);

      let badNormals = 0;
      for (let i = 0; i < normals.length; i += 3) {
        const nx = normals[i]!;
        const ny = normals[i + 1]!;
        const nz = normals[i + 2]!;
        if (!Number.isFinite(nx) || !Number.isFinite(ny) || !Number.isFinite(nz) || Math.abs(Math.hypot(nx, ny, nz) - 1) > 1e-3) {
          badNormals++;
        }
      }
      expect(badNormals).toBe(0);

      let badColors = 0;
      for (let i = 0; i < colors.length; i += 4) {
        const r = colors[i]!;
        const g = colors[i + 1]!;
        const b = colors[i + 2]!;
        const a = colors[i + 3]!;
        if (
          !Number.isFinite(r) ||
          !Number.isFinite(g) ||
          !Number.isFinite(b) ||
          r < 0 ||
          g < 0 ||
          b < 0 ||
          r > 1.001 ||
          g > 1.001 ||
          b > 1.001 ||
          Math.abs(a - 1) > 1e-3
        ) {
          badColors++;
        }
      }
      expect(badColors).toBe(0);
    }

    for (const frogId of FROG_CAST) {
      const q = inspectProceduralCritterMeshQuality(frogId, 1.05);
      expect(q.vertexCount).toBeGreaterThanOrEqual(5500);
      expect(q.materialGroupCount).toBeGreaterThanOrEqual(5);
    }
    expect(inspectProceduralCritterMeshQuality("astroFrog", 1.05).hasGlassDome).toBe(true);
  });

  it("sculpts all 10 Cross Hop vehicles as sleek compound-curve 3D bodywork with tumblehome cabins, flared arches & cavity AO (zero boxy slabs)", () => {
    const fleet = [
      ["car", MOVER_LENGTH.car],
      ["hatch", MOVER_LENGTH.hatch],
      ["suv", MOVER_LENGTH.suv],
      ["taxi", MOVER_LENGTH.taxi],
      ["van", MOVER_LENGTH.van],
      ["pickup", MOVER_LENGTH.pickup],
      ["truck", MOVER_LENGTH.truck],
      ["tram", MOVER_LENGTH.tram],
      ["train", TRAIN_CAR_LENGTH],
      ["hover", MOVER_LENGTH.hover]
    ] as const;

    for (const [kind, targetLen] of fleet) {
      const spec = buildProceduralVehicleSpec(kind, { targetMaxDimension: targetLen });
      const pos = spec.positions;
      const nrm = spec.normals!;
      const col = spec.colors!;
      const vCount = pos.length / 3;

      expect(vCount).toBeGreaterThanOrEqual(1200);
      expect(col.length).toBe(vCount * 4);
      expect(spec.bounds).toBeDefined();

      const spanX = spec.bounds!.max[0] - spec.bounds!.min[0];
      const spanY = spec.bounds!.max[1] - spec.bounds!.min[1];
      const spanZ = spec.bounds!.max[2] - spec.bounds!.min[2];
      expect(spec.bounds!.min[1]).toBeCloseTo(0, 3);
      expect(spanX).toBeCloseTo(targetLen, 2);
      expect(spanZ).toBeLessThan(LANE_D);

      // Anti-boxy tumblehome check: upper roof section is strictly narrower in Z than flared lower fender/beltline!
      if (kind !== "hover") {
        let lowerFenderMaxZ = 0;
        let upperRoofMaxZ = 0;
        for (let i = 0; i < pos.length; i += 3) {
          const y = pos[i + 1]!;
          const az = Math.abs(pos[i + 2]!);
          if (y >= spanY * 0.18 && y <= spanY * 0.52 && az > lowerFenderMaxZ) lowerFenderMaxZ = az;
          if (y >= spanY * 0.84 && y <= spanY * 0.96 && az > upperRoofMaxZ) upperRoofMaxZ = az;
        }
        expect(lowerFenderMaxZ).toBeGreaterThan(upperRoofMaxZ * 1.05);
      }

      let badVehicleNormals = 0;
      for (let i = 0; i < nrm.length; i += 3) {
        const nx = nrm[i]!;
        const ny = nrm[i + 1]!;
        const nz = nrm[i + 2]!;
        if (!Number.isFinite(nx) || !Number.isFinite(ny) || !Number.isFinite(nz) || Math.abs(Math.hypot(nx, ny, nz) - 1) > 5e-3) {
          badVehicleNormals++;
        }
      }
      expect(badVehicleNormals).toBe(0);

      const heroJson = JSON.stringify(buildHeroVehicleMultiMaterialNode(kind, { targetMaxDimension: targetLen }).toJSON());
      expect(heroJson).toContain(`hero-${kind}-body`);
      expect(heroJson).toContain(`hero-${kind}-glass`);
    }
  });

  it("animates secondary vocal-sac throat-puff on anticipation, airborne tuck, landing cushion, and idle ribbit cadence", () => {
    const antic = throatPuffScale(0, true, -1, 0.07, false);
    const apex = throatPuffScale(0, true, -1, 0.43, false);
    const land = throatPuffScale(0, false, 0.09, 1, false);
    expect(antic[2]).toBeGreaterThan(1.15);
    expect(apex[2]).toBeLessThan(1.0);
    expect(land[2]).toBeGreaterThan(1.2);
    expect(land[1]).toBeGreaterThan(1.15);

    const landReduced = throatPuffScale(0, false, 0.09, 1, true);
    expect(landReduced[2] - 1).toBeLessThanOrEqual((land[2] - 1) * 0.26);

    const idleSamples = [0.1, 0.45, 0.85, 1.35, 1.9].map((t) => throatPuffScale(t, false, -1, 0, false)[2]);
    expect(Math.max(...idleSamples)).toBeGreaterThan(1.05);
    expect(Math.min(...idleSamples)).toBeGreaterThanOrEqual(1.0);
  });
});
