import {
  checkedScientificInput,
  DEFAULT_SCIENTIFIC_INPUT_BYTES,
  ScientificImportError,
  scientificLineEnd
} from "./ScientificInput";

export interface NRRDHeader {
  readonly fields: Record<string, string>;
  readonly metadata: Record<string, string>;
  readonly cursor: number;
}

function fail(code: string, message: string): never {
  throw new ScientificImportError(code, message);
}

/** Shared header parser used by both NRRD import and dependency inspection. */
export function readNRRDHeader(bytes: Uint8Array): NRRDHeader {
  let cursor = 0; const magic = scientificLineEnd(bytes, cursor); cursor = magic.next;
  if (!/^NRRD000[1-5]$/.test(magic.line)) fail("SCIENTIFIC_UNSUPPORTED", "Unsupported NRRD version or magic");
  const fields: Record<string, string> = Object.create(null), metadata: Record<string, string> = Object.create(null);
  let terminated = false;
  while (cursor < bytes.length) {
    const item = scientificLineEnd(bytes, cursor); cursor = item.next;
    if (cursor > 1024 * 1024) fail("SCIENTIFIC_INPUT_LIMIT", "NRRD header exceeds 1 MiB");
    if (!item.line.trim()) { terminated = true; break; }
    if (item.line.startsWith("#")) continue;
    const sep = item.line.indexOf(":");
    if (sep <= 0) fail("SCIENTIFIC_MALFORMED", "Malformed NRRD header field");
    if (item.line[sep + 1] === "=") {
      // User key/value pairs occupy a separate namespace from standard fields.
      const key = `${item.line.slice(0, sep)}:=`;
      if (metadata[key] !== undefined) fail("SCIENTIFIC_MALFORMED", `Duplicate NRRD key ${key}`);
      metadata[key] = item.line.slice(sep + 2);
      continue;
    }
    const rawKey = item.line.slice(0, sep).trim().toLowerCase();
    const key = rawKey === "datafile" ? "data file" : rawKey === "byteskip" ? "byte skip" : rawKey === "lineskip" ? "line skip" : rawKey;
    if (fields[key] !== undefined) fail("SCIENTIFIC_MALFORMED", `Duplicate NRRD field ${key}`);
    fields[key] = item.line.slice(sep + 1).trim();
  }
  const detached = fields["data file"];
  if (!terminated && detached === undefined) fail("SCIENTIFIC_TRUNCATED", "NRRD header lacks blank terminator");
  const indexedFiles = detached !== undefined && /%[-+ #0]*\d*(?:\.\d*)?(?:hh|h|ll|l|j|z|t)?[diuoxX]/.test(detached)
    && /\s+[+-]?\d+\s+[+-]?\d+\s+[+-]?\d+(?:\s+\d+)?$/.test(detached);
  if (detached !== undefined && (!detached || /^LIST(?:\s|$)/i.test(detached) || indexedFiles)) fail("SCIENTIFIC_UNSUPPORTED", "NRRD multi-file detached data is unsupported");
  return { fields, metadata: { ...fields, ...metadata }, cursor };
}

/**
 * Read the declared detached-data reference with the same bounded header
 * parser used by the scientific loader. Path resolution, path policy and
 * dependency integrity remain the caller's responsibility. This does not
 * validate the raster payload.
 */
export function inspectNRRDDataReference(
  input: string | Uint8Array | ArrayBuffer,
  options: { readonly maxBytes?: number } = {}
): string | undefined {
  const bytes = checkedScientificInput(input, options.maxBytes ?? DEFAULT_SCIENTIFIC_INPUT_BYTES);
  return readNRRDHeader(bytes).fields["data file"];
}
