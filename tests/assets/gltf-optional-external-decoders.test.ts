import { describe, expect, it } from "vitest";
import {
  GLTFLoader,
  LoadContext,
  createDracoDecoder,
  createMeshoptDecoder,
  type GLTFDracoDecoderModule,
  type GLTFMeshoptDecoderModule
} from "../../packages/assets/src";

const khronosRevision = "2bac6f8c57bf471df0d2a1e8a8ec023c7801dddf";
const meshoptCubeTestUrl = `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/${khronosRevision}/Models/MeshoptCubeTest/glTF/MeshoptCubeTest.gltf`;
const duckDracoUrl = `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/${khronosRevision}/Models/Duck/glTF-Draco/Duck.gltf`;
const runNetworkAssetTests = process.env.GALILEO3D_RUN_NETWORK_ASSET_TESTS === "1";

const meshoptimizer = await optionalImport<Record<string, unknown>>("meshoptimizer");
const draco3d = await optionalImport<Record<string, unknown>>("draco3d");

describe("optional external glTF decoder package integration", () => {
  it("keeps network-backed decoder fixture tests opt-in", () => {
    expect(typeof runNetworkAssetTests).toBe("boolean");
    expect(meshoptCubeTestUrl).toContain(khronosRevision);
    expect(duckDracoUrl).toContain(khronosRevision);
  });

  const meshoptIt = meshoptimizer && runNetworkAssetTests ? it : it.skip;
  meshoptIt("loads the Khronos MeshoptCubeTest asset with the real meshoptimizer package", async () => {
    const decoderModule = resolveMeshoptModule(meshoptimizer!);
    const asset = await new GLTFLoader({
      meshoptDecoder: createMeshoptDecoder(decoderModule)
    }).load({ url: meshoptCubeTestUrl }, new LoadContext());

    expect(asset.meshes.length).toBeGreaterThan(0);
    expect(asset.meshes[0]?.positions.length).toBeGreaterThan(0);
  });

  const dracoIt = draco3d && runNetworkAssetTests ? it : it.skip;
  dracoIt("loads the Khronos Duck Draco asset with the real draco3d package", async () => {
    const decoderModule = await resolveDracoModule(draco3d!);
    const asset = await new GLTFLoader({
      dracoDecoder: createDracoDecoder(decoderModule)
    }).load({ url: duckDracoUrl }, new LoadContext());

    expect(asset.meshes.length).toBeGreaterThan(0);
    expect(asset.meshes[0]?.positions.length).toBeGreaterThan(0);
  });
});

async function optionalImport<T>(specifier: string): Promise<T | undefined> {
  try {
    return await import(specifier) as T;
  } catch (error) {
    if (error instanceof Error && /Cannot find package|Cannot find module|ERR_MODULE_NOT_FOUND/.test(error.message)) {
      return undefined;
    }
    throw error;
  }
}

function resolveMeshoptModule(module: Record<string, unknown>): GLTFMeshoptDecoderModule {
  const candidate = isRecord(module.MeshoptDecoder) ? module.MeshoptDecoder : module;
  if (typeof candidate.decodeGltfBuffer !== "function") {
    throw new Error("meshoptimizer package did not expose MeshoptDecoder.decodeGltfBuffer");
  }
  return candidate as unknown as GLTFMeshoptDecoderModule;
}

async function resolveDracoModule(module: Record<string, unknown>): Promise<GLTFDracoDecoderModule> {
  const factory = typeof module.createDecoderModule === "function"
    ? module.createDecoderModule
    : isRecord(module.default) && typeof module.default.createDecoderModule === "function"
      ? module.default.createDecoderModule
      : undefined;

  if (!factory) {
    throw new Error("draco3d package did not expose createDecoderModule");
  }

  return await factory() as GLTFDracoDecoderModule;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
