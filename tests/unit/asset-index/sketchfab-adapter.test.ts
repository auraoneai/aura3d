import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createSketchfabAdapter,
  isAutoPullable,
  type FetchJson,
} from "@aura3d/asset-index";

/**
 * Fixtures mirror the VERIFIED live Sketchfab Data API v3 search shape
 * (GET /v3/search?type=models&downloadable=true):
 *   { results: [{ uid, name, viewerUrl, isDownloadable, faceCount, vertexCount,
 *                 license: { uid, label }, thumbnails: { images: [...] },
 *                 tags: [{ name, slug, uri }], user: { displayName } }, ... ] }
 *
 * The search `license` object only exposes `{ uid, label }`; the adapter maps the
 * label onto a normalizeLicense key. Only CC0 / CC-BY families are redistributable.
 */
const SEARCH_RESPONSE = {
  results: [
    {
      uid: "cc0model0000000000000000000000aa",
      name: "Public Domain Chair",
      viewerUrl: "https://sketchfab.com/3d-models/public-domain-chair-cc0model",
      isDownloadable: true,
      faceCount: 12000,
      vertexCount: 6400,
      license: { uid: "lic-cc0", label: "CC0 Public Domain" },
      thumbnails: {
        images: [
          { uid: "t1", size: 4096, width: 64, height: 64, url: "https://t.test/small.jpg" },
          { uid: "t2", size: 65536, width: 512, height: 512, url: "https://t.test/large.jpg" },
        ],
      },
      tags: [{ name: "furniture", slug: "furniture", uri: "x" }],
      user: { displayName: "Some Author", username: "someauthor" },
    },
    {
      uid: "unknownlic00000000000000000000bb",
      name: "Editorial-Only Statue",
      viewerUrl: "https://sketchfab.com/3d-models/editorial-statue-unknownlic",
      isDownloadable: true,
      faceCount: 99000,
      license: { uid: "lic-ed", label: "Editorial Use" },
      thumbnails: { images: [{ uid: "t3", size: 1024, url: "https://t.test/statue.jpg" }] },
      tags: [{ name: "sculpture", slug: "sculpture", uri: "y" }],
      user: { displayName: "Statue Maker" },
    },
    {
      // Not downloadable -> must be dropped.
      uid: "notdownloadable000000000000000cc",
      name: "View Only",
      isDownloadable: false,
      license: { uid: "lic-cc0", label: "CC0 Public Domain" },
    },
  ],
};

function fixtureFetch(): FetchJson {
  return async (url: string) => {
    if (url.startsWith("https://api.sketchfab.com/v3/search")) return SEARCH_RESPONSE;
    throw new Error(`unexpected fetch ${url}`);
  };
}

const ctx = { fetchJson: fixtureFetch() };

describe("createSketchfabAdapter (token present)", () => {
  beforeEach(() => {
    process.env.SKETCHFAB_API_TOKEN = "test-token-123";
  });
  afterEach(() => {
    delete process.env.SKETCHFAB_API_TOKEN;
  });

  it("tiers a CC0 model to a verified, redistributable, auto-pullable record", async () => {
    const adapter = createSketchfabAdapter();
    const assets = await adapter.search({ text: "chair" }, ctx);
    const cc0 = assets.find((a) => a.id === "sketchfab:cc0model0000000000000000000000aa");

    expect(cc0).toBeDefined();
    expect(cc0!.license.spdx).toBe("CC0-1.0");
    expect(cc0!.license.verified).toBe(true);
    expect(cc0!.license.redistributable).toBe(true);
    // With a token + redistributable license, url points at the download-resolve
    // API endpoint and access is direct-download (token exchanged at pull time).
    expect(cc0!.access).toBe("direct-download");
    expect(cc0!.url).toBe(
      "https://api.sketchfab.com/v3/models/cc0model0000000000000000000000aa/download",
    );
    expect(isAutoPullable(cc0!)).toBe(true);
    // Mapped fields.
    expect(cc0!.triangles).toBe(12000);
    expect(cc0!.thumbnailUrl).toBe("https://t.test/large.jpg"); // largest by size
    expect(cc0!.attribution).toBe("Some Author");
    expect(cc0!.tags).toContain("furniture");
  });

  it("marks an unknown/editorial license as UNVERIFIED deep-link-only", async () => {
    const adapter = createSketchfabAdapter();
    const assets = await adapter.search({ text: "statue" }, ctx);
    const unknown = assets.find(
      (a) => a.id === "sketchfab:unknownlic00000000000000000000bb",
    );

    expect(unknown).toBeDefined();
    expect(unknown!.license.spdx).toBe("UNVERIFIED");
    expect(unknown!.license.verified).toBe(false);
    expect(unknown!.license.redistributable).toBe(false);
    expect(unknown!.access).toBe("deep-link-only");
    // deep-link url is the model page, not the download endpoint.
    expect(unknown!.url).toBe(
      "https://sketchfab.com/3d-models/editorial-statue-unknownlic",
    );
    expect(isAutoPullable(unknown!)).toBe(false);
  });

  it("drops non-downloadable models", async () => {
    const adapter = createSketchfabAdapter();
    const assets = await adapter.search({ text: "chair" }, ctx);
    expect(assets.some((a) => a.id.includes("notdownloadable"))).toBe(false);
  });
});

describe("createSketchfabAdapter (no token)", () => {
  beforeEach(() => {
    delete process.env.SKETCHFAB_API_TOKEN;
  });

  it("returns [] without throwing and without touching the network", async () => {
    const adapter = createSketchfabAdapter();
    let fetched = false;
    const spyCtx = {
      fetchJson: async (url: string) => {
        fetched = true;
        throw new Error(`should not fetch ${url}`);
      },
    };
    const assets = await adapter.search({ text: "chair" }, spyCtx);
    expect(assets).toEqual([]);
    expect(fetched).toBe(false);
  });
});
