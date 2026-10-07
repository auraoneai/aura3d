// PR 0b-2 carve-out (CONTRACTS.md §3.3) — verbatim move from WebGL2Device.ts; 0 changed logic lines.

import { RenderDeviceError, type RenderTarget } from "../RenderDevice";
import type { DeviceProbe } from "../contracts/device";
import { WebGL2RenderTarget } from "../WebGL2Device";
import type { WebGL2DeviceHost } from "./DeviceHost";

export class WebGL2ReadbackProbe {
  constructor(readonly host: WebGL2DeviceHost) {}

  depthReadbackProgram: WebGLProgram | null = null;

  writeRenderTargetPixels(target: RenderTarget, pixels: Uint8Array): void {
    this.host.lifecycle.assertAlive();
    if (!(target instanceof WebGL2RenderTarget) || !this.host.renderTargets.has(target) || target.disposed) {
      throw new RenderDeviceError("Render target is not a live WebGL2 resource owned by this device", "INVALID_RESOURCE", {
        targetId: target.id
      });
    }
    if (target.colorTexture.format !== "rgba8") {
      throw new RenderDeviceError("Byte pixel uploads are only supported for rgba8 WebGL2 render targets", "INVALID_PIXEL_UPLOAD_FORMAT", {
        targetId: target.id,
        format: target.colorTexture.format
      });
    }
    if (pixels.length !== target.width * target.height * 4) {
      throw new RenderDeviceError("Render-target pixel upload must contain width * height * 4 bytes", "INVALID_PIXEL_UPLOAD_SIZE", {
        targetId: target.id,
        byteLength: pixels.length,
        expectedByteLength: target.width * target.height * 4
      });
    }
    const textureUnit0 = this.host.lifecycle.captureTextureUnit0();
    try {
      this.host.gl.bindTexture(this.host.gl.TEXTURE_2D, target.colorHandle);
      this.host.gl.texSubImage2D(this.host.gl.TEXTURE_2D, 0, 0, 0, target.width, target.height, this.host.gl.RGBA, this.host.gl.UNSIGNED_BYTE, pixels);
      target.needsResolve = false;
    } finally {
      this.host.lifecycle.restoreTextureUnit0(textureUnit0);
    }
    this.host.lifecycle.lastError = this.host.lifecycle.readError();
    if (this.host.lifecycle.lastError) {
      throw new RenderDeviceError("WebGL2 render-target pixel upload failed", "WEBGL_PIXEL_UPLOAD_FAILED", {
        targetId: target.id,
        error: this.host.lifecycle.lastError
      });
    }
  }

  readPixels(x: number, y: number, width: number, height: number, attachment?: number): Uint8Array {
    this.host.lifecycle.assertAlive();
    if (![x, y, width, height].every(Number.isInteger) || x < 0 || y < 0 || width <= 0 || height <= 0) {
      throw new RenderDeviceError("Readback rectangle must be positive and in bounds", "INVALID_READBACK_RECT", { x, y, width, height });
    }
    const boundsWidth = this.host.activeRenderTarget?.width ?? this.host.gl.drawingBufferWidth;
    const boundsHeight = this.host.activeRenderTarget?.height ?? this.host.gl.drawingBufferHeight;
    if (x + width > boundsWidth || y + height > boundsHeight) {
      throw new RenderDeviceError("Readback rectangle exceeds framebuffer bounds", "READBACK_OUT_OF_BOUNDS", {
        x,
        y,
        width,
        height,
        boundsWidth,
        boundsHeight
      });
    }
    const readTarget = this.host.activeRenderTarget;
    if (attachment !== undefined && !readTarget) {
      throw new RenderDeviceError("Attachment readback requires an active render target", "READBACK_OUT_OF_BOUNDS", { attachment });
    }
    if (readTarget) {
      this.host.resolveMultisampleTarget(readTarget);
      this.host.gl.bindFramebuffer(this.host.gl.FRAMEBUFFER, readTarget.framebuffer);
      if (attachment !== undefined) {
        // MRT (lane 03 Q-01-2): select the draw buffer readPixels reads from.
        this.host.gl.readBuffer(this.host.gl.COLOR_ATTACHMENT0 + attachment);
      }
    }
    const pixels = new Uint8Array(width * height * 4);
    this.host.gl.readPixels(x, y, width, height, this.host.gl.RGBA, this.host.gl.UNSIGNED_BYTE, pixels);
    this.host.counters.readbacks += 1;
    if (attachment !== undefined && readTarget) {
      this.host.gl.readBuffer(this.host.gl.COLOR_ATTACHMENT0);
    }
    if (readTarget && readTarget.sampleCount > 1) {
      this.host.gl.bindFramebuffer(this.host.gl.FRAMEBUFFER, readTarget.drawFramebuffer);
      this.host.stateCache.invalidate();
    }
    return pixels;
  }

  readFloatPixels(x: number, y: number, width: number, height: number): Float32Array {
    this.host.lifecycle.assertAlive();
    if (![x, y, width, height].every(Number.isInteger) || x < 0 || y < 0 || width <= 0 || height <= 0) {
      throw new RenderDeviceError("Float readback rectangle must be positive and in bounds", "INVALID_READBACK_RECT", { x, y, width, height });
    }
    const boundsWidth = this.host.activeRenderTarget?.width ?? this.host.gl.drawingBufferWidth;
    const boundsHeight = this.host.activeRenderTarget?.height ?? this.host.gl.drawingBufferHeight;
    if (x + width > boundsWidth || y + height > boundsHeight) {
      throw new RenderDeviceError("Float readback rectangle exceeds framebuffer bounds", "READBACK_OUT_OF_BOUNDS", {
        x,
        y,
        width,
        height,
        boundsWidth,
        boundsHeight
      });
    }
    const readTarget = this.host.activeRenderTarget;
    if (readTarget) {
      this.host.resolveMultisampleTarget(readTarget);
      this.host.gl.bindFramebuffer(this.host.gl.FRAMEBUFFER, readTarget.framebuffer);
    }
    const pixels = new Float32Array(width * height * 4);
    this.host.gl.readPixels(x, y, width, height, this.host.gl.RGBA, this.host.gl.FLOAT, pixels);
    this.host.counters.readbacks += 1;
    if (readTarget && readTarget.sampleCount > 1) {
      this.host.gl.bindFramebuffer(this.host.gl.FRAMEBUFFER, readTarget.drawFramebuffer);
      this.host.stateCache.invalidate();
    }
    return pixels;
  }

  readDepthPixels(x: number, y: number, width: number, height: number): Float32Array {
    this.host.lifecycle.assertAlive();
    if (![x, y, width, height].every(Number.isInteger) || x < 0 || y < 0 || width <= 0 || height <= 0) {
      throw new RenderDeviceError("Depth readback rectangle must be positive and in bounds", "INVALID_READBACK_RECT", { x, y, width, height });
    }
    const target = this.host.activeRenderTarget;
    if (!target?.depthTextureHandle) {
      throw new RenderDeviceError("Depth readback requires an active WebGL2 render target with a sampleable depth texture.", "DEPTH_READBACK_UNAVAILABLE", {
        renderTarget: target?.label ?? null
      });
    }
    if (x + width > target.width || y + height > target.height) {
      throw new RenderDeviceError("Depth readback rectangle exceeds framebuffer bounds", "READBACK_OUT_OF_BOUNDS", {
        x,
        y,
        width,
        height,
        boundsWidth: target.width,
        boundsHeight: target.height
      });
    }
    this.host.resolveMultisampleTarget(target);
    const encoded = this.copyDepthTextureToBytes(target, x, y, width, height);
    const pixels = new Float32Array(width * height);
    for (let index = 0; index < pixels.length; index += 1) {
      const byteIndex = index * 4;
      const r = encoded[byteIndex] ?? 255;
      const g = encoded[byteIndex + 1] ?? 255;
      const b = encoded[byteIndex + 2] ?? 255;
      pixels[index] = Math.max(0, Math.min(1, r / 255 + g / 65025 + b / 16581375));
    }
    return pixels;
  }

  copyDepthTextureToBytes(source: WebGL2RenderTarget, x: number, y: number, width: number, height: number): Uint8Array {
    const colorHandle = this.host.gl.createTexture();
    const framebuffer = this.host.gl.createFramebuffer();
    if (!colorHandle || !framebuffer) {
      if (colorHandle) this.host.gl.deleteTexture(colorHandle);
      if (framebuffer) this.host.gl.deleteFramebuffer(framebuffer);
      throw new RenderDeviceError("Failed to allocate WebGL2 depth readback target", "WEBGL_ALLOCATION_FAILED", {
        renderTarget: source.label
      });
    }
    const previousFramebuffer = this.host.gl.getParameter(this.host.gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    const previousProgram = this.host.gl.getParameter(this.host.gl.CURRENT_PROGRAM) as WebGLProgram | null;
    const textureUnit0 = this.host.lifecycle.captureTextureUnit0();
    const viewport = this.host.gl.getParameter(this.host.gl.VIEWPORT) as Int32Array | readonly number[];
    const depthTestEnabled = this.host.gl.isEnabled(this.host.gl.DEPTH_TEST);
    const depthMask = this.host.gl.getParameter(this.host.gl.DEPTH_WRITEMASK) as boolean;
    const cullFaceEnabled = this.host.gl.isEnabled(this.host.gl.CULL_FACE);
    const blendEnabled = this.host.gl.isEnabled(this.host.gl.BLEND);
    const pixels = new Uint8Array(width * height * 4);
    try {
      this.host.gl.activeTexture(this.host.gl.TEXTURE0);
      this.host.gl.bindTexture(this.host.gl.TEXTURE_2D, colorHandle);
      this.host.gl.texParameteri(this.host.gl.TEXTURE_2D, this.host.gl.TEXTURE_MIN_FILTER, this.host.gl.NEAREST);
      this.host.gl.texParameteri(this.host.gl.TEXTURE_2D, this.host.gl.TEXTURE_MAG_FILTER, this.host.gl.NEAREST);
      this.host.gl.texParameteri(this.host.gl.TEXTURE_2D, this.host.gl.TEXTURE_WRAP_S, this.host.gl.CLAMP_TO_EDGE);
      this.host.gl.texParameteri(this.host.gl.TEXTURE_2D, this.host.gl.TEXTURE_WRAP_T, this.host.gl.CLAMP_TO_EDGE);
      this.host.gl.texImage2D(this.host.gl.TEXTURE_2D, 0, this.host.gl.RGBA8, width, height, 0, this.host.gl.RGBA, this.host.gl.UNSIGNED_BYTE, null);
      this.host.gl.bindFramebuffer(this.host.gl.FRAMEBUFFER, framebuffer);
      this.host.gl.framebufferTexture2D(this.host.gl.FRAMEBUFFER, this.host.gl.COLOR_ATTACHMENT0, this.host.gl.TEXTURE_2D, colorHandle, 0);
      const status = this.host.gl.checkFramebufferStatus(this.host.gl.FRAMEBUFFER);
      if (status !== this.host.gl.FRAMEBUFFER_COMPLETE) {
        throw new RenderDeviceError("WebGL2 depth readback framebuffer status is invalid", "FRAMEBUFFER_INVALID", {
          renderTarget: source.label,
          status
        });
      }
      this.host.gl.viewport(0, 0, width, height);
      this.host.gl.disable(this.host.gl.DEPTH_TEST);
      this.host.gl.disable(this.host.gl.CULL_FACE);
      this.host.gl.disable(this.host.gl.BLEND);
      this.host.gl.depthMask(false);
      this.host.gl.useProgram(this.ensureDepthReadbackProgram());
      this.host.gl.activeTexture(this.host.gl.TEXTURE0);
      this.host.gl.bindTexture(this.host.gl.TEXTURE_2D, source.depthTextureHandle);
      this.host.gl.bindSampler(0, null);
      this.host.gl.uniform1i(this.host.gl.getUniformLocation(this.ensureDepthReadbackProgram(), "u_depth"), 0);
      this.host.gl.uniform4f(this.host.gl.getUniformLocation(this.ensureDepthReadbackProgram(), "u_sourceRect"), x / source.width, y / source.height, width / source.width, height / source.height);
      this.host.gl.drawArrays(this.host.gl.TRIANGLES, 0, 3);
      this.host.gl.readPixels(0, 0, width, height, this.host.gl.RGBA, this.host.gl.UNSIGNED_BYTE, pixels);
      this.host.counters.readbacks += 1;
      const error = this.host.lifecycle.readError();
      if (error) {
        throw new RenderDeviceError("WebGL2 depth texture readback failed", "WEBGL_DEPTH_READBACK_FAILED", {
          renderTarget: source.label,
          error
        });
      }
      return pixels;
    } finally {
      this.host.lifecycle.restoreTextureUnit0(textureUnit0);
      this.host.gl.useProgram(previousProgram);
      if (depthTestEnabled) this.host.gl.enable(this.host.gl.DEPTH_TEST);
      else this.host.gl.disable(this.host.gl.DEPTH_TEST);
      if (cullFaceEnabled) this.host.gl.enable(this.host.gl.CULL_FACE);
      else this.host.gl.disable(this.host.gl.CULL_FACE);
      if (blendEnabled) this.host.gl.enable(this.host.gl.BLEND);
      else this.host.gl.disable(this.host.gl.BLEND);
      this.host.gl.depthMask(depthMask);
      this.host.gl.bindFramebuffer(this.host.gl.FRAMEBUFFER, previousFramebuffer);
      this.host.gl.viewport(viewport[0] ?? 0, viewport[1] ?? 0, viewport[2] ?? this.host.lifecycle.viewportWidth, viewport[3] ?? this.host.lifecycle.viewportHeight);
      this.host.gl.deleteTexture(colorHandle);
      this.host.gl.deleteFramebuffer(framebuffer);
      this.host.stateCache.invalidate();
    }
  }

  ensureDepthReadbackProgram(): WebGLProgram {
    if (this.depthReadbackProgram) {
      return this.depthReadbackProgram;
    }
    const vertex = this.host.device.compileShader(this.host.gl.VERTEX_SHADER, `#version 300 es
precision highp float;
out vec2 v_uv;
void main() {
  vec2 position = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = position;
  gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
}
`, "webgl2-depth-readback");
    const fragment = this.host.device.compileShader(this.host.gl.FRAGMENT_SHADER, `#version 300 es
precision highp float;
uniform sampler2D u_depth;
uniform vec4 u_sourceRect;
in vec2 v_uv;
out vec4 outColor;
vec3 packDepth24(float value) {
  value = clamp(value, 0.0, 1.0);
  vec3 encoded = fract(value * vec3(1.0, 255.0, 65025.0));
  encoded -= encoded.yzz * vec3(1.0 / 255.0, 1.0 / 255.0, 0.0);
  return encoded;
}
void main() {
  vec2 uv = u_sourceRect.xy + v_uv * u_sourceRect.zw;
  outColor = vec4(packDepth24(texture(u_depth, uv).r), 1.0);
}
`, "webgl2-depth-readback");
    const program = this.host.gl.createProgram();
    if (!program) {
      this.host.gl.deleteShader(vertex);
      this.host.gl.deleteShader(fragment);
      throw new RenderDeviceError("Failed to allocate WebGL2 depth readback shader", "WEBGL_ALLOCATION_FAILED");
    }
    this.host.gl.attachShader(program, vertex);
    this.host.gl.attachShader(program, fragment);
    this.host.gl.linkProgram(program);
    this.host.counters.programCompiles += 1;
    this.host.gl.deleteShader(vertex);
    this.host.gl.deleteShader(fragment);
    if (!this.host.gl.getProgramParameter(program, this.host.gl.LINK_STATUS)) {
      const log = this.host.gl.getProgramInfoLog(program) ?? "Unknown depth readback shader link error";
      this.host.gl.deleteProgram(program);
      throw new RenderDeviceError("WebGL2 depth readback shader link failed", "SHADER_LINK_FAILED", { log });
    }
    this.depthReadbackProgram = program;
    return program;
  }
}

/**
 * C-28 (CONTRACTS.md §3.4) — extension probe. Filled from
 * `WEBGL_debug_renderer_info` when available, else nulls. `multiDraw`,
 * `parallelShaderCompile` and `timerQuery` reflect their extension presence.
 */
export function createWebGL2DeviceProbe(gl: WebGL2RenderingContext): DeviceProbe {
  const debugInfo = gl.getExtension("WEBGL_debug_renderer_info") as
    | { readonly UNMASKED_RENDERER_WEBGL: GLenum; readonly UNMASKED_VENDOR_WEBGL: GLenum }
    | null;
  const multiDraw = gl.getExtension("WEBGL_multi_draw") != null;
  const parallelShaderCompile = gl.getExtension("KHR_parallel_shader_compile") != null;
  const timerQuery = gl.getExtension("EXT_disjoint_timer_query_webgl2") != null;
  const floatColorBuffer = gl.getExtension("EXT_color_buffer_float") != null;
  const halfFloatColorBuffer = gl.getExtension("EXT_color_buffer_half_float") != null;
  const nav = typeof navigator !== "undefined" ? navigator : null;
  const scr = typeof screen !== "undefined" ? screen : null;
  const ua = nav?.userAgent ?? "";
  const mobile = ua ? /Android|iPhone|iPad|iPod|Mobile/i.test(ua) : null;
  return {
    backend: "webgl2",
    rendererString: (gl.getParameter(gl.RENDERER) as string) ?? "",
    unmaskedRenderer: debugInfo ? (gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string) ?? null : null,
    unmaskedVendor: debugInfo ? (gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) as string) ?? null : null,
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
    maxSamples: gl.getParameter(gl.MAX_SAMPLES) as number,
    floatColorBuffer,
    halfFloatColorBuffer,
    timerQuery,
    parallelShaderCompile,
    multiDraw,
    devicePixelRatio: typeof globalThis !== "undefined" && "devicePixelRatio" in globalThis ? (globalThis.devicePixelRatio as number) : 1,
    screen: scr ? [scr.width, scr.height] : [0, 0],
    hardwareConcurrency: nav?.hardwareConcurrency ?? null,
    deviceMemoryGB: nav && "deviceMemory" in nav ? (nav as { deviceMemory?: number }).deviceMemory ?? null : null,
    mobile
  };
}
