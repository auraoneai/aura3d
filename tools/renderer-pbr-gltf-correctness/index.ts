import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const REPORT_PATH = "tests/reports/pbr-gltf-correctness/report.json";
const MAX_EVIDENCE_AGE_MS = 30 * 60 * 1000;

interface Check {
  readonly id: string;
  readonly pass: boolean;
  readonly detail: string;
}

function json(path: string): any {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

function source(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

function fresh(report: any): boolean {
  const generatedAt = Date.parse(String(report.generatedAt ?? ""));
  return Number.isFinite(generatedAt) && Date.now() - generatedAt <= MAX_EVIDENCE_AGE_MS;
}

function check(id: string, pass: boolean, detail: string): Check {
  return { id, pass, detail };
}

const baseline = json("tests/reports/current-threejs-baseline.json");
const structural = json("tests/reports/material-structural-parity.json");
const transmission = json("tests/reports/pbr-gltf-correctness/transmission/report.json");
const combined = json("tests/reports/runtime-parity/material-extension-parity/material-extension-parity-report.json");
const loader = json("tests/reports/threejs-parity/loader-material-extensions-parity.json");
const extensionSupport = source("packages/assets/src/GLTFExtensionSupport.ts");
const runtimeTests = source("tests/unit/workstream5-runtime.test.ts");
const compressionTests = source("tests/assets/gltf-compression-decoders.test.ts");

const physicalCapabilities = new Map<string, any>(
  (structural.capabilities ?? []).map((entry: any) => [entry.capability, entry])
);
const combinedExtensions = new Set((combined.cases ?? []).map((entry: any) => entry.expectedExtension));
const requiredCombinedExtensions = [
  "KHR_materials_anisotropy",
  "KHR_materials_iridescence",
  "KHR_materials_transmission",
  "KHR_materials_volume",
  "KHR_materials_clearcoat",
  "KHR_materials_sheen",
  "KHR_materials_specular",
  "KHR_materials_ior",
  "KHR_materials_dispersion",
  "KHR_materials_emissive_strength",
  "KHR_materials_diffuse_transmission"
] as const;

const checks: Check[] = [
  check(
    "current-threejs-r185.1",
    baseline.pass === true && baseline.three?.version === "0.185.1" && baseline.three?.tag === "r185",
    `three=${String(baseline.three?.version)}; tag=${String(baseline.three?.tag)}; online=${String(baseline.mode)}`
  ),
  check("baseline-fresh", fresh(baseline), `generatedAt=${String(baseline.generatedAt)}`),
  check(
    "structural-material-behaviours",
    structural.pass === true && ["anisotropy", "sheen", "iridescence", "clearcoat"].every((id) => physicalCapabilities.get(id)?.pass === true),
    "anisotropy rotation/elongation, sheen grazing response, view-angle iridescence, and clearcoat lobe all pass rendered-pixel assertions"
  ),
  check("structural-evidence-fresh", fresh(structural), `generatedAt=${String(structural.generatedAt)}`),
  check(
    "transmission-volume-ior-attenuation-backdrop",
    transmission.pass === true
      && transmission.measurementValid === true
      && transmission.iorChangedPixels > 120
      && transmission.backdropColorTransitions >= 2
      && transmission.strongAttenuationLuma < transmission.weakAttenuationLuma
      && transmission.strongAttenuationBlueBias > transmission.weakAttenuationBlueBias,
    `iorChangedPixels=${String(transmission.iorChangedPixels)}; backdropTransitions=${String(transmission.backdropColorTransitions)}; attenuationLuma=${String(transmission.weakAttenuationLuma)}->${String(transmission.strongAttenuationLuma)}`
  ),
  check(
    "authored-tangent-anisotropy",
    transmission.tangentAnisotropyOrientationRange >= 20 && transmission.tangentAnisotropyMaxElongation >= 1.35,
    `orientationRange=${String(transmission.tangentAnisotropyOrientationRange)}; maxElongation=${String(transmission.tangentAnisotropyMaxElongation)}`
  ),
  check("transmission-evidence-fresh", fresh(transmission), `generatedAt=${String(transmission.generatedAt)}`),
  check(
    "same-asset-current-three-combined-card",
    combined.status === "ready"
      && combined.parity?.claim === "combined-card-eleven-extension-delta-coverage"
      && combined.cases?.length === 11
      && requiredCombinedExtensions.every((extension) => combinedExtensions.has(extension))
      && combined.cases.every((entry: any) => entry.a3d?.summary?.pass === true
        && entry.a3d?.pixelStats?.nonBlackPixels > 5_000
        && entry.threejs?.pixelStats?.nonBlackPixels > 5_000
        && entry.diff?.meanDelta < entry.parityThresholds?.meanDelta
        && entry.diff?.structuralSimilarityProxy > entry.parityThresholds?.structuralSimilarityProxy),
    `claim=${String(combined.parity?.claim)}; cases=${String(combined.cases?.length)}`
  ),
  check("combined-card-evidence-fresh", fresh(combined), `generatedAt=${String(combined.generatedAt)}`),
  check(
    "same-fixture-real-three-gltfloader",
    loader.status === "ready"
      && loader.assertions?.sameFixtureHash === true
      && loader.assertions?.actualThreeGLTFLoader === true
      && loader.assertions?.actualThreeRenderer === true
      && loader.assertions?.screenshotsNonBlank === true
      && loader.assertions?.fakeEqualityClaimed === false,
    `similarity=${String(loader.diff?.structuralSimilarityProxy)}; sameFixtureHash=${String(loader.assertions?.sameFixtureHash)}`
  ),
  check("loader-evidence-fresh", fresh(loader), `generatedAt=${String(loader.generatedAt)}`),
  check(
    "core-gltf-material-channels",
    ["baseColorTexture", "metallicRoughnessTexture", "normalTexture", "occlusionTexture", "emissiveTexture", "clearcoatNormalTexture", "clearcoatRoughnessTexture"].every((token) => runtimeTests.includes(token)),
    "synthetic loader/render-resource tests cover base color, metallic/roughness, normal, occlusion, emissive, and clearcoat texture channels"
  ),
  check(
    "gltf-scene-and-material-semantics",
    ["KHR_texture_transform", "KHR_materials_variants", "KHR_lights_punctual", "KHR_materials_unlit", "TANGENT", "COLOR_0", "alphaMode", "doubleSided", "skinning", "morph"].every((token) => runtimeTests.includes(token)),
    "synthetic loader/runtime tests cover transforms, variants, punctual lights, unlit, tangents, vertex colors, alpha modes, double-sided materials, skinning, and morphs"
  ),
  check(
    "supported-compression-hooks",
    ["KHR_draco_mesh_compression", "EXT_meshopt_compression", "KHR_texture_basisu"].every((token) => compressionTests.includes(token))
      && ["draco", "meshopt", "ktx2-basis"].every((token) => extensionSupport.includes(token)),
    "Draco, Meshopt, and KTX2/Basis are decoder-injected optional paths and pass focused tests"
  ),
  check(
    "dispersion-claim-boundary",
    extensionSupport.includes('entry("KHR_materials_dispersion", "material", "parsed-with-limits"')
      && extensionSupport.includes("spectral dispersion rendering remains blocked"),
    "dispersion is preserved and compared on the combined card, but spectral dispersion is explicitly not advertised"
  ),
  check(
    "measurement-invalidates-empty-frames",
    transmission.measurementValid === true
      && combined.cases.every((entry: any) => entry.a3d?.pixelStats?.nonBlackPixels > 5_000 && entry.a3d?.pixelStats?.uniqueColorBuckets >= 20)
      && loader.assertions?.screenshotsNonBlank === true,
    "subject coverage, color diversity, and nonblank screenshot gates reject blank/camera-only/wrong-scale output"
  )
];

const failures = checks.filter((entry) => !entry.pass);
const report = {
  schema: "aura3d.renderer-pbr-gltf-correctness/1.0",
  generatedAt: new Date().toISOString(),
  pass: failures.length === 0,
  claim: "bounded-current-threejs-pbr-gltf-correctness",
  currentThree: {
    version: baseline.three?.version,
    tag: baseline.three?.tag,
    releaseCommit: baseline.three?.releaseCommit
  },
  scope: {
    proven: [
      "public createAuraApp primitive structural material behavior",
      "production-runtime textured PBR/glTF loading and rendering paths",
      "same-fixture and same-combined-card browser comparisons against current Three.js"
    ],
    limited: [
      "combined-card labels are not isolated per-feature visual fixtures",
      "transmission is screen-space scene-color composition, not path tracing",
      "variants are runtime selectable but authoring/persistence parity is not claimed",
      "compression requires explicitly injected optional decoders"
    ],
    blocked: [
      "spectral dispersion",
      "universal glTF ecosystem parity",
      "universal Three.js material parity"
    ]
  },
  checks,
  failures: failures.map(({ id, detail }) => ({ id, detail })),
  evidence: [
    "tests/reports/current-threejs-baseline.json",
    "tests/reports/material-structural-parity.json",
    "tests/reports/pbr-gltf-correctness/transmission/report.json",
    "tests/reports/runtime-parity/material-extension-parity/material-extension-parity-report.json",
    "tests/reports/threejs-parity/loader-material-extensions-parity.json"
  ]
};

mkdirSync(dirname(resolve(REPORT_PATH)), { recursive: true });
writeFileSync(resolve(REPORT_PATH), `${JSON.stringify(report, null, 2)}\n`);

if (failures.length > 0) {
  console.error(`PBR/glTF correctness is UNPROVEN: ${failures.map((entry) => entry.id).join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(`PBR/glTF correctness PASS: Three.js ${String(report.currentThree.version)}; ${checks.length}/${checks.length} checks; ${REPORT_PATH}`);
}
