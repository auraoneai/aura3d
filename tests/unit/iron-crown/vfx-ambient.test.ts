/**
 * IRON CROWN GU47 IC47-V2: ambient embers (Crown), lantern motes (Dock) and dust gusts (Colosseum) on a fixed cadence,
 * slower on reduced motion, no backlog after a hitch, inside the 2,000-particle budget with the worst combat case.
 */
import { describe, expect, it } from "vitest";
import {
  ambientLiveParticles,
  AMBIENT_EMITTERS,
  createAmbientVfx,
  IRON_CROWN_VFX_KINDS,
  ironCrownVfxPresets,
  presetParticles
} from "../../../apps/showcase-iron-crown/src/game/vfx";
import { STAGES } from "../../../apps/showcase-iron-crown/src/game/stages";

const full = { reducedMotion: false, reducedFlash: false, lowTier: false };

function count(stage: keyof typeof AMBIENT_EMITTERS, seconds: number, reducedMotion: boolean) {
  const fired: string[] = [];
  const clock = createAmbientVfx(AMBIENT_EMITTERS[stage], { reducedMotion });
  for (let t = 0; t < seconds; t += 1 / 60) clock.step(1 / 60, (kind) => fired.push(kind));
  return fired;
}

describe("iron-crown ambient VFX (GU47 IC47-V2)", () => {
  it("covers every venue and uses only pack kinds", () => {
    for (const stage of STAGES) {
      for (const e of AMBIENT_EMITTERS[stage.id]) expect(IRON_CROWN_VFX_KINDS).toContain(e.kind);
    }
    expect(AMBIENT_EMITTERS["crown-arena"].map((e) => e.kind)).toEqual(["ic-forge-embers"]);
    expect(AMBIENT_EMITTERS["bangkok-dock"].map((e) => e.kind)).toEqual(["ic-lantern-motes"]);
    expect(AMBIENT_EMITTERS["colosseum-ruins"].map((e) => e.kind)).toEqual(["ic-dust-devil"]);
  });

  it("fires on its cadence and halves it on reduced motion", () => {
    const normal = count("crown-arena", 11, false).length;
    const reduced = count("crown-arena", 11, true).length;
    expect(normal).toBeGreaterThanOrEqual(19);
    expect(normal).toBeLessThanOrEqual(20);
    expect(reduced).toBeLessThanOrEqual(Math.ceil(normal / 2));
  });

  it("does not fire a backlog after a long hitch", () => {
    const fired: string[] = [];
    const clock = createAmbientVfx(AMBIENT_EMITTERS["crown-arena"], { reducedMotion: false });
    clock.step(5, (kind) => fired.push(kind));
    expect(fired).toHaveLength(1);
  });

  it("stays inside 2,000 particles with every combat preset live at once", () => {
    const presets = ironCrownVfxPresets(full);
    const combat = (["ic-forge-spark", "ic-guard-ember", "ic-special-burst", "ic-ko-shower", "ic-win-confetti"] as const).reduce((sum, k) => sum + presetParticles(presets[k]), 0);
    for (const stage of STAGES) {
      expect(ambientLiveParticles(AMBIENT_EMITTERS[stage.id], full) + combat, stage.id).toBeLessThan(2000);
    }
  });
});
