import { BloomPass, FXAAPass, MockRenderDevice, RenderGraph, ToneMappingPass, type RenderTarget } from "@galileo3d/rendering";

declare global {
  interface Window {
    __GALILEO3D_POSTPROCESS_LAB__?: PostprocessLabState;
  }
}

interface PostprocessLabState {
  readonly status: "ready" | "error";
  readonly graphOrder: readonly string[];
  readonly resources?: readonly string[];
  readonly canvasFrame?: { readonly width: number; readonly height: number };
  readonly pixels?: Record<string, readonly number[]>;
  readonly diagnostics?: { readonly drawCalls: number; readonly lastError: string | null };
  readonly error?: string;
}

if (typeof document !== "undefined") {
  void run().catch((error) => {
    window.__GALILEO3D_POSTPROCESS_LAB__ = {
      status: "error",
      graphOrder: ["tone-mapping", "bloom", "fxaa"],
      error: error instanceof Error ? error.stack ?? error.message : String(error)
    };
    throw error;
  });
}

async function run(): Promise<void> {
  installStyles();
  const { canvas, status } = createShell();
  const device = new MockRenderDevice();
  const hdr = device.createRenderTarget({ width: 96, height: 54, label: "hdr-color" }) as RenderTarget & { colorPixels: Uint8Array };
  const ldr = device.createRenderTarget({ width: 96, height: 54, label: "tone-mapped-color" }) as RenderTarget & { colorPixels: Uint8Array };
  const bloom = device.createRenderTarget({ width: 96, height: 54, label: "bloom-color" }) as RenderTarget & { colorPixels: Uint8Array };
  const fxaa = device.createRenderTarget({ width: 96, height: 54, label: "fxaa-color" }) as RenderTarget & { colorPixels: Uint8Array };

  fillHdrInput(hdr);

  const graph = new RenderGraph();
  const tonePass = new ToneMappingPass({
    source: hdr,
    target: ldr,
    exposure: 1.7,
    gamma: 1,
    operator: "reinhard",
    readResource: "hdr-color",
    writeResource: "tone-mapped-color"
  });
  const bloomPass = new BloomPass({
    source: ldr,
    target: bloom,
    threshold: 0.58,
    intensity: 1.2,
    radius: 2,
    readResource: "tone-mapped-color",
    writeResource: "bloom-color"
  });
  const fxaaPass = new FXAAPass({
    source: bloom,
    target: fxaa,
    edgeThreshold: 0.04,
    subpixelBlend: 0.85,
    readResource: "bloom-color",
    writeResource: "fxaa-color"
  });
  graph.addPass({
    name: "hdr-input",
    reads: [],
    writes: ["hdr-color"],
    execute(): void {}
  });
  graph.addPass(fxaaPass);
  graph.addPass(bloomPass);
  graph.addPass(tonePass);
  const plan = graph.compilePlan();

  device.beginFrame(96, 54);
  graph.execute({ device, width: 96, height: 54 });
  device.endFrame();

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Postprocess lab requires a 2D presentation context.");
  context.imageSmoothingEnabled = false;
  drawOutput(context, canvas, hdr, ldr, bloom, fxaa);

  const pixels = {
    toneMappedHighlight: readTargetPixel(ldr, 48, 24),
    bloomNeighbor: readTargetPixel(bloom, 45, 24),
    fxaaEdge: readTargetPixel(fxaa, 33, 27),
    presentation: Array.from(context.getImageData(760, 270, 1, 1).data)
  };

  window.__GALILEO3D_POSTPROCESS_LAB__ = {
    status: "ready",
    graphOrder: plan.passes.map((pass) => pass.name).filter((name) => name !== "hdr-input"),
    resources: plan.resources.map((resource) => `${resource.name}:${resource.writer}->${resource.readers.join(",") || "present"}`),
    canvasFrame: { width: canvas.width, height: canvas.height },
    pixels,
    diagnostics: device.getDiagnostics()
  };
  status.textContent = JSON.stringify(window.__GALILEO3D_POSTPROCESS_LAB__, null, 2);
}

function fillHdrInput(target: RenderTarget & { colorPixels: Uint8Array }): void {
  for (let y = 0; y < target.height; y += 1) {
    for (let x = 0; x < target.width; x += 1) {
      const index = (y * target.width + x) * 4;
      const checker = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0 ? 42 : 10;
      const stripe = x > 30 && x < 36 ? 255 : checker;
      const hot = Math.hypot(x - 48, y - 24) < 9 ? 255 : stripe;
      target.colorPixels[index] = hot;
      target.colorPixels[index + 1] = Math.max(checker, hot - 34);
      target.colorPixels[index + 2] = Math.max(checker, hot - 90);
      target.colorPixels[index + 3] = 255;
    }
  }
}

function drawOutput(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  hdr: RenderTarget & { colorPixels: Uint8Array },
  ldr: RenderTarget & { colorPixels: Uint8Array },
  bloom: RenderTarget & { colorPixels: Uint8Array },
  fxaa: RenderTarget & { colorPixels: Uint8Array }
): void {
  context.fillStyle = "#0e1317";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const targets = [
    { label: "HDR input", target: hdr, x: 48 },
    { label: "Tone mapped", target: ldr, x: 268 },
    { label: "Bloom", target: bloom, x: 488 },
    { label: "FXAA", target: fxaa, x: 708 }
  ] as const;
  for (const entry of targets) {
    const image = new ImageData(new Uint8ClampedArray(entry.target.colorPixels), entry.target.width, entry.target.height);
    const scratch = document.createElement("canvas");
    scratch.width = entry.target.width;
    scratch.height = entry.target.height;
    scratch.getContext("2d")!.putImageData(image, 0, 0);
    context.drawImage(scratch, entry.x, 138, 192, 108);
    context.fillStyle = "#d7e3ea";
    context.font = "14px ui-sans-serif, system-ui, sans-serif";
    context.fillText(entry.label, entry.x, 124);
  }
}

function readTargetPixel(target: RenderTarget & { colorPixels: Uint8Array }, x: number, y: number): readonly number[] {
  const index = (y * target.width + x) * 4;
  return Array.from(target.colorPixels.slice(index, index + 4));
}

function createShell(): { readonly canvas: HTMLCanvasElement; readonly status: HTMLElement } {
  const root = document.querySelector<HTMLElement>("#app") ?? document.body;
  root.replaceChildren();
  const shell = document.createElement("main");
  shell.innerHTML = `
    <canvas data-testid="postprocess-lab-canvas" width="960" height="540"></canvas>
    <section>
      <h1>Postprocess Lab</h1>
      <p>RenderGraph order: tone mapping reads HDR color, bloom reads tone-mapped color, and FXAA reads the bloom output. This lab is deterministic LDR readback; HDR render targets, depth-aware effects, TAA, DOF, SSR, and SSAO are not claimed.</p>
      <pre data-testid="postprocess-lab-status">booting</pre>
    </section>
  `;
  root.append(shell);
  return { canvas: shell.querySelector("canvas")!, status: shell.querySelector("pre")! };
}

function installStyles(): void {
  const style = document.createElement("style");
  style.textContent = `
    html, body, #app { margin: 0; min-height: 100%; background: #0e1317; color: #edf3f6; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    main { min-height: 100vh; display: grid; grid-template-rows: minmax(0, 1fr) auto; }
    canvas { width: 100%; height: min(72vh, 620px); display: block; background: #0e1317; }
    section { border-top: 1px solid #2a343b; background: #151b20; padding: 1rem 1.25rem; display: grid; grid-template-columns: 14rem 1fr minmax(18rem, 30rem); gap: 1rem; align-items: start; }
    h1, p, pre { margin: 0; }
    h1 { font-size: 1rem; }
    p { color: #c8d3d9; line-height: 1.45; font-size: 0.875rem; }
    pre { color: #b6e6b1; font-size: 0.78rem; line-height: 1.35; overflow: auto; }
    @media (max-width: 760px) { section { grid-template-columns: 1fr; } canvas { height: 62vh; } }
  `;
  document.head.append(style);
}
