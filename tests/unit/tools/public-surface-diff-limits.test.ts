import ts from "typescript";
import { describe, expect, it } from "vitest";
import { failureLines, reactPeerMajors } from "../../../tools/public-api-contract/index.js";
import { createDeclarationClosureBudget, createDeclarationClosureCache, declarationClosure } from "../../../tools/public-surface-diff/index.js";
import { createRuntimeExportAnalyzer } from "../../../tools/public-surface-diff/runtime-exports.js";
import type { PackedPackage } from "../../../tools/public-surface-diff/prepare-baseline.js";

/** An in-memory declaration file: `T0 -> T1 -> ... -> T{n-1}`, one symbol per link. */
function chain(length: number): { checker: ts.TypeChecker; root: ts.Symbol } {
  const name = "/virtual/chain.d.ts";
  const lines = Array.from({ length }, (_, index) => index === length - 1 ? `export type T${index} = string;` : `export type T${index} = T${index + 1};`);
  const text = lines.join("\n");
  const options: ts.CompilerOptions = { noLib: true, noEmit: true, target: ts.ScriptTarget.ES2022 };
  const host = ts.createCompilerHost(options);
  const readFile = host.readFile.bind(host), fileExists = host.fileExists.bind(host), getSourceFile = host.getSourceFile.bind(host);
  host.fileExists = (path) => path === name || fileExists(path);
  host.readFile = (path) => path === name ? text : readFile(path);
  host.getSourceFile = (path, languageVersion, onError, shouldCreate) =>
    path === name ? ts.createSourceFile(path, text, languageVersion, true) : getSourceFile(path, languageVersion, onError, shouldCreate);
  const program = ts.createProgram([name], options, host);
  const checker = program.getTypeChecker();
  const file = program.getSourceFile(name)!;
  const root = checker.getExportsOfModule(checker.getSymbolAtLocation(file)!).find((symbol) => symbol.name === "T0")!;
  return { checker, root };
}

describe("declaration closure bounds", () => {
  it("walks a closure past the former 20,000-symbol cap with the default budget", () => {
    const { checker, root } = chain(25_000);
    const budget = createDeclarationClosureBudget(121);
    expect(declarationClosure(checker, root, budget, "pkg#T0")).toMatch(/^[0-9a-f]{64}$/);
    expect(budget.spent).toBeGreaterThanOrEqual(25_000);
    expect(budget.spent).toBeLessThan(budget.global);
  });

  it("fails hard when one closure exceeds the per-entrypoint cap, naming the symbol", () => {
    const { checker, root } = chain(60);
    const budget = createDeclarationClosureBudget(1, { perEntrypoint: 50 });
    expect(() => declarationClosure(checker, root, budget, "@aura3d/x/sub#T0")).toThrow(/exceeds limit: @aura3d\/x\/sub#T0 reaches more than 50 symbols/);
  });

  it("scales the global cap with the entrypoint count and fails hard above it", () => {
    expect(createDeclarationClosureBudget(121).global).toBe(121 * createDeclarationClosureBudget(1).global);
    const { checker, root } = chain(40);
    const budget = createDeclarationClosureBudget(1, { perEntrypoint: 1_000, globalPerEntrypoint: 60 });
    const cache = createDeclarationClosureCache();
    expect(() => declarationClosure(checker, root, budget, "a#T0", cache)).not.toThrow();
    // The same root again is served from the cache and does not spend the budget twice.
    const spent = budget.spent;
    declarationClosure(checker, root, budget, "b#T0", cache);
    expect(budget.spent).toBe(spent);
    const other = chain(40);
    expect(() => declarationClosure(other.checker, other.root, budget, "c#T0")).toThrow(/exceed the global limit of 60 symbols at c#T0/);
  });

  it("digests equal closures equally and different closures differently", () => {
    const a = chain(30), b = chain(30), c = chain(31);
    const budget = createDeclarationClosureBudget(3);
    expect(declarationClosure(a.checker, a.root, budget)).toBe(declarationClosure(b.checker, b.root, budget));
    expect(declarationClosure(a.checker, a.root, budget)).not.toBe(declarationClosure(c.checker, c.root, budget));
  });
});

function packed(files: Record<string, string>): PackedPackage {
  const manifest = { name: "@aura3d/fixture", version: "1.0.0", type: "module" as const };
  const all = { "package.json": JSON.stringify(manifest), ...files };
  return { manifest, files: new Map(Object.entries(all).map(([path, text]) => [path, Buffer.from(text)])), paths: Object.keys(all) };
}

describe("packed runtime export analysis of real emitted JavaScript", () => {
  it("accepts a class `extends` clause but still rejects TypeScript-only syntax", () => {
    const ok = createRuntimeExportAnalyzer(packed({ "index.js": "class Base {}\nexport class Child extends Base {}\n" })).analyze("./index.js", "import");
    expect(ok).toMatchObject({ verified: true, names: ["Child"] });
    const bad = createRuntimeExportAnalyzer(packed({ "index.js": "export const value = 1 as number;\n" })).analyze("./index.js", "import");
    expect(bad.verified).toBe(false);
    expect(bad.issues.join("\n")).toMatch(/unsupported TypeScript or JSX syntax/);
    const typeArgs = createRuntimeExportAnalyzer(packed({ "index.js": "class Base {}\nexport class Child extends Base<string> {}\n" })).analyze("./index.js", "import");
    expect(typeArgs.verified).toBe(false);
  });

  it("does not let imports of external modules, dynamic import() or eval-style code change an ES module's names", () => {
    const source = [
      "import { readFileSync } from \"node:fs\";",
      "import Local from \"some-package\";",
      "export { Local };",
      "export { thing as renamed } from \"some-package\";",
      "export * as ns from \"some-package\";",
      "export const load = () => import(\"./lazy.js\");",
      "export const make = () => new Function(\"return 1\");",
      "export const read = () => globalThis[\"x\" + 1] ?? readFileSync;"
    ].join("\n");
    const result = createRuntimeExportAnalyzer(packed({ "index.js": source, "lazy.js": "export default 1;\n" })).analyze("./index.js", "import");
    expect(result.issues).toEqual([]);
    expect(result.verified).toBe(true);
    expect(result.names).toEqual(["Local", "load", "make", "ns", "read", "renamed"]);
  });

  it("still fails closed for `export *` from an external module, whose names cannot be known", () => {
    const result = createRuntimeExportAnalyzer(packed({ "index.js": "export * from \"some-package\";\nexport const own = 1;\n" })).analyze("./index.js", "import");
    expect(result.verified).toBe(false);
    expect(result.issues.join("\n")).toMatch(/external module is not verified: some-package/);
  });

  it("treats locals and property names called module or exports as ordinary names", () => {
    const source = [
      "export function run(module, exports) { return module + exports; }",
      "export const pick = ({ module: renamed }) => renamed;",
      "export class Holder { static module = null; module() { return Holder.module; } }",
      "export const box = { exports: {}, module: 1 };"
    ].join("\n");
    const result = createRuntimeExportAnalyzer(packed({ "index.js": source })).analyze("./index.js", "import");
    expect(result.issues).toEqual([]);
    expect(result.verified).toBe(true);
  });

  it("still rejects a free CommonJS binding in an ES module", () => {
    const result = createRuntimeExportAnalyzer(packed({ "index.js": "export const value = 1;\nmodule.exports = value;\n" })).analyze("./index.js", "import");
    expect(result.verified).toBe(false);
  });

  it("keeps dynamic evaluation fail-closed in CommonJS, where it can rewrite exports", () => {
    const manifest = { name: "@aura3d/fixture", version: "1.0.0" };
    const pkg: PackedPackage = {
      manifest,
      files: new Map([["package.json", Buffer.from(JSON.stringify(manifest))], ["index.js", Buffer.from("exports.a = 1;\nnew Function(\"exports\", \"exports.b = 2\")(exports);\n")]]),
      paths: ["package.json", "index.js"]
    };
    const result = createRuntimeExportAnalyzer(pkg).analyze("./index.js", "require");
    expect(result.verified).toBe(false);
    expect(result.issues.join("\n")).toMatch(/dynamic (Function|eval)/);
  });

  it("resolves a CommonJS wrapper over an ES module to the module's export names", () => {
    const manifest = { name: "@aura3d/fixture", version: "1.0.0", type: "module" as const };
    const files = { "package.json": JSON.stringify(manifest), "index.js": "export const a = 1;\nexport const b = 2;\n", "index.cjs": "\"use strict\";\nmodule.exports = require(\"./index.js\");\n" };
    const pkg: PackedPackage = { manifest, files: new Map(Object.entries(files).map(([path, text]) => [path, Buffer.from(text)])), paths: Object.keys(files) };
    const result = createRuntimeExportAnalyzer(pkg).analyze("./index.cjs", "require");
    expect(result.issues).toEqual([]);
    expect(result.names).toEqual(["a", "b"]);
  });
});

describe("public API contract diagnostics", () => {
  it("reads React majors from each comparator, never from minor or patch numbers", () => {
    expect(reactPeerMajors("^18.0.0 || ^19.0.0")).toEqual([18, 19]);
    expect(reactPeerMajors(">=18.2.0")).toEqual([18]);
    expect(reactPeerMajors("~19.1.4 || 20")).toEqual([19, 20]);
  });

  it("prints every failing check with its leading output, capped", () => {
    const check = (id: string, status: "passed" | "failed", detail = "") => ({ id, status, command: [], exitCode: status === "failed" ? 2 : 0, detail });
    const lines = failureLines([
      check("a:install", "passed"),
      check("a:types:NodeNext", "failed", "Command failed: npm exec tsc\nconsumer.ts(1,1): error TS2306: not a module\nsecond line"),
      check("a:import:@aura3d/x", "failed", "Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: nope")
    ], 200);
    expect(lines[0]).toBe("FAILED a:types:NodeNext (exit 2)");
    expect(lines).toContain("    consumer.ts(1,1): error TS2306: not a module");
    expect(lines).not.toContain("    Command failed: npm exec tsc");
    expect(lines).toContain("FAILED a:import:@aura3d/x (exit 2)");
    const many = failureLines(Array.from({ length: 500 }, (_, index) => check(`c:${index}`, "failed", "boom")), 200);
    expect(many).toHaveLength(200);
    expect(many.at(-1)).toMatch(/500 failing checks in total/);
  });
});
