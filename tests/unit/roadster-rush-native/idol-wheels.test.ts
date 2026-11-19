import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { describe, expect, it } from "vitest";
import { VEHICLE_SPECS, type VehicleType } from "../../../apps/showcase-roadster-rush/src/native/constants";
import { HERO_ARCH_TOP, HERO_CANOPY, HERO_FENDER_HALF_WIDTH, HERO_WHEELS, IDOL_WHEEL_MODELS, MEASURED_BODIES, NEAR_BODY_FIT, SKY_FANS } from "../../../apps/showcase-roadster-rush/src/render/idolFleet";
import {
  ARCH_GAP,
  WHEEL_MODELS,
  WHEEL_SPIN_SHOWN_MAX,
  mat3FromEulerZYX,
  shownRollDistance,
  wheelLocalMat3,
  wheelOrigin,
  easeSteer,
  fanSpin,
  heroSteerTarget,
  vehicleWheelTransforms,
  wheelCount,
  wheelRoll
} from "../../../apps/showcase-roadster-rush/src/render/idolWheels";

const main = readFileSync(resolve(__dirname, "../../../apps/showcase-roadster-rush/src/main.ts"), "utf8");
const TYPES = Object.keys(VEHICLE_SPECS) as VehicleType[];

describe("Apex Overdrive moving parts: wheels roll, the hero steers, rival fans spin", () => {
  it("advances every traffic wheel's spin by distance / radius at several speeds, frame by frame", () => {
    for (const t of TYPES) {
      const set = NEAR_BODY_FIT[t].wheels;
      for (const speed of [8, 22, 40]) {
        let z = -100;
        const angles: number[] = [];
        for (let frame = 0; frame < 4; frame++) {
          const w = vehicleWheelTransforms(set, WHEEL_MODELS[set.kind], [0, 0, z], 0, z);
          expect(w).toHaveLength(wheelCount(set));
          angles.push(w[0]!.rotation[0]);
          z -= speed / 60;
        }
        for (let k = 1; k < angles.length; k++) {
          const r = set.axles[0]!.r;
          expect(angles[k]! - angles[k - 1]!).toBeCloseTo(-speed / 60 / r, 6);
        }
      }
    }
    expect(wheelRoll(-3, 0.3)).toBeCloseTo(-10, 6);
  });

  it("lifts the wheels with the body's hop so they never drop out of the arches", () => {
    const set = NEAR_BODY_FIT.sedan.wheels;
    const planted = vehicleWheelTransforms(set, WHEEL_MODELS.car, [0, 0, 0], 0, 0, 0).map((w) => w.position[1]);
    const hopped = vehicleWheelTransforms(set, WHEEL_MODELS.car, [0, 0, 0], 0, 0, 0.3).map((w) => w.position[1]);
    hopped.forEach((y, i) => expect(y - planted[i]!).toBeCloseTo(0.3, 6));
    expect(main).toMatch(/vehicleWheelTransforms\([^\n]*Math\.max\(0, hopY\)/);
  });

  it("rolls both sides forward together (left wheels are mirrored, not counter-rotating)", () => {
    const set = NEAR_BODY_FIT.sedan.wheels;
    const a = vehicleWheelTransforms(set, WHEEL_MODELS.car, [0, 0, 0], 0, 0).map((w) => ({ ...w }));
    const b = vehicleWheelTransforms(set, WHEEL_MODELS.car, [0, 0, -1], 0, -1);
    // right wheel: +roll about +X; left wheel: Ry(pi) * Rx(-roll) -> the same world rolling sense
    expect(b[0]!.rotation[0] - a[0]!.rotation[0]).toBeLessThan(0);
    expect(b[1]!.rotation[0] - a[1]!.rotation[0]).toBeGreaterThan(0);
    expect(b[1]!.rotation[1]).toBeCloseTo(Math.PI, 6);
  });

  it("puts every hub inside its arch / over its baked tyre and inside the collision box, tyres on the road", () => {
    for (const t of TYPES) {
      const m = MEASURED_BODIES[t];
      const fit = NEAR_BODY_FIT[t];
      const spec = VEHICLE_SPECS[t];
      fit.wheels.axles.forEach((axle, i) => {
        const measured = m.axles[i]!;
        // hub z sits on the measured arch / baked hub (game frame is the GLB turned by pi, scaled by the length fit)
        expect(axle.z).toBeCloseTo(-measured.glbZ * fit.fit[2], 6);
        expect(Math.abs(axle.z) + axle.r).toBeLessThanOrEqual(spec.l / 2 + 0.05);
        // within the body's width, tyre on the road
        expect(axle.x + fit.wheels.width / 2).toBeLessThanOrEqual((spec.w * 1.08) / 2 + (m.mode === "overlay" ? 0.03 : 1e-6));
        const w = vehicleWheelTransforms(fit.wheels, WHEEL_MODELS[fit.wheels.kind], [0, 0, 0], 0, 0);
        expect(w[0]!.position[1]).toBeCloseTo(fit.wheels.axles[0]!.r, 6);
        if (m.mode === "arches") {
          // tyre fits the arch opening (width) and the lifted, scaled arch top clears it by ARCH_GAP
          expect(axle.r).toBeLessThanOrEqual(measured.r * fit.fit[2] + 1e-6);
          const archTopWorld = fit.lift + (m.archTop ?? 0) * fit.fit[1];
          expect(archTopWorld - 2 * axle.r).toBeGreaterThanOrEqual(ARCH_GAP - 1e-6);
          expect(fit.lift).toBeLessThan(0.35);
        }
      });
      // roof stays exactly at the collision height (roof running is gameplay)
      expect(fit.lift + m.dims[1] * fit.fit[1]).toBeCloseTo(spec.h, 6);
    }
    for (const a of HERO_WHEELS.axles) {
      expect(Math.abs(a.z) + a.r).toBeLessThan(2.3);
      // GPU QA: hero tyres must stay under the lifted arch top and inboard of the fender skin (they poked through before)
      expect(HERO_ARCH_TOP + HERO_WHEELS.lift - 2 * a.r).toBeGreaterThanOrEqual(0.08);
      expect(a.x + HERO_WHEELS.width / 2).toBeLessThanOrEqual(HERO_FENDER_HALF_WIDTH - 0.08);
    }
    // the canopy shell encloses the baked cockpit (top 0.965, |x| 0.4, z -0.9 .. 1.3)
    expect(HERO_CANOPY.center[1] + HERO_CANOPY.radii[1]).toBeGreaterThan(0.965);
    expect(HERO_CANOPY.radii[0]).toBeGreaterThan(0.4);
    expect(HERO_CANOPY.center[2] - HERO_CANOPY.radii[2]).toBeLessThan(-0.9);
    expect(HERO_CANOPY.center[2] + HERO_CANOPY.radii[2]).toBeGreaterThan(1.3);
  });

  it("seats every arch tyre between the measured (skewed, off-centre) body sides at its axle", () => {
    for (const t of TYPES) {
      const m = MEASURED_BODIES[t];
      if (m.mode !== "arches") continue;
      const fit = NEAR_BODY_FIT[t];
      fit.wheels.axles.forEach((axle, i) => {
        const sides = m.axles[i]!.sides;
        expect(sides, `${t} axle ${i} has measured sides`).toBeDefined();
        // game frame x = -GLB x * fit
        const right = -sides![0] * fit.fit[0];
        const left = -sides![1] * fit.fit[0];
        const cx = axle.cx ?? 0;
        expect(cx + axle.x + fit.wheels.width / 2).toBeLessThanOrEqual(right - 0.02);
        expect(cx - axle.x - fit.wheels.width / 2).toBeGreaterThanOrEqual(left + 0.02);
        // and not tucked deep inside the body either
        expect(cx + axle.x + fit.wheels.width / 2).toBeGreaterThan(right - 0.15);
      });
    }
    // the hub transforms honour the axle centre
    const set = NEAR_BODY_FIT.sedan.wheels;
    const w = vehicleWheelTransforms(set, WHEEL_MODELS.car, [0, 0, 0], 0, 0);
    expect((w[2]!.position[0] + w[3]!.position[0]) / 2).toBeCloseTo(set.axles[1]!.cx ?? 0, 6);
  });

  it("steers the hero's front wheels with the lane-change input and settles back", () => {
    expect(heroSteerTarget(0)).toBeCloseTo(0, 9);
    expect(heroSteerTarget(9)).toBeLessThan(-0.3);
    expect(heroSteerTarget(-9)).toBeGreaterThan(0.3);
    expect(Math.abs(heroSteerTarget(80))).toBeLessThanOrEqual(0.42);
    let s = 0;
    for (let f = 0; f < 10; f++) s = easeSteer(s, heroSteerTarget(-9), 1 / 60);
    expect(s).toBeGreaterThan(0.3);
    for (let f = 0; f < 30; f++) s = easeSteer(s, heroSteerTarget(0), 1 / 60);
    expect(Math.abs(s)).toBeLessThan(0.01);
  });

  it("spins the four sky-rival fan rotors over time and draws wheels, blur discs and fans every frame", () => {
    expect(SKY_FANS).toHaveLength(4);
    expect(fanSpin(1) - fanSpin(0)).toBeGreaterThan(20);
    for (const id of ["wheels-car", "wheels-truck", "wheels-hero", "wheel-blur", "sky-fan-blades"]) expect(main).toContain(`pool("${id}"`);
    expect(main).toMatch(/addWheel\(wheelPool/);
    expect(main).toMatch(/fanBladePool\.add\(/);
    expect(main).toMatch(/heroWheelPool\.add\(/);
  });
});

/** Every vertex of an admitted wheel GLB (node transforms are identity on these single-node wheels). */
async function wheelVertices(url: string): Promise<number[][]> {
  const doc = await new NodeIO().read(resolve(__dirname, "../../../public" + url));
  const out: number[][] = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    expect(node.getTranslation()).toEqual([0, 0, 0]);
    for (const prim of mesh.listPrimitives()) {
      const a = prim.getAttribute("POSITION")!;
      for (let i = 0; i < a.getCount(); i++) out.push(a.getElement(i, []) as number[]);
    }
  }
  return out;
}

type M3 = readonly number[];
const mul = (a: M3, b: M3): number[] => [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => a[r * 3]! * b[c]! + a[r * 3 + 1]! * b[3 + c]! + a[r * 3 + 2]! * b[6 + c]!));
const apply = (o: readonly number[], m: M3, k: readonly number[], v: readonly number[]): number[] =>
  [0, 1, 2].map((r) => o[r]! + m[r * 3]! * v[0]! * k[0]! + m[r * 3 + 1]! * v[1]! * k[1]! + m[r * 3 + 2]! * v[2]! * k[2]!);
/** World point -> frame `f` (columns = axes) relative to `hub`. */
const toFrame = (f: M3, hub: readonly number[], p: readonly number[]): number[] => {
  const d = [p[0]! - hub[0]!, p[1]! - hub[1]!, p[2]! - hub[2]!];
  return [0, 1, 2].map((c) => f[c]! * d[0]! + f[3 + c]! * d[1]! + f[6 + c]! * d[2]!);
};
/** Least-squares circle through 2D points: its centre. */
function circleCentre(pts: readonly (readonly [number, number])[]): [number, number] {
  // Kasa fit: minimise sum (x^2 + y^2 - 2ax - 2by - c)^2
  let sxx = 0, sxy = 0, syy = 0, sx = 0, sy = 0, n = 0, sxz = 0, syz = 0, sz = 0;
  for (const [x, y] of pts) { const z = x * x + y * y; sxx += x * x; sxy += x * y; syy += y * y; sx += x; sy += y; n++; sxz += x * z; syz += y * z; sz += z; }
  const A = [[2 * sxx, 2 * sxy, sx], [2 * sxy, 2 * syy, sy], [2 * sx, 2 * sy, n]], B = [sxz, syz, sz];
  const det = (m: number[][]) => m[0]![0]! * (m[1]![1]! * m[2]![2]! - m[1]![2]! * m[2]![1]!) - m[0]![1]! * (m[1]![0]! * m[2]![2]! - m[1]![2]! * m[2]![0]!) + m[0]![2]! * (m[1]![0]! * m[2]![1]! - m[1]![1]! * m[2]![0]!);
  const D = det(A);
  const col = (j: number) => A.map((row, i) => row.map((v, k) => (k === j ? B[i]! : v)));
  return [det(col(0)) / D, det(col(1)) / D];
}
/** Tread vertices (outermost 7% radius about the axle) of a wheel model. */
function tread(verts: readonly number[][], centre: readonly number[]): number[][] {
  const rad = verts.map((v) => Math.hypot(v[1]! - centre[1]!, v[2]! - centre[2]!));
  const max = Math.max(...rad);
  return verts.filter((_, i) => rad[i]! > 0.93 * max);
}
/** Axis-aligned bounds centre (in frame f, relative to the hub) of world points. */
function boundsCentreIn(f: M3, hub: readonly number[], pts: readonly number[][]): number[] {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) { const q = toFrame(f, hub, p); for (let r = 0; r < 3; r++) { lo[r] = Math.min(lo[r]!, q[r]!); hi[r] = Math.max(hi[r]!, q[r]!); } }
  return [0, 1, 2].map((r) => (lo[r]! + hi[r]!) / 2);
}

describe("Apex Overdrive wheels turn about their hubs (owner QA Nov 18: Idol wheel origins sit at the tyre bottom)", () => {
  it("WHEEL_MODELS.centre is each GLB's tread-circle centre (the true hub), within 2 mm of its bounds centre", async () => {
    for (const kind of ["car", "truck", "hero"] as const) {
      const verts = await wheelVertices(IDOL_WHEEL_MODELS[kind].url);
      const c = WHEEL_MODELS[kind].centre;
      const [cy, cz] = circleCentre(tread(verts, c).map((v) => [v[1]!, v[2]!] as const));
      expect(Math.hypot(cy - c[1], cz - c[2]), `${kind} hub vs tread circle`).toBeLessThan(0.001);
      const lo = [1, 2].map((r) => Math.min(...verts.map((v) => v[r]!))), hi = [1, 2].map((r) => Math.max(...verts.map((v) => v[r]!)));
      expect(Math.hypot((lo[0]! + hi[0]!) / 2 - c[1], (lo[1]! + hi[1]!) / 2 - c[2]), `${kind} hub vs bounds centre`).toBeLessThan(0.002);
      expect(lo[0], `${kind} GLB origin is the tyre bottom (why the offset exists)`).toBeCloseTo(0, 3);
    }
  });

  it("keeps every traffic wheel's hub (tread circle) within 2 mm of its axle over a full revolution, both sides, any heading", async () => {
    for (const t of TYPES) {
      const set = NEAR_BODY_FIT[t].wheels;
      const model = WHEEL_MODELS[set.kind];
      const verts = await wheelVertices(IDOL_WHEEL_MODELS[set.kind].url);
      const ring = tread(verts, model.centre);
      const r0 = set.axles[0]!.r;
      for (const yaw of [0, 0.3]) {
        const vehicle = mat3FromEulerZYX(0, yaw, 0);
        const bounds: number[][] = [];
        for (let step = 0; step < 12; step++) {
          const d = (-step / 12) * 2 * Math.PI * r0;
          const ws = vehicleWheelTransforms(set, model, [2, 0.5, -30], yaw, d);
          ws.forEach((w, wi) => {
            const m = mat3FromEulerZYX(w.rotation[0], w.rotation[1], w.rotation[2]);
            const pts = ring.map((v) => toFrame(vehicle, w.position, apply(w.origin, m, w.scale, v)));
            const [cy, cz] = circleCentre(pts.map((q) => [q[1]!, q[2]!] as const));
            expect(Math.hypot(cy, cz), `${t} yaw ${yaw} step ${step} wheel ${wi}`).toBeLessThan(0.002);
            if (wi === 0) bounds.push(boundsCentreIn(vehicle, w.position, verts.map((v) => apply(w.origin, m, w.scale, v))));
          });
        }
        // the whole-mesh bounds centre (vehicle frame) only wanders by the lumpy Idol tread (< 6 mm), never by a radius
        for (const b of bounds) expect(Math.hypot(b[1]!, b[2]!), `${t} bounds centre`).toBeLessThan(0.006);
      }
    }
  });

  it("turns the hero wheels about their hubs too (steer + roll + body attitude), and main.ts draws the offset", async () => {
    const model = WHEEL_MODELS.hero;
    const verts = await wheelVertices(IDOL_WHEEL_MODELS.hero.url);
    const ring = tread(verts, model.centre);
    const h = HERO_WHEELS.axles[0]!;
    const k = (2 * h.r) / model.diameter, kw = HERO_WHEELS.width / model.width;
    const body = mat3FromEulerZYX(0.05, 0.2, -0.08);
    const steered = mul(body, mat3FromEulerZYX(0, 0.3, 0));
    const hub = [1, 0.4, -2];
    for (const side of [1, -1] as const) {
      for (let step = 0; step < 12; step++) {
        const m = mul(steered, wheelLocalMat3(side, (step / 12) * 2 * Math.PI));
        const lc = [kw * model.centre[0], k * model.centre[1], k * model.centre[2]];
        const o = [0, 1, 2].map((r) => hub[r]! - (m[r * 3]! * lc[0]! + m[r * 3 + 1]! * lc[1]! + m[r * 3 + 2]! * lc[2]!));
        const pts = ring.map((v) => toFrame(steered, hub, apply(o, m, [kw, k, k], v)));
        const [cy, cz] = circleCentre(pts.map((q) => [q[1]!, q[2]!] as const));
        expect(Math.hypot(cy, cz), `hero side ${side} step ${step}`).toBeLessThan(0.002);
      }
    }
    expect(main).toMatch(/heroWheelPool\.add\(at\[0\] - o\[0\], at\[1\] - o\[1\], at\[2\] - o\[2\]/);
    expect(main).toMatch(/const o = rotateOffsetByMat3\(\[0, 0, 0\], wm, \[kw \* cx, k \* cy, k \* cz\]\)/);
    expect(main).toMatch(/target\.add\(w\.origin\[0\], w\.origin\[1\], w\.origin\[2\]/);
    // the generic helper is hub - R * (S * centre)
    const o = wheelOrigin([0, 0, 0], [0.4, 0.2, 0.1], [1, 1, 1], [0, 0.35, 0]);
    expect(o[1]).toBeCloseTo(-mat3FromEulerZYX(0.4, 0.2, 0.1)[4] * 0.35, 9);
  });

  it("caps the drawn spin (no strobing) while the tyre stays visible under the see-through blur disc", () => {
    const dt = 1 / 60;
    let d = 0;
    for (const speed of [5, 20, 40, 80]) {
      const next = shownRollDistance(d, -speed * dt, dt, 0.31);
      const perFrame = Math.abs(next - d) / 0.31;
      expect(perFrame).toBeLessThanOrEqual(WHEEL_SPIN_SHOWN_MAX * dt + 1e-9);
      expect(perFrame).toBeLessThanOrEqual(0.31);
      expect(perFrame).toBeGreaterThan(0);
      d = next;
    }
    expect(shownRollDistance(0, -0.05, dt, 0.31)).toBeCloseTo(-0.05, 9);
    expect(shownRollDistance(3, 40, dt, 0.31)).toBe(3);
    expect(main).toMatch(/shownRollDistance\(heroRollDist/);
    expect(main).toMatch(/wheelRoll\(heroRollDist, h\.r\)/);
    expect(main).toMatch(/shownRollDistance\(roll\.d/);
    // blur discs are see-through and smaller than the tyre (radius * 1.62 is the disc diameter < 2r), so the tyre ring shows
    expect(main).toMatch(/opacity: 0\.62/);
    expect(main).toMatch(/radius \* 1\.62, 0\.012, radius \* 1\.62/);
  });
});

describe("Apex carrier overlay tyres sit on their own (skewed, off-centre) baked tyres (GPU QA Nov 18)", () => {
  it("puts each side's front overlay over its measured front contact patch and centred on the baked tyres' outer faces", () => {
    const fit = NEAR_BODY_FIT.carrier;
    const w = vehicleWheelTransforms(fit.wheels, WHEEL_MODELS.truck, [0, 0, 0], 0, 0);
    // side +1 (game +x) is GLB -x: front contacts z 6.0-6.8 -> hub ~6.45; GLB +x: 5.3-6.0 -> ~5.7 (game z = -GLB z * fit)
    const fz = fit.fit[2];
    expect(w[0]!.position[2] / -fz).toBeCloseTo(6.475, 2);
    expect(w[1]!.position[2] / -fz).toBeCloseTo(5.725, 2);
    // outer faces 2 cm beyond the baked tyres' outer faces (GLB x -1.79 / +1.33; game x flips)
    const half = fit.wheels.width / 2, fx = fit.fit[0];
    expect(w[0]!.position[0] + half).toBeCloseTo(1.79 * fx + 0.02, 3);
    expect(w[1]!.position[0] - half).toBeCloseTo(-1.33 * fx - 0.02, 3);
  });
});
