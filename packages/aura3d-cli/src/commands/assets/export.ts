import { constants } from "node:fs";
import { lstat, open, realpath, unlink } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createDracoEncoder,
  exportDRACO,
  exportEXR,
  exportGLTF,
  exportKTX2,
  exportOBJ,
  exportPLY,
  exportSTL,
  exportUSDZ,
  type AuraDracoEncoder,
  type AuraDracoEncoderModule,
  type AuraEXRPizEncoder,
  type AuraEXRSource,
  type AuraKTX2Encoder,
  type AuraKTX2Encoding,
  type AuraKTX2Texture,
  type AuraExportResult,
  type AuraExportScene
} from "@aura3d/assets/exporters";

/** JSON interchange input is bounded before parsing and contains no filesystem references. */
const MAX_INPUT_BYTES = 64 * 1024 * 1024;
const FORMATS = ["gltf", "glb", "obj", "ply", "stl", "usdz", "drc", "exr", "ktx2"] as const;
type Format = (typeof FORMATS)[number];
interface ExportIo {
  readonly cwd: string;
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
}
interface ParsedArguments {
  readonly input: string;
  readonly output: string;
  readonly format: Format;
  readonly binary: boolean;
  readonly bigEndian: boolean;
  readonly external: boolean;
  readonly json: boolean;
  readonly encoder?: string;
  readonly mesh: number;
  readonly primitive: number;
  readonly attachment?: string;
  readonly layer?: string;
  readonly compression?: "none" | "rle" | "piz";
  readonly encoding?: AuraKTX2Encoding;
}

export function exportAssetsUsage(): string {
  return "aura3d assets export --input input.json --out path --format gltf|glb|obj|ply|stl|usdz|drc|exr|ktx2 [--binary] [--big-endian] [--external|--embed] [--encoder local-module] [--mesh N] [--primitive N] [--attachment name --layer name --compression none|rle|piz] [--encoding none|basis-etc1s|basis-uastc|zstd|zlib] [--json]";
}

function isKTX2Encoding(value: string): value is AuraKTX2Encoding {
  return value === "none" || value === "basis-etc1s" || value === "basis-uastc" || value === "zstd" || value === "zlib";
}

/**
 * Export a JSON AuraExportScene. Ordinary JSON numeric arrays represent float
 * attributes; set an attribute's `componentType` to float32, int8, uint8,
 * int16, uint16 or uint32 to preserve its storage type. Indices may likewise
 * be `{ componentType: "uint16", values: [...] }`. Dependencies provide bytes
 * as an array or `{ base64: "..." }`; names are relative to the output file.
 * EXR input contains attachments/layers/channels with float samples or binary16
 * bit patterns; attachment and layer must be selected. KTX2 input contains
 * dimensions, format and level byte arrays. `--encoder` explicitly imports
 * and executes a local codec module; the CLI never fetches or installs one.
 */
export async function exportAssetsVerb(argv: readonly string[], io: ExportIo): Promise<number> {
  let args: ParsedArguments;
  try {
    args = parseArguments(argv);
  } catch (error) {
    if (argv.includes("--json")) io.stderr(JSON.stringify({ code: "INVALID_ARGUMENTS", error: message(error), usage: exportAssetsUsage() }));
    else io.stderr(`${message(error)}\nUsage: ${exportAssetsUsage()}`);
    return 2;
  }
  try {
    const root = await realpath(io.cwd);
    const source = projectPath(root, args.input, "input");
    const actualSource = await realpath(source);
    assertWithin(root, actualSource, "input");
    const raw = await readInput(actualSource);
    const output = projectPath(root, args.output, "output");
    await validateOutputParent(root, output);
    try {
      await lstat(output);
      throw new Error(`Output already exists: ${args.output}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const result = await serialize(raw, args, root);
    const files = [
      { path: output, bytes: await asBytes(result.data), name: args.output },
      ...await Promise.all(result.dependencies.map(async (dependency) => ({
        path: dependencyPath(root, output, dependency.name),
        bytes: await asBytes(dependency.data),
        name: dependency.name
      })))
    ];
    await writeNewFiles(root, files);
    const report = {
      format: args.format,
      output: args.output,
      mimeType: result.mimeType,
      bytes: files[0]!.bytes.byteLength,
      dependencies: files.slice(1).map(({ name, bytes }) => ({ name, bytes: bytes.byteLength })),
      warnings: result.warnings
    };
    if (args.json) io.stdout(JSON.stringify(report, null, 2));
    else {
      io.stdout(`wrote ${report.output} (${report.bytes} bytes; ${report.dependencies.length} dependencies)`);
      for (const warning of result.warnings) io.stderr(JSON.stringify(warning));
    }
    return 0;
  } catch (error) {
    const diagnostic = error as { readonly code?: unknown; readonly warnings?: unknown };
    if (args.json) io.stderr(JSON.stringify({ error: message(error), ...(typeof diagnostic?.code === "string" ? { code: diagnostic.code } : {}), ...(Array.isArray(diagnostic?.warnings) ? { warnings: diagnostic.warnings } : {}) }));
    else io.stderr(`Export failed${typeof diagnostic?.code === "string" ? ` [${diagnostic.code}]` : ""}: ${message(error)}`);
    return 1;
  }
}

/** Bound the read itself as well as the initial stat. A growing or replaced
 * final path must not turn a small checked file into an unbounded allocation. */
async function readInput(path: string): Promise<string> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || !Number.isSafeInteger(stat.size) || stat.size > MAX_INPUT_BYTES) throw new Error(`Input must be a regular JSON file of at most ${MAX_INPUT_BYTES} bytes`);
    const buffer = Buffer.allocUnsafe(stat.size + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length !== stat.size) throw new Error("Input changed while it was being read");
    try { return new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, length)); }
    catch { throw new Error("Input must contain valid UTF-8 JSON"); }
  } finally {
    await handle.close();
  }
}

function parseArguments(argv: readonly string[]): ParsedArguments {
  const values = new Map<string, string>();
  const switches = new Set<string>();
  const withValue = new Set(["--input", "--out", "--format", "--encoder", "--mesh", "--primitive", "--attachment", "--layer", "--compression", "--encoding"]);
  const boolean = new Set(["--binary", "--big-endian", "--external", "--embed", "--json"]);
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]!;
    if (withValue.has(key)) {
      if (values.has(key) || argv[i + 1] === undefined || argv[i + 1]!.startsWith("--")) throw new Error(`Expected one value for ${key}`);
      values.set(key, argv[++i]!);
    } else if (boolean.has(key)) {
      if (switches.has(key)) throw new Error(`Duplicate option ${key}`);
      switches.add(key);
    } else throw new Error(`Unknown option ${key}`);
  }
  const input = values.get("--input");
  const output = values.get("--out");
  const format = values.get("--format");
  if (!input || !output || !format || !(FORMATS as readonly string[]).includes(format)) throw new Error("--input, --out and a supported --format are required");
  if (extname(output).toLowerCase() !== `.${format}`) throw new Error(`Output must use the .${format} extension`);
  if (switches.has("--binary") && format !== "ply" && format !== "stl") throw new Error("--binary applies only to PLY and STL; use --format glb for binary glTF");
  if (switches.has("--big-endian") && (format !== "ply" || !switches.has("--binary"))) throw new Error("--big-endian requires binary PLY");
  if ((switches.has("--external") || switches.has("--embed")) && format !== "gltf" && format !== "glb") throw new Error("--external and --embed apply only to glTF/GLB");
  if (switches.has("--external") && switches.has("--embed")) throw new Error("Choose either --external or --embed");
  if ((values.has("--mesh") || values.has("--primitive")) && format !== "drc") throw new Error("--mesh and --primitive apply only to Draco");
  if (values.has("--encoder") && !["drc", "exr", "ktx2"].includes(format)) throw new Error("--encoder applies only to Draco, EXR and KTX2");
  if (values.has("--encoder") && !values.get("--encoder")) throw new Error("--encoder requires a local module path");
  if ((values.has("--attachment") || values.has("--layer") || values.has("--compression")) && format !== "exr") throw new Error("--attachment, --layer and --compression apply only to EXR");
  if (values.has("--encoding") && format !== "ktx2") throw new Error("--encoding applies only to KTX2");
  const encoding = values.get("--encoding");
  if (encoding !== undefined && !isKTX2Encoding(encoding)) throw new Error("--encoding must be none, basis-etc1s, basis-uastc, zstd or zlib");
  const compression = values.get("--compression");
  if (compression !== undefined && !["none", "rle", "piz"].includes(compression)) throw new Error("--compression must be none, rle or piz");
  if (format === "exr" && (!values.get("--attachment") || !values.has("--layer"))) throw new Error("EXR requires explicit --attachment and --layer selectors");
  if (format === "exr" && values.has("--encoder") && compression !== "piz") throw new Error("An EXR --encoder requires --compression piz");
  if (format === "ktx2" && values.has("--encoder") && (!values.get("--encoding") || values.get("--encoding") === "none")) throw new Error("A KTX2 --encoder requires a non-raw --encoding");
  const parseIndex = (value: string | undefined, name: string): number => {
    if (value === undefined) return 0;
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error(`${name} must be a non-negative integer`);
    return Number(value);
  };
  return { input, output, format: format as Format, binary: switches.has("--binary"), bigEndian: switches.has("--big-endian"), external: switches.has("--external"), json: switches.has("--json"), ...(values.get("--encoder") ? { encoder: values.get("--encoder") } : {}), mesh: parseIndex(values.get("--mesh"), "--mesh"), primitive: parseIndex(values.get("--primitive"), "--primitive"), ...(values.has("--attachment") ? { attachment: values.get("--attachment") } : {}), ...(values.has("--layer") ? { layer: values.get("--layer") } : {}), ...(compression === undefined ? {} : { compression: compression as "none" | "rle" | "piz" }), ...(encoding === undefined ? {} : { encoding }) };
}

async function serialize(raw: string, args: ParsedArguments, root: string): Promise<AuraExportResult> {
  if (args.format === "exr") {
    const codec = args.encoder ? await loadEncoder(root, args.encoder) : undefined;
    if (codec && (codec.supported !== true || typeof codec.encodeBlock !== "function")) throw new Error("EXR PIZ module must export an encoder with supported: true and encodeBlock");
    return exportEXR(parseEXRSource(raw), { attachment: args.attachment!, layer: args.layer!, compression: args.compression, ...(codec ? { pizEncoder: codec as unknown as AuraEXRPizEncoder } : {}) });
  }
  if (args.format === "ktx2") {
    const codec = args.encoder ? await loadEncoder(root, args.encoder) : undefined;
    if (codec && (typeof codec.name !== "string" || typeof codec.supports !== "function" || typeof codec.encode !== "function")) throw new Error("KTX2 encoder module must export name, supports and encode");
    return exportKTX2(parseKTX2Texture(raw), { encoding: args.encoding, ...(codec ? { encoder: codec as unknown as AuraKTX2Encoder } : {}) });
  }
  const scene = parseScene(raw);
  switch (args.format) {
    case "gltf": return exportGLTF(scene, { embedDependencies: !args.external });
    case "glb": return exportGLTF(scene, { binary: true, embedDependencies: !args.external });
    case "obj": return exportOBJ(scene);
    case "ply": return exportPLY(scene, { binary: args.binary, bigEndian: args.bigEndian });
    case "stl": return exportSTL(scene, { binary: args.binary });
    case "usdz": return exportUSDZ(scene);
    case "drc": {
      const primitive = scene.meshes?.[args.mesh]?.primitives[args.primitive];
      if (!primitive) throw new Error("The requested Draco mesh/primitive does not exist");
      const codec = args.encoder ? await loadEncoder(root, args.encoder) : undefined;
      let encoder: AuraDracoEncoder | undefined;
      if (codec && typeof codec.encode === "function") encoder = codec as unknown as AuraDracoEncoder;
      else if (codec && typeof codec.createEncoderModule === "function") encoder = createDracoEncoder(await (codec.createEncoderModule as (options: object) => Promise<AuraDracoEncoderModule>)({}));
      else if (codec) throw new Error("Draco encoder module must export encoder.encode or createEncoderModule");
      const result = await exportDRACO(primitive, { encoder });
      return {
        ...result,
        warnings: [
          ...(scene.sourceWarnings ?? []),
          { code: "DRACO_SCENE_OMITTED", path: "scene", message: "Standalone Draco stores the selected primitive in local coordinates, not the scene hierarchy, transforms, cameras, lights, skins, animations, provenance or other primitives." },
          ...result.warnings
        ]
      };
    }
  }
}

/** The explicitly supplied module is local code and executes in this process. */
async function loadEncoder(root: string, name: string): Promise<Record<string, unknown>> {
  const path = await realpath(projectPath(root, name, "encoder"));
  assertWithin(root, path, "encoder");
  if (!(await lstat(path)).isFile()) throw new Error("Encoder module must be a file");
  if (![".js", ".mjs", ".cjs"].includes(extname(path).toLowerCase())) throw new Error("Encoder must be a local .js, .mjs or .cjs module");
  const loaded = await import(pathToFileURL(path).href) as Record<string, unknown>;
  if (loaded.encoder && typeof loaded.encoder === "object") return loaded.encoder as Record<string, unknown>;
  if (loaded.default && typeof loaded.default === "object") return { ...loaded, ...loaded.default };
  return loaded;
}

type RecordValue = Record<string, unknown>;
function object(value: unknown, path: string): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path} must be an object`);
  return value as RecordValue;
}
function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  return value;
}
function optionalArray(value: unknown, path: string): unknown[] {
  return value === undefined ? [] : array(value, path);
}
function numericArray(value: unknown, path: string): number[] {
  const values = array(value, path);
  if (!values.every((item) => typeof item === "number" && Number.isFinite(item))) throw new Error(`${path} must contain finite numbers`);
  return values as number[];
}

function typedValues(value: unknown, component: unknown, path: string): number[] | Float32Array | Int8Array | Uint8Array | Int16Array | Uint16Array | Uint32Array {
  const values = numericArray(value, path);
  if (component === undefined) return values;
  const constructors = {
    float32: [Float32Array, -3.4028234663852886e38, 3.4028234663852886e38],
    int8: [Int8Array, -128, 127],
    uint8: [Uint8Array, 0, 255],
    int16: [Int16Array, -32768, 32767],
    uint16: [Uint16Array, 0, 65535],
    uint32: [Uint32Array, 0, 4294967295]
  } as const;
  if (typeof component !== "string" || !Object.hasOwn(constructors, component)) throw new Error(`${path} has unsupported componentType`);
  const [ctor, minimum, maximum] = constructors[component as keyof typeof constructors];
  if (values.some((item) => item < minimum || item > maximum || (component !== "float32" && !Number.isInteger(item)))) throw new Error(`${path} contains a value outside ${component}'s range`);
  return new ctor(values);
}

function byteData(value: unknown, path: string): Uint8Array {
  if (Array.isArray(value)) return typedValues(value, "uint8", path) as Uint8Array;
  const data = object(value, path);
  if (typeof data.base64 !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data.base64)) throw new Error(`${path}.base64 is invalid`);
  return new Uint8Array(Buffer.from(data.base64, "base64"));
}
function parseEXRSource(raw: string): AuraEXRSource {
  const source = object(JSON.parse(raw) as unknown, "EXR source");
  for (const [i, value] of array(source.attachments, "attachments").entries()) {
    const attachment = object(value, `attachments[${i}]`);
    for (const [j, layerValue] of array(attachment.layers, `attachments[${i}].layers`).entries()) {
      const layer = object(layerValue, `attachments[${i}].layers[${j}]`);
      for (const [k, channelValue] of array(layer.channels, `attachments[${i}].layers[${j}].channels`).entries()) {
        const path = `attachments[${i}].layers[${j}].channels[${k}]`;
        const channel = object(channelValue, path);
        if (channel.type !== "float" && channel.type !== "half") throw new Error(`${path}.type must be float or half`);
        channel.data = typedValues(channel.data, channel.type === "float" ? "float32" : "uint16", `${path}.data`);
      }
    }
  }
  return source as unknown as AuraEXRSource;
}
function parseKTX2Texture(raw: string): AuraKTX2Texture {
  const texture = object(JSON.parse(raw) as unknown, "KTX2 texture");
  for (const [index, value] of array(texture.levels, "levels").entries()) {
    const level = object(value, `levels[${index}]`);
    level.data = byteData(level.data, `levels[${index}].data`);
  }
  return texture as unknown as AuraKTX2Texture;
}

function convertAttribute(value: unknown, path: string): void {
  const attribute = object(value, path);
  attribute.values = typedValues(attribute.values, attribute.componentType, `${path}.values`);
  delete attribute.componentType;
}
function parseScene(raw: string): AuraExportScene {
  const scene = object(JSON.parse(raw) as unknown, "scene");
  array(scene.nodes, "nodes");
  array(scene.roots, "roots");
  for (const [meshIndex, value] of optionalArray(scene.meshes, "meshes").entries()) {
    const mesh = object(value, `meshes[${meshIndex}]`);
    for (const [primitiveIndex, item] of array(mesh.primitives, `meshes[${meshIndex}].primitives`).entries()) {
      const path = `meshes[${meshIndex}].primitives[${primitiveIndex}]`;
      const primitive = object(item, path);
      for (const [key, attribute] of Object.entries(object(primitive.attributes, `${path}.attributes`))) convertAttribute(attribute, `${path}.attributes.${key}`);
      for (const [targetIndex, target] of optionalArray(primitive.targets, `${path}.targets`).entries()) {
        for (const [key, attribute] of Object.entries(object(target, `${path}.targets[${targetIndex}]`))) convertAttribute(attribute, `${path}.targets[${targetIndex}].${key}`);
      }
      if (primitive.indices !== undefined) {
        if (Array.isArray(primitive.indices)) primitive.indices = numericArray(primitive.indices, `${path}.indices`);
        else {
          const indices = object(primitive.indices, `${path}.indices`);
          if (!["uint8", "uint16", "uint32"].includes(String(indices.componentType))) throw new Error(`${path}.indices requires an unsigned integer componentType`);
          primitive.indices = typedValues(indices.values, indices.componentType, `${path}.indices.values`);
        }
      }
    }
  }
  for (const [index, value] of optionalArray(scene.skins, "skins").entries()) {
    const skin = object(value, `skins[${index}]`);
    if (skin.inverseBindMatrices !== undefined) convertAttribute(skin.inverseBindMatrices, `skins[${index}].inverseBindMatrices`);
  }
  for (const [index, value] of optionalArray(scene.animations, "animations").entries()) {
    const animation = object(value, `animations[${index}]`);
    for (const [channelIndex, value] of array(animation.channels, `animations[${index}].channels`).entries()) {
      const path = `animations[${index}].channels[${channelIndex}]`;
      const channel = object(value, path);
      convertAttribute(channel.times, `${path}.times`);
      convertAttribute(channel.values, `${path}.values`);
    }
  }
  for (const [index, value] of optionalArray(scene.dependencies, "dependencies").entries()) {
    const dependency = object(value, `dependencies[${index}]`);
    dependency.data = byteData(dependency.data, `dependencies[${index}].data`);
  }
  return scene as unknown as AuraExportScene;
}

function assertWithin(root: string, path: string, description: string): void {
  const local = relative(root, path);
  if (!local || local === ".." || local.startsWith(`..${sep}`) || isAbsolute(local)) throw new Error(`${description} must be a file inside the current project`);
}
function projectPath(root: string, value: string, description: string): string {
  if (value.includes("\0")) throw new Error(`${description} contains a null byte`);
  const path = resolve(root, value);
  assertWithin(root, path, description);
  return path;
}
function dependencyPath(root: string, output: string, name: string): string {
  if (!name || name.startsWith("/") || name.includes("\\") || name.includes("\0") || name.split("/").some((part) => !/^[A-Za-z0-9._-]+$/.test(part) || part === "." || part === "..")) throw new Error(`Unsafe dependency name: ${name}`);
  const path = resolve(dirname(output), name);
  assertWithin(root, path, "dependency");
  return path;
}
async function asBytes(data: Uint8Array | Blob): Promise<Uint8Array> {
  return data instanceof Uint8Array ? data : new Uint8Array(await data.arrayBuffer());
}

async function validateOutputParent(root: string, path: string): Promise<void> {
  const parent = await realpath(dirname(path));
  if (parent !== root) assertWithin(root, parent, "output directory");
  if (parent !== dirname(path)) throw new Error(`Output directory cannot contain a symbolic link: ${relative(root, path)}`);
}

/** Exclusively create every target before writing; roll back our own files on failure. */
async function writeNewFiles(root: string, files: readonly { path: string; bytes: Uint8Array }[]): Promise<void> {
  const targets = new Set<string>();
  for (const { path } of files) {
    if (targets.has(path)) throw new Error(`Multiple export files target ${relative(root, path)}`);
    targets.add(path);
    await validateOutputParent(root, path);
  }
  const handles: Awaited<ReturnType<typeof open>>[] = [];
  const created: { path: string; dev: number; ino: number }[] = [];
  try {
    for (const { path } of files) {
      const handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o644);
      handles.push(handle);
      const identity = await handle.stat();
      created.push({ path, dev: identity.dev, ino: identity.ino });
    }
    for (let i = 0; i < files.length; i++) await handles[i]!.writeFile(files[i]!.bytes);
    for (const handle of handles) await handle.close();
  } catch (error) {
    await Promise.allSettled(handles.map((handle) => handle.close()));
    await Promise.allSettled(created.map(async ({ path, dev, ino }) => {
      const current = await lstat(path);
      if (current.dev === dev && current.ino === ino) await unlink(path);
    }));
    throw error;
  }
}
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
