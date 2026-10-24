import { describe, expect, it } from "vitest";
import { Bounds3, multiplyMat4, type Mat4 } from "@aura3d/scene";
import { ldrFragmentSource, ldrVariantKey, type LdrProgramVariant } from "../../../packages/rendering/src/webgl2/LdrPostprocessShader";
import "../../../packages/rendering/src/lanes/prd02";
import { QUALITY_TIERS } from "../../../packages/rendering/src/contracts/quality";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import type { RenderItem } from "../../../packages/rendering/src/contracts/renderItem";
import { Prd02ShadowSystem, type ShadowSystemConfigInput } from "../../../packages/rendering/src/lanes/prd02";
import { PerspectiveCamera } from "@aura3d/scene";
import { instancedWorldBounds } from "../../../packages/rendering/src/renderer/InstanceBounds";
import { renderableWorldBounds } from "../../../packages/rendering/src/renderer/RenderShared";
import { fitDirectionalCascades } from "../../../packages/rendering/src/shadows/DirectionalCascadeFitter";
import { instancedDefaultSegmentScale, qrPrimitiveGeometryOptions, QrPrimitiveGeometryPool, qrPrimitiveGeometryKey } from "../../../packages/engine/src/agent-api/compiler/geometry";
import { createProductionPrimitiveResources } from "../../../packages/engine/src/agent-api/compiler/primitives";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import type { AuraPrimitiveNode } from "../../../packages/engine/src/agent-api/nodes/types";

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function randomAffine(rand: () => number): number[] {
  const yaw = rand() * 6.28, pitch = (rand() - 0.5) * 1.2, roll = rand() * 6.28;
  const sx = 0.2 + rand() * 2, sy = 0.2 + rand() * 2, sz = 0.2 + rand() * 2;
  const cy = Math.cos(yaw), sy_ = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
  // R = Rz(roll) · Rx(pitch) · Ry(yaw), column-major with non-uniform scale.
  const r00 = cr * cy - sr * sp * sy_, r01 = -sr * cp, r02 = cr * sy_ + sr * sp * cy;
  const r10 = sr * cy + cr * sp * sy_, r11 = cr * cp, r12 = sr * sy_ - cr * sp * cy;
  const r20 = -cp * sy_, r21 = sp, r22 = cp * cy;
  return [r00 * sx, r10 * sx, r20 * sx, 0, r01 * sy, r11 * sy, r21 * sy, 0, r02 * sz, r12 * sz, r22 * sz, 0, (rand() - 0.5) * 100, (rand() - 0.5) * 100, (rand() - 0.5) * 100, 1];
}

/** The pre-fix algorithm, kept verbatim as the oracle: per instance slice, matrix multiply, transform 8 corners, union. */
function legacyInstancedBounds(envelope: { min: number[]; max: number[] }, model: number[], instances: Float32Array): Bounds3 {
  const local = new Bounds3([envelope.min[0]!, envelope.min[1]!, envelope.min[2]!], [envelope.max[0]!, envelope.max[1]!, envelope.max[2]!]);
  let bounds = new Bounds3();
  for (let offset = 0; offset + 16 <= instances.length; offset += 16) {
    bounds = bounds.union(local.transform(multiplyMat4(model as Mat4, Array.from(instances.slice(offset, offset + 16)) as Mat4)));
  }
  return bounds;
}

describe("instancedWorldBounds (allocation-free per-instance AABB)", () => {
  it("matches the corner-transform oracle on 500 random affine instances under a random model matrix", () => {
    const rand = lcg(7);
    const instances = new Float32Array(500 * 16);
    for (let i = 0; i < 500; i += 1) instances.set(randomAffine(rand), i * 16);
    const model = randomAffine(rand);
    const envelope = { min: [-0.5, -0.5, -0.5], max: [0.5, 1.5, 0.25] };
    const expected = legacyInstancedBounds(envelope, model, instances);
    const actual = instancedWorldBounds(envelope, model, instances);
    for (let axis = 0; axis < 3; axis += 1) {
      expect(actual.min[axis]).toBeCloseTo(expected.min[axis]!, 3);
      expect(actual.max[axis]).toBeCloseTo(expected.max[axis]!, 3);
    }
  });

  it("returns an empty box for an empty envelope or no full matrices, and ignores a trailing partial chunk", () => {
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    expect(new Bounds3(instancedWorldBounds({ min: [1, 1, 1], max: [0, 0, 0] }, identity, new Float32Array(16)).min, instancedWorldBounds({ min: [1, 1, 1], max: [0, 0, 0] }, identity, new Float32Array(16)).max).isEmpty()).toBe(true);
    expect(instancedWorldBounds({ min: [0, 0, 0], max: [1, 1, 1] }, identity, new Float32Array(8)).isEmpty()).toBe(true);
    const one = new Float32Array(20);
    one.set(identity, 0);
    expect(instancedWorldBounds({ min: [0, 0, 0], max: [1, 1, 1] }, identity, one).max).toEqual([1, 1, 1]);
  });

  it("keeps the matrix contract: a non-finite instance matrix throws, and renderableWorldBounds still rejects a partial chunk", () => {
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const bad = new Float32Array(identity);
    bad[12] = Number.NaN;
    expect(() => instancedWorldBounds({ min: [0, 0, 0], max: [1, 1, 1] }, identity, bad)).toThrowError(/finite mat4/);
    const unusedEntry = new Float32Array(identity);
    unusedEntry[15] = Number.POSITIVE_INFINITY;
    expect(() => instancedWorldBounds({ min: [0, 0, 0], max: [1, 1, 1] }, identity, unusedEntry)).toThrowError(/finite mat4/);
    const geometry = { bounds: { min: [0, 0, 0], max: [1, 1, 1] }, vertexBuffer: { vertexCount: 0 } } as never;
    expect(() => renderableWorldBounds(geometry, identity as Mat4, new Float32Array(20))).toThrow();
  });

  it("is several times faster than the per-instance allocation path on 20,000 instances", () => {
    const rand = lcg(3);
    const n = 20_000;
    const instances = new Float32Array(n * 16);
    for (let i = 0; i < n; i += 1) instances.set(randomAffine(rand), i * 16);
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const envelope = { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] };
    const median = (run: () => unknown): number => {
      const times: number[] = [];
      for (let rep = 0; rep < 7; rep += 1) { const t = performance.now(); run(); times.push(performance.now() - t); }
      return times.sort((x, y) => x - y)[3]!;
    };
    legacyInstancedBounds(envelope, identity, instances);
    instancedWorldBounds(envelope, identity, instances);
    const legacy = median(() => legacyInstancedBounds(envelope, identity, instances));
    const fast = median(() => instancedWorldBounds(envelope, identity, instances));
    expect(fast * 5).toBeLessThan(legacy);
  });
});

describe("cascade fit over instanced casters uses the same bounds", () => {
  it("fits cascades around every instance of an instanced caster", () => {
    const rand = lcg(11);
    const n = 300;
    const instances = new Float32Array(n * 16);
    for (let i = 0; i < n; i += 1) {
      const m = randomAffine(rand);
      instances.set(m, i * 16);
    }
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const geometry = { bounds: { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] } };
    const viewProjection = [1.2, 0, 0, 0, 0, 2.1, 0, 0, 0, 0, -1.002, -1, 0, 0, -0.2002, 0];
    const fits = fitDirectionalCascades({
      camera: { viewProjectionMatrix: viewProjection, near: 0.1, far: 100 },
      lightDirection: [0.3, -1, 0.2],
      casters: [{ geometry, modelMatrix: identity, instanceTransforms: instances } as never],
      mapSize: 1024,
      cascadeCount: 3
    });
    expect(fits).toHaveLength(3);
    for (const fit of fits) {
      expect(fit.drawViewProjection.every(Number.isFinite)).toBe(true);
    }
  });
});

describe("dense instanced primitives get proportionally coarser default tessellation", () => {
  const core = qrPrimitiveGeometryOptions(resolveQrFlags({ options: ["core"] }), undefined, {})!;

  function instancedNode(primitive: AuraPrimitiveNode["primitive"], count: number, params?: AuraPrimitiveNode["params"]): AuraPrimitiveNode {
    return {
      kind: "primitive",
      primitive,
      ...(params ? { params } : {}),
      instances: Array.from({ length: count }, (_, i) => ({ position: [i, 0, 0] as [number, number, number] }))
    } as unknown as AuraPrimitiveNode;
  }

  function triangles(node: AuraPrimitiveNode): number {
    const geometry = createProductionPrimitiveResources(node, core)[0]!.geometry;
    return geometry.indexBuffer!.data.length / 3;
  }

  it("instancedDefaultSegmentScale: untouched up to 64 instances or inside the triangle budget, then x0.5, then x0.25, never below x0.25", () => {
    expect(instancedDefaultSegmentScale(undefined, 4000)).toBe(1);
    expect(instancedDefaultSegmentScale(64, 4000)).toBe(1);
    expect(instancedDefaultSegmentScale(65, 100)).toBe(1);
    expect(instancedDefaultSegmentScale(60, 100_000)).toBe(1);
    expect(instancedDefaultSegmentScale(100, 4000)).toBe(0.5);
    expect(instancedDefaultSegmentScale(500, 4000)).toBe(0.25);
    expect(instancedDefaultSegmentScale(100_000, 4000)).toBe(0.25);
    expect(instancedDefaultSegmentScale(5000, 192)).toBe(0.5);
    expect(instancedDefaultSegmentScale(8000, 192)).toBe(0.25);
  });

  it("sphere: 64x32 defaults for a sparse node, then 32x16, then 16x8 as the node's triangle demand passes the budget", () => {
    const explicit = (w: number, h: number) => triangles(instancedNode("sphere", 8, { widthSegments: w, heightSegments: h }));
    expect(triangles(instancedNode("sphere", 8))).toBe(explicit(64, 32));
    expect(triangles(instancedNode("sphere", 40))).toBe(explicit(64, 32));
    expect(triangles(instancedNode("sphere", 100))).toBe(explicit(32, 16));
    expect(triangles(instancedNode("sphere", 5000))).toBe(explicit(16, 8));
    expect(explicit(16, 8)).toBeLessThan(explicit(64, 32) / 10);
  });

  it("cylinder and cone also shrink; box and plane are untouched", () => {
    for (const kind of ["cylinder", "cone"] as const) {
      const sparse = triangles(instancedNode(kind, 8));
      const dense = triangles(instancedNode(kind, 20000));
      expect(dense).toBeLessThan(sparse);
    }
    expect(triangles(instancedNode("box", 5000))).toBe(triangles(instancedNode("box", 8)));
    expect(triangles(instancedNode("plane", 5000))).toBe(triangles(instancedNode("plane", 8)));
  });

  it("authored segment params always win over the density default", () => {
    const explicit = (count: number, w: number, h: number) => triangles(instancedNode("sphere", count, { widthSegments: w, heightSegments: h }));
    expect(explicit(5000, 64, 32)).toBe(explicit(8, 64, 32));
    expect(explicit(5000, 12, 6)).toBe(explicit(8, 12, 6));
    expect(explicit(5000, 12, 6)).toBeLessThan(explicit(5000, 64, 32));
  });

  it("pool keys differ per density tier so a sparse node never reuses a coarse mesh (and vice versa)", () => {
    const pool = new QrPrimitiveGeometryPool();
    const options = { ...core, pool };
    const a = qrPrimitiveGeometryKey("sphere", [1, 1, 1], options);
    const b = qrPrimitiveGeometryKey("sphere", [1, 1, 1], { ...options, defaultSegmentScale: 0.25 });
    expect(a).not.toBe(b);
    const sparse = createProductionPrimitiveResources(instancedNode("sphere", 4), options)[0]!.geometry;
    const dense = createProductionPrimitiveResources(instancedNode("sphere", 5000), options)[0]!.geometry;
    expect(dense.indexBuffer!.data.length).toBeLessThan(sparse.indexBuffer!.data.length);
    expect(pool.size).toBe(2);
  });
});

/** Minimal GLSL preprocessor: `#define NAME n`, `#if/#elif/#else/#endif` over integer macros, && and the comparison operators. */
function preprocess(source: string): string {
  const defines = new Map<string, number>();
  const out: string[] = [];
  const stack: Array<{ active: boolean; taken: boolean; parent: boolean }> = [];
  const evalCondition = (expr: string): boolean => {
    const js = expr.replace(/[A-Z_][A-Z0-9_]*/g, (name) => String(defines.get(name) ?? 0));
    return Boolean(new Function(`return (${js});`)());
  };
  for (const line of source.split("\n")) {
    const t = line.trim();
    const define = /^#define\s+([A-Z_][A-Z0-9_]*)\s+(\d+)$/.exec(t);
    if (define) { if (stack.every((f) => f.active)) defines.set(define[1]!, Number(define[2])); continue; }
    if (t.startsWith("#if ")) { const parent = stack.every((f) => f.active); const c = parent && evalCondition(t.slice(4)); stack.push({ active: c, taken: c, parent }); continue; }
    if (t.startsWith("#elif ")) { const f = stack[stack.length - 1]!; const c = f.parent && !f.taken && evalCondition(t.slice(6)); f.active = c; f.taken ||= c; continue; }
    if (t === "#else") { const f = stack[stack.length - 1]!; f.active = f.parent && !f.taken; f.taken = true; continue; }
    if (t === "#endif") { stack.pop(); continue; }
    if (stack.every((f) => f.active)) out.push(line);
  }
  return out.join("\n");
}

const callCount = (source: string, fn: string): number => (source.match(new RegExp(`\\b${fn}\\(`, "g")) ?? []).length;

describe("legacy LDR postprocess shader is compiled per feature variant", () => {
  const toneOnly: LdrProgramVariant = { toneMapping: true, operator: 2, inputSrgb: false, outputSrgb: true, grade: false, sharpening: false, fxaa: false };
  const everything: LdrProgramVariant = { toneMapping: true, operator: 2, inputSrgb: false, outputSrgb: true, grade: true, sharpening: true, fxaa: true };

  it("a tone-map-only frame evaluates the display transform once, the FXAA+sharpen variant 25 times", () => {
    const lean = preprocess(ldrFragmentSource(toneOnly));
    const full = preprocess(ldrFragmentSource(everything));
    // Call sites of finalColorAt: definition + main (+4 FXAA taps); baseColorAt: definition + finalColorAt (+4 sharpen taps).
    expect(callCount(lean, "finalColorAt")).toBe(2);
    expect(callCount(lean, "baseColorAt")).toBe(2);
    expect(callCount(full, "finalColorAt")).toBe(6);
    expect(callCount(full, "baseColorAt")).toBe(6);
    expect(lean).not.toContain("maxLuma - minLuma");
    expect(lean).not.toContain("u_vibrance * (1.0 - distanceFromLuma)");
    expect(full).toContain("maxLuma - minLuma");
    expect(full).toContain("u_vibrance * (1.0 - distanceFromLuma)");
    expect(lean.length).toBeLessThan(full.length * 0.75);
  });

  it("only the selected tone operator is emitted", () => {
    const aces = preprocess(ldrFragmentSource({ ...toneOnly, operator: 2 }));
    expect(aces).toContain("acesFilmic(max(vec3(0.0), decoded * u_exposure)");
    expect(aces).not.toContain("float toneMapChannel");
    const reinhard = preprocess(ldrFragmentSource({ ...toneOnly, operator: 1 }));
    expect(reinhard).toContain("return exposed / (1.0 + exposed);");
    expect(reinhard).not.toContain("return filmic(exposed);");
    expect(reinhard).not.toContain("acesFilmic(max(");
  });

  it("no tone mapping, no grade: the colour passes straight through and the colour-space helpers collapse", () => {
    const passthrough = preprocess(ldrFragmentSource({ toneMapping: false, operator: 2, inputSrgb: false, outputSrgb: false, grade: false, sharpening: false, fxaa: false }));
    expect(passthrough).not.toContain("float toneMapChannel");
    expect(passthrough).toContain("return color;");
    expect(passthrough).not.toContain("vec3 mapped");
    expect(passthrough).not.toContain("vec3(linearToSrgb(linear.r)");
    expect(passthrough).not.toContain("float graded");
  });

  it("variant keys separate every feature that changes the emitted source and clamp the operator", () => {
    const keys = new Set([
      ldrVariantKey(toneOnly), ldrVariantKey(everything), ldrVariantKey({ ...toneOnly, operator: 3 }), ldrVariantKey({ ...toneOnly, grade: true }),
      ldrVariantKey({ ...toneOnly, fxaa: true }), ldrVariantKey({ ...toneOnly, inputSrgb: true }), ldrVariantKey({ ...toneOnly, outputSrgb: false }), ldrVariantKey({ ...toneOnly, toneMapping: false })
    ]);
    expect(keys.size).toBe(8);
    expect(ldrVariantKey({ ...toneOnly, operator: 99 })).toBe(ldrVariantKey({ ...toneOnly, operator: 6 }));
    expect(ldrVariantKey({ ...toneOnly, sharpening: true })).toBe(ldrVariantKey(toneOnly));
  });
});
