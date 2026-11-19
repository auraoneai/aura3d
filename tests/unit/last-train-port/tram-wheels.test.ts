import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { IDOL_ASSETS } from "../../../apps/showcase-last-train-port/src/idol-assets";
import { COWCATCHER, IDOL_TRAM, TRAM_RUNNING_GEAR, cowcatcherMesh, TRAM_WHEEL_IDS, advanceWheelSpin, idolReady, tramWheelHubs, tramWheelTransforms } from "../../../examples/last-train-port/idolModels";
import { tramRotation } from "../../../examples/last-train-port/orient";
import type { RouteData, SimData, Tables } from "../../../examples/last-train-port/sim";
import { buildWorld } from "../../../examples/last-train-port/world";

const data: SimData = {
  route: JSON.parse(readFileSync("examples/last-train-port/data/route.json", "utf8")) as RouteData,
  tables: JSON.parse(readFileSync("examples/last-train-port/data/tables.json", "utf8")) as Tables
};

type Transform = { readonly position: readonly number[]; readonly rotation: readonly number[] };

describe("Idol tram moving parts (moving-parts pass)", () => {
  it("mounts eight wheels on the rail gauge under the Idol body, touching the rails", () => {
    expect(idolReady("llTram")).toBe(true);
    const bounds = (IDOL_ASSETS.llTram as unknown as { bounds: readonly [number, number, number] }).bounds;
    const hubs = tramWheelHubs();
    expect(hubs).toHaveLength(8);
    const g = TRAM_RUNNING_GEAR;
    for (const [x, y, z] of hubs) {
      expect(Math.abs(x)).toBeCloseTo(g.gaugeHalf, 6);
      expect(Math.abs(x) + 0.08).toBeLessThan(bounds[0] / 2); // inside the body's width
      expect(Math.abs(z) + g.radius).toBeLessThan(bounds[2] / 2); // inside the body's length
      // GPU QA: the whole wheel (tyre top) sits below the body's lowest skirt edge so it reads as rolling
      expect(y + g.radius).toBeLessThan(g.skirtY);
      expect(y + g.radius).toBeLessThanOrEqual(IDOL_TRAM.wheelY + 0.58);
      expect(y - g.radius).toBeCloseTo(0.035, 3); // tread on the rails (the procedural streetcar's wheel contact)
    }
    // two bogies, one each side of the saloon centre, both axles inside each bogie frame
    expect(new Set(hubs.map((h) => h[2].toFixed(2))).size).toBe(4);
    expect(Math.min(...hubs.map((h) => h[2]))).toBeLessThan(-2);
    expect(Math.max(...hubs.map((h) => h[2]))).toBeGreaterThan(2);
  });

  it("hangs the cowcatcher at rail height ahead of the front bogie (the body's own one floated after the lift)", () => {
    const m = cowcatcherMesh();
    let minY = Infinity, maxY = -Infinity, minZ = Infinity;
    for (let i = 0; i < m.positions.length; i += 3) {
      minY = Math.min(minY, m.positions[i + 1]!); maxY = Math.max(maxY, m.positions[i + 1]!); minZ = Math.min(minZ, m.positions[i + 2]!);
    }
    expect(Math.abs(minY - COWCATCHER.railTopY)).toBeLessThan(0.1); // lowest point within 0.1 m of the rail top
    expect(maxY).toBeGreaterThanOrEqual(IDOL_TRAM.floorY - 0.1); // brackets reach the body's front sill
    expect(minZ).toBeGreaterThan(Math.max(...tramWheelHubs().map((h) => h[2])) + TRAM_RUNNING_GEAR.radius); // clear of the front wheels
  });

  it("rolls by distance / radius and holds still at rest", () => {
    const dt = 1 / 60;
    let spin = 0;
    for (let f = 0; f < 30; f++) spin = advanceWheelSpin(spin, 6, dt);
    expect(spin).toBeCloseTo(((6 * 30 * dt) / TRAM_RUNNING_GEAR.radius) % (Math.PI * 2), 6); // 3 m rolled, wrapped to one turn
    expect(advanceWheelSpin(spin, 0, dt)).toBe(spin);
    const a = tramWheelTransforms(tramRotation([0, 0, 1], 0), [0, 0, 0], 0.2);
    const b = tramWheelTransforms(tramRotation([0, 0, 1], 0), [0, 0, 0], 0.9);
    expect(a[0]!.rotation![0]).not.toBeCloseTo(b[0]!.rotation![0]!, 3);
    expect(a[0]!.position).toEqual(b[0]!.position);
  });

  it("the runtime spins the wheel instances every frame while the tram moves and keeps them under the tram", { timeout: 120_000 }, () => {
    const world = buildWorld(data, "bands");
    const wheelFrames: Transform[][] = [];
    let bodyPos: number[] = [0, 0, 0];
    const handle = (id: string) => ({
      setPosition(...p: number[]) { if (id === "tram-body") bodyPos = p; },
      setRotation() {}, setVisible() {}, setMaterial() {}, setScale() {}, setLight() {}, setUniform() {}, updateAttribute() {},
      setInstances(list: Transform[]) { if (id === TRAM_WHEEL_IDS[0]) wheelFrames.push(list); },
      play() {}, setAnimation() {}, setClip() {}
    });
    const mockApp = {
      effects: { runtime: "off", registerPreset() {}, spawn() {} },
      camera: { setPose() {} },
      setScene() {},
      nodes: { require: (id: string) => handle(id), get: (id: string) => handle(id) }
    };
    const runtime = world.bind(mockApp as unknown as Parameters<typeof world.bind>[0], data);
    const sim = {
      leg: 0, distance: 20, speed: 8, roll: 0, rollVelocity: 0, timeOfDay: "day" as const, comfort: 100, score: 0, trips: [], phase: "enroute",
      attempt: { id: 1, status: "active" as const, fares: 0, tips: 0, bonuses: 0, lost: 0, catches: 0, streak: 0, grade: "Gold" as const }
    };
    for (let f = 0; f < 6; f++) runtime.update({ ...sim, distance: 20 + f * 0.13 } as unknown as Parameters<typeof runtime.update>[0], 1 + f / 60);
    expect(wheelFrames.length).toBe(6);
    const spins = wheelFrames.map((w) => w[0]!.rotation.join(","));
    for (let f = 2; f < spins.length; f++) expect(spins[f]).not.toBe(spins[f - 1]);
    const last = wheelFrames.at(-1)!;
    expect(last).toHaveLength(8);
    for (const w of last) {
      const d = Math.hypot(w.position[0]! - bodyPos[0]!, w.position[2]! - bodyPos[2]!);
      expect(d).toBeLessThan(4.5); // within the tram's half length of the body origin
      expect(w.position[1]!).toBeGreaterThan(bodyPos[1]! - 0.2);
      expect(w.position[1]!).toBeLessThan(bodyPos[1]! + TRAM_RUNNING_GEAR.skirtY);
    }
    // stopped: the spin holds
    runtime.update({ ...sim, speed: 0, distance: 21 } as unknown as Parameters<typeof runtime.update>[0], 1.2);
    runtime.update({ ...sim, speed: 0, distance: 21 } as unknown as Parameters<typeof runtime.update>[0], 1.22);
    expect(wheelFrames.at(-1)![0]!.rotation).toEqual(wheelFrames.at(-2)![0]!.rotation);
  });
});
