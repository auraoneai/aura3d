import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { writeReport, type ReleaseCheck } from "../check-common";

interface PackFile {
  readonly path: string;
  readonly size: number;
}

interface PackResult {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly size: number;
  readonly unpackedSize: number;
  readonly filename: string;
  readonly files: readonly PackFile[];
}

interface PackageTarget {
  readonly id: string;
  readonly dir: string;
  readonly expectedName: string;
  readonly requiredFiles: readonly string[];
  readonly requiredBins?: readonly string[];
}

const targets: readonly PackageTarget[] = [
  {
    id: "engine-root",
    dir: ".",
    expectedName: "@aura3d/engine",
    requiredFiles: ["README.md", "package.json", "dist/engine/index.js", "dist/engine/agent-api/index.js", "templates/product-viewer/package.json", "templates/cinematic-scene/package.json", "templates/mini-game/package.json"]
  },
  {
    id: "react",
    dir: "packages/react",
    expectedName: "@aura3d/react",
    requiredFiles: ["package.json", "dist/index.js", "dist/index.d.ts"]
  },
  {
    id: "cli",
    dir: "packages/aura3d-cli",
    expectedName: "@aura3d/cli",
    requiredFiles: ["package.json", "dist/cli.js", "dist/index.js", "dist/index.d.ts"],
    requiredBins: ["aura3d"]
  },
  {
    id: "create-aura3d",
    dir: "packages/create-aura3d",
    expectedName: "create-aura3d",
    requiredFiles: ["package.json", "dist/cli.js", "dist/index.js", "dist/index.d.ts", "templates/product-viewer/package.json", "templates/cinematic-scene/package.json", "templates/mini-game/package.json"],
    requiredBins: ["create-aura3d"]
  }
];

const disallowedPathPatterns = [/^archive\//, /V[234]PRD\.md$/, /TestV4PlanPRD\.md$/, /\.(png|jpe?g|csv)$/i];
const disallowedTextPatterns = [/AuraSceneIR/, /MockProvider/, /prompt-to-scene/, /@aura3d\/ai-scene/, /\bV[234]\b/, /Path A/, /Path B/];
const results: Record<string, unknown>[] = [];
const checks: ReleaseCheck[] = [];

for (const target of targets) {
  const pack = runPack(target.dir);
  const packageJson = JSON.parse(readFileSync(resolve(target.dir, "package.json"), "utf8")) as { name?: string; bin?: Record<string, string> };
  const paths = pack.files.map((file) => file.path);
  const missing = target.requiredFiles.filter((file) => !paths.includes(file));
  const disallowedPaths = paths.filter((path) => disallowedPathPatterns.some((pattern) => pattern.test(path)));
  const textHits = findTextHits(target.dir, pack.files);
  const missingBins = (target.requiredBins ?? []).filter((bin) => !packageJson.bin?.[bin]);

  checks.push(
    {
      id: `${target.id}-package-name`,
      pass: packageJson.name === target.expectedName,
      detail: `${target.dir} name=${packageJson.name ?? "missing"}, expected=${target.expectedName}`
    },
    {
      id: `${target.id}-required-files`,
      pass: missing.length === 0,
      detail: missing.length === 0 ? "all required files included" : `missing from pack: ${missing.join(", ")}`
    },
    {
      id: `${target.id}-required-bins`,
      pass: missingBins.length === 0,
      detail: missingBins.length === 0 ? `bins ok: ${Object.keys(packageJson.bin ?? {}).join(", ") || "none required"}` : `missing bins: ${missingBins.join(", ")}`
    },
    {
      id: `${target.id}-no-disallowed-paths`,
      pass: disallowedPaths.length === 0,
      detail: disallowedPaths.length === 0 ? "no archive, PRD history, image, or CSV paths in tarball" : disallowedPaths.slice(0, 20).join(", ")
    },
    {
      id: `${target.id}-no-archived-runtime-text`,
      pass: textHits.length === 0,
      detail: textHits.length === 0 ? "no archived runtime or release-cycle text in tarball text files" : textHits.slice(0, 20).join("; ")
    }
  );

  results.push({
    id: target.id,
    dir: target.dir,
    name: packageJson.name,
    filename: pack.filename,
    packageSize: pack.size,
    unpackedSize: pack.unpackedSize,
    entryCount: pack.files.length,
    missingRequiredFiles: missing,
    disallowedPaths,
    textHits,
    bins: packageJson.bin ?? {}
  });
}

writeReport("tests/reports/package-tarball-audit.json", "aura3d-package-tarball-audit", checks, { packages: results });

function runPack(dir: string): PackResult {
  const output = execFileSync("npm", ["pack", "--dry-run", "--json", "."], { cwd: resolve(dir), encoding: "utf8", stdio: "pipe" });
  const [pack] = JSON.parse(output) as PackResult[];
  return pack;
}

function findTextHits(dir: string, files: readonly PackFile[]): string[] {
  const hits: string[] = [];
  for (const file of files) {
    if (!/\.(md|json|js|ts|tsx|d\.ts|html|css|map)$/i.test(file.path)) continue;
    const fullPath = resolve(dir, file.path);
    if (!existsSync(fullPath)) continue;
    const text = readFileSync(fullPath, "utf8");
    for (const pattern of disallowedTextPatterns) {
      if (pattern.test(text)) hits.push(`${dir}:${file.path}:${pattern.source}`);
    }
  }
  return hits;
}
