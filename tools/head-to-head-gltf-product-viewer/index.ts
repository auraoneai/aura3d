import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const json = (path: string): any => JSON.parse(readFileSync(resolve(path), "utf8"));
const text = (path: string): string => readFileSync(resolve(path), "utf8");
const baseline = json("tests/reports/current-threejs-baseline.json");
const context = json("benchmark/context/threejs-r185.1-20260808.json");
const browser = json("tests/reports/current-head-to-head/gltf-product-viewer/report.json");
const source = text("benchmark/current-head-to-head/gltf-product-viewer/main.ts");
const expectedAsset = context.assets.product;
const actualAssetHash = createHash("sha256").update(readFileSync(resolve(expectedAsset.path))).digest("hex");
const checks = [
  { id: "current-three-r185", pass: baseline.pass === true && baseline.three?.version === "0.185.1" && browser.before?.three?.revision === "185" },
  { id: "exact-frozen-asset", pass: browser.assetSha256 === expectedAsset.sha256 && actualAssetHash === expectedAsset.sha256 && browser.before?.asset?.id === expectedAsset.id },
  { id: "frozen-viewport", pass: browser.before?.viewport?.width === context.commonRenderContract.viewport.width && browser.before?.viewport?.height === context.commonRenderContract.viewport.height && browser.before?.viewport?.dpr === context.commonRenderContract.devicePixelRatio },
  { id: "public-realistic-stacks", pass: source.includes('from "@aura3d/assets"') && source.includes('from "@aura3d/engine/advanced-runtime"') && !source.includes("packages/") && browser.before?.aura?.publicPackageOnly === true && browser.before?.three?.actualGLTFLoader === true && Object.values(browser.before?.three?.addons ?? {}).every(Boolean) },
  { id: "rendered-product", pass: browser.before?.aura?.drawCalls > 0 && browser.before?.three?.drawCalls > 0 && browser.before?.three?.triangles > 0 && browser.before?.aura?.metadata?.unsupportedExtensions?.length === 0 },
  { id: "paired-orbit-changes-pixels", pass: browser.after?.interaction?.applied === true && browser.after?.interaction?.auraChanged === true && browser.after?.interaction?.threeChanged === true },
  { id: "exact-captures-retained", pass: statSync(resolve("tests/reports/current-head-to-head/gltf-product-viewer/aura.png")).size > 10_000 && statSync(resolve("tests/reports/current-head-to-head/gltf-product-viewer/three.png")).size > 10_000 }
];
const failures = checks.filter((entry) => !entry.pass);
const report = { schema: "aura3d.current-head-to-head-gltf-product-viewer/1.0", generatedAt: new Date().toISOString(), pass: failures.length === 0, workload: "gltf-product-viewer", checks, failures, browser };
const output = resolve("tests/reports/current-head-to-head/gltf-product-viewer/aggregate.json"); mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) { console.error(`Product-viewer head-to-head UNPROVEN: ${failures.map((entry) => entry.id).join(", ")}`); process.exitCode = 1; } else console.log(`Product-viewer head-to-head PASS: ${checks.length}/${checks.length} checks; ${output}`);
