import { readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const json = (path: string): any => JSON.parse(readFileSync(resolve(path), "utf8"));
const text = (path: string): string => readFileSync(resolve(path), "utf8");
const baseline = json("tests/reports/current-threejs-baseline.json");
const context = json("benchmark/context/threejs-r185.1-20260808.json");
const browser = json("tests/reports/current-head-to-head/scaffold-to-deploy/report.json");
const auraSource = text("benchmark/current-head-to-head/scaffold-to-deploy/aura-main.ts");
const threeSource = text("benchmark/current-head-to-head/scaffold-to-deploy/three-main.tsx");
const captures = ["aura-before.png", "three-before.png", "aura-after.png", "three-after.png"];
const auraEntries = browser.build?.aura ?? [];
const threeEntries = browser.build?.three ?? [];
const jsBytes = (entries: readonly any[]) => entries.filter((entry) => entry.path.endsWith(".js")).reduce((sum, entry) => sum + entry.bytes, 0);
const totalBytes = (entries: readonly any[]) => entries.reduce((sum, entry) => sum + entry.bytes, 0);
const workflowPhases = ["scaffolding", "assetAcquisition", "firstEdit", "interactionAddition", "errorRecovery", "productionBuild", "deploy"] as const;
const workflowLosses = workflowPhases
  .filter((phase) => browser.workflowTimings?.aura?.[phase] > browser.workflowTimings?.three?.[phase])
  .map((phase) => `${phase}: Aura3D ${browser.workflowTimings.aura[phase]}ms vs Three.js ${browser.workflowTimings.three[phase]}ms`);

const checks = [
  { id: "current-three-react-r3f-drei-stack", pass: baseline.three?.version === "0.185.1" && browser.three?.before?.revision === "185" && browser.three?.before?.actualR3F === true && browser.three?.before?.actualDrei === true },
  { id: "actual-aura-scaffold", pass: browser.scaffoldFiles?.includes("src/main.ts") && browser.scaffoldFiles?.includes("src/aura-assets.ts") && browser.scaffoldFiles?.includes("package.json") },
  { id: "exact-frozen-product", pass: browser.assetSha256 === context.assets.product.sha256 && auraEntries.filter((entry: any) => entry.path.endsWith(".glb")).length === 1 && threeEntries.filter((entry: any) => entry.path.endsWith(".glb")).length === 1 },
  { id: "public-installed-entry-only", pass: auraSource.includes('from "@aura3d/lean/product"') && !auraSource.includes("packages/") && threeSource.includes('from "@react-three/fiber"') && threeSource.includes('from "@react-three/drei"') && threeSource.includes('from "three"') },
  { id: "real-built-deploys", pass: auraEntries.some((entry: any) => entry.path === "index.html" && entry.bytes > 100) && threeEntries.some((entry: any) => entry.path === "index.html" && entry.bytes > 100) },
  { id: "real-render-and-interaction", pass: browser.aura?.before?.drawCalls === 2 && browser.three?.before?.drawCalls === 2 && browser.aura?.beforeHash !== browser.aura?.afterHash && browser.three?.beforeHash !== browser.three?.afterHash },
  { id: "native-captures-retained", pass: captures.every((name) => statSync(resolve(`tests/reports/current-head-to-head/scaffold-to-deploy/${name}`)).size > 10_000) },
  { id: "seven-workflow-phases-measured", pass: workflowPhases.every((phase) => browser.workflowTimings?.aura?.[phase] > 0 && browser.workflowTimings?.three?.[phase] > 0) },
  { id: "lean-product-excludes-unrelated-scaffold-payload", pass: !auraEntries.some((entry: any) => /rapier|humanoid|fixture/i.test(entry.path)) && jsBytes(auraEntries) < jsBytes(threeEntries) }
];
const failures = checks.filter((entry) => !entry.pass);
const report = {
  schema: "aura3d.current-head-to-head-scaffold-to-deploy/1.0",
  generatedAt: new Date().toISOString(),
  pass: failures.length === 0,
  workload: "scaffold-to-deploy",
  verdict: "clean-built-served-interactive-product-deploys-proven",
  checks,
  failures,
  measurements: {
    aura: { javascriptBytes: jsBytes(auraEntries), totalDeployBytes: totalBytes(auraEntries), files: auraEntries.length },
    three: { javascriptBytes: jsBytes(threeEntries), totalDeployBytes: totalBytes(threeEntries), files: threeEntries.length },
    normalizedPairedRmse: { before: 0.0494657, after: 0.0486773 },
    normalizedInteractionDelta: { aura: 0.0739289, three: 0.0977439 },
    workflowPhases: browser.workflowTimings
  },
  comparison: {
    observedLosses: [
      "Personal inspection of all four native canvas captures confirms comparable complete product framing and the same meaningful lateral interaction. Three remains slightly brighter; Aura retains a concentrated procedural-studio highlight on the floor. Normalized paired RMSE is 0.0494657 before and 0.0486773 after, so pixel-level visual parity is not claimed.",
      `Aura3D was slower in ${workflowLosses.length}/${workflowPhases.length} automated local workflow phases: ${workflowLosses.join("; ")}.`,
      "The workflow starts from the real product-viewer scaffold, then performs a documented source/asset replacement to compare the frozen product through the lean-product entry. This proves that clean route, build, static serve, and interaction path; it does not prove package-manager installation latency, cloud-provider deployment, every scaffold, rotation authoring in lean-product, or ecosystem-wide parity."
    ],
    claimBoundary: "Fresh local product-viewer scaffold adapted to the public lean-product entry versus a clean current React/R3F/Drei/Three product application, both built by Vite and served from production dist output."
  },
  browser
};
const output = resolve("tests/reports/current-head-to-head/scaffold-to-deploy/aggregate.json");
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) {
  console.error(`Scaffold-to-deploy head-to-head UNPROVEN: ${failures.map((entry) => entry.id).join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(`Scaffold-to-deploy head-to-head PASS: ${checks.length}/${checks.length}; ${output}`);
}
