import { describe, expect, it } from "vitest";
import { STAGE_LOOK, lookAt, lookParams, resolveRow } from "../../../examples/saiyan-snake-way-port/art/colorScript";
import { createLookDriver, type LookAppLike, type LookNodeHandle } from "../../../examples/saiyan-snake-way-port/art/lookRuntime";
import { serpentCrops } from "../../../examples/saiyan-snake-way-port/art/crops";
import { allProgramSpecs } from "../../../examples/saiyan-snake-way-port/materials";

/** Records every engine write the driver makes. */
function fakeApp(tier = "high") {
  const log: string[] = [];
  const uniforms = new Map<string, unknown>();
  const lights = new Map<string, Record<string, unknown>>();
  const handles = new Map<string, LookNodeHandle>();
  const node = (id: string): LookNodeHandle => {
    let h = handles.get(id);
    if (!h) {
      h = {
        setUniform: (name, value) => { uniforms.set(`${id}.${name}`, value); log.push(`u:${id}.${name}`); },
        setLight: (patch) => { lights.set(id, patch); log.push(`l:${id}`); }
      };
      handles.set(id, h);
    }
    return h;
  };
  const effects = new Map<string, Record<string, unknown>>();
  const enabled = new Map<string, boolean>();
  let exposure: number | undefined;
  let env: number | undefined;
  const app: LookAppLike = {
    lighting: { setEnvironmentIntensity: (v) => { env = v; log.push("env"); } },
    post: { setEffect: (name, patch) => { effects.set(name, patch); log.push(`p:${name}`); }, setEffectEnabled: (name, on) => { enabled.set(name, on); log.push(`e:${name}`); } },
    quality: { tier },
    setOutput: (o) => { exposure = o.exposure; log.push("out"); }
  };
  return { app, node, log, uniforms, lights, effects, enabled, get exposure() { return exposure; }, get env() { return env; } };
}

const frame = { forward: [0, 0, -1] as const, time: 1, reducedMotion: false, eye: [0, 5, 0] as const };

describe("serpentine-sky-run look driver (SSR-01, SSR-02, SSR-05, SSR-06)", () => {
  it("writes the stage look into the sky and road uniforms, the lights, the post chain and the exposure", () => {
    const f = fakeApp();
    const driver = createLookDriver(f.app, f.node);
    const look = resolveRow(STAGE_LOOK[0]!, 0);
    driver.apply(look, frame);
    expect(f.uniforms.get("sky.lookMode")).toBe(1);
    expect(f.uniforms.get("road.lookMode")).toBe(1);
    expect(f.uniforms.get("sky.skyHi")).toEqual([...look.zenith]);
    expect(f.uniforms.get("road.roadSpine")).toEqual([...look.spine]);
    expect(f.lights.get("sun")!.intensity).toBe(2.4);
    // the sun is ahead (light travels back towards the camera, +Z here) and low
    const dir = f.lights.get("sun")!.direction as number[];
    expect(dir[2]).toBeGreaterThan(0.9);
    expect(dir[1]).toBeLessThan(0);
    expect(f.lights.get("fill")!.intensity).toBe(0.6);
    expect(f.lights.get("sky fill")!.intensity).toBe(0.6);
    expect(f.env).toBe(0.6);
    expect(f.effects.get("bloom")).toEqual({ intensity: 0.45, threshold: 0.85 });
    expect(f.effects.get("colorGrade")!.temperature).toBe(0.08);
    expect(f.exposure).toBe(1.1);
    // GU47 phase 2: the stage is a god-ray stage (flare on) but the volumetric pass stays off (VOLUMETRIC_SHAFTS)
    expect(f.enabled.get("volumetricFog")).toBe(false);
    expect(driver.godRaysOn).toBe(true);
  });

  it("a steady stage writes only the spine clock on the next frame", () => {
    const f = fakeApp();
    const driver = createLookDriver(f.app, f.node);
    const look = resolveRow(STAGE_LOOK[1]!, 1);
    driver.apply(look, frame);
    f.log.length = 0;
    driver.apply(look, { ...frame, time: 1.5 });
    expect(f.log).toEqual(["u:road.roadTime"]);
    expect(driver.writes).toBe(1);
  });

  it("drops god rays below High and on non-god-ray stages (SSR-06, SSR-19)", () => {
    const medium = fakeApp("medium");
    createLookDriver(medium.app, medium.node).apply(resolveRow(STAGE_LOOK[0]!, 0), frame);
    expect(medium.enabled.get("volumetricFog")).toBe(false);
    expect(medium.effects.has("volumetricFog")).toBe(false);
    const high = fakeApp("high");
    createLookDriver(high.app, high.node).apply(resolveRow(STAGE_LOOK[3]!, 3), frame);
    expect(high.enabled.get("volumetricFog")).toBe(false);
    const godRayStages = STAGE_LOOK.map((r, i) => (r.godRays ? i + 1 : 0)).filter(Boolean);
    expect(godRayStages).toEqual([1, 2, 3, 8]);
  });

  it("reduced motion slows the spine wave to 30%", () => {
    const f = fakeApp();
    createLookDriver(f.app, f.node).apply(resolveRow(STAGE_LOOK[0]!, 0), { ...frame, time: 10, reducedMotion: true });
    expect(f.uniforms.get("road.roadTime")).toBeCloseTo(3, 9);
  });

  it("a pinned stage draws that stage's look at any distance", () => {
    expect(lookAt(0, lookParams("?stage=6")).storm).toBe(1);
    expect(lookAt(0, lookParams("?stage=7")).moon).toBe(1);
  });
});

describe("serpentine-sky-run specs default to the pre-GU47 look", () => {
  it("road and sky start at lookMode 0 with the old fog and sun", () => {
    const specs = Object.fromEntries(allProgramSpecs().map((p) => [p.name, p.spec]));
    for (const name of ["road", "sky"]) {
      const u = (specs[name] as { uniforms: Record<string, { value: unknown }> }).uniforms;
      expect(u.lookMode!.value, name).toBe(0);
      expect(u.lookFogColor!.value).toEqual([0.8, 0.62, 0.8]);
      expect(u.lookFogNear!.value).toBe(430);
      expect(u.lookFogFar!.value).toBe(1010);
      expect(u.lookSunDir!.value).toEqual([-0.2501, 0.3002, -0.9206]);
    }
  });
});

describe("serpentine-sky-run QA crops (E-I crop contract)", () => {
  it("publishes at most 16 valid named rects for landscape and portrait", () => {
    for (const aspect of [1280 / 720, 390 / 844]) {
      const crops = serpentCrops(aspect);
      expect(crops.length).toBeLessThanOrEqual(16);
      for (const c of crops) {
        expect(c.name).toMatch(/^[a-z0-9][a-z0-9_-]{0,31}$/);
        expect(c.x).toBeGreaterThanOrEqual(0);
        expect(c.y).toBeGreaterThanOrEqual(0);
        expect(c.x + c.w).toBeLessThanOrEqual(1);
        expect(c.y + c.h).toBeLessThanOrEqual(1);
      }
      expect(crops.map((c) => c.name)).toContain("runner");
    }
  });
});

import { createVfxEventTracker } from "../../../examples/saiyan-snake-way-port/art/vfxEvents";
import { createRun } from "../../../examples/saiyan-snake-way-port/sim";
import { VERGE_POSTS, VERGE_SPACING, buildWorld } from "../../../examples/saiyan-snake-way-port/world";

describe("serpentine-sky-run VFX events (SSR-12)", () => {
  it("fires one event per scripted state change and never writes the run state", () => {
    const tracker = createVfxEventTracker();
    const S = createRun();
    expect(tracker.step(S)).toEqual([]);
    const before = JSON.stringify(S);
    S.kiPulse += 1;
    expect(tracker.step(S).map((e) => e.kind)).toEqual(["serpent-orb"]);
    S.stumble = 0.8;
    expect(tracker.step(S).map((e) => e.kind)).toEqual(["serpent-hit"]);
    S.surge = "on";
    expect(tracker.step(S).map((e) => e.kind)).toEqual(["serpent-surge"]);
    expect(tracker.trailOn).toBe(true);
    S.grounded = false;
    tracker.step(S);
    S.grounded = true;
    expect(tracker.step(S).map((e) => e.kind)).toEqual(["serpent-cloud-puff"]);
    const power = { type: "power", s: 10, lane: 0, dead: false, t: 0, drift: 0, swerve: false, sweepDir: 0, rel: 0, spin: 0, brute: false };
    S.ents.push(power);
    tracker.step(S);
    power.dead = true;
    expect(tracker.step(S).map((e) => e.kind)).toEqual(["serpent-power"]);
    expect(tracker.step(S)).toEqual([]);
    S.kiPulse -= 1; S.stumble = 0; S.surge = "off"; S.ents.pop();
    expect(JSON.stringify(S)).toBe(before);
  });

  it("the colour-script scene drops the 32 spark and burst primitives (nodeCount -32)", () => {
    const count = (mode: "script" | "original") =>
      (buildWorld({ look: { mode, pinnedStage: null } }).scene as unknown as { toJSON(): { nodes: { name?: string }[] } }).toJSON().nodes.filter((n) => /^(spark|burst)-\d+$/.test(n.name ?? "")).length;
    expect(count("original")).toBe(32);
    expect(count("script")).toBe(0);
  });
});

describe("serpentine-sky-run instanced pickups (SSR-18)", () => {
  it("draws orbs, souls and power-ups as 5 instanced nodes instead of 340 pooled slots under the colour script", () => {
    const nodesOf = (mode: "script" | "original") =>
      (buildWorld({ look: { mode, pinnedStage: null } }).scene as unknown as { toJSON(): { nodes: { name?: string; instances?: unknown[] }[] } }).toJSON().nodes;
    const script = nodesOf("script");
    const inst = script.filter((n) => /^inst-(orb|soul|power)-\d$/.test(n.name ?? ""));
    expect(inst.map((n) => n.name).sort()).toEqual(["inst-orb-0", "inst-power-0", "inst-power-1", "inst-soul-0", "inst-soul-1"]);
    expect(script.some((n) => /^ent-(orb|soul|power)-/.test(n.name ?? ""))).toBe(false);
    const original = nodesOf("original");
    expect(original.filter((n) => /^ent-(orb|soul|power)-/.test(n.name ?? "")).length).toBe(150 + 40 * 2 + 10 * 2);
    expect(original.some((n) => /^inst-/.test(n.name ?? ""))).toBe(false);
  });
});

describe("serpentine-sky-run verge dressing (SSR-11)", () => {
  it("strings flags and hangs lanterns every 18 m on both verges as 2 instanced nodes, all in the frustum band ahead", () => {
    const world = buildWorld({ look: { mode: "script", pinnedStage: null } });
    const counts = new Map<string, number>();
    const handle = (id: string) => {
      const h: Record<string, unknown> = {};
      const self = () => h;
      Object.assign(h, { setPosition: self, setRotation: self, setScale: self, setUniform: self, setVisible: self, setLight: () => undefined,
        setInstanceMatrices: (_m: Float32Array, n: number) => { counts.set(id, n); return h; } });
      return h;
    };
    const app = { camera: { setPose: () => undefined }, nodes: { require: (id: string) => handle(id) } };
    const runtime = world.bind(app as never);
    runtime.update(createRun(), 1 / 60, 1, 16 / 9);
    expect(counts.get("verge-lanterns")).toBe(VERGE_POSTS);
    expect(counts.get("verge-flags")).toBe(VERGE_POSTS * 4);
    expect(VERGE_SPACING).toBe(18);
    expect(VERGE_POSTS).toBeGreaterThanOrEqual(12);
  });
});
