const MAX_DIAGNOSTIC_STRING = 2048;
const MAX_DIAGNOSTIC_ITEMS = 128;
const MAX_DIAGNOSTIC_DEPTH = 8;
const MAX_DIAGNOSTIC_BIGINT = 10n ** BigInt(MAX_DIAGNOSTIC_STRING - 2);
const SENSITIVE_FIELD = /authorization|cookie|header|password|passwd|secret|token|credential|signature|api[-_]?key|private[-_]?key|(?:^|[-_])sig(?:$|[-_])|^x[-_](?:amz|goog)[-_]/i;

function formatDiagnosticBigInt(value: bigint): string {
  if (value >= MAX_DIAGNOSTIC_BIGINT || value <= -MAX_DIAGNOSTIC_BIGINT) return "[bigint truncated]";
  return `${value}n`;
}

/** Bound diagnostic text and remove credentials, URL queries and header values. */
export function sanitizeDiagnosticText(text: string): string {
  // Bound input before running regexes; content beyond this is never exposed.
  const input = text.slice(0, MAX_DIAGNOSTIC_STRING * 4);
  const safe = input
    .replace(/\bhttps?:\/\/[^\s<>"']+/gi, (url) => url.replace(/\/\/[^/@\s]+@/, "//[redacted]@").replace(/[?#].*$/, "?[redacted]"))
    .replace(/((?:\/|\.\.?\/|[a-z0-9_-]+\/)[^\s"'<>?#]*|[a-z0-9_.-]+\.[a-z0-9]{1,10})[?#][^\s"'<>]*/gi, "$1?[redacted]")
    .replace(/([?&](?:token|access_token|api[_-]?key|signature|sig|x-amz-[^=&#\s]+|x-goog-[^=&#\s]+)=)[^&#\s]*/gi, "$1[redacted]")
    .replace(/\b(bearer|basic)\s+[^\s,;"']+/gi, "$1 [redacted]")
    .replace(/(["']?)(?:request[-_ ]?)?headers?\1\s*[:=]\s*(?:\{[^}]*\}|\[[^\]]*\]|[^\r\n]*)/gi, "headers=[redacted]")
    .replace(/\b(authorization|proxy-authorization|cookie|set-cookie)\s*[:=]\s*[^\r\n]*/gi, "$1=[redacted]")
    .replace(/(["']?)(authorization|proxy-authorization|cookie|set-cookie|password|passwd|secret|token|api[-_]?key|credential|signature)\1\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi, "$2=[redacted]");
  return safe.length > MAX_DIAGNOSTIC_STRING ? `${safe.slice(0, MAX_DIAGNOSTIC_STRING)}…` : safe;
}

/**
 * Copy diagnostic data without invoking accessors or user-defined `toJSON`.
 * The budget and cycle markers make even hostile details safe to report.
 */
export function sanitizeDiagnosticValue(value: unknown): unknown {
  const seen = new WeakSet<object>();
  let remaining = 4096;
  let remainingText = 8192;
  const copyText = (input: string): string => {
    if (remainingText <= 0) return "[truncated]";
    const safe = sanitizeDiagnosticText(input);
    const result = safe.length > remainingText ? `${safe.slice(0, remainingText)}…` : safe;
    remainingText -= Math.min(safe.length, remainingText);
    return result;
  };
  const visit = (entry: unknown, depth: number): unknown => {
    if (remaining-- <= 0) return "[truncated]";
    if (typeof entry === "string") return copyText(entry);
    if (typeof entry === "bigint") return copyText(formatDiagnosticBigInt(entry));
    if (typeof entry === "number" || typeof entry === "boolean" || entry == null) return entry;
    if (typeof entry === "undefined") return undefined;
    if (typeof entry !== "object") return `[${typeof entry}]`;
    if (seen.has(entry)) return "[circular]";
    if (depth >= MAX_DIAGNOSTIC_DEPTH) return "[truncated]";
    seen.add(entry);
    try {
      if (ArrayBuffer.isView(entry)) {
        const view = entry as ArrayBufferView & { readonly length?: number; readonly [index: number]: unknown };
        const length = typeof view.length === "number" ? view.length : view.byteLength;
        const bytes = typeof view.length === "number" ? undefined : new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
        const out: unknown[] = [];
        for (let i = 0; i < Math.min(length, MAX_DIAGNOSTIC_ITEMS); i += 1) {
          out.push(visit(bytes ? bytes[i] : view[i], depth + 1));
        }
        if (length > MAX_DIAGNOSTIC_ITEMS) out.push("[truncated]");
        return out;
      }
      if (Array.isArray(entry)) {
        const out: unknown[] = [];
        const length = Math.min(entry.length, MAX_DIAGNOSTIC_ITEMS);
        for (let i = 0; i < length; i += 1) {
          const descriptor = Object.getOwnPropertyDescriptor(entry, String(i));
          out.push(descriptor && "value" in descriptor ? visit(descriptor.value, depth + 1) : "[unavailable]");
        }
        if (entry.length > length) out.push("[truncated]");
        return out;
      }
      const out: Record<string, unknown> = {};
      const keys = Object.keys(entry);
      for (const key of keys.slice(0, MAX_DIAGNOSTIC_ITEMS)) {
        if (remaining <= 0 || remainingText <= 0) { out["[truncated]"] = true; break; }
        const safeKey = copyText(key).slice(0, 256);
        if (SENSITIVE_FIELD.test(key)) {
          Object.defineProperty(out, safeKey, { value: "[redacted]", enumerable: true, configurable: true, writable: true });
          continue;
        }
        try {
          const descriptor = Object.getOwnPropertyDescriptor(entry, key);
          Object.defineProperty(out, safeKey, { value: descriptor && "value" in descriptor ? visit(descriptor.value, depth + 1) : "[unavailable]", enumerable: true, configurable: true, writable: true });
        } catch {
          Object.defineProperty(out, safeKey, { value: "[unavailable]", enumerable: true, configurable: true, writable: true });
        }
      }
      if (keys.length > MAX_DIAGNOSTIC_ITEMS) out["[truncated]"] = true;
      return out;
    } catch {
      return "[unavailable]";
    } finally {
      seen.delete(entry);
    }
  };
  return visit(value, 0);
}

function readDiagnosticField(value: object, key: string): unknown {
  try { return Reflect.get(value, key); } catch { return undefined; }
}

/** Error formatting is best effort and must never hide the original failure. */
export function formatDiagnosticError(error: unknown): string {
  try {
    if (typeof error === "string") return sanitizeDiagnosticText(error);
    if (error !== null && typeof error === "object") {
      const name = readDiagnosticField(error, "name");
      const message = readDiagnosticField(error, "message");
      const details = readDiagnosticField(error, "details");
      const hasMessage = typeof message === "string";
      const prefix = hasMessage
        ? `${typeof name === "string" ? sanitizeDiagnosticText(name) : "Error"}: ${sanitizeDiagnosticText(message)}`
        : "";
      const serializable = sanitizeDiagnosticValue(hasMessage ? details : error);
      const serialized = serializable === undefined ? "" : JSON.stringify(serializable);
      // Each field and key in `serialized` has already been sanitized above.
      // Running the free-form header regex over the JSON again can consume
      // unrelated fields following a redacted header, hiding useful details.
      const result = [prefix, serialized].filter(Boolean).join(" ") || "Unknown error";
      return result.length > MAX_DIAGNOSTIC_STRING ? `${result.slice(0, MAX_DIAGNOSTIC_STRING)}…` : result;
    }
    if (typeof error === "bigint") return formatDiagnosticBigInt(error);
    if (typeof error === "number" || typeof error === "boolean" || error == null) return String(error);
    return `[${typeof error}]`;
  } catch {
    return "Error: details unavailable";
  }
}
