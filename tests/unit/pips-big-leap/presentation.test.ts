// GU47 WP-16 (G06): the runtime diorama presentation (PBL-P1, E1, P2, L2, V1, V2, AN1, C1, C2, QA crops)
// driven through a recording fake app, plus the PRD 6.3 reduced-motion path.
import { describe, expect, it } from "vitest";
import { buildWorld, nodeName } from "../../../apps/showcase-pips-big-leap/src/game/world";
import { worldSpec } from "../../../apps/showcase-pips-big-leap/src/game/worlds";
import {
  SQUASH,
  STATIC_CROPS,
  createDioramaPresentation,
  flickerNoise,
  flyoverRail,
  projectBox,
  squashScaleXZ,
  squashScaleY,
  type PresentationFrame,
  type PresentationNode
} from "../../../apps/showcase-pips-big-leap/src/game/presentation";
import { courseBounds } from "../../../apps/showcase-pips-big-leap/src/game/diorama";
import { PIP_VFX } from "../../../apps/showcase-pips-big-leap/src/game/vfx";
import { WORLD_LOOKS } from "../../../apps/showcase-pips-big-leap/src/game/looks";

function fakeApp() {
  const calls = {
    output: [] as unknown[],
    fog: [] as unknown[],
    post: [] as { name: string; patch: Record<string, unknown> }[],
    bursts: [] as { kind: string; options?: Record<string, unknown> }[],
    presets: [] as string[],
    trails: [] as { target: string; stopped: boolean }[],
    plays: [] as { id: string; skipped: boolean }[],
    kicks: [] as { channel: string; offset: number }[],
    shakes: [] as number[]
  };
  const app = {
    setOutput: (o: unknown) => { calls.output.push(o); },
    atmosphere: { setFog: (spec: unknown) => { calls.fog.push(spec); } },
    post: { setEffect: (name: string, patch: Record<string, unknown>) => { calls.post.push({ name, patch }); } },
    effects: {
      registerPreset: (kind: string) => { calls.presets.push(kind); },
      burst: (kind: string, _at: unknown, options?: Record<string, unknown>) => {
        calls.bursts.push({ kind, ...(options ? { options } : {}) });
        return { id: "b", alive: true, stop: () => undefined, setPosition: () => undefined };
      },
      trail: (target: string) => {
        const entry = { target, stopped: false };
        calls.trails.push(entry);
        return { id: "t", alive: true, length: 0, pointCount: 0, clear: () => undefined, stop: () => { entry.stopped = true; }, setPosition: () => undefined };
      },
      liveCount: 0
    },
    camera: {
      play: (s: { id: string }) => {
        const entry = { id: s.id, skipped: false };
        calls.plays.push(entry);
        return { done: new Promise<void>(() => undefined), progress: 0, skip: () => { entry.skipped = true; } };
      },
      fovKick: { set: (channel: string, offset: number) => { calls.kicks.push({ channel, offset }); } },
      shake: { add: (amount: number) => { calls.shakes.push(amount); } },
      evidence: () => ({ viewProjection: identityVp() })
    }
  };
  return { app, calls };
}

/** Orthographic-ish VP: x,y in [-1, 1] map straight to NDC (w = 1). */
function identityVp(): number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function nodes() {
  const scales = new Map<string, readonly [number, number, number] | number>();
  const lights: { name: string; intensity: number }[] = [];
  const lookup = (name: string): PresentationNode => ({
    setScale: (s) => { scales.set(name, s); return undefined; },
    setLight: (patch) => { lights.push({ name, intensity: patch.intensity ?? Number.NaN }); }
  });
  return { lookup, scales, lights };
}

const frame = (over: Partial<PresentationFrame> = {}): PresentationFrame => ({
  dt: 1 / 60, time: 1, state: "grounded", grounded: true, position: [0, 0.6, 0], aspect: 16 / 9, clearance: 1, gateUnlocked: false, ...over
});

const options = (reducedMotion = false) => ({ mode: "diorama" as const, reducedMotion, heroNode: nodeName.hero, gateRingNode: nodeName.gateRing });

describe("pips-big-leap runtime presentation", () => {
  it("applies the world's post preset and base fog after each mount and plays a 3.5 s fly-over once per world (PBL-P1, E1, C1)", () => {
    const { app, calls } = fakeApp();
    const p = createDioramaPresentation(app, options());
    const w4 = buildWorld(worldSpec("w4"));
    p.worldMounted(w4);
    expect(calls.output).toEqual([{ preset: "arena-fight", exposure: Math.pow(2, WORLD_LOOKS.w4.exposureEv) }]);
    expect(calls.fog[0]).toMatchObject({ mode: "height", heightReference: w4.presentation.baseTop });
    expect(calls.presets).toEqual(Object.values(PIP_VFX));
    expect(calls.plays.map((c) => c.id)).toEqual(["pbl-flyover-w4"]);
    expect(p.cameraBusy()).toBe(true);
    p.skipSequence();
    expect(calls.plays[0]!.skipped).toBe(true);
    expect(p.cameraBusy()).toBe(false);
    p.worldMounted(w4);
    expect(calls.plays).toHaveLength(1);
  });

  it("keeps the fly-over above the course (or beyond its near end) until it settles on the follow pose", () => {
    for (const id of ["academy", "w1", "w2", "w3", "w4", "w5", "w6"] as const) {
      const built = buildWorld(worldSpec(id));
      const rail = flyoverRail(built);
      const bounds = courseBounds(built.spec);
      for (const point of rail.points.slice(0, -1)) {
        expect(point[1] > bounds.topY + 1 || point[2] > bounds.maxZ + 2, `${id} ${point.join(",")}`).toBe(true);
      }
      expect(rail.points.at(-1)).toEqual([built.spec.spawn[0], built.spec.spawn[1] + 1.7, built.spec.spawn[2] + 4.5]);
    }
  });

  it("follows Pip with the DOF focus and writes it only when it moves 5 cm (PBL-P2)", () => {
    const { app, calls } = fakeApp();
    const p = createDioramaPresentation(app, options());
    const built = buildWorld(worldSpec("w1"));
    const n = nodes();
    p.frame(frame(), built, n.lookup);
    p.frame(frame({ clearance: 0.995 }), built, n.lookup);
    p.frame(frame({ clearance: 0.5 }), built, n.lookup);
    expect(calls.post.map((c) => c.name)).toEqual(["depthOfField", "depthOfField"]);
    expect(calls.post[0]!.patch.focusDistance).toBeCloseTo(4.63, 1);
    expect(calls.post[1]!.patch.focusDistance as number).toBeLessThan(3);
  });

  it("flickers the w4 lava practicals through setLight, and keeps them steady under reduced motion (PBL-L2, PRD 6.3)", () => {
    const run = (reducedMotion: boolean) => {
      const { app } = fakeApp();
      const p = createDioramaPresentation(app, options(reducedMotion));
      const built = buildWorld(worldSpec("w4"));
      const n = nodes();
      for (let i = 0; i < 12; i += 1) p.frame(frame({ dt: 0.06, time: i * 0.06 }), built, n.lookup);
      return n.lights;
    };
    const lit = run(false);
    expect(new Set(lit.map((l) => l.name)).size).toBe(4);
    expect(lit.every((l) => l.intensity > 0 && l.intensity <= 14)).toBe(true);
    expect(run(true)).toEqual([]);
    for (let t = 0; t < 10; t += 0.37) {
      expect(flickerNoise(t, 2)).toBeGreaterThanOrEqual(0);
      expect(flickerNoise(t, 2)).toBeLessThanOrEqual(1);
    }
  });

  it("squashes Pip below 0.9 on landing and stretches him above 1.05 at take-off, volume-preserving (PBL-AN1)", () => {
    expect(squashScaleY(SQUASH.land, 0)).toBeLessThan(0.9);
    expect(squashScaleY(SQUASH.jump, 0)).toBeGreaterThan(1.05);
    expect(squashScaleY(SQUASH.land, SQUASH.seconds)).toBe(1);
    expect(squashScaleXZ(0.82) ** 2 * 0.82).toBeCloseTo(1, 5);
    const { app } = fakeApp();
    const p = createDioramaPresentation(app, options());
    const built = buildWorld(worldSpec("w1"));
    const n = nodes();
    p.event({ kind: "land" }, built, [0, 0.6, 0]);
    p.frame(frame({ dt: 0.001 }), built, n.lookup);
    expect(p.heroScaleY).toBeLessThan(0.9);
    const scale = n.scales.get(nodeName.hero) as readonly number[];
    expect(scale[1]).toBeLessThan(0.9);
    expect(scale[0]).toBeGreaterThan(1);
  });

  it("caps squash at 30% and drops camera feedback under reduced motion (PRD 6.3)", () => {
    const { app, calls } = fakeApp();
    const p = createDioramaPresentation(app, options(true));
    const built = buildWorld(worldSpec("w1"));
    const n = nodes();
    p.worldMounted(built);
    expect(calls.plays).toEqual([]);
    p.event({ kind: "pound-land" }, built, [0, 0.6, 0]);
    p.frame(frame({ dt: 0.001 }), built, n.lookup);
    expect(p.heroScaleY).toBeGreaterThanOrEqual(1 + SQUASH.land * 0.3 - 1e-6);
    expect(calls.shakes.every((s) => s === 0)).toBe(true);
    p.frame(frame({ state: "glide", grounded: false }), built, n.lookup);
    expect(calls.kicks.at(-1)!.offset).toBeCloseTo(4 * 0.3, 5);
    p.gateUnlocked(built);
    expect(calls.plays).toEqual([]);
    expect(calls.bursts.every((b) => b.options?.camera === false)).toBe(true);
  });

  it("fires the pack on gameplay events with the world's dust colour, and trails while gliding (PBL-V1, PBL-V2)", () => {
    const { app, calls } = fakeApp();
    const p = createDioramaPresentation(app, options());
    const built = buildWorld(worldSpec("w2"));
    const n = nodes();
    const seed = built.seeds[0]!;
    p.event({ kind: "jump" }, built, [0, 0.6, 0]);
    p.event({ kind: "land" }, built, [0, 0.6, 0]);
    p.event({ kind: "seed", id: seed.id }, built, [0, 0.6, 0]);
    p.event({ kind: "hurt" }, built, [0, 0.6, 0]);
    p.gateOpened(built);
    expect(calls.bursts.map((b) => b.kind)).toEqual([PIP_VFX.jump, PIP_VFX.land, PIP_VFX.seed, PIP_VFX.hurt, PIP_VFX.gate]);
    expect(calls.bursts[1]!.options!.color).toBe(built.presentation.look.dust);
    p.frame(frame({ state: "glide", grounded: false }), built, n.lookup);
    expect(calls.trails).toHaveLength(1);
    p.frame(frame({ state: "grounded", grounded: true }), built, n.lookup);
    expect(calls.trails[0]!.stopped).toBe(true);
    expect(p.evidence().vfxFired).toMatchObject({ land: 1, seed: 1, gate: 1 });
  });

  it("breathes the Sun-Gate ring only once it is unlocked (PBL-V2)", () => {
    const { app } = fakeApp();
    const p = createDioramaPresentation(app, options());
    const built = buildWorld(worldSpec("w1"));
    const n = nodes();
    p.frame(frame({ time: 0.4 }), built, n.lookup);
    expect(n.scales.get(nodeName.gateRing)).toEqual([1, 1, 1]);
    p.frame(frame({ time: 0.4, gateUnlocked: true }), built, n.lookup);
    expect((n.scales.get(nodeName.gateRing) as readonly number[])[0]).not.toBe(1);
  });

  it("publishes static and projected QA crops (pip, feet, glide; w5 throne; w2 water)", () => {
    const { app } = fakeApp();
    const p = createDioramaPresentation(app, options());
    const names = (id: "w1" | "w2" | "w5") => p.crops(buildWorld(worldSpec(id)), [0, -0.5, 0]).map((c) => c.name);
    expect(names("w1")).toEqual([...STATIC_CROPS.map((c) => c.name), "pip", "feet", "glide"]);
    for (const c of p.crops(buildWorld(worldSpec("w1")), [0, -0.5, 0])) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x + c.w).toBeLessThanOrEqual(1 + 1e-9);
      expect(c.name).toMatch(/^[a-z0-9][a-z0-9_-]{0,31}$/);
    }
    expect(projectBox(identityVp(), [[0, 0, 0], [0.5, 0.5, 0]])).toEqual({ x: 0.5, y: 0.25, w: 0.25, h: 0.25 });
  });

  it("does nothing in ?look=original", () => {
    const { app, calls } = fakeApp();
    const p = createDioramaPresentation(app, { ...options(), mode: "original" });
    const built = buildWorld(worldSpec("w1"), { look: "original" });
    const n = nodes();
    p.worldMounted(built);
    p.event({ kind: "land" }, built, [0, 0.6, 0]);
    p.frame(frame(), built, n.lookup);
    expect(calls.output).toEqual([]);
    expect(calls.bursts).toEqual([]);
    expect(calls.post).toEqual([]);
    expect(n.scales.size).toBe(0);
    expect(p.crops(built, [0, 0, 0])).toEqual([]);
  });
});
