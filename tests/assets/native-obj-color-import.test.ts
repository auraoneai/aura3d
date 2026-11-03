import { describe, expect, it } from "vitest";
import { OBJLoader } from "../../packages/assets/src/OBJLoader";
import { LoadContext } from "../../packages/assets/src/LoadContext";
import { createGLTFRenderResources } from "../../packages/assets/src/GLTFRenderResources";
import { exportOBJ } from "../../packages/assets/src/exporters/OBJExporter";
import type { AuraExportScene } from "../../packages/assets/src/exporters/ExportContext";
import type { GLTFMeshAsset } from "../../packages/assets/src/GLTFLoader";

const rgba = (mesh: GLTFMeshAsset): readonly (readonly number[])[] =>
  (mesh.indices ?? []).map((index) => mesh.colors[index]!);

function textOf(data: Blob | Uint8Array): string {
  if (!(data instanceof Uint8Array)) throw new Error("Expected OBJ bytes");
  return new TextDecoder().decode(data);
}

async function loadOBJ(text: string, mtl?: string) {
  const loader = new OBJLoader();
  const url = `data:model/obj,${encodeURIComponent(text)}`;
  const asset = await loader.load({ url, type: "obj", ...(mtl === undefined ? {} : { mtl }) }, new LoadContext());
  return { loader, asset };
}

describe("OBJ RGB vertex-color import", () => {
  it("carries authored and default-white colors through faces, lines, points, and render resources", async () => {
    const source = [
      "v 0 0 0 1 0 0.5",
      "v 2 0 0",
      "v 0 2 0 0 1 0",
      "vt 0 0", "vt 1 0", "vt 0 1", "vn 0 0 1",
      "g shape",
      "f -3/1/1 -2/2/1 -1/3/1",
      "g shape-1",
      "l -1/3 -2/2",
      "g shape",
      "p -3"
    ].join("\n");
    const { loader, asset } = await loadOBJ(source);
    try {
      expect(asset.meshes.map((mesh) => mesh.topology)).toEqual(["triangles", "lines", "points"]);
      expect(asset.meshes.map((mesh) => mesh.name)).toEqual(["shape", "shape-1", "shape-2"]);
      expect(rgba(asset.meshes[0]!)).toEqual([[1, 0, 0.5, 1], [1, 1, 1, 1], [0, 1, 0, 1]]);
      expect(rgba(asset.meshes[1]!)).toEqual([[0, 1, 0, 1], [1, 1, 1, 1]]);
      expect(rgba(asset.meshes[2]!)).toEqual([[1, 0, 0.5, 1]]);
      expect(asset.loaderDiagnostics.features).toContain("obj-vertex-colors");
      expect(asset.loaderDiagnostics.features).toContain("vertex-colors");

      const resources = await createGLTFRenderResources(asset);
      try {
        expect(resources.geometryLibrary.size).toBe(3);
        for (const mesh of asset.meshes) {
          const geometry = resources.geometryLibrary.get(mesh.name);
          expect(geometry).toBeDefined();
          expect(geometry!.topology).toBe(mesh.topology);
          expect(geometry!.vertexBuffer.format.hasAttribute("color")).toBe(true);
          expect(Array.from(geometry!.indexBuffer!.data)).toEqual(mesh.indices);
          for (const index of mesh.indices!) {
            expect(geometry!.vertexBuffer.getAttribute(index, "color")).toEqual(mesh.colors[index]);
          }
        }
      } finally { resources.dispose(); }
    } finally { loader.dispose(asset); }
    expect(asset.disposed).toBe(true);
  });

  it("round-trips actual exported RGB, white defaults, indexed order, and the alpha-loss warning", async () => {
    const scene: AuraExportScene = {
      nodes: [{ mesh: 0 }], roots: [0], meshes: [{ primitives: [
        { attributes: {
          POSITION: { itemSize: 3, values: [0, 0, 0, 1, 0, 0, 0, 1, 0] },
          COLOR_0: { itemSize: 4, values: [1, 0, 0, 0.2, 0, 1, 0, 0.5, 0, 0, 1, 1] }
        }, indices: [2, 0, 1] },
        { mode: "lines", attributes: { POSITION: { itemSize: 3, values: [2, 0, 0, 3, 0, 0] } }, indices: [1, 0] },
        { mode: "points", attributes: {
          POSITION: { itemSize: 3, values: [4, 0, 0] },
          COLOR_0: { itemSize: 3, values: [2, -0.5, 0.25] }
        } }
      ] }] };
    const output = exportOBJ(scene);
    expect(output.data).toBeInstanceOf(Uint8Array);
    expect(output.warnings).toContainEqual(expect.objectContaining({ code: "VERTEX_ALPHA_LOST" }));
    expect(output.warnings).toContainEqual(expect.objectContaining({ code: "VERTEX_COLOR_RANGE" }));
    const mtl = output.dependencies.find((dependency) => dependency.name.endsWith(".mtl"));
    expect(mtl).toBeDefined();
    const { loader, asset } = await loadOBJ(textOf(output.data), textOf(mtl!.data));
    try {
      expect(asset.meshes.map((mesh) => mesh.topology)).toEqual(["triangles", "lines", "points"]);
      expect(rgba(asset.meshes[0]!)).toEqual([[0, 0, 1, 1], [1, 0, 0, 1], [0, 1, 0, 1]]);
      expect(rgba(asset.meshes[1]!)).toEqual([[1, 1, 1, 1], [1, 1, 1, 1]]);
      expect(rgba(asset.meshes[2]!)).toEqual([[2, -0.5, 0.25, 1]]);
    } finally { loader.dispose(asset); }
  });

  it("preserves XYZ and XYZW behavior without inventing a color channel", async () => {
    const { loader, asset } = await loadOBJ("v 0 0 0 2\nv 1 0 0\nv 0 1 0\nv 9 9 9 1 0 0\nf 1 2 3\n");
    try {
      expect(asset.meshes[0]!.positions.slice(0, 3)).toEqual([[0, 0, 0], [1, 0, 0], [0, 1, 0]]);
      expect(asset.meshes[0]!.colors).toEqual([]);
      expect(asset.loaderDiagnostics.features).not.toContain("obj-vertex-colors");
    } finally { loader.dispose(asset); }
  });

  it("diagnoses ambiguous extra components and rejects invalid recognized RGB values", () => {
    const loader = new OBJLoader();
    const suffix = "\nv 1 0 0\nv 0 1 0\nf 1 2 3\n";
    expect(loader.inspect("v 0 0 0 1 0 0 1" + suffix).diagnostics)
      .toContainEqual(expect.stringContaining("vertex color layout with 7 components"));
    expect(loader.inspect("v 0 0 0 1 0" + suffix).diagnostics)
      .toContainEqual(expect.stringContaining("vertex color layout with 5 components"));
    expect(() => loader.inspect("v 0 0 0 NaN 0 1" + suffix)).toThrow(/vertex color.*finite/i);
    expect(() => loader.inspect("v 0 0 0 1e100 0 1" + suffix)).toThrow(/vertex color.*float32/i);
  });
});
