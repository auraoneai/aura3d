import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

export type V5LoaderStatus = "loaded" | "blocked" | "missing" | "diagnostic-only";

export interface V5LoaderDiagnostic {
  readonly loader: string;
  readonly uri: string;
  readonly status: V5LoaderStatus;
  readonly bytes: number;
  readonly warnings: readonly string[];
  readonly unsupportedExtensions: readonly string[];
  readonly decoderNeeds: readonly string[];
  readonly memoryEstimateBytes: number;
}

export function createV5FileLoaderDiagnostic(loader: string, uri: string, options: {
  readonly status?: Exclude<V5LoaderStatus, "missing">;
  readonly unsupportedExtensions?: readonly string[];
  readonly decoderNeeds?: readonly string[];
  readonly warnings?: readonly string[];
} = {}): V5LoaderDiagnostic {
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
