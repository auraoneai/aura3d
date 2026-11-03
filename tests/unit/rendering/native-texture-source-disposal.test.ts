import { describe, expect, it, vi } from "vitest";
import { Texture } from "../../../packages/rendering/src/Texture";
import { texture } from "../../../packages/engine/src/agent-api/nodes/texture";

describe("source-backed texture disposal", () => {
  it("releases a borrowed source after notifying every disposal listener", () => {
    const source = { width: 1, height: 1, close: vi.fn() };
    const resource = new Texture({ width: 1, height: 1, source: source as unknown as TexImageSource, dynamic: true });
    const sourcesDuringDisposal: unknown[] = [];
    const firstListener = vi.fn(() => {
      sourcesDuringDisposal.push(resource.source);
      throw new Error("listener failed");
    });
    const secondListener = vi.fn(() => { sourcesDuringDisposal.push(resource.source); });
    resource.pollContentRevision = vi.fn();
    resource.onDispose(firstListener);
    resource.onDispose(secondListener);

    expect(Object.getOwnPropertyDescriptor(resource, "source")).toMatchObject({
      value: source, writable: true, enumerable: true, configurable: true
    });
    resource.dispose();
    expect(resource.disposed).toBe(true);
    expect(resource.source).toBeNull();
    expect(resource.pollContentRevision).toBeUndefined();
    expect(firstListener).toHaveBeenCalledOnce();
    expect(secondListener).toHaveBeenCalledOnce();
    expect(sourcesDuringDisposal).toEqual([source, source]);
    expect(source.close).not.toHaveBeenCalled();
    expect(Object.getOwnPropertyDescriptor(resource, "source")).toMatchObject({
      value: null, writable: true, enumerable: true, configurable: true
    });
    const lateSources: unknown[] = [];
    resource.onDispose(() => { lateSources.push(resource.source); });
    expect(lateSources).toEqual([null]);

    resource.dispose();
    expect(firstListener).toHaveBeenCalledOnce();
    expect(secondListener).toHaveBeenCalledOnce();
    expect(source.close).not.toHaveBeenCalled();
  });

  it("drops canvas references without changing the caller-owned canvas", () => {
    const canvas = { width: 2, height: 3, remove: vi.fn() };
    const handle = texture.canvas({ canvas });
    expect(handle.texture.source).toBe(canvas);

    handle.dispose();
    expect(handle.texture.source).toBeNull();
    expect(canvas).toMatchObject({ width: 2, height: 3 });
    expect(canvas.remove).not.toHaveBeenCalled();
  });

  it("releases video polling even if its callback was retained, without affecting another borrower", () => {
    let currentTime = 0;
    const readFrame = vi.fn(() => currentTime);
    const video = {
      videoWidth: 1,
      videoHeight: 1,
      readyState: 4,
      get currentTime() { return readFrame(); },
      pause: vi.fn(),
      load: vi.fn(),
      close: vi.fn(),
      src: "caller-owned-video"
    };
    const first = texture.video({ video });
    const second = texture.video({ video });
    const retainedPoll = first.texture.pollContentRevision!;
    retainedPoll();
    const firstRevision = first.texture.revision;
    const readsBeforeDispose = readFrame.mock.calls.length;

    first.dispose();
    expect(first.texture.source).toBeNull();
    expect(first.texture.pollContentRevision).toBeUndefined();
    expect(second.texture.source).toBe(video);
    currentTime = 1;
    retainedPoll();
    expect(readFrame).toHaveBeenCalledTimes(readsBeforeDispose);
    expect(first.texture.revision).toBe(firstRevision);

    second.texture.pollContentRevision!();
    expect(readFrame.mock.calls.length).toBeGreaterThan(readsBeforeDispose);
    expect(second.texture.revision).toBeGreaterThan(0);
    expect(video.pause).not.toHaveBeenCalled();
    expect(video.load).not.toHaveBeenCalled();
    expect(video.close).not.toHaveBeenCalled();
    expect(video.src).toBe("caller-owned-video");

    second.dispose();
    expect(second.texture.source).toBeNull();
    expect(video.pause).not.toHaveBeenCalled();
    expect(video.load).not.toHaveBeenCalled();
    expect(video.close).not.toHaveBeenCalled();
  });
});
