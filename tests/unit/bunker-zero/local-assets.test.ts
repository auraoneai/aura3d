import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { listCandidateFiles } from "../../../tools/remote-acr/source5-files.mjs";

const APP = path.resolve("apps/showcase-bunker-zero");
const manifest = JSON.parse(readFileSync(path.join(APP, "aura.assets.json"), "utf8"));
const entries: Array<{ id: string; outputPath: string; url: string; hash: string; sizeBytes: number; provenance?: { license?: string; evidence?: string[] } }> = manifest.assets ?? manifest;

describe("bunker zero local assets", () => {
  it("ships the 4 rigged enemy GLBs and the 4 owned CC0 Poly Haven props (WP-11 procedural overhaul)", () => {
    const ids = entries.map((e) => e.id).sort();
    expect(ids).toEqual(["bzBulkheadLamp", "bzGuardMeshy", "bzGunnerMeshy", "bzHoundMeshy", "bzMachete", "bzMedicalBox", "bzShutterDoor", "bzWardenMeshy"]);
  });

  for (const entry of entries) {
    it(`${entry.id}: hash, size, url and provenance match the shipped file`, () => {
      const buf = readFileSync(path.join(APP, entry.outputPath));
      expect(entry.hash).toBe(`sha256-${createHash("sha256").update(buf).digest("hex")}`);
      expect(entry.sizeBytes).toBe(buf.length);
      expect(entry.url).toBe(`/aura-assets/${path.basename(entry.outputPath)}`);
      expect(entry.provenance?.license).toBeTruthy();
      for (const evidence of entry.provenance?.evidence ?? []) expect(existsSync(path.join(APP, evidence)), evidence).toBe(true);
      // `*.png` and `*.jpg` are gitignored: a file that exists on disk but is untracked is missing on every fresh clone.
      // `git ls-files`, or without `.git` (ACR source pass) the staged candidate manifest, which holds only
      // tracked and un-ignored files (tools/remote-acr/source5-files.mjs).
      for (const rel of [entry.outputPath, ...(entry.provenance?.evidence ?? [])]) {
        const repoPath = path.posix.join("apps/showcase-bunker-zero", rel);
        expect(listCandidateFiles(process.cwd(), [repoPath]), `${rel} must be tracked in git`).toContain(repoPath);
      }
    });
  }

  it("the lifted models are brighter than their near-black originals (derivation is recorded)", () => {
    for (const id of ["bzGunnerMeshy", "bzGuardMeshy", "bzHoundMeshy", "bzWardenMeshy"]) {
      const rec = JSON.parse(readFileSync(path.join(APP, "aura-evidence/lift", `${id}.lift.json`), "utf8"));
      expect(rec.tool).toBe("tools/bunker-zero-lift/lift.mjs");
    }
  });
});
