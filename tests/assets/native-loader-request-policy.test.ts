/**
 * S5-WP07-04: the audio, scene, image-bitmap and generic renderable loaders
 * apply the same request contract as FileLoader/DataTextureLoader —
 * credentials, headers, integrity, cancellation, size limits, redacted errors
 * and owner-scoped callbacks. One block per loader, same four checks each.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { AudioLoader } from "../../packages/assets/src/AudioLoader";
import { ImageBitmapLoader } from "../../packages/assets/src/ImageBitmapLoader";
import { LoadContext } from "../../packages/assets/src/LoadContext";
import { SceneLoader } from "../../packages/assets/src/SceneLoader";
import { loadRenderableAsset } from "../../packages/assets/src/loadRenderableAsset";

const SECRET = "s3cr3t-signature";
const ORIGIN = "https://cdn.example.test";

async function sha256(text: string): Promise<string> {
  const digest = await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function wrongIntegrity() {
  return { version: 1 as const, digest: "0".repeat(64) };
}

function mockFetch(body: () => BodyInit | Response) {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
    const value = body();
    return value instanceof Response ? value : new Response(value);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** A fetch that only settles when the test releases it, so cancellation lands mid-flight. */
function hangingFetch() {
  let started!: () => void;
  const startedPromise = new Promise<void>((resolve) => { started = resolve; });
  const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    started();
    init?.signal?.addEventListener("abort", () => reject(init.signal!.reason), { once: true });
  }));
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, started: startedPromise };
}

function expectNoSecret(error: unknown): void {
  const text = [String((error as Error)?.message), String((error as Error & { cause?: unknown })?.cause instanceof Error
    ? ((error as Error & { cause: Error }).cause.message) : (error as Error & { cause?: unknown })?.cause ?? "")].join(" ");
  expect(text).not.toContain(SECRET);
  expect(text).not.toContain("user:pw");
}

async function rejection(pending: Promise<unknown>): Promise<unknown> {
  try { await pending; } catch (error) { return error; }
  throw new Error("expected rejection");
}

beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => vi.unstubAllGlobals());

describe("AudioLoader request policy", () => {
  const decoder = () => ({ decodeAudioData: vi.fn(async (bytes: ArrayBuffer) => ({ length: bytes.byteLength }) as AudioBuffer) });

  it("forwards credentials and per-request headers under an origin allowlist", async () => {
    const fetchMock = mockFetch(() => "abc");
    const context = decoder();
    await new AudioLoader(context).load({ url: `${ORIGIN}/a.wav`, headers: { "X-Request": "r" } },
      new LoadContext({ credentials: "include", allowedOrigins: [ORIGIN] }));
    const init = fetchMock.mock.calls[0]![1]!;
    expect(init).toMatchObject({ credentials: "include", redirect: "error" });
    expect(new Headers(init.headers).get("x-request")).toBe("r");
    // Credential-bearing cross-origin requests without an allowlist are refused before fetch.
    await expect(new AudioLoader(context).load({ url: `${ORIGIN}/a.wav` },
      new LoadContext({ credentials: "include", sourceOrigin: "https://app.example.test" }))).rejects.toThrow(/allowedOrigins/);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rejects integrity mismatches and oversize bodies before decoding", async () => {
    mockFetch(() => "abc");
    const context = decoder();
    await expect(new AudioLoader(context).load({ url: `${ORIGIN}/a.wav`, integrity: { version: 1, digest: await sha256("abc") } }, new LoadContext())).resolves.toBeDefined();
    await expect(new AudioLoader(context).load({ url: `${ORIGIN}/a.wav`, integrity: wrongIntegrity() }, new LoadContext())).rejects.toThrow(/integrity mismatch/);
    await expect(new AudioLoader(context).load({ url: `${ORIGIN}/a.wav`, maxBytes: 2 }, new LoadContext())).rejects.toThrow(/exceeds maxBytes/);
    expect(context.decodeAudioData).toHaveBeenCalledOnce();
  });

  it("aborts in-flight transport from either the caller or the owning context and suppresses callbacks", async () => {
    const { started } = hangingFetch();
    const progress = vi.fn();
    const owner = new AbortController();
    const pending = new AudioLoader(decoder()).load({ url: `${ORIGIN}/a.wav`, onProgress: progress }, new LoadContext({ signal: owner.signal }));
    await started;
    owner.abort(new Error("owner closed"));
    await expect(pending).rejects.toThrow("owner closed");
    expect(progress).not.toHaveBeenCalled();
  });

  it("redacts signed URLs and credentials from transport and decoder errors", async () => {
    const url = `https://user:pw@cdn.example.test/a.wav?sig=${SECRET}`;
    mockFetch(() => new Response("missing", { status: 404 }));
    expectNoSecret(await rejection(new AudioLoader(decoder()).load({ url }, new LoadContext())));
    mockFetch(() => "abc");
    const hostile = { decodeAudioData: async () => { throw new Error(`cannot decode ${url}`); } };
    const error = await rejection(new AudioLoader(hostile).load({ url }, new LoadContext()));
    expect(String((error as Error).message)).toMatch(/Audio decode failed/);
    expectNoSecret(error);
  });
});

describe("SceneLoader request policy", () => {
  const sceneJson = JSON.stringify({ nodes: [{ name: "root" }] });

  it("forwards credentials and context headers under an origin allowlist", async () => {
    const fetchMock = mockFetch(() => sceneJson);
    const loader = new SceneLoader();
    const asset = await loader.load({ url: `${ORIGIN}/w.scene.json` },
      new LoadContext({ credentials: "include", headers: { "X-Scene": "s" }, allowedOrigins: [ORIGIN] }));
    loader.dispose(asset);
    const init = fetchMock.mock.calls[0]![1]!;
    expect(init).toMatchObject({ credentials: "include", redirect: "error" });
    expect(new Headers(init.headers).get("x-scene")).toBe("s");
    await expect(loader.load({ url: "https://evil.example.test/w.scene.json" }, new LoadContext({ allowedOrigins: [ORIGIN] }))).rejects.toThrow(/not allowed/);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rejects integrity mismatches and oversize documents before parsing", async () => {
    mockFetch(() => sceneJson);
    const loader = new SceneLoader();
    loader.dispose(await loader.load({ url: `${ORIGIN}/w.scene.json`, integrity: { version: 1, digest: await sha256(sceneJson) } }, new LoadContext()));
    await expect(loader.load({ url: `${ORIGIN}/w.scene.json`, integrity: wrongIntegrity() }, new LoadContext())).rejects.toThrow(/integrity mismatch/);
    await expect(loader.load({ url: `${ORIGIN}/w.scene.json`, maxBytes: 4 }, new LoadContext())).rejects.toThrow(/exceeds maxBytes/);
  });

  it("aborts in-flight transport and suppresses owner callbacks", async () => {
    const { started } = hangingFetch();
    const progress = vi.fn();
    const controller = new AbortController();
    const pending = new SceneLoader().load({ url: `${ORIGIN}/w.scene.json`, signal: controller.signal, onProgress: progress }, new LoadContext());
    await started;
    controller.abort(new Error("cancel scene"));
    await expect(pending).rejects.toThrow("cancel scene");
    expect(progress).not.toHaveBeenCalled();
  });

  it("redacts signed URLs from transport, parse and validation errors", async () => {
    const url = `https://user:pw@cdn.example.test/w.scene.json?sig=${SECRET}`;
    mockFetch(() => new Response("gone", { status: 410 }));
    expectNoSecret(await rejection(new SceneLoader().load({ url }, new LoadContext())));
    mockFetch(() => `{"nodes": [${SECRET}`);
    const parseError = await rejection(new SceneLoader().load({ url }, new LoadContext()));
    expect(String((parseError as Error).message)).toMatch(/Invalid scene JSON/);
    expectNoSecret(parseError);
    mockFetch(() => JSON.stringify({ nodes: [{ translation: [1, 2] }] }));
    const invalid = await rejection(new SceneLoader().load({ url }, new LoadContext()));
    expect(String((invalid as Error).message)).toMatch(/translation/);
    expectNoSecret(invalid);
  });
});

describe("ImageBitmapLoader request policy", () => {
  const bitmap = () => ({ close: vi.fn(), width: 4, height: 4 }) as unknown as ImageBitmap;

  it("layers loader headers, request-option defaults and per-call headers like FileLoader", async () => {
    const fetchMock = mockFetch(() => "abc");
    vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap()));
    const loader = new ImageBitmapLoader().setWithCredentials(true).setRequestHeader({ "X-Loader": "l", "X-Shared": "loader" })
      .setRequestOptions({ allowedOrigins: [ORIGIN], headers: { "X-Shared": "options" } });
    await loader.loadAsync(`${ORIGIN}/i.png`, undefined, { headers: { "X-Call": "c" } });
    const init = fetchMock.mock.calls[0]![1]!;
    expect(init).toMatchObject({ credentials: "include", redirect: "error" });
    const headers = new Headers(init.headers);
    expect([headers.get("x-loader"), headers.get("x-shared"), headers.get("x-call")]).toEqual(["l", "options", "c"]);
    await expect(loader.loadAsync("https://evil.example.test/i.png")).rejects.toThrow(/not allowed/);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rejects integrity mismatches (loader default or per call) before decoding", async () => {
    mockFetch(() => "abc");
    const decode = vi.fn(async () => bitmap());
    vi.stubGlobal("createImageBitmap", decode);
    const loader = new ImageBitmapLoader().setRequestOptions({ integrity: wrongIntegrity() });
    await expect(loader.loadAsync(`${ORIGIN}/i.png`)).rejects.toThrow(/integrity mismatch/);
    await expect(loader.loadAsync(`${ORIGIN}/i.png`, undefined, { integrity: { version: 1, digest: await sha256("abc") } })).resolves.toBeDefined();
    await expect(new ImageBitmapLoader().loadAsync(`${ORIGIN}/i.png`, undefined, { maxBytes: 2 })).rejects.toThrow(/exceeds maxBytes/);
    expect(decode).toHaveBeenCalledOnce();
  });

  it("cancels through the loader-level signal and never hands a bitmap to a cancelled owner", async () => {
    const { started } = hangingFetch();
    vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap()));
    const owner = new AbortController();
    const onLoad = vi.fn();
    const onError = vi.fn();
    const pending = new ImageBitmapLoader().setRequestOptions({ signal: owner.signal }).load(`${ORIGIN}/i.png`, onLoad, undefined, onError);
    await started;
    owner.abort(new Error("loader closed"));
    await expect(pending).rejects.toThrow("loader closed");
    expect(onLoad).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledOnce();
  });

  it("redacts signed URLs from transport errors", async () => {
    mockFetch(() => new Response("missing", { status: 404 }));
    vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap()));
    expectNoSecret(await rejection(new ImageBitmapLoader().loadAsync(`https://user:pw@cdn.example.test/i.png?sig=${SECRET}`)));
  });
});

describe("loadRenderableAsset request policy", () => {
  const manifest = JSON.stringify({ schemaVersion: "a3d-engine-readiness-canonical-product-scene", kind: "canonical-product-scene", sourceFixture: "createCanonicalProductSceneRenderKit" });
  const gltf = JSON.stringify({ asset: { version: "2.0" } });

  it("forwards credentials and headers for canonical manifests and registry-selected glTF documents", async () => {
    const fetchMock = mockFetch(() => fetchMock.mock.calls.length === 1 ? manifest : gltf);
    await loadRenderableAsset(`${ORIGIN}/c.json`, { type: "canonical-product-scene", credentials: "include", headers: { "X-R": "1" }, allowedOrigins: [ORIGIN] });
    const loaded = await loadRenderableAsset(`${ORIGIN}/m.gltf`, { credentials: "include", headers: { "X-R": "2" }, allowedOrigins: [ORIGIN] });
    await loaded.dispose?.();
    for (const [index, value] of [[0, "1"], [1, "2"]] as const) {
      const init = fetchMock.mock.calls[index]![1]!;
      expect(init).toMatchObject({ credentials: "include", redirect: "error" });
      expect(new Headers(init.headers).get("x-r")).toBe(value);
    }
  });

  it("rejects integrity mismatches for canonical manifests and registry documents", async () => {
    mockFetch(() => manifest);
    await expect(loadRenderableAsset(`${ORIGIN}/c.json`, { type: "canonical-product-scene", integrity: { version: 1, digest: await sha256(manifest) } })).resolves.toMatchObject({ kind: "canonical-product-scene" });
    await expect(loadRenderableAsset(`${ORIGIN}/c.json`, { type: "canonical-product-scene", integrity: wrongIntegrity() })).rejects.toThrow(/integrity/);
    mockFetch(() => gltf);
    await expect(loadRenderableAsset(`${ORIGIN}/m.gltf`, { integrity: wrongIntegrity() })).rejects.toThrow(/integrity/);
  });

  it("aborts in-flight transport and suppresses owner progress", async () => {
    const { started } = hangingFetch();
    const progress = vi.fn();
    const controller = new AbortController();
    const pending = loadRenderableAsset(`${ORIGIN}/c.json`, { type: "canonical-product-scene", signal: controller.signal, onProgress: progress });
    await started;
    controller.abort(new Error("cancel renderable"));
    await expect(pending).rejects.toThrow("cancel renderable");
    expect(progress).not.toHaveBeenCalled();
    const already = new AbortController();
    already.abort(new Error("pre-aborted"));
    await expect(loadRenderableAsset(`${ORIGIN}/m.gltf`, { signal: already.signal })).rejects.toThrow();
  });

  it("redacts signed URLs from canonical and registry transport errors", async () => {
    mockFetch(() => new Response("missing", { status: 404 }));
    expectNoSecret(await rejection(loadRenderableAsset(`https://user:pw@cdn.example.test/c.json?sig=${SECRET}`, { type: "canonical-product-scene" })));
    expectNoSecret(await rejection(loadRenderableAsset(`https://user:pw@cdn.example.test/m.gltf?sig=${SECRET}`)));
  });
});
