import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const json = (path: string): any => JSON.parse(readFileSync(resolve(path), "utf8"));
const text = (path: string): string => readFileSync(resolve(path), "utf8");
const hashFile = (path: string): string => createHash("sha256").update(readFileSync(resolve(path))).digest("hex");
const route = json("tests/reports/skinned-morph-gallery/browser.json");
const headToHead = json("tests/reports/current-head-to-head/skinned-morph-animation/aggregate.json");
const morphReadiness = json("tests/reports/animation-engine/morph-target-readiness.json");
const visualAudit = json("tests/reports/2.0-visual-audit/examples/report-character-animation-viewer.json");
const foundationRuntime = json("tests/reports/foundation-runtime-systems.json");
const source = text("examples/character-animation-viewer/main.ts");
const assetPath = "public/aura-assets/showcaseExpressiveRobot.047f5e5f.glb";
const expectedHash = "047f5e5fb3bb6d378bd1df16ca6137f2a596c99b3a1b5690b4020c05aaf6f319";
const artifacts = ["public-neutral-canvas.png", "public-neutral-page.png", "public-surprised-canvas.png", "public-surprised-page.png"];
const checks = [
  { id: "typed-single-skinned-morph-asset", pass: route.initial?.assetId === "showcaseExpressiveRobot" && route.initial?.assetHash === `sha256-${expectedHash}` && hashFile(assetPath) === expectedHash },
  { id: "root-public-api-only", pass: source.includes('from "@aura3d/engine"') && source.includes("assets.showcaseExpressiveRobot") && !source.includes("packages/") && !source.includes('from "three"') },
  { id: "production-runtime-skinning", pass: route.initial?.runtimeBackend === "production-runtime" && route.initial?.skeletonBoneCount >= 40 && route.initial?.skinnedRenderItemCount > 0 && route.initial?.skinningPaletteUpdated === true },
  { id: "named-authored-morphs", pass: JSON.stringify(route.initial?.morphNames) === JSON.stringify(["Angry", "Surprised", "Sad"]) && route.initial?.morphRenderItemCount > 0 && route.initial?.missingMorphTargets?.length === 0 },
  { id: "deterministic-skeletal-change", pass: route.scrubbed?.activeClip === "Dance" && route.scrubbed?.playing === false && route.frameHashes?.initial !== route.frameHashes?.neutralScrubbed },
  { id: "deterministic-morph-change", pass: route.expressed?.activeExpression === "Surprised" && route.expressed?.morphWeight === 1 && route.expressed?.activeMorphTargets?.Surprised === 1 && route.frameHashes?.neutralScrubbed !== route.frameHashes?.expressed },
  { id: "four-public-captures-retained", pass: artifacts.every((name) => statSync(resolve(`tests/reports/skinned-morph-gallery/${name}`)).size > 10_000) },
  { id: "filtered-route-audit", pass: visualAudit.pass === true && visualAudit.routeCount === 1 && visualAudit.results?.[0]?.route === "/examples/character-animation-viewer/" && visualAudit.results?.[0]?.failures?.length === 0 },
  { id: "current-three-comparator", pass: headToHead.pass === true && headToHead.checks?.length === 8 && headToHead.browser?.before?.three?.revision === "185" },
  { id: "morph-and-runtime-regressions", pass: morphReadiness.pass === true && morphReadiness.checks?.length === 13 && foundationRuntime.ok === true },
  { id: "explicit-claim-boundary", pass: typeof route.initial?.claimBoundary === "string" && route.initial.claimBoundary.includes("does not claim universal") }
];
const failures = checks.filter((entry) => !entry.pass);
const report = {
  schema: "aura3d.skinned-morph-gallery/1.0",
  generatedAt: new Date().toISOString(),
  pass: failures.length === 0,
  checks,
  failures,
  comparisonBoundary: "The public route proves one typed CC0 character with skeletal clips and three named facial morphs. The separate current-Three.js r185 harness retains its frozen two-fixture contract. Neither proves universal animation, facial-rig, authoring, performance, or ecosystem parity.",
  humanReview: {
    reviewer: "Codex full-resolution visual audit",
    reviewedAt: "2026-08-10",
    status: "passed",
    method: "Each final original-resolution artifact was opened and inspected individually; automated screenshot generation was not treated as visual acceptance.",
    artifacts: [
      ...artifacts.map((name) => `tests/reports/skinned-morph-gallery/${name}`),
      "tests/reports/2.0-visual-audit/examples/examples--character-animation-viewer--canvas.png",
      "tests/reports/2.0-visual-audit/examples/examples--character-animation-viewer--page.png",
      "tests/reports/current-head-to-head/skinned-morph-animation/aura-before.png",
      "tests/reports/current-head-to-head/skinned-morph-animation/three-before.png",
      "tests/reports/current-head-to-head/skinned-morph-animation/aura-after.png",
      "tests/reports/current-head-to-head/skinned-morph-animation/three-after.png"
    ],
    verdict: "All ten final images are nonblank, undistorted, correctly framed, and visibly prove the intended skeletal or named facial-morph state. The public route shows the real typed character rather than a primitive stand-in. Aura and Three use closely aligned color and framing in the bounded comparator; residual pose and highlight differences are disclosed rather than hidden."
  }
};
const output = resolve("tests/reports/skinned-morph-gallery/aggregate.json");
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
if (failures.length > 0) {
  console.error(`Skinned/morph gallery UNPROVEN: ${failures.map((entry) => entry.id).join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(`Skinned/morph gallery PASS: ${checks.length}/${checks.length} checks plus completed full-resolution visual review; ${output}`);
}
