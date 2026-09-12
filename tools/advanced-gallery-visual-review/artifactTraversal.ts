import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const NON_EVIDENCE_DIRECTORY_NAMES = new Set([
  ".cache",
  ".git",
  ".pnpm",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
  "test-results"
]);

/**
 * Enumerate retained report artifacts without descending into generated project
 * dependencies, build outputs, or browser-report internals. Those trees can be
 * very large and can disappear while a producer cleans its temporary workspace;
 * neither case is relevant to historical visual evidence.
 */
export function walkRetainedReportArtifacts(root: string): readonly string[] {
  if (!existsSync(root)) return [];

  const files: string[] = [];
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop();
    if (!directory) continue;

    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch (error) {
      if (isTransientTraversalError(error)) continue;
      throw error;
    }

    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!NON_EVIDENCE_DIRECTORY_NAMES.has(entry.name)) pending.push(path);
      } else if (entry.isFile()) {
        files.push(path);
      }
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

function isTransientTraversalError(error: unknown): boolean {
  if (!(error instanceof Error) || !("code" in error)) return false;
  return error.code === "ENOENT" || error.code === "ENOTDIR";
}
