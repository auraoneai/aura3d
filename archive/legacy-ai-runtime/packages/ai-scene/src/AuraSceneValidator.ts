import { AURA_SCENE_IR_SCHEMA_VERSION, type AuraSceneIR } from "./AuraSceneIR.js";

export type AuraSceneValidationSeverity = "info" | "warning" | "error";

export interface AuraSceneValidationIssue {
  readonly path: string;
  readonly code: string;
  readonly severity: AuraSceneValidationSeverity;
  readonly message: string;
  readonly fixSuggestion: string;
}

export interface AuraSceneValidationResult {
  readonly ok: boolean;
  readonly valid: boolean;
  readonly value?: unknown;
  readonly errors: readonly AuraSceneValidationIssue[];
  readonly issues: readonly AuraSceneValidationIssue[];
}

export interface AuraSceneValidationFailure extends Error {
  readonly code: "AURA_SCENE_VALIDATION_FAILED";
  readonly diagnostics: readonly AuraSceneValidationIssue[];
}

export function validateAuraSceneIR(input: unknown): AuraSceneValidationResult {
  const errors: AuraSceneValidationIssue[] = [];
  if (!isRecord(input)) {
    errors.push(diagnostic("", "AURA_SCENE_NOT_OBJECT", "error", "AuraSceneIR must be an object.", "Return structured JSON for the scene."));
    return result(input, errors);
  }

  if (input.schemaVersion !== AURA_SCENE_IR_SCHEMA_VERSION) {
    errors.push(diagnostic("schemaVersion", "AURA_SCENE_SCHEMA_VERSION_INVALID", "error", `schemaVersion must be ${AURA_SCENE_IR_SCHEMA_VERSION}.`, "Use the current AuraSceneIR schema version."));
  }
  if (typeof input.sceneId !== "string" || input.sceneId.trim().length === 0) {
    errors.push(diagnostic("sceneId", "AURA_SCENE_ID_REQUIRED", "error", "sceneId must be a non-empty stable string.", "Generate a stable scene id."));
  }
  if (typeof input.title !== "string" || input.title.trim().length === 0) {
    errors.push(diagnostic("title", "AURA_SCENE_TITLE_REQUIRED", "error", "title must be a non-empty string.", "Generate a short scene title."));
  }
  if (!Array.isArray(input.mood) || input.mood.some((entry) => typeof entry !== "string")) {
    errors.push(diagnostic("mood", "AURA_SCENE_MOOD_INVALID", "error", "mood must be an array of strings.", "Use simple mood tags."));
  }
  if (!["L0", "L1", "L2", "L3", "L4", "L5", "L0-schema-proof", "L1-primitive-previs", "L2-asset-backed-previs", "L3-cinematic-realtime", "L4-production-assisted", "L5-offline-final"].includes(String(input.qualityTarget))) {
    errors.push(diagnostic("qualityTarget", "AURA_SCENE_QUALITY_TARGET_INVALID", "error", "qualityTarget must be one of L0..L5 or the explicit quality ladder labels.", "Use L3 for the first serious realtime previs release."));
  }
  validateObjectArray(input.objects, "objects", errors);
  validateObjectArray(input.characters, "characters", errors);
  validateMaterialArray(input.materials, errors);
  validateCameras(input.cameras, errors);
  validateShots(input.shots, input.cameras, errors);
  validateTimeline(input.timeline, errors);

  return result(input, errors);
}

export function assertValidAuraSceneIR(input: unknown): asserts input is AuraSceneIR {
  const validation = validateAuraSceneIR(input);
  if (!validation.ok) throw createValidationError(validation.errors);
}

export function createValidationError(diagnostics: readonly AuraSceneValidationIssue[]): AuraSceneValidationFailure {
  const error = new Error("AuraSceneIR failed validation.") as AuraSceneValidationFailure;
  Object.defineProperty(error, "code", { value: "AURA_SCENE_VALIDATION_FAILED", enumerable: true });
  Object.defineProperty(error, "diagnostics", { value: diagnostics, enumerable: true });
  return error;
}

export function diagnostic(path: string, code: string, severity: AuraSceneValidationSeverity, message: string, fixSuggestion: string): AuraSceneValidationIssue {
  return { path, code, severity, message, fixSuggestion };
}

function result(input: unknown, errors: readonly AuraSceneValidationIssue[]): AuraSceneValidationResult {
  const ok = !errors.some((entry) => entry.severity === "error");
  return {
    ok,
    valid: ok,
    ...(ok ? { value: input } : {}),
    errors,
    issues: errors
  };
}

function validateObjectArray(value: unknown, path: string, errors: AuraSceneValidationIssue[]): void {
  if (!Array.isArray(value)) {
    errors.push(diagnostic(path, "AURA_SCENE_OBJECT_ARRAY_INVALID", "error", `${path} must be an array.`, `Set ${path} to an array, even if empty.`));
    return;
  }
  value.forEach((entry, index) => {
    if (!isRecord(entry)) {
      errors.push(diagnostic(`${path}[${index}]`, "AURA_SCENE_OBJECT_INVALID", "error", "Scene object must be an object.", "Emit id, kind, transform, and material data."));
      return;
    }
    if (typeof entry.id !== "string" || entry.id.trim().length === 0) {
      errors.push(diagnostic(`${path}[${index}].id`, "AURA_SCENE_OBJECT_ID_REQUIRED", "error", "Scene object id must be stable.", "Add a stable id."));
    }
    if (isRecord(entry.transform)) {
      validateVec3(entry.transform.position, `${path}[${index}].transform.position`, errors);
      validateVec3(entry.transform.rotation, `${path}[${index}].transform.rotation`, errors);
      validateVec3(entry.transform.scale, `${path}[${index}].transform.scale`, errors);
    } else {
      errors.push(diagnostic(`${path}[${index}].transform`, "AURA_SCENE_TRANSFORM_INVALID", "error", "Object transform must be an object.", "Add position, rotation, and scale vectors."));
    }
  });
}

function validateMaterialArray(value: unknown, errors: AuraSceneValidationIssue[]): void {
  if (!Array.isArray(value)) {
    errors.push(diagnostic("materials", "AURA_SCENE_MATERIAL_ARRAY_INVALID", "error", "materials must be an array.", "Set materials to an array."));
    return;
  }
  value.forEach((entry, index) => {
    if (!isRecord(entry)) {
      errors.push(diagnostic(`materials[${index}]`, "AURA_SCENE_MATERIAL_INVALID", "error", "Material must be an object.", "Emit material id and scalar fields."));
      return;
    }
    if (!Array.isArray(entry.baseColor) || entry.baseColor.length !== 4) {
      errors.push(diagnostic(`materials[${index}].baseColor`, "AURA_SCENE_COLOR_INVALID", "error", "baseColor must be [r,g,b,a].", "Use normalized RGBA values."));
    }
  });
}

function validateCameras(value: unknown, errors: AuraSceneValidationIssue[]): void {
  if (!Array.isArray(value)) {
    errors.push(diagnostic("cameras", "AURA_SCENE_CAMERA_ARRAY_INVALID", "error", "cameras must be an array.", "Set cameras to an array."));
    return;
  }
  value.forEach((entry, index) => {
    if (!isRecord(entry)) {
      errors.push(diagnostic(`cameras[${index}]`, "AURA_SCENE_CAMERA_INVALID", "error", "Camera must be an object.", "Emit camera id, position, and target."));
      return;
    }
    validateVec3(entry.position, `cameras[${index}].position`, errors);
    validateVec3(entry.target, `cameras[${index}].target`, errors);
  });
}

function validateShots(shots: unknown, cameras: unknown, errors: AuraSceneValidationIssue[]): void {
  if (!Array.isArray(shots)) {
    errors.push(diagnostic("shots", "AURA_SCENE_SHOT_ARRAY_INVALID", "error", "shots must be an array.", "Set shots to an array."));
    return;
  }
  const cameraIds = new Set(Array.isArray(cameras) ? cameras.filter(isRecord).map((camera) => String(camera.id)) : []);
  shots.forEach((shot, index) => {
    if (!isRecord(shot)) {
      errors.push(diagnostic(`shots[${index}]`, "AURA_SCENE_SHOT_INVALID", "error", "Shot must be an object.", "Emit cameraId and timing."));
      return;
    }
    if (typeof shot.cameraId !== "string" || !cameraIds.has(shot.cameraId)) {
      errors.push(diagnostic(`shots[${index}].cameraId`, "AURA_SCENE_SHOT_CAMERA_MISSING", "error", "Shot cameraId must reference an existing camera.", "Use a camera id from cameras."));
    }
    if (typeof shot.startSeconds !== "number" || typeof shot.endSeconds !== "number" || shot.endSeconds <= shot.startSeconds) {
      errors.push(diagnostic(`shots[${index}]`, "AURA_SCENE_SHOT_TIMING_INVALID", "error", "Shot endSeconds must be greater than startSeconds.", "Use positive shot timing."));
    }
  });
}

function validateTimeline(value: unknown, errors: AuraSceneValidationIssue[]): void {
  if (Array.isArray(value)) return;
  if (isRecord(value) && typeof value.durationSeconds === "number" && Array.isArray(value.cues)) return;
  errors.push(diagnostic("timeline", "AURA_SCENE_TIMELINE_INVALID", "error", "timeline must be an array or a duration/cues object.", "Add timeline cues."));
}

function validateVec3(value: unknown, path: string, errors: AuraSceneValidationIssue[]): void {
  if (!Array.isArray(value) || value.length !== 3 || value.some((component) => typeof component !== "number" || !Number.isFinite(component))) {
    errors.push(diagnostic(path, "AURA_SCENE_VEC3_INVALID", "error", "Value must be a finite [x, y, z] vector.", "Use three finite numbers."));
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
