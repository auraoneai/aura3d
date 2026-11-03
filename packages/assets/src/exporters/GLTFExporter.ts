import { GLTF_TEXTURE_TRANSFORM_BINDINGS, hasVerifiedExportCoreChannelOrigin, inspectExportPointerChannelProvenance, inspectRequiredExportPointerLoss, type AuraExportAttribute, type AuraExportResult, type AuraExportScene, type AuraExportTextureSettings } from "./ExportContext";

/** glTF 2.0 writer. Declared source units, up axis and UV origin are converted
 * to glTF's right-handed, metre, Y-up and top-left conventions. */
export interface GLTFExportOptions {
  readonly binary?: boolean;
  /** Embed buffers and supported images. Set false for separately returned files. */
  readonly embedDependencies?: boolean;
  readonly signal?: AbortSignal;
  /** Upper bound on each produced document/buffer, in bytes. Defaults to 256 MiB. */
  readonly maxBytes?: number;
}

type JsonObject = Record<string, unknown>;
type Warning = { code: string; path?: string; message: string };
type Component = 5120 | 5121 | 5122 | 5123 | 5125 | 5126;
type ExportPrimitive = NonNullable<AuraExportScene["meshes"]>[number]["primitives"][number];
type ExportNode = AuraExportScene["nodes"][number];
const MAX_DEFAULT_BYTES = 256 * 1024 * 1024;
const MAX_COLORED_INSTANCES = 1_000_000;
const MAX_EXPORT_WARNINGS = 256;
const MAX_SOURCE_WARNING_INSPECTION = 65_536;
const MAX_WARNING_TEXT = 2048;
const UTF8 = new TextEncoder();

/** Serialize an Aura interchange scene to glTF JSON or a GLB 2.0 container.
 * Dependencies are returned to the caller, never written to disk or fetched.
 * A document cannot faithfully combine verified required pointer channels with
 * optional or unknown-origin pointers; that combination throws
 * GLTF_UNREPRESENTABLE_ANIMATION_POINTER_REQUIREDNESS. A known required
 * pointer which was lost or retargeted throws GLTF_REQUIRED_ANIMATION_POINTER_LOST. */
export function exportGLTF(scene: AuraExportScene, options: GLTFExportOptions = {}): AuraExportResult {
  const signal = options.signal;
  if (options.binary !== undefined && typeof options.binary !== "boolean") throw new Error("GLTF_INVALID_OPTION: binary must be boolean");
  if (options.embedDependencies !== undefined && typeof options.embedDependencies !== "boolean") throw new Error("GLTF_INVALID_OPTION: embedDependencies must be boolean");
  const maxBytes = options.maxBytes ?? MAX_DEFAULT_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error("GLTF_MAX_BYTES: maxBytes must be a positive safe integer");
  const checkAbort = (): void => {
    if (signal?.aborted) throw new DOMException("glTF export cancelled", "AbortError");
  };
  checkAbort();
  const warnings: Warning[] = [];
  let diagnosticsTruncated = false;
  const boundedText = (value: string): string => {
    if (value.length <= MAX_WARNING_TEXT) return value;
    diagnosticsTruncated = true;
    return `${value.slice(0, MAX_WARNING_TEXT - 1)}…`;
  };
  const appendWarning = (code: string, path: string | undefined, message: string): void => {
    if (warnings.length >= MAX_EXPORT_WARNINGS) { diagnosticsTruncated = true; return; }
    warnings.push({ code: boundedText(code), ...(path === undefined ? {} : { path: boundedText(path) }), message: boundedText(message) });
  };
  const warn = (code: string, path: string, message: string): void => { appendWarning(code, path, message); };
  const requiredPointerLost = (message: string, path?: string, pointer?: string): never => {
    const code = "GLTF_REQUIRED_ANIMATION_POINTER_LOST";
    throw Object.assign(new Error(`${code}: ${boundedText(message)}`), {
      code, ...(path === undefined ? {} : { path: boundedText(path) }),
      ...(pointer === undefined ? {} : { pointer: boundedText(pointer) })
    });
  };
  const sourceWarningsDescriptor = Object.getOwnPropertyDescriptor(scene, "sourceWarnings");
  if (sourceWarningsDescriptor && !("value" in sourceWarningsDescriptor)) throw new Error("GLTF_INVALID_PROPERTY: scene.sourceWarnings must be a data property");
  const sourceWarnings: AuraExportScene["sourceWarnings"] = sourceWarningsDescriptor?.value;
  if (sourceWarnings !== undefined && !Array.isArray(sourceWarnings)) throw new Error("GLTF_INVALID_WARNING: sourceWarnings must be an array");
  const requiredLoss = inspectRequiredExportPointerLoss(scene);
  if (requiredLoss) requiredPointerLost(requiredLoss.message, requiredLoss.path, requiredLoss.pointer);
  if (sourceWarnings !== undefined) {
    if (sourceWarnings.length > MAX_SOURCE_WARNING_INSPECTION) {
      throw Object.assign(new Error("GLTF_SOURCE_WARNING_INSPECTION_LIMIT: source warnings exceed the bounded required-loss inspection limit"), {
        code: "GLTF_SOURCE_WARNING_INSPECTION_LIMIT"
      });
    }
    for (let i = 0; i < sourceWarnings.length; i++) {
      if ((i & 8191) === 0) checkAbort();
      const entry = Object.getOwnPropertyDescriptor(sourceWarnings, String(i));
      const warning = entry && "value" in entry ? entry.value : undefined;
      if (!warning || typeof warning !== "object") {
        if (i <= MAX_EXPORT_WARNINGS) warn("INVALID_SOURCE_WARNING", `sourceWarnings[${i}]`, "A malformed source warning was omitted.");
        continue;
      }
      const code = Object.getOwnPropertyDescriptor(warning, "code");
      const message = Object.getOwnPropertyDescriptor(warning, "message");
      const path = Object.getOwnPropertyDescriptor(warning, "path");
      // Loss is a correctness failure even after the diagnostic display cap,
      // including when a snapshot's warnings were copied into a new array.
      if (code && "value" in code && code.value === "REQUIRED_ANIMATION_POINTER_LOST") {
        requiredPointerLost(message && "value" in message && typeof message.value === "string" ? message.value : "A required source pointer was omitted.",
          path && "value" in path && typeof path.value === "string" ? path.value : undefined);
      }
      if (i > MAX_EXPORT_WARNINGS) continue;
      if (!code || !("value" in code) || typeof code.value !== "string" || !message || !("value" in message) || typeof message.value !== "string" || (path && (!("value" in path) || (path.value !== undefined && typeof path.value !== "string")))) {
        warn("INVALID_SOURCE_WARNING", `sourceWarnings[${i}]`, "A malformed source warning was omitted.");
        continue;
      }
      appendWarning(code.value, path?.value, message.value);
    }
    if (sourceWarnings.length > MAX_EXPORT_WARNINGS) diagnosticsTruncated = true;
  }
  const unknown = (object: object, allowed: readonly string[], path: string): void => {
    for (const key of allowed) {
      const descriptor = Object.getOwnPropertyDescriptor(object, key);
      if (descriptor && !("value" in descriptor)) throw new Error(`GLTF_INVALID_PROPERTY: ${path}.${key} must be a data property`);
    }
    for (const key in object) if (Object.prototype.hasOwnProperty.call(object, key) && !allowed.includes(key)) {
      const boundedKey = boundedText(key);
      warn("UNSUPPORTED_PROPERTY", `${path}.${boundedKey}`, `The property ${boundedKey} is not represented in glTF output.`);
      if (warnings.length >= MAX_EXPORT_WARNINGS && diagnosticsTruncated) break;
    }
  };
  const finishWarnings = (): readonly Warning[] => diagnosticsTruncated
    ? [...warnings, { code: "DIAGNOSTICS_TRUNCATED", message: "Additional diagnostics or diagnostic text were omitted due to export limits." }]
    : warnings;
  unknown(scene, ["nodes", "roots", "meshes", "materials", "cameras", "lights", "skins", "animations", "dependencies", "metadata", "sourceWarnings", "metersPerUnit", "upAxis", "uvOrigin", "document", "materialVariants"], "scene");
  const sourceDocument = scene.document;
  if (sourceDocument !== undefined) {
    if (!sourceDocument || typeof sourceDocument !== "object" || Array.isArray(sourceDocument)) throw new Error("GLTF_INVALID_DOCUMENT: scene.document must be an object");
    unknown(sourceDocument, ["generator", "copyright", "version", "minVersion", "extras"], "scene.document");
    for (const key of ["generator", "copyright", "version", "minVersion"] as const) {
      const value = sourceDocument[key];
      if (value !== undefined && (typeof value !== "string" || value.length > 65536)) throw new Error(`GLTF_INVALID_DOCUMENT: scene.document.${key} must be a bounded string`);
    }
    if (sourceDocument.minVersion !== undefined && !/^2\.\d+$/.test(sourceDocument.minVersion)) throw new Error("GLTF_INVALID_DOCUMENT: scene.document.minVersion must be a glTF 2.x version");
    validateMetadata(sourceDocument.extras, "scene.document.extras");
  }
  const variantNames = scene.materialVariants ?? [];
  if (!Array.isArray(variantNames)) throw new Error("GLTF_INVALID_VARIANTS: scene.materialVariants must be an array");
  const seenVariantNames = new Set<string>();
  for (const [index, name] of variantNames.entries()) {
    if (typeof name !== "string" || name.length === 0 || name.length > 65536) throw new Error(`GLTF_INVALID_VARIANTS: scene.materialVariants[${index}] must be a non-empty bounded string`);
    if (seenVariantNames.has(name)) throw new Error(`GLTF_INVALID_VARIANTS: scene.materialVariants[${index}] duplicates ${boundedText(name)}`);
    seenVariantNames.add(name);
  }
  let variantsReferenced = false;
  if (scene.metersPerUnit === undefined) warn("UNIT_CONVENTION_UNSPECIFIED", "scene.metersPerUnit", "glTF assumes metres; the source unit was not specified.");
  else if (!Number.isFinite(scene.metersPerUnit) || scene.metersPerUnit <= 0) throw new Error("GLTF_INVALID_CONVENTION: metersPerUnit must be positive and finite");
  if (scene.upAxis === undefined) warn("UP_AXIS_UNSPECIFIED", "scene.upAxis", "glTF assumes Y-up; the source up axis was not specified.");
  else if (scene.upAxis !== "Y" && scene.upAxis !== "Z") throw new Error("GLTF_INVALID_CONVENTION: upAxis must be Y or Z");
  if (scene.uvOrigin !== undefined && scene.uvOrigin !== "top-left" && scene.uvOrigin !== "bottom-left") throw new Error("GLTF_INVALID_CONVENTION: uvOrigin must be top-left or bottom-left");
  if ((scene.meshes ?? []).some((mesh) => mesh.primitives.some((primitive) => Object.keys(primitive.attributes).some((key) => key.startsWith("TEXCOORD_"))))) {
    if (scene.uvOrigin === undefined) warn("UV_ORIGIN_UNSPECIFIED", "scene.uvOrigin", "glTF assumes a top-left texture origin; the source UV origin was not specified.");
  }
  const unitScale = scene.metersPerUnit ?? 1;
  const scaleLength = (value: number, path: string): number => {
    const converted = value * unitScale;
    if (!Number.isFinite(converted) || (value !== 0 && converted === 0)) throw new Error(`GLTF_CONVENTION_RANGE: ${path} cannot be represented in metres`);
    return converted;
  };
  validateMetadata(scene.metadata, "scene.metadata");
  if (!Array.isArray(scene.nodes) || !Array.isArray(scene.roots)) throw new Error("GLTF_INVALID_SCENE: nodes and roots are required arrays");
  validateGraph(scene, checkAbort);
  const parentByNode = new Int32Array(scene.nodes.length).fill(-1);
  for (let i = 0; i < scene.nodes.length; i++) for (const child of scene.nodes[i].children ?? []) parentByNode[child] = i;
  const reachable = new Uint8Array(scene.nodes.length);
  const pending = [...scene.roots];
  while (pending.length) {
    checkAbort();
    const index = pending.pop()!;
    if (reachable[index]) continue;
    reachable[index] = 1;
    for (const child of scene.nodes[index].children ?? []) pending.push(child);
  }
  if (scene.upAxis === "Z") {
    for (let i = 0; i < scene.nodes.length; i++) if (reachable[i] && scene.nodes[i].skin !== undefined) {
      const skin = scene.skins?.[scene.nodes[i].skin!];
      if (!skin || skin.joints.some((joint) => !reachable[joint]) || (skin.skeleton !== undefined && !reachable[skin.skeleton])) {
        throw new Error(`GLTF_CONVENTION_UNREPRESENTABLE: nodes[${i}] skin joints and skeleton must belong to the exported scene for Z-up conversion`);
      }
    }
  }
  const meshes = scene.meshes ?? [];
  const materials = scene.materials ?? [];
  const cameras = scene.cameras ?? [];
  const lights = scene.lights ?? [];
  const skins = scene.skins ?? [];
  const animations = scene.animations ?? [];
  const doc: JsonObject = {
    // The writer is the generator of this file. Source document provenance is
    // retained verbatim (copyright as-is; source generator/version and extras
    // under a namespaced extras key) so a later reader can recover it.
    asset: {
      version: "2.0", generator: "Aura3D",
      ...(sourceDocument?.minVersion === undefined ? {} : { minVersion: sourceDocument.minVersion }),
      ...(sourceDocument?.copyright === undefined ? {} : { copyright: sourceDocument.copyright }),
      ...documentExtras(scene.metadata, sourceDocument)
    },
    scene: 0,
    scenes: [scene.roots.length ? { nodes: [...scene.roots] } : {}]
  };
  const views: JsonObject[] = [];
  const accessors: JsonObject[] = [];
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  let meshQuantization = false;
  const convertToFloat = (attribute: AuraExportAttribute, path: string, convert: (value: number, index: number) => number): AuraExportAttribute => {
    unknown(attribute, ["values", "itemSize", "normalized"], path);
    const sourceType = componentOf(attribute.values);
    // The interchange contract can contain normalized uint32 data even though
    // glTF cannot encode it directly. Decoding it to FLOAT preserves its
    // effective values (subject to the precision warning below).
    if (attribute.normalized && sourceType === 5126) throw new Error(`GLTF_INVALID_ATTRIBUTE: ${path} cannot normalize this component type`);
    if (attribute.values.length * 4 > maxBytes) throw new Error(`GLTF_SIZE_LIMIT: ${path} exceeds maxBytes`);
    const values = new Float32Array(attribute.values.length);
    let precisionLost = false;
    for (let i = 0; i < values.length; i++) {
      if ((i & 8191) === 0) checkAbort();
      let value = attribute.values[i];
      if (!Number.isFinite(value)) throw new Error(`GLTF_INVALID_ATTRIBUTE: ${path}[${i}] is not finite`);
      if (attribute.normalized) value = normalizedComponent(value, sourceType);
      const converted = convert(value, i);
      const stored = Math.fround(converted);
      if (!Number.isFinite(stored) || (converted !== 0 && stored === 0)) throw new Error(`GLTF_CONVENTION_RANGE: ${path}[${i}] cannot be represented as FLOAT`);
      if (stored !== converted) precisionLost = true;
      values[i] = stored;
    }
    if (sourceType !== 5126) warn("ATTRIBUTE_REENCODED", path, "Convention conversion required decoding the integer attribute to FLOAT.");
    if (precisionLost) warn("ATTRIBUTE_PRECISION_LOSS", path, "Convention conversion rounded values to glTF's 32-bit FLOAT representation.");
    return { values, itemSize: attribute.itemSize };
  };
  const scaleAttribute = (attribute: AuraExportAttribute, path: string, shouldScale: (index: number) => boolean = () => true): AuraExportAttribute => unitScale === 1 ? attribute : convertToFloat(attribute, path, (value, index) => shouldScale(index) ? scaleLength(value, `${path}[${index}]`) : value);
  const flipUV = (attribute: AuraExportAttribute, path: string): AuraExportAttribute => {
    if (scene.uvOrigin !== "bottom-left") return attribute;
    if (attribute.itemSize !== 2) throw new Error(`GLTF_INVALID_ATTRIBUTE: ${path} must be VEC2`);
    const sourceType = componentOf(attribute.values);
    if (attribute.normalized && (sourceType === 5125 || sourceType === 5126)) throw new Error(`GLTF_INVALID_ATTRIBUTE: ${path} cannot normalize this component type`);
    if (sourceType !== 5126) {
      const range = componentRange(sourceType);
      const max = attribute.normalized ? range[1] : 1;
      let representable = true;
      for (let i = 1; i < attribute.values.length; i += 2) {
        const v = attribute.values[i];
        const flipped = max - v;
        if ((attribute.normalized && v === range[0] && range[0] < 0) || flipped < range[0] || flipped > range[1]) { representable = false; break; }
      }
      if (representable) {
        unknown(attribute, ["values", "itemSize", "normalized"], path);
        if (attribute.values.length * componentSize(sourceType) > maxBytes) throw new Error(`GLTF_SIZE_LIMIT: ${path} exceeds maxBytes`);
        const copy = copyIntegerValues(attribute.values);
        for (let i = 1; i < copy.length; i += 2) copy[i] = max - copy[i];
        return { values: copy, itemSize: 2, ...(attribute.normalized ? { normalized: true } : {}) };
      }
    }
    return convertToFloat(attribute, path, (value, index) => index % 2 === 0 ? value : 1 - value);
  };
  const flipTangentHandedness = (attribute: AuraExportAttribute, path: string): AuraExportAttribute => {
    if (scene.uvOrigin !== "bottom-left") return attribute;
    const sourceType = componentOf(attribute.values);
    if (sourceType === 5120 || sourceType === 5122) {
      unknown(attribute, ["values", "itemSize", "normalized"], path);
      if (attribute.values.length * componentSize(sourceType) > maxBytes) throw new Error(`GLTF_SIZE_LIMIT: ${path} exceeds maxBytes`);
      const copy = copyIntegerValues(attribute.values);
      const [min, max] = componentRange(sourceType);
      for (let i = 3; i < copy.length; i += 4) copy[i] = copy[i] === min ? max : -copy[i];
      return { values: copy, itemSize: attribute.itemSize, ...(attribute.normalized ? { normalized: true } : {}) };
    }
    return convertToFloat(attribute, path, (value, index) => index % 4 === 3 ? -value : value);
  };
  const flipUVDelta = (attribute: AuraExportAttribute, path: string): AuraExportAttribute => {
    if (scene.uvOrigin !== "bottom-left") return attribute;
    const sourceType = componentOf(attribute.values);
    if (sourceType === 5120 || sourceType === 5122) {
      const [min, max] = componentRange(sourceType);
      let representable = true;
      for (let i = 1; i < attribute.values.length; i += 2) {
        const value = attribute.values[i];
        // Signed normalized minimum and -maximum both encode -1.
        if (!attribute.normalized && value === min) { representable = false; break; }
      }
      if (representable) {
        unknown(attribute, ["values", "itemSize", "normalized"], path);
        if (attribute.values.length * componentSize(sourceType) > maxBytes) throw new Error(`GLTF_SIZE_LIMIT: ${path} exceeds maxBytes`);
        const copy = copyIntegerValues(attribute.values);
        for (let i = 1; i < copy.length; i += 2) copy[i] = copy[i] === min ? max : -copy[i];
        return { values: copy, itemSize: attribute.itemSize, ...(attribute.normalized ? { normalized: true } : {}) };
      }
    }
    // UV deltas are vectors: flipping the origin negates V, without adding 1.
    return convertToFloat(attribute, path, (value, index) => index % 2 ? -value : value);
  };
  const append = (bytes: Uint8Array, target?: number, byteStride?: number): number => {
    checkAbort();
    const padding = (4 - byteLength % 4) % 4;
    if (byteLength + padding + bytes.byteLength > maxBytes) throw new Error("GLTF_SIZE_LIMIT: binary buffer exceeds maxBytes");
    if (padding) { chunks.push(new Uint8Array(padding)); byteLength += padding; }
    const index = views.length;
    views.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.byteLength, ...(target === undefined ? {} : { target }), ...(byteStride === undefined ? {} : { byteStride }) });
    chunks.push(bytes);
    byteLength += bytes.byteLength;
    return index;
  };
  const addAccessor = (attribute: AuraExportAttribute, path: string, target?: number, bounds = false): number => {
    checkAbort();
    unknown(attribute, ["values", "itemSize", "normalized"], path);
    const { values, itemSize, normalized } = attribute;
    if (![1, 2, 3, 4, 16].includes(itemSize)) throw new Error(`GLTF_INVALID_ATTRIBUTE: ${path} itemSize must be 1, 2, 3, 4, or 16`);
    if (!values || !Number.isSafeInteger(values.length) || values.length === 0 || values.length % itemSize !== 0) throw new Error(`GLTF_INVALID_ATTRIBUTE: ${path} has an invalid value count`);
    const component = componentOf(values);
    if (target === 34962 && itemSize === 16) throw new Error(`GLTF_INVALID_ATTRIBUTE: ${path} vertex attributes cannot be matrices`);
    if (normalized && (component === 5125 || component === 5126)) throw new Error(`GLTF_INVALID_ATTRIBUTE: ${path} cannot normalize this component type`);
    if (target === 34962 && component === 5125) throw new Error(`GLTF_INVALID_ATTRIBUTE: ${path} uses UNSIGNED_INT, which glTF does not permit for vertex attributes`);
    const size = componentSize(component);
    const elementBytes = itemSize * size;
    // Vertex elements, including quantized VEC3 values, must start on a
    // four-byte boundary. Index and animation accessors remain tightly packed.
    const stride = target === 34962 ? Math.ceil(elementBytes / 4) * 4 : elementBytes;
    const byteCount = values.length / itemSize * stride;
    if (byteCount > maxBytes) throw new Error(`GLTF_SIZE_LIMIT: ${path} exceeds maxBytes`);
    const bytes = new Uint8Array(byteCount);
    const view = new DataView(bytes.buffer);
    const min = Array<number>(itemSize).fill(Infinity);
    const max = Array<number>(itemSize).fill(-Infinity);
    let precisionLost = false;
    for (let i = 0; i < values.length; i++) {
      if ((i & 8191) === 0) checkAbort();
      const value = values[i];
      if (!Number.isFinite(value)) throw new Error(`GLTF_INVALID_ATTRIBUTE: ${path}[${i}] is not finite`);
      if (component !== 5126 && !Number.isInteger(value)) throw new Error(`GLTF_INVALID_ATTRIBUTE: ${path}[${i}] is not an integer`);
      const stored = component === 5126 ? Math.fround(value) : value;
      if (!Number.isFinite(stored)) throw new Error(`GLTF_INVALID_ATTRIBUTE: ${path}[${i}] cannot be represented as FLOAT`);
      if (stored !== value) precisionLost = true;
      writeNumber(view, Math.floor(i / itemSize) * stride + (i % itemSize) * size, component, stored);
      min[i % itemSize] = Math.min(min[i % itemSize], stored);
      max[i % itemSize] = Math.max(max[i % itemSize], stored);
    }
    if (precisionLost) warn("ATTRIBUTE_PRECISION_LOSS", path, "Values were rounded to glTF's 32-bit float representation.");
    const index = accessors.length;
    accessors.push({ bufferView: append(bytes, target, stride === elementBytes ? undefined : stride), componentType: component, count: values.length / itemSize,
      type: ({ 1: "SCALAR", 2: "VEC2", 3: "VEC3", 4: "VEC4", 16: "MAT4" } as const)[itemSize],
      ...(normalized ? { normalized: true } : {}), ...(bounds ? { min, max } : {}) });
    return index;
  };
  const reference = (index: number | undefined, length: number, path: string): void => {
    if (index !== undefined && (!Number.isInteger(index) || index < 0 || index >= length)) throw new Error(`GLTF_INVALID_REFERENCE: ${path} is out of range`);
  };
  const usedExtensions = new Set<string>();
  const requiredExtensions = new Set<string>();
  const usedDependencies = new Set<string>();
  const inputDependencies = scene.dependencies ?? [];
  const dependencyByName = new Map<string, (typeof inputDependencies)[number]>();
  const portableDependencyNames = new Set<string>();
  let totalDependencyBytes = 0;
  for (const [i, dep] of inputDependencies.entries()) {
    checkAbort();
    unknown(dep, ["name", "data", "mimeType"], `dependencies[${i}]`);
    validateDependencyName(dep.name);
    if (!(dep.data instanceof Uint8Array)) throw new Error(`GLTF_INVALID_DEPENDENCY: dependencies[${i}] data must be Uint8Array`);
    const portableName = dep.name.normalize("NFC").toLowerCase();
    if (portableDependencyNames.has(portableName)) throw new Error(`GLTF_DUPLICATE_DEPENDENCY: ${dep.name} collides on a case-insensitive filesystem`);
    portableDependencyNames.add(portableName);
    totalDependencyBytes += dep.data.byteLength;
    if (totalDependencyBytes > maxBytes) throw new Error("GLTF_SIZE_LIMIT: dependencies exceed maxBytes");
    dependencyByName.set(dep.name, dep);
  }
  // A single compressed image may supply several slots, e.g. the red
  // occlusion channel and green/blue metallic-roughness channels. Determine
  // the union of sampled channels before judging its DFD.
  const basisUsage = new Map<string, { color: number; data: number }>();
  const ownValue = (object: unknown, key: string, path: string): unknown => {
    if (!object || typeof object !== "object" || Array.isArray(object)) return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    if (descriptor && !("value" in descriptor)) throw new Error(`GLTF_INVALID_PROPERTY: ${path}.${key} must be a data property`);
    return descriptor?.value;
  };
  const registerBasisUsage = (name: unknown, color: boolean, channels: number): void => {
    if (typeof name !== "string") return;
    const dep = dependencyByName.get(name);
    if (!dep || imageMimeType(dep.mimeType, dep.name) !== "image/ktx2") return;
    const usage = basisUsage.get(name) ?? { color: 0, data: 0 };
    if (color) usage.color |= channels;
    else usage.data |= channels;
    basisUsage.set(name, usage);
  };
  const extensionSlots: ReadonlyArray<readonly [string, string, boolean, number]> = [
    ["clearcoat", "texture", false, 1], ["clearcoat", "roughnessTexture", false, 2], ["clearcoat", "normalTexture", false, 7],
    ["diffuseRoughness", "texture", false, 1], ["bump", "texture", false, 1], ["transmission", "texture", false, 1],
    ["diffuseTransmission", "texture", false, 8], ["diffuseTransmission", "colorTexture", true, 7],
    ["volume", "thicknessTexture", false, 2], ["specular", "texture", false, 8], ["specular", "colorTexture", true, 7],
    ["pbrSpecularGlossiness", "specularGlossinessTexture", true, 15], ["sheen", "colorTexture", true, 7],
    ["sheen", "roughnessTexture", false, 8], ["anisotropy", "texture", false, 7],
    ["iridescence", "texture", false, 1], ["iridescence", "thicknessTexture", false, 2]
  ];
  materials.forEach((material, index) => {
    checkAbort();
    const path = `materials[${index}]`;
    const alpha = ownValue(material, "alphaMode", path);
    const colorChannels = alpha === "MASK" || alpha === "BLEND" ? 15 : 7;
    for (const [key, color, channels] of [
      ["baseColorTexture", true, colorChannels], ["metallicRoughnessTexture", false, 6],
      ["normalTexture", false, 7], ["occlusionTexture", false, 1], ["emissiveTexture", true, 7]
    ] as const) registerBasisUsage(ownValue(material, key, path), color, channels);
    const gltf = ownValue(material, "gltf", path);
    const gloss = ownValue(gltf, "pbrSpecularGlossiness", `${path}.gltf`);
    const diffuse = ownValue(gloss, "diffuseTexture", `${path}.gltf.pbrSpecularGlossiness`);
    registerBasisUsage(ownValue(diffuse, "name", `${path}.gltf.pbrSpecularGlossiness.diffuseTexture`), true, colorChannels);
    for (const [extension, slot, color, channels] of extensionSlots) {
      const object = ownValue(gltf, extension, `${path}.gltf`);
      const reference = ownValue(object, slot, `${path}.gltf.${extension}`);
      registerBasisUsage(ownValue(reference, "name", `${path}.gltf.${extension}.${slot}`), color, channels);
    }
  });
  const returnedDependencies: { name: string; data: Uint8Array }[] = [];
  const images: JsonObject[] = [];
  const textures: JsonObject[] = [];
  const samplers: JsonObject[] = [];
  const imageIndices = new Map<string, number>();
  const textureIndices = new Map<string, number>();
  const samplerIndices = new Map<string, number>();
  const basisInspections = new Map<string, BasisTextureInspection>();
  const materialTexCoords: Array<Set<number>> = [];
  const embed = options.embedDependencies !== false;
  const minFilters: Record<string, number> = { nearest: 9728, linear: 9729, "nearest-mipmap-nearest": 9984, "linear-mipmap-nearest": 9985, "nearest-mipmap-linear": 9986, "linear-mipmap-linear": 9987 };
  const magFilters: Record<string, number> = { nearest: 9728, linear: 9729 };
  const wraps: Record<string, number> = { "clamp-to-edge": 33071, repeat: 10497, "mirror-repeat": 33648 };
  const dataObject = (value: unknown, path: string): Record<string, unknown> => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`GLTF_INVALID_VALUE: ${path} must be an object`);
    return value as Record<string, unknown>;
  };
  const vector = (value: unknown, length: number, path: string, minimum = -Infinity, maximum = Infinity): number[] => {
    if (!Array.isArray(value) || value.length !== length) throw new Error(`GLTF_INVALID_VALUE: ${path}`);
    return Array.from({ length }, (_, index) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !("value" in descriptor) || typeof descriptor.value !== "number") throw new Error(`GLTF_INVALID_VALUE: ${path}[${index}] must be a numeric data value`);
      finiteOptional(descriptor.value, `${path}[${index}]`, minimum, maximum);
      return descriptor.value;
    });
  };
  const addSampler = (input: AuraExportTextureSettings["sampler"], path: string): number | undefined => {
    if (input === undefined) return undefined;
    const value = dataObject(input, path);
    unknown(value, ["minFilter", "magFilter", "addressU", "addressV"], path);
    const lookup = (table: Record<string, number>, key: unknown, field: string): number => {
      if (typeof key !== "string" || !Object.prototype.hasOwnProperty.call(table, key)) throw new Error(`GLTF_INVALID_VALUE: ${path}.${field}`);
      return table[key]!;
    };
    const sampler = { minFilter: lookup(minFilters, input.minFilter, "minFilter"), magFilter: lookup(magFilters, input.magFilter, "magFilter"), wrapS: lookup(wraps, input.addressU, "addressU"), wrapT: lookup(wraps, input.addressV, "addressV") };
    const key = JSON.stringify(sampler);
    const existing = samplerIndices.get(key);
    if (existing !== undefined) return existing;
    const index = samplers.length;
    samplers.push(sampler);
    samplerIndices.set(key, index);
    return index;
  };
  const addTexture = (name: string, sampler: number | undefined, path: string, color: boolean, slotChannels: number): number | undefined => {
    if (typeof name !== "string") throw new Error(`GLTF_INVALID_VALUE: ${path} must name a texture dependency`);
    const key = JSON.stringify([name, sampler ?? null]);
    const dep = dependencyByName.get(name);
    if (!dep) { warn("MISSING_TEXTURE", path, `Texture dependency ${name} was not supplied.`); return undefined; }
    const mimeType = imageMimeType(dep.mimeType, dep.name);
    if (!mimeType) { warn("UNSUPPORTED_TEXTURE_FORMAT", path, `Texture ${name} is not a supported PNG, JPEG, WebP, AVIF or Basis KTX2 image; it is returned separately.`); return undefined; }
    if (mimeType === "image/ktx2") {
      let inspection = basisInspections.get(name);
      if (!inspection) { inspection = inspectBasisKTX2(dep.data, checkAbort); basisInspections.set(name, inspection); }
      if (!inspection.ok) { warn(inspection.code, path, `Texture ${name} cannot be emitted as KHR_texture_basisu: ${inspection.reason}`); return undefined; }
      const usage = basisUsage.get(name);
      if (!usage) throw new Error(`GLTF_INVALID_MATERIAL: ${path} has no Basis texture usage`);
      // sRGB affects RGB only. A packed sRGB color map may share its linear
      // alpha with data slots, but not its RGB with linear-data slots.
      const sharesColorAlpha = !color && slotChannels === 8 && usage.color !== 0 && inspection.colorSpace === "color";
      const expectedSpace = color || sharesColorAlpha ? "color" : "data";
      const channels = expectedSpace === "color" ? usage.color | (usage.data & 8) : usage.data;
      const expected = (channels & 8) ? "rgba" : (channels & 4) ? "rgb" : (channels & 2) ? "rg" : "red";
      if (inspection.colorSpace !== expectedSpace) {
        warn("KTX2_COLORSPACE_UNSUPPORTED", path, `Texture ${name} has a DFD color space incompatible with this ${color ? "color" : "data"} slot.`);
        return undefined;
      }
      // The RGB format defines an implicit alpha of one.
      if (inspection.channels !== expected && !(expected === "rgba" && inspection.channels === "rgb")) {
        warn("KTX2_CHANNELS_UNSUPPORTED", path, `Texture ${name} encodes ${inspection.channels} channels, but its combined ${color ? "color" : "data"} bindings require ${expected}.`);
        return undefined;
      }
    } else if (!hasImageSignature(dep.data, mimeType, checkAbort)) { warn("INVALID_TEXTURE_DATA", path, `Texture ${name} does not have the advertised image signature and is returned separately.`); return undefined; }
    // Validate every binding before returning a previously deduplicated
    // texture: the same image may also be used by an incompatible slot.
    const existing = textureIndices.get(key);
    if (existing !== undefined) return existing;
    let source = imageIndices.get(name);
    if (source === undefined) {
      usedDependencies.add(name);
      const image: JsonObject = { name, mimeType };
      if (embed && options.binary) { image.bufferView = append(dep.data); image.mimeType = mimeType; }
      else if (embed) {
        if (Math.ceil(dep.data.length / 3) * 4 > maxBytes) throw new Error("GLTF_SIZE_LIMIT: embedded image exceeds maxBytes");
        image.uri = `data:${mimeType};base64,${base64(dep.data)}`;
      }
      else { image.uri = uriPath(name); returnedDependencies.push({ name, data: dep.data }); }
      source = images.length;
      images.push(image);
      imageIndices.set(name, source);
    }
    const index = textures.length;
    if (mimeType === "image/webp" || mimeType === "image/avif" || mimeType === "image/ktx2") {
      const extension = mimeType === "image/webp" ? "EXT_texture_webp" : mimeType === "image/avif" ? "EXT_texture_avif" : "KHR_texture_basisu";
      usedExtensions.add(extension);
      // The runtime snapshot retains its selected image, not a separate
      // PNG/JPEG fallback, so readers must support the texture extension.
      requiredExtensions.add(extension);
      textures.push({ extensions: { [extension]: { source } }, ...(sampler === undefined ? {} : { sampler }) });
    } else textures.push({ source, ...(sampler === undefined ? {} : { sampler }) });
    textureIndices.set(key, index);
    return index;
  };
  const textureInfo = (name: string | undefined, settings: AuraExportTextureSettings | undefined, path: string, coords: Set<number>, color: boolean, channels: number): JsonObject | undefined => {
    if (settings !== undefined) {
      const object = dataObject(settings, path);
      unknown(object, ["texCoord", "transform", "sampler"], path);
    }
    if (name === undefined) {
      if (settings !== undefined) warn("UNUSED_TEXTURE_SETTINGS", path, "Texture settings were omitted because no texture was supplied.");
      return undefined;
    }
    const texCoord = settings?.texCoord === undefined ? 0 : settings.texCoord;
    if (!Number.isSafeInteger(texCoord) || texCoord < 0 || texCoord > 999999999) throw new Error(`GLTF_INVALID_VALUE: ${path}.texCoord`);
    const sampler = addSampler(settings?.sampler, `${path}.sampler`);
    let transform: JsonObject | undefined;
    if (settings?.transform !== undefined) {
      const value = dataObject(settings.transform, `${path}.transform`);
      unknown(value, ["offset", "scale", "rotation"], `${path}.transform`);
      const offset = vector(settings.transform.offset, 2, `${path}.transform.offset`);
      const scale = vector(settings.transform.scale, 2, `${path}.transform.scale`);
      const { rotation } = settings.transform;
      finiteOptional(rotation, `${path}.transform.rotation`);
      if (rotation === undefined) throw new Error(`GLTF_INVALID_VALUE: ${path}.transform.rotation`);
      const converted = scene.uvOrigin === "bottom-left";
      const outOffset = converted ? [offset[0] - Math.sin(rotation) * scale[1], 1 - offset[1] - Math.cos(rotation) * scale[1]] : [...offset];
      if (!outOffset.every(Number.isFinite)) throw new Error(`GLTF_CONVENTION_RANGE: ${path}.transform`);
      transform = { offset: outOffset, scale: [...scale], rotation: converted ? -rotation : rotation };
    }
    const index = addTexture(name, sampler, path, color, channels);
    if (index === undefined) return undefined;
    coords.add(texCoord);
    if (transform) usedExtensions.add("KHR_texture_transform");
    return { index, ...(texCoord ? { texCoord } : {}), ...(transform ? { extensions: { KHR_texture_transform: transform } } : {}) };
  };
  const materialDocs = materials.map((material, i) => {
    checkAbort();
    const path = `materials[${i}]`;
    unknown(material, ["name", "baseColor", "metallic", "roughness", "emissive", "alphaMode", "alphaCutoff", "doubleSided", "baseColorTexture", "metallicRoughnessTexture", "normalTexture", "normalTextureScale", "occlusionTexture", "occlusionStrength", "emissiveTexture", "unlit", "metadata", "gltf"], path);
    optionalString(material.name, `${path}.name`);
    validateMetadata(material.metadata, `${path}.metadata`);
    finiteArray(material.baseColor, 4, `${path}.baseColor`);
    finiteArray(material.emissive, 3, `${path}.emissive`);
    finiteOptional(material.metallic, `${path}.metallic`, 0, 1);
    finiteOptional(material.roughness, `${path}.roughness`, 0, 1);
    finiteOptional(material.alphaCutoff, `${path}.alphaCutoff`, 0);
    finiteOptional(material.normalTextureScale, `${path}.normalTextureScale`);
    finiteOptional(material.occlusionStrength, `${path}.occlusionStrength`, 0, 1);
    const coords = new Set<number>();
    materialTexCoords.push(coords);
    const gltf = material.gltf;
    if (gltf !== undefined) {
      const object = dataObject(gltf, `${path}.gltf`);
      unknown(object, ["textures", "emissiveStrength", "clearcoat", "diffuseRoughness", "bump", "transmission", "diffuseTransmission", "volume", "ior", "specular", "pbrSpecularGlossiness", "sheen", "anisotropy", "iridescence", "dispersion"], `${path}.gltf`);
      if (gltf.textures !== undefined) unknown(dataObject(gltf.textures, `${path}.gltf.textures`), ["baseColorTexture", "metallicRoughnessTexture", "normalTexture", "occlusionTexture", "emissiveTexture"], `${path}.gltf.textures`);
    }
    const coreTexture = (key: "baseColorTexture" | "metallicRoughnessTexture" | "normalTexture" | "occlusionTexture" | "emissiveTexture"): JsonObject | undefined =>
      textureInfo(material[key], gltf?.textures?.[key], `${path}.${key}`, coords, key === "baseColorTexture" || key === "emissiveTexture", key === "baseColorTexture" ? (material.alphaMode === "MASK" || material.alphaMode === "BLEND" ? 15 : 7) : key === "metallicRoughnessTexture" ? 6 : key === "occlusionTexture" ? 1 : 7);
    const pbr: JsonObject = {};
    if (material.baseColor !== undefined) { material.baseColor.forEach((value) => finiteOptional(value, `${path}.baseColor`, 0, 1)); pbr.baseColorFactor = [...material.baseColor]; }
    if (material.metallic !== undefined) pbr.metallicFactor = material.metallic;
    if (material.roughness !== undefined) pbr.roughnessFactor = material.roughness;
    const baseColorTexture = coreTexture("baseColorTexture");
    const metallicRoughnessTexture = coreTexture("metallicRoughnessTexture");
    const normalTexture = coreTexture("normalTexture");
    const occlusionTexture = coreTexture("occlusionTexture");
    const emissiveTexture = coreTexture("emissiveTexture");
    if (baseColorTexture) pbr.baseColorTexture = baseColorTexture;
    if (metallicRoughnessTexture) pbr.metallicRoughnessTexture = metallicRoughnessTexture;
    if (material.normalTexture === undefined && material.normalTextureScale !== undefined) warn("UNUSED_MATERIAL_PROPERTY", `${path}.normalTextureScale`, "Normal scale was omitted because no normal texture was supplied.");
    if (material.occlusionTexture === undefined && material.occlusionStrength !== undefined) warn("UNUSED_MATERIAL_PROPERTY", `${path}.occlusionStrength`, "Occlusion strength was omitted because no occlusion texture was supplied.");
    if (material.emissive) material.emissive.forEach((value) => finiteOptional(value, `${path}.emissive`, 0, 1));
    if (material.alphaMode !== undefined && !["OPAQUE", "MASK", "BLEND"].includes(material.alphaMode)) throw new Error(`GLTF_INVALID_MATERIAL: ${path}.alphaMode`);
    if (material.unlit !== undefined && typeof material.unlit !== "boolean") throw new Error(`GLTF_INVALID_MATERIAL: ${path}.unlit must be boolean`);
    if (material.doubleSided !== undefined && typeof material.doubleSided !== "boolean") throw new Error(`GLTF_INVALID_MATERIAL: ${path}.doubleSided must be boolean`);
    const extensions: JsonObject = {};
    if (material.unlit) { extensions.KHR_materials_unlit = {}; usedExtensions.add("KHR_materials_unlit"); }
    if (gltf) {
      const physicalKeys = ["clearcoat", "diffuseRoughness", "bump", "transmission", "diffuseTransmission", "volume", "ior", "specular", "sheen", "anisotropy", "iridescence", "dispersion"] as const;
      if ((material.unlit || gltf.pbrSpecularGlossiness) && physicalKeys.some((key) => gltf[key] !== undefined)) throw new Error(`GLTF_INVALID_MATERIAL: ${path} combines incompatible material extensions`);
      if (material.unlit && (gltf.pbrSpecularGlossiness !== undefined || gltf.emissiveStrength !== undefined)) throw new Error(`GLTF_INVALID_MATERIAL: ${path} combines incompatible material extensions`);
      if (gltf.volume !== undefined && gltf.transmission === undefined && gltf.diffuseTransmission === undefined) throw new Error(`GLTF_INVALID_MATERIAL: ${path}.gltf.volume requires a transmission extension`);
      if (gltf.dispersion !== undefined && gltf.volume === undefined) throw new Error(`GLTF_INVALID_MATERIAL: ${path}.gltf.dispersion requires the volume extension`);
      type Rule = readonly [source: string, destination: string, kind: "unit" | "nonnegative" | "length" | "positiveLength" | "finite" | "ior" | "iridescenceIor" | "bump" | "unit3" | "unit4" | "nonnegative3"];
      type TextureRule = readonly [source: string, destination: string, color: boolean, channels: number, normal?: boolean];
      const addExtension = (key: string, extension: string, scalarRules: readonly Rule[], textureRules: readonly TextureRule[]): void => {
        const value = (gltf as unknown as Record<string, unknown>)[key];
        if (value === undefined) return;
        const ep = `${path}.gltf.${key}`;
        const input = dataObject(value, ep);
        unknown(input, [...scalarRules.map((rule) => rule[0]), ...textureRules.map((rule) => rule[0])], ep);
        const output: JsonObject = {};
        for (const [source, destination, kind] of scalarRules) {
          const current = input[source];
          if (current === undefined) continue;
          const field = `${ep}.${source}`;
          if (kind === "unit3" || kind === "unit4" || kind === "nonnegative3") {
            output[destination] = vector(current, kind === "unit4" ? 4 : 3, field, 0, kind === "nonnegative3" ? Infinity : 1);
          } else {
            if (typeof current !== "number") throw new Error(`GLTF_INVALID_VALUE: ${field}`);
            const minimum = kind === "unit" || kind === "nonnegative" || kind === "length" || kind === "positiveLength" || kind === "bump" ? 0 : kind === "ior" || kind === "iridescenceIor" ? 1 : -Infinity;
            const maximum = kind === "unit" ? 1 : kind === "bump" ? 100 : Infinity;
            // KHR_materials_ior additionally defines zero as a compatibility mode.
            if (!(kind === "ior" && current === 0)) finiteOptional(current, field, minimum, maximum);
            if (kind === "positiveLength" && current === 0) throw new Error(`GLTF_INVALID_VALUE: ${field}`);
            output[destination] = kind === "length" || kind === "positiveLength" ? scaleLength(current, field) : current;
          }
        }
        for (const [source, destination, color, channels, normal] of textureRules) {
          const current = input[source];
          if (current === undefined) continue;
          const field = `${ep}.${source}`;
          const ref = dataObject(current, field);
          unknown(ref, ["name", "texCoord", "transform", "sampler", ...(normal ? ["scale"] : [])], field);
          if (typeof ref.name !== "string") throw new Error(`GLTF_INVALID_VALUE: ${field}.name`);
          const settings = { ...(ref.texCoord === undefined ? {} : { texCoord: ref.texCoord }), ...(ref.transform === undefined ? {} : { transform: ref.transform }), ...(ref.sampler === undefined ? {} : { sampler: ref.sampler }) } as AuraExportTextureSettings;
          if (normal) finiteOptional(ref.scale as number | undefined, `${field}.scale`);
          const info = textureInfo(ref.name, settings, field, coords, color, channels);
          if (info) output[destination] = { ...info, ...(normal && ref.scale !== undefined ? { scale: ref.scale } : {}) };
        }
        extensions[extension] = output;
        usedExtensions.add(extension);
      };
      addExtension("clearcoat", "KHR_materials_clearcoat", [["factor", "clearcoatFactor", "unit"], ["roughnessFactor", "clearcoatRoughnessFactor", "unit"]], [["texture", "clearcoatTexture", false, 1], ["roughnessTexture", "clearcoatRoughnessTexture", false, 2], ["normalTexture", "clearcoatNormalTexture", false, 7, true]]);
      addExtension("diffuseRoughness", "KHR_materials_diffuse_roughness", [["factor", "diffuseRoughnessFactor", "unit"]], [["texture", "diffuseRoughnessTexture", false, 1]]);
      addExtension("bump", "EXT_materials_bump", [["factor", "bumpFactor", "bump"]], [["texture", "bumpTexture", false, 1]]);
      addExtension("transmission", "KHR_materials_transmission", [["factor", "transmissionFactor", "unit"]], [["texture", "transmissionTexture", false, 1]]);
      addExtension("diffuseTransmission", "KHR_materials_diffuse_transmission", [["factor", "diffuseTransmissionFactor", "unit"], ["colorFactor", "diffuseTransmissionColorFactor", "unit3"]], [["texture", "diffuseTransmissionTexture", false, 8], ["colorTexture", "diffuseTransmissionColorTexture", true, 7]]);
      addExtension("volume", "KHR_materials_volume", [["thicknessFactor", "thicknessFactor", "length"], ["attenuationDistance", "attenuationDistance", "positiveLength"], ["attenuationColor", "attenuationColor", "unit3"]], [["thicknessTexture", "thicknessTexture", false, 2]]);
      addExtension("specular", "KHR_materials_specular", [["factor", "specularFactor", "unit"], ["colorFactor", "specularColorFactor", "nonnegative3"]], [["texture", "specularTexture", false, 8], ["colorTexture", "specularColorTexture", true, 7]]);
      addExtension("pbrSpecularGlossiness", "KHR_materials_pbrSpecularGlossiness", [["diffuseFactor", "diffuseFactor", "unit4"], ["specularFactor", "specularFactor", "unit3"], ["glossinessFactor", "glossinessFactor", "unit"]], [["diffuseTexture", "diffuseTexture", true, material.alphaMode === "MASK" || material.alphaMode === "BLEND" ? 15 : 7], ["specularGlossinessTexture", "specularGlossinessTexture", true, 15]]);
      addExtension("sheen", "KHR_materials_sheen", [["colorFactor", "sheenColorFactor", "unit3"], ["roughnessFactor", "sheenRoughnessFactor", "unit"]], [["colorTexture", "sheenColorTexture", true, 7], ["roughnessTexture", "sheenRoughnessTexture", false, 8]]);
      addExtension("anisotropy", "KHR_materials_anisotropy", [["strength", "anisotropyStrength", "unit"], ["rotation", "anisotropyRotation", "finite"]], [["texture", "anisotropyTexture", false, 7]]);
      addExtension("iridescence", "KHR_materials_iridescence", [["factor", "iridescenceFactor", "unit"], ["ior", "iridescenceIor", "iridescenceIor"], ["thicknessMinimum", "iridescenceThicknessMinimum", "nonnegative"], ["thicknessMaximum", "iridescenceThicknessMaximum", "nonnegative"]], [["texture", "iridescenceTexture", false, 1], ["thicknessTexture", "iridescenceThicknessTexture", false, 2]]);
      for (const [key, extension, property, kind] of [["ior", "KHR_materials_ior", "ior", "ior"], ["dispersion", "KHR_materials_dispersion", "dispersion", "nonnegative"], ["emissiveStrength", "KHR_materials_emissive_strength", "emissiveStrength", "nonnegative"]] as const) {
        const value = gltf[key];
        if (value === undefined) continue;
        if (!(kind === "ior" && value === 0)) finiteOptional(value, `${path}.gltf.${key}`, kind === "ior" ? 1 : 0);
        extensions[extension] = { [property]: value };
        usedExtensions.add(extension);
      }
    }
    return { ...(material.name === undefined ? {} : { name: material.name }), pbrMetallicRoughness: pbr,
      ...(material.emissive === undefined ? {} : { emissiveFactor: [...material.emissive] }),
      ...(normalTexture === undefined ? {} : { normalTexture: { ...normalTexture, ...(material.normalTextureScale === undefined ? {} : { scale: material.normalTextureScale }) } }),
      ...(occlusionTexture === undefined ? {} : { occlusionTexture: { ...occlusionTexture, ...(material.occlusionStrength === undefined ? {} : { strength: material.occlusionStrength }) } }),
      ...(emissiveTexture === undefined ? {} : { emissiveTexture }),
      ...(material.alphaMode === undefined ? {} : { alphaMode: material.alphaMode }),
      ...(material.alphaCutoff === undefined ? {} : { alphaCutoff: material.alphaCutoff }),
      ...(material.doubleSided === undefined ? {} : { doubleSided: material.doubleSided }),
      ...(Object.keys(extensions).length ? { extensions } : {}),
      ...(material.metadata === undefined ? {} : { extras: material.metadata }) };
  });
  const meshDocs = meshes.map((mesh, mi) => {
    checkAbort();
    const path = `meshes[${mi}]`;
    unknown(mesh, ["name", "primitives", "weights"], path);
    optionalString(mesh.name, `${path}.name`);
    if (!Array.isArray(mesh.primitives) || mesh.primitives.length === 0) throw new Error(`GLTF_INVALID_MESH: ${path} needs primitives`);
    finiteArray(mesh.weights, undefined, `${path}.weights`);
    const primitives = mesh.primitives.map((primitive: ExportPrimitive, pi: number) => {
      const pp = `${path}.primitives[${pi}]`;
      unknown(primitive, ["attributes", "indices", "mode", "material", "targets", "variants"], pp);
      if (!primitive.attributes || typeof primitive.attributes !== "object") throw new Error(`GLTF_INVALID_MESH: ${pp} needs attributes`);
      const positionDescriptor = Object.getOwnPropertyDescriptor(primitive.attributes, "POSITION");
      const position: AuraExportAttribute | undefined = positionDescriptor && "value" in positionDescriptor ? positionDescriptor.value : undefined;
      if (!position || position.itemSize !== 3) throw new Error(`GLTF_INVALID_MESH: ${pp} requires VEC3 POSITION`);
      const vertexCount = position.values.length / 3;
      if (!Number.isInteger(vertexCount) || vertexCount === 0) throw new Error(`GLTF_INVALID_MESH: ${pp} has no vertices`);
      // Attribute names are open-ended; a custom name such as __proto__ must
      // remain an ordinary serialized key instead of changing an object's prototype.
      const attrs: Record<string, number> = Object.create(null);
      const texcoordDescriptor = Object.getOwnPropertyDescriptor(primitive.attributes, "TEXCOORD_0");
      const hasTextureCoordinates = !!texcoordDescriptor && "value" in texcoordDescriptor;
      for (const semantic in primitive.attributes) {
        if (!Object.prototype.hasOwnProperty.call(primitive.attributes, semantic)) continue;
        const attributeDescriptor = Object.getOwnPropertyDescriptor(primitive.attributes, semantic);
        if (!attributeDescriptor || !("value" in attributeDescriptor)) {
          if (isKnownSemantic(semantic)) throw new Error(`GLTF_INVALID_ATTRIBUTE: ${pp}.attributes.${semantic} must be a data property`);
          warn("UNSUPPORTED_ATTRIBUTE", `${pp}.attributes.${semantic}`, "Accessor properties are not evaluated during export.");
          continue;
        }
        const attribute: AuraExportAttribute = attributeDescriptor.value;
        if (/^(TEXCOORD|COLOR|JOINTS|WEIGHTS)_/.test(semantic) && !/^(TEXCOORD|COLOR|JOINTS|WEIGHTS)_(0|[1-9]\d{0,8})$/.test(semantic)) {
          throw new Error(`GLTF_INVALID_ATTRIBUTE: ${pp}.attributes.${semantic} has an invalid semantic index`);
        }
        let outSemantic = semantic;
        if (!isKnownSemantic(semantic) && !/^_[A-Za-z0-9_]+$/.test(semantic)) {
          outSemantic = `_${semantic.replace(/[^A-Za-z0-9_]/g, "_")}`;
          warn("ATTRIBUTE_RENAMED", `${pp}.attributes.${semantic}`, `The nonstandard attribute was exported as ${outSemantic}.`);
        }
        if (Object.prototype.hasOwnProperty.call(attrs, outSemantic)) throw new Error(`GLTF_DUPLICATE_ATTRIBUTE: ${outSemantic}`);
        validateSemantic(outSemantic, attribute, vertexCount, `${pp}.attributes.${semantic}`);
        const attributePath = `${pp}.attributes.${semantic}`;
        const converted = semantic === "POSITION" ? scaleAttribute(attribute, attributePath)
          : semantic.startsWith("TEXCOORD_") ? flipUV(attribute, attributePath)
          : semantic === "TANGENT" && hasTextureCoordinates ? flipTangentHandedness(attribute, attributePath) : attribute;
        if (needsQuantization(outSemantic, converted)) meshQuantization = true;
        attrs[outSemantic] = addAccessor(converted, attributePath, 34962, semantic === "POSITION");
      }
      validatePrimitiveSemantics(primitive, pp, vertexCount, checkAbort, warn);
      let indices: number | undefined;
      const mode = primitive.mode ?? "triangles";
      if (!(mode === "triangles" || mode === "lines" || mode === "points")) throw new Error(`GLTF_INVALID_TOPOLOGY: ${pp}.mode`);
      if (primitive.indices !== undefined) {
        const input = primitive.indices;
        if (input.length === 0 || (mode === "triangles" && input.length % 3 !== 0) || (mode === "lines" && input.length % 2 !== 0)) throw new Error(`GLTF_INVALID_INDICES: ${pp} has an incomplete primitive`);
        let highest = 0;
        for (let i = 0; i < input.length; i++) {
          if ((i & 8191) === 0) checkAbort();
          const index = input[i];
          if (!Number.isInteger(index) || index < 0 || index >= vertexCount) throw new Error(`GLTF_INVALID_INDICES: ${pp} index out of bounds`);
          highest = Math.max(highest, index);
        }
        // glTF reserves the largest value in each unsigned index component
        // type for primitive restart. Widen without changing vertex indices.
        if (highest >= 0xffffffff) throw new Error(`GLTF_INVALID_INDICES: ${pp} exceeds the largest usable glTF index`);
        const width = input instanceof Uint32Array || highest >= 65535 ? 4 : input instanceof Uint16Array || highest >= 255 ? 2 : 1;
        if (input.length > Math.floor(maxBytes / width)) throw new Error(`GLTF_SIZE_LIMIT: ${pp}.indices exceeds maxBytes`);
        let typed: Uint8Array | Uint16Array | Uint32Array;
        if (input instanceof Uint32Array) typed = input;
        else if (input instanceof Uint16Array && highest < 65535) typed = input;
        else if (input instanceof Uint8Array && highest < 255) typed = input;
        else if (highest < 255 && !(input instanceof Uint16Array)) typed = new Uint8Array(input);
        else if (highest < 65535) typed = new Uint16Array(input);
        else typed = new Uint32Array(input);
        if ((input instanceof Uint8Array && typed instanceof Uint16Array) || (input instanceof Uint16Array && typed instanceof Uint32Array)) {
          warn("INDEX_COMPONENT_WIDENED", `${pp}.indices`, "The index component type was widened to avoid glTF's reserved primitive-restart value.");
        }
        indices = addAccessor({ values: typed, itemSize: 1 }, `${pp}.indices`, 34963);
      } else if ((mode === "triangles" && vertexCount % 3 !== 0) || (mode === "lines" && vertexCount % 2 !== 0)) throw new Error(`GLTF_INVALID_MESH: ${pp} has an incomplete primitive`);
      reference(primitive.material, materials.length, `${pp}.material`);
      if (primitive.material !== undefined) for (const texCoord of materialTexCoords[primitive.material]!) {
        if (!Object.prototype.hasOwnProperty.call(attrs, `TEXCOORD_${texCoord}`)) throw new Error(`GLTF_INVALID_MESH: ${pp} uses a textured material but has no TEXCOORD_${texCoord}`);
      }
      const targets = primitive.targets?.length ? primitive.targets.map((target, ti) => {
        const result: Record<string, number> = {};
        for (const semantic in target) {
          if (!Object.prototype.hasOwnProperty.call(target, semantic)) continue;
          const targetPath = `${pp}.targets[${ti}].${semantic}`;
          const texcoord = /^TEXCOORD_(0|[1-9]\d{0,8})$/.test(semantic);
          const color = /^COLOR_(0|[1-9]\d{0,8})$/.test(semantic);
          if (!["POSITION", "NORMAL", "TANGENT"].includes(semantic) && !texcoord && !color) { warn("UNSUPPORTED_MORPH_ATTRIBUTE", targetPath, `Morph attribute ${semantic} is not representable in core glTF.`); continue; }
          const descriptor = Object.getOwnPropertyDescriptor(target, semantic);
          if (!descriptor || !("value" in descriptor)) { warn("UNSUPPORTED_MORPH_ATTRIBUTE", targetPath, "Accessor properties are not evaluated during export."); continue; }
          const attribute: AuraExportAttribute = descriptor.value;
          if (!Object.prototype.hasOwnProperty.call(attrs, semantic)) throw new Error(`GLTF_INVALID_MORPH: ${targetPath} has no corresponding base attribute`);
          const validSize = texcoord ? attribute.itemSize === 2 : color ? attribute.itemSize === 3 || attribute.itemSize === 4 : attribute.itemSize === 3;
          if (!validSize || attribute.values.length / attribute.itemSize !== vertexCount) throw new Error(`GLTF_INVALID_ATTRIBUTE: ${targetPath} has an invalid element size or vertex count`);
          const component = componentOf(attribute.values);
          const signed = component === 5120 || component === 5122;
          const validInteger = semantic === "POSITION" ? signed
            : semantic === "NORMAL" || semantic === "TANGENT" ? signed && !!attribute.normalized
            : texcoord ? (signed || ((component === 5121 || component === 5123) && !!attribute.normalized))
            : [5120, 5121, 5122, 5123].includes(component) && !!attribute.normalized;
          let converted = component === 5126 || validInteger ? attribute : convertToFloat(attribute, targetPath, (value) => value);
          if (semantic === "POSITION") converted = scaleAttribute(converted, targetPath);
          if (texcoord) converted = flipUVDelta(converted, targetPath);
          const outputComponent = componentOf(converted.values);
          if (outputComponent !== 5126 && (semantic === "POSITION" || semantic === "NORMAL" || semantic === "TANGENT" || (texcoord && !converted.normalized))) meshQuantization = true;
          result[semantic] = addAccessor(converted, targetPath, 34962, semantic === "POSITION");
        }
        return result;
      }) : undefined;
      let variantExtension: JsonObject | undefined;
      if (primitive.variants !== undefined) {
        if (!Array.isArray(primitive.variants)) throw new Error(`GLTF_INVALID_VARIANTS: ${pp}.variants must be an array`);
        const assigned = new Set<number>();
        const mappings = primitive.variants.map((mapping, mi) => {
          const mp = `${pp}.variants[${mi}]`;
          if (!mapping || typeof mapping !== "object") throw new Error(`GLTF_INVALID_VARIANTS: ${mp} must be an object`);
          unknown(mapping, ["material", "variants"], mp);
          reference(mapping.material, materials.length, `${mp}.material`);
          if (mapping.material === undefined) throw new Error(`GLTF_INVALID_VARIANTS: ${mp}.material is required`);
          if (!Array.isArray(mapping.variants) || mapping.variants.length === 0) throw new Error(`GLTF_INVALID_VARIANTS: ${mp}.variants must be a non-empty array`);
          for (const variant of mapping.variants) {
            reference(variant, variantNames.length, `${mp}.variants`);
            // A variant selects one material per primitive (KHR_materials_variants).
            if (assigned.has(variant)) throw new Error(`GLTF_INVALID_VARIANTS: ${mp} assigns variant ${variant} twice in one primitive`);
            assigned.add(variant);
          }
          return { material: mapping.material, variants: [...mapping.variants] };
        });
        if (mappings.length) { variantExtension = { mappings }; variantsReferenced = true; }
      }
      return { attributes: attrs, ...(indices === undefined ? {} : { indices }), mode: mode === "triangles" ? 4 : mode === "lines" ? 1 : 0,
        ...(primitive.material === undefined ? {} : { material: primitive.material }), ...(targets === undefined ? {} : { targets }),
        ...(variantExtension ? { extensions: { KHR_materials_variants: variantExtension } } : {}) };
    });
    const count = meshMorphTargetCount(mesh);
    if (mesh.primitives.some((p) => p.targets?.length && p.targets.length !== count)) throw new Error(`GLTF_INVALID_MORPH: ${path} primitives with targets must have the same number of targets`);
    if (mesh.weights && mesh.weights.length !== count) throw new Error(`GLTF_INVALID_MORPH: ${path}.weights does not match target count`);
    return { ...(mesh.name === undefined ? {} : { name: mesh.name }), primitives, ...(mesh.weights?.length ? { weights: [...mesh.weights] } : {}) };
  });
  const cameraDocs = cameras.map((camera, i) => {
    const path = `cameras[${i}]`;
    unknown(camera, ["name", "type", "perspective", "orthographic"], path);
    optionalString(camera.name, `${path}.name`);
    if (camera.type === "perspective") {
      const p = camera.perspective;
      if (!p || !Number.isFinite(p.yfov) || p.yfov <= 0 || p.yfov >= Math.PI || !Number.isFinite(p.znear) || p.znear <= 0 || (p.zfar !== undefined && (!Number.isFinite(p.zfar) || p.zfar <= p.znear)) || (p.aspectRatio !== undefined && (!Number.isFinite(p.aspectRatio) || p.aspectRatio <= 0))) throw new Error(`GLTF_INVALID_CAMERA: ${path}`);
      if (camera.orthographic !== undefined) warn("UNUSED_CAMERA_PROJECTION", `${path}.orthographic`, "The orthographic projection was omitted from a perspective camera.");
      unknown(p, ["yfov", "znear", "zfar", "aspectRatio"], `${path}.perspective`);
      return { ...(camera.name === undefined ? {} : { name: camera.name }), type: "perspective", perspective: { yfov: p.yfov, znear: scaleLength(p.znear, `${path}.perspective.znear`), ...(p.zfar === undefined ? {} : { zfar: scaleLength(p.zfar, `${path}.perspective.zfar`) }), ...(p.aspectRatio === undefined ? {} : { aspectRatio: p.aspectRatio }) } };
    }
    if (camera.type === "orthographic") {
      const o = camera.orthographic;
      if (!o || !Number.isFinite(o.xmag) || o.xmag <= 0 || !Number.isFinite(o.ymag) || o.ymag <= 0 || !Number.isFinite(o.znear) || o.znear < 0 || !Number.isFinite(o.zfar) || o.zfar <= o.znear) throw new Error(`GLTF_INVALID_CAMERA: ${path}`);
      if (camera.perspective !== undefined) warn("UNUSED_CAMERA_PROJECTION", `${path}.perspective`, "The perspective projection was omitted from an orthographic camera.");
      unknown(o, ["xmag", "ymag", "znear", "zfar"], `${path}.orthographic`);
      return { ...(camera.name === undefined ? {} : { name: camera.name }), type: "orthographic", orthographic: { xmag: scaleLength(o.xmag, `${path}.orthographic.xmag`), ymag: scaleLength(o.ymag, `${path}.orthographic.ymag`), znear: scaleLength(o.znear, `${path}.orthographic.znear`), zfar: scaleLength(o.zfar, `${path}.orthographic.zfar`) } };
    }
    throw new Error(`GLTF_INVALID_CAMERA: ${path}.type`);
  });
  const lightDocs = lights.map((light, i) => {
    const path = `lights[${i}]`;
    unknown(light, ["name", "type", "color", "intensity", "range", "spot"], path);
    optionalString(light.name, `${path}.name`);
    if (!["directional", "point", "spot"].includes(light.type)) throw new Error(`GLTF_INVALID_LIGHT: ${path}.type`);
    finiteArray(light.color, 3, `${path}.color`);
    light.color?.forEach((value) => finiteOptional(value, `${path}.color`, 0, 1));
    finiteOptional(light.intensity, `${path}.intensity`, 0);
    if (light.range !== undefined && (!Number.isFinite(light.range) || light.range <= 0 || light.type === "directional")) throw new Error(`GLTF_INVALID_LIGHT: ${path}.range`);
    if (light.spot && light.type !== "spot") throw new Error(`GLTF_INVALID_LIGHT: ${path}.spot requires a spot light`);
    if (light.spot) {
      unknown(light.spot, ["innerConeAngle", "outerConeAngle"], `${path}.spot`);
      const inner = light.spot.innerConeAngle ?? 0;
      const outer = light.spot.outerConeAngle ?? Math.PI / 4;
      if (!Number.isFinite(inner) || !Number.isFinite(outer) || inner < 0 || outer <= inner || outer > Math.PI / 2) throw new Error(`GLTF_INVALID_LIGHT: ${path}.spot angles`);
    }
    return { ...(light.name === undefined ? {} : { name: light.name }), type: light.type, ...(light.color === undefined ? {} : { color: [...light.color] }), ...(light.intensity === undefined ? {} : { intensity: light.intensity }), ...(light.range === undefined ? {} : { range: scaleLength(light.range, `${path}.range`) }), ...(light.spot === undefined ? {} : { spot: { ...(light.spot.innerConeAngle === undefined ? {} : { innerConeAngle: light.spot.innerConeAngle }), ...(light.spot.outerConeAngle === undefined ? {} : { outerConeAngle: light.spot.outerConeAngle }) } }) };
  });
  const skinRoots: number[] = [];
  const skinDocs = skins.map((skin, i) => {
    const path = `skins[${i}]`;
    unknown(skin, ["name", "joints", "skeleton", "inverseBindMatrices"], path);
    optionalString(skin.name, `${path}.name`);
    if (!skin.joints.length || new Set(skin.joints).size !== skin.joints.length) throw new Error(`GLTF_INVALID_SKIN: ${path}.joints`);
    for (const joint of skin.joints) {
      if (joint === undefined) throw new Error(`GLTF_INVALID_SKIN: ${path}.joints contains an invalid index`);
      reference(joint, scene.nodes.length, `${path}.joints`);
    }
    reference(skin.skeleton, scene.nodes.length, `${path}.skeleton`);
    let common = skin.joints[0];
    const ancestors = new Set<number>();
    for (let node = common; node !== -1; node = parentByNode[node]) { checkAbort(); ancestors.add(node); }
    for (const joint of skin.joints.slice(1)) {
      let node = joint;
      while (node !== -1 && !ancestors.has(node)) { checkAbort(); node = parentByNode[node]; }
      if (node === -1) throw new Error(`GLTF_INVALID_SKIN: ${path}.joints must have a common ancestor`);
      while (common !== node) { ancestors.delete(common); common = parentByNode[common]; }
    }
    if (skin.skeleton !== undefined && !ancestors.has(skin.skeleton)) throw new Error(`GLTF_INVALID_SKIN: ${path}.skeleton must be an ancestor of every joint`);
    skinRoots[i] = common;
    let inverseBindMatrices: number | undefined;
    if (skin.inverseBindMatrices) {
      if (skin.inverseBindMatrices.itemSize !== 16 || skin.inverseBindMatrices.values.length !== skin.joints.length * 16 || componentOf(skin.inverseBindMatrices.values) !== 5126) throw new Error(`GLTF_INVALID_SKIN: ${path}.inverseBindMatrices must be FLOAT MAT4 per joint`);
      for (let offset = 0; offset < skin.inverseBindMatrices.values.length; offset += 16) {
        const values = skin.inverseBindMatrices.values;
        if (values[offset + 3] !== 0 || values[offset + 7] !== 0 || values[offset + 11] !== 0 || values[offset + 15] !== 1) throw new Error(`GLTF_INVALID_SKIN: ${path}.inverseBindMatrices must be affine`);
      }
      const converted = scaleAttribute(skin.inverseBindMatrices, `${path}.inverseBindMatrices`, (index) => index % 16 >= 12 && index % 16 <= 14);
      inverseBindMatrices = addAccessor(converted, `${path}.inverseBindMatrices`);
    }
    return { ...(skin.name === undefined ? {} : { name: skin.name }), joints: [...skin.joints], ...(skin.skeleton === undefined ? {} : { skeleton: skin.skeleton }), ...(inverseBindMatrices === undefined ? {} : { inverseBindMatrices }) };
  });
  const nodeDocs = scene.nodes.map((node: ExportNode, i: number) => {
    checkAbort();
    const path = `nodes[${i}]`;
    unknown(node, ["name", "children", "matrix", "translation", "rotation", "scale", "mesh", "camera", "light", "skin", "weights", "metadata", "instances"], path);
    optionalString(node.name, `${path}.name`);
    validateMetadata(node.metadata, `${path}.metadata`);
    finiteArray(node.matrix, 16, `${path}.matrix`); finiteArray(node.translation, 3, `${path}.translation`); finiteArray(node.rotation, 4, `${path}.rotation`); finiteArray(node.scale, 3, `${path}.scale`); finiteArray(node.weights, undefined, `${path}.weights`);
    if (node.matrix && (node.translation || node.rotation || node.scale)) throw new Error(`GLTF_INVALID_TRANSFORM: ${path} cannot combine matrix and TRS`);
    if (node.matrix && (node.matrix[3] !== 0 || node.matrix[7] !== 0 || node.matrix[11] !== 0 || node.matrix[15] !== 1)) throw new Error(`GLTF_INVALID_TRANSFORM: ${path}.matrix must be affine`);
    if (node.rotation) {
      const norm = Math.hypot(...node.rotation);
      if (Math.abs(norm - 1) > 1e-4) throw new Error(`GLTF_INVALID_TRANSFORM: ${path}.rotation must be a unit quaternion`);
    }
    reference(node.mesh, meshes.length, `${path}.mesh`); reference(node.camera, cameras.length, `${path}.camera`); reference(node.light, lights.length, `${path}.light`); reference(node.skin, skins.length, `${path}.skin`);
    if (node.skin !== undefined && node.mesh === undefined) throw new Error(`GLTF_INVALID_SKIN: ${path} has skin without mesh`);
    if (node.instances !== undefined && node.skin !== undefined) throw new Error(`GLTF_UNSUPPORTED_INSTANCING: ${path} cannot combine instancing with a skin`);
    if (node.skin !== undefined && reachable[i] && !reachable[skinRoots[node.skin]]) throw new Error(`GLTF_INVALID_SKIN: ${path} and its skin joints must belong to the same scene`);
    if (node.weights !== undefined && (node.mesh === undefined || node.weights.length !== meshMorphTargetCount(meshes[node.mesh]))) throw new Error(`GLTF_INVALID_MORPH: ${path}.weights does not match mesh targets`);
    if (node.skin !== undefined && node.mesh !== undefined) {
      const jointCount = skins[node.skin].joints.length;
      for (const [pi, primitive] of meshes[node.mesh].primitives.entries()) {
        const keys = Object.keys(primitive.attributes);
        if (!keys.includes("JOINTS_0") || !keys.includes("WEIGHTS_0")) throw new Error(`GLTF_INVALID_SKIN: ${path} mesh primitive ${pi} needs JOINTS_0 and WEIGHTS_0`);
        for (const key of keys.filter((key) => /^(JOINTS|WEIGHTS)_\d+$/.test(key))) {
          const counterpart = key.startsWith("JOINTS_") ? key.replace("JOINTS_", "WEIGHTS_") : key.replace("WEIGHTS_", "JOINTS_");
          if (!keys.includes(counterpart)) throw new Error(`GLTF_INVALID_SKIN: ${path} mesh primitive ${pi} is missing ${counterpart}`);
          if (key.startsWith("JOINTS_")) {
            const descriptor = Object.getOwnPropertyDescriptor(primitive.attributes, key);
            if (!descriptor || !("value" in descriptor)) throw new Error(`GLTF_INVALID_SKIN: ${path} mesh primitive ${pi} joint attribute must be a data property`);
            for (const joint of (descriptor.value as AuraExportAttribute).values) if (joint >= jointCount) throw new Error(`GLTF_INVALID_SKIN: ${path} mesh primitive ${pi} has an out-of-range joint`);
          }
        }
      }
    }
    const extensions: JsonObject = {};
    if (node.light !== undefined) {
      usedExtensions.add("KHR_lights_punctual");
      extensions.KHR_lights_punctual = { light: node.light };
    }
    if (node.instances !== undefined) {
      const instancePath = `${path}.instances`;
      if (!node.instances || typeof node.instances !== "object" || Array.isArray(node.instances)) throw new Error(`GLTF_INVALID_INSTANCING: ${instancePath} must be an object`);
      const prototype = Object.getPrototypeOf(node.instances);
      if (prototype !== Object.prototype && prototype !== null) throw new Error(`GLTF_INVALID_INSTANCING: ${instancePath} must be a plain object`);
      unknown(node.instances, ["transforms", "colors"], instancePath);
      if (node.mesh === undefined) throw new Error(`GLTF_INVALID_INSTANCING: ${instancePath} requires a mesh`);
      if (!Object.prototype.hasOwnProperty.call(node.instances, "transforms")) throw new Error(`GLTF_INVALID_INSTANCING: ${instancePath}.transforms must be a data property`);
      const values = node.instances.transforms;
      if (!(values instanceof Float32Array || Array.isArray(values)) || !Number.isSafeInteger(values.length) || values.length === 0 || values.length % 16 !== 0) {
        throw new Error(`GLTF_INVALID_INSTANCING: ${instancePath}.transforms must contain one or more column-major matrices`);
      }
      const count = values.length / 16;
      const colors = node.instances.colors;
      if (count * (colors === undefined ? 40 : 56) > maxBytes) throw new Error(`GLTF_SIZE_LIMIT: ${instancePath} exceeds maxBytes`);
      let colorValues: Float32Array | undefined;
      if (colors !== undefined) {
        if (count > MAX_COLORED_INSTANCES) throw new Error(`GLTF_SIZE_LIMIT: ${instancePath}.colors exceeds ${MAX_COLORED_INSTANCES} instances`);
        if (!(colors instanceof Float32Array || Array.isArray(colors)) || colors.length !== count * 4) throw new Error(`GLTF_INVALID_INSTANCING: ${instancePath}.colors must contain one RGBA value per instance`);
        colorValues = new Float32Array(colors.length);
        let precisionLost = false;
        for (let j = 0; j < colors.length; j++) {
          if ((j & 8191) === 0) checkAbort();
          const entry = Array.isArray(colors) ? Object.getOwnPropertyDescriptor(colors, String(j)) : undefined;
          if (Array.isArray(colors) && (!entry || !("value" in entry))) throw new Error(`GLTF_INVALID_INSTANCING: ${instancePath}.colors[${j}] must be a data value`);
          const value = entry ? entry.value : colors[j];
          if (!Number.isFinite(value)) throw new Error(`GLTF_INVALID_INSTANCING: ${instancePath}.colors[${j}] must be finite`);
          const stored = Math.fround(value);
          if (!Number.isFinite(stored) || (value !== 0 && stored === 0)) throw new Error(`GLTF_INVALID_INSTANCING: ${instancePath}.colors[${j}] cannot be represented as FLOAT`);
          if (stored !== value) precisionLost = true;
          colorValues[j] = stored;
        }
        if (precisionLost) warn("ATTRIBUTE_PRECISION_LOSS", `${instancePath}.colors`, "Values were rounded to glTF's 32-bit float representation.");
        warn("INSTANCE_COLOR_INTEROPERABILITY", `${instancePath}.colors`, "Colors are stored in the custom EXT_mesh_gpu_instancing _COLOR_0 attribute as linear RGBA base-color multipliers. Other clients need an adapter and may ignore them.");
      }
      const translations = new Float32Array(count * 3);
      const rotations = new Float32Array(count * 4);
      const scales = new Float32Array(count * 3);
      let roundedTransform = false;
      const store = (target: Float32Array, index: number, value: number, field: string): void => {
        const stored = Math.fround(value);
        if (!Number.isFinite(stored) || (value !== 0 && stored === 0)) throw new Error(`GLTF_CONVENTION_RANGE: ${field} cannot be represented as FLOAT`);
        target[index] = stored;
      };
      for (let j = 0; j < count; j++) {
        if ((j & 1023) === 0) checkAbort();
        const field = `${instancePath}.transforms[${j}]`;
        const decomposed = decomposeInstanceMatrix(values, j * 16, field);
        roundedTransform ||= decomposed.rounded;
        for (let component = 0; component < 3; component++) {
          store(translations, j * 3 + component, scaleLength(decomposed.translation[component]!, field), field);
          store(scales, j * 3 + component, decomposed.scale[component]!, field);
        }
        for (let component = 0; component < 4; component++) store(rotations, j * 4 + component, decomposed.rotation[component]!, field);
      }
      if (roundedTransform) warn("INSTANCE_TRANSFORM_PRECISION_LOSS", `${instancePath}.transforms`, "Nearly orthogonal matrix columns were rounded to representable TRS values.");
      extensions.EXT_mesh_gpu_instancing = { attributes: {
        TRANSLATION: addAccessor({ values: translations, itemSize: 3 }, `${instancePath}.TRANSLATION`, 34962),
        ROTATION: addAccessor({ values: rotations, itemSize: 4 }, `${instancePath}.ROTATION`, 34962),
        SCALE: addAccessor({ values: scales, itemSize: 3 }, `${instancePath}.SCALE`, 34962),
        ...(colorValues ? { _COLOR_0: addAccessor({ values: colorValues, itemSize: 4 }, `${instancePath}._COLOR_0`, 34962) } : {})
      } };
      usedExtensions.add("EXT_mesh_gpu_instancing");
      requiredExtensions.add("EXT_mesh_gpu_instancing");
    }
    const matrix = node.matrix?.map((value, index) => index >= 12 && index <= 14 ? scaleLength(value, `${path}.matrix[${index}]`) : value);
    const translation = node.translation?.map((value, index) => scaleLength(value, `${path}.translation[${index}]`));
    return { ...(node.name === undefined ? {} : { name: node.name }), ...(node.children?.length ? { children: [...node.children] } : {}),
      ...(matrix === undefined ? {} : { matrix }), ...(translation === undefined ? {} : { translation }), ...(node.rotation === undefined ? {} : { rotation: [...node.rotation] }), ...(node.scale === undefined ? {} : { scale: [...node.scale] }),
      ...(node.mesh === undefined ? {} : { mesh: node.mesh }), ...(node.camera === undefined ? {} : { camera: node.camera }), ...(node.skin === undefined ? {} : { skin: node.skin }), ...(node.weights?.length ? { weights: [...node.weights] } : {}), ...(node.metadata === undefined ? {} : { extras: node.metadata }),
      ...(Object.keys(extensions).length ? { extensions } : {}) };
  });
  let requiredPointerCount = 0;
  let optionalPointerCount = 0;
  let unknownPointerCount = 0;
  const animationDocs = animations.map((animation, ai) => {
    const path = `animations[${ai}]`;
    unknown(animation, ["name", "channels", "pointerChannels"], path);
    optionalString(animation.name, `${path}.name`);
    if (!Array.isArray(animation.channels) || (animation.pointerChannels !== undefined && !Array.isArray(animation.pointerChannels)) || (!animation.channels.length && !animation.pointerChannels?.length)) throw new Error(`GLTF_INVALID_ANIMATION: ${path} needs channels`);
    const seen = new Set<string>();
    const samplers: JsonObject[] = [];
    const channels: JsonObject[] = [];
    for (const [ci, channel] of animation.channels.entries()) {
      checkAbort();
      const cp = `${path}.channels[${ci}]`;
      unknown(channel, ["node", "path", "times", "values", "interpolation"], cp);
      reference(channel.node, scene.nodes.length, `${cp}.node`);
      if (!Number.isInteger(channel.node)) throw new Error(`GLTF_INVALID_ANIMATION: ${cp}.node is required`);
      if (!["translation", "rotation", "scale", "weights"].includes(channel.path)) throw new Error(`GLTF_INVALID_ANIMATION: ${cp}.path`);
      if (scene.nodes[channel.node].matrix && channel.path !== "weights") throw new Error(`GLTF_INVALID_ANIMATION: ${cp} targets a matrix node; animated transforms require TRS`);
      const key = `${channel.node}:${channel.path}`;
      if (seen.has(key)) throw new Error(`GLTF_INVALID_ANIMATION: ${cp} duplicates a node/path target`);
      seen.add(key);
      const interpolation = channel.interpolation ?? "LINEAR";
      if (!["LINEAR", "STEP", "CUBICSPLINE"].includes(interpolation)) throw new Error(`GLTF_INVALID_ANIMATION: ${cp}.interpolation`);
      if (channel.times.itemSize !== 1 || componentOf(channel.times.values) !== 5126 || channel.times.values.length === 0) throw new Error(`GLTF_INVALID_ANIMATION: ${cp}.times must be nonempty FLOAT SCALAR`);
      for (let ti = 0; ti < channel.times.values.length; ti++) {
        const time = channel.times.values[ti];
        if (!Number.isFinite(time) || time < 0 || !Number.isFinite(Math.fround(time)) || (ti > 0 && Math.fround(time) <= Math.fround(channel.times.values[ti - 1]))) throw new Error(`GLTF_INVALID_ANIMATION: ${cp}.times must remain finite and strictly increasing as FLOAT`);
      }
      if (componentOf(channel.values.values) !== 5126 || channel.values.normalized) throw new Error(`GLTF_INVALID_ANIMATION: ${cp}.values must be FLOAT`);
      const multiplier = interpolation === "CUBICSPLINE" ? 3 : 1;
      let values = channel.values;
      if (channel.path === "weights") {
        const node = scene.nodes[channel.node];
        const targetCount = node.mesh === undefined ? 0 : meshMorphTargetCount(meshes[node.mesh]);
        if (targetCount === 0 || values.values.length !== channel.times.values.length * targetCount * multiplier) throw new Error(`GLTF_INVALID_ANIMATION: ${cp}.values does not match morph targets`);
        values = { values: values.values, itemSize: 1 };
      } else {
        const size = channel.path === "rotation" ? 4 : 3;
        if (values.itemSize !== size || values.values.length !== channel.times.values.length * size * multiplier) throw new Error(`GLTF_INVALID_ANIMATION: ${cp}.values count does not match keyframes`);
        if (channel.path === "rotation") for (let ti = 0; ti < channel.times.values.length; ti++) {
          const start = (ti * multiplier + (multiplier === 3 ? 1 : 0)) * 4;
          const q = values.values;
          if (Math.abs(Math.hypot(q[start], q[start + 1], q[start + 2], q[start + 3]) - 1) > 1e-4) throw new Error(`GLTF_INVALID_ANIMATION: ${cp}.values must contain unit quaternions`);
        }
      }
      const sampler = samplers.length;
      const converted = channel.path === "translation" ? scaleAttribute(values, `${cp}.values`) : values;
      samplers.push({ input: addAccessor(channel.times, `${cp}.times`, undefined, true), output: addAccessor(converted, `${cp}.values`), interpolation });
      channels.push({ sampler, target: { node: channel.node, path: channel.path } });
    }
    // These targets cover the material and punctual-light leaves retained by
    // the interchange snapshot. Requiring the exported property to exist
    // prevents a pointer from silently naming a missing texture or extension.
    const materialPointerFields: Readonly<Record<string, { size: 1 | 2 | 3 | 4; min: number; max: number }>> = {
      "pbrMetallicRoughness/baseColorFactor": { size: 4, min: 0, max: 1 },
      "pbrMetallicRoughness/metallicFactor": { size: 1, min: 0, max: 1 },
      "pbrMetallicRoughness/roughnessFactor": { size: 1, min: 0, max: 1 },
      "emissiveFactor": { size: 3, min: 0, max: 1 },
      "alphaCutoff": { size: 1, min: 0, max: Infinity },
      "normalTexture/scale": { size: 1, min: -Infinity, max: Infinity },
      "occlusionTexture/strength": { size: 1, min: 0, max: 1 },
      "extensions/KHR_materials_clearcoat/clearcoatFactor": { size: 1, min: 0, max: 1 },
      "extensions/KHR_materials_clearcoat/clearcoatRoughnessFactor": { size: 1, min: 0, max: 1 },
      "extensions/KHR_materials_emissive_strength/emissiveStrength": { size: 1, min: 0, max: Infinity },
      "extensions/KHR_materials_specular/specularFactor": { size: 1, min: 0, max: 1 },
      "extensions/KHR_materials_sheen/sheenRoughnessFactor": { size: 1, min: 0, max: 1 },
      "extensions/KHR_materials_iridescence/iridescenceFactor": { size: 1, min: 0, max: 1 },
      "extensions/KHR_materials_iridescence/iridescenceIor": { size: 1, min: 1, max: Infinity },
      ...Object.fromEntries(GLTF_TEXTURE_TRANSFORM_BINDINGS.flatMap(({ pointer }) =>
        (["offset", "scale", "rotation"] as const).map((leaf) => [
          `${pointer}/extensions/KHR_texture_transform/${leaf}`,
          { size: leaf === "rotation" ? 1 : 2, min: -Infinity, max: Infinity }
        ])
      ))
    };
    for (const [ci, channel] of (animation.pointerChannels ?? []).entries()) {
      checkAbort();
      const cp = `${path}.pointerChannels[${ci}]`;
      unknown(channel, ["pointer", "times", "values", "interpolation"], cp);
      if (typeof channel.pointer !== "string" || channel.pointer.length > 1024) throw new Error(`GLTF_INVALID_ANIMATION: ${cp}.pointer`);
      const origin = inspectExportPointerChannelProvenance(scene, channel);
      if (origin?.status === "changed-target" && origin.provenance.required) {
        requiredPointerLost("A required source pointer no longer addresses its verified snapshot target.", cp, origin.provenance.pointer);
      }
      // Only the same uniquely identified snapshot material can be relocated.
      // Caller-authored pointer edits still invalidate provenance.
      const pointer = origin?.status === "verified" ? origin.resolvedPointer! : channel.pointer;
      const materialCandidate = /^\/materials\/(0|[1-9]\d*)\/(.+)$/.exec(pointer);
      const lightCandidate = /^\/extensions\/KHR_lights_punctual\/lights\/(0|[1-9]\d*)\/(intensity|color|range)$/.exec(pointer);
      const nodeCandidate = /^\/nodes\/(0|[1-9]\d*)\/(translation|rotation|scale|weights)$/.exec(pointer);
      const materialMatch = materialCandidate?.[0] === pointer ? materialCandidate : null;
      const lightMatch = lightCandidate?.[0] === pointer ? lightCandidate : null;
      const nodeMatch = nodeCandidate?.[0] === pointer ? nodeCandidate : null;
      let root: unknown, field: string, size: 1 | 2 | 3 | 4, min: number, max: number, positive = false, length = false;
      let weightCount = 1;
      if (materialMatch && Object.prototype.hasOwnProperty.call(materialPointerFields, materialMatch[2])) {
        const index = Number(materialMatch[1]);
        if (!Number.isSafeInteger(index) || index >= materialDocs.length) throw new Error(`GLTF_INVALID_ANIMATION: ${cp}.pointer references an unavailable material`);
        root = materialDocs[index]; field = materialMatch[2];
        ({ size, min, max } = materialPointerFields[field]);
        if (origin?.status === "verified" && origin.provenance.required) {
          const name = materialDocs[index].name;
          const effectiveName = name ?? `material-${index}`;
          if ((typeof name === "string" && !name.trim()) || materialDocs.some((material, other) =>
            other !== index && (material.name ?? `material-${other}`) === effectiveName)) {
            requiredPointerLost("The required pointer's exported material name is blank or ambiguous.", cp, origin.provenance.pointer);
          }
          if (field.includes("/extensions/KHR_texture_transform/")) {
            // The loader's required runtime subset admits only these core
            // texture slots and UV sets. Edited snapshots must not produce a
            // required document that the same loader can no longer admit.
            const transform = /^(pbrMetallicRoughness\/baseColorTexture|pbrMetallicRoughness\/metallicRoughnessTexture|normalTexture|occlusionTexture|emissiveTexture)\/extensions\/KHR_texture_transform\/(?:offset|scale|rotation)$/.exec(field);
            const texturePath = transform?.[1] ??
              requiredPointerLost("The required texture transform is outside the supported core material slots.", cp, origin.provenance.pointer);
            let texture: unknown = materialDocs[index];
            for (const segment of texturePath.split("/")) {
              texture = texture && typeof texture === "object" ? (texture as JsonObject)[segment] : undefined;
            }
            if (!texture || typeof texture !== "object") requiredPointerLost("The required texture transform has no exported texture.", cp, origin.provenance.pointer);
            const info = texture as JsonObject;
            const textureExtensions = info.extensions as JsonObject | undefined;
            const textureTransform = (textureExtensions?.KHR_texture_transform as JsonObject | undefined) ??
              requiredPointerLost("The required texture transform is missing from the exported texture.", cp, origin.provenance.pointer);
            const texCoord = textureTransform.texCoord ?? info.texCoord ?? 0;
            const extensions = materialDocs[index].extensions as JsonObject | undefined;
            const unlit = extensions?.KHR_materials_unlit !== undefined;
            const specGloss = extensions?.KHR_materials_pbrSpecularGlossiness !== undefined;
            if ((typeof texCoord !== "number" || texCoord > 1) ||
                (unlit && (texturePath !== "pbrMetallicRoughness/baseColorTexture" || texCoord !== 0)) ||
                (specGloss && (texturePath === "pbrMetallicRoughness/baseColorTexture" || texturePath === "pbrMetallicRoughness/metallicRoughnessTexture"))) {
              requiredPointerLost("The required texture transform cannot bind to the exported material or UV set.", cp, origin.provenance.pointer);
            }
          }
        }
      } else if (lightMatch) {
        const index = Number(lightMatch[1]);
        if (!Number.isSafeInteger(index) || index >= lightDocs.length) throw new Error(`GLTF_INVALID_ANIMATION: ${cp}.pointer references an unavailable light`);
        root = lightDocs[index]; field = lightMatch[2];
        size = field === "color" ? 3 : 1; min = 0; max = field === "color" ? 1 : Infinity;
        positive = length = field === "range";
        if (field === "range" && lights[index].type === "directional") throw new Error(`GLTF_INVALID_ANIMATION: ${cp}.pointer cannot address directional-light range`);
      } else if (nodeMatch) {
        const index = Number(nodeMatch[1]);
        if (!Number.isSafeInteger(index) || index >= nodeDocs.length) throw new Error(`GLTF_INVALID_ANIMATION: ${cp}.pointer references an unavailable node`);
        const node = scene.nodes[index];
        root = nodeDocs[index]; field = nodeMatch[2];
        if (field !== "weights" && node.matrix) throw new Error(`GLTF_INVALID_ANIMATION: ${cp}.pointer targets a matrix node; animated transforms require TRS`);
        size = field === "rotation" ? 4 : field === "weights" ? 1 : 3;
        min = -Infinity; max = Infinity;
        length = field === "translation";
        if (field === "weights") {
          const mesh = node.mesh === undefined ? undefined : meshes[node.mesh];
          weightCount = mesh ? meshMorphTargetCount(mesh) : 0;
          if (!mesh || !weightCount || mesh.primitives.some((primitive) => (primitive.targets?.length ?? 0) !== weightCount)) {
            throw new Error(`GLTF_INVALID_ANIMATION: ${cp}.pointer weights require a mesh with consistent morph targets`);
          }
          if (!Object.prototype.hasOwnProperty.call(root, field)) {
            (root as JsonObject).weights = mesh.weights ? [...mesh.weights] : Array.from({ length: weightCount }, () => 0);
          }
        } else if (!Object.prototype.hasOwnProperty.call(root, field)) {
          // The target must exist for JSON Pointer. Explicit glTF defaults do
          // not change the node's effective transform.
          (root as JsonObject)[field] = field === "rotation" ? [0, 0, 0, 1] : field === "scale" ? [1, 1, 1] : [0, 0, 0];
        }
      } else throw new Error(`GLTF_INVALID_ANIMATION: ${cp}.pointer is not a supported material, light or node property`);
      let property: unknown = root;
      for (const segment of field.split("/")) {
        if (!property || typeof property !== "object" || !Object.prototype.hasOwnProperty.call(property, segment)) {
          if (origin?.status === "verified" && origin.provenance.required) {
            requiredPointerLost("The required pointer's property is absent from the exported document.", cp, origin.provenance.pointer);
          }
          throw new Error(`GLTF_INVALID_ANIMATION: ${cp}.pointer does not exist in the exported document`);
        }
        property = (property as Record<string, unknown>)[segment];
      }
      // A bottom-left to top-left conversion changes the offset as a function
      // of scale and rotation. Independent source curves cannot generally be
      // rewritten with the same interpolation and tangents.
      if (scene.uvOrigin === "bottom-left" && materialMatch && field.includes("/extensions/KHR_texture_transform/")) {
        throw new Error(`GLTF_CONVENTION_UNREPRESENTABLE: ${cp}.pointer cannot preserve animated texture transforms while converting UV origin`);
      }
      const key = `pointer:${pointer}`;
      if (seen.has(key)) throw new Error(`GLTF_INVALID_ANIMATION: ${cp} duplicates a property target`);
      seen.add(key);
      const interpolation = channel.interpolation ?? "LINEAR";
      if (!["LINEAR", "STEP", "CUBICSPLINE"].includes(interpolation)) throw new Error(`GLTF_INVALID_ANIMATION: ${cp}.interpolation`);
      if (channel.times.itemSize !== 1 || componentOf(channel.times.values) !== 5126 || channel.times.values.length === 0 || channel.times.normalized) throw new Error(`GLTF_INVALID_ANIMATION: ${cp}.times must be nonempty FLOAT SCALAR`);
      for (let ti = 0; ti < channel.times.values.length; ti++) {
        const time = channel.times.values[ti];
        if (!Number.isFinite(time) || time < 0 || !Number.isFinite(Math.fround(time)) || (ti > 0 && Math.fround(time) <= Math.fround(channel.times.values[ti - 1]))) throw new Error(`GLTF_INVALID_ANIMATION: ${cp}.times must remain finite and strictly increasing as FLOAT`);
      }
      const multiplier = interpolation === "CUBICSPLINE" ? 3 : 1;
      if (channel.values.itemSize !== size || componentOf(channel.values.values) !== 5126 || channel.values.normalized || channel.values.values.length !== channel.times.values.length * size * multiplier * weightCount) throw new Error(`GLTF_INVALID_ANIMATION: ${cp}.values count or type does not match the property`);
      for (let i = 0; i < channel.values.values.length; i++) {
        if ((i & 8191) === 0) checkAbort();
        const value = channel.values.values[i];
        if (!Number.isFinite(value) || !Number.isFinite(Math.fround(value))) throw new Error(`GLTF_INVALID_ANIMATION: ${cp}.values must be finite FLOAT`);
        // Cubic derivatives may be negative; property limits apply to the
        // middle value of each tangent/value/tangent triplet, not derivatives.
        if (multiplier === 1 || Math.floor(i / size) % 3 === 1) {
          if (value < min || value > max || (positive && Math.fround(value) <= 0)) throw new Error(`GLTF_INVALID_ANIMATION: ${cp}.values is outside the property range`);
        }
      }
      if (nodeMatch?.[2] === "rotation") for (let ti = 0; ti < channel.times.values.length; ti++) {
        const start = (ti * multiplier + (multiplier === 3 ? 1 : 0)) * 4;
        const q = channel.values.values;
        if (Math.abs(Math.hypot(q[start], q[start + 1], q[start + 2], q[start + 3]) - 1) > 1e-4) throw new Error(`GLTF_INVALID_ANIMATION: ${cp}.values must contain unit quaternions`);
      }
      if (origin?.status === "verified") {
        if (origin.provenance.required) requiredPointerCount++;
        else optionalPointerCount++;
      } else {
        unknownPointerCount++;
        if (origin) {
          warn("ANIMATION_POINTER_PROVENANCE_CHANGED", cp, "The pointer or its snapshot target has changed; its source requiredness cannot be retained.");
        } else {
          warn("ANIMATION_POINTER_REQUIREDNESS_UNAVAILABLE", cp, "This pointer channel has no verified source identity; its source requiredness is unknown.");
        }
      }
      const sampler = samplers.length;
      const values = length ? scaleAttribute(channel.values, `${cp}.values`) : channel.values;
      samplers.push({ input: addAccessor(channel.times, `${cp}.times`, undefined, true), output: addAccessor(values, `${cp}.values`), interpolation });
      channels.push({ sampler, target: { path: "pointer", extensions: { KHR_animation_pointer: { pointer } } } });
      usedExtensions.add("KHR_animation_pointer");
    }
    return { ...(animation.name === undefined ? {} : { name: animation.name }), samplers, channels };
  });
  if (requiredPointerCount && (optionalPointerCount || unknownPointerCount)) {
    // glTF requiredness is document-wide. Promoting an optional/unknown pointer
    // changes actor admission, while downgrading a known required pointer loses
    // its contract. Neither representation is faithful.
    throw Object.assign(new Error("GLTF_UNREPRESENTABLE_ANIMATION_POINTER_REQUIREDNESS: required and optional or unknown pointer channels cannot share one glTF document"), {
      code: "GLTF_UNREPRESENTABLE_ANIMATION_POINTER_REQUIREDNESS",
      requiredPointerCount, optionalPointerCount, unknownPointerCount
    });
  }
  if (requiredPointerCount) requiredExtensions.add("KHR_animation_pointer");
  if (animations.some((animation) => animation.channels.some((channel) => !hasVerifiedExportCoreChannelOrigin(channel)))
    && warnings.some((warning) => warning.code === "SOURCE_DOCUMENT_METADATA_UNAVAILABLE" || warning.code === "SOURCE_TRACK_ORIGIN_PARTIAL")) {
    // A loaded node pointer can already have been converted to a core-shaped
    // interchange channel, so no pointerChannels entry is left to inspect.
    warn("ANIMATION_POINTER_ORIGIN_UNAVAILABLE", "animations",
      "Source track provenance is unavailable: core-shaped animation channels may have originated as KHR_animation_pointer channels, including required ones.");
  }
  if (meshQuantization) { usedExtensions.add("KHR_mesh_quantization"); requiredExtensions.add("KHR_mesh_quantization"); }
  if (scene.upAxis === "Z" && scene.roots.length) {
    const conversionRoot = nodeDocs.length;
    doc.nodes = [...nodeDocs, { name: "Aura3D Z-up to Y-up", matrix: [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1], children: [...scene.roots] }];
    doc.scenes = [{ nodes: [conversionRoot] }];
    warn("HIERARCHY_ADAPTED", "scene.roots", "A rotation-only parent converts the source Z-up scene to glTF Y-up.");
  } else if (nodeDocs.length) {
    doc.nodes = nodeDocs;
    if (scene.upAxis === "Z") warn("UNREFERENCED_NODES", "scene.roots", "No scene root was supplied, so unreferenced nodes could not receive the Z-up to Y-up parent.");
  }
  if (meshDocs.length) doc.meshes = meshDocs;
  if (materialDocs.length) doc.materials = materialDocs;
  if (cameraDocs.length) doc.cameras = cameraDocs;
  if (skinDocs.length) doc.skins = skinDocs;
  if (animationDocs.length) doc.animations = animationDocs;
  if (images.length) { doc.images = images; doc.textures = textures; }
  if (samplers.length) doc.samplers = samplers;
  if (lightDocs.length) {
    doc.extensions = { KHR_lights_punctual: { lights: lightDocs } };
    usedExtensions.add("KHR_lights_punctual");
  }
  if (variantNames.length) {
    // Keep declared variants even when no primitive currently maps them: a
    // variant switch to an unmapped name is valid and selects default materials.
    doc.extensions = { ...(doc.extensions as JsonObject | undefined), KHR_materials_variants: { variants: variantNames.map((name) => ({ name })) } };
    usedExtensions.add("KHR_materials_variants");
  } else if (variantsReferenced) throw new Error("GLTF_INVALID_VARIANTS: primitive variant mappings require scene.materialVariants");
  if (usedExtensions.size) doc.extensionsUsed = [...usedExtensions].sort();
  if (requiredExtensions.size) doc.extensionsRequired = [...requiredExtensions].sort();
  if (views.length) doc.bufferViews = views;
  if (accessors.length) doc.accessors = accessors;
  const buffer = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
  if (byteLength) {
    const descriptor: JsonObject = { byteLength };
    if (!options.binary) {
      if (embed) {
        if (Math.ceil(buffer.length / 3) * 4 > maxBytes) throw new Error("GLTF_SIZE_LIMIT: embedded buffer exceeds maxBytes");
        descriptor.uri = `data:application/octet-stream;base64,${base64(buffer)}`;
      }
      else {
        let name = "aura3d-buffer.bin";
        let n = 1;
        while (portableDependencyNames.has(name.toLowerCase())) name = `aura3d-buffer-${n++}.bin`;
        descriptor.uri = uriPath(name);
        returnedDependencies.push({ name, data: buffer });
      }
    }
    doc.buffers = [descriptor];
  }
  for (const dep of inputDependencies) if (!usedDependencies.has(dep.name)) {
    warn("UNREFERENCED_DEPENDENCY", `dependencies.${dep.name}`, `Dependency ${dep.name} has no supported glTF reference and is returned separately.`);
    returnedDependencies.push({ name: dep.name, data: dep.data });
  }
  checkAbort();
  const json = UTF8.encode(JSON.stringify(doc));
  if (!options.binary) {
    if (json.byteLength > maxBytes) throw new Error("GLTF_SIZE_LIMIT: glTF document exceeds maxBytes");
    return { data: json, mimeType: "model/gltf+json", warnings: finishWarnings(), dependencies: returnedDependencies };
  }
  const jsonPadding = (4 - json.length % 4) % 4;
  const binPadding = (4 - buffer.length % 4) % 4;
  const total = 12 + 8 + json.length + jsonPadding + (buffer.length ? 8 + buffer.length + binPadding : 0);
  if (total > maxBytes || total > 0xffffffff) throw new Error("GLTF_SIZE_LIMIT: GLB document exceeds maxBytes");
  const data = new Uint8Array(total);
  const view = new DataView(data.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, total, true);
  view.setUint32(12, json.length + jsonPadding, true); view.setUint32(16, 0x4e4f534a, true);
  data.set(json, 20); data.fill(0x20, 20 + json.length, 20 + json.length + jsonPadding);
  if (buffer.length) {
    const pos = 20 + json.length + jsonPadding;
    view.setUint32(pos, buffer.length + binPadding, true); view.setUint32(pos + 4, 0x004e4942, true); data.set(buffer, pos + 8);
  }
  return { data, mimeType: "model/gltf-binary", warnings: finishWarnings(), dependencies: returnedDependencies };
}

type InstanceAxis = [number, number, number];

function decomposeInstanceMatrix(values: Float32Array | readonly number[], offset: number, path: string): {
  translation: InstanceAxis; rotation: [number, number, number, number]; scale: InstanceAxis; rounded: boolean;
} {
  const matrix = Array.from({ length: 16 }, (_, index) => {
    if (!Array.isArray(values)) return values[offset + index];
    const entry = Object.getOwnPropertyDescriptor(values, String(offset + index));
    if (!entry || !("value" in entry)) throw new Error(`GLTF_INVALID_INSTANCING: ${path}[${index}] must be a data value`);
    return entry.value as number;
  });
  if (matrix.some((value) => !Number.isFinite(value))) throw new Error(`GLTF_INVALID_INSTANCING: ${path} must contain finite values`);
  if (matrix[3] !== 0 || matrix[7] !== 0 || matrix[11] !== 0 || matrix[15] !== 1) throw new Error(`GLTF_UNSUPPORTED_INSTANCE_TRANSFORM: ${path} must be affine`);
  const columns: [InstanceAxis, InstanceAxis, InstanceAxis] = [
    [matrix[0], matrix[1], matrix[2]], [matrix[4], matrix[5], matrix[6]], [matrix[8], matrix[9], matrix[10]]
  ];
  const scale: InstanceAxis = columns.map((column) => Math.hypot(...column)) as InstanceAxis;
  if (scale.some((value) => !Number.isFinite(value))) throw new Error(`GLTF_INVALID_INSTANCING: ${path} scale is not finite`);
  const axes = columns.map((column, index) => scale[index] === 0
    ? undefined
    : column.map((component) => component / scale[index]) as InstanceAxis);
  const dot = (a: InstanceAxis, b: InstanceAxis): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a: InstanceAxis, b: InstanceAxis): InstanceAxis => [
    a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]
  ];
  let rounded = false;
  for (let first = 0; first < 3; first++) for (let second = first + 1; second < 3; second++) {
    if (axes[first] && axes[second]) {
      const deviation = Math.abs(dot(axes[first]!, axes[second]!));
      if (deviation > 1e-6) throw new Error(`GLTF_UNSUPPORTED_INSTANCE_TRANSFORM: ${path} contains shear and cannot be encoded as TRS`);
      if (deviation > 1e-12) rounded = true;
    }
  }
  const perpendicular = (axis: InstanceAxis): InstanceAxis => {
    const smallest = Math.abs(axis[0]) <= Math.abs(axis[1]) && Math.abs(axis[0]) <= Math.abs(axis[2]) ? 0
      : Math.abs(axis[1]) <= Math.abs(axis[2]) ? 1 : 2;
    const seed: InstanceAxis = [0, 0, 0];
    seed[smallest] = 1;
    const projection = dot(seed, axis);
    const result: InstanceAxis = [seed[0] - projection * axis[0], seed[1] - projection * axis[1], seed[2] - projection * axis[2]];
    const length = Math.hypot(...result);
    return [result[0] / length, result[1] / length, result[2] / length];
  };
  let [x, y, z] = axes;
  if (x && y && z) {
    if (dot(cross(x, y), z) < 0) {
      x = [-x[0], -x[1], -x[2]];
      scale[0] = -scale[0];
    }
  } else if (x && y) z = cross(x, y);
  else if (y && z) x = cross(y, z);
  else if (z && x) y = cross(z, x);
  else if (x) { y = perpendicular(x); z = cross(x, y); }
  else if (y) { z = perpendicular(y); x = cross(y, z); }
  else if (z) { x = perpendicular(z); y = cross(z, x); }
  else { x = [1, 0, 0]; y = [0, 1, 0]; z = [0, 0, 1]; }
  const m00 = x![0], m10 = x![1], m20 = x![2];
  const m01 = y![0], m11 = y![1], m21 = y![2];
  const m02 = z![0], m12 = z![1], m22 = z![2];
  let rotation: [number, number, number, number];
  const trace = m00 + m11 + m22;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    rotation = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, s / 4];
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    rotation = [s / 4, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    rotation = [(m01 + m10) / s, s / 4, (m12 + m21) / s, (m02 - m20) / s];
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    rotation = [(m02 + m20) / s, (m12 + m21) / s, s / 4, (m10 - m01) / s];
  }
  const length = Math.hypot(...rotation);
  rotation = rotation.map((value) => value / length) as [number, number, number, number];
  return { translation: [matrix[12], matrix[13], matrix[14]], rotation, scale, rounded };
}

function componentOf(values: AuraExportAttribute["values"]): Component {
  if (values instanceof Int8Array) return 5120;
  if (values instanceof Uint8Array) return 5121;
  if (values instanceof Int16Array) return 5122;
  if (values instanceof Uint16Array) return 5123;
  if (values instanceof Uint32Array) return 5125;
  if (values instanceof Float32Array || Array.isArray(values)) return 5126;
  throw new Error("GLTF_INVALID_ATTRIBUTE: unsupported component array");
}
function componentSize(component: Component): number { return component === 5120 || component === 5121 ? 1 : component === 5122 || component === 5123 ? 2 : 4; }
function componentRange(component: Component): [number, number] {
  switch (component) {
    case 5120: return [-128, 127];
    case 5121: return [0, 255];
    case 5122: return [-32768, 32767];
    case 5123: return [0, 65535];
    case 5125: return [0, 4294967295];
    default: throw new Error("GLTF_INVALID_ATTRIBUTE: FLOAT has no integer range");
  }
}
function normalizedComponent(value: number, component: Component): number {
  const [min, max] = componentRange(component);
  return min < 0 ? Math.max(-1, value / max) : value / max;
}
function copyIntegerValues(values: AuraExportAttribute["values"]): Int8Array | Uint8Array | Int16Array | Uint16Array | Uint32Array {
  if (values instanceof Int8Array) return new Int8Array(values);
  if (values instanceof Uint8Array) return new Uint8Array(values);
  if (values instanceof Int16Array) return new Int16Array(values);
  if (values instanceof Uint16Array) return new Uint16Array(values);
  if (values instanceof Uint32Array) return new Uint32Array(values);
  throw new Error("GLTF_INVALID_ATTRIBUTE: expected an integer typed array");
}
function writeNumber(view: DataView, offset: number, type: Component, value: number): void {
  switch (type) {
    case 5120: view.setInt8(offset, value); break;
    case 5121: view.setUint8(offset, value); break;
    case 5122: view.setInt16(offset, value, true); break;
    case 5123: view.setUint16(offset, value, true); break;
    case 5125: view.setUint32(offset, value, true); break;
    case 5126: view.setFloat32(offset, value, true); break;
  }
}
function finiteOptional(value: number | undefined, path: string, min = -Infinity, max = Infinity): void {
  if (value !== undefined && (!Number.isFinite(value) || value < min || value > max)) throw new Error(`GLTF_INVALID_VALUE: ${path}`);
}
function optionalString(value: string | undefined, path: string): void {
  if (value !== undefined && typeof value !== "string") throw new Error(`GLTF_INVALID_VALUE: ${path} must be a string`);
}
function finiteArray(values: readonly number[] | undefined, length: number | undefined, path: string): void {
  if (values === undefined) return;
  if ((length !== undefined && values.length !== length) || Array.from(values).some((value) => !Number.isFinite(value))) throw new Error(`GLTF_INVALID_VALUE: ${path}`);
}
function validateMetadata(value: unknown, path: string, ancestors = new Set<object>()): void {
  if (value === undefined || value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (typeof value !== "object") throw new Error(`GLTF_INVALID_METADATA: ${path} must contain JSON values`);
  if (ancestors.has(value)) throw new Error(`GLTF_INVALID_METADATA: ${path} is cyclic`);
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new Error(`GLTF_INVALID_METADATA: ${path} must contain plain objects`);
  const toJSON = Object.getOwnPropertyDescriptor(value, "toJSON");
  if (toJSON && (!("value" in toJSON) || typeof toJSON.value === "function")) throw new Error(`GLTF_INVALID_METADATA: ${path}.toJSON is not permitted`);
  ancestors.add(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
      if (!descriptor || !("value" in descriptor) || descriptor.value === undefined) throw new Error(`GLTF_INVALID_METADATA: ${path}[${i}] must be a JSON data value`);
      validateMetadata(descriptor.value, `${path}[${i}]`, ancestors);
    }
  } else {
    for (const key in value) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || descriptor.value === undefined) throw new Error(`GLTF_INVALID_METADATA: ${path}.${key} must be a JSON data value`);
      validateMetadata(descriptor.value, `${path}.${key}`, ancestors);
    }
  }
  ancestors.delete(value);
}
/** Writer metadata stays in asset.extras; source provenance is namespaced so it never overwrites it. */
function documentExtras(metadata: AuraExportScene["metadata"], source: AuraExportScene["document"]): { extras?: Record<string, unknown> } {
  const provenance: Record<string, unknown> = {
    ...(source?.generator === undefined ? {} : { generator: source.generator }),
    ...(source?.version === undefined ? {} : { version: source.version }),
    ...(source?.extras === undefined ? {} : { extras: source.extras })
  };
  if (metadata === undefined && !Object.keys(provenance).length) return {};
  if (Object.keys(provenance).length && metadata !== undefined && Object.prototype.hasOwnProperty.call(metadata, "aura3d:sourceDocument")) {
    throw new Error("GLTF_INVALID_PROPERTY: scene.metadata cannot use the reserved aura3d:sourceDocument key");
  }
  return { extras: { ...(metadata ?? {}), ...(Object.keys(provenance).length ? { "aura3d:sourceDocument": provenance } : {}) } };
}
function isKnownSemantic(semantic: string): boolean { return /^(POSITION|NORMAL|TANGENT|TEXCOORD_\d+|COLOR_\d+|JOINTS_\d+|WEIGHTS_\d+)$/.test(semantic); }
function validateSemantic(semantic: string, attribute: AuraExportAttribute, vertexCount: number, path: string): void {
  if (attribute.values.length / attribute.itemSize !== vertexCount) throw new Error(`GLTF_INVALID_ATTRIBUTE: ${path} vertex count does not match POSITION`);
  const type = componentOf(attribute.values);
  if (semantic === "POSITION" && (attribute.itemSize !== 3 || ![5120, 5121, 5122, 5123, 5126].includes(type))) throw new Error(`GLTF_INVALID_ATTRIBUTE: ${path}`);
  if (semantic === "NORMAL" && (attribute.itemSize !== 3 || !(type === 5126 || ((type === 5120 || type === 5122) && attribute.normalized)))) throw new Error(`GLTF_INVALID_ATTRIBUTE: ${path}`);
  if (semantic === "TANGENT" && (attribute.itemSize !== 4 || !(type === 5126 || ((type === 5120 || type === 5122) && attribute.normalized)))) throw new Error(`GLTF_INVALID_ATTRIBUTE: ${path}`);
  if (semantic.startsWith("TEXCOORD_") && (attribute.itemSize !== 2 || type === 5125)) throw new Error(`GLTF_INVALID_ATTRIBUTE: ${path}`);
  if (semantic.startsWith("COLOR_") && (![3, 4].includes(attribute.itemSize) || !(type === 5126 || ((type === 5121 || type === 5123) && attribute.normalized)))) throw new Error(`GLTF_INVALID_ATTRIBUTE: ${path}`);
  if (semantic.startsWith("JOINTS_") && (attribute.itemSize !== 4 || ![5121, 5123].includes(type) || attribute.normalized)) throw new Error(`GLTF_INVALID_ATTRIBUTE: ${path}`);
  if (semantic.startsWith("WEIGHTS_") && (attribute.itemSize !== 4 || !(type === 5126 || ((type === 5121 || type === 5123) && attribute.normalized)))) throw new Error(`GLTF_INVALID_ATTRIBUTE: ${path}`);
}
function meshMorphTargetCount(mesh: NonNullable<AuraExportScene["meshes"]>[number]): number {
  return mesh.primitives.find((primitive) => !!primitive.targets?.length)?.targets?.length ?? 0;
}
function validatePrimitiveSemantics(
  primitive: ExportPrimitive,
  path: string,
  vertexCount: number,
  checkAbort: () => void,
  warn: (code: string, path: string, message: string) => void
): void {
  const semantics = Object.keys(primitive.attributes);
  for (const prefix of ["TEXCOORD", "COLOR", "JOINTS", "WEIGHTS"]) {
    const indices = semantics.flatMap((semantic) => {
      const match = new RegExp(`^${prefix}_(0|[1-9]\\d{0,8})$`).exec(semantic);
      return match ? [Number(match[1])] : [];
    }).sort((a, b) => a - b);
    if (indices.some((index, expected) => index !== expected)) throw new Error(`GLTF_INVALID_ATTRIBUTE: ${path}.attributes.${prefix} indices must be consecutive from zero`);
  }
  const attribute = (semantic: string): AuraExportAttribute | undefined => {
    const descriptor = Object.getOwnPropertyDescriptor(primitive.attributes, semantic);
    return descriptor && "value" in descriptor ? descriptor.value as AuraExportAttribute : undefined;
  };
  const tangent = attribute("TANGENT");
  if (tangent) {
    const type = componentOf(tangent.values);
    for (let i = 3; i < tangent.values.length; i += 4) {
      if ((i & 8191) === 3) checkAbort();
      const value = tangent.normalized ? normalizedComponent(tangent.values[i], type) : tangent.values[i];
      if (Math.abs(value) !== 1) throw new Error(`GLTF_INVALID_ATTRIBUTE: ${path}.attributes.TANGENT handedness must be -1 or 1`);
    }
  }
  const color = attribute("COLOR_0");
  if (color && componentOf(color.values) === 5126) {
    for (let i = 0; i < color.values.length; i++) {
      if ((i & 8191) === 0) checkAbort();
      if (color.values[i] < 0 || color.values[i] > 1) throw new Error(`GLTF_INVALID_ATTRIBUTE: ${path}.attributes.COLOR_0 must be in [0, 1]`);
    }
  }
  const jointNames = semantics.filter((name) => /^JOINTS_\d+$/.test(name));
  const weightNames = semantics.filter((name) => /^WEIGHTS_\d+$/.test(name));
  for (const name of [...jointNames, ...weightNames]) {
    const partner = name.startsWith("JOINTS_") ? name.replace("JOINTS_", "WEIGHTS_") : name.replace("WEIGHTS_", "JOINTS_");
    if (!semantics.includes(partner)) throw new Error(`GLTF_INVALID_SKIN: ${path}.attributes.${name} requires ${partner}`);
  }
  if (!jointNames.length) return;
  const pairs = jointNames.map((name) => ({ joints: attribute(name)!, weights: attribute(name.replace("JOINTS_", "WEIGHTS_"))! }));
  const allQuantized = pairs.every(({ weights }) => weights.values instanceof Uint8Array || weights.values instanceof Uint16Array);
  let warnedWeights = false;
  for (let vertex = 0; vertex < vertexCount; vertex++) {
    if ((vertex & 1023) === 0) checkAbort();
    const usedJoints = new Set<number>();
    let sum = 0;
    let nonzero = 0;
    for (const { joints, weights } of pairs) for (let component = 0; component < 4; component++) {
      const index = vertex * 4 + component;
      const raw = weights.values[index];
      if (raw < 0) throw new Error(`GLTF_INVALID_SKIN: ${path} has a negative weight`);
      if (raw > 0) {
        const joint = joints.values[index];
        if (usedJoints.has(joint)) throw new Error(`GLTF_INVALID_SKIN: ${path} repeats a nonzero joint influence at vertex ${vertex}`);
        usedJoints.add(joint);
        nonzero++;
      }
      sum += allQuantized ? raw * (weights.values instanceof Uint8Array ? 257 : 1) : weights.normalized ? normalizedComponent(raw, componentOf(weights.values)) : Math.fround(raw);
    }
    if (allQuantized && sum !== 65535) throw new Error(`GLTF_INVALID_SKIN: ${path} quantized weights must sum exactly to 1 at vertex ${vertex}`);
    if (!allQuantized && !warnedWeights && Math.abs(sum - 1) > Math.max(1, nonzero) * 2e-7) {
      warn("SKIN_WEIGHTS_NOT_NORMALIZED", `${path}.attributes`, "Floating-point joint weights do not sum to one; viewers may render the skin differently.");
      warnedWeights = true;
    }
  }
}
function needsQuantization(semantic: string, attribute: AuraExportAttribute): boolean {
  const type = componentOf(attribute.values);
  return type !== 5126 && (semantic === "POSITION" || semantic === "NORMAL" || semantic === "TANGENT" || (semantic.startsWith("TEXCOORD_") && (type === 5120 || type === 5122 || !attribute.normalized)));
}
function validateGraph(scene: AuraExportScene, checkAbort: () => void): void {
  const parents = new Uint32Array(scene.nodes.length);
  for (const [i, node] of scene.nodes.entries()) {
    checkAbort();
    if (!node || (node.children !== undefined && !Array.isArray(node.children))) throw new Error(`GLTF_INVALID_GRAPH: nodes[${i}]`);
    for (const child of node.children ?? []) {
    if (!Number.isInteger(child) || child < 0 || child >= scene.nodes.length || child === i) throw new Error(`GLTF_INVALID_GRAPH: nodes[${i}].children`);
    if (++parents[child] > 1) throw new Error(`GLTF_INVALID_GRAPH: node ${child} has multiple parents`);
    }
  }
  const roots = new Set<number>();
  for (const root of scene.roots) {
    if (!Number.isInteger(root) || root < 0 || root >= scene.nodes.length || roots.has(root) || parents[root] !== 0) throw new Error("GLTF_INVALID_GRAPH: scene roots are invalid or duplicated");
    roots.add(root);
  }
  const seen = new Uint8Array(scene.nodes.length);
  for (let i = 0; i < scene.nodes.length; i++) {
    if (seen[i]) continue;
    const stack: { index: number; nextChild: number }[] = [{ index: i, nextChild: 0 }];
    seen[i] = 1;
    while (stack.length) {
      if ((stack.length & 4095) === 0) checkAbort();
      const top = stack[stack.length - 1];
      const children = scene.nodes[top.index].children ?? [];
      if (top.nextChild >= children.length) { seen[top.index] = 2; stack.pop(); continue; }
      const child = children[top.nextChild++];
      if (seen[child] === 1) throw new Error("GLTF_INVALID_GRAPH: node hierarchy contains a cycle");
      if (seen[child] === 0) { seen[child] = 1; stack.push({ index: child, nextChild: 0 }); }
    }
  }
}
function validateDependencyName(name: string): void {
  if (!name || name.startsWith("/") || name.includes("\\") || name.split("/").some((part) => !part || part === "." || part === ".." || /[ .]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) || /[\x00-\x1f\x7f:<>"|?*]/.test(name)) throw new Error(`GLTF_INVALID_DEPENDENCY: unsafe name ${JSON.stringify(name)}`);
  try { encodeURIComponent(name); } catch { throw new Error(`GLTF_INVALID_DEPENDENCY: name is not valid Unicode`); }
}
function uriPath(name: string): string { return name.split("/").map(encodeURIComponent).join("/"); }

type BasisTextureInspection =
  | { readonly ok: true; readonly channels: "rgb" | "rgba" | "red" | "rg"; readonly colorSpace: "color" | "data" }
  | { readonly ok: false; readonly code: "INVALID_KTX2_DATA" | "UNSUPPORTED_KTX2_FORMAT"; readonly reason: string };

/** Bounded structural and DFD checks for the KHR_texture_basisu subset.
 * The compressed ETC1S/UASTC or Zstandard bitstream is passed through, not
 * decoded. All offsets are checked against this Uint8Array view using u64. */
function inspectBasisKTX2(data: Uint8Array, checkAbort: () => void): BasisTextureInspection {
  const invalid = (reason: string): BasisTextureInspection => ({ ok: false, code: "INVALID_KTX2_DATA", reason });
  const unsupported = (reason: string): BasisTextureInspection => ({ ok: false, code: "UNSUPPORTED_KTX2_FORMAT", reason });
  const identifier = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];
  if (data.length < 104 || identifier.some((value, index) => data[index] !== value)) return invalid("the KTX2 identifier or header is incomplete");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const u32 = (offset: number): number => view.getUint32(offset, true);
  const u64 = (offset: number): bigint => view.getBigUint64(offset, true);
  const width = u32(20), height = u32(24), levelCount = u32(40), scheme = u32(44);
  if (u32(12) !== 0 || u32(16) !== 1) return unsupported("only Basis images with VK_FORMAT_UNDEFINED and typeSize 1 are supported");
  if (!width || !height || width % 4 || height % 4 || u32(28) !== 0 || u32(32) !== 0 || u32(36) !== 1) return unsupported("Basis material images must be 2D, non-array, and have positive dimensions divisible by four");
  if (!levelCount || levelCount > 32 || levelCount > 1 + Math.floor(Math.log2(Math.max(width, height))) || 80 + 24 * levelCount > data.length) return invalid("the mip-level index is incomplete or has an invalid level count");
  const indexEnd = 80 + 24 * levelCount;
  const ranges: Array<{ start: bigint; end: bigint }> = [];
  const addRange = (start: bigint, length: bigint, alignment: bigint): boolean => {
    if (length === 0n || start < BigInt(indexEnd) || start % alignment !== 0n || start + length > BigInt(data.length)) return false;
    ranges.push({ start, end: start + length });
    return true;
  };
  const levels: Array<{ offset: bigint; length: bigint; unpacked: bigint }> = [];
  for (let i = 0; i < levelCount; i++) {
    checkAbort();
    const offset = u64(80 + 24 * i), length = u64(88 + 24 * i), unpacked = u64(96 + 24 * i);
    if (!addRange(offset, length, scheme === 0 ? 16n : 1n)) return invalid(`mip level ${i} lies outside the image or has invalid alignment`);
    levels.push({ offset, length, unpacked });
  }
  const dfdOffset = u32(48), dfdLength = u32(52), kvdOffset = u32(56), kvdLength = u32(60), sgdOffset = u64(64), sgdLength = u64(72);
  if (dfdLength < 44 || !addRange(BigInt(dfdOffset), BigInt(dfdLength), 4n)) return invalid("the data-format descriptor lies outside the image");
  if (kvdLength ? !addRange(BigInt(kvdOffset), BigInt(kvdLength), 4n) : kvdOffset !== 0) return invalid("the key/value data range is invalid");
  if (sgdLength ? !addRange(sgdOffset, sgdLength, 8n) : sgdOffset !== 0n) return invalid("the supercompression global-data range is invalid");
  ranges.sort((a, b) => a.start < b.start ? -1 : a.start > b.start ? 1 : 0);
  if (ranges.some((range, i) => i > 0 && range.start < ranges[i - 1]!.end)) return invalid("KTX2 sections overlap");
  if (dfdOffset !== indexEnd || (kvdLength && kvdOffset !== dfdOffset + dfdLength)) return invalid("KTX2 metadata sections are out of order");
  let cursor = BigInt(kvdLength ? kvdOffset + kvdLength : dfdOffset + dfdLength);
  const alignCursor = (alignment: bigint): boolean => {
    const aligned = ((cursor + alignment - 1n) / alignment) * alignment;
    if (aligned > BigInt(data.length)) return false;
    for (let i = Number(cursor); i < Number(aligned); i++) if (data[i] !== 0) return false;
    cursor = aligned;
    return true;
  };
  if (sgdLength) {
    if (!alignCursor(8n) || cursor !== sgdOffset) return invalid("the global-data section or its padding is out of order");
    cursor += sgdLength;
  }
  for (let i = levelCount - 1; i >= 0; i--) {
    if (!alignCursor(scheme === 0 ? 16n : 1n) || levels[i]!.offset !== cursor) return invalid("mip levels or their padding are out of order");
    cursor += levels[i]!.length;
  }
  if (cursor !== BigInt(data.length)) return invalid("the KTX2 image contains trailing bytes");
  if (u32(dfdOffset) !== dfdLength || u32(dfdOffset + 4) !== 0 || view.getUint16(dfdOffset + 8, true) !== 2) return invalid("the basic data-format descriptor is malformed");
  const blockSize = view.getUint16(dfdOffset + 10, true);
  if (blockSize < 40 || (blockSize - 24) % 16 || blockSize + 4 > dfdLength) return invalid("the data-format descriptor sample layout is malformed");
  if (blockSize + 4 !== dfdLength) return unsupported("additional data-format descriptor blocks cannot be interpreted");
  const samples = (blockSize - 24) / 16;
  if (samples < 1 || samples > 2) return unsupported("the data-format descriptor has an unsupported number of Basis samples");
  const model = data[dfdOffset + 12], primaries = data[dfdOffset + 13], transfer = data[dfdOffset + 14], flags = data[dfdOffset + 15];
  if (flags !== 0) return unsupported("premultiplied alpha or unknown DFD flags are not supported for glTF material images");
  if (data[dfdOffset + 16] !== 3 || data[dfdOffset + 17] !== 3 || data[dfdOffset + 18] !== 0 || data[dfdOffset + 19] !== 0) return invalid("Basis images require 4-by-4 texel blocks");
  if (!((model === 163 && scheme === 1) || (model === 166 && (scheme === 0 || scheme === 2)))) return unsupported("the KTX2 encoding is not ETC1S/BasisLZ or UASTC");
  const planes = Array.from(data.subarray(dfdOffset + 20, dfdOffset + 28));
  const legacyPlanes = scheme !== 0 && planes.every((value) => value === 0);
  const expectedPlanes = model === 163 ? [8, samples === 2 ? 8 : 0, 0, 0, 0, 0, 0, 0] : [16, 0, 0, 0, 0, 0, 0, 0];
  if (!legacyPlanes && !planes.every((value, index) => value === expectedPlanes[index])) return invalid("the DFD plane sizes do not match the Basis encoding");
  const channels: number[] = [];
  for (let i = 0; i < samples; i++) {
    const sample = dfdOffset + 28 + i * 16;
    const channel = data[sample + 3]!, qualifiers = channel & 0xf0;
    if (view.getUint16(sample, true) !== (model === 163 ? i * 64 : 0) || data[sample + 2] !== (model === 163 ? 63 : 127) ||
      (qualifiers & 0xe0) !== 0 || (transfer === 2 && (qualifiers & 0x10) !== 0 && !(model === 163 && i === 1 && (channel & 15) === 15)) ||
      data[sample + 4] !== 0 || data[sample + 5] !== 0 || data[sample + 6] !== 0 || data[sample + 7] !== 0 ||
      u32(sample + 8) !== 0 || u32(sample + 12) !== 0xffffffff) return invalid("the DFD Basis sample descriptor is malformed");
    channels.push(channel & 15);
  }
  const key = channels.join(",");
  const channelLayout = model === 163
    ? ({ "0": "rgb", "0,15": "rgba", "3": "red", "3,4": "rg" } as const)[key as "0" | "0,15" | "3" | "3,4"]
    : ({ "0": "rgb", "3": "rgba", "4": "red", "6": "rg" } as const)[key as "0" | "3" | "4" | "6"];
  if (!channelLayout) return unsupported("the DFD channel combination is not permitted by KHR_texture_basisu");
  const colorSpace = primaries === 1 && transfer === 2 ? "color" : primaries === 0 && transfer === 1 ? "data" : undefined;
  if (!colorSpace || (colorSpace === "color" && (channelLayout === "red" || channelLayout === "rg"))) return unsupported("the DFD color primaries or transfer function are not valid for glTF material use");
  if (model === 163) {
    if (sgdLength < BigInt(20 + 20 * levelCount)) return invalid("BasisLZ global data is missing or truncated");
    const start = Number(sgdOffset), extended = u32(start + 16);
    const expected = BigInt(20 + 20 * levelCount) + BigInt(u32(start + 4)) + BigInt(u32(start + 8)) + BigInt(u32(start + 12)) + BigInt(extended);
    if (extended !== 0 || expected !== sgdLength) return invalid("BasisLZ global-data lengths are inconsistent");
    for (let i = 0; i < levelCount; i++) {
      const descriptor = start + 20 + 20 * i;
      const flags = u32(descriptor), rgbOffset = u32(descriptor + 4), rgbLength = u32(descriptor + 8), alphaOffset = u32(descriptor + 12), alphaLength = u32(descriptor + 16);
      if (flags !== 0 || rgbLength === 0 || BigInt(rgbOffset) + BigInt(rgbLength) > levels[i]!.length || levels[i]!.unpacked !== 0n ||
        (samples === 1 ? alphaOffset !== 0 || alphaLength !== 0 : alphaLength === 0 || BigInt(alphaOffset) + BigInt(alphaLength) > levels[i]!.length)) return invalid(`BasisLZ image descriptor ${i} is invalid`);
    }
  } else {
    if (sgdLength !== 0n) return invalid("UASTC does not permit supercompression global data");
    for (let i = 0; i < levelCount; i++) {
      const mipWidth = Math.max(1, Math.floor(width / (2 ** i))), mipHeight = Math.max(1, Math.floor(height / (2 ** i)));
      const size = BigInt(Math.ceil(mipWidth / 4)) * BigInt(Math.ceil(mipHeight / 4)) * 16n;
      if (levels[i]!.unpacked !== size || (scheme === 0 && levels[i]!.length !== size)) return invalid(`UASTC mip level ${i} has an invalid uncompressed size`);
    }
  }
  if (kvdLength) {
    const end = kvdOffset + kvdLength;
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let offset = kvdOffset, previousKey: Uint8Array | undefined, entries = 0;
    while (offset < end) {
      if ((entries++ & 1023) === 0) checkAbort();
      if (offset + 4 > end) return invalid("a key/value length is truncated");
      const length = u32(offset), start = offset + 4, finish = start + length, padded = start + Math.ceil(length / 4) * 4;
      if (length < 2 || finish > end || padded > end) return invalid("a key/value record exceeds its section");
      let separator = start;
      while (separator < finish && data[separator] !== 0) {
        if (((separator - start) & 8191) === 0) checkAbort();
        if (separator - start > 65536) return unsupported("a KTX2 metadata key exceeds the inspection limit");
        separator++;
      }
      if (separator === start || separator === finish) return invalid("a key/value record has no terminated key");
      const bytes = data.subarray(start, separator);
      if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return invalid("a key/value key starts with a UTF-8 byte-order mark");
      let text: string;
      try { text = decoder.decode(bytes); } catch { return invalid("a key/value key is not valid UTF-8"); }
      if (previousKey) {
        let i = 0;
        while (i < previousKey.length && i < bytes.length && previousKey[i] === bytes[i]) i++;
        if (i === bytes.length || (i < previousKey.length && previousKey[i]! >= bytes[i]!)) return invalid("key/value keys are duplicated or not sorted");
      }
      previousKey = bytes;
      const matches = (expected: string): boolean => {
        const valueStart = separator + 1, valueLength = finish - valueStart;
        if (valueLength !== expected.length + 1 || data[finish - 1] !== 0) return false;
        for (let i = 0; i < expected.length; i++) if (data[valueStart + i] !== expected.charCodeAt(i)) return false;
        return true;
      };
      if (text === "KTXorientation" && !matches("rd")) return unsupported("KTXorientation is not rd");
      if (text === "KTXswizzle" && !matches("rgba")) return unsupported("KTXswizzle is not rgba");
      for (let i = finish; i < padded; i++) if (data[i] !== 0) return invalid("key/value padding is not zero");
      offset = padded;
    }
  }
  return { ok: true, channels: channelLayout, colorSpace };
}

function imageMimeType(mime: string | undefined, name: string): string | undefined {
  const value = mime?.toLowerCase() ?? (/\.png$/i.test(name) ? "image/png" : /\.jpe?g$/i.test(name) ? "image/jpeg" : /\.webp$/i.test(name) ? "image/webp" : /\.avif$/i.test(name) ? "image/avif" : /\.ktx2$/i.test(name) ? "image/ktx2" : "");
  return value === "image/png" || value === "image/jpeg" || value === "image/webp" || value === "image/avif" || value === "image/ktx2" ? value : undefined;
}
function hasImageSignature(data: Uint8Array, mimeType: string, checkAbort: () => void): boolean {
  if (mimeType === "image/png") return data.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => data[i] === value);
  if (mimeType === "image/webp") return data.length >= 12 && [82, 73, 70, 70].every((value, i) => data[i] === value) && [87, 69, 66, 80].every((value, i) => data[i + 8] === value);
  if (mimeType === "image/avif") {
    if (data.length < 16 || ![102, 116, 121, 112].every((value, i) => data[i + 4] === value)) return false;
    const length = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(0);
    if (length < 16 || length > data.length || length % 4 !== 0) return false;
    const brand = (offset: number, expected: string): boolean => data[offset] === expected.charCodeAt(0) && data[offset + 1] === expected.charCodeAt(1) && data[offset + 2] === expected.charCodeAt(2) && data[offset + 3] === expected.charCodeAt(3);
    if (brand(8, "avis")) return false; // The draft extension supports still images, not AVIF sequences.
    if (brand(8, "avif")) return true;
    for (let offset = 16; offset < length; offset += 4) { if ((offset & 8191) === 0) checkAbort(); if (brand(offset, "avif")) return true; }
    return false;
  }
  return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
}
function base64(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const parts: string[] = [];
  let block = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const value = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    block += alphabet[(value >>> 18) & 63] + alphabet[(value >>> 12) & 63] + (i + 1 < bytes.length ? alphabet[(value >>> 6) & 63] : "=") + (i + 2 < bytes.length ? alphabet[value & 63] : "=");
    if (block.length >= 16384) { parts.push(block); block = ""; }
  }
  parts.push(block);
  return parts.join("");
}
