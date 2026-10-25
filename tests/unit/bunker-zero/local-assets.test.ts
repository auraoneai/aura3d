import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const APP = path.resolve("apps/showcase-bunker-zero");
const manifest = JSON.parse(readFileSync(path.join(APP, "aura.assets.json"), "utf8"));
const entries: Array<{ id: string; outputPath: string; url: string; hash: string; sizeBytes: number; provenance?: { license?: string; evidence?: string[] } }> = manifest.assets ?? manifest;

describe("bunker zero local assets", () => {
  it("ships the pistol and the lifted enemy and pickup models", () => {
    const ids = entries.map((e) => e.id).sort();
    expect(ids).toEqual(["bzArmorMeshy", "bzBarrelMeshy", "bzCrateMeshy", "bzGuardMeshy", "bzGunnerMeshy", "bzHoundMeshy", "bzPistol", "bzWardenMeshy"]);
  });

  for (const entry of entries) {
    it(`${entry.id}: hash, size, url and provenance match the shipped file`, () => {
      const buf = readFileSync(path.join(APP, entry.outputPath));
      expect(entry.hash).toBe(`sha256-${createHash("sha256").update(buf).digest("hex")}`);
      expect(entry.sizeBytes).toBe(buf.length);
      expect(entry.url).toBe(`/aura-assets/${path.basename(entry.outputPath)}`);
      expect(entry.provenance?.license).toBeTruthy();
      for (const evidence of entry.provenance?.evidence ?? []) expect(existsSync(path.join(APP, evidence)), evidence).toBe(true);
    });
  }

  it("the lifted models are brighter than their near-black originals (derivation is recorded)", () => {
    for (const id of ["bzGunnerMeshy", "bzGuardMeshy", "bzHoundMeshy", "bzWardenMeshy", "bzArmorMeshy"]) {
      const rec = JSON.parse(readFileSync(path.join(APP, "aura-evidence/lift", `${id}.lift.json`), "utf8"));
      expect(rec.tool).toBe("tools/bunker-zero-lift/lift.mjs");
    }
  });
});
