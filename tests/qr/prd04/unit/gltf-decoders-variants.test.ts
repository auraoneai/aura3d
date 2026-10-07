/**
 * P5-2 decoder plumbing: the pipeline pre-scans `extensionsUsed`, requires the
 * C-16 decoders that match, and fails with `AssetDecoderUnavailable` + a
 * `decoder-missing` warning when a required decoder is disabled. The generated
 * Draco/Meshopt DamagedHelmet corpus files decode to the same mesh as the
 * uncompressed GLB through the injected decoder hooks.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MeshoptDecoder } from "meshoptimizer";
import draco3d from "draco3d";
import {
  GLTFLoader,
  LoadContext,
  createDracoDecoder,
  createMeshoptDecoder
} from "../../../../packages/assets/src";
import {
  loadProductionGLTFRenderPipeline,
  requiredGLTFDecoders,
  scanGLTFExtensionsUsed
} from "../../../../packages/assets/src/asset-corpus/ProductionGLTFRenderPipeline";

const DATA_URL = (file: string) => `data:model/gltf-binary;base64,${readFileSync(file).toString("base64")}`;
const HELMET = "fixtures/asset-corpus/damaged-helmet.glb";
const HELMET_DRACO = "fixtures/asset-corpus/damaged-helmet-draco.glb";
const HELMET_MESHOPT = "fixtures/asset-corpus/damaged-helmet-meshopt.glb";

describe("requiredGLTFDecoders + scanGLTFExtensionsUsed (P5-2)", () => {
  it("maps compression extensions to decoder ids", () => {
    expect(requiredGLTFDecoders([])).toEqual([]);
    expect(requiredGLTFDecoders(["KHR_draco_mesh_compression"])).toEqual(["draco"]);
    expect(requiredGLTFDecoders(["KHR_texture_basisu", "KHR_materials_clearcoat"])).toEqual(["ktx2"]);
    expect(requiredGLTFDecoders(["EXT_meshopt_compression", "KHR_draco_mesh_compression"]).sort()).toEqual(["draco", "meshopt"]);
  });

  it("reads extensionsUsed from a GLB via fetch without running the full loader", async () => {
    expect(await scanGLTFExtensionsUsed(DATA_URL(HELMET_DRACO))).toContain("KHR_draco_mesh_compression");
    expect(await scanGLTFExtensionsUsed(DATA_URL(HELMET_MESHOPT))).toContain("EXT_meshopt_compression");
    expect(await scanGLTFExtensionsUsed(DATA_URL(HELMET))).not.toContain("KHR_draco_mesh_compression");
  });
});

describe("compressed corpus fixtures decode through the loader (P5-2)", () => {
  it("Draco variant decodes to the same mesh cardinality as the uncompressed GLB", async () => {
    const module = await draco3d.createDecoderModule();
    const base = await new GLTFLoader().load({ url: DATA_URL(HELMET), type: "gltf" }, new LoadContext());
    const draco = await new GLTFLoader({ dracoDecoder: createDracoDecoder(module) })
      .load({ url: DATA_URL(HELMET_DRACO), type: "gltf" }, new LoadContext());
    const baseMesh = base.meshes[0]!;
    const dracoMesh = draco.meshes[0]!;
    // Draco deduplicates/reorders vertices on decode, so assert a near-match vertex count
    // plus an approximately equal bounding box rather than bit equality.
    expect(dracoMesh.positions.length).toBeGreaterThan(baseMesh.positions.length * 0.9);
    expect(dracoMesh.positions.length).toBeLessThan(baseMesh.positions.length * 1.1);
    expect(dracoMesh.indices!.length).toBeGreaterThan(0);
    const bounds = (positions: readonly (readonly [number, number, number])[]) => [
      Math.min(...positions.map((p) => p[0])), Math.max(...positions.map((p) => p[0])),
      Math.min(...positions.map((p) => p[1])), Math.max(...positions.map((p) => p[1])),
      Math.min(...positions.map((p) => p[2])), Math.max(...positions.map((p) => p[2]))
    ];
    const drift = bounds(dracoMesh.positions).map((v, i) => Math.abs(v - bounds(baseMesh.positions)[i]!));
    expect(Math.max(...drift)).toBeLessThan(0.05);
  });

  it("Meshopt variant decodes to the same mesh data as the uncompressed GLB", async () => {
    const base = await new GLTFLoader().load({ url: DATA_URL(HELMET), type: "gltf" }, new LoadContext());
    const meshopt = await new GLTFLoader({ meshoptDecoder: createMeshoptDecoder(MeshoptDecoder) })
      .load({ url: DATA_URL(HELMET_MESHOPT), type: "gltf" }, new LoadContext());
    const baseMesh = base.meshes[0]!;
    const meshoptMesh = meshopt.meshes[0]!;
    expect(meshoptMesh.positions.length).toBe(baseMesh.positions.length);
    expect(meshoptMesh.indices!.length).toBe(baseMesh.indices!.length);
    // Meshopt's ATTRIBUTES filter "NONE" is lossless.
    expect(meshoptMesh.positions[0]).toEqual(baseMesh.positions[0]);
    expect(meshoptMesh.normals[0]).toEqual(baseMesh.normals[0]);
  });
});

describe("decoder-missing (P5-2)", () => {
  it("a required decoder opted out throws AssetDecoderUnavailable naming the decoder", async () => {
    await expect(loadProductionGLTFRenderPipeline({
      url: DATA_URL(HELMET_DRACO),
      assetId: "helmet-draco",
      decoders: { draco: false },
      imageDecoder: () => ({ width: 1, height: 1, data: new Uint8Array(4), colorSpace: "srgb" })
    })).rejects.toMatchObject({ name: "AssetDecoderUnavailable", decoderId: "draco" });
  });
});
