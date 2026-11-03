import { Renderer } from "@aura3d/engine/renderer";
import type { RenderDeviceDiagnostics } from "@aura3d/rendering";
import { invertMat4, lookAtMat4, multiplyMat4, perspectiveMat4, type Mat4 } from "@aura3d/scene";
import { ProjectSerializer, type EditorProject } from "../project/ProjectSerializer";
import { ProjectSceneRuntime, type ProjectSceneHost } from "./ProjectSceneRuntime";

interface ExportCamera {
  readonly viewMatrix: Mat4;
  readonly projectionMatrix: Mat4;
  readonly viewProjectionMatrix: Mat4;
  readonly shaderViewMatrix: Mat4;
  readonly shaderProjectionMatrix: Mat4;
}

interface ExportStartOptions {
  readonly canvas: HTMLCanvasElement;
  readonly status: HTMLElement;
  readonly projectPath: string;
  readonly globalName: string;
}

/** A play-mode scene backed by the same resources and graph materials as the editor viewport. */
export class ExportedProjectRuntime {
  private readonly scene;
  private readonly core: ProjectSceneRuntime;
  private graphDirty = true;
  private graphErrors: readonly string[] = [];
  private readonly messages: string[] = [];
  private disposed = false;

  constructor(readonly project: EditorProject, private readonly renderer: Renderer) {
    this.scene = new ProjectSerializer().buildScene(project).scene;
    const host: ProjectSceneHost = {
      project, scene: this.scene, runtime: { mode: "play" },
      notifyShaderTexturesChanged: () => { this.graphDirty = true; },
      addConsoleMessage: (_level, message) => { this.messages.push(redact(message)); }
    };
    this.core = new ProjectSceneRuntime(host);
    this.core.setRenderer(renderer);
  }

  frame(delta: number, width: number, height: number): { readonly diagnostics: RenderDeviceDiagnostics; readonly loading: readonly string[]; readonly errors: readonly string[]; readonly animating: boolean } {
    if (this.disposed) throw new Error("The exported scene is disposed.");
    let items = this.core.prepareFrame(delta);
    if (this.graphDirty) {
      this.graphDirty = false;
      this.graphErrors = (this.project.shaderGraphs ?? []).flatMap((record) => {
        if (!record.materialId) return [`${record.name}: graph has no target node.`];
        const result = this.core.setShaderGraph(record.materialId, record.graph, record.bindings ?? {});
        return result.ok ? [] : result.diagnostics.map((message) => `${record.name}: ${redact(message)}`);
      });
      // Graph materials are installed after assets are scheduled; submit the
      // current materials in this frame without advancing any mixer twice.
      items = this.core.prepareFrame(0);
    }
    const assets = this.core.assetState();
    const camera = this.camera(width, height);
    const diagnostics = this.renderer.render({ renderItems: items, collectedLights: this.core.collectSceneLights(), cameraPolicy: "require" }, camera);
    return {
      diagnostics,
      loading: assets.loading,
      errors: [...assets.errors, ...(assets.loading.length ? [] : this.graphErrors), ...this.messages],
      animating: this.core.hasActiveAnimations()
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.core.dispose();
    this.scene.root.dispose();
  }

  private camera(width: number, height: number): ExportCamera {
    const authored = this.project.scene.nodes.find((node) => node.camera.enabled);
    const cameraNode = authored ? this.scene.getNodeById(authored.id) : undefined;
    const viewMatrix = cameraNode ? invertMat4(cameraNode.transform.worldMatrix) : lookAtMat4([0, 1.368, 3.759], [0, 0, 0], [0, 1, 0]);
    const fieldOfView = authored?.camera.fov ?? 60;
    if (!Number.isFinite(fieldOfView) || fieldOfView <= 0 || fieldOfView >= 180) throw new Error("Export camera field of view must be between 0 and 180 degrees.");
    const projectionMatrix = perspectiveMat4(fieldOfView * Math.PI / 180, Math.max(1, width) / Math.max(1, height), 0.1, 1000);
    return { viewMatrix, projectionMatrix, viewProjectionMatrix: multiplyMat4(projectionMatrix, viewMatrix), shaderViewMatrix: viewMatrix, shaderProjectionMatrix: projectionMatrix };
  }
}

export async function startExportedProject(options: ExportStartOptions): Promise<void> {
  const controller = new AbortController();
  let renderer: Renderer | undefined;
  let runtime: ExportedProjectRuntime | undefined;
  let frameId: number | undefined;
  let lastTime: number | undefined;
  let interactions = 0;
  let selectedIndex = 0;
  let stopped = false;
  let project: EditorProject;
  const global = window as unknown as Record<string, unknown>;
  const onClick = (): void => { interactions += 1; options.canvas.focus(); };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if (project.scene.nodes.length) selectedIndex = (selectedIndex + (event.key === "ArrowRight" ? 1 : -1) + project.scene.nodes.length) % project.scene.nodes.length;
    interactions += 1;
    event.preventDefault();
  };
  const onPageHide = (event: PageTransitionEvent): void => { if (!event.persisted) stop(); };
  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    controller.abort();
    if (frameId !== undefined) cancelAnimationFrame(frameId);
    options.canvas.removeEventListener("click", onClick);
    options.canvas.removeEventListener("keydown", onKey);
    window.removeEventListener("pagehide", onPageHide);
    if (runtime) runtime.dispose();
    else renderer?.dispose();
  };
  window.addEventListener("pagehide", onPageHide);
  try {
    const response = await fetch(options.projectPath, { signal: controller.signal });
    if (!response.ok) throw new Error(`Unable to load project (${response.status}).`);
    project = new ProjectSerializer().parse(await response.text());
    if (stopped) return;
    const created = await Renderer.create({ backend: "webgl2", canvas: options.canvas, width: options.canvas.width, height: options.canvas.height, clearColor: [0.07, 0.1, 0.15, 1] });
    if (stopped) { created.dispose(); return; }
    renderer = created;
    runtime = new ExportedProjectRuntime(project, renderer);
  } catch (error) {
    const wasStopped = stopped;
    stop();
    if (!wasStopped) throw error;
    return;
  }
  options.canvas.tabIndex = 0;
  options.canvas.addEventListener("click", onClick);
  options.canvas.addEventListener("keydown", onKey);
  const frame = (time: number): void => {
    if (stopped) return;
    try {
      const delta = lastTime === undefined ? 0 : Math.min(0.1, Math.max(0, (time - lastTime) / 1000));
      lastTime = time;
      const result = runtime!.frame(delta, options.canvas.width, options.canvas.height);
      const state = result.errors.length ? "error" : result.loading.length ? "loading" : "ready";
      options.status.textContent = state === "ready" ? `Loaded ${project.metadata.name}: ${project.scene.nodes.length} nodes` : state === "loading" ? `Loading ${result.loading.join(", ")}…` : result.errors.join("; ");
      const configuredBehaviors = project.scene.nodes.filter((node) => node.script.enabled && node.script.behavior).map((node) => ({ node: node.name, behavior: node.script.behavior }));
      const editedMaterials = project.scene.nodes.map((node) => ({ node: node.name, name: node.material.name, baseColor: node.material.baseColor, metallic: node.material.metallic, roughness: node.material.roughness, textureSlots: node.material.textureSlots }));
      const operations = project.metadata.provenance?.operations ?? [];
      global[options.globalName] = {
        status: state, renderer: "aura3d-webgl2", errors: result.errors, projectName: project.metadata.name,
        nodeCount: project.scene.nodes.length, assetCount: project.assets.length, provenanceHash: project.metadata.provenance?.evidenceHash ?? null,
        importedAssetNames: project.assets.filter((asset) => asset.type === "gltf").map((asset) => asset.name), editedMaterials, configuredBehaviors,
        usesPlayExportPath: operations.some((entry) => entry.id === "static-export") && operations.some((entry) => entry.id === "static-export-runtime"),
        playBehaviorActive: result.animating, physicsOrScripting: false, selectedNodeName: project.scene.nodes[selectedIndex]?.name ?? null,
        interactions, interactive: true, diagnostics: { drawCalls: result.diagnostics.drawCalls, scriptTickCount: 0 },
        featureEvidence: { editedMaterials, configuredBehaviors, usesEditorCode: false },
        knownLimits: ["Physics, scripts, audio, and particle emitters are stored in the project but are not executed by this runtime."]
      };
      frameId = requestAnimationFrame(frame);
    } catch (error) {
      const message = redact(error instanceof Error ? error.message : "Scene rendering failed.");
      options.status.textContent = message;
      global[options.globalName] = { status: "error", errors: [message] };
      stop();
    }
  };
  frameId = requestAnimationFrame(frame);
}

function redact(value: string): string {
  return value.replace(/\b(?:https?|wss?):\/\/[^\s)\]"']+/gi, "[url]").replace(/data:[^\s)\]"']+/gi, "[data]");
}

(globalThis as typeof globalThis & { __AURA3D_EXPORT_START__?: typeof startExportedProject }).__AURA3D_EXPORT_START__ = startExportedProject;
