import { createHash, webcrypto } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssetManager } from "../../../packages/assets/src/AssetManager";
import { mergeAssetRequestOptions } from "../../../packages/assets/src/AssetLoader";
import { fetchGltfBytesShared } from "../../../packages/assets/src/GLTFLoader";

afterEach(() => vi.unstubAllGlobals());

/** Hold identity resolution until the caller has changed its original options. */
function delayRequestHashes(): () => void {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  vi.stubGlobal("crypto", {
    getRandomValues: webcrypto.getRandomValues.bind(webcrypto),
    subtle: {
      digest: (_algorithm: string, data: BufferSource) => {
        const bytes = data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        const digest = Uint8Array.from(createHash("sha256").update(bytes).digest()).buffer;
        return gate.then(() => digest);
      }
    }
  });
  return release;
}

describe("asset request policy snapshots", () => {
  it("copies mutable containers while preserving supported header representations", () => {
    const objectHeaders = { Authorization: "first" };
    const tupleHeaders: [string, string][] = [["X-First", "one"], ["X-Second", "two"]];
    const webHeaders = new Headers({ "X-Context": "old" });
    const origins = ["https://assets.test"];
    const dependencies = { "image.bin": "first-digest" };
    const objectSnapshot = mergeAssetRequestOptions({}, {
      headers: objectHeaders,
      allowedOrigins: origins,
      integrity: { version: 1, digest: "document-digest", dependencies, requireDependencies: true }
    });
    const tupleSnapshot = mergeAssetRequestOptions({}, { headers: tupleHeaders });
    const webSnapshot = mergeAssetRequestOptions({}, { headers: webHeaders });

    objectHeaders.Authorization = "second";
    tupleHeaders[0]![1] = "changed";
    webHeaders.set("X-Context", "new");
    origins.push("https://other.test");
    dependencies["image.bin"] = "changed-digest";

    expect(objectSnapshot.headers).toEqual({ Authorization: "first" });
    expect(tupleSnapshot.headers).toEqual([["X-First", "one"], ["X-Second", "two"]]);
    expect(webSnapshot.headers).toBeInstanceOf(Headers);
    expect(new Headers(webSnapshot.headers).get("x-context")).toBe("old");
    expect(objectSnapshot.allowedOrigins).toEqual(["https://assets.test"]);
    expect(objectSnapshot.integrity).toEqual({
      version: 1, digest: "document-digest", dependencies: { "image.bin": "first-digest" }, requireDependencies: true
    });
  });

  it("keeps manager cache identity and loader policy consistent across caller mutation", async () => {
    const releaseHashes = delayRequestHashes();
    const manager = new AssetManager();
    const loaded: string[] = [];
    manager.register({
      type: "snapshot-fixture",
      canLoad: () => true,
      load(request) {
        const identity = new Headers(request.headers).get("authorization") ?? "";
        loaded.push(identity);
        return identity;
      }
    });
    const url = "https://assets.test/model.asset";
    const headers = { Authorization: "first" };
    const firstPending = manager.load<string>(url, { headers, securityContext: "snapshot-session" });
    headers.Authorization = "second";
    const samePending = manager.load<string>(url, { headers: { Authorization: "first" }, securityContext: "snapshot-session" });
    releaseHashes();

    const [first, same] = await Promise.all([firstPending, samePending]);
    expect(first.value).toBe("first");
    expect(same.value).toBe("first");
    expect(first).toBe(same);
    const second = await manager.load<string>(url, { headers, securityContext: "snapshot-session" });
    expect(second.value).toBe("second");
    expect(second).not.toBe(first);
    expect(loaded).toEqual(["first", "second"]);
    await Promise.all([first.release(), same.release(), second.release()]);
  });

  it("keeps shared byte-fetch identity and actual transport headers consistent", async () => {
    const releaseHashes = delayRequestHashes();
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) =>
      new Response(new Headers(init.headers).get("authorization") ?? ""));
    vi.stubGlobal("fetch", fetchMock);
    const url = "https://assets.test/model.gltf";
    const headers = { Authorization: "first" };
    const failed = (status: number) => `request failed ${status}`;
    const firstPending = fetchGltfBytesShared(url, "document", { url, headers, securityContext: "snapshot-session" }, failed);
    headers.Authorization = "second";
    const samePending = fetchGltfBytesShared(url, "document", { url, headers: { Authorization: "first" }, securityContext: "snapshot-session" }, failed);
    releaseHashes();

    const [first, same] = await Promise.all([firstPending, samePending]);
    const decode = (bytes: ArrayBuffer) => new TextDecoder().decode(bytes);
    expect(decode(first)).toBe("first");
    expect(decode(same)).toBe("first");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const second = await fetchGltfBytesShared(url, "document", { url, headers, securityContext: "snapshot-session" }, failed);
    expect(decode(second)).toBe("second");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([undefined, "same-origin", "include"] as const)("keeps unscoped %s byte fetches private when one caller cancels", async (credentials) => {
    vi.stubGlobal("crypto", webcrypto);
    const active: { signal: AbortSignal; resolve: (response: Response) => void }[] = [];
    const fetchMock = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((resolve, reject) => {
      const signal = init.signal!;
      active.push({ signal, resolve });
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }));
    vi.stubGlobal("fetch", fetchMock);
    const url = "https://assets.test/private.gltf";
    const firstController = new AbortController();
    const secondController = new AbortController();
    const request = credentials === undefined ? {} : { credentials };
    const first = fetchGltfBytesShared(url, "document", { url, ...request, signal: firstController.signal }, () => "failed");
    const firstRejected = expect(first).rejects.toThrow("first session cancelled");
    await vi.waitFor(() => expect(active).toHaveLength(1));
    const second = fetchGltfBytesShared(url, "document", { url, ...request, signal: secondController.signal }, () => "failed");
    await vi.waitFor(() => expect(active).toHaveLength(2));
    firstController.abort(new Error("first session cancelled"));
    await firstRejected;
    expect(active[0]!.signal.aborted).toBe(true);
    expect(active[1]!.signal.aborted).toBe(false);
    active[1]!.resolve(new Response("second session"));
    expect(new TextDecoder().decode(await second)).toBe("second session");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shares scoped byte fetches only within the same authentication generation", async () => {
    // Resolve hashes deterministically so both same-generation subscribers
    // join the in-flight entry before either response is released.
    vi.stubGlobal("crypto", { subtle: { digest: (_algorithm: string, data: BufferSource) => {
      const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      return Promise.resolve(Uint8Array.from(createHash("sha256").update(bytes).digest()).buffer);
    } } });
    const pending: ((response: Response) => void)[] = [];
    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      expect(init).not.toHaveProperty("securityContext");
      return new Promise<Response>((resolve) => { pending.push(resolve); });
    });
    vi.stubGlobal("fetch", fetchMock);
    const url = "https://assets.test/scoped.gltf";
    const request = (securityContext: string) => ({ url, credentials: "include" as const, securityContext });
    const first = fetchGltfBytesShared(url, "document", request("generation-a"), () => "failed");
    const same = fetchGltfBytesShared(url, "document", request("generation-a"), () => "failed");
    const rotated = fetchGltfBytesShared(url, "document", request("generation-b"), () => "failed");
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    pending[0]!(new Response("old generation"));
    pending[1]!(new Response("new generation"));
    const [a, a2, b] = await Promise.all([first, same, rotated]);
    expect(new TextDecoder().decode(a)).toBe("old generation");
    expect(new TextDecoder().decode(a2)).toBe("old generation");
    expect(a).not.toBe(a2);
    expect(new TextDecoder().decode(b)).toBe("new generation");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
