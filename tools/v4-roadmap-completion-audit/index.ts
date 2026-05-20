import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Obj = Record<string, unknown>;
interface Check { readonly id: string; readonly pass: boolean; readonly detail: string; }

const checks: Check[] = [];
const check = (id: string, pass: boolean, detail: string) => checks.push({ id, pass, detail });
const read = (path: string) => readFileSync(resolve(path), "utf8");
const json = (path: string): Obj | undefined => existsSync(resolve(path)) ? JSON.parse(read(path)) as Obj : undefined;

const releaseReadiness = json("tests/reports/v4-release-readiness.json");
const progress = json("tests/reports/v4-progress.json");
const claimRegistry = json("tests/reports/v4-claim-registry.json");
const externalConsumer = json("tests/reports/v4-external-consumer.json");
const visualQuality = json("tests/reports/v4-visual-quality.json");
const threejsParity = json("tests/reports/v4-threejs-visual-parity.json");
const performance = json("tests/reports/v4-performance-readiness.json");
const appSuite = json("tests/reports/v4-app-suite-readiness.json");
const progressDoc = read("docs/project/v4-roadmap-progress.md");
const blockedClaims = read("docs/project/v4-roadmap-blocked-claims.md");
const preFinalProgress = progress?.currentStatus === "in-progress"
  && progress?.activeMilestone === "Milestone 19 - Release Readiness"
  && Number(progress?.completedMilestoneCount ?? 0) >= 19
  && progressDoc.includes("- [ ] Milestone 19 - Release Readiness");
const finalProgress = progress?.currentStatus === "complete"
  && progress?.activeMilestone === "complete"
  && Number(progress?.completedMilestoneCount ?? 0) >= 20
  && progressDoc.includes("- [x] Milestone 19 - Release Readiness");

check("release-readiness", releaseReadiness?.pass === true, "Release readiness report must pass.");
check("progress-release-state", preFinalProgress || finalProgress, "Release command must run with Milestones 0-18 complete and Milestone 19 either active before final mark or complete after final mark.");
check("milestone-ledger", preFinalProgress || finalProgress, "Progress ledger must preserve all 20 V4 milestones and reflect the release state.");
check("external-consumer", externalConsumer?.ok === true && (externalConsumer as { readonly sourceImportsOnlyPublicRoot?: boolean }).sourceImportsOnlyPublicRoot === true, "External consumer must pass and import only public root APIs.");
check("visual-quality", visualQuality?.pass === true, "V4 visual-quality report must pass.");
check("performance", performance?.pass === true, "V4 performance readiness report must pass.");
check("app-suite", appSuite?.pass === true, "V4 Pro app suite readiness report must pass.");
check("threejs-parity", threejsParity?.pass === true, "Same-scene Three.js visual parity report must pass.");
check("claim-registry", claimRegistry?.pass === true, "Claim registry must pass.");
check(
  "blocked-claims-preserved",
  ["Broad Three.js replacement", "Full Three.js API replacement", "Unity replacement", "Unreal replacement", "Full game engine replacement"].every((phrase) => blockedClaims.includes(phrase)),
  "Blocked broad replacement claims must remain visible."
);
check(
  "human-review",
  existsSync(resolve("docs/project/v4-roadmap-human-visual-review.md")) && read("docs/project/v4-roadmap-human-visual-review.md").includes("No reviewed flagship scene is rejected as primitive test output"),
  "Human visual review must approve bounded flagship screenshot quality."
);

const pass = checks.every((entry) => entry.pass);
const report = {
  schema: "g3d-v4-completion-audit/v1",
  generatedAt: new Date().toISOString(),
  pass,
  summary: pass
    ? "V4 completion audit passed."
    : "V4 completion audit failed.",
  checks
};

mkdirSync(dirname(resolve("tests/reports/v4-completion-audit.json")), { recursive: true });
writeFileSync(resolve("tests/reports/v4-completion-audit.json"), `${JSON.stringify(report, null, 2)}\n`);
if (!pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(report, null, 2));
