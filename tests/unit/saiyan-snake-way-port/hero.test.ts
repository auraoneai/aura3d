import { describe, expect, it } from "vitest";
import { skyRunnerPartSculptedSpec } from "../../../examples/saiyan-snake-way-port/art/proceduralModels";
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

  it("keeps the feet near the road in the run cycle and scales the runner to heroic ~1.95 m height", () => {
    let lowest = Infinity;
    let highest = -Infinity;
    for (let k = 0; k < 64; k++) {
      const parts = poseHero({ ...base, phase: (k / 64) * Math.PI * 2 });
      for (const id of ["bootL", "bootR"]) lowest = Math.min(lowest, parts[id]!.p[1]);
      highest = Math.max(highest, parts.head!.p[1]);
      expect(parts.head!.p[1]).toBeGreaterThan(parts.pelvis!.p[1]);
    }
    expect(lowest).toBeGreaterThan(-0.2);
    expect(lowest).toBeLessThan(0.35);
    expect(highest).toBeGreaterThan(1.62);
    expect(highest).toBeLessThan(2.05);
  });

  it("alternates the legs and arms through the cycle", () => {
    const a = poseHero({ ...base, phase: Math.PI / 2 });
    const b = poseHero({ ...base, phase: -Math.PI / 2 });
    expect(a.bootL!.p[2]).toBeLessThan(a.bootR!.p[2]);
    expect(b.bootL!.p[2]).toBeGreaterThan(b.bootR!.p[2]);
    expect(a.handL!.p[2]).toBeGreaterThan(a.handR!.p[2]);
  });

  it("lays the body forward in flight and ducks cleanly under the 1.52 m arch in a slide", () => {
    const fly = poseHero({ ...base, flying: true });
    expect(fly.head!.p[2]).toBeLessThan(fly.pelvis!.p[2] - 0.65);
    const slide = poseHero({ ...base, sliding: true });
    expect(slide.head!.p[1]).toBeLessThan(poseHero(base).head!.p[1] - 0.55);
    expect(slide.head!.p[1]).toBeLessThan(1.25);
  });

  it("replaces disconnected sash slabs with continuous head-knotted ribbons and arched martial-arts boots", () => {
    const ids = new Set(HERO_PARTS.map((p) => p.id));
    expect(ids.has("sash0")).toBe(false);
    for (const id of ["headband", "ribbonL", "ribbonR", "collar", "beltTrim", "eyes", "bootTrimL", "bootTrimR", "wristL", "wristR", "cuffL", "cuffR"]) {
      expect(ids.has(id), id).toBe(true);
    }
    const posed = poseHero({ ...base, time: 0.4, speed: 48 });
    for (const rId of ["ribbonL", "ribbonR"] as const) {
      const d = Math.hypot(
        posed[rId]!.p[0] - posed.head!.p[0],
        posed[rId]!.p[1] - posed.head!.p[1],
        posed[rId]!.p[2] - posed.head!.p[2]
      );
      expect(d).toBeGreaterThan(0.14);
      expect(d).toBeLessThan(0.26);
      const spec = skyRunnerPartSculptedSpec(rId);
      let minZ = Infinity, maxZ = -Infinity;
      for (let i = 2; i < spec.positions.length; i += 3) {
        minZ = Math.min(minZ, spec.positions[i]!);
        maxZ = Math.max(maxZ, spec.positions[i]!);
      }
      expect(Math.abs(minZ)).toBeLessThan(0.02);
      expect(maxZ).toBeGreaterThan(0.6);
    }
    const bootSpec = skyRunnerPartSculptedSpec("bootR");
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < bootSpec.positions.length; i += 3) {
      minX = Math.min(minX, bootSpec.positions[i]!);
      maxX = Math.max(maxX, bootSpec.positions[i]!);
      minZ = Math.min(minZ, bootSpec.positions[i + 2]!);
      maxZ = Math.max(maxZ, bootSpec.positions[i + 2]!);
    }
    expect(maxX - minX).toBeLessThan(0.16);
    expect(maxZ - minZ).toBeGreaterThan(0.25);
    expect(maxZ - minZ).toBeLessThan(0.35);
  });
});
