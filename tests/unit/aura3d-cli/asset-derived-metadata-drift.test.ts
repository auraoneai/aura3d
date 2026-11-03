import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateAssets, type AuraCliAssetManifest } from "../../../packages/aura3d-cli/src";

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
const projectDirs: string[] = [];

afterEach(() => {
  for (const projectDir of projectDirs.splice(0)) rmSync(projectDir, { recursive: true, force: true });
});

function createProject(): string {
  const projectDir = mkdtempSync(join(tmpdir(), "aura3d-drift-"));
  projectDirs.push(projectDir);
  writeFileSync(join(projectDir, "package.json"), JSON.stringify({ type: "module" }));
  return projectDir;
}

function projectPath(projectDir: string, path: string): string {
  const destination = resolve(projectDir, path);
  if (!destination.startsWith(`${projectDir}${sep}`)) throw new Error(`fixture path escapes the test project: ${path}`);
  return destination;
}

function stageAsset(mutate: (asset: Record<string, unknown>) => void): { readonly projectDir: string; readonly assetId: string } {
  // Select the fixture before validating: unrelated root entries are outside this suite's scope.
  // validateAssets still reads and checks the complete isolated manifest and the real GLB copy.
  const sourceManifest = JSON.parse(readFileSync(join(process.cwd(), "aura.assets.json"), "utf8")) as AuraCliAssetManifest;
  const fixtures = sourceManifest.assets.filter((candidate) => candidate?.id === "showcaseTexturedSportsCar");
  if (fixtures.length !== 1) throw new Error("expected exactly one showcaseTexturedSportsCar in the repo manifest");
  const source = fixtures[0]!;
  const projectDir = createProject();
  const outputPath = projectPath(projectDir, source.outputPath);
  mkdirSync(dirname(outputPath), { recursive: true });
  copyFileSync(resolve(process.cwd(), source.outputPath), outputPath);
  const asset = JSON.parse(JSON.stringify(source)) as Record<string, unknown>;
  mutate(asset);
  writeFileSync(
    join(projectDir, "aura.assets.json"),
    `${JSON.stringify({ ...sourceManifest, assets: [asset] }, null, 2)}\n`
  );
  const typegenPath = projectPath(projectDir, sourceManifest.typegen);
  mkdirSync(dirname(typegenPath), { recursive: true });
  writeFileSync(typegenPath, "export const assets = {} as const;\n");
  return { projectDir, assetId: source.id };
}

function validateFixture(projectDir: string, assetId: string) {
  const report = validateAssets({ projectDir });
  expect(report.manifest.assets.map((asset) => asset.id)).toEqual([assetId]);
  expect(report.failures, "the isolated fixture must pass normal asset integrity validation").toEqual([]);
  return report;
}

describe("assets validate re-derives geometry metadata from the asset file", () => {
  it("accepts metadata that matches the asset file", () => {
    const { projectDir, assetId } = stageAsset(() => undefined);
    const report = validateFixture(projectDir, assetId);
    const drift = report.warnings.filter((warning) => warning.includes("do not match the asset file"));
    expect(drift, `${assetId} should not report drift when metadata is current`).toEqual([]);
  });

  it("reports drift when manifest bounds disagree with the asset file", () => {
    // Y and Z transposed: the exact shape of the real repo-wide staleness.
    const { projectDir, assetId } = stageAsset((asset) => {
      asset.bounds = [3.644, 6.958, 2.209];
      const meta = asset.boundsMetadata as Record<string, unknown> | undefined;
      if (meta) meta.size = [3.644, 6.958, 2.209];
    });
    const report = validateFixture(projectDir, assetId);
    expect(report.warnings.join("\n")).toContain(
      `${assetId}: manifest bounds [3.644, 6.958, 2.209] do not match the asset file [3.644, 2.209, 6.958]`
    );
  });

  it("reports a stale grounded flag", () => {
    const { projectDir, assetId } = stageAsset((asset) => {
      const meta = asset.boundsMetadata as Record<string, unknown> | undefined;
      if (meta) meta.grounded = false;
    });
    const report = validateFixture(projectDir, assetId);
    expect(report.warnings.join("\n")).toContain(`${assetId}: manifest records grounded=false but the asset file is grounded=true`);
  });

  it("reports a missing hierarchy inspection the asset file provides", () => {
    const { projectDir, assetId } = stageAsset((asset) => {
      delete asset.hierarchy;
    });
    const report = validateFixture(projectDir, assetId);
    expect(report.warnings.join("\n")).toContain(`${assetId}: manifest is missing the scene hierarchy inspection that the asset file provides`);
  });

  it("reports drift in hierarchy counts", () => {
    const { projectDir, assetId } = stageAsset((asset) => {
      const hierarchy = asset.hierarchy as Record<string, unknown> | undefined;
      if (hierarchy) hierarchy.meshCount = 999;
    });
    const report = validateFixture(projectDir, assetId);
    expect(report.warnings.join("\n")).toContain(`${assetId}: manifest hierarchy.meshCount=999 but the asset file reports 7`);
  });
});
