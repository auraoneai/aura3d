import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, type Dirent } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { writeReport, type ReleaseCheck } from "../check-common";

interface PackageJson {
  readonly name?: string;
  readonly version?: string;
  readonly files?: readonly string[];
  readonly exports?: Record<string, unknown>;
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
}

interface PackFile {
  readonly path: string;
  readonly size: number;
}

interface PackResult {
  readonly files: readonly PackFile[];
}

interface ImportFinding {
  readonly file: string;
  readonly line: number;
  readonly match: string;
}

const reportPath = "tests/reports/package-no-three-runtime.json";
const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as PackageJson;
const sourceRoots = [
  "packages/animation/src",
  "packages/assets/src",
  "packages/audio/src",
  "packages/controls/src",
  "packages/core/src",
  "packages/ecs/src",
  "packages/editor/src",
  "packages/editor-runtime/src",
  "packages/engine/src",
  "packages/environments/src",
  "packages/input/src",
  "packages/materials/src",
  "packages/math/src",
  "packages/physics/src",
  "packages/product-studio/src",
  "packages/react/src",
  "packages/rendering/src",
  "packages/scene/src",
  "packages/scripting/src",
  "packages/workflows/src"
] as const;
const distRoots = [
  "dist/animation",
  "dist/assets",
  "dist/audio",
  "dist/controls",
  "dist/core",
  "dist/ecs",
  "dist/editor",
  "dist/editor-runtime",
  "dist/engine",
  "dist/environments",
  "dist/input",
  "dist/materials",
  "dist/math",
  "dist/physics",
  "dist/product-studio",
  "dist/react",
  "dist/rendering",
  "dist/scene",
  "dist/scripting",
  "dist/workflows"
] as const;

const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const runtimeThreeImportPattern = /\b(?:import\s+(?:type\s+)?(?:[^'"]+\s+from\s+)?|export\s+[^'"]+\s+from\s+|import\s*\(|require\s*\()\s*["'](?:three|three\/[^"']*|@aura3d\/three-compat(?:\/[^"']*)?)["']/g;
const runtimeThreeBackendPattern = /\bbackend:\s*["'](?:three|three-webgl|three-lean-[^"']*)["']|\bthree-lean-[\w-]+/g;
const runtimeTypeImportPattern = /typeof\s+import\s*\(\s*["']three(?:\/[^"']*)?["']\s*\)/g;

const sourceFindings = scanRoots(sourceRoots);
const distFindings = scanRoots(distRoots);
const pack = runPackDryRun();
const packPaths = pack?.files.map((file) => file.path) ?? [];
const packedTextFindings = pack ? scanPackFiles(pack.files) : [];

const checks: ReleaseCheck[] = [
  {
    id: "root-package-name",
    pass: packageJson.name === "@aura3d/engine",
    detail: `name=${packageJson.name ?? "missing"}`
  },
  {
    id: "root-dependencies-no-three",
    pass: packageJson.dependencies?.three === undefined,
    detail: packageJson.dependencies?.three ? `dependencies.three=${packageJson.dependencies.three}` : "root dependencies do not install Three.js"
  },
  {
    id: "root-dependencies-no-three-compat",
    pass: packageJson.dependencies?.["@aura3d/three-compat"] === undefined,
    detail: packageJson.dependencies?.["@aura3d/three-compat"] ? "root dependencies include @aura3d/three-compat" : "root dependencies do not install @aura3d/three-compat"
  },
  {
    id: "root-exports-no-three-compat-subpath",
    pass: packageJson.exports?.["./three-compat"] === undefined,
    detail: packageJson.exports?.["./three-compat"] ? "root exports expose ./three-compat" : "root exports do not expose ./three-compat"
  },
  {
    id: "root-files-no-dist-three-compat",
    pass: !packageJson.files?.includes("dist/three-compat"),
    detail: packageJson.files?.includes("dist/three-compat") ? "root files include dist/three-compat" : "root files exclude dist/three-compat"
  },
  {
    id: "source-runtime-no-three-imports",
    pass: sourceFindings.length === 0,
    detail: sourceFindings.length === 0 ? "source runtime roots have no Three.js runtime imports or backend diagnostics" : formatFindings(sourceFindings)
  },
  {
    id: "dist-runtime-no-three-imports",
    pass: distFindings.length === 0,
    detail: distFindings.length === 0 ? "dist runtime roots have no Three.js runtime imports or backend diagnostics" : formatFindings(distFindings)
  },
  {
    id: "pack-dry-run-available",
    pass: Boolean(pack),
    detail: pack ? `npm pack dry-run listed ${pack.files.length} files` : "npm pack dry-run failed"
  },
  {
    id: "pack-no-dist-three-compat",
    pass: !packPaths.some((path) => path === "dist/three-compat/index.js" || path.startsWith("dist/three-compat/")),
    detail: packPaths.some((path) => path.startsWith("dist/three-compat/")) ? "packed root package includes dist/three-compat" : "packed root package excludes dist/three-compat"
  },
  {
    id: "pack-runtime-no-three-imports",
    pass: packedTextFindings.length === 0,
    detail: packedTextFindings.length === 0 ? "packed runtime text has no Three.js imports or backend diagnostics" : formatFindings(packedTextFindings)
  }
];

writeReport(reportPath, "a3d-package-no-three-runtime", checks, {
  packageVersion: packageJson.version,
  sourceRoots,
  distRootsScanned: distRoots.filter((root) => existsSync(resolve(root))),
  allowedThreeUsage: [
    "root devDependencies for local parity and migration tests",
    "packages/three-compat/**",
    "benchmarks/**",
    "tools/**threejs**/**",
    "tests explicitly scoped to Three.js parity or @aura3d/three-compat"
  ],
  sourceFindings,
  distFindings,
  packedTextFindings
});

function scanRoots(roots: readonly string[]): ImportFinding[] {
  const findings: ImportFinding[] = [];
  for (const root of roots) {
    walk(root, findings);
  }
  return findings;
}

function walk(path: string, findings: ImportFinding[]): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(resolve(path), { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".vite" || entry.name === "three-compat") continue;
      if (child === "packages/three-compat" || child === "dist/three-compat") continue;
      walk(child, findings);
      continue;
    }
    if (!entry.isFile() || !sourceExtensions.has(extname(entry.name))) continue;
    scanFile(child, findings);
  }
}

function scanFile(path: string, findings: ImportFinding[]): void {
  const text = readFileSync(resolve(path), "utf8");
  const file = relative(process.cwd(), resolve(path));
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    for (const pattern of [runtimeThreeImportPattern, runtimeThreeBackendPattern, runtimeTypeImportPattern]) {
      pattern.lastIndex = 0;
      const matches = line.match(pattern);
      if (!matches) continue;
      for (const match of matches) {
        findings.push({ file, line: index + 1, match: match.trim() });
      }
    }
  }
}

function runPackDryRun(): PackResult | undefined {
  try {
    const output = execFileSync("npm", ["pack", "--dry-run", "--json", "."], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: "pipe",
      maxBuffer: 10 * 1024 * 1024
    });
    const [result] = JSON.parse(output) as PackResult[];
    return result;
  } catch (error) {
    mkdirSync(dirname(resolve(reportPath)), { recursive: true });
    return undefined;
  }
}

function scanPackFiles(files: readonly PackFile[]): ImportFinding[] {
  const findings: ImportFinding[] = [];
  for (const file of files) {
    if (!/^dist\/(?:animation|assets|audio|controls|core|ecs|editor|editor-runtime|engine|environments|input|materials|math|physics|product-studio|react|rendering|scene|scripting|workflows)\//.test(file.path)) continue;
    if (!/\.(js|mjs|cjs|d\.ts)$/i.test(file.path)) continue;
    if (!existsSync(resolve(file.path))) continue;
    scanFile(file.path, findings);
  }
  return findings;
}

function formatFindings(findings: readonly ImportFinding[]): string {
  return findings.slice(0, 20).map((finding) => `${finding.file}:${finding.line} ${finding.match}`).join("; ");
}
