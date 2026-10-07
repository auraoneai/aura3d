import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * T4.10 — source-substring audit. A test that reads source under
 * apps/|packages/|templates/ and asserts `toContain` must carry an
 * `// invariant:` comment saying why the substring is load-bearing; tests with
 * no invariant are deleted, not annotated.
 */

const root = resolve(__dirname, "../../..");
const unitDir = join(root, "tests/unit");
const THIS_FILE = join(unitDir, "quality-gate/source-substring-audit.test.ts");

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.name.endsWith(".ts")) yield path;
  }
}

const SOURCE_READ = /readFileSync\([^)]*(apps|packages|templates)[^)]*\)/;

function offenders(): string[] {
  const out: string[] = [];
  for (const file of walk(unitDir)) {
    if (file === THIS_FILE) continue;
    const src = readFileSync(file, "utf8");
    if (!SOURCE_READ.test(src) || !src.includes("toContain")) continue;
    if (!/\/\/ invariant:/.test(src)) out.push(file.slice(root.length + 1));
  }
  return out.sort();
}

describe("source-substring audit (T4.10)", () => {
  it("every source-substring assertion is annotated with an invariant", () => {
    expect(offenders().join("\n")).toBe("");
  });
});
