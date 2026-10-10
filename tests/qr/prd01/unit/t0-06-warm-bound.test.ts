/**
 * T0-06 (§403): per-frame bound on synchronous program compiles and
 * `programsCompiledSinceReady` accounting.
 */
import { describe, expect, it } from "vitest";
import { ProgramCache } from "../../../../packages/rendering/src/program/ProgramCache";
import { normalizeProgramFeatures } from "../../../../packages/rendering/src/program/ProgramFeatures";
import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";
import type { ProgramFeatures } from "../../../../packages/rendering/src/contracts/program";

const features = (dir: 0 | 1 | 2 | 4 | 8): ProgramFeatures =>
  normalizeProgramFeatures({
    lighting: "lit",
    pass: "forward",
    lights: { dir, point: 0, spot: 0, rect: 0, clustered: false, hemisphere: false }
  });

describe("T0-06 per-frame sync-compile bound", () => {
  it("leaves entries pending once the frame bound is exhausted, retries next frame", () => {
    const device = new MockRenderDevice();
    const cache = new ProgramCache(device, { maxSyncCompilesPerFrame: 2, parallelCompile: false });

    expect(cache.acquire(features(1)).status).toBe("ready");
    expect(cache.acquire(features(2)).status).toBe("ready");
    // Third distinct program exceeds the bound: pending, no compile.
    const third = cache.acquire(features(4));
    expect(third.status).toBe("pending");
    expect(third.program).toBeUndefined();
    expect(cache.stats().pending).toBe(1);

    // Same frame: still bounded (acquire does not compile).
    expect(cache.acquire(features(8)).status).toBe("pending");

    cache.beginFrame();
    // Next frame: fresh budget — both pending entries compile on acquire.
    expect(cache.acquire(features(4)).status).toBe("ready");
    expect(cache.acquire(features(8)).status).toBe("ready");
    expect(cache.stats().compiled).toBe(4);
  });

  it("counts compiledSinceReady only after markReady", () => {
    const device = new MockRenderDevice();
    const cache = new ProgramCache(device, { parallelCompile: false });

    cache.acquire(features(1));
    expect(cache.stats().compiledSinceReady).toBe(0);

    cache.markReady();
    cache.acquire(features(2));
    cache.beginFrame();
    cache.acquire(features(4));
    expect(cache.stats().compiledSinceReady).toBe(2);
    expect(cache.stats().compiled).toBe(3);
  });
});
