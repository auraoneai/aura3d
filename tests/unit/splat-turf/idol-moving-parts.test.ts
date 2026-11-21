import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { IDLE, SplatTurfSim } from "../../../apps/showcase-splat-turf/src/sim";
import { buildWorld, KART_WHEEL_CAPACITY } from "../../../apps/showcase-splat-turf/src/world";
import { HERO_KART_LAYOUT, IDOL_DIMS, RIVAL_KART_LAYOUT } from "../../../apps/showcase-splat-turf/src/art/idol";
import { driverPose } from "../../../apps/showcase-splat-turf/src/art/riders";
import { createHumanoidDriver, parseGlbJson, readIdolSkeleton, type HumanoidDriver } from "../../../apps/showcase-port-shared/idol/humanoid";

const fileLoader = async (url: string): Promise<HumanoidDriver> => {
  const bytes = readFileSync(`public${url}`);
  return createHumanoidDriver(readIdolSkeleton(parseGlbJson(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))));
};

type Call = { matrices?: Float32Array; count?: number; position?: number[]; visible?: boolean; pose?: { bones: Record<string, { rotation: Record<string, number> }> } };
function recordingApp() {
  const calls = new Map<string, Call>();
  const handle = (id: string) => {
    const c: Call = calls.get(id) ?? {};
    calls.set(id, c);
    const h: Record<string, unknown> = {};
    const chain = () => h;
    Object.assign(h, {
      setPosition: (...p: number[]) => { c.position = p; return h; },
      setRotation: chain, setScale: chain, setLight: chain, setMaterial: chain, setUniform: chain, updateAttribute: chain, setDrawRange: chain, setInstances: chain,
      setVisible: (v: boolean) => { c.visible = v; return h; },
      setAnimationPose: (p: Call["pose"]) => { c.pose = JSON.parse(JSON.stringify(p)); return h; },
      setInstanceMatrices: (m: Float32Array, n: number) => { c.matrices = m.slice(0, n * 16); c.count = n; return h; }
    });
    return h;
  };
  return { app: { nodes: { require: handle, get: handle }, camera: { setPose: () => undefined } } as never, calls };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("splat turf moving parts and rigged drivers", () => {
  it("hub positions sit inside each wheel-less shell's footprint, tyres touch the road", () => {
    for (const [layout, dims] of [[HERO_KART_LAYOUT, IDOL_DIMS.turfHeroKartShell], [RIVAL_KART_LAYOUT, IDOL_DIMS.turfRivalKartShell]] as const) {
      expect(layout.hubs).toHaveLength(4);
      for (const h of layout.hubs) {
        expect(Math.abs(h[0]) + layout.wheelWidth / 2).toBeLessThanOrEqual(dims[0] / 2 + 0.02);
        expect(Math.abs(h[2]) + layout.wheelRadius).toBeLessThanOrEqual(dims[2] / 2 + 0.02);
        expect(h[1]).toBeCloseTo(layout.wheelRadius, 6);
      }
    }
  });

  it("wheels spin with distance, brushes spin with time, drivers are posed every frame and move", async () => {
    const sim = new SplatTurfSim(7);
    const world = buildWorld({ sim, aspect: 16 / 9, loadHumanoid: fileLoader });
    const { app, calls } = recordingApp();
    const rt = world.bind(app);
    await flush(); await flush();
    for (let i = 0; i < 10; i++) sim.advance(IDLE);
    sim.advance({ ...IDLE, start: true });
    const snaps: { wheels: Float32Array; brushes?: Float32Array; heroPose: string; rivalPose?: string }[] = [];
    for (let f = 0; f < 2400 && snaps.length < 2; f++) {
      sim.advance({ ...IDLE, dx: f % 90 < 45 ? 0.05 : -0.05 });
      rt.update(sim, 16 / 9);
      const bots = calls.get("bot-brushes");
      if (f > 30 && f % 25 === 0 && bots?.count && sim.o.bots.some((b) => b.active)) {
        const rival = [...calls.entries()].find(([id, c]) => id.startsWith("rival-driver-") && c.visible)?.[1];
        snaps.push({ wheels: calls.get("kart-wheels")!.matrices!.slice(), brushes: bots.matrices!.slice(), heroPose: JSON.stringify(calls.get("hero-driver")?.pose), rivalPose: JSON.stringify(rival?.pose) });
      }
    }
    expect(snaps).toHaveLength(2);
    const [a, b] = snaps as [typeof snaps[0], typeof snaps[0]];
    expect(calls.get("kart-wheels")!.count).toBeGreaterThanOrEqual(4);
    expect(calls.get("kart-wheels")!.count).toBeLessThanOrEqual(KART_WHEEL_CAPACITY);
    // hero front-left wheel: same hub, different spin (the column basis changes)
    const basis = (m: Float32Array) => [m[4], m[5], m[6]].map(Number);
    expect(basis(a.wheels.subarray(0, 16))).not.toEqual(basis(b.wheels.subarray(0, 16)));
    expect(basis(a.brushes!.subarray(0, 16))).not.toEqual(basis(b.brushes!.subarray(0, 16)));
    // drivers: object-form quaternions, and the pose changes over time
    const hero = calls.get("hero-driver")!;
    const rover = calls.get("ink-rover-body")!;
    expect(hero.visible).toBe(true);
    // 5.7.0 parent-local nested driver: `ink-rover-body` tracks `laneOffset` and `hero-driver` sits at its local seat offset inside it
    const lane = sim.o.laneOffset;
    expect(Math.abs(rover.position![0]! - lane)).toBeLessThan(0.05);
    expect(Math.abs(hero.position![0]!)).toBeLessThan(0.2);
    expect(hero.position![2]!).toBeGreaterThan(0.3);
    expect(hero.position![2]!).toBeLessThan(2.4);
    expect(hero.position![1]!).toBeGreaterThan(-0.8);
    const anyBone = Object.values(hero.pose!.bones)[0]!;
    expect(Object.keys(anyBone.rotation).sort()).toEqual(["w", "x", "y", "z"]);
    expect(a.heroPose).not.toEqual(b.heroPose);
    expect(a.rivalPose && a.rivalPose !== "undefined").toBeTruthy();
  });

  it("driver hands grip the steering wheel and turn with it; steering leans the torso", async () => {
    for (const key of ["turfHeroDriverRig", "turfRivalDriverRig"]) {
      const drv = await fileLoader(String((await import("../../../apps/showcase-splat-turf/src/aura-assets.route")).assets[key as "turfHeroDriverRig"].url));
      const left = driverPose(drv, { steer: -1, time: 1, speed: 0.5, reduced: false });
      const right = driverPose(drv, { steer: 1, time: 1, speed: 0.5, reduced: false });
      const r = drv.map.roles;
      for (const p of [left, right]) {
        const palms = drv.palmPoints(p.input);
        const pos = drv.modelPositions(p.input);
        const tl = p.input.handTargets!.left!, tr = p.input.handTargets!.right!;
        expect(Math.hypot(palms.left[0] - tl[0], palms.left[1] - tl[1], palms.left[2] - tl[2])).toBeLessThan(0.08);
        expect(Math.hypot(palms.right[0] - tr[0], palms.right[1] - tr[1], palms.right[2] - tr[2])).toBeLessThan(0.08);
        // seated: knees forward of hips, hands forward of the chest
        expect(pos[r.leftLowerLeg!]![2]).toBeGreaterThan(pos[r.hips!]![2] + 0.1);
      }
      expect(JSON.stringify(left.pose.bones[r.chest ?? r.spine!])).not.toEqual(JSON.stringify(right.pose.bones[r.chest ?? r.spine!]));
    }
  });
});
