import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GLTFLoader, validateGLTFCorpusManifest, type GLTFCorpusManifest } from "../../packages/assets/src";

const manifestPath = resolve("tests/assets/corpus/gltf-corpus.manifest.json");
const khronosRepository = "https://github.com/KhronosGroup/glTF-Sample-Assets";
const khronosRevision = "2bac6f8c57bf471df0d2a1e8a8ec023c7801dddf";

describe("Khronos glTF sample model validation", () => {
  it("keeps the Khronos sample slice pinned, typed, and loadable by the public GLTFLoader contract", () => {
    const manifest = readManifest();
    const validation = validateGLTFCorpusManifest(manifest);
    const loader = new GLTFLoader();

    expect(validation.ok).toBe(true);
    expect(validation.diagnostics).toEqual([]);
    expect(manifest.generatedFrom).toEqual({
      name: "Khronos glTF Sample Assets",
      repository: khronosRepository,
      revision: khronosRevision
    });

    for (const asset of manifest.assets) {
      expect(asset.source.repository).toBe(khronosRepository);
      expect(asset.source.revision).toBe(khronosRevision);
      expect(asset.source.uri).toContain(`/KhronosGroup/glTF-Sample-Assets/${khronosRevision}/`);
      expect(loader.canLoad({ url: asset.source.uri })).toBe(true);
      expect(asset.license.trim().length).toBeGreaterThan(0);
      expect(asset.tags.length).toBeGreaterThan(0);
    }
  });

  it("classifies the bounded Khronos corpus into pass and warn buckets with no expected-fail entries", () => {
    const manifest = readManifest();
    const statusCounts = new Map<string, number>();
    for (const asset of manifest.assets) {
      statusCounts.set(asset.expectedStatus, (statusCounts.get(asset.expectedStatus) ?? 0) + 1);
    }

    expect(statusCounts.get("pass")).toBe(70);
    expect(statusCounts.get("warn")).toBe(7);
    expect(statusCounts.get("expected-fail") ?? 0).toBe(0);

    const expectedFailures = manifest.assets.filter((asset) => asset.expectedStatus === "expected-fail");
    expect(expectedFailures).toEqual([]);
  });
});

function readManifest(): GLTFCorpusManifest {
  return JSON.parse(readFileSync(manifestPath, "utf8")) as GLTFCorpusManifest;
}
