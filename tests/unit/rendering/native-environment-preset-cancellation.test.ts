import { createHash, webcrypto } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultProbeLoader } from "../../../packages/rendering/src/environment/EnvironmentCache.js";

type Asset = "specular" | "sh9";
type Failure = "size" | "read" | "fetch";
const key = { preset: "fixture", tier: "medium" } as const;
const loader = () => defaultProbeLoader({} as never);

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function within<T>(promise: Promise<T>, milliseconds = 2_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("synthetic operation timed out")), milliseconds); })
    ]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

function fixture(hashed = false) {
  const faceSize = 128;
  const payload = 6 * faceSize * faceSize * 4;
  // Independently constructed black private probe, one mip and six faces.
  const cube = new Uint8Array(92 + payload);
  cube.set([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]);
  const header = new DataView(cube.buffer);
  header.setUint32(12, 142, true);
  header.setUint32(16, 4, true);
  header.setUint32(20, faceSize, true);
  header.setUint32(24, faceSize, true);
  header.setUint32(36, 6, true);
  header.setUint32(40, 1, true);
  header.setBigUint64(68, 92n, true);
  header.setBigUint64(76, BigInt(payload), true);
  header.setBigUint64(84, BigInt(payload), true);
  const sh9 = new Uint8Array(27 * 4);
  new DataView(sh9.buffer).setFloat32(0, 0.75, true);
  const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
  const manifest = {
    name: "fixture", faceSize, mipCount: 1,
    specular: "fixture.specular.ktx2", sh9: "fixture.sh9.f32",
    ...(hashed ? { sha256: { specular: digest(cube), sh9: digest(sh9) } } : {})
  };
  return { manifest, specular: cube, sh9 };
}

function assetFor(url: string): Asset {
  if (url.endsWith("fixture.specular.ktx2")) return "specular";
  if (url.endsWith("fixture.sh9.f32")) return "sh9";
  throw new Error(`unexpected synthetic URL ${url}`);
}

/** A provider which observes cancel but ignores it and leaves its read pending. */
function heldResponse() {
  const started = deferred<void>();
  const cancelled = deferred<void>();
  const pendingRead = new Promise<ReadableStreamReadResult<Uint8Array>>(() => {});
  let locked = false;
  let cancelCount = 0;
  const body = {
    get locked() { return locked; },
    getReader() {
      locked = true;
      return {
        read() { started.resolve(); return pendingRead; },
        cancel() {
          cancelCount += 1;
          cancelled.resolve();
          return new Promise<void>(() => {});
        },
        releaseLock() { locked = false; }
      };
    },
    cancel() { return Promise.resolve(); }
  };
  return {
    response: { ok: true, status: 200, headers: new Headers(), body },
    started: started.promise,
    cancelled: cancelled.promise,
    cancelCount: () => cancelCount
  };
}

function failingResponse(failure: Exclude<Failure, "fetch">, asset: Asset): Response {
  if (failure === "size") {
    const cap = asset === "sh9" ? 27 * 4 : 6 * 128 * 128 * 4 + 4 * 1024 * 1024;
    return new Response(Uint8Array.of(1), { headers: { "Content-Length": String(cap + 1) } });
  }
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) { controller.error(new Error(`primary-${asset}-read`)); }
  });
  return new Response(stream);
}

afterEach(() => vi.unstubAllGlobals());

describe("concurrent preset asset cancellation", () => {
  for (const primary of ["specular", "sh9"] as const) {
    for (const failure of ["size", "read", "fetch"] as const) {
      it(`preserves the ${primary} ${failure} error and cancels a held sibling once`, async () => {
        const data = fixture();
        const sibling: Asset = primary === "specular" ? "sh9" : "specular";
        const held = heldResponse();
        let siblingSignal: AbortSignal | undefined;
        vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
          if (input.endsWith("fixture.manifest.json")) return new Response(JSON.stringify(data.manifest));
          const asset = assetFor(input);
          if (asset === sibling) {
            siblingSignal = init?.signal ?? undefined;
            return held.response;
          }
          // Avoid a race where the primary fails before the sibling starts.
          await held.started;
          if (failure === "fetch") throw new Error(`primary-${primary}-fetch`);
          return failingResponse(failure, primary);
        }));
        const filename = primary === "specular" ? "fixture.specular.ktx2" : "fixture.sh9.f32";
        const expected = failure === "size" ? `ENV_FETCH_TOO_LARGE:/aura-environments/${filename}` : `primary-${primary}-${failure}`;
        const pending = loader()(key);
        await within(held.started);
        await expect(within(pending)).rejects.toThrow(expected);
        await within(held.cancelled);
        expect(held.cancelCount()).toBe(1);
        expect(siblingSignal?.aborted).toBe(true);
      });
    }
  }

  it.each(["specular", "sh9"] as const)("cancels a late %s fetch response after its sibling fails", async (lateAsset) => {
    const data = fixture();
    const primary: Asset = lateAsset === "specular" ? "sh9" : "specular";
    const requested = deferred<void>();
    const lateResponse = deferred<unknown>();
    const lateCancelled = deferred<void>();
    let bodyCancelCount = 0;
    let lateSignal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
      if (input.endsWith("fixture.manifest.json")) return new Response(JSON.stringify(data.manifest));
      const asset = assetFor(input);
      if (asset === lateAsset) {
        lateSignal = init?.signal ?? undefined;
        requested.resolve();
        // This provider ignores the signal and settles only when the test says so.
        return lateResponse.promise;
      }
      await requested.promise;
      throw new Error(`primary-${primary}-fetch`);
    }));
    const pending = loader()(key);
    await within(requested.promise);
    await expect(within(pending)).rejects.toThrow(`primary-${primary}-fetch`);
    expect(lateSignal?.aborted).toBe(true);
    lateResponse.resolve({
      ok: true, status: 200, headers: new Headers(),
      body: {
        locked: false,
        cancel() { bodyCancelCount += 1; lateCancelled.resolve(); return Promise.resolve(); }
      }
    });
    await within(lateCancelled.promise);
    expect(bodyCancelCount).toBe(1);
  });

  it.each([false, true])("does not abort successful asset fetches when hashes are enabled: %s", async (hashed) => {
    const data = fixture(hashed);
    const signals: AbortSignal[] = [];
    let aborts = 0;
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
      if (input.endsWith("fixture.manifest.json")) return new Response(JSON.stringify(data.manifest));
      const asset = assetFor(input);
      if (init?.signal) {
        signals.push(init.signal);
        init.signal.addEventListener("abort", () => { aborts += 1; });
      }
      return new Response(Uint8Array.from(data[asset]));
    }));
    const probe = await within(loader()(key));
    try {
      expect(probe.faceSize).toBe(128);
      expect(probe.sh9[0]).toBe(0.75);
      expect(signals).toHaveLength(2);
      expect(signals.every((signal) => !signal.aborted)).toBe(true);
      expect(aborts).toBe(0);
    } finally { probe.dispose(); }
  });
});
