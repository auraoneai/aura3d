import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const allowedAppDirs = new Set([
  "advanced-examples-gallery",
  "wow-common",
  "wow-tokyo-keyframes",
  "wow-robot-expressive-rig",
  "wow-concept-car-cinema",
  "wow-damaged-helmet-pbr-detail",
  "wow-antique-camera-viewer",
  "wow-duck-prop-studio",
  "wow-cesium-milk-truck-viewer",
  "wow-soldier-animation-viewer",
  "wow-boombox-texture-lab",
  "wow-avocado-pbr-study",
  "wow-clearcoat-material-sample",
  "wow-sheen-material-grid",
  "wow-standard-animated-cube",
  "wow-standard-product-camera",
  "wow-standard-material-spheres",
  "wow-simple-triangle",
  "wow-simple-transforms",
  "wow-simple-material-lighting",
  "wow-simple-points-lines",
  "wow-additional-variant-product",
  "wow-additional-transmission-sample",
  "wow-additional-cesium-man-animation",
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
