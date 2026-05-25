import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  createV5MaterialPreviewScene,
  listV5MaterialProofChannels,
  listV5PbrMaterials,
  summarizeV5MaterialLibrary,
  V5_REQUIRED_MATERIAL_CLASSES
} from "../../packages/materials/src";

interface V5MaterialManifest {
  readonly schema: "g3d-three-compat-material-library/v1";
  readonly requirements: {
    readonly minimumMaterialPresets: number;
    readonly minimumRealTextureBackedPresets: number;
    readonly requiredClasses: readonly string[];
    readonly requiredProofChannels: readonly string[];
  };
  readonly checkedInTextureSources: readonly string[];
  readonly claimBoundary: string;
  readonly requiredScreenshot: string;
}

interface V5MaterialReadinessCheck {
  readonly name: string;
  readonly pass: boolean;
  readonly detail: string;
}

const requiredFiles = [
  "fixtures/three-compat/materials/manifest.json",
  "fixtures/three-compat/materials/licenses.md",
  "packages/materials/src/PBRMaterialLibrary.ts",
  "packages/materials/src/MaterialPreset.ts",
  "packages/materials/src/TextureSet.ts",
  "packages/materials/src/MaterialValidation.ts",
  "packages/materials/src/MaterialPreviewScene.ts",
  "tests/unit/materials/three-compat-material-library.test.ts",
  "tests/browser/three-compat-material-library.spec.ts"
] as const;

function check(name: string, pass: boolean, detail: string): V5MaterialReadinessCheck {
  return { name, pass, detail };
}

const manifest = JSON.parse(readFileSync(resolve("fixtures/three-compat/materials/manifest.json"), "utf8")) as V5MaterialManifest;
const summary = summarizeV5MaterialLibrary();
const materials = listV5PbrMaterials();
const previewScene = createV5MaterialPreviewScene();
const missingCheckedInSources = manifest.checkedInTextureSources.filter((path) => !existsSync(resolve(path)));
const materialClasses = new Set(V5_REQUIRED_MATERIAL_CLASSES);
const unsupportedManifestClasses = manifest.requirements.requiredClasses.filter((materialClass) => !materialClasses.has(materialClass as never));
const checks: V5MaterialReadinessCheck[] = [
  check(
    "required-files-present",
    requiredFiles.every((file) => existsSync(resolve(file))),
    requiredFiles.filter((file) => !existsSync(resolve(file))).join(", ") || "all V5 material files exist"
  ),
  check("schema", manifest.schema === "g3d-three-compat-material-library/v1", `schema=${manifest.schema}`),
  check(
    "material-floor",
    summary.materialCount >= manifest.requirements.minimumMaterialPresets,
    `${summary.materialCount}/${manifest.requirements.minimumMaterialPresets} materials`
  ),
  check(
    "texture-backed-floor",
    summary.textureBackedMaterialCount >= manifest.requirements.minimumRealTextureBackedPresets && summary.checkedInTextureSetCount >= 25,
    `${summary.textureBackedMaterialCount}/${manifest.requirements.minimumRealTextureBackedPresets} texture-backed materials, ${summary.checkedInTextureSetCount} checked texture sets`
  ),
  check(
    "checked-in-texture-sources",
    missingCheckedInSources.length === 0 && summary.missingTextureSourcePaths.length === 0,
    [...missingCheckedInSources, ...summary.missingTextureSourcePaths].join(", ") || "all checked-in public sample texture sources exist"
  ),
  check(
    "required-classes",
    summary.missingRequiredClasses.length === 0 && unsupportedManifestClasses.length === 0,
    [...summary.missingRequiredClasses, ...unsupportedManifestClasses].join(", ") || `${summary.classes.length} classes covered`
  ),
  check(
    "proof-channels",
    summary.missingProofChannels.length === 0 && manifest.requirements.requiredProofChannels.every((channel) => listV5MaterialProofChannels().includes(channel as never)),
    summary.missingProofChannels.join(", ") || `channels=${summary.proofChannels.join(", ")}`
  ),
  check(
    "advanced-pbr-parameters",
    materials.some((material) => material.parameters.clearcoat) &&
      materials.some((material) => material.parameters.transmission) &&
      materials.some((material) => material.parameters.anisotropy) &&
      materials.some((material) => material.parameters.sheen) &&
      materials.some((material) => material.parameters.alphaMode === "mask") &&
      materials.some((material) => material.parameters.emissiveIntensity),
    "clearcoat, transmission, anisotropy, sheen, alpha mask, and emissive parameters are represented"
  ),
  check(
    "preview-scene",
    previewScene.length === materials.length && previewScene.some((tile) => tile.previewGeometry === "thin-glass") && previewScene.some((tile) => tile.previewGeometry === "foliage-card"),
    `${previewScene.length} preview tiles`
  ),
  check(
    "claim-boundary",
    /not flagship visual proof until rendered/i.test(manifest.claimBoundary),
    manifest.claimBoundary
  )
];

const pass = checks.every((item) => item.pass);
const report = {
  schema: "g3d-three-compat-material-readiness/v1",
  generatedAt: new Date().toISOString(),
  pass,
  summary,
  checks
};

const reportPath = resolve("tests/reports/three-compat-material-readiness.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (!pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(`V5 material readiness passed: ${summary.materialCount} presets, ${summary.textureBackedMaterialCount} texture-backed.`);
