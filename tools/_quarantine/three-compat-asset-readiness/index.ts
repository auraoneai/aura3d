import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadThreeCompatAssetManifest, loadThreeCompatAssetRegistry, summarizeThreeCompatAssetRegistry } from "../../packages/assets/src/threejs-compatibility/ThreeCompatAssetRegistry";

interface ThreeCompatAssetReadinessCheck {
  readonly name: string;
  readonly pass: boolean;
  readonly detail: string;
}

interface DomainManifest {
  readonly schema: string;
  readonly assetManifest: string;
  readonly assets: readonly string[];
  readonly requiredFlagship?: string;
  readonly requiredFlagships?: readonly string[];
}

const requiredFiles = [
  "fixtures/three-compat/assets/manifest.json",
  "fixtures/three-compat/assets/licenses.md",
  "fixtures/three-compat/products/manifest.json",
  "fixtures/three-compat/automotive/manifest.json",
  "fixtures/three-compat/architecture/manifest.json",
  "fixtures/three-compat/characters/manifest.json",
  "fixtures/three-compat/vfx/manifest.json",
  "packages/assets/src/threejs-compatibility/ThreeCompatAssetProvenance.ts",
  "packages/assets/src/threejs-compatibility/ThreeCompatAssetRegistry.ts",
  "tests/assets/three-compat-asset-library.test.ts"
] as const;

const domainManifestPaths = [
  "fixtures/three-compat/products/manifest.json",
  "fixtures/three-compat/automotive/manifest.json",
  "fixtures/three-compat/architecture/manifest.json",
  "fixtures/three-compat/characters/manifest.json",
  "fixtures/three-compat/vfx/manifest.json"
] as const;

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(path), "utf8")) as T;
}

function check(name: string, pass: boolean, detail: string): ThreeCompatAssetReadinessCheck {
  return { name, pass, detail };
}

const manifest = loadThreeCompatAssetManifest();
const registry = loadThreeCompatAssetRegistry(manifest);
const summary = summarizeThreeCompatAssetRegistry(manifest);
const registryIds = new Set(registry.map((asset) => asset.id));
const requiredClasses = ["product", "automotive", "architecture", "character", "materials", "animation", "large-scene"];
const provenanceCompleteCount = registry.filter(
  (asset) =>
    asset.license.length > 0 &&
    asset.repository.length > 0 &&
    asset.revision.length > 0 &&
    asset.sourcePath.length > 0 &&
    asset.uri.length > 0 &&
    asset.sha256.length > 0 &&
    asset.localPath.length > 0
).length;
const domainManifests = domainManifestPaths.map((path) => ({ path, manifest: readJson<DomainManifest>(path) }));
const missingDomainAssets = domainManifests.flatMap(({ path, manifest }) =>
  manifest.assets.filter((id) => !registryIds.has(id)).map((id) => `${path}:${id}`)
);
const missingDomainFlagshipContracts = domainManifests.flatMap(({ path, manifest }) => {
  const flagships = [manifest.requiredFlagship, ...(manifest.requiredFlagships ?? [])].filter(Boolean);
  return flagships.length > 0 ? [] : [path];
});
const checks: ThreeCompatAssetReadinessCheck[] = [
  check(
    "required-files-present",
    requiredFiles.every((file) => existsSync(resolve(file))),
    requiredFiles.filter((file) => !existsSync(resolve(file))).join(", ") || "all required Three.js compatibility asset files exist"
  ),
  check(
    "schema",
    manifest.schema === "a3d-three-compat-asset-library",
    `schema=${manifest.schema}`
  ),
  check(
    "tracked-asset-floor",
    summary.trackedAssetCount >= manifest.requirements.minimumTrackedAssets,
    `${summary.trackedAssetCount}/${manifest.requirements.minimumTrackedAssets} tracked assets`
  ),
  check(
    "local-asset-floor",
    summary.localAssetCount >= manifest.requirements.minimumLocalAssets,
    `${summary.localAssetCount}/${manifest.requirements.minimumLocalAssets} local assets`
  ),
  check(
    "visual-evidence-slots",
    summary.visualEvidenceSlotCount >= manifest.requirements.minimumVisualEvidenceSlots,
    `${summary.visualEvidenceSlotCount}/${manifest.requirements.minimumVisualEvidenceSlots} visual evidence slots`
  ),
  check(
    "source-id-resolution",
    summary.missingSourceIds.length === 0,
    summary.missingSourceIds.join(", ") || "every Three.js compatibility asset ID resolves to the pinned source corpus"
  ),
  check(
    "provenance-complete",
    provenanceCompleteCount === registry.length,
    `${provenanceCompleteCount}/${registry.length} registry assets include license, source, sha256, and local path`
  ),
  check(
    "domain-coverage",
    requiredClasses.every((requiredClass) => summary.classes.includes(requiredClass)),
    `classes=${summary.classes.join(", ")}`
  ),
  check(
    "advanced-material-assets",
    summary.advancedMaterialAssetCount >= 10,
    `${summary.advancedMaterialAssetCount}/10 clearcoat, sheen, specular, anisotropy, texture, or normal-map assets`
  ),
  check(
    "animation-morph-skin-assets",
    summary.animationSkinMorphAssetCount >= 3,
    `${summary.animationSkinMorphAssetCount}/3 animation, morph, or skinned assets`
  ),
  check(
    "texture-pbr-assets",
    summary.textureAssetCount >= 10,
    `${summary.textureAssetCount}/10 texture or PBR-focused assets`
  ),
  check(
    "domain-manifest-assets-resolve",
    missingDomainAssets.length === 0,
    missingDomainAssets.join(", ") || "all domain manifests reference Three.js compatibility registry assets"
  ),
  check(
    "domain-flagship-contracts",
    missingDomainFlagshipContracts.length === 0,
    missingDomainFlagshipContracts.join(", ") || "each domain manifest names required flagship screenshot output"
  ),
  check(
    "claim-boundary",
    /not flagship proof until rendered/i.test(manifest.claimBoundary),
    manifest.claimBoundary
  )
];

const pass = checks.every((item) => item.pass);
const report = {
  schema: "a3d-three-compat-asset-readiness",
  generatedAt: new Date().toISOString(),
  pass,
  summary,
  requiredFiles,
  domainManifestPaths,
  checks
};

const reportPath = resolve("tests/reports/three-compat-asset-readiness.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (!pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(`Three.js compatibility asset readiness passed: ${summary.trackedAssetCount} tracked, ${summary.localAssetCount} local, ${summary.visualEvidenceSlotCount} visual slots.`);
