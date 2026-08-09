import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const json = (path: string): any => JSON.parse(readFileSync(resolve(path), "utf8"));
const source = readFileSync(resolve("benchmark/current-head-to-head/primitive-scene/main.ts"), "utf8");
const baseline = json("tests/reports/current-threejs-baseline.json");
const context = json("benchmark/context/threejs-r185.1-20260808.json");
const browser = json("tests/reports/current-head-to-head/primitive-scene/report.json");
const checks = [
  { id: "current-three-r185", pass: baseline.pass === true && baseline.three?.version === "0.185.1" && browser.three?.revision === "185" },
  { id: "frozen-contract", pass: browser.contract?.viewport?.width === context.commonRenderContract.viewport.width && browser.contract?.viewport?.height === context.commonRenderContract.viewport.height && browser.contract?.viewport?.dpr === context.commonRenderContract.devicePixelRatio && browser.contract?.camera?.fovYDegrees === context.commonRenderContract.camera.fovYDegrees && JSON.stringify(browser.contract?.camera?.position) === JSON.stringify(context.commonRenderContract.camera.position) && JSON.stringify(browser.contract?.camera?.target) === JSON.stringify(context.commonRenderContract.camera.target) },
  { id: "actual-public-engines", pass: source.includes('from "@aura3d/rendering"') && source.includes('from "three"') && !source.includes("packages/rendering/src") && browser.aura?.publicPackageOnly === true && browser.three?.actualRenderer === true },
  { id: "meaningful-output", pass: browser.aura?.drawCalls === 3 && browser.three?.drawCalls === 3 && browser.aura?.litPixels > 25_000 && browser.three?.litPixels > 25_000 }
];
const failures = checks.filter((entry) => !entry.pass);
const report = { schema: "aura3d.current-head-to-head-primitive/1.0", generatedAt: new Date().toISOString(), pass: failures.length === 0, workload: "primitive-scene", checks, failures, browser };
const output = resolve("tests/reports/current-head-to-head/primitive-scene/aggregate.json");
mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) { console.error(`Primitive head-to-head UNPROVEN: ${failures.map((entry) => entry.id).join(", ")}`); process.exitCode = 1; }
else console.log(`Primitive head-to-head PASS: ${checks.length}/${checks.length} checks; ${output}`);
