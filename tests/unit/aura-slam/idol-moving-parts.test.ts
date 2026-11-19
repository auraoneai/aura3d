import { describe, expect, it } from "vitest";
import { TV_CAMERAS, TV_PAN_LIMIT, createTvCameraPans } from "../../../examples/aura-slam/view/idolVenueMotion";
import { FLOOD_LENSES, FLOOD_LENS_RADIUS, GROUND_EMBED, baseY, groundY } from "../../../examples/aura-slam/view/idolVenue";
import { idolModels } from "../../../examples/aura-slam/view/assets";
import { buildTennisScene } from "../../../examples/aura-slam/view/scene";
import { createPoseRig } from "../../../examples/aura-slam/view/poseRig";
import { createUmpireIdol } from "../../../examples/aura-slam/view/idolUmpire";
import { BALL_SEAM_ID, createBallSpin, quatToEulerZYX } from "../../../examples/aura-slam/view/ball";
import { eulerToQuaternion } from "../../../packages/engine/src/agent-api/sceneGraph";

type Node = { name?: string; kind?: string; position?: number[]; rotation?: number[]; children?: Node[]; runtime?: { id?: string } };
const walk = (nodes: Node[] = []): Node[] => nodes.flatMap((n) => [n, ...walk(n.children)]);

describe("Aura Slam Idol moving parts", () => {
  const nodes = walk((buildTennisScene(createPoseRig(), { idol: true }).toJSON() as unknown as { nodes: Node[] }).nodes);

  it("the courtside TV cameras pan with the ball over a rally (damped, limited, the tripod stays where it stands)", () => {
    const writes: Array<Array<[number, number, number]>> = [[], []];
    const handles = TV_CAMERAS.map((_, i) => ({ setRotation: (x: number, y: number, z: number) => { writes[i]!.push([x, y, z]); return handles[i]; } }) as never);
    const pans = createTvCameraPans(handles);
    // the ball crosses the court: near-left -> far-right over 60 frames
    for (let f = 0; f < 60; f++) pans.update(-3 + (6 * f) / 59, 7 - (14 * f) / 59, 1 / 60);
    TV_CAMERAS.forEach((rig, i) => {
      const ys = writes[i]!.map((w) => w[1]);
      expect(ys).toHaveLength(60);
      expect(Math.abs(ys[59]! - ys[0]!), rig.id).toBeGreaterThan(0.1);
      for (const y of ys) expect(Math.abs(y - rig.baseYaw)).toBeLessThanOrEqual(TV_PAN_LIMIT + 1e-9);
      for (const w of writes[i]!) { expect(w[0]).toBe(0); expect(w[2]).toBe(0); }
      // attached at the procedural tripod's spot, with its runtime handle
      const node = nodes.find((n) => n.name === rig.id)!;
      expect(node.kind).toBe("model");
      expect([node.position![0], node.position![2]]).toEqual([rig.position[0], rig.position[2]]);
      expect(node.position![1]).toBeCloseTo(baseY(rig.position[0], rig.position[2]), 9);
      expect(node.runtime?.id).toBe(rig.id);
    });
  });

  it("the floodlight lamps and the scoreboard LED strips stay lit (emissive faces on the Idol towers and board)", () => {
    const b = idolModels.slamFloodlightTower.bounds;
    for (const c of FLOOD_LENSES) {
      expect(Math.abs(c[0]) + FLOOD_LENS_RADIUS).toBeLessThanOrEqual(b[0] / 2 + 0.01);
      expect(c[1] + FLOOD_LENS_RADIUS).toBeLessThanOrEqual(b[1]);
      expect(c[2]).toBeLessThanOrEqual(b[2] / 2 + 0.05);
    }
    for (const side of ["left", "right"]) {
      const tower = nodes.find((n) => n.name === `stadium-floodlight-${side}`)!;
      expect(tower.children?.map((c) => c.name)).toEqual([`stadium-floodlight-${side}-tower`, `stadium-floodlight-${side}-lenses`]);
    }
    const gantry = nodes.find((n) => n.name === "stadium-scoreboard-gantry")!;
    expect(gantry.children?.map((c) => c.name)).toEqual(["stadium-scoreboard-board", "stadium-scoreboard-leds"]);
  });

  it("the umpire is re-posed every rendered frame and visibly moves between two frame times (same ball yaw)", () => {
    const poses: Array<Record<string, { rotation: { x: number; y: number; z: number; w: number } }>> = [];
    const handle = { setAnimationPose: (p: { bones: never }) => { poses.push(p.bones); return handle; } } as never;
    const ump = createUmpireIdol(handle);
    ump.update(0.2, 10.0);
    ump.update(0.2, 10.0 + 1 / 60);
    ump.update(0.2, 10.7);
    expect(poses).toHaveLength(3); // never deduped
    const diff = (a: (typeof poses)[0], b: (typeof poses)[0]) => Math.max(...Object.keys(a).map((n) => {
      const p = a[n]!.rotation, q = b[n]!.rotation;
      return 1 - Math.abs(p.x * q.x + p.y * q.y + p.z * q.z + p.w * q.w);
    }));
    expect(diff(poses[0]!, poses[2]!)).toBeGreaterThan(1e-3);
  });

  it("the ball spins with travel (axis up x velocity, readable rate) and carries a seam ring", () => {
    expect(nodes.some((n) => n.name === BALL_SEAM_ID)).toBe(true);
    const spin = createBallSpin();
    const a = spin.step({ vx: 0, vy: -0.9, vz: 0.1 }, 1 / 60);
    const b = spin.step({ vx: 0, vy: -0.9, vz: 0.1 }, 1 / 60);
    expect(a).not.toEqual(b);
    // flying toward -Z the ball rolls about -X (top moving forward)
    const q = spin.quaternion;
    expect(q[0]).toBeLessThan(0);
    // the Euler handed to setRotation reproduces the quaternion in the engine's ZYX convention
    const back = eulerToQuaternion(quatToEulerZYX(q), "ZYX");
    expect(Math.abs(back[0] * q[0] + back[1] * q[1] + back[2] * q[2] + back[3] * q[3])).toBeCloseTo(1, 6);
    const still = createBallSpin();
    for (const v of still.step({ vx: 0, vy: 0, vz: 0 }, 1 / 60)) expect(Math.abs(v)).toBe(0);
  });

  it("every Idol set piece stands on the ground under its footprint (never floating, never sunk more than 0.5 m)", () => {
    const pieces = nodes.filter((n) => /^(wt-umpire-stand|umpire-idol|net-post-|wt-sideline-|wt-stadium-arcade-|wt-boxwood-urn-|wt-tv-camera-|stadium-floodlight-(left|right)$|stadium-scoreboard-gantry$)/.test(n.name ?? ""));
    expect(pieces.length).toBe(21);
    for (const n of pieces) {
      const [x, y, z] = n.position as [number, number, number];
      const g = groundY(x, z);
      // the GLBs are grounded at their lowest vertex and their feet / bases sit within 2.5 cm of it (measured per GLB)
      expect(y, n.name).toBeLessThanOrEqual(g);
      expect(y, n.name).toBeGreaterThanOrEqual(g - 0.5);
      expect(Math.abs(y - g), n.name).toBeLessThanOrEqual(GROUND_EMBED + 1e-9);
    }
  });
});
