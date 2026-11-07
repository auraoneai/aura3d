// The nine `effects.particles` options that were accepted but never read (option-coverage audit): each is simulated by
// the CPU emitter now, or was removed from the public type. Source-level observations; the rendered look is checked by
// the real-GPU frames recorded with the lane, not here.
import { describe, expect, it } from "vitest";
import { effects } from "../../../packages/engine/src/agent-api/nodes/effects.composite";
import { lowerEffectNode } from "../../../packages/engine/src/production-runtime/effects/EffectNodeLowering";
import { createEmitter, sampleCurve, stepEmitter, writeEmitterInstances, type EmitterDescriptor } from "../../../packages/engine/src/production-runtime/effects/CpuEmitter";

type Lowered = ReturnType<typeof lowerEffectNode> & { emitter: EmitterDescriptor; batch: { stretch: boolean } };
const lower = (options: Record<string, unknown>): Lowered =>
  lowerEffectNode(effects.particles({ name: "probe", seed: 7, ...options } as never).toJSON() as never) as Lowered;

function simulate(desc: EmitterDescriptor, seconds: number): { positions: number[][]; data: Float32Array; live: number } {
  const state = createEmitter(desc);
  for (let t = 0; t < seconds * 60; t++) stepEmitter(state, 1 / 60);
  const data = new Float32Array(state.live * 16);
  writeEmitterInstances(state, data);
  const positions = Array.from({ length: state.live }, (_, i) => [state.px[i]!, state.py[i]!, state.pz[i]!]);
  return { positions, data, live: state.live };
}

const still = { speed: 0, gravity: 0, drag: 0, rate: 400, maxParticles: 400, lifetime: [5, 5], position: [10, 20, 30] };

describe("effects.particles options reach the CPU emitter", () => {
  it("leaves the descriptor untouched when none of the new options are authored (builder defaults are not intent)", () => {
    const { emitter } = lower({});
    for (const key of ["shape", "coneAngle", "wind", "sizeOverLife", "alphaOverLife", "colorOverLife"] as const) {
      expect(emitter[key], key).toBeUndefined();
    }
    // The builder's own default curves ride the node; authoring them verbatim is still "not authored".
    const authoredDefaults = lower({ sizeOverLife: [0.35, 1, 0.58], alphaOverLife: [0, 0.92, 0] }).emitter;
    expect(authoredDefaults.sizeOverLife).toBeUndefined();
    expect(authoredDefaults.alphaOverLife).toBeUndefined();
  });

  it("shape + shapeSize: box takes full extents around the position", () => {
    const { emitter } = lower({ ...still, shape: "box", shapeSize: [4, 2, 6] });
    expect(emitter.shape).toEqual({ kind: "box", size: [4, 2, 6] });
    const { positions, live } = simulate(emitter, 1);
    expect(live).toBeGreaterThan(100);
    for (const [x, y, z] of positions) {
      expect(Math.abs(x! - 10)).toBeLessThanOrEqual(2 + 1e-4);
      expect(Math.abs(y! - 20)).toBeLessThanOrEqual(1 + 1e-4);
      expect(Math.abs(z! - 30)).toBeLessThanOrEqual(3 + 1e-4);
    }
    // The volume is really used on each axis (not a point or a disc).
    expect(Math.max(...positions.map((p) => p[1]!)) - Math.min(...positions.map((p) => p[1]!))).toBeGreaterThan(1.2);
    expect(Math.max(...positions.map((p) => p[2]!)) - Math.min(...positions.map((p) => p[2]!))).toBeGreaterThan(3.5);
  });

  it("shapeSize alone implies a box and a bare number is a cube side", () => {
    expect(lower({ shapeSize: 2 }).emitter.shape).toEqual({ kind: "box", size: [2, 2, 2] });
  });

  it("shape: sphere, hemisphere, disc, ring, edge and point stay inside their volume", () => {
    const radius = (p: number[]) => Math.hypot(p[0]! - 10, p[1]! - 20, p[2]! - 30);
    const sphere = simulate(lower({ ...still, shape: "sphere", shapeSize: 3 }).emitter, 1).positions;
    expect(Math.max(...sphere.map(radius))).toBeLessThanOrEqual(3 + 1e-4);
    expect(Math.max(...sphere.map(radius))).toBeGreaterThan(2);
    const hemi = simulate(lower({ ...still, shape: "hemisphere", shapeSize: 3 }).emitter, 1).positions;
    expect(Math.min(...hemi.map((p) => p[1]! - 20))).toBeGreaterThanOrEqual(-1e-4);
    const disc = simulate(lower({ ...still, shape: "disc", shapeSize: 2 }).emitter, 1).positions;
    expect(disc.every((p) => Math.abs(p[1]! - 20) < 1e-4 && Math.hypot(p[0]! - 10, p[2]! - 30) <= 2 + 1e-4)).toBe(true);
    const ring = simulate(lower({ ...still, shape: "ring", shapeSize: 2 }).emitter, 1).positions;
    expect(ring.every((p) => Math.abs(Math.hypot(p[0]! - 10, p[2]! - 30) - 2) < 1e-3)).toBe(true);
    const edge = simulate(lower({ ...still, shape: "edge", shapeSize: 4 }).emitter, 1).positions;
    expect(edge.every((p) => Math.abs(p[0]! - 10) <= 2 + 1e-4 && Math.abs(p[2]! - 30) < 1e-4)).toBe(true);
    const point = simulate(lower({ ...still, shape: "point" }).emitter, 1).positions;
    expect(point.every((p) => Math.hypot(p[0]! - 10, p[1]! - 20, p[2]! - 30) < 1e-4)).toBe(true);
  });

  it("coneAngleDeg bounds the emission direction around `direction`; shape cone defaults to 25 degrees", () => {
    const angleOf = (desc: EmitterDescriptor) => {
      const state = createEmitter({ ...desc, prewarm: 0 });
      for (let t = 0; t < 30; t++) stepEmitter(state, 1 / 60);
      return Array.from({ length: state.live }, (_, i) => {
        const speed = Math.hypot(state.vx[i]!, state.vy[i]!, state.vz[i]!);
        return (Math.acos(Math.max(-1, Math.min(1, state.vy[i]! / speed))) * 180) / Math.PI;
      });
    };
    const base = { ...still, speed: 2, rate: 600, maxParticles: 600, lifetime: [5, 5], direction: [0, 1, 0], spread: 0 };
    const narrow = angleOf(lower({ ...base, coneAngleDeg: 10 }).emitter);
    const wide = angleOf(lower({ ...base, coneAngleDeg: 60 }).emitter);
    expect(Math.max(...narrow)).toBeLessThanOrEqual(10.5);
    expect(Math.max(...wide)).toBeLessThanOrEqual(60.5);
    expect(Math.max(...wide)).toBeGreaterThan(40);
    expect(lower({ shape: "cone" }).emitter.coneAngle).toBeCloseTo((25 * Math.PI) / 180, 6);
  });

  it("wind drifts every particle by wind * time", () => {
    const calm = simulate(lower({ ...still, rate: 100, maxParticles: 100, shape: "point" }).emitter, 1);
    const windy = simulate(lower({ ...still, rate: 100, maxParticles: 100, shape: "point", wind: [2, 0, -1] }).emitter, 1);
    expect(windy.live).toBe(calm.live);
    const mean = (rows: number[][], axis: number) => rows.reduce((sum, row) => sum + row[axis]!, 0) / rows.length;
    // Age spread makes the mean drift ~ wind * mean age; both axes move in the wind direction only.
    expect(mean(windy.positions, 0) - mean(calm.positions, 0)).toBeGreaterThan(0.3);
    expect(mean(windy.positions, 2) - mean(calm.positions, 2)).toBeLessThan(-0.15);
    expect(mean(windy.positions, 1)).toBeCloseTo(mean(calm.positions, 1), 5);
    expect(lower({ wind: [0, 0, 0] }).emitter.wind).toBeUndefined();
  });

  it("sizeOverLife scales size and alphaOverLife replaces the fade envelope", () => {
    expect(sampleCurve([1, 0], 0.25)).toBeCloseTo(0.75);
    expect(sampleCurve([0, 1, 0], 0.5)).toBeCloseTo(1);
    const desc = lower({ ...still, rate: 50, maxParticles: 50, size: [1, 1], sizeOverLife: [0, 2], alphaOverLife: [1, 1], lifetime: [4, 4], shape: "point" }).emitter;
    const state = createEmitter(desc);
    for (let t = 0; t < 120; t++) stepEmitter(state, 1 / 60);
    const out = new Float32Array(state.live * 16);
    writeEmitterInstances(state, out);
    for (let i = 0; i < state.live; i++) {
      const t = state.age[i]! / state.life[i]!;
      expect(out[i * 16 + 3]).toBeCloseTo(2 * t, 4);
      // Default envelope would fade a brand-new particle in; the authored curve holds alpha at the base value.
      expect(out[i * 16 + 11]).toBeCloseTo(desc.alpha, 5);
    }
  });

  it("lifetimeColorRamp lerps linear colour across life and ignores ramps it cannot resolve", () => {
    const desc = lower({ ...still, rate: 50, maxParticles: 50, lifetimeColorRamp: ["#ff0000", "#0000ff"], shape: "point" }).emitter;
    expect(desc.colorOverLife).toHaveLength(2);
    const state = createEmitter(desc);
    for (let t = 0; t < 120; t++) stepEmitter(state, 1 / 60);
    const out = new Float32Array(state.live * 16);
    writeEmitterInstances(state, out);
    for (let i = 0; i < state.live; i++) {
      const t = state.age[i]! / state.life[i]!;
      expect(out[i * 16 + 8]).toBeCloseTo(1 - t, 4);
      expect(out[i * 16 + 10]).toBeCloseTo(t, 4);
    }
    expect(lower({ lifetimeColorRamp: ["red", "#00ff00"] }).emitter.colorOverLife).toBeUndefined();
  });

  it("stretch forces velocity-stretched or upright billboards and keeps batches with different stretch apart", () => {
    const plain = lower({});
    const velocity = lower({ stretch: { mode: "velocity", factor: 0.07 } });
    const none = lower({ materialMode: "spark", stretch: { mode: "none" } });
    expect(plain.batch.stretch).toBe(false);
    expect(velocity.batch.stretch).toBe(true);
    expect(velocity.emitter.stretch).toBeCloseTo(0.07);
    expect(none.batch.stretch).toBe(false);
    expect(none.emitter.stretch).toBe(0);
    expect(velocity.emitter.key).not.toBe(plain.emitter.key);
    expect(lower({ materialMode: "spark" }).batch.stretch).toBe(true);
  });

  it("is deterministic: same seed and steps give identical output with the new options", () => {
    const options = { ...still, shape: "sphere", shapeSize: 2, coneAngleDeg: 30, wind: [1, 0, 0] };
    const a = simulate(lower(options).emitter, 1);
    const b = simulate(lower(options).emitter, 1);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });
});
