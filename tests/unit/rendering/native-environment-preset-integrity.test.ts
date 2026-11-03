import { createHash, webcrypto } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultProbeLoader, EnvironmentCache } from "../../../packages/rendering/src/environment/EnvironmentCache.js";

// An independently constructed, single-mip private probe container. All six
// faces are black; no existing baked image or external asset is involved.
function makeCube(): Uint8Array {
  const faceSize = 128;
  const payloadBytes = 6 * faceSize * faceSize * 4;
  const bytes = new Uint8Array(92 + payloadBytes);
  bytes.set([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(12, 142, true); // Historical private RGB9E5 marker.
  view.setUint32(16, 4, true);
  view.setUint32(20, faceSize, true);
  view.setUint32(24, faceSize, true);
  view.setUint32(36, 6, true);
  view.setUint32(40, 1, true);
  view.setBigUint64(68, 92n, true);
  view.setBigUint64(76, BigInt(payloadBytes), true);
  view.setBigUint64(84, BigInt(payloadBytes), true);
  return bytes;
}

function makeSh9(): Uint8Array {
  const bytes = new Uint8Array(27 * 4);
  const view = new DataView(bytes.buffer);
  view.setFloat32(0, 0.75, true);
  view.setFloat32(4, -1.25, true);
  return bytes;
}

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

interface Fixture {
  manifest: Record<string, unknown>;
  cube: Uint8Array;
  sh9: Uint8Array;
}

function fixture(): Fixture {
  return {
    manifest: {
      name: "fixture",
      faceSize: 128,
      mipCount: 1,
      specular: "fixture.specular.ktx2",
      sh9: "fixture.sh9.f32"
    },
    cube: makeCube(),
    sh9: makeSh9()
  };
}

function installFetch(data: Fixture) {
  const fetcher = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : new URL(input.url).pathname;
    if (url === "/aura-environments/fixture.manifest.json") return new Response(JSON.stringify(data.manifest));
    if (url === "/aura-environments/fixture.specular.ktx2") return new Response(Uint8Array.from(data.cube));
    if (url === "/aura-environments/fixture.sh9.f32") return new Response(Uint8Array.from(data.sh9));
    return new Response("missing", { status: 404 });
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

const key = { preset: "fixture", tier: "medium" } as const;
const loader = () => defaultProbeLoader({} as never);

afterEach(() => vi.unstubAllGlobals());

describe("baked environment preset integrity", () => {
  it("loads a legacy manifest without hashes even if Web Crypto is unavailable", async () => {
    const data = fixture();
    const fetcher = installFetch(data);
    vi.stubGlobal("crypto", undefined);
    const probe = await loader()(key);
    try {
      expect(probe.faceSize).toBe(128);
      expect(probe.mipCount).toBe(1);
      expect(Array.from(probe.sh9.subarray(0, 2))).toEqual([0.75, -1.25]);
      expect(fetcher).toHaveBeenCalledTimes(3);
    } finally {
      probe.dispose();
    }
  });

  it("loads matching independent SHA-256 digests, including uppercase and prefixed forms", async () => {
    const data = fixture();
    data.manifest.sha256 = {
      specular: `SHA256-${sha256(data.cube).toUpperCase()}`,
      sh9: sha256(data.sh9)
    };
    const fetcher = installFetch(data);
    vi.stubGlobal("crypto", webcrypto);
    const probe = await loader()(key);
    try {
      expect(probe.faceSize).toBe(128);
      expect(Array.from(probe.sh9.subarray(0, 2))).toEqual([0.75, -1.25]);
      expect(fetcher).toHaveBeenCalledTimes(3);
    } finally {
      probe.dispose();
    }
  });

  it.each(["specular", "sh9"] as const)("rejects tampered %s bytes before attempting to decode them", async (part) => {
    const data = fixture();
    data.manifest.sha256 = { specular: sha256(data.cube), sh9: sha256(data.sh9) };
    // Each corruption would also fail the downstream parser if it ran first.
    if (part === "specular") data.cube[0] = 0;
    else new DataView(data.sh9.buffer).setFloat32(0, Number.NaN, true);
    const fetcher = installFetch(data);
    vi.stubGlobal("crypto", webcrypto);
    await expect(loader()(key)).rejects.toThrow(/ENV_PRESET_INTEGRITY:fixture/);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it.each([
    null,
    "not-an-object",
    [],
    {},
    { specular: "a".repeat(64) },
    { sh9: "a".repeat(64) },
    { specular: "g".repeat(64), sh9: "a".repeat(64) },
    { specular: "a".repeat(63), sh9: "a".repeat(64) },
    { specular: "a".repeat(64), sh9: 7 }
  ])("rejects malformed or incomplete digest metadata before fetching probe assets", async (metadata) => {
    const data = fixture();
    data.manifest.sha256 = metadata;
    const fetcher = installFetch(data);
    vi.stubGlobal("crypto", webcrypto);
    await expect(loader()(key)).rejects.toThrow(/ENV_PRESET_INVALID:fixture/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("fails clearly when a manifest declares hashes but SHA-256 is unavailable", async () => {
    const data = fixture();
    data.manifest.sha256 = { specular: sha256(data.cube), sh9: sha256(data.sh9) };
    installFetch(data);
    vi.stubGlobal("crypto", undefined);
    await expect(loader()(key)).rejects.toThrow(/ENV_PRESET_INTEGRITY_UNAVAILABLE:fixture/);
  });

  it("fails clearly when Web Crypto rejects a digest operation", async () => {
    const data = fixture();
    data.manifest.sha256 = { specular: sha256(data.cube), sh9: sha256(data.sh9) };
    installFetch(data);
    const digest = vi.fn(async () => { throw new Error("synthetic digest failure"); });
    vi.stubGlobal("crypto", { subtle: { digest } });
    await expect(loader()(key)).rejects.toThrow(/ENV_PRESET_INTEGRITY_UNAVAILABLE:fixture/);
    expect(digest).toHaveBeenCalled();
  });

  it("decodes the same private bytes it hashed when a response buffer changes during digest", async () => {
    const data = fixture();
    data.manifest.sha256 = { specular: sha256(data.cube), sh9: sha256(data.sh9) };
    // These deliberately nonstandard fetch responses return the same mutable
    // ArrayBuffers held by the caller. The loader must not let a mutation made
    // after hashing starts alter the data ultimately used to build the probe.
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      if (input.endsWith("fixture.manifest.json")) return new Response(JSON.stringify(data.manifest));
      const bytes = input.endsWith("fixture.specular.ktx2") ? data.cube : data.sh9;
      return { ok: true, status: 200, headers: new Headers(), arrayBuffer: async () => bytes.buffer };
    }));
    let notifyStart = () => {};
    let releaseDigest = () => {};
    const started = new Promise<void>((resolve) => { notifyStart = resolve; });
    const gate = new Promise<void>((resolve) => { releaseDigest = resolve; });
    let first = true;
    const digest = vi.fn(async (_algorithm: string, input: ArrayBuffer | ArrayBufferView) => {
      const bytes = input instanceof ArrayBuffer
        ? new Uint8Array(input)
        : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
      // Hash synchronously before pausing to model a completed digest whose
      // result has not yet reached the loader.
      const result = Uint8Array.from(createHash("sha256").update(bytes).digest());
      if (first) {
        first = false;
        notifyStart();
        await gate;
      }
      return result.buffer;
    });
    vi.stubGlobal("crypto", { subtle: { digest } });
    const pending = loader()(key);
    try {
      await Promise.race([
        started,
        pending.then(() => { throw new Error("probe completed before the digest gate"); })
      ]);
      // Alter both still-held buffers after the digest began. The cube's first
      // red texel becomes nonzero and the SH9 coefficient changes from .75.
      new DataView(data.cube.buffer).setUint32(92, (16 << 27) | 256, true);
      new DataView(data.sh9.buffer).setFloat32(0, 9, true);
    } finally {
      releaseDigest();
    }
    const probe = await pending;
    try {
      expect(digest).toHaveBeenCalledTimes(2);
      expect(probe.sh9[0]).toBe(0.75);
      const pixels = probe.specularCube.cubeFaces[0]!.mipLevels[0]!.data;
      expect(pixels).toBeInstanceOf(Uint16Array);
      expect(Array.from(pixels.slice(0, 4))).toEqual([0, 0, 0, 0x3c00]);
    } finally {
      probe.dispose();
    }
  });

  it("does not cache a failed verification and permits a later clean retry", async () => {
    const data = fixture();
    data.manifest.sha256 = { specular: sha256(data.cube), sh9: sha256(data.sh9) };
    const pristineCube = data.cube.slice();
    data.cube[0] = 0;
    const fetcher = installFetch(data);
    vi.stubGlobal("crypto", webcrypto);
    const cache = new EnvironmentCache({} as never, {} as never, loader());
    try {
      await expect(cache.acquire(key)).rejects.toThrow(/ENV_PRESET_INTEGRITY:fixture/);
      expect(cache.residentCount).toBe(0);
      data.cube = pristineCube;
      const probe = await cache.acquire(key);
      expect(probe.faceSize).toBe(128);
      expect(cache.refCount(probe)).toBe(1);
      expect(cache.residentCount).toBe(1);
      expect(fetcher).toHaveBeenCalledTimes(6);
    } finally {
      cache.dispose();
    }
  });

  it("does not retain a probe if the cache is disposed while hashing is pending", async () => {
    const data = fixture();
    data.manifest.sha256 = { specular: sha256(data.cube), sh9: sha256(data.sh9) };
    installFetch(data);
    let notifyStart = () => {};
    let releaseDigest = () => {};
    const started = new Promise<void>((resolve) => { notifyStart = resolve; });
    const gate = new Promise<void>((resolve) => { releaseDigest = resolve; });
    let first = true;
    vi.stubGlobal("crypto", { subtle: { digest: async (_algorithm: string, input: ArrayBuffer | ArrayBufferView) => {
      const bytes = input instanceof ArrayBuffer
        ? new Uint8Array(input)
        : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
      const result = Uint8Array.from(createHash("sha256").update(bytes).digest());
      if (first) {
        first = false;
        notifyStart();
        await gate;
      }
      return result.buffer;
    } } });
    const cache = new EnvironmentCache({} as never, {} as never, loader());
    const pending = cache.acquire(key);
    try {
      await Promise.race([
        started,
        pending.then(() => { throw new Error("probe completed before the digest gate"); })
      ]);
      cache.dispose();
    } finally {
      releaseDigest();
    }
    await expect(pending).rejects.toThrow("ENVIRONMENT_CACHE_DISPOSED");
    expect(cache.residentCount).toBe(0);
  });
});
