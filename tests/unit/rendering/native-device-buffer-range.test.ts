import { describe, expect, it } from "vitest";
import { MockRenderDevice, type RenderBuffer, type RenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { WebGL2Device } from "../../../packages/rendering/src/WebGL2Device";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import { webgl2DeviceHost } from "../../../packages/rendering/src/webgl2/Counters";

type Backend = "mock" | "webgl2" | "webgpu";
type Call = { readonly name: string; readonly args: readonly unknown[] };
type FakeBuffer = { bytes: Uint8Array };
const initial = Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8);

/** A GL recorder with byte storage; it creates neither a browser nor a GPU context. */
function makeWebGL(calls: Call[]): WebGL2Device {
  const constants = new Map<string, number>([["NO_ERROR", 0]]);
  const constant = (name: string): number => {
    if (!constants.has(name)) constants.set(name, 0x1000 + constants.size);
    return constants.get(name)!;
  };
  const bound = new Map<number, FakeBuffer | null>();
  const methods: Record<string, unknown> = {
    getError: () => 0,
    getParameter: () => 16,
    getExtension: () => null,
    isContextLost: () => false,
    createBuffer: () => ({ bytes: new Uint8Array(0) }),
    bindVertexArray: (handle: unknown) => { calls.push({ name: "bindVertexArray", args: [handle] }); },
    bindBuffer: (target: number, handle: FakeBuffer | null) => {
      calls.push({ name: "bindBuffer", args: [target, handle] });
      bound.set(target, handle);
    },
    bufferData: (target: number, size: number) => {
      calls.push({ name: "bufferData", args: [target, size] });
      bound.get(target)!.bytes = new Uint8Array(size);
    },
    bufferSubData: (target: number, offset: number, data: ArrayBufferView) => {
      calls.push({ name: "bufferSubData", args: [target, offset, data] });
      bound.get(target)!.bytes.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), offset);
    },
    getBufferSubData: (target: number, offset: number, out: Uint8Array) => {
      calls.push({ name: "getBufferSubData", args: [target, offset, out.byteLength] });
      out.set(bound.get(target)!.bytes.subarray(offset, offset + out.byteLength));
    },
    deleteBuffer: () => undefined
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
  return WebGL2Device.create({ canvas });
}

async function makeHarness(kind: Backend): Promise<{ device: RenderDevice; buffer: RenderBuffer; calls: Call[] }> {
  const calls: Call[] = [];
  let device: RenderDevice;
  if (kind === "mock") device = new MockRenderDevice();
  else if (kind === "webgl2") device = makeWebGL(calls);
  else {
    const native: WebGPUDeviceLike = {
      queue: {
        writeBuffer: (_buffer, offset, data) => { calls.push({ name: "writeBuffer", args: [offset, data] }); },
        submit() {},
        onSubmittedWorkDone: async () => undefined
      },
      createBuffer: () => ({ destroy() {} })
    };
    device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native } });
  }
  const buffer = device.createBuffer("vertex", initial.byteLength, initial);
  calls.length = 0;
  return { device, buffer, calls };
}

function expectDeviceError(action: () => unknown, code: string, details?: Record<string, unknown>): void {
  let caught: unknown;
  try { action(); } catch (error) { caught = error; }
  expect(caught).toMatchObject({ code, ...(details ? { details } : {}) });
}

describe.each(["mock", "webgl2", "webgpu"] as const)("%s device buffer ranges", kind => {
  it("rejects invalid update offsets before touching bytes or issuing native calls", async () => {
    const { device, buffer, calls } = await makeHarness(kind);
    const host = kind === "webgl2" ? webgl2DeviceHost(device)! : undefined;
    const beforeUpdates = host?.counters.bufferUpdateCount;
    const invalid = [NaN, Infinity, -Infinity, 0.5, -0.5, -1, Number.MAX_SAFE_INTEGER + 1, 8, 9];
    for (const byteOffset of invalid) {
      expectDeviceError(() => device.updateBuffer(buffer, byteOffset, Uint8Array.of(99)), "BUFFER_RANGE_OUT_OF_BOUNDS", {
        byteOffset, dataByteLength: 1, byteLength: 8
      });
      expect(calls).toEqual([]);
      expect(host?.counters.bufferUpdateCount).toBe(beforeUpdates);
    }
    // Invalid offsets remain invalid even when no bytes would be written.
    for (const byteOffset of [NaN, 0.5, 9]) {
      expectDeviceError(() => device.updateBuffer(buffer, byteOffset, new Uint8Array(0)), "BUFFER_RANGE_OUT_OF_BOUNDS");
    }
    expect(calls).toEqual([]);
    expect(device.readBuffer(buffer)).toEqual(initial);
    device.dispose();
  });

  it("rejects invalid read offsets and lengths before native buffer access", async () => {
    const { device, buffer, calls } = await makeHarness(kind);
    const invalid: readonly (readonly [number, number])[] = [
      [NaN, 1], [Infinity, 0], [-Infinity, 0], [0.5, 1], [-0.5, 1], [-1, 1],
      [Number.MAX_SAFE_INTEGER + 1, 0], [9, 0], [8, 1], [7, 2],
      [0, NaN], [0, Infinity], [0, -Infinity], [0, 0.5], [0, -1],
      [0, Number.MAX_SAFE_INTEGER + 1], [0, 9]
    ];
    for (const [byteOffset, byteLength] of invalid) {
      expectDeviceError(() => device.readBuffer(buffer, byteOffset, byteLength), "BUFFER_RANGE_OUT_OF_BOUNDS", {
        byteOffset, byteLength, bufferByteLength: 8
      });
      expect(calls).toEqual([]);
    }
    // Default-length calculation must not turn an invalid offset into a valid read.
    expectDeviceError(() => device.readBuffer(buffer, NaN), "BUFFER_RANGE_OUT_OF_BOUNDS", {
      byteOffset: NaN, byteLength: NaN, bufferByteLength: 8
    });
    for (const byteOffset of [0.5, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expectDeviceError(() => device.readBuffer(buffer, byteOffset), "BUFFER_RANGE_OUT_OF_BOUNDS");
    }
    expect(calls).toEqual([]);
    expect(device.readBuffer(buffer)).toEqual(initial);
    device.dispose();
  });

  it("accepts valid unaligned byte writes, source windows, and empty ranges at the end", async () => {
    const { device, buffer } = await makeHarness(kind);
    const backing = Uint8Array.of(99, 20, 21, 22, 99);
    device.updateBuffer(buffer, 3, new DataView(backing.buffer, 1, 3));
    expect(device.readBuffer(buffer, 2, 5)).toEqual(Uint8Array.of(3, 20, 21, 22, 7));
    device.updateBuffer(buffer, 8, new Uint8Array(0));
    expect(device.readBuffer(buffer, 8, 0)).toEqual(new Uint8Array(0));
    expect(device.readBuffer(buffer, 8)).toEqual(new Uint8Array(0));
    expect(device.readBuffer(buffer, 3)).toEqual(Uint8Array.of(20, 21, 22, 7, 8));
    device.dispose();
  });

  it("preserves foreign-resource, disposed-resource, and disposed-device precedence", async () => {
    const owner = await makeHarness(kind);
    const foreign = await makeHarness(kind);
    const foreignCode = kind === "webgl2" ? "INVALID_RESOURCE" : "FOREIGN_RESOURCE";
    expectDeviceError(() => owner.device.updateBuffer(foreign.buffer, NaN, Uint8Array.of(1)), foreignCode);
    expectDeviceError(() => owner.device.readBuffer(foreign.buffer, NaN, 1), foreignCode);
    expect(owner.calls).toEqual([]);
    owner.buffer.dispose();
    owner.calls.length = 0;
    const disposedCode = kind === "webgl2" ? "INVALID_RESOURCE" : "DISPOSED_RESOURCE";
    expectDeviceError(() => owner.device.updateBuffer(owner.buffer, NaN, Uint8Array.of(1)), disposedCode);
    expectDeviceError(() => owner.device.readBuffer(owner.buffer, NaN, 1), disposedCode);
    expect(owner.calls).toEqual([]);
    owner.device.dispose();
    expectDeviceError(() => owner.device.updateBuffer(owner.buffer, NaN, Uint8Array.of(1)), "DISPOSED_DEVICE");
    expectDeviceError(() => owner.device.readBuffer(owner.buffer, NaN, 1), "DISPOSED_DEVICE");
    foreign.device.dispose();
  });
});
