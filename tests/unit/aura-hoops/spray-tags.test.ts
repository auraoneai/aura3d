import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SPRAY_TAG_MAX, SPRAY_TAG_SECONDS, SprayTags, sprayTagSpot } from "../../../apps/showcase-aura-hoops-3d/src/sprayTags";
import { COURT_IDS, COURT_RIGS } from "../../../apps/showcase-aura-hoops-3d/src/courtRigs";

const MAIN = readFileSync(path.resolve(__dirname, "../../../apps/showcase-aura-hoops-3d/src/main.ts"), "utf8");

function surface() {
  const stamps: { position: number[]; lifetime?: number; color?: string; stopped: boolean }[] = [];
  return {
    stamps,
    decal(at: { position: readonly number[] }, o: { lifetime?: number; color?: string }) {
      const rec = { position: [...at.position], lifetime: o.lifetime, color: o.color, stopped: false };
      stamps.push(rec);
      return { stop: () => { rec.stopped = true; } };
    }
  };
}

describe("Aura Hoops spray-tag signature (H47-V3)", () => {
  it("keeps at most 8 live tags over 20 jams and fades each over 20 s", () => {
    const s = surface();
    const tags = new SprayTags();
    for (let i = 0; i < 20; i++) tags.stamp(s, COURT_RIGS.rucker.sprayTag, [0, 3.05, -0.4], i * 0.5);
    expect(tags.liveCount).toBe(SPRAY_TAG_MAX);
    expect(s.stamps.filter((t) => !t.stopped)).toHaveLength(SPRAY_TAG_MAX);
    expect(s.stamps.every((t) => t.lifetime === SPRAY_TAG_SECONDS)).toBe(true);
    tags.prune(9.5 + SPRAY_TAG_SECONDS);
    expect(tags.liveCount).toBe(0);
  });

  it("stamps on the floor under the rim, on 8 distinct spots", () => {
    const spots = Array.from({ length: SPRAY_TAG_MAX }, (_, i) => sprayTagSpot(i, [0, 3.05, -0.4]));
    expect(new Set(spots.map((p) => p.join(","))).size).toBe(SPRAY_TAG_MAX);
    for (const p of spots) {
      expect(p[1]).toBeLessThan(0.05);
      expect(Math.hypot(p[0], p[2] - 1)).toBeLessThan(3);
    }
  });

  it("each court tags in its own colour, and only a Jam dunk stamps", () => {
    expect(new Set(COURT_IDS.map((id) => COURT_RIGS[id].sprayTag.color)).size).toBe(COURT_IDS.length);
    expect(MAIN.match(/sprayTags\.stamp\(/g)).toHaveLength(1);
    const at = MAIN.indexOf("sprayTags.stamp(");
    expect(MAIN.slice(at - 200, at)).toContain("if (jamDunkPending)");
  });
});
