import { createHash, webcrypto } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acquireParsedGLTFAsset, snapshotParsedGLTFAssetCache } from "../../packages/assets/src/GLTFAssetParseCache";
import { GLTFLoader, type GLTFAsset } from "../../packages/assets/src/GLTFLoader";
import { loadProductionGLTFRenderPipeline } from "../../packages/assets/src/asset-corpus/ProductionGLTFRenderPipeline";
import { awaitTypedGLBActorDisposals, createTypedGLBActor } from "../../packages/engine/src/production-runtime/TypedGLBActor";
import { clearGlbResourceCache, configureGlbResourceCache, GLB_RESOURCE_CACHE_DEFAULTS } from "../../packages/engine/src/production-runtime/GlbResourceCache";
import { createGLTFFormatAdapter, FormatRegistry } from "../../packages/assets/src/FormatRegistry";
import { PLYLoader } from "../../packages/assets/src/loaders/MeshFormatLoaders";
import { readAssetManifest, writeAssetManifest, writeTypedAssets } from "../../packages/aura3d-cli/src/asset-manifest";
import type { AuraCliAssetManifest } from "../../packages/aura3d-cli/src/asset-core-types";

/* Independently authored inline glTF triangle and binary positions; no third-party fixture. */
const positions = new Uint8Array(new Float32Array([-0.8, -0.8, 0, 0.8, -0.8, 0, 0, 0.8, 0]).buffer);
const digest = (bytes: Uint8Array | string) => `sha256-${createHash("sha256").update(bytes).digest("hex")}`;
const binary = (bytes: Uint8Array) => new Response(bytes.slice().buffer, { status: 200, headers: { "content-type": "application/octet-stream" } });
const doc = (name: string, external = true, image = false) => JSON.stringify({
  asset: { version: "2.0" },
  buffers: [{ uri: external ? "geo/triangle.bin" : `data:application/octet-stream;base64,${Buffer.from(positions).toString("base64")}`, byteLength: positions.length }],
  bufferViews: [{ buffer: 0, byteLength: positions.length }],
  accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.8, -0.8, 0], max: [0.8, 0.8, 0] }],
  ...(image ? { images: [{ uri: "pixel.bin", mimeType: "image/png" }], textures: [{ source: 0 }] } : {}),
  materials: [{ pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1], ...(image ? { baseColorTexture: { index: 0 } } : {}) } }],
  meshes: [{ name, primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
  nodes: [{ name, mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0
});
const root = "https://asset.example/scene/model.gltf";
const geo = "https://asset.example/scene/geo/triangle.bin";
const pixel = "https://asset.example/scene/pixel.bin";
const pixelBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const decode = () => ({ width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]) });
function makeGlb(): Uint8Array {
  const json = JSON.parse(doc("binary", false)) as { buffers: { uri?: string; byteLength: number }[] };
  delete json.buffers[0]!.uri;
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = (jsonBytes.length + 3) & ~3;
  const binLength = (positions.length + 3) & ~3;
  const out = new Uint8Array(12 + 8 + jsonLength + 8 + binLength);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, out.length, true);
  view.setUint32(12, jsonLength, true); view.setUint32(16, 0x4e4f534a, true);
  out.fill(0x20, 20, 20 + jsonLength); out.set(jsonBytes, 20);
  view.setUint32(20 + jsonLength, binLength, true); view.setUint32(24 + jsonLength, 0x004e4942, true);
  out.set(positions, 28 + jsonLength);
  return out;
}
async function pipelineError(options: Parameters<typeof loadProductionGLTFRenderPipeline>[0]): Promise<string> {
  try {
    const unexpected = await loadProductionGLTFRenderPipeline(options);
    unexpected.dispose();
    return "unexpected success";
  } catch (error) { return String(error); }
}

afterEach(() => { clearGlbResourceCache(); configureGlbResourceCache(GLB_RESOURCE_CACHE_DEFAULTS); vi.unstubAllGlobals(); });

function installCrypto(): void { vi.stubGlobal("crypto", webcrypto); }
function manifest(asset: Record<string, unknown>): AuraCliAssetManifest {
  return {
    schema: "aura3d.assets/1.0", assetBasePath: "/aura-assets/", outputDir: "public/aura-assets", typegen: "src/aura-assets.ts",
    assets: [{ id: "triangle", type: "model", format: "gltf", source: "triangle.gltf", outputPath: "triangle.gltf", url: "/triangle.gltf", hash: "", sizeBytes: 0, materials: [], animations: [], textures: [], warnings: [], ...asset }]
  } as AuraCliAssetManifest;
}

describe("admitted asset integrity", () => {
  it("migrates legacy single-file hashes and preserves declared dependency and format metadata through typegen", () => {
    const dir = mkdtempSync(join(tmpdir(), "aura-integrity-"));
    try {
      const original = manifest({ hash: undefined, sha256: digest("document").slice(7) });
      writeFileSync(join(dir, "aura.assets.json"), JSON.stringify(original));
      const legacy = readAssetManifest(dir);
      expect(legacy.assets[0]?.integrity).toEqual({ version: 1, digest: digest("document") });
      const record = { version: 1 as const, digest: digest("document"), dependencies: { "geo/triangle.bin": digest(positions) }, requireDependencies: true };
      const updated = manifest({ hash: digest("document"), integrity: record, formatMetadata: { version: "2.0", mediaType: "model/gltf+json", adapter: "gltf" } });
      writeAssetManifest(dir, updated);
      expect(readAssetManifest(dir).assets[0]?.integrity).toEqual(record);
      const generated = readFileSync(writeTypedAssets(dir), "utf8");
      expect(generated).toContain(digest(positions));
      expect(generated).toContain('"requireDependencies": true');
      expect(generated).toContain('"mediaType": "model/gltf+json"');
      // Typegen must not hash a newly changed file and silently re-admit it.
      writeFileSync(join(dir, "triangle.gltf"), "tampered bytes");
      expect(readFileSync(writeTypedAssets(dir), "utf8")).toContain(digest("document"));
      expect(readFileSync(writeTypedAssets(dir), "utf8")).not.toContain(digest("tampered bytes"));
      expect(() => writeAssetManifest(dir, manifest({ hash: digest("other"), integrity: record }))).toThrow(/conflicting/i);
      expect(() => writeAssetManifest(dir, manifest({ hash: digest("document"), integrity: { ...record, dependencies: { bad: "nope" } } }))).toThrow(/invalid/i);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("verifies admitted document and external resource bytes before exposing render resources", async () => {
    installCrypto();
    const source = doc("trusted", true, true);
    let image = pixelBytes;
    let geometry = positions;
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input); calls.push(url);
      if (url === root) return binary(new TextEncoder().encode(source));
      if (url === geo) return binary(geometry);
      if (url === pixel) return binary(image);
      throw new Error(`unexpected ${url}`);
    }));
    const integrity = { version: 1 as const, digest: digest(source), dependencies: { "geo/triangle.bin": digest(positions), "pixel.bin": digest(pixelBytes) }, requireDependencies: true };
    let receivedImage: Uint8Array | undefined;
    const loaded = await loadProductionGLTFRenderPipeline({ url: root, assetId: "triangle", request: { integrity }, imageDecoder: (assetImage) => {
      receivedImage = assetImage.data ? new Uint8Array(assetImage.data) : undefined;
      return decode();
    } });
    expect(loaded.asset.meshes[0]?.name).toBe("trusted");
    expect([...receivedImage ?? []]).toEqual([...pixelBytes]);
    expect(calls).toEqual(expect.arrayContaining([root, geo, pixel]));
    loaded.dispose();
    geometry = new Uint8Array(positions.length).fill(9);
    expect(await pipelineError({ url: root, assetId: "tampered-buffer", request: { integrity }, imageDecoder: decode })).toMatch(/integrity/i);
    geometry = positions;
    image = new Uint8Array([9, 9, 9]);
    expect(await pipelineError({ url: root, assetId: "tampered-image", request: { integrity }, imageDecoder: decode })).toMatch(/integrity/i);
    expect(await pipelineError({ url: root, assetId: "missing-digest", request: { integrity: { ...integrity, dependencies: { "geo/triangle.bin": digest(positions) } } }, imageDecoder: decode })).toMatch(/integrity/i);
    expect(await pipelineError({ url: root, assetId: "tampered-document", request: { integrity: { ...integrity, digest: digest("different") } }, imageDecoder: decode })).toMatch(/integrity/i);
  });

  it("fails closed when the required SHA-256 implementation is unavailable, then permits a retry", async () => {
    const source = doc("retry", false);
    vi.stubGlobal("crypto", {});
    vi.stubGlobal("fetch", vi.fn(async () => binary(new TextEncoder().encode(source))));
    const request = { integrity: { version: 1 as const, digest: digest(source) } };
    expect(await pipelineError({ url: root, assetId: "no-sha", request })).toMatch(/sha-?256.*unavailable/i);
    vi.stubGlobal("crypto", webcrypto);
    const retry = await loadProductionGLTFRenderPipeline({ url: root, assetId: "retry", request });
    expect(retry.asset.meshes[0]?.name).toBe("retry");
    retry.dispose();
  });

  it("separates parsed content by digest and headers, including while another lease is live", async () => {
    installCrypto();
    const first = doc("alpha", false);
    const second = doc("beta", false);
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const key = new Headers(init.headers).get("authorization") ?? "";
      calls.push(key);
      return binary(new TextEncoder().encode(key === "Bearer alpha" ? first : second));
    }));
    const a = await acquireParsedGLTFAsset({ url: root, request: { securityContext: "auth-session", headers: { authorization: "Bearer alpha" }, integrity: { version: 1, digest: digest(first) } } });
    const b = await acquireParsedGLTFAsset({ url: root, request: { securityContext: "auth-session", headers: { authorization: "Bearer beta" }, integrity: { version: 1, digest: digest(second) } } });
    try {
      expect(a.asset.meshes[0]?.name).toBe("alpha");
      expect(b.asset.meshes[0]?.name).toBe("beta");
      expect(a.asset).not.toBe(b.asset);
      expect(calls).toEqual(["Bearer alpha", "Bearer beta"]);
      expect(snapshotParsedGLTFAssetCache().keys.join()).not.toContain("Bearer");
    } finally { a.release(); b.release(); }
  });

  it("keeps signed URL, userinfo, inline data and blob identities out of cache diagnostics", async () => {
    installCrypto();
    const load = vi.spyOn(GLTFLoader.prototype, "load").mockImplementation(async () => ({} as GLTFAsset));
    const dispose = vi.spyOn(GLTFLoader.prototype, "dispose").mockImplementation(() => {});
    const mark = vi.spyOn(performance, "mark");
    const urls = [
      "https://user-private:password-private@asset.example/models/a|b.gltf?token=signed-private#fragment-private",
      "data:model/gltf+json;base64,inline-private",
      "blob:https://asset.example/blob-private",
      "https://malformed-user:malformed-password@bad host/a|b?token=bad-signature"
    ];
    const leases: Awaited<ReturnType<typeof acquireParsedGLTFAsset>>[] = [];
    try {
      for (const url of urls) leases.push(await acquireParsedGLTFAsset({
        url, request: { securityContext: "generation-private", headers: { authorization: "Bearer header-private" }, format: "format-private" }
      }));
      const snapshot = snapshotParsedGLTFAssetCache();
      expect(snapshot.cachedEntries).toBe(4);
      expect(snapshot.totalReferences).toBe(4);
      expect(snapshot.keys).toEqual(expect.arrayContaining([
        expect.stringMatching(/^https:\/\/asset\.example\/models\/a\|b\.gltf\|request-[a-f0-9]{64}\|/),
        expect.stringMatching(/^data:<redacted>\|request-[a-f0-9]{64}\|/),
        expect.stringMatching(/^blob:<redacted>\|request-[a-f0-9]{64}\|/),
        expect.stringMatching(/^https:\/\/bad host\/a\|b\|request-[a-f0-9]{64}\|/)
      ]));
      const diagnostics = JSON.stringify({ keys: snapshot.keys, marks: mark.mock.calls });
      expect(diagnostics).not.toMatch(/user-private|password-private|signed-private|fragment-private|inline-private|blob-private|malformed-user|malformed-password|bad-signature|header-private|format-private|generation-private/);
      expect(load).toHaveBeenCalledTimes(4);
    } finally {
      for (const lease of leases) lease.release();
      mark.mockRestore();
      load.mockRestore();
      dispose.mockRestore();
    }
    expect(snapshotParsedGLTFAssetCache().cachedEntries).toBe(0);
  });

  it("shares a real inline glTF without exposing its data in the snapshot", async () => {
    installCrypto();
    const inline = `data:model/gltf+json;base64,${Buffer.from(doc("inline-actual", false)).toString("base64")}`;
    const first = await acquireParsedGLTFAsset({ url: inline, request: { credentials: "omit" } });
    const same = await acquireParsedGLTFAsset({ url: inline, request: { credentials: "omit" } });
    try {
      expect(first.asset.meshes[0]?.name).toBe("inline-actual");
      expect(same.asset).toBe(first.asset);
      const snapshot = snapshotParsedGLTFAssetCache();
      expect(snapshot.totalReferences).toBe(2);
      expect(snapshot.keys).toEqual([expect.stringMatching(/^data:<redacted>\|request-[a-f0-9]{64}\|/)]);
      expect(JSON.stringify(snapshot)).not.toContain(inline.slice(24, 48));
    } finally { first.release(); same.release(); }
  });

  it("shares only the same resolved URL and request policy, including signed queries", async () => {
    installCrypto();
    const firstUrl = "https://asset.example/models/a|b.gltf?token=first-secret";
    const normalizedUrl = "https://asset.example/models/other/../a|b.gltf?token=first-secret";
    const secondUrl = "https://asset.example/models/a|b.gltf?token=second-secret";
    const fetchMock = vi.fn(async (input: string, init: RequestInit) => {
      const token = new URL(input).searchParams.get("token");
      const authorization = new Headers(init.headers).get("authorization");
      return binary(new TextEncoder().encode(doc(`${token}:${authorization}`, false)));
    });
    vi.stubGlobal("fetch", fetchMock);
    const leases: Awaited<ReturnType<typeof acquireParsedGLTFAsset>>[] = [];
    try {
      const first = await acquireParsedGLTFAsset({ url: firstUrl, request: { securityContext: "signed-session", headers: { authorization: "first-header" } } });
      leases.push(first);
      const same = await acquireParsedGLTFAsset({ url: normalizedUrl, request: { securityContext: "signed-session", headers: [["Authorization", "first-header"]] } });
      leases.push(same);
      const changedUrl = await acquireParsedGLTFAsset({ url: secondUrl, request: { securityContext: "signed-session", headers: { authorization: "first-header" } } });
      leases.push(changedUrl);
      const changedHeader = await acquireParsedGLTFAsset({ url: firstUrl, request: { securityContext: "signed-session", headers: { authorization: "second-header" } } });
      leases.push(changedHeader);
      expect(same.asset).toBe(first.asset);
      expect(changedUrl.asset).not.toBe(first.asset);
      expect(changedHeader.asset).not.toBe(first.asset);
      expect(changedUrl.asset.meshes[0]?.name).toBe("second-secret:first-header");
      expect(changedHeader.asset.meshes[0]?.name).toBe("first-secret:second-header");
      expect(fetchMock).toHaveBeenCalledTimes(3);
      const snapshot = snapshotParsedGLTFAssetCache();
      expect(snapshot.cachedEntries).toBe(3);
      expect(snapshot.totalReferences).toBe(4);
      expect(new Set(snapshot.keys).size).toBe(3);
      expect(JSON.stringify(snapshot)).not.toMatch(/first-secret|second-secret|first-header|second-header/);
    } finally { for (const lease of leases) lease.release(); }
    expect(snapshotParsedGLTFAssetCache().cachedEntries).toBe(0);
  });

  it("parses and shares the policy captured before a delayed request digest", async () => {
    const realDigest = webcrypto.subtle.digest.bind(webcrypto.subtle);
    let resumeDigest!: () => void;
    let reachedDigest!: () => void;
    const digestGate = new Promise<void>((resolve) => { resumeDigest = resolve; });
    const digestStarted = new Promise<void>((resolve) => { reachedDigest = resolve; });
    let firstDigest = true;
    vi.stubGlobal("crypto", { subtle: { digest: async (...args: Parameters<typeof realDigest>) => {
      if (firstDigest) { firstDigest = false; reachedDigest(); await digestGate; }
      return realDigest(...args);
    } } });

    const source = doc("captured-policy");
    const headers = new Headers({ authorization: "Bearer original" });
    const origins = ["https://asset.example"];
    const dependencies = { "geo/triangle.bin": digest(positions) };
    const integrity = { version: 1 as const, digest: digest(source), dependencies, requireDependencies: true };
    const originalProgress = vi.fn(), replacementProgress = vi.fn();
    const originalController = new AbortController(), replacementController = new AbortController();
    replacementController.abort(new Error("replacement must not cancel original"));
    const originalDecoder = (() => ({ attributes: {} })) as never;
    const replacementDecoder = (() => ({ attributes: {} })) as never;
    const request = {
      headers, allowedOrigins: origins, integrity, credentials: "include" as RequestCredentials, securityContext: "original-generation",
      format: "gltf" as "gltf" | "glb", signal: originalController.signal, onProgress: originalProgress
    };
    const options = { url: root, format: undefined as "gltf" | "glb" | undefined, dracoDecoder: originalDecoder, request };
    const fetchMock = vi.fn(async (input: string, init: RequestInit) => {
      expect(new Headers(init.headers).get("authorization")).toBe("Bearer original");
      expect(init.credentials).toBe("include");
      if (input === root) return binary(new TextEncoder().encode(source));
      if (input === geo) return binary(positions);
      throw new Error(`unexpected asset ${input}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const pending = acquireParsedGLTFAsset(options);
    let first: Awaited<typeof pending> | undefined;
    let same: Awaited<typeof pending> | undefined;
    try {
      await digestStarted;
      headers.set("authorization", "Bearer replacement");
      origins[0] = "https://other.example";
      dependencies["geo/triangle.bin"] = digest("replacement dependency");
      integrity.digest = digest("replacement document");
      request.credentials = "omit";
      request.securityContext = "replacement-generation";
      request.format = "glb";
      request.signal = replacementController.signal;
      request.onProgress = replacementProgress;
      options.url = "https://other.example/replacement.glb";
      options.format = "glb";
      options.dracoDecoder = replacementDecoder;
      resumeDigest();

      first = await pending;
      expect(first.asset.meshes[0]?.name).toBe("captured-policy");
      expect(originalProgress).toHaveBeenCalled();
      expect(replacementProgress).not.toHaveBeenCalled();
      same = await acquireParsedGLTFAsset({
        url: root, dracoDecoder: originalDecoder,
        request: { headers: { authorization: "Bearer original" }, allowedOrigins: ["https://asset.example"],
          credentials: "include", securityContext: "original-generation", format: "gltf", integrity: { version: 1, digest: digest(source),
            dependencies: { "geo/triangle.bin": digest(positions) }, requireDependencies: true } }
      });
      expect(same.asset).toBe(first.asset);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(snapshotParsedGLTFAssetCache().totalReferences).toBe(2);
    } finally {
      resumeDigest();
      first?.release();
      same?.release();
    }
    expect(snapshotParsedGLTFAssetCache().cachedEntries).toBe(0);
  });

  it("honors the original subscriber signal when it aborts during the request digest", async () => {
    const realDigest = webcrypto.subtle.digest.bind(webcrypto.subtle);
    let resumeDigest!: () => void;
    let reachedDigest!: () => void;
    const digestGate = new Promise<void>((resolve) => { resumeDigest = resolve; });
    const digestStarted = new Promise<void>((resolve) => { reachedDigest = resolve; });
    vi.stubGlobal("crypto", { subtle: { digest: async (...args: Parameters<typeof realDigest>) => {
      reachedDigest(); await digestGate;
      return realDigest(...args);
    } } });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const original = new AbortController(), replacement = new AbortController();
    const request = { signal: original.signal };
    const pending = acquireParsedGLTFAsset({ url: root, request });
    const rejected = expect(pending).rejects.toThrow("original subscriber cancelled");
    try {
      await digestStarted;
      request.signal = replacement.signal;
      original.abort(new Error("original subscriber cancelled"));
    } finally { resumeDigest(); }
    await rejected;
    expect(fetchMock).not.toHaveBeenCalled();
    expect(snapshotParsedGLTFAssetCache().cachedEntries).toBe(0);
  });

  it("partitions by the effective top-level or request format before reusing a parse", async () => {
    installCrypto();
    const source = doc("format", false);
    const url = "https://asset.example/extensionless?token=format-secret";
    const fetchMock = vi.fn(async () => binary(new TextEncoder().encode(source)));
    vi.stubGlobal("fetch", fetchMock);
    const first = await acquireParsedGLTFAsset({ url, request: { credentials: "omit", format: "gltf" } });
    const same = await acquireParsedGLTFAsset({ url, format: "gltf", request: { credentials: "omit", format: "glb" } });
    try {
      expect(same.asset).toBe(first.asset);
      await expect(acquireParsedGLTFAsset({ url, request: { credentials: "omit", format: "glb" } })).rejects.toThrow(/format/i);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(snapshotParsedGLTFAssetCache().totalReferences).toBe(2);
    } finally { first.release(); same.release(); }
  });

  it.each(["missing", "failure"] as const)("does not share parses when SHA-256 is %s", async (mode) => {
    vi.stubGlobal("crypto", mode === "missing" ? undefined : { subtle: { digest: async () => { throw new Error("digest unavailable"); } } });
    const load = vi.spyOn(GLTFLoader.prototype, "load").mockImplementation(async () => ({} as GLTFAsset));
    let disposed = 0;
    const dispose = vi.spyOn(GLTFLoader.prototype, "dispose").mockImplementation(() => { disposed++; });
    const leases: Awaited<ReturnType<typeof acquireParsedGLTFAsset>>[] = [];
    try {
      const options = { url: "https://asset.example/model.gltf?token=fallback-private", request: { credentials: "omit" as const, headers: { authorization: "fallback-header" } } };
      leases.push(await acquireParsedGLTFAsset(options));
      leases.push(await acquireParsedGLTFAsset(options));
      expect(leases[0]!.asset).not.toBe(leases[1]!.asset);
      expect(load).toHaveBeenCalledTimes(2);
      const snapshot = snapshotParsedGLTFAssetCache();
      // Private leases remain owned, but are never stored in the reusable map.
      expect(snapshot.cachedEntries).toBe(0);
      expect(snapshot.totalReferences).toBe(0);
      expect(snapshot.keys).toEqual([]);
      expect(JSON.stringify(snapshot)).not.toMatch(/fallback-private|fallback-header/);
    } finally {
      for (const lease of leases) lease.release();
      load.mockRestore();
      dispose.mockRestore();
    }
    expect(disposed).toBe(2);
    expect(snapshotParsedGLTFAssetCache().cachedEntries).toBe(0);
  });

  it("partitions a live document by its admitted dependency digests", async () => {
    installCrypto();
    const source = doc("with-dependency");
    const changed = new Uint8Array(new Float32Array([-0.3, -0.3, 0, 0.3, -0.3, 0, 0, 0.3, 0]).buffer);
    let serving = positions;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => binary(url === root ? new TextEncoder().encode(source) : serving)));
    const options = (bytes: Uint8Array) => ({ url: root, request: { securityContext: "dependency-session", integrity: { version: 1 as const, digest: digest(source), dependencies: { "geo/triangle.bin": digest(bytes) }, requireDependencies: true } } });
    const first = await acquireParsedGLTFAsset(options(positions));
    serving = changed;
    const second = await acquireParsedGLTFAsset(options(changed));
    try {
      expect(first.asset).not.toBe(second.asset);
      expect(first.asset.meshes[0]?.positions[0]?.[0]).toBeCloseTo(-0.8);
      expect(second.asset.meshes[0]?.positions[0]?.[0]).toBeCloseTo(-0.3);
    } finally { first.release(); second.release(); }
  });

  it("rejects a redirected admitted dependency even when its bytes match", async () => {
    installCrypto();
    const source = doc("redirect", true);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const response = binary(url === root ? new TextEncoder().encode(source) : positions);
      if (url === geo) Object.defineProperties(response, {
        redirected: { value: true }, url: { value: "https://asset.example/unadmitted/triangle.bin" }
      });
      return response;
    }));
    const integrity = { version: 1 as const, digest: digest(source), dependencies: { "geo/triangle.bin": digest(positions) }, requireDependencies: true };
    expect(await pipelineError({ url: root, assetId: "redirected", request: { integrity } })).toMatch(/redirect/i);
  });

  it("honors a selected GLB format for an extensionless URL and rejects a mismatched format", async () => {
    installCrypto();
    const bytes = makeGlb();
    const url = "https://asset.example/model?id=123";
    vi.stubGlobal("fetch", vi.fn(async () => binary(bytes)));
    const request = { integrity: { version: 1 as const, digest: digest(bytes) } };
    const lease = await acquireParsedGLTFAsset({ url, format: "glb", request });
    expect(lease.asset.meshes[0]?.name).toBe("binary");
    lease.release();
    await expect(acquireParsedGLTFAsset({ url, format: "gltf", request })).rejects.toThrow(/format/i);
  });

  it("loads an admitted optional PLY adapter through the model path and awaits adapter cleanup", async () => {
    installCrypto();
    configureGlbResourceCache({ maxEntries: 0 });
    const source = ["ply", "format ascii 1.0", "element vertex 3", "property float x", "property float y", "property float z", "element face 1", "property list uchar int vertex_indices", "end_header", "-1 -1 0", "1 -1 0", "0 1 0", "3 0 1 2", ""].join("\n");
    vi.stubGlobal("fetch", vi.fn(async () => binary(new TextEncoder().encode(source))));
    const loader = new PLYLoader();
    let disposed = 0;
    const registry = new FormatRegistry();
    registry.register(createGLTFFormatAdapter("ply", ["ply"], {
      type: loader.type,
      canLoad: (request) => loader.canLoad(request),
      load: (request, context) => loader.load(request, context),
      async dispose(asset) { await Promise.resolve(); loader.dispose(asset); disposed++; }
    }, ["application/ply"], ["1.0"]));
    const asset = { url: "https://asset.example/model.ply", type: "model", format: "ply", hash: digest(source),
      formatMetadata: { adapter: "ply", version: "1.0", mediaType: "application/ply" } };
    const actor = await createTypedGLBActor({ asset, id: "native-ply", width: 64, height: 64, formatRegistry: registry });
    expect(actor.pipeline.asset.url).toBe(asset.url);
    expect(actor.collectRenderItems().length).toBeGreaterThan(0);
    expect(actor.pipeline.metadata.vertexCount).toBe(3);
    const pipeline = actor.pipeline;
    actor.dispose();
    await pipeline.disposeAsync();
    expect(disposed).toBe(1);
    await pipeline.disposeAsync();
    expect(disposed).toBe(1);
    await expect(createTypedGLBActor({ asset: { ...asset, hash: digest("wrong") }, id: "bad", width: 64, height: 64, formatRegistry: registry })).rejects.toThrow(/integrity/i);
    await expect(createTypedGLBActor({ asset, id: "missing", width: 64, height: 64 })).rejects.toThrow(/adapter/i);
  });

  it("uses admitted request settings and releases a registered adapter even with the GLB cache enabled", async () => {
    installCrypto();
    const source = ["ply", "format ascii 1.0", "element vertex 3", "property float x", "property float y", "property float z", "element face 1", "property list uchar int vertex_indices", "end_header", "-1 -1 0", "1 -1 0", "0 1 0", "3 0 1 2", ""].join("\n");
    const url = "https://asset.example/model.ply?revision=2";
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => binary(new TextEncoder().encode(source)));
    vi.stubGlobal("fetch", fetchMock);
    const loader = new PLYLoader();
    const disposed = vi.spyOn(loader, "dispose");
    const registry = new FormatRegistry();
    registry.register(createGLTFFormatAdapter("ply", ["ply"], loader));
    const owner = {};
    const asset = { url, format: "ply", hash: digest(source), request: {
      headers: { "x-model-context": "one" }, credentials: "include" as const, allowedOrigins: ["https://asset.example"]
    } };
    const actor = await createTypedGLBActor({ asset, id: "request-ply", width: 64, height: 64, formatRegistry: registry, runtimeOwner: owner });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [requested, init] = fetchMock.mock.calls[0]!;
    expect(requested).toBe(url);
    expect(new Headers(init?.headers).get("x-model-context")).toBe("one");
    expect(init?.credentials).toBe("include");
    expect(init?.redirect).toBe("error");
    actor.dispose();
    await awaitTypedGLBActorDisposals(owner);
    expect(disposed).toHaveBeenCalledOnce();
    await expect(createTypedGLBActor({ asset: { ...asset, request: { integrity: { version: 1, digest: digest("wrong") } } }, id: "conflict", width: 64, height: 64, formatRegistry: registry })).rejects.toThrow(/integrity/i);
  });

  it("keeps asynchronous adapter cleanup and failures scoped to its owner", async () => {
    installCrypto();
    const source = ["ply", "format ascii 1.0", "element vertex 3", "property float x", "property float y", "property float z", "element face 1", "property list uchar int vertex_indices", "end_header", "-1 -1 0", "1 -1 0", "0 1 0", "3 0 1 2", ""].join("\n");
    vi.stubGlobal("fetch", vi.fn(async () => binary(new TextEncoder().encode(source))));
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const disposing = new Promise<void>((resolve) => { started = resolve; });
    const firstLoader = new PLYLoader(), secondLoader = new PLYLoader();
    const firstRegistry = new FormatRegistry(), secondRegistry = new FormatRegistry();
    firstRegistry.register(createGLTFFormatAdapter("ply", ["ply"], {
      type: "ply", canLoad: (request) => firstLoader.canLoad(request),
      load: (request, context) => firstLoader.load(request, context),
      async dispose(asset) { started(); await gate; firstLoader.dispose(asset); throw new Error("adapter cleanup failed"); }
    }));
    secondRegistry.register(createGLTFFormatAdapter("ply", ["ply"], secondLoader));
    const firstOwner = {}, secondOwner = {};
    const asset = { url: "https://asset.example/shared.ply", format: "ply", hash: digest(source) };
    const [first, second] = await Promise.all([
      createTypedGLBActor({ asset, id: "first", width: 64, height: 64, formatRegistry: firstRegistry, runtimeOwner: firstOwner }),
      createTypedGLBActor({ asset, id: "second", width: 64, height: 64, formatRegistry: secondRegistry, runtimeOwner: secondOwner })
    ]);
    first.dispose(); second.dispose();
    await disposing;
    const firstDone = awaitTypedGLBActorDisposals(firstOwner);
    await expect(awaitTypedGLBActorDisposals(secondOwner)).resolves.toBeUndefined();
    let settled = false;
    void firstDone.catch(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    release();
    await expect(firstDone).rejects.toThrow(/Native model cleanup failed/);
    await expect(awaitTypedGLBActorDisposals(secondOwner)).resolves.toBeUndefined();
  });

  it("cancels one registered native model without cancelling a peer's request", async () => {
    installCrypto();
    const source = ["ply", "format ascii 1.0", "element vertex 3", "property float x", "property float y", "property float z", "element face 1", "property list uchar int vertex_indices", "end_header", "-1 -1 0", "1 -1 0", "0 1 0", "3 0 1 2", ""].join("\n");
    const responses: Array<(response: Response) => void> = [];
    const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => new Promise<Response>((resolve) => { responses.push(resolve); }));
    vi.stubGlobal("fetch", fetchMock);
    const firstRegistry = new FormatRegistry(), secondRegistry = new FormatRegistry();
    firstRegistry.register(createGLTFFormatAdapter("ply", ["ply"], new PLYLoader()));
    secondRegistry.register(createGLTFFormatAdapter("ply", ["ply"], new PLYLoader()));
    const firstSignal = new AbortController(), secondSignal = new AbortController();
    const firstOwner = {}, secondOwner = {};
    const asset = { url: "https://asset.example/shared.ply", format: "ply", hash: digest(source) };
    const first = createTypedGLBActor({ asset: { ...asset, request: { credentials: "include", headers: { "x-context": "first" } } }, id: "first", width: 64, height: 64, formatRegistry: firstRegistry, runtimeOwner: firstOwner, request: { signal: firstSignal.signal } });
    const second = createTypedGLBActor({ asset: { ...asset, request: { credentials: "same-origin", headers: { "x-context": "second" } } }, id: "second", width: 64, height: 64, formatRegistry: secondRegistry, runtimeOwner: secondOwner, request: { signal: secondSignal.signal } });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const firstIndex = fetchMock.mock.calls.findIndex(([, init]) => new Headers(init?.headers).get("x-context") === "first");
    const secondIndex = fetchMock.mock.calls.findIndex(([, init]) => new Headers(init?.headers).get("x-context") === "second");
    expect(firstIndex).toBeGreaterThanOrEqual(0);
    expect(secondIndex).toBeGreaterThanOrEqual(0);
    const firstInit = fetchMock.mock.calls[firstIndex]![1]!, secondInit = fetchMock.mock.calls[secondIndex]![1]!;
    expect(firstInit.credentials).toBe("include");
    expect(secondInit.credentials).toBe("same-origin");
    expect(new Headers(firstInit.headers).get("x-context")).toBe("first");
    expect(new Headers(secondInit.headers).get("x-context")).toBe("second");
    firstSignal.abort(new Error("first cancelled"));
    await expect(first).rejects.toThrow("first cancelled");
    expect(firstInit.signal?.aborted).toBe(true);
    expect(secondInit.signal?.aborted).toBe(false);
    responses[secondIndex]!(binary(new TextEncoder().encode(source)));
    const actor = await second;
    expect(actor.collectRenderItems().length).toBeGreaterThan(0);
    actor.dispose();
    await awaitTypedGLBActorDisposals(secondOwner);
    // A noncooperative fetch may still settle; the cancelled request owns no actor.
    responses[firstIndex]!(binary(new TextEncoder().encode(source)));
  });

  it("cancels one parse subscriber without cancelling the other and cleans up the last lease", async () => {
    installCrypto();
    const source = doc("shared", false);
    let unblock!: (response: Response) => void;
    let requested!: () => void;
    const called = new Promise<void>((resolve) => { requested = resolve; });
    let fetches = 0;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      fetches++;
      requested();
      return await new Promise<Response>((resolve, reject) => {
        unblock = resolve;
        init.signal?.addEventListener("abort", () => reject(new Error("underlying fetch cancelled")), { once: true });
      });
    }));
    const aController = new AbortController();
    const bController = new AbortController();
    const integrity = { version: 1 as const, digest: digest(source) };
    const a = acquireParsedGLTFAsset({ url: root, request: { credentials: "omit", signal: aController.signal, integrity } });
    const b = acquireParsedGLTFAsset({ url: root, request: { credentials: "omit", signal: bController.signal, integrity } });
    await called;
    // Let both subscribers complete their asynchronous request identity calculation.
    await vi.waitFor(() => expect(snapshotParsedGLTFAssetCache().totalReferences).toBe(2));
    aController.abort();
    await expect(a).rejects.toMatchObject({ name: "AbortError" });
    unblock(binary(new TextEncoder().encode(source)));
    const survivor = await b;
    expect(survivor.asset.meshes[0]?.name).toBe("shared");
    expect(fetches).toBe(1);
    survivor.release(); survivor.release();
    expect(snapshotParsedGLTFAssetCache().cachedEntries).toBe(0);
  });

  it("cancels an unscoped parse without sharing or aborting another credentialed request", async () => {
    installCrypto();
    const source = doc("private-survivor", false);
    const transports: { signal: AbortSignal; resolve: (response: Response) => void }[] = [];
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => new Promise<Response>((resolve, reject) => {
      const signal = init.signal!;
      transports.push({ signal, resolve });
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    })));
    const firstController = new AbortController();
    const first = acquireParsedGLTFAsset({ url: root, request: { signal: firstController.signal } });
    const firstRejected = expect(first).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(transports).toHaveLength(1));
    const second = acquireParsedGLTFAsset({ url: root });
    await vi.waitFor(() => expect(transports).toHaveLength(2));
    expect(snapshotParsedGLTFAssetCache().cachedEntries).toBe(0);
    firstController.abort();
    await firstRejected;
    expect(transports[0]!.signal.aborted).toBe(true);
    expect(transports[1]!.signal.aborted).toBe(false);
    transports[1]!.resolve(binary(new TextEncoder().encode(source)));
    const survivor = await second;
    expect(survivor.asset.meshes[0]?.name).toBe("private-survivor");
    expect(survivor.asset.disposed).toBe(false);
    survivor.release(); survivor.release();
    expect(survivor.asset.disposed).toBe(true);
    expect(snapshotParsedGLTFAssetCache().cachedEntries).toBe(0);
  });

  it("settles cancellation during an uncooperative image decode and releases a late result", async () => {
    installCrypto();
    const source = doc("slow-image", true, true);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => binary(url === root ? new TextEncoder().encode(source) : url === geo ? positions : pixelBytes)));
    const controller = new AbortController();
    let started!: () => void;
    let finish!: (value: ReturnType<typeof decode>) => void;
    const entered = new Promise<void>((resolve) => { started = resolve; });
    const integrity = { version: 1 as const, digest: digest(source), dependencies: { "geo/triangle.bin": digest(positions), "pixel.bin": digest(pixelBytes) }, requireDependencies: true };
    const pending = loadProductionGLTFRenderPipeline({ url: root, assetId: "slow-image", request: { integrity, signal: controller.signal },
      imageDecoder: () => { started(); return new Promise((resolve) => { finish = resolve; }); } });
    await entered;
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(snapshotParsedGLTFAssetCache().cachedEntries).toBe(0);
    finish(decode());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(snapshotParsedGLTFAssetCache().totalReferences).toBe(0);
  });

  it("enforces legacy typed-asset hash and rejects redirect mismatches before parsing", async () => {
    installCrypto();
    const source = doc("actor", false);
    let target = root;
    vi.stubGlobal("fetch", vi.fn(async () => {
      const response = binary(new TextEncoder().encode(source));
      Object.defineProperties(response, { redirected: { value: target !== root }, url: { value: target } });
      return response;
    }));
    const opts = { asset: { url: root, format: "gltf", hash: digest(source) }, id: "root-triangle", width: 64, height: 64 };
    const actor = await createTypedGLBActor(opts);
    expect(actor.pipeline.asset.meshes[0]?.name).toBe("actor");
    actor.dispose();
    target = "https://other.example/changed.gltf";
    await expect(createTypedGLBActor({ ...opts, asset: { ...opts.asset, hash: digest("different") } })).rejects.toThrow(/redirect|integrity/i);
    await expect(createTypedGLBActor({ ...opts, asset: { ...opts.asset, hash: "sha256-bad" } })).rejects.toThrow(/digest/i);
  });
});
