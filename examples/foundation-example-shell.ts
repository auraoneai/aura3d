import { Renderer, type RenderDeviceDiagnostics } from "@aura3d/rendering";
import type { A3DWorkflowResult } from "@aura3d/workflows";

export interface V3ExampleOptions {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly notes: readonly string[];
  readonly dynamic?: boolean;
  createWorkflow(): Promise<A3DWorkflowResult> | A3DWorkflowResult;
}

export interface V3ExampleState {
  readonly id: string;
  readonly status: "loading" | "ready" | "error";
  readonly workflowKind?: string;
  readonly featureChecklist: readonly string[];
  readonly drawCalls: number;
  readonly frameCount: number;
  readonly renderedItems: number;
  readonly lastError: string | null;
}

declare global {
  interface Window {
    __A3D_V3_EXAMPLE__?: V3ExampleState & {
      captureState?: () => V3ExampleState;
    };
  }
}

export async function mountV3Example(options: V3ExampleOptions): Promise<void> {
  installExampleStyles();
  const root = document.getElementById("app");
  if (!root) throw new Error(`Missing #app root for ${options.id}.`);

  const shell = document.createElement("main");
  shell.className = "example-shell";
  shell.innerHTML = `
    <section class="example-copy">
      <span>V3 Current Example</span>
      <h1>${options.title}</h1>
      <p>${options.summary}</p>
      <ol>${options.notes.map((note) => `<li>${note}</li>`).join("")}</ol>
    </section>
    <section class="example-stage">
      <div class="example-toolbar">
        <strong data-testid="${options.id}-status">loading</strong>
        <span>Public APIs only</span>
      </div>
      <canvas class="example-canvas" data-testid="${options.id}-canvas"></canvas>
      <div class="example-metrics" data-testid="${options.id}-metrics"></div>
    </section>
  `;
  root.replaceChildren(shell);

  const canvas = shell.querySelector("canvas");
  const metrics = shell.querySelector<HTMLElement>(".example-metrics");
  const status = shell.querySelector<HTMLElement>(`[data-testid="${options.id}-status"]`);
  if (!(canvas instanceof HTMLCanvasElement) || !metrics || !status) {
    throw new Error(`Example shell failed to mount for ${options.id}.`);
  }

  let state: V3ExampleState = {
    id: options.id,
    status: "loading",
    featureChecklist: [],
    drawCalls: 0,
    frameCount: 0,
    renderedItems: 0,
    lastError: null
  };
  const expose = () => {
    window.__A3D_V3_EXAMPLE__ = Object.assign({}, state, { captureState: () => state });
  };
  expose();

  try {
    const renderer = await Renderer.create({
      backend: "webgl2",
      canvas,
      width: 1180,
      height: 760,
      clearColor: [0.025, 0.028, 0.032, 1],
      preserveDrawingBuffer: true
    });
    const workflow = await options.createWorkflow();
    const renderOnce = (source = workflow.source): RenderDeviceDiagnostics => {
      renderer.resizeToDisplay({ devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2) });
      return renderer.render(source, workflow.camera);
    };
    const renderedItemCount = () => workflow.renderItems?.length ?? workflow.diagnostics.asset?.meshCount ?? 1;
    const commit = (diagnostics: RenderDeviceDiagnostics) => {
      state = {
        id: options.id,
        status: "ready",
        workflowKind: workflow.kind,
        featureChecklist: workflow.diagnostics.featureChecklist,
        drawCalls: diagnostics.drawCalls,
        frameCount: state.frameCount + 1,
        renderedItems: renderedItemCount(),
        lastError: diagnostics.lastError
      };
      status.textContent = "ready";
      metrics.replaceChildren(...[
        metric("Workflow", workflow.kind),
        metric("Draw calls", String(state.drawCalls)),
        metric("Frames", String(state.frameCount)),
        metric("Items", String(state.renderedItems))
      ], ...workflow.diagnostics.featureChecklist.map((feature) => chip(feature)));
      expose();
    };
    commit(renderOnce());
    if (options.dynamic && workflow.kind === "interactive-scene" && "update" in workflow) {
      renderer.startAnimationLoop((timeMs) => {
        commit(renderOnce(workflow.update(timeMs / 1000)));
      });
    }
  } catch (error) {
    state = {
      ...state,
      status: "error",
      lastError: error instanceof Error ? error.message : String(error)
    };
    status.textContent = "error";
    metrics.textContent = state.lastError;
    expose();
  }
}

function metric(label: string, value: string): HTMLElement {
  const element = document.createElement("div");
  element.className = "example-metric";
  element.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
  return element;
}

function chip(label: string): HTMLElement {
  const element = document.createElement("span");
  element.className = "example-chip";
  element.textContent = label;
  return element;
}

function installExampleStyles(): void {
  if (document.getElementById("v3-example-styles")) return;
  const style = document.createElement("style");
  style.id = "v3-example-styles";
  style.textContent = `
    html, body, #app {
      height: 100%;
      margin: 0;
    }

    body {
      overflow: hidden;
      background: #111413;
      color: #f5f2e9;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .example-shell {
      display: grid;
      grid-template-columns: minmax(300px, 380px) minmax(0, 1fr);
      height: 100%;
      background: #111413;
    }

    .example-copy {
      border-right: 1px solid #303934;
      background: #1d2421;
      overflow: auto;
      padding: 26px;
    }

    .example-copy span, .example-toolbar span, .example-metric span {
      color: #98a49c;
      display: block;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0;
      text-transform: uppercase;
    }

    .example-copy h1 {
      font-size: 30px;
      line-height: 1.08;
      margin: 9px 0 12px;
    }

    .example-copy p {
      color: #c7c9c0;
      font-size: 14px;
      line-height: 1.5;
      margin: 0 0 20px;
    }

    .example-copy ol {
      color: #dcd9cd;
      display: grid;
      gap: 10px;
      font-size: 13px;
      line-height: 1.42;
      margin: 0;
      padding-left: 18px;
    }

    .example-stage {
      display: grid;
      grid-template-rows: 60px minmax(0, 1fr) auto;
      min-height: 0;
      min-width: 0;
    }

    .example-toolbar {
      align-items: center;
      border-bottom: 1px solid #303934;
      display: flex;
      justify-content: space-between;
      padding: 0 18px;
    }

    .example-toolbar strong {
      font-size: 12px;
      text-transform: uppercase;
    }

    .example-canvas {
      display: block;
      height: 100%;
      min-height: 360px;
      width: 100%;
    }

    .example-metrics {
      align-items: stretch;
      border-top: 1px solid #303934;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      min-height: 76px;
      padding: 12px 18px;
    }

    .example-metric {
      background: #1d2421;
      border: 1px solid #38433e;
      border-radius: 7px;
      min-width: 110px;
      padding: 9px 10px;
    }

    .example-metric strong {
      display: block;
      font-size: 17px;
      margin-top: 5px;
      overflow-wrap: anywhere;
    }

    .example-chip {
      align-items: center;
      border: 1px solid #3f4944;
      border-radius: 999px;
      color: #d8dbd1;
      display: inline-flex;
      font-size: 12px;
      padding: 0 10px;
    }

    @media (max-width: 860px) {
      body {
        overflow: auto;
      }

      .example-shell {
        grid-template-columns: 1fr;
        grid-template-rows: auto minmax(520px, 70vh);
      }
    }
  `;
  document.head.append(style);
}
