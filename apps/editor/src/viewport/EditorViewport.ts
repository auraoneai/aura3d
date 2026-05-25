import { Ray, Vector3 } from "@galileo3d/math";
import { Geometry, UnlitMaterial, type RenderDeviceDiagnostics } from "@galileo3d/rendering";
import { G3DRenderer } from "@galileo3d/engine/advanced-runtime";
import type { EditorDiagnosticsResource } from "@galileo3d/editor-runtime";
import type { SceneNode } from "@galileo3d/scene";
import type { EditorShell } from "../EditorShell";

export class EditorViewport {
  readonly element: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly overlayCanvas: HTMLCanvasElement;
  viewMode: "shaded" | "wireframe" | "collider" | "bounds" | "lighting" = "shaded";
  snapEnabled = true;
  private renderer?: G3DRenderer;
  private diagnostics: RenderDeviceDiagnostics | undefined;
  private orbitYaw = 0;
  private orbitPitch = 20;
  private panX = 0;
  private panY = 0;
  private zoom = 1;
  private lastInput: "button" | "pointer" | "touch" | "wheel" = "button";
  private dragStart: {
    readonly x: number;
    readonly y: number;
    readonly orbitYaw: number;
    readonly orbitPitch: number;
    readonly panX: number;
    readonly panY: number;
    readonly mode: "orbit" | "pan";
    readonly input: "pointer" | "touch";
  } | undefined;

  constructor(private readonly shell: EditorShell) {
    const editorState = shell.runtime.editorStateSnapshot();
    this.snapEnabled = editorState.gridSnap.snapToGrid;
    this.viewMode = editorState.viewport.showWireframe ? "wireframe" : editorState.viewport.showBounds ? "bounds" : "shaded";
    this.element = document.createElement("section");
    this.element.className = "editor-viewport-panel";
    this.element.innerHTML = `
      <div class="panel-title">
        <span>Viewport</span>
        <div class="toolbar">
          <button data-action="tool-select">Select</button>
          <button data-action="tool-move-x">Move X</button>
          <button data-action="tool-move-y">Move Y</button>
          <button data-action="tool-rotate-z">Rotate Z</button>
          <button data-action="tool-scale-uniform">Scale</button>
          <button data-action="toggle-snap">Snap</button>
          <button data-action="view-orbit">Orbit</button>
          <button data-action="view-pan">Pan</button>
          <button data-action="view-zoom-in">Zoom +</button>
          <button data-action="view-zoom-out">Zoom -</button>
          <button data-action="view-focus">Focus</button>
          <button data-action="view-reset">Reset View</button>
          <select data-action="view-mode" aria-label="Viewport mode">
            <option value="shaded">Shaded</option>
            <option value="wireframe">Wireframe</option>
            <option value="bounds">Bounds</option>
            <option value="collider">Collider</option>
            <option value="lighting">Lighting</option>
          </select>
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
      void this.transformSelected("translate", "x");
    });
    this.element.querySelector<HTMLButtonElement>('[data-action="tool-move-y"]')?.addEventListener("click", () => {
      void this.transformSelected("translate", "y");
    });
    this.element.querySelector<HTMLButtonElement>('[data-action="tool-rotate-z"]')?.addEventListener("click", () => {
      void this.transformSelected("rotate", "z");
    });
    this.element.querySelector<HTMLButtonElement>('[data-action="tool-scale-uniform"]')?.addEventListener("click", () => {
      void this.transformSelected("scale", "uniform");
    });
    this.element.querySelector<HTMLButtonElement>('[data-action="toggle-snap"]')?.addEventListener("click", () => {
      this.snapEnabled = !this.snapEnabled;
      this.syncViewportState();
      this.render();
      shell.refresh();
    });
    this.element.querySelector<HTMLButtonElement>('[data-action="view-orbit"]')?.addEventListener("click", () => {
      this.orbitYaw = round(this.orbitYaw + 15);
      this.orbitPitch = round(Math.max(-80, Math.min(80, this.orbitPitch + 5)));
      this.lastInput = "button";
      this.render();
      shell.refresh();
    });
    this.element.querySelector<HTMLButtonElement>('[data-action="view-pan"]')?.addEventListener("click", () => {
      this.panX = round(this.panX + 24);
      this.panY = round(this.panY - 16);
      this.lastInput = "button";
      this.render();
      shell.refresh();
    });
    this.element.querySelector<HTMLButtonElement>('[data-action="view-zoom-in"]')?.addEventListener("click", () => {
      this.zoom = round(Math.min(4, this.zoom * 1.2));
      this.lastInput = "button";
      this.render();
      shell.refresh();
    });
    this.element.querySelector<HTMLButtonElement>('[data-action="view-zoom-out"]')?.addEventListener("click", () => {
      this.zoom = round(Math.max(0.25, this.zoom / 1.2));
      this.lastInput = "button";
      this.render();
      shell.refresh();
    });
    this.element.querySelector<HTMLButtonElement>('[data-action="view-focus"]')?.addEventListener("click", () => {
      this.focusSelection();
      this.lastInput = "button";
      this.render();
      shell.refresh();
    });
    this.element.querySelector<HTMLButtonElement>('[data-action="view-reset"]')?.addEventListener("click", () => {
      this.resetView();
      this.lastInput = "button";
      this.render();
      shell.refresh();
    });
    this.element.querySelector<HTMLSelectElement>('[data-action="view-mode"]')?.addEventListener("change", (event) => {
      this.viewMode = (event.target as HTMLSelectElement).value as typeof this.viewMode;
      this.syncViewportState();
      this.render();
      shell.refresh();
    });
    this.canvas.addEventListener("click", () => this.pickPrimaryTarget());
    this.canvas.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      this.dragStart = {
        x: event.clientX,
        y: event.clientY,
        orbitYaw: this.orbitYaw,
        orbitPitch: this.orbitPitch,
        panX: this.panX,
        panY: this.panY,
        mode: event.shiftKey ? "pan" : "orbit",
        input: event.pointerType === "touch" ? "touch" : "pointer"
      };
      this.lastInput = this.dragStart.input;
      try {
        this.canvas.setPointerCapture(event.pointerId);
      } catch {
        // Synthetic pointer events in tests may not register active pointers.
      }
    });
    this.canvas.addEventListener("pointermove", (event) => {
      if (!this.dragStart) return;
      const dx = event.clientX - this.dragStart.x;
      const dy = event.clientY - this.dragStart.y;
      if (this.dragStart.mode === "pan") {
        this.panX = round(this.dragStart.panX + dx * 0.35);
        this.panY = round(this.dragStart.panY + dy * 0.35);
      } else {
        this.orbitYaw = round(this.dragStart.orbitYaw + dx * 0.18);
        this.orbitPitch = round(Math.max(-80, Math.min(80, this.dragStart.orbitPitch + dy * 0.12)));
      }
      this.lastInput = this.dragStart.input;
      this.render();
      shell.refresh();
    });
    this.canvas.addEventListener("pointerup", (event) => {
      this.dragStart = undefined;
      try {
        this.canvas.releasePointerCapture(event.pointerId);
      } catch {
        // Synthetic pointer events in tests may not register active pointers.
      }
    });
    this.canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      this.zoom = round(Math.max(0.25, Math.min(4, this.zoom + Math.sign(-event.deltaY) * 0.12)));
      this.lastInput = "wheel";
      this.render();
      shell.refresh();
    }, { passive: false });
    this.element.addEventListener("dragover", (event) => {
      if (event.dataTransfer?.types.includes("application/x-galileo3d-asset")) {
        event.preventDefault();
      }
    });
    this.element.addEventListener("drop", (event) => {
      const assetId = event.dataTransfer?.getData("application/x-galileo3d-asset");
      if (assetId) {
        event.preventDefault();
        void shell.placeAsset(assetId);
      }
    });
  }

  async initialize(): Promise<void> {
    this.renderer = await G3DRenderer.create({
      backend: "webgl2",
      canvas: this.canvas,
      width: this.canvas.width,
      height: this.canvas.height,
      clearColor: [0.07, 0.1, 0.15, 1],
      preserveDrawingBuffer: true
    });
    this.syncViewportState();
    this.render();
  }

  render(): void {
    const renderStartedAt = performance.now();
    this.shell.runtime.setPickTargets(this.shell.sceneNodes().map((node) => ({ id: node.id, node, bounds: { min: [-1, -1, -1], max: [1, 1, 1] } })));
    this.shell.runtime.configurePickingBuffer(this.canvas.width, this.canvas.height);
    const selected = this.shell.selectedNode();
    const selectedProjectNode = this.shell.selectedProjectNode();
    const material = new UnlitMaterial({
      name: "editor-viewport-material",
      color: selectedProjectNode ? hexToRgba(selectedProjectNode.material.baseColor) : [0.5, 0.65, 1, 1]
    });
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

  viewSnapshot(): {
    readonly orbitYaw: number;
    readonly orbitPitch: number;
    readonly pan: readonly [number, number];
    readonly zoom: number;
    readonly focusedNodeId: string | null;
    readonly pointerControls: boolean;
    readonly touchControls: boolean;
    readonly lastInput: "button" | "pointer" | "touch" | "wheel";
    readonly gizmo: ReturnType<EditorShell["runtime"]["gizmoSettings"]>;
  } {
    return {
      orbitYaw: this.orbitYaw,
      orbitPitch: this.orbitPitch,
      pan: [this.panX, this.panY],
      zoom: this.zoom,
      focusedNodeId: this.shell.selectedNode()?.id ?? null,
      pointerControls: true,
      touchControls: true,
      lastInput: this.lastInput,
      gizmo: this.shell.runtime.gizmoSettings()
    };
  }

  private pickPrimaryTarget(): void {
    const hit = this.shell.runtime.pick(new Ray(new Vector3(0, 0, 5), new Vector3(0, 0, -1)));
    if (hit) {
      this.shell.selectNode(String(hit.target.id));
      this.render();
    }
  }

  private async transformSelected(kind: "translate" | "rotate" | "scale", axis: "x" | "y" | "z" | "uniform"): Promise<void> {
    const node = this.shell.selectedNode();
    if (!node) {
      return;
    }
    this.shell.runtime.configureGizmos({
      snapEnabled: this.snapEnabled,
      positionSnap: 0.5,
      rotationSnapDegrees: 15,
      scaleSnap: 0.25,
      spaceMode: "world",
      pivotMode: "center"
    });
    this.syncViewportState();
    const delta = this.snapEnabled ? kind === "rotate" ? Math.PI / 12 : kind === "scale" ? 0.25 : 0.5 : kind === "scale" ? 0.1 : 0.2;
    this.shell.runtime.setTool(kind === "translate" ? "move" : kind);
    if (kind === "translate") {
      await this.shell.runtime.translateTarget(node, { axis, delta });
    }
    if (kind === "rotate") {
      await this.shell.runtime.rotateTarget(node, { axis, delta });
    }
    if (kind === "scale") {
      await this.shell.runtime.scaleTarget(node, { axis, delta });
    }
    this.shell.projectFromScene();
    this.render();
    this.shell.refresh();
  }

  private syncViewportState(): void {
    this.shell.runtime.configureViewportState({
      showGrid: true,
      showStats: true,
      showWireframe: this.viewMode === "wireframe",
      showBounds: this.viewMode === "bounds",
      showLights: this.viewMode === "lighting",
      fov: 60,
      near: 0.1,
      far: 1000
    });
    this.shell.runtime.configureGizmos({
      snapEnabled: this.snapEnabled,
      positionSnap: 0.5,
      rotationSnapDegrees: 15,
      scaleSnap: 0.25,
      spaceMode: "world",
      pivotMode: "center"
    });
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
    context.lineWidth = 3;
    context.strokeStyle = "#ef4444";
    context.beginPath();
    context.moveTo(28, this.overlayCanvas.height - 32);
    context.lineTo(108, this.overlayCanvas.height - 32);
    context.stroke();
    context.strokeStyle = "#22c55e";
    context.beginPath();
    context.moveTo(28, this.overlayCanvas.height - 32);
    context.lineTo(28, this.overlayCanvas.height - 112);
    context.stroke();
    context.fillStyle = "#f8fafc";
    context.font = "13px ui-sans-serif, system-ui, sans-serif";
    context.fillText("X", 114, this.overlayCanvas.height - 28);
    context.fillText("Y", 22, this.overlayCanvas.height - 118);
    const nodes = this.shell.project.scene.nodes;
    const selectedIds = new Set(this.shell.runtime.currentSelection().map(String));
    const yawRadians = this.orbitYaw * Math.PI / 180;
    const yawCos = Math.cos(yawRadians);
    const yawSin = Math.sin(yawRadians);
    nodes.forEach((node, index) => {
      const isSelected = selectedIds.has(node.id);
      const projectedX = node.transform.position[0] * yawCos - node.transform.position[2] * yawSin;
      const projectedY = node.transform.position[1] + node.transform.position[2] * Math.sin(this.orbitPitch * Math.PI / 180) * 0.35;
      const x = this.overlayCanvas.width / 2 + this.panX + projectedX * 120 * this.zoom + index * 28;
      const y = this.overlayCanvas.height / 2 + this.panY - projectedY * 90 * this.zoom + index * 24;
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
      if (isSelected && this.shell.runtime.activeTool === "rotate") {
        context.strokeStyle = "#a78bfa";
        context.lineWidth = 4;
        context.beginPath();
        context.arc(x, y, 58, 0, Math.PI * 1.75);
        context.stroke();
      }
      if (isSelected && this.shell.runtime.activeTool === "scale") {
        context.strokeStyle = "#34d399";
        context.lineWidth = 4;
        context.strokeRect(x - 54, y - 54, 108, 108);
      }
      if (this.viewMode === "bounds") {
        context.strokeStyle = "#f8d65a";
        context.lineWidth = 1;
        context.setLineDash([6, 4]);
        context.strokeRect(x - 52, y - 52, 104, 104);
        context.setLineDash([]);
      }
      if (this.viewMode === "collider" && node.physics.collider !== "none") {
        context.strokeStyle = "#fb7185";
        context.lineWidth = 2;
        context.strokeRect(x - 48, y - 48, 96, 96);
      }
      if (this.viewMode === "lighting" && node.light.kind !== "none") {
        context.fillStyle = "rgba(250, 204, 21, 0.25)";
        context.beginPath();
        context.arc(x, y, Math.max(32, node.light.intensity * 48), 0, Math.PI * 2);
        context.fill();
      }
      if (node.camera.enabled) {
        context.strokeStyle = "#67e8f9";
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(x + 54, y - 28);
        context.lineTo(x + 90, y - 46);
        context.lineTo(x + 90, y + 46);
        context.lineTo(x + 54, y + 28);
        context.closePath();
        context.stroke();
      }
      if (this.viewMode === "wireframe") {
        context.strokeStyle = "#93c5fd";
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(x - 42, y - 42);
        context.lineTo(x + 42, y + 42);
        context.moveTo(x + 42, y - 42);
        context.lineTo(x - 42, y + 42);
        context.stroke();
      }
    });
    const hud = this.element.querySelector<HTMLElement>('[data-role="viewport-hud"]');
    if (hud) {
      const snapshot = this.shell.runtime.diagnosticsSnapshot();
      hud.textContent = `${snapshot.drawCalls} draw calls | ${snapshot.warnings} warnings | ${this.viewMode} | ${this.snapEnabled ? "snap" : "free"} | orbit ${this.orbitYaw}/${this.orbitPitch} | pan ${this.panX},${this.panY} | zoom ${this.zoom} | ${selected?.name ?? "nothing selected"}`;
    }
    context.restore();
  }

  private focusSelection(): void {
    const node = this.shell.selectedNode();
    if (!node) {
      this.resetView();
      return;
    }
    this.panX = round(-node.transform.position[0] * 80);
    this.panY = round(node.transform.position[1] * 60);
    this.zoom = 1.25;
  }

  private resetView(): void {
    this.orbitYaw = 0;
    this.orbitPitch = 20;
    this.panX = 0;
    this.panY = 0;
    this.zoom = 1;
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

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function hexToRgba(hex: string): readonly [number, number, number, number] {
  const normalized = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : "80a6ff";
  return [
    Number.parseInt(normalized.slice(0, 2), 16) / 255,
    Number.parseInt(normalized.slice(2, 4), 16) / 255,
    Number.parseInt(normalized.slice(4, 6), 16) / 255,
    1
  ];
}
