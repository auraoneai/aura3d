import { describe, expect, it } from "vitest";
import { HERO_PARTS, poseHero, type HeroInput } from "../../../examples/saiyan-snake-way-port/hero";

const base: HeroInput = { phase: 0, time: 0, grounded: true, vy: 0, sliding: false, flying: false, diving: false, lean: 0, surge: 0, stumble: 0, speed: 32 };
const STATES: readonly (readonly [string, Partial<HeroInput>])[] = [
  ["run", {}],
  ["jump rising", { grounded: false, vy: 12 }],
  ["jump falling", { grounded: false, vy: -12 }],
  ["slide", { sliding: true }],
  ["flight", { flying: true }],
  ["dive", { flying: true, diving: true }],
  ["surge", { surge: 1 }],
  ["stumble", { stumble: 1 }]
];

describe("hero rig", () => {
  it("poses every part the scene creates, with finite numbers, in every state", () => {
    for (const [name, patch] of STATES) {
      for (let k = 0; k < 16; k++) {
        const parts = poseHero({ ...base, ...patch, phase: (k / 16) * Math.PI * 2, time: k * 0.1 });
        for (const spec of HERO_PARTS) {
          const part = parts[spec.id];
          expect(part, `${name}: missing ${spec.id}`).toBeDefined();
          expect([...part!.p, ...part!.m].every(Number.isFinite), `${name}: ${spec.id} is not finite`).toBe(true);
        }
      }
    }
  });

  it("keeps the feet near the road in the run cycle and the head above the hips", () => {
    let lowest = Infinity;
    let highest = -Infinity;
    for (let k = 0; k < 64; k++) {
      const parts = poseHero({ ...base, phase: (k / 64) * Math.PI * 2 });
      for (const id of ["bootL", "bootR"]) lowest = Math.min(lowest, parts[id]!.p[1]);
      highest = Math.max(highest, parts.head!.p[1]);
      expect(parts.head!.p[1]).toBeGreaterThan(parts.pelvis!.p[1]);
    }
    expect(lowest).toBeGreaterThan(-0.35);
    expect(lowest).toBeLessThan(0.5);
    expect(highest).toBeGreaterThan(2.6);
  });

  it("alternates the legs and arms through the cycle", () => {
    const a = poseHero({ ...base, phase: Math.PI / 2 });
    const b = poseHero({ ...base, phase: -Math.PI / 2 });
    expect(a.bootL!.p[2]).toBeLessThan(a.bootR!.p[2]);
    expect(b.bootL!.p[2]).toBeGreaterThan(b.bootR!.p[2]);
    expect(a.handL!.p[2]).toBeGreaterThan(a.handR!.p[2]);
  });

  it("lays the body forward in flight and low in a slide", () => {
    const fly = poseHero({ ...base, flying: true });
    expect(fly.head!.p[2]).toBeLessThan(fly.pelvis!.p[2] - 1);
    const slide = poseHero({ ...base, sliding: true });
    expect(slide.head!.p[1]).toBeLessThan(poseHero(base).head!.p[1] - 0.7);
  });
});
