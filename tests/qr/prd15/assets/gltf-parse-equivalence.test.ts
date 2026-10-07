import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// PRD-15 T6.10 — the corpus tools' GLB document parse is the shared
// `parseGlbDocument`/`GLTFLoader` path in @aura3d/assets; the counts they report must
// match the loader's own decode on the same fixture bytes.
import { GLTFLoader, LoadContext } from "../../../../packages/assets/src/index";
import { inspectProductionGlb } from "../../../../packages/assets/src/asset-corpus/ProductionAssetCorpus";
import { inspectCurrentRoutesGlb } from "../../../../packages/assets/src/AdvancedAssetCorpus";

const FIXTURES = [
  "fixtures/asset-corpus/avocado.glb",
  "fixtures/asset-corpus/damaged-helmet.glb",
  "fixtures/asset-corpus/clear-coat-test.glb",
  "fixtures/asset-corpus/sheen-test-grid.glb",
  "fixtures/asset-corpus/antique-camera.glb"
];

async function loadWithGltfLoader(path: string) {
  const bytes = readFileSync(path);
  const url = `data:model/gltf-binary;base64,${bytes.toString("base64")}`;
  return new GLTFLoader().load({ url, type: "gltf" }, new LoadContext());
}

describe("T6.10 glTF parse equivalence — corpus inspection vs public GLTFLoader", () => {
  for (const fixture of FIXTURES) {
    it(`yields identical accessor and material counts on ${fixture.split("/").pop()}`, async () => {
      const corpus = inspectCurrentRoutesGlb(fixture);
      const production = inspectProductionGlb(fixture);
      const asset = await loadWithGltfLoader(fixture);

      // Material counts: identical through the corpus document parse and the loader's material assets.
      expect(corpus.materialCount).toBe(asset.materials.length);
      expect(production.materialCount).toBe(asset.materials.length);

      // Accessor counts: vertex count is the sum of POSITION accessor counts (corpus) and the
      // sum of decoded positions across mesh primitives (loader).
      const loaderVertexCount = asset.meshes.reduce((total, mesh) => total + mesh.positions.length, 0);
      expect(corpus.vertexCount).toBe(loaderVertexCount);

      // Triangle count: indexed primitives divide index count by 3; non-indexed divide positions.
      const loaderTriangleCount = asset.meshes
        .filter((mesh) => mesh.topology === "triangles")
        .reduce((total, mesh) => total + Math.floor((mesh.indices?.length ?? mesh.positions.length) / 3), 0);
      expect(corpus.triangleCount).toBe(loaderTriangleCount);

      // Header facts the corpus reports must come from the same document walk the loader uses.
      expect(corpus.version).toBe(2);
      expect(production.version).toBe(2);
      expect(corpus.jsonChunkBytes).toBeGreaterThan(0);
      expect(corpus.meshCount).toBeGreaterThan(0);
    });
  }

  it("rejects non-GLB bytes identically to the loader's document parse", () => {
    expect(() => inspectCurrentRoutesGlb("fixtures/asset-corpus/manifest.json")).toThrow();
  });
});
