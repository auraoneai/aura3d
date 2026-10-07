import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { addAsset, validateAssets } from "../../../packages/aura3d-cli/src";
import { readAssetManifest, writeAssetManifest } from "../../../packages/aura3d-cli/src/asset-manifest.js";
import { qrAssetsFlagEnabled } from "../../../packages/aura3d-cli/src/admission/qrFlags.js";
import type { AuraCliAssetManifest } from "../../../packages/aura3d-cli/src/asset-core-types.js";

const rootManifest = () => readAssetManifest(process.cwd());

describe("C-17 schema 1.0/1.1 reader and writer", () => {
  afterEach(() => {
    delete process.env.A3D_QR;
    delete process.env.A3D_QR_ASSETS;
  });

  test("reader accepts the root 1.0 manifest", () => {
    const manifest = rootManifest();
    expect(manifest.schema).toBe("aura3d.assets/1.0");
    expect(manifest.assets.length).toBeGreaterThan(300);
  });

  test("writer emits 1.0 while A3D_QR_ASSETS is off", () => {
    const projectDir = createProject();
    const manifest = rootManifest();
    writeAssetManifest(projectDir, manifest);
    const reread = readAssetManifest(projectDir);
    expect(reread.schema).toBe("aura3d.assets/1.0");
    // Round-trip preserves every original field on every entry (no field loss).
    for (const entry of manifest.assets) {
      const stored = reread.assets.find((asset) => asset.id === entry.id);
      expect(stored, entry.id).toBeDefined();
      for (const [key, value] of Object.entries(entry)) {
        expect(stored?.[key as keyof typeof stored], `${entry.id}.${key}`).toEqual(value);
      }
    }
  });

  test("writer emits 1.1 once A3D_QR_ASSETS is on, and the reader accepts it", () => {
    const projectDir = createProject();
    process.env.A3D_QR_ASSETS = "1";
    const manifest: AuraCliAssetManifest = {
      ...rootManifest(),
      schema: "aura3d.assets/1.1",
      assets: rootManifest().assets.map((asset) =>
        asset.id === "rooftopBackboard"
          ? {
              ...asset,
              derived: {
                profile: "prop-large",
                sourceHash: asset.hash,
                outputPath: asset.outputPath,
                hash: asset.hash,
                url: asset.url,
                steps: [],
                extensionsUsed: [],
                requiredDecoders: [],
                lods: [],
                measurements: {
                  before: { triangles: 12, drawCalls: 1, gpuBytesByTier: { low: 0, medium: 0, high: 0, ultra: 0 }, downloadBytes: 1 },
                  after: { triangles: 12, drawCalls: 1, gpuBytesByTier: { low: 0, medium: 0, high: 0, ultra: 0 }, downloadBytes: 1 },
                },
              },
            }
          : asset
      ),
    };
    writeAssetManifest(projectDir, manifest);
    const reread = readAssetManifest(projectDir);
    expect(reread.schema).toBe("aura3d.assets/1.1");
    expect(reread.assets.find((asset) => asset.id === "rooftopBackboard")?.derived?.sourceHash).toBeDefined();
  });

  test("qrFlags env semantics mirror the engine resolver", () => {
    expect(qrAssetsFlagEnabled({})).toBe(false);
    expect(qrAssetsFlagEnabled({ A3D_QR_ASSETS: "1" })).toBe(true);
    expect(qrAssetsFlagEnabled({ A3D_QR: "all" })).toBe(true);
    expect(qrAssetsFlagEnabled({ A3D_QR: "none" })).toBe(false);
    expect(qrAssetsFlagEnabled({ A3D_QR: "assets" })).toBe(true);
    expect(qrAssetsFlagEnabled({ A3D_QR: "decoders,assets" })).toBe(true);
    expect(qrAssetsFlagEnabled({ A3D_QR: "all,-assets" })).toBe(false);
    expect(qrAssetsFlagEnabled({ A3D_QR: "assets=false" })).toBe(false);
    expect(qrAssetsFlagEnabled({ A3D_QR: "assets", A3D_QR_ASSETS: "0" })).toBe(true); // first-set wins
  });
});

describe("R-09-1 audio provenance gate", () => {
  test("synthesized audio fails release; licensed audio does not trip the rule", () => {
    const projectDir = createProject();
    writeFileSync(join(projectDir, "assets", "synth.wav"), Buffer.alloc(2048));
    writeFileSync(join(projectDir, "assets", "licensed.wav"), Buffer.alloc(2048));

    addAsset({
      projectDir,
      file: "assets/synth.wav",
      name: "synthBoom",
      type: "audio",
      quality: "release",
      author: "Aura3D synthesis",
      provenanceEvidence: ["Deterministically synthesized from the committed in-repository oscillator/noise generator"],
      audio: { loudnessLufs: -14, truePeakDb: -1, author: "Aura3D synthesis" }
    });
    addAsset({
      projectDir,
      file: "assets/licensed.wav",
      name: "licensedLoop",
      type: "audio",
      quality: "release",
      license: "CC0-1.0",
      author: "Kenney",
      sourceUrl: "https://kenney.nl/assets/interface-sounds",
      audio: { loudnessLufs: -16, truePeakDb: -0.8, author: "Kenney", sourceUrl: "https://kenney.nl/assets/interface-sounds" }
    });

    const manifest = readAssetManifest(projectDir);
    const synth = manifest.assets.find((asset) => asset.id === "synthBoom");
    const licensed = manifest.assets.find((asset) => asset.id === "licensedLoop");
    // R-09-1: --type audio writes entry.audio metadata.
    expect(synth?.audio).toMatchObject({ loudnessLufs: -14, truePeakDb: -1 });
    expect(licensed?.audio).toMatchObject({ loudnessLufs: -16, sourceUrl: "https://kenney.nl/assets/interface-sounds" });

    const report = validateAssets({ projectDir, release: true });
    const text = report.warnings.join("\n");
    expect(text).toContain("synthBoom: release audio asset has synthesized provenance");
    expect(text).not.toContain("licensedLoop: release audio asset has synthesized provenance");
  });
});

function createProject(): string {
  const projectDir = join(tmpdir(), `aura3d-cli-schema-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(join(projectDir, "assets"), { recursive: true });
  writeFileSync(join(projectDir, "package.json"), JSON.stringify({ type: "module" }));
  return projectDir;
}
