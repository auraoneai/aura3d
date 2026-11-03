import { describe, expect, it } from "vitest";
import { VolumeRenderer } from "../../../packages/rendering/src/VolumeRenderer";
import type { RenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { reserveTextureBudget, textureBudgetUsage } from "../../../packages/rendering/src/textures/TextureBudget";
import { registerWebGL2DeviceHost } from "../../../packages/rendering/src/webgl2/Counters";
import type { WebGL2DeviceHost } from "../../../packages/rendering/src/webgl2/DeviceHost";

type Texture = { readonly id: number };
type Retirement = { readonly handles: readonly Texture[]; readonly release: () => void; readonly resolve: () => void; done: boolean };
const TRANSFER_BYTES = 256 * 4;
const INITIAL_BYTES = 2 * 4 + TRANSFER_BYTES + 1;
const UPDATED_BYTES = 4 * 4 + TRANSFER_BYTES + 1;
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const initial = () => ({ dimensions: [2, 1, 1] as const, data: new Uint8Array([0, 1]) });
const updated = () => ({ dimensions: [1, 2, 2] as const, data: new Uint16Array([10, 20, 30, 40]) });
const stops = [{ value: 0, color: [1, 0, 0, 0] as const }, { value: 1, color: [0, 1, 0, 1] as const }];

/** Device/GL double: explicit retirement signals model fences; no real GPU is exercised. */
function mockDevice(policy?: { maxBytes?: number; maxDimension?: number }) {
  const names = ["MAX_3D_TEXTURE_SIZE", "ACTIVE_TEXTURE", "TEXTURE_BINDING_2D", "TEXTURE_BINDING_3D", "SAMPLER_BINDING",
    "UNPACK_ALIGNMENT", "UNPACK_ROW_LENGTH", "UNPACK_IMAGE_HEIGHT", "UNPACK_SKIP_PIXELS", "UNPACK_SKIP_ROWS", "UNPACK_SKIP_IMAGES",
    "UNPACK_FLIP_Y_WEBGL", "UNPACK_PREMULTIPLY_ALPHA_WEBGL", "UNPACK_COLORSPACE_CONVERSION_WEBGL", "PIXEL_UNPACK_BUFFER_BINDING", "PIXEL_UNPACK_BUFFER",
    "TEXTURE_2D", "TEXTURE_3D", "TEXTURE_WRAP_S", "TEXTURE_WRAP_T", "TEXTURE_WRAP_R", "TEXTURE_MIN_FILTER", "TEXTURE_MAG_FILTER", "CLAMP_TO_EDGE",
    "NEAREST", "LINEAR", "R32F", "RED", "FLOAT", "RGBA8", "RGBA", "UNSIGNED_BYTE", "R8", "VERTEX_SHADER", "FRAGMENT_SHADER", "COMPILE_STATUS", "LINK_STATUS",
    "CURRENT_PROGRAM", "VERTEX_ARRAY_BINDING", "BLEND", "DEPTH_TEST", "CULL_FACE", "DEPTH_WRITEMASK", "DEPTH_FUNC", "DEPTH_RANGE", "COLOR_WRITEMASK",
    "BLEND_SRC_RGB", "BLEND_DST_RGB", "BLEND_SRC_ALPHA", "BLEND_DST_ALPHA", "BLEND_EQUATION_RGB", "BLEND_EQUATION_ALPHA", "FUNC_ADD", "ONE", "ONE_MINUS_SRC_ALPHA", "LEQUAL", "TRIANGLES"];
  const gl: Record<string, any> = { canvas: new EventTarget(), NO_ERROR: 0, TEXTURE0: 1000, TEXTURE1: 1001, TEXTURE2: 1002 };
  names.forEach((name, index) => { gl[name] = index + 1; });
  let nextId = 0;
  let active = gl.TEXTURE0;
  let lost = false;
  let error = gl.NO_ERROR;
  let textureAttempts = 0;
  let failAttempt = -1;
  const textures: Texture[] = [];
  const deleted: Texture[] = [];
  const uploads = new Map<Texture, number[]>();
  const bindings = new Map<string, Texture | null>();
  const samplers = new Map<number, unknown>();
  const enabled = new Set<number>();
  const unpack = new Map<number, unknown>([
    [gl.MAX_3D_TEXTURE_SIZE, 512], [gl.UNPACK_ALIGNMENT, 4], [gl.UNPACK_ROW_LENGTH, 0], [gl.UNPACK_IMAGE_HEIGHT, 0],
    [gl.UNPACK_SKIP_PIXELS, 0], [gl.UNPACK_SKIP_ROWS, 0], [gl.UNPACK_SKIP_IMAGES, 0], [gl.UNPACK_FLIP_Y_WEBGL, 0],
    [gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0], [gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, 0], [gl.PIXEL_UNPACK_BUFFER_BINDING, null],
    [gl.CURRENT_PROGRAM, null], [gl.VERTEX_ARRAY_BINDING, null], [gl.DEPTH_WRITEMASK, true], [gl.DEPTH_FUNC, 77],
    [gl.DEPTH_RANGE, new Float32Array([0, 1])], [gl.COLOR_WRITEMASK, [true, true, true, true]],
    [gl.BLEND_SRC_RGB, 81], [gl.BLEND_DST_RGB, 82], [gl.BLEND_SRC_ALPHA, 83], [gl.BLEND_DST_ALPHA, 84],
    [gl.BLEND_EQUATION_RGB, 85], [gl.BLEND_EQUATION_ALPHA, 86]
  ]);
  const hooks: { createTexture?: () => void; uploadVolume?: () => void; uploadTransfer?: () => void; draw?: () => void;
    parameter?: (key: number) => void } = {};
  const device = { kind: "webgl2", disposed: false, contextLost: false } as unknown as RenderDevice;
  const mutableDevice = device as unknown as { disposed: boolean; contextLost: boolean };
  const owners = new Set<() => void>();
  const lostListeners = new Set<() => void>();
  const restoredListeners = new Set<() => void>();
  const retirements: Retirement[] = [];
  const drainListeners = new Set<() => void>();
  const notifyDrained = () => {
    if (owners.size || retirements.some((retirement) => !retirement.done)) return;
    for (const listener of [...drainListeners]) { drainListeners.delete(listener); listener(); }
  };
  const once = (kind: "createTexture" | "uploadVolume" | "uploadTransfer" | "draw") => { const callback = hooks[kind]; delete hooks[kind]; callback?.(); };
  const make = () => ({ id: ++nextId });
  const bound = (target: number) => bindings.get(`${active}:${target}`) ?? null;
  gl.getParameter = (key: number) => {
    hooks.parameter?.(key);
    if (key === gl.ACTIVE_TEXTURE) return active;
    if (key === gl.TEXTURE_BINDING_2D) return bound(gl.TEXTURE_2D);
    if (key === gl.TEXTURE_BINDING_3D) return bound(gl.TEXTURE_3D);
    if (key === gl.SAMPLER_BINDING) return samplers.get(active - gl.TEXTURE0) ?? null;
    return unpack.get(key);
  };
  gl.getError = () => { const value = error; error = gl.NO_ERROR; return value; };
  gl.isContextLost = () => lost;
  gl.activeTexture = (value: number) => { active = value; };
  gl.bindTexture = (target: number, texture: Texture | null) => { bindings.set(`${active}:${target}`, texture); };
  gl.bindSampler = (unit: number, sampler: unknown) => { samplers.set(unit, sampler); };
  gl.bindBuffer = (_target: number, buffer: unknown) => { unpack.set(gl.PIXEL_UNPACK_BUFFER_BINDING, buffer); };
  gl.pixelStorei = (key: number, value: unknown) => { unpack.set(key, value); };
  gl.createTexture = () => {
    textureAttempts++;
    if (textureAttempts === failAttempt) return null;
    const texture = make(); textures.push(texture); once("createTexture"); return texture;
  };
  gl.deleteTexture = (texture: Texture) => { deleted.push(texture); };
  gl.createVertexArray = make;
  gl.createShader = make;
  gl.createProgram = make;
  for (const name of ["deleteVertexArray", "deleteShader", "deleteProgram", "shaderSource", "compileShader", "attachShader", "linkProgram", "texParameteri"]) gl[name] = () => {};
  gl.getShaderParameter = () => true;
  gl.getProgramParameter = () => true;
  gl.texImage3D = (...args: any[]) => { uploads.set(bound(gl.TEXTURE_3D)!, Array.from(args[9] as Float32Array)); once("uploadVolume"); };
  gl.texImage2D = (...args: any[]) => {
    uploads.set(bound(gl.TEXTURE_2D)!, Array.from(args[8] as Uint8Array));
    if (active === gl.TEXTURE1) once("uploadTransfer");
  };
  gl.getUniformLocation = (_program: unknown, name: string) => name;
  for (const name of ["uniformMatrix4fv", "uniform3iv", "uniform2fv", "uniform1i", "uniform1f", "uniform4fv"]) gl[name] = () => {};
  gl.useProgram = (program: unknown) => { unpack.set(gl.CURRENT_PROGRAM, program); };
  gl.bindVertexArray = (vao: unknown) => { unpack.set(gl.VERTEX_ARRAY_BINDING, vao); };
  gl.isEnabled = (value: number) => enabled.has(value);
  gl.enable = (value: number) => { enabled.add(value); };
  gl.disable = (value: number) => { enabled.delete(value); };
  gl.depthMask = (value: boolean) => { unpack.set(gl.DEPTH_WRITEMASK, value); };
  gl.depthFunc = (value: number) => { unpack.set(gl.DEPTH_FUNC, value); };
  gl.colorMask = (...value: boolean[]) => { unpack.set(gl.COLOR_WRITEMASK, value); };
  gl.blendFuncSeparate = (...values: number[]) => {
    [gl.BLEND_SRC_RGB, gl.BLEND_DST_RGB, gl.BLEND_SRC_ALPHA, gl.BLEND_DST_ALPHA].forEach((key, i) => unpack.set(key, values[i]));
  };
  gl.blendEquationSeparate = (rgb: number, alpha: number) => { unpack.set(gl.BLEND_EQUATION_RGB, rgb); unpack.set(gl.BLEND_EQUATION_ALPHA, alpha); };
  gl.drawArrays = () => once("draw");
  const lifecycle = {
    onDeviceLost(listener: () => void) { lostListeners.add(listener); return () => lostListeners.delete(listener); },
    onDeviceRestored(listener: () => void) { restoredListeners.add(listener); return () => restoredListeners.delete(listener); },
    isDeviceLost: () => lost
  };
  const textureRegistry = {
    registerNativeTextureOwner(close: () => void) {
      owners.add(close);
      return () => { owners.delete(close); notifyDrained(); };
    },
    retireNativeTexturesAfterStack(handles: readonly Texture[], release: () => void): Promise<void> {
      let resolve!: () => void;
      const promise = new Promise<void>((done) => { resolve = done; });
      retirements.push({ handles: [...handles], release, resolve, done: false });
      return promise;
    },
    onNativeRetirementsDrained(listener: () => void) {
      if (!owners.size && retirements.every((retirement) => retirement.done)) listener();
      else drainListeners.add(listener);
    }
  };
  const counters = { drawCalls: 0 };
  const host = { device, gl, lifecycle, textureRegistry, textureBudgetPolicy: policy,
    stateCache: { invalidate() {} }, counters } as unknown as WebGL2DeviceHost;
  registerWebGL2DeviceHost(host);
  const settle = (retirement: Retirement, contextLost = false) => {
    if (retirement.done) return;
    retirement.done = true;
    if (!contextLost) for (const texture of retirement.handles) gl.deleteTexture(texture);
    retirement.release();
    retirement.resolve();
    notifyDrained();
  };
  return {
    device, gl: gl as WebGL2RenderingContext, textures, deleted, uploads, hooks, owners, retirements, counters,
    failAllocationAfter(offset: number) { failAttempt = textureAttempts + offset; },
    setError(value: number) { error = value; },
    completeAll() { for (const retirement of retirements) settle(retirement); },
    completeFor(texture: Texture) { for (const retirement of retirements) if (retirement.handles.includes(texture)) settle(retirement); },
    lose() {
      lost = true;
      mutableDevice.contextLost = true;
      for (const retirement of retirements) settle(retirement, true);
      for (const listener of [...lostListeners]) listener();
      gl.canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    },
    restore() {
      lost = false;
      mutableDevice.contextLost = false;
      for (const listener of [...restoredListeners]) listener();
      gl.canvas.dispatchEvent(new Event("webglcontextrestored"));
    },
    disposeDevice() {
      mutableDevice.disposed = true;
      for (const owner of [...owners]) owner();
    }
  };
}

describe("device-owned scalar volume texture budget and frame leases", () => {
  it("charges physical R32F storage and reserves a full staged replacement until retirement completes", () => {
    const context = mockDevice({ maxBytes: INITIAL_BYTES + 4 * 4 + TRANSFER_BYTES });
    const renderer = VolumeRenderer.fromDevice(context.device, initial());
    expect(textureBudgetUsage(context.device)).toBe(INITIAL_BYTES);
    const old = context.textures.slice();
    renderer.updateData(updated());
    expect(textureBudgetUsage(context.device)).toBe(INITIAL_BYTES + 4 * 4 + TRANSFER_BYTES);
    expect(context.retirements.flatMap((entry) => entry.handles)).toEqual(expect.arrayContaining([old[0], old[1]]));
    expect(context.deleted).not.toContain(old[0]);
    context.completeAll();
    expect(textureBudgetUsage(context.device)).toBe(UPDATED_BYTES);
    expect(context.deleted).toEqual(expect.arrayContaining([old[0], old[1]]));
    renderer.dispose();
    expect(textureBudgetUsage(context.device)).toBe(UPDATED_BYTES);
    context.completeAll();
    expect(textureBudgetUsage(context.device)).toBe(0);
  });

  it("rejects an update without enough overlap and leaves committed data and budget intact", () => {
    const context = mockDevice({ maxBytes: INITIAL_BYTES + 4 * 4 + TRANSFER_BYTES - 1 });
    const renderer = VolumeRenderer.fromDevice(context.device, initial());
    const count = context.textures.length;
    const before = renderer.getDiagnostics();
    expect(() => renderer.updateData(updated())).toThrow(/budget/i);
    expect(context.textures).toHaveLength(count);
    expect(textureBudgetUsage(context.device)).toBe(INITIAL_BYTES);
    expect(renderer.getDiagnostics()).toEqual(before);
    expect(context.retirements).toHaveLength(0);
    renderer.dispose(); context.completeAll();
    expect(textureBudgetUsage(context.device)).toBe(0);
  });

  it("shares the device ledger with unrelated allocations and enforces the physical dimension policy", () => {
    const context = mockDevice({ maxBytes: INITIAL_BYTES + 3 });
    const unrelated = reserveTextureBudget(4, undefined, context.device);
    expect(() => VolumeRenderer.fromDevice(context.device, initial())).toThrow(/budget/i);
    expect(context.textures).toHaveLength(0);
    expect(textureBudgetUsage(context.device)).toBe(4);
    unrelated();
    expect(textureBudgetUsage(context.device)).toBe(0);
    const smallDimension = mockDevice({ maxDimension: 128 });
    expect(() => VolumeRenderer.fromDevice(smallDimension.device, initial())).toThrow(/dimension|size|budget/i);
    expect(smallDimension.textures).toHaveLength(0);
    expect(textureBudgetUsage(smallDimension.device)).toBe(0);
  });

  it("keeps possibly submitted failed replacement storage charged until its fence completes", () => {
    const context = mockDevice();
    const renderer = VolumeRenderer.fromDevice(context.device, initial());
    context.hooks.uploadTransfer = () => { throw new Error("transfer upload failed"); };
    expect(() => renderer.updateData(updated())).toThrow("transfer upload failed");
    expect(renderer.getDiagnostics().dimensions).toEqual([2, 1, 1]);
    expect(textureBudgetUsage(context.device)).toBe(INITIAL_BYTES + 4 * 4 + TRANSFER_BYTES);
    const staged = context.textures.slice(-2);
    expect(context.retirements.flatMap((entry) => entry.handles)).toEqual(expect.arrayContaining(staged));
    expect(context.deleted).not.toContain(staged[0]);
    context.completeAll();
    expect(textureBudgetUsage(context.device)).toBe(INITIAL_BYTES);
    renderer.dispose(); context.completeAll();
    expect(textureBudgetUsage(context.device)).toBe(0);
  });

  it("retains existing native handles and their charges when constructor allocation fails", () => {
    const context = mockDevice();
    context.failAllocationAfter(3);
    expect(() => VolumeRenderer.fromDevice(context.device, initial())).toThrow(/allocation/i);
    expect(context.textures).toHaveLength(2);
    expect(textureBudgetUsage(context.device)).toBe(2 * 4 + TRANSFER_BYTES);
    expect(context.retirements.flatMap((entry) => entry.handles)).toEqual(expect.arrayContaining(context.textures));
    context.completeAll();
    expect(textureBudgetUsage(context.device)).toBe(0);
    expect(context.owners.size).toBe(0);
  });

  it("registers lifecycle ownership before GL allocation and rejects a constructor interrupted by device disposal", () => {
    const context = mockDevice();
    let observedOwnerCount = 0;
    context.hooks.createTexture = () => {
      observedOwnerCount = context.owners.size;
      context.disposeDevice();
    };
    expect(() => VolumeRenderer.fromDevice(context.device, initial())).toThrow(/disposed/i);
    expect(observedOwnerCount).toBe(1);
    expect(context.retirements.flatMap((entry) => entry.handles)).toEqual(expect.arrayContaining(context.textures));
    context.completeAll();
    expect(textureBudgetUsage(context.device)).toBe(0);
    expect(context.owners.size).toBe(0);
  });

  it("does not publish a constructor's invalid handles if loss and restore interrupt allocation", () => {
    const context = mockDevice();
    context.hooks.createTexture = () => { context.lose(); context.restore(); };
    expect(() => VolumeRenderer.fromDevice(context.device, initial())).toThrow(/context|generation|lost/i);
    expect(textureBudgetUsage(context.device)).toBe(0);
    expect(context.owners.size).toBe(0);
    // The lost generation owns these names; it must not be deleted in the restored context.
    expect(context.deleted).toHaveLength(0);
    expect(context.retirements).toHaveLength(0);
  });

  it("invalidates frame tokens on mutation and retains shared handles until every relevant lease releases", () => {
    const context = mockDevice();
    const renderer = VolumeRenderer.fromDevice(context.device, initial());
    const [oldVolume, oldTransfer, fallback] = context.textures;
    const first = renderer.acquireFrameLease(context.device);
    first.assertCurrent();
    renderer.updateTransferFunction(stops);
    expect(() => first.assertCurrent()).toThrow();
    const transfer2 = context.textures.at(-1)!;
    const second = renderer.acquireFrameLease(context.device);
    renderer.updateData(updated());
    expect(() => second.assertCurrent()).toThrow();
    expect(context.retirements.flatMap((entry) => entry.handles)).not.toContain(oldVolume);
    expect(context.retirements.flatMap((entry) => entry.handles)).not.toContain(oldTransfer);
    expect(context.retirements.flatMap((entry) => entry.handles)).not.toContain(transfer2);
    second.release();
    expect(context.retirements.flatMap((entry) => entry.handles)).not.toContain(oldVolume);
    expect(context.retirements.flatMap((entry) => entry.handles)).toContain(transfer2);
    first.release(); first.release();
    expect(() => first.assertCurrent()).toThrow();
    const retired = context.retirements.flatMap((entry) => entry.handles);
    expect(retired).toEqual(expect.arrayContaining([oldVolume, oldTransfer, transfer2]));
    expect(retired).not.toContain(fallback);
    context.completeAll();
    expect(textureBudgetUsage(context.device)).toBe(UPDATED_BYTES);
    renderer.dispose(); context.completeAll();
    expect(textureBudgetUsage(context.device)).toBe(0);
  });

  it("marks a device-disposed renderer closed but waits for retained frames before enqueueing final retirement", () => {
    const context = mockDevice();
    const renderer = VolumeRenderer.fromDevice(context.device, initial());
    const lease = renderer.acquireFrameLease(context.device);
    context.disposeDevice();
    expect(renderer.getDiagnostics().disposed).toBe(true);
    expect(() => lease.assertCurrent()).toThrow();
    expect(() => renderer.acquireFrameLease(context.device)).toThrow();
    expect(context.owners.size).toBe(1);
    expect(context.retirements).toHaveLength(0);
    expect(textureBudgetUsage(context.device)).toBe(INITIAL_BYTES);
    lease.release();
    expect(context.owners.size).toBe(0);
    expect(context.retirements.flatMap((entry) => entry.handles)).toEqual(expect.arrayContaining(context.textures));
    expect(textureBudgetUsage(context.device)).toBe(INITIAL_BYTES);
    context.completeAll();
    expect(textureBudgetUsage(context.device)).toBe(0);
  });

  it("resolves the device drain only after retained frames and retirement fences finish", async () => {
    const context = mockDevice();
    const renderer = VolumeRenderer.fromDevice(context.device, initial());
    await expect(VolumeRenderer.whenDeviceRetirementsDrained(context.device)).rejects.toThrow(/disposed/i);
    const lease = renderer.acquireFrameLease(context.device);
    context.disposeDevice();
    let drained = false;
    const completion = VolumeRenderer.whenDeviceRetirementsDrained(context.device).then(() => { drained = true; });
    await Promise.resolve();
    expect(drained).toBe(false);
    lease.release();
    await Promise.resolve();
    expect(drained).toBe(false);
    context.completeAll();
    await completion;
    expect(drained).toBe(true);
  });

  it("releases lost-generation charges once without debiting restored allocations on late lease or fence completion", () => {
    const context = mockDevice();
    const renderer = VolumeRenderer.fromDevice(context.device, initial());
    renderer.updateData(updated());
    const oldRetirements = context.retirements.slice();
    const lease = renderer.acquireFrameLease(context.device);
    context.lose();
    expect(textureBudgetUsage(context.device)).toBe(0);
    expect(() => lease.assertCurrent()).toThrow();
    context.restore();
    expect(textureBudgetUsage(context.device)).toBe(UPDATED_BYTES);
    for (const retirement of oldRetirements) retirement.release();
    lease.release(); lease.release();
    expect(textureBudgetUsage(context.device)).toBe(UPDATED_BYTES);
    renderer.dispose(); context.completeAll();
    expect(textureBudgetUsage(context.device)).toBe(0);
  });

  it("checks exact device ownership and leaves raw-context instances outside any device ledger", () => {
    const first = mockDevice();
    const second = mockDevice();
    const rawBefore = textureBudgetUsage();
    const renderer = VolumeRenderer.fromDevice(first.device, initial());
    expect(renderer.belongsToDevice(first.device)).toBe(true);
    expect(renderer.belongsToDevice(second.device)).toBe(false);
    expect(() => renderer.assertUsableForDevice(second.device)).toThrow();
    expect(() => renderer.acquireFrameLease(second.device)).toThrow();
    expect(() => new VolumeRenderer(first.gl, initial(), second.device)).toThrow();
    const raw = new VolumeRenderer(second.gl, initial());
    expect(raw.belongsToDevice(second.device)).toBe(false);
    expect(() => raw.acquireFrameLease(second.device)).toThrow();
    expect(textureBudgetUsage(second.device)).toBe(0);
    expect(textureBudgetUsage()).toBe(rawBefore);
    raw.dispose(); renderer.dispose(); first.completeAll();
    expect(textureBudgetUsage(first.device)).toBe(0);
  });

  it("counts each issued device-backed draw once and leaves raw draws and thrown draws uncounted", () => {
    const context = mockDevice();
    const renderer = VolumeRenderer.fromDevice(context.device, initial());
    renderer.draw({ viewProjectionMatrix: identity });
    expect(context.counters.drawCalls).toBe(1);
    context.hooks.draw = () => { throw new Error("draw failed"); };
    expect(() => renderer.draw({ viewProjectionMatrix: identity })).toThrow("draw failed");
    expect(context.counters.drawCalls).toBe(1);
    const rawContext = mockDevice();
    const raw = new VolumeRenderer(rawContext.gl, initial());
    raw.draw({ viewProjectionMatrix: identity });
    expect(rawContext.counters.drawCalls).toBe(0);
    raw.dispose(); renderer.dispose(); context.completeAll();
  });

  it("does not issue a draw if the device is disposed while draw state is queried", () => {
    const context = mockDevice();
    const renderer = VolumeRenderer.fromDevice(context.device, initial());
    context.hooks.parameter = (key) => {
      if (key === context.gl.DEPTH_RANGE) { delete context.hooks.parameter; context.disposeDevice(); }
    };
    expect(() => renderer.draw({ viewProjectionMatrix: identity })).toThrow(/disposed/i);
    expect(context.counters.drawCalls).toBe(0);
    context.completeAll();
    expect(textureBudgetUsage(context.device)).toBe(0);
  });

  it.each([
    (renderer: VolumeRenderer) => renderer.setDensity(0.5),
    (renderer: VolumeRenderer) => renderer.setSampleCount(8),
    (renderer: VolumeRenderer) => renderer.setClipPlanes([[1, 0, 0, 0]]),
    (renderer: VolumeRenderer) => renderer.setDomain([0, 2])
  ])("invalidates a retained frame when render-affecting state changes", (mutate) => {
    const context = mockDevice();
    const renderer = VolumeRenderer.fromDevice(context.device, initial());
    const lease = renderer.acquireFrameLease(context.device);
    mutate(renderer);
    expect(() => lease.assertCurrent()).toThrow();
    lease.release(); renderer.dispose(); context.completeAll();
    expect(textureBudgetUsage(context.device)).toBe(0);
  });
});
