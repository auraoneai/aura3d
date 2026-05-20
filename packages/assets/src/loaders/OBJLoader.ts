import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createV5FileLoaderDiagnostic, type V5LoaderDiagnostic } from "./LoaderDiagnostics";

export interface V5LoadedObjAsset {
  readonly uri: string;
  readonly vertices: number;
  readonly faces: number;
  readonly mtllibs: readonly string[];
  readonly diagnostic: V5LoaderDiagnostic;
}

export class OBJLoaderV5 {
  load(uri: string): V5LoadedObjAsset {
    const text = readFileSync(resolve(uri), "utf8");
    return {
      uri,
      vertices: text.split("\n").filter((line) => line.startsWith("v ")).length,
      faces: text.split("\n").filter((line) => line.startsWith("f ")).length,
      mtllibs: text.split("\n").filter((line) => line.startsWith("mtllib ")).map((line) => line.slice("mtllib ".length).trim()),
      diagnostic: createV5FileLoaderDiagnostic("OBJLoaderV5", uri)
    };
  }
}
