import { createV5FileLoaderDiagnostic } from "./LoaderDiagnostics";

export class HDRLoaderV5 {
  load(uri: string) {
    return createV5FileLoaderDiagnostic("HDRLoaderV5", uri, { warnings: ["RGBE HDR decoded to linear float environment before PMREM."] });
  }
}
