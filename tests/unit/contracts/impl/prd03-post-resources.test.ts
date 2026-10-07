import { describe, expect, it } from "vitest";
import { resolveQrFlags } from "@aura3d/engine/contracts";
import { PostResources } from "../../../../packages/rendering/src/post/PostResources";
import type { RenderDevice, RenderTarget } from "../../../../packages/rendering/src/RenderDevice";

/**
 * PRD-03 Phase 2 / C-28: the post resource pool keys targets by
 * (w,h,format,samples,depth) and reuses them across frames, so under the
 * allocate-per-acquire stub the underlying allocation count stays constant
 * across a 100-frame loop.
 */

let created = 0;
let disposed = 0;

function fakeDevice(): RenderDevice {
  return {
    createRenderTarget(desc: { width: number; height: number; format: string; samples?: number; depth?: boolean }) {
      created += 1;
      return {
        id: `rt-${created}`,
        width: desc.width,
        height: desc.height,
        sampleCount: desc.samples ?? 1,
        colorTexture: { format: desc.format },
        disposed: false,
        dispose() { disposed += 1; }
      } as unknown as RenderTarget;
    }
  } as unknown as RenderDevice;
}

const flags = resolveQrFlags({ options: ["post"] });

describe("post/PostResources (PRD-03 Phase 2, C-28)", () => {
  it("allocation count is constant across 100 frames of acquire/releaseAll", () => {
    created = 0; disposed = 0;
    const resources = new PostResources(fakeDevice(), flags);
    const key = { width: 640, height: 360, format: "rgba16f", samples: 1 as const, depth: false };
    for (let frame = 0; frame < 100; frame += 1) {
      resources.acquire(key);
      resources.releaseAll();
    }
    // One underlying allocation total — every frame after the first reuses.
    expect(resources.allocationCount).toBe(1);
    expect(created).toBe(1);
    resources.dispose();
    expect(disposed).toBe(1);
  });

  it("distinct keys allocate independently; same key reuses", () => {
    created = 0;
    const resources = new PostResources(fakeDevice(), flags);
    const a = resources.acquire({ width: 640, height: 360, format: "rgba16f", samples: 1, depth: false });
    const b = resources.acquire({ width: 320, height: 180, format: "rgba16f", samples: 1, depth: false });
    expect(created).toBe(2);
    resources.release(a); resources.release(b);
    const a2 = resources.acquire({ width: 640, height: 360, format: "rgba16f", samples: 1, depth: false });
    expect(a2).toBe(a);
    expect(created).toBe(2);
    resources.dispose();
  });

  it("resize releases every target whose dimensions no longer match", () => {
    created = 0; disposed = 0;
    const resources = new PostResources(fakeDevice(), flags);
    const small = resources.acquire({ width: 160, height: 90, format: "rgba16f", samples: 1, depth: false });
    const full = resources.acquire({ width: 640, height: 360, format: "rgba16f", samples: 1, depth: false });
    resources.release(small); resources.release(full);
    resources.resize(640, 360);
    expect(disposed).toBe(1); // the 160×90 entry was released
    const again = resources.acquire({ width: 640, height: 360, format: "rgba16f", samples: 1, depth: false });
    expect(again).toBe(full); // full-res survives
    resources.dispose();
  });
});
