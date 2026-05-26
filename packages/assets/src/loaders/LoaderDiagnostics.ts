import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

export type ThreeCompatLoaderStatus = "loaded" | "blocked" | "missing" | "diagnostic-only";

export interface ThreeCompatLoaderDiagnostic {
  readonly loader: string;
  readonly uri: string;
  readonly status: ThreeCompatLoaderStatus;
  readonly bytes: number;
  readonly warnings: readonly string[];
  readonly unsupportedExtensions: readonly string[];
  readonly decoderNeeds: readonly string[];
  readonly memoryEstimateBytes: number;
}

export function createThreeCompatFileLoaderDiagnostic(loader: string, uri: string, options: {
  readonly status?: Exclude<ThreeCompatLoaderStatus, "missing">;
  readonly unsupportedExtensions?: readonly string[];
  readonly decoderNeeds?: readonly string[];
  readonly warnings?: readonly string[];
} = {}): ThreeCompatLoaderDiagnostic {
  const path = resolve(uri);
  const exists = existsSync(path);
  const bytes = exists ? statSync(path).size : 0;
  return {
    loader,
    uri,
    status: exists ? options.status ?? "loaded" : "missing",
    bytes,
    warnings: options.warnings ?? [],
    unsupportedExtensions: options.unsupportedExtensions ?? [],
    decoderNeeds: options.decoderNeeds ?? [],
    memoryEstimateBytes: bytes * 2
  };
}
