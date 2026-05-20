import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const claims = [
  {
    id: "v5-broad-threejs-replacement-track",
    status: "target-not-yet-supported",
    claim: "G3D V5 is targeting a broad Three.js replacement for documented mainstream browser 3D use cases.",
    evidence: ["docs/project/v5-roadmap-visual-engine-plan.md", "docs/project/v5-roadmap-known-gaps.md", "docs/project/v5-roadmap-blocked-claims.md"]
  },
  {
    id: "full-threejs-api-parity",
    status: "blocked",
    claim: "G3D fully replaces the Three.js API.",
    evidence: ["docs/project/v5-roadmap-blocked-claims.md", "docs/project/v5-roadmap-known-gaps.md"]
  },
  {
    id: "unity-unreal-replacement",
    status: "blocked",
    claim: "G3D replaces Unity or Unreal.",
    evidence: ["docs/project/v5-roadmap-blocked-claims.md", "docs/project/v5-roadmap-known-gaps.md"]
  }
] as const;

const checks = claims.flatMap((claim) => claim.evidence.map((path) => ({
  id: `${claim.id}:${path}`,
  pass: existsSync(resolve(path)),
  detail: `${claim.id} evidence must exist: ${path}`
})));
const blockedDocs = ["docs/project/v5-roadmap-blocked-claims.md", "docs/project/v5-roadmap-known-gaps.md"]
  .map((path) => existsSync(resolve(path)) ? readFileSync(resolve(path), "utf8").toLowerCase() : "")
  .join("\n");
checks.push({
  id: "blocked-claims-preserved",
  pass: ["full three.js api replacement", "unity replacement", "unreal replacement", "full webgpu parity"].every((phrase) => blockedDocs.includes(phrase)),
  detail: "Blocked broad replacement claims must remain visible in V5 docs."
});

const pass = checks.every((entry) => entry.pass);
const report = {
  schema: "g3d-v5-claim-registry/v1",
  generatedAt: new Date().toISOString(),
  pass,
  claims,
  checks
};

mkdirSync(resolve("tests/reports"), { recursive: true });
writeFileSync(resolve("tests/reports/v5-claim-registry.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!pass) process.exitCode = 1;

