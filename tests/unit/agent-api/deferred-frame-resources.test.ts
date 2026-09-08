import { describe, expect, it, vi } from "vitest";
import { Texture } from "../../../packages/rendering/src/Texture";
import { DeferredFrameResources } from "../../../packages/engine/src/agent-api/DeferredFrameResources";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function resources() {
  let texture = new Texture({ width: 1, height: 1, data: new Uint8Array([23, 45, 67, 255]) });
  const original = texture;
  const release = vi.fn(() => texture.dispose());
  const resize = vi.fn(() => {
    texture.dispose();
    texture = new Texture({ width: 2, height: 2 });
  });
  const owner = new DeferredFrameResources(release, resize);
  const readSubmittedTexture = () => {
    if (original.disposed) throw new Error("native submission accessed a freed texture");
    if (texture !== original) throw new Error("native submission accessed reallocated frame resources");
    return [...original.data!];
  };
  return { owner, original, release, resize, readSubmittedTexture, current: () => texture };
}

describe("production asynchronous frame resource ownership", () => {
  it("keeps submitted texture storage alive through delayed native work and defers resize until it completes", async () => {
    const state = resources();
    const native = deferred();
    const pending = state.owner.run(async () => {
      const before = state.readSubmittedTexture();
      await native.promise;
      expect(state.readSubmittedTexture()).toEqual(before);
      return before;
    });
    state.owner.requestResize();
    state.owner.requestResize();
    expect(state.current()).toBe(state.original);
    expect(state.original.disposed).toBe(false);
    expect(state.resize).not.toHaveBeenCalled();
    native.resolve();
    expect(await pending).toEqual([23, 45, 67, 255]);
    expect(state.original.disposed).toBe(true);
    expect(state.current().width).toBe(2);
    expect(state.resize).toHaveBeenCalledOnce();
    state.owner.dispose();
  });

  it("disposal wins over resize and preserves resources through all previously submitted work", async () => {
    const state = resources();
    const first = deferred(), second = deferred();
    const a = state.owner.run(async () => { await first.promise; return state.readSubmittedTexture(); });
    const b = state.owner.run(async () => { await second.promise; return state.readSubmittedTexture(); });
    state.owner.requestResize();
    state.owner.dispose();
    state.owner.dispose();
    const forbidden = vi.fn(async () => state.readSubmittedTexture());
    await expect(state.owner.run(forbidden)).rejects.toThrow(/disposed/);
    expect(forbidden).not.toHaveBeenCalled();
    first.resolve();
    await a;
    expect(state.original.disposed).toBe(false);
    expect(state.release).not.toHaveBeenCalled();
    second.resolve();
    expect(await b).toEqual([23, 45, 67, 255]);
    expect(state.original.disposed).toBe(true);
    expect(state.release).toHaveBeenCalledOnce();
    expect(state.resize).not.toHaveBeenCalled();
    expect(() => state.readSubmittedTexture()).toThrow(/freed texture/);
  });

  it("releases on delayed native rejection without masking the error or leaking held resources", async () => {
    const state = resources();
    const native = deferred();
    const error = new Error("GPU submission rejected");
    const pending = state.owner.run(async () => { state.readSubmittedTexture(); await native.promise; });
    const rejected = expect(pending).rejects.toBe(error);
    state.owner.dispose();
    expect(state.original.disposed).toBe(false);
    native.reject(error);
    await rejected;
    expect(state.original.disposed).toBe(true);
    expect(state.release).toHaveBeenCalledOnce();
  });

  it("recovers ownership after a failed frame when disposal was not requested", async () => {
    const state = resources();
    await expect(state.owner.run(async () => { throw new Error("capture failed"); })).rejects.toThrow("capture failed");
    expect(await state.owner.run(async () => state.readSubmittedTexture())).toEqual([23, 45, 67, 255]);
    expect(state.original.disposed).toBe(false);
    state.owner.dispose();
    expect(state.original.disposed).toBe(true);
  });
});
