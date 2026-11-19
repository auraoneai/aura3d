import { describe, expect, it } from "vitest";
import { createAutopilot } from "../../../examples/drift-and-deliver-port/autopilot";
import { setChaseFraming, snapChase, stepChase, type ChaseState } from "../../../examples/drift-and-deliver-port/chase";
import { buildFurniture } from "../../../examples/drift-and-deliver-port/city";
import { courierSightTargets, createOccluderFader, sightlineHits, takeFadeLayers, type FadeLayer, type OccluderFader } from "../../../examples/drift-and-deliver-port/occluderFade";
import { planProps, propNodes } from "../../../examples/drift-and-deliver-port/props";
import { carBox, project, type Pose } from "../../../examples/drift-and-deliver-port/qa";
import { createShift, stepShift } from "../../../examples/drift-and-deliver-port/shift";
import { createCar, stepCar } from "../../../examples/drift-and-deliver-port/sim";
import { buildBlocks, buildBuildings, buildPickups, buildTraffic, buildingSolids } from "../../../examples/drift-and-deliver-port/world";

/**
 * Owner QA (Nov 19): street trees and palms between the bird's-eye chase eye and the courier fade out of their opaque
 * draws, so no tree footprint covers the car on screen. A tree's screen footprint is the box around its projected trunk
 * and crown cylinders (generous: the real crown is rounder); it "covers" the car when it overlaps more than a quarter of
 * the courier's screen box while standing nearer the eye than the car.
 */
const FOOT = { halfW: 0.9954000015020373, halfD: 2.14200003592372 };
const COVER_MAX = 0.25;
type V = [number, number, number];

function footprint(vols: FadeLayer["volumes"][number], pose: Pose) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, seen = 0;
  for (const v of vols) for (let k = 0; k < 12; k++) for (const y of [v.yMin, v.yMax]) {
    const a = (k / 12) * Math.PI * 2;
    const q = project([v.x + Math.cos(a) * v.r, y, v.z + Math.sin(a) * v.r], pose);
    if (!q) continue;
    seen++;
    x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]);
  }
  return seen ? { x0, y0, x1, y1 } : null;
}

const isVegetation = (l: FadeLayer) => /^model-(tree|palm)/.test(l.opaqueIds[0]!);

/** Body sample points of the courier (5 along x 3 across x 3 heights; heading 0 faces +Z). */
function bodyPoints(car: { x: number; z: number; heading: number }): V[] {
  const s = Math.sin(car.heading), c = Math.cos(car.heading);
  const out: V[] = [];
  for (const a of [-1, -0.5, 0, 0.5, 1]) for (const b of [-1, 0, 1]) for (const y of [0.5, 1.0, 1.45]) {
    const along = a * FOOT.halfD * 0.95, across = b * FOOT.halfW * 0.9;
    out.push([car.x + s * along + c * across, y, car.z + c * along - s * across]);
  }
  return out;
}

/**
 * Worst share of the courier's screen box covered by one tree footprint nearer the eye (`opaque`: trees still in their
 * opaque draw; `any`: every tree), plus the share of the car's body points hidden behind opaque trunks and crowns.
 */
function coverage(layers: readonly FadeLayer[], faded: number[][], cam: ChaseState, car: { x: number; z: number; heading: number }) {
  const pose: Pose = { eye: cam.eye as V, target: cam.look as V, fovDeg: cam.fov, aspect: 16 / 9 };
  const cb = carBox(car.x, car.z, car.heading, pose);
  let opaque = 0, any = 0;
  if (!cb) return { opaque, any, hidden: 0 };
  const carDist = Math.hypot(car.x - cam.eye[0], car.z - cam.eye[2]);
  const pts = bodyPoints(car);
  const hiddenPts = new Set<number>();
  layers.forEach((l, li) => {
    if (!isVegetation(l)) return;
    l.volumes.forEach((vols, k) => {
      const v = vols[0]!;
      if (Math.abs(v.x - car.x) > 40 || Math.abs(v.z - car.z) > 40) return;
      if (Math.hypot(v.x - cam.eye[0], v.z - cam.eye[2]) > carDist) return;
      const b = footprint(vols, pose);
      if (!b) return;
      const ox = Math.max(0, Math.min(b.x1, cb.x + cb.w) - Math.max(b.x0, cb.x));
      const oy = Math.max(0, Math.min(b.y1, cb.y + cb.h) - Math.max(b.y0, cb.y));
      const share = (ox * oy) / (cb.w * cb.h);
      any = Math.max(any, share);
      if (faded[li]!.includes(k)) return;
      opaque = Math.max(opaque, share);
      pts.forEach((p, n) => { if (vols.some((vol) => sightlineHits(cam.eye as V, p, vol, 0.3))) hiddenPts.add(n); });
    });
  });
  return { opaque, any, hidden: hiddenPts.size / pts.length };
}

function scene(idol: boolean) {
  const blocks = buildBlocks();
  const buildings = buildBuildings(blocks);
  const car = createCar();
  takeFadeLayers();
  propNodes(planProps(buildFurniture(blocks), blocks, buildings, { x: car.x, z: car.z }), false, idol, !idol);
  const layers = takeFadeLayers();
  return { blocks, buildings, car, layers, fader: createOccluderFader(layers) };
}

const step = (fader: OccluderFader, cam: ChaseState, car: { x: number; z: number; heading: number }, dt = 1 / 60) =>
  fader.update(dt, cam.eye as V, courierSightTargets(car.x, car.z, car.heading), () => {});

describe("Gridlock Courier owner QA (Nov 19): trees and palms between the chase eye and the courier fade", () => {
  it("registers the Idol and the code-built trees and palms as fade layers with translucent ghost draws", () => {
    for (const idol of [true, false]) {
      const { layers } = scene(idol);
      const veg = layers.filter(isVegetation);
      expect(veg.length).toBe(2);
      for (const l of veg) {
        expect(l.transforms.length).toBeGreaterThan(300);
        expect(l.ghostIds.length).toBe(2);
        // the crown volume is the wide upper part of the plant
        const [trunk, crown] = l.volumes[0]!;
        expect(crown!.r).toBeGreaterThan(trunk!.r * 3);
      }
      // the code-built canopies keep their per-instance leaf tint through the instance writes
      if (!idol) for (const l of veg) expect(Object.values(l.colors ?? {})[0]?.length).toBe(l.transforms.length);
    }
    setChaseFraming("close");
  });

  it("no opaque tree footprint covers the car on screen along 180 s of the autoplay route", () => {
    setChaseFraming("bird");
    const { blocks, buildings, car, layers, fader } = scene(true);
    const solids = buildingSolids(buildings);
    const near = (x: number, z: number) => solids.filter((q) => Math.abs(q.x - x) < 30 + q.hw && Math.abs(q.z - z) < 30 + q.hd);
    void blocks;
    const cam = snapChase({ x: car.x, z: car.z, y: 0, heading: car.heading, speed: 0, boosting: false, shake: 0 });
    const pilot = createAutopilot();
    const shift = createShift(180);
    const pickups = buildPickups(), traffic = buildTraffic();
    let worst = 0, chances = 0;
    for (let i = 0; i < 180 * 60; i++) {
      stepCar(car, 1 / 60, pilot.step(car, { job: shift.job, pickups, traffic }, 1 / 60), near(car.x, car.z), FOOT);
      stepShift(shift, 1 / 60, car, { combo: 0, collected: 0, total: 1 });
      stepChase(cam, { x: car.x, z: car.z, y: 0, heading: car.heading, speed: car.speed, boosting: car.boosting, shake: 0 }, 1 / 60);
      step(fader, cam, car);
      if (i < 30 || i % 3) continue;
      const c = coverage(layers, fader.faded(), cam, car);
      if (c.any > COVER_MAX) chances++;
      worst = Math.max(worst, c.opaque, c.hidden);
    }
    // the route does pass behind trees (the check is not vacuous), and every one of them is faded
    expect(chances).toBeGreaterThan(5);
    expect(worst).toBeLessThanOrEqual(COVER_MAX);
    setChaseFraming("close");
  }, 120_000);

  it("a car parked just past any street tree or palm (four headings, kerb-side and lane offsets) is never covered", () => {
    setChaseFraming("bird");
    for (const idol of [true, false]) {
      const { layers } = scene(idol);
      let worst = 0, chances = 0, cases = 0;
      layers.forEach((l, li) => {
        if (!isVegetation(l)) return;
        for (let k = 0; k < l.volumes.length; k += 7) {
          const v = l.volumes[k]![0]!;
          for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) for (const ahead of [2.5, 5]) for (const side of [-2.5, 0, 2.5]) {
            const s = Math.sin(heading), c = Math.cos(heading);
            const car = { x: v.x + s * ahead + c * side, z: v.z + c * ahead - s * side, heading };
            const cam = snapChase({ x: car.x, z: car.z, y: 0, heading, speed: 0, boosting: false, shake: 0 });
            const fader = createOccluderFader(layers);
            for (let f = 0; f < 4; f++) step(fader, cam, car);
            const cov = coverage(layers, fader.faded(), cam, car);
            cases++;
            if (cov.any > COVER_MAX) chances++;
            worst = Math.max(worst, cov.hidden);
            if (cov.hidden > COVER_MAX) throw new Error(`${l.opaqueIds[0]} #${k} hides ${(cov.hidden * 100).toFixed(0)}% of the car at ${car.x.toFixed(1)},${car.z.toFixed(1)} heading ${heading.toFixed(2)} (layer ${li})`);
          }
        }
      });
      expect(cases).toBeGreaterThan(1000);
      expect(chances).toBeGreaterThan(50);
      expect(worst).toBeLessThanOrEqual(COVER_MAX);
    }
    setChaseFraming("close");
  }, 120_000);
});
