import { createV5FileLoaderDiagnostic } from "./LoaderDiagnostics";

export class EXRLoaderV5 {
  load(uri: string) {
    return createV5FileLoaderDiagnostic("EXRLoaderV5", uri, {
      status: "diagnostic-only",
      warnings: ["EXR parsing is diagnostic-only until binary EXR decode is enabled in V5 renderer integration."]
    });
  }
}
