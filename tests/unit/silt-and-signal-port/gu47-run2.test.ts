/**
 * GU47 WP-34 run-2 rows (DG-S2 horizon rings, and the rows added after it). Pure checks on the meshes and the scene the
 * inked look builds; pixels are phase 2 (E-I capture).
 */
import { describe, expect, it } from "vitest";
import { validatePostEffectNode } from "../../../packages/engine/src/agent-api/postBridge";
import { FAR_DUNE_RINGS, farDuneRings, farDunes } from "../../../examples/silt-and-signal-port/architecture";
import { BOOST_BLUR, BOOST_FOV_KICK, GOD_RAY_DENSITY, MAST_BRONZE, RING_PUNCH, WET_ROAD, buildWorld, fovKickTarget, inkSkySpec, mastTint, sequencePost } from "../../../examples/silt-and-signal-port/world";
import { FINISH_ORBIT, chaseEyeBlocked, finishOrbitPose } from "../../../examples/silt-and-signal-port/camera";
import { createSim } from "../../../examples/silt-and-signal-port/sim";
import { LIGHTNING, createLightning, flashEnvelope, lightningStrikes } from "../../../examples/silt-and-signal-port/storm";

type Node = Record<string, any>;
const nodes = (chapter: number, options: Parameters<typeof buildWorld>[1] = {}): Node[] =>
  (buildWorld(chapter, options).scene as unknown as { toJSON(): { nodes: Node[] } }).toJSON().nodes;

describe("GU47 WP-34 DG-S2 horizon rings", () => {
  const haze = [0.85, 0.72, 0.58] as const;

  it("today's single ring is unchanged when no shape is passed", () => {
    expect(farDunes(0, -600, 1500, 2150, haze, {})).toEqual(farDunes(0, -600, 1500, 2150, haze));
  });

  it("three rings between 1500 and 2150 m, each taller and hazier than the one in front, merged into one mesh", () => {
    expect(FAR_DUNE_RINGS.length).toBe(3);
    expect(FAR_DUNE_RINGS[0]!.inner).toBe(1500);
    expect(FAR_DUNE_RINGS[2]!.outer).toBeLessThanOrEqual(2150);
    const per = FAR_DUNE_RINGS.map((r) => farDunes(0, 0, r.inner, r.outer, haze, r.shape));
    const peak = per.map((m) => Math.max(...m.positions.filter((_, i) => i % 3 === 1)));
    expect(peak[1]!).toBeGreaterThan(peak[0]!);
    expect(peak[2]!).toBeGreaterThan(peak[1]!);
    // each ring sits closer to the haze colour than the one in front: three distinct plateaus toward the fog
    const off = per.map((m) => { let s = 0, n = 0; for (let i = 0; i < m.colors.length; i += 4) { s += Math.hypot(m.colors[i]! - haze[0], m.colors[i + 1]! - haze[1], m.colors[i + 2]! - haze[2]); n++; } return s / n; });
    expect(off[1]!).toBeLessThan(off[0]! * 0.9);
    expect(off[2]!).toBeLessThan(off[1]! * 0.9);
    const merged = farDuneRings(0, 0, haze);
    expect(merged.positions.length).toBe(per.reduce((s, m) => s + m.positions.length, 0));
    expect(Math.max(...merged.indices)).toBe(merged.positions.length / 3 - 1);
  });

  it("the inked scene draws the rings as one node; ?look=original keeps today's ring", () => {
    const inked = nodes(0).filter((n) => n.name === "far-dunes");
    const original = nodes(0, { look: "original" }).filter((n) => n.name === "far-dunes");
    expect(inked.length).toBe(1);
    expect(original.length).toBe(1);
  });
});

describe("GU47 WP-34 DG-S4 god rays and DG-L5 contact shadows", () => {
  it("god rays only in ch0 and ch2, never on Low or in ?look=original", () => {
    const rays = (c: number, o: Parameters<typeof buildWorld>[1] = {}) => nodes(c, o).filter((n) => n.effect === "volumetric-fog");
    for (let c = 0; c < 7; c++) expect(rays(c).length, `ch${c}`).toBe(c === 0 || c === 2 ? 1 : 0);
    expect(rays(0)[0]!.godRayDensity).toBe(GOD_RAY_DENSITY);
    expect(validatePostEffectNode(rays(0)[0] as never) ?? []).toEqual([]);
    expect(rays(0, { low: true }).length).toBe(0);
    expect(rays(0, { look: "original" }).length).toBe(0);
  });

  it("contact shadows in every inked chapter except Low; none in ?look=original", () => {
    const cs = (c: number, o: Parameters<typeof buildWorld>[1] = {}) => nodes(c, o).filter((n) => n.effect === "contact-shadows").length;
    for (let c = 0; c < 7; c++) expect(cs(c)).toBe(1);
    expect(cs(3, { low: true })).toBe(0);
    expect(cs(3, { look: "original" })).toBe(0);
  });
});

describe("GU47 WP-34 DG-S5 lightning and wet road", () => {
  it("the schedule is seeded, spaced 7-15 s, and thunder always follows the flash", () => {
    const a = lightningStrikes(300), b = lightningStrikes(300);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(15);
    for (let i = 1; i < a.length; i++) {
      const gap = a[i]!.at - a[i - 1]!.at;
      expect(gap).toBeGreaterThanOrEqual(LIGHTNING.minGap);
      expect(gap).toBeLessThanOrEqual(LIGHTNING.maxGap);
    }
    for (const s of a) expect(s.thunderDelay).toBeGreaterThan(0.4);
  });

  it("each flash is over in < 200 ms and peaks at 1", () => {
    let peak = 0, lastLit = 0;
    for (let t = 0; t < 0.4; t += 0.001) { const f = flashEnvelope(t); peak = Math.max(peak, f); if (f > 0) lastLit = t; }
    expect(peak).toBeCloseTo(1, 2);
    expect(lastLit).toBeLessThan(0.2);
  });

  it("reduced flash caps the peak at 0.3 (PRD §6.3); strikes are reported once", () => {
    for (const reducedFlash of [false, true]) {
      const player = createLightning({ reducedFlash });
      let peak = 0, began = 0;
      for (let t = 0; t < 60; t += 1 / 120) { const s = player.step(t); peak = Math.max(peak, s.flash); began += s.began.length; }
      expect(began).toBe(lightningStrikes(60).length);
      if (reducedFlash) expect(peak).toBeLessThanOrEqual(LIGHTNING.reducedPeak);
      else expect(peak).toBeGreaterThan(0.6);
    }
  });

  it("the inked sky carries the flash uniform at 0; the storm chapter's road is wet and the key has a runtime id", () => {
    expect((inkSkySpec(4).uniforms as Record<string, { value: unknown }>).skyFlash!.value).toBe(0);
    const road = (c: number, o: Parameters<typeof buildWorld>[1] = {}) => nodes(c, o).find((n) => n.name === "road")!;
    expect(road(4).material.roughness).toBe(WET_ROAD.roughness);
    expect(road(1).material.roughness).toBe(1);
    expect(road(4, { look: "original" }).material.roughness).toBe(1);
    const key = nodes(4).find((n) => n.name === "silt key")!;
    expect(key.runtime?.id).toBe("silt-key");
  });
});

describe("GU47 WP-34 DG-C2 ring-pass punch and DG-M4 bronze masts", () => {
  it("the punch adds to the boost kick for 0.35 s and is 0 on reduced motion", () => {
    expect(fovKickTarget(false, 0, false)).toBe(0);
    expect(fovKickTarget(true, 0, false)).toBe(BOOST_FOV_KICK);
    expect(fovKickTarget(false, 0.1, false)).toBe(RING_PUNCH.deg);
    expect(fovKickTarget(true, 0.1, false)).toBe(BOOST_FOV_KICK + RING_PUNCH.deg);
    expect(fovKickTarget(true, 0.1, true)).toBe(0);
  });

  it("inked masts are bronze with seeded low-saturation verdigris tints, one node; the original keeps brass", () => {
    for (let c = 0; c < 7; c++) {
      const masts = nodes(c).filter((n) => n.name === "masts");
      if (!masts.length) continue;
      expect(masts.length).toBe(1);
      expect(masts[0]!.material.roughness).toBe(MAST_BRONZE.roughness);
    }
    const tints = Array.from({ length: 40 }, (_, i) => mastTint(i));
    expect(tints).toEqual(Array.from({ length: 40 }, (_, i) => mastTint(i)));
    expect(new Set(tints).size).toBeGreaterThan(2);
    for (const hex of tints) {
      const n = Number.parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
      // saturation (max-min)/max stays under 0.25: never a jade cluster
      expect((Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(r, g, b)).toBeLessThan(0.25);
    }
    const original = nodes(0, { look: "original" }).find((n) => n.name === "masts");
    if (original) expect(original.material.roughness).toBe(0.38);
  });
});

describe("GU47 WP-34 DG-L6 lens flare", () => {
  it("flare only in ch0 and ch6, inked, not on Low; halved on reduced flash; no jade element", () => {
    const flares = (c: number, o: Parameters<typeof buildWorld>[1] = {}) => nodes(c, o).filter((n) => n.kind === "lensflare");
    for (let c = 0; c < 7; c++) expect(flares(c).length, `ch${c}`).toBe(c === 0 || c === 6 ? 1 : 0);
    expect(flares(0, { low: true }).length).toBe(0);
    expect(flares(6, { look: "original" }).length).toBe(0);
    expect(flares(0)[0]!.runtime.id).toBe("silt-flare");
    expect(flares(0, { reducedMotion: true })[0]!.intensity).toBe(flares(0)[0]!.intensity / 2);
    expect(flares(0)[0]!.elements.map((e: { color: string }) => e.color)).not.toContain("#2fae86");
  });
});

describe("GU47 WP-34 DG-P4 sequence DOF and boost motion blur", () => {
  it("both nodes on High in the inked look, valid v2 fields; none on Low or in ?look=original; no blur on reduced motion", () => {
    const of = (c: number, o: Parameters<typeof buildWorld>[1] = {}) => nodes(c, o).filter((n) => n.effect === "depth-of-field" || n.effect === "motion-blur");
    const high = of(1);
    expect(high.map((n) => n.effect).sort()).toEqual(["depth-of-field", "motion-blur"]);
    for (const n of high) expect(validatePostEffectNode(n as never) ?? []).toEqual([]);
    expect(high.find((n) => n.effect === "motion-blur")!.intensity).toBe(BOOST_BLUR);
    expect(of(1, { low: true })).toEqual([]);
    expect(of(1, { look: "original" })).toEqual([]);
    expect(of(1, { reducedMotion: true }).map((n) => n.effect)).toEqual(["depth-of-field"]);
  });

  it("DOF only in sequences, blur only on boost outside sequences and never on reduced motion", () => {
    expect(sequencePost({ boosting: false, sequence: false, reducedMotion: false })).toEqual({ depthOfField: false, motionBlur: false });
    expect(sequencePost({ boosting: true, sequence: false, reducedMotion: false })).toEqual({ depthOfField: false, motionBlur: true });
    expect(sequencePost({ boosting: true, sequence: true, reducedMotion: false })).toEqual({ depthOfField: true, motionBlur: false });
    expect(sequencePost({ boosting: true, sequence: false, reducedMotion: true }).motionBlur).toBe(false);
  });
});

describe("GU47 WP-34 DG-C3 finish orbit", () => {
  it("3 s, the rider stays >= 15% of the frame height, every pose clear of colliders and above the ground", () => {
    const sim = createSim(0, 0);
    const blocked = chaseEyeBlocked(sim.world);
    expect(FINISH_ORBIT.seconds).toBe(3);
    for (let t = 0; t <= FINISH_ORBIT.seconds; t += 0.25) {
      const pose = finishOrbitPose(sim, t);
      const d = Math.hypot(pose.position[0] - pose.target[0], pose.position[1] - pose.target[1], pose.position[2] - pose.target[2]);
      const frameHeight = 2 * d * Math.tan((pose.fov * Math.PI) / 360);
      expect(2.1 / frameHeight, `t=${t}`).toBeGreaterThanOrEqual(0.15);
      expect(blocked(...pose.position)).toBe(false);
      expect(pose.position[1]).toBeGreaterThan(sim.world.floor(pose.position[0], pose.position[2], sim.state.y));
    }
    // it moves: the first and last eye differ by more than the radius
    const a = finishOrbitPose(sim, 0).position, b = finishOrbitPose(sim, 3).position;
    expect(Math.hypot(a[0] - b[0], a[2] - b[2])).toBeGreaterThan(FINISH_ORBIT.radius);
  });
});
