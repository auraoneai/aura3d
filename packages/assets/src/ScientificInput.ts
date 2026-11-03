/** Shared diagnostics and bounded byte helpers for scientific format readers. */
export class ScientificImportError extends Error {
  constructor(readonly code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "ScientificImportError";
  }
}

export const DEFAULT_SCIENTIFIC_INPUT_BYTES = 64 * 1024 * 1024;

function fail(code: string, message: string): never {
  throw new ScientificImportError(code, message);
}

export function checkedScientificInput(input: string | Uint8Array | ArrayBuffer, maxBytes: number): Uint8Array {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    fail("SCIENTIFIC_INVALID_LIMIT", "Limits must be positive safe integers");
  }
  if (typeof input === "string" && input.length > maxBytes) fail("SCIENTIFIC_INPUT_LIMIT", "Input exceeds maxBytes");
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength > maxBytes) fail("SCIENTIFIC_INPUT_LIMIT", "Input exceeds maxBytes");
  return bytes;
}

export function scientificUtf8(bytes: Uint8Array): string {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return fail("SCIENTIFIC_MALFORMED", "Input is not valid UTF-8"); }
}

export function scientificLineEnd(bytes: Uint8Array, start: number): { line: string; next: number } {
  if (start >= bytes.length) fail("SCIENTIFIC_TRUNCATED", "Unexpected end of header");
  let end = start;
  while (end < bytes.length && bytes[end] !== 10 && bytes[end] !== 13) end++;
  if (end - start > 65536) fail("SCIENTIFIC_INPUT_LIMIT", "Header line is too long");
  let next = end;
  if (bytes[next] === 13) next++;
  if (bytes[next] === 10) next++;
  return { line: scientificUtf8(bytes.subarray(start, end)), next };
}
