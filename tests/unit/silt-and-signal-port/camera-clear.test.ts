import { describe, expect, it } from "vitest";
import { createSim, stepSim, type Input } from "../../../examples/silt-and-signal-port/sim";
import {
  CAMERA_MARGIN,
  INKED_CHASE,
  chaseEyeBlocked,
  chaseTargetForEye,
  clearChaseEye,
  createChaseClearance,
  sceneryColumns,
  wantedChaseEye
} from "../../../examples/silt-and-signal-port/camera";
import { limitLookLag } from "../../../examples/shared/camera-guard";
import { createTerrain } from "../../../examples/silt-and-signal-port/terrain";
import { pushOut } from "../../../examples/silt-and-signal-port/collide";

const FLY_BOOST: Input = { throttle: 1, steer: 0.4, lift: 0, brake: false, boost: true, interact: false };
const FLY: Input = { throttle: 1, steer: 0, lift: 0, brake: false, boost: false, interact: false };
const SCENERY = sceneryColumns(createTerrain(0).props());

/** The flight the screenshot lane used: objective 2 of chapter 0, boosting and steering, then straight. */
function fly(onFrame: (sim: ReturnType<typeof createSim>) => void): void {
  const sim = createSim(0, 2);
  for (let i = 0; i < 900; i += 1) {
    stepSim(sim, i < 300 ? FLY_BOOST : FLY);
    if (i % 3 === 0) onFrame(sim);
  }
}

describe("Duneglide chase camera clearance", () => {
  it("the unobstructed chase eye does sit inside scenery during chapter-0 flight (the defect)", () => {
    let blockedFrames = 0;
    fly((sim) => {
      const e = wantedChaseEye(sim);
      if (chaseEyeBlocked(sim.world, SCENERY)(e[0], e[1], e[2])) blockedFrames += 1;
    });
    expect(blockedFrames).toBeGreaterThan(0);
  });

  it("the cleared eye leaves almost no frame inside scenery, and what remains is at the minimum distance", () => {
    const clearance = createChaseClearance();
    const blocked = chaseEyeBlocked;
    let frames = 0, unclearedBlocked = 0, clearedBlocked = 0, remainingFarFromRider = 0;
    fly((sim) => {
      const wanted = wantedChaseEye(sim);
      const e = clearChaseEye(sim, clearance, 3 / 60, SCENERY);
      frames += 1;
      if (blocked(sim.world, SCENERY)(wanted[0], wanted[1], wanted[2])) unclearedBlocked += 1;
      if (blocked(sim.world, SCENERY)(e[0], e[1], e[2])) {
        clearedBlocked += 1;
        // the only frames left are ones where even the minimum distance behind the rider is inside scenery
        if (Math.hypot(e[0] - sim.state.x, e[1] - (sim.state.y + 2.2), e[2] - sim.state.z) > 2.6) remainingFarFromRider += 1;
      }
    });
    expect(frames).toBeGreaterThan(200);
    expect(unclearedBlocked).toBeGreaterThan(0);
    expect(clearedBlocked).toBeLessThanOrEqual(Math.max(1, Math.floor(unclearedBlocked * 0.15)));
    expect(remainingFarFromRider).toBe(0);
  });

  it("keeps the margin to every collider while flying, so a wall never fills the view", () => {
    const clearance = createChaseClearance();
    let worst = Infinity;
    fly((sim) => {
      const e = clearChaseEye(sim, clearance, 3 / 60, SCENERY);
      for (const c of sim.world.colliders ?? []) {
        // distance from the eye to the collider's footprint edge, only where the eye is inside its height band
        if (e[1] < c.bottom - 0.6 || e[1] > c.top + 0.6) continue;
        const inside = pushOut({ x: e[0], y: e[1], z: e[2] }, c, CAMERA_MARGIN - 0.05, 0.6) !== null;
        if (inside) worst = Math.min(worst, 0);
      }
    });
    expect(worst).toBe(Infinity);
  });

  it("an open-air chapter keeps the full chase distance", () => {
    const sim = createSim(2, 0);
    const clearance = createChaseClearance();
    for (let i = 0; i < 60; i += 1) stepSim(sim, FLY);
    const wanted = wantedChaseEye(sim);
    const eye = clearChaseEye(sim, clearance, 1 / 60, SCENERY);
    expect(Math.hypot(eye[0] - wanted[0], eye[1] - wanted[1], eye[2] - wanted[2])).toBeLessThan(1e-6);
  });

  it("includes houses in sceneryColumns and smoothly damps chase arm yaw across rapid turns", () => {
    const props = createTerrain(0).props();
    expect(props.houses.length).toBeGreaterThan(0);
    const cols = sceneryColumns(props);
    const colsWithoutHouses = sceneryColumns({ trees: props.trees, rocks: props.rocks, stone: props.stone, brass: props.brass });
    expect(cols.length).toBe(colsWithoutHouses.length + props.houses.length);
    const firstHouse = props.houses[0]!;
    const sim = createSim(2, 0);
    expect(chaseEyeBlocked({ floor: () => -100, colliders: [] }, cols)(firstHouse.x, firstHouse.y + 0.4, firstHouse.z)).toBe(true);

    const clearance = createChaseClearance();
    sim.state.yaw = 0;
    const eye0 = clearChaseEye(sim, clearance, 1 / 60);
    expect(eye0).toEqual(wantedChaseEye(sim));

    sim.state.yaw = Math.PI / 2;
    const rawWanted = wantedChaseEye(sim);
    const damped = clearChaseEye(sim, clearance, 1 / 120);
    const stepFromPrev = Math.hypot(damped[0] - eye0[0], damped[2] - eye0[2]);
    const rawJump = Math.hypot(rawWanted[0] - eye0[0], rawWanted[2] - eye0[2]);
    expect(stepFromPrev).toBeGreaterThan(0);
    expect(stepFromPrev).toBeLessThan(rawJump * 0.3);

    clearance.reset();
    const afterReset = clearChaseEye(sim, clearance, 1 / 120);
    expect(Math.hypot(afterReset[0] - rawWanted[0], afterReset[1] - rawWanted[1], afterReset[2] - rawWanted[2])).toBeLessThan(1e-6);
  });

  it("keeps both hover-skiff and signal-courier cleanly framed in lower-middle viewport during sharp left/right turns and wall pull-ins", () => {
    const projectScreen = (
      pt: readonly [number, number, number],
      eye: readonly [number, number, number],
      target: readonly [number, number, number],
      fovDeg = 62,
      aspect = 16 / 9
    ) => {
      let fx = target[0] - eye[0], fy = target[1] - eye[1], fz = target[2] - eye[2];
      const fl = Math.hypot(fx, fy, fz) || 1;
      fx /= fl; fy /= fl; fz /= fl;
      // right = normalize(cross(forward, up=[0,1,0])) = normalize([-fz, 0, fx])
      let rx = -fz, ry = 0, rz = fx;
      const rl = Math.hypot(rx, ry, rz) || 1;
      rx /= rl; rz /= rl;
      // camUp = cross(right, forward)
      const ux = ry * fz - rz * fy;
      const uy = rz * fx - rx * fz;
      const uz = rx * fy - ry * fx;
      const dx = pt[0] - eye[0], dy = pt[1] - eye[1], dz = pt[2] - eye[2];
      const camZ = dx * fx + dy * fy + dz * fz;
      const camX = dx * rx + dy * ry + dz * rz;
      const camY = dx * ux + dy * uy + dz * uz;
      const tanHalf = Math.tan((fovDeg * Math.PI) / 360);
      const ndcX = camX / (camZ * tanHalf * aspect);
      const ndcY = camY / (camZ * tanHalf);
      return {
        inFront: camZ > 0.3,
        xNorm: 0.5 + 0.5 * ndcX,
        yNorm: 0.5 - 0.5 * ndcY
      };
    };

    expect(INKED_CHASE.side).toBe(0);

    for (const steer of [0, -1, 1] as const) {
      const sim = createSim(0, 0);
      const clearance = createChaseClearance();
      let look: [number, number, number] | null = null;
      const dt = 1 / 60;
      for (let frame = 0; frame < 180; frame++) {
        stepSim(sim, { throttle: 1, steer, lift: 0, brake: false, boost: frame > 90, interact: false });
        const eye = clearChaseEye(sim, clearance, dt, SCENERY, INKED_CHASE);
        const wantedTarget = chaseTargetForEye(sim, eye, INKED_CHASE);
        if (!look) {
          look = [...wantedTarget];
        } else {
          const k = 1 - Math.exp(-dt * 16);
          look = [
            look[0] + (wantedTarget[0] - look[0]) * k,
            look[1] + (wantedTarget[1] - look[1]) * k,
            look[2] + (wantedTarget[2] - look[2]) * k
          ];
          look = limitLookLag(look, wantedTarget, 2.2);
        }

        const skiffProj = projectScreen([sim.state.x, sim.state.y - 1.25, sim.state.z], eye, look);
        const headProj = projectScreen([sim.state.x, sim.state.y + 0.45, sim.state.z], eye, look);
        expect(skiffProj.inFront, `steer=${steer} f=${frame} skiff inFront`).toBe(true);
        expect(headProj.inFront, `steer=${steer} f=${frame} head inFront`).toBe(true);
        // Never drift into bottom-left/right corner or slice below the bottom viewport edge
        expect(skiffProj.xNorm, `steer=${steer} f=${frame} skiff xNorm`).toBeGreaterThan(0.38);
        expect(skiffProj.xNorm, `steer=${steer} f=${frame} skiff xNorm`).toBeLessThan(0.62);
        expect(skiffProj.yNorm, `steer=${steer} f=${frame} skiff yNorm`).toBeGreaterThan(0.55);
        expect(skiffProj.yNorm, `steer=${steer} f=${frame} skiff yNorm`).toBeLessThan(0.85);
        expect(headProj.yNorm, `steer=${steer} f=${frame} head yNorm`).toBeGreaterThan(0.10);
        expect(headProj.yNorm, `steer=${steer} f=${frame} head yNorm`).toBeLessThan(0.76);
      }
    }

    // Even under extreme minimum-distance wall pull-in (2.4 m behind rider), skiff & courier stay inside viewport
    const simPull = createSim(0, 0);
    stepSim(simPull, FLY);
    const pulledEye: [number, number, number] = [simPull.state.x, simPull.state.y + 0.4, simPull.state.z + 2.4];
    const pulledTarget = chaseTargetForEye(simPull, pulledEye, INKED_CHASE);
    const pulledSkiff = projectScreen([simPull.state.x, simPull.state.y - 1.25, simPull.state.z], pulledEye, pulledTarget);
    expect(pulledSkiff.inFront).toBe(true);
    expect(pulledSkiff.yNorm).toBeLessThan(0.9);
  });
});
