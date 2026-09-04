import { describe, expect, it } from "vitest";
import {
  AURA_DECAL_BUDGET_NOTE,
  AURA_DECAL_MAX_DECALS,
  collectDecalBudgetTelemetry,
  decals,
  projectDecal,
  projectDecalIntoBox,
  projectDecalOntoMesh,
  resetDecalTelemetry,
  resolveDecalFadeOpacity,
} from "../../../packages/engine/src/agent-api/Decals";

const QUAD_MESH = {
  positions: [
    [-1, -1, 0],
    [1, -1, 0],
    [1, 1, 0],
    [-1, 1, 0],
  ],
  normals: [
    [0, 0, 1],
    [0, 0, 1],
    [0, 0, 1],
    [0, 0, 1],
  ],
  indices: [0, 1, 2, 0, 2, 3],
} as const;

describe("decals.project root builder", () => {
  it("builds a transparent depth-safe plane primitive with polygon-offset intent", () => {
    const node = projectDecal({ size: 0.5 }).toJSON();
    expect(node.kind).toBe("primitive");
    expect(node.primitive).toBe("plane");
    expect(node.castShadow).toBe(false);
    expect(node.receiveShadow).toBe(false);
    expect(node.material?.opacity).toBeLessThan(1);
    expect(node.decal.polygonOffset).toEqual({ factor: -2, units: -2 });
    expect(node.decal.normalOffset).toBeCloseTo(0.012);
    expect(node.decal.fade.angleStart).toBe(55);
    expect(node.decal.fade.angleEnd).toBe(80);
    expect(node.decal.size).toEqual([0.5, 0.5]);
    expect(node.scale).toEqual([0.5, 1, 0.5]);
  });

  it("accepts texture, size pair, fade, and placement overrides", () => {
    const node = projectDecal({
      size: [0.6, 0.3],
      color: "#ff2211",
      opacity: 0.7,
      fade: { angleStart: 40, angleEnd: 70, near: 1, far: 6 },
      position: [1, 2, 3],
      normal: [0, 1, 0],
      polygonOffset: { factor: -4, units: -4 },
      normalOffset: 0.02,
      name: "bullet hole",
    }).toJSON();
    expect(node.name).toBe("bullet hole");
    expect(node.material?.opacity).toBeCloseTo(0.7);
    expect(node.decal.fade).toMatchObject({ angleStart: 40, angleEnd: 70, near: 1, far: 6 });
    expect(node.decal.polygonOffset).toEqual({ factor: -4, units: -4 });
    expect(node.decal.normal).toEqual([0, 1, 0]);
  });

  it("rejects non-positive sizes, opaque out-of-range opacity, and inverted fades", () => {
    expect(() => projectDecal({ size: 0 })).toThrow(/positive/);
    expect(() => projectDecal({ size: -1 })).toThrow(/positive/);
    expect(() => projectDecal({ size: 0.5, opacity: 1 })).toThrow(/\(0, 1\)/);
    expect(() => projectDecal({ size: 0.5, opacity: 0 })).toThrow(/\(0, 1\)/);
    expect(() => projectDecal({ size: 0.5, fade: { angleStart: 80, angleEnd: 60 } })).toThrow(/angleStart/);
    expect(() => projectDecal({ size: 0.5, fade: { angleStart: 10, angleEnd: 95 } })).toThrow(/<= 90/);
    expect(() => projectDecal({ size: 0.5, normal: [0, 0, 0] })).toThrow(/non-zero/);
  });

  it("exposes the builder through the decals namespace", () => {
    expect(decals.maxDecals).toBe(AURA_DECAL_MAX_DECALS);
    expect(decals.budgetNote).toBe(AURA_DECAL_BUDGET_NOTE);
    expect(decals.project({ size: 0.25 }).toJSON().kind).toBe("primitive");
  });
});

describe("resolveDecalFadeOpacity", () => {
  const headOn = {
    normal: [0, 0, 1] as const,
    decalPosition: [0, 0, 0] as const,
    cameraPosition: [0, 0, 3] as const,
  };

  it("is full opacity head-on and zero at grazing incidence", () => {
    expect(resolveDecalFadeOpacity({ ...headOn })).toBeCloseTo(0.85, 5);
    const grazing = resolveDecalFadeOpacity({
      ...headOn,
      cameraPosition: [3, 0, 0.001],
    });
    expect(grazing).toBeCloseTo(0, 5);
  });

  it("fades smoothly between angleStart and angleEnd", () => {
    const mid = resolveDecalFadeOpacity({
      normal: [0, 0, 1],
      decalPosition: [0, 0, 0],
      // ~67.5° incidence: between the 55° start and 80° end.
      cameraPosition: [Math.sin((67.5 * Math.PI) / 180) * 3, 0, Math.cos((67.5 * Math.PI) / 180) * 3],
    });
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(0.85);
  });

  it("applies the depth envelope multiplicatively", () => {
    const near = resolveDecalFadeOpacity({
      ...headOn,
      fade: { near: 2, far: 6 },
      cameraPosition: [0, 0, 1.5],
    });
    expect(near).toBeCloseTo(0.85, 5);
    const far = resolveDecalFadeOpacity({
      ...headOn,
      fade: { near: 2, far: 6 },
      cameraPosition: [0, 0, 8],
    });
    expect(far).toBeCloseTo(0, 5);
  });

  it("rejects non-finite and degenerate samples", () => {
    expect(() => resolveDecalFadeOpacity({ ...headOn, normal: [0, 0, 0] })).toThrow(/non-zero/);
    expect(() => resolveDecalFadeOpacity({ ...headOn, baseOpacity: 2 })).toThrow(/\[0, 1\]/);
  });
});

describe("projectDecalOntoMesh", () => {
  it("clips a raycast projection into root custom geometry", () => {
    const node = projectDecalOntoMesh({
      mesh: QUAD_MESH,
      ray: { origin: [0.2, 0.1, 2], direction: [0, 0, -1] },
      size: [0.8, 0.8, 0.25],
      maxDistance: 4,
    }).toJSON();
    expect(node.primitive).toBe("custom");
    expect(node.geometry?.kind).toBe("aura-custom-geometry");
    expect(node.geometry!.positions.length).toBeGreaterThanOrEqual(6);
    expect(node.geometry!.normals?.length).toBe(node.geometry!.positions.length);
    expect(node.geometry!.indices.length % 3).toBe(0);
    expect(node.material?.opacity).toBeLessThan(1);
    expect(node.decal.normal[2]).toBeCloseTo(1, 3);
  });

  it("fails loud on a raycast miss", () => {
    expect(() =>
      projectDecalOntoMesh({
        mesh: QUAD_MESH,
        ray: { origin: [5, 5, 2], direction: [0, 0, -1] },
        size: [0.4, 0.4, 0.25],
      }),
    ).toThrow(/did not hit/);
  });

  it("projects into an explicit box without a raycast", () => {
    const node = projectDecalIntoBox(
      QUAD_MESH,
      { center: [0, 0, 0], size: [1, 1, 0.25] },
      { opacity: 0.6 },
    ).toJSON();
    expect(node.primitive).toBe("custom");
    expect(node.geometry!.positions.length).toBeGreaterThanOrEqual(6);
    expect(node.material?.opacity).toBeCloseTo(0.6);
  });
});

describe("collectDecalBudgetTelemetry", () => {
  it("reports counts, budget, and fade coverage with the deferred-decal note", () => {
    resetDecalTelemetry();
    const nodes = [
      projectDecal({ size: 0.3 }).toJSON(),
      projectDecal({ size: 0.4, fade: { near: 1, far: 5 } }).toJSON(),
    ];
    const telemetry = collectDecalBudgetTelemetry(nodes);
    expect(telemetry.kind).toBe("aura-decal-budget");
    expect(telemetry.decalCount).toBe(2);
    expect(telemetry.maxDecals).toBe(AURA_DECAL_MAX_DECALS);
    expect(telemetry.overBudget).toBe(false);
    expect(telemetry.estimatedDrawCalls).toBe(2);
    expect(telemetry.note).toBe(AURA_DECAL_BUDGET_NOTE);
    expect(telemetry.allPolygonOffset).toBe(true);
    expect(telemetry.angleFadeDecals).toBe(2);
    expect(telemetry.depthFadeDecals).toBe(1);
    expect(telemetry.maxObservedDecals).toBe(2);
  });

  it("flags over-budget scenes and tracks the session max", () => {
    resetDecalTelemetry();
    const one = [projectDecal({ size: 0.2 }).toJSON()];
    expect(collectDecalBudgetTelemetry(one, 1).overBudget).toBe(false);
    const two = [...one, projectDecal({ size: 0.2 }).toJSON()];
    const over = collectDecalBudgetTelemetry(two, 1);
    expect(over.overBudget).toBe(true);
    expect(over.maxObservedDecals).toBe(2);
    expect(() => collectDecalBudgetTelemetry(one, 0)).toThrow(/positive integer/);
  });

  it("ignores non-decal nodes", () => {
    resetDecalTelemetry();
    const telemetry = collectDecalBudgetTelemetry([
      { kind: "primitive", primitive: "box" } as never,
      projectDecal({ size: 0.2 }).toJSON(),
    ]);
    expect(telemetry.decalCount).toBe(1);
  });
});
