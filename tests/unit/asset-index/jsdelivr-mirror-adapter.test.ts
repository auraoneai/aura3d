import { describe, expect, it } from "vitest";
import { isAutoPullable } from "@aura3d/asset-index";
import { createJsDelivrMirrorAdapter } from "../../../packages/asset-index/src/adapters/jsdelivr-mirror.js";
import type { AdapterContext } from "../../../packages/asset-index/src/SourceAdapter.js";

const MANIFEST = {
  schema: "aura3d-cc0-mirror/1",
  cdnBase: "https://cdn.jsdelivr.net/gh/acme/cc0@main",
  assets: [
    {
      id: "kenney:car-kit:ambulance",
      source: "kenney",
      pack: "car-kit",
      title: "Ambulance",
      path: "kenney/car-kit/ambulance.glb",
      license: "CC0",
      tags: ["emergency"],
    },
    {
      // Missing path -> must be skipped.
      id: "kenney:car-kit:broken",
      source: "kenney",
      title: "Broken",
      path: "",
      license: "CC0",
    },
  ],
};

function ctx(manifest: unknown = MANIFEST): AdapterContext {
  return { fetchJson: async () => manifest };
}

describe("createJsDelivrMirrorAdapter", () => {
  it("maps a mirror entry to an auto-pullable CC0 jsDelivr URL", async () => {
    const a = createJsDelivrMirrorAdapter({ manifestUrl: "https://example.test/manifest.json" });
    const results = await a.search({ text: "" }, ctx());
    const amb = results.find((r) => r.id === "kenney:car-kit:ambulance");
    expect(amb).toBeDefined();
    expect(amb?.source).toBe("mirror:kenney");
    expect(amb?.url).toBe("https://cdn.jsdelivr.net/gh/acme/cc0@main/kenney/car-kit/ambulance.glb");
    expect(amb?.access).toBe("direct-download");
    expect(amb?.license.spdx).toBe("CC0-1.0");
    expect(amb?.tags).toContain("car"); // derived from pack
    expect(isAutoPullable(amb!)).toBe(true);
  });

  it("skips entries without a path", async () => {
    const a = createJsDelivrMirrorAdapter();
    const results = await a.search({ text: "" }, ctx());
    expect(results.map((r) => r.id)).not.toContain("kenney:car-kit:broken");
    expect(results).toHaveLength(1);
  });

  it("returns [] for an empty/invalid manifest without throwing", async () => {
    const a = createJsDelivrMirrorAdapter();
    const results = await a.search({ text: "" }, ctx({ schema: "x", assets: [] }));
    expect(results).toEqual([]);
  });
});
