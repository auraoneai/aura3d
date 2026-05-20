import type { Ray } from "@galileo3d/math";
import { CommandHistory } from "./CommandHistory";
import type { Command, CommandContext } from "./Command";
import { DiagnosticsOverlayModel, type EditorDiagnosticsInput, type EditorDiagnosticsSnapshot } from "./DiagnosticsOverlayModel";
import { normalizeGizmoSettings, type GizmoDrag, type GizmoSettings } from "./Gizmo";
import { EditorStateModel, type EditorStateSnapshot, type EditorStateStorage, type EditorViewportSettings } from "./EditorStateModel";
import { HierarchyModel, type HierarchyLikeNode, type HierarchyNodeDescriptor } from "./HierarchyModel";
import { InspectorModel, type InspectorEditableValue, type InspectorProperty } from "./InspectorModel";
import { MaterialVariantWorkflow, type MaterialVariantState } from "./MaterialVariantWorkflow";
import type { PlayModeBridge } from "./PlayModeBridge";
import { PickingService, type EditorPickHit, type EditorPickTarget, type EditorPickingEvidenceSnapshot } from "./PickingService";
import { PrefabRegistry, type EditorPrefabNodeBase } from "./PrefabRegistry";
import { RotateGizmo } from "./RotateGizmo";
import { ScaleGizmo } from "./ScaleGizmo";
import { Selection, type SelectionId } from "./Selection";
import { TranslateGizmo } from "./TranslateGizmo";
import type { TransformTarget } from "./commands/TransformCommand";

export type EditorMode = "edit" | "play" | "paused";

export interface EditorRuntimeSnapshot {
  readonly mode: EditorMode;
  readonly activeTool: string;
  readonly selection: readonly (string | number)[];
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoDepth: number;
  readonly redoDepth: number;
  readonly materialVariants: readonly MaterialVariantState[];
  readonly prefabCount: number;
  readonly picking: EditorPickingEvidenceSnapshot;
  readonly diagnostics: EditorDiagnosticsSnapshot;
  readonly gizmoSettings: GizmoSettings;
  readonly editorState: EditorStateSnapshot;
}

export interface EditorRuntimeOptions {
  readonly stateStorage?: EditorStateStorage;
  readonly stateStorageKey?: string;
}

export class EditorRuntime {
  readonly selection = new Selection();
  readonly history = new CommandHistory();
  readonly inspector = new InspectorModel();
  readonly hierarchy = new HierarchyModel();
  readonly materialVariants = new MaterialVariantWorkflow();
  readonly diagnostics = new DiagnosticsOverlayModel();
  readonly prefabs = new PrefabRegistry<EditorPrefabNodeBase>();
  readonly state: EditorStateModel;

  private readonly picking = new PickingService();
  private modeRef: EditorMode = "edit";
  private activeToolRef = "select";
  private gizmoSettingsRef: GizmoSettings;
  private disposed = false;
  private activePlayModeBridge: PlayModeBridge<unknown> | null = null;

  constructor(options: EditorRuntimeOptions = {}) {
    this.state = new EditorStateModel({ storage: options.stateStorage, storageKey: options.stateStorageKey });
    this.activeToolRef = this.state.activeTool;
    this.gizmoSettingsRef = this.state.gizmoSettings();
  }

  get mode(): EditorMode {
    return this.modeRef;
  }

  get activeTool(): string {
    return this.activeToolRef;
  }

  setTool(tool: string): void {
    this.assertEditable();
    const normalized = tool.trim();
    if (normalized.length === 0) {
      throw new Error("EditorRuntime tool name cannot be empty.");
    }
    this.state.setActiveTool(normalized);
    this.activeToolRef = normalized;
  }

  configureGizmos(settings: Partial<GizmoSettings>): GizmoSettings {
    this.assertEditable();
    this.gizmoSettingsRef = normalizeGizmoSettings({ ...this.gizmoSettingsRef, ...settings });
    this.state.configureFromGizmoSettings(this.gizmoSettingsRef);
    return this.gizmoSettingsRef;
  }

  gizmoSettings(): GizmoSettings {
    this.assertAlive();
    return this.gizmoSettingsRef;
  }

  configureViewportState(settings: Partial<EditorViewportSettings>): EditorStateSnapshot {
    this.assertEditable();
    this.state.configureViewport(settings);
    return this.state.snapshot();
  }

  editorStateSnapshot(): EditorStateSnapshot {
    this.assertAlive();
    return this.state.snapshot();
  }

  setMode(mode: EditorMode): void {
    this.assertAlive();
    if (this.activePlayModeBridge && mode === "edit") {
      this.exitPlayMode();
      return;
    }
    this.modeRef = mode;
  }

  pruneSelection(alive: (id: SelectionId) => boolean): void {
    this.assertEditable();
    this.selection.prune(alive);
  }

  currentSelection(): readonly SelectionId[] {
    this.assertAlive();
    return this.selection.current();
  }

  select(ids: readonly SelectionId[]): void {
    this.assertEditable();
    this.selection.set(ids);
  }

  clearSelection(): void {
    this.assertEditable();
    this.selection.clear();
  }

  async executeCommand(command: Command, context?: CommandContext): Promise<void> {
    this.assertEditable();
    await this.history.execute(command, context);
  }

  async executeTransaction(commands: readonly Command[], context?: CommandContext): Promise<void> {
    this.assertEditable();
    await this.history.executeTransaction(commands, context);
  }

  async undo(context?: CommandContext): Promise<void> {
    this.assertEditable();
    await this.history.undo(context);
  }

  async redo(context?: CommandContext): Promise<void> {
    this.assertEditable();
    await this.history.redo(context);
  }

  clearHistory(): void {
    this.assertEditable();
    this.history.clear();
  }

  inspect(target: object): readonly InspectorProperty[] {
    this.assertAlive();
    return this.inspector.describe(target);
  }

  async editInspectedProperty<T extends object>(
    target: T,
    path: readonly string[],
    value: InspectorEditableValue,
    context?: CommandContext
  ): Promise<void> {
    this.assertEditable();
    await this.history.execute(this.inspector.createSetPropertyCommand(target, path, value), context);
  }

  describeHierarchy(root: HierarchyLikeNode): HierarchyNodeDescriptor {
    this.assertAlive();
    return this.hierarchy.describe(root, new Set(this.selection.current()));
  }

  flattenHierarchy(root: HierarchyLikeNode): readonly HierarchyNodeDescriptor[] {
    this.assertAlive();
    return this.hierarchy.flatten(root, new Set(this.selection.current()));
  }

  setPickTargets(targets: readonly EditorPickTarget[]): void {
    this.assertEditable();
    this.picking.setTargets(targets);
  }

  configurePickingBuffer(width: number, height: number): EditorPickingEvidenceSnapshot {
    this.assertEditable();
    this.picking.resizePickingBuffer(width, height);
    return this.picking.snapshot();
  }

  pick(ray: Ray): EditorPickHit | undefined {
    this.assertAlive();
    return this.picking.pick(ray);
  }

  pickingSnapshot(): EditorPickingEvidenceSnapshot {
    this.assertAlive();
    return this.picking.snapshot();
  }

  async translateTarget(target: TransformTarget | undefined, input: GizmoDrag): Promise<void> {
    this.assertEditable();
    if (!target) {
      return;
    }
    const gizmo = new TranslateGizmo(this.history, this.gizmoSettingsRef);
    try {
      gizmo.setTarget(target);
      await gizmo.drag(input);
    } finally {
      gizmo.dispose();
    }
  }

  async rotateTarget(target: TransformTarget | undefined, input: GizmoDrag): Promise<void> {
    this.assertEditable();
    if (!target) {
      return;
    }
    const gizmo = new RotateGizmo(this.history, this.gizmoSettingsRef);
    try {
      gizmo.setTarget(target);
      await gizmo.drag(input);
    } finally {
      gizmo.dispose();
    }
  }

  async scaleTarget(target: TransformTarget | undefined, input: GizmoDrag): Promise<void> {
    this.assertEditable();
    if (!target) {
      return;
    }
    const gizmo = new ScaleGizmo(this.history, this.gizmoSettingsRef);
    try {
      gizmo.setTarget(target);
      await gizmo.drag(input);
    } finally {
      gizmo.dispose();
    }
  }

  updateDiagnostics(input: EditorDiagnosticsInput): EditorDiagnosticsSnapshot {
    this.assertAlive();
    return this.diagnostics.update(input);
  }

  diagnosticsSnapshot(): EditorDiagnosticsSnapshot {
    this.assertAlive();
    return this.diagnostics.snapshot();
  }

  registerMaterialVariants(assetId: string, variants: readonly string[], selected: string | null = null): MaterialVariantState {
    this.assertEditable();
    return this.materialVariants.register(assetId, variants, selected);
  }

  setMaterialVariant(assetId: string, variant: string | null): MaterialVariantState {
    this.assertEditable();
    return this.materialVariants.select(assetId, variant);
  }

  materialVariantState(assetId: string): MaterialVariantState {
    this.assertAlive();
    return this.materialVariants.state(assetId);
  }

  enterPlayMode(bridge: PlayModeBridge<unknown>): void {
    this.assertAlive();
    if (this.modeRef !== "edit" || this.activePlayModeBridge) {
      throw new Error("EditorRuntime can only enter play mode from edit mode.");
    }
    bridge.enter();
    this.activePlayModeBridge = bridge;
    this.modeRef = "play";
  }

  pausePlayMode(): void {
    this.assertAlive();
    if (this.modeRef !== "play") {
      throw new Error("EditorRuntime can only pause while play mode is active.");
    }
    this.modeRef = "paused";
  }

  resumePlayMode(): void {
    this.assertAlive();
    if (this.modeRef !== "paused") {
      throw new Error("EditorRuntime can only resume from paused play mode.");
    }
    this.modeRef = "play";
  }

  exitPlayMode({ restore = true } = {}): void {
    this.assertAlive();
    this.activePlayModeBridge?.exit({ restore });
    this.activePlayModeBridge = null;
    this.modeRef = "edit";
  }

  snapshot(): EditorRuntimeSnapshot {
    this.assertAlive();
    return {
      mode: this.modeRef,
      activeTool: this.activeToolRef,
      selection: this.selection.current(),
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
      undoDepth: this.history.undoDepth,
      redoDepth: this.history.redoDepth,
      materialVariants: this.materialVariants.snapshot(),
      prefabCount: this.prefabs.list().length,
      picking: this.picking.snapshot(),
      diagnostics: this.diagnostics.snapshot(),
      gizmoSettings: this.gizmoSettingsRef,
      editorState: this.state.snapshot()
    };
  }

  dispose(): void {
    this.activePlayModeBridge?.exit({ restore: true });
    this.activePlayModeBridge = null;
    this.selection.clear();
    this.history.clear();
    this.materialVariants.clear();
    this.diagnostics.clear();
    this.prefabs.clear();
    this.activeToolRef = "select";
    this.disposed = true;
  }

  private assertAlive(): void {
    if (this.disposed) {
      throw new Error("EditorRuntime has been disposed");
    }
  }

  private assertEditable(): void {
    this.assertAlive();
    if (this.modeRef !== "edit") {
      throw new Error("EditorRuntime edit commands can only run in edit mode.");
    }
  }
}
