import { readFileSync } from "node:fs";
import { transform } from "esbuild";
import { resolveConfig } from "vite";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as browserAssets from "@aura3d/assets/browser";
import { auraDecodersPlugin } from "../../../packages/assets/src/vite/auraDecoders";
import { createAppAssetDecoders } from "../../../packages/engine/src/agent-api/AssetDecoders";
import { ensureCompressedTextureSupport } from "../../../packages/assets/src/KTX2BasisTextureTranscoder";
import { installWorkerAssetsFromUrl, workerUrlWithAssets } from "../../../packages/core/src/workerAssets";

vi.mock("@aura3d/assets/browser", async (original) => {
  const actual = await original<typeof import("@aura3d/assets/browser")>();
  return { ...actual, createAssetDecoderRegistry: vi.fn(actual.createAssetDecoderRegistry) };
});

const defineKey = "import.meta.env.AURA3D_DECODER_BASE_PATH";
const caps = { astc: false, bptc: false, etc2: false, s3tc: false, s3tcSrgb: false };
const manifest = {
  vfx1024: "https://aura.invalid/assets/vfx1.png", vfx2048: "https://aura.invalid/assets/vfx2.png",
  humanoid: "https://aura.invalid/assets/model.glb", retargetWorker: "https://aura.invalid/assets/retarget.js",
  basisScript: "https://aura.invalid/assets/basis.js", basisModule: "https://aura.invalid/assets/basis.mjs",
  basisWasm: "https://aura.invalid/assets/basis.wasm", basisWorker: "https://aura.invalid/assets/ktx2.js",
  dracoModule: "https://aura.invalid/assets/draco.mjs", dracoWasm: "https://aura.invalid/assets/draco.wasm",
  meshoptModule: "https://aura.invalid/assets/meshopt.mjs"
};

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("automatic build-scoped decoder deployment", () => {
  it("sets independent client and optimizer values from each resolved Vite configuration", async () => {
    const one = await resolveConfig({ configFile: false, envFile: false, logLevel: "silent", base: "/one/", plugins: [auraDecodersPlugin()] }, "serve");
    const two = await resolveConfig({ configFile: false, envFile: false, logLevel: "silent", base: "/two/", plugins: [auraDecodersPlugin({ basePath: "/two/codec-v2/" })] }, "build");
    expect(one.define?.[defineKey]).toBe('"/one/aura-decoders/"');
    expect(one.optimizeDeps.esbuildOptions?.define?.[defineKey]).toBe('"/one/aura-decoders/"');
    expect(two.define?.[defineKey]).toBe('"/two/codec-v2/"');
    expect(two.optimizeDeps.esbuildOptions?.define?.[defineKey]).toBe('"/two/codec-v2/"');
    // An optimized installed dependency sees the same literal as application source.
    for (const file of [
      "packages/assets/src/KTX2BasisTextureTranscoder.ts",
      "packages/assets/src/asset-corpus/ProductionGLTFRenderPipeline.ts",
      "packages/engine/src/agent-api/AssetDecoders.ts"
    ]) {
      const output = await transform(readFileSync(file, "utf8"), {
        loader: "ts", format: "esm", define: one.optimizeDeps.esbuildOptions?.define
      });
      expect(output.code).toContain('"/one/aura-decoders/"');
      expect(output.code).not.toContain(defineKey);
      const helper = output.code.match(/function defaultDecoderBasePath\(\) \{[^}]+\}/)?.[0];
      if (helper) {
        // Execute the actual transformed helper, not a separately reimplemented expression.
        const compiledDefault = new Function("normalizeDecoderBasePath", `${helper}; return defaultDecoderBasePath();`);
        expect(compiledDefault((value: string) => value)).toBe("/one/aura-decoders/");
      }
    }
  });

  it("rejects conflicting defines or a later plugin changing the resolved base", async () => {
    await expect(resolveConfig({ configFile: false, envFile: false, logLevel: "silent", base: "/one/", define: { [defineKey]: '"/other/"' }, plugins: [auraDecodersPlugin()] }, "serve"))
      .rejects.toThrow(/Conflicting Aura3D decoder deployment define/);
    const late = { name: "later-base", config: { order: "post" as const, handler: () => ({ base: "/changed/" }) } };
    await expect(resolveConfig({ configFile: false, envFile: false, logLevel: "silent", base: "/one/", plugins: [auraDecodersPlugin(), late] }, "serve"))
      .rejects.toThrow(/decoder deployment changed/);
  });

  it("preserves the non-Vite default and prioritizes explicit paths and packaged-worker assets", () => {
    const factory = vi.mocked(browserAssets.createAssetDecoderRegistry);
    const normal = createAppAssetDecoders(undefined, caps, { maxTextureSize: 1024 });
    expect(factory).toHaveBeenLastCalledWith(expect.objectContaining({ basePath: "/aura-decoders/" }));
    normal.dispose();
    const release = installWorkerAssetsFromUrl(workerUrlWithAssets(new URL("https://aura.invalid/assets/render.js"), manifest).href);
    try {
      const packaged = createAppAssetDecoders(undefined, caps, { maxTextureSize: 1024 });
      expect(factory).toHaveBeenLastCalledWith(expect.objectContaining({ workerAssets: manifest }));
      packaged.dispose();
      const explicit = createAppAssetDecoders({ decoders: { basePath: "/custom/" } }, caps, { maxTextureSize: 1024 });
      expect(factory).toHaveBeenLastCalledWith(expect.objectContaining({ basePath: "/custom/" }));
      expect(factory).toHaveBeenLastCalledWith(expect.not.objectContaining({ workerAssets: expect.anything() }));
      explicit.dispose();
    } finally { release(); }
  });
});

describe("decoder availability probes", () => {
  it("uses an explicit path for all families and reports missing files without a Node fallback", async () => {
    vi.stubGlobal("document", {});
    vi.stubGlobal("location", { origin: "https://aura.invalid" });
    const seen: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      seen.push(url);
      expect(init).toMatchObject({ method: "HEAD", mode: "same-origin", redirect: "error" });
      return { ok: !url.includes("draco/") };
    }));
    const result = await ensureCompressedTextureSupport({ draco: true, basePath: "/tenant/codecs/" });
    expect(seen).toEqual(["/tenant/codecs/draco/draco_decoder.js", "/tenant/codecs/meshopt/meshopt_decoder.mjs", "/tenant/codecs/basis/basis_transcoder.js"]);
    expect([result.draco.available, result.meshopt.available, result.ktx2.available]).toEqual([false, true, true]);
  });

  it("snapshots explicit paths and ignores a packaged worker manifest for those probes", async () => {
    vi.stubGlobal("location", { origin: "https://aura.invalid" });
    vi.stubGlobal("importScripts", () => {});
    const release = installWorkerAssetsFromUrl(workerUrlWithAssets(new URL("https://aura.invalid/assets/render.js"), manifest).href);
    const seen: string[] = [];
    let resume!: () => void;
    const gate = new Promise<void>((resolve) => { resume = resolve; });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => { seen.push(url); if (seen.length === 1) await gate; return { ok: true }; }));
    try {
      const request = { basePath: "/explicit/", draco: true };
      const result = ensureCompressedTextureSupport(request);
      request.basePath = "/changed/";
      resume();
      expect((await result).ktx2.available).toBe(true);
      expect(seen).toEqual(["/explicit/draco/draco_decoder.js", "/explicit/meshopt/meshopt_decoder.mjs", "/explicit/basis/basis_transcoder.js"]);
      await expect(ensureCompressedTextureSupport({ basePath: "https://foreign.invalid/codec/" })).rejects.toThrow(/same-origin/);
      await expect(ensureCompressedTextureSupport({ basePath: "/codec/%2e%2e/private/" })).rejects.toThrow(/traversal/);
    } finally { release(); }
  });
});
