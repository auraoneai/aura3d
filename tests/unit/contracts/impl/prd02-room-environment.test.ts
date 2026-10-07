/**
 * PRD-02 §7.2 — `RoomEnvironmentScene.ts` is a verbatim port of three r185
 * `RoomEnvironment.js`. The test parses the vendored upstream file so the
 * port cannot silently drift (panel count, radiances, transforms, light).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createRoomEnvironmentScene, sampleRoomEnvironment } from "@aura3d/rendering/lanes";

const UPSTREAM = "benchmark/context/threejs/files/examples/jsm/environments/RoomEnvironment.js";

function parseUpstream() {
  const src = readFileSync(UPSTREAM, "utf8");
  const radiances = [...src.matchAll(/createAreaLightMaterial\(\s*(\d+)\s*\)/g)].map((m) => Number(m[1]));
  const positions = [...src.matchAll(/light(\d)\.position\.set\(\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\s*\)/g)]
    .map((m) => ({ idx: Number(m[1]), pos: [Number(m[2]), Number(m[3]), Number(m[4])] }));
  const scales = [...src.matchAll(/light(\d)\.scale\.set\(\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\s*\)/g)]
    .map((m) => ({ idx: Number(m[1]), scale: [Number(m[2]), Number(m[3]), Number(m[4])] }));
  const lightMatch = /PointLight\(\s*0x([\da-f]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\)/.exec(src)!;
  const lightPos = /mainLight\.position\.set\(\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\s*\)/.exec(src)!;
  return {
    radiances,
    positions,
    scales,
    light: { intensity: Number(lightMatch[2]), decay: Number(lightMatch[4]), position: lightPos.slice(1).map(Number) }
  };
}

describe("prd02 RoomEnvironmentScene (r185 verbatim port)", () => {
  const scene = createRoomEnvironmentScene();
  const upstream = parseUpstream();

  it("6 emissive panels with radiances matching the upstream file", () => {
    expect(upstream.radiances).toEqual([50, 50, 17, 43, 20, 100]);
    expect(scene.panels).toHaveLength(6);
    expect(scene.panels.map((p) => p.emissive[0])).toEqual(upstream.radiances);
  });

  it("panel positions and scales match upstream verbatim", () => {
    for (const up of upstream.positions) {
      const panel = scene.panels[up.idx - 1]!;
      for (let i = 0; i < 3; i += 1) expect(panel.position[i]).toBeCloseTo(up.pos[i]!, 3);
    }
    for (const up of upstream.scales) {
      const panel = scene.panels[up.idx - 1]!;
      for (let i = 0; i < 3; i += 1) expect(panel.scale[i]).toBeCloseTo(up.scale[i]!, 3);
    }
  });

  it("6 prop boxes + room shell + the 900-intensity point light", () => {
    expect(scene.boxes).toHaveLength(6);
    expect(scene.light.intensity).toBe(upstream.light.intensity);
    expect(scene.light.decay).toBe(upstream.light.decay);
    expect([...scene.light.position]).toEqual(upstream.light.position);
  });

  it("sampleRoomEnvironment returns panel radiance toward a panel face and wall bounce elsewhere", () => {
    // Ray at the -x panel (position [-16.116, 14.37, 8.208], emissive 50) reads ~50; wall reads lambertian.
    const [towardX] = sampleRoomEnvironment([-16.116, 14.37, 8.208] as const);
    expect(towardX).toBeGreaterThan(10); // somewhere in an emissive panel
    const [towardWall] = sampleRoomEnvironment([0.4, -0.9, 0.4] as const);
    expect(towardWall).toBeGreaterThan(0);
    expect(towardWall).toBeLessThan(5); // walls are ~0.1–0.5, not emissive
  });
});
