import { Renderer, type RenderDeviceDiagnostics } from "@galileo3d/rendering";
import type { G3DWorkflowDiagnostics, G3DWorkflowResult } from "@galileo3d/workflows";

export interface WorkflowScenario {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly badge: string;
}

export interface WorkflowWorkbenchConfig {
  readonly appId: string;
  readonly title: string;
  readonly subtitle: string;
  readonly suiteLabel: string;
  readonly accent: string;
  readonly scenarios: readonly WorkflowScenario[];
  readonly defaultScenarioId: string;
  readonly dynamic?: boolean;
  createWorkflow(scenario: WorkflowScenario): Promise<G3DWorkflowResult> | G3DWorkflowResult;
}

export interface WorkflowWorkbenchState {
  readonly appId: string;
  readonly status: "booting" | "loading" | "ready" | "error";
  readonly selectedScenarioId: string;
  readonly workflowKind?: string;
  readonly featureChecklist: readonly string[];
  readonly diagnostics?: G3DWorkflowDiagnostics;
  readonly renderDiagnostics?: RenderDeviceDiagnostics;
  readonly lastError: string | null;
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly renderedItems: number;
}

declare global {
  interface Window {
    __G3D_V3_APP__?: WorkflowWorkbenchState & {
      loadScenario?: (id: string) => Promise<void>;
      captureState?: () => WorkflowWorkbenchState;
    };
  }
}

export class WorkflowWorkbenchApp {
  private readonly shell = document.createElement("main");
  private readonly sidebar = document.createElement("aside");
  private readonly viewport = document.createElement("section");
  private readonly inspector = document.createElement("section");
  private readonly canvas = document.createElement("canvas");
  private readonly statusLine = document.createElement("div");
  private readonly scenarioList = document.createElement("div");
  private readonly metricGrid = document.createElement("div");
  private readonly checklist = document.createElement("div");
  private readonly sceneList = document.createElement("div");
  private readonly diagnosticsPanel = document.createElement("pre");
  private renderer?: Renderer;
  private workflow?: G3DWorkflowResult;
  private animation?: { stop(): void };
  private resizeObserver?: ResizeObserver;
  private frameCount = 0;
  private selectedScenarioId: string;
  private status: WorkflowWorkbenchState["status"] = "booting";
  private lastError: string | null = null;
  private latestRenderDiagnostics?: RenderDeviceDiagnostics;

  constructor(private readonly root: HTMLElement, private readonly config: WorkflowWorkbenchConfig) {
    this.selectedScenarioId = config.defaultScenarioId;
  }

  async start(): Promise<void> {
    installWorkflowWorkbenchStyles();
    this.shell.className = "g3d-workbench";
    this.sidebar.className = "g3d-sidebar";
    this.viewport.className = "g3d-viewport";
    this.inspector.className = "g3d-inspector";
    this.canvas.className = "g3d-canvas";
    this.canvas.dataset.testid = `${this.config.appId}-canvas`;
    this.canvas.style.setProperty("--accent", this.config.accent);

    this.root.replaceChildren(this.shell);
    this.shell.append(this.sidebar, this.viewport, this.inspector);
    this.renderStaticShell();

    this.renderer = await Renderer.create({
      backend: "webgl2",
      canvas: this.canvas,
      width: 1280,
      height: 820,
      clearColor: [0.025, 0.028, 0.032, 1],
      preserveDrawingBuffer: true
    });
    this.resizeObserver = new ResizeObserver(() => this.renderFrame());
    this.resizeObserver.observe(this.viewport);
    exposeAppState(this.snapshot(), { loadScenario: (id) => this.loadScenario(id), captureState: () => this.snapshot() });
    await this.loadScenario(this.selectedScenarioId);
  }

  async loadScenario(id: string): Promise<void> {
    const scenario = this.config.scenarios.find((candidate) => candidate.id === id);
    if (!scenario) {
      throw new Error(`Unknown ${this.config.appId} scenario: ${id}`);
    }
    this.status = "loading";
    this.lastError = null;
    this.selectedScenarioId = id;
    this.animation?.stop();
    this.workflow?.dispose();
    this.workflow = undefined;
    this.renderControls();
    this.renderPanels();
    try {
      this.workflow = await this.config.createWorkflow(scenario);
      this.status = "ready";
      this.frameCount = 0;
      this.renderControls();
      this.renderFrame();
      if (this.config.dynamic && this.workflow.kind === "interactive-scene" && "update" in this.workflow && this.renderer) {
        const interactive = this.workflow;
        this.animation = this.renderer.startAnimationLoop((timeMs) => {
          if (!this.renderer) return;
          const source = interactive.update(timeMs / 1000);
          this.renderer.resizeToDisplay({ devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2) });
          this.latestRenderDiagnostics = this.renderer.render(source);
          this.frameCount += 1;
          if (this.frameCount % 12 === 0) {
            this.renderPanels();
            exposeAppState(this.snapshot(), { loadScenario: (nextId) => this.loadScenario(nextId), captureState: () => this.snapshot() });
          }
        });
      }
    } catch (error) {
      this.status = "error";
      this.lastError = error instanceof Error ? error.message : String(error);
      this.renderControls();
      this.renderPanels();
    }
    exposeAppState(this.snapshot(), { loadScenario: (nextId) => this.loadScenario(nextId), captureState: () => this.snapshot() });
  }

  dispose(): void {
    this.animation?.stop();
    this.resizeObserver?.disconnect();
    this.workflow?.dispose();
    this.renderer?.dispose();
    this.canvas.remove();
  }

  private renderStaticShell(): void {
    this.sidebar.replaceChildren();
    const header = document.createElement("header");
    header.className = "g3d-brand";
    header.innerHTML = `
      <span>${this.config.suiteLabel}</span>
      <h1>${this.config.title}</h1>
      <p>${this.config.subtitle}</p>
    `;
    this.statusLine.className = "g3d-statusline";
    this.scenarioList.className = "g3d-scenarios";
    this.metricGrid.className = "g3d-metrics";
    this.sidebar.append(header, this.statusLine, this.scenarioList, this.metricGrid);

    this.viewport.replaceChildren();
    const viewportHeader = document.createElement("div");
    viewportHeader.className = "g3d-viewport-header";
    viewportHeader.innerHTML = `
      <div>
        <span>Live Renderer</span>
        <strong>${this.config.title}</strong>
      </div>
      <div class="g3d-render-badge">WebGL2</div>
    `;
    const canvasWrap = document.createElement("div");
    canvasWrap.className = "g3d-canvas-wrap";
    canvasWrap.append(this.canvas);
    this.checklist.className = "g3d-checklist";
    this.viewport.append(viewportHeader, canvasWrap, this.checklist);

    this.inspector.replaceChildren();
    const inspectorHeader = document.createElement("header");
    inspectorHeader.className = "g3d-inspector-header";
    inspectorHeader.innerHTML = `
      <span>Workflow Inspector</span>
      <strong data-testid="${this.config.appId}-status">booting</strong>
    `;
    this.sceneList.className = "g3d-scene-list";
    this.diagnosticsPanel.className = "g3d-diagnostics";
    this.inspector.append(inspectorHeader, this.sceneList, this.diagnosticsPanel);
    this.renderControls();
    this.renderPanels();
  }

  private renderControls(): void {
    this.statusLine.innerHTML = `
      <span class="g3d-dot ${this.status}"></span>
      <div>
        <strong>${this.status.toUpperCase()}</strong>
        <small>${this.lastError ?? "Workflow source, controls, and render target are connected."}</small>
      </div>
    `;
    this.scenarioList.replaceChildren(...this.config.scenarios.map((scenario) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = scenario.id === this.selectedScenarioId ? "active" : "";
      button.dataset.testid = `${this.config.appId}-scenario-${scenario.id}`;
      button.innerHTML = `
        <span>${scenario.badge}</span>
        <strong>${scenario.label}</strong>
        <small>${scenario.description}</small>
      `;
      button.addEventListener("click", () => void this.loadScenario(scenario.id));
      return button;
    }));
  }

  private renderFrame(): void {
    if (!this.renderer || !this.workflow || this.status !== "ready") return;
    this.renderer.resizeToDisplay({ devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2) });
    this.latestRenderDiagnostics = this.renderer.render(this.workflow.source, this.workflow.camera);
    this.frameCount += 1;
    this.renderPanels();
    exposeAppState(this.snapshot(), { loadScenario: (id) => this.loadScenario(id), captureState: () => this.snapshot() });
  }

  private renderPanels(): void {
    const snapshot = this.snapshot();
    const metrics = [
      ["Workflow", snapshot.workflowKind ?? "pending"],
      ["Draw calls", String(snapshot.drawCalls)],
      ["Items", String(snapshot.renderedItems)],
      ["Frames", String(snapshot.frameCount)]
    ];
    this.metricGrid.replaceChildren(...metrics.map(([label, value]) => metric(label ?? "", value ?? "")));
    this.checklist.replaceChildren(...snapshot.featureChecklist.map((feature) => {
      const chip = document.createElement("span");
      chip.textContent = feature;
      return chip;
    }));
    const itemLabels = this.renderedItemLabels();
    this.sceneList.replaceChildren(...itemLabels.map((label, index) => {
      const row = document.createElement("div");
      row.className = "g3d-scene-row";
      row.innerHTML = `<span>${String(index + 1).padStart(2, "0")}</span><strong>${label}</strong>`;
      return row;
    }));
    this.diagnosticsPanel.textContent = JSON.stringify({
      status: snapshot.status,
      workflow: snapshot.workflowKind,
      warnings: snapshot.diagnostics?.warnings ?? [],
      render: {
        drawCalls: snapshot.drawCalls,
        lastError: snapshot.lastError,
        backend: snapshot.renderDiagnostics?.backend
      }
    }, null, 2);
    const status = this.inspector.querySelector(`[data-testid="${this.config.appId}-status"]`);
    if (status) status.textContent = snapshot.status;
  }

  private snapshot(): WorkflowWorkbenchState {
    return {
      appId: this.config.appId,
      status: this.status,
      selectedScenarioId: this.selectedScenarioId,
      workflowKind: this.workflow?.kind,
      featureChecklist: this.workflow?.diagnostics.featureChecklist ?? [],
      diagnostics: this.workflow?.diagnostics,
      renderDiagnostics: this.latestRenderDiagnostics,
      lastError: this.lastError ?? this.latestRenderDiagnostics?.lastError ?? null,
      frameCount: this.frameCount,
      drawCalls: this.latestRenderDiagnostics?.drawCalls ?? 0,
      renderedItems: this.renderedItemLabels().length
    };
  }

  private renderedItemLabels(): readonly string[] {
    const directItems = this.workflow?.renderItems?.map((item) => item.label ?? "render-item") ?? [];
    if (directItems.length > 0) return directItems;
    const asset = this.workflow?.diagnostics.asset;
    if (!asset) return [];
    return [
      `${asset.meshCount} meshes`,
      `${asset.materialCount} materials`,
      `${asset.textureCount} textures`
    ].filter((label) => !label.startsWith("0 "));
  }
}

function metric(label: string, value: string): HTMLElement {
  const element = document.createElement("div");
  element.className = "g3d-metric";
  element.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
  return element;
}

function exposeAppState(state: WorkflowWorkbenchState, methods: Pick<NonNullable<Window["__G3D_V3_APP__"]>, "loadScenario" | "captureState">): void {
  window.__G3D_V3_APP__ = Object.assign({}, state, methods);
}

function installWorkflowWorkbenchStyles(): void {
  if (document.getElementById("v3-workbench-styles")) return;
  const style = document.createElement("style");
  style.id = "v3-workbench-styles";
  style.textContent = `
    html, body, #app {
      width: 100%;
      height: 100%;
      margin: 0;
    }

    body {
      overflow: hidden;
      background: #111413;
      color: #f4f1e8;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    button {
      font: inherit;
    }

    .g3d-workbench {
      display: grid;
      grid-template-columns: minmax(260px, 320px) minmax(420px, 1fr) minmax(260px, 340px);
      height: 100%;
      min-width: 0;
      background:
        linear-gradient(90deg, rgba(28, 33, 32, 0.98), rgba(17, 20, 19, 0.98)),
        #111413;
    }

    .g3d-sidebar, .g3d-inspector {
      min-width: 0;
      overflow: auto;
      border-color: #333a37;
      background: #1d2321;
    }

    .g3d-sidebar {
      border-right: 1px solid #333a37;
      padding: 18px;
    }

    .g3d-inspector {
      border-left: 1px solid #333a37;
      padding: 18px;
    }

    .g3d-brand {
      border-bottom: 1px solid #343d39;
      margin-bottom: 16px;
      padding-bottom: 16px;
    }

    .g3d-brand span, .g3d-viewport-header span, .g3d-inspector-header span, .g3d-metric span {
      color: #99a39c;
      display: block;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0;
      text-transform: uppercase;
    }

    .g3d-brand h1 {
      margin: 7px 0 8px;
      font-size: 25px;
      line-height: 1.08;
    }

    .g3d-brand p {
      color: #c8c7bd;
      font-size: 13px;
      line-height: 1.45;
      margin: 0;
    }

    .g3d-statusline {
      align-items: flex-start;
      border-bottom: 1px solid #343d39;
      display: flex;
      gap: 10px;
      margin-bottom: 16px;
      padding-bottom: 16px;
    }

    .g3d-statusline strong {
      display: block;
      font-size: 13px;
      margin-bottom: 4px;
    }

    .g3d-statusline small {
      color: #b7bab0;
      display: block;
      font-size: 12px;
      line-height: 1.35;
    }

    .g3d-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      margin-top: 4px;
      background: #d0a34d;
      box-shadow: 0 0 0 4px rgba(208, 163, 77, 0.14);
      flex: 0 0 auto;
    }

    .g3d-dot.ready {
      background: #54b978;
      box-shadow: 0 0 0 4px rgba(84, 185, 120, 0.14);
    }

    .g3d-dot.error {
      background: #e05c5c;
      box-shadow: 0 0 0 4px rgba(224, 92, 92, 0.14);
    }

    .g3d-scenarios {
      display: grid;
      gap: 8px;
      margin-bottom: 16px;
    }

    .g3d-scenarios button {
      display: grid;
      grid-template-columns: 34px minmax(0, 1fr);
      gap: 3px 10px;
      min-height: 70px;
      border: 1px solid #3c4642;
      border-radius: 7px;
      background: #242b28;
      color: #f4f1e8;
      cursor: pointer;
      padding: 10px;
      text-align: left;
    }

    .g3d-scenarios button.active {
      border-color: var(--accent, #58a6ff);
      background: #29312d;
      box-shadow: inset 3px 0 0 var(--accent, #58a6ff);
    }

    .g3d-scenarios button > span {
      align-items: center;
      background: #151918;
      border: 1px solid #3b4440;
      border-radius: 6px;
      display: flex;
      grid-row: span 2;
      height: 34px;
      justify-content: center;
      width: 34px;
    }

    .g3d-scenarios strong {
      font-size: 13px;
      line-height: 1.2;
      min-width: 0;
    }

    .g3d-scenarios small {
      color: #afb5ad;
      font-size: 12px;
      line-height: 1.3;
    }

    .g3d-metrics {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .g3d-metric {
      border: 1px solid #39423e;
      border-radius: 7px;
      background: #171b1a;
      min-height: 58px;
      padding: 10px;
    }

    .g3d-metric strong {
      display: block;
      font-size: 19px;
      margin-top: 7px;
      overflow-wrap: anywhere;
    }

    .g3d-viewport {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      min-width: 0;
      min-height: 0;
      background: #0f1211;
    }

    .g3d-viewport-header {
      align-items: center;
      border-bottom: 1px solid #2f3633;
      display: flex;
      justify-content: space-between;
      min-height: 62px;
      padding: 0 18px;
    }

    .g3d-viewport-header strong {
      display: block;
      font-size: 15px;
      margin-top: 4px;
    }

    .g3d-render-badge {
      border: 1px solid #405049;
      border-radius: 6px;
      color: #d9e8df;
      font-size: 12px;
      font-weight: 700;
      padding: 7px 9px;
    }

    .g3d-canvas-wrap {
      min-height: 0;
      min-width: 0;
      position: relative;
    }

    .g3d-canvas {
      display: block;
      width: 100%;
      height: 100%;
      min-height: 360px;
      outline: 1px solid rgba(255, 255, 255, 0.03);
      outline-offset: -1px;
    }

    .g3d-checklist {
      align-items: center;
      border-top: 1px solid #2f3633;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      min-height: 58px;
      padding: 10px 18px;
    }

    .g3d-checklist span {
      border: 1px solid #3c4642;
      border-radius: 999px;
      color: #d4d6cb;
      font-size: 12px;
      padding: 5px 9px;
    }

    .g3d-inspector-header {
      border-bottom: 1px solid #343d39;
      display: flex;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 14px;
      padding-bottom: 14px;
    }

    .g3d-inspector-header strong {
      color: #f4f1e8;
      font-size: 12px;
      text-transform: uppercase;
    }

    .g3d-scene-list {
      display: grid;
      gap: 7px;
      margin-bottom: 14px;
    }

    .g3d-scene-row {
      align-items: center;
      border: 1px solid #38413d;
      border-radius: 6px;
      display: grid;
      gap: 10px;
      grid-template-columns: 34px minmax(0, 1fr);
      min-height: 40px;
      padding: 6px 9px;
    }

    .g3d-scene-row span {
      color: #8fa098;
      font-size: 12px;
      font-weight: 700;
    }

    .g3d-scene-row strong {
      font-size: 12px;
      overflow-wrap: anywhere;
    }

    .g3d-diagnostics {
      background: #101413;
      border: 1px solid #38413d;
      border-radius: 7px;
      color: #d9ded7;
      font-size: 11px;
      line-height: 1.45;
      margin: 0;
      min-height: 180px;
      overflow: auto;
      padding: 12px;
      white-space: pre-wrap;
    }

    @media (max-width: 980px) {
      body {
        overflow: auto;
      }

      .g3d-workbench {
        grid-template-columns: 1fr;
        grid-template-rows: auto minmax(520px, 65vh) auto;
        min-height: 100%;
      }

      .g3d-sidebar, .g3d-inspector {
        border: 0;
      }
    }
  `;
  document.head.append(style);
}
