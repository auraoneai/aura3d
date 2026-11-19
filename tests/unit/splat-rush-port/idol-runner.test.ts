import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Autopilot } from "../../../examples/splat-rush-port/autopilot";
import { HERO_RUNNER_FOOT, RUNNER_SCALE } from "../../../examples/splat-rush-port/idol";
import { LOOKS } from "../../../examples/splat-rush-port/look";
import { runnerPose } from "../../../examples/splat-rush-port/runnerRig";
import { IDLE, SplatRushSim } from "../../../examples/splat-rush-port/sim";
import { buildWorld } from "../../../examples/splat-rush-port/world";
import { SPLAT_IDOL_ASSETS } from "../../../apps/showcase-splat-rush-port/src/idol-assets";
import { createHumanoidDriver, parseGlbJson, readIdolSkeleton, type HumanoidDriver } from "../../../apps/showcase-port-shared/idol/humanoid";

const fileLoader = async (url: string): Promise<HumanoidDriver> => {
  const b = readFileSync(`public${url}`);
  return createHumanoidDriver(readIdolSkeleton(parseGlbJson(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))));
};

describe("Splat rigged Idol runner on the roller cradle", () => {
  it("is posed every frame through the runtime node, object-form, and the pose changes with time and steering", async () => {
    const g = globalThis as Record<string, unknown>;
    const had = "document" in g;
    if (!had) g.document = { createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: () => () => undefined }) }) };
    try {
      const poses: string[] = [];
      let pos: number[] = [];
      let scale = 0;
      let visible = false;
      const handle = (id: string) => {
        const h: Record<string, unknown> = {};
        const chain = () => h;
        Object.assign(h, {
          setPosition: (...p: number[]) => { if (id === "hero-runner-body") pos = p; return h; },
          setScale: (v: number) => { if (id === "hero-runner-body") scale = v; return h; },
          setRotation: chain, updateAttribute: chain, setUniform: chain, setLight: chain, setInstanceMatrices: chain,
          setVisible: (v: boolean) => { if (id === "hero-runner-body") visible = v; return h; },
          setAnimationPose: (p: unknown) => { if (id === "hero-runner-body") poses.push(JSON.stringify(p)); return h; }
        });
        return h;
      };
      const sim = new SplatRushSim(20261023);
      const world = buildWorld({ sim, aspect: 16 / 9, look: LOOKS.carnival, loadHumanoid: fileLoader });
      const rt = world.bind({ nodes: { require: handle }, camera: { setPose: () => undefined } } as never);
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
      sim.advance({ ...IDLE, start: true });
      const pilot = new Autopilot();
      for (let i = 0; i < 120; i++) { sim.advance(pilot.next(sim, i)); pilot.observe(sim); rt.update(sim, 16 / 9); }
      expect(poses.length).toBeGreaterThan(100);
      expect(new Set(poses.slice(-40)).size).toBeGreaterThan(20);
      expect(visible).toBe(true);
      const bone = Object.values((JSON.parse(poses.at(-1)!) as { bones: Record<string, { rotation: object }> }).bones)[0]!;
      expect(Object.keys(bone.rotation).sort()).toEqual(["w", "x", "y", "z"]);
      // world space: on the cradle right behind the ball (toward the chase camera), at deck height, not parked
      const ball = sim.player;
      expect(scale).toBeGreaterThan(0.5 * RUNNER_SCALE);
      expect(Math.abs(pos[0]! - ball.x)).toBeLessThan(0.35);
      expect(pos[2]! - ball.z).toBeGreaterThan(0.4);
      expect(pos[2]! - ball.z).toBeLessThan(HERO_RUNNER_FOOT.z + 0.6);
      expect(pos[1]!).toBeGreaterThan(ball.y - 0.6);
      expect(pos[1]!).toBeLessThan(ball.y + 0.3);
    } finally { if (!had) delete g.document; }
  });

  it("crouches, leans into the steer and keeps arms out for balance (wrists below the head, not a frozen T-pose)", async () => {
    const drv = await fileLoader(SPLAT_IDOL_ASSETS.splatRunnerRig.url);
    const r = drv.map.roles;
    const left = runnerPose(drv, { steer: -1, time: 0.4, speed: 0.6, lift: 0, reduced: false });
    const right = runnerPose(drv, { steer: 1, time: 0.4, speed: 0.6, lift: 0, reduced: false });
    const later = runnerPose(drv, { steer: -1, time: 0.65, speed: 0.6, lift: 0, reduced: false });
    for (const p of [left, right]) {
      const pos = drv.modelPositions(p.input);
      // arms out for balance but hanging below the shoulders (not the bind T-pose)
      for (const side of ["left", "right"] as const) expect(pos[r[`${side}UpperArm`]!]![1] - pos[r[`${side}Hand`]!]![1]).toBeGreaterThan(0.04);
      expect(pos[r.hips!]![1] - p.feet[1]).toBeLessThan(0.48 * 0.999); // crouched: hips well below a standing 0.5
    }
    expect(JSON.stringify(left.pose)).not.toEqual(JSON.stringify(right.pose));
    expect(JSON.stringify(left.pose)).not.toEqual(JSON.stringify(later.pose));
    expect(RUNNER_SCALE).toBeCloseTo(0.62, 2);
  });
});
