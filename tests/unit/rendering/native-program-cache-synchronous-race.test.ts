import { afterEach, describe, expect, it, vi } from "vitest";
import { MockRenderDevice, type RenderShaderProgram, type ShaderSources } from "../../../packages/rendering/src/RenderDevice";
import type { ProgramHandle } from "../../../packages/rendering/src/contracts/program";
import { ProgramCache } from "../../../packages/rendering/src/program/ProgramCache";
import { normalizeProgramFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";

const features = normalizeProgramFeatures({ lighting: "unlit" });

class RacingDevice extends MockRenderDevice {
  generation = 1;
  readonly listeners = new Set<() => void>();
  readonly programs: RenderShaderProgram[] = [];
  duringCreate?: () => void;

  onDeviceLost(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  lose(): void {
    this.contextLost = true;
    for (const listener of [...this.listeners]) listener();
  }

  override createShaderProgram(sources: ShaderSources): RenderShaderProgram {
    const result = super.createShaderProgram(sources);
    this.programs.push(result);
    const action = this.duringCreate;
    this.duringCreate = undefined;
    action?.();
    return result;
  }
}

afterEach(() => { vi.restoreAllMocks(); });

describe("synchronous program compilation lifecycle", () => {
  it("keeps the held entry failed and disposes the stale result on loss, then retries after restoration", () => {
    const device = new RacingDevice();
    const degradation = vi.fn();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const cache = new ProgramCache(device, { parallelCompile: false, onDegradation: degradation });
    let nested: ProgramHandle | undefined;
    try {
      cache.markReady();
      device.duringCreate = () => {
        nested = cache.acquire(features);
        expect(nested.status).toBe("pending");
        device.lose();
      };
      const held = cache.acquire(features);
      expect(held).toBe(nested);
      expect(held).toMatchObject({ status: "failed", error: "DEVICE_LOST" });
      expect(held.program).toBeUndefined();
      expect(device.programs).toHaveLength(1);
      expect(device.programs[0]!.disposed).toBe(true);
      expect(cache.stats()).toMatchObject({ compiled: 0, pending: 0, failed: 0, compiledSinceReady: 0 });
      expect(degradation).not.toHaveBeenCalled();
      expect(errors).not.toHaveBeenCalled();
      device.contextLost = false;
      const restored = cache.acquire(features);
      expect(restored.status).toBe("ready");
      expect(restored.program).toBe(device.programs[1]);
      expect(restored.program!.disposed).toBe(false);
      expect(cache.stats()).toMatchObject({ compiled: 1, compiledSinceReady: 1 });
    } finally { cache.dispose(); device.dispose(); }
  });

  it("does not resurrect a disposed cache or change the held disposal error", async () => {
    const device = new RacingDevice();
    const cache = new ProgramCache(device, { parallelCompile: false });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    let nested: ProgramHandle | undefined;
    try {
      device.duringCreate = () => { nested = cache.acquire(features); cache.dispose(); };
      await expect(cache.precompile([features])).rejects.toMatchObject({ code: "DISPOSED_PROGRAM_CACHE" });
      expect(nested).toMatchObject({ status: "failed", error: "DISPOSED_PROGRAM_CACHE" });
      expect(nested!.program).toBeUndefined();
      expect(device.programs[0]!.disposed).toBe(true);
      expect(cache.keys()).toEqual([]);
      expect(errors).not.toHaveBeenCalled();
      expect(() => cache.acquire(features)).toThrow(/disposed/i);
    } finally { cache.dispose(); device.dispose(); }
  });

  it("preserves a newly acquired generation when an older create returns afterward", () => {
    const device = new RacingDevice();
    const cache = new ProgramCache(device, { parallelCompile: false });
    let replacement: ProgramHandle | undefined;
    try {
      device.duringCreate = () => { device.generation += 1; replacement = cache.acquire(features); };
      const stale = cache.acquire(features);
      expect(stale).toMatchObject({ status: "failed", error: "DEVICE_LOST" });
      expect(stale.program).toBeUndefined();
      expect(device.programs[0]!.disposed).toBe(true);
      expect(replacement!.status).toBe("ready");
      expect(replacement!.program).toBe(device.programs[1]);
      expect(replacement!.program!.disposed).toBe(false);
      expect(cache.acquire(features)).toBe(replacement);
      expect(cache.stats()).toMatchObject({ compiled: 1, pending: 0, failed: 0 });
    } finally { cache.dispose(); device.dispose(); }
  });

  it("shares an in-progress synchronous entry with a reentrant acquire", () => {
    const device = new RacingDevice();
    const cache = new ProgramCache(device, { parallelCompile: false });
    let nested: ProgramHandle | undefined;
    try {
      device.duringCreate = () => { nested = cache.acquire(features); };
      const outer = cache.acquire(features);
      expect(nested).toBe(outer);
      expect(outer.status).toBe("ready");
      expect(device.programs).toHaveLength(1);
      expect(cache.stats()).toMatchObject({ compiled: 1, pending: 0, failed: 0 });
      expect(cache.reused).toBe(1);
    } finally { cache.dispose(); device.dispose(); }
  });

  it("reports a genuine compile failure and allows retry after a loss error", () => {
    const device = new RacingDevice();
    const degradation = vi.fn();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const cache = new ProgramCache(device, { parallelCompile: false, onDegradation: degradation });
    try {
      const create = vi.spyOn(device, "createShaderProgram");
      create.mockImplementationOnce(() => { throw Object.assign(new Error("lost during compile"), { code: "DEVICE_LOST" }); });
      const lost = cache.acquire(features);
      expect(lost).toMatchObject({ status: "failed", error: "DEVICE_LOST" });
      expect(cache.keys()).toEqual([]);
      expect(degradation).not.toHaveBeenCalled();
      create.mockImplementationOnce(() => { throw new Error("real shader failure"); });
      const failed = cache.acquire(features);
      expect(failed).toMatchObject({ status: "failed", error: "real shader failure" });
      expect(degradation).toHaveBeenCalledOnce();
      expect(errors).toHaveBeenCalledOnce();
      expect(cache.acquire(features)).toBe(failed);
      expect(degradation).toHaveBeenCalledOnce();
    } finally { cache.dispose(); device.dispose(); }
  });
});
