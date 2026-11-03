import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertPackagedWorkerFactory, assertSelfContainedWorker, assertZstdPackageMetadata, assertZstdWorkerFactory, assertZstdWorkerPayload, emitPackagedWorker, workerBundleOptions } from "../../../tools/finalize-dist/worker-bundle.mjs";

const roots: string[] = [];
const factory = readFileSync("packages/engine/src/agent-api/app/workerFactoryPackaged.ts", "utf8");
const zstdLicense = readFileSync("packages/assets/vendor/zstd/LICENSE.txt", "utf8");
const zstdProvenanceText = readFileSync("packages/assets/vendor/zstd/provenance.json", "utf8");
const zstdProvenance = JSON.parse(zstdProvenanceText);
const zstdLiteral = readFileSync("packages/assets/src/workers/zstd.worker.ts", "utf8").match(/^const WASM_PACKAGE = (".*");$/m)?.[1];
if (!zstdLiteral) throw new Error("Missing embedded Zstandard payload");
const zstdWorker = `const WASM_PACKAGE = ${zstdLiteral}; const expectedBytes = 1; const notice = WASM_PACKAGE.slice(0, WASM_PACKAGE.indexOf("\\n--AURA3D-ZSTD-WASM--\\n")); self.postMessage({ok:true,notice});\n//# sourceMappingURL=zstd.worker.js.map\n`;
const zstdFactory = 'export function fallback() { return new Worker(new URL("../workers/zstd.worker.js", import.meta.url), {type:"module"}); }';
const rootManifest = { files: ["dist/assets", "dist/engine"], sideEffects: ["./dist/assets/workers/zstd.worker.js", "./dist/engine/agent-api/app/worker-assets/zstd.worker.bundle.js"] };
const assetsManifest = { files: ["dist", "vendor"], sideEffects: ["./dist/workers/zstd.worker.js"] };
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "aura-worker-release-"));
  roots.push(root);
  const write = (path: string, value: string) => { const file = join(root, path); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, value); };
  for (const [path, value] of Object.entries({
    "dist/engine/agent-api/app/render.worker.js": "original render entry",
    "dist/engine/agent-api/app/workerFactory.js": "original factory",
    "dist/engine/agent-api/app/workerFactoryPackaged.js": factory,
    "dist/animation/pose/retarget.worker.js": "original retarget entry",
    "dist/assets/workers/ktx2.worker.js": "classic ktx worker",
    "dist/assets/workers/zstd.worker.js": zstdWorker,
    "packages/assets/dist/workers/zstd.worker.js": zstdWorker,
    "dist/assets/loaders/ZstdDecoder.js": zstdFactory,
    "packages/assets/dist/loaders/ZstdDecoder.js": zstdFactory,
    "package.json": JSON.stringify(rootManifest),
    "packages/assets/package.json": JSON.stringify(assetsManifest),
    "packages/assets/vendor/zstd/LICENSE.txt": zstdLicense,
    "packages/assets/vendor/zstd/provenance.json": zstdProvenanceText,
    "packages/assets/vendor/basis/basis_transcoder.js": "var BASIS = function() {};",
    "packages/assets/vendor/basis/basis_transcoder.wasm": "basis wasm",
    "packages/assets/vendor/basis/LICENSE.txt": "basis permission text",
    "packages/assets/vendor/basis/LICENSE-zstd.txt": "zstd permission text",
    "packages/assets/vendor/draco/draco_decoder.js": "var DracoDecoderModule = function() {};",
    "packages/assets/vendor/draco/draco_decoder.wasm": "draco wasm",
    "packages/assets/vendor/draco/LICENSE.txt": "draco permission text",
    "packages/assets/vendor/meshopt/meshopt_decoder.mjs": "export const MeshoptDecoder = {};",
    "packages/assets/vendor/meshopt/LICENSE.txt": "meshopt permission text",
    "packages/engine/assets/vfx/aura-vfx-1k.png": "1k",
    "packages/engine/assets/vfx/aura-vfx-2k.png": "2k",
    "packages/engine/src/agent-api/assets/humanoid-fixture.glb": "humanoid"
  })) write(path, value);
  return { root, write, output: join(root, "dist/engine/agent-api/app/worker-assets") };
}

function fakeBuild(root: string) {
  const calls: Array<Record<string, unknown>> = [];
  const build = async (options: Record<string, unknown>) => {
    calls.push(options);
    const entry = (options.entryPoints as string[])[0]!;
    const marker = entry.endsWith("retarget.worker.js") ? "bake" : "init";
    return {
      outputFiles: [{ text: `self.postMessage({ type: "${marker}" });` }],
      metafile: { inputs: { [relative(root, entry)]: {} }, outputs: { output: { imports: [] } } }
    };
  };
  return { calls, build };
}

afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("release-time worker layout", () => {
  it("uses a single ESM output without splitting internal dynamic imports", () => {
    expect(workerBundleOptions("/repo", "/repo/dist/worker.js", "/repo/dist/out.js")).toMatchObject({ bundle: true, splitting: false, format: "esm", platform: "browser", write: false, metafile: true });
    expect(() => assertSelfContainedWorker('self.postMessage({type:"init"});', "worker", "init")).not.toThrow();
    expect(() => assertSelfContainedWorker('import "./missing.js"; self.postMessage({type:"init"});', "worker", "init")).toThrow(/static module imports/);
    expect(() => assertSelfContainedWorker('import("optional-package"); self.postMessage({type:"init"});', "worker", "init")).toThrow(/static module imports/);
  });

  it("requires statically discoverable URLs for the worker and every manifest asset", () => {
    expect(() => assertPackagedWorkerFactory(factory)).not.toThrow();
    expect(() => assertPackagedWorkerFactory(factory.replace("./worker-assets/basis_transcoder.wasm?no-inline", "./missing.wasm?no-inline"))).toThrow(/basisWasm/);
    expect(() => assertPackagedWorkerFactory(factory.replace('type: "module"', 'type: "classic"'))).toThrow(/module type/);
  });

  it("emits a self-contained worker, exact asset manifest targets and required notices", async () => {
    const { root, output } = fixture();
    const { build, calls } = fakeBuild(root);
    await emitPackagedWorker(root, build as never);
    expect(calls).toHaveLength(2);
    expect(calls.every((options) => options.bundle === true && options.splitting === false && options.format === "esm")).toBe(true);
    expect(readFileSync(join(root, "dist/engine/agent-api/app/workerFactory.js"), "utf8")).toBe(factory);
    expect(readFileSync(join(output, "render.worker.bundle.js"), "utf8")).toContain('postMessage({ type: "init" })');
    expect(readFileSync(join(output, "retarget.worker.bundle.js"), "utf8")).toContain('postMessage({ type: "bake" })');
    expect(readFileSync(join(output, "zstd.worker.bundle.js"), "utf8")).toBe(zstdWorker.replace(/\n\/\/# sourceMappingURL=.*\n$/, "\n"));
    expect(readFileSync(join(output, "LICENSE-zstd-decoder.txt"), "utf8")).toBe(zstdLicense);
    expect(readFileSync(join(output, "provenance-zstd.json"), "utf8")).toBe(zstdProvenanceText);
    expect(readFileSync(join(output, "basis_transcoder.mjs"), "utf8")).toContain("Modified by Aura3D");
    expect(readFileSync(join(output, "basis_transcoder.mjs"), "utf8")).toContain("basis permission text");
    expect(readFileSync(join(output, "basis_transcoder.js"), "utf8")).toContain("zstd permission text");
    expect(readFileSync(join(output, "draco_decoder.mjs"), "utf8")).toContain("draco permission text");
    expect(readFileSync(join(output, "meshopt_decoder.mjs"), "utf8")).toContain("meshopt permission text");
    expect(readFileSync(join(output, "ktx2.worker.js"), "utf8")).toBe("classic ktx worker");
    expect(readFileSync(join(output, "humanoid-fixture.glb"), "utf8")).toBe("humanoid");
  });

  it("requires the pinned decoder, executable notices and discoverable module worker in both packages", async () => {
    expect(() => assertZstdWorkerPayload(zstdWorker, zstdLicense, zstdProvenance)).not.toThrow();
    expect(() => assertZstdWorkerPayload(readFileSync("packages/assets/src/workers/zstd.worker.ts", "utf8"), zstdLicense, zstdProvenance)).not.toThrow();
    expect(() => assertZstdWorkerFactory(readFileSync("packages/assets/src/loaders/ZstdDecoder.ts", "utf8"))).not.toThrow();
    expect(() => assertZstdWorkerPayload(zstdWorker.replace("notice});", "other:notice});"), zstdLicense, zstdProvenance)).toThrow(/executable license/);
    expect(() => assertZstdWorkerPayload(zstdWorker, "different notice", zstdProvenance)).toThrow(/license notice differs/);
    expect(() => assertZstdWorkerPayload(zstdWorker, zstdLicense, { ...zstdProvenance, wasmSha256: "0".repeat(64) })).toThrow(/pinned provenance/);
    expect(() => assertZstdWorkerPayload(`import './missing.js'; ${zstdWorker}`, zstdLicense, zstdProvenance)).toThrow(/static module imports/);
    expect(() => assertZstdWorkerPayload(`const path = './other.js'; import(path); ${zstdWorker}`, zstdLicense, zstdProvenance)).toThrow(/dynamic module import/);
    expect(() => assertZstdWorkerFactory(zstdFactory)).not.toThrow();
    expect(() => assertZstdWorkerFactory(zstdFactory.replace("../workers/zstd.worker.js", "../workers/missing.js"))).toThrow(/static module-worker/);
    expect(() => assertZstdPackageMetadata(rootManifest, { ...assetsManifest, files: ["dist"] })).toThrow(/package metadata/);
    expect(() => assertZstdPackageMetadata(JSON.parse(readFileSync("package.json", "utf8")), JSON.parse(readFileSync("packages/assets/package.json", "utf8")))).not.toThrow();
    const { root, write } = fixture();
    write("packages/assets/dist/workers/zstd.worker.js", zstdWorker.replace("self.postMessage", "self.other"));
    await expect(emitPackagedWorker(root, fakeBuild(root).build as never)).rejects.toThrow(/worker protocol code is missing/);
    expect(readFileSync(join(root, "dist/engine/agent-api/app/workerFactory.js"), "utf8")).toBe("original factory");
  });

  it("rejects workspace or external inputs before replacing the published factory", async () => {
    const { root } = fixture();
    const build = async () => ({ outputFiles: [{ text: 'self.postMessage({type:"init"});' }], metafile: { inputs: { "packages/other/src/index.ts": {} }, outputs: { output: { imports: [] } } } });
    await expect(emitPackagedWorker(root, build as never)).rejects.toThrow(/outside emitted dist/);
    expect(readFileSync(join(root, "dist/engine/agent-api/app/workerFactory.js"), "utf8")).toBe("original factory");
    const external = async () => ({ outputFiles: [{ text: 'self.postMessage({type:"init"});' }], metafile: { inputs: { "dist/engine/agent-api/app/render.worker.js": {} }, outputs: { output: { imports: [{ external: true, path: "optional-package" }] } } } });
    await expect(emitPackagedWorker(root, external as never)).rejects.toThrow(/external package imports/);
    expect(readFileSync(join(root, "dist/engine/agent-api/app/workerFactory.js"), "utf8")).toBe("original factory");
  });
});
