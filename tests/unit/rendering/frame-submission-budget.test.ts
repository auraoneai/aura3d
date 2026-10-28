import { afterEach, describe, expect, it, vi } from "vitest";
import v8 from "node:v8";
import { mountFakeCube, mountFakeScene } from "../../support/fakeWebGl2";
import { WebGL2ContextLifecycle } from "../../../packages/rendering/src/webgl2/ContextLifecycle";

/**
 * Per-frame submission budget for the benchmark cube (direct path, `quality: "auto"`, one PBR box, ambient light), run on a
 * fake WebGL2 context that counts every call. The budgets are the measured cost plus headroom: a change that makes a
 * steady cube frame issue more GL calls, create GPU objects, read the error state every frame, or allocate far more JS
 * objects fails here instead of surfacing as a software-GL timing wobble.
 *
 * (CPU time inside `frame()` is judged on the remote run: tests/browser/frame-cost.spec.ts. This file is the part of that
 * cost that is deterministic: how many calls the frame makes and how much garbage it leaves.)
 */
const SETTLE_FRAMES = 600;
const MEASURED_FRAMES = 100;
/** Bytes allocated per steady frame, including the fake context's own call bookkeeping (about 10 KB). */
const ALLOCATION_BUDGET_BYTES_PER_FRAME = 300_000;

afterEach(() => { vi.unstubAllGlobals(); });

/** Cumulative bytes V8 has allocated (monotonic, unlike heapUsed). Not in older @types/node. */
function allocatedBytes(): number {
  return (v8.getHeapStatistics() as unknown as { total_allocated_bytes: number }).total_allocated_bytes;
}

/** A browser has no `process.env` to scan for flags; an empty one makes the node run match it. */
async function withEmptyEnv<T>(run: () => Promise<T>): Promise<T> {
  const saved = process.env;
  process.env = {} as NodeJS.ProcessEnv;
  try { return await run(); } finally { process.env = saved; }
}

describe("frame submission budget (cube, direct path, fake WebGL2)", { timeout: 120_000 }, () => {
  it("issues a small, fixed set of GL calls per steady frame and creates no GPU objects", async () => {
    await withEmptyEnv(async () => {
      const { frame, calls } = await mountFakeCube("auto");
      for (let i = 0; i < SETTLE_FRAMES; i += 1) frame();
      for (const key of Object.keys(calls)) delete calls[key];
      for (let i = 0; i < MEASURED_FRAMES; i += 1) frame();

      const perFrame = (name: string): number => (calls[name] ?? 0) / MEASURED_FRAMES;
      const total = Object.values(calls).reduce((sum, count) => sum + count, 0) / MEASURED_FRAMES;

      // One draw, no readbacks, no framebuffer churn beyond the default target.
      expect(perFrame("drawElements") + perFrame("drawArrays")).toBe(1);
      expect(perFrame("readPixels")).toBe(0);
      expect(perFrame("bindFramebuffer")).toBeLessThanOrEqual(1);
      expect(perFrame("useProgram")).toBe(1);
      // The per-frame uniform block is a single sub-data upload, bound once.
      expect(perFrame("bufferSubData")).toBeLessThanOrEqual(1);
      expect(perFrame("bindBufferBase")).toBeLessThanOrEqual(1);
      // Uniform uploads: vectors and one sampler index per texture unit.
      const uniformUploads = Object.entries(calls).filter(([name]) => name.startsWith("uniform")).reduce((sum, [, count]) => sum + count, 0) / MEASURED_FRAMES;
      expect(uniformUploads).toBeLessThanOrEqual(14);
      // Nothing that allocates, compiles or re-uploads GPU data happens in a steady frame.
      for (const name of Object.keys(calls)) {
        expect(name, `steady frame called ${name}`).not.toMatch(/^(create|delete|compile|link|shaderSource|attachShader|texImage|texStorage|bufferData|generateMipmap|renderbufferStorage)/);
      }
      // The sampled getError policy reads once per ERROR_SAMPLE_INTERVAL frames after warm-up, never every frame.
      expect(perFrame("getError")).toBeLessThanOrEqual(0.25);
      // Total: 51 calls measured on this fake context (3 texture units more than a real driver, which drops inactive samplers); the budget leaves a little room, not a second frame's worth.
      expect(total).toBeLessThanOrEqual(56);
    });
  });

  it("allocates a bounded amount of JS memory per steady frame", async () => {
    await withEmptyEnv(async () => {
      const { frame } = await mountFakeCube("auto");
      for (let i = 0; i < SETTLE_FRAMES; i += 1) frame();
      const before = allocatedBytes();
      for (let i = 0; i < MEASURED_FRAMES; i += 1) frame();
      const perFrame = (allocatedBytes() - before) / MEASURED_FRAMES;
      expect(perFrame).toBeLessThanOrEqual(ALLOCATION_BUDGET_BYTES_PER_FRAME);
    });
  });

  it("a different scene mounted after the cube compiles the same programs and issues the same calls as in a cold process (no stale memoised key, flags or registry list)", async () => {
    await withEmptyEnv(async () => {
      const lit = (engine: Awaited<ReturnType<typeof mountFakeScene>>["engine"]) => {
        const { camera, lights, material, primitives, scene } = engine;
        return scene()
          .background("#1a2030")
          .camera(camera.perspective({ fov: 50, near: 0.1, far: 100, position: [2, 2, 4], target: [0, 0.5, 0] }))
          .add(lights.hemisphere({ skyColor: "#cfe3ff", groundColor: "#3a2f28", intensity: 0.8 }))
          .add(lights.directional({ position: [4, 6, 3], intensity: 2.4, color: "#fff2dd" }))
          .add(primitives.plane({ name: "floor", size: 10, material: material.pbr({ color: "#7a8a6a", roughness: 0.95 }) }).rotate(-Math.PI / 2, 0, 0))
          .add(primitives.sphere({ name: "ball", material: material.pbr({ color: "#4aa3df", metallic: 0.8, roughness: 0.25, emissive: "#301800" }) }).position(0.4, 0.5, 0.6));
      };
      const run = async (fresh: boolean, warmFirst: boolean) => {
        if (warmFirst) {
          const cube = await mountFakeScene({ freshModules: true });
          for (let i = 0; i < 40; i += 1) cube.frame();
          vi.unstubAllGlobals();
        }
        const mounted = await mountFakeScene({ build: lit, freshModules: fresh });
        for (let i = 0; i < 40; i += 1) mounted.frame();
        vi.unstubAllGlobals();
        return mounted;
      };
      const cold = await run(true, false);
      const warm = await run(false, true);
      // Non-vacuous: the scene needs programs the cube's single program cannot serve.
      const cubeOnly = await mountFakeScene({ freshModules: true });
      for (let i = 0; i < 40; i += 1) cubeOnly.frame();
      vi.unstubAllGlobals();
      expect(cold.programSources.length).toBeGreaterThan(0);
      expect(cold.programSources).not.toEqual(cubeOnly.programSources);
      expect(warm.programSources).toEqual(cold.programSources);
      expect(warm.calls).toEqual(cold.calls);
    });
  });

  it("reads a GL error raised in a steady frame within one sample interval (the sampled getError never hides it)", async () => {
    await withEmptyEnv(async () => {
      const { frame, raiseError, errorPending } = await mountFakeCube("auto");
      for (let i = 0; i < SETTLE_FRAMES; i += 1) frame();
      expect(errorPending()).toBe(false);
      raiseError(0x502);
      let readAfter = -1;
      for (let i = 1; i <= WebGL2ContextLifecycle.ERROR_SAMPLE_INTERVAL && readAfter < 0; i += 1) {
        frame();
        if (!errorPending()) readAfter = i;
      }
      // The fake's queue empties only when the engine calls getError(), so this is the read the policy promises.
      expect(readAfter, "frames until the engine read the raised error").toBeGreaterThan(0);
    });
  });
});
