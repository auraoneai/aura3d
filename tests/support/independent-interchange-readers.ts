/**
 * Independent semantic readers for exporter round-trip tests.
 *
 * These readers are authored in this test tree directly from the public format
 * specifications (glTF 2.0 / GLB container, PLY 1.0, USDZ stored-ZIP packaging
 * and the USDA text grammar subset). They import no Aura3D runtime code and no
 * other engine, so an exporter bug cannot be masked by a matching loader bug.
 * They throw descriptive errors on malformed input instead of guessing.
 */

const utf8 = new TextDecoder("utf-8", { fatal: true });

export type Mat4 = number[];
const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Column-major 4x4 multiply a * b. */
export function multiplyMat4(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let sum = 0;
    for (let k = 0; k < 4; k++) sum += a[k * 4 + r]! * b[c * 4 + k]!;
    out[c * 4 + r] = sum;
  }
  return out;
}

/** Column-major T * R * S from a unit quaternion in x, y, z, w order. */
export function composeTRS(t: readonly number[] = [0, 0, 0], q: readonly number[] = [0, 0, 0, 1], s: readonly number[] = [1, 1, 1]): Mat4 {
  const [x, y, z, w] = q as [number, number, number, number];
  const [sx, sy, sz] = s as [number, number, number];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    t[0]!, t[1]!, t[2]!, 1
  ];
}

export function transformPoint(m: Mat4, p: readonly number[]): [number, number, number] {
  return [
    m[0]! * p[0]! + m[4]! * p[1]! + m[8]! * p[2]! + m[12]!,
    m[1]! * p[0]! + m[5]! * p[1]! + m[9]! * p[2]! + m[13]!,
    m[2]! * p[0]! + m[6]! * p[1]! + m[10]! * p[2]! + m[14]!
  ];
}

// ---------------------------------------------------------------------------
// glTF 2.0 / GLB
// ---------------------------------------------------------------------------

export interface IndependentGLTFAccessor {
  readonly componentType: number;
  readonly normalized: boolean;
  readonly type: string;
  readonly count: number;
  /** Raw component values per element (not normalized). */
  readonly raw: number[][];
  /** Values with glTF normalization applied when `normalized` is true. */
  readonly values: number[][];
}
export interface IndependentGLTFPrimitive {
  readonly mode: number;
  readonly material?: number;
  readonly attributes: Readonly<Record<string, IndependentGLTFAccessor>>;
  readonly indices?: number[];
  readonly targets: readonly Readonly<Record<string, IndependentGLTFAccessor>>[];
  readonly extensions: Readonly<Record<string, any>>;
}
export interface IndependentGLTFNode {
  readonly index: number;
  readonly name?: string;
  readonly parent?: number;
  readonly children: number[];
  readonly local: Mat4;
  readonly world: Mat4;
  readonly mesh?: number;
  readonly skin?: number;
  readonly camera?: number;
  readonly weights?: number[];
  readonly extras?: unknown;
  readonly extensions: Readonly<Record<string, any>>;
}
export interface IndependentGLTFDocument {
  readonly json: Record<string, any>;
  readonly asset: Readonly<Record<string, any>>;
  readonly extensionsUsed: string[];
  readonly extensionsRequired: string[];
  readonly nodes: IndependentGLTFNode[];
  readonly sceneRoots: number[];
  readonly meshes: { readonly name?: string; readonly primitives: IndependentGLTFPrimitive[]; readonly weights?: number[] }[];
  readonly materials: Record<string, any>[];
  readonly skins: { readonly name?: string; readonly joints: number[]; readonly skeleton?: number; readonly inverseBindMatrices?: number[][] }[];
  readonly animations: { readonly name?: string; readonly channels: { readonly node?: number; readonly path: string; readonly pointer?: string; readonly interpolation: string; readonly input: number[]; readonly output: number[][] }[] }[];
  readonly images: { readonly mimeType?: string; readonly bytes: Uint8Array }[];
  readonly findNode: (name: string) => IndependentGLTFNode;
}

const COMPONENTS: Record<number, { size: number; read: (view: DataView, offset: number) => number; max?: number; signed?: boolean }> = {
  5120: { size: 1, read: (v, o) => v.getInt8(o), max: 127, signed: true },
  5121: { size: 1, read: (v, o) => v.getUint8(o), max: 255 },
  5122: { size: 2, read: (v, o) => v.getInt16(o, true), max: 32767, signed: true },
  5123: { size: 2, read: (v, o) => v.getUint16(o, true), max: 65535 },
  5125: { size: 4, read: (v, o) => v.getUint32(o, true) },
  5126: { size: 4, read: (v, o) => v.getFloat32(o, true) }
};
const WIDTHS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

function decodeDataUri(uri: string): Uint8Array {
  const match = /^data:[^,]*?(;base64)?,(.*)$/s.exec(uri);
  if (!match) throw new Error(`Unsupported URI: ${uri.slice(0, 32)}`);
  return match[1] ? Uint8Array.from(Buffer.from(match[2]!, "base64")) : new TextEncoder().encode(decodeURIComponent(match[2]!));
}

/** Split a GLB container into its JSON and optional BIN chunk, validating the header and chunk alignment. */
export function readGLBContainer(input: Uint8Array): { json: Record<string, any>; bin?: Uint8Array } {
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  if (input.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67) throw new Error("GLB: bad magic");
  if (view.getUint32(4, true) !== 2) throw new Error("GLB: unsupported container version");
  if (view.getUint32(8, true) !== input.byteLength) throw new Error("GLB: declared length mismatch");
  let offset = 12;
  let json: Record<string, any> | undefined;
  let bin: Uint8Array | undefined;
  while (offset < input.byteLength) {
    if (offset + 8 > input.byteLength) throw new Error("GLB: truncated chunk header");
    const length = view.getUint32(offset, true), type = view.getUint32(offset + 4, true);
    if (length % 4 !== 0) throw new Error("GLB: chunk length is not 4-byte aligned");
    const start = offset + 8, end = start + length;
    if (end > input.byteLength) throw new Error("GLB: truncated chunk");
    if (type === 0x4e4f534a) {
      if (json) throw new Error("GLB: duplicate JSON chunk");
      json = JSON.parse(utf8.decode(input.subarray(start, end)).replace(/[ \0]+$/, "")) as Record<string, any>;
    } else if (type === 0x004e4942) {
      if (!json) throw new Error("GLB: BIN chunk precedes JSON chunk");
      if (bin) throw new Error("GLB: duplicate BIN chunk");
      bin = input.slice(start, end);
    }
    offset = end;
  }
  if (!json) throw new Error("GLB: missing JSON chunk");
  return { json, ...(bin ? { bin } : {}) };
}

/**
 * Read a glTF document (GLB bytes, .gltf JSON bytes, or a parsed object) and
 * decode accessors, hierarchy, meshes, skins and animations. External buffers
 * and images resolve through `resolve` by URI.
 */
export function readIndependentGLTF(input: Uint8Array | Record<string, any>, resolve: (uri: string) => Uint8Array | undefined = () => undefined): IndependentGLTFDocument {
  let json: Record<string, any>;
  let bin: Uint8Array | undefined;
  if (input instanceof Uint8Array) {
    if (input.byteLength >= 4 && new DataView(input.buffer, input.byteOffset, 4).getUint32(0, true) === 0x46546c67) ({ json, bin } = readGLBContainer(input));
    else json = JSON.parse(utf8.decode(input)) as Record<string, any>;
  } else json = input;
  if (typeof json.asset?.version !== "string" || !/^2\.\d+$/.test(json.asset.version)) throw new Error("glTF: asset.version must be 2.x");
  const buffers = (json.buffers ?? []).map((buffer: any, index: number) => {
    let data: Uint8Array | undefined;
    if (buffer.uri === undefined) {
      if (index !== 0 || !bin) throw new Error(`glTF: buffer ${index} has no URI and no GLB BIN chunk`);
      data = bin;
    } else if (String(buffer.uri).startsWith("data:")) data = decodeDataUri(buffer.uri);
    else data = resolve(buffer.uri);
    if (!data) throw new Error(`glTF: unresolved buffer ${buffer.uri}`);
    if (data.byteLength < buffer.byteLength) throw new Error(`glTF: buffer ${index} is shorter than byteLength`);
    return data;
  }) as Uint8Array[];
  const viewBytes = (index: number): { bytes: Uint8Array; stride?: number } => {
    const view = json.bufferViews?.[index];
    if (!view) throw new Error(`glTF: missing bufferView ${index}`);
    const buffer = buffers[view.buffer];
    if (!buffer) throw new Error(`glTF: bufferView ${index} references a missing buffer`);
    const start = view.byteOffset ?? 0, end = start + view.byteLength;
    if (end > buffer.byteLength) throw new Error(`glTF: bufferView ${index} exceeds its buffer`);
    return { bytes: buffer.subarray(start, end), ...(view.byteStride === undefined ? {} : { stride: view.byteStride }) };
  };
  const accessorCache = new Map<number, IndependentGLTFAccessor>();
  const accessor = (index: number): IndependentGLTFAccessor => {
    const cached = accessorCache.get(index);
    if (cached) return cached;
    const source = json.accessors?.[index];
    if (!source) throw new Error(`glTF: missing accessor ${index}`);
    const component = COMPONENTS[source.componentType];
    const width = WIDTHS[source.type];
    if (!component || !width) throw new Error(`glTF: accessor ${index} has an invalid component type or type`);
    const raw: number[][] = Array.from({ length: source.count }, () => new Array<number>(width).fill(0));
    if (source.bufferView !== undefined) {
      const { bytes, stride } = viewBytes(source.bufferView);
      const elementSize = component.size * width;
      // Matrix columns are 4-byte aligned for 1- and 2-byte components.
      const columnPad = (source.type === "MAT2" || source.type === "MAT3") && component.size < 4;
      const step = stride ?? elementSize;
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const base = source.byteOffset ?? 0;
      if (columnPad) throw new Error("glTF: padded small-component matrix accessors are not used by these tests");
      if (source.count > 0 && base + step * (source.count - 1) + elementSize > bytes.byteLength) throw new Error(`glTF: accessor ${index} exceeds its bufferView`);
      for (let i = 0; i < source.count; i++) for (let c = 0; c < width; c++) raw[i]![c] = component.read(view, base + i * step + c * component.size);
    }
    if (source.sparse) {
      const sparse = source.sparse;
      const indexComponent = COMPONENTS[sparse.indices.componentType]!;
      const iv = viewBytes(sparse.indices.bufferView), vv = viewBytes(sparse.values.bufferView);
      const idx = new DataView(iv.bytes.buffer, iv.bytes.byteOffset, iv.bytes.byteLength);
      const val = new DataView(vv.bytes.buffer, vv.bytes.byteOffset, vv.bytes.byteLength);
      for (let s = 0; s < sparse.count; s++) {
        const target = indexComponent.read(idx, (sparse.indices.byteOffset ?? 0) + s * indexComponent.size);
        if (target >= source.count) throw new Error(`glTF: accessor ${index} sparse index out of range`);
        for (let c = 0; c < width; c++) raw[target]![c] = component.read(val, (sparse.values.byteOffset ?? 0) + (s * width + c) * component.size);
      }
    }
    const normalized = source.normalized === true;
    if (normalized && (source.componentType === 5125 || source.componentType === 5126)) throw new Error(`glTF: accessor ${index} cannot be normalized`);
    const values = normalized
      ? raw.map((row) => row.map((value) => component.signed ? Math.max(value / component.max!, -1) : value / component.max!))
      : raw;
    const result = { componentType: source.componentType, normalized, type: source.type, count: source.count, raw, values };
    accessorCache.set(index, result);
    return result;
  };
  const nodeSources: any[] = json.nodes ?? [];
  const parents = new Map<number, number>();
  nodeSources.forEach((node, index) => (node.children ?? []).forEach((child: number) => {
    if (parents.has(child)) throw new Error(`glTF: node ${child} has multiple parents`);
    parents.set(child, index);
  }));
  const locals = nodeSources.map((node, index): Mat4 => {
    if (node.matrix !== undefined) {
      if (node.translation || node.rotation || node.scale) throw new Error(`glTF: node ${index} mixes matrix and TRS`);
      if (!Array.isArray(node.matrix) || node.matrix.length !== 16) throw new Error(`glTF: node ${index} matrix must have 16 values`);
      return [...node.matrix];
    }
    return composeTRS(node.translation, node.rotation, node.scale);
  });
  const worlds = new Map<number, Mat4>();
  const worldOf = (index: number, depth = 0): Mat4 => {
    if (depth > nodeSources.length) throw new Error("glTF: node hierarchy contains a cycle");
    const cached = worlds.get(index);
    if (cached) return cached;
    const parent = parents.get(index);
    const world = parent === undefined ? locals[index]! : multiplyMat4(worldOf(parent, depth + 1), locals[index]!);
    worlds.set(index, world);
    return world;
  };
  const nodes: IndependentGLTFNode[] = nodeSources.map((node, index) => ({
    index,
    ...(node.name === undefined ? {} : { name: node.name }),
    ...(parents.has(index) ? { parent: parents.get(index)! } : {}),
    children: [...(node.children ?? [])],
    local: locals[index]!,
    world: worldOf(index),
    ...(node.mesh === undefined ? {} : { mesh: node.mesh }),
    ...(node.skin === undefined ? {} : { skin: node.skin }),
    ...(node.camera === undefined ? {} : { camera: node.camera }),
    ...(node.weights === undefined ? {} : { weights: [...node.weights] }),
    ...(node.extras === undefined ? {} : { extras: node.extras }),
    extensions: node.extensions ?? {}
  }));
  const decodeAttributes = (attributes: Record<string, number>): Record<string, IndependentGLTFAccessor> =>
    Object.fromEntries(Object.entries(attributes).map(([semantic, index]) => [semantic, accessor(index)]));
  const meshes = (json.meshes ?? []).map((mesh: any) => ({
    ...(mesh.name === undefined ? {} : { name: mesh.name }),
    ...(mesh.weights === undefined ? {} : { weights: [...mesh.weights] }),
    primitives: (mesh.primitives ?? []).map((primitive: any): IndependentGLTFPrimitive => ({
      mode: primitive.mode ?? 4,
      ...(primitive.material === undefined ? {} : { material: primitive.material }),
      attributes: decodeAttributes(primitive.attributes ?? {}),
      ...(primitive.indices === undefined ? {} : { indices: accessor(primitive.indices).raw.map((row) => row[0]!) }),
      targets: (primitive.targets ?? []).map((target: Record<string, number>) => decodeAttributes(target)),
      extensions: primitive.extensions ?? {}
    }))
  }));
  const skins = (json.skins ?? []).map((skin: any) => ({
    ...(skin.name === undefined ? {} : { name: skin.name }),
    joints: [...skin.joints],
    ...(skin.skeleton === undefined ? {} : { skeleton: skin.skeleton }),
    ...(skin.inverseBindMatrices === undefined ? {} : { inverseBindMatrices: accessor(skin.inverseBindMatrices).values })
  }));
  const animations = (json.animations ?? []).map((animation: any) => ({
    ...(animation.name === undefined ? {} : { name: animation.name }),
    channels: (animation.channels ?? []).map((channel: any) => {
      const sampler = animation.samplers?.[channel.sampler];
      if (!sampler) throw new Error("glTF: animation channel references a missing sampler");
      const pointer = channel.target?.extensions?.KHR_animation_pointer?.pointer;
      return {
        ...(channel.target?.node === undefined ? {} : { node: channel.target.node }),
        path: channel.target?.path,
        ...(pointer === undefined ? {} : { pointer }),
        interpolation: sampler.interpolation ?? "LINEAR",
        input: accessor(sampler.input).values.map((row) => row[0]!),
        output: accessor(sampler.output).values
      };
    })
  }));
  const images = (json.images ?? []).map((image: any) => {
    let bytes: Uint8Array | undefined;
    if (image.bufferView !== undefined) bytes = viewBytes(image.bufferView).bytes;
    else if (typeof image.uri === "string") bytes = image.uri.startsWith("data:") ? decodeDataUri(image.uri) : resolve(image.uri);
    if (!bytes) throw new Error(`glTF: unresolved image ${image.uri}`);
    return { ...(image.mimeType === undefined ? {} : { mimeType: image.mimeType }), bytes };
  });
  const scene = json.scenes?.[json.scene ?? 0];
  return {
    json,
    asset: json.asset,
    extensionsUsed: [...(json.extensionsUsed ?? [])],
    extensionsRequired: [...(json.extensionsRequired ?? [])],
    nodes,
    sceneRoots: [...(scene?.nodes ?? [])],
    meshes,
    materials: json.materials ?? [],
    skins,
    animations,
    images,
    findNode(name: string) {
      const matches = nodes.filter((node) => node.name === name);
      if (matches.length !== 1) throw new Error(`glTF: expected exactly one node named ${name}, found ${matches.length}`);
      return matches[0]!;
    }
  };
}

// ---------------------------------------------------------------------------
// PLY 1.0
// ---------------------------------------------------------------------------

type PlyType = "char" | "uchar" | "short" | "ushort" | "int" | "uint" | "float" | "double";
const PLY_ALIASES: Record<string, PlyType> = {
  char: "char", int8: "char", uchar: "uchar", uint8: "uchar", short: "short", int16: "short", ushort: "ushort", uint16: "ushort",
  int: "int", int32: "int", uint: "uint", uint32: "uint", float: "float", float32: "float", double: "double", float64: "double"
};
const PLY_SIZES: Record<PlyType, number> = { char: 1, uchar: 1, short: 2, ushort: 2, int: 4, uint: 4, float: 4, double: 8 };
export interface IndependentPLYProperty { readonly name: string; readonly type: PlyType; readonly listCount?: PlyType }
export interface IndependentPLYElement { readonly name: string; readonly count: number; readonly properties: IndependentPLYProperty[]; readonly rows: Record<string, number | number[]>[] }
export interface IndependentPLY {
  readonly format: "ascii" | "binary_little_endian" | "binary_big_endian";
  readonly version: string;
  readonly comments: string[];
  readonly objInfo: string[];
  readonly elements: IndependentPLYElement[];
  element(name: string): IndependentPLYElement;
}

/** Parse every declared element and property of an ASCII or binary PLY file; trailing or missing data is an error. */
export function readIndependentPLY(input: Uint8Array): IndependentPLY {
  const marker = "end_header";
  let headerEnd = -1;
  for (let i = 0; i + marker.length < input.length; i++) {
    let match = true;
    for (let j = 0; j < marker.length; j++) if (input[i + j] !== marker.charCodeAt(j)) { match = false; break; }
    if (match && (i === 0 || input[i - 1] === 10)) {
      let end = i + marker.length;
      if (input[end] === 13) end++;
      if (input[end] !== 10) throw new Error("PLY: end_header must end its line");
      headerEnd = end + 1;
      break;
    }
  }
  if (headerEnd < 0) throw new Error("PLY: missing end_header");
  const lines = new TextDecoder("ascii").decode(input.subarray(0, headerEnd)).split(/\r?\n/).filter((line) => line.length > 0);
  if (lines[0] !== "ply") throw new Error("PLY: missing magic line");
  let format: IndependentPLY["format"] | undefined;
  let version = "";
  const comments: string[] = [], objInfo: string[] = [];
  const elements: { name: string; count: number; properties: IndependentPLYProperty[] }[] = [];
  for (const line of lines.slice(1)) {
    const words = line.trim().split(/\s+/);
    if (words[0] === "format") {
      if (format) throw new Error("PLY: duplicate format line");
      if (words[1] !== "ascii" && words[1] !== "binary_little_endian" && words[1] !== "binary_big_endian") throw new Error(`PLY: unknown format ${words[1]}`);
      format = words[1]; version = words[2] ?? "";
      if (version !== "1.0") throw new Error(`PLY: unsupported version ${version}`);
    } else if (words[0] === "comment") comments.push(line.replace(/^\s*comment\s?/, ""));
    else if (words[0] === "obj_info") objInfo.push(line.replace(/^\s*obj_info\s?/, ""));
    else if (words[0] === "element") {
      const count = Number(words[2]);
      if (!words[1] || !Number.isSafeInteger(count) || count < 0) throw new Error(`PLY: invalid element line ${line}`);
      elements.push({ name: words[1], count, properties: [] });
    } else if (words[0] === "property") {
      const element = elements.at(-1);
      if (!element) throw new Error("PLY: property before element");
      if (words[1] === "list") {
        const countType = PLY_ALIASES[words[2]!], itemType = PLY_ALIASES[words[3]!];
        if (!countType || !itemType || !words[4] || countType === "float" || countType === "double") throw new Error(`PLY: invalid list property ${line}`);
        element.properties.push({ name: words[4], type: itemType, listCount: countType });
      } else {
        const type = PLY_ALIASES[words[1]!];
        if (!type || !words[2]) throw new Error(`PLY: invalid property ${line}`);
        element.properties.push({ name: words[2], type });
      }
    } else if (words[0] !== marker) throw new Error(`PLY: unknown header keyword ${words[0]}`);
  }
  if (!format) throw new Error("PLY: missing format line");
  const parsed: IndependentPLYElement[] = [];
  if (format === "ascii") {
    const tokens = new TextDecoder("ascii").decode(input.subarray(headerEnd)).split(/\s+/).filter((token) => token.length > 0);
    let cursor = 0;
    const next = (type: PlyType): number => {
      const token = tokens[cursor++];
      if (token === undefined) throw new Error("PLY: truncated ASCII body");
      const value = Number(token);
      if (!Number.isFinite(value)) throw new Error(`PLY: invalid number ${token}`);
      if (type !== "float" && type !== "double" && !Number.isInteger(value)) throw new Error(`PLY: non-integer ${type} value ${token}`);
      return value;
    };
    for (const element of elements) {
      const rows: Record<string, number | number[]>[] = [];
      for (let i = 0; i < element.count; i++) {
        const row: Record<string, number | number[]> = {};
        for (const property of element.properties) {
          if (property.listCount) { const count = next(property.listCount); row[property.name] = Array.from({ length: count }, () => next(property.type)); }
          else row[property.name] = next(property.type);
        }
        rows.push(row);
      }
      parsed.push({ ...element, rows });
    }
    if (cursor !== tokens.length) throw new Error("PLY: trailing ASCII data");
  } else {
    const little = format === "binary_little_endian";
    const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
    let offset = headerEnd;
    const read = (type: PlyType): number => {
      if (offset + PLY_SIZES[type] > input.byteLength) throw new Error("PLY: truncated binary body");
      let value: number;
      switch (type) {
        case "char": value = view.getInt8(offset); break;
        case "uchar": value = view.getUint8(offset); break;
        case "short": value = view.getInt16(offset, little); break;
        case "ushort": value = view.getUint16(offset, little); break;
        case "int": value = view.getInt32(offset, little); break;
        case "uint": value = view.getUint32(offset, little); break;
        case "float": value = view.getFloat32(offset, little); break;
        case "double": value = view.getFloat64(offset, little); break;
      }
      offset += PLY_SIZES[type];
      return value;
    };
    for (const element of elements) {
      const rows: Record<string, number | number[]>[] = [];
      for (let i = 0; i < element.count; i++) {
        const row: Record<string, number | number[]> = {};
        for (const property of element.properties) {
          if (property.listCount) { const count = read(property.listCount); row[property.name] = Array.from({ length: count }, () => read(property.type)); }
          else row[property.name] = read(property.type);
        }
        rows.push(row);
      }
      parsed.push({ ...element, rows });
    }
    if (offset !== input.byteLength) throw new Error("PLY: trailing binary data");
  }
  return {
    format, version, comments, objInfo, elements: parsed,
    element(name: string) {
      const found = parsed.find((element) => element.name === name);
      if (!found) throw new Error(`PLY: no element ${name}`);
      return found;
    }
  };
}

// ---------------------------------------------------------------------------
// USDZ (stored ZIP, 64-byte aligned) and USDA text
// ---------------------------------------------------------------------------

export interface IndependentZipEntry { readonly name: string; readonly data: Uint8Array; readonly dataOffset: number }

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (-(crc & 1) & 0xedb88320);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Read a USDZ package from its central directory: stored entries only, CRC-checked, 64-byte aligned data. */
export function readIndependentUSDZ(input: Uint8Array): IndependentZipEntry[] {
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  let eocd = -1;
  for (let i = input.byteLength - 22; i >= Math.max(0, input.byteLength - 22 - 65535); i--) if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("USDZ: missing end of central directory");
  const count = view.getUint16(eocd + 10, true);
  let cursor = view.getUint32(eocd + 16, true);
  const entries: IndependentZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error("USDZ: bad central directory record");
    const method = view.getUint16(cursor + 10, true);
    const crc = view.getUint32(cursor + 16, true), compressed = view.getUint32(cursor + 20, true), size = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true), extraLength = view.getUint16(cursor + 30, true), commentLength = view.getUint16(cursor + 32, true);
    const local = view.getUint32(cursor + 42, true);
    const name = utf8.decode(input.subarray(cursor + 46, cursor + 46 + nameLength));
    if (method !== 0 || compressed !== size) throw new Error(`USDZ: ${name} is not stored uncompressed`);
    if (view.getUint32(local, true) !== 0x04034b50) throw new Error(`USDZ: ${name} has no local header`);
    const localName = utf8.decode(input.subarray(local + 30, local + 30 + view.getUint16(local + 26, true)));
    if (localName !== name) throw new Error(`USDZ: ${name} local and central names differ`);
    const dataOffset = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    if (dataOffset % 64 !== 0) throw new Error(`USDZ: ${name} data is not 64-byte aligned`);
    const data = input.slice(dataOffset, dataOffset + size);
    if (crc32(data) !== crc) throw new Error(`USDZ: ${name} CRC mismatch`);
    entries.push({ name, data, dataOffset });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  if (!entries.length || !/\.usd[ac]?$/.test(entries[0]!.name)) throw new Error("USDZ: the first entry must be the root layer");
  return entries;
}

export type USDValue = number | string | boolean | null | USDValue[] | { readonly path: string } | { readonly asset: string } | { readonly samples: ReadonlyMap<number, USDValue> } | { readonly raw: string } | { readonly dict: Readonly<Record<string, USDValue>> };
export interface USDProperty {
  readonly name: string;
  readonly typeName: string;
  readonly custom: boolean;
  readonly uniform: boolean;
  readonly relationship: boolean;
  value?: USDValue;
  connect?: string;
  timeSamples?: ReadonlyMap<number, USDValue>;
  spline?: string;
  metadata: Record<string, USDValue>;
}
export interface USDPrim {
  readonly specifier: "def" | "over" | "class";
  readonly typeName?: string;
  readonly name: string;
  readonly path: string;
  readonly parent?: USDPrim;
  readonly children: USDPrim[];
  readonly properties: Map<string, USDProperty>;
  readonly metadata: Record<string, USDValue>;
  readonly variantSets: Map<string, Map<string, USDPrim[]>>;
}
export interface USDStage {
  readonly metadata: Record<string, USDValue>;
  readonly roots: USDPrim[];
  prim(path: string): USDPrim;
  allPrims(): USDPrim[];
}

type Token = { kind: "punct" | "string" | "number" | "ident" | "path" | "asset"; text: string };

function tokenizeUSDA(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === "#") { while (i < text.length && text[i] !== "\n") i++; continue; }
    if ("()[]{}=,:;".includes(ch)) { tokens.push({ kind: "punct", text: ch }); i++; continue; }
    if (ch === '"' || ch === "'") {
      const triple = text.startsWith(ch.repeat(3), i);
      const quote = triple ? ch.repeat(3) : ch;
      let j = i + quote.length, value = "";
      while (j < text.length && !text.startsWith(quote, j)) {
        if (text[j] === "\\") {
          const escaped = text[j + 1];
          if (escaped === undefined) throw new Error("USDA: unterminated escape");
          value += escaped === "n" ? "\n" : escaped === "t" ? "\t" : escaped === "r" ? "\r" : escaped;
          j += 2;
        } else value += text[j++];
      }
      if (j >= text.length) throw new Error("USDA: unterminated string");
      tokens.push({ kind: "string", text: value }); i = j + quote.length; continue;
    }
    if (ch === "<") { const end = text.indexOf(">", i); if (end < 0) throw new Error("USDA: unterminated path"); tokens.push({ kind: "path", text: text.slice(i + 1, end) }); i = end + 1; continue; }
    if (ch === "@") { const end = text.indexOf("@", i + 1); if (end < 0) throw new Error("USDA: unterminated asset"); tokens.push({ kind: "asset", text: text.slice(i + 1, end) }); i = end + 1; continue; }
    const number = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?|^[+-]?(?:inf|nan)\b/.exec(text.slice(i, i + 64));
    if (number && (ch !== "-" || /[\d.in]/.test(text[i + 1] ?? ""))) { tokens.push({ kind: "number", text: number[0] }); i += number[0].length; continue; }
    const ident = /^[A-Za-z_][\w:.\[\]]*/.exec(text.slice(i, i + 512));
    if (ident) {
      // Array type suffixes ("float[]") are part of the type token.
      tokens.push({ kind: "ident", text: ident[0] }); i += ident[0].length; continue;
    }
    throw new Error(`USDA: unexpected character ${JSON.stringify(ch)} at ${i}`);
  }
  return tokens;
}

/** Parse the USDA text grammar subset used by interchange packages into a prim tree. */
export function parseIndependentUSDA(text: string): USDStage {
  if (!/^#usda 1\.\d+\s/.test(text)) throw new Error("USDA: missing #usda header");
  const source = text;
  const tokens = tokenizeUSDA(text.replace(/^#usda[^\n]*\n/, ""));
  let at = 0;
  const peek = (offset = 0): Token | undefined => tokens[at + offset];
  const take = (): Token => { const token = tokens[at++]; if (!token) throw new Error("USDA: unexpected end of input"); return token; };
  const expectPunct = (value: string): void => { const token = take(); if (token.kind !== "punct" || token.text !== value) throw new Error(`USDA: expected ${value} but found ${token.text}`); };
  const isPunct = (value: string, offset = 0): boolean => peek(offset)?.kind === "punct" && peek(offset)!.text === value;

  const parseValue = (): USDValue => {
    const token = take();
    if (token.kind === "number") return token.text === "inf" ? Infinity : token.text === "-inf" ? -Infinity : token.text === "nan" ? NaN : Number(token.text);
    if (token.kind === "string") return token.text;
    if (token.kind === "path") return { path: token.text };
    if (token.kind === "asset") return { asset: token.text };
    if (token.kind === "ident") {
      if (token.text === "true") return true;
      if (token.text === "false") return false;
      if (token.text === "None") return null;
      return token.text;
    }
    if (token.text === "[" || token.text === "(") {
      const close = token.text === "[" ? "]" : ")";
      const values: USDValue[] = [];
      while (!isPunct(close)) { values.push(parseValue()); if (isPunct(",")) take(); }
      take();
      return values;
    }
    if (token.text === "{") {
      // Dictionary (typed key/value lines) or time-sample map (number: value).
      const dict: Record<string, USDValue> = {};
      const samples = new Map<number, USDValue>();
      let sampleMap = false;
      while (!isPunct("}")) {
        if (peek()?.kind === "number" && isPunct(":", 1)) {
          sampleMap = true;
          const time = Number(take().text); take();
          samples.set(time, parseValue());
        } else {
          // `type key = value`
          take(); const key = take();
          expectPunct("=");
          dict[key.text] = parseValue();
        }
        if (isPunct(",") || isPunct(";")) take();
      }
      take();
      return sampleMap ? { samples } : { dict };
    }
    throw new Error(`USDA: unexpected value token ${token.text}`);
  };
  const parseMetadata = (): Record<string, USDValue> => {
    expectPunct("(");
    const metadata: Record<string, USDValue> = {};
    while (!isPunct(")")) {
      let key = take().text;
      if (key === "prepend" || key === "append" || key === "add" || key === "delete" || key === "reorder") key = take().text;
      if (key === "variants") { expectPunct("="); metadata[key] = parseValue(); continue; }
      if (isPunct("=")) { take(); metadata[key] = parseValue(); }
      else metadata[key] = true;
      if (isPunct(";")) take();
    }
    take();
    return metadata;
  };
  // Capture a balanced brace block as raw text for spline curves.
  const rawBlock = (): string => {
    expectPunct("{");
    let depth = 1; const parts: string[] = [];
    while (depth > 0) {
      const token = take();
      if (token.kind === "punct" && token.text === "{") depth++;
      if (token.kind === "punct" && token.text === "}") { depth--; if (depth === 0) break; }
      parts.push(token.text);
    }
    return parts.join(" ");
  };
  const all: USDPrim[] = [];
  const parsePrimBody = (prim: USDPrim): void => {
    expectPunct("{");
    while (!isPunct("}")) {
      const word = peek()!;
      if (word.kind === "ident" && (word.text === "def" || word.text === "over" || word.text === "class")) { prim.children.push(parsePrim(prim)); continue; }
      if (word.kind === "ident" && word.text === "variantSet") {
        take(); const setName = take().text; expectPunct("="); expectPunct("{");
        const variants = new Map<string, USDPrim[]>();
        while (!isPunct("}")) {
          const variantName = take().text;
          const holder: USDPrim = { specifier: "over", name: variantName, path: `${prim.path}{${setName}=${variantName}}`, children: [], properties: new Map(), metadata: {}, variantSets: new Map(), parent: prim };
          parsePrimBody(holder);
          variants.set(variantName, holder.children);
        }
        take();
        prim.variantSets.set(setName, variants);
        continue;
      }
      // Property: [custom] [uniform] type name[.suffix] [= value] [(metadata)] or rel name = target.
      let custom = false, uniform = false;
      while (peek()?.kind === "ident" && (peek()!.text === "custom" || peek()!.text === "uniform" || peek()!.text === "varying")) {
        const modifier = take().text; if (modifier === "custom") custom = true; if (modifier === "uniform") uniform = true;
      }
      const typeName = take().text;
      const relationship = typeName === "rel";
      const fullName = take().text;
      const dot = fullName.match(/\.(timeSamples|connect|spline)$/);
      const name = dot ? fullName.slice(0, -dot[0].length) : fullName;
      const property: USDProperty = prim.properties.get(name) ?? { name, typeName, custom, uniform, relationship, metadata: {} };
      prim.properties.set(name, property);
      if (isPunct("=")) {
        take();
        if (dot?.[1] === "spline") property.spline = rawBlock();
        else {
          const value = parseValue();
          if (dot?.[1] === "timeSamples") {
            if (!value || typeof value !== "object" || !("samples" in value)) throw new Error(`USDA: ${fullName} must be a time-sample map`);
            property.timeSamples = value.samples;
          } else if (dot?.[1] === "connect") {
            if (!value || typeof value !== "object" || !("path" in value)) throw new Error(`USDA: ${fullName} must target a path`);
            property.connect = value.path;
          } else property.value = value;
        }
      }
      if (isPunct("(")) Object.assign(property.metadata, parseMetadata());
    }
    take();
  };
  const parsePrim = (parent?: USDPrim): USDPrim => {
    const specifier = take().text as USDPrim["specifier"];
    let typeName: string | undefined;
    if (peek()?.kind === "ident") typeName = take().text;
    const nameToken = take();
    if (nameToken.kind !== "string") throw new Error("USDA: prim name must be quoted");
    const path = `${parent ? parent.path : ""}/${nameToken.text}`;
    const prim: USDPrim = { specifier, ...(typeName ? { typeName } : {}), name: nameToken.text, path, ...(parent ? { parent } : {}), children: [], properties: new Map(), metadata: {}, variantSets: new Map() };
    if (isPunct("(")) Object.assign(prim.metadata, parseMetadata());
    parsePrimBody(prim);
    all.push(prim);
    return prim;
  };
  const metadata = isPunct("(") ? parseMetadata() : {};
  const roots: USDPrim[] = [];
  while (at < tokens.length) roots.push(parsePrim());
  void source;
  const byPath = new Map<string, USDPrim>();
  const index = (prim: USDPrim): void => { byPath.set(prim.path, prim); prim.children.forEach(index); };
  roots.forEach(index);
  return {
    metadata, roots,
    prim(path: string) { const prim = byPath.get(path); if (!prim) throw new Error(`USDA: no prim at ${path}`); return prim; },
    allPrims: () => [...byPath.values()]
  };
}

/** Local transform of a USD Xformable from its xformOpOrder (translate, orient, scale, transform ops). */
export function usdLocalMatrix(prim: USDPrim, time?: number): Mat4 {
  const order = prim.properties.get("xformOpOrder")?.value;
  if (order === undefined) return [...IDENTITY];
  if (!Array.isArray(order)) throw new Error(`USDA: ${prim.path} xformOpOrder must be an array`);
  let matrix = [...IDENTITY];
  for (const op of order) {
    if (typeof op !== "string") throw new Error("USDA: xformOp names must be tokens");
    const property = prim.properties.get(op);
    if (!property) throw new Error(`USDA: ${prim.path} lacks ${op}`);
    const value = (time !== undefined && property.timeSamples?.has(time) ? property.timeSamples.get(time) : property.value) as number[] | number[][];
    let local: Mat4;
    if (op.startsWith("xformOp:translate")) local = composeTRS(value as number[]);
    else if (op.startsWith("xformOp:orient")) { const [w, x, y, z] = value as number[]; local = composeTRS(undefined, [x!, y!, z!, w!]); }
    else if (op.startsWith("xformOp:scale")) local = composeTRS(undefined, undefined, value as number[]);
    else if (op.startsWith("xformOp:transform")) local = (value as number[][]).flat();
    else throw new Error(`USDA: unsupported xformOp ${op}`);
    // USD composes ops so the first listed op is outermost.
    matrix = multiplyMat4(matrix, local);
  }
  return matrix;
}

export function usdWorldMatrix(prim: USDPrim, time?: number): Mat4 {
  let matrix = usdLocalMatrix(prim, time);
  for (let parent = prim.parent; parent; parent = parent.parent) matrix = multiplyMat4(usdLocalMatrix(parent, time), matrix);
  return matrix;
}
