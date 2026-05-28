import { createPromptHash } from "./AuraPromptProvenance.js";
import { diagnostic, type AuraSceneValidationIssue } from "./AuraSceneValidator.js";

export interface AuraScenePatchOperation {
  readonly id: string;
  readonly op: "merge" | "replace" | "add" | "remove";
  readonly targetKind: "object" | "material" | "lighting" | "camera" | "timeline" | "vfx";
  readonly targetId: string;
  readonly value?: unknown;
}

export interface AuraScenePatch {
  readonly patchId: string;
  readonly sceneId?: string;
  readonly prompt?: string;
  readonly provider?: string;
  readonly model?: string;
  readonly generatedAt?: string;
  readonly createdAt?: string;
  readonly operations?: readonly AuraScenePatchOperation[];
  readonly objects?: readonly Record<string, unknown>[];
  readonly vfx?: readonly Record<string, unknown>[];
  readonly cameras?: readonly Record<string, unknown>[];
  readonly materials?: readonly Record<string, unknown>[];
  readonly lighting?: readonly Record<string, unknown>[];
  readonly timeline?: Record<string, unknown>;
}

export interface AuraSceneChangeRecord {
  readonly path: string;
  readonly before: unknown;
  readonly after: unknown;
}

export interface AuraScenePatchResult<TScene = unknown> {
  readonly scene: TScene;
  readonly issues: readonly AuraSceneValidationIssue[];
  readonly applied: readonly string[];
  readonly changes: readonly AuraSceneChangeRecord[];
  readonly beforeSummary: string;
  readonly afterSummary: string;
}

export interface AuraScenePatchFailure extends Error {
  readonly code: "AURA_SCENE_PATCH_TARGET_MISSING";
  readonly diagnostics: readonly AuraSceneValidationIssue[];
}

export function applyScenePatch<TScene>(scene: TScene, patch: AuraScenePatch): AuraScenePatchResult<TScene> {
  const next = clone(scene);
  const changes: AuraSceneChangeRecord[] = [];
  const diagnostics: AuraSceneValidationIssue[] = [];

  if (patch.operations) applyOperationPatch(next, patch, changes, diagnostics);
  applyStructuredPatch(next, patch, changes, diagnostics);

  if (diagnostics.some((entry) => entry.severity === "error")) throw createPatchFailure(diagnostics);
  appendPatchProvenance(next, patch, changes.length);
  return {
    scene: next,
    issues: [],
    applied: patch.operations?.map((operation) => operation.id) ?? [patch.patchId],
    changes,
    beforeSummary: summarizeScenePatchState(scene),
    afterSummary: summarizeScenePatchState(next)
  };
}

function applyStructuredPatch(scene: unknown, patch: AuraScenePatch, changes: AuraSceneChangeRecord[], diagnostics: AuraSceneValidationIssue[]): void {
  applyEntityUpdates(scene, patch.objects ?? [], changes, diagnostics);
  applyListUpdates(scene, "vfx", patch.vfx ?? [], changes, diagnostics);
  applyListUpdates(scene, "cameras", patch.cameras ?? [], changes, diagnostics);
  applyListUpdates(scene, "materials", patch.materials ?? [], changes, diagnostics);
  applyLightingUpdates(scene, patch.lighting ?? [], changes, diagnostics);
  applyTimelineUpdate(scene, patch.timeline, changes);
}

function applyEntityUpdates(scene: unknown, updates: readonly Record<string, unknown>[], changes: AuraSceneChangeRecord[], diagnostics: AuraSceneValidationIssue[]): void {
  if (!isRecord(scene)) return;
  for (const update of updates) {
    const id = String(update.id);
    const objectList = Array.isArray(scene.objects) ? scene.objects : [];
    const characterList = Array.isArray(scene.characters) ? scene.characters : [];
    const targetList = objectList.some((entry) => isRecord(entry) && entry.id === id) ? "objects" : characterList.some((entry) => isRecord(entry) && entry.id === id) ? "characters" : undefined;
    if (!targetList) {
      diagnostics.push(diagnostic(`objects[${id}]`, "AURA_SCENE_PATCH_TARGET_MISSING", "error", `Patch target '${id}' was not found.`, "Use a stable id from the current scene."));
      continue;
    }
    applyListUpdates(scene, targetList, [update], changes, diagnostics);
  }
}

function applyOperationPatch(scene: unknown, patch: AuraScenePatch, changes: AuraSceneChangeRecord[], diagnostics: AuraSceneValidationIssue[]): void {
  for (const operation of patch.operations ?? []) {
    const collection = operation.targetKind === "object" ? "objects" : operation.targetKind === "camera" ? "cameras" : operation.targetKind === "material" ? "materials" : operation.targetKind === "vfx" ? "vfx" : undefined;
    if (collection) {
      applyListUpdates(scene, collection, [{ id: operation.targetId, ...(isRecord(operation.value) ? operation.value : {}) }], changes, diagnostics);
    }
  }
}

function applyListUpdates(
  scene: unknown,
  listName: string,
  updates: readonly Record<string, unknown>[],
  changes: AuraSceneChangeRecord[],
  diagnostics: AuraSceneValidationIssue[],
  options: { readonly onlyIfMissingIn?: string } = {}
): void {
  if (!isRecord(scene)) return;
  if (options.onlyIfMissingIn && hasAnyTarget(scene[options.onlyIfMissingIn], updates)) return;
  const list = scene[listName];
  if (!Array.isArray(list)) return;
  for (const update of updates) {
    const id = String(update.id);
    const index = list.findIndex((entry) => isRecord(entry) && entry.id === id);
    if (index < 0) {
      if (!options.onlyIfMissingIn) diagnostics.push(diagnostic(`${listName}[${id}]`, "AURA_SCENE_PATCH_TARGET_MISSING", "error", `Patch target '${id}' was not found.`, "Use a stable id from the current scene."));
      continue;
    }
    const before = list[index];
    const after = deepMerge(before, update);
    list[index] = after;
    collectChanges(`${listName}[${id}]`, before, after, changes);
  }
}

function applyLightingUpdates(scene: unknown, updates: readonly Record<string, unknown>[], changes: AuraSceneChangeRecord[], diagnostics: AuraSceneValidationIssue[]): void {
  if (!isRecord(scene) || !isRecord(scene.lighting)) return;
  for (const update of updates) {
    const id = String(update.id);
    const key = isRecord(scene.lighting.key) && scene.lighting.key.id === id ? "key" : isRecord(scene.lighting.rim) && scene.lighting.rim.id === id ? "rim" : undefined;
    if (!key) {
      diagnostics.push(diagnostic(`lighting[${id}]`, "AURA_SCENE_PATCH_TARGET_MISSING", "error", `Lighting target '${id}' was not found.`, "Use key or rim light IDs from the scene."));
      continue;
    }
    const before = scene.lighting[key];
    const after = deepMerge(before, update);
    scene.lighting[key] = after;
    collectChanges(`lighting.${key}`, before, after, changes);
  }
}

function applyTimelineUpdate(scene: unknown, update: Record<string, unknown> | undefined, changes: AuraSceneChangeRecord[]): void {
  if (!isRecord(scene) || !isRecord(scene.timeline) || !update) return;
  if (typeof update.durationSeconds === "number") {
    pushChange("timeline.durationSeconds", scene.timeline.durationSeconds, update.durationSeconds, changes);
    scene.timeline.durationSeconds = update.durationSeconds;
  }
  if (Array.isArray(update.cues)) {
    const before = Array.isArray(scene.timeline.cues) ? scene.timeline.cues : [];
    scene.timeline.cues = [...before, ...update.cues];
    pushChange("timeline.cues", before, scene.timeline.cues, changes);
  }
}

function appendPatchProvenance(scene: unknown, patch: AuraScenePatch, changeCount: number): void {
  if (!isRecord(scene)) return;
  const provenance = isRecord(scene.provenance) ? scene.provenance : {};
  const patches = Array.isArray(provenance.patches) ? provenance.patches : [];
  scene.provenance = {
    ...provenance,
    patches: [
      ...patches,
      {
        patchId: patch.patchId,
        changeCount,
        promptHash: patch.prompt ? createPromptHash(patch.prompt) : "sha256:structured-patch",
        provider: patch.provider ?? provenance.provider ?? "mock",
        generatedAt: patch.generatedAt ?? patch.createdAt ?? new Date().toISOString()
      }
    ]
  };
}

function collectChanges(prefix: string, before: unknown, after: unknown, changes: AuraSceneChangeRecord[]): void {
  if (!isRecord(before) || !isRecord(after)) {
    pushChange(prefix, before, after, changes);
    return;
  }
  for (const [key, afterValue] of Object.entries(after)) {
    const beforeValue = before[key];
    if (isRecord(beforeValue) && isRecord(afterValue)) collectChanges(`${prefix}.${key}`, beforeValue, afterValue, changes);
    else if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) pushChange(`${prefix}.${key}`, beforeValue, afterValue, changes);
  }
}

function pushChange(path: string, before: unknown, after: unknown, changes: AuraSceneChangeRecord[]): void {
  if (JSON.stringify(before) !== JSON.stringify(after)) changes.push({ path, before, after });
}

function hasAnyTarget(list: unknown, updates: readonly Record<string, unknown>[]): boolean {
  return Array.isArray(list) && updates.some((update) => list.some((entry) => isRecord(entry) && entry.id === update.id));
}

function deepMerge(before: unknown, update: Record<string, unknown>): Record<string, unknown> {
  const base = isRecord(before) ? before : {};
  const output: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(update)) {
    if (key === "id") {
      output[key] = value;
      continue;
    }
    output[key] = isRecord(value) && isRecord(output[key]) ? deepMerge(output[key], value) : value;
  }
  return output;
}

function summarizeScenePatchState(scene: unknown): string {
  if (!isRecord(scene)) return "unknown scene";
  const objects = Array.isArray(scene.objects) ? scene.objects.length : 0;
  const characters = Array.isArray(scene.characters) ? scene.characters.length : 0;
  const patches = isRecord(scene.provenance) && Array.isArray(scene.provenance.patches) ? scene.provenance.patches.length : 0;
  return `${String(scene.sceneId ?? "scene")}: ${objects + characters} entities, ${patches} patches`;
}

function createPatchFailure(diagnostics: readonly AuraSceneValidationIssue[]): AuraScenePatchFailure {
  const error = new Error("AuraScenePatch targets missing stable ids.") as AuraScenePatchFailure;
  Object.defineProperty(error, "code", { value: "AURA_SCENE_PATCH_TARGET_MISSING", enumerable: true });
  Object.defineProperty(error, "diagnostics", { value: diagnostics, enumerable: true });
  return error;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
