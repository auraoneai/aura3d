import {
  type RenderDevice,
  RenderDeviceError,
  type RenderDeviceDiagnostics,
  type RenderTarget
} from "./RenderDevice";
import { VertexFormat } from "./VertexFormat";

export interface WebGPURenderToTextureProofOptions {
  readonly width?: number;
  readonly height?: number;
  readonly label?: string;
  readonly clearColor?: readonly [number, number, number, number];
  readonly triangleColor?: readonly [number, number, number, number];
  readonly disposeResources?: boolean;
}

export interface WebGPURenderToTextureProof {
  readonly backend: "webgpu";
  /** This measures an offscreen copy through the native presentation pass, not canvas pixels. */
  readonly presentation: "offscreen-copy";
  readonly width: number;
  readonly height: number;
  readonly label: string;
  readonly renderTargetFormat: "rgba8";
  readonly hasDepthTexture: boolean;
  readonly drawCalls: number;
  readonly targetPixel: readonly number[];
  readonly presentedPixel: readonly number[];
  readonly readbackMatchesPresentation: boolean;
  readonly targetPixels: Uint8Array;
  readonly diagnosticsBeforeDispose: RenderDeviceDiagnostics;
  readonly diagnosticsAfterDispose: RenderDeviceDiagnostics;
  readonly disposedRenderTargets: number;
  readonly disposedTextures: number;
}

const SHADER_MARKER = "@aura3d-shader:webgpu-rtt-proof";

export function runWebGPURenderToTextureProof(
  device: RenderDevice,
  options: WebGPURenderToTextureProofOptions = {}
): Promise<WebGPURenderToTextureProof> {
  if (device.kind !== "webgpu") {
    throw new RenderDeviceError("WebGPU render-to-texture proof requires a WebGPU render device.", "WEBGPU_DEVICE_REQUIRED", {
      backend: device.kind
    });
  }

  const width = options.width ?? 64;
  const height = options.height ?? 64;
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new RenderDeviceError("WebGPU render-to-texture dimensions must be positive integers.", "INVALID_RENDER_TARGET_SIZE", {
      width,
      height
    });
  }

  if (!device.readPixelsAsync) {
    throw new RenderDeviceError("WebGPU render-to-texture proof requires asynchronous texture readback.", "NATIVE_READBACK_UNSUPPORTED");
  }
  if (!device.presentLdrPostprocess) {
    throw new RenderDeviceError("WebGPU render-to-texture proof requires the native presentation-copy pass.", "NATIVE_PRESENTATION_UNSUPPORTED");
  }
  if (!device.getRenderTarget) {
    throw new RenderDeviceError("WebGPU render-to-texture proof requires render-target state inspection.", "NATIVE_TARGET_STATE_UNSUPPORTED");
  }
  const previousTarget = device.getRenderTarget();
  const readPixels = device.readPixelsAsync.bind(device);
  const presentCopy = device.presentLdrPostprocess.bind(device);
  return runProof(device, options, width, height, previousTarget, readPixels, presentCopy);
}

async function runProof(
  device: RenderDevice,
  options: WebGPURenderToTextureProofOptions,
  width: number,
  height: number,
  previousTarget: RenderTarget | null,
  readPixels: NonNullable<RenderDevice["readPixelsAsync"]>,
  presentCopy: NonNullable<RenderDevice["presentLdrPostprocess"]>
): Promise<WebGPURenderToTextureProof> {
  const label = options.label ?? "webgpu-rtt-proof";
  const clearColor = options.clearColor ?? [0.02, 0.025, 0.035, 1];
  const triangleColor = options.triangleColor ?? [0.1, 0.8, 0.2, 1];
  const shouldDispose = options.disposeResources ?? true;
  let target: RenderTarget | undefined;
  let output: RenderTarget | undefined;
  let vertexBuffer: ReturnType<RenderDevice["createBuffer"]> | undefined;
  let shader: ReturnType<RenderDevice["createShaderProgram"]> | undefined;
  let frameStarted = false;
  let succeeded = false;
  try {
    target = device.createRenderTarget({ width, height, label, format: "rgba8", depth: "texture" });
    output = device.createRenderTarget({ width, height, label: `${label}-presentation-copy`, format: "rgba8", depth: false });
    vertexBuffer = device.createBuffer("vertex", TRIANGLE_VERTICES.byteLength, TRIANGLE_VERTICES);
    shader = device.createShaderProgram({
      label: `${label}-shader`,
      marker: SHADER_MARKER,
      vertex: `// ${SHADER_MARKER}
in vec3 position;
void main() {
  gl_Position = vec4(position, 1.0);
}`,
      fragment: `// ${SHADER_MARKER}
uniform vec4 u_color;
out vec4 outColor;
void main() {
  outColor = u_color;
}`,
      portableBindings: [{ name: "u_color", kind: "vec4", required: true }],
      webgpu: {
        vertex: `/* @aura3d-bindings */
@vertex fn vs_main(@location(0) position: vec3<f32>) -> @builtin(position) vec4<f32> {
  return vec4<f32>(position, 1.0);
}`,
        fragment: `/* @aura3d-bindings */
@fragment fn fs_main() -> @location(0) vec4<f32> {
  return aura.u_color;
}`
      }
    });

    device.setRenderTarget(target);
    device.beginFrame(width, height);
    frameStarted = true;
    device.clear(clearColor);
    device.draw({
      label: `${label}-triangle`,
      topology: "triangles",
      vertexBuffer,
      vertexFormat: VertexFormat.P3,
      vertexCount: 3,
      shader,
      uniforms: new Map([["u_color", triangleColor]])
    });
    device.endFrame();
    frameStarted = false;
    const sampleX = Math.floor(width / 2);
    const sampleY = Math.floor(height / 2);
    const sampled = await readPixels(sampleX, sampleY, 1, 1);
    if (sampled.byteLength !== 4) throw new RenderDeviceError("WebGPU target sample has an unexpected byte length.", "NATIVE_READBACK_INCOMPLETE");
    const targetPixel = Array.from(sampled);
    const targetPixels = await readPixels(0, 0, width, height);
    if (targetPixels.byteLength !== width * height * 4) {
      throw new RenderDeviceError("WebGPU target readback has an unexpected byte length.", "NATIVE_READBACK_INCOMPLETE");
    }
    // An output target exercises the same native fullscreen copy used by the
    // presentation chain while remaining readable through the device API.
    // It does not establish that a canvas or display received those pixels.
    presentCopy(target, { passes: [], outputTarget: output });
    device.setRenderTarget(output);
    const copied = await readPixels(sampleX, sampleY, 1, 1);
    if (copied.byteLength !== 4) throw new RenderDeviceError("WebGPU presentation-copy readback has an unexpected byte length.", "NATIVE_READBACK_INCOMPLETE");
    const presentedPixel = Array.from(copied);
    const diagnosticsBeforeDispose = device.getDiagnostics();
    device.setRenderTarget(previousTarget);
    if (shouldDispose) {
      vertexBuffer.dispose();
      shader.dispose();
      target.dispose();
      output.dispose();
    }
    const diagnosticsAfterDispose = device.getDiagnostics();
    succeeded = true;
    return {
      backend: "webgpu",
      presentation: "offscreen-copy",
      width,
      height,
      label,
      renderTargetFormat: "rgba8",
      hasDepthTexture: target.depthTexture !== undefined,
      drawCalls: diagnosticsBeforeDispose.drawCalls,
      targetPixel,
      presentedPixel,
      readbackMatchesPresentation: samePixel(targetPixel, presentedPixel),
      targetPixels,
      diagnosticsBeforeDispose,
      diagnosticsAfterDispose,
      disposedRenderTargets: diagnosticsAfterDispose.disposedRenderTargets ?? 0,
      disposedTextures: diagnosticsAfterDispose.disposedTextures ?? 0
    };
  } finally {
    if (frameStarted) { try { device.endFrame(); } catch { /* Preserve the proof failure. */ } }
    if (!succeeded) {
      try { device.setRenderTarget(previousTarget); } catch { /* Preserve the proof failure. */ }
      // A failed proof cannot transfer ownership, even when the caller asked
      // to keep resources after a successful run.
      try { vertexBuffer?.dispose(); } catch { /* Preserve the proof failure. */ }
      try { shader?.dispose(); } catch { /* Preserve the proof failure. */ }
      try { target?.dispose(); } catch { /* Preserve the proof failure. */ }
      try { output?.dispose(); } catch { /* Preserve the proof failure. */ }
    }
  }
}

export function isWebGPURenderTarget(target: RenderTarget): boolean {
  return target.colorTexture.format === "rgba8" && target.width > 0 && target.height > 0;
}

const TRIANGLE_VERTICES = new Float32Array([
  -0.82, -0.82, 0,
  0.82, -0.82, 0,
  0, 0.82, 0
]);

function samePixel(left: readonly number[], right: readonly number[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}
