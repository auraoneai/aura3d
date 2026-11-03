import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { collectPackedPackageApis, renderApiDocs, validateApiDocs } from "../../../tools/api-docs/index.js";
import { extractDocBlocks, extractPackedArchive, typecheckDocBlocks } from "../../../tools/docs-codeblocks/index.js";
import { validateExampleChecks } from "../../../tools/agent-examples/index.js";
import { catalogSetErrors, compareCatalogRegions } from "../../browser/native-examples-catalog.spec.js";

const temporary: string[] = [];
function scratch(): string {
  const path = mkdtempSync(join(tmpdir(), "aura3d-native-doc-test-"));
  temporary.push(path);
  return path;
}
function write(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}
function packedFixture(project: string): void {
  const base = join(project, "node_modules/@aura3d/engine");
  write(join(base, "package.json"), JSON.stringify({ name: "@aura3d/engine", version: "1.0.0", exports: {
    ".": { types: "./dist/index.d.ts", import: "./dist/index.js", require: { types: "./dist/index.d.cts", default: "./dist/index.cjs" } },
    "./feature": { types: "./dist/feature/index.d.ts", import: "./dist/feature/index.js" },
    "./directory/": "./dist/feature/",
    "./utilities/*": { types: "./dist/utilities/*.d.ts", import: "./dist/utilities/*.js" },
    "./styles.css": "./dist/styles.css"
  } }));
  for (const name of ["index.js", "index.cjs", "feature/index.js", "utilities/vector.js", "styles.css"]) write(join(base, "dist", name), "");
  write(join(base, "dist/index.d.ts"), 'export * from "./nested.js";\n');
  write(join(base, "dist/nested.d.ts"), "export declare function greet(name: string): string;\n");
  write(join(base, "dist/index.d.cts"), "export declare const commonjs: true;\n");
  write(join(base, "dist/feature/index.d.ts"), "export declare const feature: true;\n");
  write(join(base, "dist/utilities/vector.d.ts"), "export declare const vector: true;\n");
}
function tarFile(name: string, contents: string): Buffer {
  const data = Buffer.from(contents);
  const header = Buffer.alloc(512);
  header.write(name, 0, 100);
  header.write("0000644\0", 100, 8);
  header.write("0000000\0", 108, 8);
  header.write("0000000\0", 116, 8);
  header.write(`${data.length.toString(8).padStart(11, "0")}\0`, 124, 12);
  header.write("00000000000\0", 136, 12);
  header.fill(0x20, 148, 156);
  header.write("0", 156);
  header.write("ustar\0", 257);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8);
  return Buffer.concat([header, data, Buffer.alloc((512 - (data.length % 512)) % 512)]);
}
function archive(...files: Buffer[]): Buffer { return gzipSync(Buffer.concat([...files, Buffer.alloc(1024)])); }

afterEach(() => { for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true }); });

describe("packed documentation and example contracts", () => {
  it("documents conditional, directory, wildcard and re-exported declarations; rejects missing reference sections", () => {
    const root = scratch();
    packedFixture(root);
    const packages = collectPackedPackageApis(root, [{ name: "@aura3d/engine", version: "1.0.0", sha256: "a".repeat(64) }]);
    expect(packages.map(({ packageName }) => packageName)).toEqual([
      "@aura3d/engine", "@aura3d/engine/directory/", "@aura3d/engine/feature", "@aura3d/engine/styles.css", "@aura3d/engine/utilities/vector"
    ]);
    const document = renderApiDocs(packages);
    expect(document).toContain("`require.types`: `./dist/index.d.cts`");
    expect(document).toContain("### `./dist/feature/index.d.ts`");
    expect(document).toContain("## @aura3d/engine/directory/");
    expect(document).toContain("export declare function greet(name: string): string;");
    expect(document).toContain("## @aura3d/engine/utilities/vector");
    write(join(root, "docs/api/public-api.md"), document.replace("## @aura3d/engine/feature", "## omitted"));
    expect(validateApiDocs(root, "docs/api/public-api.md", packages).ok).toBe(false);
    write(join(root, "docs/api/public-api.md"), document);
    expect(validateApiDocs(root, "docs/api/public-api.md", packages).ok).toBe(true);
  });

  it("fails when a packed manifest names a missing public export target", () => {
    const root = scratch();
    packedFixture(root);
    rmSync(join(root, "node_modules/@aura3d/engine/dist/feature/index.js"));
    expect(() => collectPackedPackageApis(root, [{ name: "@aura3d/engine", version: "1.0.0", sha256: "a".repeat(64) }])).toThrow(/missing packed export target/);
  });

  it("extracts packed non-code exports and rejects unsafe or duplicate archive entries", () => {
    const root = scratch();
    const manifest = tarFile("package/package.json", '{"name":"@aura3d/engine","version":"1.0.0"}');
    expect(() => extractPackedArchive(archive(manifest, tarFile("package/dist/styles.css", "body{}")), root)).not.toThrow();
    expect(() => extractPackedArchive(archive(manifest, tarFile("package/../escape.js", "x")), join(root, "unsafe"))).toThrow(/unsafe tar path/);
    expect(() => extractPackedArchive(archive(manifest, manifest), join(root, "duplicate"))).toThrow(/duplicate tar entry/);
  });

  it("typechecks each applicable snippet and records explicit exemptions", () => {
    const root = scratch();
    packedFixture(root);
    const blocks = extractDocBlocks("docs/example.md", [
      "```ts", 'import { greet } from "@aura3d/engine";', 'greet("reader");', "```",
      "```ts", 'import { greet } from "@aura3d/engine";', "greet(42);", "```",
      "<!-- aura3d-docs-example: exempt pseudocode needs application-specific data -->", "```ts", "example(...) ", "```"
    ].join("\n"));
    const report = typecheckDocBlocks(blocks, { projectDir: root });
    expect(report.checked).toHaveLength(2);
    expect(report.diagnostics.some((entry) => entry.message.includes("number") && entry.message.includes("string"))).toBe(true);
    expect(report.exemptions).toEqual([expect.objectContaining({ reason: "pseudocode needs application-specific data" })]);
    expect(report.pass).toBe(false);
  });

  it("rejects a missing, skipped, failed or duplicate supported example check", () => {
    const catalog = [{ id: "starter", kind: "starter-example" as const, sourcePath: "apps/starter" }];
    expect(validateExampleChecks(catalog, [])).not.toEqual([]);
    for (const status of ["skipped", "failed"] as const) {
      expect(validateExampleChecks(catalog, [{ id: "starter", status }])).not.toEqual([]);
    }
    const pass = { id: "starter", status: "passed", checks: [
      { id: "install", status: "passed", exitCode: 0 },
      { id: "build", status: "passed", exitCode: 0 }
    ] };
    expect(validateExampleChecks(catalog, [pass])).toEqual([]);
    expect(validateExampleChecks(catalog, [pass, pass])).not.toEqual([]);
    expect(validateExampleChecks(catalog, [{ ...pass, checks: [pass.checks[0]!, { id: "build", status: "skipped", exitCode: null }] }])).not.toEqual([]);
  });

  it("rejects missing browser catalog cases and visually blank or mismatched subjects", () => {
    expect(catalogSetErrors(["a", "b"], ["a"])).toContain("missing b");
    expect(catalogSetErrors(["a"], ["a", "a"])).toContain("duplicate observed catalog ID");
    const reference = new Uint8Array(16 * 16 * 3);
    for (let pixel = 0; pixel < 16 * 16; pixel++) reference.fill(pixel % 2 ? 200 : 20, pixel * 3, pixel * 3 + 3);
    const regions = [{ label: "subject" as const, x: 0, y: 0, width: 16, height: 16, pixelThreshold: 10, maxMeanDifference: 5, maxChangedRatio: 0.1 }];
    expect(compareCatalogRegions(reference, reference, 16, 16, regions)[0]?.pass).toBe(true);
    expect(compareCatalogRegions(new Uint8Array(reference.length), reference, 16, 16, regions)[0]?.pass).toBe(false);
    expect(compareCatalogRegions(new Uint8Array(reference.length), new Uint8Array(reference.length), 16, 16, regions)[0]?.pass).toBe(false);
  });
});
