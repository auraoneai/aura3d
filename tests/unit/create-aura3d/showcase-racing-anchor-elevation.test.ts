import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractRacingTrackTopologyFromAsset } from "../../../packages/create-aura3d/src/showcase-spec-game-geometry-extractor";

/**
 * Regression coverage for the hero-vehicle grounding defect.
 *
 * ## What went wrong
 *
 * Every route-to-model anchor took its Y from `roadBounds.min[1]` -- the lowest vertex anywhere in
 * the road/kerb/asphalt material family. On a real circuit that floor belongs to a kerb underside or
 * a drainage lip, not to the tarmac the car drives on. The route solver then aligned the track so its
 * *bounding-box floor* met the car's contact plane, seating the whole car below the visible road.
 *
 * On Tsukuba the gap was 0.05 model units, magnified by the 2.5505 track fit scale into 0.1275 scene
 * units -- about 77% of the hero car's wheel diameter. The car looked like it had no wheels, because
 * the wheels were under the asphalt. Nothing detected it: the asset loaded, all five primitives were
 * submitted (`drawCalls: 10`), and every structural gate passed.
 *
 * ## Why these fixtures
 *
 * Each fixture puts the drivable surface at a *known* elevation and adds lower geometry in the same
 * material family, so the correct anchor Y is known analytically and differs from the bounds floor.
 * A test that only used a single flat plane could not tell the two strategies apart.
 */
describe("racing road anchors bind to the drivable surface elevation", () => {
  it("samples the tarmac elevation instead of the road family's bounding-box floor", () => {
    // Tarmac at y = 0; a kerb lip 0.4 units lower shares the road material family.
    withElevatedRingRoadFixture({ surfaceY: 0, skirtY: -0.4 }, (projectDir) => {
      const result = extractRacingTrackTopologyFromAsset("fixtureCircuit", { projectDir });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const alignment = result.value.modelAlignment;
      expect(alignment.modelBounds.min[1]).toBeCloseTo(-0.4, 3);

      const anchors = alignment.anchorPairs ?? [];
      expect(anchors.length).toBeGreaterThanOrEqual(2);
      for (const anchor of anchors) {
        // The anchor must describe the tarmac, not the skirt 0.4 units below it.
        expect(anchor.modelPoint[1]).toBeCloseTo(0, 3);
        expect(anchor.modelPoint[1]).not.toBeCloseTo(-0.4, 2);
      }
      // The fallback single anchor is surface-sampled too.
      expect(alignment.modelPoint[1]).toBeCloseTo(0, 2);
    });
  });

  it("tracks a raised drivable surface so grounding follows the asset, not a constant", () => {
    // Same shape, but the tarmac is lifted to y = 1.25 with the skirt still near the origin. If the
    // extractor had been "fixed" by subtracting a tuned constant, this case would fail.
    withElevatedRingRoadFixture({ surfaceY: 1.25, skirtY: 0 }, (projectDir) => {
      const result = extractRacingTrackTopologyFromAsset("fixtureCircuit", { projectDir });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const alignment = result.value.modelAlignment;
      expect(alignment.modelBounds.min[1]).toBeCloseTo(0, 3);
      for (const anchor of alignment.anchorPairs ?? []) {
        expect(anchor.modelPoint[1]).toBeCloseTo(1.25, 3);
      }
    });
  });

  it("grounds a vehicle on the sampled surface with no residual sink", () => {
    // End-to-end arithmetic of the actual defect: reproduce the transform the racing binding applies
    // and assert the car's contact plane lands exactly on the tarmac.
    withElevatedRingRoadFixture({ surfaceY: 0, skirtY: -0.4 }, (projectDir) => {
      const result = extractRacingTrackTopologyFromAsset("fixtureCircuit", { projectDir });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const alignment = result.value.modelAlignment;
      const bounds = alignment.modelBounds;
      const trackY = -0.12;
      const targetMaxDimension = 90.413;
      const modelMax = Math.max(
        bounds.max[0] - bounds.min[0],
        bounds.max[1] - bounds.min[1],
        bounds.max[2] - bounds.min[2]
      );
      const fitScale = targetMaxDimension / modelMax;
      const anchorY = (alignment.anchorPairs ?? [])[0]?.modelPoint[1] ?? bounds.min[1];

      // How the racing binding seats the track: node Y + local anchor offset === trackY.
      const localAnchorOffset = (anchorY - bounds.min[1]) * fitScale;
      const trackNodeY = trackY - localAnchorOffset;
      // Where the tarmac actually ends up in scene space.
      const renderedSurfaceY = trackNodeY + (0 - bounds.min[1]) * fitScale;
      // A `scaleMode: "fit"` car is grounded on its node position, so its contact plane is trackY.
      const carContactY = trackY;

      const sink = renderedSurfaceY - carContactY;
      expect(Math.abs(sink)).toBeLessThan(1e-6);

      // Prove the old strategy really did sink the car, so this test cannot silently pass on a
      // regression that reintroduces the bounding-box floor.
      const legacyOffset = (bounds.min[1] - bounds.min[1]) * fitScale;
      const legacyNodeY = trackY - legacyOffset;
      const legacySurfaceY = legacyNodeY + (0 - bounds.min[1]) * fitScale;
      expect(legacySurfaceY - carContactY).toBeGreaterThan(0.1);
    });
  });
});

interface Triangle {
  readonly a: readonly [number, number, number];
  readonly b: readonly [number, number, number];
  readonly c: readonly [number, number, number];
}

/**
 * A flat annulus of drivable tarmac at `surfaceY`, plus an outer skirt dropped to `skirtY`.
 *
 * The skirt is what makes the fixture diagnostic: it belongs to the same road material family, so it
 * lowers `roadBounds.min[1]` without changing where a car should sit. It is placed outside the
 * drivable band so it cannot be mistaken for the racing surface in plan view.
 */
function elevatedRingRoadTriangles(
  options: { readonly surfaceY: number; readonly skirtY: number },
  innerRadius = 8,
  outerRadius = 12,
  segments = 96
): readonly Triangle[] {
  const triangles: Triangle[] = [];
  const ring = (r0: number, r1: number, y0: number, y1: number): void => {
    for (let index = 0; index < segments; index += 1) {
      const a0 = (index / segments) * Math.PI * 2;
      const a1 = ((index + 1) / segments) * Math.PI * 2;
      const p00: readonly [number, number, number] = [Math.cos(a0) * r0, y0, Math.sin(a0) * r0];
      const p01: readonly [number, number, number] = [Math.cos(a1) * r0, y0, Math.sin(a1) * r0];
      const p10: readonly [number, number, number] = [Math.cos(a0) * r1, y1, Math.sin(a0) * r1];
      const p11: readonly [number, number, number] = [Math.cos(a1) * r1, y1, Math.sin(a1) * r1];
      triangles.push({ a: p00, b: p10, c: p11 });
      triangles.push({ a: p00, b: p11, c: p01 });
    }
  };
  // Drivable tarmac band, flat at surfaceY.
  ring(innerRadius, outerRadius, options.surfaceY, options.surfaceY);
  // Outer skirt: steps down to skirtY beyond the drivable band.
  ring(outerRadius, outerRadius + 1.5, options.skirtY, options.skirtY);
  return triangles;
}

function withElevatedRingRoadFixture(
  options: { readonly surfaceY: number; readonly skirtY: number },
  run: (projectDir: string) => void
): void {
  const projectDir = mkdtempSync(join(tmpdir(), "aura3d-racing-anchor-elevation-"));
  const assetDir = join(projectDir, "public", "aura-assets");
  mkdirSync(assetDir, { recursive: true });
  writeFileSync(join(assetDir, "fixtureCircuit.glb"), createRoadGlb(elevatedRingRoadTriangles(options)));
  writeFileSync(join(projectDir, "aura.assets.json"), `${JSON.stringify({
    schema: "aura3d.assets/1.0",
    assets: [{
      id: "fixtureCircuit",
      type: "model",
      format: "glb",
      outputPath: "public/aura-assets/fixtureCircuit.glb",
      hash: "sha256-cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    }]
  }, null, 2)}\n`);
  try {
    run(projectDir);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
}

function createRoadGlb(triangles: readonly Triangle[], materialName = "asphalt"): Buffer {
  const vertices = triangles.flatMap((triangle) => [triangle.a, triangle.b, triangle.c]);
  const positions = Buffer.alloc(vertices.length * 12);
  vertices.forEach((vertex, index) => {
    positions.writeFloatLE(vertex[0], index * 12);
    positions.writeFloatLE(vertex[1], index * 12 + 4);
    positions.writeFloatLE(vertex[2], index * 12 + 8);
  });
  const indices = Buffer.alloc(vertices.length * 4);
  vertices.forEach((_vertex, index) => indices.writeUInt32LE(index, index * 4));
  const binary = Buffer.concat([positions, indices]);
  const xs = vertices.map((vertex) => vertex[0]);
  const ys = vertices.map((vertex) => vertex[1]);
  const zs = vertices.map((vertex) => vertex[2]);
  const json = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: "surface", mesh: 0 }],
    meshes: [{
      name: "surface mesh",
      primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0, mode: 4 }]
    }],
    materials: [{ name: materialName }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: vertices.length,
        type: "VEC3",
        min: [Math.min(...xs), Math.min(...ys), Math.min(...zs)],
        max: [Math.max(...xs), Math.max(...ys), Math.max(...zs)]
      },
      { bufferView: 1, componentType: 5125, count: vertices.length, type: "SCALAR" }
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.length },
      { buffer: 0, byteOffset: positions.length, byteLength: indices.length }
    ],
    buffers: [{ byteLength: binary.length }]
  };
  const jsonChunk = paddedChunk(Buffer.from(JSON.stringify(json)), 0x20);
  const binaryChunk = paddedChunk(binary, 0);
  const output = Buffer.alloc(12 + 8 + jsonChunk.length + 8 + binaryChunk.length);
  output.writeUInt32LE(0x46546c67, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(jsonChunk.length, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  jsonChunk.copy(output, 20);
  const binaryHeader = 20 + jsonChunk.length;
  output.writeUInt32LE(binaryChunk.length, binaryHeader);
  output.writeUInt32LE(0x004e4942, binaryHeader + 4);
  binaryChunk.copy(output, binaryHeader + 8);
  return output;
}

function paddedChunk(chunk: Buffer, padByte: number): Buffer {
  const remainder = chunk.length % 4;
  if (remainder === 0) return chunk;
  return Buffer.concat([chunk, Buffer.alloc(4 - remainder, padByte)]);
}
