import { createV5FileLoaderDiagnostic } from "./LoaderDiagnostics";

export class KTX2LoaderV5 {
  load(uri: string) {
    return createV5FileLoaderDiagnostic("KTX2LoaderV5", uri, { decoderNeeds: ["basis-universal-transcoder"] });
  }
}
