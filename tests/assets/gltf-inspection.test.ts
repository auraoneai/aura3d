import { describe, expect, it } from "vitest";
import {
  DEFAULT_GLTF_HDR_STUDIO_PREVIEW_POSTPROCESS,
  DEFAULT_GLTF_RENDER_ENVIRONMENT_LIGHTING,
  DEFAULT_GLTF_STUDIO_PREVIEW_FRAME,
  DEFAULT_GLTF_STUDIO_PREVIEW_ENVIRONMENT_LIGHTING,
  DEFAULT_GLTF_STUDIO_PREVIEW_POSTPROCESS,
  GLTFLoader,
  createGLTFRenderResourceDiagnostics,
  createGLTFRenderSource,
  createGLTFRenderResources,
  createGLTFSceneAnimationRuntime,
  createDefaultGLTFHdrStudioPreviewEnvironmentLighting,
  inspectGLTFAsset,
  LoadContext,
  type DecodedGLTFImage
} from "../../packages/assets/src";
import {
  DEFAULT_PBR_SHADER_NAME,
  DEFAULT_SKINNED_LIT_SHADER_NAME,
  DEFAULT_TEXTURED_PBR_CLEARCOAT_SPECULAR_TEXTURES_VARIANT,
  DEFAULT_TEXTURED_PBR_SHADER_NAME,
  Geometry,
  MockRenderDevice,
  Renderer,
  UnlitMaterial
} from "../../packages/rendering/src";

describe("glTF asset inspection", () => {
  it("reports meshes, material texture slots, runtime texture dimensions, and bounded render warnings", async () => {
    const asset = await new GLTFLoader().load(
      { url: createTexturedMorphAnimationGltfUrl(), type: "gltf" },
      new LoadContext()
    );
    const resources = await createGLTFRenderResources(asset, {
      imageDecoder: async (): Promise<DecodedGLTFImage> => ({
        width: 2,
        height: 1,
        colorSpace: "srgb",
        data: new Uint8Array([
          255, 0, 0, 255,
          0, 0, 255, 255
        ])
      })
    });

    try {
      const report = inspectGLTFAsset(asset, resources);

      expect(report.sceneHierarchy.some((node) => node.hasRenderable)).toBe(true);
      expect(report.meshes).toEqual([
        expect.objectContaining({
          name: "inspection-mesh",
          vertexCount: 3,
          indexCount: 3,
          topology: "triangles",
          morphTargetCount: 1
        })
      ]);
      expect(report.materials[0]).toMatchObject({
        name: "inspection-material",
        alphaMode: "BLEND",
        doubleSided: true,
        textures: [expect.objectContaining({ slot: "baseColor", texture: 0, image: 0, texCoord: 0 })]
      });
      expect(report.textures[0]).toMatchObject({
        name: "inspection-texture",
        imageName: "inspection-image",
        runtime: {
          width: 2,
          height: 1,
          format: "rgba8",
          colorSpace: "srgb",
          mipLevels: 1
        }
      });
      expect(report.renderResources).toMatchObject({
        drawItems: 1,
        texturedDrawItems: 1,
        baseColorTextureDrawItems: 1,
        colorBearingTextureDrawItems: 1,
        surfaceDetailTextureDrawItems: 0,
        effectiveTextureBackedDrawItems: 1,
        fallbackWhiteDrawItems: 0,
        missingGeometryDrawItems: 0,
        missingMaterialDrawItems: 0,
        textureBackedMaterialNames: ["inspection-material"]
      });
      expect(report.renderResources.textureContributionDiagnostics).toEqual([
        expect.objectContaining({ contribution: "color-bearing", slot: "baseColor", drawItems: 1 })
      ]);
      expect(report.renderResources.suppressedTextureSlotDiagnostics).toEqual([]);
      expect(report.animations[0]).toMatchObject({
        name: "inspection-animation",
        duration: 1,
        trackCount: 1
      });
      expect(report.morphTargets[0]).toMatchObject({
        mesh: "inspection-mesh",
        weights: [0.25],
        targets: [expect.objectContaining({ index: 0, positions: 3 })]
      });
      expect(report.warnings.map((warning) => warning.code)).toEqual(expect.arrayContaining([
        "ASSET_VIEWER_ROOT_MOTION_ACTIVE",
        "ASSET_VIEWER_MORPH_PLAYBACK_BOUNDED"
      ]));
      expect(resources.materialLibrary.get("inspection-material")?.shaderKey).toBe(DEFAULT_TEXTURED_PBR_SHADER_NAME);
      expect(resources.renderableBindings).toEqual([
        expect.objectContaining({
          nodeName: "inspection-node",
          geometryKey: "inspection-mesh",
          materialKey: "inspection-material",
          sourceMaterialName: "inspection-material",
          sourceMaterialIndex: 0,
          sourceMeshIndex: 0,
          primitiveIndex: 0,
          skinned: false,
          instanced: false
        })
      ]);
      const materialTargets = resources.collectMaterialOverrideTargets({ sourceMaterialName: "inspection-material" });
      expect(materialTargets).toHaveLength(1);
      expect(materialTargets[0]).toMatchObject({
        nodeName: "inspection-node",
        materialKey: "inspection-material",
        sourceMaterialName: "inspection-material"
      });
      expect(materialTargets[0]?.material).toBe(resources.materialLibrary.get("inspection-material"));
      expect(createGLTFRenderResourceDiagnostics(resources).textureSlotDiagnostics).toEqual([{
        slot: "baseColor",
        drawItems: 1,
        materialNames: ["inspection-material"],
        labels: ["inspection-node:inspection-mesh"]
      }]);

      const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
      try {
        const source = resources.toRenderSource({ postprocess: true, cameraPosition: [0, 0, 5], frustumCulling: false });
        const standaloneSource = createGLTFRenderSource(resources, { postprocess: { fxaa: true }, cameraPosition: [0, 0, 5] });
        const unlitSource = resources.toRenderSource({ environmentLighting: false });
        const defaultSource = resources.toRenderSource({ qualityPreset: "default" });
        const secondPreviewSource = resources.toRenderSource();
        const studioSource = resources.toRenderSource({ qualityPreset: "studio-preview" });
        const tightPreviewSource = resources.toRenderSource({
          cameraPolicy: "auto-frame",
          cameraFrameOptions: { minDistance: 0.25, paddingRatio: 0.02 }
        });
        const overlayGeometry = Geometry.litCube(0.2);
        const composedSource = resources.toRenderSource({
          cameraPosition: [0, 0, 5],
          frustumCulling: false,
          renderItems: [{
            geometry: overlayGeometry,
            material: new UnlitMaterial({ name: "inspection-overlay", color: [0, 1, 1, 1] }),
            label: "inspection-overlay"
          }]
        });
        const rendererInput = resources.toRendererInput({ width: 64, height: 64 }, {
          postprocess: true,
          frustumCulling: false,
          frame: { paddingRatio: 0.2 }
        });
        const defaultPreviewInput = resources.toRendererInput({ width: 64, height: 64 });
        const studioInput = resources.toRendererInput({ width: 64, height: 64 }, {
          qualityPreset: "studio-preview",
          frame: { paddingRatio: 0.2 }
        });
        const hdrStudioInput = resources.toRendererInput({ width: 64, height: 64 }, {
          qualityPreset: "hdr-studio-preview"
        });

        expect(source.scene).toBe(resources.scene);
        expect(source.environmentLighting).toEqual(DEFAULT_GLTF_STUDIO_PREVIEW_ENVIRONMENT_LIGHTING);
        expect(source.environmentLighting).not.toBe(DEFAULT_GLTF_STUDIO_PREVIEW_ENVIRONMENT_LIGHTING);
        expect(secondPreviewSource.environmentLighting).toEqual(DEFAULT_GLTF_STUDIO_PREVIEW_ENVIRONMENT_LIGHTING);
        expect(secondPreviewSource.postprocess).toEqual(DEFAULT_GLTF_STUDIO_PREVIEW_POSTPROCESS);
        expect(defaultSource.environmentLighting).toEqual(DEFAULT_GLTF_RENDER_ENVIRONMENT_LIGHTING);
        expect(defaultSource.postprocess).toBeUndefined();
        expect(studioSource.environmentLighting).toEqual(DEFAULT_GLTF_STUDIO_PREVIEW_ENVIRONMENT_LIGHTING);
        expect(studioSource.environmentLighting).not.toBe(DEFAULT_GLTF_STUDIO_PREVIEW_ENVIRONMENT_LIGHTING);
        expect(studioSource.postprocess).toEqual(DEFAULT_GLTF_STUDIO_PREVIEW_POSTPROCESS);
        expect(studioSource.postprocess).not.toBe(DEFAULT_GLTF_STUDIO_PREVIEW_POSTPROCESS);
        expect(secondPreviewSource.cameraFrameBounds).toEqual(resources.bounds);
        expect(tightPreviewSource.cameraFrameBounds).toEqual(resources.bounds);
        expect(tightPreviewSource.cameraFrameOptions).toEqual({ minDistance: 0.25, paddingRatio: 0.02 });
        expect([...(composedSource.renderItems ?? [])]).toHaveLength(1);
        expect(studioInput.source.postprocess).toEqual(DEFAULT_GLTF_STUDIO_PREVIEW_POSTPROCESS);
        expect(studioInput.source.cameraPolicy).toBe("require");
        expect(studioInput.source.cameraPosition).toEqual(studioInput.frame.cameraPosition);
        const hdrPreviewEnvironment = createDefaultGLTFHdrStudioPreviewEnvironmentLighting();
        expect(hdrPreviewEnvironment.environmentMapTexture).toBeDefined();
        expect(hdrPreviewEnvironment.environmentBrdfLutTexture).toBeDefined();
        expect(hdrPreviewEnvironment.environmentMapMipCount ?? 0).toBeGreaterThanOrEqual(4);
        expect(hdrStudioInput.source.environmentLighting?.environmentMapTexture).toBeDefined();
        expect(hdrStudioInput.source.environmentLighting?.environmentBrdfLutTexture).toBeDefined();
        expect(hdrStudioInput.source.environmentLighting?.environmentMapMipCount ?? 0).toBeGreaterThanOrEqual(4);
        expect(hdrStudioInput.source.environmentLighting?.proceduralMap?.specularIntensity ?? 0).toBeGreaterThan(0);
        expect(hdrStudioInput.source.environmentLighting).not.toEqual(DEFAULT_GLTF_STUDIO_PREVIEW_ENVIRONMENT_LIGHTING);
        expect(hdrStudioInput.source.postprocess).toEqual(DEFAULT_GLTF_HDR_STUDIO_PREVIEW_POSTPROCESS);
        expect(hdrStudioInput.source.postprocess).not.toBe(DEFAULT_GLTF_HDR_STUDIO_PREVIEW_POSTPROCESS);
        expect(hdrStudioInput.source.cameraPolicy).toBe("require");
        expect(hdrStudioInput.source.cameraPosition).toEqual(hdrStudioInput.frame.cameraPosition);
        expect(standaloneSource.geometryLibrary).toBe(resources.geometryLibrary);
        expect(standaloneSource.environmentLighting).toEqual(DEFAULT_GLTF_STUDIO_PREVIEW_ENVIRONMENT_LIGHTING);
        expect(unlitSource.environmentLighting).toBe(false);
        expect(rendererInput.source.scene).toBe(resources.scene);
        expect(rendererInput.source.environmentLighting).toEqual(DEFAULT_GLTF_STUDIO_PREVIEW_ENVIRONMENT_LIGHTING);
        expect(rendererInput.source.postprocess).toBe(true);
        expect(rendererInput.source.cameraPolicy).toBe("require");
        expect(rendererInput.source.cameraPosition).toEqual(rendererInput.frame.cameraPosition);
        expect(defaultPreviewInput.source.environmentLighting).toEqual(DEFAULT_GLTF_STUDIO_PREVIEW_ENVIRONMENT_LIGHTING);
        expect(defaultPreviewInput.source.postprocess).toEqual(DEFAULT_GLTF_STUDIO_PREVIEW_POSTPROCESS);
        expect(defaultPreviewInput.source.cameraPolicy).toBe("require");
        expect(defaultPreviewInput.source.cameraPosition).toEqual(defaultPreviewInput.frame.cameraPosition);
        expect(defaultPreviewInput.frame.cameraPosition).toEqual(resources.createCameraFrame({ width: 64, height: 64 }, DEFAULT_GLTF_STUDIO_PREVIEW_FRAME).cameraPosition);
        expect(rendererInput.camera.viewProjectionMatrix).toHaveLength(16);
        (source.environmentLighting?.color as [number, number, number])[0] = 0;
        expect(secondPreviewSource.environmentLighting?.color[0]).toBe(DEFAULT_GLTF_STUDIO_PREVIEW_ENVIRONMENT_LIGHTING.color[0]);
        expect(defaultSource.environmentLighting?.color[0]).toBe(DEFAULT_GLTF_RENDER_ENVIRONMENT_LIGHTING.color[0]);
        expect(renderer.render(source).drawCalls).toBeGreaterThan(0);
        expect((renderer.device as MockRenderDevice).drawCommands[0]?.uniforms?.get("u_environmentIntensity")).toBe(DEFAULT_GLTF_STUDIO_PREVIEW_ENVIRONMENT_LIGHTING.intensity);
        expect(renderer.render(unlitSource).drawCalls).toBeGreaterThan(0);
        const unlitCommand = (renderer.device as MockRenderDevice).drawCommands
          .find((command) => command.uniforms?.has("u_environmentIntensity"));
        expect(unlitCommand?.uniforms?.get("u_environmentIntensity")).toBe(0);
        expect(unlitCommand?.uniforms?.get("u_environmentMapIntensity")).toBe(0);
        expect(unlitCommand?.uniforms?.get("u_environmentSpecularIntensity")).toBe(0);
        expect(renderer.render(rendererInput.source, rendererInput.camera).drawCalls).toBeGreaterThan(0);
        expect(renderer.render(rendererInput).drawCalls).toBeGreaterThan(0);
        expect(renderer.render(defaultPreviewInput).drawCalls).toBeGreaterThan(0);
        expect(renderer.render(studioInput).drawCalls).toBeGreaterThan(0);
        const composedDiagnostics = renderer.render(composedSource);
        expect(composedDiagnostics.drawCalls).toBeGreaterThanOrEqual(2);
        expect((renderer.device as MockRenderDevice).drawCommands.map((command) => command.label)).toEqual(expect.arrayContaining([
          "inspection-node",
          "inspection-overlay"
        ]));
        overlayGeometry.dispose();
      } finally {
        renderer.dispose();
      }
    } finally {
      resources.dispose();
    }
  });

  it("reports render-resource material fidelity limits for unsupported texcoords and generated tangent UV mismatches", async () => {
    const asset = await new GLTFLoader().load(
      { url: createMaterialFidelityTexcoordGltfUrl(), type: "gltf" },
      new LoadContext()
    );
    const resources = await createGLTFRenderResources(asset, {
      imageDecoder: async (): Promise<DecodedGLTFImage> => ({
        width: 1,
        height: 1,
        colorSpace: "srgb",
        data: new Uint8Array([255, 255, 255, 255])
      })
    });

    try {
      const report = inspectGLTFAsset(asset, resources);

      expect(report.renderResources).toMatchObject({
        drawItems: 1,
        unsupportedTexCoordDrawItems: 1,
        generatedTangentUvMismatchDrawItems: 1
      });
      expect(report.renderResources.materialFidelityDiagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({
          issue: "unsupported-texcoord-set",
          slot: "baseColor",
          texCoord: 2,
          renderedTexCoord: 0,
          nodeName: "material-fidelity-node",
          geometryKey: "material-fidelity-mesh",
          materialKey: "material-fidelity-material"
        }),
        expect.objectContaining({
          issue: "generated-tangent-uv-mismatch",
          slot: "normal",
          texCoord: 1,
          renderedTexCoord: 1,
          nodeName: "material-fidelity-node",
          geometryKey: "material-fidelity-mesh",
          materialKey: "material-fidelity-material"
        })
      ]));
      expect(report.warnings.map((warning) => warning.code)).toEqual(expect.arrayContaining([
        "ASSET_VIEWER_MULTI_UV_RENDER_FALLBACK",
        "GLTF_RENDER_RESOURCE_TEXCOORD_DOWNGRADED",
        "GLTF_RENDER_RESOURCE_TANGENT_UV_MISMATCH"
      ]));
    } finally {
      resources.dispose();
    }
  });

  it("preserves glossy clearcoat roughness and authored normal strength while smoothing nearest normal-map samplers", async () => {
    const asset = await new GLTFLoader().load(
      { url: createGlossyClearcoatNormalGltfUrl(), type: "gltf" },
      new LoadContext()
    );
    const resources = await createGLTFRenderResources(asset, {
      imageDecoder: async (): Promise<DecodedGLTFImage> => ({
        width: 1,
        height: 1,
        colorSpace: "linear",
        data: new Uint8Array([128, 128, 255, 255])
      })
    });

    try {
      const material = resources.materialLibrary.get("glossy-clearcoat-normal");
      const normalTexture = material?.getParameter("u_normalTexture");
      expect(material?.getParameter("u_normalScale")).toBe(0.8);
      expect(material?.getParameter("u_clearcoatRoughnessFactor")).toBe(0);
      expect(normalTexture).toMatchObject({
        sampler: {
          minFilter: "linear-mipmap-linear",
          magFilter: "linear",
          addressU: "repeat",
          addressV: "repeat"
        }
      });
    } finally {
      resources.dispose();
    }
  });

  it("reports shader-inactive textured PBR extension slots when the selected shader variant drops a mixed texture group", async () => {
    const asset = await new GLTFLoader().load(
      { url: createMixedExtensionTextureGltfUrl(), type: "gltf" },
      new LoadContext()
    );
    const resources = await createGLTFRenderResources(asset, {
      imageDecoder: async (): Promise<DecodedGLTFImage> => ({
        width: 1,
        height: 1,
        colorSpace: "linear",
        data: new Uint8Array([255, 255, 255, 255])
      })
    });

    try {
      const material = resources.materialLibrary.get("mixed-clearcoat-specular");
      const diagnostics = createGLTFRenderResourceDiagnostics(resources);

      expect(material?.shaderKey).toBe(DEFAULT_TEXTURED_PBR_SHADER_NAME);
      expect(material?.shaderVariant).toBe(DEFAULT_TEXTURED_PBR_CLEARCOAT_SPECULAR_TEXTURES_VARIANT);
      expect(diagnostics).toMatchObject({
        texturedDrawItems: 1,
        baseColorTextureDrawItems: 0,
        colorBearingTextureDrawItems: 0,
        surfaceDetailTextureDrawItems: 1,
        effectiveTextureBackedDrawItems: 1
      });
      expect(diagnostics.textureSlotDiagnostics.map((entry) => entry.slot)).toEqual(["clearcoat", "specular"]);
      expect(diagnostics.textureContributionDiagnostics.map((entry) => `${entry.contribution}:${entry.slot}`)).toEqual([
        "surface-detail:clearcoat",
        "surface-detail:specular"
      ]);
      expect(diagnostics.shaderActiveTextureSlotDiagnostics.map((entry) => entry.slot)).toEqual(["clearcoat", "specular"]);
      expect(diagnostics.shaderInactiveTextureSlotDiagnostics).toEqual([]);
    } finally {
      resources.dispose();
    }
  });

  it("generates lit mesh normals when glTF omits NORMAL attributes", async () => {
    const asset = await new GLTFLoader().load(
      { url: createMissingNormalsGltfUrl(), type: "gltf" },
      new LoadContext()
    );
    const resources = await createGLTFRenderResources(asset, {
      imageDecoder: async (): Promise<DecodedGLTFImage> => ({
        width: 1,
        height: 1,
        colorSpace: "srgb",
        data: new Uint8Array([255, 255, 255, 255])
      })
    });
    try {
      const geometry = resources.geometryLibrary.get("missing-normal-mesh");
      expect(geometry?.vertexBuffer.format.hasAttribute("normal")).toBe(true);
      expect(geometry?.vertexBuffer.format.hasAttribute("tangent")).toBe(true);
      expect(geometry?.vertexBuffer.getAttribute(0, "normal").map(round3)).toEqual([1, 0, 0]);
      expect(resources.materialLibrary.get("missing-normal-material")?.shaderKey).toBe(DEFAULT_TEXTURED_PBR_SHADER_NAME);
    } finally {
      resources.dispose();
    }
  });

  it("uses the glTF default PBR material when primitives omit a material", async () => {
    const asset = await new GLTFLoader().load(
      { url: createDefaultMaterialGltfUrl(), type: "gltf" },
      new LoadContext()
    );
    const resources = await createGLTFRenderResources(asset);
    try {
      const report = inspectGLTFAsset(asset, resources);
      const geometry = resources.geometryLibrary.get("default-material-mesh");
      const material = resources.materialLibrary.get("default-material");
      expect(geometry?.vertexBuffer.format.hasAttribute("normal")).toBe(true);
      expect(material?.shaderKey).toBe(DEFAULT_PBR_SHADER_NAME);
      expect(report.renderResources).toMatchObject({
        drawItems: 1,
        texturedDrawItems: 0,
        fallbackWhiteDrawItems: 1,
        missingGeometryDrawItems: 0,
        missingMaterialDrawItems: 0,
        fallbackWhiteLabels: ["default-material-node:default-material-mesh"]
      });
      expect(report.warnings).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: "GLTF_RENDER_RESOURCE_FALLBACK_WHITE",
          message: expect.stringContaining("default-material-node:default-material-mesh")
        })
      ]));
      const missingBindingReport = inspectGLTFAsset(asset, {
        ...resources,
        geometryLibrary: new Map(),
        materialLibrary: new Map()
      });
      expect(missingBindingReport.renderResources).toMatchObject({
        drawItems: 0,
        missingGeometryDrawItems: 1,
        missingMaterialDrawItems: 1,
        missingGeometryLabels: ["default-material-node:default-material-mesh"],
        missingMaterialLabels: ["default-material-node:default-material-mesh"]
      });
      expect(missingBindingReport.warnings).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "GLTF_RENDER_RESOURCE_MISSING_GEOMETRY" }),
        expect.objectContaining({ code: "GLTF_RENDER_RESOURCE_MISSING_MATERIAL" })
      ]));

      const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
      try {
        expect(() => renderer.render(resources.toRenderSource({ cameraPosition: [0, 0, 4], frustumCulling: false }))).not.toThrow();
      } finally {
        renderer.dispose();
      }
    } finally {
      resources.dispose();
    }
  });

  it("separates shared glTF material runtime contracts for skinned and unskinned renderables", async () => {
    const asset = await new GLTFLoader().load(
      { url: createSharedSkinnedMaterialGltfUrl(), type: "gltf" },
      new LoadContext()
    );
    const resources = await createGLTFRenderResources(asset);
    try {
      const renderables = resources.scene.collectRenderables().map(({ renderable }) => renderable);
      const unskinned = renderables.find((renderable) => renderable.skinning === undefined);
      const skinned = renderables.find((renderable) => renderable.skinning !== undefined);
      expect(unskinned?.material).toBe("shared-pbr");
      expect(skinned?.material).toBe("shared-pbr#galileo3d-runtime:skinned");
      expect(resources.materialLibrary.get("shared-pbr")?.shaderKey).toBe(DEFAULT_PBR_SHADER_NAME);
      expect(resources.materialLibrary.get("shared-pbr#galileo3d-runtime:skinned")?.shaderKey).toBe(DEFAULT_SKINNED_LIT_SHADER_NAME);

      const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
      try {
        expect(() => renderer.render(resources.toRenderSource({ cameraPosition: [0, 0, 4], frustumCulling: false }))).not.toThrow();
      } finally {
        renderer.dispose();
      }
    } finally {
      resources.dispose();
    }
  });

  it("surfaces unsupported glTF and material extensions as inspection warnings", async () => {
    const asset = await new GLTFLoader().load(
      { url: createUnsupportedExtensionsGltfUrl(), type: "gltf" },
      new LoadContext()
    );
    const report = inspectGLTFAsset(asset);

    expect(asset.loaderDiagnostics.unsupportedExtensions).toEqual([
      "VENDOR_material_magic",
      "VENDOR_scene_magic"
    ]);
    expect(report.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "GLTF_UNSUPPORTED_MATERIAL_EXTENSION",
        message: expect.stringContaining("VENDOR_material_magic")
      }),
      expect.objectContaining({
        code: "GLTF_UNSUPPORTED_EXTENSION",
        message: expect.stringContaining("VENDOR_scene_magic")
      })
    ]));
  });

  it("keeps opaque KHR_materials_transmission materials depth-writing instead of forcing alpha blending", async () => {
    const asset = await new GLTFLoader().load(
      { url: createTransmissionGlassGltfUrl(), type: "gltf" },
      new LoadContext()
    );
    const report = inspectGLTFAsset(asset);
    expect(report.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "GLTF_TRANSMISSION_REFRACTION_FALLBACK",
        message: expect.stringContaining("transmission-glass")
      })
    ]));
    expect(report.materials[0]?.extensionSupport).toEqual([
      expect.objectContaining({
        name: "KHR_materials_transmission",
        status: "parsed-with-limits",
        requiredAccepted: true,
        knownLimits: [expect.stringContaining("screen-space/refraction parity remains blocked")]
      })
    ]);

    const resources = await createGLTFRenderResources(asset);

    try {
      const material = resources.materialLibrary.get("transmission-glass");
      expect(material).toBeTruthy();
      expect(material?.renderState.blend).toBe(true);
      expect(material?.renderState.depthWrite).toBe(false);
      expect(material?.getParameter("u_transmissionFactor")).toBe(1);
      expect(material?.getParameter("u_transmissionFallbackEnergy")).toBe(0.08);
      expect(createGLTFRenderResourceDiagnostics(resources).fallbackWhiteDrawItems).toBe(0);
    } finally {
      resources.dispose();
    }
  });

  it("still honors explicit alphaMode BLEND on KHR_materials_transmission materials", async () => {
    const asset = await new GLTFLoader().load(
      { url: createTransmissionGlassGltfUrl("BLEND"), type: "gltf" },
      new LoadContext()
    );
    const resources = await createGLTFRenderResources(asset);

    try {
      const material = resources.materialLibrary.get("transmission-glass");
      expect(material).toBeTruthy();
      expect(material?.renderState.blend).toBe(true);
      expect(material?.renderState.depthWrite).toBe(false);
      expect(material?.getParameter("u_transmissionFactor")).toBe(1);
    } finally {
      resources.dispose();
    }
  });

  it("disambiguates duplicate glTF node names before binding animation tracks", async () => {
    const asset = await new GLTFLoader().load(
      { url: createDuplicateAnimatedNodeNamesGltfUrl(), type: "gltf" },
      new LoadContext()
    );
    const scene = asset.createScene();
    const first = scene.findByName("Dup")[0];
    const second = scene.findByName("Dup_1")[0];
    if (!first || !second) throw new Error("duplicate-name fixture nodes were not imported with unique runtime names");

    expect(asset.animations[0]?.tracks.map((track) => track.target)).toEqual(["Dup_1.translation"]);
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: asset.animations });
    const result = runtime.applyClipByName("move-second-duplicate", 1);

    expect(result.missingTargets).toEqual([]);
    expect(result.transformTracksApplied).toBe(1);
    expect(first.transform.position).toEqual([0, 0, 0]);
    expect(second.transform.position).toEqual([2, 0, 0]);
  });
});

function createTexturedMorphAnimationGltfUrl(): string {
  const positions = floatBytes([-0.5, -0.5, 0, 0.5, -0.5, 0, 0, 0.5, 0]);
  const texcoords = floatBytes([0, 1, 1, 1, 0.5, 0]);
  const morphPositions = floatBytes([0, 0, 0.25, 0, 0, 0.25, 0, 0, 0.25]);
  const indices = uint16Bytes([0, 1, 2]);
  const times = floatBytes([0, 1]);
  const translations = floatBytes([0, 0, 0, 0.25, 0, 0]);
  const buffer = concatBytes(positions, texcoords, morphPositions, indices, times, translations);
  const offsets = byteOffsets([positions, texcoords, morphPositions, indices, times, translations]);
  const imageDataUri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADklEQVR4nGP4z8AAQv8BD/kD/YURmXYAAAAASUVORK5CYII=";
  const gltf = {
    asset: { version: "2.0", generator: "Galileo3D inspection fixture" },
    buffers: [{ uri: bytesDataUri(buffer), byteLength: buffer.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: offsets[0], byteLength: positions.byteLength },
      { buffer: 0, byteOffset: offsets[1], byteLength: texcoords.byteLength },
      { buffer: 0, byteOffset: offsets[2], byteLength: morphPositions.byteLength },
      { buffer: 0, byteOffset: offsets[3], byteLength: indices.byteLength },
      { buffer: 0, byteOffset: offsets[4], byteLength: times.byteLength },
      { buffer: 0, byteOffset: offsets[5], byteLength: translations.byteLength }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.5, -0.5, 0], max: [0.5, 0.5, 0] },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC2" },
      { bufferView: 2, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 3, componentType: 5123, count: 3, type: "SCALAR" },
      { bufferView: 4, componentType: 5126, count: 2, type: "SCALAR" },
      { bufferView: 5, componentType: 5126, count: 2, type: "VEC3" }
    ],
    images: [{ name: "inspection-image", uri: imageDataUri }],
    textures: [{ name: "inspection-texture", source: 0 }],
    materials: [{
      name: "inspection-material",
      pbrMetallicRoughness: {
        baseColorTexture: { index: 0 },
        metallicFactor: 0,
        roughnessFactor: 1
      },
      alphaMode: "BLEND",
      doubleSided: true
    }],
    meshes: [{
      name: "inspection-mesh",
      weights: [0.25],
      primitives: [{
        attributes: { POSITION: 0, TEXCOORD_0: 1 },
        targets: [{ POSITION: 2 }],
        indices: 3,
        material: 0
      }]
    }],
    nodes: [{ name: "inspection-node", mesh: 0 }],
    animations: [{
      name: "inspection-animation",
      samplers: [{ input: 4, output: 5, interpolation: "LINEAR" }],
      channels: [{ sampler: 0, target: { node: 0, path: "translation" } }]
    }],
    scenes: [{ name: "inspection-scene", nodes: [0] }],
    scene: 0
  };
  return `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;
}

function createMaterialFidelityTexcoordGltfUrl(): string {
  const positions = floatBytes([-0.5, -0.5, 0, 0.5, -0.5, 0, 0, 0.5, 0]);
  const texcoords0 = floatBytes([0, 1, 1, 1, 0.5, 0]);
  const texcoords1 = floatBytes([0, 0, 0.75, 0, 0.25, 0.75]);
  const texcoords2 = floatBytes([0.1, 0.9, 0.9, 0.9, 0.5, 0.1]);
  const indices = uint16Bytes([0, 1, 2]);
  const buffer = concatBytes(positions, texcoords0, texcoords1, texcoords2, indices);
  const offsets = byteOffsets([positions, texcoords0, texcoords1, texcoords2, indices]);
  const imageDataUri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwAEAQH/0bRJsgAAAABJRU5ErkJggg==";
  const gltf = {
    asset: { version: "2.0", generator: "Galileo3D material fidelity texcoord fixture" },
    buffers: [{ uri: bytesDataUri(buffer), byteLength: buffer.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: offsets[0], byteLength: positions.byteLength },
      { buffer: 0, byteOffset: offsets[1], byteLength: texcoords0.byteLength },
      { buffer: 0, byteOffset: offsets[2], byteLength: texcoords1.byteLength },
      { buffer: 0, byteOffset: offsets[3], byteLength: texcoords2.byteLength },
      { buffer: 0, byteOffset: offsets[4], byteLength: indices.byteLength }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.5, -0.5, 0], max: [0.5, 0.5, 0] },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC2" },
      { bufferView: 2, componentType: 5126, count: 3, type: "VEC2" },
      { bufferView: 3, componentType: 5126, count: 3, type: "VEC2" },
      { bufferView: 4, componentType: 5123, count: 3, type: "SCALAR" }
    ],
    images: [{ name: "material-fidelity-image", uri: imageDataUri }],
    textures: [{ name: "material-fidelity-texture", source: 0 }],
    materials: [{
      name: "material-fidelity-material",
      pbrMetallicRoughness: {
        baseColorTexture: { index: 0, texCoord: 2 },
        metallicFactor: 0,
        roughnessFactor: 1
      },
      normalTexture: { index: 0, texCoord: 1, scale: 1 }
    }],
    meshes: [{
      name: "material-fidelity-mesh",
      primitives: [{
        attributes: { POSITION: 0, TEXCOORD_0: 1, TEXCOORD_1: 2, TEXCOORD_2: 3 },
        indices: 4,
        material: 0
      }]
    }],
    nodes: [{ name: "material-fidelity-node", mesh: 0 }],
    scenes: [{ name: "material-fidelity-scene", nodes: [0] }],
    scene: 0
  };
  return `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;
}

function createGlossyClearcoatNormalGltfUrl(): string {
  const positions = floatBytes([-0.5, -0.5, 0, 0.5, -0.5, 0, 0, 0.5, 0]);
  const texcoords = floatBytes([0, 1, 1, 1, 0.5, 0]);
  const indices = uint16Bytes([0, 1, 2]);
  const buffer = concatBytes(positions, texcoords, indices);
  const offsets = byteOffsets([positions, texcoords, indices]);
  const imageDataUri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwAEAQH/0bRJsgAAAABJRU5ErkJggg==";
  const gltf = {
    asset: { version: "2.0", generator: "Galileo3D glossy clearcoat fixture" },
    extensionsUsed: ["KHR_materials_clearcoat"],
    buffers: [{ uri: bytesDataUri(buffer), byteLength: buffer.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: offsets[0], byteLength: positions.byteLength },
      { buffer: 0, byteOffset: offsets[1], byteLength: texcoords.byteLength },
      { buffer: 0, byteOffset: offsets[2], byteLength: indices.byteLength }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.5, -0.5, 0], max: [0.5, 0.5, 0] },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC2" },
      { bufferView: 2, componentType: 5123, count: 3, type: "SCALAR" }
    ],
    images: [{ name: "glossy-normal-image", uri: imageDataUri }],
    samplers: [{ magFilter: 9728, minFilter: 9986, wrapS: 10497, wrapT: 10497 }],
    textures: [{ name: "glossy-normal-texture", source: 0, sampler: 0 }],
    materials: [{
      name: "glossy-clearcoat-normal",
      pbrMetallicRoughness: {
        baseColorFactor: [0.8, 0.02, 0.01, 1],
        metallicFactor: 0,
        roughnessFactor: 0.25
      },
      normalTexture: { index: 0, scale: 0.8 },
      extensions: {
        KHR_materials_clearcoat: {
          clearcoatFactor: 1
        }
      }
    }],
    meshes: [{
      name: "glossy-clearcoat-mesh",
      primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 0 }]
    }],
    nodes: [{ name: "glossy-clearcoat-node", mesh: 0 }],
    scenes: [{ name: "glossy-clearcoat-scene", nodes: [0] }],
    scene: 0
  };
  return `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;
}

function createMixedExtensionTextureGltfUrl(): string {
  const positions = floatBytes([-0.5, -0.5, 0, 0.5, -0.5, 0, 0, 0.5, 0]);
  const texcoords = floatBytes([0, 1, 1, 1, 0.5, 0]);
  const indices = uint16Bytes([0, 1, 2]);
  const buffer = concatBytes(positions, texcoords, indices);
  const offsets = byteOffsets([positions, texcoords, indices]);
  const imageDataUri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwAEAQH/0bRJsgAAAABJRU5ErkJggg==";
  const gltf = {
    asset: { version: "2.0", generator: "Galileo3D mixed extension texture fixture" },
    extensionsUsed: ["KHR_materials_clearcoat", "KHR_materials_specular"],
    buffers: [{ uri: bytesDataUri(buffer), byteLength: buffer.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: offsets[0], byteLength: positions.byteLength },
      { buffer: 0, byteOffset: offsets[1], byteLength: texcoords.byteLength },
      { buffer: 0, byteOffset: offsets[2], byteLength: indices.byteLength }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.5, -0.5, 0], max: [0.5, 0.5, 0] },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC2" },
      { bufferView: 2, componentType: 5123, count: 3, type: "SCALAR" }
    ],
    images: [
      { name: "mixed-clearcoat-image", uri: imageDataUri },
      { name: "mixed-specular-image", uri: imageDataUri }
    ],
    textures: [
      { name: "mixed-clearcoat-texture", source: 0 },
      { name: "mixed-specular-texture", source: 1 }
    ],
    materials: [{
      name: "mixed-clearcoat-specular",
      pbrMetallicRoughness: {
        baseColorFactor: [0.3, 0.34, 0.38, 1],
        metallicFactor: 0,
        roughnessFactor: 0.2
      },
      extensions: {
        KHR_materials_clearcoat: {
          clearcoatFactor: 0.8,
          clearcoatTexture: { index: 0 }
        },
        KHR_materials_specular: {
          specularFactor: 0.7,
          specularTexture: { index: 1 }
        }
      }
    }],
    meshes: [{
      name: "mixed-extension-mesh",
      primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 0 }]
    }],
    nodes: [{ name: "mixed-extension-node", mesh: 0 }],
    scenes: [{ name: "mixed-extension-scene", nodes: [0] }],
    scene: 0
  };
  return `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;
}

function createUnsupportedExtensionsGltfUrl(): string {
  const positions = floatBytes([-0.5, -0.5, 0, 0.5, -0.5, 0, 0, 0.5, 0]);
  const indices = uint16Bytes([0, 1, 2]);
  const buffer = concatBytes(positions, indices);
  const offsets = byteOffsets([positions, indices]);
  const gltf = {
    asset: { version: "2.0", generator: "Galileo3D unsupported extension inspection fixture" },
    extensionsUsed: ["VENDOR_scene_magic", "VENDOR_material_magic"],
    extensions: { VENDOR_scene_magic: { enabled: true } },
    buffers: [{ uri: bytesDataUri(buffer), byteLength: buffer.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: offsets[0], byteLength: positions.byteLength },
      { buffer: 0, byteOffset: offsets[1], byteLength: indices.byteLength }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.5, -0.5, 0], max: [0.5, 0.5, 0] },
      { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" }
    ],
    materials: [{
      name: "unsupported-material-extension",
      extensions: { VENDOR_material_magic: { tint: [1, 0, 0] } },
      pbrMetallicRoughness: { baseColorFactor: [0.8, 0.2, 0.2, 1] }
    }],
    meshes: [{
      name: "unsupported-extension-mesh",
      primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }]
    }],
    nodes: [{ name: "unsupported-extension-node", mesh: 0 }],
    scenes: [{ name: "unsupported-extension-scene", nodes: [0] }],
    scene: 0
  };
  return `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;
}

function createTransmissionGlassGltfUrl(alphaMode?: "OPAQUE" | "MASK" | "BLEND"): string {
  const positions = floatBytes([-0.5, -0.5, 0, 0.5, -0.5, 0, 0, 0.5, 0]);
  const indices = uint16Bytes([0, 1, 2]);
  const buffer = concatBytes(positions, indices);
  const offsets = byteOffsets([positions, indices]);
  const gltf = {
    asset: { version: "2.0", generator: "Galileo3D transmission glass fixture" },
    extensionsUsed: ["KHR_materials_transmission"],
    buffers: [{ uri: bytesDataUri(buffer), byteLength: buffer.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: offsets[0], byteLength: positions.byteLength },
      { buffer: 0, byteOffset: offsets[1], byteLength: indices.byteLength }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.5, -0.5, 0], max: [0.5, 0.5, 0] },
      { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" }
    ],
    materials: [{
      name: "transmission-glass",
      pbrMetallicRoughness: {
        baseColorFactor: [1, 1, 1, 1],
        metallicFactor: 0,
        roughnessFactor: 0
      },
      extensions: {
        KHR_materials_transmission: {
          transmissionFactor: 1
        }
      },
      ...(alphaMode ? { alphaMode } : {})
    }],
    meshes: [{
      name: "transmission-glass-mesh",
      primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }]
    }],
    nodes: [{ name: "transmission-glass-node", mesh: 0 }],
    scenes: [{ name: "transmission-glass-scene", nodes: [0] }],
    scene: 0
  };
  return `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;
}

function createDuplicateAnimatedNodeNamesGltfUrl(): string {
  const times = floatBytes([0, 1]);
  const translations = floatBytes([0, 0, 0, 2, 0, 0]);
  const buffer = concatBytes(times, translations);
  const offsets = byteOffsets([times, translations]);
  const gltf = {
    asset: { version: "2.0", generator: "Galileo3D duplicate node animation fixture" },
    buffers: [{ uri: bytesDataUri(buffer), byteLength: buffer.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: offsets[0], byteLength: times.byteLength },
      { buffer: 0, byteOffset: offsets[1], byteLength: translations.byteLength }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 2, type: "SCALAR" },
      { bufferView: 1, componentType: 5126, count: 2, type: "VEC3" }
    ],
    nodes: [
      { name: "Dup" },
      { name: "Dup" }
    ],
    animations: [{
      name: "move-second-duplicate",
      samplers: [{ input: 0, output: 1, interpolation: "LINEAR" }],
      channels: [{ sampler: 0, target: { node: 1, path: "translation" } }]
    }],
    scenes: [{ name: "duplicate-node-scene", nodes: [0, 1] }],
    scene: 0
  };
  return `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;
}

function createMissingNormalsGltfUrl(): string {
  const positions = floatBytes([0, 0, 0, 0, 1, 0, 0, 0, 1]);
  const texcoords = floatBytes([0, 0, 1, 0, 0, 1]);
  const indices = uint16Bytes([0, 1, 2]);
  const buffer = concatBytes(positions, texcoords, indices);
  const offsets = byteOffsets([positions, texcoords, indices]);
  const gltf = {
    asset: { version: "2.0", generator: "Galileo3D missing normal fixture" },
    buffers: [{ uri: bytesDataUri(buffer), byteLength: buffer.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: offsets[0], byteLength: positions.byteLength },
      { buffer: 0, byteOffset: offsets[1], byteLength: texcoords.byteLength },
      { buffer: 0, byteOffset: offsets[2], byteLength: indices.byteLength }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [0, 1, 1] },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC2" },
      { bufferView: 2, componentType: 5123, count: 3, type: "SCALAR" }
    ],
    images: [{ name: "missing-normal-image", uri: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4////fwAJ+wP9L8L6wwAAAABJRU5ErkJggg==" }],
    textures: [{ name: "missing-normal-texture", source: 0 }],
    materials: [{
      name: "missing-normal-material",
      pbrMetallicRoughness: {
        baseColorTexture: { index: 0 },
        metallicFactor: 0.5,
        roughnessFactor: 0.35
      }
    }],
    meshes: [{
      name: "missing-normal-mesh",
      primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 0 }]
    }],
    nodes: [{ name: "missing-normal-node", mesh: 0 }],
    scenes: [{ name: "missing-normal-scene", nodes: [0] }],
    scene: 0
  };
  return `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;
}

function createDefaultMaterialGltfUrl(): string {
  const positions = floatBytes([-0.5, -0.5, 0, 0.5, -0.5, 0, 0, 0.5, 0]);
  const indices = uint16Bytes([0, 1, 2]);
  const buffer = concatBytes(positions, indices);
  const offsets = byteOffsets([positions, indices]);
  const gltf = {
    asset: { version: "2.0", generator: "Galileo3D default material fixture" },
    buffers: [{ uri: bytesDataUri(buffer), byteLength: buffer.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: offsets[0], byteLength: positions.byteLength },
      { buffer: 0, byteOffset: offsets[1], byteLength: indices.byteLength }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.5, -0.5, 0], max: [0.5, 0.5, 0] },
      { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" }
    ],
    meshes: [{
      name: "default-material-mesh",
      primitives: [{ attributes: { POSITION: 0 }, indices: 1 }]
    }],
    nodes: [{ name: "default-material-node", mesh: 0 }],
    scenes: [{ name: "default-material-scene", nodes: [0] }],
    scene: 0
  };
  return `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;
}

function createSharedSkinnedMaterialGltfUrl(): string {
  const positions = floatBytes([-0.5, -0.5, 0, 0.5, -0.5, 0, 0, 0.5, 0]);
  const normals = floatBytes([0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const joints = uint16Bytes([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const weights = floatBytes([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
  const inverseBindMatrix = floatBytes([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ]);
  const buffer = concatBytes(positions, normals, joints, weights, inverseBindMatrix);
  const offsets = byteOffsets([positions, normals, joints, weights, inverseBindMatrix]);
  const gltf = {
    asset: { version: "2.0", generator: "Galileo3D shared skin material fixture" },
    buffers: [{ uri: bytesDataUri(buffer), byteLength: buffer.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: offsets[0], byteLength: positions.byteLength },
      { buffer: 0, byteOffset: offsets[1], byteLength: normals.byteLength },
      { buffer: 0, byteOffset: offsets[2], byteLength: joints.byteLength },
      { buffer: 0, byteOffset: offsets[3], byteLength: weights.byteLength },
      { buffer: 0, byteOffset: offsets[4], byteLength: inverseBindMatrix.byteLength }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.5, -0.5, 0], max: [0.5, 0.5, 0] },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 2, componentType: 5123, count: 3, type: "VEC4" },
      { bufferView: 3, componentType: 5126, count: 3, type: "VEC4" },
      { bufferView: 4, componentType: 5126, count: 1, type: "MAT4" }
    ],
    materials: [{
      name: "shared-pbr",
      pbrMetallicRoughness: { baseColorFactor: [0.5, 0.7, 1, 1], metallicFactor: 0.2, roughnessFactor: 0.45 }
    }],
    meshes: [
      { name: "skinned-shared-mesh", primitives: [{ attributes: { POSITION: 0, NORMAL: 1, JOINTS_0: 2, WEIGHTS_0: 3 }, material: 0 }] },
      { name: "plain-shared-mesh", primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, material: 0 }] }
    ],
    skins: [{ name: "single-joint-skin", joints: [0], inverseBindMatrices: 4 }],
    nodes: [
      { name: "joint-root" },
      { name: "skinned-node", mesh: 0, skin: 0 },
      { name: "plain-node", mesh: 1, translation: [1.2, 0, 0] }
    ],
    scenes: [{ name: "shared-scene", nodes: [0, 1, 2] }],
    scene: 0
  };
  return `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;
}

function floatBytes(values: readonly number[]): Uint8Array {
  const bytes = new Uint8Array(values.length * 4);
  new Float32Array(bytes.buffer).set(values);
  return bytes;
}

function uint16Bytes(values: readonly number[]): Uint8Array {
  const bytes = new Uint8Array(values.length * 2);
  new Uint16Array(bytes.buffer).set(values);
  return bytes;
}

function concatBytes(...chunks: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function byteOffsets(chunks: readonly Uint8Array[]): readonly number[] {
  const offsets: number[] = [];
  let offset = 0;
  for (const chunk of chunks) {
    offsets.push(offset);
    offset += chunk.byteLength;
  }
  return offsets;
}

function bytesDataUri(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:application/octet-stream;base64,${btoa(binary)}`;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
