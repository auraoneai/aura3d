import { describe, expect, it } from "vitest";
import { identityMat4 } from "@aura3d/scene";
import { effects, scene } from "../../../packages/engine/src/public/index";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { realCompilerImpl, type MountSceneCompileContext } from "../../../packages/engine/src/agent-api/compiler/compileScene";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import type { AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types";
import type { RenderSource } from "../../../packages/rendering/src/contracts/renderSource";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import { TemporalHistory, type TemporalFrameOptions } from "../../../packages/rendering/src/TemporalHistory";

function temporalOptions(source: RenderSource): TemporalFrameOptions {
  const postprocess = source.postprocess;
  if (!postprocess || typeof postprocess !== "object" || !postprocess.temporal?.sceneKey) {
    throw new Error("Expected the compiled source to request temporal postprocessing.");
  }
  return postprocess.temporal;
}

describe("compiled temporal scene identity", () => {
  it("keeps history across updates and resets it for a new snapshot or mounted owner", async () => {
    const snapshot = scene().add(effects.motionBlur({ intensity: 0.5 })).toJSON();
    const flags = resolveQrFlags({ options: "compiler" });
    const registry = createAuraRuntimeNodeRegistry(snapshot, { flags });
    const device = new MockRenderDevice();
    setRendererQrFlags({ values: {}, on: (flag: string) => flag === "A3D_QR_POST" }, device);
    const history = new TemporalHistory();
    const makeContext = (): MountSceneCompileContext => ({
      canvas: { width: 64, height: 64 } as HTMLCanvasElement,
      flags, renderer: null, assets: undefined, quality: { tier: "high" }, strict: false,
      runtimeNodes: registry, degrade: () => undefined,
      environmentLighting: () => ({ color: [0, 0, 0], intensity: 0 }),
      collectedLights: [], runtimeWarnings: new Set<string>()
    }) as unknown as MountSceneCompileContext;
    const first = await realCompilerImpl.compile(snapshot, makeContext());
    let second: Awaited<ReturnType<typeof realCompilerImpl.compile>> | undefined;
    const source = (owner: typeof first, current: AuraSceneSnapshot, time: number): RenderSource =>
      realCompilerImpl.update(owner, current, registry, time) as RenderSource;
    const prepare = (options: TemporalFrameOptions, frameId: number) =>
      history.prepare(device, 64, 64, [], Float32Array.from(identityMat4()), { ...options, viewId: "main", frameId });
    try {
      const firstOptions = temporalOptions(source(first, snapshot, 1));
      expect(prepare(firstOptions, 1).historyValid).toBe(false);
      history.commit("main", 1);

      // Each compiler update builds a new live-snapshot wrapper. It still
      // represents the same mounted scene and must retain committed history.
      const nextOptions = temporalOptions(source(first, snapshot, 2));
      expect(nextOptions.sceneKey).toBe(firstOptions.sceneKey);
      expect(prepare(nextOptions, 2).historyValid).toBe(true);
      history.commit("main", 2);

      const replacement: AuraSceneSnapshot = { ...snapshot, background: "#112233" };
      const replacementOptions = temporalOptions(source(first, replacement, 3));
      expect(replacementOptions.sceneKey).not.toBe(firstOptions.sceneKey);
      expect(prepare(replacementOptions, 3).historyValid).toBe(false);
      history.commit("main", 3);

      // A different mounted compiler must not reuse the first owner's key,
      // even when it is given the same original scene snapshot.
      second = await realCompilerImpl.compile(snapshot, makeContext());
      const remountOptions = temporalOptions(source(second, snapshot, 1));
      expect(remountOptions.sceneKey).not.toBe(firstOptions.sceneKey);
      expect(remountOptions.sceneKey).not.toBe(replacementOptions.sceneKey);
      expect(prepare(remountOptions, 4).historyValid).toBe(false);
    } finally {
      second?.dispose();
      first.dispose();
      history.dispose();
      registry.dispose();
      device.dispose();
    }
  });
});
