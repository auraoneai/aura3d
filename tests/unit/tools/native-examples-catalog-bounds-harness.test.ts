import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { boundsQueryHitError } from "../../browser/native-examples-catalog.spec.js";

function generatedEntry(id: string): string {
  const file = ts.createSourceFile(
    "tools/agent-examples/index.ts",
    readFileSync(resolve(process.cwd(), "tools/agent-examples/index.ts"), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const owner = file.statements.find((statement): statement is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(statement) && statement.name?.text === "makeCapabilityProject"
  );
  if (!owner?.body) throw new Error("Capability project generator not found");
  let template: ts.TemplateExpression | undefined;
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "writeFileSync") {
      const [path, content] = node.arguments;
      if (path && ts.isCallExpression(path) && path.arguments.some((argument) =>
        ts.isStringLiteral(argument) && argument.text === "src/main.ts"
      )) {
        if (!content || !ts.isTemplateExpression(content)) throw new Error("Capability entry is not a template");
        template = content;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(owner.body);
  if (!template) throw new Error("Generated capability entry not found");
  const entry = template as ts.TemplateExpression;
  let text = entry.head.text;
  for (const span of entry.templateSpans) {
    if (span.expression.getText(file) !== "JSON.stringify(id)") throw new Error("Unrecognized capability entry interpolation");
    text += JSON.stringify(id) + span.literal.text;
  }
  return text;
}

async function executeGeneratedEntry(id: string, hit: unknown = {
  nodeName: "subject", point: [-1, 0.8, 0.5], normal: [0, 0, 1], distance: 5.5
}) {
  const app = { scene: { nodes: [] }, dispose: vi.fn() };
  const mount = vi.fn(async () => app);
  const query = vi.fn(() => hit);
  const window = {} as Record<string, unknown>;
  const document = { body: { dataset: {} as Record<string, string> } };
  const entry = generatedEntry(id);
  const observableEntry = entry.replace(/^void (?=mountNativeCapabilityScenario\()/m, "return ");
  if (observableEntry === entry) throw new Error("Capability mount promise is not observable");
  const code = ts.transpileModule(observableEntry, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
  }).outputText;
  const localRequire = (name: string): unknown => {
    if (name === "./aura-assets") return { assets: { kaykitBarbarian: { hash: "sha256-test" } } };
    if (name === "./scenario") return { mountNativeCapabilityScenario: mount, queryNativeScenarioBounds: query };
    throw new Error(`Unexpected generated import ${name}`);
  };
  let error: unknown;
  try {
    await new Function("require", "exports", "window", "document", code)(localRequire, {}, window, document);
  } catch (caught) {
    error = caught;
  }
  return { app, hit, mount, query, window, document, error };
}

describe("generated native capability catalog harness", () => {
  it("typechecks the generated bounds-query and unrelated scenario entries", () => {
    const files: Record<string, string> = {
      "/virtual-catalog/bounds.ts": generatedEntry("bounds-query"),
      "/virtual-catalog/geometry.ts": generatedEntry("custom-geometry"),
      "/virtual-catalog/aura-assets.ts": "export const assets = { kaykitBarbarian: {} };",
      "/virtual-catalog/scenario.ts": `
        export type App = { dispose(): void };
        export type Hit = { nodeName: string | undefined; distance: number; point: readonly [number, number, number]; normal: readonly [number, number, number] };
        export declare function mountNativeCapabilityScenario(id: "bounds-query" | "custom-geometry", options: { target: string; asset: unknown; animationClip: string }): Promise<App>;
        export declare function queryNativeScenarioBounds(app: App): Hit | undefined;
      `
    };
    const options: ts.CompilerOptions = {
      noEmit: true, strict: true, skipLibCheck: true, types: [],
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      lib: ["lib.es2022.d.ts", "lib.dom.d.ts"]
    };
    const host = ts.createCompilerHost(options);
    const readFile = host.readFile.bind(host);
    const fileExists = host.fileExists.bind(host);
    const directoryExists = host.directoryExists?.bind(host);
    const getSourceFile = host.getSourceFile.bind(host);
    host.readFile = (path) => files[path] ?? readFile(path);
    host.fileExists = (path) => path in files || fileExists(path);
    host.directoryExists = (path) => path === "/virtual-catalog" || (directoryExists?.(path) ?? false);
    host.getSourceFile = (path, languageVersion, onError, shouldCreateNewSourceFile) =>
      path in files ? ts.createSourceFile(path, files[path]!, languageVersion, true) :
        getSourceFile(path, languageVersion, onError, shouldCreateNewSourceFile);
    const program = ts.createProgram(["/virtual-catalog/bounds.ts", "/virtual-catalog/geometry.ts"], options, host);
    const errors = ts.getPreEmitDiagnostics(program).map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
    expect(errors).toEqual([]);
  }, 20_000);

  it("invokes the documented bounds query for the bounds-query scenario", async () => {
    const result = await executeGeneratedEntry("bounds-query");
    expect(result.mount).toHaveBeenCalledOnce();
    expect(result.query).toHaveBeenCalledOnce();
    expect(result.query).toHaveBeenCalledWith(result.app);
    expect(result.error).toBeUndefined();
    expect(result.app.dispose).not.toHaveBeenCalled();
    expect(result.document.body.dataset.aura3dReady).toBe("true");
    expect(result.window.__AURA_EXAMPLE_BOUNDS_HIT__).toEqual(result.hit);
  });

  it.each([
    ["missing", null],
    ["wrong subject", { nodeName: "floor", point: [-1, 0.8, 0], normal: [0, 0, 1], distance: 6 }],
    ["non-finite distance", { nodeName: "subject", point: [-1, 0.8, 0], normal: [0, 0, 1], distance: Infinity }]
  ])("does not mark bounds-query ready for a %s hit", async (_label, hit) => {
    const result = await executeGeneratedEntry("bounds-query", hit);
    expect(result.query).toHaveBeenCalledOnce();
    expect(result.error).toBeDefined();
    expect(result.document.body.dataset.aura3dReady).not.toBe("true");
    expect(result.window.__AURA_EXAMPLE_BOUNDS_HIT__).toBeUndefined();
    expect(result.app.dispose).toHaveBeenCalledOnce();
  });

  it("does not invoke the bounds query for unrelated scenarios", async () => {
    const result = await executeGeneratedEntry("custom-geometry");
    expect(result.mount).toHaveBeenCalledOnce();
    expect(result.query).not.toHaveBeenCalled();
    expect(result.error).toBeUndefined();
    expect(result.document.body.dataset.aura3dReady).toBe("true");
  });

  it("rejects missing, wrong-target, non-finite and off-ray browser observations", () => {
    const valid = { nodeName: "subject", point: [-1, 0.8, 0.5], normal: [0, 0, 1], distance: 5.5 };
    expect(boundsQueryHitError(valid)).toBeNull();
    for (const hit of [
      null,
      { ...valid, nodeName: "floor" },
      { ...valid, distance: Infinity },
      { ...valid, distance: 0 },
      { ...valid, point: [0, 0.8, 0.5] },
      { ...valid, point: [-1, 0.8, 1] },
      { ...valid, normal: [0, 0, 0] }
    ]) expect(boundsQueryHitError(hit)).not.toBeNull();
  });
});
