import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { describe, expect, it } from "vitest";
import { createTrafficContacts } from "../../../apps/showcase-teleoperator/src/collision";
import { IDOL_WHEEL_ARCHES, PLAYER_BODY, RIVAL_BODY, idolBodyFit, idolWheelLayout, trafficBody, type IdolBodyKey } from "../../../apps/showcase-teleoperator/src/art/idolModels";
import { assets } from "../../../apps/showcase-teleoperator/src/aura-assets.route";
import { NO_INPUT, ROAD_USER_COUNT, TRAFFIC_SPECS, createSim, roadUserFootprints } from "../../../apps/showcase-teleoperator/src/sim";
import { MAX_WHEEL_STEER, WHEEL_SPIN_SHOWN_MAX, shownWheelDistance, vehicleWheels } from "../../../apps/showcase-teleoperator/src/wheels";
import { unitWheelGeometrySpec } from "../../../apps/showcase-teleoperator/src/art/proceduralModels";
import { carBodyMatrix } from "../../../apps/showcase-teleoperator/src/carMotion";

/**
 * Idol wow pass moving parts: every Idol vehicle body is wheel-less and its road wheels are a separate spinning instanced
 * pool. The hubs come from the arches measured on each GLB; the wheels roll with distance and the front axle steers.
 */
const BODIES = [...new Set<IdolBodyKey>([...Object.values(PLAYER_BODY), ...RIVAL_BODY, ...TRAFFIC_SPECS.map((t, i) => trafficBody(i, t.asset))])];
const DT = 1 / 60;

async function bodyBounds(key: IdolBodyKey) {
  const url = (assets as Record<string, { url: string }>)[key]!.url;
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(`public${url}`);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const n of doc.getRoot().listNodes()) {
    const mesh = n.getMesh();
    if (!mesh) continue;
    for (const p of mesh.listPrimitives()) {
      const a = p.getAttribute("POSITION")!;
      for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k]!, a.getMin([])[k]!); max[k] = Math.max(max[k]!, a.getMax([])[k]!); }
    }
  }
  return { min, max };
}

describe("Grid Dispatch Idol road wheels", () => {
  it("every driven body has measured arches, and its hubs sit inside the fitted body under the arch crowns", async () => {
    for (const key of BODIES) {
      const arch = IDOL_WHEEL_ARCHES[key];
      expect(arch.archZ.length, key).toBeGreaterThanOrEqual(2);
      const { min, max } = await bodyBounds(key);
      // halfW is the lower body's half width (arch height), never wider than the whole body
      expect(arch.halfW, `${key} lower-body half width`).toBeLessThanOrEqual((max[0]! - min[0]!) / 2 + 0.005);
      expect(arch.halfW, `${key} lower-body half width`).toBeGreaterThan(0.6 * (max[0]! - min[0]!) / 2);
      const fit = idolBodyFit(key);
      const layout = idolWheelLayout(key);
      expect(layout.hubs).toHaveLength(arch.archZ.length * 2);
      for (const [i, hub] of layout.hubs.entries()) {
        expect(hub[1], `${key} hub height = radius`).toBeCloseTo(layout.radius, 6);
        expect(hub[2], `${key} hub under its arch`).toBeCloseTo(-arch.archZ[Math.floor(i / 2)]! * fit[2], 6);
        expect(Math.abs(hub[0]) + layout.width / 2, `${key} wheel inboard of the side`).toBeLessThanOrEqual(arch.halfW * fit[0] + 0.03);
        expect(hub[2], `${key} hub between the bumpers`).toBeGreaterThan(min[2]! * fit[2]);
        expect(hub[2], `${key} hub between the bumpers`).toBeLessThan(max[2]! * fit[2]);
      }
      // the wheel stands on the road (hub y = radius) and its top tucks under the lifted body's arch crown
      expect(arch.archTop * fit[1] + layout.lift, `${key} crown clears the tyre`).toBeGreaterThanOrEqual(2 * layout.radius + 0.03);
      expect(layout.radius, key).toBeGreaterThan(0.2);
      expect(layout.radius, key).toBeLessThan(0.62);
    }
  }, 60_000);

  it("wheels roll with the distance the player drives (spin changes frame to frame) and only the front axle steers", () => {
    const sim = createSim(createTrafficContacts(ROAD_USER_COUNT, undefined, { footprints: roadUserFootprints() }), { level: "MAN" });
    const layout = idolWheelLayout(PLAYER_BODY.cruiser);
    const pose = { x: 0, y: 0, z: -0.8, pitch: 0, yaw: 0, roll: 0 };
    let distance = 0;
    const frames: ReturnType<typeof vehicleWheels>[] = [];
    for (let f = 0; f < 6; f++) {
      sim.step(DT, { ...NO_INPUT, throttle: true, right: true });
      distance += Math.abs(sim.state.player.speed) * DT;
      frames.push(vehicleWheels(layout, pose, distance, -sim.state.player.steer * MAX_WHEEL_STEER));
    }
    expect(distance).toBeGreaterThan(0.5);
    const rear = layout.hubs.length - 1;
    for (let f = 1; f < frames.length; f++) {
      expect(frames[f]![rear]!.rotation![0], `frame ${f} rear spin`).not.toBeCloseTo(frames[f - 1]![rear]!.rotation![0], 4);
      // hubs stay put on the body
      expect(frames[f]![rear]!.position).toEqual(frames[f - 1]![rear]!.position);
    }
    const last = frames[frames.length - 1]!;
    expect(Math.abs(last[0]!.rotation![1] - pose.yaw), "front wheel steers").toBeGreaterThan(0.01);
    expect(Math.abs(last[rear]!.rotation![1] - pose.yaw), "rear wheel does not steer").toBeLessThan(1e-6);
  });

  it("road users' wheels roll the same way (forward rolling, distance / radius)", () => {
    const layout = idolWheelLayout(trafficBody(0, TRAFFIC_SPECS[0]!.asset));
    const pose = { x: 3.4, y: 0, z: -40, pitch: 0, yaw: 0, roll: 0 };
    const a = vehicleWheels(layout, pose, 0, 0)[0]!, b = vehicleWheels(layout, pose, layout.radius * 0.5, 0)[0]!;
    expect(b.rotation![0] - a.rotation![0]).toBeCloseTo(-0.5, 5);
  });
});

describe("Grid Dispatch road wheels turn about their hubs and never strobe (owner QA Nov 18)", () => {
  const ZYX = (rx: number, ry: number, rz: number): number[] => {
    const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
    return [cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx, sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx, -sy, cy * sx, cy * cx];
  };
  function unitWheelPositions(): Float32Array {
    const spec = unitWheelGeometrySpec() as unknown as { positions?: Float32Array; attributes?: { position?: { data?: Float32Array } } };
    const p = spec.positions ?? spec.attributes?.position?.data;
    expect(p, "unit wheel positions").toBeDefined();
    return p!;
  }

  it("the unit wheel mesh is centred on its axle (origin = hub, axle on X)", () => {
    const p = unitWheelPositions();
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k]!, p[i + k]!); hi[k] = Math.max(hi[k]!, p[i + k]!); }
    for (let k = 0; k < 3; k++) expect(Math.abs((lo[k]! + hi[k]!) / 2), `axis ${k} centre`).toBeLessThan(0.001);
    expect(hi[1]).toBeGreaterThan(0.97);
    expect(hi[0]).toBeLessThan(0.6);
  });

  it("a full revolution moves a wheel's bounds centre <= 2 mm relative to the vehicle (player, steered, pitched)", () => {
    const p = unitWheelPositions();
    const layout = idolWheelLayout(PLAYER_BODY.cruiser);
    const pose = { x: 1, y: 0.2, z: -6, pitch: 0.03, yaw: 0.4, roll: -0.02 };
    const body = carBodyMatrix(pose.pitch, pose.yaw, pose.roll);
    for (const steer of [0, 0.3]) {
      const centres: number[][] = [];
      for (let step = 0; step < 16; step++) {
        const w = vehicleWheels(layout, pose, (step / 16) * 2 * Math.PI * layout.radius, steer)[0]!;
        const m = ZYX(w.rotation![0], w.rotation![1], w.rotation![2]);
        const s = w.scale as readonly number[];
        // bounds in the steered wheel frame (body * steer), relative to the vehicle
        const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < p.length; i += 3) {
          const v = [p[i]! * s[0]!, p[i + 1]! * s[1]!, p[i + 2]! * s[2]!];
          const wv = [0, 1, 2].map((r) => w.position![r]! + m[r * 3]! * v[0]! + m[r * 3 + 1]! * v[1]! + m[r * 3 + 2]! * v[2]! - pose.x * (r === 0 ? 1 : 0) - pose.y * (r === 1 ? 1 : 0) - pose.z * (r === 2 ? 1 : 0));
          const q = [0, 1, 2].map((c) => body[c]! * wv[0]! + body[3 + c]! * wv[1]! + body[6 + c]! * wv[2]!);
          for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k]!, q[k]!); hi[k] = Math.max(hi[k]!, q[k]!); }
        }
        centres.push([0, 1, 2].map((k) => (lo[k]! + hi[k]!) / 2));
      }
      for (const c of centres) expect(Math.hypot(c[0]! - centres[0]![0]!, c[1]! - centres[0]![1]!, c[2]! - centres[0]![2]!), `steer ${steer}`).toBeLessThan(0.002);
    }
  });

  it("caps the drawn spin so a 6-spoke rim never steps more than 0.3 rad a frame; main.ts uses the capped distance", () => {
    const dt = 1 / 60, r = 0.33;
    for (const speed of [2, 10, 20, 35]) {
      const d = shownWheelDistance(0, speed, dt, r);
      expect(d / r).toBeLessThanOrEqual(WHEEL_SPIN_SHOWN_MAX * dt + 1e-9);
      expect(d / r).toBeLessThanOrEqual(0.3);
      expect(d).toBeGreaterThan(0);
    }
    expect(shownWheelDistance(0, 3, dt, r)).toBeCloseTo(3 * dt, 9);
    const main = readFileSync(resolve(__dirname, "../../../apps/showcase-teleoperator/src/main.ts"), "utf8");
    expect(main).toMatch(/userWheelDistance\[i\] = shownWheelDistance\(/);
    expect(main).toMatch(/playerWheelDistance = shownWheelDistance\(/);
  });
});
