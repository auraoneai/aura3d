import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const json = (path: string): any => JSON.parse(readFileSync(resolve(path), "utf8"));
const text = (path: string): string => readFileSync(resolve(path), "utf8");
const baseline = json("tests/reports/current-threejs-baseline.json");
const context = json("benchmark/context/threejs-r185.1-20260808.json");
const browser = json("tests/reports/current-head-to-head/instancing-lod/report.json");
const source = text("benchmark/current-head-to-head/instancing-lod/main.ts");
const expectedAsset = context.assets.product;
const actualAssetHash = createHash("sha256").update(readFileSync(resolve(expectedAsset.path))).digest("hex");
const captures = ["aura-near.png", "three-near.png", "aura-far.png", "three-far.png"];
const checks = [
  { id: "current-three-r185", pass: baseline.pass === true && baseline.three?.version === "0.185.1" && browser.before?.three?.revision === "185" },
  { id: "exact-frozen-product-asset", pass: browser.assetSha256 === expectedAsset.sha256 && actualAssetHash === expectedAsset.sha256 && browser.before?.asset?.id === expectedAsset.id && browser.before?.aura?.assetState?.status === "ready" && browser.before?.three?.actualGLTFLoader === true },
  { id: "frozen-native-viewport-and-captures", pass: browser.before?.viewport?.width === context.commonRenderContract.viewport.width && browser.before?.viewport?.height === context.commonRenderContract.viewport.height && browser.before?.viewport?.dpr === context.commonRenderContract.devicePixelRatio && captures.every((name) => statSync(resolve(`tests/reports/current-head-to-head/instancing-lod/${name}`)).size > 10_000) },
  { id: "public-realistic-stacks", pass: source.includes('from "@aura3d/engine"') && source.includes('from "three"') && source.includes('from "stats.js"') && source.includes("THREE.InstancedMesh") && source.includes("new THREE.LOD") && !source.includes("packages/") && browser.before?.aura?.publicPackageOnly === true && browser.before?.three?.actualRenderer === true && browser.before?.three?.actualInstancedMesh === true && browser.before?.three?.actualLod === true && browser.before?.three?.actualStatsJs === true },
  { id: "native-2500-instance-submission", pass: browser.before?.aura?.instanceCount === 2500 && browser.before?.aura?.nativeInstancedSubmissions > 0 && browser.before?.aura?.drawCalls < 100 && browser.before?.three?.instanceCount === 2500 && browser.before?.three?.drawCalls < 100 && browser.before?.three?.triangles > 25_000 },
  { id: "same-near-and-far-camera-distance", pass: browser.before?.aura?.cameraDistance === browser.before?.three?.cameraDistance && browser.after?.aura?.cameraDistance === browser.after?.three?.cameraDistance && browser.before?.aura?.cameraDistance < 20 && browser.after?.aura?.cameraDistance > 20 },
  { id: "paired-lod-transition-changes-pixels", pass: browser.before?.aura?.lodLevel === 0 && browser.before?.three?.lodLevel === 0 && browser.after?.aura?.lodLevel === 1 && browser.after?.three?.lodLevel === 1 && browser.after?.interaction?.applied === true && browser.before?.aura?.pixelHash !== browser.after?.aura?.pixelHash && browser.before?.three?.pixelHash !== browser.after?.three?.pixelHash }
];
const failures = checks.filter((entry) => !entry.pass);
const auraDrawCalls = browser.before?.aura?.drawCalls ?? 0;
const threeDrawCalls = browser.before?.three?.drawCalls ?? 0;
const report = {
  schema: "aura3d.current-head-to-head-instancing-lod/1.0",
  generatedAt: new Date().toISOString(),
  pass: failures.length === 0,
  workload: "instancing-lod",
  verdict: "both-native-instance-and-switch-lod-with-visible-aura-losses",
  checks,
  failures,
  comparison: {
    auraDrawCalls,
    threeDrawCalls,
    auraToThreeDrawCallRatio: threeDrawCalls > 0 ? Number((auraDrawCalls / threeDrawCalls).toFixed(3)) : null,
    observedLosses: [
      "Aura submits six draws versus Three.js three for the same frozen product hero, 2,500-instance field, and selected LOD object.",
      "Aura's public root instancing helper instances built-in primitives; it does not expose imported GLB mesh instancing, so the exact product asset is a shared non-instanced hero in this workload.",
      "The retained Aura frames have a lighter background response than the Three.js control under the shared authored color intent."
    ],
    claimBoundary: "This proves native primitive instancing and distance LOD through the public Aura root. It does not claim imported-model instancing parity, draw-call parity, performance non-inferiority, or visual parity."
  },
  browser
};
const output = resolve("tests/reports/current-head-to-head/instancing-lod/aggregate.json");
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
if (failures.length > 0) {
  console.error(`Instancing/LOD head-to-head UNPROVEN: ${failures.map((entry) => entry.id).join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(`Instancing/LOD head-to-head PASS: ${checks.length}/${checks.length} checks with explicit losses; ${output}`);
}
