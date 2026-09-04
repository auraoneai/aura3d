import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { CollectedLight } from "../../../packages/rendering/src/LightCollector";
import { LightUniforms } from "../../../packages/rendering/src/LightUniforms";

/**
 * N1 spot lights as first-class rendering citizens (muse3jsparity-PRD).
 *
 * Rendering-side evidence: the scene SpotLight class already exists, the
 * collector already gathers angle/penumbra, LightUniforms already packs the
 * cone, and the forward shader already applies cone falloff + the B1 spot
 * shadow path. The missing piece is the ROOT `lights.spot` builder, which
 * needs an engine-bridge edit (forbidden in this phase) — reported as an
 * exact hunk instead. Route adoption + on/off pixel proof are blocked
 * behind that bridge and behind browser availability.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "packages", "rendering", "src");

function spotLight(overrides: Partial<CollectedLight> = {}): CollectedLight {
  return {
    kind: "spot",
    source: { id: "spot-1", name: "stage-spot" } as unknown as CollectedLight["source"],
    color: [1, 0.95, 0.9],
    intensity: 60,
    position: [0, 4, 0],
    direction: [0, -1, 0],
    right: [1, 0, 0],
    up: [0, 0, 1],
    range: 12,
    width: 0,
    height: 0,
    spotAngle: Math.PI / 6,
    penumbra: 0.4,
    castsShadow: true,
    layerMask: 1,
    ...overrides,
  };
}

describe("N1 spot cone uniforms (rendering side)", () => {
  it("packs angle + penumbra into the per-light vec4", () => {
    const packed = LightUniforms.pack([spotLight()]);
    expect(packed.lightCount).toBe(1);
    // offset+8: direction + kind float (spot = 2); offset+12: cone vec4.
    expect(packed.data[11]).toBe(2);
    expect(packed.data[12]).toBeCloseTo(Math.PI / 6, 6);
    expect(packed.data[13]).toBeCloseTo(0.4, 6);
    expect(packed.data[14]).toBe(1);
  });

  it("distinguishes spot penumbra extremes in the packed cone", () => {
    const hard = LightUniforms.pack([spotLight({ penumbra: 0 })]);
    const soft = LightUniforms.pack([spotLight({ penumbra: 1 })]);
    expect(hard.data[13]).toBe(0);
    expect(soft.data[13]).toBe(1);
    expect(hard.data[12]).toBe(soft.data[12]);
  });

  it("forward shader consumes the cone (source contract)", () => {
    const library = readFileSync(join(SRC, "ShaderLibrary.ts"), "utf8");
    expect(library).toContain("float outer = cos(spotShadowLayer.x);");
    expect(library).toContain("float inner = cos(spotShadowLayer.x * max(1.0 - spotShadowLayer.y, 0.001));");
    expect(library).toContain("attenuation *= smoothstep(outer, inner, cone);");
  });

  it("scene SpotLight validates cone parameters", async () => {
    const { SpotLight } = await import("../../../packages/scene/src/SpotLight");
    const spot = new SpotLight("stage");
    spot.angle = Math.PI / 6;
    spot.penumbra = 0.4;
    spot.range = 12;
    expect(spot.angle).toBeCloseTo(Math.PI / 6, 10);
    expect(() => {
      spot.angle = Math.PI;
    }).toThrow();
    expect(() => {
      spot.penumbra = 2;
    }).toThrow();
  });
});
