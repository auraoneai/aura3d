/**
 * Loud, non-fatal shader failures. A program that fails to compile or link (or has no WGSL twin on
 * WebGPU) is recorded with a stable code, the driver log and the offending source lines instead of
 * throwing out of the frame and blanking every other draw.
 */

export type ShaderFailureCode =
  | "CUSTOM_SHADER_COMPILE_FAILED"
  | "CUSTOM_SHADER_LINK_FAILED"
  | "CUSTOM_SHADER_WGSL_MISSING";

/** `skip`: skip the failed item (default). `magenta`: draw it with a flat magenta debug material. `throw`: rethrow (strict). */
export type ShaderFailureMode = "skip" | "magenta" | "throw";

export interface ShaderFailureSourceLine {
  readonly line: number;
  readonly text: string;
  readonly error: boolean;
}

export interface ShaderFailureLocation {
  readonly line: number;
  readonly message: string;
  /** Line in the author's own source when it could be mapped back from the assembled program. */
  readonly authoredLine?: number;
  readonly window: readonly ShaderFailureSourceLine[];
}

export interface ShaderFailureRecord {
  readonly code: ShaderFailureCode;
  readonly material: string;
  readonly shaderKey: string;
  readonly stage: "vertex" | "fragment" | "link" | "unknown";
  readonly message: string;
  readonly log: string;
  readonly locations: readonly ShaderFailureLocation[];
  readonly mode: ShaderFailureMode;
  count: number;
}

export interface ShaderFailureSources {
  readonly vertex?: string;
  readonly fragment?: string;
  /** The author's own source per stage; used to map assembled-program lines back to the author's lines. */
  readonly authored?: { readonly vertex?: string; readonly fragment?: string };
}

const MAX_RECORDS = 64;
const MAX_DIAGNOSTIC_TEXT = 4096;

/** Failure mode and bounded records owned by one app or rendering device. */
export class ShaderFailureStore {
  mode: ShaderFailureMode | undefined;
  readonly records = new Map<string, ShaderFailureRecord>();
}

const legacyStore = new ShaderFailureStore();
const storesByOwner = new WeakMap<object, ShaderFailureStore>();

export function createShaderFailureStore(): ShaderFailureStore {
  return new ShaderFailureStore();
}

/** Bind the same store to an app's canvas and every device created for that app. */
export function bindShaderFailureStore(owner: object, store: ShaderFailureStore): void {
  storesByOwner.set(owner, store);
}

/** Unbound standalone renderer callers retain the legacy diagnostic scope. */
export function shaderFailureStoreFor(owner: object): ShaderFailureStore {
  return storesByOwner.get(owner) ?? legacyStore;
}

/** Driver logs and source excerpts can include URLs or header-like literals. */
export function sanitizeShaderDiagnosticText(value: string): string {
  const limited = value.slice(0, MAX_DIAGNOSTIC_TEXT * 2);
  const redacted = limited
    .replace(/\bhttps?:\/\/[^\s<>"']+/gi, (url) => url.replace(/\/\/[^/@\s]+@/, "//[redacted]@").replace(/[?#].*$/, "?[redacted]"))
    .replace(/((?:\/|\.\.?\/|[a-z0-9_-]+\/)[^\s"'<>?#]*|[a-z0-9_.-]+\.[a-z0-9]{1,10})[?#][^\s"'<>]*/gi, "$1?[redacted]")
    .replace(/([?&](?:token|access_token|api[_-]?key|signature|sig|x-amz-[^=&#\s]+|x-goog-[^=&#\s]+)=)[^&#\s]*/gi, "$1[redacted]")
    .replace(/\b(bearer|basic)\s+[^\s,;"']+/gi, "$1 [redacted]")
    .replace(/(["']?)(?:request[-_ ]?)?headers?\1\s*[:=]\s*(?:\{[^}]*\}|\[[^\]]*\]|[^\r\n]*)/gi, "headers=[redacted]")
    .replace(/\b(authorization|proxy-authorization|cookie|set-cookie)\s*[:=]\s*[^\r\n]*/gi, "$1=[redacted]")
    .replace(/(["']?)(authorization|proxy-authorization|cookie|set-cookie|password|passwd|secret|token|api[-_]?key|credential|signature)\1\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi, "$2=[redacted]");
  return redacted.length > MAX_DIAGNOSTIC_TEXT ? `${redacted.slice(0, MAX_DIAGNOSTIC_TEXT)}…` : redacted;
}

/** The optional store scopes the override; omission keeps the standalone legacy API. */
export function setShaderFailureMode(mode: ShaderFailureMode | undefined, store: ShaderFailureStore = legacyStore): void {
  store.mode = mode;
}

export function resolveShaderFailureMode(strict: boolean, store: ShaderFailureStore = legacyStore): ShaderFailureMode {
  if (store.mode) return store.mode;
  if (strict) return "throw";
  return diagRequested() ? "magenta" : "skip";
}

function diagRequested(): boolean {
  try {
    const search = (globalThis as { location?: { search?: string } }).location?.search ?? "";
    return /[?&]diag=1(?:&|$)/.test(search);
  } catch {
    return false;
  }
}

export function getShaderFailures(store: ShaderFailureStore = legacyStore): readonly ShaderFailureRecord[] {
  return [...store.records.values()];
}

export function clearShaderFailures(store: ShaderFailureStore = legacyStore): void {
  store.records.clear();
}

/** One-line summary, stable for `diagnostics().errors`, route health and the ?diag=1 panel. */
export function formatShaderFailure(record: ShaderFailureRecord): string {
  const first = record.locations[0];
  const where = first ? ` ${record.stage} line ${first.line}${first.authoredLine !== undefined ? ` (source line ${first.authoredLine})` : ""}: ${first.message}` : record.log ? ` ${record.log.split("\n")[0]}` : "";
  return `${record.code}: material "${record.material}"${where}`;
}

/** Records a failure; returns true the first time this (shader, stage) fails (callers log once). */
export function recordShaderFailure(record: ShaderFailureRecord, store: ShaderFailureStore = legacyStore): { readonly first: boolean; readonly record: ShaderFailureRecord } {
  const safeRecord: ShaderFailureRecord = {
    ...record,
    material: sanitizeShaderDiagnosticText(record.material),
    shaderKey: sanitizeShaderDiagnosticText(record.shaderKey),
    message: sanitizeShaderDiagnosticText(record.message),
    log: sanitizeShaderDiagnosticText(record.log),
    locations: record.locations.slice(0, 5).map((location) => ({
      ...location,
      message: sanitizeShaderDiagnosticText(location.message),
      window: location.window.slice(0, 7).map((row) => ({ ...row, text: sanitizeShaderDiagnosticText(row.text) }))
    }))
  };
  const key = `${safeRecord.shaderKey}|${safeRecord.stage}`;
  const existing = store.records.get(key);
  if (existing) {
    existing.count += 1;
    return { first: false, record: existing };
  }
  if (store.records.size >= MAX_RECORDS) store.records.delete(store.records.keys().next().value as string);
  store.records.set(key, safeRecord);
  return { first: true, record: safeRecord };
}

/**
 * Parses driver info-log lines: ANGLE/Mesa `ERROR: 0:12: 'x' : redefinition`, NVIDIA `0(12) : error C1008: ...`.
 * Warnings are ignored. The leading number is the source-string index, never the line.
 */
export function parseShaderLog(log: string): { readonly line: number; readonly message: string }[] {
  const out: { line: number; message: string }[] = [];
  for (const raw of log.split("\n")) {
    const text = raw.trim();
    if (!text) continue;
    let match = /^ERROR:\s*\d+:(\d+):\s*(.*)$/i.exec(text);
    if (!match) match = /^\d+\((\d+)\)\s*:\s*error\s*[A-Za-z0-9]*:?\s*(.*)$/i.exec(text);
    if (match) out.push({ line: Number(match[1]), message: (match[2] ?? "").trim() });
  }
  return out;
}

/** Lines in front of the author's source inside the compiled program (undefined when it cannot be located). */
export function authoredLineOffset(assembled: string, authored: string): number | undefined {
  const authoredLines = authored.split("\n").map((line) => line.trim());
  const firstIndex = authoredLines.findIndex((line) => line.length > 0 && !line.startsWith("#version"));
  if (firstIndex < 0) return undefined;
  const probe = authoredLines.slice(firstIndex, firstIndex + 3);
  const lines = assembled.split("\n").map((line) => line.trim());
  for (let index = 0; index + probe.length <= lines.length; index += 1) {
    if (probe.every((line, offset) => lines[index + offset] === line)) return index - firstIndex;
  }
  return undefined;
}

export function sourceWindow(source: string, line: number, radius = 3): ShaderFailureSourceLine[] {
  const lines = source.split("\n");
  const out: ShaderFailureSourceLine[] = [];
  for (let n = Math.max(1, line - radius); n <= Math.min(lines.length, line + radius); n += 1) {
    out.push({ line: n, text: lines[n - 1] ?? "", error: n === line });
  }
  return out;
}

interface DeviceErrorLike {
  readonly code?: string;
  readonly message?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export function isShaderFailureError(error: unknown): boolean {
  try {
    const code = (error as DeviceErrorLike | null)?.code;
    return code === "SHADER_COMPILE_FAILED" || code === "SHADER_LINK_FAILED" || code === "WGSL_PROGRAM_MISSING";
  } catch {
    return false;
  }
}

/** Builds the structured record from a device error plus the program sources that produced it. */
export function buildShaderFailure(
  error: unknown,
  material: { readonly name: string; readonly shaderKey: string },
  sources: ShaderFailureSources,
  mode: ShaderFailureMode
): ShaderFailureRecord {
  let err: DeviceErrorLike = {};
  let details: Readonly<Record<string, unknown>> = {};
  let rawLog: unknown;
  let stageDetail: unknown;
  let marker: unknown;
  let errorCode: unknown;
  try {
    err = error && typeof error === "object" ? error as DeviceErrorLike : {};
    details = err.details ?? {};
    rawLog = details.log ?? err.message ?? (typeof error === "string" ? error : "Shader failure");
    stageDetail = details.stage;
    marker = details.marker;
    errorCode = err.code;
  } catch {
    rawLog = "Shader failure (details unavailable)";
  }
  const log = sanitizeShaderDiagnosticText(typeof rawLog === "string" ? rawLog : "Shader failure");
  const stage: ShaderFailureRecord["stage"] =
    errorCode === "SHADER_LINK_FAILED" ? "link" : stageDetail === "vertex" || stageDetail === "fragment" ? stageDetail : "unknown";
  const code: ShaderFailureCode =
    errorCode === "SHADER_LINK_FAILED" ? "CUSTOM_SHADER_LINK_FAILED" : errorCode === "WGSL_PROGRAM_MISSING" ? "CUSTOM_SHADER_WGSL_MISSING" : "CUSTOM_SHADER_COMPILE_FAILED";
  const locations: ShaderFailureLocation[] = [];
  if (code === "CUSTOM_SHADER_COMPILE_FAILED") {
    for (const parsed of parseShaderLog(log).slice(0, 5)) {
      const source = (stage === "vertex" ? sources.vertex : stage === "fragment" ? sources.fragment : sources.fragment ?? sources.vertex)?.slice(0, 65536);
      const authored = (stage === "vertex" ? sources.authored?.vertex : sources.authored?.fragment)?.slice(0, 65536);
      const offset = source && authored ? authoredLineOffset(source, authored) : undefined;
      const authoredLine = offset !== undefined && parsed.line > offset ? parsed.line - offset : undefined;
      locations.push({
        line: parsed.line,
        message: parsed.message,
        ...(authoredLine !== undefined ? { authoredLine } : {}),
        window: source ? sourceWindow(source, parsed.line) : []
      });
    }
  }
  const message =
    code === "CUSTOM_SHADER_WGSL_MISSING"
      ? `material "${material.name}" has no WGSL program, so it cannot draw on WebGPU (marker ${typeof marker === "string" ? marker : "unknown"})`
      : log.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 3).join(" | ");
  return { code, material: material.name, shaderKey: material.shaderKey, stage, message, log, locations, mode, count: 1 };
}

/** Multi-line console text for a failure: summary, driver log lines with source windows, and what happens next. */
export function describeShaderFailure(record: ShaderFailureRecord, consequence: string): string {
  const detail = record.locations
    .map((location) => `\n  ${record.stage} line ${location.line}${location.authoredLine !== undefined ? ` (source line ${location.authoredLine})` : ""}: ${location.message}\n` +
      location.window.map((row) => `  ${row.error ? ">" : " "} ${String(row.line).padStart(4)} | ${row.text}`).join("\n"))
    .join("");
  return `[aura3d] ${formatShaderFailure(record)}${detail || (record.log ? `\n  ${record.log}` : "")}\n  ${consequence}`;
}

/** Records a failure and logs it once (console.error). Returns the stored record. */
export function reportShaderFailure(
  error: unknown,
  material: { readonly name: string; readonly shaderKey: string },
  sources: ShaderFailureSources,
  mode: ShaderFailureMode,
  consequence: string,
  store: ShaderFailureStore = legacyStore
): ShaderFailureRecord {
  const { first, record } = recordShaderFailure(buildShaderFailure(error, material, sources, mode), store);
  if (first) console.error(describeShaderFailure(record, sanitizeShaderDiagnosticText(consequence)));
  return record;
}
