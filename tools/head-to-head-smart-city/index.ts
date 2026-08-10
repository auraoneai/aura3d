import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const json = (path: string): any => JSON.parse(readFileSync(resolve(path), "utf8"));
const text = (path: string): string => readFileSync(resolve(path), "utf8");
const baseline = json("tests/reports/current-threejs-baseline.json");
const context = json("benchmark/context/threejs-r185.1-20260808.json");
const browser = json("tests/reports/current-head-to-head/smart-city/report.json");
const source = text("benchmark/current-head-to-head/smart-city/src/main.ts");
const expectedAsset = context.assets.vehicle;
const actualAssetHash = createHash("sha256").update(readFileSync(resolve(expectedAsset.path))).digest("hex");
const captures = ["aura-night-core.png", "three-night-core.png", "aura-day-industrial.png", "three-day-industrial.png"];
const checks = [
  { id: "current-three-r185", pass: baseline.pass === true && baseline.three?.version === "0.185.1" && browser.before?.three?.revision === "185" },
  { id: "exact-frozen-city-vehicle", pass: browser.assetSha256 === expectedAsset.sha256 && actualAssetHash === expectedAsset.sha256 && browser.before?.asset?.id === expectedAsset.id && browser.before?.aura?.assetState?.status === "ready" && browser.before?.three?.actualGLTFLoader === true },
  { id: "frozen-native-viewport-and-captures", pass: browser.before?.viewport?.width === context.commonRenderContract.viewport.width && browser.before?.viewport?.height === context.commonRenderContract.viewport.height && browser.before?.viewport?.dpr === context.commonRenderContract.devicePixelRatio && captures.every((name) => statSync(resolve(`tests/reports/current-head-to-head/smart-city/${name}`)).size > 10_000) },
  { id: "public-current-stacks", pass: source.includes('from "@aura3d/engine"') && source.includes('from "three"') && source.includes("city.cityBlock") && source.includes("new GLTFLoader") && !source.includes("packages/") && browser.before?.aura?.publicPackageOnly === true && browser.before?.three?.actualRenderer === true },
  { id: "exact-shared-city-descriptor", pass: browser.before?.aura?.cityNodeCount === browser.before?.three?.cityNodeCount && browser.before?.aura?.cityNodeCount > 200 && browser.after?.aura?.cityNodeCount === browser.after?.three?.cityNodeCount && browser.after?.aura?.cityNodeCount > 200 },
  { id: "same-night-core-to-day-industrial-transition", pass: browser.before?.aura?.state === "night-core-district" && browser.before?.three?.state === "night-core-district" && browser.after?.aura?.state === "day-industrial-district" && browser.after?.three?.state === "day-industrial-district" && browser.after?.interaction?.applied === true },
  { id: "paired-state-change-changes-pixels", pass: browser.before?.aura?.pixelHash !== browser.after?.aura?.pixelHash && browser.before?.three?.pixelHash !== browser.after?.three?.pixelHash },
  { id: "same-background-input-and-bounded-output", pass: browser.before?.contract?.states?.night?.background === "#050706" && browser.before?.contract?.states?.day?.background === "#c9ecff" && maxChannelDelta(browser.before?.aura?.backgroundPixel, browser.before?.three?.backgroundPixel) <= 3 && maxChannelDelta(browser.after?.aura?.backgroundPixel, browser.after?.three?.backgroundPixel) <= 20 }
];
const failures = checks.filter((entry) => !entry.pass);
const auraDrawCalls = browser.before?.aura?.drawCalls ?? 0;
const threeDrawCalls = browser.before?.three?.drawCalls ?? 0;
const report = {
  schema: "aura3d.current-head-to-head-smart-city/1.0",
  generatedAt: new Date().toISOString(),
  pass: failures.length === 0,
  workload: "smart-city",
  verdict: "both-render-the-exact-city-descriptor-and-typed-vehicle-through-the-selected-state-change",
  checks,
  failures,
  comparison: {
    auraDrawCalls,
    threeDrawCalls,
    auraToThreeDrawCallRatio: threeDrawCalls > 0 ? Number((auraDrawCalls / threeDrawCalls).toFixed(3)) : null,
    observedLosses: [
      `Aura submits ${auraDrawCalls} draws versus Three.js ${threeDrawCalls} for the selected night/core city state.`,
      `Aura reports ${browser.before?.aura?.nativeInstancedSubmissions ?? 0} native instanced submissions for this descriptor; the comparison therefore does not close the route's separate instancing/LOD/culling requirement.`,
      `The same daylight clear-colour input differs by up to ${maxChannelDelta(browser.after?.aura?.backgroundPixel, browser.after?.three?.backgroundPixel)} output byte levels because the renderer colour pipelines do not transform the bright background identically.`,
      "The comparison covers the exact public 8-block descriptor, frozen command vehicle, camera, lighting, background, district overlay, and night/core to day/industrial transition; labels, route UI, telemetry animation, camera modes, performance non-inferiority, and GIS data are outside this workload.",
      "Passing checks establish matched inputs and visible state changes, not aesthetic or pixel parity; all four retained native-canvas PNGs require manual inspection."
    ],
    claimBoundary: "Selected deterministic 8-block city, exact frozen vehicle, and two-state district/day-night comparison against current Three r185. It is not universal smart-city, GIS, traffic simulation, pixel, or performance parity."
  },
  browser
};
const output = resolve("tests/reports/current-head-to-head/smart-city/aggregate.json");
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
if (failures.length > 0) {
  console.error(`Smart-city head-to-head UNPROVEN: ${failures.map((entry) => entry.id).join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(`Smart-city head-to-head PASS: ${checks.length}/${checks.length} checks with explicit losses; ${output}`);
}
function maxChannelDelta(a: readonly number[] = [], b: readonly number[] = []): number { return Math.max(...a.slice(0, 3).map((value, index) => Math.abs(value - (b[index] ?? 0)))); }
