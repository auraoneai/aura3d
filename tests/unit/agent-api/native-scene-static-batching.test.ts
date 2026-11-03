import { describe, expect, it, vi } from "vitest";
import "../../../packages/rendering/src/lanes/prd01";
import { Geometry, Renderer, UnlitMaterial, createTrustedQrFlags, type RenderItem } from "@aura3d/rendering";
import { createProductionRuntimeRendererInput } from "../../../packages/engine/src/agent-api/compiler/renderInput";
import { reuseRenderItemsForTest } from "../../../packages/engine/src/agent-api/compiler/compileScene";
import { setDirectRenderPath } from "../../../packages/engine/src/agent-api/app/renderPath";
import { attachRootRenderSource } from "../../../packages/engine/src/agent-api/RootRuntimeSupport";
import { camera, scene } from "../../../packages/engine/src/public/index";
import type { AuraModelNode, ProductionRuntimeActorEntry } from "../../../packages/engine/src/agent-api/nodes/types";
import { fakeWebGLCanvas } from "../rendering/static-unlit-fake-webgl";
import { fakeGeneratedStaticWebGLCanvas } from "../rendering/static-generated-unlit-fake-webgl";

// Source-level modeled WebGL calls only; this is not a GPU or pixel test.
const flags = createTrustedQrFlags({
  A3D_QR_CORE: false, A3D_QR_CORE_GENERATOR: false, A3D_QR_CORE_OUTPUT: false,
  A3D_QR_MATERIALS: false, A3D_QR_LIGHTING: false, A3D_QR_POST: false
});
const generatedFlags = createTrustedQrFlags({
  A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_CORE_OUTPUT: false,
  A3D_QR_MATERIALS: false, A3D_QR_LIGHTING: false, A3D_QR_POST: false
});

async function fixture(generated = false) {
  const gl = generated ? fakeGeneratedStaticWebGLCanvas() : fakeWebGLCanvas();
  const renderer = await Renderer.create({ backend: "webgl2", canvas: gl.canvas, width: 128, height: 128, qrFlags: generated ? generatedFlags : flags });
  setDirectRenderPath(gl.canvas, true);
  const geometry = Geometry.triangle();
  const material = new UnlitMaterial();
  const nodes = [-0.8, 0.8].map((x, index) => ({
    kind: "model", name: `box-${index}`, asset: { kind: "aura-asset-ref", id: "fixture", type: "model", source: "fixture.glb", uri: "fixture.glb" },
    position: [x, 0, 0], scale: 0.3, scaleMode: "world", visible: true, castShadow: false, receiveShadow: false,
    renderOrder: index
  } as unknown as AuraModelNode));
  const metadata = { meshCount: 1, primitiveCount: 1, materialCount: 1, textureCount: 0, imageCount: 0, animationCount: 0, skinCount: 0, morphTargetCount: 0, extensionsUsed: [] };
  const actors = nodes.map((node, index) => ({
    node,
    actor: {
      id: `actor-${index}`,
      pipeline: { asset: { skins: [], meshes: [] }, resources: {}, metadata },
      animation: { setFootPlanting() {} },
      collectRenderItems: ({ modelMatrix }: { modelMatrix: readonly number[] }) => [{ geometry, material, modelMatrix }]
    }
  } as unknown as ProductionRuntimeActorEntry));
  const snapshot = { ...scene({ camera: camera.orthographic({ position: [0, 0, 5], target: [0, 0, 0], orthographicSize: 2 }) }).toJSON(), nodes };
  const frame = () => createProductionRuntimeRendererInput(snapshot, gl.canvas, actors, [], 0, undefined, new Set(), { color: [0, 0, 0], intensity: 0 }, []);
  const dispose = () => { setDirectRenderPath(gl.canvas, false); renderer.dispose(); geometry.dispose(); material.dispose(); };
  return { ...gl, renderer, geometry, material, actors, frame, dispose };
}

describe("scene-owned static pair collection", () => {
  it.each([
    ["legacy", false], ["compiled reuse", false], ["generated compiled reuse", true]
  ] as const)("uses a materialized %s scene frame without changing the public collector", async (mode, generated) => {
    const f = await fixture(generated);
    try {
      const input = f.frame();
      const source = mode === "legacy" ? input.source : reuseRenderItemsForTest(
        { actorEntries: f.actors, primitiveEntries: [], itemCache: new Map() }, input.source,
        { get: () => undefined } as never
      );
      const collected = [...source.collectRenderItems!()];
      expect(collected).toHaveLength(2);
      expect(collected.map((item) => item.renderOrder)).toEqual([0, 1]);
      expect(source.renderItems).toBeUndefined();
      const first = f.renderer.render(source, input.camera);
      expect(first).toMatchObject({ submittedObjects: 2, visibleObjects: 2, drawCalls: 2 });
      let paired = false;
      for (let i = 0; i < 7 && !paired; i += 1) {
        const start = f.nativeDraws.length;
        const result = f.renderer.render(source, input.camera);
        const draws = f.nativeDraws.slice(start);
        if (draws.length === 1 && draws[0]!.name === "drawElementsInstanced") {
          paired = true;
          expect(draws[0]!.args.at(-1)).toBe(2);
          expect(result).toMatchObject({ submittedObjects: 2, visibleObjects: 2, triangles: 2, drawCalls: 1 });
        }
      }
      expect(paired).toBe(true);
    } finally { f.dispose(); }
  });

  it("preserves user collector calls and separately appended items without pair admission", async () => {
    const f = await fixture();
    const callbacks: string[] = [];
    const sideItem = (label: string, renderOrder: number): RenderItem => ({ geometry: f.geometry, material: f.material, label, renderOrder, onBeforeRender: () => callbacks.push(label) });
    const collect = vi.fn(() => [sideItem("collector", -1)]);
    const detach = attachRootRenderSource(f.canvas, { source: { collectRenderItems: collect, renderItems: [sideItem("appended", 3)] } });
    try {
      const input = f.frame();
      expect(collect).toHaveBeenCalledTimes(1);
      for (let i = 0; i < 4; i += 1) {
        callbacks.length = 0;
        const start = f.nativeDraws.length;
        const result = f.renderer.render(input.source, input.camera);
        expect(result).toMatchObject({ submittedObjects: 4, visibleObjects: 4, drawCalls: 4 });
        expect(callbacks).toEqual(["collector", "appended"]);
        expect(f.nativeDraws.slice(start).map((draw) => draw.name)).toEqual(["drawElements", "drawElements", "drawElements", "drawElements"]);
      }
      expect(collect).toHaveBeenCalledTimes(1);
    } finally { detach(); f.dispose(); }
  });

  it("falls back when a frame is copied, its collector is replaced, or extra items are added", async () => {
    const f = await fixture();
    try {
      const input = f.frame();
      const original = input.source.collectRenderItems!;
      const variants = [
        { ...input.source },
        { ...input.source, collectRenderItems: () => original() },
        { ...input.source, renderItems: [{ geometry: f.geometry, material: f.material }] }
      ];
      for (const source of variants) {
        const expected = source.renderItems ? 3 : 2;
        for (let i = 0; i < 4; i += 1) {
          const start = f.nativeDraws.length;
          const result = f.renderer.render(source, input.camera);
          expect(result.drawCalls).toBe(expected);
          expect(f.nativeDraws.slice(start).every((draw) => draw.name === "drawElements")).toBe(true);
        }
      }
      // Mutating the original registered source also invalidates admission.
      input.source.collectRenderItems = () => original();
      for (let i = 0; i < 3; i += 1) {
        const start = f.nativeDraws.length;
        expect(f.renderer.render(input.source, input.camera).drawCalls).toBe(2);
        expect(f.nativeDraws.slice(start).map((draw) => draw.name)).toEqual(["drawElements", "drawElements"]);
      }
    } finally { f.dispose(); }
  });
});
