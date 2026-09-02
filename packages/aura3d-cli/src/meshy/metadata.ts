import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";

export const MAX_MESHY_METADATA_BYTES = 1024 * 1024;
const SECRET_KEY = /(?:^|_)(?:api_?key|access_?token|refresh_?token|authorization|bearer|client_?secret|password|credentials?|cookie|private_?key|environment|env)(?:$|_)/i;
const SIGNED_QUERY_KEY = /^(?:x-amz-|x-goog-|signature$|sig$|token$|expires$|credential$|policy$|key-pair-id$)/i;

export interface SanitizedMeshyMetadata {
  readonly providerCli?: string;
  readonly taskId?: string;
  readonly parentTaskIds?: readonly string[];
  readonly operation?: string;
  readonly promptHash?: string;
  readonly model?: string;
  readonly settings?: Readonly<Record<string, unknown>>;
  readonly createdAt?: string;
  readonly finishedAt?: string;
  readonly consumedCredits?: number;
}

export function readMeshyMetadata(path: string): SanitizedMeshyMetadata {
  const size = statSync(path).size;
  if (size > MAX_MESHY_METADATA_BYTES) {
    throw new Error(`Meshy metadata exceeds ${MAX_MESHY_METADATA_BYTES} bytes: ${path}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`Meshy metadata is not valid JSON: ${path}`);
  }
  const root = record(parsed, "Meshy metadata");
  rejectCredentialFields(root, "metadata");
  const task = optionalRecord(root.task, "metadata.task") ?? root;
  const prompt = optionalString(first(task.prompt, root.prompt), "prompt");
  const settingsValue = first(task.settings, task.parameters, root.settings, root.parameters);
  const settings = settingsValue === undefined ? undefined : sanitizeRecord(record(settingsValue, "settings"), 0);
  return compact({
    providerCli: optionalString(first(root.providerCli, root.provider_cli, root.cliVersion, root.cli_version), "providerCli"),
    taskId: optionalString(first(task.taskId, task.task_id, task.id, root.taskId, root.task_id), "taskId"),
    parentTaskIds: stringList(first(task.parentTaskIds, task.parent_task_ids, task.parentTaskId, task.parent_task_id), "parentTaskIds"),
    operation: optionalString(first(task.operation, task.type, root.operation, root.type), "operation"),
    promptHash: prompt ? `sha256-${createHash("sha256").update(prompt).digest("hex")}` : undefined,
    model: optionalString(first(task.model, task.modelVersion, task.model_version, root.model), "model"),
    settings,
    createdAt: isoString(first(task.createdAt, task.created_at, root.createdAt, root.created_at), "createdAt"),
    finishedAt: isoString(first(task.finishedAt, task.finished_at, task.completedAt, task.completed_at, root.finishedAt, root.finished_at), "finishedAt"),
    consumedCredits: nonNegativeNumber(first(task.consumedCredits, task.consumed_credits, task.credits, root.consumedCredits, root.consumed_credits), "consumedCredits")
  });
}

export function validateMeshyEvidenceJson(path: string): void {
  const size = statSync(path).size;
  if (size > MAX_MESHY_METADATA_BYTES) throw new Error(`Meshy rights evidence exceeds ${MAX_MESHY_METADATA_BYTES} bytes: ${path}`);
  let parsed: unknown;
  try { parsed = JSON.parse(readFileSync(path, "utf8")); } catch { throw new Error(`Meshy rights evidence is not valid JSON: ${path}`); }
  const value = record(parsed, "Meshy rights evidence");
  if (Object.keys(value).length === 0) throw new Error("Meshy rights evidence must be a non-empty JSON object.");
  rejectCredentialFields(value, "rights evidence");
}

export function stripSignedUrl(value: string): string {
  try {
    const url = new URL(value);
    if ([...url.searchParams.keys()].some((key) => SIGNED_QUERY_KEY.test(key))) url.search = "";
    return url.toString();
  } catch { return value; }
}

function rejectCredentialFields(value: unknown, path: string): void {
  if (Array.isArray(value)) { value.forEach((item, index) => rejectCredentialFields(item, `${path}[${index}]`)); return; }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[- ]/g, "_");
    if (SECRET_KEY.test(normalized)) throw new Error(`Meshy input contains forbidden credential field at ${path}.${key}.`);
    rejectCredentialFields(child, `${path}.${key}`);
  }
}

function sanitizeRecord(value: Record<string, unknown>, depth: number): Readonly<Record<string, unknown>> {
  if (depth > 4) throw new Error("Meshy settings exceed the maximum nesting depth.");
  if (Object.keys(value).length > 100) throw new Error("Meshy settings contain too many fields.");
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, sanitizeValue(child, depth + 1)]));
}
function sanitizeValue(value: unknown, depth: number): unknown {
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") {
    if (value.length > 4096) throw new Error("Meshy metadata contains an unexpectedly long string.");
    return stripSignedUrl(value);
  }
  if (Array.isArray(value)) {
    if (value.length > 100) throw new Error("Meshy metadata contains an unexpectedly large array.");
    return value.map((entry) => sanitizeValue(entry, depth));
  }
  return sanitizeRecord(record(value, "settings value"), depth);
}
function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be a JSON object.`);
  return value as Record<string, unknown>;
}
function optionalRecord(value: unknown, label: string): Record<string, unknown> | undefined { return value === undefined ? undefined : record(value, label); }
function first(...values: unknown[]): unknown { return values.find((value) => value !== undefined && value !== null); }
function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim() === "" || value.length > 4096) throw new Error(`Meshy metadata field ${label} must be a non-empty bounded string.`);
  return stripSignedUrl(value.trim());
}
function isoString(value: unknown, label: string): string | undefined {
  const text = optionalString(value, label); if (!text) return undefined;
  if (Number.isNaN(Date.parse(text))) throw new Error(`Meshy metadata field ${label} must be an ISO-8601 timestamp.`);
  return text;
}
function nonNegativeNumber(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`Meshy metadata field ${label} must be a non-negative number.`);
  return value;
}
function stringList(value: unknown, label: string): readonly string[] | undefined {
  if (value === undefined) return undefined;
  const values = Array.isArray(value) ? value : [value];
  if (values.length > 100) throw new Error(`Meshy metadata field ${label} contains too many values.`);
  return values.map((entry) => optionalString(entry, label)!);
}
function compact<T extends Record<string, unknown>>(value: T): T { return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T; }
