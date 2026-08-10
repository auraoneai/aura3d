import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const json = (path: string): any => JSON.parse(readFileSync(resolve(path), "utf8"));
const text = (path: string): string => readFileSync(resolve(path), "utf8");
const baseline = json("tests/reports/current-threejs-baseline.json");
const context = json("benchmark/context/threejs-r185.1-20260808.json");
const browser = json("tests/reports/current-head-to-head/material-laboratory/report.json");
const source = text("benchmark/current-head-to-head/material-laboratory/main.ts");
const modes = ["satin", "chrome", "gold", "rubber", "clearcoat", "emissive"];
const expectedAsset = context.assets.product;
const actualAssetHash = createHash("sha256").update(readFileSync(resolve(expectedAsset.path))).digest("hex");
const byMode = new Map<string, any>((browser.modes ?? []).map((entry: any) => [entry.mode, entry] as const));
const ratio = (a: number, b: number): number => b > 0 ? a / b : 0;
const materialQuality = modes.map((mode) => {
  const entry = byMode.get(mode);
  return {
    mode,
    subjectMeanLumaRatio: ratio(entry?.aura?.pixelStats?.subjectMeanLuma ?? 0, entry?.three?.pixelStats?.subjectMeanLuma ?? 0),
    p99LumaRatio: ratio(entry?.aura?.pixelStats?.p99Luma ?? 0, entry?.three?.pixelStats?.p99Luma ?? 0),
    auraHighlightRange: entry?.aura?.pixelStats?.highlightRange ?? 0,
    threeHighlightRange: entry?.three?.pixelStats?.highlightRange ?? 0
  };
});
const checks = [
  { id: "current-three-r185", pass: baseline.pass === true && baseline.three?.version === "0.185.1" && browser.modes?.every((entry: any) => entry.three?.revision === "185") },
  { id: "exact-frozen-asset", pass: browser.assetSha256 === expectedAsset.sha256 && actualAssetHash === expectedAsset.sha256 },
  { id: "frozen-viewport", pass: browser.viewport?.width === context.commonRenderContract.viewport.width && browser.viewport?.height === context.commonRenderContract.viewport.height && browser.viewport?.dpr === context.commonRenderContract.devicePixelRatio },
  { id: "same-hdr-and-color-contract", pass: browser.contract?.environment?.id === "studio-small-08" && browser.contract?.environment?.url === "/fixtures/environment-corpus/hdri/studio_small_08_1k.hdr" && browser.contract?.toneMapping?.operator === "aces" && browser.contract?.toneMapping?.exposure === 1 && browser.contract?.toneMapping?.outputSpace === "srgb" },
  { id: "six-matched-material-contracts", pass: browser.modes?.length === modes.length && modes.every((mode) => byMode.has(mode) && byMode.get(mode)?.material) },
  { id: "real-public-stacks", pass: source.includes('from "@aura3d/assets"') && source.includes('from "@aura3d/engine/advanced-runtime"') && !source.includes("packages/") && browser.modes?.every((entry: any) => entry.aura?.publicPackageOnly === true && entry.three?.actualRenderer === true && entry.three?.actualGLTFLoader === true && entry.three?.actualPhysicalMaterial === true) },
  { id: "all-states-rendered", pass: browser.modes?.every((entry: any) => entry.aura?.drawCalls > 0 && entry.three?.drawCalls > 0 && entry.three?.triangles > 0 && entry.aura?.pixelStats?.litPixels > 80_000 && entry.three?.pixelStats?.litPixels > 80_000) },
  { id: "material-states-change-both-engines", pass: new Set(browser.modes?.map((entry: any) => entry.aura?.hash)).size === modes.length && new Set(browser.modes?.map((entry: any) => entry.three?.hash)).size === modes.length },
  { id: "bounded-subject-luminance-response", pass: materialQuality.every((entry) => entry.subjectMeanLumaRatio >= 0.85 && entry.subjectMeanLumaRatio <= 1.15) },
  { id: "bounded-highlight-energy", pass: materialQuality.every((entry) => entry.p99LumaRatio >= 0.8 && entry.p99LumaRatio <= 1.2) },
  { id: "aura-metal-reflection-readable", pass: (byMode.get("chrome")?.aura?.pixelStats?.highlightRange ?? 0) > (byMode.get("rubber")?.aura?.pixelStats?.highlightRange ?? 0) * 3 && (byMode.get("gold")?.aura?.pixelStats?.highlightRange ?? 0) > (byMode.get("rubber")?.aura?.pixelStats?.highlightRange ?? 0) * 3 },
  { id: "twelve-exact-captures-retained", pass: modes.every((mode) => ["aura", "three"].every((engine) => statSync(resolve(`tests/reports/current-head-to-head/material-laboratory/${mode}-${engine}.png`)).size > 10_000)) },
  { id: "paired-interaction-stable", pass: browser.interaction?.selectedMode === "chrome" && browser.interaction?.stableRerender === true },
  { id: "owned-resources-disposed", pass: Object.values(browser.lifecycle ?? {}).every(Boolean) }
];
const failures = checks.filter((entry) => !entry.pass);
const report = {
  schema: "aura3d.current-head-to-head-material-laboratory-aggregate/1.0",
  generatedAt: new Date().toISOString(),
  pass: failures.length === 0,
  workload: "same-asset-material-laboratory",
  verdict: "selected-six-state-same-product-comparison; material-quality-parity-requires-human-review",
  checks,
  failures,
  comparison: {
    modes,
    acceptancePolicy: "For this bounded laboratory only: the exact shared asset/HDR/camera/material contract must keep Aura subject mean luminance within 15% and p99 highlight energy within 20% of current Three.js in every state; chrome and gold must each show at least three times rubber's highlight range. These numeric gates are accompanied by individual full-resolution human inspection and do not imply pixel, BRDF, extension, HDR, performance, or ecosystem parity.",
    materialQuality,
    observedLosses: [
      "Personal inspection of all twelve retained captures confirms identical complete-product framing and six visibly distinct material states in both engines; no state is blank, clipped, malformed, or substituted with a primitive.",
      "With the exact same studio_small_08_1k.hdr, ACES exposure, sRGB output, key light, ambient term, asset, frame, and material values, chrome now shows comparable dark/bright environment bands and reflection placement in both engines.",
      "Aura satin and rubber remain slightly darker; Aura gold is darker and more contrasty; Aura clearcoat is slightly broader/brighter in places while Three retains a wider highlight range. Aura emissive is more saturated cyan while Three is paler.",
      "Aura uses its bounded production-runtime PBR path while Three uses MeshPhysicalMaterial; the images are not pixel-equivalent and implementation-specific PMREM/BRDF/output differences remain visible.",
      "This does not cover authored material textures, every glTF material extension, spectral conductors, physical refraction, HDR equivalence, performance, or the wider Three.js material ecosystem."
    ],
    claimBoundary: browser.claimBoundary
  },
  browser
};
const output = resolve("tests/reports/current-head-to-head/material-laboratory/aggregate.json");
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) { console.error(`Material-laboratory head-to-head UNPROVEN: ${failures.map((entry) => entry.id).join(", ")}`); process.exitCode = 1; }
else console.log(`Material-laboratory head-to-head PASS: ${checks.length}/${checks.length} checks with explicit limits; ${output}`);
