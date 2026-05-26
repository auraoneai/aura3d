import { createThreeCompatFileLoaderDiagnostic } from "./LoaderDiagnostics";

export class KTX2LoaderThreeCompat {
  load(uri: string) {
    return createThreeCompatFileLoaderDiagnostic("KTX2LoaderThreeCompat", uri, { decoderNeeds: ["basis-universal-transcoder"] });
  }
}
