import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { addAsset, readAssetManifest } from "../../../packages/aura3d-cli/src";

/**
 * Regression coverage for licence and author provenance coherence.
 *
 * Provenance fields were previously merged one at a time, with each detected value
 * falling back to the stale recorded value independently. A GLB commonly embeds
 * `license` without `licenseName`, so a corrected `license` could end up sitting beside
 * a stale `licenseName` — for example `CC-BY-SA-4.0` next to `CC-BY-4.0`, which
 * understates a share-alike obligation. Licence identity and author identity now merge
 * as coherent groups.
 */
describe("CLI asset provenance licence coherence", () => {
  it("replaces the whole licence group when the asset embeds a different licence", () => {
    const projectDir = createProject();
    // First add records CC-BY-4.0 from an explicit flag pair.
    writeFileSync(join(projectDir, "assets", "prop.gltf"), JSON.stringify(gltfWithLicense("CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)", "First Author (https://example.com/first)")));
    addAsset({
      projectDir,
      file: "assets/prop.gltf",
      name: "prop",
      license: "CC-BY-4.0",
      licenseName: "CC-BY-4.0",
      author: "First Author",
      attribution: "First Author"
    });

    // The asset itself now declares share-alike and a different author.
    writeFileSync(join(projectDir, "assets", "prop.gltf"), JSON.stringify(gltfWithLicense("CC-BY-SA-4.0 (http://creativecommons.org/licenses/by-sa/4.0/)", "Real Author (https://example.com/real)")));
    addAsset({ projectDir, file: "assets/prop.gltf", name: "prop" });

    const provenance = readAssetManifest(projectDir).assets.find((asset) => asset.id === "prop")?.provenance;
    expect(provenance?.license).toContain("CC-BY-SA-4.0");
    // The critical assertion: licenseName must not remain the weaker CC-BY-4.0.
    expect(provenance?.licenseName).toBe("CC-BY-SA-4.0");
    expect(provenance?.licenseUrl).toBe("http://creativecommons.org/licenses/by-sa/4.0/");
    // Author identity moves as a group too, so attribution cannot credit the wrong person.
    expect(provenance?.author).toContain("Real Author");
    expect(provenance?.attribution).toBe("Real Author");
  });

  it("keeps recorded provenance when the asset embeds no licence of its own", () => {
    const projectDir = createProject();
    writeFileSync(join(projectDir, "assets", "bare.gltf"), JSON.stringify(gltfWithLicense(undefined, undefined)));
    addAsset({
      projectDir,
      file: "assets/bare.gltf",
      name: "bare",
      license: "CC0-1.0",
      licenseName: "CC0-1.0",
      author: "Recorded Author",
      attribution: "Recorded Author"
    });
    // Re-adding without flags must not erase hand-recorded provenance for an asset that
    // carries none of its own.
    addAsset({ projectDir, file: "assets/bare.gltf", name: "bare" });

    const provenance = readAssetManifest(projectDir).assets.find((asset) => asset.id === "bare")?.provenance;
    expect(provenance?.license).toBe("CC0-1.0");
    expect(provenance?.licenseName).toBe("CC0-1.0");
    expect(provenance?.author).toBe("Recorded Author");
  });
});

function createProject(): string {
  const projectDir = mkdtempSync(join(tmpdir(), "aura3d-provenance-"));
  mkdirSync(join(projectDir, "assets"), { recursive: true });
  mkdirSync(join(projectDir, "src"), { recursive: true });
  writeFileSync(join(projectDir, "package.json"), JSON.stringify({ name: "provenance-fixture", version: "0.0.0" }));
  return projectDir;
}

function gltfWithLicense(license: string | undefined, author: string | undefined): unknown {
  return {
    asset: {
      version: "2.0",
      extras: {
        ...(license ? { license } : {}),
        ...(author ? { author } : {}),
        source: "https://example.com/model"
      }
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: "prop", mesh: 0 }],
    meshes: [{ name: "prop", primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }],
    buffers: [{ byteLength: 36 }],
    materials: [{ name: "prop-material", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] } }]
  };
}
