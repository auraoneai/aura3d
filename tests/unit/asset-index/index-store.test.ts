import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IndexStore, INDEX_STORE_SCHEMA } from "../../../packages/asset-index/src/IndexStore.js";
import { refreshIndex } from "../../../packages/asset-index/src/refresh.js";
import type { AuraCanonicalAsset } from "../../../packages/asset-index/src/CanonicalAsset.js";
import { normalizeLicense } from "../../../packages/asset-index/src/CanonicalAsset.js";
import type {
  AdapterContext,
  ResolveQuery,
  SourceAdapter,
} from "../../../packages/asset-index/src/SourceAdapter.js";

/**
 * NOTE: these import the store/refresh modules directly from source rather than
 * the package barrel, because the barrel export wiring for IndexStore/refresh is
 * added by the integrating agent (reported in this agent's WIRING return value).
 */

function asset(id: string, title: string): AuraCanonicalAsset {
  return {
    id,
    source: id.split(":")[0]!,
    title,
    url: `https://example.test/${id}.glb`,
    access: "direct-download",
    format: "glb",
    license: normalizeLicense("CC0", "https://example.test/license"),
    tags: title.toLowerCase().split(" "),
  };
}

let dir: string;
let storePath: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "aura3d-index-store-"));
  storePath = join(dir, "index.json");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("IndexStore", () => {
  it("tolerates a missing file and loads an empty store", async () => {
    const store = await IndexStore.load(storePath);
    expect(store.all()).toEqual([]);
    expect(store.getWatermark("khronos")).toBeNull();
  });

  it("upserts with last-write-wins dedupe by id", async () => {
    const store = await IndexStore.load(storePath);
    store.upsertMany("os3a", [asset("os3a:a", "First"), asset("os3a:b", "Bee")]);
    store.upsertMany("os3a", [asset("os3a:a", "Second")]);
    const all = store.all();
    expect(all).toHaveLength(2);
    expect(all.find((a) => a.id === "os3a:a")?.title).toBe("Second");
  });

  it("round-trips watermarks", async () => {
    const store = await IndexStore.load(storePath);
    store.setWatermark("os3a", "2026-01-01T00:00:00Z");
    expect(store.getWatermark("os3a")).toBe("2026-01-01T00:00:00Z");
  });

  it("saves atomically and reloads identically", async () => {
    const store = await IndexStore.load(storePath);
    store.upsertMany("os3a", [asset("os3a:a", "Alpha")]);
    store.setWatermark("os3a", "wm-1");
    await store.save("2026-06-03T00:00:00Z");

    const persisted = JSON.parse(await readFile(storePath, "utf8"));
    expect(persisted.schema).toBe(INDEX_STORE_SCHEMA);
    expect(persisted.updatedAt).toBe("2026-06-03T00:00:00Z");

    const reloaded = await IndexStore.load(storePath);
    expect(reloaded.all()).toEqual(store.all());
    expect(reloaded.getWatermark("os3a")).toBe("wm-1");
  });

  it("preserves the previous updatedAt when save() is called without one", async () => {
    const store = await IndexStore.load(storePath);
    await store.save("2026-06-03T00:00:00Z");
    store.upsertMany("os3a", [asset("os3a:a", "Alpha")]);
    await store.save();
    const persisted = JSON.parse(await readFile(storePath, "utf8"));
    expect(persisted.updatedAt).toBe("2026-06-03T00:00:00Z");
  });
});

/** Fake in-memory adapters exercising both refresh code paths. */
function fetchSinceAdapter(): SourceAdapter {
  return {
    id: "fake-since",
    label: "Fake (fetchSince)",
    async search(_q: ResolveQuery, _ctx: AdapterContext) {
      return [];
    },
    async fetchSince(watermark, _ctx) {
      // First run (no watermark) yields one asset; subsequent runs yield none.
      const assets = watermark ? [] : [asset("fake-since:1", "Since One")];
      return { watermark: "wm-since-latest", assets };
    },
  };
}

function searchOnlyAdapter(): SourceAdapter {
  return {
    id: "fake-search",
    label: "Fake (search fallback)",
    async search(_q: ResolveQuery, _ctx: AdapterContext) {
      return [asset("fake-search:1", "Search One")];
    },
  };
}

function failingAdapter(): SourceAdapter {
  return {
    id: "fake-bad",
    label: "Fake (throws)",
    async search() {
      throw new Error("kaboom");
    },
  };
}

const ctx: AdapterContext = { fetchJson: async () => [] };

describe("refreshIndex", () => {
  it("refreshes via fetchSince + search fallback, updates watermarks, and saves", async () => {
    const store = await IndexStore.load(storePath);
    const result = await refreshIndex(
      [fetchSinceAdapter(), searchOnlyAdapter()],
      store,
      ctx,
      { updatedAt: "2026-06-03T00:00:00Z" },
    );

    expect(result.upserted).toBe(2);
    expect(result.perSource).toEqual({ "fake-since": 1, "fake-search": 1 });
    expect(result.warnings).toEqual([]);
    expect(store.getWatermark("fake-since")).toBe("wm-since-latest");

    const reloaded = await IndexStore.load(storePath);
    expect(reloaded.all().map((a) => a.id).sort()).toEqual([
      "fake-search:1",
      "fake-since:1",
    ]);
    expect(reloaded.getWatermark("fake-since")).toBe("wm-since-latest");
  });

  it("uses the stored watermark on a second pass (incremental, no re-pull)", async () => {
    const store = await IndexStore.load(storePath);
    await refreshIndex([fetchSinceAdapter()], store, ctx);
    const second = await refreshIndex([fetchSinceAdapter()], store, ctx);
    expect(second.perSource["fake-since"]).toBe(0);
    // Asset from the first pass is still present.
    expect(store.all().map((a) => a.id)).toContain("fake-since:1");
  });

  it("collects a per-source warning instead of collapsing the refresh", async () => {
    const store = await IndexStore.load(storePath);
    const result = await refreshIndex(
      [failingAdapter(), searchOnlyAdapter()],
      store,
      ctx,
    );
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("fake-bad: kaboom");
    // The healthy adapter's asset still made it into the store and to disk.
    expect(result.perSource["fake-search"]).toBe(1);
    const reloaded = await IndexStore.load(storePath);
    expect(reloaded.all().map((a) => a.id)).toContain("fake-search:1");
  });
});
