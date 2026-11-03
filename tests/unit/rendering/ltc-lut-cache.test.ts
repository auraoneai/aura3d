import { describe, expect, it, vi } from "vitest";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { fetchLtcLutTextures, LTC_LUT_SIZE } from "../../../packages/rendering/src/probes/LtcLuts";

function validTable(): Float32Array {
  return new Float32Array(LTC_LUT_SIZE * LTC_LUT_SIZE * 4).fill(0.5);
}

describe("rectangle-light LUT cache", () => {
  it("installs the pending entry before invoking a reentrant loader", async () => {
    const device = new MockRenderDevice();
    const table = validTable();
    const reentrant: Promise<unknown>[] = [];
    const fetch = vi.fn((_name: "mInv" | "fresnel") => {
      reentrant.push(fetchLtcLutTextures(device));
      return Promise.resolve(table);
    });

    const first = fetchLtcLutTextures(device, { fetch });
    expect(fetch).not.toHaveBeenCalled();
    expect(fetchLtcLutTextures(device)).toBe(first);

    const textures = await first;
    expect(fetch.mock.calls.map(([name]) => name)).toEqual(["mInv", "fresnel"]);
    expect(reentrant).toHaveLength(2);
    for (const pending of reentrant) expect(pending).toBe(first);
    expect(await fetchLtcLutTextures(device)).toBe(textures);
    textures.mInv.dispose();
    textures.fresnel.dispose();
    device.dispose();
  });

  it.each(["synchronous throw", "rejected promise"])(
    "evicts a loader's %s so the next request can retry",
    async (mode) => {
      const device = new MockRenderDevice();
      const error = new Error(mode);
      const failing = vi.fn((): Promise<Float32Array> => {
        if (mode === "synchronous throw") throw error;
        return Promise.reject(error);
      });
      const first = fetchLtcLutTextures(device, { fetch: failing });
      expect(fetchLtcLutTextures(device)).toBe(first);
      await expect(first).rejects.toBe(error);

      const table = validTable();
      const retry = vi.fn(() => Promise.resolve(table));
      const next = fetchLtcLutTextures(device, { fetch: retry });
      expect(next).not.toBe(first);
      const textures = await next;
      expect(retry).toHaveBeenCalledTimes(2);
      textures.mInv.dispose();
      textures.fresnel.dispose();
      device.dispose();
    }
  );
});
