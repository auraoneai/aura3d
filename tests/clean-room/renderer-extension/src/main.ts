/**
 * WS-3.10 clean-room proof — extend the renderer with a custom GPU pass.
 *
 * This file behaves like an installed consumer: every Aura3D import comes from
 * the published, typed `@aura3d/rendering` entry point. It does not import a
 * source file, copy the renderer, create a second context, or reach through a
 * renderer-private property. The public `Renderer.device` is the deliberate
 * low-level seam.
 */
import { Geometry, Renderer, ShaderModule, UnlitMaterial } from "@aura3d/rendering";

export interface RendererExtensionState {
  readonly deviceKind: string;
  readonly rendererDrawCalls: number;
  readonly customPassCompiled: boolean;
  readonly customPassApplied: boolean;
  readonly baselineLitPixels: number;
  readonly tintedPixels: number;
  readonly callerResourcesDisposed: boolean;
  readonly rendererDisposed: boolean;
  readonly usedPublicExportsOnly: true;
}

const TINT_PASS = new ShaderModule({
  label: "clean-room-tint-pass",
  marker: "clean-room/tint",
  vertex: `#version 300 es
// @aura3d-shader:clean-room/tint
precision highp float;
in vec3 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position.xy + 0.5;
  gl_Position = vec4(a_position.xy * 2.0, 0.0, 1.0);
}`,
  fragment: `#version 300 es
// @aura3d-shader:clean-room/tint
precision highp float;
in vec2 v_uv;
uniform vec3 u_tint;
out vec4 outColor;
void main() {
  outColor = vec4(u_tint * (0.55 + 0.45 * v_uv.y), 1.0);
}`
});

export async function runRendererExtension(canvas: HTMLCanvasElement): Promise<RendererExtensionState> {
  const renderer = await Renderer.create({
    backend: "webgl2",
    canvas,
    width: canvas.width,
    height: canvas.height,
    clearColor: [0.01, 0.015, 0.025, 1]
  });
  const geometry = Geometry.litTriangle();
  const material = new UnlitMaterial({ name: "clean-room-subject", color: [0.08, 0.4, 1, 1] });
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;

  const rendererDiagnostics = renderer.renderItems([{
    geometry,
    material,
    label: "renderer-owned-baseline",
    modelMatrix: identity,
    modelViewProjectionMatrix: identity
  }]);

  const countPixels = (predicate: (red: number, green: number, blue: number) => boolean): number => {
    const pixels = renderer.device.readPixels(0, 0, canvas.width, canvas.height);
    let count = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (predicate(pixels[index]!, pixels[index + 1]!, pixels[index + 2]!)) count += 1;
    }
    return count;
  };
  const baselineLitPixels = countPixels((red, green, blue) => red > 20 || green > 20 || blue > 20);

  // The extension uses the renderer's documented device. The renderer remains
  // the sole owner of that device and its canvas/context.
  const program = TINT_PASS.compile(renderer.device);
  renderer.device.beginFrame(canvas.width, canvas.height);
  renderer.device.draw({
    label: "external-tint-pass",
    topology: geometry.topology,
    vertexBuffer: geometry.vertexBuffer.upload(renderer.device),
    vertexFormat: geometry.vertexBuffer.format,
    vertexCount: geometry.vertexBuffer.vertexCount,
    indexBuffer: geometry.indexBuffer?.upload(renderer.device),
    indexType: geometry.indexBuffer?.type,
    indexCount: geometry.indexBuffer?.count,
    shader: program,
    uniforms: new Map([["u_tint", [1, 0.2, 0.05] as const]])
  });
  renderer.device.endFrame();
  const tintedPixels = countPixels((red, green, blue) => red > 80 && red > green * 1.5 && red > blue * 1.5);
  const customPassCompiled = !program.disposed;

  // Caller-owned objects are released first. Renderer.dispose() then releases
  // the renderer-owned device and all backend allocations still attached to it.
  material.dispose();
  geometry.dispose();
  TINT_PASS.dispose();
  const callerResourcesDisposed = material.disposed
    && program.disposed
    && geometry.vertexBuffer.uploadedBuffer?.disposed === true
    && geometry.indexBuffer?.uploadedBuffer?.disposed === true;
  renderer.dispose();

  return {
    deviceKind: renderer.device.kind,
    rendererDrawCalls: rendererDiagnostics.drawCalls,
    customPassCompiled,
    customPassApplied: baselineLitPixels > 0 && tintedPixels > 0,
    baselineLitPixels,
    tintedPixels,
    callerResourcesDisposed,
    rendererDisposed: renderer.device.disposed,
    usedPublicExportsOnly: true
  };
}
