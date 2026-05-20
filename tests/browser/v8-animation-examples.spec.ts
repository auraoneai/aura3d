import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const ORIGIN = process.env.G3D_ROUTE_HEALTH_ORIGIN ?? "http://localhost:5180";
const REPORT_PATH = "tests/reports/v8-animation-examples.json";

type AnimationExampleExpectation = {
  readonly path: string;
  readonly label: string;
  readonly requiresFrameProgress: boolean;
  readonly threeExample: string;
  readonly screenshotPath: string;
  readonly readyTimeoutMs?: number;
  readonly settleMs?: number;
};

const EXPECTED_ROUTES: readonly AnimationExampleExpectation[] = [
  {
    path: "/apps/v8-animation-keyframes/",
    label: "V8 Animation Keyframes",
    requiresFrameProgress: true,
    threeExample: "https://threejs.org/examples/#webgl_animation_keyframes",
    screenshotPath: "tests/reports/v8/animation/keyframes.png",
    readyTimeoutMs: 20_000
  },
  {
    path: "/apps/v8-skinning-blending/",
    label: "V8 Skinning Blending",
    requiresFrameProgress: true,
    threeExample: "https://threejs.org/examples/#webgl_animation_skinning_blending",
    screenshotPath: "tests/reports/v8/animation/skinning-blending.png"
  },
  {
    path: "/apps/v8-skinning-additive/",
    label: "V8 Skinning Additive",
    requiresFrameProgress: true,
    threeExample: "https://threejs.org/examples/#webgl_animation_skinning_additive_blending",
    screenshotPath: "tests/reports/v8/animation/additive-blending.png"
  },
  {
    path: "/apps/v8-skinning-ik/",
    label: "V8 Skinning IK",
    requiresFrameProgress: true,
    threeExample: "https://threejs.org/examples/#webgl_animation_skinning_ik",
    screenshotPath: "tests/reports/v8/animation/ik.png"
  },
  {
    path: "/apps/v8-skinning-morph/",
    label: "V8 Skinning Morph",
    requiresFrameProgress: true,
    threeExample: "https://threejs.org/examples/#webgl_animation_skinning_morph",
    screenshotPath: "tests/reports/v8/animation/morph.png"
  },
  {
    path: "/apps/v8-animation-multiple/",
    label: "V8 Animation Multiple",
    requiresFrameProgress: true,
    threeExample: "https://threejs.org/examples/#webgl_animation_multiple",
    screenshotPath: "tests/reports/v8/animation/multiple.png"
  },
  {
    path: "/apps/v8-animation-walk/",
    label: "V8 Animation Walk",
    requiresFrameProgress: true,
    threeExample: "https://threejs.org/examples/#webgl_animation_walk",
    screenshotPath: "tests/reports/v8/animation/walk.png"
  },
  {
    path: "/apps/v8-decals/",
    label: "V8 Decals",
    requiresFrameProgress: false,
    threeExample: "https://threejs.org/examples/#webgl_decals",
    screenshotPath: "tests/reports/v8/decals/decals.png"
  },
  {
    path: "/apps/v8-camera/",
    label: "V8 Camera",
    requiresFrameProgress: true,
    threeExample: "https://threejs.org/examples/#webgl_camera",
    screenshotPath: "tests/reports/v8/camera/camera.png"
  },
  {
    path: "/apps/v8-camera-multiple-views/",
    label: "V8 Camera Multiple Views",
    requiresFrameProgress: true,
    threeExample: "https://threejs.org/examples/#webgl_multiple_views",
    screenshotPath: "tests/reports/v8/camera/multiple-views.png"
  },
  {
    path: "/apps/v8-parallax-barrier/",
    label: "V8 Parallax Barrier",
    requiresFrameProgress: true,
    threeExample: "https://threejs.org/examples/#webgl_effects_parallaxbarrier",
    screenshotPath: "tests/reports/v8/stereo/parallax-barrier.png"
  },
  {
    path: "/apps/v8-stereo-effects/",
    label: "V8 Stereo Effects",
    requiresFrameProgress: false,
    threeExample: "https://threejs.org/examples/#webgl_effects_stereo",
    screenshotPath: "tests/reports/v8/stereo/stereo.png"
  },
  {
    path: "/apps/v8-physics-showcase/",
    label: "V8 Physics Showcase",
    requiresFrameProgress: true,
    threeExample: "https://threejs.org/examples/#webgl_animation_keyframes",
    screenshotPath: "tests/reports/v8/physics/physics-showcase.png"
  },
  {
    path: "/apps/v8-loader-compression/",
    label: "V8 Loader Compression",
    requiresFrameProgress: true,
    threeExample: "https://threejs.org/examples/#webgl_loader_gltf_compressed",
    screenshotPath: "tests/reports/v8/loaders/loader-compression.png"
  },
  {
    path: "/apps/v8-loader-instancing/",
    label: "V8 Loader Instancing",
    requiresFrameProgress: true,
    threeExample: "https://threejs.org/examples/#webgl_loader_gltf_instancing",
    screenshotPath: "tests/reports/v8/loaders/loader-instancing.png"
  },
  {
    path: "/apps/v8-loader-material-extensions/",
    label: "V8 Loader Material Extensions",
    requiresFrameProgress: true,
    threeExample: "https://threejs.org/examples/#webgl_loader_gltf_sheen",
    screenshotPath: "tests/reports/v8/loaders/loader-material-extensions.png"
  },
  {
    path: "/apps/v8-loader-gltf-variants/",
    label: "V8 Loader GLTF Variants",
    requiresFrameProgress: true,
    threeExample: "https://threejs.org/examples/#webgl_loader_gltf_variants",
    screenshotPath: "tests/reports/v8/loaders/loader-gltf-variants.png"
  },
  {
    path: "/apps/v8-loader-ktx2/",
    label: "V8 Loader KTX2",
    requiresFrameProgress: true,
    threeExample: "https://threejs.org/examples/#webgl_loader_texture_ktx2",
    screenshotPath: "tests/reports/v8/loaders/loader-ktx2.png",
    readyTimeoutMs: 20_000
  },
  {
    path: "/apps/v8-loader-obj/",
    label: "V8 Loader OBJ",
    requiresFrameProgress: true,
    threeExample: "https://threejs.org/examples/#webgl_loader_obj",
    screenshotPath: "tests/reports/v8/loaders/loader-obj.png"
  },
  {
    path: "/apps/v8-instancing-performance/",
    label: "V8 Instancing Performance",
    requiresFrameProgress: true,
    threeExample: "https://threejs.org/examples/#webgl_instancing_performance",
    screenshotPath: "tests/reports/v8/instancing/performance.png"
  },
  {
    path: "/apps/v8-texture-anisotropy/",
    label: "V8 Texture Anisotropy",
    requiresFrameProgress: true,
    threeExample: "https://threejs.org/examples/#webgl_materials_texture_anisotropy",
    screenshotPath: "tests/reports/v8/textures/anisotropy.png"
  },
  {
    path: "/apps/v8-interactive-picking/",
    label: "V8 Interactive Picking",
    requiresFrameProgress: true,
    threeExample: "https://threejs.org/examples/#webgl_interactive_cubes",
    screenshotPath: "tests/reports/v8/interactive/picking.png"
  },
  {
    path: "/apps/v8-controls-trackball/",
    label: "V8 Controls Trackball",
    requiresFrameProgress: true,
    threeExample: "https://threejs.org/examples/#misc_controls_trackball",
    screenshotPath: "tests/reports/v8/controls/trackball.png"
  },
  {
    path: "/apps/v8-geometry-drawrange/",
    label: "V8 Geometry DrawRange",
    requiresFrameProgress: true,
    threeExample: "https://threejs.org/examples/#webgl_buffergeometry_drawrange",
    screenshotPath: "tests/reports/v8/geometry/drawrange.png"
  },
  {
    path: "/apps/v8-lines-helpers/",
    label: "V8 Lines Helpers",
    requiresFrameProgress: true,
    threeExample: "https://threejs.org/examples/#misc_helpers",
    screenshotPath: "tests/reports/v8/geometry/lines-helpers.png"
  },
  {
    path: "/apps/v8-materials-transmission/",
    label: "V8 Materials Transmission",
    requiresFrameProgress: true,
    threeExample: "https://threejs.org/examples/#webgl_materials_physical_transmission",
    screenshotPath: "tests/reports/v8/materials/transmission.png"
  },
  {
    path: "/apps/v8-lights-spotlight/",
    label: "V8 Lights Spotlight",
    requiresFrameProgress: true,
    threeExample: "https://threejs.org/examples/#webgl_lights_spotlight",
    screenshotPath: "tests/reports/v8/lights/spotlight.png"
  },
  {
    path: "/apps/v8-shadowmap-viewer/",
    label: "V8 Shadowmap Viewer",
    requiresFrameProgress: true,
    threeExample: "https://threejs.org/examples/#webgl_shadowmap_viewer",
    screenshotPath: "tests/reports/v8/shadow/shadowmap-viewer.png"
  },
  {
    path: "/apps/v8-webgpu-rtt/",
    label: "V8 WebGPU RTT",
    requiresFrameProgress: true,
    threeExample: "https://threejs.org/examples/#webgpu_rtt",
    screenshotPath: "tests/reports/v8/webgpu/rtt.png"
  },
  {
    path: "/apps/v8-webgpu-materials/",
    label: "V8 WebGPU Materials",
    requiresFrameProgress: true,
    threeExample: "https://threejs.org/examples/#webgpu_materials",
    screenshotPath: "tests/reports/v8/webgpu/materials.png"
  },
  {
    path: "/apps/v8-webgpu-instance-uniform/",
    label: "V8 WebGPU Instance Uniform",
    requiresFrameProgress: true,
    threeExample: "https://threejs.org/examples/#webgpu_instance_uniform",
    screenshotPath: "tests/reports/v8/webgpu/instance-uniform.png"
  },
  {
    path: "/apps/v8-webgpu-compute/",
    label: "V8 WebGPU Compute",
    requiresFrameProgress: true,
    threeExample: "https://threejs.org/examples/#webgpu_compute",
    screenshotPath: "tests/reports/v8/webgpu/compute.png"
  },
  {
    path: "/apps/v8-webxr-interactions/",
    label: "V8 WebXR Interactions",
    requiresFrameProgress: true,
    threeExample: "https://threejs.org/examples/#webxr_vr_ballshooter",
    screenshotPath: "tests/reports/v8/webxr/interactions.png"
  },
  {
    path: "/apps/v8-postprocessing-bloom/",
    label: "V8 Postprocessing Bloom",
    requiresFrameProgress: true,
    threeExample: "https://threejs.org/examples/#webgl_postprocessing_unreal_bloom",
    screenshotPath: "tests/reports/v8/postprocessing/bloom.png"
  },
  {
    path: "/apps/v8-postprocessing-depth-outline/",
    label: "V8 Postprocessing Depth Outline",
    requiresFrameProgress: true,
    threeExample: "https://threejs.org/examples/#webgl_postprocessing_outline",
    screenshotPath: "tests/reports/v8/postprocessing/depth-outline.png",
    settleMs: 1_600
  }
];

test.describe("V8 animation/example routes", () => {
  test.setTimeout(120_000);

  const report: unknown[] = [];

  test.afterAll(() => {
    mkdirSync(resolve("tests/reports"), { recursive: true });
    writeFileSync(resolve(REPORT_PATH), `${JSON.stringify({
      schema: "g3d-v8-animation-examples/v1",
      generatedAt: new Date().toISOString(),
      origin: ORIGIN,
      routes: report
    }, null, 2)}\n`);
  });

  for (const expected of EXPECTED_ROUTES) {
    test(`${expected.label} is a working G3D-only route`, async ({ page }) => {
      const consoleErrors: string[] = [];
      const responseErrors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error" && !isIgnorableConsoleError(message.text())) consoleErrors.push(message.text());
      });
      page.on("pageerror", (error) => consoleErrors.push(error.stack ?? error.message));
      page.on("response", (response) => {
        if (response.status() >= 400 && !/\/favicon\.ico$/.test(response.url())) {
          responseErrors.push(`${response.status()} ${response.url()}`);
        }
      });

      await page.setViewportSize({ width: 1440, height: 1000 });
      const response = await page.goto(`${ORIGIN}${expected.path}`, { waitUntil: "domcontentloaded" });
      expect(response?.status(), `${expected.path} must be directly reachable`).toBe(200);

      await page.waitForFunction(() => {
        const runtime = readAnyG3DRuntime();
        return runtime?.status === "ready" || runtime?.status === "running" || runtime?.status === "error";

        function readAnyG3DRuntime(): { status?: string } | undefined {
          return Object.entries(window as unknown as Record<string, unknown>)
            .filter(([key, value]) => /^__(?:g3d|G3D|GALILEO3D)/.test(key) && typeof value === "object" && value !== null)
            .map(([, value]) => value as { status?: string })
            .find((value) => typeof value.status === "string");
        }
      }, undefined, { timeout: expected.readyTimeoutMs ?? 10_000 });

      await page.waitForTimeout(expected.settleMs ?? 800);
      const runtime = await page.evaluate(() => {
        const entries = Object.entries(window as unknown as Record<string, unknown>)
          .filter(([key, value]) => /^__(?:g3d|G3D|GALILEO3D)/.test(key) && typeof value === "object" && value !== null);
        const [runtimeKey, value] = entries.find(([, item]) => {
          const status = (item as { status?: unknown }).status;
          return status === "ready" || status === "running";
        }) ?? entries[0] ?? [null, null];
        const runtime = value as RuntimeProbe | null;
        return {
          runtimeKey,
          status: runtime?.status ?? null,
          drawCalls: firstNumber([
            runtime?.drawCalls,
            runtime?.runtime?.drawCalls,
            runtime?.diagnostics?.drawCalls,
            runtime?.proof?.diagnostics?.drawCalls
          ]),
          frameCount: firstNumber([
            runtime?.frameCount,
            runtime?.runtime?.animationFrameCount,
            runtime?.animationFrameCount
          ]),
          skinningPalettesUpdated: firstNumber([
            runtime?.skinningPalettesUpdated,
            runtime?.runtime?.skinningPalettesUpdated
          ]),
          morphWeightTracksApplied: firstNumber([
            runtime?.morphWeightTracksApplied,
            runtime?.runtime?.morphWeightTracksApplied
          ]),
          decoderDecodeCount: firstNumber([
            runtime?.decoderDecodeCount,
            runtime?.runtime?.decoderDecodeCount
          ]),
          meshoptDecodeCount: firstNumber([
            runtime?.meshoptDecodeCount,
            runtime?.runtime?.meshoptDecodeCount
          ]),
          dracoDecodeCount: firstNumber([
            runtime?.dracoDecodeCount,
            runtime?.runtime?.dracoDecodeCount
          ]),
          dracoDecoderKind: typeof runtime?.dracoDecoderKind === "string"
            ? runtime.dracoDecoderKind
            : typeof runtime?.runtime?.dracoDecoderKind === "string"
              ? runtime.runtime.dracoDecoderKind
              : null,
          motionSamples: firstNumber([
            runtime?.motionSamples,
            runtime?.runtime?.motionSamples
          ]),
          motionTimeRange: firstNumber([
            runtime?.motionTimeRange,
            runtime?.runtime?.motionTimeRange
          ]),
          poseDiversityScore: firstNumber([
            runtime?.poseDiversityScore,
            runtime?.runtime?.poseDiversityScore
          ]),
          motionHealthy: typeof runtime?.motionHealthy === "boolean"
            ? runtime.motionHealthy
            : typeof runtime?.runtime?.motionHealthy === "boolean"
              ? runtime.runtime.motionHealthy
              : null,
          unsupportedRequiredCount: Array.isArray(runtime?.unsupportedRequired)
            ? runtime.unsupportedRequired.length
            : Array.isArray(runtime?.runtime?.unsupportedRequired)
              ? runtime.runtime.unsupportedRequired.length
              : null,
          instanceCount: firstNumber([
            runtime?.instanceCount,
            runtime?.runtime?.instanceCount
          ]),
          instancedRenderableCount: firstNumber([
            runtime?.instancedRenderableCount,
            runtime?.runtime?.instancedRenderableCount
          ]),
          instanceAttributeBuffers: firstNumber([
            runtime?.instanceAttributeBuffers,
            runtime?.runtime?.instanceAttributeBuffers
          ]),
          instanceAttributeBytes: firstNumber([
            runtime?.instanceAttributeBytes,
            runtime?.runtime?.instanceAttributeBytes
          ]),
          sceneRenderableCount: firstNumber([
            runtime?.sceneRenderableCount,
            runtime?.runtime?.sceneRenderableCount
          ]),
          publicSceneInstancedMesh: typeof runtime?.publicSceneInstancedMesh === "boolean"
            ? runtime.publicSceneInstancedMesh
            : typeof runtime?.runtime?.publicSceneInstancedMesh === "boolean"
              ? runtime.runtime.publicSceneInstancedMesh
              : null,
          clearcoatMaterials: firstNumber([
            runtime?.clearcoatMaterials,
            runtime?.runtime?.clearcoatMaterials
          ]),
          sheenMaterials: firstNumber([
            runtime?.sheenMaterials,
            runtime?.runtime?.sheenMaterials
          ]),
          transmissionMaterials: firstNumber([
            runtime?.transmissionMaterials,
            runtime?.runtime?.transmissionMaterials
          ]),
          transparentMaterials: firstNumber([
            runtime?.transparentMaterials,
            runtime?.runtime?.transparentMaterials
          ]),
          textureCount: firstNumber([
            runtime?.textureCount,
            runtime?.runtime?.textureCount
          ]),
          samplerAnisotropyUploads: firstNumber([
            runtime?.samplerAnisotropyUploads,
            runtime?.runtime?.samplerAnisotropyUploads
          ]),
          maxTextureAnisotropy: firstNumber([
            runtime?.maxTextureAnisotropy,
            runtime?.runtime?.maxTextureAnisotropy
          ]),
          samplerMaxAnisotropy: firstNumber([
            runtime?.samplerMaxAnisotropy,
            runtime?.runtime?.samplerMaxAnisotropy
          ]),
          outputNonDarkPixels: firstNumber([
            runtime?.outputNonDarkPixels,
            runtime?.runtime?.outputNonDarkPixels
          ]),
          outputBrightPixels: firstNumber([
            runtime?.outputBrightPixels,
            runtime?.runtime?.outputBrightPixels
          ]),
          bloomEnabled: typeof runtime?.bloomEnabled === "boolean"
            ? runtime.bloomEnabled
            : typeof runtime?.runtime?.bloomEnabled === "boolean"
              ? runtime.runtime.bloomEnabled
              : null,
          outlineEnabled: typeof runtime?.outlineEnabled === "boolean"
            ? runtime.outlineEnabled
            : typeof runtime?.runtime?.outlineEnabled === "boolean"
              ? runtime.runtime.outlineEnabled
              : null,
          depthOfFieldEnabled: typeof runtime?.depthOfFieldEnabled === "boolean"
            ? runtime.depthOfFieldEnabled
            : typeof runtime?.runtime?.depthOfFieldEnabled === "boolean"
              ? runtime.runtime.depthOfFieldEnabled
              : null,
          stereoRigSource: typeof runtime?.stereoRigSource === "string"
            ? runtime.stereoRigSource
            : typeof runtime?.runtime?.stereoRigSource === "string"
              ? runtime.runtime.stereoRigSource
              : null,
          stereoRigViews: firstNumber([
            runtime?.stereoRigViews,
            runtime?.runtime?.stereoRigViews
          ]),
          effectPlanSource: typeof runtime?.effectPlanSource === "string"
            ? runtime.effectPlanSource
            : typeof runtime?.runtime?.effectPlanSource === "string"
              ? runtime.runtime.effectPlanSource
              : null,
          effectComposition: typeof runtime?.effectComposition === "string"
            ? runtime.effectComposition
            : typeof runtime?.runtime?.effectComposition === "string"
              ? runtime.runtime.effectComposition
              : null,
          interleaveAxis: typeof runtime?.interleaveAxis === "string"
            ? runtime.interleaveAxis
            : typeof runtime?.runtime?.interleaveAxis === "string"
              ? runtime.runtime.interleaveAxis
              : null,
          ssaoEnabled: typeof runtime?.ssaoEnabled === "boolean"
            ? runtime.ssaoEnabled
            : typeof runtime?.runtime?.ssaoEnabled === "boolean"
              ? runtime.runtime.ssaoEnabled
              : null,
          outputColorBuckets: firstNumber([
            runtime?.outputColorBuckets,
            runtime?.runtime?.outputColorBuckets
          ]),
          edgeContrastPixels: firstNumber([
            runtime?.edgeContrastPixels,
            runtime?.runtime?.edgeContrastPixels
          ]),
          cubeCount: firstNumber([
            runtime?.cubeCount,
            runtime?.runtime?.cubeCount
          ]),
          pointCount: firstNumber([
            runtime?.pointCount,
            runtime?.runtime?.pointCount
          ]),
          cubePickHits: firstNumber([
            runtime?.cubePickHits,
            runtime?.runtime?.cubePickHits
          ]),
          pointPickHits: firstNumber([
            runtime?.pointPickHits,
            runtime?.runtime?.pointPickHits
          ]),
          projectedDecalVertices: firstNumber([
            runtime?.projectedDecalVertices,
            runtime?.runtime?.projectedDecalVertices
          ]),
          projectedDecalTriangles: firstNumber([
            runtime?.projectedDecalTriangles,
            runtime?.runtime?.projectedDecalTriangles
          ]),
          decalCount: firstNumber([
            runtime?.decalCount,
            runtime?.runtime?.decalCount
          ]),
          decalBlendMode: typeof runtime?.decalBlendMode === "string"
            ? runtime.decalBlendMode
            : typeof runtime?.runtime?.decalBlendMode === "string"
              ? runtime.runtime.decalBlendMode
              : null,
          decalShape: typeof runtime?.decalShape === "string"
            ? runtime.decalShape
            : typeof runtime?.runtime?.decalShape === "string"
              ? runtime.runtime.decalShape
              : null,
          blendedDecalMaterials: firstNumber([
            runtime?.blendedDecalMaterials,
            runtime?.runtime?.blendedDecalMaterials
          ]),
          decalDepthWriteDisabled: typeof runtime?.decalDepthWriteDisabled === "boolean"
            ? runtime.decalDepthWriteDisabled
            : typeof runtime?.runtime?.decalDepthWriteDisabled === "boolean"
              ? runtime.runtime.decalDepthWriteDisabled
              : null,
          decalCullMode: typeof runtime?.decalCullMode === "string"
            ? runtime.decalCullMode
            : typeof runtime?.runtime?.decalCullMode === "string"
              ? runtime.runtime.decalCullMode
              : null,
          decalPolygonOffsetEnabled: typeof runtime?.decalPolygonOffsetEnabled === "boolean"
            ? runtime.decalPolygonOffsetEnabled
            : typeof runtime?.runtime?.decalPolygonOffsetEnabled === "boolean"
              ? runtime.runtime.decalPolygonOffsetEnabled
              : null,
          nearestCubeId: typeof runtime?.nearestCubeId === "string"
            ? runtime.nearestCubeId
            : typeof runtime?.runtime?.nearestCubeId === "string"
              ? runtime.runtime.nearestCubeId
              : null,
          nearestPointIndex: firstNumber([
            runtime?.nearestPointIndex,
            runtime?.runtime?.nearestPointIndex
          ]),
          indexedRangeStart: firstNumber([
            runtime?.indexedRangeStart,
            runtime?.runtime?.indexedRangeStart
          ]),
          indexedRangeCount: firstNumber([
            runtime?.indexedRangeCount,
            runtime?.runtime?.indexedRangeCount
          ]),
          indexedTotalCount: firstNumber([
            runtime?.indexedTotalCount,
            runtime?.runtime?.indexedTotalCount
          ]),
          arrayRangeStart: firstNumber([
            runtime?.arrayRangeStart,
            runtime?.runtime?.arrayRangeStart
          ]),
          arrayRangeCount: firstNumber([
            runtime?.arrayRangeCount,
            runtime?.runtime?.arrayRangeCount
          ]),
          arrayTotalCount: firstNumber([
            runtime?.arrayTotalCount,
            runtime?.runtime?.arrayTotalCount
          ]),
          usesIndexedRange: typeof runtime?.usesIndexedRange === "boolean"
            ? runtime.usesIndexedRange
            : typeof runtime?.runtime?.usesIndexedRange === "boolean"
              ? runtime.runtime.usesIndexedRange
              : null,
          usesArrayRange: typeof runtime?.usesArrayRange === "boolean"
            ? runtime.usesArrayRange
            : typeof runtime?.runtime?.usesArrayRange === "boolean"
              ? runtime.runtime.usesArrayRange
              : null,
          helperCount: firstNumber([
            runtime?.helperCount,
            runtime?.runtime?.helperCount
          ]),
          lineCount: firstNumber([
            runtime?.lineCount,
            runtime?.runtime?.lineCount
          ]),
          transmissionFactor: firstNumber([
            runtime?.transmissionFactor,
            runtime?.runtime?.transmissionFactor
          ]),
          ior: firstNumber([
            runtime?.ior,
            runtime?.runtime?.ior
          ]),
          volumeThicknessFactor: firstNumber([
            runtime?.volumeThicknessFactor,
            runtime?.runtime?.volumeThicknessFactor
          ]),
          attenuationBlueBias: firstNumber([
            runtime?.attenuationBlueBias,
            runtime?.runtime?.attenuationBlueBias
          ]),
          postprocessChain: Array.isArray(runtime?.postprocessChain)
            ? runtime.postprocessChain
            : Array.isArray(runtime?.runtime?.postprocessChain)
              ? runtime.runtime.postprocessChain
              : [],
          compressedTextureCount: firstNumber([
            runtime?.compressedTextureCount,
            runtime?.runtime?.compressedTextureCount
          ]),
          textureMipLevels: firstNumber([
            runtime?.textureMipLevels,
            runtime?.runtime?.textureMipLevels
          ]),
          fallbackMipLevels: firstNumber([
            runtime?.fallbackMipLevels,
            runtime?.runtime?.fallbackMipLevels
          ]),
          compressedTextureBytes: firstNumber([
            runtime?.compressedTextureBytes,
            runtime?.runtime?.compressedTextureBytes
          ]),
          fallbackTextureBytes: firstNumber([
            runtime?.fallbackTextureBytes,
            runtime?.runtime?.fallbackTextureBytes
          ]),
          ktx2SourceBytes: firstNumber([
            runtime?.ktx2SourceBytes,
            runtime?.runtime?.ktx2SourceBytes
          ]),
          textureFormat: typeof runtime?.textureFormat === "string"
            ? runtime.textureFormat
            : typeof runtime?.runtime?.textureFormat === "string"
              ? runtime.runtime.textureFormat
              : null,
          variantCount: firstNumber([
            runtime?.variantCount,
            runtime?.runtime?.variantCount
          ]),
          materialVariantNames: Array.isArray(runtime?.materialVariantNames)
            ? runtime.materialVariantNames
            : Array.isArray(runtime?.runtime?.materialVariantNames)
              ? runtime.runtime.materialVariantNames
              : [],
          activeVariant: typeof runtime?.activeVariant === "string"
            ? runtime.activeVariant
            : typeof runtime?.runtime?.activeVariant === "string"
              ? runtime.runtime.activeVariant
              : null,
          selectedMaterialName: typeof runtime?.selectedMaterialName === "string"
            ? runtime.selectedMaterialName
            : typeof runtime?.runtime?.selectedMaterialName === "string"
              ? runtime.runtime.selectedMaterialName
              : null,
          sceneSelectedMaterials: Array.isArray(runtime?.sceneSelectedMaterials)
            ? runtime.sceneSelectedMaterials
            : Array.isArray(runtime?.runtime?.sceneSelectedMaterials)
              ? runtime.runtime.sceneSelectedMaterials
              : [],
          collectedLightCount: firstNumber([
            runtime?.collectedLightCount,
            runtime?.runtime?.collectedLightCount
          ]),
          spotLightCount: firstNumber([
            runtime?.spotLightCount,
            runtime?.runtime?.spotLightCount
          ]),
          spotAngle: firstNumber([
            runtime?.spotAngle,
            runtime?.runtime?.spotAngle
          ]),
          spotPenumbra: firstNumber([
            runtime?.spotPenumbra,
            runtime?.runtime?.spotPenumbra
          ]),
          spotRange: firstNumber([
            runtime?.spotRange,
            runtime?.runtime?.spotRange
          ]),
          spotCastsShadow: typeof runtime?.spotCastsShadow === "boolean"
            ? runtime.spotCastsShadow
            : typeof runtime?.runtime?.spotCastsShadow === "boolean"
              ? runtime.runtime.spotCastsShadow
              : null,
          rendererShadowRequested: typeof runtime?.rendererShadowRequested === "boolean"
            ? runtime.rendererShadowRequested
            : typeof runtime?.runtime?.rendererShadowRequested === "boolean"
              ? runtime.runtime.rendererShadowRequested
              : null,
          firstLightKind: typeof runtime?.firstLightKind === "string"
            ? runtime.firstLightKind
            : typeof runtime?.runtime?.firstLightKind === "string"
              ? runtime.runtime.firstLightKind
              : null,
          rotationX: firstNumber([
            runtime?.rotationX,
            runtime?.runtime?.rotationX
          ]),
          rotationY: firstNumber([
            runtime?.rotationY,
            runtime?.runtime?.rotationY
          ]),
          rotationZ: firstNumber([
            runtime?.rotationZ,
            runtime?.runtime?.rotationZ
          ]),
          targetX: firstNumber([
            runtime?.targetX,
            runtime?.runtime?.targetX
          ]),
          targetY: firstNumber([
            runtime?.targetY,
            runtime?.runtime?.targetY
          ]),
          positionZ: firstNumber([
            runtime?.positionZ,
            runtime?.runtime?.positionZ
          ]),
          trackballRollApplied: typeof runtime?.trackballRollApplied === "boolean"
            ? runtime.trackballRollApplied
            : typeof runtime?.runtime?.trackballRollApplied === "boolean"
              ? runtime.runtime.trackballRollApplied
              : null,
          rotateEnabled: typeof runtime?.rotateEnabled === "boolean"
            ? runtime.rotateEnabled
            : typeof runtime?.runtime?.rotateEnabled === "boolean"
              ? runtime.runtime.rotateEnabled
              : null,
          panEnabled: typeof runtime?.panEnabled === "boolean"
            ? runtime.panEnabled
            : typeof runtime?.runtime?.panEnabled === "boolean"
              ? runtime.runtime.panEnabled
              : null,
          zoomEnabled: typeof runtime?.zoomEnabled === "boolean"
            ? runtime.zoomEnabled
            : typeof runtime?.runtime?.zoomEnabled === "boolean"
              ? runtime.runtime.zoomEnabled
              : null,
          shadowRendered: typeof runtime?.shadowRendered === "boolean"
            ? runtime.shadowRendered
            : typeof runtime?.runtime?.shadowRendered === "boolean"
              ? runtime.runtime.shadowRendered
              : null,
          shadowTextureKind: typeof runtime?.shadowTextureKind === "string"
            ? runtime.shadowTextureKind
            : typeof runtime?.runtime?.shadowTextureKind === "string"
              ? runtime.runtime.shadowTextureKind
              : null,
          shadowMapSize: firstNumber([
            runtime?.shadowMapSize,
            runtime?.runtime?.shadowMapSize
          ]),
          casterCount: firstNumber([
            runtime?.casterCount,
            runtime?.runtime?.casterCount
          ]),
          skippedTransparentCasters: firstNumber([
            runtime?.skippedTransparentCasters,
            runtime?.runtime?.skippedTransparentCasters
          ]),
          depthMin: firstNumber([
            runtime?.depthMin,
            runtime?.runtime?.depthMin
          ]),
          depthMax: firstNumber([
            runtime?.depthMax,
            runtime?.runtime?.depthMax
          ]),
          depthNonDefaultPixels: firstNumber([
            runtime?.depthNonDefaultPixels,
            runtime?.runtime?.depthNonDefaultPixels
          ]),
          pcfSamples: firstNumber([
            runtime?.pcfSamples,
            runtime?.runtime?.pcfSamples
          ]),
          pcfRadius: firstNumber([
            runtime?.pcfRadius,
            runtime?.runtime?.pcfRadius
          ]),
          objNativeImport: typeof runtime?.objNativeImport === "boolean"
            ? runtime.objNativeImport
            : typeof runtime?.runtime?.objNativeImport === "boolean"
              ? runtime.runtime.objNativeImport
              : null,
          objTriangulatedFaces: typeof runtime?.objTriangulatedFaces === "boolean"
            ? runtime.objTriangulatedFaces
            : typeof runtime?.runtime?.objTriangulatedFaces === "boolean"
              ? runtime.runtime.objTriangulatedFaces
              : null,
          objGeneratedNormals: typeof runtime?.objGeneratedNormals === "boolean"
            ? runtime.objGeneratedNormals
            : typeof runtime?.runtime?.objGeneratedNormals === "boolean"
              ? runtime.runtime.objGeneratedNormals
              : null,
          objTexcoords: typeof runtime?.objTexcoords === "boolean"
            ? runtime.objTexcoords
            : typeof runtime?.runtime?.objTexcoords === "boolean"
              ? runtime.runtime.objTexcoords
              : null,
          featureCount: firstNumber([
            runtime?.featureCount,
            runtime?.runtime?.featureCount
          ]),
          elementCount: firstNumber([
            runtime?.elementCount,
            runtime?.runtime?.elementCount
          ]),
          viewCount: firstNumber([
            runtime?.viewCount,
            runtime?.runtime?.viewCount
          ]),
          cameraCount: firstNumber([
            runtime?.cameraCount,
            runtime?.runtime?.cameraCount
          ]),
          sharedSceneGeometry: typeof runtime?.sharedSceneGeometry === "boolean"
            ? runtime.sharedSceneGeometry
            : typeof runtime?.runtime?.sharedSceneGeometry === "boolean"
              ? runtime.runtime.sharedSceneGeometry
              : null,
          distinctCameraViews: typeof runtime?.distinctCameraViews === "boolean"
            ? runtime.distinctCameraViews
            : typeof runtime?.runtime?.distinctCameraViews === "boolean"
              ? runtime.runtime.distinctCameraViews
              : null,
          viewLabels: Array.isArray(runtime?.viewLabels)
            ? runtime.viewLabels
            : Array.isArray(runtime?.runtime?.viewLabels)
              ? runtime.runtime.viewLabels
              : [],
          renderTargetWidth: firstNumber([
            runtime?.renderTargetWidth,
            runtime?.runtime?.renderTargetWidth
          ]),
          renderTargetHeight: firstNumber([
            runtime?.renderTargetHeight,
            runtime?.runtime?.renderTargetHeight
          ]),
          renderTargetFormat: typeof runtime?.renderTargetFormat === "string"
            ? runtime.renderTargetFormat
            : typeof runtime?.runtime?.renderTargetFormat === "string"
              ? runtime.runtime.renderTargetFormat
              : null,
          hasDepthTexture: typeof runtime?.hasDepthTexture === "boolean"
            ? runtime.hasDepthTexture
            : typeof runtime?.runtime?.hasDepthTexture === "boolean"
              ? runtime.runtime.hasDepthTexture
              : null,
          readbackMatchesPresentation: typeof runtime?.readbackMatchesPresentation === "boolean"
            ? runtime.readbackMatchesPresentation
            : typeof runtime?.runtime?.readbackMatchesPresentation === "boolean"
              ? runtime.runtime.readbackMatchesPresentation
              : null,
          disposedRenderTargets: firstNumber([
            runtime?.disposedRenderTargets,
            runtime?.runtime?.disposedRenderTargets
          ]),
          disposedTextures: firstNumber([
            runtime?.disposedTextures,
            runtime?.runtime?.disposedTextures
          ]),
          evidenceMode: typeof runtime?.evidenceMode === "string"
            ? runtime.evidenceMode
            : typeof runtime?.runtime?.evidenceMode === "string"
              ? runtime.runtime.evidenceMode
              : null,
          materialCount: firstNumber([
            runtime?.materialCount,
            runtime?.runtime?.materialCount
          ]),
          pbrMaterialCount: firstNumber([
            runtime?.pbrMaterialCount,
            runtime?.runtime?.pbrMaterialCount
          ]),
          texturedMaterialCount: firstNumber([
            runtime?.texturedMaterialCount,
            runtime?.runtime?.texturedMaterialCount
          ]),
          textureBindingCount: firstNumber([
            runtime?.textureBindingCount,
            runtime?.runtime?.textureBindingCount
          ]),
          nativePbrSubmissions: firstNumber([
            runtime?.nativePbrSubmissions,
            runtime?.runtime?.nativePbrSubmissions
          ]),
          nativeTextureBindings: firstNumber([
            runtime?.nativeTextureBindings,
            runtime?.runtime?.nativeTextureBindings
          ]),
          nativeInstancedSubmissions: firstNumber([
            runtime?.nativeInstancedSubmissions,
            runtime?.runtime?.nativeInstancedSubmissions
          ]),
          instanceUniformMatrices: firstNumber([
            runtime?.instanceUniformMatrices,
            runtime?.runtime?.instanceUniformMatrices
          ]),
          instanceDrawCalls: firstNumber([
            runtime?.instanceDrawCalls,
            runtime?.runtime?.instanceDrawCalls
          ]),
          particleCount: firstNumber([
            runtime?.particleCount,
            runtime?.runtime?.particleCount
          ]),
          computeDispatches: firstNumber([
            runtime?.computeDispatches,
            runtime?.runtime?.computeDispatches
          ]),
          computeWorkgroups: firstNumber([
            runtime?.computeWorkgroups,
            runtime?.runtime?.computeWorkgroups
          ]),
          storageBuffers: firstNumber([
            runtime?.storageBuffers,
            runtime?.runtime?.storageBuffers
          ]),
          readbackBuffers: firstNumber([
            runtime?.readbackBuffers,
            runtime?.runtime?.readbackBuffers
          ]),
          maxParticleDelta: firstNumber([
            runtime?.maxParticleDelta,
            runtime?.runtime?.maxParticleDelta
          ]),
          maxVelocityDelta: firstNumber([
            runtime?.maxVelocityDelta,
            runtime?.runtime?.maxVelocityDelta
          ]),
          xrSessionStarted: typeof runtime?.xrSessionStarted === "boolean"
            ? runtime.xrSessionStarted
            : typeof runtime?.runtime?.xrSessionStarted === "boolean"
              ? runtime.runtime.xrSessionStarted
              : null,
          xrModeCount: firstNumber([
            runtime?.xrModeCount,
            runtime?.runtime?.xrModeCount
          ]),
          controllerCount: firstNumber([
            runtime?.controllerCount,
            runtime?.runtime?.controllerCount
          ]),
          triggerPressedCount: firstNumber([
            runtime?.triggerPressedCount,
            runtime?.runtime?.triggerPressedCount
          ]),
          ballShots: firstNumber([
            runtime?.ballShots,
            runtime?.runtime?.ballShots
          ]),
          draggedObjects: firstNumber([
            runtime?.draggedObjects,
            runtime?.runtime?.draggedObjects
          ]),
          arCones: firstNumber([
            runtime?.arCones,
            runtime?.runtime?.arCones
          ]),
          hitTestCount: firstNumber([
            runtime?.hitTestCount,
            runtime?.runtime?.hitTestCount
          ]),
          realDeviceClaimed: typeof runtime?.realDeviceClaimed === "boolean"
            ? runtime.realDeviceClaimed
            : typeof runtime?.runtime?.realDeviceClaimed === "boolean"
              ? runtime.runtime.realDeviceClaimed
              : null,
          clipName: typeof runtime?.clipName === "string"
            ? runtime.clipName
            : typeof runtime?.runtime?.animationClipName === "string"
              ? runtime.runtime.animationClipName
              : null,
          usesThree: Boolean(Array.from(document.querySelectorAll("script")).some((script) => /three/i.test(script.src)))
        };

        function firstNumber(values: readonly unknown[]): number | null {
          for (const value of values) {
            if (typeof value === "number" && Number.isFinite(value)) return value;
          }
          return null;
        }
      });
      const canvasMotionDelta = isAnimationMotionRoute(expected.label) ? await measureCanvasMotion(page) : null;

      const result = {
        ...expected,
        runtime,
        canvasMotionDelta,
        consoleErrors,
        responseErrors,
        screenshot: expected.screenshotPath
      };
      report.push(result);

      expect(runtime.status, JSON.stringify(result, null, 2)).not.toBe("error");
      expect(runtime.usesThree, JSON.stringify(result, null, 2)).toBe(false);
      expect(runtime.drawCalls ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
      if (expected.requiresFrameProgress) {
        expect(runtime.frameCount ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(5);
      }
      if (/Skinning/.test(expected.label)) {
        expect(runtime.skinningPalettesUpdated ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
      }
      if (/Morph/.test(expected.label)) {
        expect(runtime.morphWeightTracksApplied ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
      }
      if (/Animation Keyframes|Animation Multiple|Animation Walk|Skinning|Morph/.test(expected.label)) {
        expect(runtime.motionSamples ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThanOrEqual(6);
        expect(runtime.motionTimeRange ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0.1);
        expect(runtime.poseDiversityScore ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0.01);
        expect(runtime.motionHealthy, JSON.stringify(result, null, 2)).toBe(true);
        expect(canvasMotionDelta ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0.05);
      }
      if (/Loader Compression/.test(expected.label)) {
        expect(runtime.decoderDecodeCount ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(runtime.meshoptDecodeCount ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(runtime.dracoDecodeCount ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(runtime.dracoDecoderKind, JSON.stringify(result, null, 2)).toBe("draco3d-browser-wasm");
        expect(runtime.unsupportedRequiredCount ?? 0, JSON.stringify(result, null, 2)).toBe(0);
      }
      if (/Loader Instancing/.test(expected.label)) {
        expect(runtime.instanceCount ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(1);
        expect(runtime.instancedRenderableCount ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(runtime.unsupportedRequiredCount ?? 0, JSON.stringify(result, null, 2)).toBe(0);
      }
      if (/Instancing Performance/.test(expected.label)) {
        expect(runtime.instanceCount ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThanOrEqual(3000);
        expect(runtime.drawCalls ?? 99, JSON.stringify(result, null, 2)).toBeLessThanOrEqual(1);
        expect(runtime.instanceAttributeBuffers ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(runtime.instanceAttributeBytes ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(runtime.sceneRenderableCount ?? 0, JSON.stringify(result, null, 2)).toBe(1);
        expect(runtime.publicSceneInstancedMesh, JSON.stringify(result, null, 2)).toBe(true);
      }
      if (/Texture Anisotropy/.test(expected.label)) {
        expect(runtime.textureCount ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(runtime.samplerMaxAnisotropy ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(1);
        expect(runtime.maxTextureAnisotropy ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(1);
        expect(runtime.samplerAnisotropyUploads ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
      }
      if (/Postprocessing Bloom/.test(expected.label)) {
        expect(runtime.bloomEnabled, JSON.stringify(result, null, 2)).toBe(true);
        expect(runtime.postprocessChain, JSON.stringify(result, null, 2)).toContain("bloom");
        expect(runtime.outputNonDarkPixels ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(runtime.outputBrightPixels ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
      }
      if (/Postprocessing Depth Outline/.test(expected.label)) {
        expect(runtime.outlineEnabled, JSON.stringify(result, null, 2)).toBe(true);
        expect(runtime.depthOfFieldEnabled, JSON.stringify(result, null, 2)).toBe(true);
        expect(runtime.ssaoEnabled, JSON.stringify(result, null, 2)).toBe(true);
        expect(runtime.postprocessChain, JSON.stringify(result, null, 2)).toEqual(expect.arrayContaining(["outline", "depth-of-field", "ssao"]));
        expect(runtime.outputNonDarkPixels ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(runtime.outputColorBuckets ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(1);
        expect(runtime.edgeContrastPixels ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
      }
      if (/Stereo Effects|Parallax Barrier/.test(expected.label)) {
        expect(runtime.stereoRigSource, JSON.stringify(result, null, 2)).toBe("public-createStereoCameraRig");
        expect(runtime.stereoRigViews ?? 0, JSON.stringify(result, null, 2)).toBe(2);
        expect(runtime.effectPlanSource, JSON.stringify(result, null, 2)).toBe("public-createStereoEffectPlan");
        expect(runtime.effectComposition, JSON.stringify(result, null, 2)).toMatch(/dual-canvas|interleaved-mask|channel-composite|single-view-preview/);
      }
      if (/Interactive Picking/.test(expected.label)) {
        expect(runtime.cubeCount ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(4);
        expect(runtime.pointCount ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(4);
        expect(runtime.cubePickHits ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(runtime.pointPickHits ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(runtime.nearestCubeId, JSON.stringify(result, null, 2)).toMatch(/^cube-/);
        expect(runtime.nearestPointIndex ?? -1, JSON.stringify(result, null, 2)).toBeGreaterThanOrEqual(0);
      }
      if (/Decals/.test(expected.label)) {
        expect(runtime.decalCount ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(runtime.projectedDecalTriangles ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(runtime.projectedDecalVertices ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(runtime.decalBlendMode, JSON.stringify(result, null, 2)).toBe("alpha-blend");
        expect(runtime.decalShape, JSON.stringify(result, null, 2)).toBe("ellipse");
        expect(runtime.blendedDecalMaterials ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(runtime.decalDepthWriteDisabled, JSON.stringify(result, null, 2)).toBe(true);
        expect(runtime.decalCullMode, JSON.stringify(result, null, 2)).toBe("none");
        expect(runtime.decalPolygonOffsetEnabled, JSON.stringify(result, null, 2)).toBe(true);
      }
      if (/Controls Trackball/.test(expected.label)) {
        expect(Math.abs(runtime.rotationX ?? 0), JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(Math.abs(runtime.rotationY ?? 0), JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(Math.abs(runtime.rotationZ ?? 0), JSON.stringify(result, null, 2)).toBeGreaterThan(0.2);
        expect(Math.abs(runtime.targetX ?? 0), JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(Math.abs(runtime.targetY ?? 0), JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(runtime.positionZ ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(runtime.trackballRollApplied, JSON.stringify(result, null, 2)).toBe(true);
        expect(runtime.rotateEnabled, JSON.stringify(result, null, 2)).toBe(true);
        expect(runtime.panEnabled, JSON.stringify(result, null, 2)).toBe(true);
        expect(runtime.zoomEnabled, JSON.stringify(result, null, 2)).toBe(true);
      }
      if (/Geometry DrawRange/.test(expected.label)) {
        expect(runtime.usesIndexedRange, JSON.stringify(result, null, 2)).toBe(true);
        expect(runtime.usesArrayRange, JSON.stringify(result, null, 2)).toBe(true);
        expect(runtime.indexedRangeStart ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(runtime.indexedRangeCount ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(runtime.indexedRangeCount ?? 0, JSON.stringify(result, null, 2)).toBeLessThan(runtime.indexedTotalCount ?? 0);
        expect(runtime.arrayRangeStart ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(runtime.arrayRangeCount ?? 0, JSON.stringify(result, null, 2)).toBeLessThan(runtime.arrayTotalCount ?? 0);
      }
      if (/Lines Helpers/.test(expected.label)) {
        expect(runtime.helperCount ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThanOrEqual(5);
        expect(runtime.lineCount ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThanOrEqual(30);
      }
      if (/Materials Transmission/.test(expected.label)) {
        expect(runtime.transmissionFactor ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0.5);
        expect(runtime.ior ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(1);
        expect(runtime.volumeThicknessFactor ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(runtime.attenuationBlueBias ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(runtime.outputNonDarkPixels ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(runtime.outputColorBuckets ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(1);
      }
      if (/Lights Spotlight/.test(expected.label)) {
        expect(runtime.collectedLightCount ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThanOrEqual(1);
        expect(runtime.spotLightCount ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThanOrEqual(1);
        expect(runtime.spotAngle ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(runtime.spotPenumbra ?? -1, JSON.stringify(result, null, 2)).toBeGreaterThanOrEqual(0);
        expect(runtime.spotPenumbra ?? 2, JSON.stringify(result, null, 2)).toBeLessThanOrEqual(1);
        expect(runtime.spotRange ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(runtime.spotCastsShadow, JSON.stringify(result, null, 2)).toBe(true);
        expect(runtime.rendererShadowRequested, JSON.stringify(result, null, 2)).toBe(true);
        expect(runtime.firstLightKind, JSON.stringify(result, null, 2)).toBe("spot");
      }
      if (/Shadowmap Viewer/.test(expected.label)) {
        expect(runtime.shadowRendered, JSON.stringify(result, null, 2)).toBe(true);
        expect(runtime.shadowTextureKind, JSON.stringify(result, null, 2)).toBe("depth-texture");
        expect(runtime.shadowMapSize ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThanOrEqual(64);
        expect(runtime.casterCount ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(runtime.skippedTransparentCasters ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(runtime.depthMin ?? 1, JSON.stringify(result, null, 2)).toBeLessThan(0.999);
        expect(runtime.depthMax ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(runtime.depthNonDefaultPixels ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(runtime.pcfSamples ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(1);
        expect(runtime.pcfRadius ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
      }
      if (/Camera Multiple Views/.test(expected.label)) {
        expect(runtime.elementCount ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThanOrEqual(3);
        expect(runtime.viewCount ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThanOrEqual(3);
        expect(runtime.cameraCount ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThanOrEqual(3);
        expect(runtime.sharedSceneGeometry, JSON.stringify(result, null, 2)).toBe(true);
        expect(runtime.distinctCameraViews, JSON.stringify(result, null, 2)).toBe(true);
        expect(runtime.viewLabels, JSON.stringify(result, null, 2)).toEqual(expect.arrayContaining(["hero", "top", "detail"]));
      }
      if (/WebGPU RTT/.test(expected.label)) {
        expect(runtime.renderTargetWidth ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThanOrEqual(32);
        expect(runtime.renderTargetHeight ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThanOrEqual(32);
        expect(runtime.renderTargetFormat, JSON.stringify(result, null, 2)).toBe("rgba8");
        expect(runtime.hasDepthTexture, JSON.stringify(result, null, 2)).toBe(true);
        expect(runtime.readbackMatchesPresentation, JSON.stringify(result, null, 2)).toBe(true);
        expect(runtime.disposedRenderTargets ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThanOrEqual(1);
        expect(runtime.disposedTextures ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThanOrEqual(2);
        expect(runtime.evidenceMode, JSON.stringify(result, null, 2)).toBe("injected-webgpu-device");
      }
      if (/WebGPU Materials/.test(expected.label)) {
        expect(runtime.materialCount ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThanOrEqual(2);
        expect(runtime.pbrMaterialCount ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThanOrEqual(2);
        expect(runtime.texturedMaterialCount ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThanOrEqual(1);
        expect(runtime.textureBindingCount ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThanOrEqual(1);
        expect(runtime.nativePbrSubmissions ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThanOrEqual(1);
        expect(runtime.nativeTextureBindings ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThanOrEqual(1);
        expect(runtime.outputNonDarkPixels ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(runtime.outputColorBuckets ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(1);
        expect(runtime.evidenceMode, JSON.stringify(result, null, 2)).toBe("injected-webgpu-device");
      }
      if (/WebGPU Instance Uniform/.test(expected.label)) {
        expect(runtime.instanceCount ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThanOrEqual(4);
        expect(runtime.instanceUniformMatrices ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThanOrEqual(4);
        expect(runtime.instanceDrawCalls ?? 99, JSON.stringify(result, null, 2)).toBeLessThanOrEqual(1);
        expect(runtime.nativePbrSubmissions ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThanOrEqual(1);
        expect(runtime.nativeInstancedSubmissions ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThanOrEqual(1);
        expect(runtime.outputNonDarkPixels ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(runtime.outputColorBuckets ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(1);
        expect(runtime.evidenceMode, JSON.stringify(result, null, 2)).toBe("injected-webgpu-device");
      }
      if (/WebGPU Compute/.test(expected.label)) {
        expect(runtime.particleCount ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThanOrEqual(64);
        expect(runtime.computeDispatches ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThanOrEqual(1);
        expect(runtime.computeWorkgroups ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThanOrEqual(1);
        expect(runtime.storageBuffers ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThanOrEqual(4);
        expect(runtime.readbackBuffers ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThanOrEqual(2);
        expect(runtime.maxParticleDelta ?? 1, JSON.stringify(result, null, 2)).toBeLessThanOrEqual(1e-7);
        expect(runtime.maxVelocityDelta ?? 1, JSON.stringify(result, null, 2)).toBeLessThanOrEqual(1e-7);
        expect(runtime.outputNonDarkPixels ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(runtime.outputColorBuckets ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(1);
        expect(runtime.evidenceMode, JSON.stringify(result, null, 2)).toBe("injected-webgpu-device");
      }
      if (/WebXR Interactions/.test(expected.label)) {
        expect(runtime.xrSessionStarted, JSON.stringify(result, null, 2)).toBe(true);
        expect(runtime.xrModeCount ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThanOrEqual(3);
        expect(runtime.controllerCount ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThanOrEqual(2);
        expect(runtime.triggerPressedCount ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThanOrEqual(1);
        expect(runtime.ballShots ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThanOrEqual(1);
        expect(runtime.draggedObjects ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThanOrEqual(1);
        expect(runtime.arCones ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThanOrEqual(3);
        expect(runtime.hitTestCount ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThanOrEqual(3);
        expect(runtime.outputNonDarkPixels ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(runtime.outputColorBuckets ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(1);
        expect(runtime.evidenceMode, JSON.stringify(result, null, 2)).toBe("injected-webxr-session");
        expect(runtime.realDeviceClaimed, JSON.stringify(result, null, 2)).toBe(false);
      }
      if (/Loader Material Extensions/.test(expected.label)) {
        expect(runtime.clearcoatMaterials ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(runtime.sheenMaterials ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(runtime.transmissionMaterials ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(runtime.transparentMaterials ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(runtime.unsupportedRequiredCount ?? 0, JSON.stringify(result, null, 2)).toBe(0);
      }
      if (/Loader GLTF Variants/.test(expected.label)) {
        expect(runtime.variantCount ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThanOrEqual(2);
        expect(runtime.materialVariantNames, JSON.stringify(result, null, 2)).toEqual(expect.arrayContaining(["copper", "arctic"]));
        expect(runtime.sceneSelectedMaterials, JSON.stringify(result, null, 2)).toEqual(expect.arrayContaining(["base-material", "copper-material", "arctic-material"]));
        expect(runtime.selectedMaterialName, JSON.stringify(result, null, 2)).toMatch(/^(base|copper|arctic)-material$/);
        expect(runtime.unsupportedRequiredCount ?? 0, JSON.stringify(result, null, 2)).toBe(0);
      }
      if (/Loader KTX2/.test(expected.label)) {
        expect(runtime.textureCount ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(runtime.compressedTextureCount ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(runtime.textureFormat, JSON.stringify(result, null, 2)).toBe("etc2-rgba8unorm");
        expect(runtime.textureMipLevels ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(1);
        expect(runtime.fallbackMipLevels ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(runtime.compressedTextureBytes ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(runtime.fallbackTextureBytes ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(runtime.ktx2SourceBytes ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(runtime.unsupportedRequiredCount ?? 0, JSON.stringify(result, null, 2)).toBe(0);
      }
      if (/Loader OBJ/.test(expected.label)) {
        expect(runtime.objNativeImport, JSON.stringify(result, null, 2)).toBe(true);
        expect(runtime.objTriangulatedFaces, JSON.stringify(result, null, 2)).toBe(true);
        expect(runtime.objGeneratedNormals, JSON.stringify(result, null, 2)).toBe(true);
        expect(runtime.objTexcoords, JSON.stringify(result, null, 2)).toBe(true);
        expect(runtime.featureCount ?? 0, JSON.stringify(result, null, 2)).toBeGreaterThan(3);
      }
      expect(consoleErrors, JSON.stringify(result, null, 2)).toEqual([]);
      expect(responseErrors, JSON.stringify(result, null, 2)).toEqual([]);

      mkdirSync(resolve(expected.screenshotPath, ".."), { recursive: true });
      await page.screenshot({ path: expected.screenshotPath, fullPage: false });
    });
  }

  test("V8 Parallax Barrier mask mode uses renderer-owned pixel compositing", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const response = await page.goto(`${ORIGIN}/apps/v8-parallax-barrier/?mask=1`, { waitUntil: "domcontentloaded" });
    expect(response?.status(), "parallax barrier mask route must be directly reachable").toBe(200);
    await page.waitForFunction(() => {
      const runtime = window.__g3dV8ParallaxBarrier as {
        status?: string;
        barrierMaskEnabled?: boolean;
        effectComposition?: string;
        interleaveAxis?: string;
        stripPitchPx?: number;
        rendererCompositePixels?: number;
        compositeLeftPixels?: number;
        compositeRightPixels?: number;
      } | undefined;
      return (runtime?.status === "ready" || runtime?.status === "running") &&
        runtime.barrierMaskEnabled === true &&
        runtime.effectComposition === "renderer-owned-interleaved-pixels" &&
        runtime.interleaveAxis === "y" &&
        runtime.stripPitchPx === 2 &&
        (runtime.rendererCompositePixels ?? 0) > 0 &&
        (runtime.compositeLeftPixels ?? 0) > 0 &&
        (runtime.compositeRightPixels ?? 0) > 0;
    }, undefined, { timeout: 15_000 });
  });

  test("V8 Parallax Barrier defaults to a clean non-striped preview", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const response = await page.goto(`${ORIGIN}/apps/v8-parallax-barrier/`, { waitUntil: "domcontentloaded" });
    expect(response?.status(), "parallax barrier default route must be directly reachable").toBe(200);
    await page.waitForFunction(() => {
      const runtime = window.__g3dV8ParallaxBarrier as {
        status?: string;
        barrierMaskEnabled?: boolean;
        effectComposition?: string;
        rendererCompositePixels?: number;
      } | undefined;
      return (runtime?.status === "ready" || runtime?.status === "running") &&
        runtime.barrierMaskEnabled === false &&
        runtime.effectComposition === "single-view-preview" &&
        runtime.rendererCompositePixels === 0;
    }, undefined, { timeout: 15_000 });
    const compositeVisibility = await page.locator("#compositeViewport").evaluate((element) => getComputedStyle(element).visibility);
    expect(compositeVisibility).toBe("hidden");
  });
});

function isIgnorableConsoleError(message: string): boolean {
  return /^Failed to load resource: the server responded with a status of 404 \(Not Found\)$/.test(message);
}

function isAnimationMotionRoute(label: string): boolean {
  return /Animation Keyframes|Animation Multiple|Animation Walk|Skinning|Morph/.test(label);
}

async function measureCanvasMotion(page: Page): Promise<number> {
  const before = await readCanvasSample(page);
  await page.waitForTimeout(260);
  const after = await readCanvasSample(page);
  const length = Math.min(before.length, after.length);
  if (length === 0) return 0;
  let delta = 0;
  for (let index = 0; index < length; index += 1) {
    delta += Math.abs(after[index]! - before[index]!);
  }
  return Number((delta / length).toFixed(4));
}

async function readCanvasSample(page: Page): Promise<readonly number[]> {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!(canvas instanceof HTMLCanvasElement) || canvas.width <= 0 || canvas.height <= 0) return [];
    const width = 64;
    const height = 36;
    const scratch = document.createElement("canvas");
    scratch.width = width;
    scratch.height = height;
    const context = scratch.getContext("2d", { willReadFrequently: true });
    if (!context) return [];
    context.drawImage(canvas, 0, 0, width, height);
    const data = context.getImageData(0, 0, width, height).data;
    const sample: number[] = [];
    for (let index = 0; index < data.length; index += 4) {
      sample.push(data[index]!, data[index + 1]!, data[index + 2]!);
    }
    return sample;
  });
}

type RuntimeProbe = {
  readonly status?: unknown;
  readonly drawCalls?: unknown;
  readonly frameCount?: unknown;
  readonly animationFrameCount?: unknown;
  readonly skinningPalettesUpdated?: unknown;
  readonly morphWeightTracksApplied?: unknown;
  readonly decoderDecodeCount?: unknown;
  readonly meshoptDecodeCount?: unknown;
  readonly dracoDecodeCount?: unknown;
  readonly dracoDecoderKind?: unknown;
  readonly motionSamples?: unknown;
  readonly motionTimeRange?: unknown;
  readonly poseDiversityScore?: unknown;
  readonly motionHealthy?: unknown;
  readonly instanceCount?: unknown;
  readonly instancedRenderableCount?: unknown;
  readonly instanceAttributeBuffers?: unknown;
  readonly instanceAttributeBytes?: unknown;
  readonly sceneRenderableCount?: unknown;
  readonly publicSceneInstancedMesh?: unknown;
  readonly clearcoatMaterials?: unknown;
  readonly sheenMaterials?: unknown;
  readonly transmissionMaterials?: unknown;
  readonly transparentMaterials?: unknown;
  readonly textureCount?: unknown;
  readonly samplerAnisotropyUploads?: unknown;
  readonly maxTextureAnisotropy?: unknown;
  readonly samplerMaxAnisotropy?: unknown;
  readonly outputNonDarkPixels?: unknown;
  readonly outputBrightPixels?: unknown;
  readonly bloomEnabled?: unknown;
  readonly outlineEnabled?: unknown;
  readonly depthOfFieldEnabled?: unknown;
  readonly stereoRigSource?: unknown;
  readonly stereoRigViews?: unknown;
  readonly effectPlanSource?: unknown;
  readonly effectComposition?: unknown;
  readonly interleaveAxis?: unknown;
  readonly ssaoEnabled?: unknown;
  readonly postprocessChain?: unknown;
  readonly outputColorBuckets?: unknown;
  readonly edgeContrastPixels?: unknown;
  readonly cubeCount?: unknown;
  readonly pointCount?: unknown;
  readonly cubePickHits?: unknown;
  readonly pointPickHits?: unknown;
  readonly projectedDecalVertices?: unknown;
  readonly projectedDecalTriangles?: unknown;
  readonly decalCount?: unknown;
  readonly decalBlendMode?: unknown;
  readonly decalShape?: unknown;
  readonly blendedDecalMaterials?: unknown;
  readonly decalDepthWriteDisabled?: unknown;
  readonly decalCullMode?: unknown;
  readonly decalPolygonOffsetEnabled?: unknown;
  readonly nearestCubeId?: unknown;
  readonly nearestPointIndex?: unknown;
  readonly indexedRangeStart?: unknown;
  readonly indexedRangeCount?: unknown;
  readonly indexedTotalCount?: unknown;
  readonly arrayRangeStart?: unknown;
  readonly arrayRangeCount?: unknown;
  readonly arrayTotalCount?: unknown;
  readonly usesIndexedRange?: unknown;
  readonly usesArrayRange?: unknown;
  readonly helperCount?: unknown;
  readonly lineCount?: unknown;
  readonly transmissionFactor?: unknown;
  readonly ior?: unknown;
  readonly volumeThicknessFactor?: unknown;
  readonly attenuationBlueBias?: unknown;
  readonly compressedTextureCount?: unknown;
  readonly textureMipLevels?: unknown;
  readonly fallbackMipLevels?: unknown;
  readonly compressedTextureBytes?: unknown;
  readonly fallbackTextureBytes?: unknown;
  readonly ktx2SourceBytes?: unknown;
  readonly textureFormat?: unknown;
  readonly variantCount?: unknown;
  readonly materialVariantNames?: unknown;
  readonly activeVariant?: unknown;
  readonly selectedMaterialName?: unknown;
  readonly sceneSelectedMaterials?: unknown;
  readonly collectedLightCount?: unknown;
  readonly spotLightCount?: unknown;
  readonly spotAngle?: unknown;
  readonly spotPenumbra?: unknown;
  readonly spotRange?: unknown;
  readonly spotCastsShadow?: unknown;
  readonly rendererShadowRequested?: unknown;
  readonly firstLightKind?: unknown;
  readonly rotationX?: unknown;
  readonly rotationY?: unknown;
  readonly rotationZ?: unknown;
  readonly targetX?: unknown;
  readonly targetY?: unknown;
  readonly positionZ?: unknown;
  readonly trackballRollApplied?: unknown;
  readonly rotateEnabled?: unknown;
  readonly panEnabled?: unknown;
  readonly zoomEnabled?: unknown;
  readonly shadowRendered?: unknown;
  readonly shadowTextureKind?: unknown;
  readonly shadowMapSize?: unknown;
  readonly casterCount?: unknown;
  readonly skippedTransparentCasters?: unknown;
  readonly depthMin?: unknown;
  readonly depthMax?: unknown;
  readonly depthNonDefaultPixels?: unknown;
  readonly pcfSamples?: unknown;
  readonly pcfRadius?: unknown;
  readonly objNativeImport?: unknown;
  readonly objTriangulatedFaces?: unknown;
  readonly objGeneratedNormals?: unknown;
  readonly objTexcoords?: unknown;
  readonly featureCount?: unknown;
  readonly elementCount?: unknown;
  readonly viewCount?: unknown;
  readonly cameraCount?: unknown;
  readonly sharedSceneGeometry?: unknown;
  readonly distinctCameraViews?: unknown;
  readonly viewLabels?: unknown;
  readonly renderTargetWidth?: unknown;
  readonly renderTargetHeight?: unknown;
  readonly renderTargetFormat?: unknown;
  readonly hasDepthTexture?: unknown;
  readonly readbackMatchesPresentation?: unknown;
  readonly disposedRenderTargets?: unknown;
  readonly disposedTextures?: unknown;
  readonly evidenceMode?: unknown;
  readonly materialCount?: unknown;
  readonly pbrMaterialCount?: unknown;
  readonly texturedMaterialCount?: unknown;
  readonly textureBindingCount?: unknown;
  readonly nativePbrSubmissions?: unknown;
  readonly nativeTextureBindings?: unknown;
  readonly nativeInstancedSubmissions?: unknown;
  readonly instanceUniformMatrices?: unknown;
  readonly instanceDrawCalls?: unknown;
  readonly particleCount?: unknown;
  readonly computeDispatches?: unknown;
  readonly computeWorkgroups?: unknown;
  readonly storageBuffers?: unknown;
  readonly readbackBuffers?: unknown;
  readonly maxParticleDelta?: unknown;
  readonly maxVelocityDelta?: unknown;
  readonly xrSessionStarted?: unknown;
  readonly xrModeCount?: unknown;
  readonly controllerCount?: unknown;
  readonly triggerPressedCount?: unknown;
  readonly ballShots?: unknown;
  readonly draggedObjects?: unknown;
  readonly arCones?: unknown;
  readonly hitTestCount?: unknown;
  readonly realDeviceClaimed?: unknown;
  readonly unsupportedRequired?: unknown;
  readonly clipName?: unknown;
  readonly runtime?: {
    readonly drawCalls?: unknown;
    readonly animationFrameCount?: unknown;
    readonly skinningPalettesUpdated?: unknown;
    readonly morphWeightTracksApplied?: unknown;
    readonly decoderDecodeCount?: unknown;
    readonly meshoptDecodeCount?: unknown;
    readonly dracoDecodeCount?: unknown;
    readonly dracoDecoderKind?: unknown;
    readonly motionSamples?: unknown;
    readonly motionTimeRange?: unknown;
    readonly poseDiversityScore?: unknown;
    readonly motionHealthy?: unknown;
    readonly instanceCount?: unknown;
    readonly instancedRenderableCount?: unknown;
    readonly instanceAttributeBuffers?: unknown;
    readonly instanceAttributeBytes?: unknown;
    readonly sceneRenderableCount?: unknown;
    readonly publicSceneInstancedMesh?: unknown;
    readonly clearcoatMaterials?: unknown;
    readonly sheenMaterials?: unknown;
    readonly transmissionMaterials?: unknown;
    readonly transparentMaterials?: unknown;
    readonly textureCount?: unknown;
    readonly samplerAnisotropyUploads?: unknown;
    readonly maxTextureAnisotropy?: unknown;
    readonly samplerMaxAnisotropy?: unknown;
    readonly outputNonDarkPixels?: unknown;
    readonly outputBrightPixels?: unknown;
    readonly bloomEnabled?: unknown;
    readonly outlineEnabled?: unknown;
    readonly depthOfFieldEnabled?: unknown;
    readonly stereoRigSource?: unknown;
    readonly stereoRigViews?: unknown;
    readonly effectPlanSource?: unknown;
    readonly effectComposition?: unknown;
    readonly interleaveAxis?: unknown;
    readonly ssaoEnabled?: unknown;
    readonly postprocessChain?: unknown;
    readonly outputColorBuckets?: unknown;
    readonly edgeContrastPixels?: unknown;
    readonly cubeCount?: unknown;
    readonly pointCount?: unknown;
    readonly cubePickHits?: unknown;
    readonly pointPickHits?: unknown;
    readonly projectedDecalVertices?: unknown;
    readonly projectedDecalTriangles?: unknown;
    readonly decalCount?: unknown;
    readonly decalBlendMode?: unknown;
    readonly decalShape?: unknown;
    readonly blendedDecalMaterials?: unknown;
    readonly decalDepthWriteDisabled?: unknown;
    readonly decalCullMode?: unknown;
    readonly decalPolygonOffsetEnabled?: unknown;
    readonly nearestCubeId?: unknown;
    readonly nearestPointIndex?: unknown;
    readonly indexedRangeStart?: unknown;
    readonly indexedRangeCount?: unknown;
    readonly indexedTotalCount?: unknown;
    readonly arrayRangeStart?: unknown;
    readonly arrayRangeCount?: unknown;
    readonly arrayTotalCount?: unknown;
    readonly usesIndexedRange?: unknown;
    readonly usesArrayRange?: unknown;
    readonly transmissionFactor?: unknown;
    readonly ior?: unknown;
    readonly volumeThicknessFactor?: unknown;
    readonly attenuationBlueBias?: unknown;
    readonly compressedTextureCount?: unknown;
    readonly textureMipLevels?: unknown;
    readonly fallbackMipLevels?: unknown;
    readonly compressedTextureBytes?: unknown;
    readonly fallbackTextureBytes?: unknown;
    readonly ktx2SourceBytes?: unknown;
    readonly textureFormat?: unknown;
    readonly variantCount?: unknown;
    readonly materialVariantNames?: unknown;
    readonly activeVariant?: unknown;
    readonly selectedMaterialName?: unknown;
    readonly sceneSelectedMaterials?: unknown;
    readonly collectedLightCount?: unknown;
    readonly spotLightCount?: unknown;
    readonly spotAngle?: unknown;
    readonly spotPenumbra?: unknown;
    readonly spotRange?: unknown;
    readonly spotCastsShadow?: unknown;
    readonly rendererShadowRequested?: unknown;
    readonly firstLightKind?: unknown;
    readonly rotationX?: unknown;
    readonly rotationY?: unknown;
    readonly rotationZ?: unknown;
    readonly targetX?: unknown;
    readonly targetY?: unknown;
    readonly positionZ?: unknown;
    readonly trackballRollApplied?: unknown;
    readonly rotateEnabled?: unknown;
    readonly panEnabled?: unknown;
    readonly zoomEnabled?: unknown;
    readonly shadowRendered?: unknown;
    readonly shadowTextureKind?: unknown;
    readonly shadowMapSize?: unknown;
    readonly casterCount?: unknown;
    readonly skippedTransparentCasters?: unknown;
    readonly depthMin?: unknown;
    readonly depthMax?: unknown;
    readonly depthNonDefaultPixels?: unknown;
    readonly pcfSamples?: unknown;
    readonly pcfRadius?: unknown;
    readonly objNativeImport?: unknown;
    readonly objTriangulatedFaces?: unknown;
    readonly objGeneratedNormals?: unknown;
    readonly objTexcoords?: unknown;
    readonly featureCount?: unknown;
    readonly elementCount?: unknown;
    readonly viewCount?: unknown;
    readonly cameraCount?: unknown;
    readonly sharedSceneGeometry?: unknown;
    readonly distinctCameraViews?: unknown;
    readonly viewLabels?: unknown;
    readonly renderTargetWidth?: unknown;
    readonly renderTargetHeight?: unknown;
    readonly renderTargetFormat?: unknown;
    readonly hasDepthTexture?: unknown;
    readonly readbackMatchesPresentation?: unknown;
    readonly disposedRenderTargets?: unknown;
    readonly disposedTextures?: unknown;
    readonly evidenceMode?: unknown;
    readonly materialCount?: unknown;
    readonly pbrMaterialCount?: unknown;
    readonly texturedMaterialCount?: unknown;
    readonly textureBindingCount?: unknown;
    readonly nativePbrSubmissions?: unknown;
    readonly nativeTextureBindings?: unknown;
    readonly nativeInstancedSubmissions?: unknown;
    readonly instanceUniformMatrices?: unknown;
    readonly instanceDrawCalls?: unknown;
    readonly particleCount?: unknown;
    readonly computeDispatches?: unknown;
    readonly computeWorkgroups?: unknown;
    readonly storageBuffers?: unknown;
    readonly readbackBuffers?: unknown;
    readonly maxParticleDelta?: unknown;
    readonly maxVelocityDelta?: unknown;
    readonly xrSessionStarted?: unknown;
    readonly xrModeCount?: unknown;
    readonly controllerCount?: unknown;
    readonly triggerPressedCount?: unknown;
    readonly ballShots?: unknown;
    readonly draggedObjects?: unknown;
    readonly arCones?: unknown;
    readonly hitTestCount?: unknown;
    readonly realDeviceClaimed?: unknown;
    readonly unsupportedRequired?: unknown;
    readonly animationClipName?: unknown;
  };
  readonly diagnostics?: {
    readonly drawCalls?: unknown;
  };
  readonly proof?: {
    readonly diagnostics?: {
      readonly drawCalls?: unknown;
    };
  };
};
