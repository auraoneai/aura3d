/**
 * 02-S12 (lane-02 pieces) — box-projected probe lookup CPU twin, per-item
 * bindings from a ReflectionProbeSystem assignment, the registered
 * `a3d_prd02_probe_box` chunk, and the pre-frame capture driver.
 */
import { describe, expect, it } from "vitest";
import "../../../../packages/rendering/src/lanes/prd02";
import { shaderChunk } from "../../../../packages/rendering/src/contracts/program";
import {
  PROBE_BOX_CHUNK,
  boxProjectDirection,
  prd02CaptureDirtyProbes,
  prd02ProbeBindings
} from "../../../../packages/rendering/src/probes/ProbeBoxProjection";
import type { ProbeAssignment, ReflectionProbeSpec } from "../../../../packages/rendering/src/probes/ReflectionProbeSystem";
import type { EnvironmentProbe } from "../../../../packages/rendering/src/contracts/environment";

const norm = (v: readonly number[]) => {
  const l = Math.hypot(v[0]!, v[1]!, v[2]!);
  return [v[0]! / l, v[1]! / l, v[2]! / l];
};

describe("02-S12 box projection", () => {
  it("at the probe center the corrected direction is R itself", () => {
    const d = boxProjectDirection([0, 1, 0], norm([0.3, 0.2, -0.9]) as never, [0, 1, 0], [2, 1, 3]);
    expect(norm(d)[0]).toBeCloseTo(norm([0.3, 0.2, -0.9])[0]!, 6);
    expect(norm(d)[2]).toBeCloseTo(norm([0.3, 0.2, -0.9])[2]!, 6);
  });

  it("off-center rays hit the box wall: a +x ray from x=1 in a [-2,2] box hits x=2", () => {
    const d = boxProjectDirection([1, 0, 0], [1, 0, 0], [0, 0, 0], [2, 2, 2]);
    expect(d).toEqual([2, 0, 0]);
    // A 45° ray from (1, 0, 0) toward +x+z exits through x=2 at z=1.
    const e = boxProjectDirection([1, 0, 0], norm([1, 0, 1]) as never, [0, 0, 0], [2, 2, 2]);
    expect(e[0]).toBeCloseTo(2, 6);
    expect(e[2]).toBeCloseTo(1, 6);
  });

  it("the chunk is registered and mirrors the CPU twin's math", () => {
    const glsl = shaderChunk(PROBE_BOX_CHUNK)?.glsl ?? "";
    expect(glsl).toContain("vec3 a3d_boxProjectDirection(vec3 worldPos, vec3 R, vec3 center, vec3 halfExtents)");
    expect(glsl).toContain("float t = min(min(tFar.x, tFar.y), tFar.z);");
    expect(glsl).toContain("vec3 a3d_probeSpecular(vec3 worldPos, vec3 R, float roughness)");
  });
});

const spec = (name: string, position: [number, number, number], intensity?: number): ReflectionProbeSpec => ({
  name, position, boxHalfExtents: [1, 2, 3], blendDistance: 1, update: "once", ...(intensity !== undefined ? { intensity } : {})
});
const probe = (mipCount: number) => ({ specularCube: { id: `cube-${mipCount}` }, mipCount }) as unknown as EnvironmentProbe;

describe("02-S12 per-item bindings", () => {
  it("binds two probes with weights, intensity, centers, extents and the mip count", () => {
    const assignment: ProbeAssignment = {
      a: { probe: probe(6), spec: spec("a", [1, 2, 3], 2), weight: 0.6 },
      b: { probe: probe(5), spec: spec("b", [-1, 0, 0]), weight: 0.3 },
      globalWeight: 0.1
    };
    const b = prd02ProbeBindings(assignment);
    expect(b.u_prd02ProbeCubeA).toEqual({ texture: { id: "cube-6" } });
    expect(Array.from(b.u_prd02ProbeCenterA as Float32Array)).toEqual([1, 2, 3, 1]);
    expect(Array.from(b.u_prd02ProbeHalfB as Float32Array)).toEqual([1, 2, 3, 0]);
    const w = Array.from(b.u_prd02ProbeWeights as Float32Array);
    expect(w[0]).toBeCloseTo(1.2, 6);
    expect(w[1]).toBeCloseTo(0.3, 6);
    expect(w[2]).toBeCloseTo(0.1, 6);
    expect(w[3]).toBe(6);
  });

  it("an empty slot has weight 0 and center.w 0", () => {
    const b = prd02ProbeBindings({ a: { probe: probe(4), spec: spec("a", [0, 0, 0]), weight: 1 }, b: null, globalWeight: 0 });
    expect(b.u_prd02ProbeCubeB).toBeNull();
    expect(Array.from(b.u_prd02ProbeCenterB as Float32Array)).toEqual([0, 0, 0, 0]);
    expect((b.u_prd02ProbeWeights as Float32Array)[1]).toBe(0);
  });
});

describe("02-S12 pre-frame capture driver", () => {
  it("advances the system once and returns the changed probes", () => {
    let calls = 0;
    expect(prd02CaptureDirtyProbes({ update: () => { calls += 1; return ["room"]; } })).toEqual(["room"]);
    expect(calls).toBe(1);
  });
});

describe("02-S12 wiring to lane 01 (#1115): pre-frame capture + per-item environmentCube", () => {
  it("prd02BeforeFrame captures 6 faces through renderProbeFace; collect binds the probe cube on items inside it", async () => {
    const { MockRenderDevice } = await import("../../../../packages/rendering/src/RenderDevice");
    const { resolveQrFlags } = await import("../../../../packages/engine/src/contracts/flags");
    const { Geometry } = await import("../../../../packages/rendering/src/Geometry");
    const { identityMat4 } = await import("@aura3d/scene");
    const { applyProbeEnvironmentCubes, prd02BeforeFrame } = await import("../../../../packages/rendering/src/probes/Prd02ProbesContributor");
    const device = new MockRenderDevice();
    const faces: number[] = [];
    const renderer = {
      device,
      renderProbeFace: (_source: unknown, face: number) => { faces.push(face); return {}; }
    };
    const source = {
      "prd02.probes.room": { kind: "probe", probe: "reflection", name: "room", options: { position: [0, 1, 0], boxHalfExtents: [2, 2, 2], resolution: 128 } }
    } as never;
    const flags = resolveQrFlags({ options: { A3D_QR_LIGHTING: true } });
    expect(prd02BeforeFrame(renderer as never, source, flags)).toEqual(["room"]);
    expect(faces).toEqual([0, 1, 2, 3, 4, 5]);
    // once-mode: no recapture next frame
    expect(prd02BeforeFrame(renderer as never, source, flags)).toEqual([]);
    expect(faces).toHaveLength(6);

    const inside = { geometry: Geometry.triangle(), modelMatrix: identityMat4(), label: "inside" };
    const far = { geometry: Geometry.triangle(), modelMatrix: Float32Array.from([1,0,0,0, 0,1,0,0, 0,0,1,0, 40,0,0,1]), label: "far" };
    const [a, b] = applyProbeEnvironmentCubes([inside, far] as never, device);
    expect((a as { environmentCube?: { name: string } }).environmentCube?.name).toBe("u_environmentCubeMapTexture");
    expect((a as { environmentCubeMip?: number }).environmentCubeMip).toBeGreaterThan(1);
    expect((b as { environmentCube?: unknown }).environmentCube).toBeUndefined();
  });

  it("flipRows turns GL bottom-up readback rows top-down", async () => {
    const { flipRows } = await import("../../../../packages/rendering/src/probes/ReflectionProbeSystem");
    const img = new Float32Array([1, 1, 1, 1, 2, 2, 2, 2]); // 1×2: bottom row 1, top row 2
    expect(Array.from(flipRows(img, 1, 2))).toEqual([2, 2, 2, 2, 1, 1, 1, 1]);
  });
});
