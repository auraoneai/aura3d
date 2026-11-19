/**
 * `aura3d assets convert` (A5): FBX / OBJ / DAE / USD(A/Z) / PLY / STL / 3MF / VOX / BVH -> GLB.
 *
 * Every source goes through Aura3D's own bounded, Node-capable importer in @aura3d/assets (the same parsers the runtime
 * format adapters use), which already emits a glTF 2.0 document; this module captures that document, resolves its
 * external textures only when asked (--embed-textures), applies the requested unit/up-axis correction, and writes a
 * self-contained GLB with glTF-Transform. The importers cover a documented subset of each format, so the result is
 * never a full-parity conversion: every loss the importer reports is returned as a diagnostic.
 */

import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { createAssetImportPreflightReport, LoadContext, OBJLoader, type AssetImportPreflightReport, type GLTFLoader } from "@aura3d/assets";
import { GltfToolkitMissingError, type Loose } from "../assets/gltfToolkit.js";
import { bvhToGltf } from "./bvh.js";
import { CONVERT_INPUT_EXTENSIONS } from "./hint.js";

type Json = Record<string, any>;

export type ConvertSeverity = "info" | "warning" | "error";
export type ConvertDiagnosticSource = "preflight-input" | "preflight-output" | "importer" | "convert" | "verify";

export interface ConvertDiagnostic {
  readonly code: string;
  readonly severity: ConvertSeverity;
  readonly message: string;
  readonly source: ConvertDiagnosticSource;
  readonly nextAction?: string;
}

export interface ConvertModelOptions {
  readonly input: string;
  readonly output: string;
  /** Resolve relative paths from here (the CLI passes io.cwd). */
  readonly cwd?: string;
  /** Multiply all lengths (after the importer's own unit conversion). Default 1. */
  readonly unitScale?: number;
  /**
   * Source up axis. Formats that declare their axes (FBX, DAE, USD, 3MF, VOX) are already converted to +Y up by the
   * importer, so `z` there is an explicit extra correction; for OBJ / PLY / STL / BVH it is the axis interpretation.
   */
  readonly up?: "y" | "z";
  /** Read external texture files next to the source and embed them. Without it they are dropped and reported. */
  readonly embedTextures?: boolean;
}

export interface ConvertVerification {
  readonly ok: boolean;
  readonly failures: readonly string[];
  readonly warnings: readonly string[];
  readonly vertexCount?: number;
  readonly bounds?: { readonly min: readonly number[]; readonly max: readonly number[]; readonly size: readonly number[] };
  readonly meshes: number;
  readonly materials: number;
  readonly textures: number;
  readonly animations: readonly string[];
  readonly skins: number;
}

export interface ConvertModelResult {
  readonly ok: boolean;
  readonly schema: "aura3d.assets-convert/1";
  readonly input: string;
  readonly output: string;
  readonly format: string;
  readonly bytes: number;
  /** Always "partial": the importers convert a documented subset of each format. */
  readonly parity: "partial";
  readonly claimBoundary: string;
  readonly unitScale: number;
  readonly up: "y" | "z" | "declared";
  readonly embeddedTextures: readonly string[];
  readonly droppedTextures: readonly string[];
  readonly preflight: { readonly input: AssetImportPreflightReport; readonly output: AssetImportPreflightReport };
  readonly verification: ConvertVerification;
  readonly diagnostics: readonly ConvertDiagnostic[];
}

/** Formats whose importer already maps the document's declared units and up axis to metres / +Y up. */
const DECLARED_AXES = new Set(["fbx", "dae", "usd", "usda", "usdz", "3mf", "vox"]);
const IMAGE_EXTENSIONS = /\.(?:png|jpe?g)$/i;
const VIRTUAL_ROOT = "https://aura3d-convert.invalid/source/";
const MAX_SOURCE_BYTES = 64 * 1024 * 1024;

export class ConvertUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConvertUsageError";
  }
}

export function convertUsage(): string {
  return [
    "aura3d assets convert <in.fbx|.obj|.dae|.usd|.usda|.usdz|.ply|.stl|.3mf|.vox|.bvh> --out out.glb [--unit-scale N] [--up y|z] [--embed-textures] [--json]",
    "  Converts a model (or a BVH skeleton + clip) to a self-contained GLB through Aura3D's bounded native importers, then",
    "  re-inspects the GLB (bounds, vertices, readable materials). Partial parity: the importers convert a documented",
    "  subset of each format and report every loss as a diagnostic; check it visually before shipping.",
    "  --unit-scale N     multiply lengths by N after the importer's unit handling (e.g. 0.01 for centimetre OBJ/STL/PLY/BVH)",
    "  --up y|z           source up axis for OBJ/PLY/STL/BVH (default y); FBX/DAE/USD/3MF/VOX are already converted from",
    "                     their declared axes, so --up z there applies an extra -90 deg X correction",
    "  --embed-textures   read external texture files (PNG/JPEG next to the source) and embed them; without it they are",
    "                     dropped and listed (textures already inside FBX/USDZ/3MF are always kept)",
    "  --json             print one JSON report",
    "  Exit 0 converted and verified, 1 conversion or verification failure, 2 usage error.",
    "  Then: aura3d assets inspect out.glb, aura3d assets add out.glb --name <key>."
  ].join("\n");
}

/** Load only the glTF-Transform packages conversion needs (core + extensions), from the project or the CLI install. */
export function loadConvertToolkit(projectDir: string): { readonly NodeIO: Loose; readonly ALL_EXTENSIONS: Loose } {
  const requirers = [createRequire(resolve(projectDir, "package.json")), createRequire(import.meta.url)];
  const missing: string[] = [];
  const load = (id: string): Loose => {
    for (const req of requirers) {
      try {
        return req(id);
      } catch {
        // try the next resolution root
      }
    }
    missing.push(id);
    return undefined;
  };
  const core = load("@gltf-transform/core");
  const extensions = load("@gltf-transform/extensions");
  if (missing.length > 0) throw new GltfToolkitMissingError(missing);
  return { NodeIO: core.NodeIO, ALL_EXTENSIONS: extensions.ALL_EXTENSIONS };
}

function diag(source: ConvertDiagnosticSource, code: string, severity: ConvertSeverity, message: string, nextAction?: string): ConvertDiagnostic {
  return { code, severity, message, source, ...(nextAction ? { nextAction } : {}) };
}

/** Importer diagnostics arrive as strings ("CODE: message" or prose) or records; normalise them. */
function importerDiagnostic(format: string, value: unknown): ConvertDiagnostic {
  if (typeof value === "string") {
    const match = /^([A-Z][A-Z0-9_]{2,}):\s*(.*)$/s.exec(value);
    return diag("importer", match ? match[1]! : `${format.toUpperCase()}_IMPORT_NOTE`, "warning", match ? match[2]! : value);
  }
  const record = (value ?? {}) as { code?: unknown; message?: unknown; severity?: unknown; path?: unknown };
  const severity = record.severity === "info" || record.severity === "error" ? record.severity : "warning";
  const message = `${String(record.message ?? "")}${typeof record.path === "string" ? ` (${record.path})` : ""}`;
  return diag("importer", typeof record.code === "string" ? record.code : `${format.toUpperCase()}_IMPORT_NOTE`, severity, message);
}

interface CapturedImport {
  readonly json: Json;
  readonly diagnostics: ConvertDiagnostic[];
}

/**
 * The importers hand their generated glTF to a GLTFLoader as a `data:model/gltf+json,` URL. This stand-in captures that
 * document instead of building runtime resources, and returns the minimal structural asset the importers wrap.
 */
function captureLoader(): { readonly loader: GLTFLoader; take(): Json } {
  let captured: Json | undefined;
  const prefix = "data:model/gltf+json,";
  const loader = {
    async load(request: { readonly url: string }) {
      if (!request.url.startsWith(prefix)) throw new Error("CONVERT_INTERNAL: the importer did not emit an inline glTF document");
      captured = JSON.parse(decodeURIComponent(request.url.slice(prefix.length))) as Json;
      return {
        url: request.url,
        disposed: false,
        loaderDiagnostics: {
          schemaVersion: "gltf-loader-diagnostics", features: [], extensionsUsed: [], extensionsRequired: [], unsupportedExtensions: [], unsupportedFeatures: [],
          meshCount: 0, primitiveCount: 0, vertexCount: 0, indexCount: 0, materialCount: 0, textureCount: 0, imageCount: 0, animationCount: 0
        },
        images: [], textures: [], materials: [], materialVariants: [], scenes: [], defaultScene: undefined, meshes: [], cameras: [], lights: [], skins: [], animations: [],
        createScene: () => { throw new Error("CONVERT_INTERNAL: capture-only asset"); },
        toJSON: () => ({})
      };
    },
    dispose() {}
  };
  return {
    loader: loader as unknown as GLTFLoader,
    take: () => {
      if (!captured) throw new Error("CONVERT_INTERNAL: the importer produced no glTF document");
      return captured;
    }
  };
}

/** Map a dependency reference to a file inside the source directory, or undefined when it would leave it. */
function localDependency(sourceDir: string, reference: string): string | undefined {
  let relativePath: string;
  if (reference.startsWith(VIRTUAL_ROOT)) {
    const url = new URL(reference);
    if (url.search || url.hash) return undefined;
    try { relativePath = decodeURIComponent(url.pathname.slice(new URL(VIRTUAL_ROOT).pathname.length)); } catch { return undefined; }
  } else if (/^[a-z][a-z0-9+.-]*:/i.test(reference) && !/^[a-z]:[\\/]/i.test(reference)) {
    return undefined;
  } else {
    relativePath = reference.replace(/\\/g, "/");
  }
  if (!relativePath || relativePath.includes("\0")) return undefined;
  const candidate = isAbsolute(relativePath) || /^[a-z]:\//i.test(relativePath) ? undefined : resolve(sourceDir, relativePath);
  const inside = (path: string): boolean => {
    const rel = relative(sourceDir, path);
    return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
  };
  if (candidate && inside(candidate) && existsSync(candidate)) return candidate;
  // Authoring tools often store absolute or foreign paths; fall back to the file name next to the source.
  const sibling = resolve(sourceDir, basename(relativePath));
  return existsSync(sibling) && inside(sibling) ? sibling : undefined;
}

function isPngOrJpeg(bytes: Uint8Array): "image/png" | "image/jpeg" | undefined {
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  return undefined;
}

const MTL_TEXTURE_STATEMENT = /^\s*(?:map_[A-Za-z_]+|bump|norm|disp|decal|refl)\s+(.+?)\s*$/;

/**
 * Serve the importers' fetches from the source directory (OBJ + MTL, USDA layers and textures) by temporarily routing
 * a virtual origin to local files. Anything else except data: URLs is refused: conversion never touches the network.
 */
async function withLocalSourceFetch<T>(sourceDir: string, embedTextures: boolean, state: TextureState, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  const replacement = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (href.startsWith("data:")) return original(input, init);
    if (!href.startsWith(VIRTUAL_ROOT)) throw new Error(`CONVERT_REMOTE_DEPENDENCY: ${href} is not a local file next to the source; assets convert reads local files only.`);
    const display = decodeURIComponent(new URL(href).pathname.slice(new URL(VIRTUAL_ROOT).pathname.length));
    const file = localDependency(sourceDir, href);
    if (IMAGE_EXTENSIONS.test(display)) {
      if (!embedTextures) {
        state.dropped.add(display);
        throw new Error(`CONVERT_TEXTURE_EXTERNAL: ${display} is an external texture; pass --embed-textures to read and embed it.`);
      }
      if (!file) throw new Error(`CONVERT_DEPENDENCY_MISSING: texture ${display} was not found next to the source.`);
      state.embedded.add(display);
    }
    if (!file) throw new Error(`CONVERT_DEPENDENCY_MISSING: ${display} was not found next to the source (paths must stay inside its directory).`);
    if (statSync(file).size > MAX_SOURCE_BYTES) throw new Error(`CONVERT_DEPENDENCY_LIMIT: ${display} exceeds 64 MiB.`);
    let bytes: Uint8Array = readFileSync(file);
    if (!embedTextures && /\.mtl$/i.test(file)) {
      // Keep the material colours; drop texture statements so the OBJ importer does not need the image files.
      const kept: string[] = [];
      for (const line of Buffer.from(bytes).toString("utf8").split(/\r?\n/)) {
        const match = MTL_TEXTURE_STATEMENT.exec(line);
        if (match) state.dropped.add(match[1]!.split(/\s+/).at(-1)!);
        else kept.push(line);
      }
      bytes = Buffer.from(kept.join("\n"), "utf8");
    }
    return new Response(new Uint8Array(bytes), { status: 200, headers: { "content-type": "application/octet-stream" } });
  };
  globalThis.fetch = replacement as typeof fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

interface TextureState {
  readonly embedded: Set<string>;
  readonly dropped: Set<string>;
}

async function importSource(format: string, file: string, options: { unitScale: number; embedTextures: boolean }, state: TextureState): Promise<CapturedImport> {
  const sourceDir = dirname(file);
  const name = basename(file);
  const virtualUrl = `${VIRTUAL_ROOT}${encodeURIComponent(name)}`;
  const bytes = readFileSync(file);
  if (bytes.byteLength > MAX_SOURCE_BYTES) throw new Error(`CONVERT_SOURCE_LIMIT: ${name} exceeds the 64 MiB importer budget.`);
  const importers = await import("@aura3d/assets/importers");
  const diagnostics: ConvertDiagnostic[] = [];
  switch (format) {
    case "fbx": {
      const result = await importers.parseFBX(new Uint8Array(bytes));
      diagnostics.push(diag("importer", "FBX_SOURCE", "info", `FBX ${result.version}, ${result.unitInMeters} m per unit, converted to metres and +Y up by the importer.`));
      diagnostics.push(...result.diagnostics.map((item) => importerDiagnostic(format, item)));
      return { json: result.gltf as Json, diagnostics };
    }
    case "dae": {
      const result = importers.parseCollada(new TextDecoder("utf-8", { fatal: true }).decode(bytes), { baseUrl: virtualUrl });
      diagnostics.push(diag("importer", "COLLADA_SOURCE", "info", `COLLADA ${result.upAxis}, ${result.unitMeter} m per unit, converted to metres and +Y up by the importer.`));
      diagnostics.push(...result.diagnostics.map((item) => importerDiagnostic(format, item)));
      return { json: result.gltf as unknown as Json, diagnostics };
    }
    case "usd":
    case "usda":
    case "usdz": {
      const capture = captureLoader();
      const loader = new importers.USDLoader(capture.loader);
      const asset = await withLocalSourceFetch(sourceDir, options.embedTextures, state, () => loader.load({ url: virtualUrl, type: format }, new LoadContext()));
      diagnostics.push(...asset.usdDiagnostics.map((item) => importerDiagnostic(format, item)));
      return { json: capture.take(), diagnostics };
    }
    case "obj": {
      const capture = captureLoader();
      const loader = new OBJLoader(capture.loader);
      const asset = await withLocalSourceFetch(sourceDir, options.embedTextures, state, () => loader.load({ url: virtualUrl, type: "obj" }, new LoadContext()));
      diagnostics.push(...asset.loaderDiagnostics.unsupportedFeatures.map((item) => importerDiagnostic(format, item)));
      return { json: capture.take(), diagnostics };
    }
    case "ply":
    case "stl":
    case "vox": {
      let mesh: import("@aura3d/assets/importers").NativeMeshData;
      if (format === "vox") {
        const parsed = importers.parseVOX(new Uint8Array(bytes), { frame: 0 });
        diagnostics.push(diag("importer", "VOX_FRAME_ZERO", "info", "VOX frame 0 with visible scene transforms flattened into one +Y-up mesh; animation and hierarchy are not retained."));
        diagnostics.push(...parsed.diagnostics.map((item) => importerDiagnostic(format, item)));
        mesh = parsed.mesh;
      } else if (format === "ply") {
        const parsed = importers.parsePLY(new Uint8Array(bytes));
        const properties = parsed.elements.vertex?.properties ?? {};
        if (["scale_0", "rot_0", "opacity", "f_dc_0"].every((field) => Object.hasOwn(properties, field))) {
          throw new Error("PLY_GAUSSIAN_SPLAT: this PLY is a Gaussian splat; converting it to a triangle mesh would discard its splat attributes. Use a splat pipeline instead.");
        }
        mesh = parsed;
      } else {
        mesh = importers.parseSTL(new Uint8Array(bytes));
      }
      const capture = captureLoader();
      const asset = await importers.loadNativeMeshAsset(mesh, format, virtualUrl, capture.loader, new LoadContext());
      diagnostics.push(...asset.loaderDiagnostics.unsupportedFeatures.map((item) => importerDiagnostic(format, item)));
      return { json: capture.take(), diagnostics };
    }
    case "3mf": {
      const parsed = await importers.parseModel3MF(new Uint8Array(bytes));
      diagnostics.push(diag("importer", "3MF_SOURCE", "info", `3MF in ${parsed.unit} (${parsed.metersPerUnit} m per unit), converted to metres and +Y up by the importer.`));
      diagnostics.push(...parsed.diagnostics.map((item) => importerDiagnostic(format, item)));
      return { json: structuredClone(parsed.gltf) as Json, diagnostics };
    }
    case "bvh": {
      const clipName = basename(file, extname(file));
      const parsed = importers.parseBVH(new TextDecoder("utf-8", { fatal: true }).decode(bytes), { unitScale: options.unitScale, clipName });
      diagnostics.push(...parsed.diagnostics.map((item) => importerDiagnostic(format, item)));
      diagnostics.push(diag("convert", "CONVERT_BVH_SKELETON_CLIP", "info",
        `BVH becomes a ${parsed.joints.length}-joint skeleton, one ${parsed.frameCount}-frame clip "${clipName}" and a skinned joint-marker proxy mesh.`,
        "Retarget the clip onto a rigged character with `aura3d animation import <file.bvh> --onto rigged.glb`."));
      return { json: bvhToGltf(parsed, clipName), diagnostics };
    }
    default:
      throw new ConvertUsageError(`Unsupported input .${format}. assets convert accepts: ${CONVERT_INPUT_EXTENSIONS.map((ext) => `.${ext}`).join(" ")}.`);
  }
}

/** Collect resources for non-data image URIs: embedded bytes when allowed and found, an empty marker otherwise. */
function externalImageResources(json: Json, sourceDir: string, embedTextures: boolean, state: TextureState, diagnostics: ConvertDiagnostic[]): Record<string, Uint8Array> {
  const resources: Record<string, Uint8Array> = {};
  for (const image of (json.images ?? []) as Json[]) {
    const uri = image.uri;
    if (typeof uri !== "string" || uri.startsWith("data:") || uri in resources) continue;
    const display = uri.startsWith(VIRTUAL_ROOT) ? decodeURIComponent(new URL(uri).pathname.slice(new URL(VIRTUAL_ROOT).pathname.length)) : uri;
    resources[uri] = new Uint8Array(0);
    if (!embedTextures) {
      state.dropped.add(display);
      continue;
    }
    const file = localDependency(sourceDir, uri);
    const bytes = file && statSync(file).size <= MAX_SOURCE_BYTES ? new Uint8Array(readFileSync(file)) : undefined;
    const mime = bytes ? isPngOrJpeg(bytes) : undefined;
    if (!bytes || !mime) {
      state.dropped.add(display);
      diagnostics.push(diag("convert", "CONVERT_TEXTURE_MISSING", "warning", `Texture ${display} ${bytes ? "is not a PNG or JPEG" : "was not found next to the source"}; it was left out.`,
        "Put the PNG/JPEG next to the source file (same relative path) and convert again."));
      continue;
    }
    image.mimeType = mime;
    resources[uri] = bytes;
    state.embedded.add(display);
  }
  return resources;
}

function wrapSceneRoots(doc: Loose, scale: number, upZ: boolean): void {
  const root = doc.getRoot();
  for (const scene of root.listScenes()) {
    const wrapper = doc.createNode("aura3d-convert-root");
    if (scale !== 1) wrapper.setScale([scale, scale, scale]);
    if (upZ) wrapper.setRotation([-Math.SQRT1_2, 0, 0, Math.SQRT1_2]);
    for (const child of scene.listChildren()) {
      scene.removeChild(child);
      wrapper.addChild(child);
    }
    scene.addChild(wrapper);
  }
}

async function verifyOutput(io: Loose, output: string, cwd: string, expectAnimations: number): Promise<ConvertVerification> {
  const failures: string[] = [];
  const doc = await io.read(output);
  const root = doc.getRoot();
  const meshes = root.listMeshes();
  const animations = root.listAnimations().map((animation: Loose) => animation.getName() as string);
  if (root.listScenes().length === 0) failures.push("GLB has no scene");
  if (meshes.length === 0) failures.push("GLB has no mesh");
  for (const mesh of meshes) {
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute("POSITION");
      if (!position || position.getCount() === 0) failures.push(`mesh "${mesh.getName()}" has a primitive without POSITION data`);
    }
  }
  if (animations.length !== expectAnimations) failures.push(`expected ${expectAnimations} animation(s) from the importer, GLB has ${animations.length}`);
  // The same inspector `aura3d assets inspect` runs; loaded lazily to keep the command registry import-light.
  const { inspectAsset } = await import("../../index.js");
  const inspection = inspectAsset({ file: output, projectDir: cwd });
  const bounds = inspection.boundsMetadata;
  if (!bounds || ![...bounds.min, ...bounds.max].every(Number.isFinite) || !(bounds.maxDimension > 0)) failures.push("bounds could not be extracted or are degenerate");
  if (!(inspection.vertexCount && inspection.vertexCount > 0)) failures.push("no vertices were found");
  if ((inspection.materialMetadata ?? []).some((material) => !material.visible || !material.readable)) failures.push("one or more materials are invisible or unreadable");
  return {
    ok: failures.length === 0,
    failures,
    warnings: inspection.warnings,
    ...(inspection.vertexCount !== undefined ? { vertexCount: inspection.vertexCount } : {}),
    ...(bounds ? { bounds: { min: bounds.min, max: bounds.max, size: bounds.size } } : {}),
    meshes: meshes.length,
    materials: root.listMaterials().length,
    textures: root.listTextures().length,
    animations,
    skins: root.listSkins().length
  };
}

/** Convert one source file to a GLB, verify it, and report every importer loss. Throws ConvertUsageError on bad input. */
export async function convertModel(options: ConvertModelOptions): Promise<ConvertModelResult> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const input = resolve(cwd, options.input);
  const output = resolve(cwd, options.output);
  const format = extname(input).slice(1).toLowerCase();
  if (!CONVERT_INPUT_EXTENSIONS.includes(format)) {
    throw new ConvertUsageError(`Unsupported input "${options.input}". assets convert accepts: ${CONVERT_INPUT_EXTENSIONS.map((ext) => `.${ext}`).join(" ")} (glTF/GLB need no conversion).`);
  }
  if (extname(output).toLowerCase() !== ".glb") throw new ConvertUsageError(`--out must name a .glb file, got "${options.output}".`);
  if (!existsSync(input) || !statSync(input).isFile()) throw new ConvertUsageError(`Input "${options.input}" does not exist or is not a file.`);
  const unitScale = options.unitScale ?? 1;
  if (!Number.isFinite(unitScale) || unitScale <= 0) throw new ConvertUsageError("--unit-scale must be a positive number, e.g. 0.01 for centimetres.");
  if (options.up !== undefined && options.up !== "y" && options.up !== "z") throw new ConvertUsageError("--up must be y or z.");
  const embedTextures = options.embedTextures === true;
  const declared = DECLARED_AXES.has(format);
  const upZ = options.up === "z";

  const toolkit = loadConvertToolkit(cwd);
  const diagnostics: ConvertDiagnostic[] = [];
  const preflightInput = createAssetImportPreflightReport(basename(input), { fileBytes: statSync(input).size });
  diagnostics.push(...preflightInput.diagnostics.map((item) => diag("preflight-input", item.code, item.severity, item.message, item.nextAction)));

  const sourceDir = realpathSync(dirname(input));
  const state: TextureState = { embedded: new Set(), dropped: new Set() };
  const imported = await importSource(format, resolve(sourceDir, basename(input)), { unitScale, embedTextures }, state);
  diagnostics.push(...imported.diagnostics);
  const json = imported.json;
  json.asset = { ...(json.asset ?? {}), version: "2.0" };
  const resources = externalImageResources(json, sourceDir, embedTextures, state, diagnostics);

  const io = new toolkit.NodeIO().registerExtensions(toolkit.ALL_EXTENSIONS);
  const doc = await io.readJSON({ json, resources });
  // Textures whose image was not embedded are removed with every material slot that referenced them.
  for (const texture of doc.getRoot().listTextures()) {
    const image = texture.getImage();
    if (!image || image.byteLength === 0) texture.dispose();
  }
  const sceneScale = format === "bvh" ? 1 : unitScale;
  if (sceneScale !== 1 || upZ) wrapSceneRoots(doc, sceneScale, upZ);

  if (!declared && format !== "bvh" && unitScale === 1) {
    diagnostics.push(diag("convert", "CONVERT_UNITS_ASSUMED", "info", `.${format} declares no unit; source lengths were kept as metres.`, "Pass --unit-scale 0.01 (centimetres) or 0.001 (millimetres) if the model comes out 100x or 1000x too large."));
  }
  if (format === "bvh" && unitScale === 1) {
    diagnostics.push(diag("convert", "CONVERT_UNITS_ASSUMED", "info", "BVH declares no unit; offsets were kept as metres.", "Mocap BVH is often in centimetres: pass --unit-scale 0.01."));
  }
  if (!declared && options.up === undefined) {
    diagnostics.push(diag("convert", "CONVERT_AXES_ASSUMED", "info", `.${format} declares no up axis; +Y up was assumed.`, "Pass --up z if the model lies on its back (typical for STL/PLY from CAD or 3D printing)."));
  }
  if (declared && upZ) {
    diagnostics.push(diag("convert", "CONVERT_AXIS_OVERRIDE", "warning", `The ${format.toUpperCase()} importer already converted the declared up axis; --up z applied an extra -90 deg X rotation on top.`));
  }
  if (state.dropped.size > 0 && !embedTextures) {
    diagnostics.push(diag("convert", "CONVERT_TEXTURE_EXTERNAL", "warning", `External texture(s) left out: ${[...state.dropped].join(", ")}.`, "Pass --embed-textures to read them from next to the source and embed them in the GLB."));
  }
  diagnostics.push(diag("convert", "CONVERT_PARTIAL_PARITY", "info",
    `Converted by Aura3D's bounded ${format.toUpperCase()} importer: a documented subset of the format, not a full-fidelity export.`,
    "Inspect the GLB and look at it in a real renderer before shipping; re-export from the authoring tool to glTF when a loss above matters."));

  const asset = doc.getRoot().getAsset();
  asset.generator = "Aura3D assets convert";
  asset.extras = {
    ...(asset.extras ?? {}),
    aura3d: {
      // Only the up axis is known after conversion; facing direction is not claimed.
      orientation: { upAxis: "+y" },
      convert: { sourceFormat: format, source: basename(input), parity: "partial", unitScale, up: declared && !upZ ? "declared" : options.up ?? "y" }
    }
  };

  mkdirSync(dirname(output), { recursive: true });
  const glb: Uint8Array = await io.writeBinary(doc);
  writeFileSync(output, glb);

  const expectAnimations = Array.isArray(json.animations) ? json.animations.length : 0;
  const verification = await verifyOutput(io, output, cwd, expectAnimations);
  for (const failure of verification.failures) diagnostics.push(diag("verify", "CONVERT_VERIFY_FAILED", "error", failure));
  const preflightOutput = createAssetImportPreflightReport(basename(output), { fileBytes: glb.byteLength });
  diagnostics.push(...preflightOutput.diagnostics.map((item) => diag("preflight-output", item.code, item.severity, item.message, item.nextAction)));

  return {
    ok: verification.ok,
    schema: "aura3d.assets-convert/1",
    input: relativeOrAbsolute(cwd, input),
    output: relativeOrAbsolute(cwd, output),
    format,
    bytes: glb.byteLength,
    parity: "partial",
    claimBoundary: `Partial-parity ${format.toUpperCase()} conversion through Aura3D's bounded importer; the diagnostics list every reported loss. It does not prove visual equivalence with the authoring tool.`,
    unitScale,
    up: declared && !upZ ? "declared" : options.up ?? "y",
    embeddedTextures: [...state.embedded],
    droppedTextures: [...state.dropped],
    preflight: { input: preflightInput, output: preflightOutput },
    verification,
    diagnostics
  };
}

function relativeOrAbsolute(cwd: string, path: string): string {
  const rel = relative(cwd, path);
  return rel && !rel.startsWith("..") && !isAbsolute(rel) ? rel.split(sep).join("/") : path;
}
