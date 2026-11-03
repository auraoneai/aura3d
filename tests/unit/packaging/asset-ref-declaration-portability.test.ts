// A consumer compiled with `declaration: true` that exports an inferred object
// holding `assets.x` refs must emit without TS4023/TS2742: every type in an
// asset ref has to be nameable from the public `@aura3d/engine` entry.
//
// Packed-consumer shape without packing: the temp project's
// node_modules/@aura3d/engine has a manifest whose only export is "." -> the
// public entry, and its `src` is a symlink to packages/engine/src (no copy).
// `preserveSymlinks` keeps those files inside the package boundary, so the
// declaration emitter cannot fall back to a deep or relative path.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const root = resolve(process.cwd());
let project: string;

function diagnosticsText(diagnostics: readonly ts.Diagnostic[]): string {
  return diagnostics.map((d) => `TS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`).join("\n");
}

function compilerOptions(): ts.CompilerOptions {
  const basePaths = (JSON.parse(readFileSync(join(root, "tsconfig.base.json"), "utf8")) as { compilerOptions: { paths: Record<string, string[]> } }).compilerOptions.paths;
  // Sibling workspace packages resolve to their sources; `@aura3d/engine` itself
  // must resolve through the staged package manifest only.
  const paths: Record<string, string[]> = {};
  for (const [specifier, targets] of Object.entries(basePaths)) {
    if (!specifier.startsWith("@aura3d/engine")) paths[specifier] = targets.map((target) => join(root, target));
  }
  return {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
    strict: true,
    skipLibCheck: true,
    types: [],
    preserveSymlinks: true,
    paths
  };
}

function emitDeclarations(file: string, source: string): { diagnostics: string; dts: string } {
  const path = join(project, file);
  writeFileSync(path, source);
  const options = { ...compilerOptions(), declaration: true, emitDeclarationOnly: true, outDir: join(project, "out") };
  const program = ts.createProgram([path], options);
  const sourceFile = program.getSourceFile(path)!;
  let dts = "";
  const result = program.emit(sourceFile, (_name, text) => { dts += text; });
  return { diagnostics: diagnosticsText([...program.getSemanticDiagnostics(sourceFile), ...result.diagnostics]), dts };
}

describe("asset-ref declaration portability for consumers", () => {
  beforeAll(() => {
    project = mkdtempSync(join(tmpdir(), "aura-asset-ref-dts-"));
    const engine = join(project, "node_modules/@aura3d/engine");
    mkdirSync(engine, { recursive: true });
    writeFileSync(join(engine, "package.json"), JSON.stringify({
      name: "@aura3d/engine", type: "module", exports: { ".": { types: "./src/public/index.ts" } }
    }));
    symlinkSync(join(root, "packages/engine/src"), join(engine, "src"), "dir");
    writeFileSync(join(project, "package.json"), JSON.stringify({ private: true, type: "module" }));
  });
  afterAll(() => { if (project) rmSync(project, { recursive: true, force: true }); });

  it("emits an inferred `{ a: assets.robot }` export without TS4023", { timeout: 60_000 }, () => {
    const { diagnostics, dts } = emitDeclarations("consumer.ts", [
      `import { defineAuraAssets } from "@aura3d/engine";`,
      `const assets = defineAuraAssets({ robot: { type: "model", format: "glb", url: "/aura-assets/robot.glb" } });`,
      `export const bundle = { a: assets.robot };`,
      ""
    ].join("\n"));
    expect(diagnostics).toBe("");
    expect(dts).toContain(`import("@aura3d/engine").AuraAssetRefIdentity<"model", "robot">`);
    expect(dts).not.toMatch(/auraAssetRefBrand|\/src\//);

    // The emitted declaration is itself a valid input for a downstream consumer
    // and keeps the ref's brand: it is accepted by `model()` and AuraAssetRef.
    writeFileSync(join(project, "emitted.d.ts"), dts);
    const downstream = join(project, "downstream.ts");
    writeFileSync(downstream, [
      `import { model, type AuraAssetRef } from "@aura3d/engine";`,
      `import { bundle } from "./emitted.js";`,
      `const ref: AuraAssetRef<"model", "robot"> = bundle.a;`,
      `export const node = model(ref);`,
      `// @ts-expect-error a plain definition is not a branded ref`,
      `model({ type: "model", format: "glb", url: "/aura-assets/robot.glb" });`,
      ""
    ].join("\n"));
    const program = ts.createProgram([downstream], { ...compilerOptions(), noEmit: true });
    const files = [downstream, join(project, "emitted.d.ts")].map((file) => program.getSourceFile(file));
    expect(files.every(Boolean)).toBe(true);
    expect(diagnosticsText(files.flatMap((file) => program.getSemanticDiagnostics(file!)))).toBe("");
  });

  it("emits a re-keyed asset map built from an `AuraAssetMap` catalog (the generated aura-assets shape)", { timeout: 60_000 }, () => {
    const { diagnostics } = emitDeclarations("catalog.ts", [
      `import { defineAuraAssets, type AuraAssetDefinition, type AuraAssetMap } from "@aura3d/engine";`,
      `type Defs = { readonly hero: AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string } };`,
      `const catalog: AuraAssetMap<Defs> = defineAuraAssets({ hero: { type: "model", format: "glb", url: "/aura-assets/hero.glb" } });`,
      `export const assets = { hero: catalog.hero, props: { again: catalog.hero } };`,
      ""
    ].join("\n"));
    expect(diagnostics).toBe("");
  });
});
