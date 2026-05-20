import { Geometry, Renderer, toneMapFloatPixels, type HdrToneMappingResult, type RenderDeviceDiagnostics } from "@galileo3d/rendering";

type HdrRenderTargetCheckState = {
  readonly id: "hdr-render-target-check";
  readonly status: "ready" | "error";
  readonly renderer: "webgl2";
  readonly format: "rgba32f";
  readonly featureEvidence: {
    readonly hdrRenderTargets: boolean;
    readonly floatReadback: boolean;
    readonly browserFloatFramebuffer: boolean;
    readonly sampleOverOne: boolean;
    readonly hdrPostprocessToneMapping: boolean;
  };
  readonly metrics: {
    readonly width: number;
    readonly height: number;
    readonly drawCalls: number;
    readonly textureBytes: number;
    readonly sampleR: number;
    readonly sampleG: number;
    readonly sampleB: number;
    readonly sampleA: number;
    readonly hdrToneMappedR: number;
    readonly hdrToneMappedG: number;
    readonly hdrToneMappedB: number;
    readonly hdrToneMappedOverbrightPixels: number;
  };
  readonly postprocess?: HdrToneMappingResult;
  readonly diagnostics: RenderDeviceDiagnostics;
  readonly knownLimits: readonly string[];
  readonly error?: string;
};

declare global {
  interface Window {
    __GALILEO3D_HDR_RENDER_TARGET_CHECK__?: HdrRenderTargetCheckState;
  }
}

const knownLimits = [
  "This page proves a WebGL2 floating-point color render target and float readback path in Chromium.",
  "It does not claim production HDR image-based lighting or same-scene HDR parity with Three.js, Babylon.js, Unity, or Unreal.",
] as const;

if (typeof document !== "undefined") {
  void run().catch((error) => {
    window.__GALILEO3D_HDR_RENDER_TARGET_CHECK__ = {
      id: "hdr-render-target-check",
      status: "error",
      renderer: "webgl2",
      format: "rgba32f",
      featureEvidence: {
        hdrRenderTargets: false,
        floatReadback: false,
        browserFloatFramebuffer: false,
        sampleOverOne: false,
        hdrPostprocessToneMapping: false,
      },
      metrics: {
        width: 0,
        height: 0,
        drawCalls: 0,
        textureBytes: 0,
        sampleR: 0,
        sampleG: 0,
        sampleB: 0,
        sampleA: 0,
        hdrToneMappedR: 0,
        hdrToneMappedG: 0,
        hdrToneMappedB: 0,
        hdrToneMappedOverbrightPixels: 0,
      },
      diagnostics: { drawCalls: 0, buffers: 0, shaders: 0, lastError: null, contextLost: false },
      knownLimits,
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    };
    throw error;
  });
}

async function run(): Promise<void> {
  installStyles();
  document.body.innerHTML = `
    <main>
      <canvas data-testid="hdr-render-target-canvas" width="960" height="540"></canvas>
      <section>
        <h1>HDR Render Target Check</h1>
        <p>Visible WebGL2 pass plus offscreen RGBA32F readback and tone-mapping proof.</p>
        <div class="metrics" data-testid="hdr-render-target-summary"></div>
        <pre data-testid="hdr-render-target-state"></pre>
      </section>
    </main>
  `;
  const canvas = document.querySelector<HTMLCanvasElement>("[data-testid='hdr-render-target-canvas']");
  const stateNode = document.querySelector<HTMLElement>("[data-testid='hdr-render-target-state']");
  const summaryNode = document.querySelector<HTMLElement>("[data-testid='hdr-render-target-summary']");
  if (!canvas || !stateNode) throw new Error("HDR render target check shell failed to initialize.");

  const renderer = await Renderer.create({
    backend: "webgl2",
    canvas,
    width: canvas.width,
    height: canvas.height,
    preserveDrawingBuffer: true,
    antialias: false,
  });
  const featureReport = renderer.getFeatureReport();
  const deviceCapabilities = new Set(renderer.device.info.capabilities ?? []);
  const target = renderer.device.createRenderTarget({ width: 16, height: 16, label: "hdr-check-rgba32f", format: "rgba32f" });
  const geometry = Geometry.triangle();
  const shader = renderer.device.createShaderProgram({
    label: "hdr-check-overbright",
    marker: "@galileo3d-shader:hdr-check-overbright",
    vertex: `#version 300 es
// @galileo3d-shader:hdr-check-overbright
precision highp float;
in vec3 a_position;
void main() {
  gl_Position = vec4(a_position.xy * 2.0, 0.0, 1.0);
}`,
    fragment: `#version 300 es
// @galileo3d-shader:hdr-check-overbright
precision highp float;
out vec4 outColor;
void main() {
  outColor = vec4(2.5, 0.5, 0.125, 1.0);
}`,
  });

  renderer.device.setRenderTarget(target);
  renderer.device.beginFrame(target.width, target.height);
  renderer.device.clear([0, 0, 0, 1]);
  renderer.device.draw({
    topology: geometry.topology,
    vertexBuffer: geometry.vertexBuffer.upload(renderer.device),
    vertexFormat: geometry.vertexBuffer.format,
    vertexCount: geometry.vertexBuffer.vertexCount,
    indexBuffer: geometry.indexBuffer?.upload(renderer.device),
    indexType: geometry.indexBuffer?.type,
    indexCount: geometry.indexBuffer?.count,
    shader,
  });
  renderer.device.endFrame();

  const sample = renderer.device.readFloatPixels(8, 8, 1, 1);
  const postprocess = toneMapFloatPixels(sample, 1, 1, { exposure: 1, gamma: 1, operator: "reinhard", outputColorSpace: "linear" });

  renderer.device.setRenderTarget(null);
  renderer.device.beginFrame(canvas.width, canvas.height);
  renderer.device.clear([0.035, 0.044, 0.056, 1]);
  renderer.device.draw({
    topology: geometry.topology,
    vertexBuffer: geometry.vertexBuffer.upload(renderer.device),
    vertexFormat: geometry.vertexBuffer.format,
    vertexCount: geometry.vertexBuffer.vertexCount,
    indexBuffer: geometry.indexBuffer?.upload(renderer.device),
    indexType: geometry.indexBuffer?.type,
    indexCount: geometry.indexBuffer?.count,
    shader,
  });
  renderer.device.endFrame();

  const diagnostics = renderer.device.getDiagnostics();
  const state: HdrRenderTargetCheckState = {
    id: "hdr-render-target-check",
    status: "ready",
    renderer: "webgl2",
    format: "rgba32f",
    featureEvidence: {
      hdrRenderTargets: featureReport.supported.includes("hdr-render-targets"),
      floatReadback: deviceCapabilities.has("float-readback"),
      browserFloatFramebuffer: target.colorTexture.format === "rgba32f" && diagnostics.renderTargets === 1,
      sampleOverOne: (sample[0] ?? 0) > 1,
      hdrPostprocessToneMapping: postprocess.inputOverbrightPixels === 1 && postprocess.pixels[0] < 255 && postprocess.pixels[0] > 150,
    },
    metrics: {
      width: target.width,
      height: target.height,
      drawCalls: diagnostics.drawCalls,
      textureBytes: target.colorTexture.byteLength,
      sampleR: Number((sample[0] ?? 0).toFixed(4)),
      sampleG: Number((sample[1] ?? 0).toFixed(4)),
      sampleB: Number((sample[2] ?? 0).toFixed(4)),
      sampleA: Number((sample[3] ?? 0).toFixed(4)),
      hdrToneMappedR: postprocess.pixels[0] ?? 0,
      hdrToneMappedG: postprocess.pixels[1] ?? 0,
      hdrToneMappedB: postprocess.pixels[2] ?? 0,
      hdrToneMappedOverbrightPixels: postprocess.inputOverbrightPixels,
    },
    postprocess,
    diagnostics,
    knownLimits,
  };
  window.__GALILEO3D_HDR_RENDER_TARGET_CHECK__ = state;
  if (summaryNode) {
    summaryNode.innerHTML = `
      <span><b>${state.format.toUpperCase()}</b> target</span>
      <span><b>${state.metrics.sampleR.toFixed(2)}</b> HDR red sample</span>
      <span><b>${state.metrics.hdrToneMappedR}</b> tone-mapped byte</span>
      <span><b>${state.metrics.textureBytes.toLocaleString()}</b> texture bytes</span>
    `;
  }
  stateNode.textContent = JSON.stringify(state, null, 2);
}

function installStyles(): void {
  const style = document.createElement("style");
  style.textContent = `
    html, body { margin: 0; min-height: 100%; background: #090d12; color: #edf4f7; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    main { min-height: 100vh; display: grid; grid-template-columns: minmax(0, 1fr) 24rem; background: radial-gradient(circle at 42% 36%, #263342 0, #111821 54%, #090d12 100%); }
    canvas { width: 100%; height: 100vh; display: block; background: #090d12; }
    section { border-left: 1px solid #2b3946; background: rgba(15, 21, 28, 0.96); padding: 1.1rem; display: grid; align-content: start; gap: 0.85rem; }
    h1, p, pre { margin: 0; }
    h1 { font-size: 1.2rem; }
    p { color: #b8c7d1; line-height: 1.4; }
    .metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 0.65rem; }
    .metrics span { border: 1px solid #304456; background: #121c26; padding: 0.7rem; border-radius: 6px; color: #c9d7df; }
    .metrics b { display: block; color: #fff0a8; font-size: 1.25rem; }
    pre { display: none; }
    @media (max-width: 820px) { main { grid-template-columns: 1fr; } canvas { height: 62vh; } section { border-left: 0; border-top: 1px solid #2b3946; } }
  `;
  document.head.append(style);
}
