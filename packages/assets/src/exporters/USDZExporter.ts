import type {
  AuraExportAttribute,
  AuraExportCamera,
  AuraExportLight,
  AuraExportMaterial,
  AuraExportNode,
  AuraExportPrimitive,
  AuraExportResult,
  AuraExportScene
} from "./ExportContext";
import { findUnsupportedExportProperties, validateScene } from "./ExportContext";

/** USDZ stores an uncompressed USDA stage and referenced PNG/JPEG textures.
 * Declared units and up-axis are preserved; unspecified values default to
 * metres and Y-up with warnings. Animation sample times are seconds.
 * UVs are converted to USD's bottom-left convention when the source declares
 * an origin; otherwise they remain unchanged and a warning is returned.
 */
export interface USDZExportOptions {
  readonly signal?: AbortSignal;
  /** Maximum archive size and conservative stage-plus-dependency estimate. */
  readonly maxBytes?: number;
  /** Opt in to USD scalar spline curves for exact STEP/cubic translation and scale. */
  readonly animationInterpolation?: "compatible" | "native-spline";
}

/** Source-level capability boundary; warnings identify individual losses. */
export const USDZ_EXPORT_CAPABILITIES = Object.freeze({
  stage: "USDA in uncompressed ZIP32 with 64-byte-aligned entries",
  geometry: ["triangles", "lines", "points", "normals", "UV0", "vertex colors"] as const,
  materials: "UsdPreviewSurface with embedded PNG/JPEG base color, metallic-roughness, normal, occlusion and emissive textures; nonstandard normal scale/bias carries a compatibility warning",
  transforms: "hierarchical matrix or translation/rotation/scale",
  animation: "selectable clip variants; optional exact scalar translation/scale splines, with explicitly warned quaternion and compatibility approximations",
  cameras: "perspective and orthographic, with warned fallbacks for unspecified aspect and infinite far plane",
  lights: "directional, point and spot with warned photometric, cone and range approximations",
  deformation: "UsdSkel linear skinning, multiple joint influence sets, position/normal blend shapes and sampled joint/weight animation",
  metadata: "JSON scene, node and material metadata stored in Aura3D custom properties",
  unsupported: ["unlit material response", "tangent morphs", "unbounded joint counts", "arbitrary vertex attributes"] as const
});

type Warning = AuraExportResult["warnings"][number];
type AnimationSample = { readonly time: number; readonly value: readonly number[] };
type AnimationCurve = { readonly interpolation: "LINEAR" | "STEP" | "CUBICSPLINE"; readonly times: readonly number[]; readonly values: readonly (readonly number[])[] };
type Rig = {
  readonly nodeIndex: number; readonly skinIndex?: number; readonly joints: readonly number[];
  readonly jointTokens: readonly string[]; readonly jointParents: readonly number[];
  readonly sourceJointToRig: readonly number[]; readonly bind: readonly (readonly number[])[];
  readonly rest: readonly (readonly number[])[]; readonly weights: readonly number[];
};
type JointPose = { readonly translation: number[]; readonly rotation: number[]; readonly scale: number[] };
type Texture = { readonly archiveName: string; readonly data: Uint8Array };
const encoder = new TextEncoder();
const DEFAULT_MAX_BYTES = 256 * 1024 * 1024;
const MAX_ZIP32 = 0xffffffff;

function abort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("USDZ export cancelled", "AbortError");
}

function fail(message: string): never { throw new Error(`USDZ export: ${message}`); }
function finite(value: number, path: string): number {
  if (!Number.isFinite(value)) fail(`${path} must contain finite numbers`);
  return Object.is(value, -0) ? 0 : value;
}
function number(value: number, path: string): string { return String(finite(value, path)); }
function string(value: string): string { return JSON.stringify(value); }
function validateJson(value: unknown, path: string, ancestors = new Set<object>()): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") { finite(value, path); return; }
  if (typeof value !== "object") fail(`${path} contains a non-JSON value`);
  if (ancestors.has(value)) fail(`${path} contains a cycle`);
  if (ancestors.size >= 64) fail(`${path} exceeds the metadata nesting limit`);
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) fail(`${path} must contain plain JSON objects`);
  ancestors.add(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (!(i in value)) fail(`${path} contains a sparse array`);
      validateJson(value[i], `${path}[${i}]`, ancestors);
    }
  } else {
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") fail(`${path} contains a symbol key`);
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) fail(`${path}.${key} is not a plain JSON property`);
      validateJson(descriptor.value, `${path}.${key}`, ancestors);
    }
  }
  ancestors.delete(value);
}
function json(value: unknown, path: string): string {
  validateJson(value, path);
  let encoded: string | undefined;
  try { encoded = JSON.stringify(value); } catch { fail(`${path} must be JSON serializable`); }
  if (encoded === undefined) fail(`${path} must be JSON serializable`);
  return string(encoded);
}
function tuple(values: readonly number[], path: string): string {
  return `(${values.map((value) => number(value, path)).join(", ")})`;
}
function floatNumber(value: number, path: string): string {
  finite(value, path);
  if (!Number.isFinite(Math.fround(value))) fail(`${path} exceeds USD float32 range`);
  return number(value, path);
}
function floatTuple(values: readonly number[], path: string): string {
  return `(${values.map((value) => floatNumber(value, path)).join(", ")})`;
}
function halfTuple(values: readonly number[], path: string): string {
  if (values.some((value) => !Number.isFinite(value) || Math.abs(value) > 65504)) fail(`${path} exceeds USD float16 range`);
  return tuple(values, path);
}
const identityMatrix = (): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function multiplyMatrix(a: readonly number[], b: readonly number[]): number[] {
  return Array.from({ length: 16 }, (_, i) => {
    const c = Math.floor(i / 4), r = i % 4;
    return a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  });
}
function invertMatrix(input: readonly number[], path: string): number[] {
  const a = Array.from({ length: 4 }, (_, row) => [...Array.from({ length: 4 }, (_, col) => input[col * 4 + row]), ...Array.from({ length: 4 }, (_, col) => row === col ? 1 : 0)]);
  for (let col = 0; col < 4; col++) {
    let pivot = col;
    for (let row = col + 1; row < 4; row++) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    if (!Number.isFinite(a[pivot][col]) || Math.abs(a[pivot][col]) < 1e-14) fail(`${path} has a singular matrix`);
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const divisor = a[col][col];
    for (let j = 0; j < 8; j++) a[col][j] /= divisor;
    for (let row = 0; row < 4; row++) if (row !== col) {
      const factor = a[row][col];
      for (let j = 0; j < 8; j++) a[row][j] -= factor * a[col][j];
    }
  }
  return Array.from({ length: 16 }, (_, i) => finite(a[i % 4][4 + Math.floor(i / 4)], path));
}
function nodeMatrix(node: AuraExportNode): number[] {
  if (node.matrix) return [...node.matrix];
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1], [sx, sy, sz] = node.scale ?? [1, 1, 1], [tx, ty, tz] = node.translation ?? [0, 0, 0];
  return [(1-2*(y*y+z*z))*sx, 2*(x*y+w*z)*sx, 2*(x*z-w*y)*sx, 0,
    2*(x*y-w*z)*sy, (1-2*(x*x+z*z))*sy, 2*(y*z+w*x)*sy, 0,
    2*(x*z+w*y)*sz, 2*(y*z-w*x)*sz, (1-2*(x*x+y*y))*sz, 0, tx, ty, tz, 1];
}
function matrixTuple(matrix: readonly number[], path: string): string {
  return `(${tuple(matrix.slice(0, 4), path)}, ${tuple(matrix.slice(4, 8), path)}, ${tuple(matrix.slice(8, 12), path)}, ${tuple(matrix.slice(12, 16), path)})`;
}
function decomposePose(m: readonly number[], path: string): JointPose {
  const sx = Math.hypot(m[0], m[1], m[2]), sy = Math.hypot(m[4], m[5], m[6]), sz0 = Math.hypot(m[8], m[9], m[10]);
  if (Math.min(sx, sy, sz0) < 1e-12) fail(`${path} has a non-decomposable transform`);
  const det = m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]);
  const sz = det < 0 ? -sz0 : sz0;
  const a = m[0]/sx, b = m[4]/sy, c = m[8]/sz, d = m[1]/sx, e = m[5]/sy, f = m[9]/sz, g = m[2]/sx, h = m[6]/sy, i = m[10]/sz;
  if (Math.max(Math.abs(a*b+d*e+g*h), Math.abs(a*c+d*f+g*i), Math.abs(b*c+e*f+h*i)) > 1e-5) fail(`${path} contains shear that cannot be represented by joint TRS`);
  let x: number, y: number, z: number, w: number;
  const trace = a + e + i;
  if (trace > 0) { const s = Math.sqrt(trace + 1) * 2; w = s / 4; x = (h - f) / s; y = (c - g) / s; z = (d - b) / s; }
  else if (a > e && a > i) { const s = Math.sqrt(1 + a - e - i) * 2; w = (h - f) / s; x = s / 4; y = (b + d) / s; z = (c + g) / s; }
  else if (e > i) { const s = Math.sqrt(1 + e - a - i) * 2; w = (c - g) / s; x = (b + d) / s; y = s / 4; z = (f + h) / s; }
  else { const s = Math.sqrt(1 + i - a - e) * 2; w = (d - b) / s; x = (c + g) / s; y = (f + h) / s; z = s / 4; }
  return { translation: [m[12], m[13], m[14]], rotation: [x, y, z, w], scale: [sx, sy, sz] };
}
function interpolateCurve(curve: AnimationCurve, time: number, rotation: boolean): number[] {
  const count = curve.times.length;
  const value = (index: number): readonly number[] => curve.values[curve.interpolation === "CUBICSPLINE" ? index * 3 + 1 : index];
  if (time <= curve.times[0]) return [...value(0)];
  if (time >= curve.times[count - 1]) return [...value(count - 1)];
  let high = 1;
  while (high < count && curve.times[high] < time) high++;
  if (time === curve.times[high]) return [...value(high)];
  const low = high - 1, duration = curve.times[high] - curve.times[low], u = (time - curve.times[low]) / duration;
  if (curve.interpolation === "STEP") return [...value(low)];
  const p = value(low), q = value(high);
  if (curve.interpolation === "CUBICSPLINE") {
    const u2 = u*u, u3 = u2*u;
    const result = p.map((v, c) => (2*u3-3*u2+1)*v + (u3-2*u2+u)*duration*curve.values[low*3+2][c] + (-2*u3+3*u2)*q[c] + (u3-u2)*duration*curve.values[high*3][c]);
    if (rotation) { const length = Math.hypot(...result); if (!length) fail("cubic animation produced a zero quaternion"); return result.map((v) => v/length); }
    return result;
  }
  if (rotation) {
    let dot = p.reduce((sum, v, c) => sum + v*q[c], 0), sign = 1;
    if (dot < 0) { dot = -dot; sign = -1; }
    dot = Math.min(1, Math.max(-1, dot));
    const angle = Math.acos(dot), sin = Math.sin(angle);
    const left = sin < 1e-8 ? 1-u : Math.sin((1-u)*angle)/sin, right = sin < 1e-8 ? u : Math.sin(u*angle)/sin;
    const result = p.map((v, c) => v*left + q[c]*right*sign), length = Math.hypot(...result);
    if (!length) fail("animation produced a zero quaternion");
    return result.map((v) => v/length);
  }
  return p.map((v, c) => v + (q[c] - v)*u);
}
function checkVector(values: readonly number[] | undefined, count: number, path: string): void {
  if (values && values.length !== count) fail(`${path} must contain ${count} values`);
  values?.forEach((value) => finite(value, path));
}
function component(attribute: AuraExportAttribute, index: number): number {
  const raw = finite(attribute.values[index], `attribute value ${index}`);
  if (!attribute.normalized) return raw;
  if (attribute.values instanceof Int8Array) return Math.max(-1, raw / 127);
  if (attribute.values instanceof Uint8Array) return raw / 255;
  if (attribute.values instanceof Int16Array) return Math.max(-1, raw / 32767);
  if (attribute.values instanceof Uint16Array) return raw / 65535;
  if (attribute.values instanceof Uint32Array) return raw / 4294967295;
  fail("normalization requires an integer typed array");
}
function rows(attribute: AuraExportAttribute, width: number, path: string, count?: number): number[][] {
  if (attribute.itemSize !== width || attribute.values.length % width !== 0) fail(`${path} requires ${width}-component values`);
  const length = attribute.values.length / width;
  if (count !== undefined && length !== count) fail(`${path} has ${length} values; expected ${count}`);
  return Array.from({ length }, (_, index) => Array.from({ length: width }, (_, c) => component(attribute, index * width + c)));
}
function appendMetadata(out: string[], indent: string, value: unknown, path: string): void {
  if (value !== undefined) out.push(`${indent}custom string aura3d:metadata = ${json(value, path)}`);
}
function appendSourceName(out: string[], indent: string, value?: string): void {
  if (value !== undefined) out.push(`${indent}custom string aura3d:sourceName = ${string(value)}`);
}
function array<T>(items: readonly T[], format: (item: T) => string): string {
  return `[${items.map(format).join(", ")}]`;
}
function imageSignature(data: Uint8Array, extension: string, signal?: AbortSignal): boolean {
  if (extension === "png") {
    if (data.length < 45 || ![137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => data[index] === byte)) return false;
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let offset = 8, seenHeader = false, seenPixels = false;
    for (let count = 0; offset + 12 <= data.length && count < 100000; count++) {
      abort(signal);
      const size = view.getUint32(offset), start = offset + 8, end = start + size;
      if (end + 4 > data.length) return false;
      const name = String.fromCharCode(...data.subarray(offset + 4, start));
      if (!/^[A-Za-z]{4}$/.test(name) || crc32(data.subarray(offset + 4, end), signal) !== view.getUint32(end)) return false;
      if (!seenHeader) {
        if (name !== "IHDR" || size !== 13 || !view.getUint32(start) || !view.getUint32(start + 4)) return false;
        const depth = data[start + 8], color = data[start + 9];
        const validDepths: Record<number, readonly number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
        if (!validDepths[color]?.includes(depth) || data[start + 10] !== 0 || data[start + 11] !== 0 || data[start + 12] > 1) return false;
        seenHeader = true;
      } else if (name === "IHDR") return false;
      if (name === "IDAT") seenPixels = true;
      if (name === "IEND") return size === 0 && seenPixels && end + 4 === data.length;
      offset = end + 4;
    }
    return false;
  }
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) return false;
  let offset = 2, hasFrame = false, hasScan = false, inScan = false;
  while (offset < data.length) {
    abort(signal);
    if (inScan) {
      while (offset < data.length && data[offset] !== 0xff) offset++;
      if (offset >= data.length) return false;
    } else if (data[offset] !== 0xff) return false;
    while (offset < data.length && data[offset] === 0xff) offset++;
    if (offset >= data.length) return false;
    const marker = data[offset++];
    if (inScan && (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7))) continue;
    inScan = false;
    if (marker === 0xd9) return hasFrame && hasScan && offset === data.length;
    if (marker === 0xd8 || marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) return false;
    if (marker === 0x01) continue;
    if (offset + 2 > data.length) return false;
    const length = (data[offset] << 8) | data[offset + 1];
    if (length < 2 || offset + length > data.length) return false;
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      if (length < 8 || ((data[offset + 3] << 8) | data[offset + 4]) === 0 || ((data[offset + 5] << 8) | data[offset + 6]) === 0) return false;
      hasFrame = true;
    }
    offset += length;
    if (marker === 0xda) { hasScan = true; inScan = true; }
  }
  return false;
}

/**
 * Exports a bounded, store-only ZIP32 USDZ package. The first member is the
 * USDA stage; texture dependencies are stored inside the same archive. Losses
 * are reported alongside the bytes rather than silently discarded.
 */
export function exportUSDZ(scene: AuraExportScene, options: USDZExportOptions = {}): AuraExportResult {
  abort(options.signal);
  if (options.animationInterpolation !== undefined && options.animationInterpolation !== "compatible" && options.animationInterpolation !== "native-spline") fail("animationInterpolation must be compatible or native-spline");
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_ZIP32) fail("maxBytes must be between 1 and 2^32-1");
  validateScene(scene, options.signal);
  if (scene.uvOrigin !== undefined && scene.uvOrigin !== "top-left" && scene.uvOrigin !== "bottom-left") fail("uvOrigin must be top-left or bottom-left");
  const warnings: Warning[] = [...(scene.sourceWarnings ?? []), ...findUnsupportedExportProperties(scene)];
  const warn = (code: string, path: string, message: string): void => { warnings.push({ code, path, message }); };
  const nodes = scene.nodes;
  const meshes = scene.meshes ?? [];
  const materials = scene.materials ?? [];
  const dependencies = scene.dependencies ?? [];
  const textureByName = new Map<string, Texture>();
  const dependencyNames = new Set<string>();
  let payloadBytes = 0;
  for (const [index, dep] of dependencies.entries()) {
    abort(options.signal);
    if (!dep.name || /[\x00-\x1f]/.test(dep.name)) fail(`dependencies[${index}].name is invalid`);
    if (!(dep.data instanceof Uint8Array)) fail(`dependencies[${index}].data must be a Uint8Array`);
    if (dependencyNames.has(dep.name)) fail(`duplicate dependency name ${dep.name}`);
    dependencyNames.add(dep.name);
    const match = /\.(png|jpe?g)$/i.exec(dep.name);
    if (!match) {
      warn("USDZ_DEPENDENCY_UNSUPPORTED", `dependencies[${index}]`, `Only PNG and JPEG image dependencies are supported: ${dep.name}`);
      continue;
    }
    payloadBytes += dep.data.byteLength;
    if (payloadBytes > maxBytes) fail("input dependencies exceed maxBytes");
    const extension = match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase();
    if (!imageSignature(dep.data, extension, options.signal)) fail(`dependencies[${index}] has an invalid ${extension.toUpperCase()} image structure or checksum`);
    textureByName.set(dep.name, { archiveName: `textures/texture_${index}.${extension}`, data: dep.data });
  }

  // A USD prim has one parent. Reject cycles, repeated references and invalid
  // indices instead of silently inventing instancing or dropping a subtree.
  const visited = new Set<number>();
  const usedMeshes = new Set<number>();
  const usedCameras = new Set<number>();
  const usedLights = new Set<number>();
  const usedSkins = new Set<number>();
  const parents = new Map<number, number>();
  const paths = new Map<number, string>();
  const worldMatrices = new Map<number, readonly number[]>();
  let stageEstimate = 4096 + materials.length * 2048;
  const estimate = (amount: number): void => {
    stageEstimate += amount;
    if (!Number.isSafeInteger(stageEstimate) || stageEstimate + payloadBytes > maxBytes) fail("estimated USDA stage and dependencies exceed maxBytes");
  };
  function validateNode(index: number, depth = 0, parent?: number): void {
    abort(options.signal);
    if (depth > 256) fail("node hierarchy exceeds the 256-level depth limit");
    if (!Number.isInteger(index) || index < 0 || index >= nodes.length) fail(`invalid node index ${index}`);
    if (visited.has(index)) fail(`node ${index} has a cycle or more than one parent`);
    visited.add(index);
    const node = nodes[index];
    checkVector(node.matrix, 16, `nodes[${index}].matrix`);
    checkVector(node.translation, 3, `nodes[${index}].translation`);
    checkVector(node.rotation, 4, `nodes[${index}].rotation`);
    checkVector(node.scale, 3, `nodes[${index}].scale`);
    if (node.matrix && (node.translation || node.rotation || node.scale)) fail(`nodes[${index}] mixes a matrix with TRS`);
    if (node.matrix && (node.matrix[3] !== 0 || node.matrix[7] !== 0 || node.matrix[11] !== 0 || node.matrix[15] !== 1)) fail(`nodes[${index}].matrix must be affine`);
    if (parent !== undefined) parents.set(index, parent);
    paths.set(index, `${parent === undefined ? "/Scene" : paths.get(parent)}/Node_${index}`);
    worldMatrices.set(index, multiplyMatrix(parent === undefined ? identityMatrix() : worldMatrices.get(parent)!, nodeMatrix(node)));
    if (node.mesh !== undefined && (!Number.isInteger(node.mesh) || !meshes[node.mesh])) fail(`nodes[${index}].mesh is invalid`);
    if (node.camera !== undefined && (!Number.isInteger(node.camera) || !scene.cameras?.[node.camera])) fail(`nodes[${index}].camera is invalid`);
    if (node.light !== undefined && (!Number.isInteger(node.light) || !scene.lights?.[node.light])) fail(`nodes[${index}].light is invalid`);
    if (node.skin !== undefined && (!Number.isInteger(node.skin) || !scene.skins?.[node.skin])) fail(`nodes[${index}].skin is invalid`);
    if (node.mesh !== undefined) usedMeshes.add(node.mesh);
    if (node.camera !== undefined) usedCameras.add(node.camera);
    if (node.light !== undefined) usedLights.add(node.light);
    if (node.skin !== undefined) usedSkins.add(node.skin);
    estimate(1024 + (node.name?.length ?? 0) * 6 + (node.metadata === undefined ? 0 : json(node.metadata, `nodes[${index}].metadata`).length * 6));
    if (node.mesh !== undefined) for (const primitive of meshes[node.mesh].primitives) {
      estimate(1024 + (primitive.indices?.length ?? 0) * 12 + Object.values(primitive.attributes).reduce((total, attr) => total + attr.values.length * 32, 0) + (primitive.targets ?? []).reduce((total, target) => total + Object.values(target).reduce((sum, attr) => sum + attr.values.length * 32, 0), 0));
    }
    for (const child of node.children ?? []) validateNode(child, depth + 1, index);
  }
  estimate((scene.metadata === undefined ? 0 : json(scene.metadata, "metadata").length * 6) + materials.reduce((total, material) => total + (material.name?.length ?? 0) * 6 + (material.metadata === undefined ? 0 : json(material.metadata, "material metadata").length * 6), 0));
  for (const root of scene.roots) validateNode(root);
  for (let index = 0; index < nodes.length; index++) if (!visited.has(index)) warn("USDZ_UNREACHABLE_NODE", `nodes[${index}]`, "Node is not reachable from the scene roots and was omitted.");
  for (const [index] of (scene.cameras ?? []).entries()) if (!usedCameras.has(index)) warn("USDZ_UNUSED_CAMERA", `cameras[${index}]`, "Camera is not referenced by the scene and was omitted.");
  for (const [index] of (scene.lights ?? []).entries()) if (!usedLights.has(index)) warn("USDZ_UNUSED_LIGHT", `lights[${index}]`, "Light is not referenced by the scene and was omitted.");
  for (const [index] of (scene.skins ?? []).entries()) if (!usedSkins.has(index)) warn("USDZ_SKIN_UNSUPPORTED", `skins[${index}]`, "Skin was omitted from the USDZ stage.");
  for (const [index] of meshes.entries()) if (!usedMeshes.has(index)) warn("USDZ_UNUSED_MESH", `meshes[${index}]`, "Mesh is not referenced by the scene and was omitted.");

  // UsdSkel defines joint-local rest transforms, world-space bind transforms,
  // and per-point joint primvars. glTF's jointWorld * inverseBind deformation
  // maps to a root-space skeleton with identity geomBindTransform; morph
  // deltas are applied before skinning. Schema and space definitions:
  // https://openusd.org/release/api/_usd_skel__intro.html
  // https://openusd.org/release/api/_usd_skel__schemas.html
  const rigs = new Map<number, Rig>();
  for (const index of visited) {
    const node = nodes[index];
    if (node.mesh === undefined) {
      if (node.skin !== undefined) warn("USDZ_SKIN_WITHOUT_MESH", `nodes[${index}].skin`, "A skin on a node without a mesh was omitted.");
      continue;
    }
    const mesh = meshes[node.mesh];
    const targetCount = mesh.primitives[0]?.targets?.length ?? 0;
    if (mesh.primitives.some((primitive) => (primitive.targets?.length ?? 0) !== targetCount)) fail(`meshes[${node.mesh}] primitives must share their morph target count`);
    const weights = node.weights ?? mesh.weights ?? Array(targetCount).fill(0);
    if (weights.length !== targetCount || weights.some((value) => !Number.isFinite(value))) fail(`nodes[${index}] morph weights must match target count`);
    if (node.skin === undefined && !targetCount) continue;
    estimate(2048 + targetCount * 128);
    const morphFallback = (): void => {
      if (targetCount) rigs.set(index, { nodeIndex: index, joints: [], jointTokens: ["MorphRoot"], jointParents: [-1], sourceJointToRig: [0], bind: [identityMatrix()], rest: [worldMatrices.get(index)!], weights });
    };
    if (node.skin === undefined) { morphFallback(); continue; }
    const skin = scene.skins![node.skin];
    if (skin.skeleton !== undefined && (!Number.isInteger(skin.skeleton) || !visited.has(skin.skeleton))) fail(`skins[${node.skin}].skeleton is invalid`);
    if (skin.joints.length > 4096) {
      warn("USDZ_SKIN_JOINT_LIMIT", `skins[${node.skin}]`, "Skin exceeds the 4096-joint export limit; the skin was omitted.");
      morphFallback(); continue;
    }
    if (!skin.joints.length || new Set(skin.joints).size !== skin.joints.length || skin.joints.some((joint) => !visited.has(joint))) {
      warn("USDZ_SKIN_JOINTS_UNSUPPORTED", `skins[${node.skin}]`, "Skin joints must be unique and reachable; this skin was omitted.");
      morphFallback(); continue;
    }
    estimate(skin.joints.length * 1024);
    const jointSet = new Set(skin.joints);
    for (const [clipIndex, clip] of (scene.animations ?? []).entries()) for (const [channelIndex, channel] of clip.channels.entries()) {
      if (channel.path === "weights" || jointSet.has(channel.node)) continue;
      const controlsJoint = skin.joints.some((joint) => { for (let p = parents.get(joint); p !== undefined; p = parents.get(p)) if (p === channel.node) return true; return false; });
      if (controlsJoint) warn("USDZ_SKIN_ANCESTOR_ANIMATION_APPROXIMATED", `animations[${clipIndex}].channels[${channelIndex}]`, "Animation of a non-joint ancestor is sampled into this skin's joint-local transforms.");
    }
    const closestParent = (joint: number): number | undefined => {
      let candidate = parents.get(joint);
      while (candidate !== undefined && !jointSet.has(candidate)) candidate = parents.get(candidate);
      return candidate;
    };
    const depth = (joint: number): number => { let d = 0; for (let p = closestParent(joint); p !== undefined; p = closestParent(p)) d++; return d; };
    const joints = [...skin.joints].sort((a, b) => depth(a) - depth(b));
    const rigIndex = new Map(joints.map((joint, i) => [joint, i]));
    const sourceJointToRig = skin.joints.map((joint) => rigIndex.get(joint)!);
    const jointParents = joints.map((joint) => { const p = closestParent(joint); return p === undefined ? -1 : rigIndex.get(p)!; });
    const jointTokens: string[] = [];
    const rest: number[][] = [], bind: number[][] = [];
    if (skin.inverseBindMatrices && (skin.inverseBindMatrices.itemSize !== 16 || skin.inverseBindMatrices.values.length !== joints.length * 16)) fail(`skins[${node.skin}].inverseBindMatrices must contain one matrix per joint`);
    try {
      for (const [i, joint] of joints.entries()) {
        const parentIndex = jointParents[i];
        jointTokens.push(`${parentIndex < 0 ? "" : `${jointTokens[parentIndex]}/`}Joint_${joint}`);
        const parentWorld = parentIndex < 0 ? identityMatrix() : worldMatrices.get(joints[parentIndex])!;
        rest.push(multiplyMatrix(invertMatrix(parentWorld, `skins[${node.skin}] parent`), worldMatrices.get(joint)!));
        const sourceIndex = skin.joints.indexOf(joint);
        const inverseBind = skin.inverseBindMatrices ? Array.from({ length: 16 }, (_, c) => component(skin.inverseBindMatrices!, sourceIndex * 16 + c)) : identityMatrix();
        bind.push(invertMatrix(inverseBind, `skins[${node.skin}].inverseBindMatrices[${sourceIndex}]`));
      }
    } catch (error) {
      warn("USDZ_SKIN_BIND_UNSUPPORTED", `skins[${node.skin}]`, `Bind and parent transforms must be invertible for USD skeletal conversion: ${error instanceof Error ? error.message : String(error)}`);
      morphFallback(); continue;
    }
    rigs.set(index, { nodeIndex: index, skinIndex: node.skin, joints, jointTokens, jointParents, sourceJointToRig, bind, rest, weights });
  }

  const usedTextures = new Set<string>();
  for (const [index, material] of materials.entries()) {
    for (const slot of ["baseColorTexture", "metallicRoughnessTexture", "normalTexture", "occlusionTexture", "emissiveTexture"] as const) {
      const name = material[slot];
      if (name === undefined) continue;
      if (textureByName.has(name)) usedTextures.add(name);
      else warn("USDZ_TEXTURE_MISSING", `materials[${index}].${slot}`, `Texture ${name} was not packaged; the corresponding untextured material value is used instead.`);
    }
    if (material.unlit) warn("USDZ_UNLIT_UNSUPPORTED", `materials[${index}].unlit`, "Unlit material shading is exported using a lit UsdPreviewSurface instead.");
    if (material.normalTextureScale !== undefined && material.normalTexture === undefined) warn("USDZ_NORMAL_SCALE_WITHOUT_TEXTURE", `materials[${index}].normalTextureScale`, "Normal scale has no normal texture and was omitted.");
    if (material.occlusionStrength !== undefined && material.occlusionTexture === undefined) warn("USDZ_OCCLUSION_STRENGTH_WITHOUT_TEXTURE", `materials[${index}].occlusionStrength`, "Occlusion strength has no occlusion texture and was omitted.");
    if (material.normalTexture && textureByName.has(material.normalTexture) && (scene.uvOrigin === "top-left" || (material.normalTextureScale ?? 1) !== 1)) {
      warn("USDZ_NORMAL_MAP_SCALE_COMPATIBILITY", `materials[${index}].normalTexture`, "Normal scale and UV handedness use nonstandard UsdUVTexture scale/bias; some USD validators or consumers require the standard normal-map values.");
    }
  }
  for (const [name] of textureByName) if (!usedTextures.has(name)) warn("USDZ_UNUSED_DEPENDENCY", "dependencies", `Dependency ${name} is not referenced and was omitted.`);
  if (usedTextures.size && !scene.uvOrigin) warn("USDZ_UV_ORIGIN_UNSPECIFIED", "uvOrigin", "Texture coordinates were preserved without an origin conversion; declare their source origin to preserve texture orientation.");

  const clips = scene.animations ?? [];
  for (const clip of clips) for (const channel of clip.channels) estimate((channel.times.values.length + channel.values.values.length) * 80 * (channel.interpolation === "CUBICSPLINE" ? 17 : channel.interpolation === "STEP" ? 2 : 1) + 256);
  const clipChannels: Map<string, readonly AnimationSample[]>[] = [];
  const clipCurves: Map<string, AnimationCurve>[] = [];
  const morphCurves: Map<number, AnimationCurve>[] = [];
  const animatedKeys = new Set<string>();
  const splitKeys = new Set<string>();
  let minTime = Infinity;
  let maxTime = -Infinity;
  for (const [clipIndex, clip] of clips.entries()) {
   const channels = new Map<string, readonly AnimationSample[]>();
   clipChannels.push(channels);
   const curves = new Map<string, AnimationCurve>();
   clipCurves.push(curves);
   const morphs = new Map<number, AnimationCurve>();
   morphCurves.push(morphs);
   for (const [index, channel] of clip.channels.entries()) {
    const path = `animations[${clipIndex}].channels[${index}]`;
    if (!visited.has(channel.node)) { warn("USDZ_ANIMATION_TARGET_OMITTED", path, "Animation target is not reachable from the scene roots."); continue; }
    if (channel.path === "weights") {
      const rig = rigs.get(channel.node), count = rig?.weights.length ?? 0;
      if (!count) { warn("USDZ_MORPH_ANIMATION_UNSUPPORTED", path, "Morph weight animation has no bound morph targets and was omitted."); continue; }
      if (morphs.has(channel.node)) { warn("USDZ_DUPLICATE_ANIMATION_CHANNEL", path, "A previous channel already targets these morph weights."); continue; }
      if (channel.times.itemSize !== 1 || !["LINEAR", "STEP", "CUBICSPLINE"].includes(channel.interpolation ?? "LINEAR")) fail(`${path} has invalid time or interpolation data`);
      const times = rows(channel.times, 1, `${path}.times`).map(([time]) => time);
      if (!times.length || times.some((time, i) => i > 0 && time <= times[i - 1])) fail(`${path}.times must be nonempty and strictly increasing`);
      const interpolation = channel.interpolation ?? "LINEAR", groups = times.length * (interpolation === "CUBICSPLINE" ? 3 : 1);
      if (channel.values.values.length !== groups * count) fail(`${path}.values must contain ${count} values per morph key`);
      const values = Array.from({ length: groups }, (_, group) => Array.from({ length: count }, (_, c) => component(channel.values, group * count + c)));
      morphs.set(channel.node, { interpolation, times, values });
      minTime = Math.min(minTime, times[0]); maxTime = Math.max(maxTime, times[times.length - 1]);
      continue;
    }
    if (nodes[channel.node].matrix) { warn("USDZ_ANIMATED_MATRIX_UNSUPPORTED", path, "TRS animation on a matrix-authored node was omitted."); continue; }
    if (channel.path !== "translation" && channel.path !== "rotation" && channel.path !== "scale") { warn("USDZ_ANIMATION_PATH_UNSUPPORTED", path, "Animation path was omitted."); continue; }
    if (channel.interpolation && !["LINEAR", "STEP", "CUBICSPLINE"].includes(channel.interpolation)) { warn("USDZ_INTERPOLATION_UNSUPPORTED", path, `${channel.interpolation} interpolation is not represented by this exporter.`); continue; }
    if (channel.times.itemSize !== 1) fail(`${path}.times must be scalar`);
    const times = rows(channel.times, 1, `${path}.times`);
    const width = channel.path === "rotation" ? 4 : 3;
    const values = rows(channel.values, width, `${path}.values`, times.length * (channel.interpolation === "CUBICSPLINE" ? 3 : 1));
    if (channel.path === "rotation") {
      const cubic = channel.interpolation === "CUBICSPLINE";
      for (let i = 0; i < times.length; i++) {
        // Cubic tangents are derivatives, not unit quaternions. Only the
        // middle value of each in-tangent/value/out-tangent group is a key.
        const key = values[cubic ? i * 3 + 1 : i];
        if (Math.abs(Math.hypot(...key) - 1) > 1e-5) fail(`${path}.values[${i}] must be a unit quaternion`);
      }
    }
    for (let i = 0; i < times.length; i++) {
      const time = times[i][0];
      if (i && time <= times[i - 1][0]) fail(`${path}.times must be strictly increasing`);
    }
    if (!times.length) { warn("USDZ_EMPTY_ANIMATION", path, "Animation channel has no keyframes and was omitted."); continue; }
    const key = `${channel.node}:${channel.path}`;
    if (channels.has(key)) { warn("USDZ_DUPLICATE_ANIMATION_CHANNEL", path, "A previous channel already targets this node property."); continue; }
    const interpolation = channel.interpolation ?? "LINEAR";
    const scalarSpline = options.animationInterpolation === "native-spline" && channel.path !== "rotation" && interpolation !== "LINEAR";
    if (scalarSpline) splitKeys.add(key);
    curves.set(key, { interpolation, times: times.map(([time]) => time), values });
    const samples: AnimationSample[] = [];
    const addSample = (time: number, value: readonly number[]): void => {
      if (samples.length && time <= samples[samples.length - 1].time) return;
      samples.push({ time: finite(time, path), value: value.map((v) => finite(v, path)) });
    };
    if (scalarSpline) {
      // The original keys and tangents are emitted as scalar USD splines below.
    } else if (channel.interpolation === "STEP") {
      warn("USDZ_STEP_APPROXIMATED", path, "Step interpolation is approximated by a brief linear transition immediately before each keyframe.");
      times.forEach(([time], i) => {
        if (i > 0) addSample(time - Math.min(1e-7, (time - times[i - 1][0]) * 1e-6), values[i - 1]);
        addSample(time, values[i]);
      });
    } else if (channel.interpolation === "CUBICSPLINE") {
      warn("USDZ_CUBIC_APPROXIMATED", path, "Cubic spline interpolation is sampled at 16 points per segment for the USD timeline.");
      times.forEach(([time], i) => {
        addSample(time, values[i * 3 + 1]);
        if (i + 1 === times.length) return;
        const duration = times[i + 1][0] - time;
        for (let j = 1; j < 16; j++) {
          const t = j / 16, t2 = t * t, t3 = t2 * t;
          let v = values[i * 3 + 1].map((p, component) => (2 * t3 - 3 * t2 + 1) * p + (t3 - 2 * t2 + t) * duration * values[i * 3 + 2][component] + (-2 * t3 + 3 * t2) * values[(i + 1) * 3 + 1][component] + (t3 - t2) * duration * values[(i + 1) * 3][component]);
          if (channel.path === "rotation") {
            const length = Math.hypot(...v);
            if (!Number.isFinite(length) || length === 0) fail(`${path} produces an invalid rotation quaternion`);
            v = v.map((component) => component / length);
          }
          addSample(time + duration * t, v);
        }
      });
    } else times.forEach(([time], i) => addSample(time, values[i]));
    channels.set(key, samples);
    animatedKeys.add(key);
    minTime = Math.min(minTime, times[0][0]); maxTime = Math.max(maxTime, times[times.length - 1][0]);
   }
  }

  if (splitKeys.size) warn("USDZ_SPLINE_COMPATIBILITY", "animations", "Scalar spline curves require a USD consumer with spline support; some tools may drop them during stage flattening.");

  const metersPerUnit = scene.metersPerUnit ?? 1;
  if (!Number.isFinite(metersPerUnit) || metersPerUnit <= 0) fail("metersPerUnit must be a finite positive number");
  const upAxis = scene.upAxis ?? "Y";
  if (upAxis !== "Y" && upAxis !== "Z") fail("upAxis must be Y or Z");
  if (scene.metersPerUnit === undefined) warn("USDZ_UNIT_ASSUMED", "metersPerUnit", "Source units were unspecified; one unit was recorded as one metre.");
  if (scene.upAxis === undefined) warn("USDZ_UP_AXIS_ASSUMED", "upAxis", "Source up-axis was unspecified; Y-up was recorded.");
  if (rigs.size) warn("USDZ_SKEL_EXTENT_UNAUTHORED", "scene", "SkelRoot extent is not baked; consuming renderers must derive bounds for skinned and morphed geometry.");
  const out: string[] = ["#usda 1.0", "(", '    defaultPrim = "Scene"', `    metersPerUnit = ${number(metersPerUnit, "metersPerUnit")}`, `    upAxis = "${upAxis}"`];
  if (Number.isFinite(minTime)) out.push(`    startTimeCode = ${number(minTime, "animation start")}`, `    endTimeCode = ${number(maxTime, "animation end")}`, "    timeCodesPerSecond = 1");
  const multipleClips = clips.length > 1;
  if (multipleClips) warn("USDZ_ANIMATION_VARIANTS", "animations", "Animation clips are selectable through the Scene's Animation variant set; Clip_0 is selected by default and the stage time range spans all clips.");
  out.push(")", "", `def ${rigs.size ? "SkelRoot" : "Xform"} "Scene"`);
  if (multipleClips) out.push("(", "    variants = {", '        string Animation = "Clip_0"', "    }", '    prepend variantSets = "Animation"', ")");
  out.push("{");
  appendMetadata(out, "    ", scene.metadata, "metadata");
  if (clips[0]?.name !== undefined) out.push(`    custom string aura3d:animationName = ${string(clips[0].name)}`);
  // Preserve original keys, interpolation and cubic tangents in a custom USD
  // property. Generic USD players still see the documented baked samples.
  if (clips.length) {
    const sourceAttribute = (attr: AuraExportAttribute) => ({
      componentType: attr.values instanceof Float32Array ? "Float32Array" : attr.values instanceof Int8Array ? "Int8Array" : attr.values instanceof Uint8Array ? "Uint8Array" : attr.values instanceof Int16Array ? "Int16Array" : attr.values instanceof Uint16Array ? "Uint16Array" : attr.values instanceof Uint32Array ? "Uint32Array" : "Array",
      itemSize: attr.itemSize,
      normalized: attr.normalized ?? false,
      values: Array.from(attr.values)
    });
    const animationSource = clips.map((clip) => ({
      ...(clip.name === undefined ? {} : { name: clip.name }),
      channels: clip.channels.map((channel) => ({
        node: channel.node, path: channel.path, interpolation: channel.interpolation ?? "LINEAR",
        times: sourceAttribute(channel.times), values: sourceAttribute(channel.values)
      }))
    }));
    out.push(`    custom string aura3d:animationSource = ${json({ version: 1, clips: animationSource }, "animations")}`);
  }
  appendMaterials(out, materials, textureByName, scene.uvOrigin, warn);
  const appendRigSamples = (indent: string, rig: Rig, clipIndex: number): void => {
    const curves = clipCurves[clipIndex] ?? new Map<string, AnimationCurve>();
    const morphCurve = morphCurves[clipIndex]?.get(rig.nodeIndex);
    const ancestorSet = new Set<number>();
    const rootNodes = rig.joints.length ? rig.joints : [rig.nodeIndex];
    for (const joint of rootNodes) for (let p: number | undefined = joint; p !== undefined; p = parents.get(p)) ancestorSet.add(p);
    const selected = [...curves.entries()].filter(([key]) => ancestorSet.has(Number(key.split(":")[0])));
    if (!selected.length && !morphCurve) return;
    const relevant = [...selected.map(([, curve]) => curve), ...(morphCurve ? [morphCurve] : [])];
    const times = new Set<number>();
    for (const curve of relevant) {
      curve.times.forEach((time) => times.add(time));
      for (let i = 0; i + 1 < curve.times.length; i++) {
        const a = curve.times[i], b = curve.times[i+1], gap = b-a;
        if (curve.interpolation === "STEP") times.add(b - Math.min(1e-7, gap * 1e-6));
        else if (curve.interpolation === "CUBICSPLINE") for (let k = 1; k < 16; k++) times.add(a + gap * k/16);
      }
    }
    const keys = [...times].sort((a,b) => a-b);
    estimate(keys.length * (rig.jointTokens.length * 320 + rig.weights.length * 32 + 100));
    if (morphCurve && morphCurve.interpolation !== "LINEAR") warn(`USDZ_MORPH_${morphCurve.interpolation}_APPROXIMATED`, `animations[${clipIndex}].weights`, "UsdSkel blend weights use sampled linear interpolation; original curves are retained in custom metadata.");
    if (selected.some(([, curve]) => curve.interpolation !== "LINEAR")) warn("USDZ_SKIN_INTERPOLATION_APPROXIMATED", `animations[${clipIndex}]`, "UsdSkel joint arrays use sampled interpolation; original curves are retained in custom metadata.");
    if (selected.length && rig.joints.some((joint, i) => {
      const parent = parents.get(joint);
      return parent !== undefined && (rig.jointParents[i] < 0 || rig.joints[rig.jointParents[i]] !== parent);
    })) warn("USDZ_SKIN_HIERARCHY_SAMPLING", `animations[${clipIndex}]`, "Transforms from non-joint ancestors are composed into sampled joint-local values; interpolation between samples may differ.");
    const required = new Set<number>();
    for (const joint of rootNodes) for (let p: number | undefined = joint; p !== undefined; p = parents.get(p)) required.add(p);
    const ordered = [...visited].filter((index) => required.has(index));
    let poses: JointPose[][];
    try {
      poses = keys.map((time) => {
        const worlds = new Map<number, readonly number[]>();
        for (const nodeIndex of ordered) {
          const source = nodes[nodeIndex], values: Record<string, readonly number[]> = {};
          for (const property of ["translation", "rotation", "scale"] as const) {
            const curve = curves.get(`${nodeIndex}:${property}`);
            if (curve) values[property] = interpolateCurve(curve, time, property === "rotation");
          }
          const local = Object.keys(values).length ? nodeMatrix({ ...source, ...values, matrix: undefined }) : nodeMatrix(source);
          const parent = parents.get(nodeIndex);
          worlds.set(nodeIndex, multiplyMatrix(parent === undefined ? identityMatrix() : worlds.get(parent)!, local));
        }
        if (!rig.joints.length) return [decomposePose(worlds.get(rig.nodeIndex)!, `nodes[${rig.nodeIndex}] morph transform`)];
        return rig.joints.map((joint, i) => {
          const parent = rig.jointParents[i];
          const local = parent < 0 ? worlds.get(joint)! : multiplyMatrix(invertMatrix(worlds.get(rig.joints[parent])!, `skins[${rig.skinIndex}].joint`), worlds.get(joint)!);
          return decomposePose(local, `skins[${rig.skinIndex}].joint`);
        });
      });
    } catch (error) {
      warn("USDZ_SKIN_ANIMATION_UNSUPPORTED", `animations[${clipIndex}]`, `Joint animation cannot be represented as USD joint TRS: ${error instanceof Error ? error.message : String(error)}`);
      poses = [];
    }
    if (poses.length && selected.length) {
      out.push(`${indent}uniform token[] joints = ${array(rig.jointTokens, string)}`);
      for (const [property, type] of [["translation", "float3[] translations"], ["rotation", "quatf[] rotations"], ["scale", "half3[] scales"]] as const) {
        out.push(`${indent}${type}.timeSamples = {`);
        keys.forEach((time, i) => {
          const values = poses[i].map((pose) => property === "rotation" ? floatTuple([pose.rotation[3], ...pose.rotation.slice(0,3)], "joint rotation") : property === "scale" ? halfTuple(pose.scale, "joint scale") : floatTuple(pose.translation, "joint translation"));
          out.push(`${indent}    ${number(time, "animation time")}: [${values.join(", ")}]${i + 1 < keys.length ? "," : ""}`);
        });
        out.push(`${indent}}`);
      }
      warn("USDZ_SKIN_SCALE_PRECISION", `animations[${clipIndex}]`, "UsdSkel joint scale uses half precision and may lose source precision.");
    }
    if (morphCurve) {
      out.push(`${indent}float[] blendShapeWeights.timeSamples = {`);
      keys.forEach((time, i) => out.push(`${indent}    ${number(time, "morph time")}: ${array(interpolateCurve(morphCurve, time, false), (v) => floatNumber(v, "morph weight"))}${i + 1 < keys.length ? "," : ""}`));
      out.push(`${indent}}`);
    }
  };
  for (const [nodeIndex, rig] of rigs) {
    const animationName = `Rig_${nodeIndex}_Animation`;
    out.push(`    def SkelAnimation "${animationName}"`, "    {");
    if (rig.weights.length) {
      out.push(`        uniform token[] blendShapes = ${array(rig.weights.map((_, i) => `Node_${nodeIndex}_Morph_${i}`), string)}`);
      if (!(multipleClips && morphCurves.some((morphs) => morphs.has(nodeIndex)))) out.push(`        float[] blendShapeWeights = ${array(rig.weights, (weight) => floatNumber(weight, `nodes[${nodeIndex}].weights`))}`);
      else out.push("        float[] blendShapeWeights");
    }
    if (!multipleClips && clips.length) appendRigSamples("        ", rig, 0);
    out.push("    }");
    out.push(`    def Skeleton "Rig_${nodeIndex}" (`, '        prepend apiSchemas = ["SkelBindingAPI"]', "    )", "    {");
    if (rig.skinIndex !== undefined) {
      const skin = scene.skins![rig.skinIndex];
      appendSourceName(out, "        ", skin.name);
      if (skin.skeleton !== undefined) out.push(`        custom int aura3d:sourceSkeletonRoot = ${number(skin.skeleton, `skins[${rig.skinIndex}].skeleton`)}`);
      out.push(`        custom int[] aura3d:sourceJointOrder = ${array(skin.joints, String)}`);
    }
    out.push(`        uniform token[] joints = ${array(rig.jointTokens, string)}`);
    out.push(`        uniform matrix4d[] bindTransforms = ${array(rig.bind, (matrix) => matrixTuple(matrix, `nodes[${nodeIndex}].bind`))}`);
    out.push(`        uniform matrix4d[] restTransforms = ${array(rig.rest, (matrix) => matrixTuple(matrix, `nodes[${nodeIndex}].rest`))}`);
    out.push(`        rel skel:animationSource = </Scene/${animationName}>`, "    }");
  }

  const ops = [["translation", "translate", "double3"], ["rotation", "orient", "quatf"], ["scale", "scale", "float3"]] as const;
  const components = ["X", "Y", "Z"] as const;
  const defaultNumbers = (node: AuraExportNode, source: typeof ops[number][0]): readonly number[] =>
    source === "translation" ? node.translation ?? [0, 0, 0] : source === "rotation" ? node.rotation ?? [0, 0, 0, 1] : node.scale ?? [1, 1, 1];
  const defaultValue = (node: AuraExportNode, source: typeof ops[number][0], path: string): string => {
    const value = defaultNumbers(node, source);
    return source === "rotation" ? floatTuple([value[3], ...value.slice(0, 3)], path) : source === "scale" ? floatTuple(value, path) : tuple(value, path);
  };
  const emitSamples = (indent: string, index: number, source: typeof ops[number][0], target: string, type: string, samples: readonly AnimationSample[] | undefined): void => {
    if (!samples) return;
    const path = `nodes[${index}]`;
    out.push(`${indent}${type} xformOp:${target}.timeSamples = {`);
    samples.forEach((sample, i) => out.push(`${indent}    ${number(sample.time, path)}: ${source === "rotation" ? floatTuple([sample.value[3], ...sample.value.slice(0, 3)], path) : source === "scale" ? floatTuple(sample.value, path) : tuple(sample.value, path)}${i + 1 < samples.length ? "," : ""}`));
    out.push(`${indent}}`);
  };
  const emitScalarCurve = (indent: string, index: number, source: "translation" | "scale", target: string, componentIndex: number, curve: AnimationCurve | undefined): void => {
    if (!curve) return;
    const path = `nodes[${index}]`, type = source === "translation" ? "double" : "float";
    if (curve.interpolation === "LINEAR") {
      out.push(`${indent}${type} xformOp:${target}.timeSamples = {`);
      curve.times.forEach((time, i) => out.push(`${indent}    ${number(time, path)}: ${source === "scale" ? floatNumber(curve.values[i][componentIndex], path) : number(curve.values[i][componentIndex], path)}${i + 1 < curve.times.length ? "," : ""}`));
    } else {
      out.push(`${indent}${type} xformOp:${target}.spline = {`);
      if (curve.interpolation === "CUBICSPLINE") out.push(`${indent}    hermite,`);
      curve.times.forEach((time, i) => {
        const value = curve.values[curve.interpolation === "CUBICSPLINE" ? i * 3 + 1 : i][componentIndex];
        const component = (v: number): string => source === "scale" ? floatNumber(v, path) : number(v, path);
        const expression = curve.interpolation === "STEP" ? "post held" : `pre (${component(curve.values[i * 3][componentIndex])}); post curve (${component(curve.values[i * 3 + 2][componentIndex])})`;
        out.push(`${indent}    ${number(time, path)}: ${component(value)}; ${expression},`);
      });
    }
    out.push(`${indent}}`);
  };

  const emitNode = (index: number, indent: string): void => {
    abort(options.signal);
    const node: AuraExportNode = nodes[index];
    const path = `nodes[${index}]`;
    out.push(`${indent}def Xform "Node_${index}"`, `${indent}{`);
    const inner = indent + "    ";
    appendSourceName(out, inner, node.name);
    appendMetadata(out, inner, node.metadata, `${path}.metadata`);
    if (node.skin !== undefined && !rigs.has(index)) warn("USDZ_SKIN_UNSUPPORTED", `${path}.skin`, "Skin deformation was omitted; the base mesh was exported.");
    if (node.weights?.length && !rigs.has(index)) warn("USDZ_MORPH_WEIGHTS_UNSUPPORTED", `${path}.weights`, "Node morph weights were omitted.");
    if (node.matrix) {
      const m = node.matrix;
      out.push(`${inner}matrix4d xformOp:transform = (${tuple(m.slice(0, 4), path)}, ${tuple(m.slice(4, 8), path)}, ${tuple(m.slice(8, 12), path)}, ${tuple(m.slice(12, 16), path)})`, `${inner}uniform token[] xformOpOrder = ["xformOp:transform"]`);
    } else {
      const xformOrder: string[] = [];
      for (const [source, target, type] of ops) {
        const inVariant = multipleClips && animatedKeys.has(`${index}:${source}`);
        if (source !== "rotation" && splitKeys.has(`${index}:${source}`)) {
          const scalarType = source === "translation" ? "double" : "float";
          components.forEach((component, c) => {
            const op = `${target}${component}`;
            xformOrder.push(`xformOp:${op}`);
            out.push(`${inner}${scalarType} xformOp:${op}${inVariant ? "" : ` = ${source === "scale" ? floatNumber(defaultNumbers(node, source)[c], path) : number(defaultNumbers(node, source)[c], path)}`}`);
            if (!multipleClips) emitScalarCurve(inner, index, source, op, c, clipCurves[0]?.get(`${index}:${source}`));
          });
        } else {
          xformOrder.push(`xformOp:${target}`);
          out.push(`${inner}${type} xformOp:${target}${inVariant ? "" : ` = ${defaultValue(node, source, path)}`}`);
          if (!multipleClips) emitSamples(inner, index, source, target, type, clipChannels[0]?.get(`${index}:${source}`));
        }
      }
      out.push(`${inner}uniform token[] xformOpOrder = ${array(xformOrder, string)}`);
    }
    if (node.camera !== undefined) emitCamera(out, scene.cameras![node.camera], node.camera, inner, warn);
    if (node.light !== undefined) emitLight(out, scene.lights![node.light], node.light, inner, warn);
    if (node.mesh !== undefined) {
      const mesh = meshes[node.mesh];
      if (mesh.weights?.length && !rigs.has(index)) warn("USDZ_MORPH_WEIGHTS_UNSUPPORTED", `meshes[${node.mesh}].weights`, "Mesh morph weights were omitted.");
      mesh.primitives.forEach((primitive, primitiveIndex) => {
        emitMesh(out, primitive, primitiveIndex, inner, `${path}.mesh.primitives[${primitiveIndex}]`, scene, materials, warn, mesh.name, rigs.get(index), paths.get(index)!);
      });
    }
    for (const child of node.children ?? []) emitNode(child, inner);
    out.push(`${indent}}`);
  };
  for (const root of scene.roots) emitNode(root, "    ");
  if (multipleClips) {
    const affected = new Set<number>();
    const markAffected = (index: number): boolean => {
      let active = ops.some(([source]) => animatedKeys.has(`${index}:${source}`));
      for (const child of nodes[index].children ?? []) if (markAffected(child)) active = true;
      if (active) affected.add(index);
      return active;
    };
    for (const root of scene.roots) markAffected(root);
    out.push('    variantSet "Animation" = {');
    for (const [clipIndex, channels] of clipChannels.entries()) {
      out.push(`        "Clip_${clipIndex}" {`);
      for (const [nodeIndex, rig] of rigs) {
        out.push(`            over "Rig_${nodeIndex}_Animation"`, "            {");
        if (rig.weights.length && morphCurves.some((morphs) => morphs.has(nodeIndex))) out.push(`                float[] blendShapeWeights = ${array(rig.weights, (weight) => floatNumber(weight, `nodes[${nodeIndex}].weights`))}`);
        appendRigSamples("                ", rig, clipIndex);
        out.push("            }");
      }
      const emitOverride = (index: number, indent: string): void => {
        if (!affected.has(index)) return;
        const node = nodes[index], path = `nodes[${index}]`, inner = indent + "    ";
        out.push(`${indent}over "Node_${index}"`, `${indent}{`);
        for (const [source, target, type] of ops) if (animatedKeys.has(`${index}:${source}`)) {
          if (source !== "rotation" && splitKeys.has(`${index}:${source}`)) {
            const scalarType = source === "translation" ? "double" : "float";
            components.forEach((component, c) => {
              const op = `${target}${component}`;
              out.push(`${inner}${scalarType} xformOp:${op} = ${source === "scale" ? floatNumber(defaultNumbers(node, source)[c], path) : number(defaultNumbers(node, source)[c], path)}`);
              emitScalarCurve(inner, index, source, op, c, clipCurves[clipIndex].get(`${index}:${source}`));
            });
          } else {
            out.push(`${inner}${type} xformOp:${target} = ${defaultValue(node, source, path)}`);
            emitSamples(inner, index, source, target, type, channels.get(`${index}:${source}`));
          }
        }
        for (const child of node.children ?? []) emitOverride(child, inner);
        out.push(`${indent}}`);
      };
      for (const root of scene.roots) emitOverride(root, "            ");
      out.push("        }");
    }
    out.push("    }");
  }
  out.push("}", "");
  const stage = encoder.encode(out.join("\n"));
  payloadBytes += stage.byteLength;
  if (payloadBytes > maxBytes) fail("uncompressed stage and dependencies exceed maxBytes");
  const files = [{ name: "scene.usda", data: stage }, ...Array.from(usedTextures, (name) => textureByName.get(name)!).map(({ archiveName, data }) => ({ name: archiveName, data }))];
  const data = zipStored(files, maxBytes, options.signal);
  return { data, mimeType: "model/vnd.usdz+zip", warnings, dependencies: [] };
}

function appendMaterials(
  out: string[],
  materials: readonly AuraExportMaterial[],
  textures: ReadonlyMap<string, Texture>,
  uvOrigin: AuraExportScene["uvOrigin"],
  warn: (code: string, path: string, message: string) => void
): void {
  if (!materials.length) return;
  out.push('    def Scope "Materials"', "    {");
  materials.forEach((material, index) => {
    const path = `materials[${index}]`, color = material.baseColor ?? [1, 1, 1, 1], emissive = material.emissive ?? [0, 0, 0];
    checkVector(color, 4, `${path}.baseColor`);
    checkVector(emissive, 3, `${path}.emissive`);
    const metallic = finite(material.metallic ?? 1, path), roughness = finite(material.roughness ?? 1, path);
    finite(material.normalTextureScale ?? 1, path);
    const occlusion = finite(material.occlusionStrength ?? 1, path);
    if (occlusion < 0 || occlusion > 1) fail(`${path} has invalid occlusion strength`);
    const getTexture = (name: string | undefined): Texture | undefined => name === undefined ? undefined : textures.get(name);
    const baseTexture = getTexture(material.baseColorTexture), mrTexture = getTexture(material.metallicRoughnessTexture);
    const normalTexture = getTexture(material.normalTexture), aoTexture = getTexture(material.occlusionTexture), emissiveTexture = getTexture(material.emissiveTexture);
    const prefix = `/Scene/Materials/Material_${index}`;
    out.push(`        def Material "Material_${index}"`, "        {");
    appendSourceName(out, "            ", material.name);
    appendMetadata(out, "            ", material.metadata, `${path}.metadata`);
    if (material.unlit) out.push("            custom bool aura3d:unlit = true");
    if (material.normalTextureScale !== undefined) out.push(`            custom float aura3d:normalTextureScale = ${floatNumber(material.normalTextureScale, path)}`);
    if (material.occlusionStrength !== undefined) out.push(`            custom float aura3d:occlusionStrength = ${floatNumber(material.occlusionStrength, path)}`);
    out.push(`            token outputs:surface.connect = <${prefix}/Surface.outputs:surface>`, '            def Shader "Surface"', "            {", '                uniform token info:id = "UsdPreviewSurface"');
    if (baseTexture) out.push(`                color3f inputs:diffuseColor.connect = <${prefix}/BaseColorTexture.outputs:rgb>`);
    else out.push(`                color3f inputs:diffuseColor = ${floatTuple(color.slice(0, 3), path)}`);
    if (mrTexture) out.push(`                float inputs:metallic.connect = <${prefix}/MetallicRoughnessTexture.outputs:b>`, `                float inputs:roughness.connect = <${prefix}/MetallicRoughnessTexture.outputs:g>`);
    else out.push(`                float inputs:metallic = ${floatNumber(metallic, path)}`, `                float inputs:roughness = ${floatNumber(roughness, path)}`);
    if (normalTexture) out.push(`                normal3f inputs:normal.connect = <${prefix}/NormalTexture.outputs:rgb>`);
    if (aoTexture) out.push(`                float inputs:occlusion.connect = <${prefix}/OcclusionTexture.outputs:r>`);
    if (emissiveTexture) out.push(`                color3f inputs:emissiveColor.connect = <${prefix}/EmissiveTexture.outputs:rgb>`);
    else out.push(`                color3f inputs:emissiveColor = ${floatTuple(emissive, path)}`);
    if (material.alphaMode === "BLEND" || material.alphaMode === "MASK") {
      if (baseTexture) out.push(`                float inputs:opacity.connect = <${prefix}/BaseColorTexture.outputs:a>`);
      else out.push(`                float inputs:opacity = ${floatNumber(color[3], path)}`);
      if (material.alphaMode === "MASK") out.push(`                float inputs:opacityThreshold = ${floatNumber(material.alphaCutoff ?? 0.5, path)}`);
    } else if (material.alphaMode && material.alphaMode !== "OPAQUE") warn("USDZ_ALPHA_MODE_UNSUPPORTED", `${path}.alphaMode`, `Alpha mode ${material.alphaMode} was omitted.`);
    out.push("                token outputs:surface", "            }");
    if (baseTexture || mrTexture || normalTexture || aoTexture || emissiveTexture) {
      out.push('            def Shader "Primvar"', "            {", '                uniform token info:id = "UsdPrimvarReader_float2"', '                string inputs:varname = "st"', "                float2 outputs:result", "            }");
    }
    const emitTexture = (name: string, texture: Texture | undefined, colorSpace: "sRGB" | "raw", scale: readonly number[], bias: readonly number[], outputs: readonly string[]): void => {
      if (!texture) return;
      out.push(`            def Shader "${name}"`, "            {", '                uniform token info:id = "UsdUVTexture"', `                asset inputs:file = @${texture.archiveName}@`, `                token inputs:sourceColorSpace = "${colorSpace}"`, `                float2 inputs:st.connect = <${prefix}/Primvar.outputs:result>`, `                float4 inputs:scale = ${floatTuple(scale, path)}`, `                float4 inputs:bias = ${floatTuple(bias, path)}`);
      for (const output of outputs) out.push(`                ${output === "rgb" ? "float3" : "float"} outputs:${output}`);
      out.push("            }");
    };
    emitTexture("BaseColorTexture", baseTexture, "sRGB", color, [0, 0, 0, 0], ["rgb", "a"]);
    emitTexture("MetallicRoughnessTexture", mrTexture, "raw", [1, roughness, metallic, 1], [0, 0, 0, 0], ["g", "b"]);
    // Flipping V also reverses the derived bitangent. Flip the sampled normal's
    // Y component to keep its direction in the original tangent frame.
    const normalScale = material.normalTextureScale ?? 1;
    const normalYSign = uvOrigin === "top-left" ? -1 : 1;
    emitTexture("NormalTexture", normalTexture, "raw", [2 * normalScale, 2 * normalScale * normalYSign, 2, 1], [-normalScale, -normalScale * normalYSign, -1, 0], ["rgb"]);
    emitTexture("OcclusionTexture", aoTexture, "raw", [occlusion, 1, 1, 1], [1 - occlusion, 0, 0, 0], ["r"]);
    emitTexture("EmissiveTexture", emissiveTexture, "sRGB", [...emissive, 1], [0, 0, 0, 0], ["rgb"]);
    out.push("        }");
  });
  out.push("    }");
}

function emitCamera(
  out: string[], camera: AuraExportCamera, index: number, indent: string,
  warn: (code: string, path: string, message: string) => void
): void {
  const path = `cameras[${index}]`;
  out.push(`${indent}def Camera "Camera_${index}"`, `${indent}{`);
  const inner = indent + "    ";
  appendSourceName(out, inner, camera.name);
  const sourceCamera = {
    type: camera.type,
    ...(camera.name === undefined ? {} : { name: camera.name }),
    ...(camera.perspective === undefined ? {} : { perspective: {
      yfov: camera.perspective.yfov, znear: camera.perspective.znear,
      ...(camera.perspective.zfar === undefined ? {} : { zfar: camera.perspective.zfar }),
      ...(camera.perspective.aspectRatio === undefined ? {} : { aspectRatio: camera.perspective.aspectRatio })
    } }),
    ...(camera.orthographic === undefined ? {} : { orthographic: camera.orthographic })
  };
  out.push(`${inner}custom string aura3d:sourceCamera = ${json(sourceCamera, path)}`);
  if (camera.type === "perspective") {
    const p = camera.perspective;
    if (!p || !Number.isFinite(p.yfov) || p.yfov <= 0 || p.yfov >= Math.PI || !Number.isFinite(p.znear) || p.znear <= 0) fail(`${path} has invalid perspective parameters`);
    const aspect = p.aspectRatio ?? 1;
    if (!Number.isFinite(aspect) || aspect <= 0) fail(`${path}.perspective.aspectRatio must be positive`);
    const far = p.zfar ?? 1e9;
    if (!Number.isFinite(far) || far <= p.znear) fail(`${path}.perspective.zfar must exceed znear`);
    if (p.aspectRatio === undefined) warn("USDZ_CAMERA_ASPECT_ASSUMED", path, "Viewport-dependent aspect ratio was exported as 1:1; original camera parameters are retained in custom metadata.");
    if (p.zfar === undefined) warn("USDZ_CAMERA_FAR_APPROXIMATED", path, "Infinite far clip was exported as 1e9 units; original camera parameters are retained in custom metadata.");
    const verticalAperture = 20.955;
    out.push(`${inner}uniform token projection = "perspective"`, `${inner}float verticalAperture = ${verticalAperture}`, `${inner}float horizontalAperture = ${floatNumber(verticalAperture * aspect, path)}`, `${inner}float focalLength = ${floatNumber(verticalAperture / (2 * Math.tan(p.yfov / 2)), path)}`, `${inner}float2 clippingRange = ${floatTuple([p.znear, far], path)}`);
  } else if (camera.type === "orthographic") {
    const p = camera.orthographic;
    if (!p || !Number.isFinite(p.xmag) || p.xmag <= 0 || !Number.isFinite(p.ymag) || p.ymag <= 0 || !Number.isFinite(p.znear) || p.znear < 0 || !Number.isFinite(p.zfar) || p.zfar <= p.znear) fail(`${path} has invalid orthographic parameters`);
    out.push(`${inner}uniform token projection = "orthographic"`, `${inner}float horizontalAperture = ${floatNumber(p.xmag * 20, path)}`, `${inner}float verticalAperture = ${floatNumber(p.ymag * 20, path)}`, `${inner}float2 clippingRange = ${floatTuple([p.znear, p.zfar], path)}`);
  } else fail(`${path}.type is unsupported`);
  out.push(`${indent}}`);
}

function emitLight(
  out: string[], light: AuraExportLight, index: number, indent: string,
  warn: (code: string, path: string, message: string) => void
): void {
  const path = `lights[${index}]`;
  const color = light.color ?? [1, 1, 1];
  checkVector(color, 3, `${path}.color`);
  if (color.some((v) => v < 0)) fail(`${path}.color must be nonnegative`);
  const intensity = light.intensity ?? 1;
  if (!Number.isFinite(intensity) || intensity < 0) fail(`${path}.intensity must be finite and nonnegative`);
  if (light.range !== undefined && (!Number.isFinite(light.range) || light.range <= 0)) fail(`${path}.range must be positive`);
  if (light.type !== "directional" && light.type !== "point" && light.type !== "spot") fail(`${path}.type is unsupported`);
  const type = light.type === "directional" ? "DistantLight" : "SphereLight";
  out.push(`${indent}def ${type} "Light_${index}"${light.type === "spot" ? ' (\n' + indent + '    prepend apiSchemas = ["ShapingAPI"]\n' + indent + ')' : ""}`, `${indent}{`);
  const inner = indent + "    ";
  appendSourceName(out, inner, light.name);
  const sourceLight = {
    type: light.type,
    ...(light.name === undefined ? {} : { name: light.name }),
    ...(light.color === undefined ? {} : { color: light.color }),
    ...(light.intensity === undefined ? {} : { intensity: light.intensity }),
    ...(light.range === undefined ? {} : { range: light.range }),
    ...(light.spot === undefined ? {} : { spot: {
      ...(light.spot.innerConeAngle === undefined ? {} : { innerConeAngle: light.spot.innerConeAngle }),
      ...(light.spot.outerConeAngle === undefined ? {} : { outerConeAngle: light.spot.outerConeAngle })
    } })
  };
  out.push(`${inner}custom string aura3d:sourceLight = ${json(sourceLight, path)}`, `${inner}color3f inputs:color = ${floatTuple(color, path)}`, `${inner}float inputs:intensity = ${floatNumber(intensity, path)}`);
  if (light.type !== "directional") out.push(`${inner}float inputs:radius = 0.01`, `${inner}bool inputs:normalize = true`, `${inner}bool treatAsPoint = true`);
  if (light.type === "spot") {
    const outer = light.spot?.outerConeAngle ?? Math.PI / 4;
    const innerAngle = light.spot?.innerConeAngle ?? 0;
    if (!Number.isFinite(outer) || outer <= 0 || outer > Math.PI / 2 || !Number.isFinite(innerAngle) || innerAngle < 0 || innerAngle > outer) fail(`${path}.spot contains invalid cone angles`);
    out.push(`${inner}float inputs:shaping:cone:angle = ${number(outer * 180 / Math.PI, path)}`, `${inner}float inputs:shaping:cone:softness = ${number(1 - innerAngle / outer, path)}`);
    warn("USDZ_SPOT_FALLOFF_APPROXIMATED", path, "The source inner and outer cone profile was mapped to USD cone softness; original angles are retained in custom metadata.");
  }
  warn("USDZ_LIGHT_INTENSITY_APPROXIMATED", path, "The source photometric intensity was mapped numerically to USD light intensity; radiometric calibration and emitter size can differ.");
  if (light.range !== undefined) warn("USDZ_LIGHT_RANGE_UNSUPPORTED", `${path}.range`, "The finite light cutoff has no equivalent in this USD light and is retained only in custom metadata.");
  out.push(`${indent}}`);
}

function emitMesh(
  out: string[], primitive: AuraExportPrimitive, primitiveIndex: number, indent: string, path: string,
  scene: AuraExportScene, materials: readonly AuraExportMaterial[],
  warn: (code: string, path: string, message: string) => void,
  meshName?: string, rig?: Rig, nodePath?: string
): void {
  const attrs = primitive.attributes;
  const position = attrs.POSITION;
  if (!position) fail(`${path} is missing POSITION`);
  const points = rows(position, 3, `${path}.attributes.POSITION`);
  const indices = primitive.indices ? Array.from(primitive.indices) : Array.from({ length: points.length }, (_, i) => i);
  for (const [i, index] of indices.entries()) if (!Number.isInteger(index) || index < 0 || index >= points.length) fail(`${path}.indices[${i}] is out of range`);
  const mode = primitive.mode ?? "triangles";
  if (mode !== "triangles" && mode !== "lines" && mode !== "points") fail(`${path}.mode is unsupported`);
  if (mode === "triangles" && indices.length % 3) fail(`${path} triangle index count must be divisible by 3`);
  if (mode === "lines" && indices.length % 2) fail(`${path} line index count must be divisible by 2`);
  if (primitive.material !== undefined && (!Number.isInteger(primitive.material) || !materials[primitive.material])) fail(`${path}.material is invalid`);
  let binding = rig;
  let jointRows: number[][] | undefined, weightRows: number[][] | undefined;
  if (rig?.skinIndex !== undefined) {
    const sets = Object.keys(attrs).filter((name) => /^JOINTS_\d+$/.test(name)).map((name) => Number(name.slice(7))).sort((a, b) => a - b);
    const weightSets = Object.keys(attrs).filter((name) => /^WEIGHTS_\d+$/.test(name)).map((name) => Number(name.slice(8))).sort((a, b) => a - b);
    if (!sets.length || sets.length !== weightSets.length || sets.some((set, i) => set !== i || weightSets[i] !== set) || sets.length > 16) {
      warn("USDZ_SKIN_INFLUENCES_UNSUPPORTED", path, "Skinning requires matching sequential JOINTS_n and WEIGHTS_n sets, with at most 64 influences; this primitive was not skinned.");
      binding = undefined;
    } else {
      jointRows = Array.from({ length: points.length }, () => []);
      weightRows = Array.from({ length: points.length }, () => []);
      for (const set of sets) {
        const jointAttr = attrs[`JOINTS_${set}`], weightAttr = attrs[`WEIGHTS_${set}`];
        if (jointAttr.normalized) fail(`${path}.attributes.JOINTS_${set} cannot be normalized`);
        const js = rows(jointAttr, 4, `${path}.attributes.JOINTS_${set}`, points.length);
        const ws = rows(weightAttr, 4, `${path}.attributes.WEIGHTS_${set}`, points.length);
        for (let i = 0; i < points.length; i++) for (let c = 0; c < 4; c++) {
          const joint = js[i][c], weight = ws[i][c];
          if (!Number.isInteger(joint) || joint < 0 || joint >= rig.sourceJointToRig.length || weight < 0) fail(`${path} has an invalid joint index or weight`);
          jointRows[i].push(rig.sourceJointToRig[joint]);
          weightRows[i].push(weight);
        }
      }
      if (weightRows.some((row) => Math.abs(row.reduce((sum, weight) => sum + weight, 0) - 1) > 1e-4)) warn("USDZ_SKIN_WEIGHTS_NOT_NORMALIZED", path, "Source joint weights do not sum to one; renderer normalization may change deformation.");
    }
  } else if (rig) {
    jointRows = Array.from({ length: points.length }, () => [0]);
    weightRows = Array.from({ length: points.length }, () => [1]);
  }
  if (primitive.targets?.length && !binding) warn("USDZ_MORPH_TARGETS_UNSUPPORTED", `${path}.targets`, "Morph targets could not be bound; the base geometry was exported.");
  for (const [name, attr] of Object.entries(attrs)) {
    if (!["POSITION", "NORMAL", "TEXCOORD_0", "COLOR_0"].includes(name) && !(binding?.skinIndex !== undefined && /^(JOINTS|WEIGHTS)_\d+$/.test(name))) {
      warn("USDZ_ATTRIBUTE_UNSUPPORTED", `${path}.attributes.${name}`, `Vertex attribute ${name} was omitted.`);
    } else if (!name.startsWith("JOINTS_") && !(attr.values instanceof Float32Array) && !Array.isArray(attr.values)) {
      warn("USDZ_QUANTIZATION_EXPANDED", `${path}.attributes.${name}`, "Integer attribute was expanded to USD floating-point values.");
    } else if (!name.startsWith("JOINTS_") && Array.isArray(attr.values) && attr.values.some((value) => Math.fround(value) !== value)) {
      warn("USDZ_FLOAT_PRECISION", `${path}.attributes.${name}`, "Double-precision attribute values are rounded to USD float32.");
    }
  }
  const normal = attrs.NORMAL ? rows(attrs.NORMAL, 3, `${path}.attributes.NORMAL`, points.length) : undefined;
  const uv = attrs.TEXCOORD_0 ? rows(attrs.TEXCOORD_0, 2, `${path}.attributes.TEXCOORD_0`, points.length) : undefined;
  if (uv && scene.uvOrigin === "top-left") uv.forEach((row) => { row[1] = 1 - row[1]; });
  const colorAttr = attrs.COLOR_0;
  let colors: number[][] | undefined;
  if (colorAttr) {
    if (colorAttr.itemSize !== 3 && colorAttr.itemSize !== 4) fail(`${path}.attributes.COLOR_0 must have 3 or 4 components`);
    colors = rows(colorAttr, colorAttr.itemSize, `${path}.attributes.COLOR_0`, points.length);
    if (primitive.material !== undefined) warn("USDZ_VERTEX_COLOR_MATERIAL", `${path}.attributes.COLOR_0`, "Vertex colors are preserved as display primvars; a bound material may override them.");
  }
  const flatten = mode !== "triangles";
  if (flatten && primitive.indices) warn("USDZ_INDEX_EXPANDED", `${path}.indices`, "Indexed line or point vertices were expanded to USD's linear point order.");
  const selected = (source: number[][]): number[][] => flatten ? indices.map((i) => source[i]) : source;
  const type = mode === "triangles" ? "Mesh" : mode === "lines" ? "BasisCurves" : "Points";
  const schemas = [...(primitive.material === undefined ? [] : ["MaterialBindingAPI"]), ...(binding ? ["SkelBindingAPI"] : [])];
  out.push(`${indent}def ${type} "Primitive_${primitiveIndex}"${schemas.length ? ` (\n${indent}    prepend apiSchemas = ${array(schemas, string)}\n${indent})` : ""}`, `${indent}{`);
  const inner = indent + "    ";
  if (meshName !== undefined) out.push(`${inner}custom string aura3d:sourceMeshName = ${string(meshName)}`);
  out.push(`${inner}point3f[] points = ${array(selected(points), (point) => floatTuple(point, `${path}.attributes.POSITION`))}`);
  if (mode === "triangles") {
    out.push(`${inner}int[] faceVertexCounts = ${array(Array.from({ length: indices.length / 3 }, () => 3), String)}`, `${inner}int[] faceVertexIndices = ${array(indices, String)}`, `${inner}uniform token subdivisionScheme = "none"`);
  } else if (mode === "lines") {
    out.push(`${inner}uniform token type = "linear"`, `${inner}uniform token wrap = "nonperiodic"`, `${inner}int[] curveVertexCounts = ${array(Array.from({ length: indices.length / 2 }, () => 2), String)}`);
  }
  if (normal) out.push(`${inner}normal3f[] normals = ${array(selected(normal), (n) => floatTuple(n, `${path}.attributes.NORMAL`))} (`, `${inner}    interpolation = "vertex"`, `${inner})`);
  if (uv) out.push(`${inner}texCoord2f[] primvars:st = ${array(selected(uv), (v) => floatTuple(v, `${path}.attributes.TEXCOORD_0`))} (`, `${inner}    interpolation = "vertex"`, `${inner})`);
  if (colors) {
    out.push(`${inner}color3f[] primvars:displayColor = ${array(selected(colors), (v) => floatTuple(v.slice(0, 3), `${path}.attributes.COLOR_0`))} (`, `${inner}    interpolation = "vertex"`, `${inner})`);
    if (colorAttr.itemSize === 4) out.push(`${inner}float[] primvars:displayOpacity = ${array(selected(colors), (v) => floatNumber(v[3], `${path}.attributes.COLOR_0`))} (`, `${inner}    interpolation = "vertex"`, `${inner})`);
  }
  if (primitive.material !== undefined) {
    const material = materials[primitive.material];
    if (!uv && (material.baseColorTexture || material.metallicRoughnessTexture || material.normalTexture || material.occlusionTexture || material.emissiveTexture)) warn("USDZ_TEXTURE_COORDINATES_MISSING", `${path}.attributes.TEXCOORD_0`, "Bound material textures have no TEXCOORD_0 coordinates.");
    out.push(`${inner}rel material:binding = </Scene/Materials/Material_${primitive.material}>`);
    if (materials[primitive.material].doubleSided) out.push(`${inner}uniform bool doubleSided = true`);
  }
  if (binding && jointRows && weightRows) {
    const influenceCount = jointRows[0]?.length ?? (binding.skinIndex === undefined ? 1 : 4);
    out.push(`${inner}rel skel:skeleton = </Scene/Rig_${binding.nodeIndex}>`);
    out.push(`${inner}matrix4d primvars:skel:geomBindTransform = ${matrixTuple(identityMatrix(), path)}`);
    out.push(`${inner}int[] primvars:skel:jointIndices = ${array(selected(jointRows).flat(), String)} (`, `${inner}    elementSize = ${influenceCount}`, `${inner}    interpolation = "vertex"`, `${inner})`);
    out.push(`${inner}float[] primvars:skel:jointWeights = ${array(selected(weightRows).flat(), (v) => floatNumber(v, `${path}.attributes.WEIGHTS`))} (`, `${inner}    elementSize = ${influenceCount}`, `${inner}    interpolation = "vertex"`, `${inner})`);
    if (primitive.targets?.length) {
      const targetTokens = primitive.targets.map((_, i) => `Node_${binding!.nodeIndex}_Morph_${i}`);
      const targetPaths = primitive.targets.map((_, i) => `<${nodePath}/Primitive_${primitiveIndex}/Shape_${i}>`);
      out.push(`${inner}uniform token[] skel:blendShapes = ${array(targetTokens, string)}`, `${inner}rel skel:blendShapeTargets = [${targetPaths.join(", ")}]`);
      primitive.targets.forEach((target, targetIndex) => {
        for (const name of Object.keys(target)) if (name !== "POSITION" && name !== "NORMAL") warn("USDZ_MORPH_ATTRIBUTE_UNSUPPORTED", `${path}.targets[${targetIndex}].${name}`, `Morph attribute ${name} was omitted.`);
        for (const name of ["POSITION", "NORMAL"] as const) {
          const attr = target[name];
          if (attr && !(attr.values instanceof Float32Array) && !Array.isArray(attr.values)) warn("USDZ_QUANTIZATION_EXPANDED", `${path}.targets[${targetIndex}].${name}`, "Integer morph attribute was expanded to USD floating-point values.");
          else if (attr && Array.isArray(attr.values) && attr.values.some((value) => Math.fround(value) !== value)) warn("USDZ_FLOAT_PRECISION", `${path}.targets[${targetIndex}].${name}`, "Double-precision morph values are rounded to USD float32.");
        }
        const offsets = target.POSITION ? rows(target.POSITION, 3, `${path}.targets[${targetIndex}].POSITION`, points.length) : points.map(() => [0, 0, 0]);
        const normalOffsets = target.NORMAL ? rows(target.NORMAL, 3, `${path}.targets[${targetIndex}].NORMAL`, points.length) : undefined;
        out.push(`${inner}def BlendShape "Shape_${targetIndex}"`, `${inner}{`, `${inner}    uniform vector3f[] offsets = ${array(selected(offsets), (offset) => floatTuple(offset, `${path}.targets[${targetIndex}].POSITION`))}`);
        if (normalOffsets) out.push(`${inner}    uniform vector3f[] normalOffsets = ${array(selected(normalOffsets), (offset) => floatTuple(offset, `${path}.targets[${targetIndex}].NORMAL`))}`);
        out.push(`${inner}}`);
      });
    }
  }
  out.push(`${indent}}`);
}

interface ZipEntry { readonly name: string; readonly data: Uint8Array }
const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let value = n;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
    table[n] = value >>> 0;
  }
  return table;
})();
function crc32(bytes: Uint8Array, signal?: AbortSignal): number {
  let value = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    if ((i & 0xfffff) === 0) abort(signal);
    value = (value >>> 8) ^ crcTable[(value ^ bytes[i]) & 255];
  }
  return (value ^ 0xffffffff) >>> 0;
}
function zipStored(files: readonly ZipEntry[], maxBytes: number, signal?: AbortSignal): Uint8Array {
  if (files.length > 0xffff) fail("too many archive entries");
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    abort(signal);
    const name = encoder.encode(file.name);
    if (name.length > 0xffff || file.data.length > MAX_ZIP32) fail("ZIP32 entry limit exceeded");
    // USDZ requires every member's data to start at a 64-byte boundary. The
    // private ZIP extra field has a four-byte header and enough padding.
    let extraLength = (64 - ((offset + 30 + name.length) % 64)) % 64;
    if (extraLength > 0 && extraLength < 4) extraLength += 64;
    const local = new Uint8Array(30 + name.length + extraLength);
    const l = new DataView(local.buffer);
    const checksum = crc32(file.data, signal);
    l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, 0x0800, true);
    l.setUint16(10, 0, true); l.setUint16(12, 0x21, true);
    l.setUint32(14, checksum, true); l.setUint32(18, file.data.length, true); l.setUint32(22, file.data.length, true);
    l.setUint16(26, name.length, true); l.setUint16(28, extraLength, true);
    local.set(name, 30);
    if (extraLength) { l.setUint16(30 + name.length, 0x1986, true); l.setUint16(32 + name.length, extraLength - 4, true); }
    const entry = new Uint8Array(46 + name.length);
    const c = new DataView(entry.buffer);
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint16(12, 0, true); c.setUint16(14, 0x21, true);
    c.setUint32(16, checksum, true); c.setUint32(20, file.data.length, true); c.setUint32(24, file.data.length, true);
    c.setUint16(28, name.length, true); c.setUint32(42, offset, true); entry.set(name, 46);
    chunks.push(local, file.data); central.push(entry);
    offset += local.length + file.data.length;
    if (offset > maxBytes || offset > MAX_ZIP32) fail("archive exceeds maxBytes or ZIP32 limit");
  }
  const centralOffset = offset;
  for (const entry of central) { chunks.push(entry); offset += entry.length; }
  const centralSize = offset - centralOffset;
  if (offset + 22 > maxBytes || offset + 22 > MAX_ZIP32) fail("archive exceeds maxBytes or ZIP32 limit");
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, centralSize, true); e.setUint32(16, centralOffset, true);
  chunks.push(end);
  const result = new Uint8Array(offset + end.length);
  let written = 0;
  for (const chunk of chunks) { abort(signal); result.set(chunk, written); written += chunk.length; }
  return result;
}
