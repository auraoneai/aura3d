import { describe, expect, it } from "vitest";
import { GUST_MAX, GUST_MIN, WIND_DIR, WIND_GLSL, downwindYaw, gustAt, windAt } from "../../../examples/where-the-wind-wanders-port/wind";
import { WIND_VFX_PRESETS, emissionScale, petalStreamSpec, BELL_FLASH, chimneySmokeSpec, SMOKE_DIR, createWindVfx } from "../../../examples/where-the-wind-wanders-port/vfx";

describe("where-the-wind-wanders-port wind (WW47-S2)", () => {
  it("blows from the west-southwest toward the east-northeast", () => {
    expect(Math.hypot(...WIND_DIR)).toBeCloseTo(1, 12);
    expect(WIND_DIR[0]).toBeGreaterThan(0);
    expect(WIND_DIR[1]).toBeLessThan(0);
    expect(Math.sin(downwindYaw())).toBeCloseTo(WIND_DIR[0], 12);
  });

  it("a gust at one place spans 1.0 to 2.5x over 20 s", () => {
    let lo = Infinity, hi = -Infinity;
    for (let t = 0; t <= 20; t += 0.05) {
      const g = gustAt(-12, 4, t);
      lo = Math.min(lo, g); hi = Math.max(hi, g);
      expect(g).toBeGreaterThanOrEqual(GUST_MIN - 1e-9);
      expect(g).toBeLessThanOrEqual(GUST_MAX + 1e-9);
    }
    expect(lo).toBeLessThan(1.05);
    expect(hi).toBeGreaterThan(2.4);
  });

  it("gust bands travel downwind", () => {
    // the band peak seen at the origin at t reaches a point 10 m downwind later
    const peakTime = (x: number, z: number): number => {
      let best = 0, bestG = -1;
      for (let t = 0; t < 14; t += 0.01) { const g = gustAt(x, z, t); if (g > bestG) { bestG = g; best = t; } }
      return best;
    };
    expect(peakTime(WIND_DIR[0] * 10, WIND_DIR[1] * 10)).toBeGreaterThan(peakTime(0, 0));
  });

  it("the wind vector follows the direction scaled by the gust", () => {
    const [x, z] = windAt(3, 4, 5);
    expect(Math.hypot(x, z)).toBeCloseTo(gustAt(3, 4, 5), 12);
  });

  it("the GLSL mirror carries the same direction", () => {
    expect(WIND_GLSL).toContain(`vec2(${WIND_DIR[0]}, ${WIND_DIR[1]})`);
    expect(WIND_GLSL).toMatch(/float windGust\(vec2 p, float t\)/);
  });
});

describe("where-the-wind-wanders-port VFX pack (WW47-V1..V3)", () => {
  it("registers every event's preset under the game's own prefix", () => {
    for (const [kind, spec] of Object.entries(WIND_VFX_PRESETS)) {
      expect(kind.startsWith("wind-")).toBe(true);
      expect(spec.name).toBe(kind);
      expect(spec.layers.length).toBeGreaterThan(0);
    }
  });

  it("the petal stream stays within 300 particles and halves under reduced motion", () => {
    const count = (motion: number): number => petalStreamSpec(motion).layers.reduce((n, l) => n + Number((l as { count?: number }).count ?? 0), 0);
    expect(count(1)).toBeLessThanOrEqual(300);
    expect(count(1)).toBeGreaterThanOrEqual(200);
    expect(count(0.5)).toBe(Math.round(220 * 0.5) + Math.round(60 * 0.5));
  });

  it("Low fires no particles; reduced motion halves emission", () => {
    expect(emissionScale({ low: true, reducedMotion: false })).toBe(0);
    expect(emissionScale({ low: false, reducedMotion: true })).toBe(0.5);
    expect(emissionScale({ low: false, reducedMotion: false })).toBe(1);
  });

  it("the bell flash stays under the reduced-flash cap", () => {
    expect(BELL_FLASH.peak).toBeLessThanOrEqual(0.3);
    expect(BELL_FLASH.seconds).toBeLessThanOrEqual(0.2);
  });
});

describe("where-the-wind-wanders-port chimney smoke (WW47-V4)", () => {
  it("leans downwind within 30 degrees of the wind, rises, uses smoke-a and halves under reduced motion", () => {
    const horiz = Math.hypot(SMOKE_DIR[0], SMOKE_DIR[2]);
    const cos = (SMOKE_DIR[0] * WIND_DIR[0] + SMOKE_DIR[2] * WIND_DIR[1]) / horiz;
    expect((Math.acos(Math.min(1, cos)) * 180) / Math.PI).toBeLessThan(30);
    expect(SMOKE_DIR[1]).toBeGreaterThan(0);
    const layer = chimneySmokeSpec(1).layers[0] as { sprite?: string; count?: number };
    expect(layer.sprite).toBe("smoke-a");
    expect(layer.count).toBe(24);
    expect((chimneySmokeSpec(0.5).layers[0] as { count?: number }).count).toBe(12);
  });

  it("spawns one plume at the chimney on High and none on Low", async () => {
    const { buildScenery } = await import("../../../examples/where-the-wind-wanders-port/scenery");
    const chimney = buildScenery(4242).chimney!;
    expect(chimney.y).toBeGreaterThan(5);
    const run = (low: boolean) => {
      const spawned: string[] = [];
      const handle = { setPosition() { return handle; }, stop() {} };
      const app = { effects: { runtime: "off", registerPreset() {}, burst() { return handle; }, spawn(spec: { name: string }) { spawned.push(spec.name); return handle; } } };
      const vfx = createWindVfx(app as never, { low, reducedMotion: () => false, reducedFlash: () => false, chimney: [chimney.x, chimney.y, chimney.z] });
      vfx.update([0, 0, 0], 0, 1 / 60);
      vfx.update([0, 0, 0], 0.1, 1 / 60);
      return spawned;
    };
    expect(run(false).filter((n) => n === "wind-chimney-smoke")).toHaveLength(1);
    expect(run(true)).toHaveLength(0);
  });
});
