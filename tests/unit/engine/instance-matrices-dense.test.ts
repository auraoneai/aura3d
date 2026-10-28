/**
 * Dense instance path (beat-three.js PRD, contract 3.4, target P6): `setInstanceTransforms` on `instances.*` nodes writes a typed
 * array into node-owned storage; the compiler folds the node size into it with one linear pass and the render item carries the
 * result. No per-instance spec decomposition or object allocation per frame.
 *
 * Budget: the CPU cost of one forest frame's instance work (dense write for all three nodes + `createProductionRuntimeRendererInput`)
 * stays at or under 2 ms at the bench scene's 18,000 instances. GL submission is not part of `frame()` CPU in this test.
 */
import "@aura3d/engine";
import { describe, expect, it } from "vitest";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { createProductionRuntimeRendererInput } from "../../../packages/engine/src/agent-api/compiler/renderInput";
import { createProductionInstanceColors, createProductionInstanceTransforms, createProductionRuntimePrimitiveEntries } from "../../../packages/engine/src/agent-api/compiler/primitives";
import { stubSetInstanceTransforms } from "../../../packages/engine/src/agent-api/nodes/game/instanceTransforms";
import { instances } from "../../../packages/engine/src/agent-api/nodes/instances";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import { camera } from "../../../packages/engine/src/agent-api/nodes/camera";
import type { AuraApp, AuraPrimitiveNode, AuraRuntimeNodeRegistry, AuraSceneSnapshot, AuraTransformSpec } from "../../../packages/engine/src/agent-api/nodes/types";
import type { RenderItem } from "@aura3d/rendering";

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/** Column-major T·R(yaw)·S(s), matching what a `{ position, rotation: [0, yaw, 0], scale }` spec composes to (ZYX order, yaw only). */
function composeYaw(out: Float32Array, index: number, x: number, y: number, z: number, yaw: number, s: number): void {
  const c = Math.cos(yaw), sn = Math.sin(yaw), o = index * 16;
  out[o] = c * s; out[o + 1] = 0; out[o + 2] = -sn * s; out[o + 3] = 0;
  out[o + 4] = 0; out[o + 5] = s; out[o + 6] = 0; out[o + 7] = 0;
  out[o + 8] = sn * s; out[o + 9] = 0; out[o + 10] = c * s; out[o + 11] = 0;
  out[o + 12] = x; out[o + 13] = y; out[o + 14] = z; out[o + 15] = 1;
}

interface Forest {
  readonly snapshot: AuraSceneSnapshot;
  readonly registry: AuraRuntimeNodeRegistry;
  readonly primitives: AuraPrimitiveNode[];
  readonly specs: Record<string, AuraTransformSpec[]>;
  readonly matrices: Record<string, Float32Array>;
}

function buildForest(trees: number, rocks: number): Forest {
  const rand = lcg(7);
  const specs: Record<string, AuraTransformSpec[]> = { trunks: [], canopies: [], rocks: [] };
  const matrices: Record<string, Float32Array> = { trunks: new Float32Array(trees * 16), canopies: new Float32Array(trees * 16), rocks: new Float32Array(rocks * 16) };
  for (let i = 0; i < trees; i += 1) {
    const x = (rand() - 0.5) * 160, z = (rand() - 0.5) * 160, s = 0.7 + rand() * 0.9, yaw = rand() * Math.PI * 2;
    specs.trunks!.push({ position: [x, 0.6 * s, z], rotation: [0, yaw, 0], scale: s });
    specs.canopies!.push({ position: [x, 2.1 * s, z], rotation: [0, yaw, 0], scale: s });
    composeYaw(matrices.trunks!, i, x, 0.6 * s, z, yaw, s);
    composeYaw(matrices.canopies!, i, x, 2.1 * s, z, yaw, s);
  }
  for (let i = 0; i < rocks; i += 1) {
    const s = 0.3 + rand() * 0.8, x = (rand() - 0.5) * 160, z = (rand() - 0.5) * 160, yaw = rand() * Math.PI * 2;
    specs.rocks!.push({ position: [x, 0.25 * s, z], rotation: [0, yaw, 0], scale: s });
    composeYaw(matrices.rocks!, i, x, 0.25 * s, z, yaw, s);
  }
  const snapshot = scene()
    .background("#aab8c4")
    .camera(camera.perspective({ fov: 50, near: 0.1, far: 400, position: [0, 9, 34], target: [0, 3, 0] }))
    .add(instances.cylinder({ name: "trunks", size: [0.36, 1.2, 0.36], transforms: specs.trunks!, castShadow: true }).runtime({ id: "trunks" }))
    .add(instances.cone({ name: "canopies", size: [1.8, 2.2, 1.8], transforms: specs.canopies!, castShadow: true }).runtime({ id: "canopies" }))
    .add(instances.sphere({ name: "rocks", size: [1, 1, 1], transforms: specs.rocks!, castShadow: true }).runtime({ id: "rocks" }))
    .toJSON() as AuraSceneSnapshot;
  const primitives = snapshot.nodes.filter((node): node is AuraPrimitiveNode => node.kind === "primitive");
  return { snapshot, registry: createAuraRuntimeNodeRegistry(snapshot), primitives, specs, matrices };
}

function render(forest: Forest, entries: ReturnType<typeof createProductionRuntimePrimitiveEntries>): RenderItem[] {
  const canvas = { width: 640, height: 360 } as HTMLCanvasElement;
  const input = createProductionRuntimeRendererInput(forest.snapshot, canvas, [], entries, 0, forest.registry, new Set<string>(), { color: [0, 0, 0], intensity: 0 }, []);
  return [...(input.source.collectRenderItems?.() ?? [])];
}

const byName = (items: RenderItem[], name: string): RenderItem => {
  const hit = items.find((item) => item.label?.includes(name));
  if (!hit) throw new Error(`no render item for ${name}: ${items.map((item) => item.label).join(", ")}`);
  return hit;
};

describe("dense instance matrices", () => {
  it("fold the node size into the written matrices exactly like the spec path", () => {
    const forest = buildForest(300, 100);
    const entries = createProductionRuntimePrimitiveEntries(forest.primitives);
    for (const name of ["trunks", "canopies", "rocks"] as const) {
      forest.registry.require(name).setInstanceMatrices(forest.matrices[name]!, forest.matrices[name]!.length / 16);
    }
    const items = render(forest, entries);
    for (const name of ["trunks", "canopies", "rocks"] as const) {
      const node = forest.primitives.find((candidate) => candidate.name === name)!;
      const expected = createProductionInstanceTransforms(forest.specs[name]!, node);
      const actual = byName(items, name).instanceTransforms as Float32Array;
      expect(actual.length).toBe(expected.length);
      let worst = 0;
      for (let i = 0; i < expected.length; i += 1) worst = Math.max(worst, Math.abs(actual[i]! - expected[i]!));
      expect(worst).toBeLessThan(2e-5);
    }
  });

  it("setInstanceTransforms keeps its validation and writes the dense store (no node.instances rewrite)", () => {
    const forest = buildForest(10, 4);
    const entries = createProductionRuntimePrimitiveEntries(forest.primitives);
    const app = { scene: { nodes: forest.snapshot.nodes } } as unknown as AuraApp;
    const handle = forest.registry.require("trunks");
    const trunks = forest.primitives.find((node) => node.name === "trunks")!;
    const before = trunks.instances;
    expect(() => stubSetInstanceTransforms(handle, app, forest.matrices.trunks!, 11)).toThrowError(/INSTANCE_CAPACITY_EXCEEDED/);
    expect(() => stubSetInstanceTransforms(handle, app, new Float32Array(16), 2)).toThrowError(/matrices\.length/);
    stubSetInstanceTransforms(handle, app, forest.matrices.trunks!, 7);
    expect(trunks.instances).toBe(before);
    const item = byName(render(forest, entries), "trunks");
    expect((item.instanceTransforms as Float32Array).length).toBe(7 * 16);
  });

  it("colors: rgb in, linear rgba out, equal to the spec path's 8-bit round trip", () => {
    const forest = buildForest(20, 0);
    const entries = createProductionRuntimePrimitiveEntries(forest.primitives);
    const app = { scene: { nodes: forest.snapshot.nodes } } as unknown as AuraApp;
    const rgb = new Float32Array(20 * 3);
    const hex: string[] = [];
    const rand = lcg(3);
    for (let i = 0; i < 20; i += 1) {
      const bytes = [Math.floor(rand() * 256), Math.floor(rand() * 256), Math.floor(rand() * 256)];
      rgb.set(bytes.map((b) => b / 255), i * 3);
      hex.push(`#${bytes.map((b) => b.toString(16).padStart(2, "0")).join("")}`);
    }
    stubSetInstanceTransforms(forest.registry.require("canopies"), app, forest.matrices.canopies!, 20, rgb);
    const actual = byName(render(forest, entries), "canopies").instanceColors as Float32Array;
    const expected = createProductionInstanceColors(hex, 20)!;
    expect(actual.length).toBe(expected.length);
    for (let i = 0; i < expected.length; i += 1) expect(actual[i]!).toBeCloseTo(expected[i]!, 5);
  });

  it("an empty write draws nothing and warns", () => {
    const forest = buildForest(10, 0);
    const entries = createProductionRuntimePrimitiveEntries(forest.primitives);
    forest.registry.require("trunks").setInstanceMatrices(new Float32Array(0), 0);
    const warnings = new Set<string>();
    const canvas = { width: 640, height: 360 } as HTMLCanvasElement;
    const input = createProductionRuntimeRendererInput(forest.snapshot, canvas, [], entries, 0, forest.registry, warnings, { color: [0, 0, 0], intensity: 0 }, []);
    const items = [...(input.source.collectRenderItems?.() ?? [])];
    expect(items.some((item) => item.label?.includes("trunks"))).toBe(false);
    expect([...warnings].some((w) => w.startsWith("INSTANCES_EMPTY"))).toBe(true);
  });

  it("frame() CPU budget: 18,000 dense instances (8,000 trunks, 8,000 canopies, 2,000 rocks) cost <= 2 ms per frame", () => {
    const forest = buildForest(8000, 2000);
    const entries = createProductionRuntimePrimitiveEntries(forest.primitives);
    const frame = (): number => {
      const t0 = performance.now();
      for (const name of ["trunks", "canopies", "rocks"] as const) {
        forest.registry.require(name).setInstanceMatrices(forest.matrices[name]!, forest.matrices[name]!.length / 16);
      }
      render(forest, entries);
      return performance.now() - t0;
    };
    for (let i = 0; i < 8; i += 1) frame();
    const samples = Array.from({ length: 30 }, frame).sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)]!;
    // eslint-disable-next-line no-console
    console.log(`dense instance frame CPU: median ${median.toFixed(3)} ms, p90 ${samples[Math.floor(samples.length * 0.9)]!.toFixed(3)} ms`);
    expect(median).toBeLessThanOrEqual(2);
  });
});
