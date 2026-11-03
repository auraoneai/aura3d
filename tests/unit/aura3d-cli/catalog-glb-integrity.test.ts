/**
 * S5-WP07-01: catalog-wide provenance digests. The typed model path verifies a
 * GLB's document digest and requires a digest for every external buffer/image
 * before render, so every tracked asset manifest must record the shipped
 * document bytes and every sidecar the GLB actually references, and its typed
 * source must carry the same integrity map.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { checkGlbDependencies } from "../../../packages/aura3d-cli/src/glb-dependency-validation";
import type { AuraCliAssetEntry } from "../../../packages/aura3d-cli/src/asset-core-types";
import { listCandidateFiles } from "../../../tools/remote-acr/source5-files.mjs";

const root = resolve(__dirname, "../../..");
// Synthetic manifest whose model files are intentionally not materialized.
const SYNTHETIC = new Set(["tests/qr/prd05/fixtures/route-bundle/aura.assets.json"]);

function trackedManifests(): string[] {
  // Git checkout: tracked files; ACR source pass (no .git): the staged source5 manifest.
  return listCandidateFiles(root)
    .filter((file) => file.endsWith("aura.assets.json") && !SYNTHETIC.has(file))
    .sort();
}

const digestOf = (value: string | undefined) => value?.replace(/^sha256[-:]/, "").toLowerCase();

describe("catalog-wide GLB provenance digests", () => {
  const manifests = trackedManifests();

  it("finds the tracked catalog manifests", () => {
    expect(manifests.length).toBeGreaterThanOrEqual(40);
    expect(manifests).toContain("aura.assets.json");
  });

  it("records the shipped document digest and every referenced sidecar digest for every GLB", () => {
    const problems: string[] = [];
    let glbs = 0;
    let withSidecars = 0;
    for (const file of manifests) {
      const projectDir = resolve(root, dirname(file));
      const manifest = JSON.parse(readFileSync(join(root, file), "utf8")) as { assets?: unknown };
      const assets = (Array.isArray(manifest.assets) ? manifest.assets : Object.values(manifest.assets ?? {})) as AuraCliAssetEntry[];
      const typedPath = join(projectDir, "src", "aura-assets.ts");
      const typed = existsSync(typedPath) ? readFileSync(typedPath, "utf8") : undefined;
      for (const asset of assets) {
        const output = (asset as { outputPath?: string }).outputPath;
        if (!output || !/\.glb$/i.test(output)) continue;
        glbs++;
        const outputPath = resolve(projectDir, output);
        if (!existsSync(outputPath)) { problems.push(`${file} ${asset.id}: missing ${output}`); continue; }
        const checked = checkGlbDependencies(projectDir, outputPath, asset);
        const expected = digestOf(asset.integrity?.digest ?? asset.hash);
        if (!expected) problems.push(`${file} ${asset.id}: no document digest`);
        else if (digestOf(checked.hash) !== expected) problems.push(`${file} ${asset.id}: document digest does not match shipped bytes`);
        problems.push(...checked.failures.map((failure) => `${file}: ${failure}`));
        if (checked.uris.length > 0) {
          withSidecars++;
          if (typed !== undefined && !typed.includes(`integrity: { version: 1, digest: "sha256-${expected}", dependencies: {`)) {
            problems.push(`${file} ${asset.id}: typed source lacks the dependency integrity map`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
    expect(glbs).toBeGreaterThan(400);
    expect(withSidecars).toBeGreaterThan(0);
  });
});
