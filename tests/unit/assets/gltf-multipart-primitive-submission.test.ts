import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GLTFLoader } from "../../../packages/assets/src/GLTFLoader";

/**
 * Every scene-reachable mesh node must produce a submitted primitive.
 *
 * ## Why this fixture exists, and why the test was missing
 *
 * `tests/fixtures/gltf-multipart/body-and-four-wheels.glb` was built to reproduce a suspected
 * "renderer drops secondary glTF mesh primitives" defect on `turboRaceCar`. That diagnosis turned out to be
 * **wrong** — the renderer drew all five primitives (`drawCalls: 10` for 5 primitives x 2 passes) and the wheels
 * were invisible because the probe camera was dead-on and the car was sunk below the tarmac.
 *
 * Because the renderer was exonerated, the fixture was never wired to a test. That left the brief's renderer test
 * list unproven: nothing asserted that all scene-reachable nodes produce primitives, that child-node transforms
 * are applied, that nonzero accessor byteOffsets work, or that primitive submission count matches expectation. A
 * capability believed-correct with no test is exactly how the next regression goes unnoticed — and it is the same
 * "capability exists, nothing exercises it" pattern found twice already in this work.
 *
 * The fixture isolates every confound the real asset had:
 *   - 5 primitives across 5 meshes (one body, four wheels)
 *   - wheels on a **distinct material** from the body, so pixels are attributable
 *   - child-node transforms two levels deep (`root > chassis > body`, `root > wheels > wheelX`)
 *   - shared bufferViews with **differing accessor byteOffsets**
 *   - **uint32 indices** over only 8 vertices, which exposes an index down-cast bug
 *   - wheels protruding past the body silhouette, so visibility is provable from geometry
 */

const FIXTURE = "tests/fixtures/gltf-multipart/body-and-four-wheels.glb";

/** Expected mesh names, in declaration order. */
const EXPECTED_PARTS = ["body", "wheelFrontL", "wheelFrontR", "wheelBackL", "wheelBackR"] as const;

/**
 * Load the fixture through the real loader.
 *
 * A base64 `data:` URL is used rather than a filesystem read so the loader's own GLB container parsing runs --
 * the same path a route takes. Reading the buffer directly would skip exactly the code under test.
 */
async function loadFixture() {
  const base64 = readFileSync(FIXTURE).toString("base64");
  const url = `data:model/gltf-binary;base64,${base64}`;
  return new GLTFLoader().load({ url }, { throwIfAborted: () => undefined } as never);
}

describe("multi-part glTF: every scene-reachable node produces a primitive", () => {
  it("has the fixture on disk", () => {
    // A regression test whose fixture silently vanished would pass by doing nothing.
    expect(existsSync(FIXTURE), `${FIXTURE} must exist; regenerate with tools/asset-geometry-audit/make-multipart-fixture.mjs`).toBe(true);
  });

  it("parses exactly five mesh primitives, one per part", async () => {
    const asset = await loadFixture();
    expect(asset.meshes).toHaveLength(EXPECTED_PARTS.length);
    for (const part of EXPECTED_PARTS) {
      expect(
        asset.meshes.some((mesh) => mesh.name.includes(part)),
        `no primitive parsed for part "${part}"`
      ).toBe(true);
    }
  });

  it("reaches all five parts through the scene graph, not just the mesh list", async () => {
    /*
     * The distinction matters: a mesh present in `asset.meshes` but unreachable from the active scene would never
     * be drawn. This walks the scene the loader builds and counts renderables.
     */
    const asset = await loadFixture();
    const scene = asset.createScene();
    const renderables = scene.collectRenderables();
    expect(renderables).toHaveLength(EXPECTED_PARTS.length);
    const reachableGeometry = new Set(renderables.map(({ renderable }) => renderable.geometry));
    expect(reachableGeometry.size).toBe(EXPECTED_PARTS.length);
  });

  it("submits four wheels on a material distinct from the body", async () => {
    // A shared material would make rendered pixels unattributable, which is why the fixture separates them.
    const asset = await loadFixture();
    const scene = asset.createScene();
    const materialsByPart = new Map<string, string>();
    for (const { node, renderable } of scene.collectRenderables()) {
      materialsByPart.set(node.name, renderable.material);
    }
    const bodyEntry = [...materialsByPart.entries()].find(([name]) => name.includes("body"));
    const wheelEntries = [...materialsByPart.entries()].filter(([name]) => name.includes("wheel"));
    expect(wheelEntries).toHaveLength(4);
    const wheelMaterials = new Set(wheelEntries.map(([, material]) => material));
    // All four wheels share one material...
    expect(wheelMaterials.size).toBe(1);
    // ...and it is not the body's.
    expect([...wheelMaterials][0]).not.toBe(bodyEntry?.[1]);
  });

  it("applies child-node transforms two levels deep", async () => {
    /*
     * The real asset nested wheels as `Sketchfab_model > ... > wheels > wheelBackL`. If parent transforms were
     * dropped, every part would collapse onto the origin and the four wheels would occupy one position. Distinct
     * world positions prove composition happened.
     */
    const asset = await loadFixture();
    const scene = asset.createScene();
    scene.updateWorldTransforms();
    const positions = scene.collectRenderables().map(({ node }) => {
      const matrix = node.transform.worldMatrix;
      return `${round(matrix[12])},${round(matrix[13])},${round(matrix[14])}`;
    });
    // Five parts at five distinct world positions.
    expect(new Set(positions).size).toBe(EXPECTED_PARTS.length);
  });

  it("reads each part's own vertices from a shared bufferView at differing accessor byteOffsets", async () => {
    /*
     * All five parts' positions live in ONE bufferView at byteOffsets 0, 96, 192, 288, 384.
     *
     * The four wheels are *deliberately identical* in local space -- their placement lives in node translations,
     * not in vertices -- so comparing wheel centres to each other proves nothing. What the offsets must prove is
     * that a wheel accessor does not read the **body's** bytes: the body box is 1.8 x 0.9 x 4.0 while a wheel is
     * 0.5 x 0.7 x 0.7. An ignored byteOffset would give every part the body's extents, so distinct body-vs-wheel
     * extents is the real signal.
     */
    const asset = await loadFixture();
    const extentOf = (name: string) => {
      const mesh = asset.meshes.find((entry) => entry.name.includes(name));
      if (!mesh) throw new Error(`mesh ${name} missing`);
      const axis = (index: number) => mesh.positions.map((vertex) => vertex[index] ?? 0);
      return [0, 1, 2].map((index) => round(Math.max(...axis(index)) - Math.min(...axis(index))));
    };

    const body = extentOf("body");
    expect(body).toEqual([1.8, 0.9, 4]);
    for (const wheel of ["wheelFrontL", "wheelFrontR", "wheelBackL", "wheelBackR"]) {
      const extent = extentOf(wheel);
      expect(extent, `${wheel} must read its own vertices, not the body's`).toEqual([0.5, 0.7, 0.7]);
      expect(extent).not.toEqual(body);
    }
  });

  it("handles uint32 indices over a low vertex count without dropping triangles", async () => {
    /*
     * The fixture declares componentType 5125 (uint32) over 8 vertices. A loader that keys index handling off the
     * *resulting* array type rather than the declared accessor can take a different code path for small meshes --
     * which was the last surviving hypothesis for the false renderer diagnosis. Twelve triangles per box must
     * survive.
     */
    const asset = await loadFixture();
    for (const mesh of asset.meshes) {
      expect(mesh.indices, `${mesh.name} must carry indices`).toBeTruthy();
      expect(mesh.indices!.length, `${mesh.name} index count`).toBe(36);
      const maxIndex = Math.max(...Array.from(mesh.indices!));
      // `positions.length` is the vertex count (tuples), so indices must stay below it directly.
      expect(maxIndex, `${mesh.name} indices must stay in range`).toBeLessThan(mesh.positions.length);
      expect(mesh.positions.length, `${mesh.name} vertex count`).toBe(8);
    }
  });

  it("places wheels outside the body silhouette so visibility is geometrically provable", async () => {
    /*
     * Not a renderer property, but the reason this fixture can prove anything visually: if the wheels sat inside
     * the body's width, no camera could show them and a "wheels visible" claim would be unprovable regardless of
     * how many primitives were submitted. That is precisely the trap `turboHeroCar` fell into.
     */
    const asset = await loadFixture();
    const scene = asset.createScene();
    scene.updateWorldTransforms();
    let bodyHalfWidth = 0;
    let wheelHalfWidth = 0;
    for (const { node, renderable } of scene.collectRenderables()) {
      const mesh = asset.meshes.find((entry) => entry.name === renderable.geometry);
      if (!mesh) continue;
      const offsetX = node.transform.worldMatrix[12] ?? 0;
      let localMax = 0;
      for (const vertex of mesh.positions) {
        localMax = Math.max(localMax, Math.abs((vertex[0] ?? 0) + offsetX));
      }
      if (node.name.includes("wheel")) wheelHalfWidth = Math.max(wheelHalfWidth, localMax);
      else bodyHalfWidth = Math.max(bodyHalfWidth, localMax);
    }
    expect(wheelHalfWidth).toBeGreaterThan(bodyHalfWidth);
  });
});

function round(value: number | undefined): number {
  return Math.round((value ?? 0) * 1000) / 1000;
}
