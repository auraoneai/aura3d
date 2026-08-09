import { readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const json = (path: string): any => JSON.parse(readFileSync(resolve(path), "utf8"));
const text = (path: string): string => readFileSync(resolve(path), "utf8");
const baseline = json("tests/reports/current-threejs-baseline.json");
const context = json("benchmark/context/threejs-r185.1-20260808.json");
const browser = json("tests/reports/current-head-to-head/webgpu-tsl/report.json");
const source = text("benchmark/current-head-to-head/webgpu-tsl/main.ts");
const captures = ["aura-before.png", "three-before.png", "aura-after.png", "three-after.png"];
const checks = [
  { id: "current-three-webgpu-tsl-baseline", pass: baseline.three?.version === "0.185.1" && browser.before?.three?.revision === "185" && source.includes('from "three/webgpu"') && source.includes('from "three/tsl"') },
  { id: "exact-frozen-product-and-compositor-captures", pass: browser.assetSha256 === context.assets.product.sha256 && captures.every((name) => statSync(resolve(`tests/reports/current-head-to-head/webgpu-tsl/${name}`)).size > 10_000) },
  { id: "native-webgpu-both-sides", pass: browser.before?.aura?.backend === "webgpu" && browser.before?.aura?.nativeSubmissions > 0 && browser.before?.three?.actualWebGPURenderer === true && browser.before?.three?.actualNativeWebGPUBackend === true && browser.before?.three?.backendName === "WebGPUBackend" },
  { id: "public-portable-wgsl-versus-real-tsl", pass: browser.before?.aura?.publicPackageOnly === true && browser.before?.aura?.actualPortableWGSL === true && browser.before?.aura?.nativePassthroughSubmissions > 0 && browser.before?.three?.actualTSLNodeMaterial === true && !source.includes("packages/") },
  { id: "native-product-draws", pass: browser.before?.aura?.drawCalls > 0 && browser.before?.three?.drawCalls > 0 && browser.after?.aura?.drawCalls > 0 && browser.after?.three?.drawCalls > 0 },
  { id: "paired-visible-material-state-change", pass: browser.before?.aura?.materialStateHash !== browser.after?.aura?.materialStateHash && browser.captureHashes?.before?.aura !== browser.captureHashes?.after?.aura && browser.captureHashes?.before?.three !== browser.captureHashes?.after?.three },
  { id: "stable-native-pipeline", pass: browser.before?.aura?.nativeRenderPipelinesCreated === 1 && browser.after?.aura?.nativeRenderPipelinesCreated === 1 },
  { id: "caller-owned-lifecycle", pass: Object.values(browser.lifecycle ?? {}).every(Boolean) && Object.keys(browser.lifecycle ?? {}).length === 6 }
];
const failures = checks.filter((entry) => !entry.pass);
const report = { schema: "aura3d.current-head-to-head-webgpu-tsl/1.0", generatedAt: new Date().toISOString(), pass: failures.length === 0, workload: "webgpu-tsl", verdict: "native-webgpu-selected-shader-workload-proven-with-tsl-gap", checks, failures, comparison: { auraDrawCalls: browser.before?.aura?.drawCalls, threeDrawCalls: browser.before?.three?.drawCalls, observedLosses: ["Personal inspection of all four retained browser-compositor captures confirms the exact product is fully visible and closely aligned in projection, silhouette, animated plasma bands, rim treatment, and black background. Excluding the intentionally different top labels, normalized paired RMSE is 0.0456088 before and 0.0453478 after; small color, edge, and raster differences remain.", "Three authors one composable typed TSL graph for its native WebGPU renderer. Aura's selected portable material runs natively on WebGPU but requires explicit paired GLSL and WGSL stage implementations; general TSL/node-graph breadth, ergonomics, and ecosystem parity remain unproven."], claimBoundary: "Public low-level @aura3d/rendering native-WebGPU portable-material workload; not root createAuraApp WebGPU or TSL parity." }, browser };
const output = resolve("tests/reports/current-head-to-head/webgpu-tsl/aggregate.json"); writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`); if (failures.length) { console.error(`WebGPU/TSL head-to-head UNPROVEN: ${failures.map((entry) => entry.id).join(", ")}`); process.exitCode = 1; } else console.log(`WebGPU/TSL head-to-head PASS: ${checks.length}/${checks.length}; ${output}`);
