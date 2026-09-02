import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface SecretFinding {
  readonly path: string;
  readonly line: number;
  readonly column: number;
}

const TOKEN_PATTERN = /(?<![A-Za-z0-9_])msy_([A-Za-z0-9_-]{20,160})(?![A-Za-z0-9_-])/g;
const OUTPUT_REDACTION_PATTERN = /msy_[A-Za-z0-9_-]*/gi;
const PLACEHOLDER_WORDS = /(?:example|sample|placeholder|replace|redacted|dummy|fake|your|api[_-]?key|token|secret|x{4,})/i;

const EXCLUDED_SEGMENTS = new Set([
  ".git",
  ".pnpm",
  "node_modules",
  "bower_components",
  "dist",
  "coverage",
  "test-results",
  "playwright-report",
  ".cache",
  ".turbo",
  ".vite",
  ".candidate-assets",
  ".commandcode",
  ".goal",
  ".orchestrate",
  "release-artifacts"
]);

const BINARY_EXTENSIONS = new Set([
  ".3ds", ".7z", ".a", ".avi", ".bin", ".blend", ".bmp", ".bz2", ".class", ".dmg",
  ".eot", ".exe", ".fbx", ".gif", ".glb", ".gz", ".ico", ".jar", ".jpeg", ".jpg",
  ".m4a", ".mkv", ".mov", ".mp3", ".mp4", ".o", ".obj", ".ogg", ".otf", ".pdf",
  ".png", ".so", ".tar", ".tga", ".tgz", ".ttf", ".wav", ".webm", ".webp", ".woff",
  ".woff2", ".xz", ".zip"
]);

const EXCLUDED_PATH_PREFIXES = ["tests/reports/", "public/aura-assets/"];

export function redactPotentialSecrets(value: string): string {
  return value.replace(OUTPUT_REDACTION_PATTERN, "msy_[REDACTED]");
}

function entropy(value: string): number {
  const counts = new Map<string, number>();
  for (const character of value) counts.set(character, (counts.get(character) ?? 0) + 1);
  let result = 0;
  for (const count of counts.values()) {
    const probability = count / value.length;
    result -= probability * Math.log2(probability);
  }
  return result;
}

function isCredentialLike(suffix: string): boolean {
  if (PLACEHOLDER_WORDS.test(suffix)) return false;
  if (new Set(suffix).size < 8) return false;
  return entropy(suffix) >= 3;
}

export function scanText(path: string, text: string): readonly SecretFinding[] {
  const findings: SecretFinding[] = [];
  TOKEN_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const suffix = match[1];
    if (!suffix || !isCredentialLike(suffix)) continue;
    const index = match.index;
    const preceding = text.slice(0, index);
    const lastNewline = preceding.lastIndexOf("\n");
    findings.push({
      path,
      line: preceding.split("\n").length,
      column: index - lastNewline
    });
  }
  return findings;
}

function extension(path: string): string {
  const basename = path.slice(path.lastIndexOf("/") + 1);
  const dot = basename.lastIndexOf(".");
  return dot < 0 ? "" : basename.slice(dot).toLowerCase();
}

export function shouldScanPath(path: string): boolean {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//, "");
  if (EXCLUDED_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return false;
  if (normalized.split("/").some((segment) => EXCLUDED_SEGMENTS.has(segment))) return false;
  return !BINARY_EXTENSIONS.has(extension(normalized));
}

export function listRepositoryFiles(root: string): readonly string[] {
  const output = execFileSync(
    "git",
    ["-C", root, "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { encoding: "utf8", maxBuffer: 128 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }
  );
  return output.split("\0").filter(Boolean);
}

export function scanRepository(root: string): { readonly filesScanned: number; readonly findings: readonly SecretFinding[] } {
  const findings: SecretFinding[] = [];
  let filesScanned = 0;
  for (const path of listRepositoryFiles(root)) {
    if (!shouldScanPath(path)) continue;
    const absolutePath = resolve(root, path);
    const stat = lstatSync(absolutePath, { throwIfNoEntry: false });
    if (!stat || !stat.isFile() || stat.isSymbolicLink()) continue;
    const buffer = readFileSync(absolutePath);
    if (buffer.includes(0)) continue;
    filesScanned += 1;
    findings.push(...scanText(path, buffer.toString("utf8")));
  }
  return { filesScanned, findings };
}

function parseRoot(args: readonly string[]): string {
  if (args.length === 0) return process.cwd();
  if (args.length === 2 && args[0] === "--root" && args[1]) return resolve(args[1]);
  throw new Error("usage: meshy-secret-scan [--root <repository>]");
}

function repositoryRoot(path: string): string {
  return execFileSync("git", ["-C", path, "rev-parse", "--show-toplevel"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

export function runCli(args: readonly string[]): number {
  try {
    const root = repositoryRoot(parseRoot(args));
    const result = scanRepository(root);
    if (result.findings.length === 0) {
      process.stdout.write(`Meshy secret scan passed (${result.filesScanned} repository text files scanned).\n`);
      return 0;
    }

    process.stderr.write(`Meshy secret scan failed: ${result.findings.length} credential-like value(s) found.\n`);
    for (const finding of result.findings) {
      const location = redactPotentialSecrets(`${finding.path}:${finding.line}:${finding.column}`);
      process.stderr.write(`- ${location}: [REDACTED Meshy credential]\n`);
    }
    return 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown scanner error";
    process.stderr.write(`Meshy secret scan could not complete: ${redactPotentialSecrets(message)}\n`);
    return 2;
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli(process.argv.slice(2));
}
