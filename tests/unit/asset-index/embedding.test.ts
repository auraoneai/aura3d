import { describe, expect, it } from "vitest";
import {
  LocalHashEmbedding,
  cosineSimilarity,
  assetEmbeddingText,
  embeddingRanker,
} from "../../../packages/asset-index/src/embedding.js";
import type { AuraCanonicalAsset } from "../../../packages/asset-index/src/CanonicalAsset.js";

function asset(
  id: string,
  title: string,
  tags: string[],
  description?: string,
): AuraCanonicalAsset {
  return {
    id,
    source: "test",
    title,
    description,
    url: `https://example.com/${id}.glb`,
    access: "direct-download",
    format: "glb",
    license: {
      spdx: "CC0-1.0",
      raw: "CC0",
      verified: true,
      attributionRequired: false,
      redistributable: true,
    },
    tags,
  };
}

describe("LocalHashEmbedding + cosineSimilarity", () => {
  it("cosine of identical text is exactly 1", async () => {
    const provider = new LocalHashEmbedding();
    const [a, b] = await provider.embed(["rusty helmet", "rusty helmet"]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 12);
  });

  it("produces unit-length, fixed-dimension vectors for non-empty text", async () => {
    const provider = new LocalHashEmbedding();
    const [v] = await provider.embed(["damaged battle helmet"]);
    expect(v).toHaveLength(256);
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 12);
  });

  it("returns 0 for empty / zero vectors and mismatched lengths", () => {
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([0, 0, 0], [0, 0, 0])).toBe(0);
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });
});

describe("embeddingRanker", () => {
  const helmet = asset("test:helmet", "Damaged Helmet", ["helmet", "armor"], "a rusty helmet");
  const banana = asset("test:banana", "Banana", ["fruit", "food"], "a yellow banana");

  it("ranks related text above unrelated text", async () => {
    const provider = new LocalHashEmbedding();
    const ranked = await embeddingRanker(provider, "rusty helmet", [banana, helmet]);
    expect(ranked[0].asset.id).toBe("test:helmet");
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it("is deterministic across two independent runs", async () => {
    const a = await embeddingRanker(new LocalHashEmbedding(), "rusty helmet", [banana, helmet]);
    const b = await embeddingRanker(new LocalHashEmbedding(), "rusty helmet", [banana, helmet]);
    expect(b.map((r) => [r.asset.id, r.score])).toEqual(
      a.map((r) => [r.asset.id, r.score]),
    );
  });

  it("returns [] for an empty asset list without calling out", async () => {
    const ranked = await embeddingRanker(new LocalHashEmbedding(), "anything", []);
    expect(ranked).toEqual([]);
  });
});

describe("assetEmbeddingText", () => {
  it("includes title, tags, and description", () => {
    const text = assetEmbeddingText(
      asset("test:x", "Concept Car", ["vehicle", "car"], "a sleek concept car"),
    );
    expect(text).toContain("Concept Car");
    expect(text).toContain("vehicle");
    expect(text).toContain("car");
    expect(text).toContain("a sleek concept car");
  });

  it("omits description cleanly when absent", () => {
    const text = assetEmbeddingText(asset("test:y", "Sphere", ["primitive"]));
    expect(text).toBe("Sphere primitive");
  });
});
