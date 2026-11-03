import { describe, expect, it } from "vitest";
import {
  GLTF_DECODER_REQUIRED_EXTENSION_NAMES,
  GLTF_DIAGNOSTIC_ONLY_EXTENSION_NAMES,
  GLTF_EXTENSION_SUPPORT_MATRIX,
  GLTF_REQUIRED_ACCEPTED_EXTENSION_NAMES,
  GLTF_SUPPORTED_EXTENSION_NAMES,
  GLTF_PARSED_WITH_LIMITS_EXTENSION_NAMES,
  GLTF_RUNTIME_SUPPORTED_EXTENSION_NAMES,
  GLTFLoader,
  HDRLoader,
  LoadContext,
  evaluateGLTFExtensionSupport,
  getGLTFExtensionSupport,
  inspectGLTFAsset,
  type GLTFAsset
} from "../../packages/assets/src";

function extensionSupportOf(asset: GLTFAsset): NonNullable<GLTFAsset["loaderDiagnostics"]["extensionSupport"]> {
  const support = asset.loaderDiagnostics.extensionSupport;
  if (!support) throw new Error("glTF loader did not report extension support diagnostics");
  return support;
}

describe("glTF extension support matrix", () => {
  it("describes the nonstandard instance-color convention without claiming general custom attributes", () => {
    const limits = getGLTFExtensionSupport("EXT_mesh_gpu_instancing").knownLimits;
    expect(limits).toEqual(expect.arrayContaining([
      expect.stringContaining("_COLOR_0"),
      expect.stringContaining("not standardized"),
      expect.stringContaining("other custom")
    ]));
  });

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
      parseSupport: "decoder-required",
      runtimeSupport: "decoder-required",
      renderSupport: "decoder-required",
      requiredAccepted: true
    });
    expect(getGLTFExtensionSupport("KHR_texture_basisu")).toMatchObject({
      parseSupport: "supported",
      runtimeSupport: "decoder-required",
      renderSupport: "decoder-required"
    });
    expect(getGLTFExtensionSupport("EXT_mesh_gpu_instancing")).toMatchObject({
      status: "runtime-supported",
      family: "geometry",
      requiredAccepted: true
    });
    expect(GLTF_RUNTIME_SUPPORTED_EXTENSION_NAMES).toEqual(expect.arrayContaining([
      "KHR_lights_punctual",
      "EXT_mesh_gpu_instancing"
    ]));
    expect(GLTF_DECODER_REQUIRED_EXTENSION_NAMES).toEqual(expect.arrayContaining([
      "KHR_texture_basisu",
      "KHR_draco_mesh_compression"
    ]));
    expect(GLTF_PARSED_WITH_LIMITS_EXTENSION_NAMES).toEqual(expect.arrayContaining([
      "KHR_materials_transmission",
      "KHR_materials_variants",
      "KHR_materials_unlit",
      "KHR_materials_diffuse_roughness",
      "EXT_materials_bump",
      "KHR_animation_pointer"
    ]));
    expect(GLTF_DIAGNOSTIC_ONLY_EXTENSION_NAMES).toEqual([]);
    expect(GLTF_RUNTIME_SUPPORTED_EXTENSION_NAMES).not.toContain("KHR_materials_transmission");
  });

  it("records parse, runtime and render capability separately without promoting parse-only features", () => {
    // 5.0: the draft material extensions are rendered by the PBR paths and
    // accepted when required, but stay "limited" (no reference-image fidelity claim).
    for (const name of ["KHR_materials_diffuse_roughness", "EXT_materials_bump"]) {
      expect(getGLTFExtensionSupport(name)).toMatchObject({
        family: "material",
        status: "parsed-with-limits",
        parseSupport: "supported",
        runtimeSupport: "limited",
        renderSupport: "limited",
        requiredAccepted: true,
        knownLimits: [expect.stringContaining("Draft extension, accepted when required")]
      });
      expect(GLTF_REQUIRED_ACCEPTED_EXTENSION_NAMES).toContain(name);
      expect(GLTF_RUNTIME_SUPPORTED_EXTENSION_NAMES).not.toContain(name);
    }
    expect(getGLTFExtensionSupport("KHR_materials_transmission")).toMatchObject({
      parseSupport: "supported",
      runtimeSupport: "limited",
      renderSupport: "limited"
    });
    expect(getGLTFExtensionSupport("KHR_materials_dispersion")).toMatchObject({
      parseSupport: "supported",
      runtimeSupport: "limited",
      renderSupport: "limited"
    });
    expect(getGLTFExtensionSupport("EXT_vendor_unknown")).toMatchObject({
      status: "unsupported",
      parseSupport: "unsupported",
      runtimeSupport: "unsupported",
      renderSupport: "unsupported",
      requiredAccepted: false
    });
    expect(new Set(GLTF_EXTENSION_SUPPORT_MATRIX.map(({ name }) => name)).size).toBe(GLTF_EXTENSION_SUPPORT_MATRIX.length);
  });

  it("evaluates used and required extension lists without claiming unknown extensions", () => {
    const evaluation = evaluateGLTFExtensionSupport(
      ["KHR_texture_basisu", "KHR_materials_transmission", "KHR_animation_pointer", "EXT_vendor_unknown"],
      ["KHR_draco_mesh_compression", "KHR_animation_pointer", "EXT_vendor_required"]
    );

    expect(evaluation.schemaVersion).toBe("gltf-extension-support");
    expect(evaluation.runtimeSupported.map((entry) => entry.name)).toEqual([]);
    expect(evaluation.decoderRequired.map((entry) => entry.name)).toEqual([
      "KHR_draco_mesh_compression",
      "KHR_texture_basisu"
    ]);
    expect(evaluation.parsedWithLimits.map((entry) => entry.name)).toEqual(["KHR_animation_pointer", "KHR_materials_transmission"]);
    expect(evaluation.diagnosticOnly.map((entry) => entry.name)).toEqual([]);
    expect(evaluation.unsupportedUsed).toEqual(["EXT_vendor_unknown"]);
    expect(evaluation.unsupportedRequired).toEqual(["EXT_vendor_required"]);
    expect(evaluation.notAcceptedUsed).toEqual(["EXT_vendor_unknown"]);
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

    expect(extensionSupportOf(asset).schemaVersion).toBe("gltf-extension-support");
    expect(extensionSupportOf(asset).parsedWithLimits.map((entry) => entry.name)).toEqual(["KHR_animation_pointer", "KHR_materials_transmission"]);
    expect(extensionSupportOf(asset).diagnosticOnly.map((entry) => entry.name)).toEqual([]);
    expect(extensionSupportOf(asset).unsupportedUsed).toEqual(["EXT_vendor_unknown"]);
    expect(asset.loaderDiagnostics.unsupportedExtensions).toEqual(["EXT_vendor_unknown"]);
    expect(asset.toJSON().loaderDiagnostics.extensionSupport).toEqual(asset.loaderDiagnostics.extensionSupport);
  });

  it("accepts required KHR_animation_pointer at the parsed-with-limits tier (subset binds, remainder diagnosed)", async () => {
    const gltf = {
      asset: { version: "2.0" },
      extensionsUsed: ["KHR_animation_pointer"],
      extensionsRequired: ["KHR_animation_pointer"],
      scenes: [{ nodes: [] }],
      scene: 0
    };

    const asset = await new GLTFLoader().load({ url: dataGLTF(gltf), type: "gltf" }, new LoadContext());
    expect(asset.loaderDiagnostics.unsupportedExtensions).toEqual([]);
    expect(extensionSupportOf(asset).parsedWithLimits.map((entry) => entry.name)).toEqual([
      "KHR_animation_pointer"
    ]);
  });

  it("diagnoses unknown optional extensions but rejects unknown required extensions", async () => {
    const document = {
      asset: { version: "2.0" },
      extensionsUsed: ["EXT_vendor_unknown"],
      scenes: [{ nodes: [] }],
      scene: 0
    };
    const loader = new GLTFLoader();
    const optional = await loader.load({ url: dataGLTF(document), type: "gltf" }, new LoadContext());
    expect(optional.loaderDiagnostics.unsupportedExtensions).toEqual(["EXT_vendor_unknown"]);
    await expect(loader.load({
      url: dataGLTF({ ...document, extensionsRequired: ["EXT_vendor_unknown"] }),
      type: "gltf"
    }, new LoadContext())).rejects.toThrow("Unsupported required glTF extensions: EXT_vendor_unknown");
  });

  it("preserves optional draft material factors, texture indices, UV selection and transforms", async () => {
    const asset = await loadMaterials([
      { extensions: { KHR_materials_diffuse_roughness: {}, EXT_materials_bump: {} } },
      { extensions: {
        KHR_materials_diffuse_roughness: {
          diffuseRoughnessFactor: 0.4,
          diffuseRoughnessTexture: { index: 0, texCoord: 1, extensions: {
            KHR_texture_transform: { offset: [0.25, 0.5], scale: [2, 3], rotation: 0.4, texCoord: 2 }
          } }
        },
        EXT_materials_bump: { bumpFactor: 2.5, bumpTexture: { index: 1, texCoord: 1 } }
      } }
    ]);

    // The current diffuse-roughness draft's prose specifies zero; its schema disagrees.
    expect(asset.materials[0]?.diffuseRoughness).toEqual({ factor: 0, texture: undefined });
    expect(asset.materials[0]?.bump).toEqual({ factor: 1, texture: undefined });
    expect(asset.materials[1]?.diffuseRoughness).toEqual({
      factor: 0.4,
      texture: { texture: 0, image: 0, texCoord: 2, transform: { offset: [0.25, 0.5], scale: [2, 3], rotation: 0.4 } }
    });
    expect(asset.materials[1]?.bump).toEqual({ factor: 2.5, texture: { texture: 1, image: 1, texCoord: 1 } });
    expect(asset.toJSON().materials[1]?.diffuseRoughness).toEqual(asset.materials[1]?.diffuseRoughness);
    expect(asset.toJSON().materials[1]?.bump).toEqual(asset.materials[1]?.bump);
    expect(asset.loaderDiagnostics.unsupportedExtensions).toEqual([]);

    const report = inspectGLTFAsset(asset);
    const material = report.materials[1];
    expect(material?.features).toMatchObject({ diffuseRoughness: { factor: 0.4 }, bump: { factor: 2.5 } });
    expect(material?.textures).toEqual([
      { slot: "diffuseRoughness", texture: 0, image: 0, texCoord: 2, transform: { offset: [0.25, 0.5], scale: [2, 3], rotation: 0.4 } },
      { slot: "bump", texture: 1, image: 1, texCoord: 1 }
    ]);
    expect(material?.extensions).toEqual(["KHR_materials_diffuse_roughness", "EXT_materials_bump"]);
    expect(material?.extensionSupport).toEqual([
      expect.objectContaining({ name: "KHR_materials_diffuse_roughness", parseSupport: "supported", runtimeSupport: "limited", renderSupport: "limited" }),
      expect.objectContaining({ name: "EXT_materials_bump", parseSupport: "supported", runtimeSupport: "limited", renderSupport: "limited" })
    ]);
    expect(report.warnings.filter(({ code }) => code === "GLTF_UNSUPPORTED_MATERIAL_EXTENSION")).toHaveLength(0);
    expect(report.warnings.map(({ code }) => code)).not.toEqual(expect.arrayContaining([
      "ASSET_VIEWER_MULTI_UV_RENDER_ACTIVE", "ASSET_VIEWER_MULTI_UV_RENDER_FALLBACK"
    ]));
  });

  it("accepts the draft factors at both permitted boundaries", async () => {
    const asset = await loadMaterials([
      { extensions: {
        KHR_materials_diffuse_roughness: { diffuseRoughnessFactor: 0 },
        EXT_materials_bump: { bumpFactor: 0 }
      } },
      { extensions: {
        KHR_materials_diffuse_roughness: { diffuseRoughnessFactor: 1 },
        EXT_materials_bump: { bumpFactor: 100 }
      } }
    ]);
    expect(asset.materials.map((material) => [material.diffuseRoughness?.factor, material.bump?.factor]))
      .toEqual([[0, 0], [1, 100]]);
  });

  it.each([
    ["KHR_materials_diffuse_roughness", { diffuseRoughnessFactor: 0.6 }, "diffuseRoughness", { factor: 0.6, texture: undefined }],
    ["EXT_materials_bump", { bumpFactor: 3 }, "bump", { factor: 3, texture: undefined }]
  ] as const)(
    "accepts %s when required and keeps its values for the rendering paths",
    async (name, extension, field, expected) => {
      const document = {
        asset: { version: "2.0" }, extensionsUsed: [name], extensionsRequired: [name],
        materials: [{ extensions: { [name]: extension } }], scenes: [{ nodes: [] }], scene: 0
      };
      const asset = await new GLTFLoader().load({ url: dataGLTF(document), type: "gltf" }, new LoadContext());
      expect(asset.materials[0]?.[field]).toEqual(expected);
      expect(asset.loaderDiagnostics.unsupportedExtensions).toEqual([]);
      expect(extensionSupportOf(asset).unsupportedRequired).toEqual([]);
    }
  );

  it.each([
    ["KHR_materials_diffuse_roughness", null],
    ["KHR_materials_diffuse_roughness", []],
    ["KHR_materials_diffuse_roughness", { diffuseRoughnessFactor: -0.01 }],
    ["KHR_materials_diffuse_roughness", { diffuseRoughnessFactor: 1.01 }],
    ["KHR_materials_diffuse_roughness", { diffuseRoughnessFactor: null }],
    ["KHR_materials_diffuse_roughness", { diffuseRoughnessFactor: "0.5" }],
    ["KHR_materials_diffuse_roughness", { diffuseRoughnessTexture: null }],
    ["KHR_materials_diffuse_roughness", { diffuseRoughnessTexture: {} }],
    ["KHR_materials_diffuse_roughness", { diffuseRoughnessTexture: { index: 2 } }],
    ["EXT_materials_bump", null],
    ["EXT_materials_bump", []],
    ["EXT_materials_bump", { bumpFactor: -0.01 }],
    ["EXT_materials_bump", { bumpFactor: 100.01 }],
    ["EXT_materials_bump", { bumpFactor: null }],
    ["EXT_materials_bump", { bumpFactor: "1" }],
    ["EXT_materials_bump", { bumpTexture: null }],
    ["EXT_materials_bump", { bumpTexture: {} }],
    ["EXT_materials_bump", { bumpTexture: { index: 2 } }]
  ])("rejects malformed %s material payload %j", async (name, payload) => {
    await expect(loadMaterials([{ extensions: { [name as string]: payload } }])).rejects.toThrow(String(name));
  });

  it.each(["KHR_materials_diffuse_roughness", "EXT_materials_bump"])(
    "rejects %s combined with incompatible material models",
    async (name) => {
      for (const incompatible of ["KHR_materials_unlit", "KHR_materials_pbrSpecularGlossiness"]) {
        await expect(loadMaterials([{ extensions: { [name]: {}, [incompatible]: {} } }]))
          .rejects.toThrow(`${name} cannot be combined`);
      }
    }
  );

  it("keeps the HDR loader diagnostic honest about decode parity", () => {
    const existingHdr = "fixtures/environment-corpus/hdri/studio_small_08_1k.hdr";
    expect(new HDRLoader().load(existingHdr)).toMatchObject({
      loader: "HDRLoaderThreeCompat",
      status: "loaded"
    });
  });
});

function dataGLTF(gltf: Record<string, unknown>): string {
  return `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;
}

function loadMaterials(materials: readonly Record<string, unknown>[]) {
  const gltf = {
    asset: { version: "2.0" },
    extensionsUsed: ["KHR_materials_diffuse_roughness", "EXT_materials_bump", "KHR_texture_transform"],
    images: [{ uri: "data:image/png;base64,AA==" }, { uri: "data:image/png;base64,AA==" }],
    textures: [{ source: 0 }, { source: 1 }],
    materials,
    scenes: [{ nodes: [] }],
    scene: 0
  };
  return new GLTFLoader().load({ url: dataGLTF(gltf), type: "gltf" }, new LoadContext());
}
