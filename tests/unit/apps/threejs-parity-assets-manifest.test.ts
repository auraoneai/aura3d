import { existsSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type ThreejsParityAssetManifest = {
  readonly schemaVersion: string;
  readonly assetCount: number;
  readonly assets: readonly {
    readonly id: string;
    readonly localPath: string;
    readonly byteSize: number;
    readonly sha256: string;
    readonly features?: readonly string[];
    readonly routeCorpusProofCandidate?: boolean;
  }[];
};

describe("threejs-parity asset manifest", () => {
  it("restores current-route skinned animation fixture inventory", () => {
    const manifestPath = resolve("fixtures/threejs-parity/assets/manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as ThreejsParityAssetManifest;

    expect(manifest.schemaVersion).toBe("a3d-threejs-parity-assets/1.0");
    expect(manifest.assetCount).toBe(manifest.assets.length);
    const skinnedCandidates = manifest.assets.filter((asset) => asset.routeCorpusProofCandidate);
    expect(skinnedCandidates.map((asset) => asset.id).sort()).toEqual(["robot-expressive", "soldier"]);

    for (const asset of manifest.assets) {
      const path = resolve(asset.localPath);
      expect(existsSync(path), `${asset.localPath} exists`).toBe(true);
      expect(statSync(path).size, `${asset.localPath} byte size`).toBe(asset.byteSize);
      expect(createHash("sha256").update(readFileSync(path)).digest("hex"), `${asset.localPath} sha256`).toBe(asset.sha256);
    }
  });
});
