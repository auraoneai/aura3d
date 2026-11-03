import { readFileSync } from "node:fs";
import { transform } from "esbuild";
import { resolveConfig } from "vite";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as workerAssets from "../../../packages/core/src/workerAssets";
import * as browserAssets from "@aura3d/assets/browser";
import { auraDecodersPlugin } from "../../../packages/assets/src/vite/auraDecoders";
import { createKTX2TranscodeWorkerPool } from "../../../packages/assets/src/KTX2TranscodeWorker";
import { createAppAssetDecoders } from "../../../packages/engine/src/agent-api/AssetDecoders";
import { ensureCompressedTextureSupport } from "../../../packages/assets/src/KTX2BasisTextureTranscoder";

vi.mock("@aura3d/assets/browser", async (original) => {
  const actual = await original<typeof import("@aura3d/assets/browser")>();
  return { ...actual, createAssetDecoderRegistry: vi.fn(actual.createAssetDecoderRegistry) };
});

const factorySource = readFileSync("packages/engine/src/agent-api/app/workerFactoryPackaged.ts", "utf8");
const defineKey = "import.meta.env.AURA3D_DECODER_BASE_PATH";
const factoryUrl = "https://aura.invalid/installed/app/workerFactory.js";
const caps = { astc: false, bptc: false, etc2: false, s3tc: false, s3tcSrgb: false };
const cleanups: (() => void)[] = [];

/** Execute the real host factory after the same esbuild substitution used by Vite. */
async function packagedFactory(base?: string, moduleUrl = factoryUrl): Promise<() => URL> {
  const define: Record<string, string> = { "import.meta.url": JSON.stringify(moduleUrl) };
  if (base !== undefined) define[defineKey] = JSON.stringify(base);
  const output = await transform(factorySource, { loader: "ts", format: "cjs", target: "es2022", define });
  const module = { exports: {} as { workerRendererUrl?: () => URL } };
  const requirePackage = (name: string): unknown => {
    if (name === "@aura3d/core") return workerAssets;
    throw new Error(`Unexpected factory dependency ${name}`);
  };
  new Function("module", "exports", "require", output.code)(module, module.exports, requirePackage);
  if (!module.exports.workerRendererUrl) throw new Error("Packaged worker factory export is missing");
  return module.exports.workerRendererUrl;
}

function manifest(url: URL): workerAssets.AuraWorkerAssetUrls {
  const text = url.searchParams.get("aura3dWorkerAssets");
  if (!text) throw new Error("Worker manifest is missing");
  return JSON.parse(text) as workerAssets.AuraWorkerAssetUrls;
}

function expectedDecoderAssets(base: string): Pick<workerAssets.AuraWorkerAssetUrls,
  "basisScript" | "basisModule" | "basisWasm" | "basisWorker" | "dracoModule" | "dracoWasm" | "meshoptModule"> {
  const root = `https://aura.invalid${base}`;
  return {
    basisScript: `${root}basis/basis_transcoder.js`,
    basisModule: `${root}basis/basis_transcoder.mjs`,
    basisWasm: `${root}basis/basis_transcoder.wasm`,
    basisWorker: `${root}basis/ktx2.worker.js`,
    dracoModule: `${root}draco/draco_decoder.mjs`,
    dracoWasm: `${root}draco/draco_decoder.wasm`,
    meshoptModule: `${root}meshopt/meshopt_decoder.mjs`
  };
}

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("packaged worker decoder deployment", () => {
  it.each([
    ["/", undefined, "/aura-decoders/"],
    ["/store/", undefined, "/store/aura-decoders/"],
    ["/store/", "/store/custom%20codecs/", "/store/custom%20codecs/"]
  ])("carries the actual Vite base %s and custom path %s into all decoder URLs", async (viteBase, custom, expectedBase) => {
    const config = await resolveConfig({ configFile: false, envFile: false, logLevel: "silent", base: viteBase,
      plugins: [auraDecodersPlugin(custom ? { basePath: custom } : {})] }, "build");
    const injected = JSON.parse(config.define![defineKey] as string) as string;
    expect(injected).toBe(expectedBase);
    expect(config.optimizeDeps.esbuildOptions?.define?.[defineKey]).toBe(JSON.stringify(expectedBase));
    const makeWorker = await packagedFactory(injected);
    const url = makeWorker();
    const selected = manifest(url);
    expect(selected).toMatchObject(expectedDecoderAssets(expectedBase));
    for (const key of ["vfx1024", "vfx2048", "humanoid", "retargetWorker", "zstdWorker"] as const) {
      expect(selected[key]).toContain("/installed/app/worker-assets/");
    }
    expect(url.pathname).toBe("/installed/app/worker-assets/render.worker.bundle.js");
    expect(url.searchParams.get("no-inline")).toBe("");
  });

  it("retains exact packaged URLs without a build-scoped base, including file-URL inspection", async () => {
    const selected = manifest((await packagedFactory())());
    expect(selected.basisScript).toBe("https://aura.invalid/installed/app/worker-assets/basis_transcoder.js?no-inline");
    expect(selected.basisWorker).toBe("https://aura.invalid/installed/app/worker-assets/ktx2.worker.js?no-inline");
    expect(selected.dracoModule).toBe("https://aura.invalid/installed/app/worker-assets/draco_decoder.mjs?no-inline");
    const inspected = (await packagedFactory("/tenant/aura-decoders/", "file:///installed/factory.js"))();
    expect(inspected.protocol).toBe("file:");
    expect(inspected.searchParams.has("aura3dWorkerAssets")).toBe(false);
  });

  it.each(["//evil.invalid/x/", "https://evil.invalid/x/", "/a/../b/", "/a/%2e%2e/b/", "/a/%2F/b/", "/a/%252f/b/", "/a\\b/", "/a/?x=1", "/a/#fragment", "/a//b/", "/a/%zz/"])(
    "rejects an unsafe injected base %s before producing a worker URL", async (base) => {
      const makeWorker = await packagedFactory(base);
      expect(() => makeWorker()).toThrow(/decoder deployment base/i);
    }
  );

  it("keeps manifests scoped per worker and lets explicit app and probe bases win", async () => {
    vi.stubGlobal("location", { origin: "https://aura.invalid" });
    vi.stubGlobal("importScripts", () => {});
    const first = (await packagedFactory("/one/codecs/"))();
    const second = (await packagedFactory("/two/codecs/"))();
    const firstAssets = manifest(first), secondAssets = manifest(second);
    expect(firstAssets).toMatchObject(expectedDecoderAssets("/one/codecs/"));
    expect(secondAssets).toMatchObject(expectedDecoderAssets("/two/codecs/"));
    expect(manifest(first)).toEqual(firstAssets);
    cleanups.push(workerAssets.installWorkerAssetsFromUrl(first.href));
    const registryFactory = vi.mocked(browserAssets.createAssetDecoderRegistry);
    const defaultRegistry = createAppAssetDecoders(undefined, caps, { maxTextureSize: 1024 });
    expect(registryFactory).toHaveBeenLastCalledWith(expect.objectContaining({ workerAssets: firstAssets }));
    defaultRegistry.dispose();
    const explicitRegistry = createAppAssetDecoders({ decoders: { basePath: "/explicit/" } }, caps, { maxTextureSize: 1024 });
    expect(registryFactory).toHaveBeenLastCalledWith(expect.objectContaining({ basePath: "/explicit/" }));
    expect(registryFactory).toHaveBeenLastCalledWith(expect.not.objectContaining({ workerAssets: expect.anything() }));
    explicitRegistry.dispose();
    const seen: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => { seen.push(url); return { ok: true }; }));
    await ensureCompressedTextureSupport({ draco: true });
    expect(seen).toEqual([firstAssets.dracoModule, firstAssets.dracoWasm, firstAssets.meshoptModule, firstAssets.basisModule, firstAssets.basisWasm]);
    seen.length = 0;
    await ensureCompressedTextureSupport({ draco: true, basePath: "/explicit/" });
    expect(seen).toEqual(["/explicit/draco/draco_decoder.js", "/explicit/meshopt/meshopt_decoder.mjs", "/explicit/basis/basis_transcoder.js"]);
    cleanups.push(workerAssets.installWorkerAssetsFromUrl(second.href));
    expect(workerAssets.currentWorkerAssets()).toEqual(secondAssets);
    cleanups.pop()?.();
    expect(workerAssets.currentWorkerAssets()).toEqual(firstAssets);
  });

  it("passes the selected manifest to the nested KTX2 worker and does not fall back to omitted codecs", async () => {
    vi.stubGlobal("location", { origin: "https://aura.invalid" });
    vi.stubGlobal("importScripts", () => {});
    const url = (await packagedFactory("/tenant/aura-decoders/"))();
    const selected = manifest(url);
    cleanups.push(workerAssets.installWorkerAssetsFromUrl(url.href));
    const requested: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (value: string) => {
      requested.push(value);
      return value.endsWith(".wasm")
        ? new Response(Uint8Array.of(0, 97, 115, 109, 1, 0, 0, 0), { headers: { "content-type": "application/wasm" } })
        : new Response("var BASIS = function() {};", { headers: { "content-type": "text/javascript" } });
    }));
    const workers: FakeWorker[] = [];
    class FakeWorker {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      onmessageerror: ((event: MessageEvent) => void) | null = null;
      readonly messages: Array<{ type: string; id: number; scriptUrl?: string }> = [];
      terminated = false;
      constructor(readonly workerUrl: string) { workers.push(this); }
      postMessage(message: { type: string; id: number; scriptUrl?: string }): void {
        this.messages.push(message);
        if (message.type === "init") queueMicrotask(() => this.onmessage?.({ data: { type: "ready", id: 0 } } as MessageEvent));
        if (message.type === "transcode") queueMicrotask(() => this.onmessage?.({ data: { type: "transcode", id: message.id,
          result: { width: 1, height: 1, isUASTC: false, hasAlpha: true, levels: [{ width: 1, height: 1, data: Uint8Array.of(1, 2, 3, 4) }] } } } as MessageEvent));
      }
      terminate(): void { this.terminated = true; }
    }
    vi.stubGlobal("Worker", FakeWorker);
    const pool = createKTX2TranscodeWorkerPool("/tenant/aura-decoders/basis/", 1, {}, selected);
    try {
      const result = await pool.transcode({ bytes: Uint8Array.of(1), transcoderFormat: 13 });
      expect(result.levels[0]?.data).toEqual(Uint8Array.of(1, 2, 3, 4));
      expect(workers).toHaveLength(1);
      expect(workers[0]!.workerUrl).toBe(selected.basisWorker);
      expect(workers[0]!.messages[0]).toMatchObject({ type: "init", scriptUrl: selected.basisScript });
      expect(requested).toEqual([selected.basisScript, selected.basisWasm]);
    } finally { pool.dispose(); }
    expect(workers[0]!.terminated).toBe(true);

    const probed: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (value: string) => {
      probed.push(value);
      return { ok: value.includes("/basis/") };
    }));
    const diagnostics = await ensureCompressedTextureSupport({ draco: true });
    expect([diagnostics.draco.available, diagnostics.meshopt.available, diagnostics.ktx2.available]).toEqual([false, false, true]);
    expect(probed.every((value) => value.startsWith("https://aura.invalid/tenant/aura-decoders/"))).toBe(true);
    expect(probed.some((value) => value.includes("/worker-assets/"))).toBe(false);
  });
});
