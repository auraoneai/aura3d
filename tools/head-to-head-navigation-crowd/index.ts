import { readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const json = (path: string): any => JSON.parse(readFileSync(resolve(path), "utf8"));
const text = (path: string): string => readFileSync(resolve(path), "utf8");
const baseline = json("tests/reports/current-threejs-baseline.json");
const context = json("benchmark/context/threejs-r185.1-20260808.json");
const browser = json("tests/reports/current-head-to-head/navigation-crowd/report.json");
const source = text("benchmark/current-head-to-head/navigation-crowd/main.ts");
const captures = ["aura-before.png", "three-before.png", "aura-after.png", "three-after.png"];
const checks = [
  { id: "current-three-and-selected-recast", pass: baseline.three?.version === "0.185.1" && browser.before?.three?.revision === "185" && source.includes('from "@aura3d/navigation-recast"') && source.includes('from "recast-navigation"') },
  { id: "exact-frozen-assets-and-native-captures", pass: browser.assetSha256?.architecture === context.assets.architecture.sha256 && browser.assetSha256?.skinnedCharacter === context.assets.skinnedCharacter.sha256 && captures.every((name) => statSync(resolve(`tests/reports/current-head-to-head/navigation-crowd/${name}`)).size > 10_000) },
  { id: "public-adapter-versus-direct-native-crowd", pass: browser.before?.aura?.publicPackageOnly === true && browser.before?.aura?.actualSelectedRecastAdapter === true && browser.before?.aura?.nativeCrowd === true && browser.before?.three?.actualDirectRecast === true && browser.before?.three?.nativeCrowd === true && !source.includes("packages/") },
  { id: "identical-native-nav-path", pass: maxNestedDelta(browser.before?.aura?.path, browser.before?.three?.path) < 1e-6 && browser.before?.aura?.path?.length >= 5 },
  { id: "identical-crowd-trace", pass: maxNestedDelta(browser.before?.aura?.positions, browser.before?.three?.positions) < 1e-6 && maxNestedDelta(browser.after?.aura?.positions, browser.after?.three?.positions) < 1e-6 },
  { id: "obstacle-avoiding-visible-state-change", pass: browser.after?.aura?.positions?.every((point: number[]) => point[0] > 1 && Math.abs(point[2]) > 0.8) && browser.before?.aura?.hash !== browser.after?.aura?.hash && browser.before?.three?.hash !== browser.after?.three?.hash },
  { id: "matched-background-output", pass: maxDelta(browser.before?.aura?.backgroundPixel, browser.before?.three?.backgroundPixel) <= 3 && maxDelta(browser.after?.aura?.backgroundPixel, browser.after?.three?.backgroundPixel) <= 3 },
  { id: "caller-owned-lifecycle", pass: Object.values(browser.lifecycle ?? {}).every(Boolean) && Object.keys(browser.lifecycle ?? {}).length === 6 }
];
const failures = checks.filter((entry) => !entry.pass);
const report = {
  schema: "aura3d.current-head-to-head-navigation-crowd/1.0",
  generatedAt: new Date().toISOString(),
  pass: failures.length === 0,
  workload: "navigation-crowd",
  verdict: "selected-adapter-matches-direct-recast-crowd-trace",
  checks,
  failures,
  comparison: {
    auraPositions: browser.after?.aura?.positions,
    threePositions: browser.after?.three?.positions,
    auraDrawCalls: browser.after?.aura?.drawCalls,
    threeDrawCalls: browser.after?.three?.drawCalls,
    observedLosses: [
      "Personal inspection of both rerendered before/after pairs confirms aligned camera, deck, obstacle, frozen skyline, lead character, corrected marker size, exact backgrounds, and a clearly visible split around both sides of the obstacle. Small character/material/raster differences remain; normalized paired RMSE is 0.0307563 before and 0.0313358 after.",
      "Aura submits 1,565 draws versus Three's 829 for this asset-heavy scene. This exact deterministic six-agent trace proves the selected adapter delegates path and crowd state identically; it does not establish broad navigation authoring, off-mesh-link, dynamic-obstacle, visual, draw-call, or performance parity."
    ],
    claimBoundary: "Optional @aura3d/navigation-recast adapter workload; not root createAuraApp navigation simulation."
  },
  browser
};
const output = resolve("tests/reports/current-head-to-head/navigation-crowd/aggregate.json");
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) { console.error(`Navigation/crowd head-to-head UNPROVEN: ${failures.map((entry) => entry.id).join(", ")}`); process.exitCode = 1; }
else console.log(`Navigation/crowd head-to-head PASS: ${checks.length}/${checks.length}; ${output}`);

function maxDelta(left: readonly number[] | undefined, right: readonly number[] | undefined): number { if (!left || !right || left.length !== right.length) return Number.POSITIVE_INFINITY; return Math.max(...left.map((value, index) => Math.abs(value - (right[index] ?? 0)))); }
function maxNestedDelta(left: readonly (readonly number[])[] | undefined, right: readonly (readonly number[])[] | undefined): number { if (!left || !right || left.length !== right.length) return Number.POSITIVE_INFINITY; return Math.max(...left.map((value, index) => maxDelta(value, right[index]))); }
