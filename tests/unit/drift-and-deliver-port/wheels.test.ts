import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  HERO_WHEEL_GEOMETRY_RADIUS,
  IDOL_WHEEL_LAYOUT,
  TRAFFIC_WHEEL_IDS,
  TYRE_SINK,
  advanceSpin,
  courierWheelPlacement,
  createTrafficWheelRig,
  idolCourierWheelPoses,
  stepTrafficWheels,
  wheelHubs,
  type IdolVehicleKey
} from "../../../examples/drift-and-deliver-port/wheels";
import { buildIdolTrafficFleet } from "../../../examples/drift-and-deliver-port/idol";

const root = resolve(__dirname, "../../..");
const manifest = JSON.parse(readFileSync(resolve(root, "aura.assets.json"), "utf8")) as { assets: { id: string; bounds?: number[] }[] };
const bounds = new Map(manifest.assets.map((a) => [a.id, a.bounds!]));
const keys = Object.keys(IDOL_WHEEL_LAYOUT) as IdolVehicleKey[];

describe("Gridlock Courier Idol moving parts: separate spinning wheels on wheel-less bodies", () => {
  it("puts every hub inside its body's footprint, under the body, with the tyre on the road", () => {
    for (const key of keys) {
      const layout = IDOL_WHEEL_LAYOUT[key];
      const [w, h, l] = bounds.get(key)!;
      const hubs = wheelHubs(layout);
      expect(hubs.length, key).toBeGreaterThanOrEqual(4);
      for (const hub of hubs) {
        // tyre outer face stays within the body width, the tyre within the body length
        expect(Math.abs(hub.x) + 0.33 * layout.radius, key).toBeLessThanOrEqual(w! / 2 + 0.02);
        expect(Math.abs(hub.z) + layout.radius, key).toBeLessThanOrEqual(l! / 2 + 0.05);
        // tyre touches the road; the hub sits below the lifted body's mid-height (inside the arch, not on the roof)
        expect(hub.y - layout.radius).toBeCloseTo(-TYRE_SINK, 6);
        expect(hub.y, key).toBeLessThan(layout.lift + h! / 2);
      }
      // the lift keeps the body bottom no higher than the tyre's upper half (wheels inside the arches, not below the sills)
      expect(layout.lift, key).toBeLessThan(layout.radius * 1.2);
      expect(Math.max(...layout.axles), key).toBeGreaterThan(0);
      expect(Math.min(...layout.axles), key).toBeLessThan(0);
    }
  });

  it("spins the courier wheels by distance and steers only the front pair", () => {
    const poses = idolCourierWheelPoses();
    expect(poses.map((p) => p.id).sort()).toEqual(["courier-wheel-fl", "courier-wheel-fr", "courier-wheel-rl", "courier-wheel-rr"]);
    expect(poses[0]!.scale).toBeCloseTo(IDOL_WHEEL_LAYOUT.gcCourier.radius / HERO_WHEEL_GEOMETRY_RADIUS, 6);
    // drive forward at 14 m/s for 10 frames of 1/60 s, steering left
    let spin = 0;
    let z = 0;
    const seen: number[] = [];
    for (let f = 0; f < 10; f++) {
      spin = advanceSpin(spin, 14 / 60, IDOL_WHEEL_LAYOUT.gcCourier.radius);
      z += 14 / 60;
      seen.push(spin);
    }
    expect(new Set(seen.map((s) => s.toFixed(4))).size).toBe(10);
    expect(spin).toBeCloseTo((z / IDOL_WHEEL_LAYOUT.gcCourier.radius) % (Math.PI * 2), 6);
    const car = { x: 5, z, yaw: 0, pitch: 0, steerYaw: 0.3 };
    for (const w of poses) {
      const p = courierWheelPlacement(w, car, spin);
      expect(p.rotation[0]).toBeCloseTo(spin, 6);
      expect(p.rotation[1]).toBeCloseTo(w.front ? 0.3 : 0, 6);
      expect(p.position[0]).toBeCloseTo(5 + w.ox, 6);
      expect(p.position[2]).toBeCloseTo(z + w.oz, 6);
    }
  });

  it("rolls every traffic car's wheels by the distance it moved, follows the car and ignores respawn jumps", () => {
    const traffic = Array.from({ length: 14 }, (_, i) => ({ x: i * 10, z: 0, yaw: (i % 4) * (Math.PI / 2) }));
    const fleet = buildIdolTrafficFleet(traffic, false);
    const wheelNodes = fleet.nodes.map((n) => (n.toJSON() as { name?: string }).name);
    expect(wheelNodes).toContain(TRAFFIC_WHEEL_IDS.tyre);
    expect(wheelNodes).toContain(TRAFFIC_WHEEL_IDS.rim);
    const rig = fleet.wheels;
    expect(rig.entries.length).toBeGreaterThanOrEqual(traffic.length * 4);

    const shown = new Float64Array(traffic.flatMap((t) => [t.x, t.z, t.yaw]));
    const before = Array.from(rig.spin);
    const angles: number[][] = [];
    for (let f = 0; f < 5; f++) {
      for (let i = 0; i < traffic.length; i++) {
        // each car drives 0.04 m along its heading per frame (2.4 m/s: under the strobe cap, see owner-qa-nov18.test.ts)
        shown[3 * i] += Math.sin(shown[3 * i + 2]!) * 0.04;
        shown[3 * i + 1] += Math.cos(shown[3 * i + 2]!) * 0.04;
      }
      const t = stepTrafficWheels(rig, shown);
      angles.push(t.map((x) => (x.rotation as readonly number[])[2]!));
    }
    for (let i = 0; i < traffic.length; i++) {
      const r = rig.entries.find((e) => e.car === i)!.radius;
      expect(rig.spin[i]! - before[i]!).toBeCloseTo((5 * 0.04) / r, 6);
    }
    // every wheel's spin angle changed frame to frame
    for (let n = 0; n < rig.entries.length; n++) expect(angles[4]![n]).not.toBeCloseTo(angles[0]![n]!, 3);
    // wheels sit at the car's hubs (rotated by its yaw)
    rig.entries.forEach((e, n) => {
      const x = shown[3 * e.car]!, z = shown[3 * e.car + 1]!, yaw = shown[3 * e.car + 2]!;
      const p = rig.transforms[n]!.position as readonly number[];
      expect(p[0]).toBeCloseTo(x + e.hub.x * Math.cos(yaw) + e.hub.z * Math.sin(yaw), 6);
      expect(p[2]).toBeCloseTo(z - e.hub.x * Math.sin(yaw) + e.hub.z * Math.cos(yaw), 6);
      expect(p[1]).toBeCloseTo(e.radius - TYRE_SINK, 6);
    });
    // a respawn jump does not spin the wheels
    const spinBefore = rig.spin[0]!;
    shown[0] += 400;
    stepTrafficWheels(rig, shown);
    expect(rig.spin[0]).toBeCloseTo(spinBefore, 9);
    // the Idol bodies ride at their lift so the tyres stand on the road
    for (const g of fleet.groups) expect(g.lift).toBeGreaterThan(0);
  });

  it("keeps the courier wheel nodes mounted and spun in Idol mode", () => {
    const main = readFileSync(resolve(root, "examples/drift-and-deliver-port/main.ts"), "utf8");
    expect(main).toMatch(/for \(const w of IDOL_COURIER_WHEELS\) s\.add\(buildHeroCourierWheelNode/);
    expect(main).toMatch(/config\.idol \? IDOL_COURIER_WHEELS : HERO_COURIER_WHEEL_POSES/);
    expect(main).toMatch(/stepTrafficWheels\(look\.trafficWheels, shown, dt\)/);
    const rig = createTrafficWheelRig(["gcTaxi"]);
    expect(rig.entries.length).toBe(4);
  });
});
