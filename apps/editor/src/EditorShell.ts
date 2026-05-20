import { EditorPluginHost, EditorRuntime, PlayModeBridge, PrefabRegistry, ReparentNodeCommand, sampleLocalizationAccessibilityFixture, type Command, type EditorLocalizationAccessibilityFixture, type EditorPickingEvidenceSnapshot, type EditorStateSnapshot, type EditorStateStorage, type GizmoSettings, type TimelineSnapshot } from "@galileo3d/editor-runtime";
import { Scene, SceneNode } from "@galileo3d/scene";
import { StaticProjectExporter, type StaticExportResult } from "./export/StaticProjectExporter";
import { ImportSettingsPanel } from "./import/ImportSettingsPanel";
import { AssetBrowserPanel } from "./panels/AssetBrowserPanel";
import { ConsolePanel } from "./panels/ConsolePanel";
import { HierarchyPanel } from "./panels/HierarchyPanel";
import { InspectorPanel } from "./panels/InspectorPanel";
import { MaterialPanel } from "./panels/MaterialPanel";
import { ProfilerPanel } from "./panels/ProfilerPanel";
import { TimelinePanel } from "./panels/TimelinePanel";
import { VisualScriptPanel, type VisualScriptPanelSnapshot } from "./panels/VisualScriptPanel";
import { createProjectNode, type EditorAssetRecord, type EditorImportSettings, type EditorProject, type EditorProjectNode, type EditorProjectPrefab, ProjectSerializer } from "./project/ProjectSerializer";
import { EditorViewport } from "./viewport/EditorViewport";

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
  readonly localizationAccessibility: EditorLocalizationAccessibilityFixture;
  readonly featureEvidence: {
    readonly v4StarterAvailable: boolean;
    readonly importedAssets: number;
    readonly editedMaterials: number;
    readonly lights: number;
    readonly cameras: number;
    readonly physicsBodies: number;
    readonly scripts: number;
    readonly localizationHotSwap: boolean;
    readonly rtlLocaleDirection: boolean;
    readonly accessibilityFocusOrder: boolean;
    readonly accessibilityContrast: boolean;
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

declare global {
  interface Window {
    __GALILEO3D_EDITOR_APP__?: {
      getState(): EditorAppState;
      shell: EditorShell;
    };
  }
}

export class EditorShell {
  readonly runtime = new EditorRuntime({ stateStorage: browserEditorStateStorage() });
  readonly serializer = new ProjectSerializer();
  readonly plugins = new EditorPluginHost();
  readonly exporter = new StaticProjectExporter();
  readonly prefabRegistry = new PrefabRegistry<EditorProjectNode>();
  scene: Scene;
  project: EditorProject;
  viewport?: EditorViewport;
  frameCount = 0;

  private readonly root: HTMLElement;
  private readonly panels: {
    hierarchy: HierarchyPanel;
    inspector: InspectorPanel;
    assets: AssetBrowserPanel;
    importSettings: ImportSettingsPanel;
    profiler: ProfilerPanel;
    timeline: TimelinePanel;
    material: MaterialPanel;
    visualScript: VisualScriptPanel;
    console: ConsolePanel;
  };
  private savedProjectJson = "";
  private exportedProject?: StaticExportResult;
  private status: EditorAppState["status"] = "booting";
  private error: string | undefined;
  private dirty = false;
  private readonly messages: EditorConsoleMessage[] = [];

  constructor(root: HTMLElement) {
    this.root = root;
    this.project = this.serializer.createDefaultProject();
    this.syncPrefabRegistry();
    const built = this.serializer.buildScene(this.project);
    this.scene = built.scene;
    this.runtime.select(["node-hero"]);
    this.plugins.register({
      id: "galileo.default-authoring",
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
      console: new ConsolePanel(this)
    };
  }

  async mount(): Promise<void> {
    this.root.innerHTML = `
      <header class="editor-topbar">
        <strong>Galileo3D Editor</strong>
        <select data-action="command-menu" aria-label="Command menu">
          <option value="">Command</option>
          <option value="new-project">New Project</option>
          <option value="new-v4-starter">V4 Starter Project</option>
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
        <button data-action="new-v4-starter">V4 Starter</button>
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
    this.viewport = new EditorViewport(this);
    this.root.querySelector(".center-stage")?.append(this.viewport.element);
    this.root.querySelector(".right-rail")?.append(this.panels.inspector.element, this.panels.material.element, this.panels.timeline.element, this.panels.visualScript.element, this.panels.profiler.element, this.panels.console.element);
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
    window.addEventListener("keydown", (event) => this.handleShortcut(event));
    await this.viewport.initialize();
    this.addConsoleMessage("info", "Editor shell initialized with WebGL2 viewport.");
    this.saveProject();
    this.status = "ready";
    this.refresh();
  }

  refresh(): void {
    this.frameCount += 1;
    this.panels.hierarchy.render();
    this.panels.assets.render();
    this.panels.importSettings.render();
    this.panels.inspector.render();
    this.panels.material.render();
    this.panels.timeline.render();
    this.panels.visualScript.render();
    this.viewport?.render();
    this.panels.profiler.render();
    this.panels.console.render();
    const status = this.root.querySelector<HTMLElement>('[data-role="status"]');
    if (status) {
      status.textContent = `${this.dirty ? "Unsaved" : "Saved"} | ${this.runtime.mode} | ${this.project.scene.nodes.length} nodes | ${this.project.assets.length} assets | ${this.project.prefabs.length} prefabs`;
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
    await this.commitProjectChange("Delete Asset", {
      ...this.project,
      assets: this.project.assets.filter((asset) => asset.id !== assetId),
      scene: {
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
    const command: Command = {
      name: "Place Asset",
      execute: () => parent.addChild(node),
      undo: () => parent.removeChild(node)
    };
    await this.runtime.executeCommand(command);
    this.scene.registerSubtree(node);
    this.project = {
      ...this.serializer.captureScene(this.scene, this.project),
      scene: {
        nodes: [
          ...this.serializer.captureScene(this.scene, this.project).scene.nodes.filter((candidate) => candidate.id !== node.id),
          createProjectNode({
            id: node.id,
            name: node.name,
            parentId: parent.id === "root" ? null : parent.id,
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
          })
        ]
      }
    };
    node.transform.setPosition(0.8, 0.25, 0);
    node.transform.setRotation(...importedRotation);
    node.transform.setScale(...importedScale);
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
    this.dirty = true;
  }

  async updateSelectedProjectNodeField(path: readonly string[], value: unknown): Promise<void> {
    const node = this.selectedProjectNode();
    if (!node) {
      return;
    }
    const before = readPath(node, path);
    await this.runtime.executeCommand({
      name: "Edit Project Field",
      execute: () => writePath(node, path, value),
      undo: () => writePath(node, path, before)
    });
    this.markDirty(`Edited ${path.join(".")}.`);
    this.refresh();
  }

  saveProject(): void {
    this.projectFromScene();
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
    this.project = this.serializer.parse(source);
    this.syncPrefabRegistry();
    const built = this.serializer.buildScene(this.project);
    this.scene = built.scene;
    this.runtime.select(this.project.scene.nodes[0] ? [this.project.scene.nodes[0].id] : []);
    this.dirty = false;
    this.addConsoleMessage("info", "Project loaded from JSON buffer.");
    this.refresh();
  }

  togglePlayMode(): void {
    if (this.runtime.mode === "edit") {
      this.saveProject();
      const bridge = new PlayModeBridge({
        capture: () => this.savedProjectJson,
        restore: (snapshot: string) => {
          this.project = this.serializer.parse(snapshot);
          const built = this.serializer.buildScene(this.project);
          this.scene = built.scene;
        }
      });
      this.runtime.enterPlayMode(bridge);
      this.addConsoleMessage("info", "Entered play mode with isolated edit snapshot.");
    } else {
      this.runtime.exitPlayMode({ restore: true });
      this.addConsoleMessage("info", "Exited play mode and restored edit state.");
    }
    this.refresh();
  }

  exportProject(): void {
    this.saveProject();
    this.exportedProject = this.exporter.export(this.project);
    const summary = this.root.querySelector<HTMLElement>('[data-role="export-summary"]');
    if (summary) {
      summary.textContent = this.exportedProject.files.map((file) => `${file.path} (${file.type})`).join("\n");
    }
    this.addConsoleMessage("info", "Static export generated without editor shell code.");
    this.refresh();
  }

  exportedFiles(): readonly { readonly path: string; readonly content: string; readonly type: string }[] {
    return this.exportedProject?.files ?? [];
  }

  async duplicateSelectedNode(): Promise<void> {
    const source = this.selectedProjectNode();
    if (!source) {
      return;
    }
    const node = new SceneNode({ id: `${source.id}-copy-${Date.now().toString(36)}`, name: `${source.name} Copy` });
    const parent = source.parentId ? this.scene.getNodeById(source.parentId) ?? this.scene.root : this.scene.root;
    node.transform.setPosition(source.transform.position[0] + 0.5, source.transform.position[1], source.transform.position[2]);
    node.transform.setRotation(...source.transform.rotation);
    node.transform.setScale(...source.transform.scale);
    await this.runtime.executeCommand({
      name: "Duplicate Node",
      execute: () => parent.addChild(node),
      undo: () => parent.removeChild(node)
    });
    this.scene.registerSubtree(node);
    this.project = {
      ...this.serializer.captureScene(this.scene, this.project),
      scene: {
        nodes: this.serializer.captureScene(this.scene, this.project).scene.nodes.map((candidate) => candidate.id === node.id
          ? {
              ...source,
              id: node.id,
              name: node.name,
              parentId: parent.id === "root" ? null : parent.id,
              transform: {
                position: [source.transform.position[0] + 0.5, source.transform.position[1], source.transform.position[2]],
                rotation: source.transform.rotation,
                scale: source.transform.scale
              }
            }
          : candidate)
      }
    };
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
    await this.commitProjectChange("Instantiate Prefab", {
      ...this.project,
      scene: {
        nodes: [...this.project.scene.nodes, ...nodes]
      }
    }, `Instantiated prefab ${prefab.name}.`);
    const built = this.serializer.buildScene(this.project);
    this.scene = built.scene;
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
    this.project = { ...this.project, scene: { nodes } };
    const built = this.serializer.buildScene(this.project);
    this.scene = built.scene;
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
    this.project = this.serializer.createDefaultProject();
    this.syncPrefabRegistry();
    const built = this.serializer.buildScene(this.project);
    this.scene = built.scene;
    this.runtime.clearHistory();
    this.runtime.select(["node-hero"]);
    this.dirty = true;
    this.addConsoleMessage("info", "Created new project.");
    this.refresh();
  }

  newV4StarterProject(): void {
    this.project = this.serializer.createV4StarterProject();
    this.syncPrefabRegistry();
    const built = this.serializer.buildScene(this.project);
    this.scene = built.scene;
    this.runtime.clearHistory();
    this.runtime.select(["node-v4-fox"]);
    this.dirty = true;
    this.addConsoleMessage("info", "Created V4 starter project with imported asset, light, camera, physics, scripting, and export settings.");
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
      localizationAccessibility: sampleLocalizationAccessibilityFixture({ assetCount: this.project.assets.length }),
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
    if (action === "new-v4-starter") this.newV4StarterProject();
    if (action === "save-project") this.saveProject();
    if (action === "load-project") this.loadProject();
    if (action === "toggle-play") this.togglePlayMode();
    if (action === "export-project") this.exportProject();
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

  private markDirty(message: string): void {
    this.dirty = true;
    this.addConsoleMessage("info", message);
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
    const localizationAccessibility = sampleLocalizationAccessibilityFixture({ assetCount: this.project.assets.length });
    const picking = this.runtime.pickingSnapshot();
    const visualScripting = this.panels.visualScript.snapshot();
    return {
      v4StarterAvailable: true,
      importedAssets: this.project.assets.filter((asset) => asset.type === "gltf").length,
      editedMaterials: nodes.filter((node) => node.material.name !== "Default Material" && node.material.baseColor.length > 0).length,
      lights: nodes.filter((node) => node.light.kind !== "none" && node.light.intensity > 0).length,
      cameras: nodes.filter((node) => node.camera.enabled).length,
      physicsBodies: nodes.filter((node) => node.physics.body !== "none").length,
      scripts: nodes.filter((node) => node.script.enabled && node.script.behavior.length > 0).length,
      localizationHotSwap: localizationAccessibility.hotSwapLocale.directionChanged,
      rtlLocaleDirection: localizationAccessibility.rtlLocaleCount > 0 && localizationAccessibility.samples.some((sample) => sample.direction === "rtl"),
      accessibilityFocusOrder: localizationAccessibility.accessibility.focusWalk.length >= 3,
      accessibilityContrast: localizationAccessibility.accessibility.aaContrastPasses,
      oldBranchGpuPickingPort: picking.source === "origin-master-gpu-picking-adapted",
      gpuPickingColorIdEncoding: picking.evidence.colorIdEncoding && picking.evidence.colorIdDecoding,
      gpuPickingRaycastFallback: picking.evidence.raycastFallback && picking.blockedClaims.includes("production GPU framebuffer picking pass"),
      oldBranchVisualScriptingPort: visualScripting.evidence.oldCodebasePort,
      editorVisibleVisualGraph: visualScripting.evidence.editorVisibleGraph,
      visualScriptingCatalogExecution: visualScripting.evidence.deterministicExecution && visualScripting.evidence.blockedUnityUnrealVisualScriptingParity,
      staticExportWithoutEditorCode: (this.exportedProject?.files.find((file) => file.path === "runtime.js")?.content ?? "").includes("__GALILEO3D_EXPORTED_PROJECT__") &&
        !(this.exportedProject?.files.some((file) => file.content.includes("EditorShell") || file.content.includes("__GALILEO3D_EDITOR_APP__")) ?? true)
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
    transform: {
      ...node.transform,
      position: [node.transform.position[0] + 0.75, node.transform.position[1], node.transform.position[2]]
    }
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
