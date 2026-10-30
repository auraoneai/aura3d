import { describe, expect, it } from "vitest";
import type { AuraVfxEffectSpec } from "@aura3d/engine";
import { dustMotesOptions, registerVfxPack, VFX_KINDS, VFX_LIVE_CAP, vfxPack, worstCaseLive } from "../../../apps/showcase-dot-dash-3d/src/game/vfx";

const prefSets = [
  { reducedMotion: false, reducedFlash: false },
  { reducedMotion: true, reducedFlash: false },
  { reducedMotion: false, reducedFlash: true },
  { reducedMotion: true, reducedFlash: true }
];

const particles = (spec: AuraVfxEffectSpec): number =>
  spec.layers.reduce((n, l) => n + (l.type === "emitter" && typeof l.count === "number" ? l.count : 0), 0);

/** DD47-V1 preset pack: solder-spark, surge-ring, short-circuit, blown-fuse. */
describe("dot-dash-3d VFX pack", () => {
  it("registers all four presets under their kind names", () => {
    const seen: string[] = [];
    expect(registerVfxPack({ registerPreset: (kind) => { seen.push(kind); } }, prefSets[0]!)).toBe(true);
    expect(seen.sort()).toEqual(Object.values(VFX_KINDS).sort());
    expect(registerVfxPack(null, prefSets[0]!)).toBe(false);
  });

  it("keeps the worst overlap at or under 60 live particles on every setting", () => {
    for (const prefs of prefSets) expect(worstCaseLive(prefs)).toBeLessThanOrEqual(VFX_LIVE_CAP);
  });

  it("halves particle counts on reduced motion", () => {
    const full = vfxPack(prefSets[0]!), calm = vfxPack(prefSets[1]!);
    for (const kind of Object.values(VFX_KINDS)) {
      expect(particles(calm[kind])).toBeLessThanOrEqual(Math.ceil(particles(full[kind]) / 2) + 1);
    }
    expect(dustMotesOptions({ reducedMotion: true }).maxParticles).toBe(30);
  });

  it("never flickers on reduced flash: one light layer per preset, at most 30% of the full flash, 0.2 s or less", () => {
    const full = vfxPack(prefSets[0]!), soft = vfxPack(prefSets[2]!);
    for (const kind of Object.values(VFX_KINDS)) {
      const lights = soft[kind].layers.filter((l) => l.type === "light");
      expect(lights).toHaveLength(1);
      const fullPeak = Math.max(...full[kind].layers.filter((l) => l.type === "light").map((l) => Number(l.intensity)));
      expect(Number(lights[0]!.intensity)).toBeLessThanOrEqual(fullPeak * 0.3 + 1e-9);
      expect(Number(lights[0]!.duration)).toBeLessThanOrEqual(0.2);
    }
  });
});
