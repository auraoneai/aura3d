export type AssetImportPreflightProfile = "high-quality" | "balanced" | "web" | "mobile";

export type AssetImportPreflightFormat =
  | "gltf"
  | "glb"
  | "fbx"
  | "usd"
  | "usdz"
  | "obj"
  | "dae"
  | "unknown";

export type AssetImportPreflightStatus = "supported" | "convert-required" | "blocked";

export interface AssetImportPreflightOptions {
  readonly profile?: AssetImportPreflightProfile;
  readonly fileBytes?: number;
}

export interface AssetImportPreflightSettings {
  readonly texture: {
    readonly maxSize: number;
    readonly compression: "prefer-source" | "bc3" | "etc2" | "basis";
    readonly generateMipmaps: boolean;
    readonly colorSpace: "srgb";
  };
  readonly mesh: {
    readonly optimize: boolean;
    readonly generateNormals: boolean;
    readonly generateTangents: boolean;
    readonly weldVertices: boolean;
    readonly targetTriangleCount?: number;
  };
}

export interface AssetImportPreflightReport {
  readonly source: "origin-master-asset-importer-adapted";
  readonly url: string;
  readonly format: AssetImportPreflightFormat;
  readonly profile: AssetImportPreflightProfile;
  readonly status: AssetImportPreflightStatus;
  readonly supportedByCurrentLoader: boolean;
  readonly fileBytes?: number;
  readonly settings: AssetImportPreflightSettings;
  readonly stages: readonly string[];
  readonly diagnostics: readonly {
    readonly code: string;
    readonly severity: "info" | "warning" | "error";
    readonly message: string;
    readonly nextAction: string;
  }[];
  readonly claimBoundary: string;
}

const NATIVE_SUPPORTED_FORMATS = new Set<AssetImportPreflightFormat>(["gltf", "glb", "obj"]);

const EXTENSION_FORMATS: Record<string, AssetImportPreflightFormat> = {
  ".gltf": "gltf",
  ".glb": "glb",
  ".fbx": "fbx",
  ".usd": "usd",
  ".usda": "usd",
  ".usdc": "usd",
  ".usdz": "usdz",
  ".obj": "obj",
  ".dae": "dae"
};

export function createAssetImportPreflightReport(
  url: string,
  options: AssetImportPreflightOptions = {}
): AssetImportPreflightReport {
  const trimmed = url.trim();
  if (!trimmed) {
    throw new Error("Asset import preflight URL is required.");
  }
  if (options.fileBytes !== undefined && (!Number.isFinite(options.fileBytes) || options.fileBytes < 0)) {
    throw new Error("Asset import preflight fileBytes must be a non-negative finite number.");
  }
  const profile = options.profile ?? "balanced";
  const format = detectAssetImportFormat(trimmed);
  const supportedByCurrentLoader = NATIVE_SUPPORTED_FORMATS.has(format);
  const status = supportedByCurrentLoader ? "supported" : format === "unknown" ? "blocked" : "convert-required";
  const diagnostics = preflightDiagnostics(format, status);
  return {
    source: "origin-master-asset-importer-adapted",
    url: trimmed,
    format,
    profile,
    status,
    supportedByCurrentLoader,
    ...(options.fileBytes !== undefined ? { fileBytes: Math.round(options.fileBytes) } : {}),
    settings: settingsForProfile(profile),
    stages: stagesFor(format, status),
    diagnostics,
    claimBoundary: "This preflight adapts old import-profile ideas for the current glTF-first pipeline. glTF/GLB are production corpus formats and OBJ has a bounded native geometry-only loader; native FBX/USD/USDZ/DAE import and Unity/Unreal/DCC pipeline parity remain blocked."
  };
}

export function detectAssetImportFormat(url: string): AssetImportPreflightFormat {
  const path = url.split(/[?#]/, 1)[0] ?? url;
  const lower = path.toLowerCase();
  const extension = Object.keys(EXTENSION_FORMATS)
    .sort((left, right) => right.length - left.length)
    .find((candidate) => lower.endsWith(candidate));
  return extension ? EXTENSION_FORMATS[extension] ?? "unknown" : "unknown";
}

function settingsForProfile(profile: AssetImportPreflightProfile): AssetImportPreflightSettings {
  switch (profile) {
    case "high-quality":
      return {
        texture: { maxSize: 4096, compression: "prefer-source", generateMipmaps: true, colorSpace: "srgb" },
        mesh: { optimize: true, generateNormals: true, generateTangents: true, weldVertices: true }
      };
    case "web":
      return {
        texture: { maxSize: 2048, compression: "basis", generateMipmaps: true, colorSpace: "srgb" },
        mesh: { optimize: true, generateNormals: true, generateTangents: true, weldVertices: true, targetTriangleCount: 60_000 }
      };
    case "mobile":
      return {
        texture: { maxSize: 1024, compression: "etc2", generateMipmaps: true, colorSpace: "srgb" },
        mesh: { optimize: true, generateNormals: true, generateTangents: false, weldVertices: true, targetTriangleCount: 25_000 }
      };
    case "balanced":
      return {
        texture: { maxSize: 2048, compression: "bc3", generateMipmaps: true, colorSpace: "srgb" },
        mesh: { optimize: true, generateNormals: true, generateTangents: true, weldVertices: true, targetTriangleCount: 100_000 }
      };
  }
}

function stagesFor(format: AssetImportPreflightFormat, status: AssetImportPreflightStatus): readonly string[] {
  const common = ["identify-format", "normalize-import-settings", "dependency-scan"];
  if (status === "supported") {
    if (format === "obj") {
      return [...common, "obj-geometry-parse", "obj-to-gltf-render-resource-path", "mesh-optimization", "render-resource-validation"];
    }
    return [...common, "gltf-load", "texture-decode", "mesh-optimization", "render-resource-validation"];
  }
  if (status === "convert-required") {
    return [...common, `${format}-external-conversion-required`, "gltf-reimport-required", "render-resource-validation-blocked"];
  }
  return [...common, "unsupported-format-blocked"];
}

function preflightDiagnostics(format: AssetImportPreflightFormat, status: AssetImportPreflightStatus): AssetImportPreflightReport["diagnostics"] {
  if (status === "supported") {
    if (format === "obj") {
      return [{
        code: "ASSET_IMPORT_OBJ_NATIVE_BOUNDED",
        severity: "info",
        message: "Current asset pipeline can parse OBJ geometry natively through the bounded OBJLoader and then reuse the glTF render-resource path.",
        nextAction: "Use OBJ only for geometry-only import evidence; convert materials, animation, skinning, and scene metadata through glTF/GLB before parity claims."
      }];
    }
    return [{
      code: "ASSET_IMPORT_GLTF_SUPPORTED",
      severity: "info",
      message: "Current asset pipeline can load this format through the glTF loader.",
      nextAction: "Run the normal GLTFLoader/import pipeline and browser visual evidence."
    }];
  }
  if (status === "convert-required") {
    return [{
      code: "ASSET_IMPORT_EXTERNAL_CONVERSION_REQUIRED",
      severity: "warning",
      message: `${format.toUpperCase()} is recognized for preflight only and must be converted to glTF/GLB before current rendering evidence is valid.`,
      nextAction: "Convert through a real DCC/export tool, attach conversion provenance, then run the glTF browser corpus and compatibility reports."
    }];
  }
  return [{
    code: "ASSET_IMPORT_FORMAT_BLOCKED",
    severity: "error",
    message: "The asset extension is not recognized by the current import preflight.",
    nextAction: "Add a narrow preflight mapping and conversion workflow before claiming support."
  }];
}
