import { describe, expect, it } from "vitest";
import {
  DIAMOND_VFX_INSTANCE_CAP,
  DIAMOND_VFX_KINDS,
  diamondVfxPresets,
  isDiamondVfxKind,
  juiceFxKind,
  landingFxKind,
  registerDiamondVfx,
  vfxInstances,
  type DiamondVfxSpec
} from "../../../apps/showcase-aura-diamond-3d/art/vfx";
import { PARK_LOOKS } from "../../../apps/showcase-aura-diamond-3d/art/look";
import { FOUL_DEG, PARK_ORDER } from "../../../apps/showcase-aura-diamond-3d/src/rules";

const FULL = { reducedMotion: false, reducedFlash: false } as const;
const emitters = (spec: DiamondVfxSpec) => spec.layers.filter((l) => l.type === "emitter");

describe("aura-diamond VFX pack (DIA-V1)", () => {
  it("registers at least six presets, every one of them in every park", () => {
    for (const park of PARK_ORDER) {
      const calls: string[] = [];
      registerDiamondVfx({ registerPreset: (kind) => calls.push(kind) }, park, FULL);
      expect(calls.length).toBeGreaterThanOrEqual(6);
      expect(calls).toEqual([...DIAMOND_VFX_KINDS]);
    }
  });

  it("samples atlas sprites (chips, smoke, streaks, flare), never the soft disc", () => {
    for (const park of PARK_ORDER) {
      for (const spec of Object.values(diamondVfxPresets(park, FULL))) {
        for (const layer of emitters(spec)) {
          expect(typeof layer.sprite).toBe("string");
          expect(layer.sprite).not.toBe("soft-dot");
          expect(Number(layer.maxScreen)).toBeLessThanOrEqual(0.1);
        }
      }
    }
  });

  it("fits a full home-run beat (crack, landing, celebration) inside the 96-instance pool", () => {
    for (const park of PARK_ORDER) {
      const presets = diamondVfxPresets(park, FULL);
      const beat = vfxInstances(presets["diamond-bat-crack"]) + vfxInstances(presets[juiceFxKind("landing", park)]) + vfxInstances(presets[juiceFxKind("homer", park)]);
      expect(beat).toBeLessThanOrEqual(DIAMOND_VFX_INSTANCE_CAP);
      const all = Object.values(presets).reduce((n, spec) => n + vfxInstances(spec), 0);
      expect(all).toBeLessThanOrEqual(DIAMOND_VFX_INSTANCE_CAP);
    }
  });

  it("paints the signature splinter flash in each park's own colours, at one-sixth gravity on the Moon", () => {
    const splinterColors = new Set(PARK_ORDER.map((p) => emitters(diamondVfxPresets(p, FULL)["diamond-bat-crack"])[0]?.color));
    expect(splinterColors.size).toBe(PARK_ORDER.length);
    for (const p of PARK_ORDER) {
      const crack = diamondVfxPresets(p, FULL)["diamond-bat-crack"];
      expect(emitters(crack)[0]?.color).toBe(PARK_LOOKS[p].signature.splinter);
      expect(emitters(crack)[0]?.sprite).toBe("debris-chips");
    }
    const lunarGravity = Number(emitters(diamondVfxPresets("lunar", FULL)["diamond-bat-crack"])[0]?.gravity);
    const earthGravity = Number(emitters(diamondVfxPresets("sandlot", FULL)["diamond-bat-crack"])[0]?.gravity);
    expect(lunarGravity / earthGravity).toBeCloseTo(0.17, 2);
  });

  it("halves particle emission under reduced motion (PRD 6.3)", () => {
    for (const park of PARK_ORDER) {
      const full = diamondVfxPresets(park, FULL);
      const reduced = diamondVfxPresets(park, { reducedMotion: true, reducedFlash: false });
      for (const kind of DIAMOND_VFX_KINDS) {
        const a = emitters(full[kind]).reduce((n, l) => n + Number(l.count), 0);
        const b = emitters(reduced[kind]).reduce((n, l) => n + Number(l.count), 0);
        expect(b).toBeLessThanOrEqual(Math.ceil(a / 2) + emitters(full[kind]).length);
        expect(b).toBeGreaterThan(0);
      }
    }
  });

  it("drops the light flashes and caps the flash sprites at 0.3 under reduced flash (PRD 6.3)", () => {
    const full = diamondVfxPresets("skyline", FULL)["diamond-bat-crack"];
    const calm = diamondVfxPresets("skyline", { reducedMotion: false, reducedFlash: true })["diamond-bat-crack"];
    expect(full.layers.some((l) => l.type === "light")).toBe(true);
    for (const kind of DIAMOND_VFX_KINDS) {
      expect(diamondVfxPresets("skyline", { reducedMotion: false, reducedFlash: true })[kind].layers.some((l) => l.type === "light")).toBe(false);
    }
    const flashOf = (spec: DiamondVfxSpec) => Number(emitters(spec).find((l) => l.preset === "impact-flash")?.intensity);
    expect(flashOf(calm) / flashOf(full)).toBeCloseTo(0.3, 5);
  });

  it("maps the juice events and landings onto the pack", () => {
    expect(juiceFxKind("crack", "ivy")).toBe("diamond-bat-crack");
    expect(juiceFxKind("homer", "dome")).toBe("diamond-dome-confetti");
    expect(juiceFxKind("homer", "lunar")).toBe("diamond-regolith-arc");
    expect(juiceFxKind("homer", "sandlot")).toBe("diamond-hr-firework");
    expect(landingFxKind("canyon", 10, FOUL_DEG)).toBe("diamond-canyon-dust");
    expect(landingFxKind("sandlot", FOUL_DEG - 0.5, FOUL_DEG)).toBe("diamond-chalk-puff");
    expect(landingFxKind("lunar", -12, FOUL_DEG)).toBe("diamond-regolith-arc");
    expect(isDiamondVfxKind("diamond-clay-puff")).toBe(true);
    expect(isDiamondVfxKind("spark")).toBe(false);
  });
});
