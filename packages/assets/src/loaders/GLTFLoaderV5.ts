import { createV5FileLoaderDiagnostic, type V5LoaderDiagnostic } from "./LoaderDiagnostics";

export interface V5LoadedGltfAsset {
  readonly uri: string;
  readonly diagnostic: V5LoaderDiagnostic;
  readonly capabilities: readonly string[];
}

export class GLTFLoaderV5 {
  load(uri: string): V5LoadedGltfAsset {
    return {
      uri,
      diagnostic: createV5FileLoaderDiagnostic("GLTFLoaderV5", uri, {
        decoderNeeds: ["draco-if-extension-present", "meshopt-if-extension-present", "ktx2-if-extension-present"]
      }),
      capabilities: ["pbr", "animations", "skins", "morph-targets", "images", "textures", "extension-diagnostics"]
    };
  }
}
