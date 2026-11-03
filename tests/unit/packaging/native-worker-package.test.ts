import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as workerApi from "../../../packages/engine/src/public/worker.js";
import { assertWorkerPackageLayout, hasBundlerSafeWorkerFactory } from "../../../tools/finalize-dist/worker-layout.mjs";

const roots: string[] = [];
const factory = 'export function createWorkerRendererWorker() { return new Worker(new URL("./render.worker.js", import.meta.url), { type: "module" }); }';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "aura-worker-package-"));
  roots.push(root);
  const app = join(root, "dist/engine/agent-api/app");
  const write = (name: string, source: string) => {
    const file = join(app, name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, source);
  };
  write("render.worker.js", 'import { installWorkerRenderer as install } from "./workerRuntime.js"; install(globalThis);');
  write("workerFactory.js", factory);
  write("workerRuntime.js", 'import "./canvas.js"; export function installWorkerRenderer() { return import("./lazy.js"); }');
  write("canvas.js", 'export * from "./shared.js";');
  write("shared.js", "export const canvas = true;");
  write("lazy.js", 'import "external-package"; export const ready = true;');
  return { root, write, entryFile: join(app, "render.worker.js"), includedRoots: [join(root, "dist/engine")] };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("worker package layout", () => {
  it("exposes the static module-worker factory and includes the entry in package metadata", () => {
    const root = JSON.parse(readFileSync("package.json", "utf8"));
    const engine = JSON.parse(readFileSync("packages/engine/package.json", "utf8"));
    const build = JSON.parse(readFileSync("tsconfig.build.json", "utf8"));
    const factorySource = readFileSync("packages/engine/src/agent-api/app/workerFactory.ts", "utf8");
    expect(typeof workerApi.createWorkerRendererWorker).toBe("function");
    expect(hasBundlerSafeWorkerFactory(factorySource)).toBe(true);
    expect(root.exports["./worker"]).toMatchObject({ import: "./dist/engine/public/worker.js", types: "./dist/engine/public/worker.d.ts" });
    expect(root.files).toContain("dist/engine");
    expect(root.sideEffects).toContain("./dist/engine/agent-api/app/render.worker.js");
    expect(engine.sideEffects).toContain("./src/agent-api/app/render.worker.ts");
    expect(engine.sideEffects).toContain("./dist/agent-api/app/render.worker.js");
    expect(build.include).toContain("packages/*/src/**/*.ts");
  });

  it("requires the static nested constructor and module type", () => {
    expect(hasBundlerSafeWorkerFactory(factory)).toBe(true);
    expect(hasBundlerSafeWorkerFactory(factory.replace('type: "module"', 'type: "classic"'))).toBe(false);
    expect(hasBundlerSafeWorkerFactory('export function createWorkerRendererWorker() { const url = new URL("./render.worker.js", import.meta.url); return new Worker(url, { type: "module" }); }')).toBe(false);
    expect(hasBundlerSafeWorkerFactory(`// ${factory}\nexport const placeholder = true;`)).toBe(false);
  });

  it("accepts an installed worker entry and its static and dynamic dependency graph", () => {
    const candidate = fixture();
    expect(() => assertWorkerPackageLayout(candidate)).not.toThrow();
  });

  it("rejects missing transitive and lazy dependencies", () => {
    const candidate = fixture();
    candidate.write("lazy.js", 'export * from "./missing.js";');
    expect(() => assertWorkerPackageLayout(candidate)).toThrow(/missing worker module dependency: .*missing\.js/);
    candidate.write("missing.js", "export const present = true;");
    expect(() => assertWorkerPackageLayout(candidate)).not.toThrow();
    candidate.write("canvas.js", 'import "./missing-static.js";');
    expect(() => assertWorkerPackageLayout(candidate)).toThrow(/missing worker module dependency: .*missing-static\.js/);
  });

  it("rejects worker dependencies excluded from the published package", () => {
    const candidate = fixture();
    candidate.write("lazy.js", 'import "../../../../outside.js";');
    expect(() => assertWorkerPackageLayout(candidate)).toThrow(/outside packaged files/);
  });

  it("keeps the host factory out of the worker graph", () => {
    const candidate = fixture();
    candidate.write("shared.js", 'import "./workerFactory.js";');
    expect(() => assertWorkerPackageLayout(candidate)).toThrow(/imports its host-only factory/);
  });

  it("rejects an emitted factory that a bundler cannot recognize", () => {
    const candidate = fixture();
    candidate.write("workerFactory.js", factory.replace('type: "module"', 'type: "classic"'));
    expect(() => assertWorkerPackageLayout(candidate)).toThrow(/lacks a static module-worker factory/);
  });

  it("rejects an entry that does not install the worker runtime", () => {
    const candidate = fixture();
    candidate.write("render.worker.js", 'import { installWorkerRenderer } from "./workerRuntime.js";');
    expect(() => assertWorkerPackageLayout(candidate)).toThrow(/does not install its runtime/);
    candidate.write("render.worker.js", 'import { installWorkerRenderer } from "./workerRuntime.js"; function unused() { installWorkerRenderer(globalThis); }');
    expect(() => assertWorkerPackageLayout(candidate)).toThrow(/does not install its runtime/);
  });
});
