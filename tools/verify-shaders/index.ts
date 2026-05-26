import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export interface ShaderViolation {
  file: string;
  message: string;
}

export interface ShaderReport {
  ok: boolean;
  checkedFiles: number;
  coverage: ShaderCoverage;
  violations: ShaderViolation[];
}

export interface ShaderCoverage {
  readonly status: "covered" | "not_applicable";
  readonly searchedRoots: readonly string[];
  readonly existingRoots: readonly string[];
  readonly filesByExtension: Readonly<Record<string, number>>;
  readonly markerIds: readonly string[];
  readonly note?: string;
}

const shaderExtensions = new Set([".glsl", ".wgsl", ".vert", ".frag"]);

function hasShaderExtension(path: string): boolean {
  return [...shaderExtensions].some((extension) => path.endsWith(extension));
}

function walkShaderFiles(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const path = join(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) walkShaderFiles(path, out);
    else if (hasShaderExtension(path)) out.push(path);
  }
  return out;
}

export function verifyShaders(root = process.cwd()): ShaderReport {
  const searchedRoots = [
    join(root, "packages", "rendering", "src"),
    join(root, "packages", "rendering", "shaders"),
    join(root, "tests", "fixtures", "shaders")
  ];
  const existingRoots = searchedRoots.filter((path) => existsSync(path));
  const files = searchedRoots.flatMap((path) => walkShaderFiles(path)).sort();
  const violations: ShaderViolation[] = [];
  const filesByExtension: Record<string, number> = {};
  const markerIds = new Set<string>();

  for (const file of files) {
    const extension = extname(file);
    filesByExtension[extension] = (filesByExtension[extension] ?? 0) + 1;
    const source = readFileSync(file, "utf8");
    const marker = /@aura3d-shader:([a-z0-9_.-]+)/i.exec(source);
    if (!marker) {
      violations.push({ file, message: "Shader source is missing a @aura3d-shader:<id> marker." });
    } else {
      markerIds.add(marker[1]!);
    }
    if (/\bTODO_SHADER\b|\bPLACEHOLDER_SHADER\b/.test(source)) {
      violations.push({ file, message: "Shader source contains a placeholder marker." });
    }
  }

  const coverage: ShaderCoverage = {
    status: files.length === 0 ? "not_applicable" : "covered",
    searchedRoots: searchedRoots.map((path) => relative(root, path)),
    existingRoots: existingRoots.map((path) => relative(root, path)),
    filesByExtension,
    markerIds: [...markerIds].sort(),
    ...(files.length === 0 ? { note: "No shader source files were found yet; this is expected before rendering shader files land." } : {})
  };

  return { ok: violations.length === 0, checkedFiles: files.length, coverage, violations };
}

function writeReport(root: string, report: ShaderReport): void {
  const path = join(root, "tests", "reports", "shaders.json");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const rootArg = process.argv[2] === "--root" ? process.argv[3] : undefined;
  const root = rootArg ?? process.cwd();
  const report = verifyShaders(root);
  writeReport(root, report);
  if (!report.ok) {
    console.error(JSON.stringify(report.violations, null, 2));
    process.exitCode = 1;
  } else {
    console.log(`Shader marker verification passed for ${report.checkedFiles} files.`);
  }
}
