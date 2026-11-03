import { createHash, webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCustomShaderMaterial } from "../../../packages/engine/src/agent-api/compiler/customMaterial";
import { prepareCustomMaterialTextureWork, upgradeCustomMaterialTextures } from "../../../packages/engine/src/agent-api/compiler/customTextures";
import { defineAuraAssets } from "../../../packages/engine/src/agent-api/nodes/assets";
import type { AuraCustomMaterialSpec, AuraAssetRef, ProductionRuntimePrimitiveEntry } from "../../../packages/engine/src/agent-api/nodes/types";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";

const BYTES = Uint8Array.of(7, 11, 13, 17);
const SIGNED_URL = "https://assets.example.test/image.png?signature=private-query-value";

function asset(request?: { credentials?: RequestCredentials; securityContext?: string }): AuraAssetRef<"texture"> {
  return defineAuraAssets({ image: {
    type: "texture", format: "png", url: SIGNED_URL,
    hash: createHash("sha256").update(BYTES).digest("hex"),
    ...(request ? { request } : {})
  } }).image;
}

function fixture(value: AuraAssetRef<"texture">) {
  const custom: AuraCustomMaterialSpec = {
    glsl: { fragment: "out vec4 outColor; void main() { outColor = texture(map, vec2(0.5)); }" },
    uniforms: { map: { type: "texture2d", value } }
  };
  const material = createCustomShaderMaterial(custom, "fixture");
  const materialSpec = { kind: "custom" as const, custom };
  const resource = { name: "fixture", material, materialSpec,
    textureWarnings: [] as string[], textureDisposer: undefined as (() => void) | undefined };
  const entries = [{ resources: [resource] }] as unknown as readonly ProductionRuntimePrimitiveEntry[];
  const warnings: string[] = [];
  return { material, materialSpec, custom, resource, entries, warnings, warn: (message: string) => warnings.push(message) };
}

function image() {
  return { width: 2, height: 2, close: vi.fn() } as unknown as ImageBitmap & { close: ReturnType<typeof vi.fn> };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function response(bytes: Uint8Array = BYTES): Response {
  return new Response(bytes.slice().buffer as ArrayBuffer, { headers: { "content-type": "image/png" } });
}

function bound(f: ReturnType<typeof fixture>) {
  const binding = f.material.getParameter("u_map");
  expect(binding).toBeInstanceOf(TextureBinding);
  return binding as TextureBinding;
}

beforeEach(() => { vi.stubGlobal("crypto", webcrypto); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("custom material typed bitmap policy", () => {
  it("snapshots app policy before enqueue and transfers the decoded image to resource ownership", async () => {
    const f = fixture(asset());
    const decoded = image();
    const fetch = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => response());
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("createImageBitmap", vi.fn(async () => decoded));
    const headers = new Headers({ "x-test-policy": "original" });
    const allowedOrigins = ["https://assets.example.test"];
    const request = { credentials: "include" as const, headers, allowedOrigins, securityContext: "private-generation-one", maxBytes: 64, expectedUrl: SIGNED_URL };
    const prepared = prepareCustomMaterialTextureWork(f.materialSpec, request, 64);
    headers.set("x-test-policy", "changed");
    allowedOrigins[0] = "https://other.example.test";
    request.securityContext = "private-generation-two";
    request.maxBytes = 1;
    request.expectedUrl = "https://other.example.test/changed.png";
    const previousDispose = vi.fn();
    f.resource.textureDisposer = previousDispose;
    await upgradeCustomMaterialTextures(f.entries, f.warn, undefined, undefined, undefined, undefined, prepared);

    expect(fetch).toHaveBeenCalledTimes(1);
    const init = fetch.mock.calls[0]![1]!;
    expect(init.credentials).toBe("include");
    expect(new Headers(init.headers).get("x-test-policy")).toBe("original");
    expect(init).not.toHaveProperty("securityContext");
    expect(JSON.stringify(init)).not.toMatch(/private-generation/);
    expect(f.warnings).toEqual([]);
    const texture = bound(f).texture!;
    expect(texture.source).toBe(decoded);
    expect(texture.colorSpace).toBe("linear");
    expect(decoded.close).not.toHaveBeenCalled();
    f.resource.textureDisposer!();
    expect(previousDispose).toHaveBeenCalledTimes(1);
    expect(texture.disposed).toBe(true);
    expect(decoded.close).toHaveBeenCalledTimes(1);
    f.material.dispose();
  });

  it("rejects changed bytes before decoding and retains the white fallback", async () => {
    const f = fixture(asset());
    const altered = BYTES.slice(); altered[0] ^= 1;
    vi.stubGlobal("fetch", vi.fn(async () => response(altered)));
    const decode = vi.fn(async () => image());
    vi.stubGlobal("createImageBitmap", decode);
    const prepared = prepareCustomMaterialTextureWork(f.materialSpec);
    await upgradeCustomMaterialTextures(f.entries, f.warn, undefined, undefined, undefined, undefined, prepared);
    expect(decode).not.toHaveBeenCalled();
    expect(bound(f).texture).toBeNull();
    expect(f.warnings.some((warning) => warning.includes("CUSTOM_TEXTURE_ASSET_LOAD_FAILED"))).toBe(true);
    expect(f.warnings.some((warning) => warning.includes("CUSTOM_TEXTURE_UNBOUND"))).toBe(true);
    expect(f.warnings.join(" ")).not.toContain("private-query-value");
    f.material.dispose();
  });

  it("reports an invalid declared digest without making a request", async () => {
    const source = asset();
    (source as { hash: string }).hash = "not-a-sha256";
    const f = fixture(source);
    const fetch = vi.fn(async () => response());
    vi.stubGlobal("fetch", fetch);
    const prepared = prepareCustomMaterialTextureWork(f.materialSpec);
    await upgradeCustomMaterialTextures(f.entries, f.warn, undefined, undefined, undefined, undefined, prepared);
    expect(fetch).not.toHaveBeenCalled();
    expect(bound(f).texture).toBeNull();
    expect(f.warnings.some((warning) => warning.includes("CUSTOM_TEXTURE_ASSET_LOAD_FAILED"))).toBe(true);
    expect(f.warnings.join(" ")).not.toContain("private-query-value");
    f.material.dispose();
  });

  it("refuses a rotated asset security context before the prepared request starts", async () => {
    const request = { credentials: "include" as const, securityContext: "generation-one" };
    const f = fixture(asset(request));
    const fetch = vi.fn(async () => response());
    vi.stubGlobal("fetch", fetch);
    const prepared = prepareCustomMaterialTextureWork(f.materialSpec);
    request.securityContext = "generation-two";
    await upgradeCustomMaterialTextures(f.entries, f.warn, undefined, undefined, undefined, undefined, prepared);
    expect(fetch).not.toHaveBeenCalled();
    expect(bound(f).texture).toBeNull();
    expect(f.warnings.some((warning) => warning.includes("changed after preparation"))).toBe(true);
    expect(f.warnings.join(" ")).not.toMatch(/generation-(one|two)|private-query-value/);
    f.material.dispose();
  });

  it("closes a decoded result if its asset generation changes during the request", async () => {
    const request = { credentials: "include" as const, securityContext: "generation-one" };
    const f = fixture(asset(request));
    const reply = deferred<Response>();
    const called = deferred<void>();
    const decoded = image();
    vi.stubGlobal("fetch", vi.fn(() => { called.resolve(undefined); return reply.promise; }));
    vi.stubGlobal("createImageBitmap", vi.fn(async () => decoded));
    const notify = vi.fn();
    const prepared = prepareCustomMaterialTextureWork(f.materialSpec);
    const pending = upgradeCustomMaterialTextures(f.entries, f.warn, undefined, undefined, notify, undefined, prepared);
    await called.promise;
    request.securityContext = "generation-two";
    reply.resolve(response());
    await pending;
    expect(bound(f).texture).toBeNull();
    expect(decoded.close).toHaveBeenCalledTimes(1);
    expect(notify).not.toHaveBeenCalled();
    expect(f.warnings.some((warning) => warning.includes("changed after preparation"))).toBe(true);
    f.material.dispose();
  });

  it("holds cancelled work until a late decode is closed", async () => {
    const f = fixture(asset());
    const decode = deferred<ImageBitmap>();
    const decodeStarted = deferred<void>();
    vi.stubGlobal("fetch", vi.fn(async () => response()));
    vi.stubGlobal("createImageBitmap", vi.fn(() => { decodeStarted.resolve(undefined); return decode.promise; }));
    const controller = new AbortController();
    const notify = vi.fn();
    const prepared = prepareCustomMaterialTextureWork(f.materialSpec);
    let finished = false;
    const pending = upgradeCustomMaterialTextures(f.entries, f.warn, undefined, controller.signal, notify, undefined, prepared)
      .then(() => { finished = true; });
    await decodeStarted.promise;
    controller.abort();
    await Promise.resolve();
    expect(finished).toBe(false);
    const late = image();
    decode.resolve(late);
    await pending;
    expect(late.close).toHaveBeenCalledTimes(1);
    expect(bound(f).texture).toBeNull();
    expect(f.resource.textureDisposer).toBeUndefined();
    expect(notify).not.toHaveBeenCalled();
    expect(f.warnings).toEqual([]);
    f.material.dispose();
  });

  it("does not publish a bitmap for a uniform replaced during decoding", async () => {
    const f = fixture(asset());
    const decode = deferred<ImageBitmap>();
    const decodeStarted = deferred<void>();
    vi.stubGlobal("fetch", vi.fn(async () => response()));
    vi.stubGlobal("createImageBitmap", vi.fn(() => { decodeStarted.resolve(undefined); return decode.promise; }));
    const notify = vi.fn();
    const prepared = prepareCustomMaterialTextureWork(f.materialSpec);
    const pending = upgradeCustomMaterialTextures(f.entries, f.warn, undefined, undefined, notify, undefined, prepared);
    await decodeStarted.promise;
    const uniform = f.custom.uniforms!.map as { value: unknown };
    uniform.value = asset();
    const stale = image();
    decode.resolve(stale);
    await pending;
    expect(stale.close).toHaveBeenCalledTimes(1);
    expect(bound(f).texture).toBeNull();
    expect(notify).not.toHaveBeenCalled();
    f.material.dispose();
  });

  it.each(["generation", "uniform"] as const)("keeps the job unsettled when a stale %s bitmap cannot close", async (scenario) => {
    const f = fixture(asset());
    const decode = deferred<ImageBitmap>();
    const decodeStarted = deferred<void>();
    vi.stubGlobal("fetch", vi.fn(async () => response()));
    vi.stubGlobal("createImageBitmap", vi.fn(() => { decodeStarted.resolve(undefined); return decode.promise; }));
    const notify = vi.fn();
    const prepared = prepareCustomMaterialTextureWork(f.materialSpec);
    let current = true, finished = false;
    const pending = upgradeCustomMaterialTextures(f.entries, f.warn, undefined, undefined, notify, () => current, prepared);
    void pending.then(() => { finished = true; }, () => { finished = true; });
    await decodeStarted.promise;
    if (scenario === "generation") current = false;
    else (f.custom.uniforms!.map as { value: unknown }).value = asset();
    const stale = image();
    stale.close.mockImplementation(() => { throw new Error("bitmap close failed"); });
    decode.resolve(stale);
    await vi.waitFor(() => expect(stale.close).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(finished).toBe(false);
    expect(bound(f).texture).toBeNull();
    expect(notify).not.toHaveBeenCalled();
    expect(f.resource.textureDisposer).toBeUndefined();
    f.material.dispose();
  });

  it("preserves the injected URL loader and redacts signed URLs from failures", async () => {
    const f = fixture(asset());
    const loader = vi.fn(async (_url: string) => { throw new Error(`Could not load ${SIGNED_URL}`); });
    await upgradeCustomMaterialTextures(f.entries, f.warn, loader);
    expect(loader).toHaveBeenCalledWith(SIGNED_URL);
    expect(bound(f).texture).toBeNull();
    expect(f.warnings.some((warning) => warning.includes("CUSTOM_TEXTURE_ASSET_LOAD_FAILED"))).toBe(true);
    expect(f.warnings.join(" ")).not.toContain(SIGNED_URL);
    expect(f.warnings.join(" ")).not.toContain("private-query-value");
    f.material.dispose();
  });
});
