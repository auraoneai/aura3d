/**
 * IRON CROWN GU47 IC47-AN2 (partial): the Crown crowd bobs, jumps harder for CROWD_CHEER.seconds after a K.O. (never
 * sinking below its seats) and holds still on reduced motion; the crowd nodes carry runtime ids.
 */
import { describe, expect, it } from "vitest";
import type { AuraSceneNode } from "@aura3d/engine";
import { CROWD_CHEER, CROWD_IDLE, CROWD_IDS, crowdBob } from "../../../apps/showcase-iron-crown/src/game/ambientMotion";
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
