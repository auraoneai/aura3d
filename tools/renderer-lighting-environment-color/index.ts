import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const REPORT_PATH = "tests/reports/lighting-environment-color/report.json";
const MAX_AGE_MS = 30 * 60 * 1000;

interface Check {
  readonly id: string;
  readonly pass: boolean;
  readonly detail: string;
}

const json = (path: string): any => JSON.parse(readFileSync(resolve(path), "utf8"));
const check = (id: string, pass: boolean, detail: string): Check => ({ id, pass, detail });
const fresh = (report: any): boolean => {
  const timestamp = Date.parse(String(report.generatedAt ?? ""));
  return Number.isFinite(timestamp) && Date.now() - timestamp <= MAX_AGE_MS;
};

const baseline = json("tests/reports/current-threejs-baseline.json");
const lights = json("tests/reports/threejs-parity/physical-lights-parity.json");
const area = json("tests/reports/lighting-environment-color/rect-area-light.json");
const shadow = json("tests/reports/threejs-parity/shadowmap-parity.json");
const cascades = json("tests/reports/external-parity-shadow-cascade-browser.json");
const contact = json("tests/reports/runtime-parity/contact-shadow-parity/contact-shadow-parity-report.json");
const pmrem = json("tests/reports/runtime-parity/pmrem-parity/pmrem-parity-report.json");
const hdr = json("tests/reports/external-parity-hdr-browser.json");

const checks: Check[] = [
  check(
    "current-threejs-r185.1",
    baseline.pass === true && baseline.three?.version === "0.185.1" && baseline.three?.tag === "r185",
    `three=${String(baseline.three?.version)}; tag=${String(baseline.three?.tag)}`
  ),
  check(
    "directional-point-spot-current-three",
    lights.status === "ready"
      && lights.assertions?.actualThreeRenderer === true
      && lights.assertions?.a3dPointAndSpotLights === true
      && lights.assertions?.threePointAndSpotLights === true
      && lights.assertions?.inverseSquareSamples === true
      && lights.attenuationSamples?.every((sample: any) => sample.delta <= 0.18)
      && lights.diff?.structuralSimilarityProxy >= 0.45,
    `attenuationDeltas=${JSON.stringify(lights.attenuationSamples?.map((sample: any) => sample.delta))}; similarity=${String(lights.diff?.structuralSimilarityProxy)}`
  ),
  check(
    "fair-light-comparison-contract",
    lights.assertions?.sameResolution === true
      && lights.assertions?.identicalCamera === true
      && lights.assertions?.identicalLightDescriptors === true
      && lights.assertions?.identicalExposureToneMappingAndColorSpace === true
      && lights.assertions?.identicalDpr === true,
    "one computed camera frame, matching light descriptors, DPR 1, ACES exposure 1, linear lighting, and sRGB output"
  ),
  check(
    "finite-rect-area-boundary",
    area.status === "ready"
      && area.renderer === "webgl2"
      && area.smallToWideChangedPixels > 1_000
      && area.wideToBackChangedPixels > 1_000
      && area.averageLuminance?.wide > area.averageLuminance?.small * 1.15
      && area.averageLuminance?.wide > area.averageLuminance?.back * 1.8
      && /does not claim.*LTC.*root createAuraApp/i.test(String(area.claimBoundary)),
    `smallToWide=${String(area.smallToWideChangedPixels)}; wideToBack=${String(area.wideToBackChangedPixels)}`
  ),
  check(
    "same-scene-directional-shadow-current-three",
    shadow.status === "ready"
      && shadow.assertions?.actualThreeRenderer === true
      && shadow.assertions?.a3dShadowMapRequested === true
      && shadow.assertions?.threeShadowMapEnabled === true
      && shadow.assertions?.pcfCoverage === true
      && shadow.assertions?.shadowContactVisible === true
      && shadow.assertions?.screenshotsNonBlank === true
      && shadow.diff?.structuralSimilarityProxy >= 0.4,
    `a3dPCF=${String(shadow.a3d?.shadowMap?.pcfSamples)}; similarity=${String(shadow.diff?.structuralSimilarityProxy)}`
  ),
  check(
    "csm-softness-acne-peter-panning-atlas-stability",
    cascades.status === "ready"
      && cascades.checks?.cascadesRendered === true
      && cascades.checks?.pcfPenumbra === true
      && cascades.metrics?.cascadeCount >= 3
      && cascades.metrics?.penumbraSteps >= 4
      && cascades.acneControl?.meanDarkening < 3
      && cascades.peterPanningControl?.darkenedReceiverPixels > 200
      && cascades.peterPanningControl?.contactGapPixels <= 4
      && cascades.stabilityAndAtlas?.subTexelStableCascades === 4
      && cascades.stabilityAndAtlas?.multiTexelMovedCascades >= 1
      && cascades.stabilityAndAtlas?.atlasAllocationCount === 4
      && cascades.stabilityAndAtlas?.atlasNonOverlapping === true,
    `cascades=${String(cascades.metrics?.cascadeCount)}; penumbraSteps=${String(cascades.metrics?.penumbraSteps)}; acne=${String(cascades.acneControl?.meanDarkening)}; contactGap=${String(cascades.peterPanningControl?.contactGapPixels)}; stable=${String(cascades.stabilityAndAtlas?.subTexelStableCascades)}; atlas=${String(cascades.stabilityAndAtlas?.atlasAllocationCount)}`
  ),
  check(
    "bounded-contact-shadow-wording-and-current-three-delta",
    contact.status === "ready"
      && contact.parity?.claim === "bounded-threejs-soft-contact-shadow-delta-parity"
      && /not full screen-space, ray, or general contact-shadow parity/i.test(String(contact.parity?.reason))
      && contact.a3d?.contactShadow?.parity === "not-full-contact-shadow"
      && contact.a3d?.contactShadow?.quality === "bounded-receiver-contact"
      && contact.a3d?.rendererShadowMap?.enabled === true
      && contact.diff?.meanDelta < 13
      && contact.diff?.structuralSimilarityProxy > 0.95,
    `claim=${String(contact.parity?.claim)}; meanDelta=${String(contact.diff?.meanDelta)}; similarity=${String(contact.diff?.structuralSimilarityProxy)}`
  ),
  check(
    "hdr-ibl-pmrem-exposure-tone-output-background",
    hdr.ok === true
      && hdr.state?.featureEvidence?.hdrRenderTargets === true
      && hdr.state?.featureEvidence?.sampleOverOne === true
      && hdr.state?.featureEvidence?.hdrPostprocessToneMapping === true
      && pmrem.status === "ready"
      && pmrem.parity?.claim === "bounded-threejs-cubemap-pmrem-parity"
      && pmrem.a3d?.cubemapPMREMModel === "equirectangular-to-cubemap-ggx-importance-sampled-prefilter"
      && pmrem.a3d?.cubemapMipCount >= 8
      && pmrem.threejs?.pmremGenerator === true
      && pmrem.diff?.meanDelta < 11
      && pmrem.diff?.structuralSimilarityProxy > 0.96
      && pmrem.skybox?.parity?.claim === "bounded-hdr-skybox-parity"
      && pmrem.skybox?.diff?.structuralSimilarityProxy > 0.93,
    `hdrSample=${String(hdr.state?.metrics?.sampleR)}; toneMapped=${String(hdr.state?.metrics?.hdrToneMappedR)}; pmremMeanDelta=${String(pmrem.diff?.meanDelta)}; skyboxSimilarity=${String(pmrem.skybox?.diff?.structuralSimilarityProxy)}`
  ),
  ...[
    ["baseline", baseline],
    ["physical-lights", lights],
    ["rect-area-light", area],
    ["shadowmap", shadow],
    ["cascades", cascades],
    ["contact-shadow", contact],
    ["pmrem", pmrem],
    ["hdr", hdr]
  ].map(([id, report]) => check(`${String(id)}-fresh`, fresh(report), `generatedAt=${String((report as any).generatedAt)}`))
];

const failures = checks.filter((entry) => !entry.pass);
const report = {
  schema: "aura3d.renderer-lighting-environment-color/1.0",
  generatedAt: new Date().toISOString(),
  pass: failures.length === 0,
  claim: "bounded-current-threejs-lighting-shadow-environment-color-correctness",
  currentThree: {
    version: baseline.three?.version,
    tag: baseline.three?.tag,
    releaseCommit: baseline.three?.releaseCommit
  },
  scope: {
    proven: [
      "production-runtime directional, point, spot, and finite rectangular lights",
      "directional PCF shadows plus bounded CSM quality controls",
      "HDR targets, GGX cubemap PMREM, split-sum IBL, exposure/tone/color policy, and HDR background",
      "bounded receiver-contact approximation and same-scene current Three.js comparisons"
    ],
    limited: [
      "rectangular lights are finite quadrature emitters, not Three.js LTC identity, and do not cast rectangular-light shadow maps",
      "contact shadows are a bounded receiver-contact approximation plus a renderer directional map",
      "CSM evidence is bounded to the tested camera/light/receiver workload"
    ],
    blocked: [
      "root createAuraApp general lighting/PBR parity",
      "physical atmosphere and global illumination",
      "universal Three.js lighting or shadow parity"
    ]
  },
  checks,
  failures: failures.map(({ id, detail }) => ({ id, detail })),
  evidence: [
    "tests/reports/threejs-parity/physical-lights-parity.json",
    "tests/reports/lighting-environment-color/rect-area-light.json",
    "tests/reports/threejs-parity/shadowmap-parity.json",
    "tests/reports/external-parity-shadow-cascade-browser.json",
    "tests/reports/runtime-parity/contact-shadow-parity/contact-shadow-parity-report.json",
    "tests/reports/runtime-parity/pmrem-parity/pmrem-parity-report.json",
    "tests/reports/external-parity-hdr-browser.json"
  ]
};

mkdirSync(dirname(resolve(REPORT_PATH)), { recursive: true });
writeFileSync(resolve(REPORT_PATH), `${JSON.stringify(report, null, 2)}\n`);

if (failures.length > 0) {
  console.error(`Lighting/environment/color correctness is UNPROVEN: ${failures.map((entry) => entry.id).join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(`Lighting/environment/color correctness PASS: Three.js ${String(report.currentThree.version)}; ${checks.length}/${checks.length} checks; ${REPORT_PATH}`);
}
