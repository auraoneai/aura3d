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
): WebGPURenderToTextureProof {
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

  const label = options.label ?? "webgpu-rtt-proof";
  const clearColor = options.clearColor ?? [0.02, 0.025, 0.035, 1];
  const triangleColor = options.triangleColor ?? [0.1, 0.8, 0.2, 1];
  const shouldDispose = options.disposeResources ?? true;
  const target = device.createRenderTarget({ width, height, label, format: "rgba8", depth: "texture" });
  const vertexBuffer = device.createBuffer("vertex", TRIANGLE_VERTICES.byteLength, TRIANGLE_VERTICES);
  const shader = device.createShaderProgram({
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
}`
  });

  device.setRenderTarget(target);
  device.beginFrame(width, height);
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
  const sampleX = Math.floor(width / 2);
  const sampleY = Math.floor(height / 2);
  const targetPixel = Array.from(device.readPixels(sampleX, sampleY, 1, 1));
  const targetPixels = device.readPixels(0, 0, width, height);
  device.endFrame();
  device.presentRenderTarget?.(target);
  const presentedPixel = Array.from(device.readPixels(sampleX, sampleY, 1, 1));
  const diagnosticsBeforeDispose = device.getDiagnostics();

  if (shouldDispose) {
    vertexBuffer.dispose();
    shader.dispose();
    target.dispose();
  }
  const diagnosticsAfterDispose = device.getDiagnostics();

  return {
    backend: "webgpu",
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
