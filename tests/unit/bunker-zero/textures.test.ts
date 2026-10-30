import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BZ_FLOOR_TEXTURES, BZ_TEXTURE_BUDGET_BYTES, BZ_TEXTURE_FILES, BZ_TEXTURE_SETS, BZ_TEXTURE_SOURCES, bunkerTexture, textureMemoryBytes
} from "../../../apps/showcase-bunker-zero/src/art/textures";

const DIR = "apps/showcase-bunker-zero/public/aura-assets/textures";

describe("Bunker Zero surface textures (GU47 WP-21 BZ-04)", () => {
  it("ships every file with the recorded sha256 and size, tracked in git", () => {
    for (const [file, rec] of Object.entries(BZ_TEXTURE_FILES)) {
      const buf = readFileSync(path.join(DIR, file));
      expect(`sha256-${createHash("sha256").update(buf).digest("hex")}`, file).toBe(rec.sha256);
      expect(buf.length, file).toBe(rec.bytes);
      expect(execFileSync("git", ["ls-files", "--", path.join(DIR, file)], { encoding: "utf8" }).trim(), `${file} tracked`).not.toBe("");
    }
  });

  it("has a colour and a normal map for each of the nine sets, with library provenance", () => {
    expect(BZ_TEXTURE_SETS).toHaveLength(9);
    const attribution = readFileSync(path.join(DIR, "ATTRIBUTION.md"), "utf8");
    for (const set of BZ_TEXTURE_SETS) {
      const refs = bunkerTexture(set);
      for (const r of [refs.color, refs.normal]) expect(BZ_TEXTURE_FILES).toHaveProperty(path.basename((r as unknown as { url: string }).url));
      expect(attribution).toContain(BZ_TEXTURE_SOURCES[set].libraryZipSha256);
      const lib = readFileSync(`assets/library/textures/tiling/acg-${set}.zip`);
      expect(createHash("sha256").update(lib).digest("hex"), set).toBe(BZ_TEXTURE_SOURCES[set].libraryZipSha256);
    }
  });

  it("maps one wall set per floor slot, adjacent descent floors differ, and stays inside 64 MB", () => {
    expect(BZ_FLOOR_TEXTURES).toHaveLength(7);
    for (let i = 1; i < 6; i++) expect(BZ_FLOOR_TEXTURES[i]!.wall).not.toBe(BZ_FLOOR_TEXTURES[i - 1]!.wall);
    expect(textureMemoryBytes()).toBeLessThanOrEqual(BZ_TEXTURE_BUDGET_BYTES);
  });
});
