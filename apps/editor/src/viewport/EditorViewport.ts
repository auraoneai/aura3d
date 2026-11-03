import { Ray, Vector3 } from "@aura3d/math";
import { rendererQrFlags, type RenderDeviceDiagnostics, type RenderItem } from "@aura3d/rendering";
import { createTrustedQrFlags } from "@aura3d/rendering/contracts";
import { Renderer } from "@aura3d/engine/renderer";
import type { FrameInspectionSource } from "@aura3d/debug";
import type { EditorDiagnosticsResource } from "@aura3d/editor-runtime";
import { invertMat4, lookAtMat4, multiplyMat4, perspectiveMat4, transformPoint, type Mat4, type SceneNode } from "@aura3d/scene";
import { ProjectSceneRuntime } from "../export/ProjectSceneRuntime";
import type { EditorShell } from "../EditorShell";
export { embeddedTextureAssetId } from "../export/ProjectSceneRuntime";

export class EditorViewport extends ProjectSceneRuntime<EditorShell> {
  readonly element: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly overlayCanvas: HTMLCanvasElement;
  viewMode: "shaded" | "wireframe" | "collider" | "bounds" | "lighting" = "shaded";
  snapEnabled = true;
  private initializing?: Promise<void>;
  private animationFrame: number | undefined;
  private inspectionPollFrame: number | undefined;
  private inspectionPollRemaining = 0;
  private inspectionTimingFingerprint = "[]";
  private inspectionFailure: string | undefined;
  private wasPlaying = false;
  private diagnostics: RenderDeviceDiagnostics | undefined;
  private orbitYaw = 0;
  private orbitPitch = 20;
  private panX = 0;
  private panY = 0;
  private focusZ = 0;
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

  constructor(shell: EditorShell) {
    super(shell);
    const editorState = shell.runtime.editorStateSnapshot();
    this.snapEnabled = editorState.gridSnap.snapToGrid;
    this.viewMode = editorState.viewport.showBounds ? "bounds" : "shaded";
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
            <option value="wireframe" disabled>Wireframe (unavailable)</option>
            <option value="bounds">Bounds</option>
            <option value="collider" disabled>Collider (unavailable)</option>
            <option value="lighting" disabled>Lighting (unavailable)</option>
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
    this.canvas.addEventListener("click", (event) => this.pickPrimaryTarget(event.clientX, event.clientY));
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
      if (event.dataTransfer?.types.includes("application/x-aura3d-asset")) {
        event.preventDefault();
      }
    });
    this.element.addEventListener("drop", (event) => {
      const assetId = event.dataTransfer?.getData("application/x-aura3d-asset");
      if (assetId) {
        event.preventDefault();
        void shell.placeAsset(assetId);
      }
    });
  }

  initialize(): Promise<void> {
    if (this.disposed || this.renderer) return Promise.resolve();
    if (!this.initializing) {
      this.initializing = this.createRenderer().finally(() => { this.initializing = undefined; });
    }
    return this.initializing;
  }

  private async createRenderer(): Promise<void> {
    // Preserve the ambient renderer flags while enabling this editor-owned
    // renderer's existing frame-statistics contributor. Device capability
    // probing still decides whether any GPU query can actually be measured.
    const qrFlags = createTrustedQrFlags({ ...rendererQrFlags().values, A3D_QR_TIERS: true });
    const renderer = await Renderer.create({
      backend: "webgl2",
      canvas: this.canvas,
      width: this.canvas.width,
      height: this.canvas.height,
      clearColor: [0.07, 0.1, 0.15, 1],
      qrFlags,
    });
    if (this.disposed) {
      renderer.dispose();
      return;
    }
    this.renderer = renderer;
    this.syncViewportState();
    this.render();
    void document.fonts?.ready.then(() => { if (!this.disposed) this.render(); });
  }

  render(): void {
    if (this.disposed) return;
    this.shell.runtime.invalidateFrameTimeSample();
    try {
      this.renderViewportFrame();
      this.inspectionFailure = undefined;
      this.scheduleInspectionPoll();
    } catch (error) {
      this.inspectionFailure = error instanceof Error && error.message
        ? error.message : typeof error === "string" && error ? error : "Viewport frame failed.";
      this.diagnostics = undefined;
      this.stopInspectionPoll();
      this.shell.runtime.invalidateFrameTimeSample();
      try {
        // A failed frame also needs to clear the previously displayed sample.
        this.shell.notifyViewportFrame();
      } catch {
        // Preserve the original frame failure; the diagnostics remain unavailable.
      }
      throw error;
    }
  }

  private renderViewportFrame(): void {
    const renderStartedAt = performance.now();
    this.syncTextureAssets();
    this.syncMeshAssets();
    this.shell.scene.updateWorldTransforms();
    const mode = this.shell.runtime.mode;
    if (mode === "edit" && this.wasPlaying) this.resetSceneInstances();
    this.wasPlaying = mode !== "edit";
    const now = performance.now();
    const delta = mode === "play" && this.animationTime !== undefined ? Math.min(0.1, Math.max(0, (now - this.animationTime) / 1000)) : 0;
    this.animationTime = mode === "play" ? now : undefined;
    const items = this.sceneRenderItems(delta);
    const camera = this.camera();
    if (this.shell.runtime.mode === "edit") {
      this.shell.runtime.setPickTargets(this.pickTargets(items));
      this.shell.runtime.configurePickingBuffer(this.canvas.width, this.canvas.height);
    }
    const selected = this.shell.selectedNode();
    this.diagnostics = this.renderer?.render({ renderItems: items, collectedLights: this.sceneLights(), cameraPolicy: "require" }, camera);
    // This is synchronous viewport preparation and render-submission elapsed
    // time, not GPU completion time or an estimate based on refresh count.
    const elapsed = performance.now() - renderStartedAt;
    const hasFrameTimeSample = this.diagnostics?.contextLost === false
      && this.diagnostics.lastError === null
      && Number.isFinite(elapsed)
      && elapsed >= 0;
    this.shell.runtime.updateDiagnostics({
      frameTimeMs: hasFrameTimeSample ? elapsed : 0,
      hasFrameTimeSample,
      drawCalls: this.diagnostics?.drawCalls ?? 0,
      triangleCount: items.reduce((total, item) => total + itemTriangleCount(item), 0),
      nodeCount: this.shell.project.scene.nodes.length,
      assetCount: this.shell.project.assets.length,
      physicsBodies: this.shell.project.scene.nodes.filter((node) => node.physics.body !== "none").length,
      resources: this.diagnosticResources(selected)
    });
    this.drawOverlay(selected, items, camera.viewProjectionMatrix);
    this.scheduleAnimation();
  }

  private scheduleAnimation(): void {
    const needsFrame = this.shell.runtime.mode === "play" && this.shell.project.scene.nodes.some((node) => {
      const instance = this.modelInstances.get(node.id);
      return node.mesh.enabled && node.animation.enabled && instance && !instance.error && instance.mixer.snapshot().activeClipNames.length > 0;
    });
    if (!needsFrame || this.disposed) {
      if (this.animationFrame !== undefined && typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.animationFrame);
      this.animationFrame = undefined;
      return;
    }
    if (this.animationFrame === undefined && typeof requestAnimationFrame === "function") {
      this.animationFrame = requestAnimationFrame(() => {
        this.animationFrame = undefined;
        if (!this.disposed && this.shell.runtime.mode === "play") {
          this.render();
          this.shell.notifyViewportFrame();
        }
      });
    }
  }

  /**
   * WebGL query results may arrive after the last on-demand editor frame.
   * Observe the renderer's retained captures without submitting extra frames.
   * This bounded poll does not claim that an unavailable sample is pending.
   */
  private scheduleInspectionPoll(): void {
    if (this.disposed || this.animationFrame !== undefined || this.renderer?.device?.probe?.timerQuery !== true
      || typeof requestAnimationFrame !== "function") return;
    this.inspectionPollRemaining = 30;
    if (this.inspectionPollFrame === undefined) {
      try {
        this.inspectionPollFrame = requestAnimationFrame(() => this.pollInspectionTimings());
      } catch {
        this.inspectionPollRemaining = 0;
      }
    }
  }

  private pollInspectionTimings(): void {
    this.inspectionPollFrame = undefined;
    const renderer = this.renderer;
    if (this.disposed || this.inspectionFailure || !renderer || this.inspectionPollRemaining <= 0) return;
    this.inspectionPollRemaining -= 1;
    try {
      const measured = renderer.getFrameInspectionHistory().flatMap((frame, index) =>
        frame.gpuViewTiming?.views.flatMap((view) =>
          typeof view.gpuTimeMs === "number" && Number.isFinite(view.gpuTimeMs) && view.gpuTimeMs >= 0
            ? [[index, frame.frameNumber, view.viewId, view.gpuTimeMs]] : []) ?? []);
      const fingerprint = JSON.stringify(measured);
      if (fingerprint !== this.inspectionTimingFingerprint) {
        this.shell.notifyViewportFrame();
        this.inspectionTimingFingerprint = fingerprint;
      }
    } catch {
      // Inspection is best-effort and must not interrupt editing or rendering.
    }
    if (this.inspectionPollRemaining > 0 && this.animationFrame === undefined && typeof requestAnimationFrame === "function") {
      try {
        this.inspectionPollFrame = requestAnimationFrame(() => this.pollInspectionTimings());
      } catch {
        this.inspectionPollRemaining = 0;
      }
    }
  }

  private stopInspectionPoll(): void {
    try {
      if (this.inspectionPollFrame !== undefined && typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.inspectionPollFrame);
    } catch {
      // Cancellation must not replace an original rendering error.
    }
    this.inspectionPollFrame = undefined;
    this.inspectionPollRemaining = 0;
  }

  private camera(): { readonly viewMatrix: Mat4; readonly projectionMatrix: Mat4; readonly viewProjectionMatrix: Mat4; readonly shaderViewMatrix: Mat4; readonly shaderProjectionMatrix: Mat4 } {
    const yaw = this.orbitYaw * Math.PI / 180;
    const pitch = this.orbitPitch * Math.PI / 180;
    const distance = 4 / this.zoom;
    const target: [number, number, number] = [-this.panX / (120 * this.zoom), this.panY / (90 * this.zoom), this.focusZ];
    const eye: [number, number, number] = [target[0] + distance * Math.sin(yaw) * Math.cos(pitch), target[1] + distance * Math.sin(pitch), target[2] + distance * Math.cos(yaw) * Math.cos(pitch)];
    const viewMatrix = lookAtMat4(eye, target, [0, 1, 0]);
    const projectionMatrix = perspectiveMat4(Math.PI / 3, Math.max(1, this.canvas.width) / Math.max(1, this.canvas.height), 0.1, 1000);
    return { viewMatrix, projectionMatrix, viewProjectionMatrix: multiplyMat4(projectionMatrix, viewMatrix), shaderViewMatrix: viewMatrix, shaderProjectionMatrix: projectionMatrix };
  }

  private pickTargets(items: readonly RenderItem[]): Parameters<EditorShell["runtime"]["setPickTargets"]>[0] {
    const bounds = new Map<string, { min: [number, number, number]; max: [number, number, number] }>();
    for (const item of items) {
      const id = item.userData?.editorNodeId;
      if (typeof id !== "string") continue;
      const current = bounds.get(id) ?? { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
      for (const point of itemWorldBoundsCorners(item)) for (let axis = 0; axis < 3; axis += 1) {
        current.min[axis] = Math.min(current.min[axis]!, point[axis]! - 1e-5);
        current.max[axis] = Math.max(current.max[axis]!, point[axis]! + 1e-5);
      }
      bounds.set(id, current);
    }
    return [...bounds].flatMap(([id, box]) => {
      const node = this.shell.scene.getNodeById(id);
      return node ? [{ id, node, bounds: box }] : [];
    });
  }

  diagnosticsSnapshot(): RenderDeviceDiagnostics | undefined {
    return this.diagnostics;
  }

  /** Avoid presenting the previous successful capture after viewport preparation fails. */
  frameInspectionSource(): FrameInspectionSource | null {
    const renderer = this.renderer;
    if (!renderer) return null;
    const failure = this.inspectionFailure;
    if (!failure) return renderer;
    return {
      getDiagnostics: () => ({
        ...renderer.getDiagnostics(),
        drawCalls: Number.NaN,
        triangles: Number.NaN,
        lastError: failure
      })
    };
  }

  override dispose(): void {
    if (this.disposed) return;
    if (this.animationFrame !== undefined && typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.animationFrame);
    this.animationFrame = undefined;
    this.stopInspectionPoll();
    super.dispose();
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

  private pickPrimaryTarget(clientX: number, clientY: number): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = (clientX - rect.left) / rect.width * 2 - 1;
    const y = 1 - (clientY - rect.top) / rect.height * 2;
    const inverse = invertMat4(this.camera().viewProjectionMatrix);
    const near = homogeneousPoint(inverse, [x, y, -1]);
    const far = homogeneousPoint(inverse, [x, y, 1]);
    if (!near || !far) return;
    const origin = new Vector3(...near);
    const hit = this.shell.runtime.pick(new Ray(origin, new Vector3(...far).subtract(origin)));
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

  private drawOverlay(selected: SceneNode | undefined, items: readonly RenderItem[], viewProjection: Mat4): void {
    const context = this.overlayCanvas.getContext("2d");
    if (!context) return;
    const width = this.overlayCanvas.width;
    const height = this.overlayCanvas.height;
    context.save();
    context.clearRect(0, 0, width, height);
    // Draw only editor guides over the actual renderer; scene objects remain
    // the renderer's geometry rather than painted stand-ins.
    context.strokeStyle = "rgba(110, 128, 150, 0.35)";
    context.lineWidth = 1;
    for (let line = -10; line <= 10; line += 1) {
      for (const [a, b] of [
        [[line, 0, -10], [line, 0, 10]],
        [[-10, 0, line], [10, 0, line]]
      ] as const) {
        const from = screenPoint(viewProjection, a, width, height);
        const to = screenPoint(viewProjection, b, width, height);
        if (!from || !to) continue;
        context.beginPath(); context.moveTo(...from); context.lineTo(...to); context.stroke();
      }
    }
    if (selected) {
      const corners = items.filter((item) => item.userData?.editorNodeId === selected.id)
        .flatMap(itemWorldBoundsCorners)
        .map((point) => screenPoint(viewProjection, point, width, height))
        .filter((point): point is [number, number] => point !== null);
      if (corners.length) {
        const xs = corners.map((point) => point[0]);
        const ys = corners.map((point) => point[1]);
        const left = Math.min(...xs); const right = Math.max(...xs);
        const top = Math.min(...ys); const bottom = Math.max(...ys);
        context.strokeStyle = "#f8d65a";
        context.lineWidth = 2;
        context.strokeRect(left, top, Math.max(1, right - left), Math.max(1, bottom - top));
        context.fillStyle = "#f8fafc";
        context.font = '13px "Whitney", "Whitney Fallback", sans-serif';
        context.fillText(selected.name, left, Math.max(14, top - 6));
      }
    }
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
    this.zoom = 1.25;
    this.shell.scene.updateWorldTransforms();
    this.panX = round(-node.transform.worldMatrix[12] * 120 * this.zoom);
    this.panY = round(node.transform.worldMatrix[13] * 90 * this.zoom);
    this.focusZ = node.transform.worldMatrix[14];
  }

  private resetView(): void {
    this.orbitYaw = 0;
    this.orbitPitch = 20;
    this.panX = 0;
    this.panY = 0;
    this.focusZ = 0;
    this.zoom = 1;
  }

  private diagnosticResources(selected: SceneNode | undefined): readonly EditorDiagnosticsResource[] {
    const nodeResources = this.shell.project.scene.nodes.map((node) => {
      const animationError = this.modelInstances.get(node.id)?.error;
      return {
        id: node.id,
        label: node.name,
        kind: "scene-node" as const,
        status: animationError ? "warning" as const : "ok" as const,
        detail: animationError ?? (node.physics.body === "none" ? "Renderable authoring node" : `${node.physics.body} physics body`)
      };
    });
    const assetResources = this.shell.project.assets.map((asset) => {
      const mesh = this.meshAssets.get(asset.id);
      return {
        id: asset.id,
        label: asset.name,
        kind: "asset" as const,
        status: mesh?.error ? "error" as const : mesh && !mesh.resources || asset.diagnostics.length > 0 ? "warning" as const : "ok" as const,
        detail: mesh?.error ?? (mesh && !mesh.resources ? "Loading glTF render resources" : asset.diagnostics.join("; ") || asset.preview)
      };
    });
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
        detail: shaderStatus === "ok" ? "Selected material inputs are valid" : "Select a node with a valid hex base color"
      }
    ];
  }
}

function itemTriangleCount(item: RenderItem): number {
  if (item.geometry.topology !== "triangles") return 0;
  const count = item.drawRange?.count ?? item.geometry.drawRange?.count ?? item.geometry.indexBuffer?.count ?? item.geometry.vertexBuffer.vertexCount;
  return Math.floor(count / 3) * (item.instanceTransforms ? item.instanceTransforms.length / 16 : 1);
}

function matrixTuple(matrix: Float32Array | readonly number[]): Mat4 {
  if (matrix.length !== 16) throw new Error("A render item matrix must have 16 components.");
  return [matrix[0]!, matrix[1]!, matrix[2]!, matrix[3]!, matrix[4]!, matrix[5]!, matrix[6]!, matrix[7]!, matrix[8]!, matrix[9]!, matrix[10]!, matrix[11]!, matrix[12]!, matrix[13]!, matrix[14]!, matrix[15]!];
}

function itemWorldBoundsCorners(item: RenderItem): [number, number, number][] {
  const model = item.modelMatrix ? matrixTuple(item.modelMatrix) : matrixTuple([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const matrices = item.instanceTransforms
    ? Array.from({ length: item.instanceTransforms.length / 16 }, (_, index) => multiplyMat4(model, matrixTuple(item.instanceTransforms!.slice(index * 16, index * 16 + 16))))
    : [model];
  const { min, max } = item.geometry.bounds;
  return matrices.flatMap((matrix) => [min[0], max[0]].flatMap((x) =>
    [min[1], max[1]].flatMap((y) => [min[2], max[2]].map((z) => transformPoint(matrix, [x, y, z])))));
}

function homogeneousPoint(matrix: Mat4, point: readonly [number, number, number]): [number, number, number] | null {
  const [x, y, z] = point;
  const w = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
  if (!Number.isFinite(w) || Math.abs(w) < 1e-10) return null;
  return [
    (matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12]) / w,
    (matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13]) / w,
    (matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]) / w
  ];
}

function screenPoint(matrix: Mat4, point: readonly [number, number, number], width: number, height: number): [number, number] | null {
  const w = matrix[3] * point[0] + matrix[7] * point[1] + matrix[11] * point[2] + matrix[15];
  if (w <= 1e-10) return null;
  const projected = homogeneousPoint(matrix, point);
  return projected ? [(projected[0] + 1) * width / 2, (1 - projected[1]) * height / 2] : null;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
