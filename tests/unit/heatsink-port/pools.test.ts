import { describe, expect, it } from "vitest";
import { LOOKS, lowTier } from "../../../examples/heatsink-port/art/look";
import { createPoolUniforms, nearestPools, POOL_SLOTS, type GlowEmitter } from "../../../examples/heatsink-port/art/pools";
import { lightUniforms, withShading } from "../../../examples/heatsink-port/materials";

const em = (kind: GlowEmitter["kind"], index: number, x: number, z: number): GlowEmitter => ({ kind, index, x, y: 1, z, radius: 10, color: [1, 0.5, 0.2], intensity: 1 });

describe("heatsink-port IC-02 glow pools", () => {
  const emitters = [em("pad", 0, 100, 0), em("pad", 1, 5, 0), em("gate", 0, 0, 20), em("gate", 1, -3, 0), em("pad", 2, 50, 50), em("gate", 2, 9, 9)];

  it("packs the 4 nearest emitters, nearest first", () => {
    const out = nearestPools(emitters, 0, 0, createPoolUniforms());
    expect(Array.from(out.slot)).toEqual([3, 1, 5, 2]);
    expect(Array.from(out.pos.slice(0, 4))).toEqual([-3, 1, 0, 10]);
    expect(out.col[3]).toBe(1);
  });

  it("empties unused slots and zeroes intensity when the gain is 0", () => {
    const few = nearestPools(emitters.slice(0, 2), 0, 0, createPoolUniforms());
    expect(Array.from(few.slot)).toEqual([1, 0, -1, -1]);
    expect(Array.from(few.col.slice(8))).toEqual(new Array(8).fill(0));
    const off = nearestPools(emitters, 0, 0, createPoolUniforms(), 0);
    for (let k = 0; k < POOL_SLOTS; k++) expect(off.col[k * 4 + 3]).toBe(0);
  });

  it("a firing pad brightens its pool, clamped", () => {
    const out = nearestPools(emitters, 0, 0, createPoolUniforms(), 1, (kind, i) => (kind === "pad" && i === 1 ? 5 : 0));
    expect(out.col[1 * 4 + 3]).toBeCloseTo(2.5);
    expect(out.col[3]).toBe(1);
  });

  it("original authors zero pools and no points; Low keeps one point", () => {
    expect(LOOKS.original.glow).toEqual({ pools: 0, points: 0 });
    expect(lowTier(LOOKS.twilight).glow.points).toBe(1);
    const u = withShading(LOOKS.original, () => lightUniforms()) as Record<string, { value: number[] }>;
    expect(u.poolPos!.value.every((v) => v === 0)).toBe(true);
    expect(u.poolCol!.value.every((v) => v === 0)).toBe(true);
  });
});
