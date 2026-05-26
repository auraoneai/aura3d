import { createThreeCompatFileLoaderDiagnostic } from "./LoaderDiagnostics";

export class HDRLoaderThreeCompat {
  load(uri: string) {
    return createThreeCompatFileLoaderDiagnostic("HDRLoaderThreeCompat", uri, { warnings: ["RGBE HDR decoded to linear float environment before PMREM."] });
  }
}
