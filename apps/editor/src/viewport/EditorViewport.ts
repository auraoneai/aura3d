import { Ray, Vector3 } from "@galileo3d/math";
import { Geometry, Renderer, UnlitMaterial, type RenderDeviceDiagnostics } from "@galileo3d/rendering";
import type { EditorDiagnosticsResource } from "@galileo3d/editor-runtime";
import type { SceneNode } from "@galileo3d/scene";
import type { EditorShell } from "../EditorShell";

export class EditorViewport {
  readonly element: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly overlayCanvas: HTMLCanvasElement;
  private renderer?: Renderer;
  private diagnostics: RenderDeviceDiagnostics | undefined;

  constructor(private readonly shell: EditorShell) {
    this.element = document.createElement("section");
    this.element.className = "editor-viewport-panel";
    this.element.innerHTML = `
      <div class="panel-title">
        <span>Viewport</span>
        <div class="toolbar">
          <button data-action="tool-select">Select</button>
          <button data-action="tool-move-x">Move X</button>
        </div>
      </div>
      <div class="viewport-stack">
        <canvas class="editor-viewport" width="900" height="520" aria-label="Editor WebGL viewport"></canvas>
        <canvas class="editor-viewport-overlay" width="900" height="520" aria-label="Editor viewport overlay"></canvas>
      </div>
      <div class="viewport-hud" data-role="viewport-hud"></div>
    `;
    this.canvas = this.element.querySelector<HTMLCanvasElement>(".editor-viewport")!;
    this.overlayCanvas = this.element.querySelector<HTMLCanvasElement>(".editor-viewport-overlay")!;
    this.element.querySelector<HTMLButtonElement>('[data-action="tool-select"]')?.addEventListener("click", () => {
      shell.runtime.setTool("select");
      this.render();
      shell.refresh();
    });
    this.element.querySelector<HTMLButtonElement>('[data-action="tool-move-x"]')?.addEventListener("click", () => {
      void this.moveSelectedX();
    });
    this.canvas.addEventListener("click", () => this.pickPrimaryTarget());
  }

  async initialize(): Promise<void> {
    this.renderer = await Renderer.create({
      backend: "webgl2",
      canvas: this.canvas,
      width: this.canvas.width,
      height: this.canvas.height,
      clearColor: [0.07, 0.1, 0.15, 1],
      preserveDrawingBuffer: true
    });
    this.render();
  }

  render(): void {
    const renderStartedAt = performance.now();
    this.shell.runtime.setPickTargets(this.shell.sceneNodes().map((node) => ({ id: node.id, node, bounds: { min: [-1, -1, -1], max: [1, 1, 1] } })));
    const selected = this.shell.selectedNode();
    const material = new UnlitMaterial({ name: "editor-viewport-material", color: selected ? [0.22, 0.85, 0.62, 1] : [0.5, 0.65, 1, 1] });
    this.diagnostics = this.renderer?.render([{ geometry: Geometry.triangle(), material, label: selected?.name ?? "editor-scene" }]);
    this.shell.runtime.updateDiagnostics({
      frameTimeMs: performance.now() - renderStartedAt,
      drawCalls: this.diagnostics?.drawCalls ?? 0,
      triangleCount: this.diagnostics ? 1 : 0,
      nodeCount: this.shell.project.scene.nodes.length,
      assetCount: this.shell.project.assets.length,
      physicsBodies: this.shell.project.scene.nodes.filter((node) => node.physics.body !== "none").length,
      resources: this.diagnosticResources(selected)
    });
    this.drawOverlay(selected);
  }

  diagnosticsSnapshot(): RenderDeviceDiagnostics | undefined {
    return this.diagnostics;
  }

  private pickPrimaryTarget(): void {
    const hit = this.shell.runtime.pick(new Ray(new Vector3(0, 0, 5), new Vector3(0, 0, -1)));
    if (hit) {
      this.shell.selectNode(String(hit.target.id));
      this.render();
    }
  }

  private async moveSelectedX(): Promise<void> {
    const node = this.shell.selectedNode();
    if (!node) {
      return;
    }
    this.shell.runtime.setTool("move");
    await this.shell.runtime.translateTarget(node, { axis: "x", delta: 0.5 });
    this.shell.projectFromScene();
    this.render();
    this.shell.refresh();
  }

  private drawOverlay(selected: SceneNode | undefined): void {
    const context = this.overlayCanvas.getContext("2d");
    if (!context) {
      return;
    }
    context.save();
    context.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    context.fillStyle = "rgba(10, 15, 24, 0.5)";
    context.fillRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    context.strokeStyle = "#273244";
    context.lineWidth = 1;
    for (let x = 0; x < this.overlayCanvas.width; x += 45) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, this.overlayCanvas.height);
      context.stroke();
    }
    for (let y = 0; y < this.overlayCanvas.height; y += 45) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(this.overlayCanvas.width, y);
      context.stroke();
    }
    const nodes = this.shell.project.scene.nodes;
    nodes.forEach((node, index) => {
      const isSelected = selected?.id === node.id;
      const x = this.overlayCanvas.width / 2 + node.transform.position[0] * 120 + index * 28;
      const y = this.overlayCanvas.height / 2 - node.transform.position[1] * 90 + index * 24;
      context.fillStyle = node.material.baseColor;
      context.fillRect(x - 42, y - 42, 84, 84);
      context.strokeStyle = isSelected ? "#f8d65a" : "#dbeafe";
      context.lineWidth = isSelected ? 5 : 2;
      context.strokeRect(x - 42, y - 42, 84, 84);
      context.fillStyle = "#f8fafc";
      context.font = "16px ui-sans-serif, system-ui, sans-serif";
      context.fillText(node.name, x - 42, y + 62);
      if (isSelected && this.shell.runtime.activeTool === "move") {
        context.strokeStyle = "#f97316";
        context.lineWidth = 4;
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x + 90, y);
        context.stroke();
      }
    });
    const hud = this.element.querySelector<HTMLElement>('[data-role="viewport-hud"]');
    if (hud) {
      const snapshot = this.shell.runtime.diagnosticsSnapshot();
      hud.textContent = `${snapshot.drawCalls} draw calls | ${snapshot.warnings} warnings | ${selected?.name ?? "nothing selected"}`;
    }
    context.restore();
  }

  private diagnosticResources(selected: SceneNode | undefined): readonly EditorDiagnosticsResource[] {
    const nodeResources = this.shell.project.scene.nodes.map((node) => ({
      id: node.id,
      label: node.name,
      kind: "scene-node" as const,
      status: "ok" as const,
      detail: node.physics.body === "none" ? "Renderable authoring node" : `${node.physics.body} physics body`
    }));
    const assetResources = this.shell.project.assets.map((asset) => ({
      id: asset.id,
      label: asset.name,
      kind: "asset" as const,
      status: asset.diagnostics.length > 0 ? "warning" as const : "ok" as const,
      detail: asset.diagnostics.join("; ") || asset.preview
    }));
    const selectedRecord = selected ? this.shell.project.scene.nodes.find((node) => node.id === selected.id) : undefined;
    const shaderStatus = selectedRecord && /^#[0-9a-f]{6}$/i.test(selectedRecord.material.baseColor) ? "ok" : "warning";
    return [
      ...nodeResources,
      ...assetResources,
      {
        id: "shader-selected-material",
        label: selectedRecord?.material.name ?? "No selected material",
        kind: "shader",
        status: shaderStatus,
        detail: shaderStatus === "ok" ? "Unlit preview shader inputs are valid" : "Select a node with a valid hex base color"
      }
    ];
  }
}
