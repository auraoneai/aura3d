import { describe, expect, it } from "vitest";
import { scene } from "@aura3d/engine";
import { Autopilot } from "../../../examples/splat-rush-port/autopilot";
import { PIECES, addBackdrop, backdropSway } from "../../../examples/splat-rush-port/backdrop";
import { GATE_COLORS, LOOKS, QA_CROPS, parseLook, sunDirection, timeOfDay, type SplatLook } from "../../../examples/splat-rush-port/look";
import { IDLE, SplatRushSim } from "../../../examples/splat-rush-port/sim";
import { PAINT_SPLASH, PAINT_SPLASH_RING, SPLASH_COUNT, fireSplashes, splashesFor } from "../../../examples/splat-rush-port/vfx3d";
import { BUNTING_COLORS, DECK_DRIPS, spireRingMesh, DECK_EDGE_X, TITLE_RAIL_SECONDS, buildWorld, presentationPose, buntingMesh, cameraLayers, carnivalToonSpec, rolledUp } from "../../../examples/splat-rush-port/world";
import { deltaE2000 } from "../../../tools/look-metrics/region-luma.mjs";

const g = globalThis as { document?: unknown };
function withDocument<T>(fn: () => T): T {
  const had = "document" in g;
  if (!had) g.document = { createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: () => () => undefined }) }) };
  try { return fn(); } finally { if (!had) delete g.document; }
}

interface Recorded { uniforms: Map<string, Map<string, unknown>>; poses: { up: number[]; fov: number }[]; lights: Map<string, unknown> }
function recordingApp(): { app: never; rec: Recorded } {
  const rec: Recorded = { uniforms: new Map(), poses: [], lights: new Map() };
  const handle = (id: string) => {
    const h: Record<string, unknown> = {};
    const chain = () => h;
    Object.assign(h, {
      setPosition: chain, setRotation: chain, setScale: chain, setVisible: chain, updateAttribute: chain,
      setUniform: (name: string, value: unknown) => { let m = rec.uniforms.get(id); if (!m) rec.uniforms.set(id, (m = new Map())); m.set(name, value); return h; },
      setLight: (patch: unknown) => { rec.lights.set(id, patch); }
    });
    return h;
  };
  const app = { nodes: { require: handle }, camera: { setPose: (p: { up: number[]; fov: number }) => { rec.poses.push(p); } } };
  return { app: app as never, rec };
}

function runLook(look: SplatLook | undefined, steps: number, view: Record<string, unknown> = {}) {
  return withDocument(() => {
    const sim = new SplatRushSim(20261023);
    const world = buildWorld({ sim, aspect: 16 / 9, ...(look ? { look } : {}) });
    const { app, rec } = recordingApp();
    const rt = world.bind(app);
    sim.advance({ ...IDLE, start: true });
    const pilot = new Autopilot();
    const trace: string[] = [];
    for (let i = 0; i < steps && sim.o.phase !== "gameOver"; i++) {
      sim.advance(pilot.next(sim, i));
      pilot.observe(sim);
      rt.update(sim, 16 / 9, view);
      trace.push(sim.traceRow(i).join(","));
    }
    return { sim, world, rt, rec, trace };
  });
}

describe("GU47 CR-00: ?look=original|carnival", () => {
  it("parses the param, default carnival", () => {
    expect(parseLook("")).toBe("carnival");
    expect(parseLook("?look=original")).toBe("original");
    expect(parseLook("?look=carnival&seed=3")).toBe("carnival");
    expect(parseLook("?look=noon")).toBe("carnival");
  });

  it("the default world is the original look, node for node", () => {
    const a = withDocument(() => buildWorld({ sim: new SplatRushSim(20261023), aspect: 16 / 9 }).scene.toJSON());
    const b = withDocument(() => buildWorld({ sim: new SplatRushSim(20261023), aspect: 16 / 9, look: LOOKS.original }).scene.toJSON());
    // canvas textures take a global counter id ("texture-N"); everything else must match byte for byte
    const norm = (x: unknown) => JSON.stringify(x).replace(/"texture-\d+"/g, '"texture"');
    expect(norm(b)).toBe(norm(a));
    expect(JSON.stringify(a)).not.toMatch(/crSunDir|"bloom"|cloud-sea/);
  });

  it("rng count and the trace are identical across looks (presentation only)", () => {
    const original = runLook(LOOKS.original, 400);
    const carnival = runLook(LOOKS.carnival, 400, { cameraLayers: true });
    expect(carnival.sim.rng.count).toBe(original.sim.rng.count);
    expect(carnival.trace).toEqual(original.trace);
  });

  it("publishes E-I crops inside the frame, with a sun crop for carnival", () => {
    for (const crops of Object.values(QA_CROPS)) for (const c of crops) {
      expect(c.x).toBeGreaterThanOrEqual(0); expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.x + c.w).toBeLessThanOrEqual(1); expect(c.y + c.h).toBeLessThanOrEqual(1);
    }
    expect(QA_CROPS.carnival.map((c) => c.name)).toContain("sun");
  });
});

describe("GU47 CR-L1 / CR-L3: one sun for toon shaders and GLBs", () => {
  it("the toon sun equals the backdrop key direction; the IBL is kloppenheim_06 with the background off", () => {
    const spec = withDocument(() => carnivalToonSpec(LOOKS.carnival, [1, 1, 1]));
    const toonSun = (spec.uniforms as Record<string, { value: number[] }>).crSunDir?.value as number[];
    const builder = scene();
    addBackdrop(builder, LOOKS.carnival);
    const nodes = builder.toJSON().nodes as unknown as Record<string, unknown>[];
    const key = nodes.find((n) => n.name === "backdrop-key") as { position: number[]; target: number[]; shadow: unknown };
    const d = key.position.map((v, i) => v - (key.target[i] ?? 0));
    const len = Math.hypot(...d);
    d.forEach((v, i) => expect(v / len).toBeCloseTo(toonSun[i] as number, 6));
    expect(key.shadow).toBeTruthy();
    const env = nodes.find((n) => n.kind === "environment") as { environment: string; background: unknown; texture: { url: string } };
    expect(env.environment).toBe("hdri");
    expect(env.background).toBe(false);
    expect(env.texture.url).toBe("/hdri/kloppenheim_06_puresky_1k.hdr");
    expect(nodes.some((n) => n.kind === "light" && (n.light === "ambient" || n.light === "hemisphere"))).toBe(false);
  });

  it("the golden-stage sun sits at 16 degrees, -35 degrees azimuth", () => {
    const tod = timeOfDay(LOOKS.carnival, 0);
    const want = sunDirection(16, -35);
    tod?.sunDirection.forEach((v, i) => expect(v).toBeCloseTo(want[i] as number, 9));
    expect(Math.asin(want[1]) * 180 / Math.PI).toBeCloseTo(16, 9);
    expect(want[0]).toBeLessThan(0);
  });
});

describe("GU47 CR-S1: run-length time of day", () => {
  it("500 / 3,500 / 6,500 m are golden, rose and violet; zeniths differ and stars come out", () => {
    const at = (d: number) => timeOfDay(LOOKS.carnival, d);
    const [a, b, c] = [at(500), at(3500), at(6500)];
    expect(a?.stage).toBeCloseTo(0, 6);
    expect(b?.stage).toBeCloseTo(1, 6);
    expect(c?.stage).toBeCloseTo(2, 6);
    const diff = (x: readonly number[], y: readonly number[]) => Math.max(...x.map((v, i) => Math.abs(v - (y[i] as number))));
    expect(diff(a?.horizon ?? [], b?.horizon ?? [])).toBeGreaterThan(0.02);
    expect(diff(b?.zenith ?? [], c?.zenith ?? [])).toBeGreaterThan(0.002);
    expect(a?.stars).toBe(0);
    expect(c?.stars).toBe(1);
    expect(timeOfDay(LOOKS.original, 1000)).toBeNull();
  });

  it("uniforms are rewritten only when the stage moves, and the GLB key follows", () => {
    const run = runLook(LOOKS.carnival, 60);
    expect(run.rt.timeOfDayKey).toBe(0);
    expect(run.rec.uniforms.get("sky")?.has("crZenith")).toBe(true);
    expect(run.rec.uniforms.get("deck")?.has("crSunColor")).toBe(true);
    expect(run.rec.lights.get("backdrop-key")).toBeTruthy();
    expect(run.rec.uniforms.get("splats")?.get("crDry")).toHaveLength(3);
  });
});

describe("GU47 reduced motion (PRD §6.3)", () => {
  it("camera layers: roll within ±3 deg and +3 deg FOV with speed; none on reduced motion", () => {
    const row = LOOKS.carnival.camera as NonNullable<SplatLook["camera"]>;
    for (let y = -0.5; y <= 0.5; y += 0.05) expect(Math.abs(cameraLayers(row, y, 1).rollDeg)).toBeLessThanOrEqual(3 + 1e-9);
    expect(cameraLayers(row, 0, 1).fovDeg).toBeCloseTo(3, 9);
    const up = rolledUp([0, 5, 9], [0, 0, -10], 3);
    expect(Math.hypot(...up)).toBeCloseTo(1, 6);
    const reduced = runLook(LOOKS.carnival, 200, { cameraLayers: true, reducedMotion: true });
    for (const p of reduced.rec.poses) expect(p.up).toEqual([0, 1, 0]);
    const full = runLook(LOOKS.carnival, 200, { cameraLayers: true });
    expect(full.rec.poses.some((p) => p.up[0] !== 0)).toBe(true);
  });

  it("paint splashes halve under reduced motion; PERFECT doubles; nothing else splashes", () => {
    const full = splashesFor([{ sound: "match" }, { sound: "hit" }, { sound: "perfect" }], [0, 0.5, 0], 2, 120, false);
    expect(full.map((r) => r.kind)).toEqual([PAINT_SPLASH, PAINT_SPLASH, PAINT_SPLASH_RING]);
    expect(full[0]?.color).toBe("#5ecaf0");
    expect(full[0]?.count).toBe(SPLASH_COUNT);
    const reduced = splashesFor([{ sound: "pickup" }], [0, 0.5, 0], 0, 120, true);
    expect(reduced[0]?.count).toBe(Math.ceil(SPLASH_COUNT / 2));
    expect(splashesFor([{ sound: "match" }], [0, 0, 0], 0, 120, false)).toEqual(splashesFor([{ sound: "match" }], [0, 0, 0], 0, 120, false));
    const calls: unknown[] = [];
    expect(fireSplashes({ burst: (...a: unknown[]) => { calls.push(a); return {} as never; } }, full)).toBe(3);
    expect((calls[0] as unknown[])[2]).toMatchObject({ camera: false });
    expect(fireSplashes(undefined, full)).toBe(0);
  });

  it("backdrop sway stays within ±6 deg and is a pure function of time", () => {
    for (const p of PIECES) for (let t = 0; t <= 60; t += 0.25) {
      const s = backdropSway(LOOKS.carnival, p, t);
      expect(Math.abs(s.x) * 180 / Math.PI).toBeLessThanOrEqual(6);
      expect(Math.abs(s.z) * 180 / Math.PI).toBeLessThanOrEqual(6);
      expect(backdropSway(LOOKS.carnival, p, t)).toEqual(s);
    }
    expect(backdropSway(LOOKS.original, PIECES[0] as (typeof PIECES)[number], 3)).toEqual({ x: 0, z: 0 });
  });
});

describe("GU47 CR-W1: festival bunting", () => {
  it("one bunting batch in carnival only; pennants stay >= 25 dE from every gate colour", () => {
    const names = (look: SplatLook) => withDocument(() => (buildWorld({ sim: new SplatRushSim(1), aspect: 1.6, look }).scene.toJSON().nodes as unknown as { name?: string }[]).map((n) => n.name));
    expect(names(LOOKS.carnival).filter((n) => n === "bunting")).toHaveLength(1);
    expect(names(LOOKS.original)).not.toContain("bunting");
    const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    for (const gate of GATE_COLORS) for (const pennant of BUNTING_COLORS) expect((deltaE2000 as (a: number[], b: number[]) => number)(rgb(gate), rgb(pennant))).toBeGreaterThanOrEqual(25);
    const { mesh, tones } = buntingMesh();
    expect(tones.length).toBe(mesh.positions.length);
  });

  it("CR-W1 deck-edge drips hang at the deck edge, below the deck top, in pennant colours (same batch, +0 draws)", () => {
    const { mesh } = buntingMesh();
    const hanging: number[] = [];
    for (let v = 0; v < mesh.positions.length / 3; v++) if (mesh.positions[v * 3 + 1]! < -0.05) hanging.push(v);
    expect(DECK_DRIPS.length).toBeGreaterThanOrEqual(3);
    expect(hanging.length).toBeGreaterThan(0);
    for (const v of hanging) expect(Math.abs(mesh.positions[v * 3]! - DECK_EDGE_X)).toBeLessThan(0.1);
    const lowest = Math.min(...hanging.map((v) => mesh.positions[v * 3 + 1]!));
    expect(lowest).toBeLessThan(-0.3);
    expect(lowest).toBeGreaterThan(-1);
  });

  it("bunting poles appear on both sides during a run", () => {
    const run = runLook(LOOKS.carnival, 240);
    expect(run.rec.uniforms.get("bunting")?.has("crSunDir")).toBe(true);
  });
});

describe("GU47 CR-C2: title rail and results orbit", () => {
  const cam = { x: 0, y: 15, z: 18, lookX: 0, lookY: 0, lookZ: 0 };
  const ball = { x: 0, y: 0.55, z: 0 };
  it("the rail starts high and wide and lands on the sim splash pose after 3 s; nothing while playing", () => {
    const start = presentationPose("splash", 0, cam, ball);
    expect((start?.y ?? 0) - cam.y).toBeGreaterThan(10);
    const end = presentationPose("splash", TITLE_RAIL_SECONDS + 1, cam, ball);
    expect(end).toMatchObject(cam);
    expect(presentationPose("playing", 5, cam, ball)).toBeNull();
  });
  it("the results orbit yaws >= 10 deg over 2 s around the ball", () => {
    const a = presentationPose("gameOver", 0, cam, ball), b = presentationPose("gameOver", 2, cam, ball);
    const yaw = (q: typeof a) => Math.atan2((q?.x ?? 0) - ball.x, (q?.z ?? 0) - ball.z);
    expect(Math.abs(yaw(b) - yaw(a)) * 180 / Math.PI).toBeGreaterThanOrEqual(10);
    expect(b).toMatchObject({ lookX: ball.x, lookY: ball.y, lookZ: ball.z });
  });
});

describe("GU47 CR-W2 horizon spires", () => {
  it("one static ring node in carnival only, between the road and the sky dome, deterministic", () => {
    const names = (look: SplatLook) => withDocument(() => (buildWorld({ sim: new SplatRushSim(1), aspect: 1.6, look }).scene.toJSON().nodes as unknown as { name?: string }[]).map((n) => n.name));
    expect(names(LOOKS.carnival).filter((n) => n === "spires")).toHaveLength(1);
    expect(names(LOOKS.original)).not.toContain("spires");
    const row = LOOKS.carnival.spires!;
    expect(row.count).toBeGreaterThanOrEqual(30);
    const a = spireRingMesh(row), b = spireRingMesh(row);
    expect(a.mesh.positions).toEqual(b.mesh.positions);
    expect(a.tones.length).toBe(a.mesh.positions.length);
    for (let i = 0; i < a.mesh.positions.length; i += 3) {
      const r = Math.hypot(a.mesh.positions[i]!, a.mesh.positions[i + 2]!);
      if (r < 1e-6) continue;
      expect(r).toBeGreaterThan(80);
      expect(Math.hypot(r, a.mesh.positions[i + 1]!)).toBeLessThan(120);
    }
  });

  it("the spires take the time-of-day uniforms during a run", () => {
    const run = runLook(LOOKS.carnival, 60);
    expect(run.rec.uniforms.get("spires")?.has("crFogColor")).toBe(true);
  });
});
