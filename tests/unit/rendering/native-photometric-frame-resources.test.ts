import { describe, expect, it, vi } from "vitest";

import type { RenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { PhotometricProfileAtlas } from "../../../packages/rendering/src/lighting/PhotometricProfileAtlas";
import { PhotometricFrameResources, type PhotometricFrameIdentity, type PhotometricFramePacket } from "../../../packages/rendering/src/lighting/PhotometricFrameResources";

class FrameDevice {
  readonly kind = "webgpu" as const;
  disposed = false;
  contextLost = false;
  generation = 1;
  activeFrameToken: object | null = null;
  readonly nativeGpuDevice = { queue: { onSubmittedWorkDone: () => Promise.resolve() } };
  readonly listeners = new Set<() => void>();
  readonly fences: { resolve: () => void; reject: () => void }[] = [];
  onDeviceLost = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  waitForSubmittedWork = vi.fn(() => new Promise<void>((resolve, reject) => {
    this.fences.push({ resolve, reject: () => reject(new Error("fence failed")) });
  }));
  begin(): void { this.activeFrameToken = {}; }
  end(): void { this.activeFrameToken = null; }
  lose(): void {
    this.contextLost = true;
    this.activeFrameToken = null;
    for (const listener of [...this.listeners]) listener();
  }
  asDevice(): RenderDevice { return this as unknown as RenderDevice; }
}

function identity(device: FrameDevice, owner: object, viewId: string | number = "left", frameIndex = 1): PhotometricFrameIdentity {
  return { device: device.asDevice(), owner, viewId, frameIndex };
}

function packet(): PhotometricFramePacket & { invalidate(): void; dispose: ReturnType<typeof vi.fn> } {
  const atlas = new PhotometricProfileAtlas([{ id: "light", profile: {
    verticalAngles: [0, 180], horizontalAngles: [0], candela: [20, 10], symmetry: "rotational",
  } }]);
  let current = true;
  return {
    atlas,
    isCurrent: () => current && atlas.isCurrent(),
    invalidate: () => { current = false; },
    dispose: vi.fn(() => atlas.dispose()),
  };
}

describe("photometric frame resources", () => {
  it("rejects native devices without a usable queue fence before adopting an atlas", () => {
    const device = new FrameDevice();
    const owner = {};
    Object.defineProperty(device, "nativeGpuDevice", { value: { queue: {} } });
    const resources = new PhotometricFrameResources(owner, device.asDevice());
    const p = packet();
    device.begin();
    expect(resources.adopt(identity(device, owner), p)).toEqual({ status: "unsupported", reason: "frame-unavailable" });
    expect(resources.retainedBytes).toBe(0);
    expect(p.dispose).not.toHaveBeenCalled();
    p.dispose();
    device.end();
    resources.dispose();
  });

  it("checks WebGL fence capability and rechecks frame state after the probe", async () => {
    const device = new FrameDevice();
    Object.defineProperty(device, "kind", { value: "webgl2" });
    let supported = false;
    Object.assign(device, { supportsSubmittedWorkCompletion: () => supported });
    const owner = {};
    const resources = new PhotometricFrameResources(owner, device.asDevice());
    const p = packet();
    device.begin();
    expect(resources.adopt(identity(device, owner), p)).toEqual({ status: "unsupported", reason: "frame-unavailable" });
    supported = true;
    const accepted = resources.adopt(identity(device, owner), p);
    if (accepted.status !== "ready") throw new Error("expected a lease");
    device.end();
    accepted.lease.finish();
    device.fences[0]!.resolve();
    await Promise.resolve();
    expect(p.dispose).toHaveBeenCalledTimes(1);
    resources.dispose();

    const lostDevice = new FrameDevice();
    Object.defineProperty(lostDevice, "kind", { value: "webgl2" });
    Object.assign(lostDevice, { supportsSubmittedWorkCompletion: () => { lostDevice.lose(); return true; } });
    const lostOwner = {};
    const lostResources = new PhotometricFrameResources(lostOwner, lostDevice.asDevice());
    const lostPacket = packet();
    lostDevice.begin();
    expect(lostResources.adopt(identity(lostDevice, lostOwner), lostPacket)).toEqual({ status: "unsupported", reason: "frame-unavailable" });
    expect(lostPacket.dispose).not.toHaveBeenCalled();
    lostPacket.dispose();
    lostResources.dispose();
  });

  it("isolates ownership and current bindings by renderer, device, view and frame", () => {
    const device = new FrameDevice();
    const otherDevice = new FrameDevice();
    const owner = {};
    const otherOwner = {};
    device.begin();
    otherDevice.begin();
    const resources = new PhotometricFrameResources(owner, device.asDevice());
    const otherResources = new PhotometricFrameResources(otherOwner, device.asDevice());
    const p = packet();
    const frame = identity(device, owner);
    expect(resources.adopt(identity(otherDevice, owner), p)).toEqual({ status: "unsupported", reason: "frame-unavailable" });
    expect(resources.adopt(identity(device, otherOwner), p)).toEqual({ status: "unsupported", reason: "frame-unavailable" });
    const result = resources.adopt(frame, p);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("expected a lease");
    expect(otherResources.adopt(identity(device, otherOwner), p)).toEqual({ status: "unsupported", reason: "packet-owned" });
    expect(result.lease.isCurrent(frame)).toBe(true);
    expect(result.lease.isCurrent(identity(device, owner, "right"))).toBe(false);
    expect(result.lease.isCurrent(identity(device, owner, "left", 2))).toBe(false);
    expect(result.lease.isCurrent(identity(otherDevice, owner))).toBe(false);
    p.invalidate();
    expect(result.lease.isCurrent(frame)).toBe(false);
    device.lose();
    expect(p.dispose).toHaveBeenCalledTimes(1);
    resources.dispose();
    otherResources.dispose();
  });

  it("retains resources through frame end and queue completion and enforces its byte budget", async () => {
    const device = new FrameDevice();
    const owner = {};
    const first = packet();
    const second = packet();
    const bytes = first.atlas.texture.data!.byteLength;
    const resources = new PhotometricFrameResources(owner, device.asDevice(), bytes);
    device.begin();
    const result = resources.adopt(identity(device, owner), first);
    if (result.status !== "ready") throw new Error("expected a lease");
    expect(resources.retainedBytes).toBe(bytes);
    expect(result.lease.finish()).toBe(false);
    expect(device.waitForSubmittedWork).not.toHaveBeenCalled();
    device.end();
    expect(result.lease.finish()).toBe(true);
    expect(result.lease.finish()).toBe(true);
    expect(device.waitForSubmittedWork).toHaveBeenCalledTimes(1);
    expect(first.dispose).not.toHaveBeenCalled();
    device.begin();
    const nextFrame = identity(device, owner, "right", 2);
    expect(resources.adopt(nextFrame, second)).toEqual({ status: "unsupported", reason: "atlas-budget" });
    expect(second.dispose).not.toHaveBeenCalled();
    device.fences[0]!.resolve();
    await Promise.resolve();
    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(resources.retainedBytes).toBe(0);
    const next = resources.adopt(nextFrame, second);
    if (next.status !== "ready") throw new Error("expected a second lease");
    device.end();
    next.lease.finish();
    device.fences[1]!.resolve();
    await Promise.resolve();
    expect(second.dispose).toHaveBeenCalledTimes(1);
    expect(resources.retainedPackets).toBe(0);
    resources.dispose();
    expect(device.listeners.size).toBe(0);
  });

  it("keeps failed fences budgeted until a real loss, without affecting another device", async () => {
    const device = new FrameDevice();
    const otherDevice = new FrameDevice();
    const owner = {};
    const otherOwner = {};
    const p = packet();
    const other = packet();
    const resources = new PhotometricFrameResources(owner, device.asDevice(), p.atlas.texture.data!.byteLength);
    const otherResources = new PhotometricFrameResources(otherOwner, otherDevice.asDevice());
    device.begin();
    otherDevice.begin();
    const first = resources.adopt(identity(device, owner), p);
    const second = otherResources.adopt(identity(otherDevice, otherOwner), other);
    if (first.status !== "ready" || second.status !== "ready") throw new Error("expected leases");
    device.end();
    first.lease.finish();
    device.fences[0]!.reject();
    await Promise.resolve();
    expect(p.dispose).not.toHaveBeenCalled();
    expect(resources.retainedPackets).toBe(1);
    device.lose();
    expect(p.dispose).toHaveBeenCalledTimes(1);
    expect(resources.retainedBytes).toBe(0);
    expect(second.lease.isCurrent(identity(otherDevice, otherOwner))).toBe(true);
    expect(other.dispose).not.toHaveBeenCalled();
    otherDevice.lose();
    expect(other.dispose).toHaveBeenCalledTimes(1);
    resources.dispose();
    otherResources.dispose();
  });

  it("rejects stale packets and keeps rejected packets in the caller's ownership", () => {
    const device = new FrameDevice();
    const owner = {};
    const resources = new PhotometricFrameResources(owner, device.asDevice());
    const p = packet();
    p.invalidate();
    device.begin();
    expect(resources.adopt(identity(device, owner), p)).toEqual({ status: "unsupported", reason: "stale-packet" });
    expect(p.dispose).not.toHaveBeenCalled();
    expect(resources.retainedBytes).toBe(0);
    p.dispose();
    device.end();
    resources.dispose();
  });

  it("releases an in-progress view on loss and ignores later completion or finish", async () => {
    const device = new FrameDevice();
    const owner = {};
    const resources = new PhotometricFrameResources(owner, device.asDevice());
    const left = packet();
    const right = packet();
    device.begin();
    const a = resources.adopt(identity(device, owner, "left"), left);
    const b = resources.adopt(identity(device, owner, "right"), right);
    if (a.status !== "ready" || b.status !== "ready") throw new Error("expected leases");
    device.end();
    a.lease.finish();
    device.begin();
    device.lose();
    expect(left.dispose).toHaveBeenCalledTimes(1);
    expect(right.dispose).toHaveBeenCalledTimes(1);
    expect(b.lease.finish()).toBe(true);
    device.fences[0]!.resolve();
    await Promise.resolve();
    expect(left.dispose).toHaveBeenCalledTimes(1);
    expect(right.dispose).toHaveBeenCalledTimes(1);
    resources.dispose();
    expect(device.listeners.size).toBe(0);
  });
});
