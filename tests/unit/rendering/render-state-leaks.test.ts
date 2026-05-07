import { describe, expect, it } from "vitest";
import {
  Geometry,
  Texture,
  TextureBinding,
  WebGL2Device,
  type DrawCommand
} from "../../../packages/rendering/src";

describe("WebGL2 render-state isolation", () => {
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
      marker: "@galileo3d-test:texture-state",
      vertex: `
        // @galileo3d-test:texture-state
        void main() {
          gl_Position = vec4(0.0, 0.0, 0.0, 1.0);
        }
      `,
      fragment: `
        // @galileo3d-test:texture-state
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
  currentProgram: FakeProgram | null;
  cullFace: number;
  depthFunc: number;
  depthMask: boolean;
  enabled: Set<number>;
  uniformSamplers: Map<string, number>;
  viewport: [number, number, number, number];
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
    currentProgram: null,
    cullFace: 0x0405,
    depthFunc: 0x0203,
    depthMask: true,
    enabled: new Set<number>(),
    uniformSamplers: new Map<string, number>(),
    viewport: [0, 0, 0, 0]
  };
  const gl = {
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
    DEPTH_BUFFER_BIT: 0x0100,
    DEPTH_TEST: 0x0b71,
    DYNAMIC_DRAW: 0x88e8,
    ELEMENT_ARRAY_BUFFER: 0x8893,
    ELEMENT_ARRAY_BUFFER_BINDING: 0x8895,
    FLOAT: 0x1406,
    FRAGMENT_SHADER: 0x8b30,
    FRAMEBUFFER: 0x8d40,
    FRAMEBUFFER_COMPLETE: 0x8cd5,
    FRONT: 0x0404,
    LEQUAL: 0x0203,
    LINEAR: 0x2601,
    LINES: 0x0001,
    LINK_STATUS: 0x8b82,
    MAX_VERTEX_ATTRIBS: 0x8869,
    MIRRORED_REPEAT: 0x8370,
    NEAREST: 0x2600,
    NO_ERROR: 0,
    ONE_MINUS_SRC_ALPHA: 0x0303,
    POINTS: 0x0000,
    RENDERER: 0x1f01,
    REPEAT: 0x2901,
    RGBA: 0x1908,
    SRC_ALPHA: 0x0302,
    TEXTURE0: 0x84c0,
    TEXTURE_2D: 0x0de1,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    TRIANGLES: 0x0004,
    UNSIGNED_BYTE: 0x1401,
    UNSIGNED_INT: 0x1405,
    UNSIGNED_SHORT: 0x1403,
    VENDOR: 0x1f00,
    VERTEX_SHADER: 0x8b31,
    state,
    getParameter(parameter: number) {
      if (parameter === this.MAX_VERTEX_ATTRIBS) return 8;
      if (parameter === this.VENDOR) return "galileo3d";
      if (parameter === this.RENDERER) return "fake-webgl2";
      if (parameter === this.CURRENT_PROGRAM) return state.currentProgram;
      if (parameter === this.ARRAY_BUFFER_BINDING) return state.arrayBuffer;
      if (parameter === this.ELEMENT_ARRAY_BUFFER_BINDING) return state.elementArrayBuffer;
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
    deleteShader() {},
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
    deleteProgram() {},
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
    bindTexture() {},
    texParameteri() {},
    texImage2D() {},
    createFramebuffer() {
      return { id: nextId++ };
    },
    bindFramebuffer(target: number, framebuffer: unknown) {
      if (target === this.FRAMEBUFFER) state.framebuffer = framebuffer;
    },
    framebufferTexture2D() {},
    checkFramebufferStatus() {
      return this.FRAMEBUFFER_COMPLETE;
    },
    deleteTexture() {},
    deleteFramebuffer() {},
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
    viewport(x: number, y: number, width: number, height: number) {
      state.viewport = [x, y, width, height];
    },
    clearColor() {},
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
    disableVertexAttribArray() {},
    vertexAttrib4f() {},
    cullFace(mode: number) {
      state.cullFace = mode;
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
