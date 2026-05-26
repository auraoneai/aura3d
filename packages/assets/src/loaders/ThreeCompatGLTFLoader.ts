import { createThreeCompatFileLoaderDiagnostic, type ThreeCompatLoaderDiagnostic } from "./LoaderDiagnostics";

export interface ThreeCompatLoadedGltfAsset {
  readonly uri: string;
  readonly diagnostic: ThreeCompatLoaderDiagnostic;
  readonly capabilities: readonly string[];
}

export class ThreeCompatGLTFLoader {
  load(uri: string): ThreeCompatLoadedGltfAsset {
    return {
      uri,
      diagnostic: createThreeCompatFileLoaderDiagnostic("ThreeCompatGLTFLoader", uri, {
        decoderNeeds: ["draco-if-extension-present", "meshopt-if-extension-present", "ktx2-if-extension-present"]
      }),
      capabilities: ["pbr", "animations", "skins", "morph-targets", "images", "textures", "extension-diagnostics"]
    };
  }
}
