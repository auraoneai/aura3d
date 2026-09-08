export interface PackFile {
  readonly path: string;
  readonly size: number;
}

export interface PackResult {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly size: number;
  readonly unpackedSize: number;
  readonly filename: string;
  readonly files: readonly PackFile[];
}

export function parseSinglePackResult(output: string, expectedName: string): PackResult {
  const parsed: unknown = JSON.parse(output);
  const candidates = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object"
      ? Object.values(parsed as Record<string, unknown>)
      : [];
  const matches = candidates.filter((candidate): candidate is PackResult => {
    if (!candidate || typeof candidate !== "object") return false;
    const value = candidate as Partial<PackResult>;
    return value.name === expectedName
      && typeof value.id === "string"
      && typeof value.version === "string"
      && typeof value.size === "number"
      && typeof value.unpackedSize === "number"
      && typeof value.filename === "string"
      && Array.isArray(value.files)
      && value.files.every(file => file && typeof file.path === "string" && typeof file.size === "number");
  });
  if (matches.length !== 1) {
    const names = candidates.flatMap(candidate => candidate && typeof candidate === "object" && typeof (candidate as { name?: unknown }).name === "string"
      ? [(candidate as { name: string }).name]
      : []);
    throw new Error(`npm pack returned ${matches.length} valid result(s) for ${expectedName}; observed: ${names.join(", ") || "none"}`);
  }
  return matches[0]!;
}
