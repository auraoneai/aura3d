import { createThreeCompatFileLoaderDiagnostic } from "./LoaderDiagnostics";

export class CubeTextureLoaderThreeCompat {
  load(uris: readonly string[]) {
    if (uris.length !== 6) throw new Error("CubeTextureLoaderThreeCompat requires six faces.");
    return uris.map((uri) => createThreeCompatFileLoaderDiagnostic("CubeTextureLoaderThreeCompat", uri));
  }
}
