import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  collectPackedPackageApis,
  collectPublicPackageApis,
  readApiDocsAppendix,
  renderApiDocs,
  validateApiDocs,
  writeApiDocs
} from "../../../tools/api-docs/index.js";

const temporaryRoots: string[] = [];
const candidate = { name: "@aura3d/example", version: "1.2.3", sha256: "a".repeat(64) };

function scratch(): string {
  const root = mkdtempSync(join(tmpdir(), "aura3d-api-docs-test-"));
  temporaryRoots.push(root);
  return root;
}

function write(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

/** Build a synthetic extracted package, not an installed release candidate. */
function packedFixture(root: string): string {
  const base = join(root, "node_modules", "@aura3d", "example");
  write(join(base, "package.json"), JSON.stringify({
    name: candidate.name,
    version: candidate.version,
    exports: {
      ".": {
        types: "./dist/index.d.ts",
        import: "./dist/index.js",
        require: { types: "./dist/index.d.cts", default: "./dist/index.cjs" }
      },
      "./feature": { types: "./dist/feature/index.d.ts", import: "./dist/feature/index.js" },
      "./directory/": "./dist/feature/",
      "./items/*": { types: "./dist/items/*.d.ts", import: "./dist/items/*.js" },
      "./styles.css": "./dist/styles.css",
      "./blocked": null
    }
  }));
  for (const path of ["index.js", "index.cjs", "feature/index.js", "items/first.js", "items/second.js", "styles.css"]) {
    write(join(base, "dist", path), "");
  }
  write(join(base, "dist/index.d.ts"), 'export { greet } from "./nested.js";\n');
  write(join(base, "dist/nested.d.ts"), "export declare function greet(name: string): string;\n");
  write(join(base, "dist/index.d.cts"), "export declare const commonjs: true;\n");
  write(join(base, "dist/feature/index.d.ts"), "export declare const feature: true;\n");
  write(join(base, "dist/items/first.d.ts"), "export declare const first: 1;\n");
  write(join(base, "dist/items/second.d.ts"), "export declare const second: 2;\n");
  return base;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("public API docs", () => {
  it("collects a source inventory from public entries without including private packages", () => {
    const root = scratch();
    write(join(root, "package.json"), JSON.stringify({ name: "@aura3d/engine", version: "1.0.0" }));
    write(join(root, "packages/engine/src/index.ts"), "export const rootValue = 1;\n");
    write(join(root, "packages/example/package.json"), JSON.stringify({
      name: "@aura3d/example", version: "1.0.0", exports: { ".": "./dist/index.js", "./feature": "./dist/feature.js" }
    }));
    write(join(root, "packages/example/src/index.ts"), "export const example = 1;\n");
    write(join(root, "packages/example/src/feature.ts"), "export function feature(): void {}\n");
    write(join(root, "packages/private/package.json"), JSON.stringify({ name: "@aura3d/private", version: "1.0.0", private: true }));

    const packages = collectPublicPackageApis(root);
    expect(packages.map((entry) => entry.packageName)).toEqual([
      "@aura3d/engine", "@aura3d/example", "@aura3d/example/feature"
    ]);
    expect(packages.every((entry) => entry.exportStatements.length > 0)).toBe(true);
    const document = renderApiDocs(packages);
    expect(document).toContain("This file is a generated inventory of source export declarations.");
    expect(document).toContain("Installed availability requires the matching packed-candidate consumer checks.");
    expect(document).not.toContain("generated from verified packed package export conditions");
  });

  it("documents packed conditions, wildcard and directory entries, and re-exported declarations", () => {
    const root = scratch();
    packedFixture(root);
    const packages = collectPackedPackageApis(root, [candidate]);

    expect(packages.map((entry) => entry.packageName)).toEqual([
      "@aura3d/example", "@aura3d/example/blocked", "@aura3d/example/directory/",
      "@aura3d/example/feature", "@aura3d/example/items/first", "@aura3d/example/items/second",
      "@aura3d/example/styles.css"
    ]);
    const document = renderApiDocs(packages);
    expect(document).toContain("This file is generated from verified packed package export conditions and declarations.");
    expect(document).toContain(`archive:${candidate.name}@${candidate.version}#sha256=${candidate.sha256}`);
    expect(document).toContain("`require.types`: `./dist/index.d.cts`");
    expect(document).toContain("`require.default`: `./dist/index.cjs`");
    expect(document).toContain("### `./dist/nested.d.ts`");
    expect(document).toContain("export declare function greet(name: string): string;");
    expect(document).toContain("## @aura3d/example/directory/");
    expect(document).toContain("## @aura3d/example/items/first");
    expect(document).toContain("## @aura3d/example/items/second");
    expect(document).toContain("## @aura3d/example/styles.css");
    expect(document).toContain("`default`: blocked");
    expect(document).toContain("This export has no TypeScript declaration");
  });

  it("requires a reviewed candidate plan in the generated command guidance", () => {
    const root = scratch();
    packedFixture(root);
    const packed = renderApiDocs(collectPackedPackageApis(root, [candidate]));
    const source = renderApiDocs([{
      packageName: "@aura3d/example", version: "1.2.3", packagePath: "packages/example",
      entrypointPath: "packages/example/src/index.ts", exportStatements: ["export const example = 1;"]
    }]);
    for (const document of [source, packed]) {
      expect(document).toContain("Generate and verify the packed reference using a reviewed candidate plan:");
      expect(document).toContain("pnpm verify:api-docs -- --candidate-plan path/to/candidate-plan.json --write");
      expect(document).toContain("pnpm verify:api-docs -- --candidate-plan path/to/candidate-plan.json\n");
    }
  });

  it("includes the current appendix and rejects changed reference or appendix content", () => {
    const root = scratch();
    packedFixture(root);
    const packages = collectPackedPackageApis(root, [candidate]);
    const appendixPath = join(root, "docs/api/public-api.appendix.md");
    const outputPath = join(root, "docs/api/public-api.md");
    const appendix = "---\n\n## Candidate notes\n\nKeep this hand-maintained boundary.\n";
    write(appendixPath, appendix);

    expect(validateApiDocs(root, "docs/api/public-api.md", packages).ok).toBe(false);
    writeApiDocs(root, "docs/api/public-api.md", packages);
    const rendered = renderApiDocs(packages, readApiDocsAppendix(root));
    expect(readFileSync(outputPath, "utf8")).toBe(rendered);
    expect(rendered.endsWith(`\n${appendix}`)).toBe(true);
    expect(rendered.match(/## Candidate notes/g)).toHaveLength(1);
    expect(validateApiDocs(root, "docs/api/public-api.md", packages).violations).toEqual([]);

    writeFileSync(outputPath, rendered.replace("export declare function greet", "export declare function omitted"));
    expect(validateApiDocs(root, "docs/api/public-api.md", packages).ok).toBe(false);
    writeFileSync(outputPath, rendered);
    writeFileSync(appendixPath, `${appendix}\nAdditional hand-maintained text.\n`);
    expect(validateApiDocs(root, "docs/api/public-api.md", packages).ok).toBe(false);
    writeApiDocs(root, "docs/api/public-api.md", packages);
    expect(readFileSync(outputPath, "utf8")).toContain("Additional hand-maintained text.");
    expect(validateApiDocs(root, "docs/api/public-api.md", packages).ok).toBe(true);
  });

  it("rejects missing export targets, missing re-exported declarations, and candidate identity mismatch", () => {
    const missingTarget = scratch();
    const targetBase = packedFixture(missingTarget);
    rmSync(join(targetBase, "dist/feature/index.js"));
    expect(() => collectPackedPackageApis(missingTarget, [candidate])).toThrow(/missing packed export target/);

    const missingDeclaration = scratch();
    const declarationBase = packedFixture(missingDeclaration);
    rmSync(join(declarationBase, "dist/nested.d.ts"));
    expect(() => collectPackedPackageApis(missingDeclaration, [candidate])).toThrow(/references missing declaration/);

    const wrongIdentity = scratch();
    packedFixture(wrongIdentity);
    expect(() => collectPackedPackageApis(wrongIdentity, [{ ...candidate, version: "9.9.9" }])).toThrow(/packed package identity mismatch/);
  });
});
