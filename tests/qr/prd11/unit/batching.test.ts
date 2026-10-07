/**
 * PRD 11 Phase 3 (§6.6, §16.0) — lane unit tests for the batching layer:
 * content keys, StaticMergePlanner, BatchPlanCache, geometry pool, draw-data
 * texture, multi-draw command shapes and the C-02 chunk/feature registrations.
 */

import { describe, expect, it } from "vitest";

import { Geometry } from "../../../../packages/rendering/src/Geometry";
import { IndexBuffer } from "../../../../packages/rendering/src/IndexBuffer";
import { VertexBuffer } from "../../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../../packages/rendering/src/VertexFormat";
import { PBRMaterial } from "../../../../packages/rendering/src/PBRMaterial";
import { InstancedPBRMaterial } from "../../../../packages/rendering/src/InstancedPBRMaterial";
import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";
import type { RenderItem } from "../../../../packages/rendering/src/contracts/renderItem";
import { shaderChunk } from "../../../../packages/rendering/src/contracts/program";

import {
  geometryContentKey,
  materialSpecKey
} from "../../../../packages/rendering/src/batching/ContentKeys";
import {
  MAX_GPU_INSTANCES,
  planBatches
} from "../../../../packages/rendering/src/batching/StaticMergePlanner";
import { BatchedGeometryPool } from "../../../../packages/rendering/src/batching/BatchedGeometryPool";
import {
  DRAW_DATA_TEXELS_PER_DRAW,
  DrawDataTexture
} from "../../../../packages/rendering/src/batching/DrawDataTexture";
import {
  buildMultiDrawBatch,
  multiDrawCommands
} from "../../../../packages/rendering/src/batching/MultiDrawBatch";
import {
  BatchPlanCache,
  synthesizeInstancedItems
} from "../../../../packages/rendering/src/renderer/CullingBatching";
import {
  PRD11_DRAWID_CHUNK,
  registerPrd11DrawIdShader
} from "../../../../packages/rendering/src/batching/shaders/drawId.glsl";
import {
  PRD11_INSTANCE_EMISSIVE_FRAG_CHUNK,
  PRD11_INSTANCE_EMISSIVE_VTX_CHUNK,
  registerPrd11InstanceEmissiveShader
} from "../../../../packages/rendering/src/batching/shaders/instanceEmissive.glsl";

function boxGeometry(dye = 0): Geometry {
  const vb = new VertexBuffer(VertexFormat.P3N3, 4);
  for (let i = 0; i < 4; i += 1) {
    vb.setAttribute(i, "position", [i - 0.5, dye, 0]);
    vb.setAttribute(i, "normal", [0, 0, 1]);
  }
  return new Geometry(vb, new IndexBuffer([0, 1, 2, 0, 2, 3], 4));
}

function pbr(color: readonly [number, number, number, number], opts: { blend?: boolean; roughness?: number } = {}): PBRMaterial {
  return new PBRMaterial({
    baseColor: color,
    roughness: opts.roughness ?? 0.5,
    renderState: {
      depthTest: true,
      depthWrite: !(opts.blend ?? false),
      cullMode: "back",
      blend: opts.blend ?? false,
      depthCompare: "less-equal"
    }
  });
}

function translate(x: number, y = 0, z = 0): readonly number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
}

function item(geometry: Geometry, material: PBRMaterial, x = 0): RenderItem {
  return { geometry, material, modelMatrix: translate(x), castShadow: true };
}

const COLORS = [
  [1, 0, 0, 1],
  [0, 1, 0, 1],
  [0, 0, 1, 1]
] as const;

describe("ContentKeys (PRD 11 §6.6 layer 1)", () => {
  it("content-identical geometries share a key; different data differs", () => {
    const a = boxGeometry();
    const b = boxGeometry();
    expect(geometryContentKey(a)).toBe(geometryContentKey(b));
    const c = boxGeometry(1);
    expect(geometryContentKey(c)).not.toBe(geometryContentKey(a));
  });

  it("materials differing only in baseColor share a spec key", () => {
    const keyA = materialSpecKey(pbr(COLORS[0]));
    const keyB = materialSpecKey(pbr(COLORS[1]));
    expect(keyA).toBe(keyB);
    expect(materialSpecKey(pbr(COLORS[0], { roughness: 0.9 }))).not.toBe(keyA);
  });

  it("opacity ≥ 0.999 is excluded from the material key", () => {
    const opaque = new PBRMaterial({ baseColor: [1, 0, 0, 1], renderState: pbr(COLORS[0]).renderState });
    opaque.setParameter("u_opacity", 1.0);
    const other = pbr(COLORS[0]);
    expect(materialSpecKey(opaque)).toBe(materialSpecKey(other));
  });
});

describe("planBatches (§16.0)", () => {
  it("300 boxes / 3 colours → one instanced batch chunked at MAX_GPU_INSTANCES with 3 distinct colours", () => {
    const geometry = boxGeometry();
    const items: RenderItem[] = [];
    for (let i = 0; i < 300; i += 1) {
      items.push(item(geometry, pbr(COLORS[i % 3]), i));
    }
    const plan = planBatches(items);
    expect(plan.instancedBatches.length).toBe(1);
    const batch = plan.instancedBatches[0]!;
    expect(batch.members.length).toBe(300);
    expect(batch.chunks.length).toBe(Math.ceil(300 / MAX_GPU_INSTANCES));
    const colors = new Set<string>();
    for (let i = 0; i < batch.instanceColors.length; i += 4) {
      colors.add([...batch.instanceColors.slice(i, i + 4)].join(","));
    }
    expect(colors.size).toBe(3);
    expect(plan.stats.instancedDraws).toBe(5);
    expect(plan.passthrough.length).toBe(0);
  });

  it("merged material renders through aura3d/instanced-pbr with white baseColor", () => {
    const geometry = boxGeometry();
    const items = [item(geometry, pbr(COLORS[0])), item(geometry, pbr(COLORS[1]))];
    const plan = planBatches(items);
    const batch = plan.instancedBatches[0]!;
    expect(batch.material).toBeInstanceOf(InstancedPBRMaterial);
    expect(batch.material.getParameters().get("u_baseColor")).toEqual([1, 1, 1, 1]);
  });

  it("counts transparent/skinned/vertex-colour members in reasonsNotBatched", () => {
    const geometry = boxGeometry();
    const transparent = item(geometry, pbr(COLORS[0], { blend: true }));
    const skinned = { ...item(geometry, pbr(COLORS[1])), skinning: { joints: [] } as never };
    const colored = new Geometry(
      new VertexBuffer(new VertexFormat([
        { semantic: "position", components: 3, offset: 0 },
        { semantic: "color", components: 4, offset: 12 }
      ], 28), 4),
      new IndexBuffer([0, 1, 2, 0, 2, 3], 4)
    );
    const vertexColored = item(colored, pbr(COLORS[2]));
    const plan = planBatches([transparent, skinned, vertexColored]);
    expect(plan.reasonsNotBatched.transparent).toBe(1);
    expect(plan.reasonsNotBatched.skinned).toBe(1);
    expect(plan.reasonsNotBatched["vertex-colors"]).toBe(1);
    expect(plan.passthrough.length).toBe(3);
  });

  it("batch:false opts out", () => {
    const geometry = boxGeometry();
    const out = { ...item(geometry, pbr(COLORS[0])), batch: false } as RenderItem;
    const plan = planBatches([out, item(geometry, pbr(COLORS[1]))]);
    expect(plan.reasonsNotBatched["batch:false"]).toBe(1);
    expect(plan.instancedBatches.length).toBe(0);
  });

  it("multiDrawAvailable=false counts leftovers as multi-draw-generator-pending", () => {
    const geometry = boxGeometry();
    const items = [
      item(geometry, pbr(COLORS[0])),
      item(boxGeometry(9), pbr(COLORS[0])) // unique geometry → no instancing partner
    ];
    const plan = planBatches(items, { multiDrawAvailable: false });
    expect(plan.reasonsNotBatched["multi-draw-generator-pending"]).toBe(2);
  });
});

describe("BatchPlanCache (plan cached by structural version)", () => {
  it("600 frames of an unchanged set build the plan once", () => {
    const geometry = boxGeometry();
    const items = Array.from({ length: 12 }, (_, i) => item(geometry, pbr(COLORS[i % 3]), i));
    const cache = new BatchPlanCache();
    const first = cache.apply(items);
    for (let frame = 0; frame < 600; frame += 1) {
      const again = cache.apply(items);
      expect(again).toBe(first);
    }
    expect(cache.planVersion).toBe(1);
    expect(cache.lastReport.planVersion).toBe(1);
  });

  it("matrix changes on an unchanged set refresh transforms without replan", () => {
    const geometry = boxGeometry();
    const mutable = [...translate(0)];
    const items = [
      item(geometry, pbr(COLORS[0])),
      { ...item(geometry, pbr(COLORS[1])), modelMatrix: mutable }
    ];
    const cache = new BatchPlanCache();
    const first = cache.apply(items);
    mutable[12] = 5;
    const second = cache.apply(items);
    expect(second).toBe(first);
    expect(cache.planVersion).toBe(1);
    const plan = cache.lastPlan!;
    expect(plan.instancedBatches[0]!.instanceTransforms[16 + 12]).toBe(5);
  });
});

describe("BatchedGeometryPool + DrawDataTexture", () => {
  it("packs members with rebased indices and arena offsets", () => {
    const pool = new BatchedGeometryPool();
    const a = pool.pack(boxGeometry());
    const b = pool.pack(boxGeometry());
    expect(a.firstIndex).toBe(0);
    expect(b.firstIndex).toBe(6);
    expect(b.baseVertex).toBe(4);
    expect(pool.stats().geometries).toBe(2);
    const { vertexBuffer, indexBuffer } = pool.upload(new MockRenderDevice());
    expect(vertexBuffer.byteLength).toBe(2 * 4 * VertexFormat.P3N3.stride);
    expect(indexBuffer!.byteLength).toBeGreaterThan(0);
  });

  it("draw-data rows store model matrix, colour and meta per draw", () => {
    const data = new DrawDataTexture(2);
    data.setDraw(0, { model: translate(7), baseColor: [1, 0, 0, 1], meta: [0, 4, 6, 0] });
    const texels = data.drawTexels(0);
    expect(texels[12]).toBe(7);            // model[12] = tx
    expect(texels[16]).toBe(1);            // baseColor.r
    expect(texels[21]).toBe(4);            // meta.baseVertex
    const desc = data.descriptor();
    expect(desc.width).toBe(2 * DRAW_DATA_TEXELS_PER_DRAW);
    expect(desc.format).toBe("rgba32f");
  });
});

describe("MultiDrawBatch", () => {
  it("emits one packed DrawCommand per member with u_drawId + shared arenas", () => {
    const geometry = boxGeometry();
    const members = [item(geometry, pbr(COLORS[0])), item(boxGeometry(1), pbr(COLORS[1]))];
    const group = { key: "g", programKey: "p", vertexLayoutKey: "v", members };
    const batch = buildMultiDrawBatch(group);
    const commands = multiDrawCommands(new MockRenderDevice(), batch);
    expect(commands.length).toBe(2);
    expect(commands[0]!.vertexBuffer).toBe(commands[1]!.vertexBuffer);
    expect(commands[0]!.uniforms!.get("u_drawId")).toBe(0);
    expect(commands[1]!.uniforms!.get("u_drawId")).toBe(1);
    expect(commands[0]!.uniforms!.get("u_a3dDrawData")).toBeDefined();
    expect(commands[1]!.indexCount).toBe(6);
  });
});

describe("C-02 chunk/feature registration", () => {
  it("registers a3d_prd11_draw_id + instance_emissive chunks idempotently", () => {
    registerPrd11DrawIdShader();
    registerPrd11DrawIdShader();
    registerPrd11InstanceEmissiveShader();
    expect(shaderChunk(PRD11_DRAWID_CHUNK)?.glsl).toContain("u_a3dDrawData");
    expect(shaderChunk(PRD11_INSTANCE_EMISSIVE_VTX_CHUNK)?.glsl).toContain("a_instanceEmissive");
    expect(shaderChunk(PRD11_INSTANCE_EMISSIVE_FRAG_CHUNK)?.glsl).toContain("v_a3dInstanceEmissive");
  });
});

describe("synthesizeInstancedItems", () => {
  it("emits one RenderItem per chunk with transforms+colours", () => {
    const geometry = boxGeometry();
    const items = Array.from({ length: 130 }, (_, i) => item(geometry, pbr(COLORS[i % 3]), i));
    const plan = planBatches(items);
    const synthesized = synthesizeInstancedItems(plan.instancedBatches);
    expect(synthesized.length).toBe(3); // 64 + 64 + 2
    expect(synthesized[0]!.instanceTransforms!.length).toBe(64 * 16);
    expect(synthesized[2]!.instanceTransforms!.length).toBe(2 * 16);
    expect(synthesized.every((s) => s.material instanceof InstancedPBRMaterial)).toBe(true);
  });
});
