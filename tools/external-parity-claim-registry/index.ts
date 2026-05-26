import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const claims = [
  {
    id: "supported-workflow-competitor",
    status: "conditional-until-release",
    claim: "A3D is a high-quality Three.js competitor for supported External parity workflows.",
    evidence: [
      "tests/reports/external-parity-threejs-visual-parity.json",
      "tests/reports/external-parity-external-consumer.json"
    ]
  },
  {
    id: "installable-sdk",
    status: "supported",
    claim: "A packed @aura3d/engine package can be installed into a fresh Vite app and render through public APIs.",
    evidence: [
      "tests/reports/external-parity-package-smoke.json",
      "tests/reports/external-parity-external-consumer.json"
    ]
  },
  {
    id: "broad-threejs-replacement",
    status: "blocked",
    claim: "A3D is a broad Three.js replacement.",
    evidence: ["docs/project/claim-guidelines.md", "docs/project/known-limits.md"]
  },
  {
    id: "unity-unreal-replacement",
    status: "blocked",
    claim: "A3D replaces Unity or Unreal.",
    evidence: ["docs/project/claim-guidelines.md", "docs/project/known-limits.md"]
  }
] as const;

const checks = claims.flatMap((claim) => claim.evidence.map((path) => ({
  id: `${claim.id}:${path}`,
  pass: existsSync(resolve(path)),
  detail: `${claim.id} evidence must exist: ${path}`
})));

const blockedClaims = read("docs/project/claim-guidelines.md");
const knownGaps = read("docs/project/known-limits.md");
checks.push({
  id: "blocked-claims-preserved",
  pass: ["Broad Three.js replacement", "Unity replacement", "Unreal replacement", "Full game engine replacement"].every((phrase) => blockedClaims.includes(phrase) && knownGaps.includes(phrase)),
  detail: "Blocked broad replacement claims must remain blocked in blocked-claims and known-gaps docs."
});

const pass = checks.every((entry) => entry.pass);
const report = {
  schema: "a3d-external-parity-claim-registry",
  generatedAt: new Date().toISOString(),
  pass,
  claims,
  checks
};

mkdirSync(dirname(resolve("tests/reports/external-parity-claim-registry.json")), { recursive: true });
writeFileSync(resolve("tests/reports/external-parity-claim-registry.json"), `${JSON.stringify(report, null, 2)}\n`);
if (!pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(report, null, 2));

function read(path: string): string {
  return existsSync(resolve(path)) ? readFileSync(resolve(path), "utf8") : "";
}
