/**
 * R-1..R-4 — follow-family rig assertions (PRD-08 §16). Shared harness in
 * `rigTestKit.ts`; each `run` drives `AuraCameraRig.update(ctx)` directly.
 */
import { describe, expect, it } from "vitest";
import {
  cameraQuatFromEulerXYZ,
  cameraQuatMultiply,
  cameraQuatRotateVec3,
  createChaseRig,
  createFightingRig,
  createFlightRig,
  createFollow2dRig,
  createFromSpecRig
} from "@aura3d/engine/lanes";
import type { AuraCameraRigContext, AuraCameraSubject } from "@aura3d/engine/contracts";
import { cameraYawOf, dist3, project, run, subjectAt, wrapPi, type V3 } from "./rigTestKit.js";

describe("R-1 chase", () => {
  const SPEED = 20;
  const straight = (t: number): Record<string, AuraCameraSubject> => ({
    hero: subjectAt([0, 0, SPEED * t], { velocity: [0, 0, SPEED], forward: [0, 0, 1] })
  });
  const rig = () =>
    createChaseRig({
      target: "hero",
      height: 0,
      lookHeight: 0,
      distance: { base: 4, perSpeed: 0.1, max: 8 }, // → 6 at 20 u/s
      fov: { base: 50, perSpeed: 0.5, max: 65 }, // → 60 at 20 u/s
      lookAhead: { seconds: 0.35, max: 3 },
      bank: { gain: 0, maxDeg: 0, halflife: 0.1 }
    });

  it("keeps eye distance within 2% of distance(v) on a straight run", () => {
    const poses = run(rig(), 120, 1 / 60, straight); // 2 s settle
    const last = poses.at(-1)!;
    const hero = straight(119 / 60).hero;
    expect(Math.abs(dist3(last.position, hero.position) - 6) / 6).toBeLessThan(0.02);
    // Projected subject centre stays within 3% of frame height at rest.
    const ys = poses.slice(60).map((p, i) => project([0, 0, SPEED * ((i + 60) / 60)], p).y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(0.06);
  });

  it("FOV at maxSpeed equals base + perSpeed·v clamped to max", () => {
    expect(run(rig(), 120, 1 / 60, straight).at(-1)!.fov).toBeCloseTo(60, 1);
  });

  it("legacy smoothing 0.045 follow fails the same distance assertion", () => {
    const legacy = createFromSpecRig(
      { mode: "follow", targetNode: "hero", distance: 6, smoothing: 0.045 },
      {
        runtimeTarget: (ctx: AuraCameraRigContext) => {
          const s = ctx.subject("hero");
          return s ? { position: s.position, rotationY: 0 } : undefined;
        }
      }
    );
    const last = run(legacy, 120, 1 / 60, straight).at(-1)!;
    const hero = straight(119 / 60).hero;
    expect(Math.abs(dist3(last.position, hero.position) - 6) / 6).toBeGreaterThan(0.02);
  });

  it("lags subject yaw by 5°–25° through a 90° turn at 20 u/s", () => {
    const turnStart = 1;
    const turnLen = 1;
    const script = (t: number): Record<string, AuraCameraSubject> => {
      const u = Math.min(1, Math.max(0, (t - turnStart) / turnLen));
      const theta = u * (Math.PI / 2); // heading 0 → +90°
      const f: V3 = [Math.sin(theta), 0, Math.cos(theta)];
      const v: V3 = [f[0] * SPEED, f[1] * SPEED, f[2] * SPEED];
      const dLeg = SPEED * Math.max(0, t - turnStart);
      const legPos: V3 =
        t <= turnStart
          ? [0, 0, SPEED * t]
          : [dLeg * Math.SQRT1_2, 0, SPEED * turnStart + dLeg * Math.SQRT1_2];
      return { hero: subjectAt(legPos, { velocity: v, forward: f }) };
    };
    const poses = run(rig(), 180, 1 / 60, script);
    const midT = turnStart + turnLen / 2;
    const mid = poses[Math.floor(midT * 60)];
    const heroMid = script(midT).hero;
    const subjectYaw = Math.atan2(heroMid.forward[0], heroMid.forward[2]);
    const lag = Math.abs(wrapPi(subjectYaw - cameraYawOf(mid, heroMid.position)));
    expect(lag * (180 / Math.PI)).toBeGreaterThan(5);
    expect(lag * (180 / Math.PI)).toBeLessThan(25);
  });
});

describe("R-2 flight", () => {
  const flying = (euler: V3, position: V3 = [0, 50, 0]): AuraCameraSubject => {
    const q = cameraQuatFromEulerXYZ(euler);
    const forward = cameraQuatRotateVec3(q, [0, 0, -1]);
    const s = subjectAt(position, { forward, velocity: [0, 0, -20] });
    return { ...s, rotation: q } as AuraCameraSubject;
  };

  it("follows a 30° pitched subject with camera pitch ≥ 20°", () => {
    const rig = createFlightRig({ target: "hero", horizonLock: 0.3, height: 0.6 });
    const last = run(rig, 120, 1 / 60, () => ({ hero: flying([-Math.PI / 6, 0, 0]) })).at(-1)!;
    const d = [
      last.target[0] - last.position[0],
      last.target[1] - last.position[1],
      last.target[2] - last.position[2]
    ];
    const pitch = Math.asin(d[1] / Math.hypot(d[0], d[1], d[2]));
    expect(Math.abs(pitch) * (180 / Math.PI)).toBeGreaterThanOrEqual(20);
  });

  it("bank: rolled 60° → 36° ± 1° (maxDeg 45) / 25° ± 0.5° (default)", () => {
    const pose45 = run(
      createFlightRig({ target: "hero", bank: { gain: 0.6, maxDeg: 45, halflife: 0.2 } }),
      180,
      1 / 60,
      () => ({ hero: flying([0, 0, Math.PI / 3]) })
    ).at(-1)!;
    expect(pose45.roll * (180 / Math.PI)).toBeCloseTo(36, 0);
    const pose25 = run(createFlightRig({ target: "hero" }), 180, 1 / 60, () => ({
      hero: flying([0, 0, Math.PI / 3])
    })).at(-1)!;
    expect(pose25.roll * (180 / Math.PI)).toBeCloseTo(25, 0);
  });

  it("keeps ≥15% of the frame on the ground plane in a 60° banked turn at 50 m", () => {
    const rig = createFlightRig({ target: "hero", bank: { gain: 0.6, maxDeg: 45, halflife: 0.2 } });
    let worst = Infinity;
    run(rig, 240, 1 / 60, (t) => {
      const yaw = t * 0.8;
      const q = cameraQuatMultiply(
        cameraQuatFromEulerXYZ([0, yaw, 0]),
        cameraQuatFromEulerXYZ([0, 0, Math.PI / 3])
      );
      const forward = cameraQuatRotateVec3(q, [0, 0, -1]);
      const s = subjectAt([Math.sin(yaw) * 40, 50, Math.cos(yaw) * 40], { forward, velocity: [0, 0, -20] });
      return { hero: { ...s, rotation: q } as AuraCameraSubject };
    }).forEach((pose) => {
      const f: V3 = [
        pose.target[0] - pose.position[0],
        pose.target[1] - pose.position[1],
        pose.target[2] - pose.position[2]
      ];
      const L = Math.hypot(f[0], f[1], f[2]) || 1;
      const groundAhead: V3 = [
        pose.position[0] + (f[0] / L) * 500,
        0,
        pose.position[2] + (f[2] / L) * 500
      ];
      worst = Math.min(worst, (project(groundAhead, pose).y + 1) / 2);
    });
    expect(worst).toBeGreaterThanOrEqual(0.15);
  });
});

describe("R-3 follow2d", () => {
  const rig = () => createFollow2dRig({ target: "hero", distance: 10, fov: 50 });

  it("jump inside the dead zone causes no vertical camera motion until landing", () => {
    // y(t): hop of amplitude 0.5 — dead-zone half-height ≈ tan(25°)·10·0.22 ≈ 1.03
    const hop = (t: number): Record<string, AuraCameraSubject> => {
      const y = t < 0.6 ? Math.sin(Math.PI * (t / 0.6)) * 0.5 : 0;
      const vy = t < 0.6 ? (Math.PI / 0.6) * Math.cos(Math.PI * (t / 0.6)) * 0.5 : 0;
      return { hero: subjectAt([0, y, 0], { velocity: [0, vy, 0], forward: [1, 0, 0] }) };
    };
    const poses = run(rig(), 120, 1 / 60, hop);
    const ys = poses.map((p) => p.position[1]);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(1e-6);
  });

  it("landing 2 u higher moves camera Y to the new rest within 0.4 s", () => {
    const step = (t: number): Record<string, AuraCameraSubject> => ({
      hero: subjectAt([0, t < 1 ? 0 : 2, 0], { forward: [1, 0, 0] })
    });
    const poses = run(rig(), 90, 1 / 60, step); // settle 1 s, hop, measure to 1.4 s
    const at14 = poses[Math.floor(1.4 * 60)];
    expect(Math.abs(at14.position[1] - 2)).toBeLessThan(0.15);
  });

  it("reversing facing moves the lead to the other side within 0.5 s", () => {
    // Narrow dead zone so the flipped lead must visibly cross the frame.
    const flip = (t: number): Record<string, AuraCameraSubject> => ({
      hero: subjectAt([0, 0, 0], { forward: t < 1 ? [1, 0, 0] : [-1, 0, 0] })
    });
    const poses = run(
      createFollow2dRig({ target: "hero", distance: 10, fov: 50, deadZone: { x: 0.02, y: 0.02 } }),
      120,
      1 / 60,
      flip
    );
    const at16 = poses[Math.floor(1.6 * 60)];
    // Lead flipped: camera centre tracked to subject.x − lead.
    expect(at16.position[0]).toBeLessThan(-0.5);
  });
});

describe("R-4 fighting", () => {
  const band = (x: number): number => (x + 1) / 2; // NDC → [0,1]

  for (const sep of [1, 6]) {
    it(`keeps both fighters inside the 15%–85% band at ${sep} u separation`, () => {
      const rig = createFightingRig({ fighters: ["a", "b"], side: 1 });
      const script = (): Record<string, AuraCameraSubject> => ({
        a: subjectAt([-sep / 2, 0, 0]),
        b: subjectAt([sep / 2, 0, 0])
      });
      const last = run(rig, 120, 1 / 60, script).at(-1)!;
      for (const fighter of [-sep / 2, sep / 2]) {
        const f = band(project([fighter, 0, 0], last).x);
        expect(f).toBeGreaterThanOrEqual(0.15);
        expect(f).toBeLessThanOrEqual(0.85);
      }
      expect(last.fov).toBe(45); // constant — zoom on distance only
    });
  }

  it("stays on the fight-plane normal through a 10 s scripted fight", () => {
    const rig = createFightingRig({ fighters: ["a", "b"], side: -1 });
    let worstDeg = 0;
    run(rig, 600, 1 / 60, (t) => ({
      a: subjectAt([-1.5 + Math.sin(t) * 0.5, 0, Math.cos(t * 0.7) * 0.3]),
      b: subjectAt([1.5 - Math.sin(t * 0.9) * 0.5, 0, Math.sin(t * 1.1) * 0.3])
    })).forEach((pose) => {
      // Eye offset from the midpoint must be parallel to ±Z (the plane normal).
      const ox = pose.position[0] - pose.target[0];
      const oz = pose.position[2] - pose.target[2];
      worstDeg = Math.max(worstDeg, Math.abs(Math.atan2(ox, Math.abs(oz))) * (180 / Math.PI));
    });
    expect(worstDeg).toBeLessThanOrEqual(0.5);
  });
});
