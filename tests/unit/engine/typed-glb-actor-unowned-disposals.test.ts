// awaitTypedGLBActorDisposals() with no owner drains actors created without a
// runtimeOwner (direct createTypedGLBActor callers), independently of owned apps.
import { createHash, webcrypto } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGLTFFormatAdapter, FormatRegistry } from "../../../packages/assets/src/FormatRegistry";
import { PLYLoader } from "../../../packages/assets/src/loaders/MeshFormatLoaders";
import { clearGlbResourceCache, configureGlbResourceCache, GLB_RESOURCE_CACHE_DEFAULTS } from "../../../packages/engine/src/production-runtime/GlbResourceCache";
import { awaitTypedGLBActorDisposals, createTypedGLBActor } from "../../../packages/engine/src/production-runtime/TypedGLBActor";
import * as rendererSubpath from "../../../packages/engine/src/public/renderer";

const ply = ["ply", "format ascii 1.0", "element vertex 3", "property float x", "property float y", "property float z", "element face 1", "property list uchar int vertex_indices", "end_header", "-1 -1 0", "1 -1 0", "0 1 0", "3 0 1 2", ""].join("\n");
const asset = { url: "https://asset.example/unowned.ply", format: "ply", hash: `sha256-${createHash("sha256").update(ply).digest("hex")}` };

afterEach(() => { clearGlbResourceCache(); configureGlbResourceCache(GLB_RESOURCE_CACHE_DEFAULTS); vi.unstubAllGlobals(); });

/** A PLY adapter whose asynchronous dispose waits on a gate and may fail. */
function gatedRegistry(fail: boolean) {
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const disposing = new Promise<void>((resolve) => { started = resolve; });
  const loader = new PLYLoader(), registry = new FormatRegistry();
  const disposed = vi.fn();
  registry.register(createGLTFFormatAdapter("ply", ["ply"], {
    type: "ply", canLoad: (request) => loader.canLoad(request),
    load: (request, context) => loader.load(request, context),
    async dispose(loaded) {
      started(); await gate; loader.dispose(loaded); disposed();
      if (fail) throw new Error("adapter cleanup failed");
    }
  }));
  return { registry, release, disposing, disposed };
}

function stubNetwork(): void {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(new TextEncoder().encode(ply), { status: 200, headers: { "content-type": "application/octet-stream" } })));
}

describe("ownerless typed GLB actor disposal drain", () => {
  it("is a supported export of @aura3d/engine/renderer", () => {
    expect(rendererSubpath.awaitTypedGLBActorDisposals).toBe(awaitTypedGLBActorDisposals);
  });

  it("waits for ownerless teardown and does not couple to an owner's drain", async () => {
    stubNetwork();
    const unowned = gatedRegistry(false), owned = gatedRegistry(false);
    const owner = {};
    const [loose, app] = await Promise.all([
      createTypedGLBActor({ asset, id: "loose", width: 64, height: 64, formatRegistry: unowned.registry }),
      createTypedGLBActor({ asset, id: "app", width: 64, height: 64, formatRegistry: owned.registry, runtimeOwner: owner })
    ]);
    loose.dispose(); app.dispose();
    await Promise.all([unowned.disposing, owned.disposing]);

    let drained = false;
    const done = awaitTypedGLBActorDisposals().then(() => { drained = true; });
    const ownerDone = awaitTypedGLBActorDisposals(owner);
    owned.release();
    await ownerDone; // The owner drain settles while the ownerless teardown is still gated.
    expect(owned.disposed).toHaveBeenCalledOnce();
    await Promise.resolve();
    expect(drained).toBe(false);
    expect(unowned.disposed).not.toHaveBeenCalled();
    unowned.release();
    await done;
    expect(unowned.disposed).toHaveBeenCalledOnce();
  });

  it("reports an ownerless cleanup failure once, then drains clean", async () => {
    stubNetwork();
    const failing = gatedRegistry(true);
    const actor = await createTypedGLBActor({ asset, id: "loose-failing", width: 64, height: 64, formatRegistry: failing.registry });
    actor.dispose();
    await failing.disposing;
    const done = awaitTypedGLBActorDisposals();
    failing.release();
    await expect(done).rejects.toThrow(/Native model cleanup failed/);
    await expect(awaitTypedGLBActorDisposals()).resolves.toBeUndefined();
  });
});
