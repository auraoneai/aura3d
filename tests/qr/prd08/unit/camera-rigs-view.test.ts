/**
 * R-5..R-8 + Q-2/C-9/C-10 — view rigs (shoulder parity, orbit, topDown,
 * altitude), the rail rig, and the collision probe/damper (PRD-08 §16).
 */
import { describe, expect, it } from "vitest";
import { createShoulderCamera } from "@aura3d/engine";
import {
  createAltitudeRig,
  createCameraProbe,
  createCollisionDamper,
  createOrbitRig,
  createRailRig,
  createShoulderRig,
  createTopDownRig,
  type AuraOrbitRig
} from "@aura3d/engine/lanes";
import type { AuraCameraSubject } from "@aura3d/engine/contracts";
import { ASPECT, NO_PROBE, project, run, subjectAt, type V3 } from "./rigTestKit.js";

describe("R-5 shoulder — parity with createShoulderCamera", () => {
  it("matches the legacy helper to 1e-6 with no collider", () => {
    const rig = createShoulderRig({ target: "hero", side: "right" });
    const legacy = createShoulderCamera({ side: "right" });
    // createShoulderCamera's facing convention: forward = [sin(f),0,-cos(f)].
    const facingOf = (f: V3) => Math.atan2(f[0], -f[2]);

    for (let i = 0; i < 90; i++) {
      const t = i / 60;
      const yaw = Math.sin(t * 0.7) * 0.8;
      const forward: V3 = [Math.sin(yaw), 0, -Math.cos(yaw)]; // shoulder-convention yaw
      const s = subjectAt([t * 3, 0, Math.cos(t) * 2], { forward });
      const pose = rig.update({
        dt: 1 / 60,
        time: t * 1000,
        aspect: ASPECT,
        previous: { position: [0, 0, 0], target: [0, 0, 1], up: [0, 1, 0], roll: 0, fov: 55, near: 0.05, far: 100 },
        subject: (ref) => (ref === "hero" ? s : undefined),
        probe: NO_PROBE
      });
      const snap = legacy.update(1 / 60, { position: [...s.position] as [number, number, number], facing: facingOf(forward) });
      for (let a = 0; a < 3; a++) {
        expect(Math.abs(pose.position[a] - snap.position[a])).toBeLessThan(1e-6);
        expect(Math.abs(pose.target[a] - snap.target[a])).toBeLessThan(1e-6);
      }
      expect(pose.fov).toBeCloseTo(snap.fov, 6);
    }
  });
});

describe("R-6 orbit", () => {
  const staticT = subjectAt([0, 0, 0]);

  it("clamps pitch to pitchLimits", () => {
    const rig = createOrbitRig({ target: "t", distance: 5, pitchLimits: [-30, 60] }) as AuraOrbitRig;
    rig.setAngles(0, 89);
    const poses = run(rig, 90, 1 / 60, () => ({ t: staticT }));
    const last = poses.at(-1)!;
    const pitch = Math.asin((last.position[1] - last.target[1]) / 5);
    expect(pitch * (180 / Math.PI)).toBeLessThanOrEqual(60.5);
    rig.setAngles(0, -89);
    const last2 = run(rig, 90, 1 / 60, () => ({ t: staticT })).at(-1)!;
    const pitch2 = Math.asin((last2.position[1] - last2.target[1]) / 5);
    expect(pitch2 * (180 / Math.PI)).toBeGreaterThanOrEqual(-30.5);
  });

  it("a 100 px drag changes target yaw by 25° ± 0.1°", () => {
    const rig = createOrbitRig({ target: "t", distance: 5, yaw: 0, pitch: 0 }) as AuraOrbitRig;
    rig.dragBy(100, 0, 0.25);
    const last = run(rig, 120, 1 / 60, () => ({ t: staticT })).at(-1)!;
    const eyeYaw = Math.atan2(last.position[0] - last.target[0], last.position[2] - last.target[2]);
    expect(eyeYaw * (180 / Math.PI)).toBeCloseTo(-25, 1);
  });
});

describe("R-7 topDown", () => {
  it("frames all four arena edges with the target at a corner (arena < frame)", () => {
    const rig = createTopDownRig({
      target: "hero",
      height: 14,
      fov: 45,
      pitchDeg: 90,
      bounds: { min: [-4, 0, -4], max: [4, 0, 4] }
    });
    const script = (): Record<string, AuraCameraSubject> => ({ hero: subjectAt([4, 0, 4]) });
    const last = run(rig, 60, 1 / 60, script).at(-1)!;
    for (const [x, z] of [
      [-4, -4],
      [-4, 4],
      [4, -4],
      [4, 4]
    ]) {
      const ndc = project([x, 0, z], last);
      expect(Math.abs(ndc.x), `corner ${x},${z} x`).toBeLessThanOrEqual(1.0001);
      expect(Math.abs(ndc.y), `corner ${x},${z} y`).toBeLessThanOrEqual(1.0001);
    }
  });

  it("pitchDeg 90 stays finite (up-vector degeneracy rule)", () => {
    const rig = createTopDownRig({ target: "hero", pitchDeg: 90, height: 10 });
    const last = run(rig, 30, 1 / 60, () => ({ hero: subjectAt([1, 0, -2]) })).at(-1)!;
    expect(Number.isFinite(last.position[0])).toBe(true);
    expect(Number.isFinite(last.position[1])).toBe(true);
    const ndc = project([0, 0, 0], last);
    expect(Number.isFinite(ndc.x)).toBe(true);
    expect(Number.isFinite(ndc.y)).toBe(true);
  });
});

describe("R-8 altitude", () => {
  for (const alt of [2, 20, 80]) {
    it(`keeps ground + goal inside NDC ±0.9 and subject fraction 0.08–0.12 at ${alt} u`, () => {
      const rig = createAltitudeRig({
        target: "hero",
        ground: [0, 0, 0],
        goal: "goal",
        maxDistance: 220
      });
      // Lander pad goal near the subject's nadir (aurora-lander semantics).
      const script = (): Record<string, AuraCameraSubject> => ({
        hero: subjectAt([0, alt, 0]),
        goal: subjectAt([10, 0, 25])
      });
      const last = run(rig, 90, 1 / 60, script).at(-1)!;
      for (const pt of [[0, 0, 0] as V3, [10, 0, 25] as V3]) {
        const ndc = project(pt, last);
        expect(Math.abs(ndc.x), `${pt} x`).toBeLessThanOrEqual(0.9);
        expect(Math.abs(ndc.y), `${pt} y`).toBeLessThanOrEqual(0.9);
      }
      // Subject height fraction: projected y-extent of the bounds' silhouette
      // (a pitched camera foreshortens the world-Y axis).
      const ys = [-0.4, 0.4].flatMap((sx) =>
        [-0.9, 0.9].flatMap((sy) =>
          [-0.4, 0.4].map((sz) => project([sx, alt + sy, sz], last).y)
        )
      );
      const fraction = (Math.max(...ys) - Math.min(...ys)) / 2;
      expect(fraction).toBeGreaterThanOrEqual(0.08);
      expect(fraction).toBeLessThanOrEqual(0.12);
    });
  }
});

describe("Q-2 rail", () => {
  it("follows the closed spline deterministically without a NaN pose", () => {
    const rig = createRailRig({
      points: [
        [0, 2, 0],
        [4, 2, 0],
        [4, 2, 4],
        [0, 2, 4]
      ],
      duration: 4,
      loop: "loop",
      lookAt: [0, 1, 2]
    });
    const poses = run(rig, 480, 1 / 60, () => ({})); // 8 s = 2 loops
    for (const p of poses) {
      expect(Number.isFinite(p.position[0])).toBe(true);
      expect(Number.isFinite(p.position[1])).toBe(true);
      expect(Number.isFinite(p.position[2])).toBe(true);
    }
    // Loop wraps back onto the start of the spline (no end snap).
    const atLoopEnd = poses[239];
    const atLoopStart = poses[0];
    const d = Math.hypot(
      atLoopEnd.position[0] - atLoopStart.position[0],
      atLoopEnd.position[1] - atLoopStart.position[1],
      atLoopEnd.position[2] - atLoopStart.position[2]
    );
    expect(d).toBeLessThan(0.5);
  });

  it("supports a second spline as the look-at track and a per-point FOV track", () => {
    const rig = createRailRig({
      points: [
        [0, 1, 0],
        [10, 1, 0]
      ],
      duration: 2,
      lookAt: [
        [0, 0, 5],
        [10, 0, -5]
      ],
      fov: [30, 70]
    });
    const poses = run(rig, 120, 1 / 60, () => ({}));
    // At u ≈ 0 the look point is near [0,0,5]; near the end it approaches [10,0,-5].
    expect(poses[0].target[2]).toBeGreaterThan(0);
    expect(poses.at(-1)!.target[2]).toBeLessThan(4);
    // FOV track interpolates with the same u (ease inOutSine leaves ends at 30/70).
    expect(poses[0].fov).toBeCloseTo(30, 0);
    expect(poses.at(-1)!.fov).toBeGreaterThan(60);
  });
});

describe("C-9 probe / C-10 damper", () => {
  it("AABB tier reports a hit with the correct distance, and respects ignore()", () => {
    const probe = createCameraProbe({
      bounds: () => [
        { id: "wall", min: [-1, -1, -1], max: [1, 1, 1] },
        { id: "hero", min: [-0.5, -0.5, 4.5], max: [0.5, 0.5, 5.5] }
      ],
      ignore: (id) => id === "hero"
    });
    const hit = probe.sphereCast([0, 0, 5], [0, 0, -5], 0.2);
    expect(hit.hit).toBe(true);
    expect(hit.node).toBe("wall");
    expect(hit.distance).toBeCloseTo(3.8, 2); // face at z=1.2 (box + r) → 5 − 1.2
    const miss = probe.sphereCast([5, 0, 5], [5, 0, -5], 0.2);
    expect(miss.hit).toBe(false);
    expect(probe.occluders([0, 0, 5], [0, 0, -5])).toEqual(["wall"]);
  });

  it("damper pulls in fast and pushes out slowly, never through geometry", () => {
    const box = { id: "wall", min: [-1, -1, -1] as V3, max: [1, 1, 1] as V3 };
    const lookAt: V3 = [0, 0, -3];
    // Pull-in: first frame snaps to the allowed distance (face at -1, r 0.2 →
    // entry t at -1.2 from lookAt, distance 1.8, backoff 0.1 → 1.7 → z ≈ -1.3).
    let walled = true;
    const probe = createCameraProbe({ bounds: () => (walled ? [box] : []) });
    const damper = createCollisionDamper(probe, { radius: 0.2 });
    const first = damper.resolve(lookAt, [0, 0, 3], 1 / 60);
    expect(first[2]).toBeLessThanOrEqual(-1.19); // stops before the wall face
    // Never overshoots geometry: sustained resolves stay outside the box.
    for (let i = 0; i < 30; i++) {
      const eye = damper.resolve(lookAt, [0, 0, 3], 1 / 60);
      expect(eye[2]).toBeLessThanOrEqual(-1);
    }
    // Push-out: wall removed → the eye returns slowly (hl 0.35 s).
    walled = false;
    const early = damper.resolve(lookAt, [0, 0, 3], 1 / 60);
    expect(early[2]).toBeLessThan(-0.5);
    for (let i = 0; i < 240; i++) damper.resolve(lookAt, [0, 0, 3], 1 / 60); // 4 s
    const late = damper.resolve(lookAt, [0, 0, 3], 1 / 60);
    expect(late[2]).toBeCloseTo(3, 1);
  });
});
