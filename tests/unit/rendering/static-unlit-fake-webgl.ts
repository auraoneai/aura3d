import { vi } from "vitest";
import { WebGL2Device } from "../../../packages/rendering/src/WebGL2Device";

type FakeBuffer = { readonly id: number; bytes: Uint8Array; deleted?: boolean };
type FakeVao = { readonly id: number; element: FakeBuffer | null };
type FakeTexture = { readonly id: number; deleted?: boolean };
type FakeRenderbuffer = { readonly id: number; deleted?: boolean };
type FakeSampler = { readonly id: number; deleted?: boolean };
type FakeFramebuffer = {
  readonly id: number;
  readonly attachments: Map<number, FakeTexture | FakeRenderbuffer | null>;
  deleted?: boolean;
};
type FakeShader = { readonly id: number; source: string };
type ActiveVariable = { readonly name: string; readonly type: number; readonly size: number };
type FakeProgram = {
  readonly id: number;
  readonly shaders: FakeShader[];
  readonly values: Map<string, number | Float32Array>;
  uniforms: ActiveVariable[];
  attributes: ActiveVariable[];
};
type FakeLocation = { readonly program: FakeProgram; readonly name: string };
export type FakeNativeDraw = {
  readonly name: string;
  readonly args: readonly unknown[];
  readonly program: FakeProgram | null;
  /** Copies captured at native draw entry, before any later state restoration. */
  readonly uniforms: ReadonlyMap<string, number | Float32Array>;
};

/** A deterministic fake, not a WebGL compiler or evidence of driver behavior. */
export function fakeWebGLCanvas() {
  const constants = new Map<string, number>([
    ["NO_ERROR", 0], ["FLOAT", 0x1406], ["FLOAT_VEC3", 0x8b51], ["FLOAT_VEC4", 0x8b52],
    ["FLOAT_MAT4", 0x8b5c], ["UNSIGNED_SHORT", 0x1403], ["UNSIGNED_INT", 0x1405],
    ["ARRAY_BUFFER", 0x8892], ["ELEMENT_ARRAY_BUFFER", 0x8893],
    ["FRAMEBUFFER", 0x8d40], ["FRAMEBUFFER_BINDING", 0x8ca6], ["DRAW_FRAMEBUFFER_BINDING", 0x8ca6],
    ["DRAW_FRAMEBUFFER", 0x8ca9], ["READ_FRAMEBUFFER", 0x8ca8], ["READ_FRAMEBUFFER_BINDING", 0x8caa],
    ["FRAMEBUFFER_COMPLETE", 0x8cd5], ["RENDERBUFFER", 0x8d41], ["RENDERBUFFER_BINDING", 0x8ca7],
    ["TEXTURE0", 0x84c0], ["ACTIVE_TEXTURE", 0x84e0], ["TEXTURE_2D", 0x0de1], ["TEXTURE_BINDING_2D", 0x8069],
    ["TEXTURE_CUBE_MAP", 0x8513], ["TEXTURE_BINDING_CUBE_MAP", 0x8514], ["TEXTURE_CUBE_MAP_POSITIVE_X", 0x8515],
    ["TEXTURE_2D_ARRAY", 0x8c1a], ["TEXTURE_BINDING_2D_ARRAY", 0x8c1d], ["TEXTURE_3D", 0x806f],
    ["TEXTURE_BINDING_3D", 0x806a], ["SAMPLER_BINDING", 0x8919], ["COLOR_ATTACHMENT0", 0x8ce0],
    ["INVALID_INDEX", 0xffffffff]
  ]);
  const value = (name: string): number => {
    if (!constants.has(name)) constants.set(name, 0x10000 + constants.size);
    return constants.get(name)!;
  };
  const listeners = new Map<string, Set<EventListener>>();
  const boundBuffers = new Map<number, FakeBuffer | null>();
  const boundTextures = new Map<number, Map<number, FakeTexture | null>>();
  const boundSamplers = new Map<number, FakeSampler | null>();
  const enabled = new Set<number>();
  const calls: { readonly name: string; readonly args: readonly unknown[] }[] = [];
  const nativeDraws: FakeNativeDraw[] = [];
  const matrixUploads: { readonly name: string; readonly data: readonly number[]; readonly program: FakeProgram }[] = [];
  const state = {
    lost: false,
    failInstanced: false,
    failBufferSubData: false,
    onNativeDraw: undefined as undefined | ((draw: FakeNativeDraw) => void),
    currentProgram: null as FakeProgram | null,
    currentVao: null as FakeVao | null,
    defaultElement: null as FakeBuffer | null,
    currentColor: new Float32Array([1, 1, 1, 1]),
    activeQuery: null as object | null,
    currentFramebuffer: null as FakeFramebuffer | null,
    readFramebuffer: null as FakeFramebuffer | null,
    currentRenderbuffer: null as FakeRenderbuffer | null,
    activeTexture: value("TEXTURE0"),
    viewport: new Int32Array([0, 0, 128, 128]),
    nextId: 0,
    maxVertexUniformVectors: 256
  };
  const nextId = () => ++state.nextId;
  const textureUnit = () => state.activeTexture - value("TEXTURE0");
  const textureBinding = (target: number) => boundTextures.get(textureUnit())?.get(target) ?? null;
  const framebufferBinding = (target: number) =>
    target === value("READ_FRAMEBUFFER") ? state.readFramebuffer : state.currentFramebuffer;
  const methods: Record<string, unknown> = {
    drawingBufferWidth: 128,
    drawingBufferHeight: 128,
    getContextAttributes: () => ({ stencil: true, antialias: false, alpha: false, premultipliedAlpha: false }),
    getError: () => value("NO_ERROR"),
    isContextLost: () => state.lost,
    getExtension: (name: string) => name === "EXT_color_buffer_float" || name === "OES_texture_float_linear" ? {} : null,
    getParameter: (parameter: number) => {
      if (parameter === value("CURRENT_PROGRAM")) return state.currentProgram;
      if (parameter === value("VERTEX_ARRAY_BINDING")) return state.currentVao;
      if (parameter === value("ARRAY_BUFFER_BINDING")) return boundBuffers.get(value("ARRAY_BUFFER")) ?? null;
      if (parameter === value("ELEMENT_ARRAY_BUFFER_BINDING")) return boundBuffers.get(value("ELEMENT_ARRAY_BUFFER")) ?? null;
      if (parameter === value("FRAMEBUFFER_BINDING") || parameter === value("DRAW_FRAMEBUFFER_BINDING")) return state.currentFramebuffer;
      if (parameter === value("READ_FRAMEBUFFER_BINDING")) return state.readFramebuffer;
      if (parameter === value("RENDERBUFFER_BINDING")) return state.currentRenderbuffer;
      if (parameter === value("ACTIVE_TEXTURE")) return state.activeTexture;
      if (parameter === value("TEXTURE_BINDING_2D")) return textureBinding(value("TEXTURE_2D"));
      if (parameter === value("TEXTURE_BINDING_CUBE_MAP")) return textureBinding(value("TEXTURE_CUBE_MAP"));
      if (parameter === value("TEXTURE_BINDING_2D_ARRAY")) return textureBinding(value("TEXTURE_2D_ARRAY"));
      if (parameter === value("TEXTURE_BINDING_3D")) return textureBinding(value("TEXTURE_3D"));
      if (parameter === value("SAMPLER_BINDING")) return boundSamplers.get(textureUnit()) ?? null;
      if (parameter === value("MAX_VERTEX_UNIFORM_VECTORS")) return state.maxVertexUniformVectors;
      if (parameter === value("MAX_TEXTURE_SIZE") || parameter === value("MAX_CUBE_MAP_TEXTURE_SIZE") ||
          parameter === value("MAX_RENDERBUFFER_SIZE")) return 4096;
      if (parameter === value("VIEWPORT")) return new Int32Array(state.viewport);
      if (parameter === value("SUBPIXEL_BITS")) return 8;
      if (parameter === value("SAMPLES") || parameter === value("SAMPLE_BUFFERS")) return 0;
      if (parameter === value("TRANSFORM_FEEDBACK_ACTIVE") || parameter === value("TRANSFORM_FEEDBACK_PAUSED")) return false;
      return 32;
    },
    getShaderPrecisionFormat: () => ({ precision: 23, rangeMin: 126, rangeMax: 127 }),
    getQuery: () => state.activeQuery,
    isEnabled: (capability: number) => enabled.has(capability),
    enable: (capability: number) => { enabled.add(capability); },
    disable: (capability: number) => { enabled.delete(capability); },
    viewport: (x: number, y: number, width: number, height: number) => { state.viewport.set([x, y, width, height]); },
    createBuffer: (): FakeBuffer => ({ id: nextId(), bytes: new Uint8Array() }),
    bindBuffer: (target: number, buffer: FakeBuffer | null) => {
      boundBuffers.set(target, buffer);
      if (target === value("ELEMENT_ARRAY_BUFFER")) {
        if (state.currentVao) state.currentVao.element = buffer;
        else state.defaultElement = buffer;
      }
    },
    bufferData: (target: number, data: number | ArrayBufferView) => {
      const buffer = boundBuffers.get(target);
      if (!buffer) throw new Error("no fake buffer bound");
      buffer.bytes = typeof data === "number" ? new Uint8Array(data) : bytes(data).slice();
    },
    bufferSubData: (target: number, offset: number, data: ArrayBufferView) => {
      const buffer = boundBuffers.get(target);
      if (!buffer) throw new Error("no fake buffer bound");
      buffer.bytes.set(bytes(data), offset);
      calls.push({ name: "bufferSubData", args: [target, offset, [...bytes(data)]] });
      if (state.failBufferSubData) throw new Error("buffer update failed after entry");
    },
    getBufferSubData: (target: number, offset: number, destination: ArrayBufferView) => {
      const buffer = boundBuffers.get(target);
      if (!buffer) throw new Error("no fake buffer bound");
      bytes(destination).set(buffer.bytes.subarray(offset, offset + destination.byteLength));
    },
    deleteBuffer: (buffer: FakeBuffer) => { buffer.deleted = true; },
    isBuffer: (buffer: FakeBuffer) => Boolean(buffer && !buffer.deleted),
    createTexture: (): FakeTexture => ({ id: nextId() }),
    deleteTexture: (texture: FakeTexture) => { texture.deleted = true; },
    activeTexture: (unit: number) => { state.activeTexture = unit; },
    bindTexture: (target: number, texture: FakeTexture | null) => {
      const bindings = boundTextures.get(textureUnit()) ?? new Map<number, FakeTexture | null>();
      bindings.set(target, texture);
      boundTextures.set(textureUnit(), bindings);
    },
    createSampler: (): FakeSampler => ({ id: nextId() }),
    deleteSampler: (sampler: FakeSampler) => { sampler.deleted = true; },
    bindSampler: (unit: number, sampler: FakeSampler | null) => { boundSamplers.set(unit, sampler); },
    createRenderbuffer: (): FakeRenderbuffer => ({ id: nextId() }),
    deleteRenderbuffer: (renderbuffer: FakeRenderbuffer) => { renderbuffer.deleted = true; },
    bindRenderbuffer: (_target: number, renderbuffer: FakeRenderbuffer | null) => { state.currentRenderbuffer = renderbuffer; },
    createFramebuffer: (): FakeFramebuffer => ({ id: nextId(), attachments: new Map() }),
    deleteFramebuffer: (framebuffer: FakeFramebuffer) => { framebuffer.deleted = true; },
    bindFramebuffer: (target: number, framebuffer: FakeFramebuffer | null) => {
      if (target === value("FRAMEBUFFER") || target === value("DRAW_FRAMEBUFFER")) state.currentFramebuffer = framebuffer;
      if (target === value("FRAMEBUFFER") || target === value("READ_FRAMEBUFFER")) state.readFramebuffer = framebuffer;
    },
    framebufferTexture2D: (target: number, attachment: number, _textureTarget: number, texture: FakeTexture | null) => {
      framebufferBinding(target)?.attachments.set(attachment, texture);
    },
    framebufferTextureLayer: (target: number, attachment: number, texture: FakeTexture | null) => {
      framebufferBinding(target)?.attachments.set(attachment, texture);
    },
    framebufferRenderbuffer: (target: number, attachment: number, _renderbufferTarget: number, renderbuffer: FakeRenderbuffer | null) => {
      framebufferBinding(target)?.attachments.set(attachment, renderbuffer);
    },
    // The fake only models successful allocation; it does not validate driver framebuffer completeness.
    checkFramebufferStatus: () => value("FRAMEBUFFER_COMPLETE"),
    fenceSync: () => ({ id: nextId() }),
    clientWaitSync: () => value("ALREADY_SIGNALED"),
    deleteSync: (sync: object) => { calls.push({ name: "deleteSync", args: [sync] }); },
    createVertexArray: (): FakeVao => ({ id: nextId(), element: null }),
    bindVertexArray: (vao: FakeVao | null) => {
      state.currentVao = vao;
      boundBuffers.set(value("ELEMENT_ARRAY_BUFFER"), vao ? vao.element : state.defaultElement);
    },
    deleteVertexArray: (vao: object) => { calls.push({ name: "deleteVertexArray", args: [vao] }); },
    getVertexAttrib: (index: number) => index === 4 ? new Float32Array(state.currentColor) : new Float32Array([0, 0, 0, 1]),
    vertexAttrib4f: (index: number, x: number, y: number, z: number, w: number) => {
      if (index === 4) state.currentColor.set([x, y, z, w]);
    },
    vertexAttrib4fv: (index: number, data: ArrayLike<number>) => {
      if (index === 4) state.currentColor.set(data);
    },
    createShader: (): FakeShader => ({ id: nextId(), source: "" }),
    shaderSource: (shader: FakeShader, source: string) => { shader.source = source; },
    getShaderParameter: () => true,
    getShaderInfoLog: () => "",
    createProgram: (): FakeProgram => ({ id: nextId(), shaders: [], values: new Map(), uniforms: [], attributes: [] }),
    attachShader: (program: FakeProgram, shader: FakeShader) => { program.shaders.push(shader); },
    linkProgram: (program: FakeProgram) => {
      // The legacy temporal velocity pass uses its own position-only shader;
      // reflect its actual active inputs instead of treating it as lean unlit.
      if (program.shaders.some((shader) => shader.source.includes("AURA_TEMPORAL_VELOCITY"))) {
        program.attributes = [{ name: "a_position", type: value("FLOAT_VEC3"), size: 1 }];
        program.uniforms = ["u_modelViewProjection", "u_previousViewProjection", "u_unjitteredViewProjection"]
          .map((name) => ({ name, type: value("FLOAT_MAT4"), size: 1 }));
        return;
      }
      const staged = program.shaders.some((shader) => shader.source.includes("u_batchMVP[2]"));
      program.attributes = [
        { name: "a_position", type: value("FLOAT_VEC3"), size: 1 },
        { name: "a_color", type: value("FLOAT_VEC4"), size: 1 }
      ];
      if (!staged) program.attributes.push(
        ...["a_instanceMatrix0", "a_instanceMatrix1", "a_instanceMatrix2", "a_instanceMatrix3", "a_instanceColor"]
          .map((name) => ({ name, type: value("FLOAT_VEC4"), size: 1 }))
      );
      program.uniforms = [
        staged ? { name: "u_batchMVP[0]", type: value("FLOAT_MAT4"), size: 2 }
          : { name: "u_modelViewProjection", type: value("FLOAT_MAT4"), size: 1 },
        { name: "u_pointSize", type: value("FLOAT"), size: 1 },
        { name: "u_baseColor", type: value("FLOAT_VEC4"), size: 1 },
        { name: "u_alphaCutoff", type: value("FLOAT"), size: 1 },
        { name: "u_roundPoints", type: value("FLOAT"), size: 1 }
      ];
      if (!staged) program.uniforms.push(
        { name: "u_instanceMatrices[0]", type: value("FLOAT_MAT4"), size: 64 },
        { name: "u_instanceCount", type: value("FLOAT"), size: 1 },
        { name: "u_instanceAttributeMode", type: value("FLOAT"), size: 1 }
      );
    },
    getProgramParameter: (program: FakeProgram, parameter: number) => {
      if (parameter === value("LINK_STATUS")) return true;
      if (parameter === value("ACTIVE_UNIFORMS")) return program.uniforms.length;
      if (parameter === value("ACTIVE_ATTRIBUTES")) return program.attributes.length;
      return 0;
    },
    getProgramInfoLog: () => "",
    getActiveUniform: (program: FakeProgram, index: number) => program.uniforms[index] ?? null,
    getActiveAttrib: (program: FakeProgram, index: number) => program.attributes[index] ?? null,
    getAttribLocation: (_program: FakeProgram, name: string) => ({
      a_position: 0, a_color: 4, a_instanceMatrix0: 8, a_instanceMatrix1: 9,
      a_instanceMatrix2: 10, a_instanceMatrix3: 11, a_instanceColor: 12
    } as Record<string, number>)[name] ?? -1,
    getUniformBlockIndex: () => value("INVALID_INDEX"),
    getUniformLocation: (program: FakeProgram, name: string): FakeLocation => ({ program, name: name.replace(/\[0\]$/, "") }),
    getUniform: (program: FakeProgram, location: FakeLocation) => {
      const saved = program.values.get(location.name);
      if (saved !== undefined) return saved;
      const active = program.uniforms.find((uniform) => uniform.name.replace(/\[0\]$/, "") === location.name);
      if (active?.type === value("FLOAT_MAT4")) return new Float32Array(16 * active.size);
      if (active?.type === value("FLOAT_VEC4")) return new Float32Array(4 * active.size);
      return 0;
    },
    useProgram: (program: FakeProgram | null) => { state.currentProgram = program; },
    uniformMatrix4fv: (location: FakeLocation, _transpose: boolean, data: ArrayLike<number>) => {
      const snapshot = Float32Array.from(data);
      location.program.values.set(location.name, snapshot);
      matrixUploads.push({ name: location.name, data: [...snapshot], program: location.program });
    },
    uniform1f: (location: FakeLocation, data: number) => { location.program.values.set(location.name, data); },
    uniform4fv: (location: FakeLocation, data: ArrayLike<number>) => { location.program.values.set(location.name, Float32Array.from(data)); }
  };
  for (const name of ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced"]) {
    methods[name] = (...args: unknown[]) => {
      const uniforms = new Map<string, number | Float32Array>();
      for (const [uniform, data] of state.currentProgram?.values ?? []) {
        uniforms.set(uniform, typeof data === "number" ? data : new Float32Array(data));
      }
      const draw = { name, args, program: state.currentProgram, uniforms };
      nativeDraws.push(draw);
      state.onNativeDraw?.(draw);
      if (state.failInstanced && name.endsWith("Instanced")) throw new Error("instanced draw failed after entry");
    };
  }
  const noops = new Map<string, () => void>();
  const gl = new Proxy(methods, {
    get(target, property) {
      const name = String(property);
      if (Object.hasOwn(target, name)) return target[name];
      if (/^[A-Z0-9_]+$/.test(name)) return value(name);
      if (!noops.has(name)) noops.set(name, () => undefined);
      return noops.get(name);
    }
  }) as unknown as WebGL2RenderingContext;
  const canvas = {
    width: 128,
    height: 128,
    clientWidth: 128,
    clientHeight: 128,
    style: {},
    getBoundingClientRect: () => ({ x: 0, y: 0, top: 0, left: 0, right: 128, bottom: 128, width: 128, height: 128 }),
    getContext: vi.fn(() => gl),
    addEventListener: (name: string, listener: EventListener) => {
      const group = listeners.get(name) ?? new Set<EventListener>();
      group.add(listener);
      listeners.set(name, group);
    },
    removeEventListener: (name: string, listener: EventListener) => { listeners.get(name)?.delete(listener); }
  } as unknown as HTMLCanvasElement;
  const dispatch = (name: string) => {
    if (name === "webglcontextlost") state.lost = true;
    if (name === "webglcontextrestored") state.lost = false;
    for (const listener of listeners.get(name) ?? []) listener({ preventDefault() {} } as Event);
  };
  return { canvas, gl, state, calls, nativeDraws, matrixUploads, dispatch };
}

/** Convenience for tests that exercise the device directly. */
export function fakeWebGL() {
  const fixture = fakeWebGLCanvas();
  const device = WebGL2Device.create({ canvas: fixture.canvas });
  return { ...fixture, device };
}

function bytes(view: ArrayBufferView): Uint8Array {
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}

