import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createThreeCompatFileLoaderDiagnostic, type ThreeCompatLoaderDiagnostic } from "./LoaderDiagnostics";

export interface ThreeCompatLoadedMtlAsset {
  readonly uri: string;
  readonly materials: readonly string[];
  readonly diagnostic: ThreeCompatLoaderDiagnostic;
}

export class MTLLoaderThreeCompat {
  load(uri: string): ThreeCompatLoadedMtlAsset {
    const text = readFileSync(resolve(uri), "utf8");
    return {
      uri,
      materials: text.split("\n").filter((line) => line.startsWith("newmtl ")).map((line) => line.slice("newmtl ".length).trim()),
      diagnostic: createThreeCompatFileLoaderDiagnostic("MTLLoaderThreeCompat", uri)
    };
  }
}
