import { EditorPluginHost, EditorRuntime, PlayModeBridge, PrefabRegistry, ReparentNodeCommand, ShaderGraphModel, type EditorPickingEvidenceSnapshot, type EditorStateSnapshot, type EditorStateStorage, type GizmoSettings, type TimelineRuntimeAnimationApplication, type TimelineSnapshot } from "@aura3d/editor-runtime";
import { FrameInspector, ShaderGraphInspector, type FrameInspectionSource, type ShaderGraphInspection } from "@aura3d/debug";
import type { ShaderGraphDocument, ShaderGraphMaterialOutput, ShaderGraphNode, ShaderGraphOperation, ShaderGraphValueType } from "@aura3d/rendering/shader-graph";
import { Scene, SceneNode, type Mat4 } from "@aura3d/scene";
import { StaticProjectExporter, type ExportRuntimeBundle, type StaticExportResult } from "./export/StaticProjectExporter";
import { ImportSettingsPanel } from "./import/ImportSettingsPanel";
import { AssetBrowserPanel } from "./panels/AssetBrowserPanel";
import { ConsolePanel } from "./panels/ConsolePanel";
import { HierarchyPanel } from "./panels/HierarchyPanel";
import { InspectorPanel } from "./panels/InspectorPanel";
import { MaterialPanel } from "./panels/MaterialPanel";
import { ProfilerPanel } from "./panels/ProfilerPanel";
import { ShaderGraphPanel, validateGraphUniformValue, type ShaderGraphPanelDiagnostic, type ShaderGraphPanelOperation, type ShaderGraphPanelResourceKind, type ShaderGraphPanelState } from "./panels/ShaderGraphPanel";
import { TextureInspectorPanel, type InspectableTexture } from "./panels/TextureInspectorPanel";
import { TimelinePanel } from "./panels/TimelinePanel";
import { VisualScriptPanel, type VisualScriptPanelSnapshot } from "./panels/VisualScriptPanel";
import { createProjectNode, type EditorAssetRecord, type EditorImportSettings, type EditorProject, type EditorProjectNode, type EditorProjectPrefab, ProjectSerializer } from "./project/ProjectSerializer";
import { EditorViewport, embeddedTextureAssetId } from "./viewport/EditorViewport";
import { graphSampledTextureKind } from "./export/ProjectSceneRuntime";

export interface EditorAppState {
  readonly status: "booting" | "ready" | "error";
  readonly mode: string;
  readonly selectedNodeId: string | null;
  readonly selectedNodeIds: readonly string[];
  readonly nodeCount: number;
  readonly assetCount: number;
  readonly prefabCount: number;
  readonly savedProjectJson: string;
  readonly exportedFileCount: number;
  readonly activeTool: string;
  readonly viewMode: string;
  readonly viewportCamera: {
    readonly orbitYaw: number;
    readonly orbitPitch: number;
    readonly pan: readonly [number, number];
    readonly zoom: number;
    readonly focusedNodeId: string | null;
    readonly gizmo: GizmoSettings | null;
  };
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly dirty: boolean;
  readonly pluginPanels: readonly string[];
  readonly consoleCount: number;
  readonly editorState: EditorStateSnapshot;
  readonly timeline: {
    readonly playback: "playing" | "paused";
    readonly scrubTime: number;
    readonly loop: boolean;
    readonly assetCount: number;
    readonly selectedClipName: string | null;
    readonly selectedClipDuration: number;
    readonly model: TimelineSnapshot;
  };
  readonly visualScripting: VisualScriptPanelSnapshot;
  readonly claimBoundary: {
    readonly allowed: string;
    readonly blocked: readonly string[];
  };
  readonly editorPicking: EditorPickingEvidenceSnapshot;
  readonly featureEvidence: {
    readonly externalParityStarterAvailable: boolean;
    readonly importedAssets: number;
    readonly editedMaterials: number;
    readonly lights: number;
    readonly cameras: number;
    readonly physicsBodies: number;
    readonly scripts: number;
    readonly oldBranchGpuPickingPort: boolean;
    readonly gpuPickingColorIdEncoding: boolean;
    readonly gpuPickingRaycastFallback: boolean;
    readonly oldBranchVisualScriptingPort: boolean;
    readonly editorVisibleVisualGraph: boolean;
    readonly visualScriptingCatalogExecution: boolean;
    readonly staticExportWithoutEditorCode: boolean;
  };
  readonly error?: string;
}

export interface EditorConsoleMessage {
  readonly level: "info" | "warning" | "error";
  readonly text: string;
  readonly at: string;
}

type ShaderBinding = { readonly kind: "uniform"; readonly value: number | boolean | readonly number[] } | { readonly kind: "texture"; readonly assetId: string };
interface MaterialGraphRecord {
  readonly id: string;
  readonly name: string;
  readonly materialId: string;
  readonly graph: ShaderGraphDocument;
  readonly bindings: Readonly<Record<string, ShaderBinding>>;
}
interface GraphProjectData {
  readonly shaderGraphs?: readonly MaterialGraphRecord[];
  readonly editor?: EditorProject["editor"];
}
interface GraphViewport {
  setShaderGraph?(materialId: string, graph: ShaderGraphDocument | null, bindings: Readonly<Record<string, ShaderBinding>>): { readonly ok: boolean; readonly diagnostics: readonly string[] };
  clearShaderGraphs?(): void;
  resetSceneInstances?(): void;
  getInspectableTextures?(): readonly InspectableTexture[];
  textureInspectionState?(): { readonly status: "loading" | "ready" | "error"; readonly message?: string };
  textureResourceState?(id: string): import("./panels/TextureInspectorPanel").TextureResourceState | null;
  frameInspectionSource?(): FrameInspectionSource | null;
}

const GRAPH_OPERATIONS: readonly ShaderGraphPanelOperation[] = [
  { op: "constant", label: "Constant", inputCount: 0, types: ["f32", "i32", "u32", "bool", "vec2", "vec3", "vec4"] },
  { op: "input", label: "Built-in input", inputCount: 0, types: ["f32", "vec2", "vec3"] },
  { op: "uniform", label: "Uniform", inputCount: 0, types: ["f32", "i32", "u32", "bool", "vec2", "vec3", "vec4"] },
  { op: "textureSample", label: "Sample texture", inputCount: 1, types: ["vec4"] },
  { op: "textureLoad", label: "Load depth pixel", inputCount: 1, types: ["f32"] },
  { op: "construct", label: "Construct vector", inputCount: 1, types: ["vec2", "vec3", "vec4"] },
  { op: "swizzle", label: "Swizzle", inputCount: 1, types: ["f32", "vec2", "vec3", "vec4"] },
  ...["add", "sub", "mul", "div", "min", "max", "pow"].map((op) => ({ op, label: op, inputCount: 2, types: ["f32", "vec2", "vec3", "vec4"] })),
  ...["sin", "cos", "abs", "normalize"].map((op) => ({ op, label: op, inputCount: 1, types: op === "normalize" ? ["vec2", "vec3", "vec4"] : ["f32", "vec2", "vec3", "vec4"] })),
  { op: "length", label: "Length", inputCount: 1, types: ["f32"] },
  { op: "dot", label: "Dot product", inputCount: 2, types: ["f32"] },
  { op: "cross", label: "Cross product", inputCount: 2, types: ["vec3"] },
  ...["mix", "clamp", "select"].map((op) => ({ op, label: op, inputCount: 3, types: ["f32", "vec2", "vec3", "vec4"] })),
  ...["less", "greater", "equal"].map((op) => ({ op, label: op, inputCount: 2, types: ["bool"] }))
];

declare global {
  interface Window {
    __AURA3D_EDITOR_APP__?: {
      getState(): EditorAppState;
      shell: EditorShell;
    };
  }
}

/**
 * Preview only the viewport-owned glTF instance, never the authored project
 * scene. The base viewport remains responsible for loading and disposing it.
 */
class TimelineEditorViewport extends EditorViewport {
  private timelinePreview?: { readonly nodeId: string; readonly application: TimelineRuntimeAnimationApplication };
  private previewedInstance?: object;
  private previewError?: string;

  setTimelinePreview(nodeId: string, application: TimelineRuntimeAnimationApplication): boolean {
    const previous = this.timelinePreview;
    if (previous && (previous.nodeId !== nodeId || previous.application.assetId !== application.assetId || previous.application.clipName !== application.clipName)) {
      this.clearTimelinePreview();
    }
    this.timelinePreview = { nodeId, application };
    return this.applyTimelinePreview();
  }

  clearTimelinePreview(): void {
    const previous = this.timelinePreview;
    const instance = this.previewedInstance;
    this.timelinePreview = undefined;
    this.previewedInstance = undefined;
    this.previewError = undefined;
    if (!this.disposed && previous && instance && this.modelInstances.get(previous.nodeId) === instance) {
      // Restores the imported rest pose and original mixer configuration, using
      // the viewport's own resource disposal rather than editing project state.
      this.resetSceneInstances();
    }
  }

  timelineClipDuration(nodeId: string, assetId: string, clipName: string): number | undefined {
    const instance = this.timelineInstance(nodeId, assetId);
    if (!instance) return undefined;
    try {
      const duration = instance.mixer.getAction(clipName)?.clip.duration;
      return duration !== undefined && Number.isFinite(duration) && duration >= 0 ? duration : undefined;
    } catch {
      // An ambiguous clip is reported by the actual preview application.
      return undefined;
    }
  }

  override render(): void {
    if (this.disposed) return;
    super.render();
    const preview = this.timelinePreview;
    if (!preview || this.shell.runtime.mode !== "edit" || !preview.application.assetId) return;
    const instance = this.timelineInstance(preview.nodeId, preview.application.assetId);
    // The asset may have finished loading, or the viewport may have replaced
    // its instance during this draw. Apply before submitting the corrected frame.
    if (instance && instance !== this.previewedInstance && this.applyTimelinePreview()) super.render();
  }

  private timelineInstance(nodeId: string, assetId: string) {
    const node = this.shell.project.scene.nodes.find((candidate) => candidate.id === nodeId);
    const entry = this.meshAssets.get(assetId);
    const instance = this.modelInstances.get(nodeId);
    if (!node || !node.mesh.enabled || node.mesh.primitive !== "imported" || node.mesh.assetId !== assetId
      || !entry?.resources || !instance || instance.assetKey !== entry.key
      || instance.configuration !== JSON.stringify([entry.key, node.animation.enabled, node.animation.clip, node.animation.loop])) return undefined;
    return instance;
  }

  private applyTimelinePreview(): boolean {
    const preview = this.timelinePreview;
    const assetId = preview?.application.assetId;
    if (!preview || !assetId || this.disposed || this.shell.runtime.mode !== "edit") return false;
    const instance = this.timelineInstance(preview.nodeId, assetId);
    if (!instance) {
      const error = this.meshAssets.get(assetId)?.error;
      if (error) this.reportPreviewError(`Unable to load the selected animation asset: ${error}`);
      return false;
    }
    this.previewedInstance = instance;
    try {
      const action = instance.mixer.getAction(preview.application.clipName);
      if (!action) throw new Error(`Clip "${preview.application.clipName}" is not present on the selected model.`);
      const duration = action.clip.duration;
      if (!Number.isFinite(duration) || duration < 0) throw new Error("The selected clip has an invalid duration.");
      const result = instance.mixer.applyClipSamples([{
        clipName: preview.application.clipName,
        time: Math.min(duration, Math.max(0, preview.application.assetTime)),
        weight: 1
      }]);
      if (result.applyResult.tracksApplied === 0) throw new Error(`Clip "${preview.application.clipName}" did not bind any tracks to the selected model.`);
      this.previewError = undefined;
      return true;
    } catch (error) {
      this.reportPreviewError(error instanceof Error ? error.message : "The selected animation could not be applied.");
      return false;
    }
  }

  private reportPreviewError(message: string): void {
    if (message === this.previewError) return;
    this.previewError = message;
    this.shell.reportTimelinePreviewIssue(message);
  }
}

export class EditorShell {
  readonly runtime = new EditorRuntime({ stateStorage: browserEditorStateStorage() });
  readonly serializer = new ProjectSerializer();
  readonly plugins = new EditorPluginHost();
  readonly exporter: StaticProjectExporter;
  readonly prefabRegistry = new PrefabRegistry<EditorProjectNode>();
  scene: Scene;
  project: EditorProject;
  viewport?: EditorViewport;
  frameCount = 0;

  private readonly root: HTMLElement;
  private readonly frameInspectorElement = document.createElement("section");
  private readonly orphanedGraphs = new Map<string, MaterialGraphRecord>();
  private readonly graphFeedback = new Map<string, { readonly status: ShaderGraphPanelState["status"]; readonly diagnostics: readonly ShaderGraphPanelDiagnostic[]; readonly inspection?: ShaderGraphInspection }>();
  private readonly lastAttemptedGraphs = new Map<string, string>();
  private graphTextureRevision = 0;
  private disposed = false;
  private readonly onWindowShortcut = (event: KeyboardEvent): void => this.handleShortcut(event);
  private readonly onPageHide = (event: PageTransitionEvent): void => { if (!event.persisted) this.dispose(); };
  private readonly panels: {
    hierarchy: HierarchyPanel;
    inspector: InspectorPanel;
    assets: AssetBrowserPanel;
    importSettings: ImportSettingsPanel;
    profiler: ProfilerPanel;
    timeline: TimelinePanel;
    material: MaterialPanel;
    visualScript: VisualScriptPanel;
    shaderGraph: ShaderGraphPanel;
    textures: TextureInspectorPanel;
    console: ConsolePanel;
  };
  private savedProjectJson = "";
  private exportedProject?: StaticExportResult;
  private exportInProgress = false;
  private exportController?: AbortController;
  private readonly exportUrls: string[] = [];
  private status: EditorAppState["status"] = "booting";
  private error: string | undefined;
  private dirty = false;
  private readonly messages: EditorConsoleMessage[] = [];

  constructor(root: HTMLElement, options: { readonly loadExportRuntime?: () => Promise<ExportRuntimeBundle> } = {}) {
    this.root = root;
    this.exporter = new StaticProjectExporter(options.loadExportRuntime);
    this.frameInspectorElement.className = "panel frame-inspector-panel";
    this.frameInspectorElement.setAttribute("aria-label", "Frame inspector");
    this.project = this.serializer.createDefaultProject();
    this.syncPrefabRegistry();
    const built = this.serializer.buildScene(this.project);
    this.scene = built.scene;
    this.runtime.select(["node-hero"]);
    this.plugins.register({
      id: "aura3d.default-authoring",
      name: "Default authoring tools",
      panels: [
        { id: "hierarchy", title: "Hierarchy", order: 1 },
        { id: "inspector", title: "Inspector", order: 2 },
        { id: "assets", title: "Assets", order: 3 },
        { id: "material", title: "Material", order: 4 },
        { id: "profiler", title: "Profiler", order: 5 },
        { id: "visual-script", title: "Visual Script", order: 6 },
        { id: "console", title: "Console", order: 7 }
      ],
      tools: [{ id: "select", title: "Select" }, { id: "move", title: "Move" }, { id: "rotate", title: "Rotate" }, { id: "scale", title: "Scale" }],
      importers: [{ id: "gltf", label: "glTF 2.0", extensions: [".gltf", ".glb"] }],
      scriptingNodes: [{ id: "spin-behavior", title: "Spin Behavior", category: "Transform" }]
    });
    this.panels = {
      hierarchy: new HierarchyPanel(this),
      inspector: new InspectorPanel(this),
      assets: new AssetBrowserPanel(this),
      importSettings: new ImportSettingsPanel(this),
      profiler: new ProfilerPanel(this),
      timeline: new TimelinePanel(this),
      material: new MaterialPanel(this),
      visualScript: new VisualScriptPanel(this),
      shaderGraph: new ShaderGraphPanel({
        state: () => this.shaderGraphState(),
        operations: () => GRAPH_OPERATIONS,
        inputPorts: (id) => this.currentGraphModel()?.inputPorts(id) ?? [],
        canConnect: (from, to, index) => this.currentGraphModel()?.canConnect(from, to, index) ?? false,
        create: () => this.createShaderGraph(),
        addNode: (op, type) => this.addShaderGraphNode(op, type),
        removeNode: (id) => this.editShaderGraph((model) => model.removeNode(id)),
        setValue: (id, value) => this.editShaderGraph((model) => model.updateNode(id, { value: value as ShaderGraphNode["value"] })),
        setField: (id, field, value) => this.editShaderGraph((model) => model.updateNode(id, { [field]: value })),
        setResource: (name, kind, type) => this.setShaderGraphResource(name, kind, type),
        removeResource: (name) => this.removeShaderGraphResource(name),
        setBinding: (name, value) => this.setShaderGraphBinding(name, value),
        importTexture: (file) => this.importGraphTexture(file),
        connect: (id, input, from) => this.editShaderGraph((model) => {
          if (from) model.connect(from, id, input);
          else if (model.inputPorts(id).some((port) => port.index === input && port.connectedNodeId)) model.disconnect(id, input);
        }),
        setOutput: (channel, id) => this.editShaderGraph((model) => model.setOutput(channel as ShaderGraphMaterialOutput, id)),
        undo: () => this.undoShaderGraph(),
        redo: () => this.redoShaderGraph(),
        compile: () => this.compileSelectedShaderGraph()
      }),
      textures: new TextureInspectorPanel({
        getTextures: () => this.graphViewport()?.getInspectableTextures?.() ?? [],
        getSelectedTextureId: () => this.graphProjectData().editor?.selectedResourceIds?.[0] ?? null,
        selectTexture: (id) => this.selectTexture(id),
        getState: () => !this.viewport ? { status: "loading" } : this.graphViewport()?.textureInspectionState?.()
          ?? { status: "unsupported", message: "This renderer does not expose live texture handles." },
        getResourceState: (id) => this.graphViewport()?.textureResourceState?.(id) ?? null
      }),
      console: new ConsolePanel(this)
    };
  }

  async mount(): Promise<void> {
    this.root.innerHTML = `
      <header class="editor-topbar">
        <strong>Aura3D Editor</strong>
        <select data-action="command-menu" aria-label="Command menu">
          <option value="">Command</option>
          <option value="new-project">New Project</option>
          <option value="new-external-parity-starter">ExternalParity Starter Project</option>
          <option value="save-project">Save Project</option>
          <option value="load-project">Load Project</option>
          <option value="undo">Undo</option>
          <option value="redo">Redo</option>
          <option value="duplicate-node">Duplicate Node</option>
          <option value="create-prefab">Create Prefab</option>
          <option value="instantiate-prefab">Instantiate Prefab</option>
          <option value="toggle-play">Toggle Play</option>
          <option value="export-project">Export Project</option>
        </select>
        <button data-action="new-project">New</button>
        <button data-action="new-external-parity-starter">ExternalParity Starter</button>
        <button data-action="undo">Undo</button>
        <button data-action="redo">Redo</button>
        <button data-action="duplicate-node">Duplicate</button>
        <button data-action="create-prefab" aria-label="Prefab from Selection">Prefab</button>
        <button data-action="instantiate-prefab">Instantiate Prefab</button>
        <button data-action="save-project">Save</button>
        <button data-action="load-project">Load</button>
        <button data-action="toggle-play">Play</button>
        <button data-action="export-project">Export</button>
        <span data-role="status">Booting</span>
      </header>
      <main class="editor-layout">
        <aside class="left-rail"></aside>
        <section class="center-stage"></section>
        <aside class="right-rail"></aside>
      </main>
      <textarea class="project-buffer" data-role="project-buffer" aria-label="Project JSON buffer"></textarea>
      <pre class="export-summary" data-role="export-summary"></pre>
    `;
    this.root.querySelector(".left-rail")?.append(this.panels.hierarchy.element, this.panels.assets.element, this.panels.importSettings.element);
    this.viewport = new TimelineEditorViewport(this);
    this.root.querySelector(".center-stage")?.append(this.viewport.element);
    this.root.querySelector(".right-rail")?.append(this.panels.inspector.element, this.panels.material.element, this.panels.shaderGraph.element, this.panels.textures.element, this.frameInspectorElement, this.panels.timeline.element, this.panels.visualScript.element, this.panels.profiler.element, this.panels.console.element);
    this.root.addEventListener("click", (event) => {
      const action = (event.target as HTMLElement).dataset.action;
      void this.runCommand(action);
    });
    this.root.addEventListener("change", (event) => {
      const target = event.target as HTMLSelectElement;
      if (target.dataset.action === "command-menu" && target.value) {
        void this.runCommand(target.value);
        target.value = "";
      }
    });
    window.addEventListener("keydown", this.onWindowShortcut);
    window.addEventListener("pagehide", this.onPageHide);
    await this.viewport.initialize();
    if (this.disposed) return;
    this.addConsoleMessage("info", "Editor shell initialized with WebGL2 viewport.");
    this.saveProject();
    this.status = "ready";
    this.refresh();
  }

  refresh(): void {
    if (this.disposed) return;
    this.frameCount += 1;
    this.panels.hierarchy.render();
    this.panels.assets.render();
    this.panels.importSettings.render();
    this.panels.inspector.render();
    this.panels.material.render();
    this.panels.timeline.render();
    this.panels.visualScript.render();
    this.syncShaderGraphSelection();
    this.viewport?.render();
    if (this.panels.timeline.syncLoadedClipDuration()) this.viewport?.render();
    this.panels.shaderGraph.render();
    this.panels.textures.render();
    this.renderFrameInspector();
    this.panels.profiler.render();
    this.panels.console.render();
    const status = this.root.querySelector<HTMLElement>('[data-role="status"]');
    if (status) {
      status.textContent = `${this.dirty ? "Unsaved" : "Saved"} | ${this.runtime.mode} | ${this.project.scene.nodes.length} nodes | ${this.project.assets.length} assets | ${this.project.prefabs.length} prefabs`;
    }
  }

  private graphProjectData(): GraphProjectData {
    return this.project as EditorProject & GraphProjectData;
  }

  private graphViewport(): (EditorViewport & GraphViewport) | undefined {
    return this.viewport as (EditorViewport & GraphViewport) | undefined;
  }

  private currentGraph(): MaterialGraphRecord | undefined {
    const node = this.selectedProjectNode();
    const record = node ? this.graphProjectData().shaderGraphs?.find((entry) => entry.materialId === node.id) : undefined;
    return record ? { ...record, bindings: record.bindings ?? {} } : undefined;
  }

  private currentGraphModel(): ShaderGraphModel | undefined {
    const record = this.currentGraph();
    return record ? new ShaderGraphModel(record.graph, { historyLimit: 0 }) : undefined;
  }

  private shaderGraphState(): ShaderGraphPanelState {
    const node = this.selectedProjectNode();
    const record = this.currentGraph();
    const feedback = node ? this.graphFeedback.get(node.id) : undefined;
    const history = this.runtime.snapshot();
    return {
      graph: record ? { stage: record.graph.stage, nodes: record.graph.nodes, outputs: record.graph.outputs ?? {}, resources: record.graph.resources } : null,
      status: !node || record?.graph.stage === "compute" ? "unsupported" : record ? feedback?.status ?? "uncompiled" : "empty",
      diagnostics: feedback?.diagnostics ?? [],
      canUndo: history.canUndo,
      canRedo: history.canRedo,
      inspection: feedback?.inspection,
      bindings: Object.fromEntries(Object.entries(record?.bindings ?? {}).map(([name, binding]) => [name, binding.kind === "uniform" ? binding.value : binding.assetId])),
      textures: (this.graphViewport()?.getInspectableTextures?.() ?? []).flatMap(({ id, texture }) => {
        const kind = graphSampledTextureKind(texture);
        return kind ? [{ id, label: texture.label || id, kind }] : [];
      })
    };
  }

  private async createShaderGraph(): Promise<void> {
    const node = this.selectedProjectNode();
    if (!node) throw new Error("Select a material before creating a graph.");
    if (this.currentGraph()) return;
    const graph = new ShaderGraphModel().snapshot();
    const record: MaterialGraphRecord = { id: `material-${node.id}`, name: `${node.material.name} graph`, materialId: node.id, graph, bindings: {} };
    await this.runtime.executeCommand({
      name: "Create shader graph",
      execute: () => this.writeShaderGraph(record),
      undo: () => this.removeShaderGraph(record.materialId)
    });
    this.graphFeedback.set(node.id, { status: "uncompiled", diagnostics: [] });
    this.markDirty("Created material shader graph.");
    this.refresh();
  }

  private async addShaderGraphNode(operation: string, valueType: string): Promise<void> {
    const spec = GRAPH_OPERATIONS.find((entry) => entry.op === operation && entry.types.includes(valueType));
    if (!spec) throw new Error("Choose a supported operation and value type.");
    const graph = this.currentGraph();
    if (!graph) throw new Error("Create a graph first.");
    let number = 1;
    while (graph.graph.nodes.some((node) => node.id === `${operation}_${number}`)) number += 1;
    const op = operation as ShaderGraphOperation;
    const type = valueType as ShaderGraphValueType;
    const node: ShaderGraphNode = {
      id: `${operation}_${number}`, op, type,
      ...(op === "constant" ? { value: defaultGraphValue(type) } : {}),
      ...(op === "input" ? { name: type === "vec2" ? "uv0" : type === "vec3" ? "positionLocal" : "time" } : {}),
      ...(op === "swizzle" ? { components: type === "f32" ? "x" : type === "vec2" ? "xy" : type === "vec3" ? "xyz" : "xyzw" } : {}),
      ...(["uniform", "textureSample", "textureLoad"].includes(op) ? { resource: "" } : {})
    };
    await this.editShaderGraph((model) => model.addNode(node));
  }

  private async editShaderGraph(edit: (model: ShaderGraphModel) => void, nextBindings?: Readonly<Record<string, ShaderBinding>>): Promise<void> {
    const record = this.currentGraph();
    if (!record) throw new Error("Create a graph first.");
    const model = new ShaderGraphModel(record.graph, { historyLimit: 0 });
    edit(model);
    const next = { graph: model.snapshot(), bindings: nextBindings ?? record.bindings };
    if (JSON.stringify(next) === JSON.stringify({ graph: record.graph, bindings: record.bindings })) return;
    const before = cloneGraphRecord(record);
    const after = cloneGraphRecord({ ...record, ...next });
    await this.runtime.executeCommand({
      name: "Edit shader graph",
      execute: () => this.writeShaderGraph(after),
      undo: () => this.writeShaderGraph(before)
    });
    this.graphFeedback.set(record.materialId, { status: "uncompiled", diagnostics: [] });
    this.markDirty("Edited material shader graph.");
    this.refresh();
  }

  private async setShaderGraphResource(name: string, kind: ShaderGraphPanelResourceKind, type: string): Promise<void> {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || name.startsWith("gl_")) throw new Error("Resource name must be a shader identifier.");
    if (!["uniform", "texture2d", "texture3d", "depth2d"].includes(kind)) throw new Error("Resource kind is unavailable in the material editor.");
    const record = this.currentGraph();
    if (!record) throw new Error("Create a graph first.");
    if (record.graph.resources?.some((resource) => resource.name === name)) throw new Error(`Resource ${name} already exists.`);
    const bindings = copyShaderBindings(record.bindings);
    if (kind === "uniform") bindings[name] = { kind: "uniform", value: validateGraphUniformValue(defaultGraphValue(type as ShaderGraphValueType), type) };
    await this.editShaderGraph((model) => model.setResource({ name, kind, ...(kind === "uniform" ? { type: type as ShaderGraphValueType } : {}) }), bindings);
  }

  private async removeShaderGraphResource(name: string): Promise<void> {
    const record = this.currentGraph();
    if (!record) throw new Error("Create a graph first.");
    const bindings = copyShaderBindings(record.bindings);
    delete bindings[name];
    await this.editShaderGraph((model) => model.removeResource(name), bindings);
  }

  private async setShaderGraphBinding(name: string, value: unknown): Promise<void> {
    const record = this.currentGraph();
    const resource = record?.graph.resources?.find((entry) => entry.name === name);
    if (!record || !resource) throw new Error(`Resource ${name} was not found.`);
    const bindings = copyShaderBindings(record.bindings);
    if (resource.kind === "texture2d" || resource.kind === "texture3d" || resource.kind === "depth2d") {
      if (value === null) delete bindings[name];
      else if (typeof value === "string" && this.graphViewport()?.getInspectableTextures?.().some((entry) => entry.id === value && graphSampledTextureKind(entry.texture) === resource.kind)) bindings[name] = { kind: "texture", assetId: value };
      else throw new Error(`Choose a compatible live ${resource.kind} texture from the renderer.`);
    } else if (resource.kind === "uniform") {
      bindings[name] = { kind: "uniform", value: validateGraphUniformValue(value, resource.type ?? "") };
    } else throw new Error("This resource cannot be bound from the material editor.");
    await this.editShaderGraph(() => undefined, bindings);
  }

  private undoShaderGraph(): Promise<void> { return this.undo(); }
  private redoShaderGraph(): Promise<void> { return this.redo(); }

  private writeShaderGraph(record: MaterialGraphRecord): void {
    const current = this.graphProjectData().shaderGraphs ?? [];
    const shaderGraphs = current.some((entry) => entry.materialId === record.materialId)
      ? current.map((entry) => entry.materialId === record.materialId ? record : entry)
      : [...current, record];
    this.project = { ...this.project, shaderGraphs } as EditorProject;
  }

  private removeShaderGraph(materialId: string): void {
    const shaderGraphs = (this.graphProjectData().shaderGraphs ?? []).filter((entry) => entry.materialId !== materialId);
    this.project = { ...this.project, shaderGraphs } as EditorProject;
  }

  private selectTexture(id: string | null): void {
    if (id && !this.graphViewport()?.getInspectableTextures?.().some((entry) => entry.id === id)) throw new Error("Texture is no longer available.");
    const editor = this.graphProjectData().editor ?? {};
    this.project = { ...this.project, editor: { ...editor, selectedResourceIds: id ? [id] : [] } } as EditorProject;
    this.dirty = true;
  }

  private async importGraphTexture(file: File): Promise<void> {
    if (!file.type.startsWith("image/")) throw new Error("Choose an image file for the texture.");
    if (file.size > 16 * 1024 * 1024) throw new Error("Texture files must be 16 MB or smaller.");
    const uri = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("The texture file could not be read."));
      reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("The texture file could not be read."));
      reader.readAsDataURL(file);
    });
    const base = `texture-${Date.now().toString(36)}`;
    let id = base;
    let suffix = 1;
    while (this.project.assets.some((asset) => asset.id === id)) id = `${base}-${suffix++}`;
    await this.addAsset({ id, name: file.name || "Texture image", type: "texture", uri, importedAt: new Date().toISOString(), preview: "Imported image texture", diagnostics: [], folder: "Textures", status: "imported" });
  }

  /** Async texture completion invalidates bindings without discarding the authored graph. */
  notifyShaderTexturesChanged(): void {
    if (this.disposed) return;
    this.graphTextureRevision += 1;
    this.refresh();
  }

  /** Keep diagnostics current for animation frames without rebuilding editing controls. */
  notifyViewportFrame(): void {
    if (this.disposed) return;
    this.frameCount += 1;
    this.renderFrameInspector();
    this.panels.profiler.render();
  }

  canPreviewTimelineAsset(assetId: string): boolean {
    const node = this.selectedProjectNode();
    return this.runtime.mode === "edit" && !!node && !!this.scene.getNodeById(node.id)
      && node.mesh.enabled && node.mesh.primitive === "imported" && node.mesh.assetId === assetId;
  }

  timelineClipDuration(assetId: string, clipName: string): number | undefined {
    const selected = this.selectedProjectNode();
    return selected && this.canPreviewTimelineAsset(assetId) && this.viewport instanceof TimelineEditorViewport
      ? this.viewport.timelineClipDuration(selected.id, assetId, clipName)
      : undefined;
  }

  applyTimelineAnimation(application: TimelineRuntimeAnimationApplication): boolean {
    const selected = this.selectedProjectNode();
    if (this.disposed || !selected || !application.assetId || !this.canPreviewTimelineAsset(application.assetId)) {
      this.clearTimelinePreview();
      return false;
    }
    return this.viewport instanceof TimelineEditorViewport
      ? this.viewport.setTimelinePreview(selected.id, application)
      : false;
  }

  clearTimelinePreview(): void {
    if (this.viewport instanceof TimelineEditorViewport) this.viewport.clearTimelinePreview();
  }

  renderTimelinePreview(): void {
    if (this.disposed || !this.viewport) return;
    this.viewport.render();
    this.notifyViewportFrame();
  }

  reportTimelinePreviewIssue(message: string): void {
    if (this.disposed) return;
    this.addConsoleMessage("warning", message);
    this.panels.console.render();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.exportController?.abort();
    this.clearExportDownloads();
    window.removeEventListener("keydown", this.onWindowShortcut);
    window.removeEventListener("pagehide", this.onPageHide);
    this.panels.timeline.dispose();
    this.panels.textures.dispose();
    this.viewport?.dispose();
    this.runtime.dispose();
    this.root.replaceChildren();
  }

  private syncShaderGraphSelection(): void {
    const record = this.currentGraph();
    const editor = this.graphProjectData().editor ?? {};
    const activeId = record?.id ?? null;
    if ((editor.activeShaderGraphId ?? null) !== activeId) {
      this.project = { ...this.project, editor: { ...editor, activeShaderGraphId: activeId } } as EditorProject;
    }
    const graphs = this.graphProjectData().shaderGraphs ?? [];
    const activeMaterials = new Set(graphs.map((entry) => entry.materialId));
    for (const materialId of this.lastAttemptedGraphs.keys()) {
      if (activeMaterials.has(materialId)) continue;
      this.graphViewport()?.setShaderGraph?.(materialId, null, {});
      this.lastAttemptedGraphs.delete(materialId);
      this.graphFeedback.delete(materialId);
    }
    for (const graph of graphs) {
      const graphRecord = { ...graph, bindings: graph.bindings ?? {} };
      const mesh = this.project.scene.nodes.find((node) => node.id === graphRecord.materialId)?.mesh;
      const signature = JSON.stringify({ graph: graphRecord.graph, bindings: graphRecord.bindings, textures: this.graphTextureRevision, mesh });
      if (signature === this.lastAttemptedGraphs.get(graphRecord.materialId)) continue;
      this.lastAttemptedGraphs.set(graphRecord.materialId, signature);
      this.compileShaderGraph(graphRecord);
    }
  }

  private compileSelectedShaderGraph(): void {
    const record = this.currentGraph();
    if (!record) throw new Error("Create a graph first.");
    this.compileShaderGraph(record);
    this.viewport?.render();
    this.renderFrameInspector();
  }

  private compileShaderGraph(record: MaterialGraphRecord): void {
    const model = new ShaderGraphModel(record.graph, { historyLimit: 0 });
    const inspection = new ShaderGraphInspector({ getShaderGraph: () => record.graph }).inspect("glsl");
    const errors = model.validate("glsl");
    if (errors.length) {
      this.graphFeedback.set(record.materialId, { status: "error", inspection, diagnostics: errors.map((error) => ({ severity: "error", message: `${error.code}: ${error.message}`, nodeId: error.nodeId })) });
      return;
    }
    try {
      model.compile("glsl");
      model.compile("wgsl");
      const viewport = this.graphViewport();
      if (!viewport?.setShaderGraph) throw new Error("The renderer does not expose graph material compilation.");
      const result = viewport.setShaderGraph(record.materialId, record.graph, record.bindings);
      this.graphFeedback.set(record.materialId, { status: result.ok ? "ready" : "error", inspection, diagnostics: result.diagnostics.map((message) => ({ severity: "error", message })) });
    } catch (error) {
      const diagnostics = error && typeof error === "object" && "diagnostics" in error && Array.isArray(error.diagnostics)
        ? error.diagnostics.map((entry: { message?: string; code?: string; nodeId?: string }) => ({ severity: "error" as const, message: `${entry.code ? `${entry.code}: ` : ""}${entry.message ?? "Compilation failed"}`, nodeId: entry.nodeId }))
        : [{ severity: "error" as const, message: error instanceof Error ? error.message : String(error) }];
      this.graphFeedback.set(record.materialId, { status: "error", diagnostics, inspection });
    }
  }

  private renderFrameInspector(): void {
    const source = this.graphViewport()?.frameInspectionSource?.();
    const diagnostics = this.viewport?.diagnosticsSnapshot();
    this.frameInspectorElement.replaceChildren();
    const title = document.createElement("div");
    title.className = "panel-title";
    title.textContent = "Frame inspector";
    this.frameInspectorElement.append(title);
    if (!source && !diagnostics) {
      const loading = document.createElement("p");
      loading.className = "muted";
      loading.setAttribute("role", "status");
      loading.textContent = "Waiting for a rendered frame.";
      this.frameInspectorElement.append(loading);
      return;
    }
    const frame = new FrameInspector(source ?? { getDiagnostics: () => diagnostics! }).capture();
    const state = document.createElement("p");
    state.className = "muted";
    state.setAttribute("role", frame.status === "error" ? "alert" : "status");
    state.textContent = frame.status === "partial" ? "Pass and timing telemetry is partially unavailable." : frame.status === "error" ? frame.diagnostics.lastError ?? "Frame inspection failed." : "Frame telemetry available.";
    this.frameInspectorElement.append(state);
    const metrics = document.createElement("dl");
    metrics.className = "metrics";
    const add = (label: string, value: number | null, suffix = ""): void => {
      const term = document.createElement("dt"); term.textContent = label;
      const description = document.createElement("dd"); description.textContent = value === null ? "Unavailable" : `${value}${suffix}`;
      metrics.append(term, description);
    };
    add("Frame", frame.frameNumber); add("Draw calls", frame.drawCalls); add("Triangles", frame.triangles);
    add("CPU time", frame.cpuTimeMs, " ms"); add("GPU time", frame.gpuTimeMs, " ms");
    add("Buffers", frame.resources.buffers); add("Textures", frame.resources.textures); add("Shaders", frame.resources.shaders); add("Render targets", frame.resources.renderTargets);
    this.frameInspectorElement.append(metrics);
    const passes = document.createElement("div");
    passes.className = "diagnostics-list";
    passes.setAttribute("aria-label", "Frame passes");
    if (!frame.passes.length) passes.textContent = "Pass information unavailable.";
    for (const pass of frame.passes) {
      const item = document.createElement("span");
      item.textContent = `${pass.name}: ${pass.drawCalls ?? "unknown"} draws, ${pass.cpuTimeMs ?? "unknown"} ms CPU, ${pass.gpuTimeMs ?? "unknown"} ms GPU`;
      passes.append(item);
    }
    this.frameInspectorElement.append(passes);
    for (const warning of frame.diagnostics.warnings) {
      const item = document.createElement("p"); item.textContent = warning; this.frameInspectorElement.append(item);
    }
  }

  sceneNodes(): readonly SceneNode[] {
    return this.project.scene.nodes.map((node) => this.scene.getNodeById(node.id)).filter((node): node is SceneNode => Boolean(node));
  }

  selectedNode(): SceneNode | undefined {
    const selected = this.runtime.currentSelection()[0];
    return selected ? this.scene.getNodeById(String(selected)) : undefined;
  }

  selectedProjectNode(): EditorProjectNode | undefined {
    const selected = this.runtime.currentSelection()[0];
    return this.project.scene.nodes.find((node) => node.id === selected);
  }

  selectNode(nodeId: string): void {
    this.runtime.select([nodeId]);
    this.runtime.setTool("move");
    this.refresh();
  }

  toggleNodeSelection(nodeId: string): void {
    const current = new Set(this.runtime.currentSelection().map(String));
    if (current.has(nodeId)) {
      current.delete(nodeId);
    } else {
      current.add(nodeId);
    }
    this.runtime.select([...current]);
    this.refresh();
  }

  async renameNode(nodeId: string, name: string): Promise<void> {
    const node = this.scene.getNodeById(nodeId);
    if (!node) {
      return;
    }
    await this.runtime.editInspectedProperty(node, ["name"], name);
    this.projectFromScene();
    this.markDirty("Renamed node.");
    this.refresh();
  }

  async addAsset(asset: EditorAssetRecord): Promise<void> {
    await this.commitProjectChange(
      "Import Asset",
      { ...this.project, assets: [...this.project.assets, asset] },
      `Imported asset ${asset.name}.`
    );
  }

  async updateAsset(asset: EditorAssetRecord): Promise<void> {
    await this.commitProjectChange("Update Asset", {
      ...this.project,
      assets: this.project.assets.map((candidate) => candidate.id === asset.id ? asset : candidate)
    }, `Updated asset ${asset.name}.`);
  }

  async renameAsset(assetId: string, name: string): Promise<void> {
    await this.commitProjectChange("Rename Asset", {
      ...this.project,
      assets: this.project.assets.map((asset) => asset.id === assetId ? { ...asset, name } : asset)
    }, `Renamed asset ${name}.`);
  }

  async moveAsset(assetId: string, folder: string): Promise<void> {
    await this.commitProjectChange("Move Asset", {
      ...this.project,
      assets: this.project.assets.map((asset) => asset.id === assetId ? { ...asset, folder } : asset)
    }, `Moved asset to ${folder}.`);
  }

  async deleteAsset(assetId: string): Promise<void> {
    const data = this.graphProjectData();
    const belongsToAsset = (id: string): boolean => id === assetId || embeddedTextureAssetId(id) === assetId;
    const shaderGraphs = data.shaderGraphs?.map((graph) => ({
      ...graph,
      bindings: Object.fromEntries(Object.entries(graph.bindings ?? {}).filter(([, binding]) => binding.kind !== "texture" || !belongsToAsset(binding.assetId)))
    }));
    const editor = data.editor && { ...data.editor, selectedResourceIds: data.editor.selectedResourceIds?.filter((id) => !belongsToAsset(id)) };
    await this.commitProjectChange("Delete Asset", {
      ...this.project,
      assets: this.project.assets.filter((asset) => asset.id !== assetId),
      ...(shaderGraphs ? { shaderGraphs } : {}),
      ...(editor ? { editor } : {}),
      scene: {
        ...this.project.scene,
        nodes: this.project.scene.nodes.map((node) => node.mesh.assetId === assetId ? { ...node, mesh: { ...node.mesh, assetId: null, primitive: "cube" as const } } : node)
      }
    }, "Deleted asset and cleared scene references.");
  }

  async placeAsset(assetId: string): Promise<void> {
    const asset = this.project.assets.find((candidate) => candidate.id === assetId);
    if (!asset) {
      return;
    }
    const importSettings = this.project.importSettings;
    const importedScale: [number, number, number] = [importSettings.scale, importSettings.scale, importSettings.scale];
    const importedRotation: [number, number, number, number] = importSettings.orientation === "z-up" ? [-0.707107, 0, 0, 0.707107] : [0, 0, 0, 1];
    const animationClip = importSettings.importAnimations ? asset.animationClips?.[0]?.name ?? "" : "";
    const textureSlots = importTextureSlots(importSettings, asset);
    const parent = this.selectedNode() ?? this.scene.root;
    const node = new SceneNode({ id: `placed-${asset.id}`, name: asset.name });
    node.transform.setPosition(0.8, 0.25, 0);
    node.transform.setRotation(...importedRotation);
    node.transform.setScale(...importedScale);
    const record = createProjectNode({
      id: node.id,
      name: node.name,
      parentId: parent === this.scene.root ? null : parent.id,
      position: [0.8, 0.25, 0],
      rotation: importedRotation,
      scale: importedScale,
      mesh: { enabled: true, assetId: asset.id, primitive: "imported" },
      material: {
        name: `${asset.name} Material`,
        baseColor: importSettings.colorSpace === "linear" ? "#c8a8ff" : "#b98cff",
        metallic: importSettings.materialMode === "override" ? 0.35 : 0,
        roughness: importSettings.materialMode === "override" ? 0.28 : 0.5,
        textureSlots
      },
      physics: importSettings.generateCollider ? { body: "static", collider: "box", friction: 0.55, restitution: 0.05 } : { body: "none", collider: "none", friction: 0.5, restitution: 0 },
      animation: { enabled: Boolean(animationClip), clip: animationClip, loop: true }
    });
    await this.addProjectNode("Place Asset", node, parent, record, true);
    this.markDirty(`Placed asset ${asset.name}.`);
    this.selectNode(node.id);
  }

  async updateImportSetting<TKey extends keyof EditorImportSettings>(key: TKey, value: EditorImportSettings[TKey]): Promise<void> {
    await this.commitProjectChange("Update Import Setting", {
      ...this.project,
      importSettings: {
        ...this.project.importSettings,
        [key]: value
      }
    }, `Changed import setting ${String(key)}.`);
  }

  projectFromScene(): void {
    this.project = this.serializer.captureScene(this.scene, this.project);
    const data = this.graphProjectData();
    if (data.shaderGraphs) {
      const nodes = new Set(this.project.scene.nodes.map((node) => node.id));
      const shaderGraphs = data.shaderGraphs.filter((graph) => nodes.has(graph.materialId));
      for (const graph of data.shaderGraphs) if (!nodes.has(graph.materialId)) this.orphanedGraphs.set(graph.materialId, graph);
      for (const [id, graph] of this.orphanedGraphs) {
        if (nodes.has(id) && !shaderGraphs.some((entry) => entry.materialId === id)) {
          shaderGraphs.push(graph);
          this.orphanedGraphs.delete(id);
        }
      }
      this.project = { ...this.project, shaderGraphs } as EditorProject;
    }
    this.dirty = true;
  }

  async updateSelectedProjectNodeField(path: readonly string[], value: unknown): Promise<void> {
    const node = this.selectedProjectNode();
    if (!node) {
      return;
    }
    if (path.join(".") === "material.baseColor" && (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value))) {
      throw new Error("material.baseColor needs a #rrggbb color.");
    }
    if (["material.metallic", "material.roughness"].includes(path.join(".")) &&
        (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1)) {
      throw new Error(`${path.join(".")} must be between 0 and 1.`);
    }
    const before = readPath(node, path);
    const target = (): EditorProjectNode => {
      const current = this.project.scene.nodes.find((entry) => entry.id === node.id);
      if (!current) throw new Error(`Project node ${node.id} no longer exists.`);
      return current;
    };
    await this.runtime.executeCommand({
      name: "Edit Project Field",
      execute: () => writePath(target(), path, value),
      undo: () => writePath(target(), path, before)
    });
    this.markDirty(`Edited ${path.join(".")}.`);
    this.refresh();
  }

  saveProject(): void {
    this.projectFromScene();
    const liveNodeIds = new Set(this.project.scene.nodes.map((node) => node.id));
    const selection = this.runtime.currentSelection().map(String).filter((id) => liveNodeIds.has(id));
    this.project = {
      ...this.project,
      editor: { ...this.project.editor, selectedNodeId: selection[0] ?? null, selectedNodeIds: selection, activeTool: this.runtime.activeTool }
    };
    this.savedProjectJson = this.serializer.serialize(this.project);
    const buffer = this.root.querySelector<HTMLTextAreaElement>('[data-role="project-buffer"]');
    if (buffer) {
      buffer.value = this.savedProjectJson;
    }
    this.dirty = false;
    this.addConsoleMessage("info", "Project saved to JSON buffer.");
  }

  loadProject(): void {
    const buffer = this.root.querySelector<HTMLTextAreaElement>('[data-role="project-buffer"]');
    const source = buffer?.value || this.savedProjectJson;
    const project = this.serializer.parse(source);
    const built = this.serializer.buildScene(project);
    this.panels?.timeline?.reset();
    this.runtime.clearHistory();
    this.project = project;
    this.resetShaderGraphTracking();
    this.syncPrefabRegistry();
    this.scene = built.scene;
    this.restoreProjectSelection();
    this.dirty = false;
    this.addConsoleMessage("info", "Project loaded from JSON buffer.");
    this.refresh();
  }

  togglePlayMode(): void {
    if (this.runtime.mode === "edit") {
      this.panels?.timeline?.reset();
      this.saveProject();
      const bridge = new PlayModeBridge({
        capture: () => this.savedProjectJson,
        restore: (snapshot: string) => {
          this.project = this.serializer.parse(snapshot);
          this.resetShaderGraphTracking();
          const built = this.serializer.buildScene(this.project);
          this.scene = built.scene;
        }
      });
      this.runtime.enterPlayMode(bridge);
      this.addConsoleMessage("info", "Entered play mode with isolated edit snapshot.");
    } else {
      this.runtime.exitPlayMode({ restore: true });
      // Commands recorded against the prior Scene contain object references and
      // cannot safely run after the project snapshot has rebuilt that Scene.
      this.runtime.clearHistory();
      this.restoreProjectSelection();
      this.addConsoleMessage("info", "Exited play mode and restored edit state.");
    }
    this.refresh();
  }

  async exportProject(): Promise<void> {
    if (this.exportInProgress || this.disposed) return;
    this.exportInProgress = true;
    const controller = new AbortController();
    this.exportController = controller;
    this.exportedProject = undefined;
    this.clearExportDownloads();
    const summary = this.root.querySelector<HTMLElement>('[data-role="export-summary"]');
    if (summary) summary.textContent = "Preparing standalone export…";
    try {
      this.saveProject();
      const result = await this.exporter.export(this.project, controller.signal);
      if (this.disposed) return;
      this.exportedProject = result;
      if (summary) {
        summary.textContent = "Download all three files into the same folder and serve it over HTTP.\n";
        for (const file of result.files) {
          const type = file.type === "html" ? "text/html" : file.type === "json" ? "application/json" : "text/javascript";
          const url = URL.createObjectURL(new Blob([file.content], { type }));
          this.exportUrls.push(url);
          const link = document.createElement("a");
          link.href = url;
          link.download = file.path;
          link.textContent = `Download ${file.path}`;
          summary.append(link, document.createTextNode("\n"));
        }
      }
      this.addConsoleMessage("info", "Standalone scene export generated.");
    } catch (error) {
      if (this.disposed) return;
      this.exportedProject = undefined;
      this.clearExportDownloads();
      const message = error instanceof Error ? error.message : "Static export failed.";
      if (summary) summary.textContent = message;
      this.addConsoleMessage("error", message);
    } finally {
      this.exportInProgress = false;
      if (this.exportController === controller) this.exportController = undefined;
      if (!this.disposed) this.refresh();
    }
  }

  exportedFiles(): readonly { readonly path: string; readonly content: string; readonly type: string }[] {
    return this.exportedProject?.files ?? [];
  }

  private clearExportDownloads(): void {
    for (const url of this.exportUrls) URL.revokeObjectURL(url);
    this.exportUrls.length = 0;
  }

  async duplicateSelectedNode(): Promise<void> {
    const source = this.selectedProjectNode();
    if (!source) {
      return;
    }
    const node = new SceneNode({ id: `${source.id}-copy-${Date.now().toString(36)}`, name: `${source.name} Copy` });
    const parent = source.parentId ? this.scene.getNodeById(source.parentId) ?? this.scene.root : this.scene.root;
    const transform = offsetProjectTransform(source.transform, 0.5);
    node.transform.setPosition(...transform.position);
    node.transform.setRotation(...transform.rotation);
    node.transform.setScale(...transform.scale);
    if (transform.pivot !== undefined) node.transform.setPivot(...transform.pivot);
    if (transform.linearResidual !== undefined) node.transform.setLinearResidual([...transform.linearResidual] as Mat4);
    if (transform.localMatrix !== undefined) node.transform.setLocalMatrix([...transform.localMatrix] as Mat4, { decompose: false });
    await this.addProjectNode("Duplicate Node", node, parent, {
      ...source,
      id: node.id,
      name: node.name,
      parentId: parent === this.scene.root ? null : parent.id,
      transform
    });
    this.markDirty(`Duplicated node ${source.name}.`);
    this.selectNode(node.id);
  }

  async createPrefabFromSelection(): Promise<void> {
    const root = this.selectedProjectNode();
    if (!root) {
      return;
    }
    const subtree = this.projectSubtree(root.id);
    const prefab = this.prefabRegistry.create({
      id: `prefab-${slugify(root.name)}-${Date.now().toString(36)}`,
      name: `${root.name} Prefab`,
      rootNodeId: root.id,
      sourceNodeId: root.id,
      nodes: subtree.map((node) => ({
        ...node,
        parentId: node.id === root.id ? null : node.parentId
      }))
    });
    await this.commitProjectChange("Create Prefab", {
      ...this.project,
      prefabs: [...this.project.prefabs, prefab]
    }, `Created prefab ${prefab.name}.`);
  }

  async instantiatePrefab(prefabId = this.project.prefabs[0]?.id): Promise<void> {
    if (!prefabId) {
      return;
    }
    const prefab = this.prefabRegistry.get(prefabId);
    if (!prefab) {
      return;
    }
    const idPrefix = `instance-${prefab.id}-${Date.now().toString(36)}`;
    const nodes = this.prefabRegistry.instantiate(prefab, { idPrefix, rootParentId: null, nameSuffix: " Instance" })
      .map((node) => node.id === `${idPrefix}-${prefab.rootNodeId}` ? offsetRootInstance(node) : node);
    const previousProject = this.project;
    const nextProject: EditorProject = {
      ...this.project,
      scene: {
        ...this.project.scene,
        nodes: [...this.project.scene.nodes, ...nodes]
      }
    };
    // Build and validate the new nodes first, then attach them to the existing
    // scene so earlier transform commands still point at the live objects.
    const staged = this.serializer.buildScene(nextProject).scene;
    const ids = new Set(nodes.map((node) => node.id));
    const roots = staged.root.children.filter((node) => ids.has(node.id));
    for (const root of roots) staged.removeNode(root);
    const owner = this.scene;
    const previousSelection = this.runtime.currentSelection();
    const detach = (): void => {
      for (const root of [...roots].reverse()) {
        if (owner.getNodeById(root.id) === root) owner.removeNode(root);
        else if (root.parent === owner.root) owner.root.removeChild(root);
      }
    };
    await this.runtime.executeCommand({
      name: "Instantiate Prefab",
      execute: () => {
        if (this.scene !== owner) throw new Error("Cannot instantiate into a replaced scene.");
        for (const node of nodes) {
          if (owner.getNodeById(node.id)) throw new Error(`Duplicate scene node id: ${node.id}`);
        }
        try {
          for (const root of roots) {
            owner.root.addChild(root);
            owner.registerSubtree(root);
          }
          this.project = nextProject;
          this.runtime.select([`${idPrefix}-${prefab.rootNodeId}`]);
        } catch (error) {
          const failures: unknown[] = [error];
          try { detach(); } catch (cleanupError) { failures.push(cleanupError); }
          this.project = previousProject;
          try { this.runtime.select(previousSelection.filter((id) => owner.getNodeById(String(id)))); }
          catch (selectionError) { failures.push(selectionError); }
          if (failures.length > 1) throw new AggregateError(failures, "Prefab instantiation and cleanup failed.");
          throw error;
        }
      },
      undo: () => {
        if (this.scene !== owner) throw new Error("Cannot undo prefab instantiation in a replaced scene.");
        detach();
        this.project = previousProject;
        this.runtime.select(previousSelection.filter((id) => owner.getNodeById(String(id))));
      }
    });
    this.markDirty(`Instantiated prefab ${prefab.name}.`);
    this.selectNode(`${idPrefix}-${prefab.rootNodeId}`);
  }

  reorderNode(nodeId: string, direction: -1 | 1): void {
    const nodes = [...this.project.scene.nodes];
    const index = nodes.findIndex((node) => node.id === nodeId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= nodes.length) {
      return;
    }
    const [node] = nodes.splice(index, 1);
    if (!node) {
      return;
    }
    nodes.splice(targetIndex, 0, node);
    this.project = { ...this.project, scene: { ...this.project.scene, nodes } };
    const order = new Map(nodes.map((entry, rank) => [entry.id, rank]));
    this.scene.root.traverse((parent) => {
      parent.children.sort((left, right) => (order.get(left.id) ?? Infinity) - (order.get(right.id) ?? Infinity));
    });
    this.markDirty("Reordered hierarchy node.");
    this.refresh();
  }

  async reparentNode(nodeId: string, parentId: string | null): Promise<void> {
    const node = this.scene.getNodeById(nodeId);
    const parent = parentId ? this.scene.getNodeById(parentId) : this.scene.root;
    if (!node || !parent || node === this.scene.root || node === parent || node.parent === parent || node.isAncestorOf(parent)) {
      return;
    }
    await this.runtime.executeCommand(new ReparentNodeCommand(node, parent));
    this.projectFromScene();
    this.markDirty(parent === this.scene.root ? "Reparented node to scene root." : `Reparented node under ${parent.name}.`);
    this.refresh();
  }

  newProject(): void {
    this.panels?.timeline?.reset();
    this.project = this.serializer.createDefaultProject();
    this.resetShaderGraphTracking();
    this.syncPrefabRegistry();
    const built = this.serializer.buildScene(this.project);
    this.scene = built.scene;
    this.runtime.clearHistory();
    this.runtime.select(["node-hero"]);
    this.dirty = true;
    this.addConsoleMessage("info", "Created new project.");
    this.refresh();
  }

  newExternalParityStarterProject(): void {
    this.panels?.timeline?.reset();
    this.project = this.serializer.createExternalParityStarterProject();
    this.resetShaderGraphTracking();
    this.syncPrefabRegistry();
    const built = this.serializer.buildScene(this.project);
    this.scene = built.scene;
    this.runtime.clearHistory();
    this.runtime.select(["node-external-parity-fox"]);
    this.dirty = true;
    this.addConsoleMessage("info", "Created ExternalParity starter project with imported asset, light, camera, physics, scripting, and export settings.");
    this.refresh();
  }

  async undo(): Promise<void> {
    await this.runtime.undo();
    this.projectFromScene();
    this.addConsoleMessage("info", "Undo applied.");
    this.refresh();
  }

  async redo(): Promise<void> {
    await this.runtime.redo();
    this.projectFromScene();
    this.addConsoleMessage("info", "Redo applied.");
    this.refresh();
  }

  consoleMessages(): readonly EditorConsoleMessage[] {
    return this.messages;
  }

  clearConsole(): void {
    this.messages.length = 0;
    this.refresh();
  }

  addConsoleMessage(level: EditorConsoleMessage["level"], text: string): void {
    this.messages.push({ level, text, at: new Date().toISOString() });
    if (this.messages.length > 50) {
      this.messages.shift();
    }
  }

  getState(): EditorAppState {
    const runtimeSnapshot = this.runtime.snapshot();
    return {
      status: this.status,
      mode: this.runtime.mode,
      selectedNodeId: String(this.runtime.currentSelection()[0] ?? "") || null,
      selectedNodeIds: this.runtime.currentSelection().map(String),
      nodeCount: this.project.scene.nodes.length,
      assetCount: this.project.assets.length,
      prefabCount: this.project.prefabs.length,
      savedProjectJson: this.savedProjectJson,
      exportedFileCount: this.exportedProject?.files.length ?? 0,
      activeTool: this.runtime.activeTool,
      viewMode: this.viewport?.viewMode ?? "shaded",
      viewportCamera: this.viewport?.viewSnapshot() ?? { orbitYaw: 0, orbitPitch: 20, pan: [0, 0], zoom: 1, focusedNodeId: null, gizmo: null },
      canUndo: runtimeSnapshot.canUndo,
      canRedo: runtimeSnapshot.canRedo,
      dirty: this.dirty,
      pluginPanels: this.plugins.snapshot().panels.map((panel) => panel.id),
      consoleCount: this.messages.length,
      editorState: this.runtime.editorStateSnapshot(),
      timeline: this.panels.timeline.snapshot(),
      visualScripting: this.panels.visualScript.snapshot(),
      claimBoundary: {
        allowed: "browser-first local authoring workflow for the shown exported app",
        blocked: ["Unity replacement", "Unreal replacement", "broad Unity/Unreal for the web", "Unity Visual Scripting parity", "Unreal Blueprint parity"]
      },
      editorPicking: runtimeSnapshot.picking,
      featureEvidence: this.featureEvidenceSnapshot(),
      ...(this.error ? { error: this.error } : {})
    };
  }

  fail(error: unknown): void {
    this.status = "error";
    this.error = error instanceof Error ? error.stack ?? error.message : String(error);
    this.addConsoleMessage("error", this.error);
  }

  private async runCommand(action: string | undefined): Promise<void> {
    if (!action) {
      return;
    }
    if (action === "new-project") this.newProject();
    if (action === "new-external-parity-starter") this.newExternalParityStarterProject();
    if (action === "save-project") this.saveProject();
    if (action === "load-project") this.loadProject();
    if (action === "toggle-play") this.togglePlayMode();
    if (action === "export-project") void this.exportProject();
    if (action === "duplicate-node") await this.duplicateSelectedNode();
    if (action === "create-prefab") await this.createPrefabFromSelection();
    if (action === "instantiate-prefab") await this.instantiatePrefab();
    if (action === "undo") await this.undo();
    if (action === "redo") await this.redo();
  }

  private handleShortcut(event: KeyboardEvent): void {
    const modifier = event.metaKey || event.ctrlKey;
    if (!modifier) {
      return;
    }
    const key = event.key.toLowerCase();
    if (key === "s") {
      event.preventDefault();
      this.saveProject();
    }
    if (key === "z" && !event.shiftKey) {
      event.preventDefault();
      void this.undo();
    }
    if ((key === "z" && event.shiftKey) || key === "y") {
      event.preventDefault();
      void this.redo();
    }
    if (key === "d") {
      event.preventDefault();
      void this.duplicateSelectedNode();
    }
  }

  private projectSubtree(rootId: string): readonly EditorProjectNode[] {
    const nodesByParent = new Map<string | null, EditorProjectNode[]>();
    for (const node of this.project.scene.nodes) {
      const siblings = nodesByParent.get(node.parentId) ?? [];
      siblings.push(node);
      nodesByParent.set(node.parentId, siblings);
    }
    const output: EditorProjectNode[] = [];
    const visit = (nodeId: string): void => {
      const node = this.project.scene.nodes.find((candidate) => candidate.id === nodeId);
      if (!node) return;
      output.push(node);
      for (const child of nodesByParent.get(nodeId) ?? []) {
        visit(child.id);
      }
    };
    visit(rootId);
    return output;
  }

  private syncPrefabRegistry(): void {
    this.prefabRegistry.clear();
    for (const prefab of this.project.prefabs ?? []) {
      this.prefabRegistry.upsert(prefab);
    }
  }

  private resetShaderGraphTracking(): void {
    this.orphanedGraphs.clear();
    this.graphFeedback.clear();
    this.lastAttemptedGraphs.clear();
    this.graphTextureRevision = 0;
    this.graphViewport()?.clearShaderGraphs?.();
    this.graphViewport()?.resetSceneInstances?.();
  }

  private restoreProjectSelection(): void {
    const editor = this.project.editor;
    const available = new Set(this.project.scene.nodes.map((node) => node.id));
    const selected = editor?.selectedNodeIds ?? (editor?.selectedNodeId !== undefined
      ? editor.selectedNodeId === null ? [] : [editor.selectedNodeId]
      : this.project.scene.nodes[0] ? [this.project.scene.nodes[0].id] : []);
    this.runtime.select(selected.map(String).filter((id) => available.has(id)));
    if (editor?.activeTool) this.runtime.setTool(editor.activeTool);
  }

  private markDirty(message: string): void {
    this.dirty = true;
    this.addConsoleMessage("info", message);
  }

  private async addProjectNode(name: string, node: SceneNode, parent: SceneNode, record: EditorProjectNode, append = false): Promise<void> {
    const owner = this.scene;
    const previousProject = this.project;
    const previousSelection = this.runtime.currentSelection();
    const detach = (): void => {
      if (owner.getNodeById(node.id) === node) owner.removeNode(node);
      else if (node.parent === parent) parent.removeChild(node);
    };
    await this.runtime.executeCommand({
      name,
      execute: () => {
        if (this.scene !== owner || (parent !== owner.root && owner.getNodeById(parent.id) !== parent)) {
          throw new Error("Cannot add a node to a replaced scene or parent.");
        }
        if (owner.getNodeById(node.id)) throw new Error(`Duplicate scene node id: ${node.id}`);
        try {
          parent.addChild(node);
          owner.registerSubtree(node);
          const captured = this.serializer.captureScene(owner, this.project);
          this.project = {
            ...captured,
            scene: {
              ...captured.scene,
              nodes: append
                ? [...captured.scene.nodes.filter((candidate) => candidate.id !== node.id), record]
                : captured.scene.nodes.map((candidate) => candidate.id === node.id ? record : candidate)
            }
          };
          this.runtime.select([node.id]);
        } catch (error) {
          const failures: unknown[] = [error];
          try { detach(); } catch (cleanupError) { failures.push(cleanupError); }
          this.project = previousProject;
          try { this.runtime.select(previousSelection.filter((id) => owner.getNodeById(String(id)))); }
          catch (selectionError) { failures.push(selectionError); }
          if (failures.length > 1) throw new AggregateError(failures, `${name} and cleanup failed.`);
          throw error;
        }
      },
      undo: () => {
        if (this.scene !== owner) throw new Error("Cannot undo a node in a replaced scene.");
        detach();
        this.project = previousProject;
        this.runtime.select(previousSelection.filter((id) => owner.getNodeById(String(id))));
      }
    });
  }

  private async commitProjectChange(name: string, nextProject: EditorProject, message: string): Promise<void> {
    const previousProject = this.project;
    await this.runtime.executeCommand({
      name,
      execute: () => {
        this.project = nextProject;
        this.syncPrefabRegistry();
      },
      undo: () => {
        this.project = previousProject;
        this.syncPrefabRegistry();
      }
    });
    this.markDirty(message);
    this.refresh();
  }

  private featureEvidenceSnapshot(): EditorAppState["featureEvidence"] {
    const nodes = this.project.scene.nodes;
    const picking = this.runtime.pickingSnapshot();
    const visualScripting = this.panels.visualScript.snapshot();
    return {
      externalParityStarterAvailable: true,
      importedAssets: this.project.assets.filter((asset) => asset.type === "gltf").length,
      editedMaterials: nodes.filter((node) => node.material.name !== "Default Material" && node.material.baseColor.length > 0).length,
      lights: nodes.filter((node) => node.light.kind !== "none" && node.light.intensity > 0).length,
      cameras: nodes.filter((node) => node.camera.enabled).length,
      physicsBodies: nodes.filter((node) => node.physics.body !== "none").length,
      scripts: nodes.filter((node) => node.script.enabled && node.script.behavior.length > 0).length,
      oldBranchGpuPickingPort: picking.source === "origin-master-gpu-picking-adapted",
      gpuPickingColorIdEncoding: picking.evidence.colorIdEncoding && picking.evidence.colorIdDecoding,
      gpuPickingRaycastFallback: picking.evidence.raycastFallback && picking.blockedClaims.includes("production GPU framebuffer picking pass"),
      oldBranchVisualScriptingPort: visualScripting.evidence.oldCodebasePort,
      editorVisibleVisualGraph: visualScripting.evidence.editorVisibleGraph,
      visualScriptingCatalogExecution: visualScripting.evidence.deterministicExecution && visualScripting.evidence.blockedUnityUnrealVisualScriptingParity,
      staticExportWithoutEditorCode: (this.exportedProject?.files.find((file) => file.path === "runtime.js")?.content ?? "").includes("__AURA3D_EXPORTED_PROJECT__") &&
        !(this.exportedProject?.files.some((file) => file.content.includes("EditorShell") || file.content.includes("__AURA3D_EDITOR_APP__")) ?? true)
    };
  }
}

function readPath(target: object, path: readonly string[]): unknown {
  let current: unknown = target;
  for (const segment of path) {
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function defaultGraphValue(type: ShaderGraphValueType): number | boolean | readonly number[] {
  if (type === "bool") return false;
  if (type === "vec2") return [0, 0];
  if (type === "vec3" || type === "uvec3") return [0, 0, 0];
  if (type === "vec4") return [0, 0, 0, 1];
  return 0;
}

function cloneGraphRecord(record: MaterialGraphRecord): MaterialGraphRecord {
  return JSON.parse(JSON.stringify(record)) as MaterialGraphRecord;
}

function copyShaderBindings(bindings: Readonly<Record<string, ShaderBinding>>): Record<string, ShaderBinding> {
  return Object.assign(Object.create(null) as Record<string, ShaderBinding>, bindings);
}

function writePath(target: object, path: readonly string[], value: unknown): void {
  let current: Record<string, unknown> = target as Record<string, unknown>;
  for (const segment of path.slice(0, -1)) {
    current = current[segment] as Record<string, unknown>;
  }
  current[path[path.length - 1]!] = value;
}

function offsetRootInstance(node: EditorProjectNode): EditorProjectNode {
  return {
    ...node,
    transform: offsetProjectTransform(node.transform, 0.75)
  };
}

function offsetProjectTransform(transform: EditorProjectNode["transform"], x: number): EditorProjectNode["transform"] {
  const position: [number, number, number] = [transform.position[0] + x, transform.position[1], transform.position[2]];
  const localMatrix = transform.localMatrix === undefined ? undefined : [...transform.localMatrix] as Mat4;
  if (localMatrix) localMatrix[12] += x;
  if (!Number.isFinite(position[0]) || (localMatrix && !Number.isFinite(localMatrix[12]))) {
    throw new RangeError("Offset transform must remain finite.");
  }
  return {
    position,
    rotation: [...transform.rotation],
    scale: [...transform.scale],
    ...(transform.pivot === undefined ? {} : { pivot: [...transform.pivot] as [number, number, number] }),
    ...(transform.linearResidual === undefined ? {} : { linearResidual: [...transform.linearResidual] as Mat4 }),
    ...(localMatrix === undefined ? {} : { localMatrix })
  };
}

function browserEditorStateStorage(): EditorStateStorage | undefined {
  if (typeof window === "undefined") return undefined;
  return {
    getItem: (key) => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
    removeItem: (key) => window.localStorage.removeItem(key)
  };
}

function importTextureSlots(importSettings: EditorImportSettings, asset: EditorAssetRecord): EditorProjectNode["material"]["textureSlots"] {
  if (importSettings.textureMode === "none") {
    return { baseColor: "", normal: "", metallicRoughness: "", emissive: "" };
  }
  const prefix = importSettings.textureMode === "external" ? `${asset.name.replace(/\.[^.]+$/, "")}_external` : asset.name.replace(/\.[^.]+$/, "");
  const suffix = importSettings.compression === "ktx2" ? ".ktx2" : "";
  return {
    baseColor: `${prefix}_baseColor${suffix}`,
    normal: importSettings.importNormals ? `${prefix}_normal${suffix}` : "",
    metallicRoughness: `${prefix}_metallicRoughness${suffix}`,
    emissive: ""
  };
}

function slugify(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug || "prefab";
}
