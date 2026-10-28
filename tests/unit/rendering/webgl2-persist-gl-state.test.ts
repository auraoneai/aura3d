import { describe, expect, it } from "vitest";
import { WebGL2ContextLifecycle } from "../../../packages/rendering/src/webgl2/ContextLifecycle";
import { WebGL2StateCache } from "../../../packages/rendering/src/WebGL2StateCache";

/**
 * Cuts redundant GL calls (P2): by default `beginFrame` forgets the GL state shadow and re-issues framebuffer, viewport,
 * scissor and depth state every frame (about 30 of the 39 GL calls of a one-cube frame). With `persistGlState` (quality
 * auto / cinematic) the second and later frames issue none of them. A counting mock context stands in for WebGL2.
 */
function makeMockGl() {
  const calls: string[] = [];
  const gl = new Proxy(
    {
      FRAMEBUFFER: 36160, SCISSOR_TEST: 3089, DEPTH_TEST: 2929, LEQUAL: 515, NO_ERROR: 0, drawingBufferWidth: 640, drawingBufferHeight: 360,
      getError: () => 0
    } as Record<string, unknown>,
    {
      get(target, property: string) {
        if (property in target) return target[property];
        return (..._args: unknown[]) => { calls.push(property); return null; };
      }
    }
  ) as unknown as WebGL2RenderingContext;
  return { gl, calls };
}

function makeLifecycle(persist: boolean) {
  const { gl, calls } = makeMockGl();
  const host = {
    gl,
    device: { persistGlState: persist },
    stateCache: new WebGL2StateCache({ label: "test" }),
    samplers: { activeTextureUnitIndex: 0, textureUnitBindings: new Map<number, unknown>() },
    counters: { programCompiles: 0, shaderProgramCreateCount: 0, shadowRenderTargetsAllocated: 0, releasedTextureHandles: 0 },
    renderTargets: new Set<unknown>(),
    buffers: new Set<unknown>(),
    shaders: new Set<unknown>(),
    errorCheckMode: "sampled",
    activeRenderTarget: null,
    disposed: false,
    contextLost: false
  };
  const lifecycle = new WebGL2ContextLifecycle(host as never, { width: 640, height: 360 } as never);
  return { lifecycle, host, calls };
}

describe("persistGlState (redundant GL calls across frames)", () => {
  it("re-issues framebuffer, viewport and scissor state every frame by default", () => {
    const { lifecycle, calls } = makeLifecycle(false);
    lifecycle.beginFrame(640, 360);
    lifecycle.endFrame();
    const firstFrame = calls.length;
    calls.length = 0;
    lifecycle.beginFrame(640, 360);
    lifecycle.endFrame();
    expect(firstFrame).toBeGreaterThan(0);
    expect(calls.length).toBe(firstFrame);
    expect(calls).toContain("viewport");
  });

  it("issues none of them again on the second frame when the state persists", () => {
    const { lifecycle, calls } = makeLifecycle(true);
    lifecycle.beginFrame(640, 360);
    lifecycle.endFrame();
    expect(calls.length).toBeGreaterThan(0);
    calls.length = 0;
    lifecycle.beginFrame(640, 360);
    lifecycle.endFrame();
    expect(calls).toEqual([]);
  });

  it("still re-issues state after something invalidated the cache", () => {
    const { lifecycle, host, calls } = makeLifecycle(true);
    lifecycle.beginFrame(640, 360);
    lifecycle.endFrame();
    calls.length = 0;
    host.stateCache.invalidate(); // what every raw-GL site does when it leaves the cached state behind
    lifecycle.beginFrame(640, 360);
    lifecycle.endFrame();
    expect(calls).toContain("viewport");
    expect(calls).toContain("bindFramebuffer");
  });

  it("re-issues the viewport when the frame size changes", () => {
    const { lifecycle, calls } = makeLifecycle(true);
    lifecycle.beginFrame(640, 360);
    lifecycle.endFrame();
    calls.length = 0;
    lifecycle.beginFrame(800, 450);
    lifecycle.endFrame();
    expect(calls).toContain("viewport");
  });
});
