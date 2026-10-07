/**
 * PRD-10 Phase 4 (CPU side): Gerstner spec/packing, CPU↔GPU chunk agreement
 * (T4.1 ≤ 1e-3 m gate), `world.water` builder + handle, the C-36 water
 * handler, `water.surface` flag-on emit, and OceanSurface re-export parity.
 */
import { describe, expect, it } from "vitest";
import {
  GERSTNER_MAX_WAVES,
  GERSTNER_PRESETS,
  gerstnerEvaluate,
  gerstnerHeightAt,
  packGerstnerWaves,
  resolveGerstnerWaves
} from "../../../../packages/rendering/src/world/water/GerstnerWaves";
import { a3d_prd10_gerstner } from "../../../../packages/rendering/src/world/water/shaders/gerstner";
import {
  createWaterHandle,
  waterRecordFor,
  waterRecordIds,
  worldWater,
  type AuraWaterNode
} from "../../../../packages/engine/src/agent-api/world/water";
import { nodeHandlerFor } from "../../../../packages/engine/src/contracts/compiler";
import { water as waterNodes } from "../../../../packages/engine/src/agent-api/nodes/water";
import { evaluateWaves, oceanPresetWaves } from "../../../../packages/rendering/src/OceanSurface";
import "../../../../packages/engine/src/lanes/prd10";

const FLAGS_ON = { values: { A3D_QR_WORLD: true, A3D_QR_WORLD_WATER: true }, on: (n: string) => Boolean(({
  A3D_QR_WORLD: true,
  A3D_QR_WORLD_WATER: true
} as Record<string, unknown>)[n]) };

describe("prd10 gerstner spec layer (T4.1)", () => {
  it("presets: calm/moderate = 4 waves, rough = 8", () => {
    expect(resolveGerstnerWaves("calm")).toHaveLength(4);
    expect(resolveGerstnerWaves("moderate")).toHaveLength(4);
    expect(resolveGerstnerWaves("rough")).toHaveLength(8);
    expect(resolveGerstnerWaves(undefined)).toEqual(GERSTNER_PRESETS.moderate);
  });

  it("packs into u_waves/u_waveSpeed layout with zeros beyond count", () => {
    const p = packGerstnerWaves(resolveGerstnerWaves("calm"));
    expect(p.waveCount).toBe(4);
    expect(p.waves.length).toBe(GERSTNER_MAX_WAVES * 4);
    expect(p.waveSpeed.length).toBe(GERSTNER_MAX_WAVES);
    // wave 0: directionDeg 0 → dir (1, 0)
    expect(p.waves[0]).toBeCloseTo(1, 6);
    expect(p.waves[1]).toBeCloseTo(0, 6);
    expect(p.waves[2]).toBeCloseTo(0.18, 6);
    expect(p.waves[3]).toBeCloseTo(8.0, 6);
    expect(p.waveSpeed[0]).toBe(1);
    // inactive slots zeroed
    expect(p.waves[7 * 4]).toBe(0);
    expect(p.waveSpeed[7]).toBe(0);
  });

  it("clamps Σ steepness ≤ 1 by uniform rescale", () => {
    const p = packGerstnerWaves([
      { directionDeg: 0, wavelength: 4, steepness: 0.8 },
      { directionDeg: 90, wavelength: 4, steepness: 0.8 }
    ]);
    expect(p.steepnessClamped).toBeGreaterThan(0);
    const sum = (p.waves[2] ?? 0) + (p.waves[6] ?? 0);
    expect(sum).toBeCloseTo(1, 6);
  });

  it("tier cap: maxWaves=4 slices rough to 4", () => {
    const p = packGerstnerWaves(resolveGerstnerWaves("rough"), 4);
    expect(p.waveCount).toBe(4);
  });

  it("CPU twin matches a shader-order evaluation within 1e-3 m over 10 s × 100 points", () => {
    // Shader-order reimplementation (a3d_prd10_gerstner): same k/c/f/a chain
    // evaluated from the *packed* uniforms, as the GPU reads them.
    const gpuOrderHeight = (u: ReturnType<typeof packGerstnerWaves>, x: number, z: number, t: number): number => {
      let py = 0;
      for (let i = 0; i < 8; i += 1) {
        if (i >= u.waveCount) break;
        const d = [u.waves[i * 4]!, u.waves[i * 4 + 1]!];
        const k = 6.2831853 / u.waves[i * 4 + 3]!;
        const c = Math.sqrt(9.81 / k) * u.waveSpeed[i]!;
        const f = k * (d[0]! * x + d[1]! * z - c * t);
        const a = u.waves[i * 4 + 2]! / k;
        py += a * Math.sin(f);
      }
      return py;
    };
    const p = packGerstnerWaves(resolveGerstnerWaves("rough"));
    let maxErr = 0;
    for (let pt = 0; pt < 100; pt += 1) {
      const x = (pt % 10) * 4.37 - 19.3;
      const z = Math.floor(pt / 10) * 3.91 - 17.4;
      for (let ts = 0; ts <= 10; ts += 0.5) {
        const cpu = gerstnerHeightAt(p, x, z, ts);
        const gpu = gpuOrderHeight(p, x, z, ts);
        maxErr = Math.max(maxErr, Math.abs(cpu - gpu));
      }
    }
    expect(maxErr).toBeLessThanOrEqual(1e-3);
  });

  it("normals are unit-length and up-facing on calm seas", () => {
    const p = packGerstnerWaves(resolveGerstnerWaves("calm"));
    const e = gerstnerEvaluate(p, 3, -2, 1.5);
    const len = Math.hypot(e.normal[0], e.normal[1], e.normal[2]);
    expect(len).toBeCloseTo(1, 6);
    expect(e.normal[1]).toBeGreaterThan(0.5);
  });

  it("GLSL chunk keeps the shared constants in lockstep", () => {
    expect(a3d_prd10_gerstner.glsl).toContain("6.2831853");
    expect(a3d_prd10_gerstner.glsl).toContain("u_waves[i]");
    expect(a3d_prd10_gerstner.glsl).toContain("u_waveSpeed[i]");
    expect(a3d_prd10_gerstner.wgsl).toBeDefined();
  });
});

describe("prd10 world.water builder + handle (T4.6)", () => {
  it("registers a record and the handle answers from gerstnerEvaluate", () => {
    const b = worldWater({ kind: "lake", shape: { kind: "circle", center: [0, 0], radius: 8 }, waves: "calm", id: "t-water-1" });
    expect(b.toJSON().kind).toBe("water");
    const record = waterRecordFor("t-water-1");
    expect(record).not.toBeNull();
    const handle = createWaterHandle(record!);
    const t = 2.25;
    expect(handle.heightAt(1, 2, t)).toBeCloseTo(record!.height + gerstnerEvaluate(record!.waves, 1, 2, t).position[1], 6);
    // Underwater: a point below the displaced surface reports true.
    const y = handle.heightAt(0, 0, t);
    expect(handle.isUnderwater([0, y - 0.05, 0], t)).toBe(true);
    expect(handle.isUnderwater([0, y + 0.5, 0], t)).toBe(false);
    expect(b.handle.id).toBe("t-water-1");
    expect(waterRecordIds()).toContain("t-water-1");
  });

  it("auto-ids and validates shape/waves", () => {
    const b = worldWater({ kind: "pool", shape: { kind: "polygon", points: [[-2, -2], [2, -2], [2, 2], [-2, 2]] } });
    expect((b.toJSON() as AuraWaterNode).id).toMatch(/^water-\d+$/);
    expect(() => worldWater({ kind: "lake" } as never)).toThrow(/shape is required/);
    expect(() => worldWater({ kind: "ocean", shape: { kind: "infinite", radius: -1 } })).toThrow(/positive radius/);
    expect(() =>
      worldWater({ kind: "lake", shape: { kind: "circle", center: [0, 0], radius: 4 }, waves: [] })
    ).toThrow(/at least one wave/);
    expect(() =>
      worldWater({ kind: "lake", shape: { kind: "circle", center: [0, 0], radius: 4 }, waves: [{ directionDeg: 0, wavelength: 0, steepness: 0.5 }] })
    ).toThrow(/wavelength/);
    expect(() =>
      worldWater({ kind: "lake", shape: { kind: "circle", center: [0, 0], radius: 4 }, waves: [{ directionDeg: 0, wavelength: 4, steepness: -0.5 }] })
    ).toThrow(/steepness/);
  });
});

describe("prd10 water node handler + water.surface emit (T4.6)", () => {
  it("C-36: `water` handler is registered under A3D_QR_WORLD_WATER", () => {
    const h = nodeHandlerFor("water");
    expect(h).toBeTruthy();
    expect(h!.flag).toBe("A3D_QR_WORLD_WATER");
  });

  it("water.surface emits a world.water node when the flag is on", () => {
    const prev = process.env.A3D_QR_WORLD;
    process.env.A3D_QR_WORLD = "1";
    try {
      const out = waterNodes.surface({ preset: "rough" });
      expect(out.nodes).toHaveLength(1);
      const node = out.nodes[0] as AuraWaterNode;
      expect(node.kind).toBe("water");
      expect(node.options.kind).toBe("lake");
      expect(out.bandCount).toBe(0);
    } finally {
      if (prev === undefined) delete process.env.A3D_QR_WORLD;
      else process.env.A3D_QR_WORLD = prev;
    }
  });

  it("water.surface emits the legacy fixture when the flag is off", () => {
    const prev = process.env.A3D_QR_WORLD;
    delete process.env.A3D_QR_WORLD;
    try {
      const out = waterNodes.surface({ preset: "calm" });
      expect((out.nodes[0] as { kind: string }).kind).not.toBe("water");
      expect(out.bandCount).toBeGreaterThan(0);
    } finally {
      if (prev !== undefined) process.env.A3D_QR_WORLD = prev;
    }
  });
});

describe("prd10 OceanSurface move parity (T4.1)", () => {
  it("evaluateWaves/oceanPresetWaves still export from OceanSurface", () => {
    const waves = oceanPresetWaves("moderate");
    expect(waves.length).toBeGreaterThan(0);
    const e = evaluateWaves(waves, 0.5, -0.25, 1.2);
    expect(Number.isFinite(e.height)).toBe(true);
    expect(e.normal).toHaveLength(3);
  });
});
