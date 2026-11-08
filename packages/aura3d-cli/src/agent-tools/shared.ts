// Shared helpers for the agent tools (`aura3d info`, `examples`, `validate`, `render`): argv parsing, installed-package lookup and
// the CLI's own shipped files. Everything here is offline: no network, no engine import, no browser.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface AgentToolIo { readonly cwd: string; stdout(s: string): void; stderr(s: string): void }

export function optionValue(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  const value = index >= 0 ? argv[index + 1] : undefined;
  return value !== undefined && !value.startsWith("--") ? value : undefined;
}

export function optionNumber(argv: readonly string[], name: string): number | undefined {
  const raw = optionValue(argv, name);
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} needs a non-negative number (got "${raw}").`);
  return n;
}

/** Positional arguments: everything that is not a flag and not the value of a value-taking flag. */
export function positionals(argv: readonly string[], valueFlags: ReadonlySet<string>): string[] {
  return argv.filter((arg, i) => !arg.startsWith("--") && !valueFlags.has(argv[i - 1] ?? ""));
}

export interface InstalledPackage {
  readonly name: string;
  readonly dir: string;
  readonly version: string;
  readonly manifest: { readonly version?: string; readonly types?: string; readonly typings?: string; readonly exports?: unknown; readonly name?: string; readonly description?: string };
}

/** Nearest `node_modules/<name>` from `fromDir` upward (the same lookup Node uses). */
export function findInstalledPackage(fromDir: string, name: string): InstalledPackage | undefined {
  let dir = resolve(fromDir);
  for (;;) {
    const manifestPath = join(dir, "node_modules", ...name.split("/"), "package.json");
    if (existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as InstalledPackage["manifest"];
        return { name, dir: dirname(manifestPath), version: manifest.version ?? "unknown", manifest };
      } catch { return undefined; }
    }
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/** Root of the @aura3d/cli package this module ships in (holds package.json, skills/, data/). */
export function cliPackageRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const manifest = join(dir, "package.json");
    if (existsSync(manifest)) {
      try { if ((JSON.parse(readFileSync(manifest, "utf8")) as { name?: string }).name === "@aura3d/cli") return dir; } catch { /* keep looking */ }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

export function cliVersion(): string {
  try { return (JSON.parse(readFileSync(join(cliPackageRoot(), "package.json"), "utf8")) as { version?: string }).version ?? "unknown"; }
  catch { return "unknown"; }
}

/** Monorepo root when `fromDir` sits inside the Aura3D repo (it holds aura.exports.json for @aura3d/engine). */
export function findAuraMonorepoRoot(fromDir: string): string | undefined {
  let dir = resolve(fromDir);
  for (;;) {
    const registry = join(dir, "aura.exports.json");
    if (existsSync(registry)) {
      try { if ((JSON.parse(readFileSync(registry, "utf8")) as { package?: string }).package === "@aura3d/engine") return dir; } catch { /* not ours */ }
    }
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

export interface ToolFinding {
  readonly code: string;
  readonly severity: "error" | "warning" | "info";
  readonly message: string;
  readonly fix?: string;
  readonly location?: { readonly file: string; readonly line: number; readonly column: number };
}

export function countSeverities(findings: readonly ToolFinding[]): { error: number; warning: number; info: number } {
  const counts = { error: 0, warning: 0, info: 0 };
  for (const f of findings) counts[f.severity]++;
  return counts;
}

export function formatFindings(findings: readonly ToolFinding[]): string[] {
  const lines: string[] = [];
  for (const f of findings) {
    const where = f.location ? ` ${f.location.file}:${f.location.line}:${f.location.column}` : "";
    lines.push(`${f.severity.toUpperCase().padEnd(7)} ${f.code}${where}`, `        ${f.message}`);
    if (f.fix) lines.push(`        fix: ${f.fix}`);
  }
  return lines;
}
