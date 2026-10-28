import { describe, expect, it } from "vitest";
import { WebGL2ContextLifecycle } from "../../../packages/rendering/src/webgl2/ContextLifecycle";

/**
 * The `sampled` contract (default): read the GL error on the first frames, on any frame in which a GPU resource or
 * program was created or released, every ERROR_SAMPLE_INTERVAL frames, and on every frame while an error is
 * outstanding. `frame` and `strict` keep reading every frame.
 */
function makeLifecycle(mode: "sampled" | "frame" | "strict") {
  let reads = 0;
  let pending = 0;
  const host = {
    errorCheckMode: mode,
    disposed: false,
    contextLost: false,
    gl: { NO_ERROR: 0, getError: () => { reads += 1; const code = pending; pending = 0; return code; } },
    counters: { programCompiles: 0, shaderProgramCreateCount: 0, shadowRenderTargetsAllocated: 0, releasedTextureHandles: 0 },
    renderTargets: new Set<unknown>(),
    buffers: new Set<unknown>(),
    shaders: new Set<unknown>()
  };
  const life = new WebGL2ContextLifecycle(host as never, {} as never);
  const frame = (): void => { life.frameActive = true; life.endFrame(); };
  return { host, life, frame, reads: () => reads, raise: (code: number) => { pending = code; } };
}

describe("WebGL2 sampled frame-error policy", () => {
  it("reads every frame while warming up, then only on every Nth frame", () => {
    const { frame, reads } = makeLifecycle("sampled");
    for (let i = 0; i < WebGL2ContextLifecycle.ERROR_WARMUP_FRAMES; i += 1) frame();
    expect(reads()).toBe(WebGL2ContextLifecycle.ERROR_WARMUP_FRAMES);
    const before = reads();
    const steady = 240;
    for (let i = 0; i < steady; i += 1) frame();
    const sampled = reads() - before;
    expect(sampled).toBeGreaterThan(0);
    expect(sampled).toBeLessThanOrEqual(Math.ceil(steady / WebGL2ContextLifecycle.ERROR_SAMPLE_INTERVAL) + 1);
  });

  it("reads on a frame in which a resource or program was created, and while an error is outstanding", () => {
    const { host, frame, reads, raise, life } = makeLifecycle("sampled");
    for (let i = 0; i < WebGL2ContextLifecycle.ERROR_WARMUP_FRAMES + 1; i += 1) frame();
    const quiet = reads();
    frame();
    expect(reads()).toBe(quiet); // an ordinary frame is not read
    host.counters.programCompiles += 1; // a program compiled this frame
    frame();
    expect(reads()).toBe(quiet + 1);
    raise(0x502); // an invalid-operation error is found by the next read
    host.renderTargets.add({});
    frame();
    expect(life.lastError).toBe("0x502");
    const afterError = reads();
    frame();
    expect(reads()).toBe(afterError + 1); // outstanding error: keep reading until it clears
    frame();
    frame();
    expect(life.lastError).toBeNull();
  });

  it("frame and strict modes read every frame", () => {
    for (const mode of ["frame", "strict"] as const) {
      const { frame, reads } = makeLifecycle(mode);
      for (let i = 0; i < 300; i += 1) frame();
      expect(reads()).toBe(300);
    }
  });
});
