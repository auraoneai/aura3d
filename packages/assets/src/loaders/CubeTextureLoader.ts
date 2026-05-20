import { createV5FileLoaderDiagnostic } from "./LoaderDiagnostics";

export class CubeTextureLoaderV5 {
  load(uris: readonly string[]) {
    if (uris.length !== 6) throw new Error("CubeTextureLoaderV5 requires six faces.");
    return uris.map((uri) => createV5FileLoaderDiagnostic("CubeTextureLoaderV5", uri));
  }
}
