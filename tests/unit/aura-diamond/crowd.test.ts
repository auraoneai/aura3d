import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FAN_MODEL, FAN_SKIN, FANS_PER_BENCH, fanColors, fanModelYaw, fanSeats, fanTint } from "../../../apps/showcase-aura-diamond-3d/art/crowd";
import { PARK_LOOKS } from "../../../apps/showcase-aura-diamond-3d/art/look";
import { buildStandsNodes, DEFAULT_SCENE_CONTEXT } from "../../../apps/showcase-aura-diamond-3d/src/scene";
import { fenceRadius, PARKS, PARK_ORDER } from "../../../apps/showcase-aura-diamond-3d/src/rules";

const ROOT = join(__dirname, "../../..");

function hoopsHexes(): Set<string> {
  const out = new Set<string>();
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === "public") continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else for (const m of readFileSync(full, "utf8").match(/#[0-9a-fA-F]{6}\b/g) ?? []) out.add(m.toLowerCase());
    }
  };
  walk(join(ROOT, "apps/showcase-aura-hoops-3d"));
  return out;
}

describe("aura-diamond stands crowd (DIA-A2)", () => {
  it("seats 588 fans on the 21 benches (half on Low), every one behind its park's fence", () => {
    for (const park of PARK_ORDER) {
      const seats = fanSeats(PARKS[park], "high");
      expect(seats).toHaveLength(7 * 3 * FANS_PER_BENCH);
      expect(fanSeats(PARKS[park], "low")).toHaveLength((7 * 3 * FANS_PER_BENCH) / 2);
      for (const s of seats) {
        const [x, y, z] = s.position;
        const theta = (Math.atan2(x, -z) * 180) / Math.PI;
        // Behind the 0.5 m wall with clearance; bench ends sit closer to the wall where the fence curves out (C3 rule).
        expect(Math.hypot(x, z)).toBeGreaterThan(fenceRadius(PARKS[park], theta) + 1);
        expect(y).toBeGreaterThan(1);
      }
    }
  });

  it("dresses the sections in the park's crowd palette, the same way every time", () => {
    for (const park of PARK_ORDER) {
      const seats = fanSeats(PARKS[park], "high");
      const a = fanColors(PARKS[park], seats);
      expect(fanColors(PARKS[park], seats)).toEqual(a);
      const palette = new Set(PARK_LOOKS[park].crowd);
      expect(a.shirts.every((c) => palette.has(c))).toBe(true);
      expect(new Set(a.shirts).size).toBeGreaterThanOrEqual(5);
      const own = seats.filter((s, i) => a.shirts[i] === PARK_LOOKS[park].crowd[s.section]).length / seats.length;
      expect(own).toBeGreaterThan(0.5);
      expect(a.skin.every((c) => (FAN_SKIN as readonly string[]).includes(c))).toBe(true);
    }
  });

  it("uses no Hoops hex for the fans", () => {
    const hoops = hoopsHexes();
    expect(FAN_SKIN.filter((h) => hoops.has(h))).toEqual([]);
  });

  it("draws the fans as two instanced draws of the WP-36 seated fans and keeps the 18 wavers", () => {
    const nodes = (buildStandsNodes(PARKS.ivy, DEFAULT_SCENE_CONTEXT) as { toJSON(): { name?: string; asset?: { key?: string }; instances?: unknown; transforms?: readonly unknown[] } }[]).map((n) => n.toJSON());
    const fans = nodes.filter((n) => n.name === "stand-fans" || n.name === "stand-fan-heads");
    expect(fans).toHaveLength(1);
    expect(JSON.stringify(fans[0])).toContain("ballpark_fanA");
    const fansB = nodes.filter((n) => n.name === "stand-fans-b");
    expect(fansB).toHaveLength(1);
    expect(JSON.stringify(fansB[0])).toContain("ballpark_fanB");
    expect(((fans[0]!.instances as unknown[]).length) + ((fansB[0]!.instances as unknown[]).length)).toBe(7 * 3 * FANS_PER_BENCH);
    expect(nodes.filter((n) => /^waver-\d+$/.test(String(n.name)))).toHaveLength(18);
    const original = (buildStandsNodes(PARKS.ivy, { ...DEFAULT_SCENE_CONTEXT, variant: "original" }) as { toJSON(): { name?: string } }[]).map((n) => n.toJSON());
    expect(original.some((n) => n.name === "stand-fans")).toBe(false);
  });

  it("turns each fan to face home plate and tints the cream kit towards the section colour", () => {
    // The mesh faces +z; a bench at angle theta has yaw theta + pi and its fan turns by -theta.
    for (const theta of [-0.66, 0, 0.4]) {
      const yaw = fanModelYaw(theta + Math.PI);
      const seat = [Math.sin(theta), -Math.cos(theta)];
      const forward = [Math.sin(yaw), Math.cos(yaw)];
      expect(forward[0]! * -seat[0]! + forward[1]! * -seat[1]!).toBeCloseTo(1, 6);
    }
    expect(fanTint("#000000", 1)).toBe("#000000");
    expect(fanTint("#000000", 0)).toBe("#ffffff");
    expect(FAN_MODEL.height).toBeLessThan(1.5);
  });
});
