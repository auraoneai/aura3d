import { describe, expect, it } from "vitest";
import {
  FederatedResolver,
  createKhronosAdapter,
  createOS3AAdapter,
  isAutoPullable,
  normalizeLicense,
  type FetchJson,
} from "@aura3d/asset-index";

/**
 * Fixtures mirror the VERIFIED live schemas (checked against the real repos):
 *  - Khronos Models/model-index.json: { label, name, screenshot, tags, variants }
 *  - OS3A data/projects.json + data/assets/<file>.json (project-level license).
 */
const KHRONOS_INDEX = [
  {
    label: "Damaged Helmet",
    name: "DamagedHelmet",
    screenshot: "screenshot/screenshot.png",
    tags: ["core", "testing", "showcase"],
    variants: { "glTF": "DamagedHelmet.gltf", "glTF-Binary": "DamagedHelmet.glb" },
  },
  {
    // No glTF-Binary variant -> must be skipped (we only index single-file .glb).
    label: "GLTF Only",
    name: "GltfOnly",
    variants: { "glTF": "GltfOnly.gltf" },
  },
];

const OS3A_PROJECTS = [
  {
    id: "pm-momuspark",
    name: "MomusPark",
    creator_id: "Polygonal Mind",
    is_public: true,
    license: "CC0",
    github_url: "https://github.com/ToxSam/cc0-models-Polygonal-Mind",
    asset_data_file: "assets/pm-momuspark.json",
  },
];

const OS3A_ASSETS = [
  {
    id: "momuspark-001",
    name: "Park Bench",
    project_id: "pm-momuspark",
    description: "A wooden park bench",
    model_file_url: "https://example.test/Bench_01.glb",
    format: "GLB",
    is_public: true,
    is_draft: false,
    thumbnail_url: "https://example.test/Bench_01_thumbnail.png",
    metadata: { file_size: 878104, attributes: [{ trait_type: "Category", value: "Furniture" }] },
  },
  {
    id: "momuspark-draft",
    name: "Unfinished Helmet",
    model_file_url: "https://example.test/draft.glb",
    is_draft: true, // must be dropped
    metadata: {},
  },
];

function fixtureFetch(): FetchJson {
  return async (url: string) => {
    if (url.endsWith("model-index.json")) return KHRONOS_INDEX;
    if (url.endsWith("projects.json")) return OS3A_PROJECTS;
    if (url.endsWith("pm-momuspark.json")) return OS3A_ASSETS;
    throw new Error(`unexpected fetch ${url}`);
  };
}

function resolver() {
  return new FederatedResolver({
    adapters: [createKhronosAdapter(), createOS3AAdapter()],
    fetchJson: fixtureFetch(),
  });
}

describe("normalizeLicense", () => {
  it("treats CC0 as verified and redistributable, no attribution", () => {
    const l = normalizeLicense("CC0");
    expect(l.spdx).toBe("CC0-1.0");
    expect(l.verified).toBe(true);
    expect(l.redistributable).toBe(true);
    expect(l.attributionRequired).toBe(false);
  });

  it("treats CC-BY as redistributable but attribution-required", () => {
    const l = normalizeLicense("CC-BY-4.0");
    expect(l.spdx).toBe("CC-BY-4.0");
    expect(l.attributionRequired).toBe(true);
    expect(l.redistributable).toBe(true);
  });

  it("treats unknown/empty as UNVERIFIED and non-redistributable", () => {
    const l = normalizeLicense(undefined);
    expect(l.spdx).toBe("UNVERIFIED");
    expect(l.verified).toBe(false);
    expect(l.redistributable).toBe(false);
  });
});

describe("FederatedResolver", () => {
  it("ranks the matching OS3A asset and builds a direct GLB url", async () => {
    const result = await resolver().resolve({ text: "park bench" });
    expect(result.warnings).toHaveLength(0);
    const top = result.candidates[0];
    expect(top?.asset.id).toBe("os3a:momuspark-001");
    expect(top?.asset.url).toBe("https://example.test/Bench_01.glb");
    // Project-level CC0 license flows down to the asset and makes it auto-pullable.
    expect(top?.asset.license.spdx).toBe("CC0-1.0");
    expect(isAutoPullable(top!.asset)).toBe(true);
  });

  it("builds the Khronos raw GLB url and marks it UNVERIFIED (not auto-pullable)", async () => {
    const result = await resolver().resolve({ text: "damaged helmet" });
    const helmet = result.candidates.find((c) => c.asset.id === "khronos:DamagedHelmet");
    expect(helmet?.asset.url).toBe(
      "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/DamagedHelmet/glTF-Binary/DamagedHelmet.glb",
    );
    expect(helmet?.asset.license.spdx).toBe("UNVERIFIED");
    expect(isAutoPullable(helmet!.asset)).toBe(false);
  });

  it("skips draft assets and glb-less Khronos entries", async () => {
    const result = await resolver().resolve({ text: "helmet" });
    const ids = result.candidates.map((c) => c.asset.id);
    expect(ids).not.toContain("os3a:momuspark-draft");
    expect(ids).not.toContain("khronos:GltfOnly");
  });

  it("honors redistributableOnly by dropping UNVERIFIED candidates", async () => {
    const result = await resolver().resolve({
      text: "damaged helmet park bench",
      constraints: { redistributableOnly: true },
    });
    expect(result.candidates.every((c) => c.asset.license.redistributable)).toBe(true);
    expect(result.candidates.some((c) => c.asset.source === "khronos")).toBe(false);
  });

  it("surfaces a warning when a source fails instead of collapsing", async () => {
    const flaky = new FederatedResolver({
      adapters: [createOS3AAdapter()],
      fetchJson: async (url) => {
        if (url.endsWith("projects.json")) throw new Error("boom");
        return [];
      },
    });
    const result = await flaky.resolve({ text: "bench" });
    expect(result.candidates).toHaveLength(0);
    expect(result.warnings[0]).toContain("os3a: boom");
  });
});
