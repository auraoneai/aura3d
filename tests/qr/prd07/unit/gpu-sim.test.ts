// PRD-07 P5-T1 — §8.3 GPU-sim CPU mirror oracle. The GLSL simulation and this
// mirror implement the same math; the browser parity spec (gpu-sim-parity)
// checks the real GPU path against these reference integrators.

import { describe, expect, it } from "vitest";
import {
  a3dCurlNoise,
  a3dValueNoise,
  gpuSimCpuStep,
  gpuSimEmit,
  type GpuSimSpec
} from "../../../../packages/rendering/src/vfx/ParticleGpuSim";

const spec = (over: Partial<GpuSimSpec> = {}): GpuSimSpec => ({
  capacity: 4096,
  stateWidth: 64,
  gravity: [0, -9.8, 0],
  wind: [0, 0, 0],
  drag: 0,
  noiseFreq: 0.35,
  noiseScroll: 0.2,
  noiseStrength: 0,
  groundPlane: -1e9,
  bounce: 0.35,
  lifeLoss: 0,
  lifetimeMax: 2,
  emitter: { origin: [0, 0, 0], direction: [0, 1, 0], spread: 0, speed: [5, 5], discRadius: 0 },
  seed: 0xabcd,
  useHeightfield: false,
  heightfield: null,
  heightUvScale: 0,
  heightMax: 0,
  ...over
});

describe("P5-T1 gpu sim CPU mirror", () => {
  it("one gravity step matches semi-implicit Euler", () => {
    const s = spec();
    const n = 128;
    const pos = new Float32Array(n * 4);
    const vel = new Float32Array(n * 4);
    for (let i = 0; i < n; i += 1) gpuSimEmit(i, s.seed!, 0, s, pos, vel);
    const dt = 1 / 60;
    gpuSimCpuStep(pos, vel, s, dt, dt, 1, 0, 0);
    for (let i = 0; i < n; i += 1) {
      expect(vel[i * 4 + 1]).toBeCloseTo(5 + s.gravity![1] * dt, 5);
      expect(pos[i * 4 + 1]).toBeCloseTo((5 + s.gravity![1] * dt) * dt, 4);
    }
  });

  it("60 steps of gravity-only stay within 1mm of the closed form", () => {
    const s = spec({ drag: 0, groundPlane: -1e9 });
    const n = 64;
    const pos = new Float32Array(n * 4);
    const vel = new Float32Array(n * 4);
    for (let i = 0; i < n; i += 1) gpuSimEmit(i, s.seed!, 0, s, pos, vel);
    const dt = 1 / 60;
    for (let f = 1; f <= 60; f += 1) gpuSimCpuStep(pos, vel, s, dt, f * dt, f, 0, 0);
    // Semi-implicit Euler: y(n) = v0·dt·n + g·dt²·n(n+1)/2.
    const nSteps = 60;
    const expectedY = 5 * dt * nSteps + s.gravity![1] * dt * dt * (nSteps * (nSteps + 1)) / 2;
    for (let i = 0; i < n; i += 1) {
      expect(Math.abs(pos[i * 4 + 1] - expectedY)).toBeLessThan(0.001);
    }
  });

  it("ring emission fills exactly [head, head+count) mod capacity", () => {
    const s = spec({ capacity: 8 });
    const pos = new Float32Array(8 * 4).fill(1e9); // age sentinel = dead
    const vel = new Float32Array(8 * 4);
    gpuSimCpuStep(pos, vel, s, 1 / 60, 0, 0, 6, 4);
    const emitted = Array.from({ length: 8 }, (_, i) => pos[i * 4 + 3]! < 1e8);
    expect(emitted).toEqual([true, true, false, false, false, false, true, true]);
  });

  it("dead slots are skipped (age ≥ lifetimeMax untouched)", () => {
    const s = spec({ capacity: 4, lifetimeMax: 1 });
    const pos = new Float32Array(4 * 4);
    const vel = new Float32Array(4 * 4);
    pos.set([9, 9, 9, 1.5, 8, 8, 8, 0.2, 7, 7, 7, 0.9, 6, 6, 6, 0.0]);
    gpuSimCpuStep(pos, vel, s, 1 / 60, 0, 0, 0, 0);
    expect(pos[0]).toBe(9); expect(pos[1]).toBe(9); // dead slot untouched
    expect(pos[5]).not.toBe(8); // live slot: y integrated by gravity
  });

  it("ground-plane collision bounces, damps tangent, and ages", () => {
    const s = spec({ capacity: 1, groundPlane: 0, bounce: 0.5, lifeLoss: 0.1 });
    const pos = new Float32Array(4);
    const vel = new Float32Array(4);
    pos.set([1, -0.5, 2, 0.5]);
    vel.set([0.5, -2, 0.25, 0.5]);
    gpuSimCpuStep(pos, vel, s, 1 / 60, 0, 0, 0, 0);
    expect(pos[1]).toBeGreaterThanOrEqual(0);
    expect(vel[1]).toBeGreaterThan(0);
    expect(vel[0]).toBeCloseTo(0.5 * 0.7, 5);
    expect(pos[3]).toBeCloseTo(0.5 + 1 / 60 + 0.1, 4);
  });

  it("heightfield collision uses the query when useHeightfield", () => {
    const s = spec({ capacity: 1, useHeightfield: true, bounce: 0.5 });
    const pos = new Float32Array(4);
    const vel = new Float32Array(4);
    pos.set([1, 4.5, 2, 0.1]); // above heightfield@5 but falls below after step
    vel.set([0, -30, 0, 0.5]);
    gpuSimCpuStep(pos, vel, s, 1 / 60, 0, 0, 0, 0, () => 5);
    expect(pos[1]).toBe(5);
    expect(vel[1]).toBeGreaterThan(0);
  });

  it("curl noise is finite, deterministic, and locally smooth", () => {
    const n = a3dCurlNoise(1.3, -0.7, 2.1);
    expect(n).toHaveLength(3);
    for (const c of n) expect(Number.isFinite(c)).toBe(true);
    expect(a3dCurlNoise(1.3, -0.7, 2.1)).toEqual(n);
    expect(a3dValueNoise(1.3, -0.7, 2.1)).toBeGreaterThanOrEqual(-1);
    expect(a3dValueNoise(1.3, -0.7, 2.1)).toBeLessThanOrEqual(1);
    // smoothness: nearby point differs by less than ~10%
    const b = a3dValueNoise(1.31, -0.7, 2.1);
    expect(Math.abs(b - a3dValueNoise(1.3, -0.7, 2.1))).toBeLessThan(0.2);
  });

  it("emission is deterministic on (index, seed, frame)", () => {
    const s = spec();
    const a = new Float32Array(4); const av = new Float32Array(4);
    const b = new Float32Array(4); const bv = new Float32Array(4);
    gpuSimEmit(0, s.seed!, 7, s, a, av);
    gpuSimEmit(0, s.seed!, 7, s, b, bv);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Array.from(av)).toEqual(Array.from(bv));
    gpuSimEmit(0, s.seed!, 8, s, b, bv);
    expect(Array.from(bv)).not.toEqual(Array.from(av)); // frame hash perturbs vel.w
  });
});
