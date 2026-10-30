/**
 * IRON CROWN GU47 IC47-AN2 (partial): the Crown crowd bobs, jumps harder for CROWD_CHEER.seconds after a K.O. (never
 * sinking below its seats) and holds still on reduced motion; the crowd nodes carry runtime ids.
 */
import { describe, expect, it } from "vitest";
import type { AuraSceneNode } from "@aura3d/engine";
import {
  CROWD_CHEER,
  CROWD_IDLE,
  CROWD_IDS,
  crowdBob,
  PRAYER_FLAG_COLORS,
  prayerFlagNodes,
  signFlicker
} from "../../../apps/showcase-iron-crown/src/game/ambientMotion";
import { panelLightId, stageLightNodes, STAGE_LOOKS } from "../../../apps/showcase-iron-crown/src/game/look";
import { STAGE_MAP } from "../../../apps/showcase-iron-crown/src/game/stages";

const sample = (koAge: (t: number) => number, seconds = 2) => {
  const out: number[] = [];
  for (let t = 0; t < seconds; t += 1 / 60) out.push(crowdBob(t, koAge(t), false));
  return out;
};
const std = (xs: number[]) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
};

describe("iron-crown crowd bob (GU47 IC47-AN2)", () => {
  it("bobs within its idle amplitude and never below the seats", () => {
    const idle = sample(() => Infinity);
    expect(Math.min(...idle)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...idle)).toBeLessThanOrEqual(CROWD_IDLE.amplitude + 1e-9);
  });

  it("jumps harder after a K.O. (stddev up well over 10% within 0.5 s) and settles", () => {
    const idle = std(sample(() => Infinity, 0.5));
    const cheer = std(sample((t) => t, 0.5));
    expect(cheer).toBeGreaterThan(idle * 1.1);
    expect(Math.min(...sample((t) => t))).toBeGreaterThanOrEqual(0);
    expect(crowdBob(1, CROWD_CHEER.seconds + 1, false)).toBeLessThanOrEqual(CROWD_IDLE.amplitude);
  });

  it("holds still on reduced motion", () => {
    expect(crowdBob(0.3, 0.1, true)).toBe(0);
  });

  it("gives the Crown crowd nodes runtime ids", () => {
    const nodes = STAGE_MAP.get("crown-arena")!.dressing as (AuraSceneNode & { runtime?: { id?: string } })[];
    const ids = nodes.map((n) => n.runtime?.id);
    expect(ids).toContain(CROWD_IDS.bodies);
    expect(ids).toContain(CROWD_IDS.heads);
  });
});

describe("IRON CROWN neon stutter (IC47-AN2)", () => {
  it("dips at most twice per cycle, under 3 dips a second, and holds steady when reduced", () => {
    for (const index of [0, 1]) {
      let dips = 0;
      let last = 1;
      for (let t = 0; t < 10; t += 1 / 120) {
        const g = signFlicker(t, index, false);
        expect(g).toBeGreaterThan(0.3);
        expect(g).toBeLessThanOrEqual(1);
        if (g < 1 && last === 1) dips += 1;
        last = g;
        expect(signFlicker(t, index, true)).toBe(1);
      }
      expect(dips).toBeGreaterThanOrEqual(2);
      expect(dips / 10).toBeLessThan(3);
    }
  });

  it("gives Neo-Tokyo's rect panels runtime ids", () => {
    const row = STAGE_LOOKS["neo-tokyo-rooftop"];
    const nodes = stageLightNodes(row, { p1: "#ffffff", p2: "#ffffff" }, { p1: -2, p2: 2 }) as (AuraSceneNode & { runtime?: { id?: string } })[];
    const ids = nodes.map((n) => n.runtime?.id);
    row.panels.forEach((_, i) => expect(ids).toContain(panelLightId(i)));
  });
});

describe("IRON CROWN prayer flags (IC47-AN2)", () => {
  it("only on the Monastery: three draws, five lungta colours, wind off on reduced motion", () => {
    expect(prayerFlagNodes("crown-arena", false)).toEqual([]);
    const nodes = prayerFlagNodes("himalayan-monastery", false) as (AuraSceneNode & Record<string, unknown>)[];
    expect(nodes).toHaveLength(3);
    const flags = nodes[0]!;
    expect(JSON.stringify(flags)).toContain("wind");
    for (const color of PRAYER_FLAG_COLORS) expect(JSON.stringify(flags)).toContain(color);
    const still = prayerFlagNodes("himalayan-monastery", true)[0] as AuraSceneNode & Record<string, unknown>;
    expect(still.instanceWind ?? null).toBeNull();
    expect(flags.instanceWind).toBeTruthy();
  });
});
