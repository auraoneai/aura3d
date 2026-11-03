import { RenderDeviceError, type RenderTarget } from "../RenderDevice";
import {
  GAUSSIAN_SPLAT_TRANSFER_GLSL,
  type GaussianSplatAlphaAssociation,
  type GaussianSplatColorAdapter,
  type GaussianSplatColorScratch,
  type GaussianSplatTransfer
} from "../GaussianSplatColorComposite";
import type { WebGL2RenderTarget, WebGL2ShaderProgram } from "../WebGL2Device";
import type { WebGL2DeviceHost } from "./DeviceHost";

const VERTEX = `#version 300 es
// a3d.gaussian-splat-color-transfer
precision highp float;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
// a3d.gaussian-splat-color-transfer
precision highp float;
uniform sampler2D u_source;
uniform bool u_encode;
uniform bool u_premultiplied;
out vec4 outColor;
${GAUSSIAN_SPLAT_TRANSFER_GLSL}
void main() {
  outColor = a3dSplatTransfer(texelFetch(u_source, ivec2(gl_FragCoord.xy), 0), u_encode, u_premultiplied);
}`;

type Rect = readonly [number, number, number, number];

function readRect(value: unknown, label: string): Rect {
  if (!value || typeof value !== "object" || !("length" in value) || (value as ArrayLike<number>).length < 4) {
    throw new RenderDeviceError(`Cannot read the active ${label}`, "GAUSSIAN_SPLAT_VIEW_STATE_UNAVAILABLE");
  }
  const v = value as ArrayLike<number>;
  const rect: Rect = [v[0]!, v[1]!, v[2]!, v[3]!];
  if (!rect.every(Number.isFinite) || rect[2] < 0 || rect[3] < 0) {
    throw new RenderDeviceError(`Invalid active ${label}`, "GAUSSIAN_SPLAT_VIEW_STATE_UNAVAILABLE");
  }
  return rect;
}

function intersect(a: Rect, b: Rect): Rect {
  const x = Math.max(a[0], b[0]);
  const y = Math.max(a[1], b[1]);
  const right = Math.min(a[0] + a[2], b[0] + b[2]);
  const top = Math.min(a[1] + a[3], b[1] + b[3]);
  return [x, y, Math.max(0, right - x), Math.max(0, top - y)];
}

class WebGL2SplatScratch implements GaussianSplatColorScratch {
  private retired = false;
  constructor(
    readonly scene: WebGL2RenderTarget,
    readonly target: WebGL2RenderTarget,
    readonly byteLength: number,
    private readonly forget: (scratch: WebGL2SplatScratch) => void,
    private readonly assertCanDispose: () => void
  ) {}
  get disposed(): boolean { return this.retired || this.target.disposed; }
  dispose(): void {
    if (this.retired) return;
    this.assertCanDispose();
    this.retired = true;
    this.target.dispose();
    this.forget(this);
  }
}

/**
 * Ordered encoded-space runs use a float color attachment and borrow the
 * scene's *actual* depth attachment only during the draw. No depth copy or
 * resolve can reproduce the original per-sample depth test. WebGL2 exposes
 * multisample renderbuffers rather than sampleable per-sample color, so those
 * targets fail rather than silently compositing against resolved color.
 */
export class WebGL2GaussianSplatColorAdapter implements GaussianSplatColorAdapter {
  private readonly generation: number;
  private readonly scratches = new Set<WebGL2SplatScratch>();
  private readonly removeLostListener: () => void;
  private program: WebGL2ShaderProgram | null = null;
  private vertexArray: WebGLVertexArrayObject | null = null;
  private retired = false;
  private drawing = false;

  constructor(
    private readonly host: WebGL2DeviceHost,
    private readonly guardDraw: (target: WebGL2RenderTarget, scissor: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | null, draw: () => void) => void,
    private readonly onDispose: () => void
  ) {
    this.generation = host.device.generation;
    this.removeLostListener = host.lifecycle.onDeviceLost(() => this.dispose());
  }

  createScratch(input: RenderTarget): GaussianSplatColorScratch {
    const scene = this.requireScene(input);
    const gl = this.host.gl;
    if (!gl.getExtension("EXT_color_buffer_float") || !gl.getExtension("EXT_float_blend")) {
      throw new RenderDeviceError("Gaussian splat color compositing requires renderable and blendable RGBA32F", "GAUSSIAN_SPLAT_FLOAT_BLEND_UNSUPPORTED");
    }
    const byteLength = scene.width * scene.height * 16;
    if (!Number.isSafeInteger(byteLength)) throw new RenderDeviceError("Gaussian splat scratch size is invalid", "GAUSSIAN_SPLAT_SCRATCH_SIZE_INVALID");
    const read = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    const draw = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    let target: WebGL2RenderTarget | undefined;
    try {
      target = this.host.device.createRenderTarget({
        width: scene.width, height: scene.height, format: "rgba32f", depth: false, sampleCount: 1,
        label: "gaussian-splat-color-scratch"
      }) as WebGL2RenderTarget;
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      this.attachDepth(scene);
      try {
        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (status !== gl.FRAMEBUFFER_COMPLETE) {
          throw new RenderDeviceError("Gaussian splat color and borrowed depth attachments are incompatible", "GAUSSIAN_SPLAT_FRAMEBUFFER_UNSUPPORTED", { status });
        }
      } finally {
        this.detachDepth(scene);
      }
      const scratch = new WebGL2SplatScratch(scene, target, byteLength, (resource) => this.scratches.delete(resource), () => {
        if (this.drawing) throw new RenderDeviceError("Cannot dispose a Gaussian splat surface during its draw", "GAUSSIAN_SPLAT_BORROWED_TARGET_IN_USE");
      });
      this.scratches.add(scratch);
      return scratch;
    } catch (error) {
      target?.dispose();
      throw error;
    } finally {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, read);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, draw);
      this.host.stateCache.invalidate();
    }
  }

  transfer(input: RenderTarget, surface: GaussianSplatColorScratch, toScratch: boolean, direction: GaussianSplatTransfer, association: GaussianSplatAlphaAssociation): void {
    const { scene, scratch } = this.requirePair(input, surface);
    if (direction !== "linear-to-srgb" && direction !== "srgb-to-linear") throw new RenderDeviceError("Invalid Gaussian splat transfer direction", "GAUSSIAN_SPLAT_TRANSFER_INVALID");
    if (association !== "premultiplied" && association !== "independent") throw new RenderDeviceError("Invalid Gaussian splat alpha association", "GAUSSIAN_SPLAT_ALPHA_INVALID");
    const gl = this.host.gl;
    const viewport = readRect(gl.getParameter(gl.VIEWPORT), "viewport");
    const scissor = readRect(gl.getParameter(gl.SCISSOR_BOX), "scissor");
    const scissorEnabled = gl.isEnabled(gl.SCISSOR_TEST);
    let region = intersect([0, 0, scene.width, scene.height], viewport);
    // Per-draw material state can leave a stale GL scissor behind. Splats use
    // the device-level view scissor, which is what the normal draw binder uses.
    const viewScissor = this.host.lifecycle.effectiveScissor();
    if (viewScissor) region = intersect(region, [viewScissor.x, viewScissor.y, viewScissor.width, viewScissor.height]);
    if (region[2] === 0 || region[3] === 0) return;

    const program = this.ensureProgram();
    const vao = this.ensureVertexArray();
    const read = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    const draw = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    const previousProgram = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null;
    const previousVao = gl.getParameter(gl.VERTEX_ARRAY_BINDING) as WebGLVertexArrayObject | null;
    const colorMask = gl.getParameter(gl.COLOR_WRITEMASK) as readonly boolean[];
    const depthMask = gl.getParameter(gl.DEPTH_WRITEMASK) as boolean;
    const caps = [gl.DEPTH_TEST, gl.BLEND, gl.CULL_FACE, gl.STENCIL_TEST, gl.POLYGON_OFFSET_FILL, gl.DITHER, gl.RASTERIZER_DISCARD, gl.SAMPLE_ALPHA_TO_COVERAGE, gl.SAMPLE_COVERAGE];
    const enabled = caps.map((cap) => gl.isEnabled(cap));
    const unit = this.host.lifecycle.captureTextureUnit0();
    try {
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, toScratch ? scratch.target.framebuffer : scene.framebuffer);
      gl.viewport(0, 0, scene.width, scene.height);
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(...region);
      for (const cap of caps) gl.disable(cap);
      gl.colorMask(true, true, true, true);
      gl.depthMask(false);
      gl.useProgram(program.handle);
      gl.bindVertexArray(vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindSampler(0, null);
      gl.bindTexture(gl.TEXTURE_2D, toScratch ? scene.colorHandle : scratch.target.colorHandle);
      gl.uniform1i(gl.getUniformLocation(program.handle, "u_source"), 0);
      gl.uniform1i(gl.getUniformLocation(program.handle, "u_encode"), direction === "linear-to-srgb" ? 1 : 0);
      gl.uniform1i(gl.getUniformLocation(program.handle, "u_premultiplied"), association === "premultiplied" ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.host.counters.drawCalls += 1;
    } finally {
      this.host.lifecycle.restoreTextureUnit0(unit);
      gl.useProgram(previousProgram);
      gl.bindVertexArray(previousVao);
      for (let i = 0; i < caps.length; i++) {
        if (enabled[i]) gl.enable(caps[i]!); else gl.disable(caps[i]!);
      }
      if (scissorEnabled) gl.enable(gl.SCISSOR_TEST); else gl.disable(gl.SCISSOR_TEST);
      gl.scissor(...scissor);
      gl.colorMask(colorMask[0]!, colorMask[1]!, colorMask[2]!, colorMask[3]!);
      gl.depthMask(depthMask);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, read);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, draw);
      gl.viewport(...viewport);
      this.host.stateCache.invalidate();
    }
  }

  drawToScratch(input: RenderTarget, surface: GaussianSplatColorScratch, draw: () => void): void {
    const { scene, scratch } = this.requirePair(input, surface);
    const gl = this.host.gl;
    const viewport = readRect(gl.getParameter(gl.VIEWPORT), "viewport");
    const scissor = readRect(gl.getParameter(gl.SCISSOR_BOX), "scissor");
    const scissorEnabled = gl.isEnabled(gl.SCISSOR_TEST);
    const viewScissor = this.host.lifecycle.effectiveScissor();
    const previousRead = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    const previousDraw = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    let attached = false;
    this.drawing = true;
    try {
      gl.bindFramebuffer(gl.FRAMEBUFFER, scratch.target.framebuffer);
      this.attachDepth(scene);
      attached = true;
      const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      if (status !== gl.FRAMEBUFFER_COMPLETE) {
        throw new RenderDeviceError("Gaussian splat color and borrowed depth attachments are incompatible", "GAUSSIAN_SPLAT_FRAMEBUFFER_UNSUPPORTED", { status });
      }
      this.host.activeRenderTarget = scratch.target;
      gl.viewport(...viewport);
      gl.scissor(...scissor);
      if (scissorEnabled) gl.enable(gl.SCISSOR_TEST); else gl.disable(gl.SCISSOR_TEST);
      this.host.stateCache.invalidate();
      this.guardDraw(scene, viewScissor, draw);
    } finally {
      if (attached) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, scratch.target.framebuffer);
        this.detachDepth(scene);
      }
      this.host.activeRenderTarget = scene;
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, previousRead);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, previousDraw);
      gl.viewport(...viewport);
      gl.scissor(...scissor);
      if (scissorEnabled) gl.enable(gl.SCISSOR_TEST); else gl.disable(gl.SCISSOR_TEST);
      this.host.stateCache.invalidate();
      this.drawing = false;
    }
  }

  dispose(): void {
    if (this.retired) return;
    if (this.drawing) throw new RenderDeviceError("Cannot dispose a Gaussian splat surface during its draw", "GAUSSIAN_SPLAT_BORROWED_TARGET_IN_USE");
    this.retired = true;
    this.removeLostListener();
    for (const scratch of [...this.scratches]) scratch.dispose();
    this.program?.dispose();
    if (this.vertexArray) this.host.gl.deleteVertexArray(this.vertexArray);
    this.program = null;
    this.vertexArray = null;
    this.onDispose();
    this.host.stateCache.invalidate();
  }

  private requireScene(input: RenderTarget): WebGL2RenderTarget {
    this.host.lifecycle.assertFrame();
    if (this.retired || this.generation !== this.host.device.generation) {
      throw new RenderDeviceError("Gaussian splat adapter belongs to a retired device generation", "GAUSSIAN_SPLAT_ADAPTER_DISPOSED");
    }
    const scene = input as WebGL2RenderTarget;
    if (!scene || !this.host.renderTargets.has(scene) || scene.disposed || this.host.activeRenderTarget !== scene) {
      throw new RenderDeviceError("Gaussian splat compositing requires the active, live WebGL2 render target", "GAUSSIAN_SPLAT_TARGET_UNSUPPORTED");
    }
    if (scene.sampleCount !== 1) throw new RenderDeviceError("WebGL2 Gaussian splat compositing cannot preserve multisample color", "GAUSSIAN_SPLAT_MULTISAMPLE_UNSUPPORTED");
    if (scene.dimension !== "2d" || scene.depthOnly || scene.attachmentLayer !== undefined || scene.attachmentMipLevel !== undefined || (scene.colorTextures?.length ?? 1) !== 1) {
      throw new RenderDeviceError("Gaussian splat compositing requires a single 2D color attachment", "GAUSSIAN_SPLAT_TARGET_UNSUPPORTED");
    }
    if (scene.colorTexture.format !== "rgba16f" && scene.colorTexture.format !== "rgba32f") {
      throw new RenderDeviceError("Gaussian splat compositing requires a floating-point scene target", "GAUSSIAN_SPLAT_HDR_TARGET_REQUIRED");
    }
    if (!scene.depthHandle && !scene.depthTextureHandle) throw new RenderDeviceError("Gaussian splat compositing requires the scene depth attachment", "GAUSSIAN_SPLAT_DEPTH_REQUIRED");
    if (this.host.gl.getParameter(this.host.gl.DRAW_FRAMEBUFFER_BINDING) !== scene.drawFramebuffer) {
      throw new RenderDeviceError("Gaussian splat scene framebuffer is not bound", "GAUSSIAN_SPLAT_TARGET_UNSUPPORTED");
    }
    return scene;
  }

  private requirePair(input: RenderTarget, surface: GaussianSplatColorScratch): { scene: WebGL2RenderTarget; scratch: WebGL2SplatScratch } {
    const scene = this.requireScene(input);
    if (!(surface instanceof WebGL2SplatScratch) || !this.scratches.has(surface) || surface.disposed || surface.scene !== scene) {
      throw new RenderDeviceError("Gaussian splat scratch is not live for this scene target", "GAUSSIAN_SPLAT_SCRATCH_INVALID");
    }
    return { scene, scratch: surface };
  }

  private attachDepth(scene: WebGL2RenderTarget): void {
    const gl = this.host.gl;
    if (scene.depthTextureHandle) gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, scene.depthTextureHandle, 0);
    else gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, scene.depthHandle);
  }

  private detachDepth(scene: WebGL2RenderTarget): void {
    const gl = this.host.gl;
    if (scene.depthTextureHandle) gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, null, 0);
    else gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, null);
  }

  private ensureProgram(): WebGL2ShaderProgram {
    if (!this.program) {
      this.program = this.host.device.createShaderProgram({ label: "gaussian-splat-color-transfer", marker: "a3d.gaussian-splat-color-transfer", vertex: VERTEX, fragment: FRAGMENT }) as WebGL2ShaderProgram;
    }
    return this.program;
  }

  private ensureVertexArray(): WebGLVertexArrayObject {
    if (!this.vertexArray) {
      this.vertexArray = this.host.gl.createVertexArray();
      if (!this.vertexArray) throw new RenderDeviceError("Failed to allocate Gaussian splat transfer vertex array", "WEBGL_ALLOCATION_FAILED");
    }
    return this.vertexArray;
  }
}
