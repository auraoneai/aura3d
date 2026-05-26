import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const allowedAppDirs = new Set([
  "advanced-examples-gallery",
  "wow-common",
  "wow-tokyo-keyframes",
  "wow-kira-ik-room",
  "wow-neon-city",
  "wow-orbital-fleet",
  "wow-crystal-cavern",
  "wow-robot-parade",
  "wow-particle-vortex",
  "wow-ocean-temple",
  "wow-physics-arena",
  "wow-material-cathedral",
  "wow-astral-garden",
  "wow-quantum-stage",
]);

const appDirs = existsSync(resolve("apps"))
  ? readdirSync(resolve("apps"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
  : [];
const unexpectedAppDirs = appDirs.filter((dir) => !allowedAppDirs.has(dir));
const checks = [
  {
    id: "examples-root-absent",
    pass: !existsSync(resolve("examples")),
    detail: "The legacy examples/ root must remain absent.",
  },
  {
    id: "apps-allowlist-only",
    pass: unexpectedAppDirs.length === 0,
    detail: unexpectedAppDirs.length === 0 ? "apps/ contains only the approved local route surface." : unexpectedAppDirs.join(", "),
  },
];

const pass = checks.every((entry) => entry.pass);
const report = {
  schema: "a3d-three-compat-legacy-prune-readiness",
  generatedAt: new Date().toISOString(),
  pass,
  allowedAppDirs: [...allowedAppDirs].sort(),
  checks,
};

mkdirSync(resolve("tests/reports"), { recursive: true });
writeFileSync(resolve("tests/reports/three-compat-legacy-prune-readiness.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!pass) process.exitCode = 1;
