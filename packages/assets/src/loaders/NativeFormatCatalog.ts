/**
 * The WP-08 native import catalog: one typed record per format, a shared
 * admission contract with consistent file/archive/pixel/allocation limits and
 * stable diagnostic codes, and an opt-in FormatRegistry that installs every
 * root-renderable model adapter so `model(assets.x)` can use it.
 *
 * Every parser here is independently authored in this package. Formats whose
 * codecs Aura3D does not ship (3DM, JPEG XL, UltraHDR, image LUTs) are listed
 * with `codec: "supplied"` and are refused with NATIVE_FORMAT_CODEC_REQUIRED
 * unless the caller provides that codec.
 */
import type { AssetLoadRequest, AssetLoader } from "../AssetLoader.js";
import { createDefaultFormatRegistry, createGLTFFormatAdapter, type FormatAdapter, FormatRegistry } from "../FormatRegistry.js";
import { GLTFLoader, type GLTFAsset } from "../GLTFLoader.js";
import { LoadContext } from "../LoadContext.js";
import { OBJLoader } from "../OBJLoader.js";
import { parseEXR } from "../EXRLoader.js";
import { createGLTFRenderResources } from "../GLTFRenderResources.js";
import { createMD2GLTFAsset, MD2Loader, parseBVH, parseMDD, type MD2Asset } from "./AnimationFormatLoaders.js";
import { ColladaLoader } from "./ColladaLoader.js";
import { parse3DLCube } from "./ColorLutLoaders.js";
import { FBXLoader } from "./FBXLoader.js";
import { parseImageFormat, type NativeImageFormat, type NativeImageOptions } from "./ImageFormatLoaders.js";
import { AMFLoader, KMZLoader, LDrawLoader, TDSLoader, VRMLLoader } from "./LegacySceneLoaders.js";
import { parseMaterialXDocument } from "./MaterialDocumentLoader.js";
import { PLYLoader, STLLoader } from "./MeshFormatLoaders.js";
import { Model3MFLoader } from "./Model3MFLoader.js";
import { RhinoLoader, type RhinoDecoder } from "./RhinoLoader.js";
import { createScalarVolumeFormatAdapter, inspectScalarVolume } from "./ScalarVolumeLoader.js";
import { parseNRRD, ScientificRenderableLoader, type ScientificFormat } from "./ScientificFormatLoaders.js";
import { USDLoader } from "./USDLoader.js";
import { createSVGGLTFAsset, SVGLoader, type SVGAsset } from "./VectorFormatLoaders.js";
import { createVOXFormatAdapter } from "./VoxelFormatLoaders.js";

export type NativeFormatKind = "scene" | "mesh" | "voxel" | "point-cloud" | "toolpath" | "scalar-volume" | "animation" | "vector" | "texture" | "color-lut" | "material";
export type NativeFormatAssetType = "model" | "scalar-volume" | "animation" | "texture" | "lut" | "material";

/** Independently specified per-format contract; also the source of the public format matrix. */
export interface NativeFormatCatalogEntry {
  readonly id: string;
  readonly name: string;
  readonly extensions: readonly string[];
  readonly mediaTypes: readonly string[];
  readonly kind: NativeFormatKind;
  readonly assetType: NativeFormatAssetType;
  /** `built-in`: Aura3D ships the parser. `supplied`: the application must pass a codec. */
  readonly codec: "built-in" | "supplied";
  /** Installed by createNativeFormatRegistry and renderable with `model(assets.x)`. */
  readonly rootModel: boolean;
  readonly versions: readonly string[];
  readonly units: string;
  readonly coordinates: string;
  readonly dependencies: string;
  readonly losses: string;
}

const entry = (value: NativeFormatCatalogEntry): NativeFormatCatalogEntry => Object.freeze({ ...value, extensions: Object.freeze([...value.extensions]), mediaTypes: Object.freeze([...value.mediaTypes]), versions: Object.freeze([...value.versions]) });

export const NATIVE_FORMAT_CATALOG: readonly NativeFormatCatalogEntry[] = Object.freeze([
  entry({ id: "obj", name: "Wavefront OBJ", extensions: ["obj"], mediaTypes: ["model/obj"], kind: "scene", assetType: "model", codec: "built-in", rootModel: true, versions: ["ASCII"], units: "unspecified (source units kept)", coordinates: "right-handed, +Y up by convention (not declared)", dependencies: "mtllib MTL files and their map_Kd/map_Ke/bump textures, resolved relative to the document", losses: "free-form curves/surfaces and unmapped MTL statements are reported, not converted" }),
  entry({ id: "fbx", name: "Autodesk FBX", extensions: ["fbx"], mediaTypes: ["application/octet-stream"], kind: "scene", assetType: "model", codec: "built-in", rootModel: true, versions: ["ASCII and binary 7000-7999"], units: "UnitScaleFactor (centimetres default) converted to metres", coordinates: "GlobalSettings axis system converted to glTF +Y up", dependencies: "embedded or relative texture files", losses: "NURBS, constraints, cameras/lights outside the mapped subset and layered textures are diagnosed" }),
  entry({ id: "usd", name: "USD (USDA / USDZ)", extensions: ["usd", "usda", "usdz"], mediaTypes: ["model/vnd.usda", "model/vnd.usdz+zip"], kind: "scene", assetType: "model", codec: "built-in", rootModel: true, versions: ["USDA 1.0", "USDZ stored ZIP"], units: "metersPerUnit (default 0.01) converted to metres", coordinates: "upAxis Y or Z converted to glTF +Y up", dependencies: "USDZ archive members or relative asset paths", losses: "binary crate (usdc) layers, composition arcs and unsupported schemas are rejected or diagnosed" }),
  entry({ id: "collada", name: "COLLADA", extensions: ["dae"], mediaTypes: ["model/vnd.collada+xml"], kind: "scene", assetType: "model", codec: "built-in", rootModel: true, versions: ["1.4.1", "1.5.0"], units: "<unit meter> converted to metres", coordinates: "<up_axis> X/Y/Z converted to glTF +Y up", dependencies: "image library URIs relative to the document", losses: "physics, kinematics, effects outside common profile are diagnosed" }),
  entry({ id: "model3mf", name: "3D Manufacturing Format", extensions: ["3mf"], mediaTypes: ["model/3mf"], kind: "mesh", assetType: "model", codec: "built-in", rootModel: true, versions: ["1.0 core (ZIP)"], units: "unit attribute (millimetre default) converted to metres", coordinates: "right-handed +Z up converted to glTF +Y up", dependencies: "package parts only; no external references", losses: "beam lattices, slices and production extensions are diagnosed" }),
  entry({ id: "rhino", name: "Rhino 3DM", extensions: ["3dm"], mediaTypes: ["model/vnd.3dm"], kind: "scene", assetType: "model", codec: "supplied", rootModel: true, versions: ["archive version detected; decoding by supplied codec"], units: "model unit system converted to metres", coordinates: "+Z up converted to glTF +Y up", dependencies: "none (embedded)", losses: "Aura3D ships no 3DM decoder; without RhinoDecoder admission fails with NATIVE_FORMAT_CODEC_REQUIRED" }),
  entry({ id: "amf", name: "Additive Manufacturing File", extensions: ["amf"], mediaTypes: ["application/x-amf"], kind: "mesh", assetType: "model", codec: "built-in", rootModel: true, versions: ["1.1 (XML or ZIP)"], units: "unit attribute converted to metres", coordinates: "+Z up converted to glTF +Y up", dependencies: "ZIP-packed document only", losses: "curved triangles and textures are diagnosed" }),
  entry({ id: "legacy3ds", name: "3D Studio", extensions: ["3ds"], mediaTypes: ["application/x-3ds"], kind: "scene", assetType: "model", codec: "built-in", rootModel: true, versions: ["binary chunk 3"], units: "unspecified (source units kept)", coordinates: "+Z up converted to glTF +Y up", dependencies: "texture names are reported, not fetched", losses: "keyframer animation and texture maps are diagnosed" }),
  entry({ id: "vrml", name: "VRML 97", extensions: ["wrl", "vrml"], mediaTypes: ["model/vrml"], kind: "scene", assetType: "model", codec: "built-in", rootModel: true, versions: ["2.0 utf8"], units: "metres", coordinates: "+Y up (glTF compatible)", dependencies: "Inline/ImageTexture URLs are reported", losses: "scripts, routes, sensors and PROTO are diagnosed" }),
  entry({ id: "ldraw", name: "LDraw", extensions: ["ldr", "mpd", "dat"], mediaTypes: ["application/x-ldraw"], kind: "scene", assetType: "model", codec: "built-in", rootModel: true, versions: ["1.0.x line types 0-5"], units: "LDU (0.4 mm) converted to metres", coordinates: "-Y up converted to glTF +Y up", dependencies: "sub-file references resolved relative to the document under dependency count/byte limits", losses: "conditional lines and BFC edge cases are diagnosed" }),
  entry({ id: "kmz", name: "KMZ (KML + COLLADA)", extensions: ["kmz"], mediaTypes: ["application/vnd.google-earth.kmz"], kind: "scene", assetType: "model", codec: "built-in", rootModel: true, versions: ["KML 2.2 ZIP"], units: "COLLADA unit converted to metres", coordinates: "COLLADA up axis converted; geographic placement is reported, not applied", dependencies: "archive-local COLLADA and PNG/JPEG textures", losses: "non-model KML features are ignored with diagnostics" }),
  entry({ id: "ply", name: "Stanford PLY", extensions: ["ply"], mediaTypes: ["application/ply"], kind: "mesh", assetType: "model", codec: "built-in", rootModel: true, versions: ["1.0 ascii", "1.0 binary_little_endian", "1.0 binary_big_endian"], units: "unspecified (source units kept)", coordinates: "source axes kept", dependencies: "none", losses: "custom elements/properties are retained on the parsed record, not rendered" }),
  entry({ id: "stl", name: "STL", extensions: ["stl"], mediaTypes: ["model/stl"], kind: "mesh", assetType: "model", codec: "built-in", rootModel: true, versions: ["ASCII", "binary little-endian"], units: "unspecified (source units kept)", coordinates: "source axes kept", dependencies: "none", losses: "binary attribute byte counts and colour conventions are not interpreted" }),
  entry({ id: "vox", name: "MagicaVoxel VOX", extensions: ["vox"], mediaTypes: ["application/x-vox"], kind: "voxel", assetType: "model", codec: "built-in", rootModel: true, versions: ["150", "200"], units: "one voxel per unit", coordinates: "+Z up converted to glTF +Y up", dependencies: "none", losses: "one static frame is selected; materials beyond palette colour are diagnosed" }),
  entry({ id: "pcd", name: "Point Cloud Data", extensions: ["pcd"], mediaTypes: ["application/x-pcd"], kind: "point-cloud", assetType: "model", codec: "built-in", rootModel: true, versions: ["0.7 ascii, binary, binary_compressed (LZF)"], units: "metres (PCL convention)", coordinates: "VIEWPOINT reported; points kept in sensor frame", dependencies: "none", losses: "fields other than x/y/z/rgb/normal remain on the typed record" }),
  entry({ id: "pdb", name: "Protein Data Bank", extensions: ["pdb"], mediaTypes: ["chemical/x-pdb"], kind: "point-cloud", assetType: "model", codec: "built-in", rootModel: true, versions: ["3.3 fixed columns"], units: "angstrom", coordinates: "orthogonal Cartesian angstrom", dependencies: "none", losses: "bonds beyond CONECT and secondary structure are not rendered" }),
  entry({ id: "vtk", name: "VTK legacy", extensions: ["vtk"], mediaTypes: ["application/x-vtk"], kind: "mesh", assetType: "model", codec: "built-in", rootModel: true, versions: ["legacy 1.0-4.x ASCII/BINARY POLYDATA and UNSTRUCTURED_GRID"], units: "unspecified", coordinates: "source axes kept", dependencies: "none", losses: "volumetric cells require a volume renderer and are rejected" }),
  entry({ id: "xyz", name: "XYZ points", extensions: ["xyz"], mediaTypes: ["chemical/x-xyz"], kind: "point-cloud", assetType: "model", codec: "built-in", rootModel: true, versions: ["whitespace columns"], units: "unspecified unless xyzUnits is supplied", coordinates: "source axes kept", dependencies: "none", losses: "extra columns remain on the typed record" }),
  entry({ id: "gcode", name: "G-code toolpath", extensions: ["gcode", "gco", "nc"], mediaTypes: ["text/x-gcode"], kind: "toolpath", assetType: "model", codec: "built-in", rootModel: true, versions: ["RS-274 G0-G3, G20/G21, G90/G91"], units: "G21 millimetres or G20 inches", coordinates: "machine axes kept", dependencies: "none", losses: "tool changes and machine-specific codes are diagnosed" }),
  entry({ id: "nrrd", name: "NRRD scalar volume", extensions: ["nrrd", "nhdr"], mediaTypes: ["application/x-nrrd"], kind: "scalar-volume", assetType: "scalar-volume", codec: "built-in", rootModel: false, versions: ["NRRD0001-NRRD0005 raw/ascii/gzip"], units: "space units from the header", coordinates: "space directions/origin applied", dependencies: "detached data file for .nhdr", losses: "non-3D or vector volumes are rejected" }),
  entry({ id: "bvh", name: "Biovision Hierarchy", extensions: ["bvh"], mediaTypes: ["application/x-bvh"], kind: "animation", assetType: "animation", codec: "built-in", rootModel: false, versions: ["HIERARCHY/MOTION"], units: "unspecified; unitScale option", coordinates: "source axes kept", dependencies: "none", losses: "channels other than X/Y/Z position/rotation are rejected" }),
  entry({ id: "md2", name: "Quake II MD2", extensions: ["md2"], mediaTypes: ["application/x-md2"], kind: "scene", assetType: "model", codec: "built-in", rootModel: true, versions: ["8"], units: "unspecified (source units kept)", coordinates: "source axes kept", dependencies: "PCX skins (resolveSkins)", losses: "frames beyond 128 morph targets are rejected; normal table indices are replaced by generated normals" }),
  entry({ id: "mdd", name: "MDD point cache", extensions: ["mdd"], mediaTypes: ["application/x-mdd"], kind: "animation", assetType: "animation", codec: "built-in", rootModel: false, versions: ["big-endian point cache"], units: "unspecified", coordinates: "source axes kept", dependencies: "a mesh with identical vertex order", losses: "contains no topology; must be bound to a matching mesh" }),
  entry({ id: "svg", name: "SVG paths", extensions: ["svg"], mediaTypes: ["image/svg+xml"], kind: "vector", assetType: "model", codec: "built-in", rootModel: true, versions: ["1.1 / 2 shapes and paths"], units: "user units", coordinates: "SVG y-down converted to glTF +Y up on the Z=0 plane", dependencies: "none (external references rejected)", losses: "text, gradients, filters, masks and clip paths are diagnosed" }),
  entry({ id: "exr", name: "OpenEXR", extensions: ["exr"], mediaTypes: ["image/x-exr"], kind: "texture", assetType: "texture", codec: "built-in", rootModel: false, versions: ["2.x scanline/tiled/multipart/deep; NONE/RLE/ZIPS/ZIP/PIZ/PXR24/B44/B44A/DWAA/DWAB (HTJ2K rejected)"], units: "scene-linear", coordinates: "top-left origin", dependencies: "none", losses: "deep data is composited for texture output" }),
  entry({ id: "dds", name: "DirectDraw Surface", extensions: ["dds"], mediaTypes: ["image/vnd-ms.dds"], kind: "texture", assetType: "texture", codec: "built-in", rootModel: false, versions: ["DX9 FourCC", "DX10 header"], units: "pixels", coordinates: "top-left origin", dependencies: "none", losses: "BC1-5 have CPU fallbacks; other block formats require declared GPU support" }),
  entry({ id: "pvr", name: "PowerVR PVR", extensions: ["pvr"], mediaTypes: ["image/x-pvr"], kind: "texture", assetType: "texture", codec: "built-in", rootModel: false, versions: ["PVR3"], units: "pixels", coordinates: "orientation metadata reported", dependencies: "none", losses: "compressed payloads need declared GPU support" }),
  entry({ id: "ktx1", name: "Khronos KTX 1", extensions: ["ktx"], mediaTypes: ["image/ktx"], kind: "texture", assetType: "texture", codec: "built-in", rootModel: false, versions: ["KTX 11"], units: "pixels", coordinates: "KTXorientation reported", dependencies: "none", losses: "compressed payloads need declared GPU support" }),
  entry({ id: "tga", name: "Truevision TGA", extensions: ["tga"], mediaTypes: ["image/x-tga"], kind: "texture", assetType: "texture", codec: "built-in", rootModel: false, versions: ["2.0 types 1-3, 9-11"], units: "pixels", coordinates: "origin bit applied", dependencies: "none", losses: "extension area metadata ignored" }),
  entry({ id: "tiff", name: "TIFF", extensions: ["tif", "tiff"], mediaTypes: ["image/tiff"], kind: "texture", assetType: "texture", codec: "built-in", rootModel: false, versions: ["6.0 baseline; none, PackBits, LZW, Deflate"], units: "pixels", coordinates: "Orientation tag applied", dependencies: "none", losses: "only the first page is decoded" }),
  entry({ id: "jxl", name: "JPEG XL", extensions: ["jxl"], mediaTypes: ["image/jxl"], kind: "texture", assetType: "texture", codec: "supplied", rootModel: false, versions: ["signature checked; decode by supplied codec"], units: "pixels", coordinates: "top-left origin", dependencies: "none", losses: "Aura3D ships no JPEG XL decoder; refused with NATIVE_FORMAT_CODEC_REQUIRED without codecs.jxl" }),
  entry({ id: "ultrahdr", name: "UltraHDR JPEG", extensions: ["uhdr"], mediaTypes: ["image/jpeg"], kind: "texture", assetType: "texture", codec: "supplied", rootModel: false, versions: ["JPEG envelope checked; gain-map decode by supplied codec"], units: "scene-linear after gain map", coordinates: "top-left origin", dependencies: "none", losses: "Aura3D ships no gain-map decoder; refused with NATIVE_FORMAT_CODEC_REQUIRED without codecs.ultrahdr" }),
  entry({ id: "3dl", name: "3DL colour LUT", extensions: ["3dl"], mediaTypes: ["text/plain"], kind: "color-lut", assetType: "lut", codec: "built-in", rootModel: false, versions: ["Autodesk/Lustre lattice, optional Mesh header"], units: "integer output range (outputMax or Mesh depth)", coordinates: "blue-fastest by default", dependencies: "none", losses: "non-cubic lattices are rejected" }),
  entry({ id: "materialx", name: "MaterialX", extensions: ["mtlx"], mediaTypes: ["application/mtlx+xml"], kind: "material", assetType: "material", codec: "built-in", rootModel: false, versions: ["1.38", "1.39"], units: "unitless", coordinates: "texture coordinates per node", dependencies: "xi:include documents and image files", losses: "unsupported nodes and shading models produce explicit diagnostics" })
]);

export function findNativeFormat(formatOrExtension: string): NativeFormatCatalogEntry | undefined {
  const key = formatOrExtension.replace(/^.*\./, "").toLowerCase();
  return NATIVE_FORMAT_CATALOG.find((value) => value.id === key) ?? NATIVE_FORMAT_CATALOG.find((value) => value.extensions.includes(key));
}

/** Consistent limits for every catalog format; each is passed to the format's own bounded parser. */
export interface NativeFormatLimits {
  readonly maxFileBytes: number;
  /** Archive expansion (3MF, USDZ, AMF/KMZ ZIP, gzip NRRD). */
  readonly maxExpandedBytes: number;
  readonly maxPixels: number;
  /** Bytes of decoded typed arrays (geometry, pixels, samples). */
  readonly maxDecodedBytes: number;
  /** Vertices, points, voxels, frames x vertices or similar elements. */
  readonly maxElements: number;
}
export const DEFAULT_NATIVE_FORMAT_LIMITS: NativeFormatLimits = Object.freeze({
  maxFileBytes: 64 * 1024 * 1024,
  maxExpandedBytes: 256 * 1024 * 1024,
  maxPixels: 16 * 1024 * 1024,
  maxDecodedBytes: 256 * 1024 * 1024,
  maxElements: 4_000_000
});

export type NativeFormatDiagnosticCode =
  | "NATIVE_FORMAT_UNKNOWN"
  | "NATIVE_FORMAT_FILE_LIMIT"
  | "NATIVE_FORMAT_ARCHIVE_LIMIT"
  | "NATIVE_FORMAT_PIXEL_LIMIT"
  | "NATIVE_FORMAT_ALLOCATION_LIMIT"
  | "NATIVE_FORMAT_CODEC_REQUIRED"
  | "NATIVE_FORMAT_TRUNCATED"
  | "NATIVE_FORMAT_UNSUPPORTED_VARIANT"
  | "NATIVE_FORMAT_DEPENDENCY_UNRESOLVED"
  | "NATIVE_FORMAT_MALFORMED";

export class NativeFormatAdmissionError extends Error {
  constructor(readonly code: NativeFormatDiagnosticCode, readonly format: string, message: string, readonly sourceCode?: string, options?: { cause?: unknown }) {
    super(`${code}: ${format}: ${message}`, options);
    this.name = "NativeFormatAdmissionError";
  }
}

export interface NativeFormatAdmissionSummary {
  readonly meshes?: number;
  readonly vertices?: number;
  readonly triangles?: number;
  readonly materials?: number;
  readonly nodes?: number;
  readonly animations?: number;
  readonly frames?: number;
  readonly joints?: number;
  readonly width?: number;
  readonly height?: number;
  readonly levels?: number;
  readonly lutSize?: number;
  readonly voxels?: number;
}

export interface NativeFormatAdmission {
  readonly format: string;
  readonly kind: NativeFormatKind;
  readonly assetType: NativeFormatAssetType;
  readonly byteLength: number;
  readonly summary: NativeFormatAdmissionSummary;
  readonly dependencies: readonly string[];
  readonly warnings: readonly string[];
  readonly limits: NativeFormatLimits;
}

export interface NativeFormatCodecs {
  readonly rhino?: RhinoDecoder;
  readonly jxl?: NonNullable<NativeImageOptions["codecs"]>["jxl"];
  readonly ultrahdr?: NonNullable<NativeImageOptions["codecs"]>["ultrahdr"];
}

export interface NativeFormatAdmissionOptions {
  readonly limits?: Partial<NativeFormatLimits>;
  readonly codecs?: NativeFormatCodecs;
  readonly signal?: AbortSignal;
}

function resolveLimits(overrides: Partial<NativeFormatLimits> = {}): NativeFormatLimits {
  const resolved = { ...DEFAULT_NATIVE_FORMAT_LIMITS, ...overrides };
  for (const [name, value] of Object.entries(resolved)) {
    if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${name} must be a positive safe integer`);
  }
  return Object.freeze(resolved);
}

function hasCodec(id: string, codecs: NativeFormatCodecs | undefined): boolean {
  if (id === "rhino") return typeof codecs?.rhino?.decode === "function";
  if (id === "jxl") return typeof codecs?.jxl === "function";
  if (id === "ultrahdr") return typeof codecs?.ultrahdr === "function";
  return true;
}

/** Map a parser's failure onto one stable admission code, keeping its own code when present. */
export function classifyNativeFormatError(format: string, error: unknown): NativeFormatAdmissionError {
  if (error instanceof NativeFormatAdmissionError) return error;
  if (error instanceof DOMException && error.name === "AbortError") throw error;
  const message = error instanceof Error ? error.message : String(error);
  const sourceCode = (error as { code?: unknown })?.code;
  const text = `${typeof sourceCode === "string" ? sourceCode : ""} ${message}`;
  const limited = /limit|exceed|too (?:many|large|big)|maxBytes|maxOutput|maxElements/i.test(text);
  let code: NativeFormatDiagnosticCode;
  if (/codec|decoder (?:is )?required|explicitly (?:supplied|registered)|requires an explicit/i.test(text)) code = "NATIVE_FORMAT_CODEC_REQUIRED";
  else if (limited && /expan|compression ratio|archive|zip|entries|inflate/i.test(text)) code = "NATIVE_FORMAT_ARCHIVE_LIMIT";
  else if (limited && /pixel|dimension|texture size/i.test(text)) code = "NATIVE_FORMAT_PIXEL_LIMIT";
  else if (limited && /file|input|document|byte length/i.test(text) && !/decoded|output/i.test(text)) code = "NATIVE_FORMAT_FILE_LIMIT";
  else if (limited) code = "NATIVE_FORMAT_ALLOCATION_LIMIT";
  else if (/truncat|unexpected end|incomplete|premature/i.test(text)) code = "NATIVE_FORMAT_TRUNCATED";
  else if (/dependenc|not found|missing (?:file|uri|reference)|404|fetch|resolve/i.test(text)) code = "NATIVE_FORMAT_DEPENDENCY_UNRESOLVED";
  else if (/unsupported|not supported/i.test(text)) code = "NATIVE_FORMAT_UNSUPPORTED_VARIANT";
  else code = "NATIVE_FORMAT_MALFORMED";
  return new NativeFormatAdmissionError(code, format, message, typeof sourceCode === "string" ? sourceCode : undefined, { cause: error });
}

function dataUrl(bytes: Uint8Array, mediaType: string): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return `data:${mediaType};base64,${btoa(binary)}`;
}

function gltfSummary(asset: GLTFAsset): NativeFormatAdmissionSummary {
  let vertices = 0, triangles = 0;
  for (const mesh of asset.meshes) {
    vertices += mesh.positions.length;
    triangles += Math.floor((mesh.indices?.length ?? (mesh.topology === "triangles" ? mesh.positions.length : 0)) / 3);
  }
  return { meshes: asset.meshes.length, vertices, triangles, materials: asset.materials.length, animations: asset.animations.length };
}

function gltfWarnings(asset: GLTFAsset): string[] {
  return [...asset.loaderDiagnostics.unsupportedExtensions.map((value) => `unsupported extension ${value}`), ...asset.loaderDiagnostics.unsupportedFeatures];
}

function checkElements(format: string, summary: NativeFormatAdmissionSummary, limits: NativeFormatLimits): void {
  const elements = Math.max(summary.vertices ?? 0, summary.voxels ?? 0, (summary.frames ?? 0) * Math.max(1, summary.joints ?? 0));
  if (elements > limits.maxElements) throw new NativeFormatAdmissionError("NATIVE_FORMAT_ALLOCATION_LIMIT", format, `${elements} elements exceed maxElements ${limits.maxElements}`);
  if (summary.width !== undefined && summary.height !== undefined && summary.width * summary.height > limits.maxPixels) {
    throw new NativeFormatAdmissionError("NATIVE_FORMAT_PIXEL_LIMIT", format, `${summary.width}x${summary.height} exceeds maxPixels ${limits.maxPixels}`);
  }
}

/** A loader that projects a non-glTF source into the native glTF scene path. */
class ProjectedGLTFLoader<S> implements AssetLoader<GLTFAsset> {
  private readonly sources = new WeakMap<GLTFAsset, S>();
  constructor(readonly type: string, private readonly source: AssetLoader<S>, private readonly project: (value: S) => Promise<GLTFAsset>) {}
  canLoad(request: AssetLoadRequest): boolean { return this.source.canLoad(request); }
  async load(request: AssetLoadRequest, context: LoadContext): Promise<GLTFAsset> {
    const value = await this.source.load(request, context);
    let projected: GLTFAsset;
    try { projected = await this.project(value); }
    catch (error) { await this.source.dispose?.(value); throw error; }
    const signal = context.signalFor(request.signal);
    if (signal?.aborted) {
      new GLTFLoader().dispose(projected);
      await this.source.dispose?.(value);
      throw signal.reason ?? new DOMException("Asset load aborted", "AbortError");
    }
    this.sources.set(projected, value);
    return projected;
  }
  /** The typed source record (for example the SVG document or MD2 frames). */
  sourceOf(asset: GLTFAsset): S | undefined { return this.sources.get(asset); }
  async dispose(asset: GLTFAsset): Promise<void> {
    const value = this.sources.get(asset);
    this.sources.delete(asset);
    new GLTFLoader().dispose(asset);
    if (value !== undefined) await this.source.dispose?.(value);
  }
}

function modelLoader(id: string, limits: NativeFormatLimits, codecs: NativeFormatCodecs | undefined): AssetLoader<GLTFAsset> {
  // Some parsers have hard upper bounds below the shared defaults; the
  // shared limit still applies, clamped to what each parser supports.
  const legacy = { maxFileBytes: Math.min(limits.maxFileBytes, 32 * 1024 * 1024), maxArchiveBytes: limits.maxFileBytes, maxExpandedBytes: limits.maxExpandedBytes, maxVertices: Math.min(limits.maxElements, 250_000), maxTriangles: Math.min(limits.maxElements, 250_000) };
  const mesh = { maxFileBytes: limits.maxFileBytes, maxElements: limits.maxElements, maxOutputBytes: limits.maxDecodedBytes };
  const scientific = { maxBytes: limits.maxFileBytes, maxElements: limits.maxElements, maxOutputBytes: limits.maxDecodedBytes };
  switch (id) {
    case "obj": return new OBJLoader();
    case "fbx": return new FBXLoader({ maxBytes: limits.maxFileBytes, maxArrayElements: limits.maxElements * 4, maxTexturePixels: limits.maxPixels });
    case "usd": return new USDLoader(undefined, { maxFileBytes: limits.maxFileBytes, maxExpandedBytes: limits.maxExpandedBytes, maxVertices: Math.min(limits.maxElements, 250_000) });
    case "collada": return new ColladaLoader({ maxBytes: Math.min(limits.maxFileBytes, 32 * 1024 * 1024), maxVertices: Math.min(limits.maxElements, 250_000) });
    case "model3mf": return new Model3MFLoader({ maxArchiveBytes: limits.maxFileBytes, maxExpandedBytes: limits.maxExpandedBytes, maxVertices: limits.maxElements, maxTriangles: limits.maxElements });
    case "rhino": {
      if (!codecs?.rhino) throw new NativeFormatAdmissionError("NATIVE_FORMAT_CODEC_REQUIRED", id, "3DM requires a supplied RhinoDecoder (codecs.rhino); Aura3D ships no 3DM codec");
      return new RhinoLoader({ decoder: codecs.rhino, limits: { maxFileBytes: limits.maxFileBytes, maxVertices: limits.maxElements, maxFaces: limits.maxElements } });
    }
    case "amf": return new AMFLoader(legacy);
    case "legacy3ds": return new TDSLoader(legacy);
    case "vrml": return new VRMLLoader(legacy);
    case "ldraw": return new LDrawLoader(legacy);
    case "kmz": return new KMZLoader(legacy);
    case "ply": return new PLYLoader(undefined, mesh);
    case "stl": return new STLLoader(undefined, mesh);
    case "vox": return createVOXFormatAdapter({ ...mesh, maxVoxelCount: limits.maxElements }).loader;
    case "pcd": case "pdb": case "vtk": case "xyz": case "gcode":
      return new ScientificRenderableLoader(id as ScientificFormat, scientific);
    case "md2": return new ProjectedGLTFLoader<MD2Asset>("md2", new MD2Loader({ maxBytes: limits.maxFileBytes, maxVertices: limits.maxElements, maxDecodedBytes: limits.maxDecodedBytes }),
      (asset) => createMD2GLTFAsset(asset, { maxBytes: limits.maxDecodedBytes }));
    case "svg": return new ProjectedGLTFLoader<SVGAsset>("svg", new SVGLoader({ maxBytes: limits.maxFileBytes }), (asset) => createSVGGLTFAsset(asset));
    default: throw new NativeFormatAdmissionError("NATIVE_FORMAT_UNKNOWN", id, "not a root-renderable model format");
  }
}

function adapterFor(value: NativeFormatCatalogEntry, limits: NativeFormatLimits, codecs: NativeFormatCodecs | undefined): FormatAdapter<GLTFAsset> {
  if (value.id === "vox") return createVOXFormatAdapter({ maxFileBytes: limits.maxFileBytes, maxElements: limits.maxElements, maxOutputBytes: limits.maxDecodedBytes, maxVoxelCount: limits.maxElements });
  const base = createGLTFFormatAdapter(value.id, value.extensions, modelLoader(value.id, limits, codecs), value.mediaTypes.filter((type) => type !== "application/octet-stream" && type !== "text/plain"));
  if (value.id !== "svg") return base;
  return {
    ...base,
    // SVG paint uses the painter's order; keep it in root render resources.
    async buildGLTFResources(asset, options) {
      const resources = await createGLTFRenderResources(asset, options);
      try {
        resources.scene.traverse((node) => {
          if (!node.renderable) return;
          const order = /-(\d+)$/.exec(node.name);
          if (order) node.renderOrder = Number(order[1]) + 1;
          node.renderable.castShadow = false; node.renderable.receiveShadow = false;
        });
      } catch (error) { resources.dispose(); throw error; }
      return resources;
    }
  };
}

export interface NativeFormatRegistryOptions extends Omit<NativeFormatAdmissionOptions, "signal"> {
  /** Restrict installation to these catalog ids; defaults to every root model format available. */
  readonly formats?: readonly string[];
  /** Start from an existing registry instead of the default glTF-only registry. */
  readonly registry?: FormatRegistry;
  /** Also install the NRRD scalar-volume adapter. Defaults to true. */
  readonly scalarVolumes?: boolean;
}

/**
 * Create an app FormatRegistry with glTF plus every root-renderable catalog
 * format. 3DM is installed only when `codecs.rhino` is supplied.
 */
export function createNativeFormatRegistry(options: NativeFormatRegistryOptions = {}): FormatRegistry {
  const limits = resolveLimits(options.limits);
  const registry = options.registry ?? createDefaultFormatRegistry();
  const wanted = options.formats ? new Set(options.formats.map((value) => findNativeFormat(value)?.id ?? value)) : undefined;
  for (const value of NATIVE_FORMAT_CATALOG) {
    if (!value.rootModel || (wanted && !wanted.has(value.id))) continue;
    if (!hasCodec(value.id, options.codecs)) {
      if (wanted?.has(value.id)) throw new NativeFormatAdmissionError("NATIVE_FORMAT_CODEC_REQUIRED", value.id, `${value.name} requires a supplied codec`);
      continue;
    }
    if (registry.list().includes(value.id)) continue;
    registry.register(adapterFor(value, limits, options.codecs));
  }
  if (options.scalarVolumes !== false && (!wanted || wanted.has("nrrd")) && !registry.list().includes("scalar-volume")) {
    registry.register(createScalarVolumeFormatAdapter());
  }
  return registry;
}

/**
 * Strictly admit one in-memory file: enforce the shared limits, run the
 * format's real bounded parser (and glTF projection for models), dispose any
 * created asset, and return a typed summary or a NativeFormatAdmissionError.
 * Self-contained documents only; an external reference fails with
 * NATIVE_FORMAT_DEPENDENCY_UNRESOLVED (admit the dependencies with the document).
 */
export async function admitNativeFormat(input: Uint8Array | ArrayBuffer, format: string, options: NativeFormatAdmissionOptions = {}): Promise<NativeFormatAdmission> {
  const value = findNativeFormat(format);
  if (!value) throw new NativeFormatAdmissionError("NATIVE_FORMAT_UNKNOWN", format, "format is not in the native import catalog");
  const limits = resolveLimits(options.limits);
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength === 0) throw new NativeFormatAdmissionError("NATIVE_FORMAT_TRUNCATED", value.id, "input is empty");
  if (bytes.byteLength > limits.maxFileBytes) throw new NativeFormatAdmissionError("NATIVE_FORMAT_FILE_LIMIT", value.id, `${bytes.byteLength} bytes exceed maxFileBytes ${limits.maxFileBytes}`);
  if (!hasCodec(value.id, options.codecs)) throw new NativeFormatAdmissionError("NATIVE_FORMAT_CODEC_REQUIRED", value.id, `${value.name} requires a supplied codec; Aura3D ships none`);
  const base = { format: value.id, kind: value.kind, assetType: value.assetType, byteLength: bytes.byteLength, limits };
  try {
    const result = await admitBytes(value, bytes, limits, options);
    checkElements(value.id, result.summary, limits);
    return Object.freeze({ ...base, ...result });
  } catch (error) {
    if (options.signal?.aborted) throw options.signal.reason ?? error;
    throw classifyNativeFormatError(value.id, error);
  }
}

type AdmissionBody = Pick<NativeFormatAdmission, "summary" | "dependencies" | "warnings">;
const utf8 = (bytes: Uint8Array): string => new TextDecoder("utf-8", { fatal: true }).decode(bytes);

async function admitBytes(value: NativeFormatCatalogEntry, bytes: Uint8Array, limits: NativeFormatLimits, options: NativeFormatAdmissionOptions): Promise<AdmissionBody> {
  const signal = options.signal;
  if (value.rootModel) {
    const loader = modelLoader(value.id, limits, options.codecs);
    const extension = value.extensions[0]!;
    const request: AssetLoadRequest = { url: dataUrl(bytes, value.mediaTypes[0] ?? "application/octet-stream"), type: value.id === "model3mf" ? "3mf" : value.id === "collada" ? "dae" : value.id === "rhino" ? "3dm" : value.id === "legacy3ds" ? "3ds" : value.id, format: extension, maxBytes: limits.maxFileBytes, signal };
    const asset = await loader.load(request, new LoadContext({ signal }));
    try {
      return { summary: gltfSummary(asset), dependencies: [], warnings: gltfWarnings(asset) };
    } finally { await loader.dispose?.(asset); }
  }
  switch (value.id) {
    case "nrrd": {
      const volume = await parseNRRD(bytes, { maxBytes: limits.maxFileBytes, maxElements: limits.maxElements, maxOutputBytes: limits.maxDecodedBytes });
      const descriptor = inspectScalarVolume(volume, { maxVoxels: limits.maxElements });
      return { summary: { voxels: descriptor.dimensions[0] * descriptor.dimensions[1] * descriptor.dimensions[2] }, dependencies: volume.metadata["data file"] ? [volume.metadata["data file"]] : [], warnings: volume.diagnostics.map((d) => d.message) };
    }
    case "bvh": {
      const bvh = parseBVH(utf8(bytes), { maxBytes: limits.maxFileBytes, maxSamples: limits.maxElements * 4 });
      return { summary: { joints: bvh.joints.length, frames: bvh.frameCount, animations: 1 }, dependencies: [], warnings: bvh.diagnostics.map((d) => `${d.code}: ${d.message}`) };
    }
    case "mdd": {
      const mdd = parseMDD(bytes, { maxBytes: limits.maxFileBytes, maxVertices: limits.maxElements, maxSamples: limits.maxElements });
      return { summary: { vertices: mdd.vertexCount, frames: mdd.frames.length }, dependencies: [], warnings: mdd.diagnostics.map((d) => `${d.code}: ${d.message}`) };
    }
    case "exr": {
      if (bytes.byteLength > limits.maxFileBytes) throw new NativeFormatAdmissionError("NATIVE_FORMAT_FILE_LIMIT", value.id, "input exceeds maxFileBytes");
      const copy = bytes.slice().buffer;
      const exr = await parseEXR(copy, { maxInputBytes: limits.maxFileBytes, maxPixels: limits.maxPixels });
      return { summary: { width: exr.width, height: exr.height, levels: 1 }, dependencies: [], warnings: exr.diagnostics.map((d) => `${d.code}: ${d.message}`) };
    }
    case "dds": case "pvr": case "ktx1": case "tga": case "tiff": case "jxl": case "ultrahdr": {
      const image = await parseImageFormat(bytes, value.id as NativeImageFormat, {
        maxFileBytes: limits.maxFileBytes, maxPixels: limits.maxPixels, maxDecodedBytes: limits.maxDecodedBytes, signal,
        codecs: { ...(options.codecs?.jxl ? { jxl: options.codecs.jxl } : {}), ...(options.codecs?.ultrahdr ? { ultrahdr: options.codecs.ultrahdr } : {}) }
      });
      return { summary: { width: image.width, height: image.height, levels: image.levels.length }, dependencies: [], warnings: [...image.diagnostics] };
    }
    case "3dl": {
      const lut = parse3DLCube(utf8(bytes), { maxBytes: Math.min(limits.maxFileBytes, 8 * 1024 * 1024) });
      return { summary: { lutSize: lut.size }, dependencies: [], warnings: lut.diagnostics.map((d) => d.message) };
    }
    case "materialx": {
      const document = parseMaterialXDocument(utf8(bytes), { maxBytes: Math.min(limits.maxFileBytes, 4 * 1024 * 1024) });
      return { summary: { materials: document.materials.length, nodes: document.nodes.length }, dependencies: [...document.dependencies], warnings: document.diagnostics.map((d) => d.message) };
    }
    default: throw new NativeFormatAdmissionError("NATIVE_FORMAT_UNKNOWN", value.id, "no admission path");
  }
}
