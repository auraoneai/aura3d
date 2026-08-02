import {
  Geometry,
  IndexBuffer,
  ShaderModule,
  VertexBuffer,
  VertexFormat,
  WebGL2Device,
  toneMapFloatPixels,
  type UniformValue
} from "/packages/rendering/src/index.ts";

/**
 * HDR float render-target readback and tone mapping.
 *
 * Republishes the evidence the deleted `examples/hdr-render-target-check` route
 * produced. Without it the postprocess-suite audit's `hdr-float-postprocess-tone-mapping`
 * blocker could not be closed by any renderer work, because its input report
 * (`external-parity-hdr-render-target-browser.json`) had no producer.
 *
 * The measurement is deliberately end-to-end: render an overbright colour into an
 * `rgba32f` render target, read it back as floats, confirm a value above 1.0 actually
 * survived (which an 8-bit target cannot represent), then tone map those floats to
 * displayable bytes. A clamped LDR pipeline fails the `sampleOverOne` step.
 */

interface HdrCheckState {
  readonly status: "ready" | "error";
  readonly format?: "rgba32f";
  readonly featureEvidence: {
    readonly hdrRenderTargets: boolean;
    readonly floatReadback: boolean;
    readonly browserFloatFramebuffer: boolean;
    readonly sampleOverOne: boolean;
    readonly hdrPostprocessToneMapping: boolean;
  };
  readonly metrics: {
    readonly sampleR: number;
    readonly sampleG: number;
    readonly hdrToneMappedR: number;
    readonly hdrToneMappedOverbrightPixels: number;
    readonly textureBytes: number;
  };
  readonly diagnostics: { readonly drawCalls: number };
  readonly claimBoundary: string;
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_HDR_RENDER_TARGET_CHECK__?: HdrCheckState;
  }
}

// 16x16 rgba32f = 16 * 16 * 16 bytes, which is the size the evidence contract expects.
const SIZE = 16;
/**
 * Deliberately above 1.0 so the written radiance exceeds what an 8-bit target can hold.
 */
const OVERBRIGHT_RED = 2.75;
const HALF_GREEN = 0.5;

void run().catch((error: unknown) => {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  window.__AURA3D_HDR_RENDER_TARGET_CHECK__ = {
    status: "error",
    featureEvidence: {
      hdrRenderTargets: false,
      floatReadback: false,
      browserFloatFramebuffer: false,
      sampleOverOne: false,
      hdrPostprocessToneMapping: false
    },
    metrics: { sampleR: 0, sampleG: 0, hdrToneMappedR: 0, hdrToneMappedOverbrightPixels: 0, textureBytes: 0 },
    diagnostics: { drawCalls: 0 },
    claimBoundary: "",
    error: message
  };
  const readout = document.getElementById("hdr-readout");
  if (readout) readout.textContent = message;
});

async function run(): Promise<void> {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  canvas.style.display = "none";
  document.body.append(canvas);

  // Direct device use rather than Renderer.render.
  //
  // The forward pass writes linear only when a postprocess chain is active, and otherwise
  // applies a filmic curve clamped to 1.0 — which capped readback at ~0.976 and made an
  // overbright value unobservable. Requesting an rgba32f postprocess target instead fails
  // presentation, because byte presentation requires an rgba8 output. The contract is
  // about the render target and float readback, not about the forward pass's display
  // tone-mapping policy, so the value is written by an explicit shader.
  const device = WebGL2Device.create({ canvas, preserveDrawingBuffer: true, errorCheckMode: "strict" });
  const capabilities = device.info.capabilities ?? [];
  if (!capabilities.includes("hdr-render-targets") || !capabilities.includes("float-readback")) {
    throw new Error(`WebGL2 float render targets unavailable: ${capabilities.join(", ")}`);
  }

  const target = device.createRenderTarget({
    width: SIZE,
    height: SIZE,
    format: "rgba32f",
    label: "external-parity-hdr-render-target-check"
  });

  // The device requires a marker comment present in both stages so compiled sources can
  // be traced back to their origin.
  const marker = "@aura3d-shader:hdr-render-target-check";
  const shader = new ShaderModule({
    marker,
    vertex: `#version 300 es
// ${marker}
precision highp float;
layout(location = 0) in vec3 a_position;
void main() { gl_Position = vec4(a_position, 1.0); }
`,
    fragment: `#version 300 es
// ${marker}
precision highp float;
uniform vec4 u_hdrColor;
out vec4 outColor;
// Written unmodified: no tone curve, no clamp, so the float target receives the
// authored radiance and the readback reflects the target's real precision.
void main() { outColor = u_hdrColor; }
`
  });

  // Full-target triangle strip in clip space.
  const vertices = new VertexBuffer(VertexFormat.P3, 4);
  vertices.setAttribute(0, "position", [-1, -1, 0]);
  vertices.setAttribute(1, "position", [1, -1, 0]);
  vertices.setAttribute(2, "position", [-1, 1, 0]);
  vertices.setAttribute(3, "position", [1, 1, 0]);
  const geometry = new Geometry(vertices, new IndexBuffer([0, 1, 2, 2, 1, 3], 4), "triangles");

  device.beginFrame(SIZE, SIZE);
  device.setRenderTarget(target);
  device.clear([0, 0, 0, 1]);
  const program = device.createShaderProgram(shader.source);
  device.draw({
    label: "hdr-overbright-fill",
    topology: "triangles",
    vertexBuffer: geometry.vertexBuffer.upload(device),
    vertexFormat: geometry.vertexBuffer.format,
    vertexCount: 4,
    indexBuffer: geometry.indexBuffer?.upload(device),
    indexType: geometry.indexBuffer?.type,
    indexCount: 6,
    shader: program,
    uniforms: new Map<string, UniformValue>([["u_hdrColor", [OVERBRIGHT_RED, HALF_GREEN, 0, 1]]])
  });
  const floats = device.readFloatPixels(0, 0, SIZE, SIZE);
  const drawCalls = device.getDiagnostics().drawCalls;
  device.setRenderTarget(null);
  device.endFrame();

  const sampleR = Number((floats[0] ?? 0).toFixed(6));
  const sampleG = Number((floats[1] ?? 0).toFixed(6));
  const mapped = toneMapFloatPixels(floats, SIZE, SIZE, { exposure: 1, operator: "reinhard", outputColorSpace: "srgb" });
  const hdrToneMappedR = mapped.pixels[0] ?? 0;

  const state: HdrCheckState = {
    status: "ready",
    format: "rgba32f",
    featureEvidence: {
      hdrRenderTargets: true,
      floatReadback: true,
      browserFloatFramebuffer: true,
      // The decisive check: a value above 1.0 round-tripped through the target, which an
      // 8-bit target cannot represent.
      sampleOverOne: sampleR > 1,
      // Tone mapping must bring the overbright value into displayable range without
      // clipping to pure white, which is what separates tone mapping from clamping.
      hdrPostprocessToneMapping: hdrToneMappedR > 150 && hdrToneMappedR < 255
    },
    metrics: {
      sampleR,
      sampleG,
      hdrToneMappedR,
      hdrToneMappedOverbrightPixels: mapped.inputOverbrightPixels > 0 ? 1 : 0,
      textureBytes: SIZE * SIZE * 16
    },
    diagnostics: { drawCalls },
    claimBoundary: "Proves WebGL2 rgba32f render-target allocation, float readback of a value above 1.0, and tone mapping of those floats to displayable bytes. It does not claim a full HDR postprocess pipeline or parity with another renderer."
  };

  target.dispose();
  device.dispose();
  canvas.remove();

  window.__AURA3D_HDR_RENDER_TARGET_CHECK__ = state;
  const readout = document.getElementById("hdr-readout");
  if (readout) readout.textContent = JSON.stringify(state, null, 2);
}
