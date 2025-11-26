/**
 * MockWebGL.ts
 *
 * Complete WebGL and WebGL2 mock implementation for headless testing.
 * Provides full WebGL API with state tracking for verification in tests.
 *
 * @module tests/utils/MockWebGL
 */

/**
 * Mock WebGL shader object
 */
export class MockWebGLShader {
  readonly type: number;
  source: string = '';
  compiled: boolean = false;

  constructor(type: number) {
    this.type = type;
  }
}

/**
 * Mock WebGL program object
 */
export class MockWebGLProgram {
  readonly shaders: MockWebGLShader[] = [];
  linked: boolean = false;
  attributes: Map<string, number> = new Map();
  uniforms: Map<string, WebGLUniformLocation> = new Map();

  attachShader(shader: MockWebGLShader): void {
    this.shaders.push(shader);
  }
}

/**
 * Mock WebGL buffer object
 */
export class MockWebGLBuffer {
  target: number = 0;
  data: ArrayBufferView | null = null;
  usage: number = 0;
  size: number = 0;
}

/**
 * Mock WebGL texture object
 */
export class MockWebGLTexture {
  target: number = 0;
  width: number = 0;
  height: number = 0;
  format: number = 0;
  type: number = 0;
  level: number = 0;
  minFilter: number = 0x2601; // LINEAR
  magFilter: number = 0x2601; // LINEAR
  wrapS: number = 0x2901; // REPEAT
  wrapT: number = 0x2901; // REPEAT
}

/**
 * Mock WebGL framebuffer object
 */
export class MockWebGLFramebuffer {
  attachments: Map<number, any> = new Map();
  complete: boolean = true;
}

/**
 * Mock WebGL renderbuffer object
 */
export class MockWebGLRenderbuffer {
  format: number = 0;
  width: number = 0;
  height: number = 0;
}

/**
 * Mock WebGL uniform location
 */
export class MockWebGLUniformLocation {
  readonly name: string;
  readonly program: MockWebGLProgram;

  constructor(name: string, program: MockWebGLProgram) {
    this.name = name;
    this.program = program;
  }
}

/**
 * Complete WebGL2 rendering context mock with state tracking
 */
export class MockWebGL2RenderingContext implements Partial<WebGL2RenderingContext> {
  // WebGL constants
  readonly DEPTH_BUFFER_BIT = 0x00000100;
  readonly STENCIL_BUFFER_BIT = 0x00000400;
  readonly COLOR_BUFFER_BIT = 0x00004000;
  readonly POINTS = 0x0000;
  readonly LINES = 0x0001;
  readonly LINE_LOOP = 0x0002;
  readonly LINE_STRIP = 0x0003;
  readonly TRIANGLES = 0x0004;
  readonly TRIANGLE_STRIP = 0x0005;
  readonly TRIANGLE_FAN = 0x0006;
  readonly ZERO = 0;
  readonly ONE = 1;
  readonly SRC_COLOR = 0x0300;
  readonly ONE_MINUS_SRC_COLOR = 0x0301;
  readonly SRC_ALPHA = 0x0302;
  readonly ONE_MINUS_SRC_ALPHA = 0x0303;
  readonly DST_ALPHA = 0x0304;
  readonly ONE_MINUS_DST_ALPHA = 0x0305;
  readonly DST_COLOR = 0x0306;
  readonly ONE_MINUS_DST_COLOR = 0x0307;
  readonly SRC_ALPHA_SATURATE = 0x0308;
  readonly FUNC_ADD = 0x8006;
  readonly BLEND_EQUATION = 0x8009;
  readonly BLEND_EQUATION_RGB = 0x8009;
  readonly BLEND_EQUATION_ALPHA = 0x883D;
  readonly FUNC_SUBTRACT = 0x800A;
  readonly FUNC_REVERSE_SUBTRACT = 0x800B;
  readonly BLEND_DST_RGB = 0x80C8;
  readonly BLEND_SRC_RGB = 0x80C9;
  readonly BLEND_DST_ALPHA = 0x80CA;
  readonly BLEND_SRC_ALPHA = 0x80CB;
  readonly CONSTANT_COLOR = 0x8001;
  readonly ONE_MINUS_CONSTANT_COLOR = 0x8002;
  readonly CONSTANT_ALPHA = 0x8003;
  readonly ONE_MINUS_CONSTANT_ALPHA = 0x8004;
  readonly BLEND_COLOR = 0x8005;
  readonly ARRAY_BUFFER = 0x8892;
  readonly ELEMENT_ARRAY_BUFFER = 0x8893;
  readonly ARRAY_BUFFER_BINDING = 0x8894;
  readonly ELEMENT_ARRAY_BUFFER_BINDING = 0x8895;
  readonly STREAM_DRAW = 0x88E0;
  readonly STATIC_DRAW = 0x88E4;
  readonly DYNAMIC_DRAW = 0x88E8;
  readonly BUFFER_SIZE = 0x8764;
  readonly BUFFER_USAGE = 0x8765;
  readonly CURRENT_VERTEX_ATTRIB = 0x8626;
  readonly FRONT = 0x0404;
  readonly BACK = 0x0405;
  readonly FRONT_AND_BACK = 0x0408;
  readonly CULL_FACE = 0x0B44;
  readonly BLEND = 0x0BE2;
  readonly DITHER = 0x0BD0;
  readonly STENCIL_TEST = 0x0B90;
  readonly DEPTH_TEST = 0x0B71;
  readonly SCISSOR_TEST = 0x0C11;
  readonly POLYGON_OFFSET_FILL = 0x8037;
  readonly SAMPLE_ALPHA_TO_COVERAGE = 0x809E;
  readonly SAMPLE_COVERAGE = 0x80A0;
  readonly NO_ERROR = 0;
  readonly INVALID_ENUM = 0x0500;
  readonly INVALID_VALUE = 0x0501;
  readonly INVALID_OPERATION = 0x0502;
  readonly OUT_OF_MEMORY = 0x0505;
  readonly CW = 0x0900;
  readonly CCW = 0x0901;
  readonly LINE_WIDTH = 0x0B21;
  readonly ALIASED_POINT_SIZE_RANGE = 0x846D;
  readonly ALIASED_LINE_WIDTH_RANGE = 0x846E;
  readonly CULL_FACE_MODE = 0x0B45;
  readonly FRONT_FACE = 0x0B46;
  readonly DEPTH_RANGE = 0x0B70;
  readonly DEPTH_WRITEMASK = 0x0B72;
  readonly DEPTH_CLEAR_VALUE = 0x0B73;
  readonly DEPTH_FUNC = 0x0B74;
  readonly STENCIL_CLEAR_VALUE = 0x0B91;
  readonly STENCIL_FUNC = 0x0B92;
  readonly STENCIL_FAIL = 0x0B94;
  readonly STENCIL_PASS_DEPTH_FAIL = 0x0B95;
  readonly STENCIL_PASS_DEPTH_PASS = 0x0B96;
  readonly STENCIL_REF = 0x0B97;
  readonly STENCIL_VALUE_MASK = 0x0B93;
  readonly STENCIL_WRITEMASK = 0x0B98;
  readonly STENCIL_BACK_FUNC = 0x8800;
  readonly STENCIL_BACK_FAIL = 0x8801;
  readonly STENCIL_BACK_PASS_DEPTH_FAIL = 0x8802;
  readonly STENCIL_BACK_PASS_DEPTH_PASS = 0x8803;
  readonly STENCIL_BACK_REF = 0x8CA3;
  readonly STENCIL_BACK_VALUE_MASK = 0x8CA4;
  readonly STENCIL_BACK_WRITEMASK = 0x8CA5;
  readonly VIEWPORT = 0x0BA2;
  readonly SCISSOR_BOX = 0x0C10;
  readonly COLOR_CLEAR_VALUE = 0x0C22;
  readonly COLOR_WRITEMASK = 0x0C23;
  readonly UNPACK_ALIGNMENT = 0x0CF5;
  readonly PACK_ALIGNMENT = 0x0D05;
  readonly MAX_TEXTURE_SIZE = 0x0D33;
  readonly MAX_VIEWPORT_DIMS = 0x0D3A;
  readonly SUBPIXEL_BITS = 0x0D50;
  readonly RED_BITS = 0x0D52;
  readonly GREEN_BITS = 0x0D53;
  readonly BLUE_BITS = 0x0D54;
  readonly ALPHA_BITS = 0x0D55;
  readonly DEPTH_BITS = 0x0D56;
  readonly STENCIL_BITS = 0x0D57;
  readonly POLYGON_OFFSET_UNITS = 0x2A00;
  readonly POLYGON_OFFSET_FACTOR = 0x8038;
  readonly TEXTURE_BINDING_2D = 0x8069;
  readonly SAMPLE_BUFFERS = 0x80A8;
  readonly SAMPLES = 0x80A9;
  readonly SAMPLE_COVERAGE_VALUE = 0x80AA;
  readonly SAMPLE_COVERAGE_INVERT = 0x80AB;
  readonly COMPRESSED_TEXTURE_FORMATS = 0x86A3;
  readonly DONT_CARE = 0x1100;
  readonly FASTEST = 0x1101;
  readonly NICEST = 0x1102;
  readonly GENERATE_MIPMAP_HINT = 0x8192;
  readonly BYTE = 0x1400;
  readonly UNSIGNED_BYTE = 0x1401;
  readonly SHORT = 0x1402;
  readonly UNSIGNED_SHORT = 0x1403;
  readonly INT = 0x1404;
  readonly UNSIGNED_INT = 0x1405;
  readonly FLOAT = 0x1406;
  readonly DEPTH_COMPONENT = 0x1902;
  readonly ALPHA = 0x1906;
  readonly RGB = 0x1907;
  readonly RGBA = 0x1908;
  readonly LUMINANCE = 0x1909;
  readonly LUMINANCE_ALPHA = 0x190A;
  readonly UNSIGNED_SHORT_4_4_4_4 = 0x8033;
  readonly UNSIGNED_SHORT_5_5_5_1 = 0x8034;
  readonly UNSIGNED_SHORT_5_6_5 = 0x8363;
  readonly FRAGMENT_SHADER = 0x8B30;
  readonly VERTEX_SHADER = 0x8B31;
  readonly MAX_VERTEX_ATTRIBS = 0x8869;
  readonly MAX_VERTEX_UNIFORM_VECTORS = 0x8DFB;
  readonly MAX_VARYING_VECTORS = 0x8DFC;
  readonly MAX_COMBINED_TEXTURE_IMAGE_UNITS = 0x8B4D;
  readonly MAX_VERTEX_TEXTURE_IMAGE_UNITS = 0x8B4C;
  readonly MAX_TEXTURE_IMAGE_UNITS = 0x8872;
  readonly MAX_FRAGMENT_UNIFORM_VECTORS = 0x8DFD;
  readonly SHADER_TYPE = 0x8B4F;
  readonly DELETE_STATUS = 0x8B80;
  readonly LINK_STATUS = 0x8B82;
  readonly VALIDATE_STATUS = 0x8B83;
  readonly ATTACHED_SHADERS = 0x8B85;
  readonly ACTIVE_UNIFORMS = 0x8B86;
  readonly ACTIVE_ATTRIBUTES = 0x8B89;
  readonly SHADING_LANGUAGE_VERSION = 0x8B8C;
  readonly CURRENT_PROGRAM = 0x8B8D;
  readonly NEVER = 0x0200;
  readonly LESS = 0x0201;
  readonly EQUAL = 0x0202;
  readonly LEQUAL = 0x0203;
  readonly GREATER = 0x0204;
  readonly NOTEQUAL = 0x0205;
  readonly GEQUAL = 0x0206;
  readonly ALWAYS = 0x0207;
  readonly KEEP = 0x1E00;
  readonly REPLACE = 0x1E01;
  readonly INCR = 0x1E02;
  readonly DECR = 0x1E03;
  readonly INVERT = 0x150A;
  readonly INCR_WRAP = 0x8507;
  readonly DECR_WRAP = 0x8508;
  readonly VENDOR = 0x1F00;
  readonly RENDERER = 0x1F01;
  readonly VERSION = 0x1F02;
  readonly NEAREST = 0x2600;
  readonly LINEAR = 0x2601;
  readonly NEAREST_MIPMAP_NEAREST = 0x2700;
  readonly LINEAR_MIPMAP_NEAREST = 0x2701;
  readonly NEAREST_MIPMAP_LINEAR = 0x2702;
  readonly LINEAR_MIPMAP_LINEAR = 0x2703;
  readonly TEXTURE_MAG_FILTER = 0x2800;
  readonly TEXTURE_MIN_FILTER = 0x2801;
  readonly TEXTURE_WRAP_S = 0x2802;
  readonly TEXTURE_WRAP_T = 0x2803;
  readonly TEXTURE_2D = 0x0DE1;
  readonly TEXTURE = 0x1702;
  readonly TEXTURE_CUBE_MAP = 0x8513;
  readonly TEXTURE_BINDING_CUBE_MAP = 0x8514;
  readonly TEXTURE_CUBE_MAP_POSITIVE_X = 0x8515;
  readonly TEXTURE_CUBE_MAP_NEGATIVE_X = 0x8516;
  readonly TEXTURE_CUBE_MAP_POSITIVE_Y = 0x8517;
  readonly TEXTURE_CUBE_MAP_NEGATIVE_Y = 0x8518;
  readonly TEXTURE_CUBE_MAP_POSITIVE_Z = 0x8519;
  readonly TEXTURE_CUBE_MAP_NEGATIVE_Z = 0x851A;
  readonly MAX_CUBE_MAP_TEXTURE_SIZE = 0x851C;
  readonly TEXTURE0 = 0x84C0;
  readonly TEXTURE1 = 0x84C1;
  readonly TEXTURE2 = 0x84C2;
  readonly TEXTURE3 = 0x84C3;
  readonly TEXTURE4 = 0x84C4;
  readonly TEXTURE5 = 0x84C5;
  readonly TEXTURE6 = 0x84C6;
  readonly TEXTURE7 = 0x84C7;
  readonly TEXTURE8 = 0x84C8;
  readonly TEXTURE9 = 0x84C9;
  readonly TEXTURE10 = 0x84CA;
  readonly TEXTURE11 = 0x84CB;
  readonly TEXTURE12 = 0x84CC;
  readonly TEXTURE13 = 0x84CD;
  readonly TEXTURE14 = 0x84CE;
  readonly TEXTURE15 = 0x84CF;
  readonly TEXTURE16 = 0x84D0;
  readonly TEXTURE17 = 0x84D1;
  readonly TEXTURE18 = 0x84D2;
  readonly TEXTURE19 = 0x84D3;
  readonly TEXTURE20 = 0x84D4;
  readonly TEXTURE21 = 0x84D5;
  readonly TEXTURE22 = 0x84D6;
  readonly TEXTURE23 = 0x84D7;
  readonly TEXTURE24 = 0x84D8;
  readonly TEXTURE25 = 0x84D9;
  readonly TEXTURE26 = 0x84DA;
  readonly TEXTURE27 = 0x84DB;
  readonly TEXTURE28 = 0x84DC;
  readonly TEXTURE29 = 0x84DD;
  readonly TEXTURE30 = 0x84DE;
  readonly TEXTURE31 = 0x84DF;
  readonly ACTIVE_TEXTURE = 0x84E0;
  readonly REPEAT = 0x2901;
  readonly CLAMP_TO_EDGE = 0x812F;
  readonly MIRRORED_REPEAT = 0x8370;
  readonly FLOAT_VEC2 = 0x8B50;
  readonly FLOAT_VEC3 = 0x8B51;
  readonly FLOAT_VEC4 = 0x8B52;
  readonly INT_VEC2 = 0x8B53;
  readonly INT_VEC3 = 0x8B54;
  readonly INT_VEC4 = 0x8B55;
  readonly BOOL = 0x8B56;
  readonly BOOL_VEC2 = 0x8B57;
  readonly BOOL_VEC3 = 0x8B58;
  readonly BOOL_VEC4 = 0x8B59;
  readonly FLOAT_MAT2 = 0x8B5A;
  readonly FLOAT_MAT3 = 0x8B5B;
  readonly FLOAT_MAT4 = 0x8B5C;
  readonly SAMPLER_2D = 0x8B5E;
  readonly SAMPLER_CUBE = 0x8B60;
  readonly VERTEX_ATTRIB_ARRAY_ENABLED = 0x8622;
  readonly VERTEX_ATTRIB_ARRAY_SIZE = 0x8623;
  readonly VERTEX_ATTRIB_ARRAY_STRIDE = 0x8624;
  readonly VERTEX_ATTRIB_ARRAY_TYPE = 0x8625;
  readonly VERTEX_ATTRIB_ARRAY_NORMALIZED = 0x886A;
  readonly VERTEX_ATTRIB_ARRAY_POINTER = 0x8645;
  readonly VERTEX_ATTRIB_ARRAY_BUFFER_BINDING = 0x889F;
  readonly COMPILE_STATUS = 0x8B81;
  readonly LOW_FLOAT = 0x8DF0;
  readonly MEDIUM_FLOAT = 0x8DF1;
  readonly HIGH_FLOAT = 0x8DF2;
  readonly LOW_INT = 0x8DF3;
  readonly MEDIUM_INT = 0x8DF4;
  readonly HIGH_INT = 0x8DF5;
  readonly FRAMEBUFFER = 0x8D40;
  readonly RENDERBUFFER = 0x8D41;
  readonly RGBA4 = 0x8056;
  readonly RGB5_A1 = 0x8057;
  readonly RGB565 = 0x8D62;
  readonly DEPTH_COMPONENT16 = 0x81A5;
  readonly STENCIL_INDEX8 = 0x8D48;
  readonly DEPTH_STENCIL = 0x84F9;
  readonly RENDERBUFFER_WIDTH = 0x8D42;
  readonly RENDERBUFFER_HEIGHT = 0x8D43;
  readonly RENDERBUFFER_INTERNAL_FORMAT = 0x8D44;
  readonly RENDERBUFFER_RED_SIZE = 0x8D50;
  readonly RENDERBUFFER_GREEN_SIZE = 0x8D51;
  readonly RENDERBUFFER_BLUE_SIZE = 0x8D52;
  readonly RENDERBUFFER_ALPHA_SIZE = 0x8D53;
  readonly RENDERBUFFER_DEPTH_SIZE = 0x8D54;
  readonly RENDERBUFFER_STENCIL_SIZE = 0x8D55;
  readonly FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE = 0x8CD0;
  readonly FRAMEBUFFER_ATTACHMENT_OBJECT_NAME = 0x8CD1;
  readonly FRAMEBUFFER_ATTACHMENT_TEXTURE_LEVEL = 0x8CD2;
  readonly FRAMEBUFFER_ATTACHMENT_TEXTURE_CUBE_MAP_FACE = 0x8CD3;
  readonly COLOR_ATTACHMENT0 = 0x8CE0;
  readonly DEPTH_ATTACHMENT = 0x8D00;
  readonly STENCIL_ATTACHMENT = 0x8D20;
  readonly DEPTH_STENCIL_ATTACHMENT = 0x821A;
  readonly NONE = 0;
  readonly FRAMEBUFFER_COMPLETE = 0x8CD5;
  readonly FRAMEBUFFER_INCOMPLETE_ATTACHMENT = 0x8CD6;
  readonly FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT = 0x8CD7;
  readonly FRAMEBUFFER_INCOMPLETE_DIMENSIONS = 0x8CD9;
  readonly FRAMEBUFFER_UNSUPPORTED = 0x8CDD;
  readonly FRAMEBUFFER_BINDING = 0x8CA6;
  readonly RENDERBUFFER_BINDING = 0x8CA7;
  readonly MAX_RENDERBUFFER_SIZE = 0x84E8;
  readonly INVALID_FRAMEBUFFER_OPERATION = 0x0506;
  readonly UNPACK_FLIP_Y_WEBGL = 0x9240;
  readonly UNPACK_PREMULTIPLY_ALPHA_WEBGL = 0x9241;
  readonly CONTEXT_LOST_WEBGL = 0x9242;
  readonly UNPACK_COLORSPACE_CONVERSION_WEBGL = 0x9243;
  readonly BROWSER_DEFAULT_WEBGL = 0x9244;

  // Canvas reference
  readonly canvas: HTMLCanvasElement;
  readonly drawingBufferWidth: number = 800;
  readonly drawingBufferHeight: number = 600;

  // State tracking
  private currentProgram: MockWebGLProgram | null = null;
  private boundBuffers: Map<number, MockWebGLBuffer | null> = new Map();
  private boundTextures: Map<number, MockWebGLTexture | null> = new Map();
  private boundFramebuffer: MockWebGLFramebuffer | null = null;
  private boundRenderbuffer: MockWebGLRenderbuffer | null = null;
  private activeTextureUnit: number = 0;
  private enabledCapabilities: Set<number> = new Set();
  private viewportRect: [number, number, number, number] = [0, 0, 800, 600];
  private scissorRect: [number, number, number, number] = [0, 0, 800, 600];
  private clearColorValue: [number, number, number, number] = [0, 0, 0, 0];
  private blendFunc: { src: number; dst: number } = { src: this.ONE, dst: this.ZERO };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  // Buffer operations
  createBuffer(): WebGLBuffer | null {
    return new MockWebGLBuffer() as any;
  }

  bindBuffer(target: number, buffer: WebGLBuffer | null): void {
    this.boundBuffers.set(target, buffer as any);
  }

  bufferData(target: number, sizeOrData: number | ArrayBufferView | ArrayBuffer | null, usage: number): void {
    const buffer = this.boundBuffers.get(target);
    if (buffer && sizeOrData !== null) {
      if (typeof sizeOrData === 'number') {
        buffer.size = sizeOrData;
      } else if (ArrayBuffer.isView(sizeOrData)) {
        buffer.data = sizeOrData;
        buffer.size = sizeOrData.byteLength;
      } else {
        buffer.size = sizeOrData.byteLength;
      }
      buffer.usage = usage;
      buffer.target = target;
    }
  }

  bufferSubData(target: number, offset: number, data: ArrayBufferView | ArrayBuffer): void {
    // Mock implementation - no actual data update needed
  }

  deleteBuffer(buffer: WebGLBuffer | null): void {
    // Mock implementation - cleanup if needed
  }

  isBuffer(buffer: any): boolean {
    return buffer instanceof MockWebGLBuffer;
  }

  // Shader operations
  createShader(type: number): WebGLShader | null {
    return new MockWebGLShader(type) as any;
  }

  shaderSource(shader: WebGLShader, source: string): void {
    (shader as any).source = source;
  }

  compileShader(shader: WebGLShader): void {
    (shader as any).compiled = true;
  }

  getShaderParameter(shader: WebGLShader, pname: number): any {
    if (pname === this.COMPILE_STATUS) {
      return true;
    }
    if (pname === this.SHADER_TYPE) {
      return (shader as any).type;
    }
    return null;
  }

  getShaderInfoLog(shader: WebGLShader): string | null {
    return '';
  }

  deleteShader(shader: WebGLShader | null): void {
    // Mock implementation
  }

  isShader(shader: any): boolean {
    return shader instanceof MockWebGLShader;
  }

  // Program operations
  createProgram(): WebGLProgram | null {
    return new MockWebGLProgram() as any;
  }

  attachShader(program: WebGLProgram, shader: WebGLShader): void {
    (program as any).attachShader(shader);
  }

  linkProgram(program: WebGLProgram): void {
    (program as any).linked = true;
  }

  getProgramParameter(program: WebGLProgram, pname: number): any {
    if (pname === this.LINK_STATUS) {
      return true;
    }
    if (pname === this.VALIDATE_STATUS) {
      return true;
    }
    if (pname === this.ATTACHED_SHADERS) {
      return (program as any).shaders.length;
    }
    return null;
  }

  getProgramInfoLog(program: WebGLProgram): string | null {
    return '';
  }

  useProgram(program: WebGLProgram | null): void {
    this.currentProgram = program as any;
  }

  deleteProgram(program: WebGLProgram | null): void {
    // Mock implementation
  }

  isProgram(program: any): boolean {
    return program instanceof MockWebGLProgram;
  }

  validateProgram(program: WebGLProgram): void {
    // Mock implementation
  }

  // Attribute operations
  getAttribLocation(program: WebGLProgram, name: string): number {
    const mockProgram = program as any;
    if (!mockProgram.attributes.has(name)) {
      mockProgram.attributes.set(name, mockProgram.attributes.size);
    }
    return mockProgram.attributes.get(name);
  }

  bindAttribLocation(program: WebGLProgram, index: number, name: string): void {
    (program as any).attributes.set(name, index);
  }

  enableVertexAttribArray(index: number): void {
    // Mock implementation
  }

  disableVertexAttribArray(index: number): void {
    // Mock implementation
  }

  vertexAttribPointer(
    index: number,
    size: number,
    type: number,
    normalized: boolean,
    stride: number,
    offset: number
  ): void {
    // Mock implementation
  }

  vertexAttrib1f(index: number, x: number): void {}
  vertexAttrib2f(index: number, x: number, y: number): void {}
  vertexAttrib3f(index: number, x: number, y: number, z: number): void {}
  vertexAttrib4f(index: number, x: number, y: number, z: number, w: number): void {}

  // Uniform operations
  getUniformLocation(program: WebGLProgram, name: string): WebGLUniformLocation | null {
    const mockProgram = program as any;
    if (!mockProgram.uniforms.has(name)) {
      const location = new MockWebGLUniformLocation(name, mockProgram);
      mockProgram.uniforms.set(name, location);
    }
    return mockProgram.uniforms.get(name) as any;
  }

  uniform1f(location: WebGLUniformLocation | null, x: number): void {}
  uniform2f(location: WebGLUniformLocation | null, x: number, y: number): void {}
  uniform3f(location: WebGLUniformLocation | null, x: number, y: number, z: number): void {}
  uniform4f(location: WebGLUniformLocation | null, x: number, y: number, z: number, w: number): void {}
  uniform1i(location: WebGLUniformLocation | null, x: number): void {}
  uniform2i(location: WebGLUniformLocation | null, x: number, y: number): void {}
  uniform3i(location: WebGLUniformLocation | null, x: number, y: number, z: number): void {}
  uniform4i(location: WebGLUniformLocation | null, x: number, y: number, z: number, w: number): void {}

  uniform1fv(location: WebGLUniformLocation | null, v: Float32Array | number[]): void {}
  uniform2fv(location: WebGLUniformLocation | null, v: Float32Array | number[]): void {}
  uniform3fv(location: WebGLUniformLocation | null, v: Float32Array | number[]): void {}
  uniform4fv(location: WebGLUniformLocation | null, v: Float32Array | number[]): void {}
  uniform1iv(location: WebGLUniformLocation | null, v: Int32Array | number[]): void {}
  uniform2iv(location: WebGLUniformLocation | null, v: Int32Array | number[]): void {}
  uniform3iv(location: WebGLUniformLocation | null, v: Int32Array | number[]): void {}
  uniform4iv(location: WebGLUniformLocation | null, v: Int32Array | number[]): void {}

  uniformMatrix2fv(location: WebGLUniformLocation | null, transpose: boolean, value: Float32Array | number[]): void {}
  uniformMatrix3fv(location: WebGLUniformLocation | null, transpose: boolean, value: Float32Array | number[]): void {}
  uniformMatrix4fv(location: WebGLUniformLocation | null, transpose: boolean, value: Float32Array | number[]): void {}

  // Texture operations
  createTexture(): WebGLTexture | null {
    return new MockWebGLTexture() as any;
  }

  bindTexture(target: number, texture: WebGLTexture | null): void {
    this.boundTextures.set(this.activeTextureUnit * 0x84C0 + target, texture as any);
  }

  activeTexture(texture: number): void {
    this.activeTextureUnit = texture - this.TEXTURE0;
  }

  texImage2D(...args: any[]): void {
    // Mock implementation - supports multiple signatures
  }

  texSubImage2D(...args: any[]): void {
    // Mock implementation
  }

  texParameteri(target: number, pname: number, param: number): void {
    const texture = this.boundTextures.get(this.activeTextureUnit * 0x84C0 + target);
    if (texture) {
      if (pname === this.TEXTURE_MIN_FILTER) texture.minFilter = param;
      if (pname === this.TEXTURE_MAG_FILTER) texture.magFilter = param;
      if (pname === this.TEXTURE_WRAP_S) texture.wrapS = param;
      if (pname === this.TEXTURE_WRAP_T) texture.wrapT = param;
    }
  }

  texParameterf(target: number, pname: number, param: number): void {
    this.texParameteri(target, pname, param);
  }

  generateMipmap(target: number): void {
    // Mock implementation
  }

  deleteTexture(texture: WebGLTexture | null): void {
    // Mock implementation
  }

  isTexture(texture: any): boolean {
    return texture instanceof MockWebGLTexture;
  }

  // Framebuffer operations
  createFramebuffer(): WebGLFramebuffer | null {
    return new MockWebGLFramebuffer() as any;
  }

  bindFramebuffer(target: number, framebuffer: WebGLFramebuffer | null): void {
    this.boundFramebuffer = framebuffer as any;
  }

  framebufferTexture2D(
    target: number,
    attachment: number,
    textarget: number,
    texture: WebGLTexture | null,
    level: number
  ): void {
    if (this.boundFramebuffer) {
      this.boundFramebuffer.attachments.set(attachment, texture);
    }
  }

  framebufferRenderbuffer(
    target: number,
    attachment: number,
    renderbuffertarget: number,
    renderbuffer: WebGLRenderbuffer | null
  ): void {
    if (this.boundFramebuffer) {
      this.boundFramebuffer.attachments.set(attachment, renderbuffer);
    }
  }

  checkFramebufferStatus(target: number): number {
    return this.FRAMEBUFFER_COMPLETE;
  }

  deleteFramebuffer(framebuffer: WebGLFramebuffer | null): void {
    // Mock implementation
  }

  isFramebuffer(framebuffer: any): boolean {
    return framebuffer instanceof MockWebGLFramebuffer;
  }

  // Renderbuffer operations
  createRenderbuffer(): WebGLRenderbuffer | null {
    return new MockWebGLRenderbuffer() as any;
  }

  bindRenderbuffer(target: number, renderbuffer: WebGLRenderbuffer | null): void {
    this.boundRenderbuffer = renderbuffer as any;
  }

  renderbufferStorage(target: number, internalformat: number, width: number, height: number): void {
    if (this.boundRenderbuffer) {
      this.boundRenderbuffer.format = internalformat;
      this.boundRenderbuffer.width = width;
      this.boundRenderbuffer.height = height;
    }
  }

  deleteRenderbuffer(renderbuffer: WebGLRenderbuffer | null): void {
    // Mock implementation
  }

  isRenderbuffer(renderbuffer: any): boolean {
    return renderbuffer instanceof MockWebGLRenderbuffer;
  }

  // Drawing operations
  clear(mask: number): void {
    // Mock implementation
  }

  clearColor(red: number, green: number, blue: number, alpha: number): void {
    this.clearColorValue = [red, green, blue, alpha];
  }

  clearDepth(depth: number): void {
    // Mock implementation
  }

  clearStencil(s: number): void {
    // Mock implementation
  }

  drawArrays(mode: number, first: number, count: number): void {
    // Mock implementation
  }

  drawElements(mode: number, count: number, type: number, offset: number): void {
    // Mock implementation
  }

  // State operations
  enable(cap: number): void {
    this.enabledCapabilities.add(cap);
  }

  disable(cap: number): void {
    this.enabledCapabilities.delete(cap);
  }

  isEnabled(cap: number): boolean {
    return this.enabledCapabilities.has(cap);
  }

  viewport(x: number, y: number, width: number, height: number): void {
    this.viewportRect = [x, y, width, height];
  }

  scissor(x: number, y: number, width: number, height: number): void {
    this.scissorRect = [x, y, width, height];
  }

  blendFunc(sfactor: number, dfactor: number): void {
    this.blendFunc = { src: sfactor, dst: dfactor };
  }

  blendFuncSeparate(srcRGB: number, dstRGB: number, srcAlpha: number, dstAlpha: number): void {
    // Mock implementation
  }

  blendEquation(mode: number): void {
    // Mock implementation
  }

  blendEquationSeparate(modeRGB: number, modeAlpha: number): void {
    // Mock implementation
  }

  blendColor(red: number, green: number, blue: number, alpha: number): void {
    // Mock implementation
  }

  depthFunc(func: number): void {
    // Mock implementation
  }

  depthMask(flag: boolean): void {
    // Mock implementation
  }

  depthRange(zNear: number, zFar: number): void {
    // Mock implementation
  }

  cullFace(mode: number): void {
    // Mock implementation
  }

  frontFace(mode: number): void {
    // Mock implementation
  }

  lineWidth(width: number): void {
    // Mock implementation
  }

  polygonOffset(factor: number, units: number): void {
    // Mock implementation
  }

  // State queries
  getParameter(pname: number): any {
    switch (pname) {
      case this.VERSION:
        return 'WebGL 2.0 (Mock)';
      case this.VENDOR:
        return 'Mock Vendor';
      case this.RENDERER:
        return 'Mock Renderer';
      case this.SHADING_LANGUAGE_VERSION:
        return 'WebGL GLSL ES 3.00 (Mock)';
      case this.MAX_TEXTURE_SIZE:
        return 8192;
      case this.MAX_VIEWPORT_DIMS:
        return [8192, 8192];
      case this.MAX_VERTEX_ATTRIBS:
        return 16;
      case this.MAX_TEXTURE_IMAGE_UNITS:
        return 16;
      case this.MAX_COMBINED_TEXTURE_IMAGE_UNITS:
        return 32;
      case this.VIEWPORT:
        return this.viewportRect;
      case this.SCISSOR_BOX:
        return this.scissorRect;
      case this.COLOR_CLEAR_VALUE:
        return this.clearColorValue;
      default:
        return null;
    }
  }

  getError(): number {
    return this.NO_ERROR;
  }

  // Extension support
  getExtension(name: string): any {
    return null;
  }

  getSupportedExtensions(): string[] | null {
    return [];
  }

  // Additional methods
  finish(): void {}
  flush(): void {}
  hint(target: number, mode: number): void {}
  pixelStorei(pname: number, param: number): void {}
  readPixels(
    x: number,
    y: number,
    width: number,
    height: number,
    format: number,
    type: number,
    pixels: ArrayBufferView | null
  ): void {}
  stencilFunc(func: number, ref: number, mask: number): void {}
  stencilFuncSeparate(face: number, func: number, ref: number, mask: number): void {}
  stencilMask(mask: number): void {}
  stencilMaskSeparate(face: number, mask: number): void {}
  stencilOp(fail: number, zfail: number, zpass: number): void {}
  stencilOpSeparate(face: number, fail: number, zfail: number, zpass: number): void {}
  colorMask(red: boolean, green: boolean, blue: boolean, alpha: boolean): void {}
  sampleCoverage(value: number, invert: boolean): void {}

  // Getters for testing state
  getCurrentProgram(): MockWebGLProgram | null {
    return this.currentProgram;
  }

  getBoundBuffer(target: number): MockWebGLBuffer | null {
    return this.boundBuffers.get(target) || null;
  }

  getBoundTexture(target: number): MockWebGLTexture | null {
    return this.boundTextures.get(this.activeTextureUnit * 0x84C0 + target) || null;
  }
}

/**
 * Creates a mock WebGL2 rendering context for testing
 *
 * @param canvas - Canvas element to attach to
 * @returns Mock WebGL2 context
 *
 * @example
 * ```typescript
 * const canvas = createMockCanvas();
 * const gl = createMockWebGL2Context(canvas);
 * ```
 */
export function createMockWebGL2Context(canvas: HTMLCanvasElement): MockWebGL2RenderingContext {
  return new MockWebGL2RenderingContext(canvas);
}
