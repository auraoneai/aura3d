import { describe, expect, it } from "vitest";
import { isAutoPullable } from "@aura3d/asset-index";
import {
  createPolyPizzaAdapter,
  type PolyPizzaAdapterOptions,
} from "../../../packages/asset-index/src/adapters/poly-pizza.js";
import type {
  AdapterContext,
  ResolveQuery,
} from "../../../packages/asset-index/src/SourceAdapter.js";

/**
 * Fixture mirrors the VERIFIED live Poly Pizza schema (PascalCase keys, checked
 * against https://api.poly.pizza/v1.1, GET /search/{keyword} -> { total, results }):
 *   Model: { ID, Title, Description, Attribution, Thumbnail, Download,
 *            "Tri Count", Creator: { Username, DPURL }, Category, Tags,
 *            Licence, Animated }
 */
const SEARCH_BODY = {
  total: 3,
  results: [
    {
      ID: "abc123",
      Title: "Low Poly Robot",
      Description: "A friendly low-poly robot",
      Attribution: "Robot by Quaternius",
      Thumbnail: "https://static.poly.pizza/abc123.png",
      Download: "https://static.poly.pizza/abc123.glb",
      "Tri Count": 1280,
      Creator: { Username: "Quaternius", DPURL: "https://static.poly.pizza/dp/q.jpg" },
      Category: "Characters",
      Tags: ["robot", "sci-fi"],
      Licence: "CC0",
      Animated: false,
    },
    {
      ID: "def456",
      Title: "Knight Helmet",
      Thumbnail: "https://static.poly.pizza/def456.png",
      Download: "https://static.poly.pizza/def456.glb",
      "Tri Count": 5400,
      Creator: { Username: "Jane Maker" },
      Tags: ["helmet", "medieval"],
      // Space form must normalize to CC-BY-4.0.
      Licence: "CC-BY 4.0",
      Animated: true,
    },
    {
      // No Download url -> must be skipped (we only index direct .glb files).
      ID: "ghi789",
      Title: "Broken Entry",
      Thumbnail: "https://static.poly.pizza/ghi789.png",
      Licence: "CC0",
    },
  ],
};

function ctx(): AdapterContext {
  // The adapter authenticates via its own header-aware fetch, so ctx.fetchJson
  // is never used here; provide a throwing stub to prove that.
  return {
    fetchJson: async (url: string) => {
      throw new Error(`ctx.fetchJson must not be called (${url})`);
    },
  };
}

function adapter(overrides: Partial<PolyPizzaAdapterOptions> = {}) {
  let calls: { keyword: string; apiKey: string }[] = [];
  const a = createPolyPizzaAdapter({
    apiKey: "test-key",
    fetchSearch: async (keyword, apiKey) => {
      calls.push({ keyword, apiKey });
      return SEARCH_BODY;
    },
    ...overrides,
  });
  return { adapter: a, calls };
}

const query: ResolveQuery = { text: "robot" };

describe("createPolyPizzaAdapter", () => {
  it("passes the query text and key to the API call", async () => {
    const { adapter: a, calls } = adapter();
    await a.search(query, ctx());
    expect(calls).toHaveLength(1);
    expect(calls[0]?.keyword).toBe("robot");
    expect(calls[0]?.apiKey).toBe("test-key");
  });

  it("maps a CC0 result to a direct-download, auto-pullable GLB asset", async () => {
    const { adapter: a } = adapter();
    const results = await a.search(query, ctx());
    const robot = results.find((r) => r.id === "poly-pizza:abc123");
    expect(robot).toBeDefined();
    expect(robot?.source).toBe("poly-pizza");
    expect(robot?.title).toBe("Low Poly Robot");
    expect(robot?.url).toBe("https://static.poly.pizza/abc123.glb");
    expect(robot?.access).toBe("direct-download");
    expect(robot?.format).toBe("glb");
    expect(robot?.thumbnailUrl).toBe("https://static.poly.pizza/abc123.png");
    expect(robot?.triangles).toBe(1280);
    expect(robot?.attribution).toBe("Quaternius");
    expect(robot?.sourcePage).toBe("https://poly.pizza/m/abc123");
    // CC0 is authoritative here -> verified, redistributable, no attribution.
    expect(robot?.license.spdx).toBe("CC0-1.0");
    expect(robot?.license.verified).toBe(true);
    expect(robot?.license.attributionRequired).toBe(false);
    expect(isAutoPullable(robot!)).toBe(true);
  });

  it("maps a CC-BY result as redistributable but attribution-required", async () => {
    const { adapter: a } = adapter();
    const results = await a.search(query, ctx());
    const helmet = results.find((r) => r.id === "poly-pizza:def456");
    expect(helmet?.license.spdx).toBe("CC-BY-4.0");
    expect(helmet?.license.attributionRequired).toBe(true);
    expect(helmet?.license.redistributable).toBe(true);
    expect(helmet?.triangles).toBe(5400);
    expect(helmet?.hasAnimations).toBe(true);
    expect(isAutoPullable(helmet!)).toBe(true);
  });

  it("skips results without a direct download url", async () => {
    const { adapter: a } = adapter();
    const results = await a.search(query, ctx());
    expect(results.map((r) => r.id)).not.toContain("poly-pizza:ghi789");
    expect(results).toHaveLength(2);
  });

  it("returns [] without throwing when no API key is configured", async () => {
    let fetched = false;
    const a = createPolyPizzaAdapter({
      apiKey: undefined,
      fetchSearch: async () => {
        fetched = true;
        return SEARCH_BODY;
      },
    });
    const results = await a.search(query, ctx());
    expect(results).toEqual([]);
    // Graceful degradation: it must not even attempt the network call.
    expect(fetched).toBe(false);
  });

  it("returns [] for an empty query without calling the API", async () => {
    const { adapter: a, calls } = adapter();
    const results = await a.search({ text: "   " }, ctx());
    expect(results).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});
