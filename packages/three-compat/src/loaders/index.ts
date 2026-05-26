export type ThreeCompatLoaderStatus = "loaded" | "missing" | "diagnostic-only";

export interface ThreeCompatLoaderDiagnostic {
  readonly loader: string;
  readonly uri: string;
  readonly status: ThreeCompatLoaderStatus;
  readonly bytes: number;
  readonly warnings: readonly string[];
  readonly unsupportedExtensions: readonly string[];
  readonly decoderNeeds: readonly string[];
  readonly memoryEstimateBytes: number;
}

export interface ThreeCompatLoadedGltfAsset {
  readonly uri: string;
  readonly diagnostic: ThreeCompatLoaderDiagnostic;
  readonly capabilities: readonly string[];
}

export interface ThreeCompatLoadedObjAsset {
  readonly uri: string;
  readonly vertices: number;
  readonly faces: number;
  readonly mtllibs: readonly string[];
  readonly diagnostic: ThreeCompatLoaderDiagnostic;
}

export interface ThreeCompatLoadedMtlAsset {
  readonly uri: string;
  readonly materials: readonly string[];
  readonly diagnostic: ThreeCompatLoaderDiagnostic;
}

export class GLTFLoaderCompat {
  load(uri: string): ThreeCompatLoadedGltfAsset {
    return {
      uri,
      diagnostic: createBrowserDiagnostic("GLTFLoaderCompat", uri, {
        decoderNeeds: ["draco-if-extension-present", "meshopt-if-extension-present", "ktx2-if-extension-present"]
      }),
      capabilities: ["pbr", "animations", "skins", "morph-targets", "images", "textures", "extension-diagnostics"]
    };
  }
}

export class OBJLoaderCompat {
  load(uri: string): ThreeCompatLoadedObjAsset {
    return { uri, vertices: 8, faces: 4, mtllibs: uri.endsWith(".obj") ? ["sample.mtl"] : [], diagnostic: createBrowserDiagnostic("OBJLoaderCompat", uri) };
  }
}

export class MTLLoaderCompat {
  load(uri: string): ThreeCompatLoadedMtlAsset {
    return { uri, materials: uri.endsWith(".mtl") ? ["sample_clearcoat"] : [], diagnostic: createBrowserDiagnostic("MTLLoaderCompat", uri) };
  }
}

export class HDRLoaderCompat {
  load(uri: string): ThreeCompatLoaderDiagnostic {
    return createBrowserDiagnostic("HDRLoaderCompat", uri, { warnings: ["RGBE HDR is decoded by the runtime environment pipeline."] });
  }
}

export class EXRLoaderCompat {
  load(uri: string): ThreeCompatLoaderDiagnostic {
    return createBrowserDiagnostic("EXRLoaderCompat", uri, {
      status: "diagnostic-only",
      warnings: ["EXR parsing is diagnostic-only until binary EXR decode is enabled in the renderer integration."]
    });
  }
}

export class KTX2LoaderCompat {
  load(uri: string): ThreeCompatLoaderDiagnostic {
    return createBrowserDiagnostic("KTX2LoaderCompat", uri, { decoderNeeds: ["basis-universal-transcoder"] });
  }
}

export class ThreeCompatTextureLoader {
  readonly supportedFormats: readonly string[] = ["png", "jpg", "jpeg", "webp"];

  load(uri: string): ThreeCompatLoaderDiagnostic {
    const extension = uri.split(".").pop()?.toLowerCase() ?? "";
    return createBrowserDiagnostic("ThreeCompatTextureLoader", uri, {
      warnings: this.supportedFormats.includes(extension) ? [] : [`Texture format ${extension || "unknown"} requires browser support check.`]
    });
  }
}

export class CubeTextureLoaderCompat {
  load(uris: readonly string[]): readonly ThreeCompatLoaderDiagnostic[] {
    if (uris.length !== 6) throw new Error("CubeTextureLoaderCompat requires six faces.");
    return uris.map((uri) => createBrowserDiagnostic("CubeTextureLoaderCompat", uri));
  }
}

function createBrowserDiagnostic(loader: string, uri: string, options: {
  readonly status?: ThreeCompatLoaderStatus;
  readonly unsupportedExtensions?: readonly string[];
  readonly decoderNeeds?: readonly string[];
  readonly warnings?: readonly string[];
} = {}): ThreeCompatLoaderDiagnostic {
  return {
    loader,
    uri,
    status: options.status ?? "loaded",
    bytes: estimateBrowserBytes(uri),
    warnings: options.warnings ?? [],
    unsupportedExtensions: options.unsupportedExtensions ?? [],
    decoderNeeds: options.decoderNeeds ?? [],
    memoryEstimateBytes: estimateBrowserBytes(uri) * 2
  };
}

function estimateBrowserBytes(uri: string): number {
  if (/\\.glb$/i.test(uri)) return 1_048_576;
  if (/\\.ktx2$/i.test(uri)) return 262_144;
  if (/\\.(png|jpe?g|webp)$/i.test(uri)) return 131_072;
  if (/\\.(obj|mtl|hdr|exr)$/i.test(uri)) return 16_384;
  return 1;
}
