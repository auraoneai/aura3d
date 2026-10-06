/**
 * PRD-01 §15 Phase-2 render-target conformance (?tools=render-targets).
 * Runs the PR 0a `RenderTargetDescriptor` fields (CONTRACTS §3.4) against a
 * real WebGL2Device and reports results on `window.__QR_RT__`.
 */

import { TextureBinding, WebGL2Device, VertexFormat, VertexAttribute, type RenderDevice, type Texture } from "../../../../packages/rendering/src";

export interface RenderTargetToolReport {
  readonly cubeDepthFaces: number;
  readonly cubeDepthWritable: boolean;
  readonly mrtAttachment0: readonly number[];
  readonly mrtAttachment1: readonly number[];
  readonly arrayLayer3: readonly number[];
  readonly errors: readonly string[];
}

declare global {
  interface Window {
    __QR_RT__?: RenderTargetToolReport;
  }
}

const MARKER = "@aura3d-qr:render-targets";

function fullscreenVertexSource(extra: string): string {
  return `#version 300 es
// ${MARKER}
in vec2 a_position;
uniform float u_z;
${extra}
void main() {
  gl_Position = vec4(a_position, u_z, 1.0);
}`;
}

function createFullscreenDraw(device: RenderDevice, fragment: string, vertexExtra = ""): { shader: ReturnType<RenderDevice["createShaderProgram"]>; draw: () => void } {
  const vertexBuffer = device.createBuffer("vertex", 24, new Float32Array([-1, -1, 3, -1, -1, 3]));
  const vertexFormat = new VertexFormat([new VertexAttribute({ semantic: "position", components: 2, offset: 0, shaderName: "a_position" })]);
  const shader = device.createShaderProgram({
    label: "qr-render-targets",
    marker: MARKER,
    vertex: fullscreenVertexSource(vertexExtra),
    fragment: `#version 300 es
// ${MARKER}
precision mediump float;
${fragment}`
  });
  return {
    shader,
    draw: () => {
      device.draw({
        topology: "triangles",
        vertexBuffer,
        vertexFormat,
        vertexCount: 3,
        renderState: { depthTest: false, depthWrite: true, cullMode: "none", blend: false, depthCompare: "always" },
        shader
      });
    }
  };
}

export async function runRenderTargetTools(stage: HTMLElement): Promise<RenderTargetToolReport> {
  const errors: string[] = [];
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  stage.appendChild(canvas);
  const device = WebGL2Device.create({ canvas, preserveDrawingBuffer: true, errorCheckMode: "strict" });
  device.beginFrame(64, 64);

  let cubeDepthFaces = 0;
  let cubeDepthWritable = false;
  try {
    const cube = device.createRenderTarget({ width: 16, height: 16, label: "qr-depth-cube", dimension: "cube", depthOnly: true, depthCompare: false });
    cubeDepthFaces = cube.layerTargets?.length ?? 0;
    const depthWrite = createFullscreenDraw(device, `out vec4 outColor; void main() { outColor = vec4(0.0); }`, "");
    for (const face of cube.layerTargets ?? []) {
      device.setRenderTarget(face);
      device.clearRenderTarget([0, 0, 0, 0]);
      depthWrite.draw();
    }
    cubeDepthWritable = true;
    device.setRenderTarget(null);
  } catch (error) {
    errors.push(`cube: ${error instanceof Error ? error.message : String(error)}`);
  }

  const mrtColors: number[][] = [];
  try {
    const mrt = device.createRenderTarget({
      width: 8,
      height: 8,
      label: "qr-mrt-2",
      colorAttachments: [{ format: "rgba8" }, { format: "rgba8" }]
    });
    device.setRenderTarget(mrt);
    device.clearRenderTarget([1, 0, 0, 1], 0);
    device.clearRenderTarget([0, 1, 0, 1], 1);
    mrtColors.push(Array.from(device.readPixels(0, 0, 1, 1, 0)));
    mrtColors.push(Array.from(device.readPixels(0, 0, 1, 1, 1)));
    device.setRenderTarget(null);
  } catch (error) {
    errors.push(`mrt: ${error instanceof Error ? error.message : String(error)}`);
  }

  let arrayLayer3: number[] = [];
  try {
    const array = device.createRenderTarget({ width: 8, height: 8, label: "qr-array-4", dimension: "2d-array", layers: 4 });
    const layerColors: [number, number, number, number][] = [
      [1, 0, 0, 1],
      [0, 1, 0, 1],
      [0, 0, 1, 1],
      [1, 1, 0, 1]
    ];
    (array.layerTargets ?? []).forEach((layer, index) => {
      device.setRenderTarget(layer);
      device.clearRenderTarget(layerColors[index]!);
    });

    // Sample layer 3 of the array through a sampler2DArray program and present it.
    const sample = createFullscreenDraw(
      device,
      `uniform sampler2DArray u_layers;
out vec4 outColor;
void main() {
  outColor = texture(u_layers, vec3(gl_FragCoord.xy / 8.0, 3.0));
}`
    );
    const present = device.createRenderTarget({ width: 8, height: 8, label: "qr-present" });
    device.setRenderTarget(present);
    const sampler = new TextureBinding({ name: "u_layers", texture: array.colorTexture as Texture });
    device.draw({
      topology: "triangles",
      vertexBuffer: device.createBuffer("vertex", 24, new Float32Array([-1, -1, 3, -1, -1, 3])),
      vertexFormat: new VertexFormat([new VertexAttribute({ semantic: "position", components: 2, offset: 0, shaderName: "a_position" })]),
      vertexCount: 3,
      renderState: { depthTest: false, depthWrite: false, cullMode: "none", blend: false, depthCompare: "always" },
      shader: sample.shader,
      uniforms: new Map([["u_layers", sampler]])
    });
    arrayLayer3 = Array.from(device.readPixels(4, 4, 1, 1));
    device.setRenderTarget(null);
    void sampler;
  } catch (error) {
    errors.push(`array: ${error instanceof Error ? error.message : String(error)}`);
  }

  device.endFrame();
  const report: RenderTargetToolReport = {
    cubeDepthFaces,
    cubeDepthWritable,
    mrtAttachment0: mrtColors[0] ?? [],
    mrtAttachment1: mrtColors[1] ?? [],
    arrayLayer3,
    errors
  };
  window.__QR_RT__ = report;
  return report;
}
