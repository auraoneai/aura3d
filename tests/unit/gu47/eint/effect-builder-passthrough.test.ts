import { describe, expect, it } from "vitest";
import { effects } from "../../../../packages/engine/src/agent-api/nodes/effects.composite";
import { validatePostEffectNode } from "../../../../packages/engine/src/agent-api/postBridge";
import type { AuraEffectNode } from "../../../../packages/engine/src/agent-api/nodes/types";

// GU47 pass 4 (g07, g08, g09, g12): builders keep the authored name and the weather fields the lowering reads.
const json = (b: { toJSON(): unknown }) => b.toJSON() as AuraEffectNode & Record<string, unknown>;

describe("effect builder pass-through (pass 4)", () => {
  it("bloom keeps an authored name and validates clean", () => {
    const node = json(effects.bloom({ name: "court bloom", scatter: 0.4 } as never));
    expect(node.name).toBe("court bloom");
    expect(validatePostEffectNode(node)).toEqual([]);
    expect("name" in json(effects.bloom())).toBe(false);
  });

  it("rain and snow keep name, size, radius and seed when authored", () => {
    const snow = json(effects.snow({ name: "dust motes", size: [0.02, 0.04], radius: 12, seed: 7 }));
    expect(snow).toMatchObject({ name: "dust motes", size: [0.02, 0.04], radius: 12, seed: 7 });
    expect(json(effects.rain({ name: "storm" })).name).toBe("storm");
  });

  it("leaves default rain and snow nodes byte-identical", () => {
    for (const n of [json(effects.rain()), json(effects.snow())]) {
      for (const k of ["name", "size", "radius", "seed", "position", "pivot", "rotation", "scale", "quaternion", "rotationOrder"]) expect(k in n, `${n.effect}.${k}`).toBe(false);
    }
  });

  it("copies authored weather transforms, including explicit zero pivots", () => {
    const position: [number, number, number] = [1, 2, 3];
    const pivot: [number, number, number] = [0, 0, 0];
    const rotation: [number, number, number] = [0, 0, Math.PI / 2];
    const quaternion: [number, number, number, number] = [0, 0, 0, 1];
    const scale: [number, number, number] = [1, 1, 1];
    const node = json(effects.rain({ position, pivot, rotation, quaternion, rotationOrder: "XYZ", scale }));
    position[0] = 7; pivot[0] = 7; rotation[0] = 7; quaternion[0] = 7; scale[0] = 7;
    expect(node).toMatchObject({ position: [1, 2, 3], pivot: [0, 0, 0], rotation: [0, 0, Math.PI / 2], quaternion: [0, 0, 0, 1], rotationOrder: "XYZ", scale: [1, 1, 1] });
  });

  it("rejects unsupported weather transforms at the builder boundary", () => {
    expect(() => effects.rain({ scale: [2, 1, 1] })).toThrow(/WEATHER_TRANSFORM_UNSUPPORTED/);
    expect(() => effects.snow({ lookAt: [0, 0, 0] })).toThrow(/WEATHER_TRANSFORM_UNSUPPORTED/);
    expect(() => effects.rain({ pivot: [NaN, 0, 0] })).toThrow(/WEATHER_TRANSFORM_INVALID/);
    expect(() => effects.snow({ quaternion: [0, 0, 0, 2] })).toThrow(/WEATHER_TRANSFORM_INVALID/);
  });
});

describe("effects.particles option type (pass 4, g13)", () => {
  it("takes a speed range and keeps it on the node; a number or no speed is unchanged", () => {
    expect(json(effects.particles({ speed: [1, 2.5] })).speed).toEqual([1, 2.5]);
    expect(json(effects.particles({ speed: 3 })).speed).toBe(3);
    expect(json(effects.particles()).speed).toBe(1);
  });
});
