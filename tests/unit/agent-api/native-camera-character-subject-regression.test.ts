import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes.js";
import { createAuraCameraController } from "../../../packages/engine/src/agent-api/camera/extension.js";
import { createCameraProbe } from "../../../packages/engine/src/agent-api/camera/Probe.js";
import { createShoulderRig } from "../../../packages/engine/src/agent-api/camera/rigs/shoulder.js";
import { subjectFromHandle } from "../../../packages/engine/src/agent-api/camera/subject.js";
import { createProductionRuntimeRendererInput, setPrd01ModelMatrixCache } from "../../../packages/engine/src/agent-api/compiler/renderInput.js";
import { modelMatrixFor } from "../../../packages/engine/src/agent-api/compiler/sceneGraph.js";
import { defineAuraAssets } from "../../../packages/engine/src/agent-api/nodes/assets.js";
import { camera } from "../../../packages/engine/src/agent-api/nodes/camera.js";
import { model } from "../../../packages/engine/src/agent-api/nodes/model.js";
import { primitives } from "../../../packages/engine/src/agent-api/nodes/primitives.js";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene.js";
import type { AuraApp, AuraModelNode } from "../../../packages/engine/src/agent-api/nodes/types.js";
import { createModelMatrixCache } from "../../../packages/engine/src/agent-api/sceneGraph.js";
import type { AuraCameraPose } from "../../../packages/engine/src/contracts/camera.js";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags.js";
import { createTypedGLBActor, type TypedGLBActor } from "../../../packages/engine/src/production-runtime/TypedGLBActor.js";
import { clearTypedGLBActorQrFlags, setTypedGLBActorQrFlags } from "../../../packages/engine/src/production-runtime/actor/extensions.js";

type Vec3 = readonly [number, number, number];

function depth(point: Vec3, pose: AuraCameraPose): number {
  const forward = pose.target.map((value, axis) => value - pose.position[axis]!);
  const length = Math.hypot(...forward);
  return point.reduce((sum, value, axis) =>
    sum + (value - pose.position[axis]!) * forward[axis]! / length, 0
  );
}

describe("default character-controller camera regression", () => {
  it("keeps the actual skinned character behind the near plane with the real app camera", async () => {
    const bytes = readFileSync("packages/create-aura3d/templates/character-controller/public/aura-assets/auraclash-player-rig.glb");
    expect(createHash("sha256").update(bytes).digest("hex"))
      .toBe("3318d671632878ed27b8af6de88c6e5ca647e0d4a04cf03780d555fa07cec087");
    const assets = defineAuraAssets({ hero: {
      type: "model", format: "glb", url: "/aura-assets/auraclash-player-rig.glb",
      bounds: [1.669, 1.788, 0.349],
      hash: "sha256-3318d671632878ed27b8af6de88c6e5ca647e0d4a04cf03780d555fa07cec087"
    } });
    const snapshot = scene()
      .add(model(assets.hero, { name: "certified hero humanoid-a", castShadow: true })
        .position(0, 0, 0).scale(1.62 / 1.788).animate({ clip: "Walk_Loop", loop: true, speed: 0 })
        .runtime({ id: "hero", tags: ["player"] }))
      .add(primitives.box({ name: "walkable ground", size: [30, 0.1, 30], position: [0, -0.05, 0] }))
      .add(primitives.box({ name: "distance marker north", size: [0.4, 1.4, 0.4], position: [0, 0.7, -6] }))
      .add(primitives.box({ name: "distance marker east", size: [0.4, 1.4, 0.4], position: [5, 0.7, 0] }))
      .add(primitives.box({ name: "collision wall", size: [0.4, 2.4, 4], position: [2.4, 1.2, 4.2] }))
      .camera(camera.perspective({ position: [0.55, 1.75, -2.8], target: [0, 1.35, 1.1], fov: 55 }))
      .toJSON();
    const node = snapshot.nodes.find((candidate): candidate is AuraModelNode => candidate.kind === "model")!;
    const flags = resolveQrFlags({ options: ["game"], env: {} });
    const owner = {};
    setTypedGLBActorQrFlags(flags, owner);
    const release = setPrd01ModelMatrixCache(createModelMatrixCache(modelMatrixFor(flags)), owner);
    const registry = createAuraRuntimeNodeRegistry(snapshot, { flags });
    const handle = registry.require("hero");
    handle.setPosition(0, 0, 0).setRotation(0, 0, 0);
    const canvas = { width: 1280, height: 720 } as HTMLCanvasElement;
    const url = "https://offline-camera-fixture.invalid/hero.glb";
    // The actor loader sees a local byte response only. An unexpected URL
    // throws instead of making a network request.
    vi.stubGlobal("fetch", async (input: string | URL | Request) => {
      const actual = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (actual !== url) throw new Error(`Unexpected offline asset request: ${actual}`);
      return new Response(new Uint8Array(bytes), { status: 200 });
    });
    let actor: TypedGLBActor | undefined;
    try {
      actor = await createTypedGLBActor({
        asset: { ...node.asset, url }, id: "hero", name: node.name,
        runtimeOwner: owner, width: canvas.width, height: canvas.height, shareTextures: false,
        imageDecoder: async (source) => {
          if (!source.data) throw new Error("Character texture is not embedded");
          const { data, info } = await sharp(Buffer.from(source.data)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
          return { width: info.width, height: info.height, data: new Uint8Array(data) };
        }
      });
      const warnings = new Set<string>();
      let items: ReturnType<NonNullable<ReturnType<typeof createProductionRuntimeRendererInput>["source"]["collectRenderItems"]>> = [];
      for (let frame = 0; frame <= 30; frame += 1) {
        const input = createProductionRuntimeRendererInput(snapshot, canvas, [{ node, actor }], [], frame * 1000 / 60,
          registry, warnings, { color: [0, 0, 0], intensity: 0 }, [], undefined, undefined, undefined, owner);
        items = input.source.collectRenderItems?.() ?? [];
      }
      expect([...warnings]).toEqual([]);
      expect(items[0]!.skinning?.jointCount).toBe(65);

      // The historical, unscoped cast demonstrates why the controller must
      // identify the subject even when the look point is outside its bounds.
      const legacyProbe = createCameraProbe({ bounds: () => [{ id: "hero", ...handle.bounds() }] });
      expect(legacyProbe.sphereCast([0, 0.8525, 2.2], [-0.85, 1.55, -2.6], 0.2).node).toBe("hero");
      const legacyRig = createShoulderRig({ target: "hero", collision: true });
      let legacy: AuraCameraPose = {
        position: [0.55, 1.75, -2.8], target: [0, 1.35, 1.1], up: [0, 1, 0],
        roll: 0, fov: 55, near: 0.1, far: 1000
      };
      legacyRig.reset?.(legacy);
      const app = {
        scene: snapshot, nodes: registry, canvas, quality: { tier: "high" }, onFrame: () => () => {}
      } as unknown as AuraApp;
      const controller = createAuraCameraController(app);
      controller.use(createShoulderRig({ target: "hero", collision: true }));
      let fixed = controller.presented();
      for (let frame = 0; frame < 120; frame += 1) {
        legacyProbe.beginFrame();
        legacy = legacyRig.update({
          dt: 1 / 60, time: frame * 1000 / 60, aspect: canvas.width / canvas.height, previous: legacy,
          subject: (ref) => ref === "hero" ? subjectFromHandle(handle) : undefined, probe: legacyProbe
        });
        fixed = controller.update(1 / 60, frame * 1000 / 60);
      }

      let vertices = 0;
      let oldClipped = 0;
      let newClipped = 0;
      for (const item of items) {
        if (!item.skinning) continue;
        const geometry = item.geometry;
        const positions = geometry.getAttributeBuffer("position");
        const joints = geometry.getAttributeBuffer("joints");
        const weights = geometry.getAttributeBuffer("weights");
        for (let vertex = 0; vertex < geometry.vertexBuffer.vertexCount; vertex += 1) {
          const p = positions.getDecodedAttribute(vertex, "position");
          const js = joints.getDecodedAttribute(vertex, "joints");
          const ws = weights.getDecodedAttribute(vertex, "weights");
          const local = [0, 0, 0];
          for (let k = 0; k < 4; k += 1) {
            const offset = js[k]! * 16;
            const matrices = item.skinning.matrices;
            for (let axis = 0; axis < 3; axis += 1) {
              local[axis]! += ws[k]! * (matrices[offset + axis]! * p[0]! + matrices[offset + 4 + axis]! * p[1]! +
                matrices[offset + 8 + axis]! * p[2]! + matrices[offset + 12 + axis]!);
            }
          }
          const matrix = item.modelMatrix!;
          const world = [0, 1, 2].map((axis) => matrix[axis]! * local[0]! + matrix[4 + axis]! * local[1]! +
            matrix[8 + axis]! * local[2]! + matrix[12 + axis]!) as unknown as Vec3;
          if (depth(world, legacy) < legacy.near) oldClipped += 1;
          if (depth(world, fixed) < fixed.near) newClipped += 1;
          vertices += 1;
        }
      }
      expect(vertices).toBeGreaterThan(20_000);
      expect(oldClipped / vertices).toBeGreaterThan(0.9);
      expect(newClipped / vertices).toBeLessThan(0.1);
      expect(fixed.position[2]).toBeLessThan(-2.3);
    } finally {
      actor?.dispose();
      registry.dispose();
      release();
      clearTypedGLBActorQrFlags(owner);
      vi.unstubAllGlobals();
    }
  }, 30_000);
});
