import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

// Circuits, the formula car and two Meshy rooftop models whose textures carried real marks, replaced by cleaned files. Teleoperator vehicles (replaced by original generic models) and the rooftop and sports athletes (flat or softened faces) are covered by teleop-vehicles, teleop-robotaxi-flat, photo-textures and clean-athletes.
const CLEAN: Record<string, string> = {
  showcaseCcByFormulaOpponent: "showcaseCcByFormulaOpponentClean",
  showcaseTsukubaCircuit: "showcaseTsukubaCircuitClean",
  turboTsukubaVisualTrack: "turboTsukubaVisualTrackClean",
  rooftopDefenderMeshy: "rooftopDefenderMeshyClean",
  rooftopShooterMeshyV1: "rooftopShooterMeshyV1Clean"
};
const REMOVED = [
  "teleopWaymoHero.6d2a9bfb", "teleopWaymoTraffic.f476abe7", "teleopCorvette.e7009c34", "teleopCybercab.08358a58",
  "showcaseCcByFormulaOpponent.5dba5c01", "showcaseTsukubaCircuit.8c139a57", "turboTsukubaVisualTrack.ab53a493",
  "rooftopAthleteDefender.c0947539", "rooftopAthleteShooter.49b62313", "rooftopShooter.49b62313", "rooftopDefender.6c43f9e1",
  "rooftopDefender.c0947539", "rooftopLayupScorer.03a093f2", "rooftopLayupScorer.6201dc87", "rooftopShooter.fd853001",
  "rooftopDefenderMeshy.c53681c7", "rooftopShooterMeshyV1.ed5a33b3"
];
const TS_MANIFESTS = [
  "src/aura-assets.ts",
  "apps/showcase-aura-fc-3d/src/aura-assets-v2.ts",
  "apps/showcase-teleoperator/src/main.ts"
];

function entry(text: string, key: string): { url: string; hash: string; sizeBytes?: number } | undefined {
  const m = new RegExp(`^\\s*"?${key}"?: \\{`, "m").exec(text);
  if (!m) return undefined;
  const block = text.slice(m.index, m.index + 700);
  const size = /sizeBytes: (\d+)/.exec(block);
  return { url: /url: "([^"]+)"/.exec(block)![1]!, hash: /hash: "([^"]+)"/.exec(block)![1]!, sizeBytes: size ? Number(size[1]) : undefined };
}

describe("brand-cleaned vehicle, circuit and rooftop assets", () => {
  for (const [key, stem] of Object.entries(CLEAN)) {
    it(`${key}: every manifest entry names the cleaned file, with a matching hash and size`, () => {
      let seen = 0;
      for (const file of TS_MANIFESTS) {
        const e = entry(read(file), key);
        if (!e) continue;
        seen += 1;
        expect(e.url, `${file} ${key}`).toContain(`/aura-assets/${stem}.`);
        const buf = readFileSync(path.join(ROOT, "public", e.url));
        expect(`sha256-${createHash("sha256").update(buf).digest("hex")}`, `${file} ${key}`).toBe(e.hash);
        if (e.sizeBytes !== undefined) expect(buf.length, `${file} ${key}`).toBe(e.sizeBytes);
      }
      expect(seen).toBeGreaterThan(0);
      const manifest = JSON.parse(read("aura.assets.json")) as { assets: Array<{ id: string; url: string; hash?: string; sha256?: string; sizeBytes: number; outputPath?: string }> };
      const m = manifest.assets.find((a) => a.id === key)!;
      expect(m.url).toContain(`/aura-assets/${stem}.`);
      if (m.outputPath !== undefined) expect(m.outputPath).toBe(`public${m.url}`);
      const buf = readFileSync(path.join(ROOT, "public", m.url));
      expect(`sha256-${createHash("sha256").update(buf).digest("hex")}`).toBe(m.hash ?? `sha256-${m.sha256}`);
      expect(buf.length).toBe(m.sizeBytes);
    });
  }

  it("the original files with real marks or photographic faces are no longer served and no manifest names them", () => {
    for (const original of REMOVED) expect(existsSync(path.join(ROOT, "public/aura-assets", `${original}.glb`)), original).toBe(false);
    const all = [...TS_MANIFESTS, "aura.assets.json"].map(read).join("\n");
    for (const original of REMOVED) {
      const stale = new RegExp(`(url|"url"|outputPath|"outputPath"): "[^"]*${original.replace(".", "\\.")}\\.glb"`);
      expect(all, original).not.toMatch(stale);
    }
  });

  it("every cleaned file is a valid GLB with the same material count as a model that loads", () => {
    for (const stem of new Set(Object.values(CLEAN))) {
      const e = entry(read("src/aura-assets.ts"), Object.keys(CLEAN).find((k) => CLEAN[k] === stem)!)!;
      const buf = readFileSync(path.join(ROOT, "public", e.url));
      expect(buf.subarray(0, 4).toString("ascii")).toBe("glTF");
      const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString("utf8"));
      expect((json.materials ?? []).length, stem).toBeGreaterThan(0);
    }
  });
});
