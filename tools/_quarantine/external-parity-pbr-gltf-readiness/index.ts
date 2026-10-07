import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { baseReport, isRecord, readJson, writeJson } from "../external-parity-reporting/index.js";

export interface ExternalParityPbrGltfReadinessReport {
  readonly ok: boolean;
  readonly auditComplete: true;
  readonly pbrParity: boolean;
  readonly gltfParity: boolean;
  readonly gltfParityDimensions: readonly ExternalParityGltfParityDimension[];
  readonly gltfExtensionParity: {
    readonly localCoveredExtensions: readonly string[];
    readonly browserVisualCoveredExtensions: readonly string[];
    readonly requiredForFullParity: readonly string[];
    readonly missingForFullParity: readonly string[];
    readonly unsupportedInLocalCorpus: readonly string[];
  };
  readonly pbrEvidence: readonly string[];
  readonly gltfEvidence: readonly string[];
  readonly pbrBlockers: readonly string[];
  readonly gltfBlockers: readonly string[];
  readonly validations: readonly {
    readonly id: string;
    readonly passed: boolean;
    readonly evidence: string;
    readonly blockers: readonly string[];
  }[];
  readonly violations: readonly string[];
}

export interface ExternalParityGltfParityDimension {
  readonly id: string;
  readonly ready: boolean;
  readonly evidence: readonly string[];
  readonly blockers: readonly string[];
  readonly metrics: Record<string, number | string | boolean>;
}

const reportPath = "tests/reports/external-parity-pbr-gltf-readiness.json";
const sourceFiles = [
  "tools/external-parity-pbr-gltf-readiness/index.ts",
  "packages/rendering/src/PBRMaterial.ts",
  "packages/rendering/src/ShaderLibrary.ts",
  "packages/rendering/src/TexturedPBRMaterial.ts",
  "packages/rendering/src/NormalMappedPBRMaterial.ts",
  "examples/pbr-extension-texture-variants/main.ts",
  "packages/assets/src/GLTFLoader.ts",
  "packages/assets/src/GLTFRenderResources.ts",
  "examples/material-showroom/main.ts",
  "examples/asset-viewer/main.ts",
  "tests/reports/external-parity-rendering.json",
  "tests/reports/external-parity-asset-corpus.json",
  "tests/reports/external-parity-asset-compression.json",
  "tests/reports/external-parity-asset-material-fidelity.json",
  "tests/reports/external-parity-khronos-gltf-visuals.json",
  "tests/reports/gltf-100-classification.json",
  "tests/reports/asset-compatibility-threejs.json",
  "tests/reports/blender-same-corpus-export.json",
  "tools/blender-same-corpus-export/index.ts",
  "tests/assets/corpus/gltf-100-classification.manifest.json",
  "tests/reports/external-parity-engine-comparison.json",
  "tests/reports/external-parity-pbr-visual-parity.json",
  "tools/external-parity-pbr-visual-parity/index.ts",
  "tests/reports/external-parity-pbr-reference-readiness.json",
  "tools/external-parity-pbr-reference-readiness/index.ts",
  "tests/reports/external-parity-gltf-loader-visual-parity.json",
  "tools/external-parity-gltf-loader-visual-parity/index.ts",
  "tests/unit/rendering/shader-library.test.ts",
  "tests/unit/rendering/pbr-lighting.test.ts",
  "tests/unit/rendering/renderer.test.ts",
  "tests/browser/rendering-external-parity-visuals.spec.ts",
] as const;

export function createExternalParityPbrGltfReadinessReport(root = process.cwd()): ExternalParityPbrGltfReadinessReport {
  const rendering = readJson(root, "tests/reports/external-parity-rendering.json");
  const assets = readJson(root, "tests/reports/external-parity-asset-corpus.json");
  const assetCompression = readJson(root, "tests/reports/external-parity-asset-compression.json");
  const materialFidelity = readJson(root, "tests/reports/external-parity-asset-material-fidelity.json");
  const khronosVisuals = readJson(root, "tests/reports/external-parity-khronos-gltf-visuals.json");
  const khronos100Classification = readJson(root, "tests/reports/gltf-100-classification.json");
  const assetCompatibility = readJson(root, "tests/reports/asset-compatibility-threejs.json");
  const blenderSameCorpusExport = readJson(root, "tests/reports/blender-same-corpus-export.json");
  const comparison = readJson(root, "tests/reports/external-parity-engine-comparison.json");
  const pbrVisual = readJson(root, "tests/reports/external-parity-pbr-visual-parity.json");
  const pbrReference = readJson(root, "tests/reports/external-parity-pbr-reference-readiness.json");
  const gltfLoaderVisualParity = readJson(root, "tests/reports/external-parity-gltf-loader-visual-parity.json");
  const validations = Array.isArray(rendering?.validations) ? rendering.validations : [];
  const materialShowroom = validations.find((entry) => isRecord(entry) && entry.name === "material-showroom-external-parity-preset");
  const materialChecks = isRecord(materialShowroom) && isRecord(materialShowroom.checks) ? materialShowroom.checks : {};
  const materialMetrics = isRecord(materialShowroom) && isRecord(materialShowroom.metrics) ? materialShowroom.metrics : {};
  const assetList = Array.isArray(assets?.assets) ? assets.assets.filter(isRecord) : [];
  const assetFeatures = new Set(assetList.flatMap((asset) => stringArray(asset.features)));
  const materialFeatures = new Set(assetList.flatMap((asset) => stringArray(asset.materialFeatures)));
  const unsupportedAssetFeatures = new Set(assetList.flatMap((asset) => stringArray(asset.unsupportedFeatures)));
  const localCoveredExtensions = sortedUnique(assetList.flatMap((asset) => isRecord(asset.loaderDiagnostics) ? stringArray(asset.loaderDiagnostics.extensionsUsed) : []));
  const unsupportedInLocalCorpus = sortedUnique(assetList.flatMap((asset) => isRecord(asset.loaderDiagnostics) ? stringArray(asset.loaderDiagnostics.unsupportedExtensions) : []));
  const khronosVisualValidations = Array.isArray(khronosVisuals?.validations) ? khronosVisuals.validations.filter(isRecord) : [];
  const meshoptVisual = khronosVisualValidations.find((entry) =>
    entry.assetId === "meshopt-cube-test" &&
    entry.ok === true &&
    !stringArray(entry.warningCodes).includes("GLTF_UNSUPPORTED_EXTENSION")
  );
  const multiUvVisual = khronosVisualValidations.find((entry) =>
    entry.assetId === "multi-uv-test" &&
    entry.ok === true &&
    stringArray(entry.warningCodes).includes("ASSET_VIEWER_MULTI_UV_RENDER_ACTIVE") &&
    !stringArray(entry.warningCodes).includes("ASSET_VIEWER_MULTI_UV_RENDER_FALLBACK")
  );
  const khronosVisualCoverageComplete = khronosVisuals?.ok === true &&
    Number(khronosVisuals.visualAssetCount ?? 0) >= Number(khronosVisuals.sourceAssetCount ?? Number.POSITIVE_INFINITY);
  const boundedPbrVisualParity = hasExpandedPbrVisualParity(pbrVisual);
  const boundedPbrReferenceEvidence = hasBoundedPbrReferenceEvidence(pbrReference);
  const boundedGltfLoaderVisualParity = hasBoundedGltfLoaderVisualParity(gltfLoaderVisualParity);
  const khronos100ClassificationEvidence = hasKhronos100ClassificationEvidence(khronos100Classification);
  const hdrIblMaterialEvidence = hasHdrIblMaterialEvidence(materialFidelity);
  const advancedPbrTextureVariantEvidence = hasAdvancedPbrTextureVariantEvidence(root);
  const advancedPbrTextureVariantBrowserEvidence = hasAdvancedPbrTextureVariantBrowserEvidence(rendering, root);
  const advancedPbrCombinedTextureVariantBrowserEvidence = hasAdvancedPbrCombinedTextureVariantBrowserEvidence(rendering, root);
  const browserVisualCoveredExtensions = sortedUnique([
    ...localCoveredExtensions,
    ...(meshoptVisual ? ["EXT_meshopt_compression"] : []),
    ...(hasBrowserCompressionExtension(assetCompression, "EXT_meshopt_compression") ? ["EXT_meshopt_compression"] : []),
    ...(hasBrowserCompressionExtension(assetCompression, "KHR_draco_mesh_compression") ? ["KHR_draco_mesh_compression"] : []),
    ...(hasBrowserCompressionExtension(assetCompression, "KHR_texture_basisu") ? ["KHR_texture_basisu"] : []),
  ]);
  const missingForFullParity = FULL_GLTF_PARITY_EXTENSIONS.filter((extension) => !browserVisualCoveredExtensions.includes(extension));
  const extensionParityReady = missingForFullParity.length === 0 && unsupportedInLocalCorpus.length === 0;
  const gltfParityDimensions = createGltfParityDimensions({
    assets,
    khronosVisuals,
    khronos100Classification,
    assetCompatibility,
    blenderSameCorpusExport,
    comparison,
    gltfLoaderVisualParity,
    assetCount: assetList.length,
    unsupportedAssetFeatures,
    localCoveredExtensions,
    browserVisualCoveredExtensions,
    missingForFullParity,
    unsupportedInLocalCorpus,
    khronosVisualCoverageComplete,
    boundedGltfLoaderVisualParity,
    extensionParityReady,
  });
  const pbrReferenceSupportedEvidence = new Set(
    Array.isArray(pbrReference?.supportedEvidence)
      ? pbrReference.supportedEvidence.filter((entry): entry is string => typeof entry === "string")
      : []
  );
  const localReferenceSuiteEvidence = boundedPbrReferenceEvidence &&
    pbrReferenceSupportedEvidence.has("photometric-pbr-conformance-suite") &&
    pbrReferenceSupportedEvidence.has("bounded-transmission-volume-reference-suite") &&
    pbrReferenceSupportedEvidence.has("bounded-caustics-transmission-reference-suite");

  const pbrEvidence = [
    ...(materialChecks.pbrFeatures === true ? ["browser-material-showroom-bounded-pbr"] : []),
    ...(materialChecks.materialSet === true && Number(materialMetrics.materialCount) >= 13 ? ["advanced-material-lobe-coverage"] : []),
    ...(materialChecks.environmentResources === true ? ["environment-reflection-brdf-lut-resource-evidence"] : []),
    ...(assetFeatures.has("hdr-studio-environment-resource") ? ["hdr-studio-environment-resource-corpus"] : []),
    ...(assetFeatures.has("linear-hdr-ibl-resource") && hdrIblMaterialEvidence ? ["asset-viewer-linear-hdr-ibl-resource-evidence"] : []),
    ...(materialFeatures.has("normal-texture") ? ["normal-texture-material-corpus"] : []),
    ...(materialFeatures.has("metallic-roughness-texture") ? ["metallic-roughness-material-corpus"] : []),
    ...(materialFeatures.has("emissive-texture") ? ["emissive-material-corpus"] : []),
    ...(materialFeatures.has("occlusion-texture") ? ["occlusion-material-corpus"] : []),
    ...(materialFeatures.has("double-sided") ? ["double-sided-material-corpus"] : []),
    ...(materialFeatures.has("clearcoat") ? ["clearcoat-material-extension-corpus"] : []),
    ...(materialFeatures.has("transmission") ? ["transmission-material-extension-corpus"] : []),
    ...(materialFeatures.has("diffuse-transmission") ? ["diffuse-transmission-material-extension-corpus"] : []),
    ...(materialFeatures.has("volume") ? ["volume-material-extension-corpus"] : []),
    ...(materialFeatures.has("specular") ? ["specular-material-extension-corpus"] : []),
    ...(materialFeatures.has("sheen") ? ["sheen-material-extension-corpus"] : []),
    ...(materialFeatures.has("anisotropy") ? ["anisotropy-material-extension-corpus"] : []),
    ...(materialFeatures.has("iridescence") ? ["iridescence-material-extension-corpus"] : []),
    ...(materialFeatures.has("dispersion") ? ["dispersion-material-extension-corpus"] : []),
    ...(materialFeatures.has("pbr-specular-glossiness") ? ["pbr-specular-glossiness-extension-corpus"] : []),
    ...(boundedPbrReferenceEvidence ? ["cpu-ggx-smith-burley-pbr-reference-evidence"] : []),
    ...(pbrReferenceSupportedEvidence.has("photometric-pbr-conformance-suite") ? ["photometric-pbr-conformance-suite"] : []),
    ...(pbrReferenceSupportedEvidence.has("bounded-transmission-volume-reference-suite") ? ["bounded-transmission-volume-reference-suite"] : []),
    ...(pbrReferenceSupportedEvidence.has("bounded-caustics-transmission-reference-suite") ? ["bounded-caustics-transmission-reference-suite"] : []),
    ...(boundedPbrVisualParity ? ["bounded-threejs-babylon-11-state-pbr-visual-parity"] : []),
    ...(advancedPbrTextureVariantEvidence ? ["sampler-budgeted-advanced-pbr-texture-shader-variants"] : []),
    ...(advancedPbrTextureVariantBrowserEvidence ? ["browser-rendered-advanced-pbr-texture-shader-variants"] : []),
    ...(advancedPbrCombinedTextureVariantBrowserEvidence ? ["browser-rendered-combined-advanced-pbr-texture-map-variants"] : []),
  ];
  const gltfEvidence = [
    ...(assets?.ok === true ? ["external-parity-asset-corpus-report-passing"] : []),
    ...(Number(assets?.assetCount ?? 0) >= 7 ? ["generated-external-parity-gltf-corpus"] : []),
    ...(assetFeatures.has("skin") ? ["skinned-gltf-asset"] : []),
    ...(assetFeatures.has("skin") && !unsupportedAssetFeatures.has("lit-skinning-render-application") ? ["skinned-gltf-render-palette-evidence"] : []),
    ...(assetFeatures.has("animated-morph-weights") ? ["animated-morph-weight-gltf-asset"] : []),
    ...(assetFeatures.has("root-motion-diagnostic") ? ["root-motion-animation-gltf-asset"] : []),
    ...(assetFeatures.has("root-motion-diagnostic") && !unsupportedAssetFeatures.has("full-root-motion-controller") ? ["root-motion-controller-evidence"] : []),
    ...(khronosVisuals?.ok === true && Number(khronosVisuals.visualAssetCount ?? 0) >= 15 ? ["supported-khronos-glb-browser-visual-slice"] : []),
    ...(meshoptVisual ? ["browser-khr-meshopt-decoded-visual-slice"] : []),
    ...(multiUvVisual ? ["browser-multi-uv-two-set-visual-slice"] : []),
    ...(khronos100ClassificationEvidence ? ["khronos-100-source-classification-corpus"] : []),
    ...(khronosVisualCoverageComplete ? ["pinned-khronos-corpus-browser-visual-coverage"] : []),
    ...(khronosVisuals?.fullPinnedCorpusVisualParity === true ? ["full-pinned-khronos-corpus-browser-visual-parity"] : []),
    ...(materialFeatures.has("material-variant") ? ["material-variant-gltf-asset"] : []),
    ...(assetFeatures.has("texture-transform") ? ["texture-transform-gltf-asset"] : []),
    ...(materialFeatures.has("pbr-specular-glossiness") ? ["pbr-specular-glossiness-gltf-extension-asset"] : []),
    ...(boundedGltfLoaderVisualParity ? ["bounded-same-source-gltf-loader-visual-parity-threejs-babylon"] : []),
    ...(localCoveredExtensions.length >= 15 ? ["local-external-parity-gltf-extension-coverage-matrix"] : []),
    ...(browserVisualCoveredExtensions.includes("EXT_meshopt_compression") ? ["browser-visual-meshopt-extension-coverage"] : []),
    ...(browserVisualCoveredExtensions.includes("KHR_draco_mesh_compression") ? ["browser-visual-draco-extension-coverage"] : []),
    ...(browserVisualCoveredExtensions.includes("KHR_texture_basisu") ? ["browser-visual-basisu-extension-coverage"] : []),
  ];
  const pbrBlockers = [
    ...(unsupportedAssetFeatures.has("physically-accurate-ibl") ? ["physically accurate IBL remains unsupported in External parity asset corpus"] : []),
    ...(hdrIblMaterialEvidence ? [] : ["linear HDR IBL resource evidence is not proven on the External parity material asset"]),
    ...(assetFeatures.has("hdr-studio-environment-resource") ? [] : ["HDR studio environment parity remains unsupported in External parity product corpus"]),
    ...(comparison?.pbrParity === true ? [] : boundedPbrVisualParity
      ? boundedPbrReferenceEvidence
        ? [localReferenceSuiteEvidence
          ? "local photometric, transmission/volume, and caustics PBR reference suites pass, but full reference parity against Unity/Unreal and external conformance suites is not proven"
          : "full photometric PBR reference parity against Unity/Unreal and external conformance suites is not proven"]
        : ["full physical PBR reference parity against competitors is not proven"]
      : ["same-scene PBR visual parity against competitors is not proven"]),
    ...(hasAdvancedPbrLobes(materialFeatures) ? [
      advancedPbrTextureVariantEvidence
        ? advancedPbrTextureVariantBrowserEvidence
          ? advancedPbrCombinedTextureVariantBrowserEvidence
            ? localReferenceSuiteEvidence
              ? "advanced clearcoat/transmission/diffuse-transmission/volume/specular/sheen/anisotropy/iridescence/dispersion/specular-glossiness corpus, scalar-lobe visual coverage, sampler-budgeted extension texture-map shader variants, browser-rendered combined variant pixel evidence, and bounded local PBR reference suites including caustics exist, but Unity/Unreal physical reference parity remains unproven"
              : "advanced clearcoat/transmission/diffuse-transmission/volume/specular/sheen/anisotropy/iridescence/dispersion/specular-glossiness corpus, scalar-lobe visual coverage, sampler-budgeted extension texture-map shader variants, and browser-rendered combined variant pixel evidence exist, but physical reference parity is not proven"
            : "advanced clearcoat/transmission/diffuse-transmission/volume/specular/sheen/anisotropy/iridescence/dispersion/specular-glossiness corpus, scalar-lobe visual coverage, sampler-budgeted extension texture-map shader variants, and browser-rendered variant pixel evidence exist, but combined extension-map browser evidence and physical reference parity are not proven"
          : "advanced clearcoat/transmission/diffuse-transmission/volume/specular/sheen/anisotropy/iridescence/dispersion/specular-glossiness corpus, scalar-lobe visual coverage, and sampler-budgeted extension texture-map shader variants exist, but browser-rendered variant pixel evidence, complete combined extension-map coverage, and physical reference parity are not proven"
        : "advanced clearcoat/transmission/diffuse-transmission/volume/specular/sheen/anisotropy/iridescence/dispersion/specular-glossiness corpus and scalar-lobe visual coverage exists, but optional extension texture-map sampling is bounded by the current <=16-fragment-sampler WebGL2 shader and physical reference parity is not proven",
    ] : [
      "full clearcoat/transmission/sheen/anisotropy/iridescence physical parity is not proven against references",
    ]),
  ];
  const gltfBlockers = [
    ...gltfParityDimensions.flatMap((dimension) => dimension.ready ? [] : dimension.blockers.map((blocker) => `${dimension.id}: ${blocker}`)),
    ...(unsupportedAssetFeatures.has("lit-skinning-render-application") ? ["lit skinning parity remains explicitly bounded in asset corpus"] : []),
    ...(unsupportedAssetFeatures.has("full-root-motion-controller") ? ["full root-motion controller parity remains explicitly bounded"] : []),
    ...(khronosVisuals?.fullCorpusVisualParity === true ? [] : [
      khronosVisualCoverageComplete
        ? boundedGltfLoaderVisualParity
          ? "pinned Khronos browser visual coverage and local External parity corpus same-source Three.js/Babylon visual-loader coverage pass with bounded render-only caveats, but full glTF visual parity remains blocked by broader upstream corpus and competitor coverage"
          : "pinned Khronos browser visual coverage is complete, but full glTF visual parity remains blocked by extension coverage and competitor parity gaps"
        : `full Khronos glTF sample model visual parity is not complete${khronosVisuals?.ok === true ? ` (${Number(khronosVisuals.visualAssetCount ?? 0)}/${Number(khronosVisuals.sourceAssetCount ?? 0)} browser-rendered slice)` : ""}`
    ]),
    ...(extensionParityReady ? [] : [`extension parity with Three.js/Babylon loaders is not complete; missing browser visual coverage for: ${missingForFullParity.join(", ") || "none"}, unsupported local corpus extensions: ${unsupportedInLocalCorpus.join(", ") || "none"}`]),
  ];
  const violations = [
    ...pbrBlockers.map((blocker) => `pbr: ${blocker}`),
    ...gltfBlockers.map((blocker) => `gltf: ${blocker}`),
  ];
  const pbrParity = pbrBlockers.length === 0 && pbrEvidence.length >= 10;
  const gltfParity = gltfBlockers.length === 0 && gltfEvidence.length >= 10;
  const pbrMaterialEnvironmentBrowserEvidence = hasEvidence(pbrEvidence, [
      "browser-material-showroom-bounded-pbr",
      "advanced-material-lobe-coverage",
      "environment-reflection-brdf-lut-resource-evidence",
      "asset-viewer-linear-hdr-ibl-resource-evidence",
    ]) || hasEvidence(pbrEvidence, [
      "normal-texture-material-corpus",
      "metallic-roughness-material-corpus",
      "asset-viewer-linear-hdr-ibl-resource-evidence",
      "sampler-budgeted-advanced-pbr-texture-shader-variants",
      "browser-rendered-advanced-pbr-texture-shader-variants",
      "browser-rendered-combined-advanced-pbr-texture-map-variants",
    ]);
  const validationRows = [
    validation("pbr-material-and-environment-browser-evidence", pbrMaterialEnvironmentBrowserEvidence, "tests/reports/external-parity-rendering.json + tests/reports/external-parity-asset-material-fidelity.json + tests/browser/rendering-root-quality-gate.spec.ts", [
      "bounded browser PBR material, environment reflection, BRDF LUT, and HDR IBL evidence is incomplete.",
    ]),
    validation("bounded-pbr-reference-and-three-babylon-evidence", boundedPbrReferenceEvidence && boundedPbrVisualParity, "tests/reports/external-parity-pbr-reference-readiness.json + tests/reports/external-parity-pbr-visual-parity.json", [
      "bounded CPU PBR reference evidence and same-layout Three.js/Babylon PBR visual evidence are not both passing.",
    ]),
    validation("full-pbr-parity-boundary", pbrParity, "tests/reports/external-parity-pbr-gltf-readiness.json:pbrParity", pbrBlockers),
    validation("gltf-local-corpus-and-khronos-visuals", hasEvidence(gltfEvidence, [
      "external-parity-asset-corpus-report-passing",
      "generated-external-parity-gltf-corpus",
      "supported-khronos-glb-browser-visual-slice",
      "khronos-100-source-classification-corpus",
      "pinned-khronos-corpus-browser-visual-coverage",
    ]), "tests/reports/external-parity-asset-corpus.json + tests/reports/external-parity-khronos-gltf-visuals.json", [
      "local External parity glTF corpus, pinned Khronos browser visual coverage, and 100-entry source classification coverage are not all passing.",
    ]),
    validation("gltf-animation-skin-morph-root-motion-evidence", hasEvidence(gltfEvidence, [
      "skinned-gltf-asset",
      "skinned-gltf-render-palette-evidence",
      "animated-morph-weight-gltf-asset",
      "root-motion-animation-gltf-asset",
      "root-motion-controller-evidence",
    ]), "tests/reports/external-parity-asset-corpus.json", [
      "skinning, animated morph weights, and root-motion evidence are not all present in the External parity asset corpus.",
    ]),
    validation("gltf-compression-extension-browser-evidence", hasEvidence(gltfEvidence, [
      "browser-visual-meshopt-extension-coverage",
      "browser-visual-draco-extension-coverage",
      "browser-visual-basisu-extension-coverage",
      "local-external-parity-gltf-extension-coverage-matrix",
    ]) && extensionParityReady, "tests/reports/external-parity-asset-compression.json + tests/reports/external-parity-khronos-gltf-visuals.json", [
      `tracked browser extension coverage is incomplete; missing browser visual coverage for: ${missingForFullParity.join(", ") || "none"}, unsupported local corpus extensions: ${unsupportedInLocalCorpus.join(", ") || "none"}.`,
    ]),
    validation("bounded-gltf-loader-three-babylon-evidence", boundedGltfLoaderVisualParity, "tests/reports/external-parity-gltf-loader-visual-parity.json", [
      "bounded same-source glTF loader visual parity against Three.js and Babylon.js is not passing.",
    ]),
    validation("full-gltf-parity-boundary", gltfParity, "tests/reports/external-parity-pbr-gltf-readiness.json:gltfParity", gltfBlockers),
  ];
  return {
    ...baseReport(root, {
      ok: pbrEvidence.length >= 6 && gltfEvidence.length >= 6,
      command: "pnpm audit:external-parity-pbr-gltf-readiness",
      runIdPrefix: "external-parity-pbr-gltf-readiness",
	      sourceFiles,
	      violations,
	      blockedClaims: [
	        ...(pbrParity ? [] : ["full PBR parity"]),
	        ...(gltfParity ? [] : ["full glTF parity"]),
	        "production-ready language",
	      ],
	    }),
    auditComplete: true,
    pbrParity,
    gltfParity,
    gltfParityDimensions,
    gltfExtensionParity: {
      localCoveredExtensions,
      browserVisualCoveredExtensions,
      requiredForFullParity: FULL_GLTF_PARITY_EXTENSIONS,
      missingForFullParity,
      unsupportedInLocalCorpus,
    },
    pbrEvidence,
    gltfEvidence,
    pbrBlockers,
    gltfBlockers,
    validations: validationRows,
    violations,
  };
}

function createGltfParityDimensions(options: {
  readonly assets: Record<string, unknown> | null;
  readonly khronosVisuals: Record<string, unknown> | null;
  readonly khronos100Classification: Record<string, unknown> | null;
  readonly assetCompatibility: Record<string, unknown> | null;
  readonly blenderSameCorpusExport: Record<string, unknown> | null;
  readonly comparison: Record<string, unknown> | null;
  readonly gltfLoaderVisualParity: Record<string, unknown> | null;
  readonly assetCount: number;
  readonly unsupportedAssetFeatures: ReadonlySet<string>;
  readonly localCoveredExtensions: readonly string[];
  readonly browserVisualCoveredExtensions: readonly string[];
  readonly missingForFullParity: readonly string[];
  readonly unsupportedInLocalCorpus: readonly string[];
  readonly khronosVisualCoverageComplete: boolean;
  readonly boundedGltfLoaderVisualParity: boolean;
  readonly extensionParityReady: boolean;
}): ExternalParityGltfParityDimension[] {
  const khronos100Summary = isRecord(options.khronos100Classification?.summary) ? options.khronos100Classification.summary : {};
  const khronos100Source = isRecord(options.khronos100Classification?.sourceManifest) ? options.khronos100Classification.sourceManifest : {};
  const comparisonUnsupported = stringArray(options.comparison?.unsupportedByThisReport);
  const assetCompatibilityEntries = Array.isArray(options.assetCompatibility?.assets) ? options.assetCompatibility.assets.filter(isRecord) : [];
  const aura3dExpectedFailIds = assetCompatibilityEntries.flatMap((asset) => {
    const loaders = Array.isArray(asset.loaders) ? asset.loaders.filter(isRecord) : [];
    const aura3d = loaders.find((loader) => loader.loader === "aura3d");
    return aura3d?.status === "expected-fail" && typeof asset.id === "string" ? [asset.id] : [];
  });
  const recoveredAura3DExpectedFailIds = aura3dExpectedFailIds.filter((assetId) => hasRecoveredKhronosVisualEvidence(options.khronosVisuals, assetId));
  const unrecoveredAura3DExpectedFailIds = aura3dExpectedFailIds.filter((assetId) => !recoveredAura3DExpectedFailIds.includes(assetId));
  const compatibility = isRecord(options.comparison?.gltfCompatibility) ? options.comparison.gltfCompatibility : {};
  const compatibilitySummary = isRecord(compatibility.summary) ? compatibility.summary : {};
  const aura3dCompatibility = isRecord(compatibilitySummary.aura3d) ? compatibilitySummary.aura3d : {};
  const threeCompatibility = isRecord(compatibilitySummary.threejs) ? compatibilitySummary.threejs : {};
  const babylonCompatibility = isRecord(compatibilitySummary.babylonjs) ? compatibilitySummary.babylonjs : {};
  const blenderCompatibility = isRecord(compatibilitySummary.blenderExport) ? compatibilitySummary.blenderExport : {};
  const blenderValidation = isRecord(compatibility.blenderExportValidation) ? compatibility.blenderExportValidation : {};
  const blenderValidationSummary = isRecord(blenderValidation.summary) ? blenderValidation.summary : {};
  const blenderSameCorpusFailures = blenderSameCorpusExternalToolFailures(options.blenderSameCorpusExport);
  const loaderReportViolations = stringArray(options.gltfLoaderVisualParity?.violations);
  const loaderExternalCorpus = isRecord(options.gltfLoaderVisualParity?.externalCorpus) ? options.gltfLoaderVisualParity.externalCorpus : {};
  const fullExternalVisualCorpusReady = options.gltfLoaderVisualParity?.fullGltfLoaderVisualParity === true &&
    !comparisonUnsupported.includes("full-corpus and extension visual pixel parity for external Three.js/Babylon.js glTF loader output");
  const khronos100VisualValidatedWarningIds = validatedKhronos100WarningIds(options.khronos100Classification, options.gltfLoaderVisualParity);
  const khronos100RawPass = Number(khronos100Summary.pass ?? 0);
  const khronos100RawWarn = Number(khronos100Summary.warn ?? 0);
  const khronos100EffectivePass = khronos100RawPass + khronos100VisualValidatedWarningIds.length;
  const khronos100EffectiveWarn = Math.max(0, khronos100RawWarn - khronos100VisualValidatedWarningIds.length);
  const khronos100AllPass = Number(khronos100Source.assetCount ?? 0) >= 100 &&
    khronos100EffectivePass === Number(khronos100Source.assetCount ?? 0) &&
    khronos100EffectiveWarn === 0 &&
    Number(khronos100Summary.expectedFail ?? 0) === 0;
  const aura3dExpectedFailCount = Number(aura3dCompatibility["expected-fail"] ?? 0);
  const aura3dExpectedFailuresRecovered = aura3dExpectedFailCount === 0 ||
    (assetCompatibilityEntries.length > 0 && recoveredAura3DExpectedFailIds.length >= aura3dExpectedFailCount && unrecoveredAura3DExpectedFailIds.length === 0);
  const sameCorpusLoaderCompatibilityReady =
    Number(compatibilitySummary.assetCount ?? 0) >= 17 &&
    aura3dExpectedFailuresRecovered &&
    Number(aura3dCompatibility["not-run"] ?? 0) === 0 &&
    Number(threeCompatibility["expected-fail"] ?? 0) === 0 &&
    Number(threeCompatibility["not-run"] ?? 0) === 0 &&
    Number(babylonCompatibility["expected-fail"] ?? 0) === 0 &&
    Number(babylonCompatibility["not-run"] ?? 0) === 0;
  const blenderSameCorpusNotRun = Number(blenderCompatibility["not-run"] ?? 0);
  const blenderSameCorpusExpectedFail = Number(blenderCompatibility["expected-fail"] ?? 0);
  const blenderSameCorpusReady =
    Number(compatibilitySummary.assetCount ?? 0) >= 17 &&
    blenderSameCorpusNotRun === 0 &&
    (blenderSameCorpusExpectedFail === 0 || blenderSameCorpusFailures.expectedFailCount === blenderSameCorpusExpectedFail);
  const separateBlenderValidationReady =
    Number(blenderValidationSummary.fixtureCount ?? 0) >= 3 &&
    Number(blenderValidationSummary.pass ?? 0) === Number(blenderValidationSummary.fixtureCount ?? -1) &&
    Number(blenderValidationSummary.warn ?? 0) === 0 &&
    Number(blenderValidationSummary.fail ?? 0) === 0;

  return [
    gltfDimension("local-external-parity-corpus-render-evidence", options.assets?.ok === true && options.assetCount >= 7 && !options.unsupportedAssetFeatures.has("lit-skinning-render-application"), [
      "External parity generated corpus report passes.",
      "Local corpus includes skinning, animated morph weights, root-motion, material variants, texture transforms, compression, and extension fixtures.",
    ], [
      options.assets?.ok === true ? "" : "External parity asset corpus report is missing or failing.",
      options.assetCount >= 7 ? "" : `External parity asset corpus is too small for parity gating (${options.assetCount}/7).`,
      options.unsupportedAssetFeatures.has("lit-skinning-render-application") ? "local asset corpus still marks lit skinning render application unsupported." : "",
    ], {
      assetCount: options.assetCount,
      unsupportedAssetFeatureCount: options.unsupportedAssetFeatures.size,
    }),
    gltfDimension("pinned-khronos-browser-visual-coverage", options.khronosVisualCoverageComplete && options.khronosVisuals?.fullPinnedCorpusVisualParity === true, [
      "Pinned Khronos visual subset renders in browser screenshots.",
      "Pinned visual parity flag is true for the checked Khronos subset.",
    ], [
      options.khronosVisualCoverageComplete ? "" : `pinned Khronos browser visual coverage is incomplete (${Number(options.khronosVisuals?.visualAssetCount ?? 0)}/${Number(options.khronosVisuals?.sourceAssetCount ?? 0)}).`,
      options.khronosVisuals?.fullPinnedCorpusVisualParity === true ? "" : "pinned Khronos browser visual parity flag is not true.",
    ], {
      sourceAssetCount: Number(options.khronosVisuals?.sourceAssetCount ?? 0),
      visualAssetCount: Number(options.khronosVisuals?.visualAssetCount ?? 0),
    }),
    gltfDimension("tracked-extension-browser-coverage", options.extensionParityReady, [
      "Tracked required glTF extensions have browser visual or browser decode evidence.",
      "No unsupported extensions remain in the local External parity corpus report.",
    ], [
      options.missingForFullParity.length === 0 ? "" : `missing browser visual coverage for: ${options.missingForFullParity.join(", ")}.`,
      options.unsupportedInLocalCorpus.length === 0 ? "" : `unsupported local corpus extensions: ${options.unsupportedInLocalCorpus.join(", ")}.`,
    ], {
      localCoveredExtensions: options.localCoveredExtensions.length,
      browserVisualCoveredExtensions: options.browserVisualCoveredExtensions.length,
      missingForFullParity: options.missingForFullParity.length,
      unsupportedInLocalCorpus: options.unsupportedInLocalCorpus.length,
    }),
    gltfDimension("bounded-three-babylon-loader-visual-fixtures", options.boundedGltfLoaderVisualParity, [
      "Selected deterministic local glTF fixtures render with bounded visual parity against Three.js and Babylon.js.",
    ], [
      "bounded same-source Three.js/Babylon.js glTF loader visual parity is not passing.",
    ], {
      validations: Array.isArray(options.gltfLoaderVisualParity?.validations) ? options.gltfLoaderVisualParity.validations.length : 0,
      renders: Array.isArray(options.gltfLoaderVisualParity?.renders) ? options.gltfLoaderVisualParity.renders.length : 0,
      diffs: Array.isArray(options.gltfLoaderVisualParity?.diffs) ? options.gltfLoaderVisualParity.diffs.length : 0,
    }),
    gltfDimension("full-external-loader-visual-corpus-parity", fullExternalVisualCorpusReady, [
      "Full external Three.js/Babylon.js loader visual corpus parity is explicitly true.",
      "The broad engine comparison report no longer lists full-corpus external glTF visual parity as unsupported.",
    ], [
      options.gltfLoaderVisualParity?.fullGltfLoaderVisualParity === true ? "" : "external-parity-gltf-loader-visual-parity does not set fullGltfLoaderVisualParity=true.",
      options.gltfLoaderVisualParity?.fullGltfLoaderVisualParity === true ? "" : `strict external visual parity is ${Number(loaderExternalCorpus.visualParityAssetCount ?? 0)}/${Number(loaderExternalCorpus.sourceAssetCount ?? 0)} assets.`,
      comparisonUnsupported.includes("full-corpus and extension visual pixel parity for external Three.js/Babylon.js glTF loader output") ? "external-parity-engine-comparison still blocks full-corpus external Three.js/Babylon glTF visual parity." : "",
      ...loaderReportViolations.map((violation) => `loader visual parity report caveat: ${violation}`),
    ], {
      fullGltfLoaderVisualParity: options.gltfLoaderVisualParity?.fullGltfLoaderVisualParity === true,
      sourceAssetCount: Number(loaderExternalCorpus.sourceAssetCount ?? 0),
      visualAssetCount: Number(loaderExternalCorpus.visualAssetCount ?? 0),
      visualParityAssetCount: Number(loaderExternalCorpus.visualParityAssetCount ?? 0),
      visuallyValidatedWarningCount: Number(loaderExternalCorpus.visuallyValidatedWarningCount ?? 0),
      externalVisualUnsupportedMarker: comparisonUnsupported.includes("full-corpus and extension visual pixel parity for external Three.js/Babylon.js glTF loader output"),
      loaderReportViolations: loaderReportViolations.length,
    }),
    gltfDimension("khronos-100-production-classification", khronos100AllPass, [
      "All 100 pinned Khronos classification entries are pass-level evidence with no warnings or expected failures.",
    ], [
      Number(khronos100Source.assetCount ?? 0) >= 100 ? "" : "Khronos 100 source manifest is missing or below 100 assets.",
      khronos100EffectiveWarn === 0 ? "" : `${khronos100EffectiveWarn} Khronos 100 entries are still warnings and require importer/render/visual validation before full parity claims.`,
      Number(khronos100Summary.expectedFail ?? 0) === 0 ? "" : `${Number(khronos100Summary.expectedFail ?? 0)} Khronos 100 entries are expected failures.`,
    ], {
      assetCount: Number(khronos100Source.assetCount ?? 0),
      pass: khronos100EffectivePass,
      warn: khronos100EffectiveWarn,
      rawPass: khronos100RawPass,
      rawWarn: khronos100RawWarn,
      visualValidatedWarnings: khronos100VisualValidatedWarningIds.length,
      visualValidatedWarningIds: khronos100VisualValidatedWarningIds.join(","),
      expectedFail: Number(khronos100Summary.expectedFail ?? 0),
    }),
    gltfDimension("same-corpus-loader-compatibility", sameCorpusLoaderCompatibilityReady, [
      "Aura3D, Three.js, and Babylon.js all run the same pinned Khronos compatibility corpus with no not-run entries.",
      "Legacy Aura3D expected-fail entries have browser visual recovery evidence in the External parity Khronos visual report.",
    ], [
      aura3dExpectedFailCount === 0 ? "" : assetCompatibilityEntries.length === 0 ? "asset compatibility entries are missing, so Aura3D expected-fail recovery cannot be verified." : unrecoveredAura3DExpectedFailIds.length === 0 ? "" : `Aura3D has ${unrecoveredAura3DExpectedFailIds.length} unrecovered expected-fail compatibility entries: ${unrecoveredAura3DExpectedFailIds.join(", ")}.`,
      Number(aura3dCompatibility["not-run"] ?? 0) === 0 ? "" : `Aura3D has ${Number(aura3dCompatibility["not-run"] ?? 0)} not-run compatibility entries.`,
      Number(threeCompatibility["expected-fail"] ?? 0) === 0 ? "" : `Three.js has ${Number(threeCompatibility["expected-fail"] ?? 0)} expected-fail compatibility entries.`,
      Number(threeCompatibility["not-run"] ?? 0) === 0 ? "" : `Three.js has ${Number(threeCompatibility["not-run"] ?? 0)} not-run compatibility entries.`,
      Number(babylonCompatibility["expected-fail"] ?? 0) === 0 ? "" : `Babylon.js has ${Number(babylonCompatibility["expected-fail"] ?? 0)} expected-fail compatibility entries.`,
      Number(babylonCompatibility["not-run"] ?? 0) === 0 ? "" : `Babylon.js has ${Number(babylonCompatibility["not-run"] ?? 0)} not-run compatibility entries.`,
    ], {
      assetCount: Number(compatibilitySummary.assetCount ?? 0),
      aura3dExpectedFail: aura3dExpectedFailCount,
      aura3dRecoveredExpectedFail: recoveredAura3DExpectedFailIds.length,
      aura3dUnrecoveredExpectedFail: unrecoveredAura3DExpectedFailIds.length,
      threeExpectedFail: Number(threeCompatibility["expected-fail"] ?? 0),
      babylonExpectedFail: Number(babylonCompatibility["expected-fail"] ?? 0),
      aura3dNotRun: Number(aura3dCompatibility["not-run"] ?? 0),
      threeNotRun: Number(threeCompatibility["not-run"] ?? 0),
      babylonNotRun: Number(babylonCompatibility["not-run"] ?? 0),
    }),
    gltfDimension("blender-export-same-corpus-coverage", blenderSameCorpusReady && separateBlenderValidationReady, [
      "Blender-export validation passes and the same compatibility corpus has Blender-export coverage.",
      ...(blenderSameCorpusFailures.expectedFailCount > 0
        ? [`${blenderSameCorpusFailures.expectedFailCount} same-corpus entries explicitly fail in Blender's importer before Aura3D reload; these are recorded as external-tool failures, not not-run placeholders.`]
        : []),
    ], [
      separateBlenderValidationReady ? "" : "separate Blender-export validation is missing, warning, or failing.",
      blenderSameCorpusReady ? "" : `same-corpus Blender-export coverage is incomplete (${blenderSameCorpusNotRun} not-run, ${blenderSameCorpusExpectedFail} expected-fail entries).`,
    ], {
      separateFixtureCount: Number(blenderValidationSummary.fixtureCount ?? 0),
      separatePass: Number(blenderValidationSummary.pass ?? 0),
      sameCorpusNotRun: blenderSameCorpusNotRun,
      sameCorpusExpectedFail: blenderSameCorpusExpectedFail,
      sameCorpusExternalToolExpectedFail: blenderSameCorpusFailures.expectedFailCount,
    }),
  ];
}

function blenderSameCorpusExternalToolFailures(report: Record<string, unknown> | null): {
  readonly expectedFailCount: number;
  readonly ids: readonly string[];
} {
  if (report?.schemaVersion !== "blender-same-corpus-export" || !Array.isArray(report.assets)) {
    return { expectedFailCount: 0, ids: [] };
  }
  const failures = report.assets.filter((asset): asset is Record<string, unknown> => {
    if (!isRecord(asset) || asset.status !== "expected-fail") return false;
    const diagnostics = Array.isArray(asset.diagnostics) ? asset.diagnostics.filter(isRecord) : [];
    return diagnostics.some((diagnostic) =>
      diagnostic.code === "ASSET_BLENDER_SAME_CORPUS_EXPORT_FAILED" &&
      typeof diagnostic.message === "string" &&
      /Blender|bpy\.ops\.import_scene\.gltf|io_scene_gltf2|Extension .* is not available|RuntimeError: Error/.test(diagnostic.message)
    );
  });
  return {
    expectedFailCount: failures.length,
    ids: failures.flatMap((asset) => typeof asset.id === "string" ? [asset.id] : []),
  };
}

function gltfDimension(
  id: string,
  ready: boolean,
  evidence: readonly string[],
  blockers: readonly string[],
  metrics: Record<string, number | string | boolean>
): ExternalParityGltfParityDimension {
  return {
    id,
    ready,
    evidence: ready ? evidence : [],
    blockers: ready ? [] : blockers.filter((blocker) => blocker.length > 0),
    metrics,
  };
}

function hasRecoveredKhronosVisualEvidence(report: Record<string, unknown> | null, assetId: string): boolean {
  if (report?.ok !== true || !Array.isArray(report.validations)) return false;
  return report.validations.some((validation) => {
    if (!isRecord(validation) || validation.assetId !== assetId || validation.ok !== true) return false;
    return validation.status === "ready" &&
      validation.visualStatus === "rendered" &&
      Number(validation.renderGeometryCount ?? 0) >= 1 &&
      Number(validation.drawCalls ?? 0) >= 1 &&
      Number(validation.nonBlankPixels ?? 0) > 1000 &&
      !stringArray(validation.warningCodes).includes("GLTF_UNSUPPORTED_EXTENSION");
  });
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

const FULL_GLTF_PARITY_EXTENSIONS = [
  "EXT_mesh_gpu_instancing",
  "EXT_meshopt_compression",
  "EXT_texture_avif",
  "EXT_texture_webp",
  "KHR_draco_mesh_compression",
  "KHR_lights_punctual",
  "KHR_materials_anisotropy",
  "KHR_materials_clearcoat",
  "KHR_materials_diffuse_transmission",
  "KHR_materials_dispersion",
  "KHR_materials_emissive_strength",
  "KHR_materials_ior",
  "KHR_materials_iridescence",
  "KHR_materials_pbrSpecularGlossiness",
  "KHR_materials_sheen",
  "KHR_materials_specular",
  "KHR_materials_transmission",
  "KHR_materials_unlit",
  "KHR_materials_variants",
  "KHR_materials_volume",
  "KHR_mesh_quantization",
  "KHR_texture_basisu",
  "KHR_texture_transform",
] as const;

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function hasAdvancedPbrLobes(materialFeatures: ReadonlySet<string>): boolean {
  return [
    "clearcoat",
    "transmission",
    "diffuse-transmission",
    "volume",
    "specular",
    "sheen",
    "anisotropy",
    "iridescence",
    "dispersion",
    "pbr-specular-glossiness",
  ].every((feature) => materialFeatures.has(feature));
}

function hasAdvancedPbrTextureVariantEvidence(root: string): boolean {
  const shaderLibrary = readText(root, "packages/rendering/src/ShaderLibrary.ts");
  const texturedMaterial = readText(root, "packages/rendering/src/TexturedPBRMaterial.ts");
  const shaderTests = readText(root, "tests/unit/rendering/shader-library.test.ts");
  const pbrTests = readText(root, "tests/unit/rendering/pbr-lighting.test.ts");
  const rendererTests = readText(root, "tests/unit/rendering/renderer.test.ts");
  const variantNames = [
    "clearcoat-textures",
    "transmission-volume-textures",
    "specular-sheen-anisotropy-textures",
    "iridescence-textures",
    "clearcoat-transmission-volume-textures",
    "specular-sheen-anisotropy-iridescence-textures",
  ];
  const variantConstants = [
    "DEFAULT_TEXTURED_PBR_CLEARCOAT_TEXTURES_VARIANT",
    "DEFAULT_TEXTURED_PBR_TRANSMISSION_VOLUME_TEXTURES_VARIANT",
    "DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_TEXTURES_VARIANT",
    "DEFAULT_TEXTURED_PBR_IRIDESCENCE_TEXTURES_VARIANT",
    "DEFAULT_TEXTURED_PBR_CLEARCOAT_TRANSMISSION_VOLUME_TEXTURES_VARIANT",
    "DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_IRIDESCENCE_TEXTURES_VARIANT",
  ];
  return variantNames.every((variant) => shaderLibrary.includes(variant)) &&
    variantConstants.every((variant) => shaderTests.includes(variant)) &&
    [
      "A3D_PBR_CLEARCOAT_TEXTURES",
      "A3D_PBR_TRANSMISSION_VOLUME_TEXTURES",
      "A3D_PBR_SPECULAR_SHEEN_ANISOTROPY_TEXTURES",
      "A3D_PBR_IRIDESCENCE_TEXTURES",
    ].every((define) => shaderLibrary.includes(define)) &&
    shaderTests.includes("fragmentSamplerCount") &&
    shaderTests.includes("toBeLessThanOrEqual(16)") &&
    texturedMaterial.includes("texturedPbrShaderVariant") &&
    pbrTests.includes("selects sampler-budgeted textured PBR shader variants") &&
    rendererTests.includes("compiles material-selected shader variants through the forward pass");
}

function hasAdvancedPbrTextureVariantBrowserEvidence(report: Record<string, unknown> | null, root: string): boolean {
  const rootEvidence = hasRootAdvancedPbrTextureVariantBrowserEvidence(root);
  if (rootEvidence) return true;
  if (report?.ok !== true || !Array.isArray(report.validations)) return false;
  return report.validations.some((validation) => {
    if (!isRecord(validation) || validation.name !== "pbr-extension-texture-variant-browser-evidence" || validation.ok !== true || !isRecord(validation.checks) || !isRecord(validation.metrics)) return false;
    return validation.checks.samplerBudgetedShaderVariants === true &&
      validation.checks.advancedTextureMapsRendered === true &&
      validation.checks.browserPixelReadback === true &&
      validation.checks.opaqueNonBlankPixels === true &&
      Number(validation.metrics.variantCount) >= 6 &&
      Number(validation.metrics.distinctVariantPixels) >= 4 &&
      Number(validation.metrics.drawCalls) >= 6;
  });
}

function hasAdvancedPbrCombinedTextureVariantBrowserEvidence(report: Record<string, unknown> | null, root: string): boolean {
  const rootEvidence = hasRootAdvancedPbrTextureVariantBrowserEvidence(root);
  if (rootEvidence) return true;
  if (report?.ok !== true || !Array.isArray(report.validations)) return false;
  return report.validations.some((validation) => {
    if (!isRecord(validation) || validation.name !== "pbr-extension-texture-variant-browser-evidence" || validation.ok !== true || !isRecord(validation.checks) || !isRecord(validation.metrics)) return false;
    return validation.checks.combinedSamplerBudgetedShaderVariants === true &&
      Number(validation.metrics.combinedVariantCount) >= 2 &&
      Number(validation.metrics.variantCount) >= 6 &&
      Number(validation.metrics.drawCalls) >= 6;
  });
}

function hasRootAdvancedPbrTextureVariantBrowserEvidence(root: string): boolean {
  const rootGate = readText(root, "tests/browser/rendering-root-quality-gate.spec.ts");
  return rootGate.includes("renders sampler-budgeted advanced textured PBR extension variants in the root WebGL path") &&
    rootGate.includes("DEFAULT_TEXTURED_PBR_CLEARCOAT_TEXTURES_VARIANT") &&
    rootGate.includes("DEFAULT_TEXTURED_PBR_TRANSMISSION_VOLUME_TEXTURES_VARIANT") &&
    rootGate.includes("DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_TEXTURES_VARIANT") &&
    rootGate.includes("DEFAULT_TEXTURED_PBR_IRIDESCENCE_TEXTURES_VARIANT") &&
    rootGate.includes("DEFAULT_TEXTURED_PBR_CLEARCOAT_TRANSMISSION_VOLUME_TEXTURES_VARIANT") &&
    rootGate.includes("DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_IRIDESCENCE_TEXTURES_VARIANT") &&
    rootGate.includes("expect(result.results).toHaveLength(6)") &&
    rootGate.includes("expect(result.combinedVariantCount).toBeGreaterThanOrEqual(2)") &&
    rootGate.includes("expect(result.uniqueHashes, JSON.stringify(result)).toBeGreaterThanOrEqual(4)") &&
    rootGate.includes("expect(entry.variantMatched, JSON.stringify(entry)).toBe(true)") &&
    rootGate.includes("expect(entry.nonDarkPixels, JSON.stringify(entry)).toBeGreaterThan(900)") &&
    rootGate.includes("expect(entry.colorBuckets, JSON.stringify(entry)).toBeGreaterThan(6)");
}

function readText(root: string, path: string): string {
  try {
    return readFileSync(`${root}/${path}`, "utf8");
  } catch {
    return "";
  }
}

function hasEvidence(evidence: readonly string[], required: readonly string[]): boolean {
  return required.every((entry) => evidence.includes(entry));
}

function validation(id: string, passed: boolean, evidence: string, blockers: readonly string[]) {
  return {
    id,
    passed,
    evidence,
    blockers: passed ? [] : blockers,
  };
}

function hasExpandedPbrVisualParity(report: Record<string, unknown> | null): boolean {
  if (report?.ok !== true || !isRecord(report.boundedPbrVisualParity) || !Array.isArray(report.renders)) return false;
  return report.boundedPbrVisualParity.threejs === true &&
    report.boundedPbrVisualParity.babylon === true &&
    report.renders.every((render) => {
      if (!isRecord(render) || !isRecord(render.metrics)) return false;
      return Number(render.metrics.materialCount) >= 11 &&
        Number(render.metrics.featureCount) >= 11 &&
        Number(render.metrics.drawCalls) >= 11;
    });
}

function hasBoundedPbrReferenceEvidence(report: Record<string, unknown> | null): boolean {
  return report?.ok === true &&
    report.boundedPbrReferenceEvidence === true &&
    report.fullPhysicalPbrParity === false;
}

function hasBoundedGltfLoaderVisualParity(report: Record<string, unknown> | null): boolean {
  if (report?.ok !== true || !isRecord(report.boundedGltfLoaderVisualParity) || !Array.isArray(report.renders) || !Array.isArray(report.diffs) || !Array.isArray(report.validations)) return false;
  const boundedValidations = report.validations.filter((validation) => {
    if (!isRecord(validation) || !isRecord(validation.asset)) return false;
    return validation.asset.sourceKind === "local-gltf-text" || validation.asset.sourceKind === undefined;
  });
  const validationByAsset = new Map<string, Record<string, unknown>>();
  for (const validation of boundedValidations) {
    if (!isRecord(validation) || !isRecord(validation.asset) || typeof validation.asset.id !== "string") continue;
    validationByAsset.set(validation.asset.id, validation);
  }
  return report.boundedGltfLoaderVisualParity.threejs === true &&
    report.boundedGltfLoaderVisualParity.babylon === true &&
    boundedValidations.length >= 8 &&
    boundedValidations.every((validation) => isRecord(validation) && validation.ok === true) &&
    report.renders.filter((render) => isRecord(render) && validationByAsset.has(String(render.assetId))).every((render) => {
      if (!isRecord(render) || !isRecord(render.metrics)) return false;
      return Number(render.metrics.meshCount) >= 1 &&
        Number(render.metrics.materialCount) >= 1 &&
        Number(render.metrics.vertexCount) >= 3 &&
        Number(render.metrics.drawCalls) >= 1 &&
        Number(render.metrics.nonBlankPixels) > 5_000;
    }) &&
    report.diffs.filter((diff) => isRecord(diff) && validationByAsset.has(String(diff.assetId))).every((diff) => {
      if (!isRecord(diff)) return false;
      const validation = typeof diff.assetId === "string" ? validationByAsset.get(diff.assetId) : undefined;
      const asset = isRecord(validation?.asset) ? validation.asset : {};
      return diff.pass === true || asset.visualDiffRequired === false;
    });
}

function hasKhronos100ClassificationEvidence(report: Record<string, unknown> | null): boolean {
  if (!isRecord(report?.sourceManifest) || !isRecord(report.summary) || !Array.isArray(report.assets)) return false;
  const assetCount = Number(report.sourceManifest.assetCount ?? 0);
  const pass = Number(report.summary.pass ?? 0);
  const warn = Number(report.summary.warn ?? 0);
  const expectedFail = Number(report.summary.expectedFail ?? 0);
  return assetCount >= 100 &&
    report.assets.length >= 100 &&
    pass > 0 &&
    warn > 0 &&
    expectedFail === 0 &&
    pass + warn + expectedFail === assetCount;
}

function validatedKhronos100WarningIds(
  classification: Record<string, unknown> | null,
  loaderVisualParity: Record<string, unknown> | null
): readonly string[] {
  if (!Array.isArray(classification?.assets) || !isRecord(loaderVisualParity)) return [];
  const warningIds = new Set(classification.assets.flatMap((asset) => {
    if (!isRecord(asset) || asset.expectedStatus !== "warn" || typeof asset.id !== "string") return [];
    return [asset.id];
  }));
  if (warningIds.size === 0) return [];
  const validations = [
    ...(isRecord(loaderVisualParity.externalCorpus) && Array.isArray(loaderVisualParity.externalCorpus.validations)
      ? loaderVisualParity.externalCorpus.validations
      : []),
    ...(Array.isArray(loaderVisualParity.validations) ? loaderVisualParity.validations : []),
  ].filter(isRecord);
  const validated = validations.flatMap((validation) => {
    const asset = isRecord(validation.asset) ? validation.asset : {};
    if (validation.ok !== true || typeof asset.id !== "string" || !warningIds.has(asset.id)) return [];
    const bounded = isRecord(validation.boundedGltfLoaderVisualParity) ? validation.boundedGltfLoaderVisualParity : {};
    return bounded.threejs === true && bounded.babylon === true ? [asset.id] : [];
  });
  return [...new Set(validated)].sort();
}

function hasBrowserCompressionExtension(report: Record<string, unknown> | null, extension: string): boolean {
  if (report?.ok !== true || !Array.isArray(report.validations)) return false;
  return report.validations.some((validation) => {
    if (!isRecord(validation) || validation.extension !== extension || validation.ok !== true || !isRecord(validation.checks) || !isRecord(validation.metrics)) return false;
    return validation.checks.statusReady === true &&
      (validation.checks.decodeCount === true || validation.checks.decodedTexture === true) &&
      validation.checks.renderedPixels === true &&
      Number(validation.metrics.decodedBytes) > 0 &&
      Number(validation.metrics.nonBlankPixels) > 1000;
  });
}

function hasHdrIblMaterialEvidence(report: Record<string, unknown> | null): boolean {
  if (report?.ok !== true || !Array.isArray(report.validations)) return false;
  return report.validations.some((validation) => {
    if (!isRecord(validation) || validation.name !== "external-parity-material-fidelity-card" || validation.ok !== true || !isRecord(validation.evidence)) return false;
    const evidence = validation.evidence;
    return evidence.environmentResourceSet === "generated-local-linear-hdr-environment" &&
      evidence.hdrSource === true &&
      Number(evidence.maxLinearValue) > 1 &&
      Number(evidence.specularMipCount) >= 4 &&
      evidence.brdfLutValidated === true &&
      evidence.diffuseIrradiance === true;
  });
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = createExternalParityPbrGltfReadinessReport();
  writeJson(process.cwd(), reportPath, report);
  console.log(JSON.stringify({
    ok: report.ok,
    auditComplete: report.auditComplete,
    pbrParity: report.pbrParity,
    gltfParity: report.gltfParity,
    gltfParityDimensions: report.gltfParityDimensions.map((dimension) => ({ id: dimension.id, ready: dimension.ready })),
    pbrEvidence: report.pbrEvidence.length,
    gltfEvidence: report.gltfEvidence.length,
    validations: report.validations.map((entry) => ({ id: entry.id, passed: entry.passed })),
    pbrBlockers: report.pbrBlockers,
    gltfBlockers: report.gltfBlockers,
    report: reportPath,
  }, null, 2));
}
