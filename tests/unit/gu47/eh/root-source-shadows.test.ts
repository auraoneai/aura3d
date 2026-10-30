/**
 * GU47 E-H (WP-8) item 6: items an app attaches with `attachRootRenderSource`
 * (`agent-api/RootRuntimeSupport.ts`) cast sun shadows and receive contact
 * shadows. They join the frame's single item list ahead of the scene items, so
 * the renderer's caster filter (`castShadow !== false`), the prd02 caster rule,
 * the contact-shadow depth pre-pass and the forward contact-mask sampling
 * (`receiveShadow !== false`) treat them exactly like scene items. This pins
 * that path with a skinned-or-rigid GLB actor drawn the way G17 draws its
 * runner (outside the scene graph).
 */
import "@aura3d/engine";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { camera, lights, primitives, scene } from "@aura3d/engine";
import { createAuraRuntimeNodeRegistry } from "../../../../packages/engine/src/agent-api/app/runtimeNodes";
import { attachRootRenderSource } from "../../../../packages/engine/src/agent-api/RootRuntimeSupport";
import { createProductionRuntimeRendererInput } from "../../../../packages/engine/src/agent-api/compiler/renderInput";
import { createProductionRuntimePrimitiveEntries } from "../../../../packages/engine/src/agent-api/compiler/primitives";
import { createTypedGLBActor } from "../../../../packages/engine/src/production-runtime/TypedGLBActor";
import { prd02ShadowCasterEligible } from "../../../../packages/rendering/src/shadows/Prd02DepthShaderLibrary";
import type { AuraPrimitiveNode, AuraSceneSnapshot } from "../../../../packages/engine/src/agent-api/nodes/types";

const GLB_BYTES = new Uint8Array(readFileSync("tests/fixtures/gltf-multipart/body-and-four-wheels.glb"));
const nativeFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = (async () => new Response(new Uint8Array(GLB_BYTES), { status: 200 })) as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = nativeFetch;
});

describe("GU47 E-H root render sources and shadows", () => {
  it("attached actor items are shadow casters and contact-shadow receivers like scene items", async () => {
    const actor = await createTypedGLBActor({
      asset: { url: "https://assets.invalid/gu47-eh/root-runner.glb", type: "model", format: "glb" },
      id: "runner",
      width: 64,
      height: 64,
      shareTextures: false
    });
    const snapshot = scene()
      .camera(camera.perspective({ fov: 50, near: 0.1, far: 200, position: [0, 4, 10], target: [0, 0, 0] }))
      .add(lights.directional({ name: "sun", shadow: true, intensity: 2, position: [6, 10, 4], target: [0, 0, 0] }))
      .add(primitives.box({ name: "ground", size: [20, 0.2, 20], castShadow: false }).runtime({ id: "ground" }))
      .toJSON() as AuraSceneSnapshot;
    const primitiveNodes = snapshot.nodes.filter((node): node is AuraPrimitiveNode => node.kind === "primitive");
    const canvas = { width: 320, height: 180 } as HTMLCanvasElement;
    const modelMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.5, 0, 1];
    const detach = attachRootRenderSource(canvas, { source: { collectRenderItems: () => actor.collectRenderItems({ modelMatrix }) } });
    try {
      const input = createProductionRuntimeRendererInput(
        snapshot,
        canvas,
        [],
        createProductionRuntimePrimitiveEntries(primitiveNodes),
        0,
        createAuraRuntimeNodeRegistry(snapshot),
        new Set<string>(),
        { color: [0, 0, 0], intensity: 0 },
        []
      );
      const items = [...(input.source.collectRenderItems?.() ?? [])];
      const attached = items.filter((item) => item.label?.startsWith("runner:"));
      expect(attached.length).toBe(5); // body + four wheels
      const ground = items.find((item) => item.label?.includes(":ground"));
      expect(ground?.castShadow).toBe(false);
      for (const item of attached) {
        // Caster: not opted out, eligible under the prd02 caster rule (also the contact depth rule).
        expect(item.castShadow).not.toBe(false);
        expect(prd02ShadowCasterEligible(item)).toBe(true);
        // Receiver: the forward pass samples the shadow map and contact mask unless receiveShadow === false.
        expect(item.receiveShadow).not.toBe(false);
        expect(item.modelMatrix?.[13]).toBeGreaterThan(0.5 - 1e-6);
      }
      // The sun in the scene drives the shadow map that the attached casters render into.
      const shadow = input.source.shadow;
      expect(typeof shadow === "object" && shadow !== null ? shadow.enabled : shadow).toBe(true);
      // Attached items are counted with the scene's meshes in the frame metadata.
      expect(input.metadata.primitiveCount).toBeGreaterThanOrEqual(attached.length);
    } finally {
      detach();
      actor.dispose();
    }
  });
});
