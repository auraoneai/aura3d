import { TimelineModel, type TimelineModelConfig } from "./TimelineModel";
import type { TimelineRuntimeBindingConfig } from "./TimelineRuntimeBridge";
import type { ShaderGraphDocument } from "@aura3d/rendering/shader-graph";

/** The editor envelope is versioned independently of the host project's version. */
export const EDITOR_PROJECT_FORMAT_VERSION = 2;

export interface EditorProjectAssetDocument {
  readonly id: string;
  readonly name: string;
  readonly uri?: string;
  readonly type?: "gltf" | "glb" | "image" | "audio" | "material" | "unknown";
  readonly source?: string;
  readonly license?: string;
  readonly clips?: readonly string[];
  readonly morphTargets?: readonly string[];
  readonly diagnostics?: readonly string[];
}

export interface EditorProjectTimelineDocument extends TimelineModelConfig {
  readonly bindings?: readonly TimelineRuntimeBindingConfig[];
  readonly evidence?: {
    readonly authoredInEditor?: boolean;
    readonly runtimeReplay?: boolean;
    readonly animationEvents?: boolean;
  };
}

export interface EditorProjectVisualGraphDocument {
  readonly id: string;
  readonly name: string;
  readonly nodes: readonly unknown[];
  readonly edges: readonly unknown[];
  readonly runtimeBindings?: readonly {
    readonly nodeId: string;
    readonly targetId: string;
    readonly event?: string;
  }[];
}

export interface EditorProjectStateDocument {
  readonly selectedNodeId?: string | number | null;
  /** Ordered multi-selection; selectedNodeId remains the primary-selection fallback. */
  readonly selectedNodeIds?: readonly (string | number)[];
  /** Legacy single selection. Version 1 documents are migrated to selectedResourceIds. */
  readonly selectedResourceId?: string | null;
  readonly selectedResourceIds?: readonly string[];
  readonly activeShaderGraphId?: string | null;
  readonly selectedShaderNodeId?: string | null;
  readonly activeTool?: string;
  readonly activeTimelineId?: string | null;
  readonly playMode?: "edit" | "play" | "paused";
}

/** A graph can be saved while invalid so that unfinished edits are not lost. */
export type EditorProjectShaderBinding =
  | { readonly kind: "uniform"; readonly value: number | boolean | readonly number[] }
  | { readonly kind: "texture"; readonly assetId: string };

export interface EditorProjectShaderGraphDocument {
  readonly id: string;
  readonly name: string;
  readonly graph: ShaderGraphDocument;
  readonly materialId?: string;
  /** Resource declarations are in the graph; these are the editor's chosen values/assets. */
  readonly bindings?: Readonly<Record<string, EditorProjectShaderBinding>>;
}

export interface EditorProjectDocument {
  readonly schema: "a3d-editor-project";
  readonly version?: number;
  readonly editorFormatVersion?: number;
  readonly name: string;
  readonly nodes: readonly unknown[];
  readonly assets?: readonly (string | EditorProjectAssetDocument)[];
  readonly timelines?: readonly EditorProjectTimelineDocument[];
  readonly visualGraphs?: readonly EditorProjectVisualGraphDocument[];
  readonly shaderGraphs?: readonly EditorProjectShaderGraphDocument[];
  readonly editor?: EditorProjectStateDocument;
  readonly evidence?: {
    readonly serializedBy?: "editor-runtime" | "editor-app" | string;
    readonly roundTripReady?: boolean;
    readonly browserWorkflowReady?: boolean;
  };
}

export interface EditorProjectEvidence {
  readonly kind: "aura-editor-project-evidence";
  readonly schema: EditorProjectDocument["schema"];
  readonly version: number | null;
  readonly name: string;
  readonly nodeCount: number;
  readonly assetCount: number;
  readonly timelineCount: number;
  readonly visualGraphCount: number;
  readonly timelineBindingCount: number;
  readonly signalMarkerCount: number;
  readonly typedAssetEvidenceCount: number;
  readonly hasAnimationTimeline: boolean;
  readonly hasRuntimeReplayBindings: boolean;
  readonly hasVisualGraphBindings: boolean;
  readonly roundTripReady: boolean;
  readonly evidence: {
    readonly projectSerialization: true;
    readonly timelineSerialization: boolean;
    readonly visualGraphSerialization: boolean;
    readonly runtimeReplayBindings: boolean;
    readonly sourceLicenseAssetEvidence: boolean;
  };
}

export function serializeEditorProject(project: EditorProjectDocument): string {
  const normalized = validateEditorProject(migrateEditorProject(project));
  return `${JSON.stringify(normalized, null, 2)}\n`;
}

export function parseEditorProject(text: string): EditorProjectDocument {
  const parsed: unknown = JSON.parse(text);
  return validateEditorProject(migrateEditorProject(parsed));
}

/** Migrate only the editor envelope; the existing project version belongs to its host. */
export function migrateEditorProject(value: unknown): EditorProjectDocument {
  if (!isRecord(value)) throw new Error("Editor project document must be an object.");
  const version = value.editorFormatVersion ?? 1;
  if (version !== 1 && version !== EDITOR_PROJECT_FORMAT_VERSION) {
    throw new Error(`Unsupported editor project format version: ${String(version)}.`);
  }
  if (version === EDITOR_PROJECT_FORMAT_VERSION) return value as unknown as EditorProjectDocument;
  const editor = value.editor;
  if (editor !== undefined && !isRecord(editor)) throw new Error("Editor project editor state must be an object.");
  const migratedEditor = editor ? { ...editor } : undefined;
  if (migratedEditor && migratedEditor.selectedResourceIds === undefined && migratedEditor.selectedResourceId != null) {
    migratedEditor.selectedResourceIds = [migratedEditor.selectedResourceId];
  }
  if (migratedEditor) delete migratedEditor.selectedResourceId;
  return {
    ...value,
    editorFormatVersion: EDITOR_PROJECT_FORMAT_VERSION,
    ...(migratedEditor ? { editor: migratedEditor } : {})
  } as unknown as EditorProjectDocument;
}

export function validateEditorProject(project: EditorProjectDocument): EditorProjectDocument {
  if (!isRecord(project)) throw new Error("Editor project document must be an object.");
  if (project.schema !== "a3d-editor-project") throw new Error("Unsupported editor project schema.");
  if (typeof project.name !== "string" || !project.name.trim()) throw new Error("Editor project name is required.");
  if (!Array.isArray(project.nodes)) throw new Error("Editor project nodes must be an array.");
  validateNodePivots(project.nodes);
  if (project.editorFormatVersion !== undefined && project.editorFormatVersion !== EDITOR_PROJECT_FORMAT_VERSION) {
    throw new Error(`Unsupported editor project format version: ${String(project.editorFormatVersion)}.`);
  }
  validateAssets(project.assets ?? []);
  validateTimelines(project.timelines ?? []);
  validateVisualGraphs(project.visualGraphs ?? []);
  validateShaderGraphs(project.shaderGraphs ?? []);
  validateEditorState(project.editor);
  return project;
}

function validateNodePivots(nodes: readonly unknown[]): void {
  for (const [index, node] of nodes.entries()) {
    if (!isRecord(node) || !isRecord(node.transform) || node.transform.pivot === undefined) continue;
    const pivot = node.transform.pivot;
    if (!Array.isArray(pivot) || pivot.length !== 3 || Array.from(pivot).some((value) => !Number.isFinite(value))) {
      throw new Error(`Editor project node ${index} transform.pivot must contain three finite numbers.`);
    }
  }
}

function validateShaderGraphs(graphs: readonly EditorProjectShaderGraphDocument[]): void {
  if (!Array.isArray(graphs)) throw new Error("Editor project shaderGraphs must be an array.");
  const ids = new Set<string>();
  for (const entry of graphs) {
    if (!isRecord(entry) || typeof entry.id !== "string" || !entry.id.trim() || ids.has(entry.id)) {
      throw new Error("Editor project shader graph ids must be non-empty and unique.");
    }
    ids.add(entry.id);
    if (typeof entry.name !== "string" || !entry.name.trim()) throw new Error(`Editor project shader graph name is required: ${entry.id}`);
    if (entry.materialId !== undefined && (typeof entry.materialId !== "string" || !entry.materialId.trim())) {
      throw new Error(`Editor project shader graph materialId must be non-empty: ${entry.id}`);
    }
    const graph = entry.graph;
    if (!isRecord(graph) || graph.version !== 1 || (graph.stage !== "material" && graph.stage !== "compute") ||
        !Array.isArray(graph.nodes) || (graph.resources !== undefined && !Array.isArray(graph.resources)) ||
        (graph.outputs !== undefined && !isRecord(graph.outputs))) {
      throw new Error(`Invalid shader graph document: ${entry.id}`);
    }
    // Incomplete connections and compiler errors are valid drafts. Malformed
    // records, however, cannot be edited or displayed safely after loading.
    if (graph.nodes.some((node) => !isRecord(node) || typeof node.id !== "string" || !node.id.trim() ||
        typeof node.op !== "string" || typeof node.type !== "string" ||
        (node.inputs !== undefined && (!Array.isArray(node.inputs) || node.inputs.some((input) => typeof input !== "string"))) ||
        [node.name, node.resource, node.components].some((value) => value !== undefined && typeof value !== "string")) ||
        (Array.isArray(graph.resources) && graph.resources.some((resource) => !isRecord(resource) ||
          typeof resource.name !== "string" || !resource.name.trim() || typeof resource.kind !== "string")) ||
        (isRecord(graph.outputs) && Object.values(graph.outputs).some((id) => id !== undefined && typeof id !== "string"))) {
      throw new Error(`Invalid editable shader graph records: ${entry.id}`);
    }
    assertJsonValue(graph, `shader graph ${entry.id}`, new Set<object>());
    if (entry.bindings !== undefined) {
      if (!isRecord(entry.bindings)) throw new Error(`Shader graph bindings must be an object: ${entry.id}`);
      for (const [name, binding] of Object.entries(entry.bindings)) {
        if (!name.trim() || !isRecord(binding)) throw new Error(`Shader graph binding must have a name and value: ${entry.id}`);
        if (binding.kind === "texture") {
          if (typeof binding.assetId !== "string" || !binding.assetId.trim()) throw new Error(`Texture binding ${name} needs an asset id.`);
        } else if (binding.kind === "uniform") {
          const values = Array.isArray(binding.value) ? binding.value : [binding.value];
          if (values.length < 1 || values.length > 4 || values.some((value) =>
            typeof value !== "number" ? typeof value !== "boolean" || Array.isArray(binding.value) : !Number.isFinite(value))) {
            throw new Error(`Uniform binding ${name} needs finite scalar or vector values.`);
          }
        } else {
          throw new Error(`Shader graph binding ${name} has an unsupported kind.`);
        }
      }
    }
  }
}

function validateEditorState(editor: EditorProjectStateDocument | undefined): void {
  if (editor === undefined) return;
  if (!isRecord(editor)) throw new Error("Editor project editor state must be an object.");
  const selection = editor.selectedResourceIds;
  assertStringArray(selection, "selectedResourceIds");
  if (selection && new Set(selection).size !== selection.length) {
    throw new Error("Editor project selectedResourceIds must be unique.");
  }
  const isSelectionId = (value: unknown): value is string | number =>
    (typeof value === "string" && Boolean(value.trim())) || (typeof value === "number" && Number.isFinite(value));
  if (editor.selectedNodeId != null && !isSelectionId(editor.selectedNodeId)) {
    throw new Error("Editor project selectedNodeId must be a non-empty string, finite number or null.");
  }
  if (editor.selectedNodeIds !== undefined && (!Array.isArray(editor.selectedNodeIds) ||
      editor.selectedNodeIds.some((id) => !isSelectionId(id)) || new Set(editor.selectedNodeIds).size !== editor.selectedNodeIds.length)) {
    throw new Error("Editor project selectedNodeIds must contain unique, non-empty strings or finite numbers.");
  }
  for (const key of ["selectedResourceId", "activeShaderGraphId", "selectedShaderNodeId", "activeTimelineId"] as const) {
    const value = editor[key];
    if (value != null && (typeof value !== "string" || !value.trim())) {
      throw new Error(`Editor project ${key} must be a non-empty string or null.`);
    }
  }
  if (editor.activeTool !== undefined && (typeof editor.activeTool !== "string" || !editor.activeTool.trim())) {
    throw new Error("Editor project activeTool must be a non-empty string.");
  }
  if (editor.playMode !== undefined && editor.playMode !== "edit" && editor.playMode !== "play" && editor.playMode !== "paused") {
    throw new Error("Editor project playMode must be edit, play or paused.");
  }
}

/** Reject values JSON.stringify would silently drop or turn into null. */
function assertJsonValue(value: unknown, label: string, ancestors: Set<object>): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (typeof value !== "object" || value === null || ancestors.has(value)) throw new Error(`Editor project ${label} must contain finite JSON values.`);
  ancestors.add(value);
  if (Array.isArray(value)) {
    for (const item of value) assertJsonValue(item, label, ancestors);
  } else {
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
      throw new Error(`Editor project ${label} must contain plain JSON objects.`);
    }
    // Optional object properties with an undefined value are legitimately omitted
    // by JSON; an undefined array element, by contrast, would silently become null.
    for (const item of Object.values(value)) if (item !== undefined) assertJsonValue(item, label, ancestors);
  }
  ancestors.delete(value);
}

export function collectEditorProjectEvidence(project: EditorProjectDocument): EditorProjectEvidence {
  const parsed = validateEditorProject(project);
  const timelines = parsed.timelines ?? [];
  const visualGraphs = parsed.visualGraphs ?? [];
  const timelineBindingCount = timelines.reduce((total, timeline) => total + (timeline.bindings?.length ?? 0), 0);
  const signalMarkerCount = timelines.reduce((total, timeline) => {
    return total + (timeline.tracks ?? []).reduce((trackTotal, track) => {
      if (track.type !== "signal") return trackTotal;
      return trackTotal + (track.clips?.length ?? 0);
    }, 0);
  }, 0);
  const typedAssetEvidenceCount = (parsed.assets ?? []).filter((asset) => {
    return typeof asset !== "string" && Boolean(asset.id && asset.name && asset.source && asset.license);
  }).length;
  const assetCount = parsed.assets?.length ?? 0;
  const hasAnimationTimeline = timelines.some((timeline) => (timeline.tracks ?? []).some((track) => track.type === "animation"));
  const hasVisualGraphBindings = visualGraphs.some((graph) => (graph.runtimeBindings?.length ?? 0) > 0);
  const hasRuntimeReplayBindings = timelineBindingCount > 0;
  return {
    kind: "aura-editor-project-evidence",
    schema: parsed.schema,
    version: parsed.version ?? null,
    name: parsed.name,
    nodeCount: parsed.nodes.length,
    assetCount,
    timelineCount: timelines.length,
    visualGraphCount: visualGraphs.length,
    timelineBindingCount,
    signalMarkerCount,
    typedAssetEvidenceCount,
    hasAnimationTimeline,
    hasRuntimeReplayBindings,
    hasVisualGraphBindings,
    roundTripReady: parsed.nodes.length > 0 && timelines.length > 0 && hasRuntimeReplayBindings,
    evidence: {
      projectSerialization: true,
      timelineSerialization: timelines.length > 0,
      visualGraphSerialization: visualGraphs.length > 0,
      runtimeReplayBindings: hasRuntimeReplayBindings || hasVisualGraphBindings,
      sourceLicenseAssetEvidence: assetCount > 0 && typedAssetEvidenceCount === assetCount
    }
  };
}

function validateAssets(assets: readonly (string | EditorProjectAssetDocument)[]): void {
  if (!Array.isArray(assets)) throw new Error("Editor project assets must be an array.");
  for (const asset of assets) {
    if (typeof asset === "string") {
      if (!asset.trim()) throw new Error("Editor project asset ids must be non-empty.");
      continue;
    }
    if (!asset.id.trim()) throw new Error("Editor project asset id is required.");
    if (!asset.name.trim()) throw new Error(`Editor project asset name is required: ${asset.id}`);
    assertStringArray(asset.clips, `asset clips for ${asset.id}`);
    assertStringArray(asset.morphTargets, `asset morphTargets for ${asset.id}`);
    assertStringArray(asset.diagnostics, `asset diagnostics for ${asset.id}`);
  }
}

function validateTimelines(timelines: readonly EditorProjectTimelineDocument[]): void {
  if (!Array.isArray(timelines)) throw new Error("Editor project timelines must be an array.");
  for (const timeline of timelines) {
    new TimelineModel(timeline);
    for (const binding of timeline.bindings ?? []) {
      if (!binding.targetId.trim()) throw new Error(`Timeline binding targetId is required for timeline ${timeline.id ?? timeline.name ?? "unnamed"}.`);
      if (binding.trackId !== undefined && !binding.trackId.trim()) throw new Error("Timeline binding trackId cannot be empty.");
      if (binding.trackName !== undefined && !binding.trackName.trim()) throw new Error("Timeline binding trackName cannot be empty.");
    }
  }
}

function validateVisualGraphs(graphs: readonly EditorProjectVisualGraphDocument[]): void {
  if (!Array.isArray(graphs)) throw new Error("Editor project visualGraphs must be an array.");
  for (const graph of graphs) {
    if (!graph.id.trim()) throw new Error("Editor project visual graph id is required.");
    if (!graph.name.trim()) throw new Error(`Editor project visual graph name is required: ${graph.id}`);
    if (!Array.isArray(graph.nodes)) throw new Error(`Editor project visual graph nodes must be an array: ${graph.id}`);
    if (!Array.isArray(graph.edges)) throw new Error(`Editor project visual graph edges must be an array: ${graph.id}`);
    for (const binding of graph.runtimeBindings ?? []) {
      if (!binding.nodeId.trim()) throw new Error(`Visual graph runtime binding nodeId is required: ${graph.id}`);
      if (!binding.targetId.trim()) throw new Error(`Visual graph runtime binding targetId is required: ${graph.id}`);
    }
  }
}

function assertStringArray(values: unknown, label: string): asserts values is readonly string[] | undefined {
  if (values === undefined) return;
  if (!Array.isArray(values) || values.some((value) => typeof value !== "string" || !value.trim())) {
    throw new Error(`Editor project ${label} must be non-empty strings.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
