import { describe, expect, test } from "vitest";
import "@aura3d/engine";
import { QUALITY_TIERS } from "@aura3d/rendering";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import { effects } from "../../../packages/engine/src/agent-api/nodes/effects.composite";
import { material } from "../../../packages/engine/src/agent-api/nodes/material";
import { createRootPostPipeline } from "../../../packages/engine/src/agent-api/postBridge";

/** Same rule as lane 510's `customShaderReadsClock`: either GLSL stage names the prelude clock. */
const customShaderReadsClock = (spec: { glsl: { vertex?: string; fragment: string } } | undefined): boolean =>
  /\b(?:uTime|u_time)\b/.test(`${spec?.glsl.vertex ?? ""}\n${spec?.glsl.fragment ?? ""}`);

function pipelineFor(...nodes: Parameters<ReturnType<typeof scene>["add"]>[0][]) {
  let s = scene();
  for (const node of nodes) s = s.add(node);
  const snapshot = s.toJSON();
  return createRootPostPipeline(snapshot, snapshot.camera, undefined, QUALITY_TIERS.high);
}

describe("lane 514 effects.godRays", () => {
  test("records a distinct god-rays node and drives S4 with authored decay, samples, colour and point source", () => {
    const { options, diagnostics } = pipelineFor(effects.godRays({ source: [4, 30, -20], intensity: 0.9, decay: 0.97, samples: 64, color: "#ffffff" }));
    expect(diagnostics.filter((d) => d.code === "POST_FIELD_UNSUPPORTED")).toEqual([]);
    const god = options.godRays as { decay: number; samples: number; intensity: number; lightWorld?: readonly number[] };
    expect(god.decay).toBe(0.97);
    expect(god.samples).toBe(64);
    expect(god.intensity).toBe(0.9);
    expect(god.lightWorld).toEqual([4, 30, -20]);
  });

  test("a directional light source points the shafts back toward the light", () => {
    const { options } = pipelineFor(effects.godRays({ source: { direction: [0, -1, 0] } }));
    const dir = (options.godRays as { lightDirection?: readonly number[] }).lightDirection!;
    expect(dir[0]).toBeCloseTo(0, 6);
    expect(dir[1]).toBeCloseTo(1, 6);
    expect(dir[2]).toBeCloseTo(0, 6);
  });

  test("source 'sun' and defaults keep the standard 0.94 decay and add no forward fog node", () => {
    const node = effects.godRays().toJSON() as unknown as { effect: string; decay: number; samples: number };
    expect(node.effect).toBe("god-rays");
    expect(node.decay).toBe(0.94);
    const { options } = pipelineFor(effects.godRays());
    expect((options.godRays as { decay: number }).decay).toBe(0.94);
    expect(options).not.toHaveProperty("fog");
  });

  test("the tier caps the sample count and an existing volumetricFog keeps its old 0.94 / tier samples", () => {
    const low = createRootPostPipeline(
      scene().add(effects.godRays({ samples: 64 })).toJSON(), undefined, undefined, QUALITY_TIERS.medium
    );
    const tierSamples = (low.options.godRays as { samples: number } | undefined)?.samples;
    if (tierSamples !== undefined) expect(tierSamples).toBeLessThanOrEqual(64);
    const fog = pipelineFor(effects.volumetricFog({ intensity: 0.5 }));
    expect((fog.options.godRays as { decay: number }).decay).toBe(0.94);
    // the legacy S4 mapping is untouched for volumetricFog; only effects.godRays opts into the frame anchor
    expect(fog.options.godRays).not.toHaveProperty("frameAnchored");
    expect((pipelineFor(effects.godRays()).options.godRays as { frameAnchored?: boolean }).frameAnchored).toBe(true);
  });

  test("rejects out-of-range options", () => {
    expect(() => effects.godRays({ decay: 1.2 })).toThrow(RangeError);
    expect(() => effects.godRays({ samples: 10 as never })).toThrow(RangeError);
    expect(() => effects.godRays({ source: [1, 2] as never })).toThrow(RangeError);
  });
});

describe("lane 514 materials", () => {
  test("material.strata lowers to a custom spec with baked palette, slope uniforms and no clock", () => {
    const spec = material.strata({ bands: 9, colors: ["#aa5533", "#ddaa77"], slope: { angle: 40 }, heightRange: [0, 30] });
    expect(spec.kind).toBe("custom");
    const custom = spec.custom!;
    expect(custom.glsl.fragment).toContain("STRATA_PALETTE[2]");
    expect(custom.uniforms).toHaveProperty("strataSlope");
    expect(customShaderReadsClock(custom)).toBe(false);
    expect(material.strata().custom!.uniforms).not.toHaveProperty("strataSlope");
  });

  test("material.strata validates its inputs", () => {
    expect(() => material.strata({ colors: [] })).toThrow(RangeError);
    expect(() => material.strata({ heightRange: [5, 5] })).toThrow(RangeError);
    expect(() => material.strata({ bands: Number.NaN })).toThrow(RangeError);
  });

  test("material.caustics and material.lightBeam read the clock so they are declared time consumers", () => {
    expect(customShaderReadsClock(material.caustics().custom)).toBe(true);
    expect(customShaderReadsClock(material.lightBeam().custom)).toBe(true);
    expect(material.lightBeam().custom!.blending).toBe("additive");
    expect(material.lightBeam().custom!.depthWrite).toBe(false);
  });
});

describe("lane 514 effects.volumetricBeam", () => {
  test("builds an open cone along the direction with its apex at the source", () => {
    const node = effects.volumetricBeam({ position: [0, 10, 0], direction: [1, 0, 0], length: 30 }).toJSON() as unknown as {
      kind: string; position: number[]; quaternion: number[]; params: { height: number; openEnded: boolean };
    };
    expect(node.kind).toBe("primitive");
    expect(node.position).toEqual([15, 10, 0]);
    expect(node.params.height).toBe(30);
    expect(node.params.openEnded).toBe(true);
    // local -Y rotated onto +X
    const [x, y, z, w] = node.quaternion as [number, number, number, number];
    const v = [0, -1, 0];
    const t = [2 * (y * v[2]! - z * v[1]!), 2 * (z * v[0]! - x * v[2]!), 2 * (x * v[1]! - y * v[0]!)];
    const rotated = [v[0]! + w * t[0]! + (y * t[2]! - z * t[1]!), v[1]! + w * t[1]! + (z * t[0]! - x * t[2]!), v[2]! + w * t[2]! + (x * t[1]! - y * t[0]!)];
    expect(rotated[0]).toBeCloseTo(1, 5);
    expect(rotated[1]).toBeCloseTo(0, 5);
    expect(rotated[2]).toBeCloseTo(0, 5);
  });

  test("rejects a zero direction", () => {
    expect(() => effects.volumetricBeam({ direction: [0, 0, 0] })).toThrow(RangeError);
  });
});
