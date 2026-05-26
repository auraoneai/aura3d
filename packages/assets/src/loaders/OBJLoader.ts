import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createThreeCompatFileLoaderDiagnostic, type ThreeCompatLoaderDiagnostic } from "./LoaderDiagnostics";

export interface ThreeCompatLoadedObjAsset {
  readonly uri: string;
  readonly vertices: number;
  readonly faces: number;
  readonly mtllibs: readonly string[];
  readonly diagnostic: ThreeCompatLoaderDiagnostic;
}

export class OBJLoaderThreeCompat {
  load(uri: string): ThreeCompatLoadedObjAsset {
    const text = readFileSync(resolve(uri), "utf8");
    return {
      uri,
      vertices: text.split("\n").filter((line) => line.startsWith("v ")).length,
      faces: text.split("\n").filter((line) => line.startsWith("f ")).length,
      mtllibs: text.split("\n").filter((line) => line.startsWith("mtllib ")).map((line) => line.slice("mtllib ".length).trim()),
      diagnostic: createThreeCompatFileLoaderDiagnostic("OBJLoaderThreeCompat", uri)
    };
  }
}
