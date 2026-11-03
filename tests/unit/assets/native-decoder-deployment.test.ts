import { mkdtempSync, mkdirSync, readFileSync, rmSync, existsSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import ts from "typescript";
import type { Plugin } from "vite";
import * as browserAssets from "@aura3d/assets/browser";
import { auraDecodersPlugin, auraDecodersVendorRoot, resolveAuraDecodersDeployment } from "../../../packages/assets/src/vite/auraDecoders";
import { installWorkerAssetsFromUrl, workerUrlWithAssets } from "../../../packages/core/src/workerAssets";
import { createAppAssetDecoders, typedGLBActorDecoderOptions } from "../../../packages/engine/src/agent-api/AssetDecoders";
import { createWorkerRenderer, installWorkerRenderer } from "../../../packages/engine/src/agent-api/app/workerRuntime";
import type { AuraWorkerEndpoint, AuraWorkerHostEndpoint, AuraWorkerRequest, AuraWorkerResponse } from "../../../packages/engine/src/agent-api/app/workerProtocol";
import type { AuraSceneSnapshot, WebGLSceneRenderer } from "../../../packages/engine/src/agent-api/nodes/types";
import { verifyExports } from "../../../tools/verify-exports/index";

// Observe registry configuration while retaining the real decoder behavior.
vi.mock("@aura3d/assets/browser", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aura3d/assets/browser")>();
  return { ...actual, createAssetDecoderRegistry: vi.fn(actual.createAssetDecoderRegistry) };
});

// This assignment is checked by TypeScript as well as using the hooks below.
const vitePluginContract: Plugin = auraDecodersPlugin();

type Middleware = (req: { url?: string; method?: string }, res: {
  statusCode: number;
  setHeader: (key: string, value: string) => void;
  end: (body?: unknown) => void;
}, next: () => void) => void;

const temporary: string[] = [];
afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function dir(): string {
  const name = mkdtempSync(path.join(tmpdir(), "aura-decoders-"));
  temporary.push(name);
  return name;
}

function installMiddleware(plugin: ReturnType<typeof auraDecodersPlugin>, preview = false): Middleware {
  let handler: Middleware | undefined;
  const server = { middlewares: { use(fn: Middleware) { handler = fn; } } };
  if (preview) plugin.configurePreviewServer(server); else plugin.configureServer(server);
  if (!handler) throw new Error("plugin did not install a middleware");
  return handler;
}

function request(handler: Middleware, url: string, method = "GET") {
  return new Promise<{ status: number; headers: Record<string, string>; body: unknown; next: boolean }>((resolve) => {
    const headers: Record<string, string> = {};
    const response = {
      statusCode: 0,
      setHeader(key: string, value: string) { headers[key.toLowerCase()] = value; },
      end(body?: unknown) { resolve({ status: response.statusCode, headers, body, next: false }); }
    };
    handler({ url, method }, response, () => resolve({ status: 0, headers, body: undefined, next: true }));
  });
}

const VIRTUAL_ID = "virtual:aura3d-decoder-deployment";

/** Evaluate the generated ESM in Node as well as inspecting it in hook tests. */
async function emittedDecoderBase(plugin: ReturnType<typeof auraDecodersPlugin>): Promise<string> {
  const id = plugin.resolveId(VIRTUAL_ID);
  if (!id) throw new Error("plugin did not resolve decoder deployment module");
  const source = plugin.load(id);
  if (!source) throw new Error("plugin did not generate decoder deployment module");
  const file = path.join(dir(), "decoder-deployment.mjs");
  writeFileSync(file, source);
  const result = await import(/* @vite-ignore */ pathToFileURL(file).href) as { decoderBasePath: string };
  return result.decoderBasePath;
}

describe("decoder URL deployment mapping", () => {
  it("exposes a Vite plugin", () => { expect(vitePluginContract.name).toBe("aura3d-aura-decoders"); });
  it("maps Vite bases and configured decoder directories to matching output paths", () => {
    expect(resolveAuraDecodersDeployment()).toEqual({ basePath: "/aura-decoders/", outputPath: "aura-decoders" });
    expect(resolveAuraDecodersDeployment("/tenant/app")).toEqual({ basePath: "/tenant/app/aura-decoders/", outputPath: "aura-decoders" });
    expect(resolveAuraDecodersDeployment("/tenant/", "/tenant/custom%20codecs/v1")).toEqual({
      basePath: "/tenant/custom%20codecs/v1/", outputPath: path.join("custom codecs", "v1")
    });
  });

  it.each([
    ["/", "../codec"], ["/", "//elsewhere/codec"], ["/", "/codec/../private"],
    ["/", "/codec/%2e%2e/private"], ["/", "/codec/%252e%252e/private"],
    ["/", "/codec/%2fprivate"], ["/", "/codec/%5cprivate"], ["/", "/codec/%zz"],
    ["/", "/codec/?v=1"], ["https://example.test/app/", undefined],
    ["./", undefined], ["/tenant/", "/other/codec/"], ["/tenant/", "/tenant/"]
  ])("rejects unsafe or incompatible base %s and prefix %s", (base, prefix) => {
    expect(() => resolveAuraDecodersDeployment(base, prefix)).toThrow();
  });
});

describe("opt-in decoder deployment module", () => {
  it.each([
    { command: "serve" as const, base: "/", configured: undefined, expected: "/aura-decoders/" },
    { command: "serve" as const, base: "/tenant/app/", configured: undefined, expected: "/tenant/app/aura-decoders/" },
    { command: "build" as const, base: "/tenant/", configured: "/tenant/custom%20codecs/v1", expected: "/tenant/custom%20codecs/v1/" }
  ])("uses the $command configuration's actual path $expected", async ({ command, base, configured, expected }) => {
    const root = dir();
    const plugin = auraDecodersPlugin({ basePath: configured, codecs: ["meshopt"] });
    plugin.configResolved({ command, root, base, build: { outDir: "build" } });
    const actual = await emittedDecoderBase(plugin);
    expect(actual).toBe(expected);
    const asset = `${actual}meshopt/meshopt_decoder.mjs`;
    expect((await request(installMiddleware(plugin), asset)).status).toBe(200);
    if (command === "build") {
      await plugin.closeBundle();
      const output = resolveAuraDecodersDeployment(base, configured).outputPath;
      expect(existsSync(path.join(root, "build", output, "meshopt", "meshopt_decoder.mjs"))).toBe(true);
      expect((await request(installMiddleware(plugin, true), asset)).status).toBe(200);
    }
  });

  it("keeps plugin instances isolated and does not infer a path from the page or bundle", async () => {
    vi.stubGlobal("location", { href: "https://aura.invalid/unrelated/spa/route", origin: "https://aura.invalid" });
    vi.stubGlobal("document", { baseURI: "https://aura.invalid/other/" });
    const first = auraDecodersPlugin();
    const second = auraDecodersPlugin({ basePath: "/two/codecs/" });
    first.configResolved({ command: "serve", base: "/one/" });
    second.configResolved({ command: "build", base: "/two/" });
    expect(await emittedDecoderBase(first)).toBe("/one/aura-decoders/");
    expect(await emittedDecoderBase(second)).toBe("/two/codecs/");
    expect(await emittedDecoderBase(first)).toBe("/one/aura-decoders/");
    const source = first.load(first.resolveId(VIRTUAL_ID)!);
    expect(source).toBe('export const decoderBasePath = "/one/aura-decoders/";\n');
  });

  it("rejects unresolved or invalid configuration and leaves unrelated module IDs alone", () => {
    const plugin = auraDecodersPlugin({ basePath: "/safe/codecs/" });
    const id = plugin.resolveId(VIRTUAL_ID);
    expect(id).toBe(`\0${VIRTUAL_ID}`);
    expect(plugin.resolveId("virtual:other-module")).toBeNull();
    expect(plugin.load("virtual:other-module")).toBeNull();
    expect(() => plugin.load(id!)).toThrow(/resolved Vite configuration/);
    plugin.configResolved({ base: "/safe/", command: "serve" });
    expect(plugin.load(id!)).toContain('"/safe/codecs/"');
    expect(() => plugin.configResolved({ base: "/different/", command: "serve" })).toThrow(/beneath the Vite base/);
    expect(() => plugin.load(id!)).toThrow(/resolved Vite configuration/);
  });

  it("publishes a declaration that a TypeScript Vite consumer can resolve", () => {
    const packageRoot = path.resolve("packages/assets");
    const manifest = JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8")) as {
      exports: Record<string, unknown>; files: string[];
    };
    expect(manifest.exports["./vite-client"]).toEqual({ types: "./vite-client.d.ts", import: "./vite-client.js" });
    expect(manifest.files).toEqual(expect.arrayContaining(["vite-client.d.ts", "vite-client.js"]));
    expect(verifyExports(process.cwd(), { packages: ["assets"] }).violations).toEqual([]);

    const consumer = dir();
    const scope = path.join(consumer, "node_modules", "@aura3d");
    mkdirSync(scope, { recursive: true });
    symlinkSync(packageRoot, path.join(scope, "assets"), "dir");
    const entry = path.join(consumer, "main.ts");
    writeFileSync(entry, [
      '/// <reference types="@aura3d/assets/vite-client" />',
      'import { decoderBasePath } from "virtual:aura3d-decoder-deployment";',
      "const base: string = decoderBasePath;",
      "// @ts-expect-error The generated path is a string, not a number.",
      "const invalid: number = decoderBasePath;",
      "export { base, invalid };"
    ].join("\n"));
    const program = ts.createProgram([entry], {
      noEmit: true, strict: true, module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler, target: ts.ScriptTarget.ES2022, types: []
    });
    expect(ts.getPreEmitDiagnostics(program).map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"))).toEqual([]);
  });
});

describe("decoder deployment forwarded to an app and worker", () => {
  it("forwards the resolved path through model options and worker init and remount", async () => {
    const plugin = auraDecodersPlugin({ basePath: "/tenant/custom/" });
    plugin.configResolved({ base: "/tenant/", command: "serve" });
    const basePath = await emittedDecoderBase(plugin);
    const assetOptions = { decoders: { basePath, meshopt: false, workerCount: 2 }, maxTextureSize: 512 };
    const flagsOn = { on: (name: string) => name === "A3D_QR_ASSETS" };
    expect(typedGLBActorDecoderOptions(flagsOn, assetOptions)).toEqual({
      decoders: { basePath: "/tenant/custom/", meshopt: false, workerCount: 2 }, maxTextureSize: 512
    });
    expect(typedGLBActorDecoderOptions({ on: () => false }, assetOptions)).toEqual({});

    class Port {
      peer?: Port;
      listeners = new Map<string, Set<(event: { data: unknown }) => void>>();
      postMessage(message: { type: string; canvas?: OffscreenCanvas }): void {
        // The fake OffscreenCanvas cannot be transferred by Node. Clone the
        // rest of the protocol just as the host-to-worker boundary would.
        const cloned = message.type === "init"
          ? { ...structuredClone({ ...message, canvas: undefined }), canvas: message.canvas }
          : structuredClone(message);
        queueMicrotask(() => {
          for (const listener of this.peer?.listeners.get("message") ?? []) listener({ data: cloned });
        });
      }
      addEventListener(type: string, listener: (event: { data: unknown }) => void): void {
        const listeners = this.listeners.get(type) ?? new Set();
        listeners.add(listener); this.listeners.set(type, listeners);
      }
      removeEventListener(type: string, listener: (event: { data: unknown }) => void): void { this.listeners.get(type)?.delete(listener); }
      terminate(): void {}
    }
    const host = new Port(); const remote = new Port(); host.peer = remote; remote.peer = host;
    const seen: unknown[] = [];
    installWorkerRenderer(remote as unknown as AuraWorkerEndpoint<AuraWorkerRequest, AuraWorkerResponse>, {
      createRenderer: async (_canvas, _scene, _renderer, _signal, context) => {
        seen.push(context?.assets);
        return { dispose() {} } as unknown as WebGLSceneRenderer;
      }
    });
    const snapshot = { schema: "aura3d-scene-snapshot/1.0", nodes: [] } as unknown as AuraSceneSnapshot;
    const canvas = { width: 4, height: 4, transferControlToOffscreen: () => ({ width: 4, height: 4 }) };
    const worker = createWorkerRenderer({
      canvas: canvas as unknown as HTMLCanvasElement,
      worker: host as unknown as AuraWorkerHostEndpoint,
      scene: snapshot, assets: assetOptions, autoStart: false, bridgeEvents: false
    });
    try {
      await worker.ready;
      await worker.setScene(snapshot);
      expect(seen).toEqual([assetOptions, assetOptions]);
    } finally { await worker.dispose(); }
  });

  it("keeps explicit paths ahead of packaged URLs and retains the packaged and legacy defaults", async () => {
    const plugin = auraDecodersPlugin({ basePath: "/tenant/codecs/" });
    plugin.configResolved({ base: "/tenant/", command: "serve" });
    const basePath = await emittedDecoderBase(plugin);
    const manifest = {
      vfx1024: "https://aura.invalid/assets/vfx1.png", vfx2048: "https://aura.invalid/assets/vfx2.png",
      humanoid: "https://aura.invalid/assets/humanoid.glb", retargetWorker: "https://aura.invalid/assets/retarget.js",
      basisScript: "https://aura.invalid/assets/basis.js", basisModule: "https://aura.invalid/assets/basis.mjs",
      basisWasm: "https://aura.invalid/assets/basis.wasm", basisWorker: "https://aura.invalid/assets/ktx2.js",
      dracoModule: "https://aura.invalid/assets/draco.mjs", dracoWasm: "https://aura.invalid/assets/draco.wasm",
      meshoptModule: "https://aura.invalid/assets/meshopt.mjs"
    };
    const release = installWorkerAssetsFromUrl(workerUrlWithAssets(new URL("https://aura.invalid/assets/render.js"), manifest).href);
    const registryFactory = vi.mocked(browserAssets.createAssetDecoderRegistry);
    const caps = { astc: false, bptc: false, etc2: false, s3tc: false, s3tcSrgb: false } as const;
    const tier = { maxTextureSize: 64 };
    const scripts: string[] = [];
    vi.stubGlobal("importScripts", (url: string) => {
      scripts.push(url);
      vi.stubGlobal("DracoDecoderModule", (config: { locateFile(file: string): string }) => {
        expect(config.locateFile("draco_decoder_gltf.wasm")).toBe(`${basePath}draco/draco_decoder.wasm`);
        return Promise.resolve({});
      });
    });
    try {
      const packaged = createAppAssetDecoders(undefined, caps, tier);
      expect(registryFactory).toHaveBeenLastCalledWith(expect.objectContaining({ basePath: "/aura-decoders/", workerAssets: manifest }));
      packaged.dispose();
      const explicit = createAppAssetDecoders({ decoders: { basePath } }, caps, tier);
      try {
        expect(registryFactory).toHaveBeenLastCalledWith(expect.not.objectContaining({ workerAssets: expect.anything() }));
        expect((await explicit.require(["draco"])).draco).toBeTypeOf("function");
        expect(scripts).toEqual([`${basePath}draco/draco_decoder.js`]);
      } finally { explicit.dispose(); }
    } finally { release(); }

    const legacy = createAppAssetDecoders(undefined, caps, tier);
    expect(registryFactory).toHaveBeenLastCalledWith(expect.objectContaining({ basePath: "/aura-decoders/" }));
    expect(registryFactory).toHaveBeenLastCalledWith(expect.not.objectContaining({ workerAssets: expect.anything() }));
    legacy.dispose();
    const disabled = createAppAssetDecoders({ decoders: { basePath, draco: false } }, caps, tier);
    try {
      await expect(disabled.require(["draco"])).rejects.toMatchObject({ name: "AssetDecoderUnavailable", decoderId: "draco" });
    } finally { disabled.dispose(); }
  });

  it("reports a missing selected codec at the generated path without falling back", async () => {
    const plugin = auraDecodersPlugin({ basePath: "/tenant/codecs/", codecs: ["meshopt"] });
    plugin.configResolved({ base: "/tenant/", command: "serve" });
    const basePath = await emittedDecoderBase(plugin);
    const missing = `${basePath}draco/draco_decoder.js`;
    expect((await request(installMiddleware(plugin), missing)).status).toBe(404);
    const scripts: string[] = [];
    vi.stubGlobal("importScripts", (url: string) => { scripts.push(url); throw new Error("codec not deployed"); });
    const registry = createAppAssetDecoders({ decoders: { basePath } },
      { astc: false, bptc: false, etc2: false, s3tc: false, s3tcSrgb: false }, { maxTextureSize: 64 });
    try {
      await expect(registry.require(["draco"])).rejects.toMatchObject({
        name: "AssetDecoderUnavailable", decoderId: "draco", url: missing
      });
      expect(scripts).toEqual([missing, missing]);
    } finally { registry.dispose(); }
  });
});

describe("decoder development and static deployment", () => {
  it("serves and emits identical same-origin module codec exports", async () => {
    const root = dir();
    const plugin = auraDecodersPlugin({ basePath: "/shop/decoders/", codecs: ["basis", "draco"] });
    plugin.configResolved({ command: "build", root, base: "/shop/", build: { outDir: "build" } });
    const serve = installMiddleware(plugin);
    await plugin.closeBundle();
    const preview = installMiddleware(plugin, true);
    for (const [family, filename, name] of [
      ["basis", "basis_transcoder", "BASIS"],
      ["draco", "draco_decoder", "DracoDecoderModule"]
    ]) {
      const url = `/shop/decoders/${family}/${filename}.mjs`;
      const expected = `// Modified by Aura3D: added module bindings and a default export for ESM loading.\nconst module = undefined, exports = undefined, define = undefined;\nconst importScripts = globalThis.importScripts ?? (() => { throw new TypeError("importScripts unavailable"); });\n${readFileSync(path.join(auraDecodersVendorRoot(), family!, `${filename}.js`), "utf8")}\nexport default ${name};\n`;
      const dev = await request(serve, url);
      const built = await request(preview, url);
      expect(dev.status).toBe(200);
      expect(dev.headers).toMatchObject({ "content-type": "text/javascript", "x-content-type-options": "nosniff" });
      expect(String(dev.body)).toBe(expected);
      expect(built.status).toBe(200);
      expect(Buffer.from(built.body as Uint8Array).toString()).toBe(expected);
      const file = path.join(root, "build", "decoders", family!, `${filename}.mjs`);
      const imported = await import(/* @vite-ignore */ pathToFileURL(file).href);
      expect(imported.default).toBeTypeOf("function");
      const head = await request(serve, url, "HEAD");
      expect(head.status).toBe(200);
      expect(head.body).toBeUndefined();
    }
  });

  it("initializes emitted codec modules with real local wasm in a worker-shaped environment", async () => {
    const root = dir();
    const plugin = auraDecodersPlugin({ codecs: ["basis", "draco"] });
    plugin.configResolved({ command: "build", root, base: "/", build: { outDir: "build" } });
    await plugin.closeBundle();
    const probe = path.join(root, "module-codec-probe.mjs");
    writeFileSync(probe, `
      import { readFileSync } from "node:fs";
      import { pathToFileURL } from "node:url";
      const [basisPath, dracoPath, basisWasm, dracoWasm, mode] = process.argv.slice(2);
      const basisBytes = readFileSync(basisWasm);
      const dracoBytes = readFileSync(dracoWasm);
      const fetched = [];
      const dracoFiles = [];
      globalThis.self = globalThis;
      globalThis.location = { href: "https://example.test/render-worker.js" };
      if (mode === "throws") globalThis.importScripts = () => { throw new TypeError("module worker"); };
      globalThis.fetch = async (url) => {
        fetched.push(String(url));
        const bytes = String(url).endsWith("basis_transcoder.wasm") ? basisBytes : dracoBytes;
        return new Response(bytes, { headers: { "content-type": "application/wasm" } });
      };
      globalThis.process = undefined;
      const { default: basisFactory } = await import(pathToFileURL(basisPath).href);
      const basis = await basisFactory({ locateFile: (file) => "/nested/basis/" + file });
      basis.initializeBasis();
      const { default: dracoFactory } = await import(pathToFileURL(dracoPath).href);
      const draco = await dracoFactory({ locateFile: (file) => { dracoFiles.push(file); return "/nested/draco/" + (file === "draco_decoder_gltf.wasm" ? "draco_decoder.wasm" : file); } });
      if (typeof basis.KTX2File !== "function" || typeof draco.Decoder !== "function") throw new Error("codec module failed to initialize");
      if (!fetched.includes("/nested/basis/basis_transcoder.wasm") || !dracoFiles.includes("draco_decoder_gltf.wasm")) throw new Error("codec paths were not configured: " + JSON.stringify({ fetched, dracoFiles }));
    `);
    const out = path.join(root, "build", "aura-decoders");
    for (const mode of ["throws", "absent"]) {
      const result = spawnSync(process.execPath, [probe,
        path.join(out, "basis", "basis_transcoder.mjs"), path.join(out, "draco", "draco_decoder.mjs"),
        path.join(out, "basis", "basis_transcoder.wasm"), path.join(out, "draco", "draco_decoder.wasm"), mode
      ], { encoding: "utf8", timeout: 10_000 });
      expect({ status: result.status, error: result.error?.message, stderr: result.stderr }).toEqual({ status: 0, error: undefined, stderr: "" });
    }
  });

  it("serves codecs with correct MIME types and rejects traversal, missing files and methods", async () => {
    const plugin = auraDecodersPlugin({ basePath: "/site/codecs/", codecs: ["basis"] });
    plugin.configResolved({ command: "serve", base: "/site/" });
    const serve = installMiddleware(plugin);
    const wasm = await request(serve, "/site/codecs/basis/basis_transcoder.wasm?v=1");
    expect(wasm.status).toBe(200);
    expect(wasm.headers["content-type"]).toBe("application/wasm");
    expect(wasm.headers["x-content-type-options"]).toBe("nosniff");
    expect(Buffer.from(wasm.body as Uint8Array).subarray(0, 4)).toEqual(Buffer.from([0, 97, 115, 109]));
    const license = await request(serve, "/site/codecs/basis/LICENSE-zstd.txt");
    expect(license.status).toBe(200);
    expect(license.headers["content-type"]).toBe("text/plain; charset=utf-8");
    expect(Buffer.from(license.body as Uint8Array)).toEqual(readFileSync(path.join(auraDecodersVendorRoot(), "basis", "LICENSE-zstd.txt")));
    const module = await request(serve, "/site/codecs/basis/basis_transcoder.mjs");
    expect(module.status).toBe(200);
    expect(String(module.body)).toMatch(/^\/\/ Modified by Aura3D: added module bindings and a default export for ESM loading\./);
    expect(String(module.body)).toContain(readFileSync(path.join(auraDecodersVendorRoot(), "basis", "basis_transcoder.js"), "utf8"));
    expect(String(module.body)).toMatch(/export default BASIS;\n$/);
    const head = await request(serve, "/site/codecs/basis/basis_transcoder.js", "HEAD");
    expect(head.status).toBe(200);
    expect(head.headers["content-type"]).toBe("text/javascript");
    expect(head.body).toBeUndefined();
    expect((await request(serve, "/site/codecs/basis/%2e%2e/draco/draco_decoder.js")).status).toBe(400);
    expect((await request(serve, "/site/codecs/basis/%252e%252e/file.js")).status).toBe(400);
    expect((await request(serve, "/site/codecs/basis/%2ffile.js")).status).toBe(400);
    expect((await request(serve, "/site/codecs/basis/missing.wasm")).status).toBe(404);
    expect((await request(serve, "/site/codecs/draco/draco_decoder.js")).status).toBe(404);
    expect((await request(serve, "/site/codecs/basis/basis_transcoder.js", "POST")).status).toBe(405);
    expect((await request(serve, "/other/file.js")).next).toBe(true);
  });

  it("emits matching nested assets and an executable same-origin worker for preview", async () => {
    const root = dir();
    const plugin = auraDecodersPlugin({ basePath: "/shop/decoders/v1", codecs: ["basis", "meshopt"] });
    plugin.configResolved({ command: "build", root, base: "/shop/", build: { outDir: "build" } });
    await plugin.closeBundle();
    const out = path.join(root, "build", "decoders", "v1");
    expect(readFileSync(path.join(out, "basis", "basis_transcoder.wasm"))).toEqual(
      readFileSync(path.join(auraDecodersVendorRoot(), "basis", "basis_transcoder.wasm"))
    );
    for (const license of ["LICENSE.txt", "LICENSE-zstd.txt"]) {
      expect(readFileSync(path.join(out, "basis", license))).toEqual(readFileSync(path.join(auraDecodersVendorRoot(), "basis", license)));
    }
    expect(existsSync(path.join(out, "meshopt", "meshopt_decoder.mjs"))).toBe(true);
    const meshoptLicense = readFileSync(path.join(auraDecodersVendorRoot(), "meshopt", "LICENSE.txt"));
    expect(readFileSync(path.join(out, "meshopt", "LICENSE.txt"))).toEqual(meshoptLicense);
    expect(existsSync(path.join(out, "draco"))).toBe(false);
    expect(existsSync(path.join(root, "build", "shop", "decoders"))).toBe(false);
    const worker = readFileSync(path.join(out, "basis", "ktx2.worker.js"), "utf8");
    expect(worker).toContain("importScripts");
    expect(worker).not.toMatch(/^\s*(?:import|export)\s/m);
    expect(() => new Function(worker)).not.toThrow();
    const preview = installMiddleware(plugin, true);
    const served = await request(preview, "/shop/decoders/v1/basis/ktx2.worker.js");
    expect(served.status).toBe(200);
    expect(served.headers["content-type"]).toBe("text/javascript");
    expect(Buffer.from(served.body as Uint8Array).toString()).toBe(worker);
    for (const handler of [installMiddleware(plugin), preview]) {
      const notice = await request(handler, "/shop/decoders/v1/meshopt/LICENSE.txt");
      expect(notice.status).toBe(200);
      expect(notice.headers["content-type"]).toBe("text/plain; charset=utf-8");
      expect(Buffer.from(notice.body as Uint8Array)).toEqual(meshoptLicense);
    }
    expect((await request(preview, "/shop/decoders/v1/basis/not-there.js")).status).toBe(404);
    const outside = path.join(root, "outside.js");
    writeFileSync(outside, "outside");
    symlinkSync(outside, path.join(out, "basis", "escape.js"));
    expect((await request(preview, "/shop/decoders/v1/basis/escape.js")).status).toBe(404);
  });

  it("maps encoded URL segments to the same decoded build directory", async () => {
    const root = dir();
    const plugin = auraDecodersPlugin({ basePath: "/p/my%20codecs/", codecs: ["meshopt"] });
    plugin.configResolved({ command: "build", root, base: "/p/" });
    await plugin.closeBundle();
    expect(existsSync(path.join(root, "dist", "my codecs", "meshopt", "meshopt_decoder.mjs"))).toBe(true);
    const response = await request(installMiddleware(plugin, true), "/p/my%20codecs/meshopt/meshopt_decoder.mjs");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("text/javascript");
  });

  it("serves a transpiled classic worker directly from the workspace", async () => {
    const plugin = auraDecodersPlugin();
    plugin.configResolved({ command: "serve", base: "/" });
    const response = await request(installMiddleware(plugin), "/aura-decoders/basis/ktx2.worker.js");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("text/javascript");
    expect(String(response.body)).toContain("importScripts");
    expect(String(response.body)).not.toMatch(/^\s*(?:import|export)\s/m);
  });

  it("rejects unknown codec families", () => {
    expect(() => auraDecodersPlugin({ codecs: ["unknown" as never] })).toThrow(/Unknown decoder codec/);
  });
});
