import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const claims = [
  {
    id: "three-compat-broad-threejs-replacement-track",
    status: "target-not-yet-supported",
    claim: "A3D Three.js compatibility is targeting a broad Three.js replacement for documented mainstream browser 3D use cases.",
    evidence: ["docs/project/threejs-parity-status.md", "docs/project/known-limits.md", "docs/project/known-limits.md"]
  },
  {
    id: "full-threejs-api-parity",
    status: "blocked",
    claim: "A3D fully replaces the Three.js API.",
    evidence: ["docs/project/known-limits.md", "docs/project/known-limits.md"]
  },
  {
    id: "unity-unreal-replacement",
    status: "blocked",
    claim: "A3D replaces Unity or Unreal.",
    evidence: ["docs/project/known-limits.md", "docs/project/known-limits.md"]
  }
] as const;

const checks = claims.flatMap((claim) => claim.evidence.map((path) => ({
  id: `${claim.id}:${path}`,
  pass: existsSync(resolve(path)),
  detail: `${claim.id} evidence must exist: ${path}`
})));
const blockedDocs = ["docs/project/known-limits.md", "docs/project/known-limits.md"]
  .map((path) => existsSync(resolve(path)) ? readFileSync(resolve(path), "utf8").toLowerCase() : "")
  .join("\n");
checks.push({
  id: "blocked-claims-preserved",
  pass: ["full three.js api replacement", "unity replacement", "unreal replacement", "full webgpu parity"].every((phrase) => blockedDocs.includes(phrase)),
  detail: "Blocked broad replacement claims must remain visible in Three.js compatibility docs."
});

const pass = checks.every((entry) => entry.pass);
const report = {
  schema: "a3d-three-compat-claim-registry",
  generatedAt: new Date().toISOString(),
  pass,
  claims,
  checks
};

mkdirSync(resolve("tests/reports"), { recursive: true });
writeFileSync(resolve("tests/reports/three-compat-claim-registry.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!pass) process.exitCode = 1;

