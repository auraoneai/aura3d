import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

interface LegacyPath {
  readonly path: string;
  readonly reason: string;
  readonly allowedToReturn: boolean;
  readonly replacement: string;
}

const requiredFiles = [
  "docs/project/three-compat-roadmap-legacy-prune-ledger.md",
  "tools/three-compat-legacy-prune-readiness/index.ts"
] as const;

const legacyPaths: readonly LegacyPath[] = [
  { path: "examples/architecture-viewer/", reason: "Legacy architecture demo replaced by V5 architecture workflow/template track.", allowedToReturn: false, replacement: "examples/three-compat-examples/architecture-interior/" },
  { path: "examples/game-slice/", reason: "Legacy game slice is not a V5 product claim.", allowedToReturn: false, replacement: "none" },
  { path: "examples/portfolio/", reason: "Legacy static screenshot portfolio must not be release proof.", allowedToReturn: false, replacement: "tests/reports/three-compat-gallery/" },
  { path: "examples/postprocess-lab/", reason: "Legacy postprocess lab replaced by V5 postprocess pipeline and examples.", allowedToReturn: false, replacement: "examples/three-compat-examples/postprocess-bloom/" },
  { path: "examples/product-configurator/", reason: "Legacy product configurator replaced by versioned V5 workflow example.", allowedToReturn: false, replacement: "examples/three-compat-examples/product-configurator/" },
  { path: "examples/shadow-lab/", reason: "Legacy shadow lab replaced by V5 renderer/architecture evidence.", allowedToReturn: false, replacement: "examples/three-compat-examples/architecture-interior/" },
  { path: "examples/portfolio/screenshots/animation-state-machine.png", reason: "Static legacy screenshot.", allowedToReturn: false, replacement: "tests/reports/three-compat-gallery/character/character-animation.png" },
  { path: "examples/portfolio/screenshots/architecture-viewer.png", reason: "Static legacy screenshot.", allowedToReturn: false, replacement: "tests/reports/three-compat-gallery/architecture-day/interior-daylight.png" },
  { path: "examples/portfolio/screenshots/asset-viewer.png", reason: "Static legacy screenshot.", allowedToReturn: false, replacement: "tests/reports/three-compat-gallery/assets/asset-inspector.png" },
  { path: "examples/portfolio/screenshots/editor-authored-project.png", reason: "Static legacy screenshot.", allowedToReturn: false, replacement: "tests/reports/three-compat-gallery/threejs-migration/migrated-threejs-scene.png" },
  { path: "examples/portfolio/screenshots/game-slice.png", reason: "Static legacy screenshot.", allowedToReturn: false, replacement: "none" },
  { path: "examples/portfolio/screenshots/pbr-camera-comparison.png", reason: "Static legacy screenshot.", allowedToReturn: false, replacement: "tests/reports/three-compat-gallery/materials/material-library.png" },
  { path: "examples/portfolio/screenshots/pbr-material-lab.png", reason: "Static legacy screenshot.", allowedToReturn: false, replacement: "tests/reports/three-compat-gallery/materials/material-library.png" },
  { path: "examples/portfolio/screenshots/physics-sandbox.png", reason: "Static legacy screenshot.", allowedToReturn: false, replacement: "none" },
  { path: "examples/portfolio/screenshots/postprocess-lab.png", reason: "Static legacy screenshot.", allowedToReturn: false, replacement: "tests/reports/three-compat-gallery/postprocess/cinematic-postprocess.png" },
  { path: "examples/portfolio/screenshots/product-configurator.png", reason: "Static legacy screenshot.", allowedToReturn: false, replacement: "tests/reports/three-compat-gallery/product/premium-product-viewer.png" },
  { path: "examples/portfolio/screenshots/rendering-large-scene.png", reason: "Static legacy screenshot.", allowedToReturn: false, replacement: "tests/reports/three-compat-gallery/large-scene/large-instanced-scene.png" },
  { path: "examples/portfolio/screenshots/shadow-lab.png", reason: "Static legacy screenshot.", allowedToReturn: false, replacement: "tests/reports/three-compat-gallery/architecture-night/interior-night.png" },
  { path: "examples/portfolio/screenshots/showcase-world.png", reason: "Static legacy screenshot.", allowedToReturn: false, replacement: "tests/reports/three-compat-gallery/vfx/particle-vfx.png" }
] as const;

const ledger = existsSync(resolve("docs/project/three-compat-roadmap-legacy-prune-ledger.md"))
  ? readFileSync(resolve("docs/project/three-compat-roadmap-legacy-prune-ledger.md"), "utf8")
  : "";
const fileChecks = requiredFiles.map((path) => ({ id: `file:${path}`, pass: existsSync(resolve(path)), detail: `${path} must exist.` }));
const pathChecks = legacyPaths.map((entry) => {
  const exists = existsSync(resolve(entry.path));
  const pass = entry.allowedToReturn || !exists;
  return {
    id: `deleted:${entry.path}`,
    pass,
    path: entry.path,
    exists,
    allowedToReturn: entry.allowedToReturn,
    reason: entry.reason,
    replacement: entry.replacement,
    detail: pass ? `${entry.path} is correctly absent or explicitly allowed.` : `${entry.path} must remain deleted.`
  };
});
const ledgerChecks = legacyPaths.map((entry) => ({
  id: `ledger:${entry.path}`,
  pass: ledger.includes(entry.path) && ledger.includes(entry.reason.split(" ")[0] ?? ""),
  detail: `Legacy ledger must mention ${entry.path}.`
}));

const pass = [...fileChecks, ...pathChecks, ...ledgerChecks].every((entry) => entry.pass);
const report = {
  schema: "g3d-three-compat-legacy-prune-readiness/v1",
  generatedAt: new Date().toISOString(),
  pass,
  summary: pass
    ? "V5 legacy prune gate is ready; deleted demo-era files remain deleted."
    : "V5 legacy prune gate failed; deleted demo-era files returned or ledger is incomplete.",
  legacyPaths,
  checks: [...fileChecks, ...pathChecks, ...ledgerChecks]
};

mkdirSync(resolve("tests/reports"), { recursive: true });
writeFileSync(resolve("tests/reports/three-compat-legacy-prune-readiness.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!pass) process.exitCode = 1;

