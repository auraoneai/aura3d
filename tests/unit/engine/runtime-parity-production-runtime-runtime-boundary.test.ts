import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const RUNTIME_ROOTS = [
  "packages/engine/src/production-runtime",
  "packages/rendering/src",
  "packages/assets/src",
  "packages/controls/src",
  "apps/product-configurator",
  "templates/production-product-viewer",
  "examples/production-runtime-examples"
] as const;

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const BANNED_RUNTIME_PATTERNS: readonly { readonly id: string; readonly pattern: RegExp }[] = [
  { id: "three-import", pattern: /from\s+["']three(?:\/[^"']*)?["']/ },
  { id: "three-require", pattern: /require\(["']three(?:\/[^"']*)?["']\)/ },
  { id: "three-namespace", pattern: /\bTHREE\./ },
  { id: "three-compat-import", pattern: /from\s+["']@aura3d\/three-compat(?:\/[^"']*)?["']/ },
  { id: "three-compat-relative-import", pattern: /from\s+["'][^"']*three-compat[^"']*["']/ }
];

describe("RuntimeParity Production runtime boundary", () => {
  it("keeps the product renderer, app, template, and Production examples independent from Three.js runtime delegation", () => {
    const scannedFiles = RUNTIME_ROOTS.flatMap((root) => collectSourceFiles(resolve(root)));
    const violations = scannedFiles.flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return BANNED_RUNTIME_PATTERNS
        .filter(({ pattern }) => pattern.test(source))
        .map(({ id }) => ({
          id,
          file: relative(process.cwd(), file)
        }));
    });

    const report = {
      schema: "a3d-runtime-parity-production-runtime-runtime-boundary",
      generatedAt: new Date().toISOString(),
      claim: "bounded-no-three-runtime-delegation",
      roots: RUNTIME_ROOTS,
      scannedFileCount: scannedFiles.length,
      bannedPatternIds: BANNED_RUNTIME_PATTERNS.map(({ id }) => id),
      violations,
      pass: violations.length === 0,
      caveat: "This enforces the Production product/runtime boundary. Three.js remains allowed only in comparison, migration, and reference harnesses outside these roots."
    };
    const reportPath = resolve("tests/reports/runtime-parity/production-runtime-runtime-boundary.json");
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

    expect(scannedFiles.length).toBeGreaterThan(0);
    expect(violations).toEqual([]);
  });
});

function collectSourceFiles(root: string): readonly string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  const visit = (entry: string): void => {
    const stat = statSync(entry);
    if (stat.isDirectory()) {
      if (entry.endsWith(`${join("node_modules")}`) || entry.endsWith(`${join("dist")}`)) return;
      for (const child of readdirSync(entry)) visit(join(entry, child));
      return;
    }
    if (stat.isFile() && SOURCE_EXTENSIONS.has(extname(entry))) files.push(entry);
  };
  visit(root);
  return files;
}
