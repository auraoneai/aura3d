import { describe, expect, it, vi } from "vitest";
import { identityMat4 } from "@aura3d/scene";
import { Renderer, type RendererPostProcessOptions } from "../../../packages/rendering/src/Renderer";
import { ForwardPass, type ForwardPassOptions } from "../../../packages/rendering/src/ForwardPass";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { registerFrameContributor } from "../../../packages/rendering/src/contracts/frameGraph";

describe("authored frame clock", () => {
  it.each([false, true])("shares seconds across forward, shadows, contributors and post (async=%s)", async asynchronous => {
    let ticks = 1000;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => ++ticks);
    const flags = { values: { A3D_QR_POST: true }, on: (name: string) => name === "A3D_QR_POST" };
    const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8, qrFlags: flags });
    const observed: Record<string, number[]> = { forward: [], shadow: [], contributor: [], post: [] };
    const contributorFrames: number[] = [];
    const contributorScopes: (object | undefined)[] = [], contributorTaa: (boolean | undefined)[] = [];
    const unregister = registerFrameContributor({ id: "prd03.clock-test", owner: "prd03", flag: "A3D_QR_POST", phases: ["collect"],
      collect: (items, ctx) => { observed.contributor!.push(ctx.timeSeconds); contributorFrames.push(ctx.frameIndex); contributorScopes.push(ctx.postScopeId); contributorTaa.push(ctx.temporalAntialiasing); return items; } });
    const originalForward = ForwardPass.prototype.execute;
    const forward = vi.spyOn(ForwardPass.prototype, "execute").mockImplementation(function (this: ForwardPass, context) {
      observed.forward!.push((this as unknown as { options: ForwardPassOptions }).options.timeSeconds!);
      return originalForward.call(this, context);
    });
    const internals = renderer as unknown as {
      executeRendererShadowMap(options: { timeSeconds?: number }): undefined;
      executePostprocess(options: RendererPostProcessOptions): void;
      executePostprocessAsync(options: RendererPostProcessOptions): Promise<void>;
    };
    const shadow = vi.spyOn(internals, "executeRendererShadowMap").mockImplementation(options => { observed.shadow!.push(options.timeSeconds!); return undefined; });
    const post = vi.spyOn(internals, "executePostprocess").mockImplementation(options => { observed.post!.push(options.postFrameContext!.timeSeconds!); });
    const postAsync = vi.spyOn(internals, "executePostprocessAsync").mockImplementation(async options => { observed.post!.push(options.postFrameContext!.timeSeconds!); });
    const geometry = Geometry.triangle();
    const source = { cameraPolicy: "identity" as const, renderItems: [{ geometry, modelMatrix: identityMat4() }],
      postprocess: { sampleCount: 1, toneMapping: { operator: "linear" as const } } };
    const render = async (frameId: number, multiView = false) => {
      for (const values of Object.values(observed)) values.length = 0;
      contributorFrames.length = 0;
      contributorScopes.length = 0;
      contributorTaa.length = 0;
      const camera = { viewMatrix: identityMat4(), projectionMatrix: identityMat4() };
      const views = multiView ? [
        { id: "left", camera, viewport: { x: 0, y: 0, width: 4, height: 8 } },
        { id: "right", camera, viewport: { x: 4, y: 0, width: 4, height: 8 } }
      ] : undefined;
      if (asynchronous) await renderer.renderAsync({ source, frameId, views }); else renderer.render({ source, frameId, views });
      const times = Object.values(observed);
      for (const values of times) expect(values.length).toBeGreaterThan(0);
      if (multiView) expect(observed.post).toHaveLength(2);
      expect(contributorFrames).toEqual(Array(multiView ? 2 : 1).fill(frameId));
      expect(contributorScopes).toEqual(Array(multiView ? 2 : 1).fill(renderer.postScopeId()));
      expect(contributorTaa).toEqual(Array(multiView ? 2 : 1).fill(false));
      const sample = times[0]![0]!;
      expect(Number.isFinite(sample)).toBe(true);
      for (const value of times.flat()) expect(value).toBe(sample);
      return sample;
    };
    try {
      const first = await render(41);
      expect(await render(41, true)).toBe(first);
      expect(await render(42)).toBeGreaterThan(first);
    } finally {
      unregister(); forward.mockRestore(); shadow.mockRestore(); post.mockRestore(); postAsync.mockRestore(); clock.mockRestore();
      renderer.dispose(); geometry.dispose();
    }
  });

});
