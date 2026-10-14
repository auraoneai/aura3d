// tests/qr/prd14/blockfall-reactor/v2-shell.test.ts — §6.9.16 rig + pool proofs.
import { describe, expect, it } from "vitest";
import {
  blockfallPoseFor,
  createBlockfallRig,
  BASE_POSE
} from "../../../../apps/showcase-blockfall-reactor/src/v2/scene/camera";
import { blockfallWorldNodes } from "../../../../apps/showcase-blockfall-reactor/src/v2/scene/world";
import { LOCKED_POOL_CAPACITY_PER_KIND } from "../../../../apps/showcase-blockfall-reactor/src/gameplay/board-view";
import { VISIBLE_HEIGHT } from "../../../../apps/showcase-blockfall-reactor/src/gameplay/rules";
import { ROW_CELL } from "../../../../apps/showcase-blockfall-reactor/src/gameplay/reactor-scene";
import direction from "../../../../apps/showcase-blockfall-reactor/art/direction";

const ctx = (dt: number) => ({ dt, time: 0, aspect: 16 / 9, previous: null as never, subject: () => undefined, probe: null as never });

describe("blockfall-reactor static rig", () => {
  it("reports the direction rig id inside its [40,50] fov band", () => {
    const rig = createBlockfallRig();
    expect(rig.id).toBe("blockfall-reactor.static");
    const pose = rig.update(ctx(1 / 60));
    expect(pose.fov).toBeGreaterThanOrEqual(40);
    expect(pose.fov).toBeLessThanOrEqual(50);
  });

  it("keeps the well inside the direction subject-height band", () => {
    const pose = blockfallPoseFor({ time: 0, punch: 0 });
    const wellHeight = VISIBLE_HEIGHT * ROW_CELL;
    const distance = Math.hypot(pose.position[2] - pose.target[2], pose.position[1] - pose.target[1]);
    const fraction = wellHeight / (2 * distance * Math.tan((pose.fov / 2) * (Math.PI / 180)));
    expect(fraction).toBeGreaterThanOrEqual(0.55 - 0.08); // well alone, minus shell
    expect(fraction).toBeLessThanOrEqual(0.75 + 0.15); // including shell+columns
  });

  it("tilts down 8–12 degrees onto the well", () => {
    const pose = blockfallPoseFor({ time: 0, punch: 0 });
    const dy = pose.position[1] - pose.target[1];
    const dz = pose.position[2] - pose.target[2];
    const tiltDeg = (Math.atan2(dy, dz) * 180) / Math.PI;
    expect(tiltDeg).toBeGreaterThanOrEqual(8);
    expect(tiltDeg).toBeLessThanOrEqual(12);
  });

  it("drifts ±1.5° around the base eye without moving the target", () => {
    const poses = [blockfallPoseFor({ time: 0, punch: 0 }), blockfallPoseFor({ time: 4.4, punch: 0 })];
    const eyeDeltaX = Math.abs(poses[0].position[0] - poses[1].position[0]);
    expect(eyeDeltaX).toBeGreaterThan(0.05);
    expect(eyeDeltaX).toBeLessThan(0.45); // ~1.5° at 8.45 u
    expect(poses[0].target).toEqual(poses[1].target);
  });

  it("pulls back on a punch without changing the drift origin", () => {
    const calm = blockfallPoseFor({ time: 1, punch: 0 });
    const punched = blockfallPoseFor({ time: 1, punch: 1 });
    expect(punched.position[2]).toBeLessThan(calm.position[2]);
    expect(punched.target[1]).toBeLessThan(calm.target[1]);
  });
});

describe("blockfall-reactor union scene", () => {
  it("builds exactly one scene whose instanced pools cover the board", () => {
    const world = blockfallWorldNodes();
    expect(world.lockedPools).toHaveLength(7);
    for (const pool of world.lockedPools) {
      expect(pool.capacity).toBe(LOCKED_POOL_CAPACITY_PER_KIND);
      expect(pool.transforms).toHaveLength(LOCKED_POOL_CAPACITY_PER_KIND);
    }
    expect(world.activePool.capacity).toBe(4);
    // All pool instances start parked below the room — nothing renders as a
    // stray tile at origin before the first board sync.
    for (const spec of world.activePool.transforms) {
      expect(spec.position[1]).toBeLessThan(-40);
    }
    expect(world.shardNodeIds.length).toBeGreaterThanOrEqual(48);
  });
});

describe("art direction contract", () => {
  it("declares the static rig, the [40,50] fov band, and two practicals", () => {
    expect(direction.framing.rig).toBe("static");
    expect(direction.framing.fovDeg).toEqual([40, 50]);
    expect(direction.lighting.practicals).toBe(2);
  });
});
