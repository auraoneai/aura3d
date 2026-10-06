// PRD-07 P2-T6 — MeshParticleBatch CPU sim + instance mat4 packing.
// Regression guard for E17 (index.ts:14747-14754): per-instance scale must
// appear in the emitted mat4 column lengths — it must NOT be dropped.

import { describe, expect, it } from "vitest";
import { MeshParticleBatch, MESH_INSTANCE_FLOATS } from "../../../../packages/rendering/src/vfx/MeshParticleBatch";

describe("P2-T6 mesh particles", () => {
  it("per-instance scale is honoured in the emitted mat4 (E17)", () => {
    const batch = new MeshParticleBatch({ capacity: 4 });
    batch.spawn({ position: [0, 0, 0], scale: 0.5 });
    batch.spawn({ position: [2, 0, 0], scale: 2 });
    const out = new Float32Array(2 * MESH_INSTANCE_FLOATS);
    const live = batch.instanceData(out);
    expect(live).toBe(2);
    // Column 0 length of the upper-left 3×3 = scale (no rotation yet).
    const scaleA = Math.hypot(out[0], out[1], out[2]);
    const scaleB = Math.hypot(out[MESH_INSTANCE_FLOATS], out[MESH_INSTANCE_FLOATS + 1], out[MESH_INSTANCE_FLOATS + 2]);
    expect(scaleA).toBeCloseTo(0.5);
    expect(scaleB).toBeCloseTo(2);
    // Translation packed in column 3.
    expect([out[12], out[13], out[14]]).toEqual([0, 0, 0]);
    expect([out[35], out[36], out[37]]).toEqual([2, 0, 0]);
  });

  it("gravity + ground bounce + sleep", () => {
    const batch = new MeshParticleBatch({ capacity: 2, gravity: -10, groundY: 0, restitution: 0.5 });
    batch.spawn({ position: [0, 1, 0], velocity: [0, 0, 0] });
    for (let i = 0; i < 120; i++) batch.step(1 / 60);
    const out = new Float32Array(MESH_INSTANCE_FLOATS);
    batch.instanceData(out);
    // After 2 s the particle has bounced and rests on the ground.
    expect(out[13]).toBeGreaterThanOrEqual(0);
    expect(out[13]).toBeLessThan(0.05);
  });

  it("rotation differs between spinning and non-spinning instances", () => {
    const batch = new MeshParticleBatch({ capacity: 2 });
    batch.spawn({ position: [0, 0, 0], spinAxis: [0, 1, 0], spin: Math.PI });
    batch.spawn({ position: [5, 0, 0], spin: 0 });
    for (let i = 0; i < 60; i++) batch.step(1 / 60);
    const out = new Float32Array(2 * MESH_INSTANCE_FLOATS);
    batch.instanceData(out);
    // First instance rotated ~π rad about Y → m00 ≈ −1.
    expect(out[0]).toBeLessThan(-0.9);
    // Second instance identity → m00 = 1.
    expect(out[MESH_INSTANCE_FLOATS]).toBeCloseTo(1);
  });

  it("capacity is enforced and dead particles free their slot", () => {
    const batch = new MeshParticleBatch({ capacity: 1 });
    expect(batch.spawn({ position: [0, 0, 0] })).toBe(true);
    expect(batch.spawn({ position: [1, 0, 0] })).toBe(false);
    batch.spawn({ position: [0, 0, 0] });
    // expire via life
    batch.clear();
    const b2 = new MeshParticleBatch({ capacity: 1 });
    b2.spawn({ position: [0, 0, 0], life: 0.05 });
    for (let i = 0; i < 10; i++) b2.step(1 / 60);
    expect(b2.spawn({ position: [1, 0, 0] })).toBe(true);
  });
});
