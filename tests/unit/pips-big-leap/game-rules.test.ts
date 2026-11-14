// Pip's Big Leap pure game rules (audit 2026-10-29 rows C4, C6, C18, C20, C22).
import { describe, expect, it } from "vitest";
import { createFixedStepLoop, game } from "@aura3d/engine";
import { gateState } from "../../../apps/showcase-pips-big-leap/src/game/gate";
import { CAM_MIN_CLEARANCE, computeCameraClearance, computeFollowCameraPose, framingFor, horizontalFov } from "../../../apps/showcase-pips-big-leap/src/game/framing";
import { miniatureFramingFor } from "../../../apps/showcase-pips-big-leap/src/game/looks";
import { createInputLatch } from "../../../apps/showcase-pips-big-leap/src/game/simInput";
import { createSaveStore, recordSeeds, type PipSave } from "../../../apps/showcase-pips-big-leap/src/game/save";
import { expertSeconds, medalsFor } from "../../../apps/showcase-pips-big-leap/src/game/medals";
import { deriveWorldMotion } from "../../../apps/showcase-pips-big-leap/src/game/motion";
import { WORLDS, worldSpec } from "../../../apps/showcase-pips-big-leap/src/game/worlds";
import { buildWorld } from "../../../apps/showcase-pips-big-leap/src/game/world";
import { createPlayer, stepPlayer } from "../../../apps/showcase-pips-big-leap/src/game/player";

describe("Sun-Gate lock (C6)", () => {
  it("shows the lock while seeds are short or the boss is alive", () => {
    expect(gateState({ seeds: 4, gateSeeds: 4, boss: true, bossHp: 2 })).toMatchObject({ unlocked: false, lockVisible: true, bossBarring: true });
    expect(gateState({ seeds: 2, gateSeeds: 4, boss: true, bossHp: 0 })).toMatchObject({ unlocked: false, lockVisible: true });
    expect(gateState({ seeds: 3, gateSeeds: 4, boss: false, bossHp: 3 })).toMatchObject({ unlocked: false, lockVisible: true });
    expect(gateState({ seeds: 4, gateSeeds: 4, boss: true, bossHp: 0 })).toMatchObject({ unlocked: true, lockVisible: false });
    expect(gateState({ seeds: 5, gateSeeds: 4, boss: false, bossHp: 3 })).toMatchObject({ unlocked: true, lockVisible: false });
  });
});

describe("portrait framing (C18)", () => {
  it("keeps desktop framing and widens a 390x844 phone to about 34 deg horizontal", () => {
    expect(framingFor(1280 / 720)).toEqual({ fov: 52, boom: 4.5 });
    const phone = framingFor(390 / 844);
    expect(phone.fov).toBeCloseTo(68, 0);
    expect(phone.boom).toBeGreaterThan(5.5);
    expect(horizontalFov(52, 390 / 844)).toBeLessThan(26);
    expect(horizontalFov(phone.fov, 390 / 844)).toBeGreaterThan(33);
  });
});

describe("autopilot demo save (C4)", () => {
  const empty = (): PipSave => ({ version: 1, seeds: {}, completed: {}, bestTimes: {}, studio: { cap: "#c96a2b", cape: "#3f8cff" }, doubleJump: false, academyDone: false });
  it("never writes demo progress to storage and drops it when the demo stops", () => {
    const writes: PipSave[] = [];
    const store = createSaveStore({ load: empty, persist: (s) => writes.push(s) });
    store.setDemo(true);
    store.commit(recordSeeds(store.current(), "w1", ["w1-seed-1"]));
    store.commit({ ...store.current(), doubleJump: true, completed: { w1: true } });
    expect(writes).toHaveLength(0);
    expect(store.current().completed.w1).toBe(true);
    const back = store.setDemo(false);
    expect(back.completed.w1).toBeUndefined();
    expect(back.seeds.w1).toBeUndefined();
    expect(back.doubleJump).toBe(false);
    store.commit(recordSeeds(store.current(), "w1", ["w1-seed-2"]));
    expect(writes).toHaveLength(1);
    expect(writes[0]!.seeds.w1).toEqual(["w1-seed-2"]);
  });
});

describe("time-trial medals (C22)", () => {
  it("every world's medals equal the expert-run derivation", () => {
    for (const w of WORLDS) {
      const t = deriveWorldMotion(w).tuning;
      const expert = expertSeconds(w, t.moveSpeed, t.swimMoveSpeed);
      expect(w.medals, w.id).toEqual(medalsFor(expert));
      expect(w.medals.silver).toBeCloseTo(w.medals.gold * 1.5, -0.5);
      expect(w.medals.bronze).toBe(w.medals.gold * 2);
    }
    // World 1: about 69 m of course at 5.3 m/s, so gold sits near 21 s, not 75 s.
    expect(worldSpec("w1").medals.gold).toBeLessThan(30);
  });
});

describe("fixed-step sim (C20)", () => {
  // Run Pip forward for 2 s of wall time at a given display rate through the
  // same loop wiring main.ts uses (fixed 60 Hz steps, latched edge input).
  function runAt(hz: number, opts: { pressJumpOnFrame?: number } = {}) {
    const world = buildWorld(worldSpec("w1"));
    const p = createPlayer(world);
    const assist = game.jumpAssist({ coyoteMs: world.motion.tuning.coyoteMs, bufferMs: world.motion.tuning.jumpBufferMs });
    const latch = createInputLatch();
    let jumps = 0;
    const loop = createFixedStepLoop({
      stepSeconds: 1 / 60,
      maxCatchUpSteps: 6,
      maxFrameSeconds: 0.1,
      step: (dt) => {
        const edges = latch.consume();
        const ev = stepPlayer(p, world, { moveX: 0, moveZ: 1, jumpPressed: edges.jumpPressed, jumpHeld: false, divePressed: false, poundPressed: false }, dt, { doubleJump: false, assist });
        jumps += ev.filter((e) => e.kind === "jump").length;
      }
    });
    const z0 = p.z;
    const frames = Math.round(2 * hz);
    loop.tick(0);
    for (let f = 1; f <= frames; f += 1) {
      latch.latch({ jumpPressed: f === opts.pressJumpOnFrame, divePressed: false, poundPressed: false });
      loop.tick((f * 1000) / hz);
    }
    return { distance: Math.abs(p.z - z0), steps: loop.steps, jumps };
  }

  it("covers the same distance at 60, 120 and 144 Hz", () => {
    const a = runAt(60), b = runAt(120), c = runAt(144);
    expect(Math.abs(a.steps - b.steps)).toBeLessThanOrEqual(1);
    expect(Math.abs(a.steps - c.steps)).toBeLessThanOrEqual(1);
    expect(Math.abs(a.distance - b.distance)).toBeLessThan(0.1);
    expect(Math.abs(a.distance - c.distance)).toBeLessThan(0.1);
    expect(a.distance).toBeGreaterThan(5);
  });

  it("keeps a jump pressed on a frame that runs no step, and does not repeat it", () => {
    // At 144 Hz some frames run zero steps; try a run of consecutive frames.
    for (let f = 10; f < 16; f += 1) expect(runAt(144, { pressJumpOnFrame: f }).jumps).toBe(1);
  });

  it("a slow frame (0.8 fps) runs catch-up steps instead of one clamped 0.05 s step", () => {
    const slow = runAt(1.25);
    // Three frames of 0.8 s are clamped to 0.1 s of sim each: 18 steps (0.3 s),
    // where the old variable step advanced 3 x 0.05 = 0.15 s.
    expect(slow.steps).toBe(18);
  });
});

describe("follow-camera clearance and checkpoint framing", () => {
  it("keeps full 4.5 m boom at spawn and at every checkpoint across all 7 worlds (including archways ahead of checkpoints)", () => {
    const framing = miniatureFramingFor(16 / 9);
    for (const w of WORLDS) {
      const built = buildWorld(w);
      const points = [
        { id: "spawn", x: w.spawn[0], y: w.spawn[1], z: w.spawn[2], yaw: w.spawnYaw },
        ...w.checkpoints.map((cp) => ({ id: cp.id, x: cp.x, y: cp.y, z: cp.z, yaw: cp.yaw ?? w.spawnYaw }))
      ];
      for (const pt of points) {
        const fwdX = Math.sin(pt.yaw);
        const fwdZ = Math.cos(pt.yaw);
        const desiredX = pt.x - fwdX * framing.boom;
        const desiredZ = pt.z - fwdZ * framing.boom;
        const desiredY = pt.y + framing.lift;
        const clearance = computeCameraClearance(pt, built.cameraObstacles, desiredX, desiredZ, desiredY);
        expect(clearance, `${w.id}:${pt.id}`).toBe(1);
      }
    }
  });

  it("ignores obstacles in front of Pip or touching Pip's side, and keeps Pip's full body framed even at minimum clearance", () => {
    const framing = miniatureFramingFor(16 / 9);
    const p = { x: 0, y: 1.85, z: -22 };
    // Obstacle directly ahead (-Z) while boom goes backward (+Z): must never pull camera in.
    expect(
      computeCameraClearance(
        p,
        [{ x: 0, z: -23.0, baseY: 1.85, radius: 1.6, height: 3.4 }],
        0,
        p.z + framing.boom,
        p.y + framing.lift
      )
    ).toBe(1);

    // Genuine solid pillar 3.2 m directly behind Pip (+Z) shortens gently (>= CAM_MIN_CLEARANCE) and keeps Pip's feet in view.
    const blocked = computeCameraClearance(
      p,
      [{ x: 0, z: -18.8, baseY: 1.85, radius: 0.5, height: 3.4 }],
      0,
      p.z + framing.boom,
      p.y + framing.lift
    );
    expect(blocked).toBeGreaterThanOrEqual(CAM_MIN_CLEARANCE);
    expect(blocked).toBeLessThan(1);

    const minPose = computeFollowCameraPose({
      x: p.x,
      y: p.y,
      z: p.z,
      camYaw: Math.PI,
      baseBoom: framing.boom,
      baseLift: framing.lift,
      targetLift: 0.55,
      fov: framing.fov,
      clearance: CAM_MIN_CLEARANCE
    });
    const distXZ = Math.hypot(minPose.position[0] - p.x, minPose.position[2] - p.z);
    expect(distXZ).toBeGreaterThan(2.8);
    // Sightline Y at Pip's Z plane + vertical frustum half-height must keep Pip's feet (p.y) well inside the frame.
    const totalZ = Math.abs(minPose.position[2] - minPose.target[2]);
    const fracAtPip = Math.abs(minPose.position[2] - p.z) / totalZ;
    const centerRayY = minPose.position[1] + (minPose.target[1] - minPose.position[1]) * fracAtPip;
    const halfFrustumY = Math.hypot(distXZ, minPose.position[1] - centerRayY) * Math.tan((minPose.fov * Math.PI) / 360);
    expect(centerRayY - halfFrustumY).toBeLessThan(p.y - 0.15);
    expect(centerRayY + halfFrustumY).toBeGreaterThan(p.y + 1.45);
  });

  it("aligns checkpoint respawn yaw down the course even when Pip touches the checkpoint sideways", () => {
    const built = buildWorld(worldSpec("w1"));
    const p = createPlayer(built);
    const cp = built.checkpoints[0]!;
    p.x = cp.x - 0.5;
    p.y = cp.y;
    p.z = cp.z;
    p.yaw = Math.PI / 2;
    p.camYaw = Math.PI / 2;
    const assist = game.jumpAssist({ coyoteMs: 120, bufferMs: 140 });
    const ev = stepPlayer(p, built, { moveX: 1, moveZ: 0, jumpPressed: false, jumpHeld: false, divePressed: false, poundPressed: false }, 1 / 60, { doubleJump: false, assist });
    expect(ev.some((e) => e.kind === "checkpoint")).toBe(true);
    expect(p.checkpoint.yaw).toBeCloseTo(built.spec.spawnYaw, 6);
  });
});
