import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { baseReport, readJson, writeJson } from "../external-parity-reporting/index.js";

type RootCheck = {
  readonly id: string;
  readonly passed: boolean;
  readonly evidencePaths: readonly string[];
  readonly blockers: readonly string[];
};

const reportPath = "tests/reports/external-parity-codebase-root-readiness.json";

export interface ExternalParityCodebaseRootReadinessGateOptions {
  readonly rootBlockers: readonly string[];
  readonly completionBlockers: readonly string[];
  readonly broadParityBlockers: readonly string[];
  readonly externalEvidenceBlockers: readonly string[];
  readonly visualQualityOk: boolean;
}

export type ExternalParityCodebaseRootReadinessCliMode = "strict" | "contracts-only";

export interface ExternalParityCodebaseRootReadinessCliStatus {
  readonly ok: boolean;
  readonly rootContractsReady: boolean;
  readonly allCodebaseObjectiveRequirementsCovered: boolean;
}

export function shouldExternalParityCodebaseRootReadinessCliPass(
  report: ExternalParityCodebaseRootReadinessCliStatus,
  mode: ExternalParityCodebaseRootReadinessCliMode = "strict"
): boolean {
  if (mode === "contracts-only") {
    return report.rootContractsReady === true && report.allCodebaseObjectiveRequirementsCovered === true;
  }
  return report.ok === true;
}

export function evaluateExternalParityCodebaseRootReadinessGate(options: ExternalParityCodebaseRootReadinessGateOptions): {
  readonly rootContractsReady: boolean;
  readonly localVisualQualityReady: boolean;
  readonly exampleImplementationMayResume: boolean;
  readonly rootReady: boolean;
  readonly parityCompletionReady: boolean;
  readonly examplesAllowedToResume: boolean;
  readonly examplesResumeBlockers: readonly string[];
  readonly violations: readonly string[];
} {
  const visualBlockers = options.visualQualityOk ? [] : ["visual-quality: tests/reports/external-parity-visual-quality.json is missing or failing"];
  const examplesResumeBlockers = [
    ...options.rootBlockers.map((blocker) => `root: ${blocker}`),
    ...options.completionBlockers,
    ...options.broadParityBlockers,
    ...options.externalEvidenceBlockers,
    ...visualBlockers
  ];
  const rootContractsReady = options.rootBlockers.length === 0;
  const localVisualQualityReady = options.visualQualityOk;
  const rootReady = rootContractsReady && localVisualQualityReady;
  return {
    rootContractsReady,
    localVisualQualityReady,
    exampleImplementationMayResume: rootReady,
    rootReady,
    parityCompletionReady: examplesResumeBlockers.length === 0,
    examplesAllowedToResume: rootReady && examplesResumeBlockers.length === 0,
    examplesResumeBlockers,
    violations: [
      ...options.rootBlockers,
      ...visualBlockers
    ]
  };
}

export function createExternalParityCodebaseRootReadinessReport(root = process.cwd()) {
  const webgpu = readJson(root, "tests/reports/external-parity-webgpu-parity.json");
  const pbrGltf = readJson(root, "tests/reports/external-parity-pbr-gltf-readiness.json");
  const hdr = readJson(root, "tests/reports/external-parity-hdr-render-target-readiness.json");
  const shadow = readJson(root, "tests/reports/external-parity-shadow-map-readiness.json");
  const postprocess = readJson(root, "tests/reports/external-parity-postprocess-suite.json");
  const visualQuality = readJson(root, "tests/reports/external-parity-visual-quality.json");
  const rootQuality = readJson(root, "tests/reports/external-parity-root-rendering-quality.json");
  const broadParity = readJson(root, "tests/reports/external-parity-broad-parity-readiness.json");
  const completionAudit = readJson(root, "tests/reports/external-parity-completion-audit.json");
  const externalEvidence = readJson(root, "tests/reports/external-parity-external-evidence-readiness.json");
  const sourceCleanliness = readJson(root, "tests/reports/source-cleanliness-root.json");
  const architecture = readJson(root, "tests/reports/architecture.json");
  const boundaries = readJson(root, "tests/reports/boundaries.json");
  const packageSize = readJson(root, "tests/reports/package-size.json");
  const packageInstallSmoke = readJson(root, "tests/reports/package-install-smoke.json");
  const claimRegistry = readJson(root, "tests/reports/claim-registry.json");
  const requirementsTrace = readJson(root, "tests/reports/final-requirements-trace.json");

  const packageJson = readText(root, "package.json");
  const rendererSource = readText(root, "packages/rendering/src/Renderer.ts");
  const externalParityRenderPresetSource = readText(root, "packages/rendering/src/ExternalParityRenderPreset.ts");
  const forwardPassSource = readText(root, "packages/rendering/src/ForwardPass.ts");
  const pbrMaterialSource = readText(root, "packages/rendering/src/PBRMaterial.ts");
  const samplerSource = readText(root, "packages/rendering/src/Sampler.ts");
  const webgl2Source = readText(root, "packages/rendering/src/WebGL2Device.ts");
  const webgpuSource = readText(root, "packages/rendering/src/WebGPUDevice.ts");
  const shaderLibrarySource = readText(root, "packages/rendering/src/ShaderLibrary.ts");
  const perspectiveCameraSource = readText(root, "packages/scene/src/PerspectiveCamera.ts");
  const gltfLoaderSource = readText(root, "packages/assets/src/GLTFLoader.ts");
  const gltfResourcesSource = readText(root, "packages/assets/src/GLTFRenderResources.ts");
  const productTurntableSource = readText(root, "packages/rendering/src/ProductTurntableFixtures.ts");
  const orbitControlsSource = readText(root, "packages/input/src/controls/OrbitControls.ts");
  const packagedDirectPbrShader = readText(root, "packages/rendering/src/shaders/pbr-direct.frag.glsl");
  const gltfInspectionSpec = readText(root, "tests/assets/gltf-inspection.test.ts");
  const assetTextureBrowserSpec = readText(root, "tests/browser/asset-texture-browser.spec.ts");
  const proceduralTextureSpec = readText(root, "tests/unit/rendering/procedural-texture-fixtures.test.ts");
  const rootQualitySpec = readText(root, "tests/browser/rendering-root-quality-gate.spec.ts");
  const rendererUnitSpec = readText(root, "tests/unit/rendering/renderer.test.ts");
  const inputCameraControlsSpec = readText(root, "tests/unit/input/camera-controls.test.ts");
  const externalParityRenderPresetUnitSpec = readText(root, "tests/unit/rendering/external-parity-render-preset.test.ts");
  const renderStateLeaksSpec = readText(root, "tests/unit/rendering/render-state-leaks.test.ts");
  const frameVisualMetricsSource = readText(root, "packages/rendering/src/FrameVisualMetrics.ts");
  const frameVisualMetricsSpec = readText(root, "tests/unit/rendering/frame-visual-metrics.test.ts");
  const visualQualityToolSource = readText(root, "tools/external-parity-visual-quality/index.ts");
  const shaderLibraryUnitSpec = readText(root, "tests/unit/rendering/shader-library.test.ts");
  const pbrLightingUnitSpec = readText(root, "tests/unit/rendering/pbr-lighting.test.ts");
  const workstream5RuntimeSpec = readText(root, "tests/unit/workstream5-runtime.test.ts");
  const cameraUnitSpec = readText(root, "tests/unit/rendering/camera-framing.test.ts");
  const scenePackageSpec = readText(root, "packages/scene/tests/scene.test.ts");
  const workspaceImportSpec = readText(root, "tests/browser/workspace-vite-imports.spec.ts");
  const workspaceImportFixture = readText(root, "tests/browser/fixtures/workspace-vite-imports/main.ts");
  const webgpuParitySpec = readText(root, "tests/browser/webgpu-parity.spec.ts");

  const checks: readonly RootCheck[] = [
    check(
      "workspace-package-imports-resolve-in-vite",
      workspaceImportSpec.includes("direct @aura3d workspace package imports")
        && workspaceImportFixture.includes("@aura3d/rendering")
        && workspaceImportFixture.includes("@aura3d/assets")
        && workspaceImportFixture.includes("@aura3d/scene"),
      ["tests/browser/workspace-vite-imports.spec.ts", "tests/browser/fixtures/workspace-vite-imports/main.ts", "package.json"],
      ["Vite/workspace package import smoke coverage is missing."]
    ),
    check(
      "root-package-source-cleanliness",
      sourceCleanliness?.ok === true &&
        Array.isArray(sourceCleanliness.scannedRoots) &&
        sourceCleanliness.scannedRoots.includes("packages") &&
        Number(sourceCleanliness.checkedTextFiles ?? 0) > 0,
      ["tests/reports/source-cleanliness-root.json", "tools/verify-source-cleanliness/index.ts", "package.json"],
      ["Package/source cleanliness report is missing or failing for the root package codebase."]
    ),
    check(
      "package-local-source-tests-run-in-root-gate",
      packageJson.includes("\"test:packages\"")
        && packageJson.includes("pnpm exec tsx --tsconfig tsconfig.base.json --test")
        && packageJson.includes("\"test:packages:dist\"")
        && packageJson.includes("node --import tsx --test")
        && packageJson.includes("\"verify:package-install-smoke:fresh\"")
        && packageJson.includes("tools/package-install-smoke/index.ts --fresh-pack")
        && packageJson.includes("packages/assets/tests/assets.test.ts")
        && packageJson.includes("packages/scene/tests/scene.test.ts")
        && packageJson.includes("pnpm build && pnpm verify:package-install-smoke:fresh && pnpm verify:source-cleanliness:root && pnpm verify:architecture && pnpm verify:boundaries")
        && packageJson.includes("pnpm verify:shaders && pnpm verify:exports && pnpm verify:imports && pnpm verify:size && pnpm verify:claims && pnpm verify:trace")
        && packageJson.includes("pnpm test:packages && pnpm test:packages:dist && pnpm exec vitest run tests/unit/rendering")
        && architecture?.ok === true
        && boundaries?.ok === true
        && packageSize?.ok === true
        && Number(packageSize?.totalBytes ?? 0) > 0
        && packageInstallSmoke?.ok === true
        && packageInstallSmoke?.packMode === "fresh-current-checkout-pack"
        && typeof packageInstallSmoke?.tarballSha256 === "string"
        && packageInstallSmoke.tarballSha256.length === 64
        && perspectiveCameraSource.includes("validatePerspectiveProjection")
        && perspectiveCameraSource.includes("CAMERA_FOV")
        && perspectiveCameraSource.includes("Perspective fovYRadians")
        && scenePackageSpec.includes("PerspectiveCamera")
        && scenePackageSpec.includes("/fov/"),
      ["package.json", "tools/verify-architecture/index.ts", "tools/verify-boundaries/index.ts", "tools/package-size/index.ts", "tools/package-install-smoke/index.ts", "tests/reports/architecture.json", "tests/reports/boundaries.json", "tests/reports/package-size.json", "tests/reports/package-install-smoke.json", "packages/scene/src/PerspectiveCamera.ts", "packages/scene/tests/scene.test.ts", "packages/assets/tests/assets.test.ts"],
      ["Package-local Node tests, compiled package-export tests, fresh current-checkout package install smoke, architecture verification, boundary verification, or package size verification are not part of the root gate, or PerspectiveCamera still allows invalid projection values to fall through to generic matrix errors."]
    ),
    check(
      "root-claim-and-trace-gates",
      claimRegistry?.ok === true
        && Array.isArray(claimRegistry?.violations)
        && claimRegistry.violations.length === 0
        && Array.isArray(claimRegistry?.scannedFiles)
        && claimRegistry.scannedFiles.length > 0
        && !claimRegistry.scannedFiles.some((path) => typeof path === "string" && path.startsWith("release-artifacts/"))
        && requirementsTrace?.complete === true
        && Number(requirementsTrace?.totalRequirements ?? 0) > 0
        && isRecord(requirementsTrace?.incomplete)
        && Number(requirementsTrace.incomplete.total ?? -1) === 0
        && isRecord(requirementsTrace?.implementedRowsMissingEvidence)
        && Number(requirementsTrace.implementedRowsMissingEvidence.total ?? -1) === 0
        && isRecord(requirementsTrace?.invalidStatuses)
        && Number(requirementsTrace.invalidStatuses.total ?? -1) === 0
        && isRecord(requirementsTrace?.weakEvidence)
        && Number(requirementsTrace.weakEvidence.total ?? -1) === 0,
      ["tools/claim-registry/index.ts", "tools/verify-trace/index.ts", "tests/reports/claim-registry.json", "tests/reports/final-requirements-trace.json", "docs/project/verification-evidence.md"],
      ["Claim registry or requirements trace gate is missing/failing, or generated release-artifact handoff files are still being scanned as public parity claims."]
    ),
    check(
      "renderer-explicit-render-target-contract",
      rendererSource.includes("readonly renderTarget?: RenderTarget")
        && rendererSource.includes("validateExplicitRenderTarget")
        && rendererSource.includes("this.device.setRenderTarget(explicitRenderTarget ?? null)")
        && webgl2Source.includes("this.gl.getParameter(this.gl.FRAMEBUFFER_BINDING)")
        && webgl2Source.includes("this.gl.getParameter(this.gl.RENDERBUFFER_BINDING)")
        && renderStateLeaksSpec.includes("does not leak framebuffer or renderbuffer bindings while allocating render targets")
        && rendererUnitSpec.includes("explicit offscreen render targets")
        && rendererUnitSpec.includes("preserves explicit render-item model-view-projection matrices when no camera is supplied"),
      ["packages/rendering/src/Renderer.ts", "packages/rendering/src/WebGL2Device.ts", "tests/unit/rendering/renderer.test.ts", "tests/unit/rendering/render-state-leaks.test.ts"],
      ["Renderer.render() does not prove explicit offscreen render-target routing, explicit low-level MVP preservation, or WebGL2 render-target allocation state isolation."]
    ),
    check(
      "root-renderer-camera-framing-contract",
      rendererSource.includes("cameraPolicy")
        && rendererSource.includes("createAutoFrameCamera")
        && rendererSource.includes("hasExplicitAutoFrameCameraPolicy")
        && rendererSource.includes("readonly cameraFrameOptions?: PerspectiveCameraFrameOptions")
        && rendererSource.includes("collectCameraFrameOptions(source)")
        && rendererSource.includes("DEFAULT_RENDERER_AUTO_FRAME_OPTIONS")
        && rendererSource.includes("DEFAULT_RENDERER_ENVIRONMENT_LIGHTING")
        && rendererSource.includes("DEFAULT_RENDERER_DIRECT_LIGHTING")
        && rendererSource.includes("DISABLED_RENDERER_ENVIRONMENT_LIGHTING")
        && rendererSource.includes("createDefaultRendererDirectLights")
        && rendererSource.includes("source.environmentLighting === false) return cloneEnvironmentLighting(DISABLED_RENDERER_ENVIRONMENT_LIGHTING)")
        && rendererSource.includes("source.scene")
        && rendererSource.includes("collected.length > 0 || source.environmentLighting === false")
        && rendererSource.includes("(source.renderItems || source.collectRenderItems) && !source.renderTarget")
        && rendererUnitSpec.includes("applies the default renderer environment to object render sources with direct PBR items")
        && rendererUnitSpec.includes("lets explicit auto-frame camera policy override authored scene cameras")
        && rendererUnitSpec.includes("lets render sources tighten auto-frame options for preview subjects")
        && rendererUnitSpec.includes("lets object render sources with direct PBR items opt out of the default renderer environment")
        && rendererUnitSpec.includes("expect(command?.uniforms?.get(\"u_environmentMapIntensity\")).toBe(0)")
        && rendererUnitSpec.includes("expect(command?.uniforms?.get(\"u_environmentSpecularIntensity\")).toBe(0)")
        && rendererUnitSpec.includes("expect(command?.uniforms?.get(\"u_environmentMapTextureEnabled\")).toBe(0)")
        && rendererUnitSpec.includes("DEFAULT_RENDERER_DIRECT_LIGHTING.key.intensity")
        && rendererUnitSpec.includes("expect(command?.uniforms?.get(\"u_lightCount\")).toBe(2)")
        && rendererUnitSpec.includes("expect(Array.from(cameraPosition).map(round3)).toEqual(expectedFrame.cameraPosition.map(round3))")
        && cameraUnitSpec.includes("computePerspectiveCameraFrame")
        && orbitControlsSource.includes("DEFAULT_ORBIT_MAX_POLAR")
        && orbitControlsSource.includes("Math.PI * 0.37")
        && inputCameraControlsSpec.includes("presentation-safe pitch")
        && inputCameraControlsSpec.includes("require opt-in for below-target inspection")
        && rootQualitySpec.includes("keeps a lit multi-material scene visible through camera movement, shadows, and postprocess")
        && rootQualitySpec.includes("keeps authored scene camera orbit movement visible with renderer frustum culling enabled")
        && rootQualitySpec.includes("keeps dense thin transformed scenes visible during authored camera movement and frustum culling")
        && rootQualitySpec.includes("cameraFrameOptions: { minDistance: 0.2, paddingRatio: 0 }")
        && rootQualitySpec.includes("writeRootQualityScreenshot")
        && hasLitMultiMaterialSceneEvidence(rootQuality)
        && hasAuthoredCameraMovementEvidence(rootQuality)
        && hasDenseCameraFramingEvidence(rootQuality)
        && hasRootQualityScreenshotEvidence(root, rootQuality, ["litMultiMaterialScene", "authoredCameraMovement", "denseCameraFraming"]),
      [
        "packages/rendering/src/Renderer.ts",
        "packages/input/src/controls/OrbitControls.ts",
        "tests/unit/rendering/camera-framing.test.ts",
        "tests/unit/input/camera-controls.test.ts",
        "tests/browser/rendering-camera-scene.spec.ts",
        "tests/browser/rendering-root-quality-gate.spec.ts",
        "tests/reports/external-parity-root-rendering-quality.json",
        "tests/reports/external-parity-root-rendering-quality/lit-multi-material-scene.png",
        "tests/reports/external-parity-root-rendering-quality/authored-camera-movement.png",
        "tests/reports/external-parity-root-rendering-quality/dense-camera-framing.png"
      ],
      ["Renderer camera policy/default framing is not covered by root camera tests with real lit-scene movement, postprocess/shadow visibility, authored-camera movement, and frustum culling evidence."]
    ),
    check(
      "asset-to-render-resource-ergonomics",
      gltfResourcesSource.includes("toRendererInput")
        && gltfResourcesSource.includes("extends RendererInput")
        && gltfResourcesSource.includes("qualityPreset?: GLTFRenderQualityPreset")
        && gltfResourcesSource.includes("\"hdr-studio-preview\"")
        && gltfResourcesSource.includes("options.qualityPreset ?? \"studio-preview\"")
        && gltfResourcesSource.includes("sourceOptions.qualityPreset ?? \"studio-preview\"")
        && gltfResourcesSource.includes("DEFAULT_GLTF_STUDIO_PREVIEW_FRAME")
        && gltfResourcesSource.includes("DEFAULT_GLTF_STUDIO_PREVIEW_POSTPROCESS")
        && gltfResourcesSource.includes("DEFAULT_GLTF_HDR_STUDIO_PREVIEW_POSTPROCESS")
        && gltfResourcesSource.includes("createDefaultGLTFHdrStudioPreviewEnvironmentLighting")
        && gltfResourcesSource.includes("createExternalParityEnvironmentLighting(\"studio\")")
        && gltfResourcesSource.includes("targetFormat: \"rgba16f\"")
        && gltfResourcesSource.includes("cameraPolicy")
        && gltfResourcesSource.includes("readonly cameraFrameOptions?: PerspectiveCameraFrameOptions")
        && gltfResourcesSource.includes("cameraFrameBounds: resources.bounds")
        && gltfResourcesSource.includes("options.cameraFrameOptions ? { cameraFrameOptions: options.cameraFrameOptions }")
        && gltfResourcesSource.includes("computePerspectiveCameraFrame")
        && gltfResourcesSource.includes("readonly renderItems?: Iterable<RenderItem>")
        && gltfResourcesSource.includes("...(options.renderItems ? { renderItems: options.renderItems } : {})")
        && gltfResourcesSource.includes("options.environmentLighting === false")
        && gltfResourcesSource.includes("? false")
        && gltfResourcesSource.includes("environmentLighting !== undefined")
        && gltfInspectionSpec.includes("expect(unlitSource.environmentLighting).toBe(false)")
        && gltfInspectionSpec.includes("expect(unlitCommand?.uniforms?.get(\"u_environmentIntensity\")).toBe(0)")
        && gltfInspectionSpec.includes("expect(unlitCommand?.uniforms?.get(\"u_environmentMapIntensity\")).toBe(0)")
        && gltfInspectionSpec.includes("expect(unlitCommand?.uniforms?.get(\"u_environmentSpecularIntensity\")).toBe(0)")
        && gltfInspectionSpec.includes("DEFAULT_GLTF_HDR_STUDIO_PREVIEW_POSTPROCESS")
        && gltfInspectionSpec.includes("const defaultSource = resources.toRenderSource({ qualityPreset: \"default\" })")
        && gltfInspectionSpec.includes("expect(defaultSource.postprocess).toBeUndefined()")
        && gltfInspectionSpec.includes("tightPreviewSource.cameraFrameOptions")
        && gltfInspectionSpec.includes("expect(secondPreviewSource.postprocess).toEqual(DEFAULT_GLTF_STUDIO_PREVIEW_POSTPROCESS)")
        && gltfInspectionSpec.includes("environmentBrdfLutTexture")
        && gltfInspectionSpec.includes("environmentMapMipCount")
        && gltfInspectionSpec.includes("u_environmentIntensity")
        && gltfInspectionSpec.includes("inspection-overlay")
        && gltfInspectionSpec.includes("expect(composedDiagnostics.drawCalls).toBeGreaterThanOrEqual(2)")
        && assetTextureBrowserSpec.includes("gltfHdrPreviewPostprocessTargetFormat")
        && assetTextureBrowserSpec.includes("rgba16f")
        && assetTextureBrowserSpec.includes("gltfHdrPreviewEnvironmentMapTexture")
        && assetTextureBrowserSpec.includes("gltfHdrPreviewBrdfLutTexture")
        && assetTextureBrowserSpec.includes("gltfHdrPreviewStats")
        && gltfLoaderSource.includes("if (!json.skins || json.skins.length === 0) return []")
        && gltfResourcesSource.includes("mesh.tangents.length > 0 ||")
        && gltfResourcesSource.includes("generateMeshTangents")
        && productTurntableSource.includes("createProductTurntableRenderKit")
        && productTurntableSource.includes("cameraPolicy: \"auto-frame\"")
        && productTurntableSource.includes("createProductTurntableCollectedLights")
        && productTurntableSource.includes("collectedLights")
        && productTurntableSource.includes("shadow: {")
        && productTurntableSource.includes("targetFormat: \"rgba16f\"")
        && productTurntableSource.includes("TexturedPBRMaterial")
        && productTurntableSource.includes("TexturedUnlitMaterial")
        && productTurntableSource.includes("createProceduralTexture(\"metallic-paint\"")
        && productTurntableSource.includes("createProceduralTexture(\"carbon-fiber\"")
        && productTurntableSource.includes("createProceduralTexture(\"concrete-asphalt\"")
        && productTurntableSource.includes("createExternalParityEnvironmentLighting")
        && proceduralTextureSpec.includes("creates a ready-to-render product turntable source with lighting, textures, and postprocess")
        && rootQualitySpec.includes("renders a package-level product turntable kit without example-specific assembly")
        && hasProductTurntableRenderKitEvidence(rootQuality)
        && hasRootQualityScreenshotEvidence(root, rootQuality, ["productTurntableRenderKit"])
        && rendererSource.includes("SCENE_PICK_MORPH_TARGETS_MISSING")
        && rendererSource.includes("renderableWorldBounds(geometry, node.transform.worldMatrix, renderable.instanceTransforms, morphTargets, renderable.morphWeights, renderable.skinning)")
        && rendererUnitSpec.includes("includes morph and skinning deformation bounds when picking scene renderables")
        && workstream5RuntimeSpec.includes("preserves glTF tangents through render resources")
        && workstream5RuntimeSpec.includes("synthesize fallback normals and TEXCOORD_0 attributes when material rendering needs them"),
      ["packages/assets/src/GLTFLoader.ts", "packages/assets/src/GLTFRenderResources.ts", "packages/rendering/src/Renderer.ts", "packages/rendering/src/ProductTurntableFixtures.ts", "tests/assets/gltf-inspection.test.ts", "tests/browser/asset-texture-browser.spec.ts", "tests/browser/rendering-root-quality-gate.spec.ts", "tests/unit/rendering/procedural-texture-fixtures.test.ts", "tests/unit/rendering/renderer.test.ts", "tests/unit/workstream5-runtime.test.ts", "tests/reports/external-parity-root-rendering-quality.json", "tests/reports/external-parity-root-rendering-quality/product-turntable-render-kit.png"],
      ["GLTF render resources do not expose a Renderer.render()-ready camera/frame/source contract with package-level preview lighting, HDR postprocess, package-level textured render-kit evidence, and postprocess defaults."]
    ),
    check(
      "external-parity-render-preset-capability-contract",
      externalParityRenderPresetSource.includes("productionShadowSamplingEvidence")
        && externalParityRenderPresetSource.includes("productionPbrEvidence")
        && externalParityRenderPresetSource.includes("depthTextureEvidence")
        && externalParityRenderPresetSource.includes("hdrRenderTargetEvidence")
        && externalParityRenderPresetSource.includes("root renderer material/shader PBR evidence")
        && externalParityRenderPresetSource.includes("renderer-owned directional shadow-map sampling evidence")
        && externalParityRenderPresetSource.includes("renderer-owned-directional-shadow-map")
        && externalParityRenderPresetSource.includes("renderer-owned-forward-shadow-map-sampling-evidence")
        && externalParityRenderPresetSource.includes("renderer-owned sampleable depth texture evidence")
        && externalParityRenderPresetSource.includes("renderer-owned HDR render-target evidence")
        && !externalParityRenderPresetSource.includes("Flagship scenes do not yet bind a production depth texture")
        && !externalParityRenderPresetSource.includes("External parity flagship scenes use bounded LDR postprocess readback, not HDR render targets")
        && externalParityRenderPresetUnitSpec.includes("does not hard-block HDR, depth textures, or production shadow sampling when evidence is provided"),
      ["packages/rendering/src/ExternalParityRenderPreset.ts", "tests/unit/rendering/external-parity-render-preset.test.ts"],
      ["External parity render preset evidence still hard-blocks root HDR, depth texture, or production shadow-map capability even when callers provide real evidence."]
    ),
    check(
      "root-material-shader-pbr-behavior",
      rootQualitySpec.includes("keeps textured PBR metallic and roughness scalar factors active")
        && rootQualitySpec.includes("renders sampler-budgeted advanced textured PBR extension variants")
        && shaderLibraryUnitSpec.includes("keeps the packaged direct-PBR shader files synchronized")
        && shaderLibraryUnitSpec.includes("flips PBR normals on backfaces so double-sided surfaces stay lit")
        && shaderLibraryUnitSpec.includes("max(fallbackEnergy, 0.38)")
        && shaderLibraryUnitSpec.includes("roughEnvironmentFloor")
        && shaderLibraryUnitSpec.includes("proceduralSpecularResponse")
        && shaderLibraryUnitSpec.includes("clearcoatGloss")
        && shaderLibraryUnitSpec.includes("anisotropyDirection")
        && pbrLightingUnitSpec.includes("clears material procedural and sampled environment defaults when renderer-level environment omits them")
        && pbrLightingUnitSpec.includes("expect(command?.uniforms?.get(\"u_environmentBrdfLutEnabled\")).toBe(0)")
        && forwardPassSource.includes("clearProceduralEnvironmentMapUniforms")
        && forwardPassSource.includes("clearSampledEnvironmentMapUniforms")
        && forwardPassSource.includes("clearEnvironmentBrdfLutUniforms")
        && packagedDirectPbrShader.includes("u_pointShadowMapTexture")
        && packagedDirectPbrShader.includes("max(fallbackEnergy, 0.38)")
        && packagedDirectPbrShader.includes("roughEnvironmentFloor")
        && packagedDirectPbrShader.includes("proceduralSpecularResponse")
        && packagedDirectPbrShader.includes("clearcoatGloss")
        && packagedDirectPbrShader.includes("anisotropyDirection")
        && packagedDirectPbrShader.includes("a3dPointShadowFactor")
        && packagedDirectPbrShader.includes("kind > 0.5 && kind < 1.5 ? a3dPointShadowFactor")
        && webgl2Source.includes("rgba8TextureInternalFormat")
        && webgl2Source.includes("SRGB8_ALPHA8")
        && webgl2Source.includes("LINEAR_MIPMAP_LINEAR")
        && webgl2Source.includes("nearest-mipmap-linear")
        && webgpuSource.includes("webgpuMipmapFilter")
        && samplerSource.includes("TextureMinFilter")
        && samplerSource.includes("linear-mipmap-linear")
        && pbrMaterialSource.includes("DEFAULT_PBR_ENVIRONMENT_INTENSITY")
        && pbrMaterialSource.includes("DEFAULT_PBR_PROCEDURAL_ENVIRONMENT_MAP")
        && gltfLoaderSource.includes("nearest-mipmap-linear")
        && gltfResourcesSource.includes("DEFAULT_PBR_ENVIRONMENT_INTENSITY")
        && workstream5RuntimeSpec.includes("nearest-mipmap-linear")
        && workstream5RuntimeSpec.includes("DEFAULT_PBR_ENVIRONMENT_INTENSITY")
        && renderStateLeaksSpec.includes("uploads sRGB textures with WebGL2 sRGB internal formats")
        && renderStateLeaksSpec.includes("preserves mipmap-aware sampler min filters")
        && rootQualitySpec.includes("does not double-decode WebGL sRGB PBR texture samples")
        && !shaderLibrarySource.includes("return pow(clamp(encodedColor")
        && !packagedDirectPbrShader.includes("return pow(clamp(encodedColor")
        && hasPbrMaterialScalarResponseEvidence(rootQuality)
        && hasAdvancedTexturedPbrVariantEvidence(rootQuality)
        && hasSrgbPbrTextureSamplingEvidence(rootQuality)
        && hasRootQualityScreenshotEvidence(root, rootQuality, ["pbrMaterialScalarResponse", "advancedTexturedPbrVariants"])
        && pbrValidationPassed(pbrGltf, "pbr-material-and-environment-browser-evidence")
        && pbrValidationPassed(pbrGltf, "bounded-pbr-reference-and-three-babylon-evidence"),
      [
        "packages/rendering/src/WebGL2Device.ts",
        "packages/rendering/src/WebGPUDevice.ts",
        "packages/rendering/src/ForwardPass.ts",
        "packages/rendering/src/PBRLightingDefaults.ts",
        "packages/rendering/src/PBRMaterial.ts",
        "packages/rendering/src/Sampler.ts",
        "packages/rendering/src/shaders/pbr-direct.frag.glsl",
        "packages/assets/src/GLTFLoader.ts",
        "tests/unit/rendering/render-state-leaks.test.ts",
        "tests/unit/rendering/pbr-lighting.test.ts",
        "tests/unit/workstream5-runtime.test.ts",
        "tests/unit/rendering/shader-library.test.ts",
        "tests/browser/rendering-root-quality-gate.spec.ts",
        "tests/reports/external-parity-root-rendering-quality.json",
        "tests/reports/external-parity-root-rendering-quality/pbr-material-scalar-dielectric.png",
        "tests/reports/external-parity-root-rendering-quality/pbr-material-scalar-metallic.png",
        "tests/reports/external-parity-root-rendering-quality/advanced-textured-pbr-clearcoat.png",
        "tests/reports/external-parity-pbr-gltf-readiness.json"
      ],
      ["Root PBR/material shader behavior, material-response metrics, packaged shader sync, or browser readiness validation is missing."]
    ),
    check(
      "full-gltf-local-loader-contract",
      pbrGltf?.gltfParity === true && pbrValidationPassed(pbrGltf, "full-gltf-parity-boundary"),
      ["tests/reports/external-parity-pbr-gltf-readiness.json", "packages/assets/src/GLTFRenderResources.ts"],
      ["Local glTF parity/readiness is not green."]
    ),
    check(
      "postprocess-suite-root-real-scene-path",
      postprocess?.ok === true
        && effectCount(postprocess?.implementedEffects) >= 17
        && effectCount(postprocess?.realSceneEffects) >= 17
        && rendererSource.includes("renderAsync(input: RendererInput): Promise<RenderDeviceDiagnostics>")
        && rendererSource.includes("executePostprocessAsync")
        && rendererSource.includes("readRenderTargetFloatPixelsAsync")
        && webgl2Source.includes("this.gl.disable(this.gl.CULL_FACE)")
        && rootQualitySpec.includes("preserves dark clear color through renderer-owned postprocess presentation")
        && rootQualitySpec.includes("presents renderer-owned postprocess even after scene cull state changes")
        && rootQualitySpec.includes("proves the full postprocess suite on root renderer real-scene pixels without example coupling")
        && hasPostprocessClearColorPreservationEvidence(rootQuality)
        && hasPostprocessPresentationCullStateEvidence(rootQuality)
        && hasRootPostprocessSuiteEvidence(rootQuality)
        && hasRootQualityScreenshotEvidence(root, rootQuality, ["postprocessSuite"]),
      [
        "tests/browser/rendering-root-quality-gate.spec.ts",
        "tests/reports/external-parity-root-rendering-quality.json",
        "tests/reports/external-parity-root-rendering-quality/postprocess-suite-integrated.png",
        "tests/reports/external-parity-postprocess-suite.json"
      ],
      ["Root real-scene postprocess suite is not proven independently of examples with browser effect, color-management, and pixel-change metrics."]
    ),
    check(
      "hdr-render-target-root-path",
      hasAllEvidence(hdr?.supportedEvidence, [
        "rgba32f-webgl2-render-target-browser-evidence",
        "browser-readback-from-float-hdr-targets",
        "hdr-float-postprocess-tone-mapping-evidence",
        "real-webgpu-hdr-render-target-postprocess-evidence"
      ])
        && rootQualitySpec.includes("preserves overbright PBR output in linear HDR render targets before tone mapping")
        && hasRootHdrRenderTargetEvidence(rootQuality),
      ["tests/browser/rendering-root-quality-gate.spec.ts", "tests/reports/external-parity-root-rendering-quality.json", "tests/reports/external-parity-hdr-render-target-readiness.json"],
      ["Local HDR render-target path is not proven across WebGL2/WebGPU readback, tone mapping, and root overbright float-target metrics."]
    ),
    check(
      "shadow-map-root-forward-path",
      hasAllEvidence(shadow?.supportedEvidence, [
        "production-forward-pass-shadow-map-sampling-evidence",
        "production-spot-forward-shadow-map-sampling-evidence",
        "production-point-light-forward-shadow-map-sampling-evidence",
        "local-shadow-atlas-cascade-selection-evidence"
      ])
        && hasRootShadowResizeStabilityEvidence(rootQuality),
      ["packages/rendering/src/ForwardPass.ts", "packages/rendering/src/ShadowPass.ts", "tests/reports/external-parity-root-rendering-quality.json", "tests/reports/external-parity-shadow-map-readiness.json"],
      ["Local forward-pass directional/spot/point shadow-map sampling, atlas/cascade evidence, or root resize stability metrics are missing."]
    ),
    check(
      "webgpu-native-rendering-root-path",
      webgpu?.ok === true
        && webgpu?.fullWebGPUParity === true
        && validationPassed(webgpu, "native-webgpu-material-wgsl-pbr-shader")
        && validationPassed(webgpu, "real-webgpu-shadow-map-forward-pass")
        && webgpuSource.includes("uniformForwardShadow")
        && webgpuSource.includes("uniformBaseColorTextureBinding")
        && webgpuSource.includes("native-sampled-textures")
        && webgpuSource.includes("createNativeSampledTextureBinding")
        && webgpuSource.includes("hasNativeTextureUpload")
        && webgpuSource.includes("TEXTURE_USAGE.COPY_DST | TEXTURE_USAGE.TEXTURE_BINDING")
        && webgpuSource.includes("Renderer.renderAsync()")
        && webgpuSource.includes("texture.colorSpace === \"srgb\"")
        && webgpuSource.includes("srgbToLinear")
        && webgpuParitySpec.includes("native-webgpu-texture-binding")
        && webgpuParitySpec.includes("[8, 81, 202, 255]"),
      ["packages/rendering/src/WebGPUDevice.ts", "tests/browser/webgpu-parity.spec.ts", "tests/reports/external-parity-webgpu-parity.json"],
      ["Native WebGPU material/shadow/render-target path is not locally green."]
    ),
    check(
      "current-visual-quality-is-tracked-and-blocks-root-readiness",
      typeof visualQuality?.ok === "boolean"
        && Array.isArray(visualQuality?.checks)
        && frameVisualMetricsSource.includes("readonly flatPixelRatio")
        && frameVisualMetricsSource.includes("readonly localContrastRatio")
        && frameVisualMetricsSource.includes("readonly maxFlatPixelRatio")
        && frameVisualMetricsSource.includes("readonly minLocalContrastRatio")
        && frameVisualMetricsSource.includes("delta <= 2")
        && frameVisualMetricsSource.includes("delta >= 8")
        && frameVisualMetricsSpec.includes("distinguishes a framed detailed subject from a mostly blank frame")
        && frameVisualMetricsSpec.includes("maxFlatPixelRatio")
        && frameVisualMetricsSpec.includes("minLocalContrastRatio")
        && frameVisualMetricsSpec.includes("expect(blankMetrics.flatPixelRatio).toBeGreaterThan")
        && frameVisualMetricsSpec.includes("expect(blankMetrics.localContrastRatio).toBeLessThan")
        && visualQualityToolSource.includes("readonly maxFlatPixelRatio")
        && visualQualityToolSource.includes("readonly minLocalContrastRatio")
        && visualQualityToolSource.includes("readonly maxCanvasFlatPixelRatio")
        && visualQualityToolSource.includes("readonly minCanvasLocalContrastRatio")
        && visualQualityToolSource.includes("flatPixelRatio")
        && visualQualityToolSource.includes("localContrastRatio")
        && visualQualityToolSource.includes("external-parity-manual-review-cannot-override-automation"),
      [
        "tests/reports/external-parity-visual-quality.json",
        "tools/external-parity-visual-quality/index.ts",
        "packages/rendering/src/FrameVisualMetrics.ts",
        "tests/unit/rendering/frame-visual-metrics.test.ts"
      ],
      ["Visual-quality report or its root anti-slop implementation is missing. Root readiness must require flat-frame rejection, local-contrast thresholds, canvas-level visual thresholds, negative unit coverage, and non-overridable automation before example work can resume."]
    )
  ];
  const blockers = checks.flatMap((entry) => entry.passed ? [] : entry.blockers.map((blocker) => `${entry.id}: ${blocker}`));
  const objectiveChecklist = buildObjectiveChecklist(checks);
  const gate = evaluateExternalParityCodebaseRootReadinessGate({
    rootBlockers: blockers,
    completionBlockers: completionAuditBlockers(completionAudit),
    broadParityBlockers: broadParityBlockers(broadParity),
    externalEvidenceBlockers: externalEvidenceBlockers(externalEvidence),
    visualQualityOk: visualQuality?.ok === true
  });
  const promptToArtifactChecklist = buildPromptToArtifactChecklist({
    checks,
    gate,
    pbrGltf,
    hdr,
    shadow,
    postprocess,
    visualQuality,
    completionAudit,
    broadParity,
    externalEvidence
  });
  const report = {
    ...baseReport(root, {
      ok: gate.rootReady,
      command: "pnpm verify:external-parity-codebase-root",
      runIdPrefix: "external-parity-codebase-root-readiness",
      sourceFiles: [
        "tools/external-parity-codebase-root-readiness/index.ts",
        "tools/verify-architecture/index.ts",
        "tools/verify-boundaries/index.ts",
        "tools/package-size/index.ts",
        "tools/package-install-smoke/index.ts",
        "tools/claim-registry/index.ts",
        "tools/verify-trace/index.ts",
        "package.json",
        "packages/rendering/src/Renderer.ts",
        "packages/rendering/src/ExternalParityRenderPreset.ts",
        "packages/rendering/src/ProductTurntableFixtures.ts",
        "packages/rendering/src/FrameVisualMetrics.ts",
        "packages/rendering/src/Sampler.ts",
        "packages/rendering/src/index.ts",
        "packages/rendering/src/WebGL2Device.ts",
        "packages/rendering/src/WebGPUDevice.ts",
        "packages/rendering/src/shaders/pbr-direct.frag.glsl",
        "packages/assets/src/GLTFLoader.ts",
        "packages/assets/src/GLTFRenderResources.ts",
        "packages/input/src/controls/OrbitControls.ts",
        "tests/assets/gltf-inspection.test.ts",
        "tests/unit/input/camera-controls.test.ts",
        "tests/unit/rendering/renderer.test.ts",
        "tests/unit/rendering/procedural-texture-fixtures.test.ts",
        "tests/unit/rendering/external-parity-render-preset.test.ts",
        "tests/unit/rendering/render-state-leaks.test.ts",
        "tests/unit/rendering/frame-visual-metrics.test.ts",
        "tests/unit/rendering/shader-library.test.ts",
        "tests/unit/workstream5-runtime.test.ts",
        "tests/unit/rendering/camera-framing.test.ts",
        "tests/browser/workspace-vite-imports.spec.ts",
        "tests/browser/fixtures/workspace-vite-imports/main.ts",
        "tests/browser/rendering-camera-scene.spec.ts",
        "tests/browser/rendering-root-quality-gate.spec.ts",
        "tests/browser/asset-texture-browser.spec.ts",
        "tests/browser/webgpu-parity.spec.ts",
        "tools/external-parity-visual-quality/index.ts",
        "tests/reports/source-cleanliness-root.json",
        "tests/reports/architecture.json",
        "tests/reports/boundaries.json",
        "tests/reports/package-size.json",
        "tests/reports/package-install-smoke.json",
        "tests/reports/claim-registry.json",
        "tests/reports/final-requirements-trace.json",
        "tests/reports/external-parity-webgpu-parity.json",
        "tests/reports/external-parity-pbr-gltf-readiness.json",
        "tests/reports/external-parity-hdr-render-target-readiness.json",
        "tests/reports/external-parity-shadow-map-readiness.json",
        "tests/reports/external-parity-postprocess-suite.json",
        "tests/reports/external-parity-root-rendering-quality.json",
        "tests/reports/external-parity-visual-quality.json",
        "tests/reports/external-parity-example-visual-review.json",
        "tests/reports/external-parity-broad-parity-readiness.json",
        "tests/reports/external-parity-completion-audit.json",
        "tests/reports/external-parity-external-evidence-readiness.json"
      ],
      violations: gate.violations
    }),
    checks,
    objectiveChecklist,
    promptToArtifactChecklist,
    allCodebaseObjectiveRequirementsCovered: objectiveChecklist.every((entry) => entry.passed),
    objectiveActuallyComplete: promptToArtifactChecklist.every((entry) => entry.passed),
    rootContractsReady: gate.rootContractsReady,
    localVisualQualityReady: gate.localVisualQualityReady,
    exampleImplementationMayResume: gate.exampleImplementationMayResume && objectiveChecklist.every((entry) => entry.passed),
    rootReady: gate.rootReady,
    parityCompletionReady: gate.parityCompletionReady,
    examplesAllowedToResume: gate.examplesAllowedToResume,
    examplesResumeBlockers: gate.examplesResumeBlockers,
    exampleVisualsStillBlocked: visualQuality?.ok !== true,
    note: "rootContractsReady=true only proves local package, renderer, material, postprocess, HDR, shadow, camera, asset-resource, and WebGPU contracts. exampleImplementationMayResume=true now requires rootReady, so example work must stay paused while the current visual-quality gate rejects the output. examplesAllowedToResume=true requires rootReady plus broad parity, completion, and external-evidence reports to be green for parity/release claims."
  };
  writeJson(root, reportPath, report);
  return report;
}

function check(id: string, passed: boolean, evidencePaths: readonly string[], blockers: readonly string[]): RootCheck {
  return { id, passed, evidencePaths, blockers: passed ? [] : blockers };
}

function buildObjectiveChecklist(checks: readonly RootCheck[]): readonly {
  readonly requirement: string;
  readonly checkIds: readonly string[];
  readonly passed: boolean;
  readonly evidencePaths: readonly string[];
  readonly missingCheckIds: readonly string[];
}[] {
  const groups = [
    {
      requirement: "Renderer path and render-target behavior are fixed independent of examples.",
      checkIds: ["workspace-package-imports-resolve-in-vite", "renderer-explicit-render-target-contract", "external-parity-render-preset-capability-contract"],
    },
    {
      requirement: "Material and shader behavior is proven through root PBR/material evidence.",
      checkIds: ["root-material-shader-pbr-behavior", "full-gltf-local-loader-contract"],
    },
    {
      requirement: "Postprocess, HDR render-target, and shadow-map integration are proven through root renderer paths.",
      checkIds: ["postprocess-suite-root-real-scene-path", "hdr-render-target-root-path", "shadow-map-root-forward-path"],
    },
    {
      requirement: "Camera, framing, orbit defaults, and culling are proven through root camera movement evidence.",
      checkIds: ["root-renderer-camera-framing-contract"],
    },
    {
      requirement: "Asset-to-render-resource ergonomics are proven through loader, render-resource, package import, and browser texture evidence.",
      checkIds: ["asset-to-render-resource-ergonomics", "workspace-package-imports-resolve-in-vite"],
    },
    {
      requirement: "WebGPU root rendering path is locally green without broad parity overclaiming.",
      checkIds: ["webgpu-native-rendering-root-path"],
    },
    {
      requirement: "Package architecture, boundaries, source cleanliness, package install, size, and package-local tests are part of the root gate.",
      checkIds: ["root-package-source-cleanliness", "package-local-source-tests-run-in-root-gate"],
    },
    {
      requirement: "Claims and requirements trace cannot falsely mark blocked parity goals complete.",
      checkIds: ["root-claim-and-trace-gates"],
    },
    {
      requirement: "Example visual quality is tracked and blocks example/parity completion until approved.",
      checkIds: ["current-visual-quality-is-tracked-and-blocks-root-readiness"],
    },
  ] as const;
  return groups.map((group) => {
    const matched = group.checkIds.map((id) => checks.find((entry) => entry.id === id)).filter((entry): entry is RootCheck => Boolean(entry));
    const missingCheckIds = group.checkIds.filter((id) => !matched.some((entry) => entry.id === id));
    return {
      requirement: group.requirement,
      checkIds: group.checkIds,
      passed: missingCheckIds.length === 0 && matched.every((entry) => entry.passed),
      evidencePaths: [...new Set(matched.flatMap((entry) => entry.evidencePaths))].sort((left, right) => left.localeCompare(right)),
      missingCheckIds,
    };
  });
}

function buildPromptToArtifactChecklist(context: {
  readonly checks: readonly RootCheck[];
  readonly gate: ReturnType<typeof evaluateExternalParityCodebaseRootReadinessGate>;
  readonly pbrGltf: Record<string, unknown> | null;
  readonly hdr: Record<string, unknown> | null;
  readonly shadow: Record<string, unknown> | null;
  readonly postprocess: Record<string, unknown> | null;
  readonly visualQuality: Record<string, unknown> | null;
  readonly completionAudit: Record<string, unknown> | null;
  readonly broadParity: Record<string, unknown> | null;
  readonly externalEvidence: Record<string, unknown> | null;
}): readonly {
  readonly id: string;
  readonly requirement: string;
  readonly passed: boolean;
  readonly evidencePaths: readonly string[];
  readonly blocker: string | null;
}[] {
  const checkMap = new Map(context.checks.map((entry) => [entry.id, entry]));
  const checkGroup = (ids: readonly string[]) => {
    const matched = ids.map((id) => checkMap.get(id)).filter((entry): entry is RootCheck => Boolean(entry));
    const missing = ids.filter((id) => !checkMap.has(id));
    const failed = matched.filter((entry) => !entry.passed);
    return {
      passed: missing.length === 0 && failed.length === 0,
      evidencePaths: [...new Set(matched.flatMap((entry) => entry.evidencePaths))].sort((left, right) => left.localeCompare(right)),
      blocker: missing.length > 0
        ? `Missing readiness check ids: ${missing.join(", ")}`
        : failed.flatMap((entry) => entry.blockers).join(" ") || null
    };
  };
  const localRoot = checkGroup([
    "workspace-package-imports-resolve-in-vite",
    "renderer-explicit-render-target-contract",
    "root-renderer-camera-framing-contract",
    "asset-to-render-resource-ergonomics",
    "root-material-shader-pbr-behavior",
    "postprocess-suite-root-real-scene-path",
    "hdr-render-target-root-path",
    "shadow-map-root-forward-path",
    "webgpu-native-rendering-root-path",
    "package-local-source-tests-run-in-root-gate",
    "root-package-source-cleanliness",
    "root-claim-and-trace-gates"
  ]);
  return [
    {
      id: "audit-entire-codebase-root-contracts",
      requirement: "Audit the current package codebase rather than relying on example screenshots.",
      passed: context.gate.rootContractsReady && localRoot.passed,
      evidencePaths: localRoot.evidencePaths,
      blocker: context.gate.rootContractsReady && localRoot.passed ? null : localRoot.blocker ?? "Root contracts are not ready."
    },
    {
      id: "rendering-material-postprocess-shadow-camera-framing-ergonomics",
      requirement: "Rendering path, material/shader behavior, postprocess/HDR, shadow-map integration, camera/framing, and asset-to-render-resource ergonomics are locally proven.",
      passed: localRoot.passed,
      evidencePaths: localRoot.evidencePaths,
      blocker: localRoot.blocker
    },
    {
      id: "full-gltf-local-parity",
      requirement: "Full local glTF parity evidence is green.",
      passed: context.pbrGltf?.gltfParity === true,
      evidencePaths: ["tests/reports/external-parity-pbr-gltf-readiness.json", "packages/assets/src/GLTFLoader.ts", "packages/assets/src/GLTFRenderResources.ts"],
      blocker: context.pbrGltf?.gltfParity === true ? null : "Local glTF parity is not green."
    },
    {
      id: "full-pbr-parity",
      requirement: "Full PBR parity is complete, not merely bounded local PBR evidence.",
      passed: context.pbrGltf?.pbrParity === true,
      evidencePaths: ["tests/reports/external-parity-pbr-gltf-readiness.json", "tests/reports/external-parity-pbr-reference-readiness.json", "tests/reports/external-parity-pbr-visual-parity.json"],
      blocker: context.pbrGltf?.pbrParity === true ? null : `PBR parity remains blocked: ${stringList(context.pbrGltf?.pbrBlockers).join(" ") || "pbrParity is false."}`
    },
    {
      id: "production-hdr-render-target-parity",
      requirement: "Production HDR/render-target parity is complete, including external same-scene Unity/Unreal evidence.",
      passed: context.hdr?.hdrRenderTargetParity === true,
      evidencePaths: ["tests/reports/external-parity-hdr-render-target-readiness.json", "tests/reports/external-parity-root-rendering-quality.json"],
      blocker: context.hdr?.hdrRenderTargetParity === true ? null : `HDR parity remains blocked: ${stringList(context.hdr?.blockedEvidence).join(", ") || "hdrRenderTargetParity is false."}`
    },
    {
      id: "production-shadow-map-parity",
      requirement: "Production shadow-map parity is complete, including external same-scene Unity/Unreal evidence.",
      passed: context.shadow?.shadowMapParity === true,
      evidencePaths: ["tests/reports/external-parity-shadow-map-readiness.json", "tests/reports/external-parity-root-rendering-quality.json"],
      blocker: context.shadow?.shadowMapParity === true ? null : `Shadow-map parity remains blocked: ${stringList(context.shadow?.blockedEvidence).join(", ") || "shadowMapParity is false."}`
    },
    {
      id: "full-postprocess-suite-parity",
      requirement: "Full postprocess-suite parity is complete, not only local real-scene postprocess coverage.",
      passed: context.postprocess?.postprocessSuiteParity === true,
      evidencePaths: ["tests/reports/external-parity-postprocess-suite.json", "tests/reports/external-parity-root-rendering-quality.json"],
      blocker: context.postprocess?.postprocessSuiteParity === true ? null : `Postprocess parity remains blocked: ${stringList(context.postprocess?.blockedEffects).join(", ") || "postprocessSuiteParity is false."}`
    },
    {
      id: "examples-must-not-resume-before-root-proof",
      requirement: "Do not resume example implementation until root codebase issues are proven.",
      passed: context.gate.rootReady === true,
      evidencePaths: ["tests/reports/external-parity-codebase-root-readiness.json"],
      blocker: context.gate.rootReady === true ? null : "Root readiness is not green, so examples must remain untouched."
    },
    {
      id: "examples-solved-in-full",
      requirement: "After root proof, examples are visually solved in full and approved.",
      passed: context.visualQuality?.ok === true,
      evidencePaths: ["tests/reports/external-parity-visual-quality.json", "tests/reports/external-parity-example-visual-review.json"],
      blocker: context.visualQuality?.ok === true ? null : `Example visual quality remains blocked: ${stringList(context.visualQuality?.violations).join(" ") || "visual-quality report is not green."}`
    },
    {
      id: "broad-parity-and-production-claims",
      requirement: "Three.js/Babylon superiority, Unity/Unreal parity/replacement, and production-readiness claims are complete and externally evidenced.",
      passed: context.completionAudit?.ok === true &&
        context.broadParity?.claimReady === true &&
        context.externalEvidence?.externalEvidenceReady === true,
      evidencePaths: [
        "tests/reports/external-parity-completion-audit.json",
        "tests/reports/external-parity-broad-parity-readiness.json",
        "tests/reports/external-parity-external-evidence-readiness.json"
      ],
      blocker: context.completionAudit?.ok === true && context.broadParity?.claimReady === true && context.externalEvidence?.externalEvidenceReady === true
        ? null
        : [
          ...completionAuditBlockers(context.completionAudit),
          ...broadParityBlockers(context.broadParity),
          ...externalEvidenceBlockers(context.externalEvidence)
        ].join(" ")
    }
  ];
}

function pbrValidationPassed(report: Record<string, unknown> | null, id: string): boolean {
  return Array.isArray(report?.validations)
    && report.validations.some((entry) => isRecord(entry) && entry.id === id && entry.passed === true);
}

function validationPassed(report: Record<string, unknown> | null, id: string): boolean {
  return Array.isArray(report?.validations)
    && report.validations.some((entry) => isRecord(entry) && entry.id === id && entry.passed === true);
}

function hasAllEvidence(value: unknown, expected: readonly string[]): boolean {
  return Array.isArray(value) && expected.every((entry) => value.includes(entry));
}

function effectCount(value: unknown): number {
  return Array.isArray(value) ? value.length : Number(value ?? 0);
}

function hasLitMultiMaterialSceneEvidence(report: Record<string, unknown> | null): boolean {
  const evidence = isRecord(report?.litMultiMaterialScene) ? report.litMultiMaterialScene : null;
  if (!evidence) return false;
  const frames = Array.isArray(evidence.frames) ? evidence.frames : [];
  return Number(evidence.uniqueHashes) === 3 &&
    frames.length === 3 &&
    frames.every((frame) => {
      const record = isRecord(frame) ? frame : {};
      const diagnostics = isRecord(record.diagnostics) ? record.diagnostics : {};
      const stats = isRecord(record.stats) ? record.stats : {};
      return diagnostics.lastError === null &&
        Number(diagnostics.drawCalls) >= 32 &&
        Number(stats.width) === 640 &&
        Number(stats.height) === 360 &&
        Number(stats.nonDarkRatio) > 0.12 &&
        Number(stats.salientRatio) > 0.11 &&
        Number(stats.occupiedAreaRatio) > 0.2 &&
        Number(stats.occupiedQuadrants) === 4 &&
        Number(stats.colorBuckets) > 120 &&
        Number(stats.dominantBucketRatio) < 0.75 &&
        Number(stats.edgePixelRatio) > 0.008 &&
        Number(stats.averageLuma) > 25 &&
        Number(stats.maxLuma) > 180;
    });
}

function hasAuthoredCameraMovementEvidence(report: Record<string, unknown> | null): boolean {
  const evidence = isRecord(report?.authoredCameraMovement) ? report.authoredCameraMovement : null;
  if (!evidence) return false;
  const frames = Array.isArray(evidence.frames) ? evidence.frames : [];
  return Number(evidence.cameraFrustumPlanes) === 6 &&
    Number(evidence.uniqueHashes) >= 2 &&
    frames.length >= 3 &&
    frames.every((frame) => {
      const record = isRecord(frame) ? frame : {};
      const diagnostics = isRecord(record.diagnostics) ? record.diagnostics : {};
      const stats = isRecord(record.stats) ? record.stats : {};
      return diagnostics.lastError === null &&
        Number(diagnostics.drawCalls) >= 4 &&
        Number(stats.nonDarkRatio) > 0.055 &&
        Number(stats.salientRatio) > 0.12 &&
        Number(stats.occupiedAreaRatio) > 0.23 &&
        Number(stats.occupiedQuadrants) === 4 &&
        Number(stats.colorBuckets) > 10 &&
        Number(stats.dominantBucketRatio) < 0.88 &&
        Number(stats.edgePixelRatio) > 0.008 &&
        Number(stats.averageLuma) > 5 &&
    Number(stats.maxLuma) > 45;
    });
}

function hasDenseCameraFramingEvidence(report: Record<string, unknown> | null): boolean {
  const evidence = isRecord(report?.denseCameraFraming) ? report.denseCameraFraming : null;
  if (!evidence) return false;
  const frames = Array.isArray(evidence.frames) ? evidence.frames : [];
  return Number(evidence.totalRenderables) >= 90 &&
    Number(evidence.cameraFrustumPlanes) === 6 &&
    Number(evidence.uniqueHashes) >= 3 &&
    frames.length >= 4 &&
    frames.every((frame) => {
      const record = isRecord(frame) ? frame : {};
      const diagnostics = isRecord(record.diagnostics) ? record.diagnostics : {};
      const stats = isRecord(record.stats) ? record.stats : {};
      return diagnostics.lastError === null &&
        Number(diagnostics.drawCalls) >= 40 &&
        Number(stats.nonDarkRatio) > 0.24 &&
        Number(stats.salientRatio) > 0.22 &&
        Number(stats.occupiedAreaRatio) > 0.48 &&
        Number(stats.occupiedQuadrants) === 4 &&
        Number(stats.colorBuckets) > 70 &&
        Number(stats.dominantBucketRatio) < 0.8 &&
        Number(stats.edgePixelRatio) > 0.012 &&
        Number(stats.averageLuma) > 38 &&
        Number(stats.maxLuma) > 110;
    });
}

function hasProductTurntableRenderKitEvidence(report: Record<string, unknown> | null): boolean {
  const evidence = isRecord(report?.productTurntableRenderKit) ? report.productTurntableRenderKit : null;
  if (!evidence) return false;
  const diagnostics = isRecord(evidence.diagnostics) ? evidence.diagnostics : {};
  const stats = isRecord(evidence.stats) ? evidence.stats : {};
  const bounds = isRecord(stats.bounds) ? stats.bounds : {};
  const productRegion = isRecord(evidence.productRegion) ? evidence.productRegion : {};
  const fixture = isRecord(evidence.fixture) ? evidence.fixture : {};
  return diagnostics.lastError === null &&
    Number(diagnostics.drawCalls) >= 10 &&
    Number(evidence.renderItemCount) >= 10 &&
    Number(evidence.materialCount) >= 6 &&
    Number(evidence.geometryCount) >= 6 &&
    evidence.postprocessTargetFormat === "rgba16f" &&
    evidence.sourceCameraPolicy === "auto-frame" &&
    evidence.shadowEnabled === true &&
    Number(evidence.collectedLightCount) >= 3 &&
    Number(evidence.shadowCastingLightCount) === 1 &&
    fixture.id === "external-parity-old-branch-product-turntable-fixture" &&
    Number(fixture.visibleHotspotCount) > 0 &&
    fixture.lightingPreset === "studio" &&
    typeof fixture.manifestHash === "string" &&
    /^[0-9a-f]{8}$/.test(fixture.manifestHash) &&
    Number(stats.width) === 960 &&
    Number(stats.height) === 540 &&
    Number(stats.nonDarkRatio) > 0.14 &&
    Number(stats.salientRatio) > 0.105 &&
    Number(stats.occupiedAreaRatio) > 0.24 &&
    Number(stats.occupiedQuadrants) === 4 &&
    Number(bounds.minX) > 180 &&
    Number(bounds.maxX) < 950 &&
    Number(stats.colorBuckets) >= 140 &&
    Number(stats.colorBuckets) < 450 &&
    Number(stats.dominantBucketRatio) < 0.65 &&
    Number(stats.edgePixelRatio) > 0.012 &&
    Number(stats.edgePixelRatio) < 0.04 &&
    Number(stats.maxLuma) > 150 &&
    Number(productRegion.productPixels) > 7_000 &&
    Number(productRegion.productPixelRatio) > 0.07 &&
    Number(productRegion.colorBuckets) > 160 &&
    Number(productRegion.edgePixelRatio) > 0.02;
}

function hasRootQualityScreenshotEvidence(root: string, report: Record<string, unknown> | null, sections: readonly string[]): boolean {
  if (!isRecord(report)) return false;
  return sections.every((section) => {
    const evidence = isRecord(report[section]) ? report[section] : {};
    if (typeof evidence.screenshotPath === "string") {
      return validateRootQualityPng(root, evidence.screenshotPath);
    }
    if (Array.isArray(evidence.screenshotPaths)) {
      return evidence.screenshotPaths.length > 0 &&
        evidence.screenshotPaths.every((path) => typeof path === "string" && validateRootQualityPng(root, path));
    }
    return false;
  });
}

function validateRootQualityPng(root: string, relativePath: string): boolean {
  const fullPath = `${root}/${relativePath}`;
  if (!existsSync(fullPath)) return false;
  const data = readFileSync(fullPath);
  const isPng =
    data.length >= 24 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47 &&
    data[4] === 0x0d &&
    data[5] === 0x0a &&
    data[6] === 0x1a &&
    data[7] === 0x0a;
  if (!isPng) return false;
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  return width >= 160 && height >= 120 && statSync(fullPath).size > 1_024;
}

function hasPbrMaterialScalarResponseEvidence(report: Record<string, unknown> | null): boolean {
  const evidence = isRecord(report?.pbrMaterialScalarResponse) ? report.pbrMaterialScalarResponse : null;
  if (!evidence) return false;
  const dielectric = isRecord(evidence.dielectric) ? evidence.dielectric : {};
  const metallic = isRecord(evidence.metallic) ? evidence.metallic : {};
  return evidence.hashChanged === true &&
    Number(evidence.averageLumaDelta) > 5 &&
    Number(evidence.colorBucketDelta) > 1 &&
    Number(dielectric.nonDarkPixels) > 3_500 &&
    Number(metallic.nonDarkPixels) > 3_500 &&
    Number(dielectric.salientRatio) > 0.18 &&
    Number(metallic.salientRatio) > 0.18 &&
    Number(dielectric.occupiedAreaRatio) > 0.23 &&
    Number(metallic.occupiedAreaRatio) > 0.23 &&
    Number(dielectric.occupiedQuadrants) === 4 &&
    Number(metallic.occupiedQuadrants) === 4 &&
    Number(dielectric.colorBuckets) > 8 &&
    Number(metallic.colorBuckets) > 8 &&
    Number(dielectric.dominantBucketRatio) < 0.82 &&
    Number(metallic.dominantBucketRatio) < 0.82 &&
    Number(dielectric.edgePixelRatio) > 0.012 &&
    Number(metallic.edgePixelRatio) > 0.012 &&
    Number(dielectric.averageLuma) > 24 &&
    Number(metallic.averageLuma) > 16;
}

function hasAdvancedTexturedPbrVariantEvidence(report: Record<string, unknown> | null): boolean {
  const evidence = isRecord(report?.advancedTexturedPbrVariants) ? report.advancedTexturedPbrVariants : null;
  if (!evidence) return false;
  const results = Array.isArray(evidence.results) ? evidence.results : [];
  return Number(evidence.combinedVariantCount) >= 2 &&
    Number(evidence.uniqueHashes) >= 4 &&
    results.length >= 6 &&
    results.every((entry) => {
      const record = isRecord(entry) ? entry : {};
      return record.variantMatched === true &&
        Number(record.drawCalls) === 1 &&
        record.lastError === null &&
        Number(record.nonDarkPixels) > 3_500 &&
        Number(record.salientRatio) > 0.18 &&
        Number(record.occupiedAreaRatio) > 0.23 &&
        Number(record.occupiedQuadrants) === 4 &&
        Number(record.colorBuckets) > 6 &&
        Number(record.dominantBucketRatio) < 0.82 &&
        Number(record.edgePixelRatio) > 0.012 &&
        Number(record.averageLuma) > 20 &&
        Number(record.maxLuma) > 40;
    });
}

function hasSrgbPbrTextureSamplingEvidence(report: Record<string, unknown> | null): boolean {
  const evidence = isRecord(report?.srgbPbrTextureSampling) ? report.srgbPbrTextureSampling : null;
  if (!evidence) return false;
  const diagnostics = isRecord(evidence.diagnostics) ? evidence.diagnostics : {};
  return diagnostics.lastError === null &&
    Number(evidence.scalarLuma) > 35 &&
    Number(evidence.texturedLuma) > 35 &&
    Number(evidence.ratio) > 0.72 &&
    Number(evidence.ratio) < 1.32;
}

function hasPostprocessClearColorPreservationEvidence(report: Record<string, unknown> | null): boolean {
  const evidence = isRecord(report?.postprocessClearColorPreservation) ? report.postprocessClearColorPreservation : null;
  if (!evidence) return false;
  const diagnostics = isRecord(evidence.diagnostics) ? evidence.diagnostics : {};
  const stats = isRecord(evidence.stats) ? evidence.stats : {};
  return diagnostics.lastError === null &&
    Number(diagnostics.drawCalls) === 0 &&
    Number(stats.averageLuma) < 28 &&
    Number(stats.maxLuma) < 34 &&
    Number(stats.salientRatio) === 0 &&
    Number(stats.colorBuckets) <= 3;
}

function hasPostprocessPresentationCullStateEvidence(report: Record<string, unknown> | null): boolean {
  const evidence = isRecord(report?.postprocessPresentationIgnoresSceneCullState) ? report.postprocessPresentationIgnoresSceneCullState : null;
  if (!evidence) return false;
  const diagnostics = isRecord(evidence.diagnostics) ? evidence.diagnostics : {};
  const stats = isRecord(evidence.stats) ? evidence.stats : {};
  return diagnostics.lastError === null &&
    Number(diagnostics.drawCalls) === 2 &&
    Number(stats.nonDarkRatio) > 0.08 &&
    Number(stats.salientRatio) > 0.07 &&
    Number(stats.maxLuma) > 80 &&
    Number(stats.edgePixelRatio) > 0.01;
}

function hasRootPostprocessSuiteEvidence(report: Record<string, unknown> | null): boolean {
  const evidence = isRecord(report?.postprocessSuite) ? report.postprocessSuite : null;
  if (!evidence) return false;
  const effects = isRecord(evidence.effects) ? evidence.effects : {};
  const baseStats = isRecord(evidence.baseStats) ? evidence.baseStats : {};
  const integratedStats = isRecord(evidence.integratedStats) ? evidence.integratedStats : {};
  const colorManagement = isRecord(evidence.colorManagement) ? evidence.colorManagement : {};
  const controls = isRecord(colorManagement.controls) ? colorManagement.controls : {};
  const calibration = isRecord(colorManagement.calibration) ? colorManagement.calibration : {};
  const preset = isRecord(colorManagement.preset) ? colorManagement.preset : {};
  const requiredEffects = [
    "toneMapping",
    "toneMappingPresets",
    "autoExposure",
    "bloom",
    "fxaa",
    "colorGrading",
    "vignette",
    "sharpening",
    "depthVisualization",
    "chromaticAberration",
    "filmGrain",
    "depthOfField",
    "outline",
    "motionBlur",
    "ssao",
    "ssr",
    "taa",
  ];
  return requiredEffects.every((effect) => effects[effect] === true) &&
    Number(evidence.baseDrawCalls) >= 6 &&
    Number(evidence.integratedDrawCalls) >= 6 &&
    Number(evidence.integratedChangedPixels) > 1_000 &&
    Number(baseStats.nonDarkRatio) > 0.08 &&
    Number(baseStats.salientRatio) > 0.15 &&
    Number(baseStats.occupiedAreaRatio) > 0.3 &&
    Number(baseStats.occupiedQuadrants) === 4 &&
    Number(baseStats.colorBuckets) > 12 &&
    Number(baseStats.dominantBucketRatio) < 0.85 &&
    Number(baseStats.edgePixelRatio) > 0.02 &&
    Number(integratedStats.nonDarkRatio) > 0.08 &&
    Number(integratedStats.salientRatio) > 0.25 &&
    Number(integratedStats.salientRatio) < 0.75 &&
    Number(integratedStats.occupiedAreaRatio) > 0.35 &&
    Number(integratedStats.occupiedQuadrants) === 4 &&
    Number(integratedStats.colorBuckets) > 12 &&
    Number(integratedStats.dominantBucketRatio) < 0.82 &&
    Number(integratedStats.edgePixelRatio) > 0.018 &&
    Number(integratedStats.edgePixelRatio) < 0.18 &&
    controls.toneMapper === "filmic" &&
    Number(controls.exposure) === 1.25 &&
    controls.inputColorSpace === "linear" &&
    controls.outputColorSpace === "srgb" &&
    calibration.operator === "aces" &&
    calibration.monotonic === true &&
    preset.name === "cinematic" &&
    Number(preset.histogramPixelCount) > 0 &&
    Number(preset.histogramBinCount) >= 32 &&
    Number(preset.averageLuminance) > 0 &&
    Number(preset.autoExposure) > 0;
}

function hasRootHdrRenderTargetEvidence(report: Record<string, unknown> | null): boolean {
  const evidence = isRecord(report?.hdrRenderTarget) ? report.hdrRenderTarget : null;
  if (!evidence) return false;
  return evidence.status === "ready" &&
    Number(evidence.maxR) > 1.5 &&
    Number(evidence.maxG) > 1.2 &&
    Number(evidence.overbrightPixels) > 100;
}

function hasRootShadowResizeStabilityEvidence(report: Record<string, unknown> | null): boolean {
  const evidence = isRecord(report?.shadowResizeStability) ? report.shadowResizeStability : null;
  if (!evidence) return false;
  const frames = Array.isArray(evidence.frames) ? evidence.frames : [];
  return evidence.status === "ready" &&
    evidence.dprShadowDarker === true &&
    evidence.resizedShadowDarker === true &&
    evidence.resizedDrawCallsStable === true &&
    evidence.scaledShadowMap === true &&
    frames.length === 2 &&
    frames.every((frame) => {
      const record = isRecord(frame) ? frame : {};
      return Number(record.drawCalls) === 2 &&
        record.lastError === null &&
        Number(record.shadowDeltaRgb) > 60;
    });
}

function completionAuditBlockers(report: Record<string, unknown> | null): string[] {
  if (!isRecord(report)) return ["completion: tests/reports/external-parity-completion-audit.json is missing"];
  if (report.ok === true && report.auditComplete === true) return [];
  const missingCriteria = criteriaIds(report.missingCriteria);
  if (missingCriteria.length > 0) {
    return [`completion: ${missingCriteria.length} of ${Number(report.totalCriteria ?? 13)} criteria remain blocked (${missingCriteria.join(", ")})`];
  }
  const failedCriteria = criteriaIds(report.criteria, false);
  if (failedCriteria.length > 0) {
    return [`completion: ${failedCriteria.length} criteria remain blocked (${failedCriteria.join(", ")})`];
  }
  return ["completion: external-parity completion audit is not green"];
}

function broadParityBlockers(report: Record<string, unknown> | null): string[] {
  if (!isRecord(report)) return ["broad-parity: tests/reports/external-parity-broad-parity-readiness.json is missing"];
  if (report.ok === true && report.claimReady === true) return [];
  const blockedClaimIds = Array.isArray(report.claims)
    ? report.claims
      .filter((entry) => isRecord(entry) && entry.ready !== true)
      .map((entry) => typeof entry.id === "string" ? entry.id : "unknown-claim")
    : [];
  if (blockedClaimIds.length > 0) {
    return [`broad-parity: ${blockedClaimIds.length} claims remain blocked (${blockedClaimIds.join(", ")})`];
  }
  return ["broad-parity: broad parity readiness is not green"];
}

function externalEvidenceBlockers(report: Record<string, unknown> | null): string[] {
  if (!isRecord(report)) return ["external-evidence: tests/reports/external-parity-external-evidence-readiness.json is missing"];
  if (report.externalEvidenceReady === true) return [];
  const missingCapability = typeof report.firstMissingCapability === "string" ? report.firstMissingCapability : "unknown-capability";
  const firstBlockedArtifact = typeof report.firstBlockedArtifact === "string" ? report.firstBlockedArtifact : "unknown-artifact";
  return [`external-evidence: external parity evidence is not runnable/complete here (first missing capability: ${missingCapability}; first blocked artifact: ${firstBlockedArtifact})`];
}

function criteriaIds(value: unknown, achieved?: boolean): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === "string") return [entry];
    if (isRecord(entry) && typeof entry.id === "string" && (achieved === undefined || entry.achieved === achieved)) {
      return [entry.id];
    }
    return [];
  });
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function readText(root: string, path: string): string {
  return readFileSync(`${root}/${path}`, "utf8");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const cliMode: ExternalParityCodebaseRootReadinessCliMode = process.argv.includes("--contracts-only") ? "contracts-only" : "strict";
  const report = createExternalParityCodebaseRootReadinessReport();
  const cliPass = shouldExternalParityCodebaseRootReadinessCliPass(report, cliMode);
  console.log(JSON.stringify({
    cliMode,
    cliPass,
    ok: report.ok,
    rootContractsReady: report.rootContractsReady,
    allCodebaseObjectiveRequirementsCovered: report.allCodebaseObjectiveRequirementsCovered,
    rootReady: report.rootReady,
    exampleImplementationMayResume: report.exampleImplementationMayResume,
    examplesAllowedToResume: report.examplesAllowedToResume,
    checks: report.checks.length,
    failures: report.checks.filter((entry) => !entry.passed).map((entry) => entry.id),
    examplesResumeBlockers: report.examplesResumeBlockers.slice(0, 5),
    exampleVisualsStillBlocked: report.exampleVisualsStillBlocked
  }, null, 2));
  if (!cliPass) process.exitCode = 1;
}
