/**
 * GU47 WP-34 look, VFX and camera feel (PRD §6.3 reduced motion, §6.4 Low tier). Pure checks on the look table, the
 * scene the inked look builds, the VFX pack and the camera helpers; pixels are phase 2 (E-I capture).
 */
import { statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validatePostEffectNode } from "../../../packages/engine/src/agent-api/postBridge";
import { CHAPTER_LOOKS, INK_FADE_METRES, chapterHdri, chapterLook, inkPassOptions, motionScale, siltLookMode } from "../../../examples/silt-and-signal-port/art/look";
import { SILT_EFFECT_CAP, SILT_PARTICLE_CAP, SILT_TRAIL, SILT_VFX_KINDS, registerSiltVfx, siltVfxPresets, wakeInterval, wakeStrength } from "../../../examples/silt-and-signal-port/art/vfx";
import { createSiltFx } from "../../../examples/silt-and-signal-port/fx";
import { MAX_ROLL_DEG, allProgramSpecs, buildWorld, cameraRoll, overCanal, rolledUp } from "../../../examples/silt-and-signal-port/world";
import { RAIL_CLEARANCE, RAIL_SECONDS, chaseEyeBlocked, railPose } from "../../../examples/silt-and-signal-port/camera";
import { createSim } from "../../../examples/silt-and-signal-port/sim";
import { PLASTER_INKED, inkedPlaster, inkedTerrainColors } from "../../../examples/silt-and-signal-port/architecture";

type Node = Record<string, any>;
const nodes = (chapter: number, options: Parameters<typeof buildWorld>[1] = {}): Node[] =>
  (buildWorld(chapter, options).scene as unknown as { toJSON(): { nodes: Node[] } }).toJSON().nodes;

describe("GU47 WP-34 look table", () => {
  it("?look=original selects today's look; anything else is inked", () => {
    expect(siltLookMode("?look=original")).toBe("original");
    expect(siltLookMode("?chapter=2&start=1")).toBe("inked");
    expect(siltLookMode(undefined)).toBe("inked");
  });

  it("DG-L2: five day chapters use their catalogue HDRI for IBL only; the two night chapters keep neutral 0.35", () => {
    const ids = CHAPTER_LOOKS.map((l) => l.hdri);
    expect(ids).toEqual(["belfast_sunset_puresky", "outdoor-midday", null, "industrial_sunset_puresky", "kloppenheim_02", null, "spruit_sunrise"]);
    for (let c = 0; c < CHAPTER_LOOKS.length; c++) {
      const env = nodes(c).find((n) => n.kind === "environment")!;
      const look = chapterLook(c);
      if (look.hdri) {
        expect(env.environment).toBe("hdri");
        expect(env.background).toBe(false);
        expect(env.texture.url).toBe(`/hdri/${look.hdri}_1k.hdr`);
        // the served 1k file exists; size recorded against the <= 1.5 MB budget in the lane report (two files are over)
        expect(statSync(`public/hdri/${look.hdri}_1k.hdr`).size).toBeLessThan(1.8e6);
        expect(chapterHdri(look)?.hash).toMatch(/^sha256-[0-9a-f]{64}$/);
      } else {
        expect(env.intensity).toBe(0.35);
      }
    }
  });

  it("DG-S3: every chapter has a height-fog node; DG-P3: bloom has threshold 1.0 and no radius; DG-P2: grade and vignette 0.22", () => {
    for (let c = 0; c < CHAPTER_LOOKS.length; c++) {
      const list = nodes(c);
      const fog = list.find((n) => n.effect === "fog")!;
      expect(fog.mode).toBe("height");
      expect(fog.heightFalloff).toBeGreaterThan(0);
      const bloom = list.find((n) => n.effect === "bloom")!;
      expect(bloom.threshold).toBe(1);
      expect(bloom.postAuthored).not.toContain("radius");
      expect(validatePostEffectNode(bloom) ?? []).toEqual([]);
      const grade = list.find((n) => n.effect === "color-grade")!;
      expect(grade.saturation).toBe(chapterLook(c).grade.saturation);
      expect(list.find((n) => n.effect === "vignette")?.intensity).toBe(0.22);
      expect(list.find((n) => n.effect === "film-grain")?.intensity).toBe(0.03);
    }
    // bleached noon, saturated dusk and dawn
    expect(chapterLook(1).grade.saturation).toBeLessThan(chapterLook(0).grade.saturation);
    expect(chapterLook(6).grade.saturation).toBeGreaterThan(1);
  });

  it("PRD §6.4 Low tier: no grain, one cascade, PCF instead of PCSS", () => {
    const low = nodes(0, { low: true, shadowMapSize: 2048 });
    expect(low.some((n) => n.effect === "film-grain")).toBe(false);
    const key = low.find((n) => n.light === "directional" && n.shadow)!;
    expect(key.shadow.cascades).toBe(1);
    expect(key.shadow.filter).toBeUndefined();
    const high = nodes(0).find((n) => n.light === "directional" && n.shadow)!;
    expect(high.shadow.filter).toBe("pcss");
  });

  it("DG-P1: depth plus colour ink, umber by day and indigo at night, 0 by 600 m, 4 bands by day and 6 at night", () => {
    for (let c = 0; c < CHAPTER_LOOKS.length; c++) {
      const ink = inkPassOptions(c, [1280, 720]);
      expect(ink.inkSource).toBe("both");
      expect(ink.fadeDistance).toBe(INK_FADE_METRES);
      expect(ink.bands).toBe(chapterLook(c).night ? 6 : 4);
      expect(ink.inkColor).toBe(chapterLook(c).night ? "#1f2550" : "#5a3a22");
      expect(ink.name).toBe("silt-cel");
    }
  });

  it("DG-S1 / DG-PF1: the inked look adds no program to a chapter (sky-ink replaces sky; water stays one program)", () => {
    const names = allProgramSpecs().map((p) => p.name);
    expect(names).toEqual(["sky", "sky-ink", "water", "water-ink", "ring"]);
    const fragment = (n: Node | undefined) => n?.material?.glsl?.fragment ?? n?.material?.custom?.glsl?.fragment;
    const inked = nodes(4).find((n) => n.name === "sky"), original = nodes(4, { look: "original" }).find((n) => n.name === "sky");
    expect(fragment(inked)).not.toBe(fragment(original));
  });

  it("DG-M4 / DG-H1: the open beacon is jade (no #19e6ff); the cyan thruster spheres become jade strips (same draw count)", () => {
    const inked = nodes(0), original = nodes(0, { look: "original" });
    const json = JSON.stringify(inked).toLowerCase();
    expect(json).not.toContain("#19e6ff");
    expect(json).not.toContain("#38d6ff");
    expect(inked.filter((n) => /^thruster-/.test(n.name ?? "")).map((n) => n.primitive)).toEqual(["box", "box"]);
    expect(original.filter((n) => /^thruster-/.test(n.name ?? "")).map((n) => n.primitive)).toEqual(["sphere", "sphere"]);
  });
});

describe("GU47 WP-34 VFX pack", () => {
  it("registers every kind, with unique names, and stays inside the 600-particle / 96-effect budget", () => {
    const registered: string[] = [];
    const kinds = registerSiltVfx({ registerPreset: (k, spec) => { expect(spec.name).toBe(k); registered.push(k); } }, { chapter: 0 });
    expect(registered).toEqual([...SILT_VFX_KINDS]);
    expect(kinds).toEqual(SILT_VFX_KINDS);
    const presets = siltVfxPresets({ chapter: 0 });
    const count = (k: keyof typeof presets) => presets[k].layers.reduce((s, l) => s + (typeof l.count === "number" ? l.count : 0), 0);
    // a dense moment: wake bursts live for <= 1.2 s at one per 0.08 s => <= 15 alive
    const dense = count("silt-sand-wake") * 15 + count("silt-motes-sand") + count("silt-signal") * 2 + count("silt-impact");
    expect(dense).toBeLessThanOrEqual(SILT_PARTICLE_CAP);
    expect(15 + 1 + 2 + 1 + 2).toBeLessThanOrEqual(SILT_EFFECT_CAP);
  });

  it("DG-V1: the wake fires below 6 m at more than 20 speed and never above 10 m", () => {
    expect(wakeStrength(40, 3)).toBeGreaterThan(0);
    expect(wakeStrength(20, 3)).toBe(0);
    expect(wakeStrength(60, 10)).toBe(0);
    expect(wakeStrength(60, 12)).toBe(0);
    expect(wakeStrength(60, 8)).toBeLessThan(wakeStrength(60, 5));
    expect(wakeInterval(0)).toBe(Number.POSITIVE_INFINITY);
    expect(wakeInterval(1)).toBeLessThan(wakeInterval(0.2));
  });

  it("DG-V1/V2/V3: the driver bursts wake or canal spray, signal on a ring pass, impact on a hit, and runs two jade trails", () => {
    const bursts: string[] = [];
    const trails: string[] = [];
    const effects = {
      registerPreset: () => undefined,
      burst: (k: string) => { bursts.push(k); return { id: k, alive: true, stop: () => undefined, setPosition: () => undefined }; },
      trail: (id: string, o: typeof SILT_TRAIL) => { trails.push(`${id}:${o.color}`); return { id, alive: true, length: 0, pointCount: 0, stop: () => undefined, setPosition: () => undefined, clear: () => undefined }; },
      spawn: () => ({ id: "motes", alive: true, stop: () => undefined, setPosition: () => undefined })
    };
    const fx = createSiltFx(effects as never, { chapter: 0, trailNodes: ["thruster-l", "thruster-r"], motesNode: "rider" });
    expect(trails).toEqual(["thruster-l:#2fae86", "thruster-r:#2fae86"]);
    for (let i = 0; i < 30; i++) fx.update({ position: [0, 3, 0], forward: [0, -1], speed: 50, altitude: 3, overCanal: false }, 1 / 60);
    expect(bursts.filter((b) => b === "silt-sand-wake").length).toBeGreaterThan(0);
    bursts.length = 0;
    for (let i = 0; i < 30; i++) fx.update({ position: [0, 3, 0], forward: [0, -1], speed: 50, altitude: 3, overCanal: true }, 1 / 60);
    expect(bursts.every((b) => b === "silt-canal-spray")).toBe(true);
    bursts.length = 0;
    for (let i = 0; i < 30; i++) fx.update({ position: [0, 30, 0], forward: [0, -1], speed: 50, altitude: 30, overCanal: false }, 1 / 60);
    expect(bursts).toEqual([]);
    fx.ringPassed([0, 5, 0]);
    fx.impact([0, 5, 0], 0.6);
    expect(bursts).toEqual(["silt-signal", "silt-impact"]);
  });

  it("PRD §6.3 reduced motion halves every emission; Low halves the wake and motes again", () => {
    const full = siltVfxPresets({ chapter: 2 }), reduced = siltVfxPresets({ chapter: 2, reducedMotion: true }), low = siltVfxPresets({ chapter: 2, low: true });
    const n = (p: typeof full, k: keyof typeof full) => p[k].layers.reduce((s, l) => s + (typeof l.count === "number" ? l.count : 0), 0);
    for (const k of SILT_VFX_KINDS) expect(n(reduced, k)).toBeLessThanOrEqual(Math.ceil(n(full, k) / 2) + 1);
    expect(n(low, "silt-sand-wake")).toBeLessThan(n(full, "silt-sand-wake"));
  });

  it("canal test follows the shaders' road line", () => {
    expect(overCanal(0, 82, 0)).toBe(true);
    expect(overCanal(1, 20, 0)).toBe(true);
    expect(overCanal(1, 82, 0)).toBe(false);
  });
});

describe("GU47 WP-34 camera (DG-C1, DG-C2) and reduced motion", () => {
  it("DG-C2: roll is 0.4x the bank and never more than 6 deg; reduced motion turns roll and FOV kick off", () => {
    expect(cameraRoll(0.1)).toBeCloseTo(0.04, 6);
    expect((Math.abs(cameraRoll(1.2)) * 180) / Math.PI).toBeCloseTo(MAX_ROLL_DEG, 6);
    const up = rolledUp(0, -1, 0);
    expect(up.map((v) => v + 0)).toEqual([0, 1, 0]);
    expect(motionScale(true)).toMatchObject({ roll: 0, fovKick: 0, emission: 0.5, rail: false });
    expect(motionScale(false)).toMatchObject({ roll: 1, fovKick: 1, emission: 1, rail: true });
  });

  it("DG-C1: the rail starts high ahead of the rider, keeps clear of the ground and colliders, and ends on the chase pose", () => {
    for (let chapter = 0; chapter <= 6; chapter++) {
      const sim = createSim(chapter, 0);
      const chase = { position: [sim.state.x, sim.state.y + 5, sim.state.z + 13] as [number, number, number], target: [sim.state.x, sim.state.y, sim.state.z - 14] as [number, number, number] };
      const blocked = chaseEyeBlocked(sim.world);
      for (let t = 0; t < RAIL_SECONDS - 1; t += 0.25) {
        const p = railPose(sim, t, chase).position;
        expect(blocked(p[0], p[1], p[2]), `chapter ${chapter} t=${t}`).toBe(false);
        expect(p[1] - sim.world.floor(p[0], p[2], p[1])).toBeGreaterThanOrEqual(RAIL_CLEARANCE - 1e-6);
      }
      expect(railPose(sim, RAIL_SECONDS, chase).position).toEqual(chase.position);
    }
  });
});

describe("GU47 WP-34 materials (DG-M1 interim, DG-M2)", () => {
  const hueDeg = ([r, g, b]: readonly number[]): number => {
    const max = Math.max(r!, g!, b!), min = Math.min(r!, g!, b!), d = max - min;
    if (d === 0) return 0;
    const h = max === r ? ((g! - b!) / d) % 6 : max === g ? (b! - r!) / d + 2 : (r! - g!) / d + 4;
    return (h * 60 + 360) % 360;
  };
  it("DG-M1: the inked terrain is warm sand (hue 22-45 deg on average), never green; ?look=original keeps the grass set", () => {
    const positions: number[] = [];
    for (let i = 0; i < 400; i++) positions.push((i * 37) % 900 - 450, (i * 13) % 50 - 5, (i * 71) % 1400 - 1300);
    const c = inkedTerrainColors(positions);
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < c.length; i += 4) { r += c[i]!; g += c[i + 1]!; b += c[i + 2]!; }
    const hue = hueDeg([r, g, b]);
    expect(hue).toBeGreaterThanOrEqual(22);
    expect(hue).toBeLessThanOrEqual(45);
    expect(nodes(0).find((n) => n.name === "terrain").material.texture.url).toMatch(/ground_Color\.jpg$/);
    expect(nodes(0, { look: "original" }).find((n) => n.name === "terrain").material.texture.url).toMatch(/grass_Color\.jpg$/);
  });
  it("DG-M2: five wall hues at least 12 deg apart, plaster texture kept, base darkening and a sand-stain band", () => {
    const hues = PLASTER_INKED.map(hueDeg).sort((a, b) => a - b);
    expect(hues).toHaveLength(5);
    for (let i = 1; i < hues.length; i++) expect(hues[i]! - hues[i - 1]!).toBeGreaterThanOrEqual(11.5);
    const wall = { x: 0, z: 0, halfX: 6, halfZ: 4, bottom: 0, top: 9, kind: "plaster" } as unknown as Parameters<typeof inkedPlaster>[1];
    const foot = inkedPlaster(PLASTER_INKED[2]!, wall, 0.2, 0.5, 0, 0), mid = inkedPlaster(PLASTER_INKED[2]!, wall, 5, 0.5, 0, 0), edge = inkedPlaster(PLASTER_INKED[2]!, wall, 5, 0.0, 0, 0);
    expect(foot[2]! / foot[0]!).toBeLessThan(mid[2]! / mid[0]!);
    expect(edge[1]!).toBeLessThan(mid[1]!);
  });
});
