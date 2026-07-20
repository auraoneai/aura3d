import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { probeShowcaseGameGeometry } from "../../../packages/create-aura3d/src/showcase-spec-game-geometry-probe";

interface BoxFixture {
  readonly name: string;
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

describe("showcase game geometry probe", () => {
  it("rejects a same-depth stacked column with precise unresolved-column evidence", () => {
    withPlatformerFixture([
      box("stack-1", 0, 0, 0),
      box("stack-2", 0, 12, 0),
      box("stack-3", 0, 24, 0),
      box("stack-4", 0, 36, 0),
      box("stack-5", 0, 48, 0)
    ], (projectDir) => {
      const result = probeShowcaseGameGeometry("fixtureWorld", "platformer", { projectDir });

      expect(result.extraction.ok).toBe(false);
      if (result.extraction.ok) return;
      expect(result.extraction.blockers).toEqual(expect.arrayContaining([
        expect.stringMatching(/^asset-extraction:platformer-column-unresolved:fixtureWorld:/)
      ]));
    });
  });

  it("certifies a five-surface traversable chain with mesh-bound anchors", () => {
    withPlatformerFixture(traversableChain(0), (projectDir) => {
      const result = probeShowcaseGameGeometry("fixtureWorld", "platformer", { projectDir });

      expect(result.extraction.ok).toBe(true);
      if (!result.extraction.ok) return;
      const playable = result.extraction.value.surfaces.filter((surface) =>
        surface.kind === "ground" || surface.kind === "platform" || surface.kind === "moving"
      );
      expect(playable).toHaveLength(5);
      expect(result.extraction.value.levelLength).toBeGreaterThanOrEqual(12);
      expect(result.extraction.value.modelAlignment.anchorPairs).toHaveLength(3);
      expect(result.extraction.reasons).toEqual(expect.arrayContaining([
        expect.stringContaining("selected traversable component with 5 mesh surface(s)")
      ]));
    });
  });

  it("excludes a decorative depth layer while retaining the playable chain", () => {
    withPlatformerFixture([
      ...genericTraversableChain(0),
      box("Box-101", 20, 0, 100),
      box("Box-102", 20, 12, 100),
      box("Box-103", 20, 24, 100)
    ], (projectDir) => {
      const result = probeShowcaseGameGeometry("fixtureWorld", "platformer", { projectDir });

      expect(result.extraction.ok).toBe(true);
      if (!result.extraction.ok) return;
      expect(result.extraction.reasons).toEqual(expect.arrayContaining([
        expect.stringMatching(/excluded depth family .*3 primitive/)
      ]));
      expect(result.extraction.value.surfaces.filter((surface) =>
        surface.kind === "ground" || surface.kind === "platform" || surface.kind === "moving"
      )).toHaveLength(5);
    });
  });

  it("keeps semantic names as soft hints when geometry forms a valid chain", () => {
    withPlatformerFixture([0, 20, 40, 60, 80].map((x, index) =>
      box(`wall-decor-${index + 1}`, x, index % 2 === 0 ? 0 : 3, 0)
    ), (projectDir) => {
      const result = probeShowcaseGameGeometry("fixtureWorld", "platformer", { projectDir });

      expect(result.extraction.ok).toBe(true);
      if (!result.extraction.ok) return;
      expect(result.extraction.reasons).toEqual(expect.arrayContaining([
        expect.stringContaining("semantic hint(s) remained soft ranking signals")
      ]));
    });
  });

  it("derives walkable width from character manifest bounds and certified scale", () => {
    withPlatformerFixture(traversableChain(0), (projectDir) => {
      const result = probeShowcaseGameGeometry("fixtureWorld", "platformer", {
        projectDir,
        characterAssetId: "fixtureWideHero",
        characterScaleRatio: 0.42
      });

      expect(result.extraction.ok).toBe(false);
      if (result.extraction.ok) return;
      expect(result.extraction.blockers).toContain("asset-extraction:platformer-no-walkable-width-surfaces:fixtureWorld");
      expect(result.extraction.reasons).toEqual(expect.arrayContaining([
        expect.stringMatching(/narrower than the 4\.2 game-unit character footprint/)
      ]));
    });
  });

  it("certifies the real side-scroller world without the former blanket ambiguity blocker", () => {
    const result = probeShowcaseGameGeometry("showcaseSideScrollerWorld", "platformer", {
      projectDir: process.cwd()
    });

    expect(result.extraction.ok).toBe(true);
    if (!result.extraction.ok) return;
    expect(result.extraction.value.source).toBe("asset-mesh-extracted");
    expect(result.extraction.value.levelLength).toBeGreaterThanOrEqual(12);
    expect(result.extraction.value.surfaces.filter((surface) =>
      surface.kind === "ground" || surface.kind === "platform" || surface.kind === "moving"
    )).toHaveLength(5);
    expect(result.extraction.reasons).toEqual(expect.arrayContaining([
      expect.stringContaining("selected depth-coherent family"),
      expect.stringContaining("selected traversable component")
    ]));
  });

  it("preserves mesh-derived Tsukuba racing extraction", () => {
    const result = probeShowcaseGameGeometry("showcaseTsukubaCircuit", "racing", {
      projectDir: process.cwd()
    });

    expect(result.extraction.ok).toBe(true);
    if (!result.extraction.ok) return;
    expect(result.extraction.value.source).toBe("asset-mesh-extracted");
    expect(result.extraction.value.roadCenterline).toHaveLength(19);
    expect(result.extraction.value.checkpoints).toHaveLength(6);
    expect(result.extraction.value.lapLengthMeters).toBeGreaterThan(0);
    expect(result.extraction.value.estimatedLapSeconds).toBeGreaterThanOrEqual(30);
    expect(result.extraction.value.estimatedLapSeconds).toBeLessThanOrEqual(75);
    expect((result.extraction.value.lapLengthMeters ?? 0) / result.extraction.value.estimatedLapSeconds).toBeGreaterThanOrEqual(0.6);
  });
});

function traversableChain(z: number): readonly BoxFixture[] {
  return [0, 20, 40, 60, 80].map((x, index) =>
    box(`platform-${index + 1}`, x, index % 2 === 0 ? 0 : 3, z)
  );
}

function genericTraversableChain(z: number): readonly BoxFixture[] {
  return [0, 20, 40, 60, 80].map((x, index) =>
    box(`Box-${index + 1}`, x, index % 2 === 0 ? 0 : 3, z)
  );
}

function box(name: string, x: number, y: number, z: number): BoxFixture {
  return {
    name,
    min: [x, y, z],
    max: [x + 10, y + 1, z + 10]
  };
}

function withPlatformerFixture(
  boxes: readonly BoxFixture[],
  run: (projectDir: string) => void
): void {
  const projectDir = mkdtempSync(join(tmpdir(), "aura3d-game-geometry-probe-"));
  const assetDir = join(projectDir, "public", "aura-assets");
  mkdirSync(assetDir, { recursive: true });
  writeFileSync(join(assetDir, "fixtureWorld.glb"), createBoxGlb(boxes));
  writeFileSync(join(projectDir, "aura.assets.json"), `${JSON.stringify({
    schema: "aura3d.assets/1.0",
    assets: [
      {
        id: "fixtureWorld",
        type: "model",
        format: "glb",
        outputPath: "public/aura-assets/fixtureWorld.glb",
        hash: "sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      },
      {
        id: "fixtureWideHero",
        type: "model",
        format: "glb",
        bounds: [100, 10, 10],
        boundsMetadata: { size: [100, 10, 10] }
      }
    ]
  }, null, 2)}\n`);
  try {
    run(projectDir);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
}

function createBoxGlb(boxes: readonly BoxFixture[]): Buffer {
  const binaryParts: Buffer[] = [];
  const bufferViews: { buffer: number; byteOffset: number; byteLength: number }[] = [];
  const accessors: { bufferView: number; componentType: number; count: number; type: string; min: readonly number[]; max: readonly number[] }[] = [];
  let byteOffset = 0;
  for (const fixture of boxes) {
    const vertices = boxVertices(fixture);
    const bytes = Buffer.alloc(vertices.length * 12);
    vertices.forEach((vertex, index) => {
      bytes.writeFloatLE(vertex[0], index * 12);
      bytes.writeFloatLE(vertex[1], index * 12 + 4);
      bytes.writeFloatLE(vertex[2], index * 12 + 8);
    });
    binaryParts.push(bytes);
    bufferViews.push({ buffer: 0, byteOffset, byteLength: bytes.length });
    accessors.push({
      bufferView: bufferViews.length - 1,
      componentType: 5126,
      count: vertices.length,
      type: "VEC3",
      min: fixture.min,
      max: fixture.max
    });
    byteOffset += bytes.length;
  }
  const binary = Buffer.concat(binaryParts);
  const json = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: boxes.map((_fixture, index) => index) }],
    nodes: boxes.map((fixture, index) => ({ name: fixture.name, mesh: index })),
    meshes: boxes.map((fixture, index) => ({
      name: fixture.name,
      primitives: [{ attributes: { POSITION: index } }]
    })),
    accessors,
    bufferViews,
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

function boxVertices(fixture: BoxFixture): readonly (readonly [number, number, number])[] {
  const [minX, minY, minZ] = fixture.min;
  const [maxX, maxY, maxZ] = fixture.max;
  return [
    [minX, minY, minZ], [maxX, minY, minZ], [minX, maxY, minZ], [maxX, maxY, minZ],
    [minX, minY, maxZ], [maxX, minY, maxZ], [minX, maxY, maxZ], [maxX, maxY, maxZ]
  ];
}

function paddedChunk(bytes: Buffer, fill: number): Buffer {
  const length = Math.ceil(bytes.length / 4) * 4;
  const padded = Buffer.alloc(length, fill);
  bytes.copy(padded);
  return padded;
}
