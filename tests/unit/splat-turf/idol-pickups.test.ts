import { describe, expect, it } from "vitest";
import { CONFIG, IDLE, SplatTurfSim } from "../../../apps/showcase-splat-turf/src/sim";
import { CAN_SCALE, buildWorld } from "../../../apps/showcase-splat-turf/src/world";
import { PAINT_BUCKET_NODE_IDS } from "../../../apps/showcase-splat-turf/src/art/idol";

type Call = { matrices?: Float32Array; count?: number; position?: number[]; visible?: boolean; uniforms: Map<string, unknown>; pose?: unknown };

/** A runtime-app stand-in that records what world.ts writes to each node. */
function recordingApp() {
  const calls = new Map<string, Call>();
  const handle = (id: string) => {
    const c: Call = calls.get(id) ?? { uniforms: new Map() };
    calls.set(id, c);
    const h: Record<string, unknown> = {};
    const chain = () => h;
    Object.assign(h, {
      setPosition: (...p: number[]) => { c.position = p; return h; },
      setRotation: chain, setScale: chain, setLight: chain, setMaterial: chain,
      setVisible: (v: boolean) => { c.visible = v; return h; },
      setUniform: (k: string, v: unknown) => { c.uniforms.set(k, v); return h; },
      updateAttribute: chain, setDrawRange: chain, setInstances: chain,
      setAnimationPose: (p: unknown) => { c.pose = p; return h; },
      setInstanceMatrices: (m: Float32Array, n: number) => { c.matrices = m.slice(0, n * 16); c.count = n; return h; }
    });
    return h;
  };
  const app = { nodes: { require: handle, get: handle }, camera: { setPose: () => undefined } };
  return { app: app as never, calls };
}

/** Instances of a pool node as world translations + scale (column-major matrices). */
const instancesOf = (c: Call | undefined) => {
  const out: { t: [number, number, number]; s: number }[] = [];
  if (!c?.matrices) return out;
  for (let k = 0; k < (c.count ?? 0); k++) {
    const m = c.matrices.subarray(k * 16, k * 16 + 16);
    out.push({ t: [m[12]!, m[13]!, m[14]!], s: Math.hypot(m[0]!, m[1]!, m[2]!) });
  }
  return out;
};

describe("splat turf Idol pickups are visible where the sim puts them", () => {
  it("every live paint can and rival kart has a mounted, non-parked Idol instance at its sim position", () => {
    const sim = new SplatTurfSim(7);
    const world = buildWorld({ sim, aspect: 16 / 9 });
    const { app, calls } = recordingApp();
    const rt = world.bind(app);
    for (let i = 0; i < 10; i++) sim.advance(IDLE);
    sim.advance({ ...IDLE, start: true });
    let sawCan = false, sawBot = false;
    for (let f = 0; f < 3000 && sim.o.phase === "playing" && !(sawCan && sawBot); f++) {
      sim.advance(IDLE);
      rt.update(sim, 16 / 9);
      const roadZ = sim.o.distance;
      const liveCans = sim.o.cans.filter((c) => c.active);
      if (liveCans.length > 0) {
        const inst = instancesOf(calls.get("cans"));
        expect(inst.length).toBe(liveCans.length);
        for (const c of liveCans) {
          const want: [number, number, number] = [c.col - CONFIG.LANE_LIMIT, 0, -c.row - 0.5 + roadZ];
          const hit = inst.find((i) => Math.hypot(i.t[0] - want[0], i.t[2] - want[2]) < 1e-3 && i.t[1] >= 0 && i.t[1] < 0.2);
          expect(hit, `can at ${want}`).toBeDefined();
          expect(hit!.s).toBeCloseTo(CAN_SCALE, 3);
        }
        sawCan = true;
      }
      const liveBots = sim.o.bots.filter((b) => b.active);
      if (liveBots.length > 0) {
        const inst = instancesOf(calls.get("bots"));
        expect(inst.length).toBe(liveBots.length);
        for (const b of liveBots) {
          const hit = inst.find((i) => Math.abs(i.t[0] - b.x) < 1e-3 && Math.abs(i.t[2] - (-b.row + roadZ)) < 1e-3);
          expect(hit, `bot at ${b.x},${b.row}`).toBeDefined();
          expect(hit!.s).toBeGreaterThan(0.9);
        }
        sawBot = true;
      }
    }
    expect(sawCan).toBe(true);
    expect(sawBot).toBe(true);
    // every bucket colour variant mounts and at least one bucket is placed beside the road near the player
    const buckets = PAINT_BUCKET_NODE_IDS.flatMap((id) => instancesOf(calls.get(id)));
    expect(PAINT_BUCKET_NODE_IDS.every((id) => calls.get(id)?.matrices)).toBe(true);
    expect(buckets.some((b) => b.s > 0.5 && b.t[1] > -1 && b.t[2] < 5 && b.t[2] > -80)).toBe(true);
  });
});
