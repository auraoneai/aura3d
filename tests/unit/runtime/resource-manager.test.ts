import { describe, expect, it } from "vitest";
import { createAssetPreloader, createResourceManager, type AuraResourceDescriptor } from "../../../packages/engine/src";

describe("createResourceManager", () => {
  it("preloads resources once, reports cache hits, and disposes records", async () => {
    const disposed: string[] = [];
    let loads = 0;
    const descriptor: AuraResourceDescriptor<ArrayBuffer> = {
      id: "fighter.glb",
      kind: "glb",
      url: "/assets/fighter.glb",
      load: () => {
        loads += 1;
        return new Uint8Array([1, 2, 3, 4]).buffer;
      },
      dispose: (_resource, current) => {
        disposed.push(current.id);
      }
    };
    const manager = createResourceManager();

    const first = await manager.acquire(descriptor);
    const second = await manager.acquire(descriptor);

    expect(first.byteLength).toBe(4);
    expect(second).toBe(first);
    expect(loads).toBe(1);
    expect(manager.evidence).toMatchObject({
      kind: "aura-resource-manager-evidence",
      total: 1,
      ready: 1,
      cacheHits: 1
    });
    expect(manager.record("fighter.glb")).toMatchObject({
      status: "ready",
      refCount: 2,
      loadCount: 1,
      byteSize: 4
    });

    await manager.release("fighter.glb");
    expect(manager.record("fighter.glb")).toMatchObject({ status: "ready", refCount: 1 });
    await manager.release("fighter.glb");

    expect(disposed).toEqual(["fighter.glb"]);
    expect(manager.record("fighter.glb")).toMatchObject({ status: "disposed", refCount: 0 });
  });

  it("keeps structured error evidence for failed loads", async () => {
    const manager = createResourceManager();
    await expect(
      manager.preload({
        id: "missing-audio",
        kind: "audio",
        load: () => {
          throw new Error("404 test fixture");
        }
      })
    ).rejects.toThrow(/404 test fixture/);

    expect(manager.evidence).toMatchObject({
      errors: 1,
      records: [
        {
          id: "missing-audio",
          kind: "audio",
          status: "error",
          error: "404 test fixture"
        }
      ]
    });
  });
});

describe("createAssetPreloader", () => {
  it("preloads mixed asset descriptors and returns readiness evidence", async () => {
    const preloader = createAssetPreloader();
    const result = await preloader.preloadAll([
      { id: "texture", kind: "texture", load: () => "rgba" },
      { id: "metadata", kind: "json", load: () => ({ ok: true }) }
    ]);

    expect(result.ok).toBe(true);
    expect(result.loaded.map((record) => record.id).sort()).toEqual(["metadata", "texture"]);
    expect(result.evidence.ready).toBe(2);

    const disposed = await preloader.disposeAll();
    expect(disposed.disposed).toBe(2);
  });
});
