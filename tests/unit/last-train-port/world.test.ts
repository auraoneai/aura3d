import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyMat3, matrixToEulerZYX, tramRotation } from "../../../examples/last-train-port/orient";
import { buildMotormanConductorNode, buildPassengerNode, buildStreetcarBodyNode } from "../../../examples/last-train-port/art/proceduralModels";
import { SEATS, buildWorld, hexToRgb, lehmer, ribbon, TEMPERAMENT_COLORS } from "../../../examples/last-train-port/world";
import { sampleRoute } from "../../../examples/last-train-port/sim";
import type { RouteData, SimData, Tables } from "../../../examples/last-train-port/sim";

const data: SimData = {
  route: JSON.parse(readFileSync("examples/last-train-port/data/route.json", "utf8")) as RouteData,
  tables: JSON.parse(readFileSync("examples/last-train-port/data/tables.json", "utf8")) as Tables
};

describe("last-train-port rendering helpers", () => {
  it("tram rotation maps local +Z to the travel direction and tilts with grade", () => {
    const f: [number, number, number] = [0.6, 0.1, 0.8];
    const len = Math.hypot(...f);
    const fwd: [number, number, number] = [f[0] / len, f[1] / len, f[2] / len];
    const out = applyMat3(tramRotation(fwd, 0), [0, 0, 1]);
    out.forEach((v, i) => expect(v).toBeCloseTo(fwd[i]!, 9));
    const up = applyMat3(tramRotation([0, 0, 1], 0), [0, 1, 0]);
    expect(up[1]).toBeCloseTo(1, 9);
  });

  it("roll tilts the roof sideways without moving the nose", () => {
    const rot = tramRotation([0, 0, 1], 0.3);
    expect(applyMat3(rot, [0, 0, 1])[2]).toBeCloseTo(1, 9);
    expect(Math.abs(applyMat3(rot, [0, 1, 0])[0])).toBeGreaterThan(0.25);
  });

  it("euler conversion round-trips a pure yaw", () => {
    const e = matrixToEulerZYX(tramRotation([Math.sin(0.7), 0, Math.cos(0.7)], 0));
    expect(e[1]).toBeCloseTo(0.7, 9);
    expect(e[0]).toBeCloseTo(0, 9);
    expect(e[2]).toBeCloseTo(0, 9);
  });

  it("ribbon builds two vertices per centreline point and two triangles per segment, flat on the ground plane", () => {
    const pts = [0, 0, 0, 0, 0, 2, 0, 1, 4];
    const r = ribbon(pts, 1, 0.1);
    expect(r.positions).toHaveLength(3 * 6);
    expect(r.indices).toHaveLength(12);
    expect(r.positions[0]).toBeCloseTo(-1, 9);
    expect(r.positions[3]).toBeCloseTo(1, 9);
    expect(r.positions[1]).toBeCloseTo(0.1, 9);
  });

  it("seats are twelve and distinct; temperaments have four colours; helpers are deterministic", () => {
    expect(SEATS).toHaveLength(12);
    expect(new Set(SEATS.map((s) => s.join(","))).size).toBe(12);
    expect(Object.keys(TEMPERAMENT_COLORS)).toHaveLength(4);
    expect(hexToRgb("#ff8000")).toEqual([1, 128 / 255, 0]);
    const a = lehmer(5), b = lehmer(5);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("builds the whole scene (sky, cloud sea, six towns, tram, seats, weather, lighting rig) with unique node names", { timeout: 30_000 }, () => {
    const world = buildWorld(data);
    const json = JSON.stringify(world.scene.toJSON());
    for (const name of ["sky", "cloud-sea", "islands", "platforms", "tram-body", "pax-11-sleeper", "house-0-a-2", "house-5-b-1", "clock-tower-0", "lighthouse-1", "crates-3-0", "lamp-post-2--9", "weather", "track-bed", "track-rails", "sun", "lamps", "sleepers", "landmark-5", "motes", "facades-0", "roofs-2", "stonework", "plaza-cobbles"]) expect(json, name).toContain(`"${name}"`);
    const nightJson = JSON.stringify(world.nightScene.toJSON());
    expect(nightJson).toContain('"moon"');
    expect(nightJson).not.toContain('"sun"');
    // probes.reflection echoes its name inside `options` (GU47 LT-08): count node names only
    const names = [...json.matchAll(/(?<!"options":\{)"name":"([^"]+)"/g)].map((m) => m[1]!);
    expect(new Set(names).size).toBe(names.length);
  });

  it("triggers impactRig cleanly on departure/catches, applies fovDeltaDeg without NaN, and rebinds sky/clouds/weather handles across setScene", () => {
    const world = buildWorld(data, "bands");
    let sceneGeneration = 0;
    const nodeCalls = new Map<string, number>();
    const recordedFovs: number[] = [];
    const mockApp = {
      effects: { runtime: "off", registerPreset() {}, spawn() {} },
      camera: {
        setPose(pose: { fov: number }) {
          recordedFovs.push(pose.fov);
        }
      },
      setScene() {
        sceneGeneration += 1;
      },
      nodes: {
        require(id: string) {
          return this.get(id);
        },
        get(id: string) {
          const gen = sceneGeneration;
          const record = (kind: string) => {
            const key = `${gen}:${id}:${kind}`;
            nodeCalls.set(key, (nodeCalls.get(key) ?? 0) + 1);
          };
          return {
            setPosition() { record("pos"); },
            setRotation() {},
            setVisible() {},
            setMaterial() {},
            setInstances() {},
            setLight() {},
            setUniform() { record("uniform"); },
            updateAttribute() { record("attr"); }
          };
        }
      }
    };
    const runtime = world.bind(mockApp as unknown as Parameters<typeof world.bind>[0], data);
    const simBase = {
      leg: 0,
      distance: 0,
      speed: 0,
      roll: 0,
      rollVelocity: 0,
      timeOfDay: "day" as const,
      comfort: 100,
      score: 0,
      trips: [],
      attempt: { id: 1, status: "active" as const, fares: 0, tips: 0, bonuses: 0, lost: 0, catches: 0, streak: 0, grade: "Gold" as const }
    };
    runtime.update({ ...simBase, phase: "closing" } as unknown as Parameters<typeof runtime.update>[0], 0.1);
    runtime.update({ ...simBase, phase: "enroute", speed: 6 } as unknown as Parameters<typeof runtime.update>[0], 0.15);
    runtime.update({ ...simBase, phase: "enroute", speed: 6, attempt: { ...simBase.attempt, catches: 1 } } as unknown as Parameters<typeof runtime.update>[0], 0.2);
    expect(recordedFovs.length).toBe(3);
    expect(recordedFovs.every(Number.isFinite)).toBe(true);

    // Dock at leg 3 (band swap A -> C) to verify generation-1 sky/clouds/motes handles are updated instead of stale generation-0 handles.
    const gen0SkyBeforeSwap = nodeCalls.get("0:sky:pos") ?? 0;
    runtime.update({ ...simBase, leg: 3, phase: "docked", speed: 0 } as unknown as Parameters<typeof runtime.update>[0], 0.3);
    expect(sceneGeneration).toBe(1);
    expect(nodeCalls.get("0:sky:pos")).toBe(gen0SkyBeforeSwap);
    expect(nodeCalls.get("1:sky:pos")).toBe(1);
    expect(nodeCalls.get("1:cloud-sea:pos")).toBe(1);
    expect(nodeCalls.get("1:motes:attr")).toBeGreaterThan(0);
  });

  it("authors an enclosed coastal electric railcar on twin-axle bogies and keeps the camera looking down-track when docked, departing, and tilting A/D", () => {
    const tramJson = buildStreetcarBodyNode("tram-body", 1.2, true).toJSON() as {
      children: Array<{
        name: string;
        customGeometry?: { positions: Float32Array | number[] };
        geometry?: { positions?: Float32Array | number[] };
        material: { color?: string };
      }>;
    };
    expect(tramJson.children).toHaveLength(13);
    const colors = tramJson.children.map((c) => c.material.color);
    // Crimson lower steel waist (#b8292f), cream upper window band (#f5ebd6), machined steel wheel treads (#d8e2ec), dark-slate glass (#1c2d3e), canvas-grey roof (#48505a)
    expect(colors).toEqual(expect.arrayContaining(["#b8292f", "#f5ebd6", "#d8e2ec", "#1c2d3e", "#48505a"]));

    let minWheelTreadY = Infinity;
    let maxTramY = -Infinity;
    let maxTramZ = -Infinity;
    for (const child of tramJson.children) {
      const pos = (child.customGeometry?.positions ?? child.geometry?.positions)!;
      expect(pos, child.name).toBeDefined();
      for (let i = 0; i < pos.length; i += 3) {
        const y = pos[i + 1]!;
        const z = Math.abs(pos[i + 2]!);
        if (y > maxTramY) maxTramY = y;
        if (z > maxTramZ) maxTramZ = z;
        if (child.name === "tram-body material 5" && y > 0.05 && y < minWheelTreadY) {
          // Machined wheel tread radius 0.36 at axle y = 0.43 -> rests directly on the y = 0.07 rail head (with inner flange extending to 0.035)
          minWheelTreadY = y;
        }
      }
    }
    expect(minWheelTreadY).toBeLessThanOrEqual(0.08);
    expect(maxTramY).toBeGreaterThan(6.6);
    expect(maxTramZ).toBeGreaterThan(5.2);

    const world = buildWorld(data, "bands");
    const poses: Array<{ position: [number, number, number]; target: [number, number, number]; up: [number, number, number] }> = [];
    const mockApp = {
      effects: { runtime: "off", registerPreset() {}, spawn() {} },
      camera: {
        setPose(pose: { position: [number, number, number]; target: [number, number, number]; up: [number, number, number] }) {
          poses.push(pose);
        }
      },
      setScene() {},
      nodes: {
        require() { return this.get(); },
        get() {
          return {
            setPosition() {},
            setRotation() {},
            setVisible() {},
            setMaterial() {},
            setInstances() {},
            setLight() {},
            setUniform() {},
            updateAttribute() {}
          };
        }
      }
    };
    const runtime = world.bind(mockApp as unknown as Parameters<typeof world.bind>[0], data);
    const simBase = {
      leg: 0,
      distance: 10,
      speed: 0,
      roll: 0,
      rollVelocity: 0,
      timeOfDay: "day" as const,
      comfort: 100,
      score: 0,
      trips: [],
      attempt: { id: 1, status: "active" as const, fares: 0, tips: 0, bonuses: 0, lost: 0, catches: 0, streak: 0, grade: "Gold" as const }
    };

    const assertDownTrackCamera = (dist: number) => {
      const pose = poses[poses.length - 1]!;
      const s0 = sampleRoute(data.route, 0, dist);
      const s1 = sampleRoute(data.route, 0, dist + 1.5);
      const fLen = Math.hypot(s1.x - s0.x, s1.y - s0.y, s1.z - s0.z) || 1;
      const fx = (s1.x - s0.x) / fLen, fy = (s1.y - s0.y) / fLen, fz = (s1.z - s0.z) / fLen;
      const viewX = pose.target[0] - pose.position[0];
      const viewY = pose.target[1] - pose.position[1];
      const viewZ = pose.target[2] - pose.position[2];
      const viewLen = Math.hypot(viewX, viewY, viewZ);
      const forwardAlignment = (viewX * fx + viewY * fy + viewZ * fz) / viewLen;
      // Camera always looks predominantly down the railway track ahead (> 0.90), never perpendicular sideways!
      expect(forwardAlignment).toBeGreaterThan(0.9);
      const relBehind = (pose.position[0] - s0.x) * fx + (pose.position[1] - s0.y) * fy + (pose.position[2] - s0.z) * fz;
      expect(relBehind).toBeLessThan(-10);
    };

    // 1. Docked at station: rear-platform 3/4 chase looking down the train & track
    runtime.update({ ...simBase, phase: "docked", speed: 0, distance: 10 } as unknown as Parameters<typeof runtime.update>[0], 0.1);
    assertDownTrackCamera(10);

    // 2. Departing & driving while tilting hard left and hard right (A / D): stays behind train looking down-track
    for (let i = 1; i <= 12; i += 1) {
      runtime.update({ ...simBase, phase: "enroute", speed: 12, distance: 10 + i * 3, roll: -0.42 } as unknown as Parameters<typeof runtime.update>[0], 0.1 + i * 0.1);
    }
    assertDownTrackCamera(10 + 12 * 3);
    const upLeft = poses[poses.length - 1]!.up;

    for (let i = 13; i <= 24; i += 1) {
      runtime.update({ ...simBase, phase: "enroute", speed: 12, distance: 10 + i * 3, roll: 0.42 } as unknown as Parameters<typeof runtime.update>[0], 0.1 + i * 0.1);
    }
    assertDownTrackCamera(10 + 24 * 3);
    const upRight = poses[poses.length - 1]!.up;
    // Subtle horizon roll tilts opposite between left and right lean while keeping up predominantly vertical (> 0.99)
    expect(upLeft[1]).toBeGreaterThan(0.99);
    expect(upRight[1]).toBeGreaterThan(0.99);
    expect(Math.hypot(upRight[0] - upLeft[0], upRight[2] - upLeft[2])).toBeGreaterThan(0.01);

    // 3. Motorman/conductor & seated passengers use smooth high-vertex sculpts and matte-soft cloth/skin (zero noisy HDRI twig streaks)
    const conductorJson = buildMotormanConductorNode("a3g-fx-tram-conductor", false).toJSON() as {
      children: Array<{ material: { roughness?: number; clearcoat?: number; envMapIntensity?: number; metallic?: number; metalness?: number }; customGeometry?: { positions: Float32Array | number[] }; geometry?: { positions?: Float32Array | number[] } }>;
    };
    expect(conductorJson.children.length).toBeGreaterThanOrEqual(5);
    let conductorVerts = 0;
    for (const child of conductorJson.children) {
      const pos = (child.customGeometry?.positions ?? child.geometry?.positions)!;
      conductorVerts += pos.length / 3;
      const metal = child.material.metallic ?? child.material.metalness ?? 0;
      if (metal < 0.4) {
        expect(child.material.roughness).toBeGreaterThanOrEqual(0.56);
        expect(child.material.roughness).toBeLessThanOrEqual(0.74);
        expect(child.material.clearcoat ?? 0).toBe(0);
        expect(child.material.envMapIntensity).toBeGreaterThanOrEqual(0.04);
        expect(child.material.envMapIntensity).toBeLessThanOrEqual(0.12);
      }
    }
    expect(conductorVerts).toBeGreaterThan(3500);

    const paxJson = buildPassengerNode("easy", "pax-0-easy", false).toJSON() as {
      children: Array<{ material: { roughness?: number; clearcoat?: number; envMapIntensity?: number; metallic?: number; metalness?: number } }>;
    };
    for (const child of paxJson.children) {
      const metal = child.material.metallic ?? child.material.metalness ?? 0;
      if (metal < 0.4) {
        expect(child.material.roughness).toBeGreaterThanOrEqual(0.56);
        expect(child.material.roughness).toBeLessThanOrEqual(0.74);
        expect(child.material.clearcoat ?? 0).toBe(0);
        expect(child.material.envMapIntensity).toBeGreaterThanOrEqual(0.04);
        expect(child.material.envMapIntensity).toBeLessThanOrEqual(0.12);
      }
    }
  });
});
