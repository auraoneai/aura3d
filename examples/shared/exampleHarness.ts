import { Renderer, type RenderDeviceDiagnostics, type RenderItem, type RenderSource } from "@galileo3d/rendering";

export interface ExampleMetadata {
  id: string;
  title: string;
  purpose: string;
  acceptance: string;
}

export interface ExampleSetupContext {
  canvas: HTMLCanvasElement;
  setStatus(message: string): void;
}

export interface ExampleState {
  renderItems?: readonly RenderItem[];
  renderSource?: RenderSource;
  metrics?: Record<string, string | number | boolean> | (() => Record<string, string | number | boolean>);
  draw?(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, timeSeconds: number): void;
  dispose?(): void | Promise<void>;
}

export type ExampleSetup = (context: ExampleSetupContext) => ExampleState | Promise<ExampleState>;

export interface ExampleRuntimeState {
  id: string;
  status: "ready" | "error";
  renderer: "webgl2" | "canvas2d" | "mock";
  acceptance: string;
  visualClaim: string;
  knownLimits: readonly string[];
  errors: readonly string[];
  diagnostics?: RenderDeviceDiagnostics;
  metrics?: Record<string, string | number | boolean>;
  error?: string;
}

declare global {
  interface Window {
    __GALILEO3D_EXAMPLE__?: ExampleRuntimeState;
  }
}

export async function createExample(metadata: ExampleMetadata, setup: ExampleSetup): Promise<void> {
  const root = document.querySelector<HTMLElement>("#app") ?? document.body;
  root.replaceChildren();

  const shell = document.createElement("main");
  shell.className = "example-shell";

  const canvas = document.createElement("canvas");
  canvas.width = 960;
  canvas.height = 540;
  canvas.dataset.testid = "example-canvas";

  const panel = document.createElement("section");
  panel.className = "example-panel";
  panel.innerHTML = `<h1>${metadata.title}</h1><p>${metadata.purpose}</p><p><strong>Acceptance:</strong> ${metadata.acceptance}</p><pre data-testid="example-status">booting</pre>`;

  shell.append(canvas, panel);
  root.append(shell);

  const status = panel.querySelector<HTMLElement>("[data-testid='example-status']");
  const setStatus = (message: string) => {
    if (status) {
      status.textContent = message;
    }
  };

  try {
    const state = await setup({ canvas, setStatus });
    let diagnostics: RenderDeviceDiagnostics | undefined;
    let renderer: Renderer | undefined;

    if ((state.renderSource || (state.renderItems && state.renderItems.length > 0)) && !state.draw) {
      renderer = await Renderer.create({
        backend: "webgl2",
        canvas,
        width: canvas.width,
        height: canvas.height,
        clearColor: [0.02, 0.025, 0.03, 1],
        antialias: false,
        preserveDrawingBuffer: true,
      });
      diagnostics = renderer.render(state.renderSource ?? state.renderItems!);
    } else if (state.renderItems && state.renderItems.length > 0) {
      const mockRenderer = await Renderer.create({
        backend: "mock",
        width: canvas.width,
        height: canvas.height,
        clearColor: [0.02, 0.025, 0.03, 1],
      });
      diagnostics = mockRenderer.render(state.renderItems);
      mockRenderer.dispose();
    }

    const context = state.draw ? require2d(canvas) : undefined;
    const drawFrame = (timeMs: number) => {
      if (renderer) {
        diagnostics = renderer.render(state.renderSource ?? state.renderItems!);
      }
      if (context && state.draw) {
        context.clearRect(0, 0, canvas.width, canvas.height);
        drawBackdrop(context, canvas);
        state.draw(context, canvas, timeMs / 1000);
      }
      diagnostics ??= {
        drawCalls: state.draw ? 1 : 0,
        buffers: 0,
        shaders: 0,
        lastError: null,
        contextLost: false,
      };
      window.__GALILEO3D_EXAMPLE__ = {
        id: metadata.id,
        status: "ready",
        renderer: renderer ? "webgl2" : context ? "canvas2d" : "mock",
        acceptance: metadata.acceptance,
        visualClaim: metadata.purpose,
        knownLimits: ["This page is a bounded engine validation example, not a production app or broad competitor-parity claim."],
        errors: [],
        diagnostics,
        metrics: typeof state.metrics === "function" ? state.metrics() : state.metrics,
      };
      setStatus(formatStatus(window.__GALILEO3D_EXAMPLE__));
      requestAnimationFrame(drawFrame);
    };

    requestAnimationFrame(drawFrame);
    window.addEventListener("beforeunload", () => {
      renderer?.dispose();
      void state.dispose?.();
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    window.__GALILEO3D_EXAMPLE__ = {
      id: metadata.id,
      status: "error",
      renderer: "mock",
      acceptance: metadata.acceptance,
      visualClaim: metadata.purpose,
      knownLimits: ["This page failed before its bounded validation state could be rendered."],
      errors: [message],
      error: message,
    };
    setStatus(formatStatus(window.__GALILEO3D_EXAMPLE__));
    throw error;
  }
}

export function installExampleStyles(): void {
  if (document.querySelector("#galileo3d-example-styles")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "galileo3d-example-styles";
  style.textContent = `
    html, body, #app { margin: 0; min-height: 100%; background: #101418; color: #eef2f6; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    .example-shell { min-height: 100vh; display: grid; grid-template-rows: minmax(0, 1fr) auto; }
    canvas { width: 100%; height: min(72vh, 620px); display: block; background: #11171d; }
    .example-panel { display: grid; grid-template-columns: minmax(14rem, 1fr) minmax(20rem, 1.5fr) minmax(16rem, 1fr); gap: 1rem; align-items: start; padding: 1rem 1.25rem; border-top: 1px solid #2a343d; background: #151b21; }
    .example-panel h1 { margin: 0; font-size: 1rem; line-height: 1.3; }
    .example-panel p { margin: 0; color: #c6d0da; font-size: 0.875rem; line-height: 1.45; }
    .example-panel pre { margin: 0; overflow: auto; color: #b8e4b3; font-size: 0.8125rem; line-height: 1.4; }
    @media (max-width: 760px) { .example-panel { grid-template-columns: 1fr; } canvas { height: 62vh; } }
  `;
  document.head.append(style);
}

export function drawLabel(context: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  context.save();
  context.fillStyle = "#d8e1e8";
  context.font = "14px ui-sans-serif, system-ui, sans-serif";
  context.fillText(text, x, y);
  context.restore();
}

export function drawCube2D(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
  offset = 10,
): void {
  context.save();
  context.fillStyle = "#27323a";
  context.beginPath();
  context.moveTo(x + offset, y - offset);
  context.lineTo(x + size + offset, y - offset);
  context.lineTo(x + size, y);
  context.lineTo(x, y);
  context.closePath();
  context.fill();
  context.fillStyle = "#1d262d";
  context.beginPath();
  context.moveTo(x + size, y);
  context.lineTo(x + size + offset, y - offset);
  context.lineTo(x + size + offset, y + size - offset);
  context.lineTo(x + size, y + size);
  context.closePath();
  context.fill();
  context.fillStyle = color;
  context.fillRect(x, y, size, size);
  context.strokeStyle = "#0c1116";
  context.lineWidth = 2;
  context.strokeRect(x, y, size, size);
  context.restore();
}

export function drawGrid(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, spacing = 48): void {
  context.save();
  context.strokeStyle = "#26323a";
  context.lineWidth = 1;
  for (let x = 0; x <= canvas.width; x += spacing) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, canvas.height);
    context.stroke();
  }
  for (let y = 0; y <= canvas.height; y += spacing) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(canvas.width, y);
    context.stroke();
  }
  context.restore();
}

function drawBackdrop(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "#101820");
  gradient.addColorStop(1, "#1c242b");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
}

function require2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("2D canvas context is unavailable for example visualization.");
  }
  return context;
}

function formatStatus(state: ExampleRuntimeState): string {
  return JSON.stringify(state, null, 2);
}
