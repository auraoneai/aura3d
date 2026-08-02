import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractRacingTrackTopologyFromAsset } from "../../../packages/create-aura3d/src/showcase-spec-game-geometry-extractor";

/**
 * Regression coverage for defect 31.
 *
 * The racing extractor used to place the certified centreline at
 * `averageRoadRadius * 0.68`. For a ring road that lands inside the road's inner
 * edge, so every emitted point sat on the infield rather than the asphalt while
 * all the surrounding metrics still reported a confident pass. These fixtures are
 * built so the correct answer is known analytically.
 */
describe("racing centerline stays on the road surface", () => {
  it("places a ring-road centreline inside the asphalt band, not the infield", () => {
    withRingRoadFixture({ innerRadius: 8, outerRadius: 12 }, (projectDir) => {
      const result = extractRacingTrackTopologyFromAsset("fixtureCircuit", { projectDir });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const radii = result.value.roadCenterline.map((point) => Math.hypot(point.x, point.z));
      // Every point must sit strictly between the inner and outer edges.
      for (const radius of radii) {
        expect(radius).toBeGreaterThan(8);
        expect(radius).toBeLessThan(12);
      }
      // And near the middle of the band, which is the drivable line.
      const mean = radii.reduce((total, radius) => total + radius, 0) / radii.length;
      expect(mean).toBeGreaterThan(9.4);
      expect(mean).toBeLessThan(10.6);
      expect(result.reasons.join(" ")).toContain("centerlineOffRoadRatio:0.0000");
    });
  });

  it("rejects a road whose derived centreline cannot stay on the surface", () => {
    // A road built as four disconnected corner patches has no continuous drivable
    // loop, so no honest centreline exists and the extractor must refuse.
    withPatchFixture((projectDir) => {
      const result = extractRacingTrackTopologyFromAsset("fixtureCircuit", { projectDir });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.blockers.join(" ")).toMatch(/racing-road-centerline/);
    });
  });

  it("recognises numbered driving-surface material variants such as ASPH2", () => {
    // Defect 32: `\b` does not match between a letter and a digit, so `ASPH2` — the name
    // of Tsukuba's largest driving surface — was not treated as road at all.
    for (const materialName of ["ASPH2", "Asphalt_01", "ROAD2", "Track2", "asph"]) {
      withRingRoadFixture({ innerRadius: 8, outerRadius: 12 }, (projectDir) => {
        const result = extractRacingTrackTopologyFromAsset("fixtureCircuit", { projectDir });
        expect(result.ok, `${materialName} should be recognised as a driving surface`).toBe(true);
      }, materialName);
    }
  });

  it("does not treat scenery as a driving surface", () => {
    for (const materialName of ["Grass2", "BarriersTSU", "Warehouse_etc", "Forest", "Mountains"]) {
      withRingRoadFixture({ innerRadius: 8, outerRadius: 12 }, (projectDir) => {
        const result = extractRacingTrackTopologyFromAsset("fixtureCircuit", { projectDir });
        expect(result.ok, `${materialName} must not be treated as road`).toBe(false);
        if (result.ok) return;
        expect(result.blockers.join(" ")).toContain("racing-road-mesh-not-found");
      }, materialName);
    }
  });

  it("traces the circuit loop rather than an attached service apron", () => {
    // A circuit with a large apron slab bolted to one side. The racing line is the ring;
    // the apron is wider, so seeding the seam from the widest road cell (as an earlier
    // version did) traced a loop around the apron instead of the circuit — defect 32.
    const ring = ringRoadTriangles(8, 11, 96);
    const apron: Triangle[] = [];
    {
      const p0: readonly [number, number, number] = [12, 0, -6];
      const p1: readonly [number, number, number] = [26, 0, -6];
      const p2: readonly [number, number, number] = [26, 0, 6];
      const p3: readonly [number, number, number] = [12, 0, 6];
      apron.push({ a: p0, b: p1, c: p2 });
      apron.push({ a: p0, b: p2, c: p3 });
    }
    withRoadFixture([...ring, ...apron], (projectDir) => {
      const result = extractRacingTrackTopologyFromAsset("fixtureCircuit", { projectDir });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // The emitted line must lie in the ring band, not out on the apron.
      const radii = result.value.roadCenterline.map((point) => Math.hypot(point.x, point.z));
      for (const radius of radii) {
        expect(radius).toBeGreaterThan(8);
        expect(radius).toBeLessThan(11);
      }
      const maxX = Math.max(...result.value.roadCenterline.map((point) => point.x));
      expect(maxX, "must not wander onto the apron slab").toBeLessThan(12);
    });
  });

  it("reports the measured off-road ratio and the method used", () => {
    withRingRoadFixture({ innerRadius: 6, outerRadius: 11 }, (projectDir) => {
      const result = extractRacingTrackTopologyFromAsset("fixtureCircuit", { projectDir });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.reasons.join(" ")).toContain("centerlineMethod:");
      expect(result.reasons.join(" ")).toContain("roadTriangles:");
    });
  });
});

interface Triangle {
  readonly a: readonly [number, number, number];
  readonly b: readonly [number, number, number];
  readonly c: readonly [number, number, number];
}

/** A flat annulus of asphalt centred on the origin. */
function ringRoadTriangles(innerRadius: number, outerRadius: number, segments = 96): readonly Triangle[] {
  const triangles: Triangle[] = [];
  for (let index = 0; index < segments; index += 1) {
    const a0 = (index / segments) * Math.PI * 2;
    const a1 = ((index + 1) / segments) * Math.PI * 2;
    const inner0: readonly [number, number, number] = [Math.cos(a0) * innerRadius, 0, Math.sin(a0) * innerRadius];
    const inner1: readonly [number, number, number] = [Math.cos(a1) * innerRadius, 0, Math.sin(a1) * innerRadius];
    const outer0: readonly [number, number, number] = [Math.cos(a0) * outerRadius, 0, Math.sin(a0) * outerRadius];
    const outer1: readonly [number, number, number] = [Math.cos(a1) * outerRadius, 0, Math.sin(a1) * outerRadius];
    triangles.push({ a: inner0, b: outer0, c: outer1 });
    triangles.push({ a: inner0, b: outer1, c: inner1 });
  }
  return triangles;
}

function cornerPatchTriangles(): readonly Triangle[] {
  const triangles: Triangle[] = [];
  for (const [cx, cz] of [[-9, -9], [9, -9], [9, 9], [-9, 9]] as const) {
    const half = 1.5;
    const p0: readonly [number, number, number] = [cx - half, 0, cz - half];
    const p1: readonly [number, number, number] = [cx + half, 0, cz - half];
    const p2: readonly [number, number, number] = [cx + half, 0, cz + half];
    const p3: readonly [number, number, number] = [cx - half, 0, cz + half];
    triangles.push({ a: p0, b: p1, c: p2 });
    triangles.push({ a: p0, b: p2, c: p3 });
  }
  return triangles;
}

function withRingRoadFixture(
  options: { readonly innerRadius: number; readonly outerRadius: number },
  run: (projectDir: string) => void,
  materialName = "asphalt"
): void {
  withRoadFixture(ringRoadTriangles(options.innerRadius, options.outerRadius), run, materialName);
}

function withPatchFixture(run: (projectDir: string) => void): void {
  withRoadFixture(cornerPatchTriangles(), run);
}

function withRoadFixture(
  triangles: readonly Triangle[],
  run: (projectDir: string) => void,
  materialName = "asphalt"
): void {
  const projectDir = mkdtempSync(join(tmpdir(), "aura3d-racing-centerline-"));
  const assetDir = join(projectDir, "public", "aura-assets");
  mkdirSync(assetDir, { recursive: true });
  writeFileSync(join(assetDir, "fixtureCircuit.glb"), createRoadGlb(triangles, materialName));
  writeFileSync(join(projectDir, "aura.assets.json"), `${JSON.stringify({
    schema: "aura3d.assets/1.0",
    assets: [{
      id: "fixtureCircuit",
      type: "model",
      format: "glb",
      outputPath: "public/aura-assets/fixtureCircuit.glb",
      hash: "sha256-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
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
