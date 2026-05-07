import { EditorPluginHost, EditorRuntime, PlayModeBridge, type Command } from "@galileo3d/editor-runtime";
import { Scene, SceneNode } from "@galileo3d/scene";
import { StaticProjectExporter, type StaticExportResult } from "./export/StaticProjectExporter";
import { ImportSettingsPanel } from "./import/ImportSettingsPanel";
import { AssetBrowserPanel } from "./panels/AssetBrowserPanel";
import { HierarchyPanel } from "./panels/HierarchyPanel";
import { InspectorPanel } from "./panels/InspectorPanel";
import { ProfilerPanel } from "./panels/ProfilerPanel";
import { TimelinePanel } from "./panels/TimelinePanel";
import { createProjectNode, type EditorAssetRecord, type EditorImportSettings, type EditorProject, type EditorProjectNode, ProjectSerializer } from "./project/ProjectSerializer";
import { EditorViewport } from "./viewport/EditorViewport";

export interface EditorAppState {
  readonly status: "booting" | "ready" | "error";
  readonly mode: string;
  readonly selectedNodeId: string | null;
  readonly nodeCount: number;
  readonly assetCount: number;
  readonly savedProjectJson: string;
  readonly exportedFileCount: number;
  readonly pluginPanels: readonly string[];
  readonly timeline: {
    readonly playback: "playing" | "paused";
    readonly scrubTime: number;
    readonly loop: boolean;
    readonly assetCount: number;
  };
  readonly error?: string;
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
  readonly runtime = new EditorRuntime();
  readonly serializer = new ProjectSerializer();
  readonly plugins = new EditorPluginHost();
  readonly exporter = new StaticProjectExporter();
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
  };
  private savedProjectJson = "";
  private exportedProject?: StaticExportResult;
  private status: EditorAppState["status"] = "booting";
  private error: string | undefined;

  constructor(root: HTMLElement) {
    this.root = root;
    this.project = this.serializer.createDefaultProject();
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
        { id: "profiler", title: "Profiler", order: 4 }
      ],
      tools: [{ id: "move", title: "Move" }],
      importers: [{ id: "gltf", label: "glTF 2.0", extensions: [".gltf", ".glb"] }],
      scriptingNodes: [{ id: "spin-behavior", title: "Spin Behavior", category: "Transform" }]
    });
    this.panels = {
      hierarchy: new HierarchyPanel(this),
      inspector: new InspectorPanel(this),
      assets: new AssetBrowserPanel(this),
      importSettings: new ImportSettingsPanel(this),
      profiler: new ProfilerPanel(this),
      timeline: new TimelinePanel(this)
    };
  }

  async mount(): Promise<void> {
    this.root.innerHTML = `
      <header class="editor-topbar">
        <strong>Galileo3D Editor</strong>
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
    this.root.querySelector(".right-rail")?.append(this.panels.inspector.element, this.panels.timeline.element, this.panels.profiler.element);
    this.root.addEventListener("click", (event) => {
      const action = (event.target as HTMLElement).dataset.action;
      if (action === "save-project") this.saveProject();
      if (action === "load-project") this.loadProject();
      if (action === "toggle-play") this.togglePlayMode();
      if (action === "export-project") this.exportProject();
    });
    await this.viewport.initialize();
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
    this.panels.timeline.render();
    this.viewport?.render();
    this.panels.profiler.render();
    const status = this.root.querySelector<HTMLElement>('[data-role="status"]');
    if (status) {
      status.textContent = `${this.runtime.mode} | ${this.project.scene.nodes.length} nodes | ${this.project.assets.length} assets`;
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

  async renameNode(nodeId: string, name: string): Promise<void> {
    const node = this.scene.getNodeById(nodeId);
    if (!node) {
      return;
    }
    await this.runtime.editInspectedProperty(node, ["name"], name);
    this.projectFromScene();
    this.refresh();
  }

  addAsset(asset: EditorAssetRecord): void {
    this.project = { ...this.project, assets: [...this.project.assets, asset] };
    this.refresh();
  }

  async placeAsset(assetId: string): Promise<void> {
    const asset = this.project.assets.find((candidate) => candidate.id === assetId);
    if (!asset) {
      return;
    }
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
            material: { name: `${asset.name} Material`, baseColor: "#b98cff", metallic: 0, roughness: 0.5 }
          })
        ]
      }
    };
    node.transform.setPosition(0.8, 0.25, 0);
    this.selectNode(node.id);
  }

  updateImportSetting<TKey extends keyof EditorImportSettings>(key: TKey, value: EditorImportSettings[TKey]): void {
    this.project = {
      ...this.project,
      importSettings: {
        ...this.project.importSettings,
        [key]: value
      }
    };
    this.refresh();
  }

  projectFromScene(): void {
    this.project = this.serializer.captureScene(this.scene, this.project);
  }

  saveProject(): void {
    this.projectFromScene();
    this.savedProjectJson = this.serializer.serialize(this.project);
    const buffer = this.root.querySelector<HTMLTextAreaElement>('[data-role="project-buffer"]');
    if (buffer) {
      buffer.value = this.savedProjectJson;
    }
  }

  loadProject(): void {
    const buffer = this.root.querySelector<HTMLTextAreaElement>('[data-role="project-buffer"]');
    const source = buffer?.value || this.savedProjectJson;
    this.project = this.serializer.parse(source);
    const built = this.serializer.buildScene(this.project);
    this.scene = built.scene;
    this.runtime.select(this.project.scene.nodes[0] ? [this.project.scene.nodes[0].id] : []);
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
    } else {
      this.runtime.exitPlayMode({ restore: true });
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
    this.refresh();
  }

  getState(): EditorAppState {
    return {
      status: this.status,
      mode: this.runtime.mode,
      selectedNodeId: String(this.runtime.currentSelection()[0] ?? "") || null,
      nodeCount: this.project.scene.nodes.length,
      assetCount: this.project.assets.length,
      savedProjectJson: this.savedProjectJson,
      exportedFileCount: this.exportedProject?.files.length ?? 0,
      pluginPanels: this.plugins.snapshot().panels.map((panel) => panel.id),
      timeline: this.panels.timeline.snapshot(),
      ...(this.error ? { error: this.error } : {})
    };
  }

  fail(error: unknown): void {
    this.status = "error";
    this.error = error instanceof Error ? error.stack ?? error.message : String(error);
  }
}
