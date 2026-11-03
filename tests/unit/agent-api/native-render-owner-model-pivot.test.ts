import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@aura3d/engine";
import { Renderer } from "@aura3d/rendering";
import { compileScene } from "../../../packages/engine/src/contracts/compiler";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { CompiledSceneImpl, type MountSceneCompileContext } from "../../../packages/engine/src/agent-api/compiler/compileScene";
import { createProductionRuntimeSceneRenderer } from "../../../packages/engine/src/agent-api/compiler/renderer";
import { setPrd01ModelMatrixCache } from "../../../packages/engine/src/agent-api/compiler/renderInput";
import { modelMatrixFor } from "../../../packages/engine/src/agent-api/compiler/sceneGraph";
import { createModelMatrixCache } from "../../../packages/engine/src/agent-api/sceneGraph";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import type { AuraModelNode, AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types";

const createActor = vi.hoisted(() => vi.fn());
vi.mock("../../../packages/engine/src/production-runtime/TypedGLBActor", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../../packages/engine/src/production-runtime/TypedGLBActor")>(),
  createTypedGLBActor: createActor
}));

const model = (): AuraModelNode => ({
  kind: "model", name: "pivot", runtime: { id: "pivot" },
  asset: { kind: "aura-asset-ref", id: "pivot", type: "model", format: "glb", url: "/pivot.glb", hash: `sha256-${"1".repeat(64)}` } as AuraModelNode["asset"],
  scaleMode: "world", visible: true, castShadow: true, receiveShadow: true,
  pivot: [1, 0, 0], quaternion: [0, Math.SQRT1_2, 0, Math.SQRT1_2]
});
const snapshot = (): AuraSceneSnapshot => ({ ...scene().toJSON(), nodes: [model()] });
const cache = () => createModelMatrixCache(modelMatrixFor(true));
const actor = () => ({
  id: "pivot", dispose: vi.fn(), collectRenderItems: vi.fn(() => []),
  pipeline: { asset: { skins: [] }, metadata: {
    meshCount: 1, primitiveCount: 1, materialCount: 1, textureCount: 0, imageCount: 0,
    animationCount: 0, skinCount: 0, morphTargetCount: 0, extensionsUsed: []
  } }
});
const target = () => ({ width: 64, height: 64 }) as HTMLCanvasElement;

beforeEach(() => { createActor.mockReset(); });
afterEach(() => { vi.restoreAllMocks(); });

describe("model pivot admission uses the registered owner", () => {
  it.each([false, true])("legacy mount ignores the opposite canvas cache (owner core=%s)", async (core) => {
    const canvas = target(), owner = {}, fake = actor();
    const releaseCanvas = setPrd01ModelMatrixCache(core ? null : cache(), canvas);
    const releaseOwner = setPrd01ModelMatrixCache(core ? cache() : null, owner);
    const flags = resolveQrFlags({ options: { A3D_QR_CORE: core, A3D_QR_COMPILER: false }, env: {} });
    createActor.mockResolvedValue(fake);
    vi.spyOn(Renderer, "create").mockRejectedValue(new Error("DEVICE_REACHED"));
    try {
      const mount = createProductionRuntimeSceneRenderer(canvas, snapshot(), { backend: "webgl2" },
        undefined, flags, undefined, undefined, { runtimeOwner: owner });
      await expect(mount).rejects.toThrow(core ? /DEVICE_REACHED/ : /PIVOT_UNSUPPORTED_LEGACY_ROTATION/);
      expect(createActor).toHaveBeenCalledTimes(core ? 1 : 0);
      if (core) expect(fake.dispose).toHaveBeenCalledOnce();
    } finally { releaseOwner(); releaseCanvas(); }
  });

  it.each([false, true])("compiled initial and dynamic model admission use the owner (core=%s)", async (core) => {
    const canvas = target(), owner = {}, fake = actor();
    const releaseCanvas = setPrd01ModelMatrixCache(core ? null : cache(), canvas);
    const releaseOwner = setPrd01ModelMatrixCache(core ? cache() : null, owner);
    const flags = resolveQrFlags({ options: { A3D_QR_CORE: core, A3D_QR_COMPILER: true }, env: {} });
    const context = {
      renderer: undefined, assets: undefined, quality: { tier: "high" }, strict: true,
      flags, degrade: vi.fn(), canvas, runtimeOwner: owner, environmentLighting: () => ({}),
      collectedLights: [], runtimeWarnings: new Set<string>()
    } as unknown as MountSceneCompileContext;
    createActor.mockResolvedValue(fake);
    let compiled: Awaited<ReturnType<typeof compileScene>> | undefined;
    const dynamic = new CompiledSceneImpl(0, null, [], new Set(), [], [], [], [], context, [], []);
    try {
      if (core) {
        compiled = await compileScene(snapshot(), context);
        expect(createActor).toHaveBeenCalledTimes(1);
        dynamic.addSubtree(model());
        await vi.waitFor(() => expect(dynamic.actorEntries).toHaveLength(1));
        expect(context.runtimeWarnings.size).toBe(0);
      } else {
        await expect(compileScene(snapshot(), context)).rejects.toThrow(/PIVOT_UNSUPPORTED_LEGACY_ROTATION/);
        expect(() => dynamic.addSubtree(model())).toThrow(/PIVOT_UNSUPPORTED_LEGACY_ROTATION/);
        expect(createActor).not.toHaveBeenCalled();
      }
    } finally {
      dynamic.dispose();
      compiled?.dispose();
      releaseOwner();
      releaseCanvas();
    }
  });
});
