import type { RenderDevice } from "../RenderDevice";
import type { PhotometricProfileAtlas } from "./PhotometricProfileAtlas";

/** A view-specific request which could not use its profile on a draw. */
export interface PhotometricProfileIssue {
  readonly reason: string;
  readonly message: string;
  readonly viewId: string | number;
  readonly frameIndex: number;
}

/** The renderer supplies the same scope and view identity used by its frame. */
export interface PhotometricFrameIdentity {
  readonly device: RenderDevice;
  readonly owner: object;
  readonly viewId: string | number;
  readonly frameIndex: number;
}

/** The ready binding packet retains ownership until `adopt` succeeds. */
export interface PhotometricFramePacket {
  readonly atlas: PhotometricProfileAtlas;
  isCurrent(): boolean;
  dispose(): void;
}

export type PhotometricFrameAdoption =
  | { readonly status: "ready"; readonly lease: PhotometricFrameLease }
  | { readonly status: "unsupported"; readonly reason: "frame-unavailable" | "stale-packet" | "packet-owned" | "atlas-budget" };

interface RetainedPacket {
  readonly packet: PhotometricFramePacket;
  readonly frame: PhotometricFrameIdentity;
  readonly token: object;
  readonly bytes: number;
  closed: boolean;
  released: boolean;
}

// An atlas has one disposal owner for its entire lifetime, including after a
// lease ends. This prevents two renderer/view owners from retiring it twice.
const adoptedPackets = new WeakSet<PhotometricFramePacket>();
const adoptedAtlases = new WeakSet<PhotometricProfileAtlas>();
const DEFAULT_RETAINED_BYTES = 32 * 1024 * 1024;

function validView(frame: PhotometricFrameIdentity): boolean {
  return (typeof frame.viewId === "string" || (typeof frame.viewId === "number" && Number.isFinite(frame.viewId))) &&
    Number.isSafeInteger(frame.frameIndex) && frame.frameIndex >= 0;
}

/**
 * One renderer/device owner for temporary profile atlases. These resources are
 * internal to the frame and are not proof that a backend supports profiles.
 *
 * Call `lease.finish()` in the frame's `finally`, after `device.endFrame()`
 * has returned or thrown. A failed/unavailable completion fence is not proof
 * that commands stopped using the atlas, so the lease remains budgeted until
 * device loss or a subsequent `dispose()` after device teardown.
 */
export class PhotometricFrameResources {
  private readonly packets = new Set<RetainedPacket>();
  private readonly generation: number | undefined;
  private unsubscribeLoss: (() => void) | undefined;
  private closed = false;
  private lost = false;
  private retained = 0;
  private readonly maxRetainedBytes: number;

  constructor(readonly owner: object, readonly device: RenderDevice, maxRetainedBytes = DEFAULT_RETAINED_BYTES) {
    if (!owner || (typeof owner !== "object" && typeof owner !== "function")) throw new TypeError("A photometric frame owner is required");
    if (!Number.isSafeInteger(maxRetainedBytes) || maxRetainedBytes < 0) throw new RangeError("Invalid photometric atlas retention budget");
    this.maxRetainedBytes = maxRetainedBytes;
    this.generation = device.generation;
    // Listener registration may synchronously report loss. Do not retain a
    // stale unsubscribe callback if that happened before registration returned.
    const unsubscribe = device.onDeviceLost?.(() => this.invalidate());
    if (this.lost) unsubscribe?.();
    else this.unsubscribeLoss = unsubscribe;
  }

  get retainedBytes(): number { return this.retained; }
  get retainedPackets(): number { return this.packets.size; }

  /** On failure, the caller still owns the packet and must dispose it. */
  adopt(frame: PhotometricFrameIdentity, packet: PhotometricFramePacket): PhotometricFrameAdoption {
    if (!this.frameCurrent(frame)) return { status: "unsupported", reason: "frame-unavailable" };
    try {
      const token = this.device.activeFrameToken;
      if (!token) return { status: "unsupported", reason: "frame-unavailable" };
      if (adoptedPackets.has(packet) || adoptedAtlases.has(packet.atlas)) return { status: "unsupported", reason: "packet-owned" };
      if (!packet.isCurrent()) return { status: "unsupported", reason: "stale-packet" };
      const texture = packet.atlas.texture;
      const bytes = texture.width * texture.height * 4;
      if (texture.disposed || texture.dimension !== "2d" || texture.format !== "r32f" || texture.colorSpace !== "linear" ||
          texture.mipLevelCount !== 1 || !texture.usage.includes("sampled") || !(texture.data instanceof Float32Array) ||
          !Number.isSafeInteger(bytes) || bytes !== texture.data.byteLength) {
        return { status: "unsupported", reason: "stale-packet" };
      }
      if (bytes > this.maxRetainedBytes - this.retained) return { status: "unsupported", reason: "atlas-budget" };
      // Packet validation can run caller-owned accessors. Recheck the frame
      // and ownership before transferring responsibility for disposal.
      if (this.device.activeFrameToken !== token || !this.frameCurrent(frame)) return { status: "unsupported", reason: "frame-unavailable" };
      if (adoptedPackets.has(packet) || adoptedAtlases.has(packet.atlas)) return { status: "unsupported", reason: "packet-owned" };
      const record: RetainedPacket = { packet, frame: { ...frame }, token, bytes, closed: false, released: false };
      adoptedPackets.add(packet);
      adoptedAtlases.add(packet.atlas);
      this.packets.add(record);
      this.retained += bytes;
      return { status: "ready", lease: new PhotometricFrameLease(this, record) };
    } catch {
      return { status: "unsupported", reason: "stale-packet" };
    }
  }

  /** Stop admissions. Existing leases still wait for frame submission/fences. */
  dispose(): void {
    this.closed = true;
    if (this.invalidated() || this.device.disposed) this.releaseAll();
    else if (this.device.activeFrameToken === null) {
      for (const record of [...this.packets]) this.finish(record);
    }
    this.removeListenerIfFinished();
  }

  /** @internal */
  current(record: RetainedPacket, frame: PhotometricFrameIdentity): boolean {
    try {
      if (record.closed || record.released || !this.frameCurrent(frame) || this.device.activeFrameToken !== record.token ||
          frame.owner !== record.frame.owner || frame.device !== record.frame.device || frame.viewId !== record.frame.viewId ||
          frame.frameIndex !== record.frame.frameIndex || !record.packet.isCurrent()) return false;
      return !record.closed && !record.released && this.frameCurrent(frame) && this.device.activeFrameToken === record.token;
    } catch { return false; }
  }

  /** @internal Returns false when the frame still needs to end. */
  finish(record: RetainedPacket): boolean {
    if (record.released || record.closed) return true;
    if (this.invalidated() || this.device.disposed) {
      this.release(record);
      return true;
    }
    // A different frame may have begun. Wait until there is no active frame;
    // an absent token capability is not evidence of submission.
    if (this.device.activeFrameToken !== null) return false;
    record.closed = true;
    if (this.device.kind === "mock") {
      this.release(record);
      return true;
    }
    try {
      const completion = this.device.waitForSubmittedWork?.();
      if (completion) void completion.then(() => this.release(record), () => {
        if (this.invalidated()) this.release(record);
      }).catch(() => undefined);
    } catch {
      if (this.invalidated()) this.release(record);
    }
    return true;
  }

  private frameCurrent(frame: PhotometricFrameIdentity): boolean {
    try {
      if (this.invalidated()) {
        this.invalidate();
        return false;
      }
      const token = this.device.activeFrameToken;
      if (this.closed || this.device.disposed || frame.device !== this.device || frame.owner !== this.owner || !validView(frame) || !token) return false;
      if (this.device.kind !== "mock") {
        if (!Number.isSafeInteger(this.generation) || typeof this.device.onDeviceLost !== "function" ||
            typeof this.device.waitForSubmittedWork !== "function") return false;
        if (this.device.kind === "webgl2") {
          const probe = (this.device as RenderDevice & { supportsSubmittedWorkCompletion?: () => boolean }).supportsSubmittedWorkCompletion;
          if (typeof probe !== "function" || probe.call(this.device) !== true) return false;
        } else if (this.device.kind === "webgpu") {
          const native = (this.device as RenderDevice & { readonly nativeGpuDevice?: { readonly queue?: { readonly onSubmittedWorkDone?: unknown } } }).nativeGpuDevice;
          if (typeof native?.queue?.onSubmittedWorkDone !== "function") return false;
        } else return false;
      }
      // Capability probes can call into a device; verify the frame still
      // belongs to this owner after the probe returns.
      if (this.invalidated()) { this.invalidate(); return false; }
      return !this.closed && !this.device.disposed && this.device.activeFrameToken === token;
    } catch { return false; }
  }

  private invalidated(): boolean {
    return this.lost || this.device.contextLost || this.device.generation !== this.generation;
  }

  private invalidate(): void {
    this.lost = true;
    this.releaseAll();
    this.removeListenerIfFinished();
  }

  private releaseAll(): void {
    for (const record of [...this.packets]) this.release(record);
  }

  private release(record: RetainedPacket): void {
    if (record.released) return;
    record.released = true;
    this.packets.delete(record);
    this.retained -= record.bytes;
    try { record.packet.dispose(); } finally { this.removeListenerIfFinished(); }
  }

  private removeListenerIfFinished(): void {
    if ((!this.closed && !this.lost) || this.packets.size) return;
    const unsubscribe = this.unsubscribeLoss;
    this.unsubscribeLoss = undefined;
    unsubscribe?.();
  }
}

/** A lease belongs to one renderer, device, view, and successful frame. */
export class PhotometricFrameLease {
  constructor(private readonly owner: PhotometricFrameResources, private readonly record: RetainedPacket) {}

  isCurrent(frame: PhotometricFrameIdentity): boolean { return this.owner.current(this.record, frame); }

  /** Call after `device.endFrame()`, even when frame rendering failed. */
  finish(): boolean { return this.owner.finish(this.record); }
}
