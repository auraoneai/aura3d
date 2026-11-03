import { mkdtempSync, mkdirSync, rmSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { classifyDocBlocks, discoverDocBlocks, discoverDocFiles, typecheckDocBlocks } from "../../../tools/docs-codeblocks/index.js";

const temporary: string[] = [];
function scratch(): string {
  const path = mkdtempSync(join(tmpdir(), "aura3d-doc-discovery-"));
  temporary.push(path);
  return path;
}
function write(root: string, file: string, content: string): void {
  const path = join(root, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}
const block = (body: string): string => `\`\`\`ts\n${body}\n\`\`\`\n`;

afterEach(() => { for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true }); });

describe("documentation snippet discovery", () => {
  it("inventories app and example READMEs deterministically without generated, dependency, vendor or linked trees", () => {
    const root = scratch();
    const outside = scratch();
    write(root, "README.md", block("const root = 1;"));
    write(root, "docs/guide.md", block("const guide = 1;"));
    write(root, "packages/public/package.json", '{"name":"example-public"}');
    write(root, "packages/public/README.md", block("const publicPackage = 1;"));
    write(root, "packages/private/package.json", '{"name":"example-private","private":true}');
    write(root, "packages/private/README.md", block("const privatePackage = 1;"));
    write(root, "apps/product/README.md", block("const product = 1;"));
    write(root, "apps/product/nested/README.md", block("const nested = 1;"));
    write(root, "apps/product/not-a-readme.md", block("const unrelated = 1;"));
    write(root, "apps/product/empty/README.md", "A readme without fences.\n");
    write(root, "examples/demo/README.md", '<!-- aura3d-docs-example: exempt pseudocode depends on application state -->\n' + block("missingApplicationValue();"));
    for (const excluded of ["node_modules", ".git", ".codex", ".cache", "dist", "build", "coverage", "vendor", "generated", "__generated__", ".next"]) {
      write(root, `apps/product/${excluded}/README.md`, block("const excluded = 1;"));
    }
    write(outside, "README.md", block("const outside = 1;"));
    symlinkSync(outside, join(root, "examples", "linked"), "dir");
    mkdirSync(join(root, "apps", "product", "linked-file"));
    symlinkSync(join(outside, "README.md"), join(root, "apps", "product", "linked-file", "README.md"));

    const expected = ["README.md", "apps/product/README.md", "apps/product/empty/README.md", "apps/product/nested/README.md", "docs/guide.md", "examples/demo/README.md", "packages/public/README.md"];
    expect(discoverDocFiles(root)).toEqual(expected);
    expect(discoverDocFiles(root)).toEqual(expected);
    const blocks = discoverDocBlocks(root);
    expect(blocks.map(({ file }) => file)).toEqual(expected.filter((file) => !file.includes("/empty/")));
    const demo = classifyDocBlocks(blocks).find(({ block: entry }) => entry.file === "examples/demo/README.md");
    expect(demo).toMatchObject({ disposition: "exempt", reason: "pseudocode depends on application state" });
  });

  it("sends applicable README code to the candidate checker and retains diagnostics and explicit exemptions", () => {
    const root = scratch();
    write(root, "apps/demo/README.md", block('import { value } from "@aura3d/engine";\nconst n: string = value;'));
    write(root, "examples/demo/README.md", '<!-- aura3d-docs-example: exempt illustrative pseudocode -->\n' + block("unbound();"));
    write(root, "candidate/node_modules/@aura3d/engine/package.json", '{"name":"@aura3d/engine","types":"index.d.ts"}');
    write(root, "candidate/node_modules/@aura3d/engine/index.d.ts", "export declare const value: number;\n");
    const report = typecheckDocBlocks(discoverDocBlocks(root), { projectDir: join(root, "candidate") });
    expect(report.checked.map(({ file }) => file)).toEqual(["apps/demo/README.md"]);
    expect(report.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ file: "apps/demo/README.md", code: 2322 })]));
    expect(report.exemptions).toEqual([expect.objectContaining({ file: "examples/demo/README.md", reason: "illustrative pseudocode" })]);
    expect(report.pass).toBe(false);
  }, 30_000);

  it("reports the offending README for malformed fences and bounds discovery depth and file size", () => {
    const malformed = scratch();
    write(malformed, "apps/demo/README.md", "```ts\nconst bad = 1;\n");
    expect(() => discoverDocBlocks(malformed)).toThrow(/apps\/demo\/README\.md:1 has an unclosed code fence/);

    const deep = scratch();
    write(deep, `examples/${Array.from({ length: 66 }, () => "x").join("/")}/README.md`, block("const deep = 1;"));
    expect(() => discoverDocFiles(deep)).toThrow(/documentation discovery exceeded depth limit at examples\//);

    const large = scratch();
    write(large, "apps/demo/README.md", "");
    truncateSync(join(large, "apps/demo/README.md"), 16 * 1024 * 1024 + 1);
    expect(() => discoverDocBlocks(large)).toThrow(/documentation file exceeds .* bytes: apps\/demo\/README\.md/);
  });

  it("resolves explicit source-context imports from copied local files against packed declarations", () => {
    const root = scratch();
    const candidate = join(root, "candidate");
    write(root, "apps/demo/src/main.ts", "// Source context for the documentation snippet.\n");
    write(root, "apps/demo/README.md", '<!-- aura3d-docs-example: source src/main.ts -->\n' + block([
      'import { assets } from "../../../src/aura-assets";',
      'import { describeAsset } from "@aura3d/engine";',
      'const result: string = describeAsset(assets.item);'
    ].join("\n")));
    write(root, "src/aura-assets.ts", 'import type { Asset } from "@aura3d/engine";\nexport const assets: { item: Asset } = { item: { id: "demo" } };\n');
    write(root, "candidate/node_modules/@aura3d/engine/package.json", '{"name":"@aura3d/engine","types":"index.d.ts"}');
    write(root, "candidate/node_modules/@aura3d/engine/index.d.ts", 'export interface Asset { id: string }\nexport declare function describeAsset(asset: Asset): string;\n');
    // A workspace-installed package would make this example fail if the
    // checker accidentally resolved outside its packed candidate.
    write(root, "node_modules/@aura3d/engine/package.json", '{"name":"@aura3d/engine","types":"index.d.ts"}');
    write(root, "node_modules/@aura3d/engine/index.d.ts", 'export interface Asset { wrong: boolean }\nexport declare function describeAsset(asset: Asset): number;\n');
    const blocks = discoverDocBlocks(root);
    expect(blocks[0]).toMatchObject({ file: "apps/demo/README.md", sourceContext: "src/main.ts" });
    const report = typecheckDocBlocks(blocks, { projectDir: candidate, sourceRoot: root });
    expect(report.diagnostics).toEqual([]);
    expect(report.pass).toBe(true);
  }, 30_000);

  it("rejects workspace package source, symlinks, escape paths and external reference files", () => {
    const root = scratch();
    const outside = scratch();
    const candidate = join(root, "candidate");
    write(root, "apps/demo/src/main.ts", "// Context.\n");
    write(root, "packages/engine/private.ts", "export const privateValue = 1;\n");
    write(root, "candidate/private.ts", "export const candidateValue = 1;\n");
    write(root, "node_modules/@aura3d/unstaged/package.json", '{"name":"@aura3d/unstaged","types":"index.d.ts"}');
    write(root, "node_modules/@aura3d/unstaged/index.d.ts", "export declare const workspaceOnly: number;\n");
    write(outside, "leak.ts", "export const leaked = 1;\n");
    write(outside, "globals.d.ts", "declare const outsideGlobal: number;\n");
    symlinkSync(join(outside, "leak.ts"), join(root, "apps/demo/src/link.ts"));
    write(root, "apps/demo/README.md", '<!-- aura3d-docs-example: source src/main.ts -->\n' + block([
      `/// <reference path="${join(outside, "globals.d.ts")}" />`,
      'import { privateValue } from "../../../packages/engine/private";',
      'import { leaked } from "./link";',
      'import { candidateValue } from "../../../candidate/private";',
      'import { workspaceOnly } from "@aura3d/unstaged";',
      'import { escaped } from "../../../../../outside";',
      "const result = privateValue + leaked + candidateValue + workspaceOnly + escaped + outsideGlobal;"
    ].join("\n")));
    const report = typecheckDocBlocks(discoverDocBlocks(root), { projectDir: candidate, sourceRoot: root });
    expect(report.pass).toBe(false);
    expect(report.diagnostics.map(({ message }) => message).join("\n")).toMatch(/workspace package/);
    expect(report.diagnostics.map(({ message }) => message).join("\n")).toMatch(/symbolic link/);
    expect(report.diagnostics.map(({ message }) => message).join("\n")).toMatch(/isolated candidate project/);
    expect(report.diagnostics.map(({ message }) => message).join("\n")).toMatch(/escapes the repository/);
    expect(report.diagnostics.some(({ code }) => code === 6053)).toBe(true);
    expect(report.diagnostics.some(({ code, message }) => code === 2307 && message.includes("@aura3d/unstaged"))).toBe(true);
    expect(report.diagnostics.some(({ code, message }) => code === 2304 && message.includes("outsideGlobal"))).toBe(true);
  }, 30_000);

  it("allows installed non-Aura peer types to resolve their own dependencies through package-manager symlinks", () => {
    const root = scratch();
    const candidate = join(root, "candidate");
    write(root, "apps/demo/README.md", block('import { label } from "peer-example";\nconst text: string = label;'));
    const store = "node_modules/.pnpm/peer-example/node_modules";
    write(root, `${store}/peer-example/package.json`, '{"name":"peer-example","types":"index.d.ts"}');
    write(root, `${store}/peer-example/index.d.ts`, 'import type { Name } from "peer-dependency";\nexport declare const label: Name;\n');
    write(root, `${store}/peer-dependency/package.json`, '{"name":"peer-dependency","types":"index.d.ts"}');
    write(root, `${store}/peer-dependency/index.d.ts`, 'export type Name = string;\n');
    mkdirSync(join(candidate, "node_modules"), { recursive: true });
    symlinkSync(join(root, store, "peer-example"), join(candidate, "node_modules", "peer-example"), "dir");
    const report = typecheckDocBlocks(discoverDocBlocks(root), { projectDir: candidate, sourceRoot: root });
    expect(report.diagnostics).toEqual([]);
    expect(report.pass).toBe(true);
  }, 30_000);
});
