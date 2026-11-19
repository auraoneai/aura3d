import { describe, expect, it } from "vitest";
import {
  ALIAS_SAFE_FRACTION, BLUR_RAD_S, HERO_IDOL_TRACK_X, HERO_RIM_PITCH, IDOL_TRAFFIC_HUBS, OVERLAY_OUTSET, TREAD_PITCH, blurAmount,
  buildAlloyRimMesh, buildTreadTyreMesh, drawnStep, overlayWheelTransforms, rollStep, steerStep
} from "../../../examples/roadster-hours-port/art/wheels";
import { IDOL_HERO_BODY_SCALE, IDOL_VEHICLE_VARIANTS, idolAsset, idolBounds } from "../../../examples/roadster-hours-port/art/idol";
import { ROADSTER_FRONT_Z, ROADSTER_REAR_Z, ROADSTER_WHEEL_RADIUS, ROADSTER_WHEEL_WIDTH, computeWheelWorldPose, getRoadsterRigGeometries, quatRotateVec, quaternionFromEulerZYX } from "../../../examples/roadster-hours-port/roadsterRig";
import { buildBlurDiscMesh, TRAFFIC_SPOKES as SPOKES } from "../../../examples/roadster-hours-port/art/wheels";
import { buildWorld } from "../../../examples/roadster-hours-port/world";

type Node = Record<string, unknown> & { readonly name?: string; readonly kind?: string };
function nodes(scene: { toJSON(): unknown }): Node[] {
  const out: Node[] = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (v && typeof v === "object") {
      const o = v as Node;
      if (typeof o.kind === "string" && typeof o.name === "string") out.push(o);
      for (const key of Object.keys(o)) if (key !== "geometry" && key !== "material" && key !== "asset") walk(o[key]);
    }
  };
  walk(scene.toJSON());
  return out;
}

describe("Saltwind Highway rolling wheels (moving-parts pass)", () => {
  it("rolls distance / radius at every speed and always draws a forward step below the alias limit", () => {
    const r = ROADSTER_WHEEL_RADIUS * 1.15;
    for (const speed of [2, 8, 20, 40, 61, 74]) {
      let truth = 0, drawn = 0, prev = 0;
      for (let f = 0; f < 120; f++) {
        const step = rollStep(speed / 60, r);
        truth += step;
        const d = drawnStep(step, HERO_RIM_PITCH);
        expect(d).toBeGreaterThan(0);
        expect(d).toBeLessThanOrEqual(HERO_RIM_PITCH * ALIAS_SAFE_FRACTION + 1e-12);
        drawn += d;
        expect(drawn).toBeGreaterThan(prev);
        prev = drawn;
      }
      expect(truth).toBeCloseTo((speed * 2) / r, 9);
      if (speed / r * (1 / 60) <= HERO_RIM_PITCH * ALIAS_SAFE_FRACTION) expect(drawn).toBeCloseTo(truth, 9);
    }
    expect(drawnStep(-0.01, TREAD_PITCH)).toBeCloseTo(-0.01, 12);
  });

  it("fades the spoke-blur disc in above BLUR_RAD_S", () => {
    expect(blurAmount(BLUR_RAD_S - 1)).toBe(0);
    expect(blurAmount(BLUR_RAD_S + 5)).toBeGreaterThan(0);
    expect(blurAmount(200)).toBe(1);
  });

  it("steers the front wheels with the input, smoothed, both ways, clamped at 0.42 rad", () => {
    let smooth = 0, yaw = 0;
    for (let f = 0; f < 60; f++) ({ smooth, yaw } = steerStep(smooth, 1, 1 / 60));
    expect(yaw).toBeCloseTo(-0.42, 2);
    for (let f = 0; f < 60; f++) ({ smooth, yaw } = steerStep(smooth, -1, 1 / 60));
    expect(yaw).toBeCloseTo(0.42, 2);
    expect(steerStep(0, 0.5, 1 / 60).yaw).toBeLessThan(0);
    expect(steerStep(0, 3, 10).yaw).toBeCloseTo(-0.42, 6);
  });

  it("puts the hero tyres flush with the Idol body's fenders and inside its arches", () => {
    const body = idolBounds(idolAsset("swRoadsterBodyB")!);
    const fender = (body[0] / 2) * IDOL_HERO_BODY_SCALE[0];
    const tyreOuter = HERO_IDOL_TRACK_X + (ROADSTER_WHEEL_WIDTH * 1.15) / 2;
    expect(Math.abs(tyreOuter - fender)).toBeLessThan(0.03);
    // arches measured on the GLB: game-frame centres -1.26 (front) and +1.40 (rear), half length >= 0.41 m
    expect(Math.abs(ROADSTER_FRONT_Z - -1.26)).toBeLessThan(0.15);
    expect(Math.abs(ROADSTER_REAR_Z - 1.4)).toBeLessThan(0.15);
    expect(ROADSTER_WHEEL_RADIUS * 1.15).toBeLessThan(0.45);
  });

  it("treaded tyre and five-spoke rim are not rotationally uniform (their spin is visible)", () => {
    const tyre = buildTreadTyreMesh(1, 1);
    const radii = new Set<number>();
    for (let i = 0; i < tyre.positions.length; i += 3) radii.add(Math.round(Math.hypot(tyre.positions[i + 1]!, tyre.positions[i + 2]!) * 1000));
    expect(radii.has(1000)).toBe(true);
    expect([...radii].some((r) => r > 960 && r < 1000)).toBe(true);
    expect(buildAlloyRimMesh(1, 1).positions.length).toBeGreaterThan(300);
  });

  it("places every Idol traffic overlay wheel on its hub, rolled by the angle, outside the baked tyre", () => {
    for (const key of Object.values(IDOL_VEHICLE_VARIANTS).flat()) {
      const hubs = IDOL_TRAFFIC_HUBS[key];
      expect(hubs, key).toBeDefined();
      const size = idolBounds(idolAsset(key)!);
      for (const h of hubs!) {
        expect(Math.abs(h.z)).toBeLessThan(size[2] / 2);
        expect(h.r * 2).toBeLessThan(size[1] * 0.6);
      }
      const a = overlayWheelTransforms(hubs!, [10, 2, 5], 0.3, [1, 1, 1], 0.5).map((w) => ({ ...w, position: [...w.position] }));
      const b = overlayWheelTransforms(hubs!, [10, 2, 5], 0.3, [1, 1, 1], 1.5);
      expect(a.length).toBe(hubs!.length * 2);
      a.forEach((w, i) => {
        expect(w.position).toEqual(b[i]!.position);
        expect(Math.abs(w.rotation[0] - b[i]!.rotation[0])).toBeCloseTo(1, 9);
        expect(w.position[1]).toBeCloseTo(2 + hubs![Math.floor(i / 2)]!.r, 9);
      });
      // right-side wheel centre sits OVERLAY_OUTSET outside the baked tyre's measured outer face, minus half a tyre width
      const [right] = overlayWheelTransforms([hubs![0]!], [0, 0, 0], 0, [1, 1, 1], 0);
      expect(right!.position[0]).toBeCloseTo(hubs![0]!.xr + OVERLAY_OUTSET - hubs![0]!.w / 2, 9);
    }
  });

  it("seats the wheel-less semi's tyres in its arches: steer axle, dual drive axles and dual trailer axles", () => {
    const hubs = IDOL_TRAFFIC_HUBS.swSemiRedNW!;
    const size = idolBounds(idolAsset("swSemiRedNW")!);
    expect(size[2]).toBeCloseTo(20.8, 1);
    const axles = [...new Set(hubs.map((h) => h.z))].sort((a, b) => a - b);
    // arch openings read off an orthographic side view of the admitted GLB (metres, GLB +Z front)
    const arches: readonly [number, number][] = [[-9.0, -7.6], [-7.55, -6.1], [-6.1, -4.75], [0.0, 1.5], [1.55, 3.1], [8.0, 9.75]];
    expect(axles.length).toBe(arches.length);
    axles.forEach((z, i) => { expect(z).toBeGreaterThan(arches[i]![0]); expect(z).toBeLessThan(arches[i]![1]); });
    for (const z of axles) {
      const at = hubs.filter((h) => h.z === z);
      expect(at.length).toBe(z > 8 ? 1 : 2);
      for (const h of at) {
        expect(h.r * 2).toBeLessThan(1.6);
        expect(h.xr).toBeLessThan(size[0] / 2);
        expect(h.xr - h.w).toBeGreaterThan(0.5);
      }
    }
  });

  it("mounts the overlay wheel pools and per-wheel blur discs on the GU47 routes", () => {
    const all = nodes(buildWorld(0, "gu47").scene);
    for (const id of ["vehicles-idol-tyres", "vehicles-idol-rims", "vehicles-idol-wheel-blur"]) expect(all.some((n) => n.name === id), id).toBe(true);
    for (const tag of ["fl", "fr", "rl", "rr"]) expect(all.some((n) => n.name === `car-blur-${tag}`)).toBe(true);
  });

  /**
   * Hub-centred pivots (owner QA, Nov 18: Craterline's Idol wheels pivoted on the tyre bottom and wobbled). Every drawn
   * spinning part is posed about its own hub: over a full revolution its bounds centre moves <= 2 mm relative to the car,
   * at real size (hero tyre and wire rims at the Idol wheel scale; the largest traffic overlay wheel, r 0.7 m x 1.04).
   */
  it("spins every wheel part about its hub: a full revolution moves its bounds centre <= 2 mm relative to the car", () => {
    const rig = getRoadsterRigGeometries();
    const centreAt = (pts: Float32Array, place: (v: [number, number, number]) => [number, number, number]): number[] => {
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < pts.length; i += 3) {
        const p = place([pts[i]!, pts[i + 1]!, pts[i + 2]!]);
        for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k]!, p[k]!); hi[k] = Math.max(hi[k]!, p[k]!); }
      }
      return lo.map((v, k) => (v + hi[k]!) / 2);
    };
    const wobble = (positions: Float32Array, scale: number, poseAt: (angle: number) => { position: number[]; rotation: number[] }): number => {
      const first = poseAt(0);
      const centres = Array.from({ length: 48 }, (_v, i) => {
        const pose = poseAt((i / 48) * Math.PI * 2);
        const q = quaternionFromEulerZYX(pose.rotation[0]!, pose.rotation[1]!, pose.rotation[2]!);
        return centreAt(positions, (v) => { const r = quatRotateVec(q, [v[0] * scale, v[1] * scale, v[2] * scale]); return [r[0] + pose.position[0]!, r[1] + pose.position[1]!, r[2] + pose.position[2]!]; });
      });
      // the hub point itself never moves with the spin
      for (let i = 1; i < 48; i++) expect(poseAt((i / 48) * Math.PI * 2).position).toEqual(first.position);
      let worst = 0;
      for (const c of centres) worst = Math.max(worst, Math.hypot(c[0]! - centres[0]![0]!, c[1]! - centres[0]![1]!, c[2]! - centres[0]![2]!));
      return worst;
    };
    const heroScale = 1.15;
    const car: [number, number, number] = [3, 1, -40];
    const hero = { tread: buildTreadTyreMesh(ROADSTER_WHEEL_RADIUS, ROADSTER_WHEEL_WIDTH).positions, tyre: rig.wheelTire.positions, rimL: rig.wheelRimLeft.positions, rimR: rig.wheelRimRight.positions };
    for (const [name, pos] of Object.entries(hero)) {
      for (const steer of [0, 0.3]) {
        const d = wobble(pos as Float32Array, heroScale, (a) => computeWheelWorldPose(car, [0.05, 0.4, 0.08], [0.95, -0.2, -1.26], steer, a));
        expect(d, `hero ${name} steer ${steer}: ${(d * 1000).toFixed(2)} mm`).toBeLessThanOrEqual(0.002);
      }
    }
    // traffic overlay: unit tyre / rim / blur disc scaled by the largest hub; the overlay pose spins about the local axle
    const rr = 0.7 * 1.04, ww = 0.32;
    for (const [name, mesh] of [["tyre", buildTreadTyreMesh(1, 1)], ["rim", buildAlloyRimMesh(1, 1, SPOKES)], ["blur", buildBlurDiscMesh(0.6, 24, 0.53)]] as const) {
      const pts = mesh.positions;
      const scaled = new Float32Array(pts.length);
      for (let i = 0; i < pts.length; i += 3) { scaled[i] = pts[i]! * ww; scaled[i + 1] = pts[i + 1]! * rr; scaled[i + 2] = pts[i + 2]! * rr; }
      const d = wobble(scaled, 1, (a) => { const [w] = overlayWheelTransforms([{ z: 2, r: 0.7, w: ww, xr: 1.4, xl: 1.4 }], [5, 0, -30], 0.35, [1, 1, 1], a); return { position: [...w!.position], rotation: [...w!.rotation] }; });
      expect(d, `traffic ${name}: ${(d * 1000).toFixed(2)} mm`).toBeLessThanOrEqual(0.002);
    }
  });

  it("keeps the real tyre visible at speed: the blur discs cover only the rim, translucent, and never replace the tyre", () => {
    // hero disc: radius 0.66 of the tyre (inside the 0.62..1.0 tread band it leaves the tread exposed); traffic disc 0.6
    const radius = (m: { positions: Float32Array }) => { let r = 0; for (let i = 0; i < m.positions.length; i += 3) r = Math.max(r, Math.hypot(m.positions[i + 1]!, m.positions[i + 2]!)); return r; };
    expect(radius(buildBlurDiscMesh(ROADSTER_WHEEL_RADIUS * 0.66, 28, 0))).toBeLessThan(ROADSTER_WHEEL_RADIUS * 0.7);
    expect(radius(buildBlurDiscMesh(0.6, 24, 0.53))).toBeLessThan(0.65);
    // the tyre node stays mounted next to its blur disc on every corner (the runtime only toggles the disc)
    const all = nodes(buildWorld(0, "gu47").scene);
    for (const tag of ["fl", "fr", "rl", "rr"]) expect(all.some((n) => n.name === `car-wheel-${tag}`)).toBe(true);
  });

  it("caps every drawn spin below the alias limit of the finest feature it shows (tread lugs on traffic, spinner on the hero)", () => {
    for (const v of [5, 20, 40, 74]) for (const fps of [30, 60, 120]) {
      const trueStep = rollStep(v / fps, 0.7 * 1.04);
      // traffic tyre and rim share one angle: the tread pitch (finer than the five spokes) sets the cap
      expect(Math.abs(drawnStep(trueStep, TREAD_PITCH))).toBeLessThanOrEqual(TREAD_PITCH * ALIAS_SAFE_FRACTION + 1e-12);
      expect(Math.abs(drawnStep(trueStep, TREAD_PITCH))).toBeLessThan(TREAD_PITCH / 2);
    }
  });
});
