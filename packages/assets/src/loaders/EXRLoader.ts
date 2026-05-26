import { createThreeCompatFileLoaderDiagnostic } from "./LoaderDiagnostics";

export class EXRLoaderThreeCompat {
  load(uri: string) {
    return createThreeCompatFileLoaderDiagnostic("EXRLoaderThreeCompat", uri, {
      status: "diagnostic-only",
      warnings: ["EXR parsing is diagnostic-only until binary EXR decode is enabled in ThreeCompat renderer integration."]
    });
  }
}
