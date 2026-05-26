import { describe, expect, it } from "vitest";
import {
  Geometry,
  Sampler,
  Texture,
  TextureBinding,
  WebGL2Device,
  type DrawCommand
} from "../../../packages/rendering/src";

describe("WebGL2 render-state isolation", () => {
  it("deletes WebGL resource handles on device disposal", () => {
    const { canvas, gl } = createFakeWebGL2Canvas();
    const device = WebGL2Device.create({ canvas });
    const geometry = Geometry.triangle();
    const vertexBuffer = geometry.vertexBuffer.upload(device);
    const indexBuffer = geometry.indexBuffer?.upload(device);
    const shader = device.createShaderProgram({
      label: "resource-deletion-test",
      marker: "@aura3d-test:resource-deletion",
      vertex: `
        #version 300 es
        // @aura3d-test:resource-deletion
        in vec3 a_position;
        void main() {
          gl_Position = vec4(a_position, 1.0);
        }
      `,
      fragment: `
        #version 300 es
        // @aura3d-test:resource-deletion
        precision mediump float;
        out vec4 outColor;
        void main() {
          outColor = vec4(1.0);
        }
      `
    });
    const renderbufferTarget = device.createRenderTarget({ width: 4, height: 4, label: "delete-renderbuffer-target" });
    const depthTextureTarget = device.createRenderTarget({ width: 4, height: 4, label: "delete-depth-texture-target", depth: "texture" });

    device.setRenderTarget(renderbufferTarget);
    device.beginFrame(4, 4);
    device.draw({
      topology: "triangles",
      vertexBuffer,
      vertexFormat: geometry.vertexBuffer.format,
      vertexCount: geometry.vertexBuffer.vertexCount,
      indexBuffer,
      indexType: "uint16",
      indexCount: geometry.indexBuffer?.count,
      shader
    });
    device.endFrame();

    device.setRenderTarget(depthTextureTarget);
    device.dispose();

    expect(gl.state.deletions.buffers).toBeGreaterThanOrEqual(2);
    expect(gl.state.deletions.textures).toBeGreaterThanOrEqual(3);
    expect(gl.state.deletions.framebuffers).toBeGreaterThanOrEqual(2);
    expect(gl.state.deletions.renderbuffers).toBeGreaterThanOrEqual(1);
    expect(gl.state.deletions.vertexArrays).toBeGreaterThanOrEqual(1);
    expect(gl.state.deletions.programs).toBeGreaterThanOrEqual(1);
    expect(gl.state.deletions.shaders).toBeGreaterThanOrEqual(2);
  });

  it("reapplies depth, blend, cull, viewport, and framebuffer state instead of leaking prior draws or targets", () => {
    const { canvas, gl } = createFakeWebGL2Canvas();
    const device = WebGL2Device.create({ canvas });
    const geometry = Geometry.triangle();
    const vertexBuffer = geometry.vertexBuffer.upload(device);
    const indexBuffer = geometry.indexBuffer?.upload(device);
    const target = device.createRenderTarget({ width: 16, height: 8, label: "state-target" });

    device.setRenderTarget(target);
    device.beginFrame(16, 8);
    expect(gl.state.framebuffer).toBeTruthy();
    expect(gl.state.viewport).toEqual([0, 0, 16, 8]);

    device.draw({
      topology: "triangles",
      vertexBuffer,
      vertexCount: geometry.vertexBuffer.vertexCount,
      indexBuffer,
      indexType: "uint16",
      indexCount: geometry.indexBuffer?.count,
      renderState: {
        depthTest: false,
        depthWrite: false,
        cullMode: "front",
        blend: true,
        depthCompare: "always"
      }
    });
    expect(gl.state.enabled.has(gl.DEPTH_TEST)).toBe(false);
    expect(gl.state.depthMask).toBe(false);
    expect(gl.state.depthFunc).toBe(gl.ALWAYS);
    expect(gl.state.enabled.has(gl.CULL_FACE)).toBe(true);
    expect(gl.state.cullFace).toBe(gl.FRONT);
    expect(gl.state.enabled.has(gl.BLEND)).toBe(true);

    device.draw(opaqueCommand(vertexBuffer, indexBuffer));
    expect(gl.state.enabled.has(gl.DEPTH_TEST)).toBe(true);
    expect(gl.state.depthMask).toBe(true);
    expect(gl.state.depthFunc).toBe(gl.LEQUAL);
    expect(gl.state.enabled.has(gl.CULL_FACE)).toBe(true);
    expect(gl.state.cullFace).toBe(gl.BACK);
    expect(gl.state.enabled.has(gl.BLEND)).toBe(false);
    device.endFrame();

    device.setRenderTarget(null);
    device.beginFrame(32, 18);
    expect(gl.state.framebuffer).toBe(null);
    expect(gl.state.viewport).toEqual([0, 0, 32, 18]);
    device.draw(opaqueCommand(vertexBuffer, indexBuffer));
    device.endFrame();
  });

  it("starts texture uniform binding at unit zero for each draw", () => {
    const { canvas, gl } = createFakeWebGL2Canvas();
    const device = WebGL2Device.create({ canvas });
    const geometry = Geometry.triangle();
    const vertexBuffer = geometry.vertexBuffer.upload(device);
    const shader = device.createShaderProgram({
      label: "texture-state-test",
      marker: "@aura3d-test:texture-state",
      vertex: `
        // @aura3d-test:texture-state
        void main() {
          gl_Position = vec4(0.0, 0.0, 0.0, 1.0);
        }
      `,
      fragment: `
        // @aura3d-test:texture-state
        precision mediump float;
        uniform sampler2D u_textureA;
        uniform sampler2D u_textureB;
        out vec4 outColor;
        void main() {
          outColor = texture(u_textureA, vec2(0.5)) + texture(u_textureB, vec2(0.5));
        }
      `
    });
    const textureA = new Texture({ width: 1, height: 1, data: new Uint8Array([255, 0, 0, 255]) });
    const textureB = new Texture({ width: 1, height: 1, data: new Uint8Array([0, 255, 0, 255]) });

    device.beginFrame(8, 8);
    device.draw({
      topology: "triangles",
      vertexBuffer,
      vertexCount: geometry.vertexBuffer.vertexCount,
      shader,
      uniforms: new Map([
        ["u_textureA", new TextureBinding({ name: "u_textureA", texture: textureA })],
        ["u_textureB", new TextureBinding({ name: "u_textureB", texture: textureB })]
      ])
    });
    expect(gl.state.uniformSamplers.get("u_textureA")).toBe(0);
    expect(gl.state.uniformSamplers.get("u_textureB")).toBe(1);
    expect(gl.state.activeTextureUnit).toBe(1);

    device.draw({
      topology: "triangles",
      vertexBuffer,
      vertexCount: geometry.vertexBuffer.vertexCount,
      shader,
      uniforms: new Map([
        ["u_textureA", new TextureBinding({ name: "u_textureA", texture: textureA })]
      ])
    });
    expect(gl.state.uniformSamplers.get("u_textureA")).toBe(0);
    expect(gl.state.activeTextureUnit).toBe(0);
    device.endFrame();
  });

  it("uploads sRGB textures with WebGL2 sRGB internal formats and leaves linear textures unconverted", () => {
    const { canvas, gl } = createFakeWebGL2Canvas();
    const device = WebGL2Device.create({ canvas });
    const geometry = Geometry.triangle();
    const vertexBuffer = geometry.vertexBuffer.upload(device);
    const shader = device.createShaderProgram({
      label: "texture-colorspace-test",
      marker: "@aura3d-test:texture-colorspace",
      vertex: `
        // @aura3d-test:texture-colorspace
        void main() {
          gl_Position = vec4(0.0, 0.0, 0.0, 1.0);
        }
      `,
      fragment: `
        // @aura3d-test:texture-colorspace
        precision mediump float;
        uniform sampler2D u_albedo;
        uniform sampler2D u_normal;
        out vec4 outColor;
        void main() {
          outColor = texture(u_albedo, vec2(0.5)) + texture(u_normal, vec2(0.5));
        }
      `
    });
    const albedo = new Texture({ width: 1, height: 1, colorSpace: "srgb", data: new Uint8Array([180, 120, 60, 255]) });
    const normal = new Texture({ width: 1, height: 1, colorSpace: "linear", data: new Uint8Array([128, 128, 255, 255]) });

    device.beginFrame(8, 8);
    device.draw({
      topology: "triangles",
      vertexBuffer,
      vertexCount: geometry.vertexBuffer.vertexCount,
      shader,
      uniforms: new Map([
        ["u_albedo", new TextureBinding({ name: "u_albedo", texture: albedo, expectedColorSpace: "srgb" })],
        ["u_normal", new TextureBinding({ name: "u_normal", texture: normal, expectedColorSpace: "linear" })]
      ])
    });
    device.endFrame();

    expect(gl.state.textureUploads.map((upload) => upload.internalFormat)).toEqual([gl.SRGB8_ALPHA8, gl.RGBA]);
  });

  it("preserves mipmap-aware sampler min filters when binding texture uniforms", () => {
    const { canvas, gl } = createFakeWebGL2Canvas();
    const device = WebGL2Device.create({ canvas });
    const geometry = Geometry.triangle();
    const vertexBuffer = geometry.vertexBuffer.upload(device);
    const shader = device.createShaderProgram({
      label: "mipmap-sampler-test",
      marker: "@aura3d-test:mipmap-sampler",
      vertex: `
        // @aura3d-test:mipmap-sampler
        void main() {
          gl_Position = vec4(0.0, 0.0, 0.0, 1.0);
        }
      `,
      fragment: `
        // @aura3d-test:mipmap-sampler
        precision mediump float;
        uniform sampler2D u_albedo;
        out vec4 outColor;
        void main() {
          outColor = texture(u_albedo, vec2(0.5));
        }
      `
    });
    const texture = new Texture({ width: 2, height: 2, data: new Uint8Array(16) });

    device.beginFrame(8, 8);
    device.draw({
      topology: "triangles",
      vertexBuffer,
      vertexCount: geometry.vertexBuffer.vertexCount,
      shader,
      uniforms: new Map([
        ["u_albedo", new TextureBinding({
          name: "u_albedo",
          texture,
          sampler: new Sampler({ minFilter: "linear-mipmap-linear", magFilter: "linear" })
        })]
      ])
    });
    device.endFrame();

    expect(gl.state.samplerParameters).toContainEqual({ parameter: gl.TEXTURE_MIN_FILTER, value: gl.LINEAR_MIPMAP_LINEAR });
    expect(gl.state.samplerParameters).toContainEqual({ parameter: gl.TEXTURE_MAG_FILTER, value: gl.LINEAR });
  });

  it("does not leak active texture state while allocating render targets", () => {
    const { canvas, gl } = createFakeWebGL2Canvas();
    const device = WebGL2Device.create({ canvas });
    const sentinelTexture = { id: "sentinel-texture" };

    gl.activeTexture(gl.TEXTURE0 + 3);
    gl.bindTexture(gl.TEXTURE_2D, sentinelTexture as WebGLTexture);
    const target = device.createRenderTarget({ width: 8, height: 8, label: "texture-state-target" });

    expect(target.label).toBe("texture-state-target");
    expect(gl.state.activeTextureUnit).toBe(3);
    expect(gl.state.textureBindings.get(3)).toBe(sentinelTexture);
  });

  it("does not leak framebuffer or renderbuffer bindings while allocating render targets", () => {
    const { canvas, gl } = createFakeWebGL2Canvas();
    const device = WebGL2Device.create({ canvas });
    const sentinelFramebuffer = { id: "sentinel-framebuffer" };
    const sentinelRenderbuffer = { id: "sentinel-renderbuffer" };

    gl.bindFramebuffer(gl.FRAMEBUFFER, sentinelFramebuffer as WebGLFramebuffer);
    gl.bindRenderbuffer(gl.RENDERBUFFER, sentinelRenderbuffer as WebGLRenderbuffer);
    const target = device.createRenderTarget({ width: 8, height: 8, label: "framebuffer-state-target" });

    expect(target.label).toBe("framebuffer-state-target");
    expect(gl.state.framebuffer).toBe(sentinelFramebuffer);
    expect(gl.state.renderbuffer).toBe(sentinelRenderbuffer);
  });

  it("allocates sampleable depth texture targets without falling back to renderbuffers", () => {
    const { canvas, gl } = createFakeWebGL2Canvas();
    const device = WebGL2Device.create({ canvas });
    const sentinelTexture = { id: "sentinel-depth-texture" };

    gl.activeTexture(gl.TEXTURE0 + 4);
    gl.bindTexture(gl.TEXTURE_2D, sentinelTexture as WebGLTexture);
    const target = device.createRenderTarget({ width: 8, height: 8, label: "sampleable-depth-target", depth: "texture" });

    expect(target.depthTexture).toMatchObject({
      width: 8,
      height: 8,
      format: "depth24",
      label: "sampleable-depth-target-depth"
    });
    expect(gl.state.framebufferTextureAttachments.some((entry) => entry.attachment === gl.DEPTH_ATTACHMENT)).toBe(true);
    expect(gl.state.framebufferRenderbufferAttachments.some((entry) => entry.attachment === gl.DEPTH_ATTACHMENT)).toBe(false);
    expect(gl.state.activeTextureUnit).toBe(4);
    expect(gl.state.textureBindings.get(4)).toBe(sentinelTexture);
  });

  it("keeps default depth render targets on renderbuffers unless callers request depth textures", () => {
    const { canvas, gl } = createFakeWebGL2Canvas();
    const device = WebGL2Device.create({ canvas });
    const target = device.createRenderTarget({ width: 8, height: 8, label: "default-depth-target" });

    expect(target.depthTexture).toBeUndefined();
    expect(gl.state.framebufferRenderbufferAttachments.some((entry) => entry.attachment === gl.DEPTH_ATTACHMENT)).toBe(true);
  });

  it("binds renderer-owned sampleable depth textures without attempting an rgba upload", () => {
    const { canvas, gl } = createFakeWebGL2Canvas();
    const device = WebGL2Device.create({ canvas });
    const geometry = Geometry.triangle();
    const vertexBuffer = geometry.vertexBuffer.upload(device);
    const target = device.createRenderTarget({ width: 8, height: 8, label: "sample-depth-bind", depth: "texture" });
    const shader = device.createShaderProgram({
      label: "sample-depth-bind-shader",
      marker: "@aura3d-test:sample-depth-bind",
      vertex: `
        // @aura3d-test:sample-depth-bind
        void main() {
          gl_Position = vec4(0.0, 0.0, 0.0, 1.0);
        }
      `,
      fragment: `
        // @aura3d-test:sample-depth-bind
        precision mediump float;
        uniform sampler2D u_sceneDepth;
        out vec4 outColor;
        void main() {
          outColor = vec4(texture(u_sceneDepth, vec2(0.5)).rrr, 1.0);
        }
      `
    });

    expect(target.depthTexture).toBeDefined();
    device.beginFrame(8, 8);
    device.draw({
      topology: "triangles",
      vertexBuffer,
      vertexCount: geometry.vertexBuffer.vertexCount,
      shader,
      uniforms: new Map([
        ["u_sceneDepth", new TextureBinding({ name: "u_sceneDepth", texture: target.depthTexture!, required: true })]
      ])
    });
    device.endFrame();

    expect(gl.state.uniformSamplers.get("u_sceneDepth")).toBe(0);
    expect(gl.state.depthTextureUploadAttempts).toBe(1);
  });

  it("does not leak active texture state while uploading render-target pixels", () => {
    const { canvas, gl } = createFakeWebGL2Canvas();
    const device = WebGL2Device.create({ canvas });
    const target = device.createRenderTarget({ width: 2, height: 2, label: "pixel-upload-target" });
    const sentinelTexture = { id: "sentinel-upload-texture" };

    gl.activeTexture(gl.TEXTURE0 + 2);
    gl.bindTexture(gl.TEXTURE_2D, sentinelTexture as WebGLTexture);
    device.writeRenderTargetPixels(target, new Uint8Array(2 * 2 * 4));

    expect(gl.state.activeTextureUnit).toBe(2);
    expect(gl.state.textureBindings.get(2)).toBe(sentinelTexture);
  });

  it("restores depth writes before clearing a new frame", () => {
    const { canvas, gl } = createFakeWebGL2Canvas();
    const device = WebGL2Device.create({ canvas });
    const geometry = Geometry.triangle();
    const vertexBuffer = geometry.vertexBuffer.upload(device);

    device.beginFrame(8, 8);
    device.clear([0, 0, 0, 1]);
    device.draw({
      topology: "triangles",
      vertexBuffer,
      vertexCount: geometry.vertexBuffer.vertexCount,
      renderState: {
        depthTest: true,
        depthWrite: false,
        cullMode: "none",
        blend: true,
        depthCompare: "less-equal"
      }
    });
    expect(gl.state.depthMask).toBe(false);
    device.endFrame();

    device.beginFrame(8, 8);
    device.clear([0.2, 0.2, 0.24, 1]);
    expect(gl.state.depthMask).toBe(true);
    expect(gl.state.clearDepth).toBe(1);
    device.endFrame();
  });
});

function opaqueCommand(vertexBuffer: DrawCommand["vertexBuffer"], indexBuffer?: DrawCommand["indexBuffer"]): DrawCommand {
  return {
    topology: "triangles",
    vertexBuffer,
    vertexCount: 3,
    indexBuffer,
    indexType: "uint16",
    indexCount: indexBuffer ? 3 : undefined,
    renderState: {
      depthTest: true,
      depthWrite: true,
      cullMode: "back",
      blend: false,
      depthCompare: "less-equal"
    }
  };
}

interface FakeProgram {
  readonly id: number;
  readonly shaders: FakeShader[];
  readonly attributes: string[];
  readonly uniforms: string[];
}

interface FakeShader {
  readonly id: number;
  source: string;
}

interface FakeWebGL2State {
  activeTextureUnit: number;
  arrayBuffer: unknown;
  elementArrayBuffer: unknown;
  framebuffer: unknown;
  renderbuffer: unknown;
  vertexArray: unknown;
  currentProgram: FakeProgram | null;
  cullFace: number;
  depthFunc: number;
  depthMask: boolean;
  colorMask: [boolean, boolean, boolean, boolean];
  scissor: [number, number, number, number];
  polygonOffset: [number, number];
  stencilFunc: [number, number, number];
  stencilMask: number;
  stencilOp: [number, number, number];
  clearDepth: number;
  enabled: Set<number>;
  textureBindings: Map<number, unknown>;
  uniformSamplers: Map<string, number>;
  viewport: [number, number, number, number];
  framebufferTextureAttachments: { readonly attachment: number; readonly texture: unknown }[];
  framebufferRenderbufferAttachments: { readonly attachment: number; readonly renderbuffer: unknown }[];
  textureUploads: { readonly internalFormat: number }[];
  textureParameters: { readonly parameter: number; readonly value: number }[];
  samplerParameters: { readonly parameter: number; readonly value: number }[];
  depthTextureUploadAttempts: number;
  deletions: {
    buffers: number;
    textures: number;
    framebuffers: number;
    renderbuffers: number;
    vertexArrays: number;
    programs: number;
    shaders: number;
  };
}

function createFakeWebGL2Canvas(): {
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGL2RenderingContext & { readonly state: FakeWebGL2State };
} {
  const gl = createFakeWebGL2Context();
  return {
    canvas: {
      getContext(type: string) {
        return type === "webgl2" ? gl : null;
      },
      addEventListener() {},
      removeEventListener() {}
    } as unknown as HTMLCanvasElement,
    gl
  };
}

function createFakeWebGL2Context(): WebGL2RenderingContext & { readonly state: FakeWebGL2State } {
  let nextId = 1;
  const state: FakeWebGL2State = {
    activeTextureUnit: 0,
    arrayBuffer: null,
    elementArrayBuffer: null,
    framebuffer: null,
    renderbuffer: null,
    vertexArray: null,
    currentProgram: null,
    cullFace: 0x0405,
    depthFunc: 0x0203,
    depthMask: true,
    colorMask: [true, true, true, true],
    scissor: [0, 0, 0, 0],
    polygonOffset: [0, 0],
    stencilFunc: [0x0207, 0, 0xff],
    stencilMask: 0xff,
    stencilOp: [0x1e00, 0x1e00, 0x1e00],
    clearDepth: 1,
    enabled: new Set<number>(),
    textureBindings: new Map<number, unknown>(),
    uniformSamplers: new Map<string, number>(),
    viewport: [0, 0, 0, 0],
    framebufferTextureAttachments: [],
    framebufferRenderbufferAttachments: [],
    textureUploads: [],
    textureParameters: [],
    samplerParameters: [],
    depthTextureUploadAttempts: 0,
    deletions: {
      buffers: 0,
      textures: 0,
      framebuffers: 0,
      renderbuffers: 0,
      vertexArrays: 0,
      programs: 0,
      shaders: 0
    }
  };
  const gl = {
    ACTIVE_TEXTURE: 0x84e0,
    ACTIVE_ATTRIBUTES: 0x8b89,
    ACTIVE_UNIFORMS: 0x8b86,
    ARRAY_BUFFER: 0x8892,
    ARRAY_BUFFER_BINDING: 0x8894,
    ALWAYS: 0x0207,
    BACK: 0x0405,
    BLEND: 0x0be2,
    CLAMP_TO_EDGE: 0x812f,
    COLOR_ATTACHMENT0: 0x8ce0,
    COLOR_BUFFER_BIT: 0x4000,
    COMPILE_STATUS: 0x8b81,
    CULL_FACE: 0x0b44,
    CURRENT_PROGRAM: 0x8b8d,
    DECR: 0x1e03,
    DECR_WRAP: 0x8508,
    DEPTH_BUFFER_BIT: 0x0100,
    DEPTH_ATTACHMENT: 0x8d00,
    DEPTH_COMPONENT: 0x1902,
    DEPTH_COMPONENT16: 0x81a5,
    DEPTH_COMPONENT24: 0x81a6,
    DEPTH_TEST: 0x0b71,
    DYNAMIC_DRAW: 0x88e8,
    ELEMENT_ARRAY_BUFFER: 0x8893,
    ELEMENT_ARRAY_BUFFER_BINDING: 0x8895,
    FLOAT: 0x1406,
    FRAGMENT_SHADER: 0x8b30,
    FRAMEBUFFER: 0x8d40,
    FRAMEBUFFER_BINDING: 0x8ca6,
    FRAMEBUFFER_COMPLETE: 0x8cd5,
    FRONT: 0x0404,
    GEQUAL: 0x0206,
    GREATER: 0x0204,
    EQUAL: 0x0202,
    INCR: 0x1e02,
    INCR_WRAP: 0x8507,
    INVERT: 0x150a,
    KEEP: 0x1e00,
    LESS: 0x0201,
    LEQUAL: 0x0203,
    LINEAR: 0x2601,
    LINEAR_MIPMAP_LINEAR: 0x2703,
    LINEAR_MIPMAP_NEAREST: 0x2701,
    LINES: 0x0001,
    LINK_STATUS: 0x8b82,
    MAX_VERTEX_ATTRIBS: 0x8869,
    MIRRORED_REPEAT: 0x8370,
    NEAREST: 0x2600,
    NEAREST_MIPMAP_LINEAR: 0x2702,
    NEAREST_MIPMAP_NEAREST: 0x2700,
    NEVER: 0x0200,
    NO_ERROR: 0,
    NONE: 0,
    NOTEQUAL: 0x0205,
    ONE_MINUS_SRC_ALPHA: 0x0303,
    POINTS: 0x0000,
    RENDERER: 0x1f01,
    RENDERBUFFER: 0x8d41,
    RENDERBUFFER_BINDING: 0x8ca7,
    REPEAT: 0x2901,
    RGBA: 0x1908,
    POLYGON_OFFSET_FILL: 0x8037,
    REPLACE: 0x1e01,
    SCISSOR_TEST: 0x0c11,
    SRGB8_ALPHA8: 0x8c43,
    SRC_ALPHA: 0x0302,
    STENCIL_TEST: 0x0b90,
    TEXTURE0: 0x84c0,
    TEXTURE_2D: 0x0de1,
    TEXTURE_BINDING_2D: 0x8069,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    TRIANGLES: 0x0004,
    UNPACK_COLORSPACE_CONVERSION_WEBGL: 0x9243,
    UNPACK_FLIP_Y_WEBGL: 0x9240,
    UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9241,
    UNSIGNED_BYTE: 0x1401,
    UNSIGNED_INT: 0x1405,
    UNSIGNED_SHORT: 0x1403,
    VENDOR: 0x1f00,
    VERTEX_SHADER: 0x8b31,
    state,
    getParameter(parameter: number) {
      if (parameter === this.MAX_VERTEX_ATTRIBS) return 8;
      if (parameter === this.VENDOR) return "aura3d";
      if (parameter === this.RENDERER) return "fake-webgl2";
      if (parameter === this.CURRENT_PROGRAM) return state.currentProgram;
      if (parameter === this.ARRAY_BUFFER_BINDING) return state.arrayBuffer;
      if (parameter === this.ELEMENT_ARRAY_BUFFER_BINDING) return state.elementArrayBuffer;
      if (parameter === this.FRAMEBUFFER_BINDING) return state.framebuffer;
      if (parameter === this.RENDERBUFFER_BINDING) return state.renderbuffer;
      if (parameter === this.ACTIVE_TEXTURE) return this.TEXTURE0 + state.activeTextureUnit;
      if (parameter === this.TEXTURE_BINDING_2D) return state.textureBindings.get(state.activeTextureUnit) ?? null;
      return null;
    },
    getExtension() {
      return null;
    },
    createBuffer() {
      return { id: nextId++ };
    },
    deleteBuffer() {
      state.deletions.buffers += 1;
    },
    bindBuffer(target: number, buffer: unknown) {
      if (target === this.ARRAY_BUFFER) state.arrayBuffer = buffer;
      if (target === this.ELEMENT_ARRAY_BUFFER) state.elementArrayBuffer = buffer;
    },
    bufferData() {},
    bufferSubData() {},
    getBufferSubData() {},
    createShader() {
      return { id: nextId++, source: "" } as FakeShader;
    },
    shaderSource(shader: FakeShader, source: string) {
      shader.source = source;
    },
    compileShader() {},
    getShaderParameter() {
      return true;
    },
    getShaderInfoLog() {
      return "";
    },
    deleteShader() {
      state.deletions.shaders += 1;
    },
    createProgram() {
      return { id: nextId++, shaders: [], attributes: [], uniforms: [] } as unknown as FakeProgram;
    },
    attachShader(program: FakeProgram, shader: FakeShader) {
      program.shaders.push(shader);
    },
    linkProgram(program: FakeProgram) {
      const source = program.shaders.map((shader) => shader.source).join("\n");
      program.attributes.splice(0, program.attributes.length, ...parseNames(source, /\b(?:in|attribute)\s+\w+\s+(\w+)/g));
      program.uniforms.splice(0, program.uniforms.length, ...parseNames(source, /\buniform\s+\w+\s+(\w+)/g));
    },
    deleteProgram() {
      state.deletions.programs += 1;
    },
    getProgramParameter(program: FakeProgram, parameter: number) {
      if (parameter === this.LINK_STATUS) return true;
      if (parameter === this.ACTIVE_ATTRIBUTES) return program.attributes.length;
      if (parameter === this.ACTIVE_UNIFORMS) return program.uniforms.length;
      return 0;
    },
    getProgramInfoLog() {
      return "";
    },
    getActiveAttrib(program: FakeProgram, index: number) {
      const name = program.attributes[index];
      return name ? { name, type: this.FLOAT, size: 1 } : null;
    },
    getAttribLocation(program: FakeProgram, name: string) {
      return program.attributes.indexOf(name);
    },
    getActiveUniform(program: FakeProgram, index: number) {
      const name = program.uniforms[index];
      return name ? { name, type: this.FLOAT, size: 1 } : null;
    },
    createTexture() {
      return { id: nextId++ };
    },
    bindTexture(_target: number, texture: unknown) {
      state.textureBindings.set(state.activeTextureUnit, texture);
    },
    texParameteri(_target: number, parameter: number, value: number) {
      state.textureParameters.push({ parameter, value });
    },
    createSampler() {
      return { id: nextId++ };
    },
    bindSampler() {},
    samplerParameteri(_sampler: unknown, parameter: number, value: number) {
      state.samplerParameters.push({ parameter, value });
    },
    samplerParameterf(_sampler: unknown, parameter: number, value: number) {
      state.samplerParameters.push({ parameter, value });
    },
    deleteSampler() {},
    texImage2D(_target: number, _level: number, internalFormat: number) {
      state.textureUploads.push({ internalFormat });
      if (internalFormat === this.DEPTH_COMPONENT24) state.depthTextureUploadAttempts += 1;
    },
    texSubImage2D() {},
    pixelStorei() {},
    generateMipmap() {},
    createFramebuffer() {
      return { id: nextId++ };
    },
    createRenderbuffer() {
      return { id: nextId++ };
    },
    bindFramebuffer(target: number, framebuffer: unknown) {
      if (target === this.FRAMEBUFFER) state.framebuffer = framebuffer;
    },
    bindRenderbuffer(target: number, renderbuffer: unknown) {
      if (target === this.RENDERBUFFER) state.renderbuffer = renderbuffer;
    },
    renderbufferStorage() {},
    framebufferRenderbuffer(_target: number, attachment: number, _renderbufferTarget: number, renderbuffer: unknown) {
      state.framebufferRenderbufferAttachments.push({ attachment, renderbuffer });
    },
    framebufferTexture2D(_target: number, attachment: number, _textureTarget: number, texture: unknown) {
      state.framebufferTextureAttachments.push({ attachment, texture });
    },
    checkFramebufferStatus() {
      return this.FRAMEBUFFER_COMPLETE;
    },
    deleteTexture() {
      state.deletions.textures += 1;
    },
    deleteFramebuffer() {
      state.deletions.framebuffers += 1;
    },
    deleteRenderbuffer() {
      state.deletions.renderbuffers += 1;
    },
    createVertexArray() {
      return { id: nextId++ };
    },
    bindVertexArray(vertexArray: unknown) {
      state.vertexArray = vertexArray;
    },
    deleteVertexArray() {
      state.deletions.vertexArrays += 1;
    },
    enable(capability: number) {
      state.enabled.add(capability);
    },
    disable(capability: number) {
      state.enabled.delete(capability);
    },
    isEnabled(capability: number) {
      return state.enabled.has(capability);
    },
    depthFunc(func: number) {
      state.depthFunc = func;
    },
    depthMask(enabled: boolean) {
      state.depthMask = enabled;
    },
    colorMask(red: boolean, green: boolean, blue: boolean, alpha: boolean) {
      state.colorMask = [red, green, blue, alpha];
    },
    viewport(x: number, y: number, width: number, height: number) {
      state.viewport = [x, y, width, height];
    },
    scissor(x: number, y: number, width: number, height: number) {
      state.scissor = [x, y, width, height];
    },
    clearColor() {},
    clearDepth(depth: number) {
      state.clearDepth = depth;
    },
    clear() {},
    useProgram(program: FakeProgram) {
      state.currentProgram = program;
    },
    getUniformLocation(program: FakeProgram, name: string) {
      return program.uniforms.includes(name.replace(/\[0\]$/, "")) ? { name: name.replace(/\[0\]$/, "") } : null;
    },
    uniform1f() {},
    uniformMatrix4fv() {},
    uniform4fv() {},
    uniform3fv() {},
    uniform2fv() {},
    activeTexture(texture: number) {
      state.activeTextureUnit = texture - this.TEXTURE0;
    },
    uniform1i(location: { readonly name: string }, unit: number) {
      state.uniformSamplers.set(location.name, unit);
    },
    enableVertexAttribArray() {},
    vertexAttribPointer() {},
    vertexAttribDivisor() {},
    disableVertexAttribArray() {},
    vertexAttrib4f() {},
    cullFace(mode: number) {
      state.cullFace = mode;
    },
    polygonOffset(factor: number, units: number) {
      state.polygonOffset = [factor, units];
    },
    stencilFunc(func: number, reference: number, mask: number) {
      state.stencilFunc = [func, reference, mask];
    },
    stencilMask(mask: number) {
      state.stencilMask = mask;
    },
    stencilOp(fail: number, depthFail: number, depthPass: number) {
      state.stencilOp = [fail, depthFail, depthPass];
    },
    blendFunc() {},
    drawArrays() {},
    drawElements() {},
    drawArraysInstanced() {},
    drawElementsInstanced() {},
    readPixels() {},
    getError() {
      return this.NO_ERROR;
    }
  };
  return gl as unknown as WebGL2RenderingContext & { readonly state: FakeWebGL2State };
}

function parseNames(source: string, pattern: RegExp): string[] {
  return [...source.matchAll(pattern)].map((match) => match[1]!).filter((name, index, names) => names.indexOf(name) === index);
}
