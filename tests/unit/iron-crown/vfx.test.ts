/**
 * IRON CROWN runtime VFX pack (GU47 WP-15; PRD §3.2 item 3; IC47-V1, V2, V3) and its comfort paths (PRD §6.3 reduced
 * motion and reduced flash, §6.4 Low tier). Pure tables plus the installer, checked against a fake effects surface.
 */
import { describe, expect, it } from "vitest";
import { AURA_VFX_GENRE_VARIANTS, type AuraVfxEffectSpec } from "@aura3d/engine";
import {
  GUARD_EMBER,
  installIronCrownVfx,
  IRON_CROWN_VFX_KINDS,
  ironCrownVfxPresets,
  presetLifeSeconds,
  presetParticles,
  vfxCountScale,
  type IronCrownVfxKind
} from "../../../apps/showcase-iron-crown/src/game/vfx";
import { weatherParticlesFor, stageLook } from "../../../apps/showcase-iron-crown/src/game/look";
import { STAGES } from "../../../apps/showcase-iron-crown/src/game/stages";

const FULL = { reducedMotion: false, reducedFlash: false, lowTier: false } as const;
const COMBAT: readonly IronCrownVfxKind[] = ["ic-forge-spark", "ic-guard-ember", "ic-special-burst", "ic-ko-shower"];

function hueDeg(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

function fakeEffects() {
  const registered = new Map<string, AuraVfxEffectSpec>();
  return {
    registered,
    runtime: "off" as "on" | "off",
    registerPreset(kind: string, spec: AuraVfxEffectSpec) {
      registered.set(kind, spec);
    }
  };
}

describe("iron-crown VFX pack (GU47 WP-15)", () => {
  it("IC47-V1: ships the four combat presets the WP names, plus the ambient and win presets (IC47-V2)", () => {
    expect([...IRON_CROWN_VFX_KINDS].sort()).toEqual([
      "ic-dust-devil",
      "ic-forge-embers",
      "ic-forge-spark",
      "ic-guard-ember",
      "ic-ko-shower",
      "ic-lantern-motes",
      "ic-special-burst",
      "ic-win-confetti"
    ]);
    const presets = ironCrownVfxPresets(FULL);
    for (const kind of IRON_CROWN_VFX_KINDS) {
      expect(presets[kind].name).toBe(kind);
      for (const layer of presets[kind].layers) {
        // Every emitter preset is a shipped genre variant or core kind the engine knows.
        if (layer.type === "emitter" && typeof layer.preset === "string" && layer.preset.includes("-") && !["impact-flash", "aura-burst"].includes(layer.preset)) {
          expect(AURA_VFX_GENRE_VARIANTS as readonly string[], `${kind}:${layer.preset}`).toContain(layer.preset);
        }
      }
    }
  });

  it("IC47-V1: combat presets die out within 1.2 s (liveCount 0 after the last hit); blocks spark in the 180-210 deg hue band", () => {
    const presets = ironCrownVfxPresets(FULL);
    for (const kind of COMBAT) expect(presetLifeSeconds(presets[kind]), kind).toBeLessThanOrEqual(1.2);
    const hue = hueDeg(GUARD_EMBER);
    expect(hue).toBeGreaterThanOrEqual(180);
    expect(hue).toBeLessThanOrEqual(210);
    for (const layer of presets["ic-guard-ember"].layers) {
      if (layer.type === "emitter" && typeof layer.color === "string") expect(hueDeg(layer.color)).toBeGreaterThanOrEqual(180);
    }
    // The hit spark is amber and hot (the hit crop's amber hot pixels).
    const spark = presets["ic-forge-spark"].layers.find((layer) => layer.type === "emitter" && layer.preset === "spark-fire");
    expect(spark?.additive).toBe(true);
    expect(hueDeg(String(spark?.color))).toBeGreaterThanOrEqual(25);
    expect(hueDeg(String(spark?.color))).toBeLessThanOrEqual(45);
  });

  it("PRD §6.3 reduced motion: every emitter count halves", () => {
    const full = ironCrownVfxPresets(FULL);
    const reduced = ironCrownVfxPresets({ ...FULL, reducedMotion: true });
    expect(vfxCountScale({ ...FULL, reducedMotion: true })).toBe(0.5);
    for (const kind of IRON_CROWN_VFX_KINDS) {
      expect(presetParticles(reduced[kind]), kind).toBeLessThanOrEqual(Math.ceil(presetParticles(full[kind]) / 2) + reduced[kind].layers.length);
    }
  });

  it("PRD §6.3 reduced flash: light layers and impact flashes are dropped", () => {
    const reduced = ironCrownVfxPresets({ ...FULL, reducedFlash: true });
    for (const kind of IRON_CROWN_VFX_KINDS) {
      expect(reduced[kind].layers.some((layer) => layer.type === "light"), kind).toBe(false);
      expect(reduced[kind].layers.some((layer) => layer.preset === "impact-flash" || layer.preset === "super-flash"), kind).toBe(false);
    }
    // Full comfort keeps them.
    expect(ironCrownVfxPresets(FULL)["ic-forge-spark"].layers.some((layer) => layer.type === "light")).toBe(true);
  });

  it("PRD §6.4 Low tier: counts halve again (a quarter with reduced motion)", () => {
    expect(vfxCountScale({ ...FULL, lowTier: true })).toBe(0.5);
    expect(vfxCountScale({ reducedMotion: true, reducedFlash: true, lowTier: true })).toBe(0.25);
  });

  it("stays inside the 2,000-particle budget: all presets at once plus the heaviest weather volume", () => {
    const all = Object.values(ironCrownVfxPresets(FULL)).reduce((sum, spec) => sum + presetParticles(spec), 0);
    const weather = Math.max(...STAGES.map((stage) => weatherParticlesFor(stageLook(stage.id), false)));
    expect(all + weather).toBeLessThanOrEqual(2000);
  });

  it("IC47-V1: the installer registers the pack and turns runtime VFX back on (?vfx=off keeps them off)", () => {
    const on = fakeEffects();
    expect(installIronCrownVfx(on, FULL, null)).toBe(true);
    expect(on.runtime).toBe("on");
    expect([...on.registered.keys()].sort()).toEqual([...IRON_CROWN_VFX_KINDS].sort());
    const off = fakeEffects();
    expect(installIronCrownVfx(off, FULL, "off")).toBe(false);
    expect(off.runtime).toBe("off");
    expect(installIronCrownVfx(undefined, FULL, null)).toBe(false);
  });
});
