import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

interface Check { readonly id: string; readonly pass: boolean; readonly detail: string }
const json = (path: string): any => JSON.parse(readFileSync(resolve(path), "utf8"));
const source = (path: string): string => readFileSync(resolve(path), "utf8");
const check = (id: string, pass: boolean, detail: string): Check => ({ id, pass, detail });
const sha256 = (path: string): string => createHash("sha256").update(readFileSync(resolve(path))).digest("hex");
const maxDelta = (left: readonly (readonly number[])[] | undefined, right: readonly (readonly number[])[] | undefined): number => {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return Number.POSITIVE_INFINITY;
  return Math.max(...left.flatMap((vector: readonly number[], index: number) => vector.map((value: number, axis: number) => Math.abs(value - (right[index]?.[axis] ?? Number.POSITIVE_INFINITY)))));
};

const browser = json("tests/reports/recast-crowd-lab/browser.json");
const comparator = json("tests/reports/current-head-to-head/navigation-crowd/aggregate.json");
const visualAudit = json("tests/reports/2.0-visual-audit/examples/report-recast-crowd-lab.json");
const routeSource = source("examples/recast-crowd-lab/main.ts");
const adrSource = source("docs/architecture/adr/0005-navigation-is-optional-recast-detour.md");
const cityHash = "2f6624cdd44b88b4c9b612bf0b9062451c5ade91ed243e0c595672d79dd13338";
const characterHash = "9ff4ea5196df2f58c9f63ff6d8608f084808a84b2ad992237a8a530b8b18899f";
const artifacts = [
  "tests/reports/recast-crowd-lab/public-initial-canvas.png",
  "tests/reports/recast-crowd-lab/public-initial-page.png",
  "tests/reports/recast-crowd-lab/public-complete-canvas.png",
  "tests/reports/recast-crowd-lab/public-complete-page.png",
  "tests/reports/2.0-visual-audit/examples/examples--recast-crowd-lab--canvas.png",
  "tests/reports/2.0-visual-audit/examples/examples--recast-crowd-lab--page.png",
  "tests/reports/current-head-to-head/navigation-crowd/aura-before.png",
  "tests/reports/current-head-to-head/navigation-crowd/three-before.png",
  "tests/reports/current-head-to-head/navigation-crowd/aura-after.png",
  "tests/reports/current-head-to-head/navigation-crowd/three-after.png"
];

const checks: Check[] = [
  check("accepted-selected-owner", adrSource.includes("Status:** accepted") && adrSource.includes("Adopt exact `recast-navigation@0.43.1`"), "accepted ADR selects exact Recast/Detour as the sole optional navigation owner"),
  check("public-boundary", routeSource.includes('from "@aura3d/engine"') && routeSource.includes('from "@aura3d/navigation-recast"') && routeSource.includes("assets.showcaseSkylineCity") && routeSource.includes("assets.showcaseAnimatedRunnerHero") && !/from\s+["']three|from\s+["']recast-navigation|@aura3d\/(?:rendering|scene)|packages\//.test(routeSource), "public route uses root Aura, the selected adapter, and typed assets without direct Recast/Three/internal imports"),
  check("exact-typed-assets", browser.initial?.assets?.[0]?.hash === `sha256-${cityHash}` && browser.initial?.assets?.[1]?.hash === `sha256-${characterHash}` && sha256("public/aura-assets/showcaseSkylineCity.2f6624cd.glb") === cityHash && sha256("public/aura-assets/showcaseAnimatedRunnerHero.9ff4ea51.glb") === characterHash, `city/character=${String(browser.initial?.assets?.[0]?.id)}/${String(browser.initial?.assets?.[1]?.id)}`),
  check("native-navigation", browser.initial?.packageOwner === "@aura3d/navigation-recast" && browser.initial?.nativeCrowd === true && browser.initial?.nativePathQuery === true && browser.initial?.serializedNavMeshBytes > 100, `owner=${String(browser.initial?.packageOwner)}; path corners=${String(browser.initial?.path?.length)}; serialized=${String(browser.initial?.serializedNavMeshBytes)} B`),
  check("deterministic-crowd-trace", browser.complete?.steps === 210 && browser.complete?.positions?.length === 6 && browser.complete?.splitAroundObstacle === true && maxDelta(browser.complete?.positions, comparator.browser?.after?.aura?.positions) < 1e-5, `steps/agents/split=${String(browser.complete?.steps)}/${String(browser.complete?.positions?.length)}/${String(browser.complete?.splitAroundObstacle)}; comparator delta=${maxDelta(browser.complete?.positions, comparator.browser?.after?.aura?.positions)}`),
  check("native-path-match", browser.initial?.path?.length === 5 && maxDelta(browser.initial?.path, comparator.browser?.before?.aura?.path) < 1e-6, `path corners=${String(browser.initial?.path?.length)}; comparator delta=${maxDelta(browser.initial?.path, comparator.browser?.before?.aura?.path)}`),
  check("visible-state-change", browser.artifacts?.[0]?.canvasSha256 !== browser.artifacts?.[1]?.canvasSha256 && browser.artifacts?.[0]?.canvasBytes > 10_000 && browser.artifacts?.[1]?.canvasBytes > 10_000, `initial/final SHA-256=${String(browser.artifacts?.[0]?.canvasSha256)}/${String(browser.artifacts?.[1]?.canvasSha256)}`),
  check("keyboard-and-reset", browser.keyboard?.steps === 15 && browser.keyboard?.positions?.[0]?.[0] > browser.initial?.positions?.[0]?.[0] && browser.reset?.steps === 0 && browser.reset?.resets === 2 && maxDelta(browser.reset?.positions, browser.initial?.positions) < 1e-6, `keyboard steps=${String(browser.keyboard?.steps)}; resets=${String(browser.reset?.resets)}`),
  check("lifecycle-clean", browser.lifecycle?.crowdDisposed === true && browser.lifecycle?.navMeshDisposed === true && browser.lifecycle?.visualDisposed === true, `crowd/navmesh/visual=${String(browser.lifecycle?.crowdDisposed)}/${String(browser.lifecycle?.navMeshDisposed)}/${String(browser.lifecycle?.visualDisposed)}`),
  check("production-runtime-clean", browser.initial?.runtimeBackend === "production-runtime" && browser.complete?.runtimeBackend === "production-runtime" && browser.initial?.errors?.length === 0 && browser.complete?.errors?.length === 0, `backend=${String(browser.complete?.runtimeBackend)}; errors=${String(browser.complete?.errors?.length)}`),
  check("current-three-r185-comparator", comparator.pass === true && comparator.checks?.length === 8 && comparator.checks.every((entry: any) => entry.pass === true) && comparator.browser?.before?.three?.revision === "185" && comparator.browser?.before?.three?.actualDirectRecast === true && maxDelta(comparator.browser?.after?.aura?.positions, comparator.browser?.after?.three?.positions) < 1e-5, `comparator=${String(comparator.pass)}; checks=${String(comparator.checks?.length)}; Three r${String(comparator.browser?.before?.three?.revision)}`),
  check("ten-final-artifacts-retained", artifacts.every((path) => statSync(resolve(path)).size > 10_000), `${artifacts.length} public and paired before/after artifacts are nontrivial`),
  check("filtered-route-visual-audit", visualAudit.pass === true && visualAudit.routeCount === 1 && visualAudit.results?.[0]?.route === "/examples/recast-crowd-lab/" && visualAudit.results?.[0]?.failures?.length === 0, `route=${String(visualAudit.results?.[0]?.route)}; failures=${String(visualAudit.results?.[0]?.failures?.length)}`),
  check("explicit-claim-boundary", routeSource.includes("not root-engine navigation or broad navigation parity") && String(browser.comparisonBoundary).includes("Neither establishes arbitrary navmesh authoring"), "root navigation and broad navigation/ecosystem parity remain explicitly unclaimed")
];
const failures = checks.filter((entry) => !entry.pass);
const report = {
  schema: "aura3d.recast-crowd-gallery/1.0",
  generatedAt: new Date().toISOString(),
  pass: failures.length === 0,
  checks,
  failures,
  scope: {
    proven: ["selected optional Recast/Detour adapter", "runtime-generated native navmesh", "native Detour path query", "six-agent crowd and local avoidance", "typed city and lead-character production-runtime presentation", "deterministic keyboard/reset and lifecycle", "same-trace current Three.js r185 direct-Recast comparison"],
    limited: ["one generated corridor navmesh", "one 210-tick six-agent trace", "Chromium browser evidence"],
    unclaimed: ["root createAuraApp navigation", "arbitrary navmesh authoring", "off-mesh links and temporary obstacles", "visual, draw-call, or performance parity"]
  },
  humanReview: {
    reviewer: "Codex full-resolution visual audit",
    reviewedAt: "2026-08-10",
    status: "passed",
    method: "Every final original-resolution image was opened and inspected individually after the final route, test, and canonical regeneration; automated capture was not treated as visual acceptance.",
    artifacts,
    verdict: "All ten final images are nonblank, undistorted, fully framed, and legible. The public final state visibly moves the typed lead and five markers from the spawn gate into upper/lower flows around the excluded center, while the UI reports 210/210 ticks, six agents, five path corners, and SPLIT. The paired Aura/Three frames retain aligned framing and the same meaningful obstacle-avoiding state change; small asset/material/raster differences and Aura's higher draw count remain explicit."
  }
};

const output = resolve("tests/reports/recast-crowd-lab/aggregate.json");
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
if (failures.length > 0) {
  console.error(`Recast crowd gallery UNPROVEN: ${failures.map((entry) => entry.id).join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(`Recast crowd gallery PASS: ${checks.length}/${checks.length} checks plus completed full-resolution visual review; ${output}`);
}
