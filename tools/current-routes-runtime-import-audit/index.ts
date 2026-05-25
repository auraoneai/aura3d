import { mkdirSync, readdirSync, readFileSync, writeFileSync, type Dirent } from "node:fs";
import { dirname, extname, join, relative } from "node:path";

interface Finding {
  readonly file: string;
  readonly line: number;
  readonly match: string;
}

const roots = [
  "packages/rendering/src",
  "packages/assets/src",
  "packages/animation/src",
  "packages/physics/src",
  "packages/engine/src",
  "apps/product-configurator",
  "apps/asset-inspector",
  "apps/material-studio",
  "apps/character-viewer",
  "apps/regression-animation-keyframes",
  "apps/flagship-viewer",
  "apps/animation-keyframes",
  "apps/skinning-blending",
  "apps/skinning-additive",
  "apps/skinning-ik",
  "apps/skinning-morph",
  "apps/animation-multiple",
  "apps/animation-walk",
  "apps/decals",
  "apps/camera",
  "apps/parallax-barrier",
  "apps/stereo-effects",
  "apps/physics-showcase",
  "examples/production-runtime-examples"
] as const;

const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const threeImportPattern = /\b(?:import\s+(?:type\s+)?(?:[^'"]+\s+from\s+)?|export\s+[^'"]+\s+from\s+|import\s*\(|require\s*\()\s*["'](?:three|three\/[^"']*|@galileo3d\/three-compat(?:\/[^"']*)?)["']/g;
const reportPath = "tests/reports/current-routes-runtime-import-audit.json";

const findings: Finding[] = [];
const scannedFiles: string[] = [];

for (const root of roots) {
  walk(root);
}

const report = {
  schema: "g3d-current-routes-runtime-import-audit/v1",
  pass: findings.length === 0,
  claim: "G3D product/runtime source roots do not import Three.js or @galileo3d/three-compat implementation paths.",
  scannedRoots: roots,
  scannedFiles: scannedFiles.length,
  allowedThreeUsage: [
    "benchmarks/threejs/**",
    "tools/**threejs**/**",
    "tests/**threejs**/**",
    "packages/three-compat/**",
    "docs and comparison prose"
  ],
  findings
};

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (!report.pass) {
  console.error(`V8 runtime import audit failed. Report: ${reportPath}`);
  for (const finding of findings.slice(0, 20)) {
    console.error(`${finding.file}:${finding.line} ${finding.match}`);
  }
  process.exit(1);
}

console.log(`V8 runtime import audit passed. Report: ${reportPath}`);

function walk(path: string): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(path, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".vite") continue;
      walk(child);
      continue;
    }
    if (!entry.isFile() || !sourceExtensions.has(extname(entry.name))) continue;
    scanFile(child);
  }
}

function scanFile(path: string): void {
  const text = readFileSync(path, "utf8");
  const file = relative(process.cwd(), path);
  scannedFiles.push(file);
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    threeImportPattern.lastIndex = 0;
    const matches = line.match(threeImportPattern);
    if (!matches) continue;
    for (const match of matches) {
      findings.push({ file, line: index + 1, match: match.trim() });
    }
  }
}
