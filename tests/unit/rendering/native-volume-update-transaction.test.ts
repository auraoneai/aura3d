import { describe, expect, it } from "vitest";
import { VolumeRenderer } from "../../../packages/rendering/src/VolumeRenderer";

type Handle = { readonly kind: string; readonly id: number };
type TextureUpload = { readonly dimensions: number[]; readonly data: number[] };

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const initial = () => ({ dimensions: [2, 1, 1] as const, data: new Float32Array([0, 1]) });
const replacement = () => ({ dimensions: [1, 2, 2] as const, data: new Uint16Array([10, 20, 30, 40]) });

/** Models GL resource identity and uploads only; it does not rasterize or exercise a GPU. */
function mockContext() {
  const names = ["MAX_3D_TEXTURE_SIZE", "ACTIVE_TEXTURE", "TEXTURE_BINDING_2D", "TEXTURE_BINDING_3D", "SAMPLER_BINDING",
    "UNPACK_ALIGNMENT", "UNPACK_ROW_LENGTH", "UNPACK_IMAGE_HEIGHT", "UNPACK_SKIP_PIXELS", "UNPACK_SKIP_ROWS", "UNPACK_SKIP_IMAGES",
    "UNPACK_FLIP_Y_WEBGL", "UNPACK_PREMULTIPLY_ALPHA_WEBGL", "UNPACK_COLORSPACE_CONVERSION_WEBGL", "PIXEL_UNPACK_BUFFER_BINDING", "PIXEL_UNPACK_BUFFER",
    "TEXTURE_2D", "TEXTURE_3D", "TEXTURE_WRAP_S", "TEXTURE_WRAP_T", "TEXTURE_WRAP_R", "TEXTURE_MIN_FILTER", "TEXTURE_MAG_FILTER", "CLAMP_TO_EDGE",
    "NEAREST", "LINEAR", "R32F", "RED", "FLOAT", "RGBA8", "RGBA", "UNSIGNED_BYTE", "R8", "VERTEX_SHADER", "FRAGMENT_SHADER", "COMPILE_STATUS",
    "LINK_STATUS", "CURRENT_PROGRAM", "VERTEX_ARRAY_BINDING", "BLEND", "DEPTH_TEST", "CULL_FACE", "DEPTH_WRITEMASK", "DEPTH_FUNC", "DEPTH_RANGE",
    "COLOR_WRITEMASK", "BLEND_SRC_RGB", "BLEND_DST_RGB", "BLEND_SRC_ALPHA", "BLEND_DST_ALPHA", "BLEND_EQUATION_RGB", "BLEND_EQUATION_ALPHA",
    "FUNC_ADD", "ONE", "ONE_MINUS_SRC_ALPHA", "LEQUAL", "TRIANGLES"];
  const gl: Record<string, any> = { canvas: new EventTarget(), NO_ERROR: 0, TEXTURE0: 1000, TEXTURE1: 1001, TEXTURE2: 1002 };
  names.forEach((name, index) => { gl[name] = index + 1; });
  let nextId = 0;
  let active = gl.TEXTURE0;
  let lost = false;
  let glError = gl.NO_ERROR;
  let textureAttempts = 0;
  let failTextureAttempt = -1;
  const textures: Handle[] = [];
  const deleted: Handle[] = [];
  const deletionAttempts: Handle[] = [];
  const uploads = new Map<Handle, TextureUpload>();
  const bindings = new Map<string, Handle | null>();
  const samplers = new Map<number, unknown>();
  const enabled = new Set<number>();
  const parameters = new Map<number, unknown>([
    [gl.MAX_3D_TEXTURE_SIZE, 64], [gl.UNPACK_ALIGNMENT, 4], [gl.UNPACK_ROW_LENGTH, 0], [gl.UNPACK_IMAGE_HEIGHT, 0],
    [gl.UNPACK_SKIP_PIXELS, 0], [gl.UNPACK_SKIP_ROWS, 0], [gl.UNPACK_SKIP_IMAGES, 0], [gl.UNPACK_FLIP_Y_WEBGL, 0],
    [gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0], [gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, 0], [gl.PIXEL_UNPACK_BUFFER_BINDING, null],
    [gl.CURRENT_PROGRAM, null], [gl.VERTEX_ARRAY_BINDING, null], [gl.DEPTH_WRITEMASK, true], [gl.DEPTH_FUNC, 77],
    [gl.DEPTH_RANGE, new Float32Array([0, 1])], [gl.COLOR_WRITEMASK, [true, true, true, true]],
    [gl.BLEND_SRC_RGB, 81], [gl.BLEND_DST_RGB, 82], [gl.BLEND_SRC_ALPHA, 83], [gl.BLEND_DST_ALPHA, 84],
    [gl.BLEND_EQUATION_RGB, 85], [gl.BLEND_EQUATION_ALPHA, 86]
  ]);
  const uniforms = new Map<string, number[]>();
  const hooks: { volume?: () => void; transfer?: () => void; delete?: (handle: Handle) => void;
    bind?: (target: number, texture: Handle | null) => void; pixelStore?: (key: number) => void;
    getParameter?: (key: number) => void } = {};
  let drawn: { volume: Handle; transfer: Handle; domain: number[]; dimensions: number[] } | null = null;
  const make = (kind: string): Handle => ({ kind, id: ++nextId });
  const bound = (unit: number, target: number) => bindings.get(`${gl.TEXTURE0 + unit}:${target}`) ?? null;
  const invoke = (kind: "volume" | "transfer") => { const hook = hooks[kind]; delete hooks[kind]; hook?.(); };
  gl.getParameter = (key: number) => {
    hooks.getParameter?.(key);
    if (key === gl.ACTIVE_TEXTURE) return active;
    if (key === gl.TEXTURE_BINDING_2D) return bindings.get(`${active}:${gl.TEXTURE_2D}`) ?? null;
    if (key === gl.TEXTURE_BINDING_3D) return bindings.get(`${active}:${gl.TEXTURE_3D}`) ?? null;
    if (key === gl.SAMPLER_BINDING) return samplers.get(active - gl.TEXTURE0) ?? null;
    return parameters.get(key);
  };
  gl.getError = () => { const error = glError; glError = gl.NO_ERROR; return error; };
  gl.isContextLost = () => lost;
  gl.activeTexture = (value: number) => { active = value; };
  gl.bindTexture = (target: number, texture: Handle | null) => { bindings.set(`${active}:${target}`, texture); hooks.bind?.(target, texture); };
  gl.bindSampler = (unit: number, sampler: unknown) => { samplers.set(unit, sampler); };
  gl.bindBuffer = (_target: number, buffer: unknown) => { parameters.set(gl.PIXEL_UNPACK_BUFFER_BINDING, buffer); };
  gl.pixelStorei = (key: number, value: unknown) => { parameters.set(key, value); hooks.pixelStore?.(key); };
  gl.createTexture = () => {
    textureAttempts++;
    if (textureAttempts === failTextureAttempt) return null;
    const texture = make("texture"); textures.push(texture); return texture;
  };
  gl.deleteTexture = (texture: Handle) => { deletionAttempts.push(texture); hooks.delete?.(texture); deleted.push(texture); };
  gl.createVertexArray = () => make("vao");
  gl.createShader = () => make("shader");
  gl.createProgram = () => make("program");
  for (const name of ["deleteVertexArray", "deleteShader", "deleteProgram", "shaderSource", "compileShader", "attachShader", "linkProgram", "texParameteri"]) gl[name] = () => {};
  gl.getShaderParameter = () => true;
  gl.getProgramParameter = () => true;
  gl.texImage3D = (...args: any[]) => {
    const texture = bound(0, gl.TEXTURE_3D)!;
    uploads.set(texture, { dimensions: args.slice(3, 6), data: Array.from(args[9] as Float32Array) });
    invoke("volume");
  };
  gl.texImage2D = (...args: any[]) => {
    const unit = active - gl.TEXTURE0;
    const texture = bound(unit, gl.TEXTURE_2D)!;
    uploads.set(texture, { dimensions: args.slice(3, 5), data: Array.from(args[8] as Uint8Array) });
    if (unit === 1) invoke("transfer");
  };
  gl.getUniformLocation = (_program: unknown, name: string) => name;
  gl.uniform2fv = (name: string, value: ArrayLike<number>) => { uniforms.set(name, Array.from(value)); };
  gl.uniform3iv = (name: string, value: ArrayLike<number>) => { uniforms.set(name, Array.from(value)); };
  for (const name of ["uniformMatrix4fv", "uniform1i", "uniform1f", "uniform4fv"]) gl[name] = () => {};
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
  gl.drawArrays = () => {
    drawn = { volume: bound(0, gl.TEXTURE_3D)!, transfer: bound(1, gl.TEXTURE_2D)!,
      domain: uniforms.get("u_domain")!, dimensions: uniforms.get("u_dimensions")! };
  };
  const context = gl as WebGL2RenderingContext;
  return {
    gl: context, hooks, textures, deleted, deletionAttempts, uploads,
    setError: (error: number) => { glError = error; },
    failAllocationAfter: (offset: number) => { failTextureAttempt = textureAttempts + offset; },
    snapshot: () => ({ active, bindings: [...bindings], samplers: [...samplers], unpack: [...parameters] }),
    draw: (renderer: VolumeRenderer) => { renderer.draw({ viewProjectionMatrix: identity }); return drawn!; },
    lose: () => { lost = true; context.canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true })); },
    restore: () => { lost = false; context.canvas.dispatchEvent(new Event("webglcontextrestored")); }
  };
}

describe("scalar volume texture transactions", () => {
  it("commits matching textures and an owned CPU copy, then restores that committed data", () => {
    const context = mockContext();
    const { gl } = context;
    const renderer = new VolumeRenderer(gl, { ...initial(), maxVoxels: 4 });
    gl.activeTexture(gl.TEXTURE2);
    const external = {} as WebGLTexture;
    gl.bindTexture(gl.TEXTURE_2D, external);
    const before = context.draw(renderer);
    const state = context.snapshot();
    const input = replacement();
    renderer.updateData(input);
    expect(context.snapshot()).toEqual(state);
    input.data[0] = 99;
    const after = context.draw(renderer);
    expect(after.volume).not.toBe(before.volume);
    expect(after.transfer).not.toBe(before.transfer);
    expect(after.dimensions).toEqual([1, 2, 2]);
    expect(after.domain).toEqual([10, 40]);
    expect(context.uploads.get(after.volume)?.data).toEqual([10, 20, 30, 40]);
    expect(context.deleted.filter((handle) => handle === before.volume)).toHaveLength(1);
    expect(context.deleted.filter((handle) => handle === before.transfer)).toHaveLength(1);
    expect(() => renderer.updateData({ dimensions: [5, 1, 1], data: new Float32Array(5) })).toThrow(/budget/);
    expect(context.draw(renderer)).toEqual(after);
    context.lose();
    context.restore();
    const restored = context.draw(renderer);
    expect(restored.dimensions).toEqual(after.dimensions);
    expect(restored.domain).toEqual(after.domain);
    expect(context.uploads.get(restored.volume)?.data).toEqual([10, 20, 30, 40]);
    renderer.dispose();
  });

  it("discards both staged textures when transfer upload fails after a scalar upload", () => {
    const context = mockContext();
    const renderer = new VolumeRenderer(context.gl, initial());
    const before = context.draw(renderer);
    const diagnostics = renderer.getDiagnostics();
    const state = context.snapshot();
    context.hooks.transfer = () => { throw new Error("transfer upload failed"); };
    expect(() => renderer.updateData(replacement())).toThrow("transfer upload failed");
    const staged = context.textures.slice(-2);
    expect(staged).not.toContain(before.volume);
    expect(staged).not.toContain(before.transfer);
    for (const texture of staged) expect(context.deleted.filter((handle) => handle === texture)).toHaveLength(1);
    expect(context.snapshot()).toEqual(state);
    expect(context.draw(renderer)).toEqual(before);
    expect(renderer.getDiagnostics()).toEqual(diagnostics);
    context.lose(); context.restore();
    const restored = context.draw(renderer);
    expect(context.uploads.get(restored.volume)?.data).toEqual([0, 1]);
    expect(restored.domain).toEqual([0, 1]);
    renderer.dispose();
  });

  it.each(["volume upload", "first allocation", "second allocation", "driver error", "preexisting error"])(
    "preserves the old resources and state on %s failure", (failure) => {
      const context = mockContext();
      const renderer = new VolumeRenderer(context.gl, initial());
      const before = context.draw(renderer);
      const start = context.textures.length;
      if (failure === "volume upload") context.hooks.volume = () => { throw new Error("volume upload failed"); };
      if (failure === "first allocation") context.failAllocationAfter(1);
      if (failure === "second allocation") context.failAllocationAfter(2);
      if (failure === "driver error") context.hooks.volume = () => { context.setError(0x0505); };
      if (failure === "preexisting error") context.setError(0x0502);
      expect(() => renderer.updateData(replacement())).toThrow();
      expect(context.draw(renderer)).toEqual(before);
      expect(renderer.getDiagnostics().dimensions).toEqual([2, 1, 1]);
      for (const staged of context.textures.slice(start)) expect(context.deleted).toContain(staged);
      expect(context.deleted).not.toContain(before.volume);
      expect(context.deleted).not.toContain(before.transfer);
      if (failure === "preexisting error") expect(context.textures).toHaveLength(start);
      renderer.dispose();
    }
  );

  it("does not change automatic transfer or domain behavior when their uploads fail", () => {
    const context = mockContext();
    const renderer = new VolumeRenderer(context.gl, initial());
    const before = context.draw(renderer);
    const custom = [{ value: 0, color: [1, 0, 0, 1] as const }, { value: 1, color: [1, 0, 0, 1] as const }];
    context.hooks.transfer = () => { throw new Error("transfer failed"); };
    expect(() => renderer.updateTransferFunction(custom)).toThrow("transfer failed");
    context.hooks.transfer = () => { throw new Error("domain failed"); };
    expect(() => renderer.setDomain([0, 100])).toThrow("domain failed");
    expect(context.draw(renderer)).toEqual(before);
    renderer.updateData(replacement());
    const after = context.draw(renderer);
    expect(after.domain).toEqual([10, 40]);
    const table = context.uploads.get(after.transfer)!.data;
    expect(table.slice(0, 4)).toEqual([0, 0, 0, 0]);
    expect(table.slice(-4)).toEqual([255, 255, 255, 13]);
    renderer.dispose();
  });

  it("keeps a fixed-domain transfer and detached custom stops when data is replaced", () => {
    const context = mockContext();
    const renderer = new VolumeRenderer(context.gl, { ...initial(), domain: [0, 100] });
    const custom: [{ value: number; color: [number, number, number, number] }, { value: number; color: [number, number, number, number] }] = [
      { value: 0, color: [1, 0, 0, 0] }, { value: 100, color: [0, 1, 0, 1] }
    ];
    renderer.updateTransferFunction(custom);
    custom[0].color[0] = 0;
    const before = context.draw(renderer);
    renderer.updateData(replacement());
    const after = context.draw(renderer);
    expect(after.domain).toEqual([0, 100]);
    expect(after.transfer).toBe(before.transfer);
    expect(context.deleted).not.toContain(before.transfer);
    context.lose(); context.restore();
    const restored = context.draw(renderer);
    expect(context.uploads.get(restored.transfer)?.data.slice(0, 4)).toEqual([255, 0, 0, 0]);
    expect(restored.domain).toEqual([0, 100]);
    renderer.dispose();
  });

  it("rejects reentrant texture updates and leaves the outer transaction coherent", () => {
    const context = mockContext();
    const renderer = new VolumeRenderer(context.gl, initial());
    let nested: unknown;
    context.hooks.volume = () => {
      try { renderer.setDomain([0, 100]); } catch (error) { nested = error; }
    };
    renderer.updateData(replacement());
    expect(String(nested)).toMatch(/already in progress/);
    const after = context.draw(renderer);
    expect(after.domain).toEqual([10, 40]);
    expect(context.uploads.get(after.volume)?.data).toEqual([10, 20, 30, 40]);
    renderer.dispose();
  });

  it("does not publish staged textures after a context loss and restoration", () => {
    const context = mockContext();
    const renderer = new VolumeRenderer(context.gl, initial());
    const before = context.draw(renderer);
    const stagedIndex = context.textures.length;
    context.hooks.volume = () => { context.lose(); context.restore(); };
    expect(() => renderer.updateData(replacement())).toThrow(/changed during texture update/);
    const after = context.draw(renderer);
    expect(after.volume).not.toBe(before.volume);
    expect(context.deleted).not.toContain(context.textures[stagedIndex]);
    expect(after.dimensions).toEqual([2, 1, 1]);
    expect(after.domain).toEqual([0, 1]);
    expect(context.uploads.get(after.volume)?.data).toEqual([0, 1]);
    renderer.dispose();
  });

  it("restores caller unpack state if capturing texture state fails partway through", () => {
    const context = mockContext();
    const renderer = new VolumeRenderer(context.gl, initial());
    context.gl.activeTexture(context.gl.TEXTURE2);
    context.gl.pixelStorei(context.gl.UNPACK_ALIGNMENT, 8);
    context.gl.pixelStorei(context.gl.UNPACK_ROW_LENGTH, 9);
    const before = context.draw(renderer);
    const state = context.snapshot();
    const count = context.textures.length;
    context.hooks.pixelStore = (key) => {
      if (key === context.gl.UNPACK_ROW_LENGTH) { delete context.hooks.pixelStore; throw new Error("capture failed"); }
    };
    expect(() => renderer.updateData(replacement())).toThrow("capture failed");
    expect(context.snapshot()).toEqual(state);
    expect(context.textures).toHaveLength(count);
    expect(context.draw(renderer)).toEqual(before);
    renderer.dispose();
  });

  it("retires staged resources if disposal happens during an upload", () => {
    const context = mockContext();
    const renderer = new VolumeRenderer(context.gl, initial());
    const start = context.textures.length;
    context.hooks.volume = () => renderer.dispose();
    expect(() => renderer.updateData(replacement())).toThrow(/disposed/);
    for (const texture of context.textures.slice(start)) expect(context.deleted).toContain(texture);
    expect(renderer.getDiagnostics().retainedCpuBytes).toBe(0);
    renderer.dispose();
  });

  it("does not recreate resources if disposal happens while dimensions are validated", () => {
    const context = mockContext();
    const renderer = new VolumeRenderer(context.gl, initial());
    const count = context.textures.length;
    context.hooks.getParameter = (key) => {
      if (key === context.gl.MAX_3D_TEXTURE_SIZE) {
        delete context.hooks.getParameter;
        renderer.dispose();
      }
    };
    expect(() => renderer.updateData(replacement())).toThrow(/disposed/);
    expect(context.textures).toHaveLength(count);
    expect(context.deleted).toEqual(context.textures);
    expect(renderer.getDiagnostics().retainedCpuBytes).toBe(0);
  });

  it("cleans partial restoration if disposal happens during its volume upload", () => {
    const context = mockContext();
    const renderer = new VolumeRenderer(context.gl, initial());
    context.lose();
    const start = context.textures.length;
    context.hooks.volume = () => renderer.dispose();
    context.restore();
    const recreated = context.textures.slice(start);
    expect(recreated).toHaveLength(3);
    for (const texture of recreated) expect(context.deleted.filter((handle) => handle === texture)).toHaveLength(1);
    expect(renderer.getDiagnostics()).toMatchObject({ disposed: true, gpuBytes: 0, retainedCpuBytes: 0 });
    expect(() => context.draw(renderer)).toThrow(/disposed/);
  });

  it("retains a failed restoration texture deletion for disposal retry", () => {
    const context = mockContext();
    const renderer = new VolumeRenderer(context.gl, initial());
    context.lose();
    const start = context.textures.length;
    context.hooks.delete = (texture) => {
      if (texture === context.textures[start]) throw new Error("delete failed");
    };
    context.hooks.volume = () => renderer.dispose();
    context.restore();
    const failedTexture = context.textures[start];
    expect(context.deleted).not.toContain(failedTexture);
    expect(renderer.getDiagnostics()).toMatchObject({ disposed: true, gpuBytes: 2 * 4 });
    expect(() => renderer.dispose()).toThrow(/texture cleanup failed/);
    delete context.hooks.delete;
    renderer.dispose();
    expect(context.deleted).toContain(failedTexture);
    expect(renderer.getDiagnostics().gpuBytes).toBe(0);
  });

  it("rejects reentrant draw and update while a lost context is rebuilding resources", () => {
    const context = mockContext();
    const renderer = new VolumeRenderer(context.gl, initial());
    context.lose();
    let updateError: unknown;
    let drawError: unknown;
    context.hooks.volume = () => {
      try { renderer.setDomain([0, 5]); } catch (error) { updateError = error; }
      try { context.draw(renderer); } catch (error) { drawError = error; }
    };
    context.restore();
    expect(String(updateError)).toMatch(/already in progress/);
    expect(String(drawError)).toMatch(/already in progress/);
    const restored = context.draw(renderer);
    expect(restored.domain).toEqual([0, 1]);
    expect(context.uploads.get(restored.volume)?.data).toEqual([0, 1]);
    renderer.dispose();
  });

  it("keeps the latest restored generation if another loss occurs during recreation", () => {
    const context = mockContext();
    const renderer = new VolumeRenderer(context.gl, initial());
    context.lose();
    const start = context.textures.length;
    context.hooks.volume = () => { context.lose(); context.restore(); };
    context.restore();
    const invalidGeneration = context.textures.slice(start, start + 3);
    const restored = context.draw(renderer);
    for (const texture of invalidGeneration) expect(context.deleted).not.toContain(texture);
    expect(invalidGeneration).not.toContain(restored.volume);
    expect(context.uploads.get(restored.volume)?.data).toEqual([0, 1]);
    renderer.dispose();
  });

  it("reports a committed cleanup failure and retries it before another update", () => {
    const context = mockContext();
    const renderer = new VolumeRenderer(context.gl, initial());
    const before = context.draw(renderer);
    let failed = false;
    context.hooks.delete = (texture) => {
      if (texture === before.volume && !failed) { failed = true; throw new Error("delete failed"); }
    };
    expect(() => renderer.updateData(replacement())).toThrow(/committed, but old texture cleanup failed/);
    const committed = context.draw(renderer);
    expect(committed.domain).toEqual([10, 40]);
    expect(renderer.getDiagnostics().gpuBytes).toBe(4 * 4 + 256 * 4 + 1 + 2 * 4);
    expect(context.deleted).not.toContain(before.volume);
    expect(context.deleted).toContain(before.transfer);
    renderer.setDomain([0, 50]);
    expect(context.deleted).toContain(before.volume);
    expect(context.deletionAttempts.filter((texture) => texture === before.volume)).toHaveLength(2);
    expect(context.draw(renderer).domain).toEqual([0, 50]);
    expect(renderer.getDiagnostics().gpuBytes).toBe(4 * 4 + 256 * 4 + 1);
    renderer.dispose();
  });

  it("retains a failed staged cleanup for retry and blocks additional allocations until it succeeds", () => {
    const context = mockContext();
    const renderer = new VolumeRenderer(context.gl, initial());
    const before = context.draw(renderer);
    const start = context.textures.length;
    context.hooks.delete = (texture) => {
      if (texture === context.textures[start]) throw new Error("delete failed");
    };
    context.hooks.transfer = () => { throw new Error("upload failed"); };
    let failure: unknown;
    try { renderer.updateData(replacement()); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors[0]).toMatchObject({ message: "upload failed" });
    expect(context.draw(renderer)).toEqual(before);
    const count = context.textures.length;
    expect(() => renderer.updateData(replacement())).toThrow(/texture cleanup failed/);
    expect(context.textures).toHaveLength(count);
    delete context.hooks.delete;
    renderer.updateData(replacement());
    expect(context.deleted).toContain(context.textures[start]);
    expect(context.draw(renderer).domain).toEqual([10, 40]);
    renderer.dispose();
  });

  it("preserves both upload and caller-state restoration errors", () => {
    const context = mockContext();
    const renderer = new VolumeRenderer(context.gl, initial());
    const before = context.draw(renderer);
    context.hooks.transfer = () => {
      context.hooks.bind = () => { delete context.hooks.bind; throw new Error("restore failed"); };
      throw new Error("upload failed");
    };
    let failure: unknown;
    try { renderer.updateData(replacement()); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors.map((error: Error) => error.message)).toEqual(["upload failed", "restore failed"]);
    expect(context.draw(renderer)).toEqual(before);
    renderer.dispose();
  });
});
