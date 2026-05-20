import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createV5FileLoaderDiagnostic, type V5LoaderDiagnostic } from "./LoaderDiagnostics";

export interface V5LoadedMtlAsset {
  readonly uri: string;
  readonly materials: readonly string[];
  readonly diagnostic: V5LoaderDiagnostic;
}

export class MTLLoaderV5 {
  load(uri: string): V5LoadedMtlAsset {
    const text = readFileSync(resolve(uri), "utf8");
    return {
      uri,
      materials: text.split("\n").filter((line) => line.startsWith("newmtl ")).map((line) => line.slice("newmtl ".length).trim()),
      diagnostic: createV5FileLoaderDiagnostic("MTLLoaderV5", uri)
    };
  }
}
