import { describe, expect, it } from "vitest";
import {
  EXRLoader,
  GLTF_DECODER_REQUIRED_EXTENSION_NAMES,
  GLTF_DIAGNOSTIC_ONLY_EXTENSION_NAMES,
  GLTF_SUPPORTED_EXTENSION_NAMES,
  GLTF_PARSED_WITH_LIMITS_EXTENSION_NAMES,
  GLTF_RUNTIME_SUPPORTED_EXTENSION_NAMES,
  GLTFLoader,
  HDRLoader,
  LoadContext,
  evaluateGLTFExtensionSupport,
  getGLTFExtensionSupport
} from "../../packages/assets/src";

describe("glTF extension support matrix", () => {
  it("exposes compression and instancing support through public package metadata", () => {
    expect(GLTF_SUPPORTED_EXTENSION_NAMES).toEqual(expect.arrayContaining([
      "KHR_draco_mesh_compression",
      "EXT_meshopt_compression",
      "KHR_meshopt_compression",
      "KHR_texture_basisu",
      "EXT_mesh_gpu_instancing"
    ]));
    expect(getGLTFExtensionSupport("KHR_draco_mesh_compression")).toMatchObject({
      status: "decoder-required",
      decoder: "draco",
      requiredAccepted: true
    });
    expect(getGLTFExtensionSupport("EXT_mesh_gpu_instancing")).toMatchObject({
      status: "runtime-supported",
      family: "geometry",
      requiredAccepted: true
    });
    expect(GLTF_RUNTIME_SUPPORTED_EXTENSION_NAMES).toEqual(expect.arrayContaining([
      "KHR_lights_punctual",
      "KHR_materials_unlit"
    ]));
    expect(GLTF_DECODER_REQUIRED_EXTENSION_NAMES).toEqual(expect.arrayContaining([
      "KHR_texture_basisu",
      "KHR_draco_mesh_compression"
    ]));
    expect(GLTF_PARSED_WITH_LIMITS_EXTENSION_NAMES).toEqual(expect.arrayContaining([
      "KHR_materials_transmission",
      "KHR_materials_variants"
    ]));
    expect(GLTF_DIAGNOSTIC_ONLY_EXTENSION_NAMES).toEqual(["KHR_animation_pointer"]);
    expect(GLTF_RUNTIME_SUPPORTED_EXTENSION_NAMES).not.toContain("KHR_materials_transmission");
  });

  it("evaluates used and required extension lists without claiming unknown extensions", () => {
    const evaluation = evaluateGLTFExtensionSupport(
      ["KHR_texture_basisu", "KHR_materials_transmission", "KHR_animation_pointer", "EXT_vendor_unknown"],
      ["KHR_draco_mesh_compression", "KHR_animation_pointer", "EXT_vendor_required"]
    );

    expect(evaluation.schemaVersion).toBe("gltf-extension-support-v1");
    expect(evaluation.runtimeSupported.map((entry) => entry.name)).toEqual([]);
    expect(evaluation.decoderRequired.map((entry) => entry.name)).toEqual([
      "KHR_draco_mesh_compression",
      "KHR_texture_basisu"
    ]);
    expect(evaluation.parsedWithLimits.map((entry) => entry.name)).toEqual(["KHR_materials_transmission"]);
    expect(evaluation.diagnosticOnly.map((entry) => entry.name)).toEqual(["KHR_animation_pointer"]);
    expect(evaluation.unsupportedUsed).toEqual(["EXT_vendor_unknown"]);
    expect(evaluation.unsupportedRequired).toEqual(["EXT_vendor_required", "KHR_animation_pointer"]);
    expect(evaluation.notAcceptedUsed).toEqual(["EXT_vendor_unknown", "KHR_animation_pointer"]);
  });

  it("carries extension support buckets through GLTFLoader diagnostics and inspection-safe JSON", async () => {
    const gltf = {
      asset: { version: "2.0" },
      extensionsUsed: ["KHR_materials_transmission", "KHR_animation_pointer", "EXT_vendor_unknown"],
      materials: [{
        name: "bounded-glass",
        extensions: { KHR_materials_transmission: { transmissionFactor: 0.6 } },
        pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] }
      }],
      scenes: [{ nodes: [] }],
      scene: 0
    };

    const asset = await new GLTFLoader().load({ url: dataGLTF(gltf), type: "gltf" }, new LoadContext());

    expect(asset.loaderDiagnostics.extensionSupport.schemaVersion).toBe("gltf-extension-support-v1");
    expect(asset.loaderDiagnostics.extensionSupport.parsedWithLimits.map((entry) => entry.name)).toEqual(["KHR_materials_transmission"]);
    expect(asset.loaderDiagnostics.extensionSupport.diagnosticOnly.map((entry) => entry.name)).toEqual(["KHR_animation_pointer"]);
    expect(asset.loaderDiagnostics.extensionSupport.unsupportedUsed).toEqual(["EXT_vendor_unknown"]);
    expect(asset.loaderDiagnostics.unsupportedExtensions).toEqual(["EXT_vendor_unknown", "KHR_animation_pointer"]);
    expect(asset.toJSON().loaderDiagnostics.extensionSupport).toEqual(asset.loaderDiagnostics.extensionSupport);
  });

  it("rejects required diagnostic-only extensions instead of treating them as full support", async () => {
    const gltf = {
      asset: { version: "2.0" },
      extensionsUsed: ["KHR_animation_pointer"],
      extensionsRequired: ["KHR_animation_pointer"],
      scenes: [{ nodes: [] }],
      scene: 0
    };

    await expect(new GLTFLoader().load({ url: dataGLTF(gltf), type: "gltf" }, new LoadContext()))
      .rejects.toThrow(/Unsupported required glTF extensions: KHR_animation_pointer/);
  });

  it("keeps HDR and EXR loader diagnostics honest about decode parity", () => {
    const existingHdr = "fixtures/three-compat/environments/hdri/studio_small_08_1k.hdr";
    expect(new HDRLoader().load(existingHdr)).toMatchObject({
      loader: "HDRLoaderV5",
      status: "loaded"
    });
    expect(new EXRLoader().load(existingHdr)).toMatchObject({
      loader: "EXRLoaderV5",
      status: "diagnostic-only",
      warnings: [expect.stringContaining("diagnostic-only")]
    });
    expect(new EXRLoader().load("fixtures/three-compat/environments/hdri/missing.exr")).toMatchObject({
      status: "missing",
      bytes: 0
    });
  });
});

function dataGLTF(gltf: Record<string, unknown>): string {
  return `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;
}
