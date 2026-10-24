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
const records = new Map<string, ShaderFailureRecord>();
let configuredMode: ShaderFailureMode | undefined;

/** Process-wide override (an app in strict mode sets `throw`; `undefined` restores the default). */
export function setShaderFailureMode(mode: ShaderFailureMode | undefined): void {
  configuredMode = mode;
}

export function resolveShaderFailureMode(strict: boolean): ShaderFailureMode {
  if (configuredMode) return configuredMode;
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

export function getShaderFailures(): readonly ShaderFailureRecord[] {
  return [...records.values()];
}

export function clearShaderFailures(): void {
  records.clear();
}

/** One-line summary, stable for `diagnostics().errors`, route health and the ?diag=1 panel. */
export function formatShaderFailure(record: ShaderFailureRecord): string {
  const first = record.locations[0];
  const where = first ? ` ${record.stage} line ${first.line}${first.authoredLine !== undefined ? ` (source line ${first.authoredLine})` : ""}: ${first.message}` : record.log ? ` ${record.log.split("\n")[0]}` : "";
  return `${record.code}: material "${record.material}"${where}`;
}

/** Records a failure; returns true the first time this (shader, stage) fails (callers log once). */
export function recordShaderFailure(record: ShaderFailureRecord): { readonly first: boolean; readonly record: ShaderFailureRecord } {
  const key = `${record.shaderKey}|${record.stage}`;
  const existing = records.get(key);
  if (existing) {
    existing.count += 1;
    return { first: false, record: existing };
  }
  if (records.size >= MAX_RECORDS) records.delete(records.keys().next().value as string);
  records.set(key, record);
  return { first: true, record };
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
  const code = (error as DeviceErrorLike | null)?.code;
  return code === "SHADER_COMPILE_FAILED" || code === "SHADER_LINK_FAILED" || code === "WGSL_PROGRAM_MISSING";
}

/** Builds the structured record from a device error plus the program sources that produced it. */
export function buildShaderFailure(
  error: unknown,
  material: { readonly name: string; readonly shaderKey: string },
  sources: ShaderFailureSources,
  mode: ShaderFailureMode
): ShaderFailureRecord {
  const err = error as DeviceErrorLike;
  const details = err.details ?? {};
  const log = typeof details.log === "string" ? details.log : String(err.message ?? error);
  const stageDetail = details.stage;
  const stage: ShaderFailureRecord["stage"] =
    err.code === "SHADER_LINK_FAILED" ? "link" : stageDetail === "vertex" || stageDetail === "fragment" ? stageDetail : "unknown";
  const code: ShaderFailureCode =
    err.code === "SHADER_LINK_FAILED" ? "CUSTOM_SHADER_LINK_FAILED" : err.code === "WGSL_PROGRAM_MISSING" ? "CUSTOM_SHADER_WGSL_MISSING" : "CUSTOM_SHADER_COMPILE_FAILED";
  const locations: ShaderFailureLocation[] = [];
  if (code === "CUSTOM_SHADER_COMPILE_FAILED") {
    for (const parsed of parseShaderLog(log).slice(0, 5)) {
      const source = stage === "vertex" ? sources.vertex : stage === "fragment" ? sources.fragment : sources.fragment ?? sources.vertex;
      const authored = stage === "vertex" ? sources.authored?.vertex : sources.authored?.fragment;
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
      ? `material "${material.name}" has no WGSL program, so it cannot draw on WebGPU (marker ${String(details.marker ?? "unknown")})`
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
  consequence: string
): ShaderFailureRecord {
  const { first, record } = recordShaderFailure(buildShaderFailure(error, material, sources, mode));
  if (first) console.error(describeShaderFailure(record, consequence));
  return record;
}
