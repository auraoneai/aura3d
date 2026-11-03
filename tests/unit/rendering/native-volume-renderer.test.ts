import { describe, expect, it } from "vitest";
import { VolumeRenderer, buildVolumeTransferTable } from "../../../packages/rendering/src/VolumeRenderer";
import type { RenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { registerWebGL2DeviceHost } from "../../../packages/rendering/src/webgl2/Counters";
import type { WebGL2DeviceHost } from "../../../packages/rendering/src/webgl2/DeviceHost";

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const field = () => ({ dimensions: [2, 2, 2] as const, data: new Float32Array([0, 1, 2, 3, 4, 5, 6, 7]) });

/** GL-shaped test double; it does not rasterize or claim GPU/browser coverage. */
function mockContext() {
  const constants = ["MAX_3D_TEXTURE_SIZE", "ACTIVE_TEXTURE", "TEXTURE_BINDING_2D", "TEXTURE_BINDING_3D", "SAMPLER_BINDING",
    "UNPACK_ALIGNMENT", "UNPACK_ROW_LENGTH", "UNPACK_IMAGE_HEIGHT", "UNPACK_SKIP_PIXELS", "UNPACK_SKIP_ROWS", "UNPACK_SKIP_IMAGES",
    "PIXEL_UNPACK_BUFFER_BINDING", "PIXEL_UNPACK_BUFFER", "TEXTURE_2D", "TEXTURE_3D", "TEXTURE_WRAP_S", "TEXTURE_WRAP_T", "TEXTURE_WRAP_R",
    "TEXTURE_MIN_FILTER", "TEXTURE_MAG_FILTER", "CLAMP_TO_EDGE", "NEAREST", "LINEAR", "R32F", "RED", "FLOAT", "RGBA8", "RGBA", "UNSIGNED_BYTE", "R8",
    "VERTEX_SHADER", "FRAGMENT_SHADER", "COMPILE_STATUS", "LINK_STATUS", "CURRENT_PROGRAM", "VERTEX_ARRAY_BINDING", "BLEND", "DEPTH_TEST", "CULL_FACE",
    "DEPTH_WRITEMASK", "DEPTH_FUNC", "DEPTH_RANGE", "COLOR_WRITEMASK", "BLEND_SRC_RGB", "BLEND_DST_RGB", "BLEND_SRC_ALPHA", "BLEND_DST_ALPHA",
    "BLEND_EQUATION_RGB", "BLEND_EQUATION_ALPHA", "FUNC_ADD", "ONE", "ONE_MINUS_SRC_ALPHA", "LEQUAL", "TRIANGLES", "GEQUAL"];
  const gl: Record<string, any> = { canvas: new EventTarget(), TEXTURE0: 1000, TEXTURE1: 1001, TEXTURE2: 1002 };
  constants.forEach((key, index) => { gl[key] = index + 1; });
  const calls: Record<string, unknown[][]> = {};
  const record = (name: string, ...args: unknown[]) => { (calls[name] ??= []).push(args); };
  let resource = 0;
  const make = (kind: string) => ({ kind, id: ++resource });
  let active = gl.TEXTURE0;
  let lost = false;
  let failDraw = false;
  const bindings = new Map<string, unknown>();
  const samplers = new Map<number, unknown>();
  const enabled = new Set<number>();
  const parameters = new Map<number, unknown>([
    [gl.MAX_3D_TEXTURE_SIZE, 256], [gl.UNPACK_ALIGNMENT, 4], [gl.UNPACK_ROW_LENGTH, 0], [gl.UNPACK_IMAGE_HEIGHT, 0],
    [gl.UNPACK_SKIP_PIXELS, 0], [gl.UNPACK_SKIP_ROWS, 0], [gl.UNPACK_SKIP_IMAGES, 0], [gl.PIXEL_UNPACK_BUFFER_BINDING, null],
    [gl.CURRENT_PROGRAM, null], [gl.VERTEX_ARRAY_BINDING, null], [gl.DEPTH_WRITEMASK, true], [gl.DEPTH_FUNC, 77], [gl.DEPTH_RANGE, new Float32Array([0, 1])],
    [gl.COLOR_WRITEMASK, [true, false, true, false]], [gl.BLEND_SRC_RGB, 81], [gl.BLEND_DST_RGB, 82],
    [gl.BLEND_SRC_ALPHA, 83], [gl.BLEND_DST_ALPHA, 84], [gl.BLEND_EQUATION_RGB, 85], [gl.BLEND_EQUATION_ALPHA, 86]
  ]);
  gl.getParameter = (key: number) => {
    if (key === gl.ACTIVE_TEXTURE) return active;
    if (key === gl.TEXTURE_BINDING_2D) return bindings.get(`${active}:${gl.TEXTURE_2D}`) ?? null;
    if (key === gl.TEXTURE_BINDING_3D) return bindings.get(`${active}:${gl.TEXTURE_3D}`) ?? null;
    if (key === gl.SAMPLER_BINDING) return samplers.get(active - gl.TEXTURE0) ?? null;
    return parameters.get(key);
  };
  gl.isContextLost = () => lost;
  gl.activeTexture = (value: number) => { active = value; };
  gl.bindTexture = (target: number, texture: unknown) => { bindings.set(`${active}:${target}`, texture); };
  gl.bindSampler = (unit: number, sampler: unknown) => { samplers.set(unit, sampler); };
  gl.bindBuffer = (_target: number, buffer: unknown) => { parameters.set(gl.PIXEL_UNPACK_BUFFER_BINDING, buffer); };
  gl.pixelStorei = (key: number, value: unknown) => { parameters.set(key, value); };
  gl.createTexture = () => { const texture = make("texture"); record("createTexture", texture); return texture; };
  gl.createVertexArray = () => make("vao");
  gl.createShader = () => make("shader");
  gl.createProgram = () => make("program");
  for (const name of ["deleteTexture", "deleteVertexArray", "deleteShader", "deleteProgram", "shaderSource", "compileShader", "attachShader", "linkProgram", "texParameteri", "texImage2D", "texImage3D"]) {
    gl[name] = (...args: unknown[]) => { record(name, ...args); };
  }
  gl.getShaderParameter = () => true;
  gl.getProgramParameter = () => true;
  gl.getUniformLocation = (_program: unknown, name: string) => name;
  for (const name of ["uniformMatrix4fv", "uniform3iv", "uniform2fv", "uniform1i", "uniform1f", "uniform4fv"]) {
    gl[name] = (...args: unknown[]) => { record(name, ...args); };
  }
  gl.useProgram = (program: unknown) => { parameters.set(gl.CURRENT_PROGRAM, program); };
  gl.bindVertexArray = (vao: unknown) => { parameters.set(gl.VERTEX_ARRAY_BINDING, vao); };
  gl.isEnabled = (value: number) => enabled.has(value);
  gl.enable = (value: number) => { enabled.add(value); };
  gl.disable = (value: number) => { enabled.delete(value); };
  gl.depthMask = (value: boolean) => { parameters.set(gl.DEPTH_WRITEMASK, value); };
  gl.depthFunc = (value: number) => { parameters.set(gl.DEPTH_FUNC, value); };
  gl.colorMask = (...value: boolean[]) => { parameters.set(gl.COLOR_WRITEMASK, value); };
  gl.blendFuncSeparate = (...values: number[]) => {
    [gl.BLEND_SRC_RGB, gl.BLEND_DST_RGB, gl.BLEND_SRC_ALPHA, gl.BLEND_DST_ALPHA].forEach((key, i) => parameters.set(key, values[i]));
  };
  gl.blendEquationSeparate = (rgb: number, alpha: number) => { parameters.set(gl.BLEND_EQUATION_RGB, rgb); parameters.set(gl.BLEND_EQUATION_ALPHA, alpha); };
  gl.drawArrays = (...args: unknown[]) => { record("drawArrays", ...args); if (failDraw) throw new Error("draw failed"); };
  const snapshot = () => ({ active, bindings: [...bindings.entries()], samplers: [...samplers.entries()],
    enabled: [...enabled], parameters: [...parameters.entries()] });
  return { gl: gl as WebGL2RenderingContext, calls, snapshot,
    setLost: (value: boolean) => { lost = value; }, setDrawFailure: (value: boolean) => { failDraw = value; } };
}

describe("scalar volume rendering", () => {
  it("interpolates transfer stops in data units and clamps outside endpoints", () => {
    const table = buildVolumeTransferTable([0, 10], [
      { value: 2, color: [1, 0, 0, 0] }, { value: 8, color: [0, 0, 1, 1] }
    ]);
    expect([...table.slice(0, 4)]).toEqual([255, 0, 0, 0]);
    expect([...table.slice(-4)]).toEqual([0, 0, 255, 255]);
    expect([...table.slice(128 * 4, 128 * 4 + 4)]).toEqual([127, 0, 128, 128]);
    expect(() => buildVolumeTransferTable([0, 1], [{ value: 0, color: [0, 0, 0, 1] }, { value: 0, color: [1, 1, 1, 1] }])).toThrow(/ordered/);
    expect(() => buildVolumeTransferTable([1, 1 + Number.EPSILON], [{ value: 0, color: [0, 0, 0, 1] }, { value: 1, color: [1, 1, 1, 1] }])).toThrow(/float32/);
  });

  it("rejects invalid data, limits, domains and clipping before uploading", () => {
    const { gl, calls } = mockContext();
    expect(() => new VolumeRenderer(gl, { ...field(), dimensions: [2, 2, 3] })).toThrow(/length/);
    expect(() => new VolumeRenderer(gl, { ...field(), maxVoxels: 7 })).toThrow(/budget/);
    expect(() => new VolumeRenderer(gl, { ...field(), sampleCount: 513 })).toThrow(/sampleCount/);
    expect(() => new VolumeRenderer(gl, { ...field(), data: new Float32Array([0, 0, 0, 0, 0, 0, 0, NaN]) })).toThrow(/finite/);
    expect(() => new VolumeRenderer(gl, { ...field(), domain: [1, 1] })).toThrow(/domain/);
    expect(() => new VolumeRenderer(gl, { ...field(), clipPlanes: [[0, 0, 0, 1]] })).toThrow(/nonzero/);
    expect(calls.texImage3D).toBeUndefined();
  });

  it("uploads a detached scalar field and sends transforms, clipping and slice state to the GPU", () => {
    const { gl, calls } = mockContext();
    const source = field();
    const renderer = new VolumeRenderer(gl, { ...source, clipPlanes: [[1, 0, 0, -0.5]], sampleCount: 64 });
    const uploaded = calls.texImage3D[0][9] as Float32Array;
    expect([...uploaded]).toEqual([...source.data]);
    source.data[0] = 99;
    expect(uploaded[0]).toBe(0);
    renderer.draw({ viewProjectionMatrix: identity, modelMatrix: [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1],
      mode: { type: "slice", axis: "z", position: 0.25 } });
    expect(calls.drawArrays).toHaveLength(1);
    const uniforms = new Map(calls.uniform1i.map(([name, value]) => [name, value]));
    expect(uniforms.get("u_sliceAxis")).toBe(2);
    expect(uniforms.get("u_steps")).toBe(64);
    expect(uniforms.get("u_planeCount")).toBe(1);
    const plane = calls.uniform4fv.find(([name]) => name === "u_planes[0]")?.[1] as Float32Array;
    expect([...plane.slice(0, 4)]).toEqual([1, 0, 0, -0.5]);
    const inverse = calls.uniformMatrix4fv.find(([name]) => name === "u_inverseMvp")?.[2] as Float32Array;
    expect(inverse[0]).toBe(0.5);
    expect(inverse[12]).toBe(-0.5);
    expect(() => renderer.draw({ viewProjectionMatrix: Array(16).fill(0) })).toThrow(/invertible/);
    expect(() => renderer.draw({ viewProjectionMatrix: identity, mode: { type: "slice", axis: "z", position: 2 } })).toThrow(/slice/);
    renderer.dispose();
  });

  it.each([
    ["int8", () => new Int8Array([-128, -9, -1, 0, 1, 9, 42, 127]), [-128, 127]],
    ["int16", () => new Int16Array([-32768, -257, -1, 0, 1, 257, 2048, 32767]), [-32768, 32767]]
  ] as const)("uploads %s samples exactly and recomputes their signed domain", (_type, makeSamples, expectedDomain) => {
    const { gl, calls } = mockContext();
    const source = makeSamples();
    const expected = [...source];
    const renderer = new VolumeRenderer(gl, { dimensions: [2, 2, 2], data: source });
    const initial = calls.texImage3D[0][9] as Float32Array;
    expect(initial).toBeInstanceOf(Float32Array);
    expect([...initial]).toEqual(expected);
    source[0] = 0;
    expect(initial[0]).toBe(expected[0]);
    renderer.draw({ viewProjectionMatrix: identity });
    expect([...(calls.uniform2fv.find(([name]) => name === "u_domain")?.[1] as Float32Array)]).toEqual(expectedDomain);

    const next = new Int16Array([-12, -4, 3, 11]);
    renderer.updateData({ dimensions: [2, 2, 1], data: next });
    expect([...(calls.texImage3D.at(-1)?.[9] as Float32Array)]).toEqual([...next]);
    renderer.draw({ viewProjectionMatrix: identity });
    const domainCalls = calls.uniform2fv.filter(([name]) => name === "u_domain");
    expect([...(domainCalls.at(-1)?.[1] as Float32Array)]).toEqual([-12, 11]);
    expect(() => renderer.updateData({ dimensions: [2, 2, 1], data: new Int32Array(4) as never })).toThrow(/data must be/);
    expect(renderer.getDiagnostics().voxelCount).toBe(4);
    renderer.dispose();
    expect(renderer.getDiagnostics().retainedCpuBytes).toBe(0);
  });

  it("follows the frame depth convention for the entry ray, opaque clip, depth test and fragment depth", () => {
    const { gl, calls } = mockContext();
    const renderer = new VolumeRenderer(gl, field());
    const last = (name: string, uniform: string) => calls[name]?.filter(([key]) => key === uniform).at(-1)?.[1];
    const depthFuncs: unknown[] = [];
    const depthFunc = gl.depthFunc.bind(gl);
    (gl as unknown as { depthFunc: (value: number) => void }).depthFunc = (value: number) => { depthFuncs.push(value); depthFunc(value); };
    renderer.draw({ viewProjectionMatrix: identity });
    expect([last("uniform1i", "u_depthMode"), last("uniform1i", "u_clipZeroToOne")]).toEqual([0, 0]);
    expect(depthFuncs.at(-2)).toBe(gl.LEQUAL);
    renderer.draw({ viewProjectionMatrix: identity, depth: { mode: "reversed", clipRange: "zero-to-one" } });
    expect([last("uniform1i", "u_depthMode"), last("uniform1i", "u_clipZeroToOne")]).toEqual([1, 1]);
    expect(depthFuncs.at(-2)).toBe(gl.GEQUAL);
    renderer.draw({ viewProjectionMatrix: identity, depth: { mode: "logarithmic", clipRange: "minus-one-to-one", logRange: { near: 0.5, far: 400, kind: "orthographic" } } });
    expect([last("uniform1i", "u_depthMode"), last("uniform1i", "u_logOrthographic")]).toEqual([2, 1]);
    expect([...(last("uniform2fv", "u_logRange") as Float32Array)]).toEqual([0.5, 400]);
    expect(depthFuncs.at(-2)).toBe(gl.LEQUAL);
    expect(() => renderer.draw({ viewProjectionMatrix: identity, depth: { mode: "logarithmic", clipRange: "minus-one-to-one" } })).toThrow(/near < far/);
    expect(() => renderer.draw({ viewProjectionMatrix: identity, depth: { mode: "standard", clipRange: "zero-to-one" } })).toThrow(/zero-to-one/);
    // The fragment stage converts with the same convention plumbing.
    const fragment = String(calls.shaderSource?.map(([, source]) => source).find((source) => String(source).includes("gl_FragDepth")));
    expect(fragment).toContain("float nearZ = u_depthMode == 1 ? 1.0 : lowZ;");
    expect(fragment).toContain("float side = u_depthMode == 1 ? -1.0 : 1.0;");
    expect(fragment).toContain("gl_FragDepth = u_depthMode == 2 ? standardWindowToLog(clamp(ndcDepth, 0.0, 1.0))");
    renderer.dispose();
  });

  it("restores the caller's GL bindings and draw state even on errors", () => {
    const context = mockContext();
    const { gl } = context;
    const externalTexture = {} as WebGLTexture;
    const externalSampler = {} as WebGLSampler;
    const externalProgram = {} as WebGLProgram;
    const externalVao = {} as WebGLVertexArrayObject;
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, externalTexture);
    gl.bindSampler(2, externalSampler);
    gl.useProgram(externalProgram);
    gl.bindVertexArray(externalVao);
    gl.enable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    const renderer = new VolumeRenderer(gl, field());
    const before = context.snapshot();
    context.setDrawFailure(true);
    expect(() => renderer.draw({ viewProjectionMatrix: identity, sceneDepth: {} as WebGLTexture })).toThrow("draw failed");
    expect(context.snapshot()).toEqual(before);
    renderer.dispose();
  });

  it("updates data/transfer, restores after context loss and disposes exactly once", () => {
    const context = mockContext();
    const { gl, calls } = context;
    const renderer = new VolumeRenderer(gl, field());
    const initialTextures = calls.createTexture.map(([texture]) => texture);
    const custom = [{ value: 0, color: [1, 0, 0, 0] as const }, { value: 7, color: [0, 1, 0, 1] as const }];
    renderer.updateTransferFunction(custom);
    const replacementTransfer = calls.createTexture.at(-1)?.[0];
    expect(() => renderer.updateData({ dimensions: [1, 1, 1], data: new Float32Array([NaN]) })).toThrow(/finite/);
    expect(renderer.getDiagnostics().voxelCount).toBe(8);
    renderer.updateData({ dimensions: [1, 1, 1], data: new Uint16Array([7]) });
    const updatedTextures = calls.createTexture.slice(-2).map(([texture]) => texture);
    expect(renderer.getDiagnostics().voxelCount).toBe(1);
    const transferAfterUpdate = calls.texImage2D.at(-1)?.[8] as Uint8Array;
    expect([...transferAfterUpdate.slice(128 * 4, 128 * 4 + 4)]).toEqual([0, 255, 0, 255]);
    context.setLost(true);
    const loss = new Event("webglcontextlost", { cancelable: true });
    gl.canvas.dispatchEvent(loss);
    expect(loss.defaultPrevented).toBe(true);
    expect(() => renderer.draw({ viewProjectionMatrix: identity })).toThrow(/lost/);
    context.setLost(false);
    gl.canvas.dispatchEvent(new Event("webglcontextrestored"));
    const restoredTextures = calls.createTexture.slice(-3).map(([texture]) => texture);
    expect(calls.texImage3D).toHaveLength(3);
    renderer.draw({ viewProjectionMatrix: identity });
    renderer.dispose();
    renderer.dispose();
    const deleted = calls.deleteTexture.map(([texture]) => texture);
    for (const texture of [initialTextures[0], initialTextures[1], replacementTransfer, ...restoredTextures]) {
      expect(deleted.filter((candidate) => candidate === texture)).toHaveLength(1);
    }
    // The context loss releases the old generation, so those handles are not
    // explicitly deleted after restoration.
    for (const texture of [initialTextures[2], ...updatedTextures]) expect(deleted).not.toContain(texture);
    expect(calls.deleteProgram).toHaveLength(1);
    expect(calls.deleteVertexArray).toHaveLength(1);
    expect(renderer.getDiagnostics().retainedCpuBytes).toBe(0);
    expect(() => renderer.draw({ viewProjectionMatrix: identity })).toThrow(/disposed/);
  });

  it("accepts a registered Aura3D WebGL2 device and reports unsupported backends", () => {
    const { gl } = mockContext();
    const device = { kind: "webgl2", disposed: false, contextLost: false } as unknown as RenderDevice;
    const host = {
      device, gl,
      lifecycle: { onDeviceLost: () => () => {}, onDeviceRestored: () => () => {} },
      stateCache: { invalidate() {} }, counters: { drawCalls: 0 },
      textureRegistry: {
        registerNativeTextureOwner: () => () => {},
        retireNativeTexturesAfterStack: (handles: readonly WebGLTexture[], release: () => void) => {
          for (const handle of handles) gl.deleteTexture(handle);
          release();
          return Promise.resolve();
        }
      }
    } as unknown as WebGL2DeviceHost;
    registerWebGL2DeviceHost(host);
    const renderer = VolumeRenderer.fromDevice(device, field());
    expect(renderer.getDiagnostics().backend).toBe("webgl2");
    renderer.dispose();
    const unsupported = { kind: "webgpu", disposed: false, contextLost: false } as unknown as RenderDevice;
    expect(() => VolumeRenderer.fromDevice(unsupported, field())).toThrow(/backend 'webgpu' is unsupported/);
  });
});
