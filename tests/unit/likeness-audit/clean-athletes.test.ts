import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

// Repainted athletes: flat region colours, no photographic face, lettering, crest or brand mark anywhere in the file.
const CLEAN: Record<string, string> = {
  diamondAthlete: "diamondAthleteClean",
  fcSoccerStrikerMeshy: "fcSoccerStrikerClean",
  fcGoalkeeperMeshy: "fcGoalkeeperClean",
  linksGolferAthleteMeshy: "linksGolferAthleteClean",
  rzQuarterbackMeshy: "rzQuarterbackClean",
  rzDefenderLinemanMeshy: "rzDefenderLinemanClean",
  hoopsAthleteBig: "hoopsAthleteBigClean",
  hoopsAthleteGuard: "hoopsAthleteGuardClean"
};
const ORIGINALS = [
  "diamondAthlete.4e29f649", "fcSoccerStrikerMeshy.a675e393", "fcGoalkeeperMeshy.156eb05c", "linksGolferAthleteMeshy.a39990ad",
  "rzQuarterbackMeshy.9368c81f", "rzDefenderLinemanMeshy.38e261b9", "hoopsAthleteBig.a11d61c5", "hoopsAthleteGuard.fbef844e"
];
const ASSET_FILES = [
  "src/aura-assets.ts",
  "apps/showcase-aura-fc-3d/src/aura-assets-v2.ts",
  "apps/showcase-red-zone-3d/src/aura-assets-v2.ts",
  "apps/showcase-aura-diamond-3d/src/aura-assets.route.ts",
  "apps/showcase-aura-hoops-3d/src/aura-assets.route.ts"
];

function entry(text: string, key: string): { url: string; hash: string; sizeBytes?: number } | undefined {
  const m = new RegExp(`^\\s*"?${key}"?: \\{`, "m").exec(text);
  if (!m) return undefined;
  const block = text.slice(m.index, m.index + 700);
  const size = /sizeBytes: (\d+)/.exec(block);
  return { url: /url: "([^"]+)"/.exec(block)![1]!, hash: /hash: "([^"]+)"/.exec(block)![1]!, sizeBytes: size ? Number(size[1]) : undefined };
}

describe("repainted athlete models", () => {
  for (const [key, stem] of Object.entries(CLEAN)) {
    it(`${key}: every manifest entry names the repainted file, with a matching hash and size`, () => {
      let seen = 0;
      for (const file of ASSET_FILES) {
        const e = entry(read(file), key);
        if (!e) continue;
        seen += 1;
        expect(e.url, `${file} ${key}`).toContain(`/aura-assets/${stem}.`);
        const buf = readFileSync(path.join(ROOT, "public", e.url));
        expect(`sha256-${createHash("sha256").update(buf).digest("hex")}`, `${file} ${key}`).toBe(e.hash);
        if (e.sizeBytes !== undefined) expect(buf.length, `${file} ${key}`).toBe(e.sizeBytes);
      }
      expect(seen).toBeGreaterThan(0);
      const manifest = JSON.parse(read("aura.assets.json")) as { assets: Array<{ id: string; url: string; hash: string; sizeBytes: number; outputPath: string }> };
      const m = manifest.assets.find((a) => a.id === key)!;
      expect(m.url).toContain(`/aura-assets/${stem}.`);
      expect(m.outputPath).toBe(`public${m.url}`);
      const buf = readFileSync(path.join(ROOT, "public", m.url));
      expect(`sha256-${createHash("sha256").update(buf).digest("hex")}`).toBe(m.hash);
      expect(buf.length).toBe(m.sizeBytes);
    });

    it(`${key}: no textures, flat material groups, same 15-joint rig and clip set`, () => {
      const e = entry(read("src/aura-assets.ts"), key)!;
      const buf = readFileSync(path.join(ROOT, "public", e.url));
      const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString("utf8"));
      expect(json.images ?? []).toHaveLength(0);
      expect(json.textures ?? []).toHaveLength(0);
      const prims = json.meshes[0].primitives as Array<{ attributes: Record<string, number>; material: number }>;
      expect(prims.length).toBeGreaterThanOrEqual(4);
      expect(prims.length).toBeLessThanOrEqual(5);
      for (const p of prims) { expect(p.attributes.JOINTS_0).toBeTypeOf("number"); expect(p.attributes.COLOR_0).toBeUndefined(); }
      expect(json.skins[0].joints).toHaveLength(15);
      const clips = (json.animations as Array<{ name: string }>).map((a) => a.name);
      expect(clips).toHaveLength(23);
      for (const needed of ["Idle", "Ready", "Run", "Jump"]) expect(clips).toContain(needed);
      const names = (json.materials as Array<{ name: string }>).map((x) => x.name);
      expect(names.some((n) => n.endsWith("-kit"))).toBe(true);
    });
  }

  it("no manifest still references an original (photographic face, lettering, brand mark) athlete file", () => {
    const all = [...ASSET_FILES, "aura.assets.json"].map(read).join("\n");
    for (const original of ORIGINALS) expect(all, original).not.toContain(original);
  });

  it("Aura FC tints only the kit material so skin, hair and boots keep their colours", () => {
    expect(read("apps/showcase-aura-fc-3d/src/game/rig.ts")).toMatch(/target: \/-kit\$\/, color: kit\.shirt/);
  });
});
