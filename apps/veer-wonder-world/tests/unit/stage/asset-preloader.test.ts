// The model preloader's dispose (PRD 04 B09): downloads now continue past a
// preload's wait, so dispose must abort every one still in flight.

import { describe, expect, it } from "vitest";
import type { ModelKey } from "../../../src/aura-assets.js";
import { createAssetPreloader, type FetchLike, type FetchResponseLike } from "../../../src/runtime/asset-preloader.js";

const source = (key: ModelKey) => (key === "teddy" || key === "momo" || key === "tree" ? { url: `/models/${key}`, sha256: `sha256-${key}hash` } : undefined);
const okResponse: FetchResponseLike = { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(4) };

interface PendingFetch {
  readonly url: string;
  readonly signal: AbortSignal | undefined;
  arrive(response: FetchResponseLike): void;
}

/** A fetch whose downloads never finish by themselves; each rejects once its signal aborts (as a browser fetch does). */
function stuckFetch(): { readonly fetch: FetchLike; readonly calls: PendingFetch[] } {
  const calls: PendingFetch[] = [];
  const fetch: FetchLike = (url, init) =>
    new Promise<FetchResponseLike>((resolve, reject) => {
      const signal = init?.signal;
      signal?.addEventListener("abort", () => reject(new Error("aborted")));
      calls.push({ url, signal, arrive: resolve });
    });
  return { fetch, calls };
}

/** Timers the test fires by hand: `fire(ms)` runs the ones scheduled for that delay. */
function manualTimers(): { readonly schedule: (callback: () => void, ms: number) => () => void; fire(ms: number): void; pending(): number } {
  const timers: Array<{ callback: () => void; ms: number; live: boolean }> = [];
  return {
    schedule(callback, ms) {
      const timer = { callback, ms, live: true };
      timers.push(timer);
      return () => {
        timer.live = false;
      };
    },
    fire(ms) {
      for (const timer of timers.filter((t) => t.live && t.ms === ms)) {
        timer.live = false;
        timer.callback();
      }
    },
    pending: () => timers.filter((t) => t.live).length
  };
}

describe("asset preloader dispose", () => {
  it("aborts every download in flight and resolves the waiting preload at once", async () => {
    const { fetch, calls } = stuckFetch();
    const timers = manualTimers();
    const preloader = createAssetPreloader({ fetch, source, digest: null, enabled: true, schedule: timers.schedule });
    const pending = preloader.preload(["teddy", "momo"]);
    expect(calls.map((c) => c.url)).toEqual(["/models/teddy", "/models/momo"]);
    expect(preloader.summary()).toEqual({ pending: 2 });
    preloader.dispose();
    for (const call of calls) expect(call.signal?.aborted).toBe(true);
    // No timer had to fire: the preload is settled by the dispose itself, with nothing usable.
    const result = await pending;
    expect(result.status.get("teddy")).toBe("error");
    expect(result.status.get("momo")).toBe("error");
    expect(result.available.size).toBe(0);
    expect(timers.pending()).toBe(0);
    expect(preloader.status("teddy")).toBe("unknown");
    expect(preloader.summary()).toEqual({});
  });

  it("aborts downloads that kept running past a preload's wait, and prefetches", async () => {
    const { fetch, calls } = stuckFetch();
    const timers = manualTimers();
    const preloader = createAssetPreloader({ fetch, source, digest: null, enabled: true, timeoutMs: 10_000, maxMs: 120_000, schedule: timers.schedule });
    const first = preloader.preload(["teddy"]);
    timers.fire(10_000);
    expect((await first).status.get("teddy")).toBe("timeout");
    // The wait is over; the download goes on (and would be used from the next mount).
    expect(preloader.status("teddy")).toBe("pending");
    preloader.prefetch(["tree"]);
    expect(calls.map((c) => c.url)).toEqual(["/models/teddy", "/models/tree"]);
    preloader.dispose();
    for (const call of calls) expect(call.signal?.aborted).toBe(true);
    // A late arrival changes nothing, and the 120 s download caps are cancelled.
    for (const call of calls) call.arrive(okResponse);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(preloader.status("teddy")).toBe("unknown");
    expect(preloader.isAvailable("teddy")).toBe(false);
    expect(timers.pending()).toBe(0);
  });

  it("settles even when the fetch ignores its abort signal", async () => {
    const calls: string[] = [];
    const deaf: FetchLike = (url) => {
      calls.push(url);
      return new Promise(() => undefined);
    };
    const timers = manualTimers();
    const preloader = createAssetPreloader({ fetch: deaf, source, digest: null, enabled: true, schedule: timers.schedule });
    const pending = preloader.preload(["momo"]);
    preloader.dispose();
    expect((await pending).status.get("momo")).toBe("error");
    expect(calls).toEqual(["/models/momo"]);
  });

  it("fetches nothing after dispose, and is safe to call twice", async () => {
    let fetches = 0;
    const fetch: FetchLike = async () => {
      fetches += 1;
      return okResponse;
    };
    const preloader = createAssetPreloader({ fetch, source, digest: null, enabled: true });
    expect((await preloader.preload(["teddy"])).status.get("teddy")).toBe("unverified");
    expect(fetches).toBe(1);
    preloader.dispose();
    preloader.dispose();
    const after = await preloader.preload(["teddy", "momo"]);
    preloader.prefetch(["tree"]);
    expect(fetches).toBe(1);
    expect(after.available.size).toBe(0);
    expect(preloader.summary()).toEqual({});
  });
});
