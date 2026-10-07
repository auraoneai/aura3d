import { describe, expect, it } from "vitest";
import { isAutoPullable, type FetchJson } from "@aura3d/asset-index";
// Imported directly from source: this adapter is wired into the package index in
// a separate step (see the adapter's WIRING return), so we exercise the factory
// against its own file to keep this test independent of that wiring.
import { createPolyHavenAdapter } from "../../../packages/asset-index/src/adapters/poly-haven.js";

/**
 * Fixture mirrors the VERIFIED live shape of
 *   GET https://api.polyhaven.com/assets?t=models
 * (an object map keyed by asset id), checked against the real API June 2026.
 */
const POLY_HAVEN_ASSETS = {
  ArmChair_01: {
    name: "Arm Chair 01",
    type: 2,
    categories: ["furniture", "seating"],
    tags: ["gothic", "vintage", "chair", "furniture"],
    authors: { "Kirill Sannikov": "All" },
    dimensions: [848.43, 765.76, 1065.08], // millimetres
    polycount: 5626,
    thumbnail_url:
      "https://cdn.polyhaven.com/asset_img/thumbs/ArmChair_01.png?width=256&height=256",
    description: "Free (CC0) vintage Victorian armchair 3D model.",
    date_published: 1585605600,
  },
  GardenHose_01: {
    name: "Garden Hose 01",
    type: 2,
    categories: ["clutter"],
    tags: ["hose", "garden"],
    authors: { "Jorge Camacho": "All" },
    // no dimensions / polycount -> exercise the undefined paths
    thumbnail_url:
      "https://cdn.polyhaven.com/asset_img/thumbs/GardenHose_01.png?width=256&height=256",
  },
};

function fetchJsonFrom(payload: unknown): FetchJson {
  return async (url: string) => {
    if (url === "https://api.polyhaven.com/assets?t=models") return payload;
    throw new Error(`unexpected url ${url}`);
  };
}

const ctx = { fetchJson: fetchJsonFrom(POLY_HAVEN_ASSETS) };
const query = { text: "armchair" } as const;

describe("createPolyHavenAdapter", () => {
  it("identifies itself", () => {
    const adapter = createPolyHavenAdapter();
    expect(adapter.id).toBe("poly-haven");
    expect(adapter.label).toContain("CC0");
  });

  it("maps a Poly Haven asset to a CC0 canonical record", async () => {
    const adapter = createPolyHavenAdapter();
    const assets = await adapter.search(query, ctx);
    const chair = assets.find((a) => a.id === "poly-haven:ArmChair_01");
    expect(chair).toBeDefined();
    if (!chair) return;

    // CC0 is the whole-library license: verified + redistributable.
    expect(chair.license.spdx).toBe("CC0-1.0");
    expect(chair.license.verified).toBe(true);
    expect(chair.license.redistributable).toBe(true);
    expect(chair.license.attributionRequired).toBe(false);

    expect(chair.source).toBe("poly-haven");
    expect(chair.format).toBe("gltf");
    expect(chair.title).toBe("Arm Chair 01");
    expect(chair.triangles).toBe(5626);
    expect(chair.attribution).toBe("Kirill Sannikov");

    // Honest access: multi-file glTF -> deep-link to the canonical page, NOT a
    // bare .gltf direct-download. URL and sourcePage are the asset page.
    expect(chair.access).toBe("deep-link-only");
    expect(chair.url).toBe("https://polyhaven.com/a/ArmChair_01");
    expect(chair.sourcePage).toBe("https://polyhaven.com/a/ArmChair_01");

    // dimensions (mm) -> bounds size (m)
    expect(chair.bounds?.size[0]).toBeCloseTo(0.84843, 5);
    expect(chair.bounds?.size[2]).toBeCloseTo(1.06508, 5);

    // tags include lowercased tags + categories
    expect(chair.tags).toContain("furniture");
    expect(chair.tags).toContain("seating");
    expect(chair.tags).toContain("chair");
  });

  it("is NOT auto-pullable despite CC0 (deep-link only, multi-file glTF)", async () => {
    const adapter = createPolyHavenAdapter();
    const [chair] = await adapter.search(query, ctx);
    expect(chair).toBeDefined();
    // CC0 + verified, but access is deep-link-only -> must not auto-pull.
    expect(isAutoPullable(chair!)).toBe(false);
  });

  it("handles assets missing dimensions/polycount", async () => {
    const adapter = createPolyHavenAdapter();
    const assets = await adapter.search(query, ctx);
    const hose = assets.find((a) => a.id === "poly-haven:GardenHose_01");
    expect(hose).toBeDefined();
    expect(hose?.bounds).toBeUndefined();
    expect(hose?.triangles).toBeUndefined();
    expect(hose?.license.spdx).toBe("CC0-1.0");
  });

  it("caches the catalog after the first search", async () => {
    let calls = 0;
    const countingCtx = {
      fetchJson: async (url: string) => {
        calls += 1;
        if (url === "https://api.polyhaven.com/assets?t=models") {
          return POLY_HAVEN_ASSETS;
        }
        throw new Error(`unexpected url ${url}`);
      },
    };
    const adapter = createPolyHavenAdapter();
    await adapter.search(query, countingCtx);
    await adapter.search(query, countingCtx);
    expect(calls).toBe(1);
  });

  it("throws when the catalog is not an object map", async () => {
    const adapter = createPolyHavenAdapter();
    const badCtx = { fetchJson: fetchJsonFrom([] as unknown) };
    await expect(adapter.search(query, badCtx)).rejects.toThrow();
  });
});
