/**
 * MockCanvas.ts
 *
 * Mock HTMLCanvasElement for headless testing without real DOM.
 * Provides minimal implementation needed for engine initialization and testing.
 *
 * @module tests/utils/MockCanvas
 */

/**
 * Mock WebGL rendering context for testing.
 * Implements minimal WebGL API needed for engine initialization.
 */
export class MockWebGLRenderingContext {
  readonly ARRAY_BUFFER = 0x8892;
  readonly STATIC_DRAW = 0x88E4;
  readonly FLOAT = 0x1406;
  readonly VERTEX_SHADER = 0x8B31;
  readonly FRAGMENT_SHADER = 0x8B30;
  readonly COMPILE_STATUS = 0x8B81;
  readonly LINK_STATUS = 0x8B82;
  readonly COLOR_BUFFER_BIT = 0x00004000;
  readonly DEPTH_BUFFER_BIT = 0x00000100;
  readonly TRIANGLES = 0x0004;
  readonly DEPTH_TEST = 0x0B71;
  readonly CULL_FACE = 0x0B44;
  readonly BLEND = 0x0BE2;

  canvas: MockHTMLCanvasElement;
  drawingBufferWidth: number = 800;
  drawingBufferHeight: number = 600;

  constructor(canvas: MockHTMLCanvasElement) {
    this.canvas = canvas;
  }

  // Buffer operations
  createBuffer(): {} { return {}; }
  bindBuffer(target: number, buffer: any): void {}
  bufferData(target: number, data: any, usage: number): void {}
  deleteBuffer(buffer: any): void {}

  // Shader operations
  createShader(type: number): {} { return {}; }
  shaderSource(shader: any, source: string): void {}
  compileShader(shader: any): void {}
  getShaderParameter(shader: any, pname: number): boolean { return true; }
  getShaderInfoLog(shader: any): string { return ''; }
  deleteShader(shader: any): void {}

  // Program operations
  createProgram(): {} { return {}; }
  attachShader(program: any, shader: any): void {}
  linkProgram(program: any): void {}
  getProgramParameter(program: any, pname: number): boolean { return true; }
  getProgramInfoLog(program: any): string { return ''; }
  useProgram(program: any): void {}
  deleteProgram(program: any): void {}

  // Attribute operations
  getAttribLocation(program: any, name: string): number { return 0; }
  enableVertexAttribArray(index: number): void {}
  disableVertexAttribArray(index: number): void {}
  vertexAttribPointer(index: number, size: number, type: number, normalized: boolean, stride: number, offset: number): void {}

  // Uniform operations
  getUniformLocation(program: any, name: string): {} { return {}; }
  uniform1f(location: any, x: number): void {}
  uniform2f(location: any, x: number, y: number): void {}
  uniform3f(location: any, x: number, y: number, z: number): void {}
  uniform4f(location: any, x: number, y: number, z: number, w: number): void {}
  uniformMatrix4fv(location: any, transpose: boolean, value: Float32Array | number[]): void {}

  // Texture operations
  createTexture(): {} { return {}; }
  bindTexture(target: number, texture: any): void {}
  texImage2D(...args: any[]): void {}
  texParameteri(target: number, pname: number, param: number): void {}
  deleteTexture(texture: any): void {}
  activeTexture(texture: number): void {}

  // Framebuffer operations
  createFramebuffer(): {} { return {}; }
  bindFramebuffer(target: number, framebuffer: any): void {}
  deleteFramebuffer(framebuffer: any): void {}

  // Renderbuffer operations
  createRenderbuffer(): {} { return {}; }
  bindRenderbuffer(target: number, renderbuffer: any): void {}
  deleteRenderbuffer(renderbuffer: any): void {}

  // Drawing operations
  clear(mask: number): void {}
  clearColor(r: number, g: number, b: number, a: number): void {}
  drawArrays(mode: number, first: number, count: number): void {}
  drawElements(mode: number, count: number, type: number, offset: number): void {}

  // State operations
  enable(cap: number): void {}
  disable(cap: number): void {}
  viewport(x: number, y: number, width: number, height: number): void {}
  scissor(x: number, y: number, width: number, height: number): void {}
  blendFunc(sfactor: number, dfactor: number): void {}
  depthFunc(func: number): void {}
  cullFace(mode: number): void {}

  // Error handling
  getError(): number { return 0; }

  // Extension support
  getExtension(name: string): any { return null; }
  getSupportedExtensions(): string[] { return []; }
}

/**
 * Mock 2D rendering context for testing.
 */
export class MockCanvasRenderingContext2D {
  canvas: MockHTMLCanvasElement;
  fillStyle: string | CanvasGradient | CanvasPattern = '#000000';
  strokeStyle: string | CanvasGradient | CanvasPattern = '#000000';
  lineWidth: number = 1;
  font: string = '10px sans-serif';

  constructor(canvas: MockHTMLCanvasElement) {
    this.canvas = canvas;
  }

  // Drawing methods (no-ops for testing)
  fillRect(x: number, y: number, w: number, h: number): void {}
  strokeRect(x: number, y: number, w: number, h: number): void {}
  clearRect(x: number, y: number, w: number, h: number): void {}
  fillText(text: string, x: number, y: number): void {}
  strokeText(text: string, x: number, y: number): void {}
  beginPath(): void {}
  closePath(): void {}
  moveTo(x: number, y: number): void {}
  lineTo(x: number, y: number): void {}
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void {}
  fill(): void {}
  stroke(): void {}
  save(): void {}
  restore(): void {}
  translate(x: number, y: number): void {}
  rotate(angle: number): void {}
  scale(x: number, y: number): void {}
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {}
  resetTransform(): void {}
  drawImage(...args: any[]): void {}
  createImageData(width: number, height: number): ImageData {
    return {
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4),
      colorSpace: 'srgb'
    } as ImageData;
  }
  getImageData(sx: number, sy: number, sw: number, sh: number): ImageData {
    return this.createImageData(sw, sh);
  }
  putImageData(imageData: ImageData, dx: number, dy: number): void {}
}

/**
 * Mock HTMLCanvasElement for headless testing.
 * Provides minimal canvas API needed for G3D engine initialization.
 */
export class MockHTMLCanvasElement {
  width: number;
  height: number;
  style: { width: string; height: string; [key: string]: string };

  private contexts: Map<string, any> = new Map();

  constructor(width: number = 800, height: number = 600) {
    this.width = width;
    this.height = height;
    this.style = {
      width: `${width}px`,
      height: `${height}px`
    };
  }

  /**
   * Gets a rendering context.
   * Supports 'webgl', 'webgl2', and '2d'.
   */
  getContext(contextId: string, options?: any): any {
    // Return cached context if exists
    if (this.contexts.has(contextId)) {
      return this.contexts.get(contextId);
    }

    let context: any = null;

    switch (contextId) {
      case 'webgl':
      case 'webgl2':
      case 'experimental-webgl':
        context = new MockWebGLRenderingContext(this);
        break;
      case '2d':
        context = new MockCanvasRenderingContext2D(this);
        break;
      default:
        return null;
    }

    this.contexts.set(contextId, context);
    return context;
  }

  /**
   * Mock getBoundingClientRect for event handling.
   */
  getBoundingClientRect(): DOMRect {
    return {
      x: 0,
      y: 0,
      width: this.width,
      height: this.height,
      top: 0,
      right: this.width,
      bottom: this.height,
      left: 0,
      toJSON: () => ({})
    } as DOMRect;
  }

  /**
   * Mock addEventListener for event handling.
   */
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void {
    // No-op for testing
  }

  /**
   * Mock removeEventListener for cleanup.
   */
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void {
    // No-op for testing
  }

  /**
   * Mock toDataURL for image export.
   */
  toDataURL(type?: string, quality?: any): string {
    return 'data:image/png;base64,';
  }

  /**
   * Mock toBlob for image export.
   */
  toBlob(callback: BlobCallback, type?: string, quality?: any): void {
    setTimeout(() => callback(new Blob()), 0);
  }
}

/**
 * Creates a mock canvas element for testing.
 *
 * @param width - Canvas width in pixels (default: 800)
 * @param height - Canvas height in pixels (default: 600)
 * @returns Mock canvas element
 *
 * @example
 * ```typescript
 * const canvas = createMockCanvas(1920, 1080);
 * const engine = Engine.create({ canvas: canvas as any });
 * ```
 */
export function createMockCanvas(width: number = 800, height: number = 600): HTMLCanvasElement {
  return new MockHTMLCanvasElement(width, height) as any as HTMLCanvasElement;
}

/**
 * Helper to assert a condition in tests.
 * Throws an error if the condition is false.
 *
 * @param condition - Condition to check
 * @param message - Error message if assertion fails
 *
 * @example
 * ```typescript
 * assert(value > 0, 'Value must be positive');
 * ```
 */
export function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}
