import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export const AURA3D_2_SPECIFIER_MIGRATIONS = {
  "@aura3d/engine/lean": "@aura3d/lean",
  "@aura3d/engine/lean-product": "@aura3d/lean/product",
  "@aura3d/engine/lean-game": "@aura3d/lean/game",
  "@aura3d/engine/ecs": "@aura3d/ecs",
  "@aura3d/engine/scripting": "@aura3d/scripting"
} as const;

export interface MigrationResult {
  readonly path: string;
  readonly replacements: number;
  readonly changed: boolean;
}

export function migrateAura3D2Source(source: string): { source: string; replacements: number } {
  let migrated = source;
  let replacements = 0;
  for (const [before, after] of Object.entries(AURA3D_2_SPECIFIER_MIGRATIONS)) {
    const pattern = new RegExp(`(["'])${escapeRegExp(before)}\\1`, "g");
    migrated = migrated.replace(pattern, (_match, quote: string) => {
      replacements += 1;
      return `${quote}${after}${quote}`;
    });
  }
  return { source: migrated, replacements };
}

export function migrateAura3D2Paths(paths: readonly string[], write = true): MigrationResult[] {
  const files = paths.flatMap(collectSources).sort();
  return files.map((path) => {
    const before = readFileSync(path, "utf8");
    const migration = migrateAura3D2Source(before);
    if (write && migration.replacements > 0) writeFileSync(path, migration.source);
    return { path, replacements: migration.replacements, changed: migration.replacements > 0 };
  });
}

function collectSources(input: string): string[] {
  const path = resolve(input);
  const stat = statSync(path);
  if (stat.isFile()) return isSource(path) ? [path] : [];
  return readdirSync(path).flatMap((entry) => {
    if (["node_modules", "dist", "coverage", "test-results", ".git"].includes(entry)) return [];
    return collectSources(resolve(path, entry));
  });
}

function isSource(path: string): boolean {
  return /\.(?:[cm]?[jt]sx?)$/.test(path);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

if (process.argv[1]?.endsWith("tools/migrate-2.0/index.ts")) {
  const check = process.argv.includes("--check");
  const dryRun = process.argv.includes("--dry-run");
  const paths = process.argv.slice(2).filter((argument) => !argument.startsWith("--"));
  if (paths.length === 0) {
    console.error("Usage: pnpm migrate:2.0 [--check|--dry-run] <file-or-directory> [...]");
    process.exitCode = 2;
  } else {
    const results = migrateAura3D2Paths(paths, !check && !dryRun);
    const changed = results.filter((result) => result.changed);
    console.log(JSON.stringify({ mode: check ? "check" : dryRun ? "dry-run" : "write", files: results.length, changed }, null, 2));
    if (check && changed.length > 0) process.exitCode = 1;
  }
}
