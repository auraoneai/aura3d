import { TimelineModel, type TimelineModelConfig } from "./TimelineModel";
import type { TimelineRuntimeBindingConfig } from "./TimelineRuntimeBridge";

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
  readonly activeTool?: string;
  readonly activeTimelineId?: string | null;
  readonly playMode?: "edit" | "play" | "paused";
}

export interface EditorProjectDocument {
  readonly schema: "a3d-editor-project";
  readonly version?: number;
  readonly name: string;
  readonly nodes: readonly unknown[];
  readonly assets?: readonly (string | EditorProjectAssetDocument)[];
  readonly timelines?: readonly EditorProjectTimelineDocument[];
  readonly visualGraphs?: readonly EditorProjectVisualGraphDocument[];
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
  const normalized = validateEditorProject(project);
  return `${JSON.stringify(normalized, null, 2)}\n`;
}

export function parseEditorProject(text: string): EditorProjectDocument {
  const parsed = JSON.parse(text) as EditorProjectDocument;
  return validateEditorProject(parsed);
}

export function validateEditorProject(project: EditorProjectDocument): EditorProjectDocument {
  if (!isRecord(project)) throw new Error("Editor project document must be an object.");
  if (project.schema !== "a3d-editor-project") throw new Error("Unsupported editor project schema.");
  if (typeof project.name !== "string" || !project.name.trim()) throw new Error("Editor project name is required.");
  if (!Array.isArray(project.nodes)) throw new Error("Editor project nodes must be an array.");
  validateAssets(project.assets ?? []);
  validateTimelines(project.timelines ?? []);
  validateVisualGraphs(project.visualGraphs ?? []);
  return project;
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

function assertStringArray(values: readonly string[] | undefined, label: string): void {
  if (values === undefined) return;
  if (!Array.isArray(values) || values.some((value) => !value.trim())) {
    throw new Error(`Editor project ${label} must be non-empty strings.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
