import { describe, expect, it, vi } from "vitest";
import { IndexBuffer } from "../../../packages/rendering/src/IndexBuffer";
import { RenderDeviceError } from "../../../packages/rendering/src/RenderDevice";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { WebGL2Buffer, WebGL2Device } from "../../../packages/rendering/src/WebGL2Device";

/** A recording WebGL context; no browser or GPU is involved. */
function makeDevice() {
  const constants = new Map<string, number>([["NO_ERROR", 0]]);
  const constant = (name: string): number => {
    if (!constants.has(name)) constants.set(name, 0x1000 + constants.size);
    return constants.get(name)!;
  };
  const bound = new Map<number, WebGLBuffer>();
  const storage = new Map<WebGLBuffer, Uint8Array>();
  const failures = new Map<WebGLBuffer, number>();
  const attempts: WebGLBuffer[] = [];
  const deleted: WebGLBuffer[] = [];
  const deleteError = new Error("native buffer deletion failed");
  let failAllocation = false;
  let onNextUpload: ((handle: WebGLBuffer) => void) | undefined;
  const methods: Record<string, unknown> = {
    getError: () => 0,
    getParameter: () => 16,
    getExtension: () => null,
    isContextLost: () => false,
    createBuffer: () => {
      if (failAllocation) {
        failAllocation = false;
        return null;
      }
      return {};
    },
    bindBuffer: (target: number, handle: WebGLBuffer) => { bound.set(target, handle); },
    bufferData: (target: number, byteLength: number) => { storage.set(bound.get(target)!, new Uint8Array(byteLength)); },
    bufferSubData: (target: number, byteOffset: number, data: ArrayBufferView) => {
      const handle = bound.get(target)!;
      storage.get(handle)!.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), byteOffset);
      const callback = onNextUpload;
      onNextUpload = undefined;
      callback?.(handle);
    },
    getBufferSubData: (target: number, byteOffset: number, output: Uint8Array) => {
      output.set(storage.get(bound.get(target)!)!.subarray(byteOffset, byteOffset + output.byteLength));
    },
    deleteBuffer: (handle: WebGLBuffer) => {
      attempts.push(handle);
      const remaining = failures.get(handle) ?? 0;
      if (remaining > 0) {
        failures.set(handle, remaining - 1);
        throw deleteError;
      }
      deleted.push(handle);
      storage.delete(handle);
    }
  };
  const gl = new Proxy({}, {
    get(_target, property) {
      const name = String(property);
      if (name in methods) return methods[name];
      if (/^[A-Z0-9_]+$/.test(name)) return constant(name);
      return () => undefined;
    }
  }) as WebGL2RenderingContext;
  const canvas = {
    getContext: () => gl,
    addEventListener() {},
    removeEventListener() {}
  } as unknown as HTMLCanvasElement;
  return {
    device: WebGL2Device.create({ canvas }),
    attempts,
    deleted,
    deleteError,
    failDeletes: (handle: WebGLBuffer, count: number) => { failures.set(handle, count); },
    clearFailures: () => { failures.clear(); },
    failNextAllocation: () => { failAllocation = true; },
    afterNextUpload: (callback: (handle: WebGLBuffer) => void) => { onNextUpload = callback; }
  };
}

function makeOwner(kind: "vertex" | "index"): VertexBuffer | IndexBuffer {
  return kind === "vertex" ? new VertexBuffer(VertexFormat.P3, 1) : new IndexBuffer([0, 1, 2]);
}

function writeOwner(owner: VertexBuffer | IndexBuffer): void {
  if (owner instanceof VertexBuffer) owner.setAttribute(0, "position", [4, 5, 6]);
  else owner.setIndices(1, [9]);
}

function ownerBytes(owner: VertexBuffer | IndexBuffer): Uint8Array {
  return owner instanceof VertexBuffer
    ? new Uint8Array(owner.data)
    : new Uint8Array(owner.data.buffer, owner.data.byteOffset, owner.data.byteLength);
}

type MirroredUsage = "vertex" | "index" | "uniform";
interface MirrorProbe {
  readonly staticUnlitBufferMirrors: Map<WebGL2Buffer, { readonly bytes: Uint8Array }>;
  readonly staticUnlitMirrorBytes: number;
  readonly staticGeneratedUniformMirrors: Map<WebGL2Buffer, { readonly bytes: Uint8Array }>;
  readonly staticGeneratedUniformMirrorBytes: number;
}

function mirrorProbe(device: WebGL2Device): MirrorProbe {
  return device as unknown as MirrorProbe;
}

function mirrorMap(probe: MirrorProbe, usage: MirroredUsage): MirrorProbe["staticUnlitBufferMirrors"] {
  return usage === "uniform" ? probe.staticGeneratedUniformMirrors : probe.staticUnlitBufferMirrors;
}

function mirrorBytes(probe: MirrorProbe, usage: MirroredUsage): number {
  return usage === "uniform" ? probe.staticGeneratedUniformMirrorBytes : probe.staticUnlitMirrorBytes;
}

describe("vertex and index owners after failed WebGL buffer retirement", () => {
  it.each([
    ["vertex", false], ["vertex", true], ["index", false], ["index", true]
  ] as const)("replaces a retired %s resource without disturbing another device (dirty: %s)", (kind, dirty) => {
    const a = makeDevice();
    const b = makeDevice();
    const owner = makeOwner(kind);
    try {
      const old = owner.upload(a.device) as WebGL2Buffer;
      const peer = owner.upload(b.device) as WebGL2Buffer;
      const independent = a.device.createBuffer("vertex", 4, Uint8Array.of(7, 8, 9, 10));
      expect(owner.upload(a.device)).toBe(old);
      a.failDeletes(old.handle, 1);

      expect(() => old.dispose()).toThrow(a.deleteError);
      expect(old.disposed).toBe(false);
      expect(() => a.device.updateBuffer(old, 0, Uint8Array.of(1))).toThrow(/not a live/i);
      expect(owner.uploadedBuffer).toBeNull();

      if (dirty) writeOwner(owner);
      expect(owner.upload(b.device)).toBe(peer);
      expect(owner.getDirtyRange()).toBeNull();
      const replacement = owner.upload(a.device) as WebGL2Buffer;
      expect(replacement).not.toBe(old);
      expect(owner.uploadedBuffer).toBe(replacement);
      expect(a.device.readBuffer(replacement)).toEqual(ownerBytes(owner));
      expect(b.device.readBuffer(peer)).toEqual(ownerBytes(owner));
      expect(old.disposed).toBe(true);
      expect(peer.disposed).toBe(false);
      expect(a.attempts.filter((handle) => handle === old.handle)).toHaveLength(2);
      expect(b.attempts).toHaveLength(0);
      expect(() => a.device.updateBuffer(replacement, 0, Uint8Array.of(1))).not.toThrow();
      owner.dispose();
      expect(independent.disposed).toBe(false);
      expect(a.device.readBuffer(independent)).toEqual(Uint8Array.of(7, 8, 9, 10));
    } finally {
      owner.dispose();
      a.device.dispose();
      b.device.dispose();
    }
  });

  it.each(["vertex", "index"] as const)("retains failed %s cleanup for teardown while using the replacement", (kind) => {
    const a = makeDevice();
    const b = makeDevice();
    const owner = makeOwner(kind);
    try {
      const old = owner.upload(a.device) as WebGL2Buffer;
      const peer = owner.upload(b.device) as WebGL2Buffer;
      a.failDeletes(old.handle, 3);
      expect(() => old.dispose()).toThrow(a.deleteError);
      expect(() => owner.upload(a.device)).toThrow(a.deleteError);

      const replacement = owner.uploadedBuffer as WebGL2Buffer;
      expect(replacement).not.toBe(old);
      expect(replacement.disposed).toBe(false);
      expect(owner.upload(a.device)).toBe(replacement);
      expect(owner.upload(b.device)).toBe(peer);
      expect(a.device.readBuffer(replacement)).toEqual(ownerBytes(owner));
      expect(peer.disposed).toBe(false);

      let disposalError: unknown;
      try { owner.dispose(); } catch (error) { disposalError = error; }
      expect(disposalError).toBeInstanceOf(AggregateError);
      expect((disposalError as AggregateError).errors).toContain(a.deleteError);
      expect(owner.disposed).toBe(false);
      expect(old.disposed).toBe(false);
      expect(replacement.disposed).toBe(true);
      expect(peer.disposed).toBe(true);
      expect(owner.uploadedBuffer).toBeNull();

      owner.dispose();
      expect(owner.disposed).toBe(true);
      expect(old.disposed).toBe(true);
      expect(a.attempts.filter((handle) => handle === old.handle)).toHaveLength(4);
      expect(a.deleted.filter((handle) => handle === old.handle)).toHaveLength(1);
      expect(a.deleted.filter((handle) => handle === replacement.handle)).toHaveLength(1);
      expect(b.deleted.filter((handle) => handle === peer.handle)).toHaveLength(1);
    } finally {
      a.clearFailures();
      owner.dispose();
      a.device.dispose();
      b.device.dispose();
    }
  });

  it.each(["vertex", "index"] as const)("never returns a clean, partially retired %s resource from upload", (kind) => {
    const a = makeDevice();
    const owner = makeOwner(kind);
    try {
      const old = owner.upload(a.device) as WebGL2Buffer;
      a.failDeletes(old.handle, 1);
      expect(() => old.dispose()).toThrow(a.deleteError);
      expect(old.disposed).toBe(false);

      const replacement = owner.upload(a.device);
      expect(replacement).not.toBe(old);
      expect(a.device.readBuffer(replacement)).toEqual(ownerBytes(owner));
    } finally {
      owner.dispose();
      a.device.dispose();
    }
  });

  it.each(["vertex", "index"] as const)("never adopts or retires another device's %s allocation", (kind) => {
    const a = makeDevice();
    const b = makeDevice();
    const owner = makeOwner(kind);
    try {
      const old = owner.upload(a.device) as WebGL2Buffer;
      const peer = owner.upload(b.device) as WebGL2Buffer;
      a.failDeletes(old.handle, 1);
      expect(() => old.dispose()).toThrow(a.deleteError);
      const create = vi.spyOn(a.device, "createBuffer").mockReturnValueOnce(peer);
      try {
        let error: unknown;
        try { owner.upload(a.device); } catch (caught) { error = caught; }
        expect(error).toBeInstanceOf(RenderDeviceError);
        expect((error as RenderDeviceError).code).toBe("INVALID_RESOURCE");
        expect(old.disposed).toBe(false);
        expect(peer.disposed).toBe(false);
        expect(owner.upload(b.device)).toBe(peer);
        expect(owner.upload(a.device)).not.toBe(old);
        expect(peer.disposed).toBe(false);
        expect(b.device.readBuffer(peer)).toEqual(ownerBytes(owner));
      } finally {
        create.mockRestore();
      }
    } finally {
      owner.dispose();
      a.device.dispose();
      b.device.dispose();
    }
  });

  it.each(["vertex", "index"] as const)("leaves an unverified retiring %s allocation with its device", (kind) => {
    const a = makeDevice();
    const owner = makeOwner(kind);
    const originalCreate = a.device.createBuffer.bind(a.device);
    let created: WebGL2Buffer | undefined;
    const create = vi.spyOn(a.device, "createBuffer").mockImplementationOnce((usage, byteLength, data) => {
      created = originalCreate(usage, byteLength, data) as WebGL2Buffer;
      a.failDeletes(created.handle, 1);
      expect(() => created!.dispose()).toThrow(a.deleteError);
      return created;
    });
    try {
      let error: unknown;
      try { owner.upload(a.device); } catch (caught) { error = caught; }
      expect(error).toBeInstanceOf(RenderDeviceError);
      expect((error as RenderDeviceError).code).toBe("INVALID_RESOURCE");
      expect((error as RenderDeviceError).details.bufferId).toBe(created!.id);
      expect(owner.uploadedBuffer).toBeNull();
      expect(created!.disposed).toBe(false);

      owner.dispose();
      expect(owner.disposed).toBe(true);
      expect(created!.disposed).toBe(false);
      a.device.dispose();
      expect(created!.disposed).toBe(true);
      expect(a.attempts.filter((handle) => handle === created!.handle)).toHaveLength(2);
    } finally {
      create.mockRestore();
      a.clearFailures();
      owner.dispose();
      a.device.dispose();
    }
  });

  it.each(["vertex", "index"] as const)("preserves %s ownership and dirty bytes when replacement allocation fails", (kind) => {
    const a = makeDevice();
    const b = makeDevice();
    const owner = makeOwner(kind);
    try {
      const old = owner.upload(a.device) as WebGL2Buffer;
      const peer = owner.upload(b.device) as WebGL2Buffer;
      a.failDeletes(old.handle, 1);
      expect(() => old.dispose()).toThrow(a.deleteError);
      writeOwner(owner);
      a.failNextAllocation();

      let allocationError: unknown;
      try { owner.upload(a.device); } catch (error) { allocationError = error; }
      expect(allocationError).toBeInstanceOf(RenderDeviceError);
      expect((allocationError as RenderDeviceError).code).toBe("WEBGL_ALLOCATION_FAILED");
      expect(old.disposed).toBe(false);
      expect(owner.upload(b.device)).toBe(peer);
      expect(b.device.readBuffer(peer)).toEqual(ownerBytes(owner));
      const replacement = owner.upload(a.device);
      expect(replacement).not.toBe(old);
      expect(a.device.readBuffer(replacement)).toEqual(ownerBytes(owner));
      expect(old.disposed).toBe(true);
      expect(peer.disposed).toBe(false);
    } finally {
      owner.dispose();
      a.device.dispose();
      b.device.dispose();
    }
  });

  it.each(["vertex", "index"] as const)("rejects a %s resource retired reentrantly during upload", (kind) => {
    const a = makeDevice();
    const owner = makeOwner(kind);
    try {
      const old = owner.upload(a.device) as WebGL2Buffer;
      if (owner instanceof IndexBuffer) owner.setIndices(0, [2, 1, 0]);
      else writeOwner(owner);
      a.failDeletes(old.handle, 1);
      let deleteError: unknown;
      a.afterNextUpload((handle) => {
        expect(handle).toBe(old.handle);
        try { old.dispose(); } catch (error) { deleteError = error; }
      });
      let uploadError: unknown;
      try { owner.upload(a.device); } catch (error) { uploadError = error; }
      expect(deleteError).toBe(a.deleteError);
      expect(uploadError).toBeInstanceOf(RenderDeviceError);
      expect((uploadError as RenderDeviceError).code).toBe("INVALID_RESOURCE");
      expect(owner.uploadedBuffer).toBeNull();

      const replacement = owner.upload(a.device);
      expect(replacement).not.toBe(old);
      expect(a.device.readBuffer(replacement)).toEqual(ownerBytes(owner));
      expect(old.disposed).toBe(true);
      const mirrors = mirrorProbe(a.device);
      expect(mirrors.staticUnlitBufferMirrors.has(old)).toBe(false);
      expect(mirrors.staticUnlitMirrorBytes).toBe(replacement.byteLength);
    } finally {
      owner.dispose();
      a.device.dispose();
    }
  });
});

describe("WebGL2 buffer mirror retirement during native upload", () => {
  const cases = (["vertex", "index", "uniform"] as const).flatMap((usage) =>
    (["pending", "completed", "delete-error", "upload-error"] as const).map((mode) => [usage, mode] as const)
  );

  it.each(cases)("does not resurrect a %s mirror after %s retirement", (usage, mode) => {
    const a = makeDevice();
    const b = makeDevice();
    const initial = Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8);
    const peerData = Uint8Array.of(9, 10, 11, 12);
    const otherData = Uint8Array.of(13, 14, 15, 16);
    const alternateUsage = usage === "uniform" ? "vertex" : "uniform";
    try {
      const old = a.device.createBuffer(usage, initial.byteLength, initial) as WebGL2Buffer;
      const peer = a.device.createBuffer(usage, peerData.byteLength, peerData) as WebGL2Buffer;
      const alternate = a.device.createBuffer(alternateUsage, otherData.byteLength, otherData) as WebGL2Buffer;
      const otherDevicePeer = b.device.createBuffer(usage, otherData.byteLength, otherData) as WebGL2Buffer;
      const aProbe = mirrorProbe(a.device);
      const bProbe = mirrorProbe(b.device);
      const mirrors = mirrorMap(aProbe, usage);
      const alternateMirrors = mirrorMap(aProbe, alternateUsage);
      const otherDeviceMirrors = mirrorMap(bProbe, usage);
      const peerMirror = mirrors.get(peer);
      const alternateMirror = alternateMirrors.get(alternate);
      const otherDeviceMirror = otherDeviceMirrors.get(otherDevicePeer);
      expect(mirrors.get(old)?.bytes).toEqual(initial);
      expect(peerMirror?.bytes).toEqual(peerData);
      expect(alternateMirror?.bytes).toEqual(otherData);
      expect(otherDeviceMirror?.bytes).toEqual(otherData);
      expect(mirrorBytes(aProbe, usage)).toBe(old.byteLength + peer.byteLength);
      expect(mirrorBytes(aProbe, alternateUsage)).toBe(alternate.byteLength);
      expect(mirrorBytes(bProbe, usage)).toBe(otherDevicePeer.byteLength);

      if (mode !== "completed") a.failDeletes(old.handle, 1);
      const nativeUploadError = new Error("native bufferSubData failed");
      let deleteError: unknown;
      a.afterNextUpload((handle) => {
        expect(handle).toBe(old.handle);
        if (mode === "delete-error") {
          old.dispose();
        } else {
          try { old.dispose(); } catch (error) { deleteError = error; }
          if (mode === "upload-error") throw nativeUploadError;
        }
      });
      let uploadError: unknown;
      try { a.device.updateBuffer(old, 0, Uint8Array.of(8, 7, 6, 5, 4, 3, 2, 1)); } catch (error) { uploadError = error; }
      expect(uploadError).toBe(mode === "delete-error" ? a.deleteError : mode === "upload-error" ? nativeUploadError : undefined);
      expect(deleteError).toBe(mode === "pending" || mode === "upload-error" ? a.deleteError : undefined);
      expect(old.disposed).toBe(mode === "completed");
      expect(mirrors.has(old)).toBe(false);
      expect(mirrorBytes(aProbe, usage)).toBe(peer.byteLength);
      expect(mirrors.get(peer)).toBe(peerMirror);
      expect(alternateMirrors.get(alternate)).toBe(alternateMirror);
      expect(otherDeviceMirrors.get(otherDevicePeer)).toBe(otherDeviceMirror);
      expect(mirrors.get(peer)?.bytes).toEqual(peerData);
      expect(alternateMirrors.get(alternate)?.bytes).toEqual(otherData);
      expect(otherDeviceMirrors.get(otherDevicePeer)?.bytes).toEqual(otherData);
      expect(mirrorBytes(aProbe, alternateUsage)).toBe(alternate.byteLength);
      expect(mirrorBytes(bProbe, usage)).toBe(otherDevicePeer.byteLength);
      expect(a.device.readBuffer(peer)).toEqual(peerData);
      expect(a.device.readBuffer(alternate)).toEqual(otherData);
      expect(b.device.readBuffer(otherDevicePeer)).toEqual(otherData);

      old.dispose();
      expect(old.disposed).toBe(true);
      expect(a.attempts.filter((handle) => handle === old.handle)).toHaveLength(mode === "completed" ? 1 : 2);
      expect(mirrors.has(old)).toBe(false);
      expect(mirrorBytes(aProbe, usage)).toBe(peer.byteLength);
      const replacement = a.device.createBuffer(usage, initial.byteLength, initial) as WebGL2Buffer;
      expect(mirrors.get(replacement)?.bytes).toEqual(initial);
      expect(mirrorBytes(aProbe, usage)).toBe(peer.byteLength + replacement.byteLength);
      replacement.dispose();
      expect(mirrorBytes(aProbe, usage)).toBe(peer.byteLength);
      expect(mirrors.get(peer)).toBe(peerMirror);
      expect(otherDeviceMirrors.get(otherDevicePeer)).toBe(otherDeviceMirror);
      a.device.updateBuffer(peer, 1, Uint8Array.of(21, 22));
      expect(a.device.readBuffer(peer)).toEqual(Uint8Array.of(9, 21, 22, 12));
      expect(mirrors.get(peer)?.bytes).toEqual(Uint8Array.of(9, 21, 22, 12));
      expect(mirrorBytes(aProbe, usage)).toBe(peer.byteLength);
      expect(otherDeviceMirrors.get(otherDevicePeer)?.bytes).toEqual(otherData);
    } finally {
      a.clearFailures();
      a.device.dispose();
      b.device.dispose();
    }
  });
});
