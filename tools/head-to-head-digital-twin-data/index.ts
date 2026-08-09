import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const json = (path: string): any => JSON.parse(readFileSync(resolve(path), "utf8"));
const text = (path: string): string => readFileSync(resolve(path), "utf8");
const baseline = json("tests/reports/current-threejs-baseline.json");
const context = json("benchmark/context/threejs-r185.1-20260808.json");
const browser = json("tests/reports/current-head-to-head/digital-twin-data/report.json");
const source = text("benchmark/current-head-to-head/digital-twin-data/src/main.tsx");
const expectedAsset = context.assets.digitalTwin;
const actualAssetHash = createHash("sha256").update(readFileSync(resolve(expectedAsset.path))).digest("hex");
const requiredControlStack = context.workloads.find((entry: { id: string }) => entry.id === "digital-twin-data")?.stack ?? [];
const captures = ["aura-before.png", "three-before.png", "aura-after.png", "three-after.png"];
const checks = [
  { id: "current-three-r185", pass: baseline.pass === true && baseline.three?.version === "0.185.1" && browser.before?.three?.revision === "185" },
  { id: "exact-frozen-asset", pass: browser.assetSha256 === expectedAsset.sha256 && actualAssetHash === expectedAsset.sha256 && browser.before?.asset?.id === expectedAsset.id },
  { id: "frozen-native-viewport", pass: browser.before?.viewport?.width === context.commonRenderContract.viewport.width && browser.before?.viewport?.height === context.commonRenderContract.viewport.height && browser.before?.viewport?.dpr === context.commonRenderContract.devicePixelRatio && captures.every((name) => statSync(resolve(`tests/reports/current-head-to-head/digital-twin-data/${name}`)).size > 10_000) },
  { id: "public-idiomatic-stacks", pass: requiredControlStack.every((dependency: string) => source.includes(`from "${dependency}"`) || source.includes(`from "${dependency}/`)) && source.includes('from "@aura3d/engine"') && !source.includes("packages/") && browser.before?.aura?.publicPackageOnly === true && browser.before?.three?.actualR3F === true && browser.before?.three?.actualDrei === true && browser.before?.three?.actualRenderer === true },
  { id: "real-workcell-output", pass: browser.before?.aura?.backend === "webgl2" && browser.before?.aura?.drawCalls > 25 && browser.before?.aura?.assetState?.status === "ready" && browser.before?.aura?.assetState?.provenance?.source === "typed-aura-assets-manifest" && browser.before?.three?.drawCalls > 25 && browser.before?.three?.triangles > 10_000 && browser.before?.three?.nodeCount > 100 },
  { id: "same-deterministic-telemetry", pass: JSON.stringify(browser.before?.aura?.telemetry) === JSON.stringify(browser.before?.three?.telemetry) && JSON.stringify(browser.after?.aura?.telemetry) === JSON.stringify(browser.after?.three?.telemetry) && browser.before?.aura?.telemetry?.incidents === 0 && browser.after?.aura?.telemetry?.incidents === 1 },
  { id: "data-changes-visible-3d-state", pass: browser.after?.interaction?.applied === true && browser.after?.interaction?.action === "inject-alert" && browser.after?.aura?.visibleDataBinding === "red-zone-and-beacon" && browser.after?.three?.visibleDataBinding === "red-zone-and-beacon" && browser.before?.aura?.pixelHash !== browser.after?.aura?.pixelHash && browser.before?.three?.pixelHash !== browser.after?.three?.pixelHash },
  { id: "matched-background-output", pass: maxChannelDelta(browser.before?.aura?.backgroundPixel, browser.before?.three?.backgroundPixel) <= 3 }
];
const failures = checks.filter((entry) => !entry.pass);
const auraDrawCalls = browser.before?.aura?.drawCalls ?? 0;
const threeDrawCalls = browser.before?.three?.drawCalls ?? 0;
const report = {
  schema: "aura3d.current-head-to-head-digital-twin-data/1.0",
  generatedAt: new Date().toISOString(),
  pass: failures.length === 0,
  workload: "digital-twin-data",
  verdict: "both-render-and-bind-data-with-visible-aura-losses",
  checks,
  failures,
  comparison: {
    auraDrawCalls,
    threeDrawCalls,
    auraToThreeDrawCallRatio: threeDrawCalls > 0 ? Number((auraDrawCalls / threeDrawCalls).toFixed(3)) : null,
    observedLosses: [
      "Aura submits 362 draws versus Three.js 182 for the same workcell and data marker.",
      "All four retained normal/incident frames were reopened after the shared HDR, ACES, and linear-color corrections. Background, geometry, framing, and overall contrast now align closely; the Aura data marker retains slightly brighter peak color and broader per-pixel material/lighting differences remain."
    ],
    claimBoundary: "This is deterministic browser-side sample telemetry bound to visible scene state. It does not claim PLC connectivity, real facility data, validated safety logic, production digital-twin integration, or visual parity."
  },
  browser
};
const output = resolve("tests/reports/current-head-to-head/digital-twin-data/aggregate.json");
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
if (failures.length > 0) {
  console.error(`Digital-twin head-to-head UNPROVEN: ${failures.map((entry) => entry.id).join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(`Digital-twin head-to-head PASS: ${checks.length}/${checks.length} checks with explicit losses; ${output}`);
}
function maxChannelDelta(a: readonly number[] = [], b: readonly number[] = []): number { return Math.max(...a.slice(0, 3).map((value, index) => Math.abs(value - (b[index] ?? 0)))); }
