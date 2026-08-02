import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readAssetManifest, validateAssets } from "../../../packages/aura3d-cli/src";

/**
 * `assets validate` proves an asset *file* is unchanged via its content hash, but that is a
 * different claim from "the metadata derived from that file still matches it". Metadata written
 * by an older inspector, or hand-edited, passed a green hash check indefinitely.
 *
 * A repo-wide audit found 79 assets whose manifest `bounds` disagreed with their own GLB and 62
 * with no `hierarchy` block, many with Y and Z transposed from an unnormalized Z-up source.
 * That is the same class of error as defect 45, where a vehicle floated above its track because
 * a height was taken from the wrong axis.
 */
function createProject(): string {
  const projectDir = join(tmpdir(), `aura3d-drift-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(join(projectDir, "public", "aura-assets"), { recursive: true });
  writeFileSync(join(projectDir, "package.json"), JSON.stringify({ type: "module" }));
  return projectDir;
}

function stageAsset(mutate: (asset: Record<string, unknown>) => void): { readonly projectDir: string; readonly assetId: string } {
  const sourceManifest = readAssetManifest(process.cwd());
  const source = sourceManifest.assets.find((candidate) => candidate.id === "showcaseTexturedSportsCar");
  if (!source) throw new Error("expected showcaseTexturedSportsCar in the repo manifest");
  const projectDir = createProject();
  cpSync(join(process.cwd(), source.outputPath), join(projectDir, source.outputPath));
  const asset = JSON.parse(JSON.stringify(source)) as Record<string, unknown>;
  mutate(asset);
  writeFileSync(
    join(projectDir, "aura.assets.json"),
    `${JSON.stringify({ ...sourceManifest, assets: [asset] }, null, 2)}\n`
  );
  mkdirSync(join(projectDir, dirname(sourceManifest.typegen)), { recursive: true });
  writeFileSync(join(projectDir, sourceManifest.typegen), "export const assets = {} as const;\n");
  return { projectDir, assetId: source.id };
}

describe("assets validate re-derives geometry metadata from the asset file", () => {
  it("accepts metadata that matches the asset file", () => {
    const { projectDir, assetId } = stageAsset(() => undefined);
    const report = validateAssets({ projectDir });
    const drift = report.warnings.filter((warning) => warning.includes("do not match the asset file"));
    expect(drift, `${assetId} should not report drift when metadata is current`).toEqual([]);
  });

  it("reports drift when manifest bounds disagree with the asset file", () => {
    // Y and Z transposed: the exact shape of the real repo-wide staleness.
    const { projectDir } = stageAsset((asset) => {
      asset.bounds = [3.644, 6.958, 2.209];
      const meta = asset.boundsMetadata as Record<string, unknown> | undefined;
      if (meta) meta.size = [3.644, 6.958, 2.209];
    });
    const report = validateAssets({ projectDir });
    expect(report.warnings.join("\n")).toContain("do not match the asset file");
  });

  it("reports a stale grounded flag", () => {
    const { projectDir } = stageAsset((asset) => {
      const meta = asset.boundsMetadata as Record<string, unknown> | undefined;
      if (meta) meta.grounded = false;
    });
    const report = validateAssets({ projectDir });
    expect(report.warnings.join("\n")).toContain("grounded=false");
  });

  it("reports a missing hierarchy inspection the asset file provides", () => {
    const { projectDir } = stageAsset((asset) => {
      delete asset.hierarchy;
    });
    const report = validateAssets({ projectDir });
    expect(report.warnings.join("\n")).toContain("missing the scene hierarchy inspection");
  });

  it("reports drift in hierarchy counts", () => {
    const { projectDir } = stageAsset((asset) => {
      const hierarchy = asset.hierarchy as Record<string, unknown> | undefined;
      if (hierarchy) hierarchy.meshCount = 999;
    });
    const report = validateAssets({ projectDir });
    expect(report.warnings.join("\n")).toContain("hierarchy.meshCount=999");
  });
});
