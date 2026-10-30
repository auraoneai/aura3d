// GU47 WP-16 (G06): the runtime VFX preset pack (PBL-V1) and trails (PBL-V2).
import { describe, expect, it } from "vitest";
import type { AuraBurstOptions, AuraTrailOptions, AuraVec3, AuraVfxEffectSpec } from "@aura3d/engine";
import direction from "../../../apps/showcase-pips-big-leap/art/direction";
import {
  PIP_TRAILS,
  PIP_VFX,
  PIP_VFX_COUNTS,
  PIP_VFX_PRESETS,
  burstCount,
  createPipVfx,
  registerPipVfx,
  type PipEffectsLike
} from "../../../apps/showcase-pips-big-leap/src/game/vfx";

function recorder() {
  const registered = new Map<string, AuraVfxEffectSpec>();
  const bursts: { kind: string; at: AuraVec3; options?: AuraBurstOptions }[] = [];
  const trails: { target: string; options: AuraTrailOptions; stopped: boolean }[] = [];
  const fx: PipEffectsLike = {
    registerPreset: (kind, spec) => { registered.set(kind, spec); },
    burst: (kind, at, options) => {
      bursts.push({ kind, at, ...(options ? { options } : {}) });
      return { id: `b${bursts.length}`, alive: true, stop: () => undefined, setPosition: () => undefined };
    },
    trail: (target, options) => {
      const entry = { target, options, stopped: false };
      trails.push(entry);
      return { id: `t${trails.length}`, alive: true, length: 0, pointCount: 0, clear: () => undefined, stop: () => { entry.stopped = true; }, setPosition: () => undefined };
    },
    liveCount: 0
  };
  return { fx, registered, bursts, trails };
}

describe("pips-big-leap VFX pack (PBL-V1)", () => {
  it("registers the seven presets the PRD names", () => {
    const { fx, registered } = recorder();
    const names = registerPipVfx(fx);
    expect(names).toEqual(["pip-land-dust", "pip-jump-puff", "pip-seed-sparkle", "pip-acorn-ring", "pip-checkpoint-leaf", "pip-thorn-hit", "pip-gate-open"]);
    expect([...registered.keys()]).toEqual(names);
  });

  it("keeps exactly one emitter layer per preset (a burst count override is exact)", () => {
    for (const spec of Object.values(PIP_VFX_PRESETS)) {
      expect(spec.layers.filter((layer) => layer.type === "emitter"), spec.name).toHaveLength(1);
    }
  });

  it("covers every preset in the art direction's VFX list", () => {
    const kinds = direction.vfx.map((entry) => entry.kind);
    for (const name of Object.values(PIP_VFX)) expect(kinds).toContain(name);
  });

  it("fires seeded bursts with the preset count and camera feedback", () => {
    const { fx, bursts } = recorder();
    const vfx = createPipVfx(fx, { reducedMotion: false, heroNode: "pip" });
    vfx.fire("land", [0, 0, 0], "#a08a62");
    vfx.fire("land", [1, 0, 0]);
    expect(bursts[0]).toMatchObject({ kind: "pip-land-dust", options: { count: PIP_VFX_COUNTS.land, camera: true, color: "#a08a62" } });
    expect(bursts[0]!.options!.seed).not.toBe(bursts[1]!.options!.seed);
    expect(vfx.fired.land).toBe(2);
  });

  it("reduced motion halves every burst and drops camera shake (PRD 6.3)", () => {
    const { fx, bursts } = recorder();
    const vfx = createPipVfx(fx, { reducedMotion: true, heroNode: "pip" });
    vfx.fire("gate", [0, 1, -60]);
    vfx.fire("acorn", [0, 1, -10]);
    expect(bursts[0]!.options).toMatchObject({ count: PIP_VFX_COUNTS.gate / 2, camera: false });
    expect(bursts[1]!.options!.count).toBe(1);
    expect(burstCount("land", true)).toBe(5);
  });
});

describe("pips-big-leap trails (PBL-V2)", () => {
  it("draws a leaf-green trail while gliding and a white one while diving, and stops on landing", () => {
    const { fx, trails } = recorder();
    const vfx = createPipVfx(fx, { reducedMotion: false, heroNode: "pip" });
    vfx.trailFor("glide");
    vfx.trailFor("glide");
    expect(trails).toHaveLength(1);
    expect(trails[0]).toMatchObject({ target: "pip", options: { color: PIP_TRAILS.glide.color } });
    vfx.trailFor("dive");
    expect(trails[0]!.stopped).toBe(true);
    expect(trails[1]!.options.color).toBe(PIP_TRAILS.dive.color);
    vfx.trailFor(null);
    expect(trails[1]!.stopped).toBe(true);
    expect(vfx.trail).toBeNull();
  });
});
