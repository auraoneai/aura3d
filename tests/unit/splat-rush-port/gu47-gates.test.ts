import { describe, expect, it } from "vitest";
import { Autopilot } from "../../../examples/splat-rush-port/autopilot";
import { LOOKS, type SplatLook } from "../../../examples/splat-rush-port/look";
import { GATE_DRIPS, capsuleMesh, gateDripMesh, mergeMeshes, transformMesh, type MeshData } from "../../../examples/splat-rush-port/meshes";
import { gateMatched, gateSquash } from "../../../examples/splat-rush-port/presentation";
import { CARNIVAL_GATE_VERTEX, CARNIVAL_TONE_VERTEX } from "../../../examples/splat-rush-port/shaders";
import { IDLE, POOL, SplatRushSim, type Gate } from "../../../examples/splat-rush-port/sim";
import { buildWorld, gateVertexCount } from "../../../examples/splat-rush-port/world";

const g = globalThis as { document?: unknown };
function withDocument<T>(fn: () => T): T {
  const had = "document" in g;
  if (!had) g.document = { createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: () => () => undefined }) }) };
  try { return fn(); } finally { if (!had) delete g.document; }
}

const bounds = (m: MeshData) => {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.positions.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k]!, m.positions[i + k]!); hi[k] = Math.max(hi[k]!, m.positions[i + k]!); }
  return { lo, hi };
};
const post = capsuleMesh(0.46, 4, 16, 6), bar = capsuleMesh(0.52, 6.24, 16, 6);
const gateParts = [transformMesh(post, { tx: -2.66, ty: 2.46 }), transformMesh(post, { tx: 2.66, ty: 2.46 }), transformMesh(bar, { rz: Math.PI / 2, ty: 4.92 })];

describe("GU47 CR-M3 paint-drip gate arches", () => {
  it("drips stay inside the gate's x/z footprint and above the ground; >= 3 drip tips", () => {
    const plain = mergeMeshes(gateParts), dripped = mergeMeshes([...gateParts, gateDripMesh()]);
    const a = bounds(plain), b = bounds(dripped);
    for (const k of [0, 2]) { expect(b.lo[k]).toBeCloseTo(a.lo[k]!, 9); expect(b.hi[k]).toBeCloseTo(a.hi[k]!, 9); }
    expect(b.lo[1]).toBeCloseTo(a.lo[1]!, 9);
    expect(GATE_DRIPS.length).toBeGreaterThanOrEqual(3);
    const drips = gateDripMesh();
    const tips = new Set<number>();
    for (let v = 0; v < drips.positions.length / 3; v++) if (drips.uvs[v * 2 + 1]! > 0.999) tips.add(Math.round(drips.positions[v * 3]! * 100));
    expect(tips.size).toBe(GATE_DRIPS.length);
    // every drip starts inside the bar (radius 0.52 around y 4.92) and hangs below it
    for (const d of GATE_DRIPS) expect(4.92 - 0.52 - (d.length + d.radius)).toBeLessThan(4.4);
    expect(bounds(drips).hi[1]).toBeLessThan(4.92 + 0.52);
  });

  it("posts and bar carry wobble weight 0; drip weights run 0..1 down the drip", () => {
    for (const p of gateParts) for (let v = 1; v < p.uvs.length; v += 2) expect(p.uvs[v]).toBe(0);
    const d = gateDripMesh();
    for (let v = 0; v < d.uvs.length / 2; v++) { expect(d.uvs[v * 2 + 1]).toBeGreaterThanOrEqual(0); expect(d.uvs[v * 2 + 1]).toBeLessThanOrEqual(1); }
  });

  it("carnival gates are one batch with the drips merged in; the original gate mesh is unchanged", () => {
    const n = (look: SplatLook) => withDocument(() => { buildWorld({ sim: new SplatRushSim(1), aspect: 16 / 9, look }); return gateVertexCount; });
    expect(n(LOOKS.original)).toBe(mergeMeshes(gateParts).positions.length / 3);
    expect(n(LOOKS.carnival)).toBe(mergeMeshes([...gateParts, gateDripMesh()]).positions.length / 3);
    const json = withDocument(() => JSON.stringify(buildWorld({ sim: new SplatRushSim(1), aspect: 16 / 9, look: LOOKS.carnival }).scene.toJSON()));
    expect(json.match(/"gates"/g)?.length).toBeGreaterThanOrEqual(1);
    expect(json).toContain("crWobble");
  });
});

describe("GU47 CR-AN1 drip wobble and match squash", () => {
  it("the gate vertex is the tone vertex plus a weight-scaled offset", () => {
    expect(CARNIVAL_GATE_VERTEX).toContain("crWobble");
    expect(CARNIVAL_GATE_VERTEX).toContain("uv.y * uv.y");
    expect(CARNIVAL_TONE_VERTEX).not.toContain("crWobble");
  });

  it("squash flattens and spreads, and the gate is gone after the squash time", () => {
    expect(gateSquash(0, 0.25)).toEqual({ sx: 1, sy: 1, sz: 1 });
    const mid = gateSquash(0.125, 0.25)!;
    expect(mid.sy).toBeLessThan(1); expect(mid.sx).toBeGreaterThan(1);
    expect(gateSquash(0.25, 0.25)).toBeNull();
    expect(gateSquash(0.1, 0)).toBeNull();
  });

  it("matches mirror the sim's hit test", () => {
    const o = { laneOffset: 2.3, playerColorIndex: 1, isRainbowActive: false };
    expect(gateMatched(o, { laneX: 2.3, colorIndex: 1 })).toBe(true);
    expect(gateMatched(o, { laneX: 2.3, colorIndex: 2 })).toBe(false);
    expect(gateMatched(o, { laneX: 0, colorIndex: 1 })).toBe(false);
    expect(gateMatched({ ...o, isRainbowActive: true }, { laneX: 2.3, colorIndex: 2 })).toBe(true);
  });

  function run(look: SplatLook, reducedMotion: boolean) {
    return withDocument(() => {
      const sim = new SplatRushSim(20261023);
      const world = buildWorld({ sim, aspect: 16 / 9, look });
      const per = gateVertexCount;
      const mirror = new Float32Array(POOL.gates * per * 3);
      const wobble: number[][] = [];
      const handle = (id: string) => {
        const h: Record<string, unknown> = {};
        const chain = () => h;
        Object.assign(h, {
          setPosition: chain, setRotation: chain, setScale: chain, setVisible: chain, setLight: chain,
          setUniform: (name: string, value: number[]) => { if (id === "gates" && name === "crWobble") wobble.push(value); return h; },
          updateAttribute: (name: string, u: { array: Float32Array; offset: number }) => { if (id === "gates" && name === "position") mirror.set(u.array, u.offset * 3); return h; }
        });
        return h;
      };
      const rt = world.bind({ nodes: { require: handle }, camera: { setPose: () => undefined } } as never);
      sim.advance({ ...IDLE, start: true });
      const pilot = new Autopilot();
      const matchedAt = new Map<Gate, number>();
      const seen = new Map<Gate, boolean>();
      let mismatches = 0, matches = 0;
      for (let i = 0; i < 1500 && sim.o.phase !== "gameOver"; i++) {
        sim.advance(pilot.next(sim, i));
        pilot.observe(sim);
        for (const gate of sim.gates) {
          if (seen.get(gate) === false && gate.passed && gateMatched(sim.o, gate)) { matchedAt.set(gate, sim.elapsed); matches++; }
          seen.set(gate, gate.passed);
        }
        rt.update(sim, 16 / 9, { reducedMotion });
        let shown = 0;
        for (let s = 0; s < POOL.gates; s++) {
          const slice = mirror.subarray(s * per * 3, (s + 1) * per * 3);
          if (slice.some((v) => v !== 0)) shown++;
        }
        const limit = reducedMotion ? 0 : (look.gates?.squashSeconds ?? 0);
        const age = (gate: Gate) => (matchedAt.has(gate) ? sim.elapsed - matchedAt.get(gate)! : -1);
        // frames within 1e-6 s of the limit are float-ambiguous (elapsed is a sum of 1/60 steps); either count is right
        const goneSure = sim.gates.filter((gate) => age(gate) >= limit + 1e-6 || (limit === 0 && matchedAt.has(gate))).length;
        const goneMaybe = sim.gates.filter((gate) => age(gate) >= limit - 1e-6 && matchedAt.has(gate)).length;
        if (shown > sim.gates.length - goneSure || shown < sim.gates.length - goneMaybe) mismatches++;
      }
      return { mismatches, matches, wobble };
    });
  }

  it("a matched gate is gone within 0.3 s; reduced motion removes it at once and stops the wobble", () => {
    expect(LOOKS.carnival.gates?.squashSeconds).toBeLessThanOrEqual(0.3);
    const full = run(LOOKS.carnival, false);
    expect(full.matches).toBeGreaterThan(3);
    expect(full.mismatches).toBe(0);
    expect(full.wobble.at(-1)?.[1]).toBe(LOOKS.carnival.gates?.wobble);
    const reduced = run(LOOKS.carnival, true);
    expect(reduced.mismatches).toBe(0);
    expect(reduced.wobble.every((w) => w[1] === 0)).toBe(true);
  });
});
