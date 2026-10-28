import { afterEach, describe, expect, it, vi } from "vitest";
import v8 from "node:v8";
import { mountFakeCube } from "../../support/fakeWebGl2";

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

describe("frame submission budget (cube, direct path, fake WebGL2)", () => {
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

  it("issues the same calls from a cold start as from a second identical app (no stale memoised program or flags)", async () => {
    await withEmptyEnv(async () => {
      const first = await mountFakeCube("auto");
      for (let i = 0; i < 30; i += 1) first.frame();
      const firstCalls = JSON.stringify(first.calls);
      vi.unstubAllGlobals();
      const second = await mountFakeCube("auto");
      for (let i = 0; i < 30; i += 1) second.frame();
      expect(JSON.stringify(second.calls)).toBe(firstCalls);
    });
  });
});
