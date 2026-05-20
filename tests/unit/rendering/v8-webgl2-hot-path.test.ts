import { describe, expect, it } from "vitest";
import { Geometry, Texture, TextureBinding, WebGL2Device } from "../../../packages/rendering/src";

describe("V8 WebGL2 hot path caches", () => {
  it("caches uniform locations so repeated draws do not call getUniformLocation again", () => {
    const { canvas, gl } = createCountingWebGL2Canvas();
    const device = WebGL2Device.create({ canvas });
    const geometry = Geometry.triangle();
    const vertexBuffer = geometry.vertexBuffer.upload(device);
    const shader = device.createShaderProgram({
      label: "v8-uniform-cache",
      marker: "@galileo3d-test:v8-uniform-cache",
      vertex: `
        #version 300 es
        // @galileo3d-test:v8-uniform-cache
        layout(location = 0) in vec3 a_position;
        uniform mat4 u_modelViewProjection;
        void main() {
          gl_Position = u_modelViewProjection * vec4(a_position, 1.0);
        }
      `,
      fragment: `
        #version 300 es
        // @galileo3d-test:v8-uniform-cache
        precision mediump float;
        uniform float u_alpha;
        out vec4 outColor;
        void main() {
          outColor = vec4(u_alpha, 0.0, 0.0, 1.0);
        }
      `
    });
    const uniforms = new Map<string, Float32Array | number>([
      ["u_modelViewProjection", identityMatrix()],
      ["u_alpha", 1]
    ]);

    device.beginFrame(8, 8);
    device.draw({
      topology: "triangles",
      vertexBuffer,
      vertexFormat: geometry.vertexBuffer.format,
      vertexCount: geometry.vertexBuffer.vertexCount,
      shader,
      uniforms
    });
    device.draw({
      topology: "triangles",
      vertexBuffer,
      vertexFormat: geometry.vertexBuffer.format,
      vertexCount: geometry.vertexBuffer.vertexCount,
      shader,
      uniforms
    });
    device.endFrame();

    expect(gl.state.uniformLocationLookups.get("u_modelViewProjection")).toBe(1);
    expect(gl.state.uniformLocationLookups.get("u_alpha")).toBe(1);
    expect(totalUniformLocationLookups(gl.state)).toBe(2);
  });

  it("skips redundant texture binds and sampler parameter uploads within a frame", () => {
    const { canvas } = createCountingWebGL2Canvas();
    const device = WebGL2Device.create({ canvas });
    const geometry = Geometry.triangle();
    const vertexBuffer = geometry.vertexBuffer.upload(device);
    const shader = device.createShaderProgram({
      label: "v8-texture-cache",
      marker: "@galileo3d-test:v8-texture-cache",
      vertex: `
        #version 300 es
        // @galileo3d-test:v8-texture-cache
        layout(location = 0) in vec3 a_position;
        void main() {
          gl_Position = vec4(a_position, 1.0);
        }
      `,
      fragment: `
        #version 300 es
        // @galileo3d-test:v8-texture-cache
        precision mediump float;
        uniform sampler2D u_texture;
        out vec4 outColor;
        void main() {
          outColor = texture(u_texture, vec2(0.5));
        }
      `
    });
    const texture = new Texture({
      width: 1,
      height: 1,
      colorSpace: "srgb",
      data: new Uint8Array([255, 255, 255, 255])
    });
    const uniforms = new Map<string, TextureBinding>([
      ["u_texture", new TextureBinding({ name: "u_texture", texture })]
    ]);

    device.beginFrame(8, 8);
    device.draw({
      topology: "triangles",
      vertexBuffer,
      vertexFormat: geometry.vertexBuffer.format,
      vertexCount: geometry.vertexBuffer.vertexCount,
      shader,
      uniforms
    });
    device.draw({
      topology: "triangles",
      vertexBuffer,
      vertexFormat: geometry.vertexBuffer.format,
      vertexCount: geometry.vertexBuffer.vertexCount,
      shader,
      uniforms
    });
    device.endFrame();

    const state = device.captureState();
    expect(state.get("textureBinds")).toBe(1);
    expect(state.get("samplerParameterUploads")).toBe(4);
    expect(state.get("samplerObjects")).toBe(1);
    expect(device.getDiagnostics().stateCacheSamplerBinds).toBe(1);
  });

  it("caches vertex array setup so repeated draws do not rebind attributes", () => {
    const { canvas, gl } = createCountingWebGL2Canvas();
    const device = WebGL2Device.create({ canvas });
    const geometry = Geometry.triangle();
    const vertexBuffer = geometry.vertexBuffer.upload(device);
    const vertexArrayBindsAfterUpload = gl.state.vertexArrayBinds;
    const shader = device.createShaderProgram({
      label: "v9-vao-cache",
      marker: "@galileo3d-test:v9-vao-cache",
      vertex: `
        #version 300 es
        // @galileo3d-test:v9-vao-cache
        layout(location = 0) in vec3 a_position;
        void main() {
          gl_Position = vec4(a_position, 1.0);
        }
      `,
      fragment: `
        #version 300 es
        // @galileo3d-test:v9-vao-cache
        precision mediump float;
        out vec4 outColor;
        void main() {
          outColor = vec4(1.0);
        }
      `
    });

    device.beginFrame(8, 8);
    device.draw({
      topology: "triangles",
      vertexBuffer,
      vertexFormat: geometry.vertexBuffer.format,
      vertexCount: geometry.vertexBuffer.vertexCount,
      shader
    });
    device.draw({
      topology: "triangles",
      vertexBuffer,
      vertexFormat: geometry.vertexBuffer.format,
      vertexCount: geometry.vertexBuffer.vertexCount,
      shader
    });
    device.endFrame();

    expect(gl.state.vertexArrayCreates).toBe(1);
    expect(gl.state.vertexAttribPointerCalls).toBe(1);
    expect(gl.state.vertexArrayBinds - vertexArrayBindsAfterUpload).toBe(1);
    expect(device.captureState().get("vertexArrayCreates")).toBe(1);
  });

  it("reports native WebGL2 instanced submissions separately from total draw calls", () => {
    const { canvas } = createCountingWebGL2Canvas();
    const device = WebGL2Device.create({ canvas });
    const geometry = Geometry.triangle();
    const vertexBuffer = geometry.vertexBuffer.upload(device);
    const shader = device.createShaderProgram({
      label: "v9-native-instancing-diagnostics",
      marker: "@galileo3d-test:v9-native-instancing-diagnostics",
      vertex: `
        #version 300 es
        // @galileo3d-test:v9-native-instancing-diagnostics
        layout(location = 0) in vec3 a_position;
        void main() {
          gl_Position = vec4(a_position.xy + vec2(float(gl_InstanceID) * 0.01, 0.0), a_position.z, 1.0);
        }
      `,
      fragment: `
        #version 300 es
        // @galileo3d-test:v9-native-instancing-diagnostics
        precision mediump float;
        out vec4 outColor;
        void main() {
          outColor = vec4(1.0);
        }
      `
    });

    device.beginFrame(8, 8);
    device.draw({
      topology: "triangles",
      vertexBuffer,
      vertexFormat: geometry.vertexBuffer.format,
      vertexCount: geometry.vertexBuffer.vertexCount,
      shader,
      instanceCount: 128
    });
    device.endFrame();

    expect(device.getDiagnostics().drawCalls).toBe(1);
    expect(device.getDiagnostics().nativeInstancedSubmissions).toBe(1);
    expect(device.captureState().get("nativeInstancedSubmissions")).toBe(1);
  });
});

interface CountingProgram {
  readonly id: number;
  readonly shaders: CountingShader[];
  readonly attributes: string[];
  readonly uniforms: string[];
}

interface CountingShader {
  readonly id: number;
  source: string;
}

interface CountingWebGL2State {
  activeTextureUnit: number;
  arrayBuffer: unknown;
  elementArrayBuffer: unknown;
  framebuffer: unknown;
  vertexArray: unknown;
  currentProgram: CountingProgram | null;
  enabled: Set<number>;
  uniformLocationLookups: Map<string, number>;
  vertexArrayBinds: number;
  vertexArrayCreates: number;
  vertexAttribPointerCalls: number;
}

function createCountingWebGL2Canvas(): {
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGL2RenderingContext & { readonly state: CountingWebGL2State };
} {
  const gl = createCountingWebGL2Context();
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

function createCountingWebGL2Context(): WebGL2RenderingContext & { readonly state: CountingWebGL2State } {
  let nextId = 1;
  const state: CountingWebGL2State = {
    activeTextureUnit: 0,
    arrayBuffer: null,
    elementArrayBuffer: null,
    framebuffer: null,
    vertexArray: null,
    currentProgram: null,
    enabled: new Set<number>(),
    uniformLocationLookups: new Map<string, number>(),
    vertexArrayBinds: 0,
    vertexArrayCreates: 0,
    vertexAttribPointerCalls: 0
  };
  const gl = {
    ACTIVE_ATTRIBUTES: 0x8b89,
    ACTIVE_TEXTURE: 0x84e0,
    ACTIVE_UNIFORMS: 0x8b86,
    ARRAY_BUFFER: 0x8892,
    ARRAY_BUFFER_BINDING: 0x8894,
    ALWAYS: 0x0207,
    BACK: 0x0405,
    BLEND: 0x0be2,
    CLAMP_TO_EDGE: 0x812f,
    COLOR_BUFFER_BIT: 0x4000,
    COMPILE_STATUS: 0x8b81,
    CULL_FACE: 0x0b44,
    CURRENT_PROGRAM: 0x8b8d,
    DECR: 0x1e03,
    DECR_WRAP: 0x8508,
    DEPTH_BUFFER_BIT: 0x0100,
    DEPTH_TEST: 0x0b71,
    DYNAMIC_DRAW: 0x88e8,
    ELEMENT_ARRAY_BUFFER: 0x8893,
    ELEMENT_ARRAY_BUFFER_BINDING: 0x8895,
    FLOAT: 0x1406,
    FRAGMENT_SHADER: 0x8b30,
    FRAMEBUFFER: 0x8d40,
    FRAMEBUFFER_BINDING: 0x8ca6,
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
    REPEAT: 0x2901,
    RGBA: 0x1908,
    POLYGON_OFFSET_FILL: 0x8037,
    REPLACE: 0x1e01,
    SCISSOR_TEST: 0x0c11,
    SRC_ALPHA: 0x0302,
    STENCIL_TEST: 0x0b90,
    TEXTURE0: 0x84c0,
    TEXTURE_2D: 0x0de1,
    TEXTURE_CUBE_MAP: 0x8513,
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
    VIEWPORT: 0x0ba2,
    state,
    getParameter(parameter: number) {
      if (parameter === this.MAX_VERTEX_ATTRIBS) return 8;
      if (parameter === this.VENDOR) return "galileo3d";
      if (parameter === this.RENDERER) return "fake-webgl2";
      if (parameter === this.CURRENT_PROGRAM) return state.currentProgram;
      if (parameter === this.ARRAY_BUFFER_BINDING) return state.arrayBuffer;
      if (parameter === this.ELEMENT_ARRAY_BUFFER_BINDING) return state.elementArrayBuffer;
      if (parameter === this.FRAMEBUFFER_BINDING) return state.framebuffer;
      if (parameter === this.ACTIVE_TEXTURE) return this.TEXTURE0 + state.activeTextureUnit;
      if (parameter === this.TEXTURE_BINDING_2D) return null;
      if (parameter === this.VIEWPORT) return [0, 0, 8, 8];
      return null;
    },
    getExtension() {
      return null;
    },
    createBuffer() {
      return { id: nextId++ };
    },
    bindBuffer(target: number, buffer: unknown) {
      if (target === this.ARRAY_BUFFER) state.arrayBuffer = buffer;
      if (target === this.ELEMENT_ARRAY_BUFFER) state.elementArrayBuffer = buffer;
    },
    bufferData() {},
    bufferSubData() {},
    getBufferSubData() {},
    createShader() {
      return { id: nextId++, source: "" } as CountingShader;
    },
    shaderSource(shader: CountingShader, source: string) {
      shader.source = source;
    },
    compileShader() {},
    getShaderParameter() {
      return true;
    },
    getShaderInfoLog() {
      return "";
    },
    deleteShader() {},
    createProgram() {
      return { id: nextId++, shaders: [], attributes: [], uniforms: [] } as CountingProgram;
    },
    attachShader(program: CountingProgram, shader: CountingShader) {
      program.shaders.push(shader);
    },
    linkProgram(program: CountingProgram) {
      const source = program.shaders.map((shader) => shader.source).join("\n");
      program.attributes.splice(0, program.attributes.length, ...parseNames(source, /\b(?:in|attribute)\s+\w+\s+(\w+)/g));
      program.uniforms.splice(0, program.uniforms.length, ...parseNames(source, /\buniform\s+\w+\s+(\w+)/g));
    },
    deleteProgram() {},
    getProgramParameter(program: CountingProgram, parameter: number) {
      if (parameter === this.LINK_STATUS) return true;
      if (parameter === this.ACTIVE_ATTRIBUTES) return program.attributes.length;
      if (parameter === this.ACTIVE_UNIFORMS) return program.uniforms.length;
      return 0;
    },
    getProgramInfoLog() {
      return "";
    },
    getActiveAttrib(program: CountingProgram, index: number) {
      const name = program.attributes[index];
      return name ? { name, type: this.FLOAT, size: 1 } : null;
    },
    getAttribLocation(program: CountingProgram, name: string) {
      return program.attributes.indexOf(name);
    },
    getActiveUniform(program: CountingProgram, index: number) {
      const name = program.uniforms[index];
      return name ? { name, type: this.FLOAT, size: 1 } : null;
    },
    getUniformLocation(program: CountingProgram, name: string) {
      const normalizedName = name.replace(/\[0\]$/, "");
      state.uniformLocationLookups.set(normalizedName, (state.uniformLocationLookups.get(normalizedName) ?? 0) + 1);
      return program.uniforms.includes(normalizedName) ? { name: normalizedName } : null;
    },
    uniform1f() {},
    uniformMatrix4fv() {},
    uniform4fv() {},
    uniform3fv() {},
    uniform2fv() {},
    uniform1i() {},
    createTexture() {
      return { id: nextId++ };
    },
    bindTexture() {},
    texParameteri() {},
    createSampler() {
      return { id: nextId++ };
    },
    bindSampler() {},
    samplerParameteri() {},
    samplerParameterf() {},
    deleteSampler() {},
    texImage2D() {},
    texSubImage2D() {},
    pixelStorei() {},
    generateMipmap() {},
    activeTexture(texture: number) {
      state.activeTextureUnit = texture - this.TEXTURE0;
    },
    createFramebuffer() {
      return { id: nextId++ };
    },
    bindFramebuffer(target: number, framebuffer: unknown) {
      if (target === this.FRAMEBUFFER) state.framebuffer = framebuffer;
    },
    deleteFramebuffer() {},
    createVertexArray() {
      state.vertexArrayCreates += 1;
      return { id: nextId++ };
    },
    bindVertexArray(vertexArray: unknown) {
      state.vertexArray = vertexArray;
      state.vertexArrayBinds += 1;
    },
    deleteVertexArray() {},
    enable(capability: number) {
      state.enabled.add(capability);
    },
    disable(capability: number) {
      state.enabled.delete(capability);
    },
    isEnabled(capability: number) {
      return state.enabled.has(capability);
    },
    depthFunc() {},
    depthMask() {},
    colorMask() {},
    viewport() {},
    scissor() {},
    clearColor() {},
    clearDepth() {},
    clear() {},
    useProgram(program: CountingProgram) {
      state.currentProgram = program;
    },
    enableVertexAttribArray() {},
    vertexAttribPointer() {
      state.vertexAttribPointerCalls += 1;
    },
    vertexAttribDivisor() {},
    disableVertexAttribArray() {},
    vertexAttrib4f() {},
    vertexAttrib2f() {},
    cullFace() {},
    polygonOffset() {},
    stencilFunc() {},
    stencilMask() {},
    stencilOp() {},
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
  return gl as unknown as WebGL2RenderingContext & { readonly state: CountingWebGL2State };
}

function identityMatrix(): Float32Array {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ]);
}

function totalUniformLocationLookups(state: CountingWebGL2State): number {
  let total = 0;
  for (const count of state.uniformLocationLookups.values()) {
    total += count;
  }
  return total;
}

function parseNames(source: string, pattern: RegExp): string[] {
  return [...source.matchAll(pattern)].map((match) => match[1]!).filter((name, index, names) => names.indexOf(name) === index);
}
