import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { readAssetManifest, validateAssets } from "../../../../packages/aura3d-cli/src";

/**
 * #165 (C-25 sfx provenance, adopted from lane 09's `sfx admit`): `assets
 * validate --release` must fail a release audio entry that lacks license,
 * sourceUrl, author, loudness (LUFS value or a measured-null) or true peak.
 */
const AUDIO_ID = "auroraCrashSfx";
const C25 = "release audio missing C-25 provenance fields";

function stageAudio(mutate: (asset: Record<string, unknown>) => void): string {
  const sourceManifest = readAssetManifest(process.cwd());
  const source = sourceManifest.assets.find((candidate) => candidate.id === AUDIO_ID);
  if (!source) throw new Error(`expected ${AUDIO_ID} in the repo manifest`);
  const projectDir = join(tmpdir(), `aura3d-c25-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(join(projectDir, dirname(source.outputPath)), { recursive: true });
  writeFileSync(join(projectDir, "package.json"), JSON.stringify({ type: "module" }));
  cpSync(join(process.cwd(), source.outputPath), join(projectDir, source.outputPath));
  const asset = JSON.parse(JSON.stringify(source)) as Record<string, unknown>;
  mutate(asset);
  writeFileSync(join(projectDir, "aura.assets.json"), `${JSON.stringify({ ...sourceManifest, assets: [asset] }, null, 2)}\n`);
  mkdirSync(join(projectDir, dirname(sourceManifest.typegen)), { recursive: true });
  writeFileSync(join(projectDir, sourceManifest.typegen), "export const assets = {} as const;\n");
  return projectDir;
}

function c25Failures(projectDir: string): string[] {
  return validateAssets({ projectDir, release: true }).failures.filter((failure) => failure.includes(C25));
}

describe("#165 release audio requires C-25 provenance fields", () => {
  it("fails a release audio entry with no loudness record", () => {
    const failures = c25Failures(stageAudio((asset) => { delete asset.audio; }));
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain(`${AUDIO_ID}: ${C25}: loudnessLufs, truePeakDb.`);
  });

  it("names a missing author", () => {
    const failures = c25Failures(stageAudio((asset) => {
      asset.audio = { loudnessLufs: -20, truePeakDb: -1 };
      const provenance = asset.provenance as Record<string, unknown>;
      delete provenance.author;
    }));
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain(": author.");
  });

  it("accepts a measured LUFS value plus true peak", () => {
    expect(c25Failures(stageAudio((asset) => { asset.audio = { loudnessLufs: -20, truePeakDb: -1 }; }))).toEqual([]);
  });

  it("accepts a measured-null LUFS (sub-400 ms blip) when true peak is present", () => {
    expect(c25Failures(stageAudio((asset) => { asset.audio = { loudnessMeasured: true, truePeakDb: -3 }; }))).toEqual([]);
  });

  it("still requires true peak when LUFS was measured-null", () => {
    const failures = c25Failures(stageAudio((asset) => { asset.audio = { loudnessMeasured: true }; }));
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain(": truePeakDb.");
  });
});
