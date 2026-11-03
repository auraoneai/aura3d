import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync, type Stats } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { AuraCliAssetEntry } from "./asset-core-types.js";

// Inspect only the bounded JSON chunk, never the potentially much larger BIN
// chunk. Hashing the document and its sidecars is streamed in fixed-size blocks.
const MAX_GLB_JSON_BYTES = 16 * 1024 * 1024;
const MAX_GLB_CHUNKS = 1024;
const MAX_RESOURCE_REFERENCES = 4096;
const MAX_RESOURCE_URI_LENGTH = 4096;
const MAX_EXTERNAL_GLB_BYTES = 64 * 1024 * 1024;
const MAX_INSPECTION_VALUES = 200_000;
const MAX_INSPECTION_COLLECTION_ITEMS = 32_768;
const MAX_SCENE_DEPTH = 256;
const HASH_BLOCK_BYTES = 128 * 1024;
const JSON_CHUNK = 0x4e4f534a;

interface CheckedGlb {
  readonly json: Record<string, unknown>;
  readonly hash: string;
  readonly failures: readonly string[];
  readonly uris: readonly string[];
  readonly references: readonly { readonly uri: string; readonly path: string; readonly hash: string }[];
}

interface CapturedFile {
  readonly path: string;
  readonly stat: Stats;
  readonly hash: string;
}

export interface CapturedGlb {
  readonly bytes: Buffer;
  readonly dependencies: readonly {
    readonly uri: string;
    /** Decoded filesystem path, relative to the document. */
    readonly path: string;
    readonly bytes: Buffer;
  }[];
  /** Check the original files again immediately before publishing. */
  readonly assertUnchanged: () => void;
}

/**
 * Capture the real document and every external resource into immutable buffers.
 * The same bounded JSON parser and URI policy are used by assets validate.
 * A single-file GLB retains its historical size behavior; multi-file
 * admissions have a 64 MiB aggregate snapshot limit.
 */
export function captureGlbSource(projectDir: string, sourcePath: string): CapturedGlb {
  const project = resolve(projectDir);
  const source = resolve(sourcePath);
  const rel = relative(project, source);
  const withinProject = Boolean(rel) && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
  const sourceDir = dirname(source);
  if (!withinProject && lstatSync(sourceDir).isSymbolicLink()) {
    throw new Error("Aura3D assets add failed: GLB source directory is a symbolic link.");
  }
  // An external source directory is an explicitly selected trust anchor. All
  // referenced paths are still confined beneath it and cannot contain links.
  const anchor = realpathSync(withinProject ? project : sourceDir);
  const rootPath = withinProject ? resolve(anchor, rel) : join(anchor, basename(source));
  const root = openContainedSource(anchor, rootPath);
  const captured: CapturedFile[] = [];
  let bytes: Buffer;
  let uris: string[];
  let json: Record<string, unknown>;
  try {
    // Check the budget before allocating a potentially large multi-file GLB.
    const preliminary = parseGlbJson(readGlbJson(root.fd, root.stat.size));
    if (externalResourceUris(preliminary).length && root.stat.size > MAX_EXTERNAL_GLB_BYTES) {
      throw new Error("Aura3D assets add failed: external GLB and dependencies exceed the 64 MiB input budget.");
    }
    bytes = readExactly(root.fd, root.stat.size, 0);
    assertSameFile(root.stat, fstatSync(root.fd));
    // Parse the snapshot, not a separate read of a potentially changed file.
    json = parseGlbJson(readGlbJsonBytes(bytes));
    uris = externalResourceUris(json);
    if (uris.length && bytes.length > MAX_EXTERNAL_GLB_BYTES) {
      throw new Error("Aura3D assets add failed: external GLB and dependencies exceed the 64 MiB input budget.");
    }
    if (uris.length) assertExternalInspectionBudget(json);
    captured.push({ path: rootPath, stat: root.stat, hash: digestBytes(bytes) });
  } finally {
    closeSync(root.fd);
  }

  const dependencies: Array<{ uri: string; path: string; bytes: Buffer }> = [];
  const byPath = new Map<string, Buffer>();
  let totalBytes = bytes.length;
  for (const uri of uris) {
    let path: string;
    try {
      path = safeResourcePath(uri);
      const folded = path.normalize("NFC").toLowerCase();
      for (const existing of byPath.keys()) {
        const other = existing.normalize("NFC").toLowerCase();
        if (existing !== path && (folded === other || folded.startsWith(`${other}/`) || other.startsWith(`${folded}/`))) {
          throw new Error("dependency paths collide on a portable filesystem");
        }
      }
      const child = resolve(dirname(rootPath), path);
      if (child.normalize("NFC").toLowerCase() === rootPath.normalize("NFC").toLowerCase()) {
        throw new Error("reference points to the GLB itself");
      }
      let contents = byPath.get(path);
      if (!contents) {
        const file = openContainedSource(anchor, child);
        try {
          if (file.stat.size > MAX_EXTERNAL_GLB_BYTES - totalBytes) {
            throw new Error("external GLB and dependencies exceed the 64 MiB input budget");
          }
          contents = readExactly(file.fd, file.stat.size, 0);
          assertSameFile(file.stat, fstatSync(file.fd));
          totalBytes += contents.length;
          byPath.set(path, contents);
          captured.push({ path: child, stat: file.stat, hash: digestBytes(contents) });
        } finally {
          closeSync(file.fd);
        }
      }
      dependencies.push({ uri, path, bytes: contents });
    } catch (error) {
      throw new Error(`Aura3D assets add failed: missing, unsafe, or unreadable GLB dependency ${JSON.stringify(uri)} (${errorMessage(error)}).`, { cause: error });
    }
  }
  assertExternalBufferLengths(json, dependencies);

  const assertUnchanged = (): void => {
    for (const original of captured) {
      try {
        const file = openContainedSource(anchor, original.path);
        try {
          assertSameFile(original.stat, file.stat);
          if (hashOpenFile(file.fd, file.stat) !== original.hash) throw new Error("contents changed");
        } finally {
          closeSync(file.fd);
        }
      } catch (error) {
        throw new Error(`Aura3D assets add failed: GLB source or dependency changed or became unsafe during admission (${errorMessage(error)}).`, { cause: error });
      }
    }
  };
  assertUnchanged();
  return { bytes, dependencies, assertUnchanged };
}

/** Compare a staged file without following a symbolic link or trusting its name. */
export function assertStagedGlbFile(projectDir: string, path: string, bytes: Buffer, reason: string): void {
  try {
    const file = openProjectFile(projectDir, path);
    try {
      if (file.stat.size !== bytes.length || hashOpenFile(file.fd, file.stat) !== digestBytes(bytes)) {
        throw new Error("contents differ");
      }
    } finally {
      closeSync(file.fd);
    }
  } catch (error) {
    throw new Error(`Aura3D assets add failed: ${reason} (${errorMessage(error)}).`, { cause: error });
  }
}

/** Read actual references, not potentially stale manifest inspection metadata. */
export function referencedGlbResourcePaths(projectDir: string, outputPath: string): readonly string[] {
  const file = openProjectFile(projectDir, outputPath);
  try {
    const json = parseGlbJson(readGlbJson(file.fd, file.stat.size));
    const paths = externalResourceUris(json).map((uri) => resolve(dirname(outputPath), safeResourcePath(uri)));
    assertSameFile(file.stat, fstatSync(file.fd));
    return paths;
  } finally {
    closeSync(file.fd);
  }
}

/**
 * Validate the resources actually named in a staged GLB, not the manifest's
 * possibly stale `textures` or `dependencies` inspection metadata.
 */
export function checkGlbDependencies(projectDir: string, outputPath: string, asset: AuraCliAssetEntry): CheckedGlb {
  const { fd, stat } = openProjectFile(projectDir, outputPath);
  let json: Record<string, unknown>;
  let hash: string;
  try {
    const jsonBytes = readGlbJson(fd, stat.size);
    hash = hashOpenFile(fd, stat);
    json = parseGlbJson(jsonBytes);
  } finally {
    closeSync(fd);
  }

  const uris = externalResourceUris(json);
  const failures: string[] = [];
  const references: Array<{ uri: string; path: string; hash: string }> = [];
  if (uris.length === 0) return { json, hash, failures, uris, references };
  const digests = resolvedDependencyDigests(asset);
  for (const uri of uris) {
    const label = JSON.stringify(uri.length > 256 ? `${uri.slice(0, 253)}...` : uri);
    let child: string;
    let resourcePath: string;
    try {
      resourcePath = safeResourcePath(uri);
      child = resolve(dirname(outputPath), resourcePath);
      if (child === outputPath) throw new Error("reference points to the GLB itself");
    } catch (error) {
      failures.push(`Invalid or unsafe GLB dependency for "${asset.id}": ${label} (${errorMessage(error)}).`);
      continue;
    }

    // The typed model path always enables requireDependencies, including for
    // legacy single-file manifests. A local file alone is not an admission.
    const digest = digests.get(resolveResourceUrl(uri, asset.url));
    if (!digest) failures.push(`Missing required GLB dependency integrity for "${asset.id}": ${label}.`);
    try {
      const dependency = openProjectFile(projectDir, child);
      let actual: string;
      try {
        actual = hashOpenFile(dependency.fd, dependency.stat);
      } finally {
        closeSync(dependency.fd);
      }
      references.push({ uri, path: resourcePath, hash: actual });
      if (digest && actual !== digest) {
        failures.push(`GLB dependency hash mismatch for "${asset.id}": ${label} (expected ${digest}, found ${actual}).`);
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ENOTDIR") {
        failures.push(`Missing referenced asset dependency for "${asset.id}": ${label} (expected beside the staged GLB).`);
      } else {
        failures.push(`Invalid, unsafe, or unreadable GLB dependency for "${asset.id}": ${label} (${errorMessage(error)}).`);
      }
    }
  }
  return { json, hash, failures, uris, references };
}

function readGlbJson(fd: number, size: number): Buffer {
  return readGlbJsonWith(size, (length, position) => readExactly(fd, length, position));
}

function readGlbJsonBytes(bytes: Buffer): Buffer {
  return readGlbJsonWith(bytes.length, (length, position) => bytes.subarray(position, position + length));
}

function readGlbJsonWith(size: number, read: (length: number, position: number) => Buffer): Buffer {
  if (size < 20) throw new Error("GLB header is truncated.");
  const header = read(12, 0);
  if (header.readUInt32LE(0) !== 0x46546c67) throw new Error("Invalid GLB magic.");
  if (header.readUInt32LE(4) !== 2) throw new Error("Unsupported GLB version (expected version 2).");
  if (header.readUInt32LE(8) !== size) throw new Error("GLB declared length does not match the file.");

  let offset = 12;
  let chunks = 0;
  let json: Buffer | undefined;
  while (offset < size) {
    if (++chunks > MAX_GLB_CHUNKS) throw new Error("GLB has too many chunks.");
    if (offset + 8 > size) throw new Error("GLB chunk header is truncated.");
    const chunkHeader = read(8, offset);
    const length = chunkHeader.readUInt32LE(0);
    const type = chunkHeader.readUInt32LE(4);
    const start = offset + 8;
    const end = start + length;
    if (length % 4 !== 0 || end > size) throw new Error("GLB chunk length is invalid.");
    if (chunks === 1 && type !== JSON_CHUNK) throw new Error("GLB first chunk must be JSON.");
    if (type === JSON_CHUNK) {
      if (json) throw new Error("GLB contains more than one JSON chunk.");
      if (length === 0 || length > MAX_GLB_JSON_BYTES) {
        throw new Error(`GLB JSON chunk must be between 1 and ${MAX_GLB_JSON_BYTES} bytes.`);
      }
      json = read(length, start);
    }
    offset = end;
  }
  if (!json) throw new Error("GLB is missing a JSON chunk.");
  return json;
}

function parseGlbJson(jsonBytes: Buffer): Record<string, unknown> {
  let parsed: unknown;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(jsonBytes).replace(/[\u0000\s]+$/u, "");
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error("GLB JSON chunk is not valid UTF-8 JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("GLB JSON chunk must contain an object.");
  }
  return parsed as Record<string, unknown>;
}

function externalResourceUris(json: Record<string, unknown>): string[] {
  const uris = new Set<string>();
  let references = 0;
  for (const field of ["images", "buffers"] as const) {
    const resources = json[field];
    if (resources === undefined) continue;
    if (!Array.isArray(resources)) throw new Error(`GLB ${field} must be an array.`);
    references += resources.length;
    if (references > MAX_RESOURCE_REFERENCES) throw new Error("GLB has too many image and buffer references.");
    for (const resource of resources) {
      if (!resource || typeof resource !== "object" || Array.isArray(resource)) {
        throw new Error(`GLB ${field} contains an invalid resource.`);
      }
      const item = resource as Record<string, unknown>;
      const uri = item.uri;
      if (uri !== undefined && typeof uri !== "string") throw new Error(`GLB ${field} contains a non-string URI.`);
      if (field === "images" && uri && item.bufferView !== undefined) {
        throw new Error("GLB image cannot have both a URI and a bufferView.");
      }
      if (field === "images" && !uri && item.bufferView === undefined) {
        throw new Error("GLB image must have a URI or a bufferView.");
      }
      // A buffer without a URI and an image in a bufferView are embedded.
      // Data URIs are decoded in place by the runtime, not fetched as files.
      if (typeof uri === "string" && uri && !uri.startsWith("data:")) uris.add(uri);
    }
  }
  return [...uris];
}

/** Prevent the metadata inspector's graph walks and array spreads from becoming unbounded. */
function assertExternalInspectionBudget(json: Record<string, unknown>): void {
  const pending: unknown[] = [json];
  let values = 0;
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== "object") continue;
    if (Array.isArray(value)) {
      if (value.length > MAX_INSPECTION_COLLECTION_ITEMS) {
        throw new Error("Aura3D assets add failed: external GLB inspection collection exceeds its item budget.");
      }
      values += value.length;
      if (values > MAX_INSPECTION_VALUES) throw new Error("Aura3D assets add failed: external GLB metadata exceeds its inspection budget.");
      for (const item of value) if (item && typeof item === "object") pending.push(item);
    } else {
      for (const key in value) {
        if (!Object.hasOwn(value, key)) continue;
        if (++values > MAX_INSPECTION_VALUES) throw new Error("Aura3D assets add failed: external GLB metadata exceeds its inspection budget.");
        const item = (value as Record<string, unknown>)[key];
        if (item && typeof item === "object") pending.push(item);
      }
    }
  }

  if (json.nodes === undefined) return;
  if (!Array.isArray(json.nodes)) throw new Error("Aura3D assets add failed: external GLB nodes must be an array.");
  const nodes = json.nodes as unknown[];
  const children: number[][] = [];
  const parents = new Int32Array(nodes.length).fill(-1);
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      throw new Error("Aura3D assets add failed: external GLB node is invalid.");
    }
    const nodeChildren = (node as Record<string, unknown>).children;
    if (nodeChildren === undefined) {
      children.push([]);
      continue;
    }
    if (!Array.isArray(nodeChildren)) throw new Error("Aura3D assets add failed: external GLB node children must be an array.");
    const list: number[] = [];
    for (const child of nodeChildren) {
      if (!Number.isInteger(child) || child < 0 || child >= nodes.length || parents[child] !== -1) {
        throw new Error("Aura3D assets add failed: external GLB node graph has an invalid or multiply parented child.");
      }
      parents[child] = index;
      list.push(child);
    }
    children.push(list);
  }

  const pendingNodes: Array<{ index: number; depth: number }> = [];
  for (let index = 0; index < nodes.length; index++) {
    if (parents[index] === -1) pendingNodes.push({ index, depth: 1 });
  }
  let visited = 0;
  while (pendingNodes.length) {
    const node = pendingNodes.pop()!;
    if (node.depth > MAX_SCENE_DEPTH) throw new Error("Aura3D assets add failed: external GLB node graph exceeds the inspection depth budget.");
    visited++;
    for (const child of children[node.index]!) pendingNodes.push({ index: child, depth: node.depth + 1 });
  }
  if (visited !== nodes.length) throw new Error("Aura3D assets add failed: external GLB node graph contains a cycle.");

  const sceneIndex = json.scene ?? 0;
  const scenes = json.scenes;
  const scene = Array.isArray(scenes) && typeof sceneIndex === "number" ? scenes[sceneIndex] : undefined;
  const roots = scene && typeof scene === "object" && !Array.isArray(scene)
    ? (scene as Record<string, unknown>).nodes
    : undefined;
  if (roots !== undefined) {
    if (!Array.isArray(roots)) throw new Error("Aura3D assets add failed: external GLB scene nodes must be an array.");
    const unique = new Set<number>();
    for (const root of roots) {
      if (!Number.isInteger(root) || root < 0 || root >= nodes.length || unique.has(root)) {
        throw new Error("Aura3D assets add failed: external GLB scene node roots are invalid or duplicated.");
      }
      unique.add(root);
    }
    for (const root of unique) {
      for (let parent = parents[root]!; parent !== -1; parent = parents[parent]!) {
        if (unique.has(parent)) throw new Error("Aura3D assets add failed: external GLB scene node roots overlap.");
      }
    }
  }
}

/** The runtime requires an external buffer's declared and loaded lengths to agree exactly. */
function assertExternalBufferLengths(json: Record<string, unknown>, dependencies: CapturedGlb["dependencies"]): void {
  if (dependencies.length === 0 || !Array.isArray(json.buffers)) return;
  const byUri = new Map(dependencies.map((item) => [item.uri, item.bytes.length]));
  for (const resource of json.buffers as Record<string, unknown>[]) {
    const uri = resource.uri;
    if (typeof uri !== "string" || !uri || uri.startsWith("data:")) continue;
    const length = resource.byteLength;
    if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0 || byUri.get(uri) !== length) {
      throw new Error(`Aura3D assets add failed: external GLB buffer ${JSON.stringify(uri)} has an invalid or mismatched byteLength.`);
    }
  }
}

function safeResourcePath(uri: string): string {
  if (uri.length > MAX_RESOURCE_URI_LENGTH || uri.startsWith("/") || uri.startsWith(" ") || /[\u0000-\u001f\u007f\\?#]/u.test(uri) ||
      /^[a-z][a-z0-9+.-]*:/i.test(uri)) {
    throw new Error("expected a local relative URI without a query or fragment");
  }
  const parts: string[] = [];
  for (const segment of uri.split("/")) {
    if (!segment) throw new Error("empty path segment");
    let decoded: string;
    try { decoded = decodeURIComponent(segment); } catch { throw new Error("invalid URI encoding"); }
    if (decoded === "." && segment === ".") continue;
    if (decoded === "." || decoded === ".." || /[\u0000-\u001f\u007f\uD800-\uDFFF\\/%:?#<>"|*]/u.test(decoded) ||
        decoded.endsWith(".") || decoded.endsWith(" ") || Buffer.byteLength(decoded, "utf8") > 255 ||
        /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(decoded)) {
      throw new Error("path contains traversal, an encoded separator, or a nonportable name");
    }
    parts.push(decoded);
  }
  if (!parts.length) throw new Error("empty resource path");
  return parts.join("/");
}

function resolvedDependencyDigests(asset: AuraCliAssetEntry): Map<string, string> {
  const digests = new Map<string, string>();
  for (const [candidate, digest] of Object.entries(asset.integrity?.dependencies ?? {})) {
    // A relative document URL has no known deployment origin. Do not equate
    // an arbitrary absolute integrity key with the validator's dummy origin.
    if (candidate.length > MAX_RESOURCE_URI_LENGTH ||
        (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(candidate) && !/^[a-z][a-z0-9+.-]*:\/\//i.test(asset.url)) ||
        (candidate.startsWith("/") && !candidate.startsWith("//") &&
          !asset.url.startsWith("/") && !/^[a-z][a-z0-9+.-]*:\/\//i.test(asset.url))) continue;
    try {
      const key = resolveResourceUrl(candidate, asset.url);
      // LoadContext picks the first matching manifest entry, not the best or
      // last one. Preserve that ordering when equivalent URI keys collide.
      if (!digests.has(key)) digests.set(key, digest.toLowerCase());
    } catch {
      // An unrelated malformed manifest key cannot match a real resource.
    }
  }
  return digests;
}

function resolveResourceUrl(uri: string, documentUrl: string): string {
  const base = new URL(documentUrl, "https://aura3d-validation.invalid/");
  if (base.protocol !== "https:" && base.protocol !== "http:") throw new Error("GLB URL must be HTTP(S) or relative.");
  return new URL(uri, base).href;
}

function openProjectFile(projectDir: string, path: string): { fd: number; stat: Stats } {
  const project = resolve(projectDir);
  const rel = relative(project, resolve(path));
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error("path is outside the project");
  }
  const anchor = realpathSync(project);
  return openContainedSource(anchor, resolve(anchor, rel));
}

function openContainedSource(anchor: string, path: string): { fd: number; stat: Stats } {
  const rel = relative(anchor, path);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error("path is outside the GLB source directory");
  }
  const parts = rel.split(sep);
  const components: Array<{ path: string; stat: Stats }> = [];
  let cursor = anchor;
  for (let index = 0; index < parts.length; index++) {
    cursor = join(cursor, parts[index]!);
    const stat = lstatSync(cursor);
    if (stat.isSymbolicLink()) throw new Error("path contains a symbolic link");
    if (index < parts.length - 1 && !stat.isDirectory()) throw new Error("source parent is not a directory");
    components.push({ path: cursor, stat });
  }
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || !Number.isSafeInteger(stat.size)) throw new Error("path is not a regular file");
    assertSameFile(components[components.length - 1]!.stat, stat);
    // The descriptor is authoritative for bytes. Also refuse a path whose
    // directory components were replaced while the descriptor was opened.
    for (const component of components) {
      const current = lstatSync(component.path);
      if (current.isSymbolicLink() || current.dev !== component.stat.dev || current.ino !== component.stat.ino) {
        throw new Error("source path changed while being opened");
      }
    }
    return { fd, stat };
  } catch (error) {
    closeSync(fd);
    throw error;
  }
}

function assertSameFile(before: Stats, after: Stats): void {
  if (after.size !== before.size || after.ino !== before.ino || after.dev !== before.dev ||
      after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) {
    throw new Error("file changed while being read");
  }
}

function digestBytes(bytes: Buffer): string {
  return `sha256-${createHash("sha256").update(bytes).digest("hex")}`;
}

function readExactly(fd: number, length: number, position: number): Buffer {
  const result = Buffer.allocUnsafe(length);
  let read = 0;
  while (read < length) {
    const count = readSync(fd, result, read, length - read, position + read);
    if (count === 0) throw new Error("file changed while being read");
    read += count;
  }
  return result;
}

function hashOpenFile(fd: number, before: Stats): string {
  const hash = createHash("sha256");
  const block = Buffer.allocUnsafe(HASH_BLOCK_BYTES);
  let offset = 0;
  while (offset < before.size) {
    const count = readSync(fd, block, 0, Math.min(block.length, before.size - offset), offset);
    if (count === 0) throw new Error("file changed while being hashed");
    hash.update(block.subarray(0, count));
    offset += count;
  }
  const after = fstatSync(fd);
  assertSameFile(before, after);
  return `sha256-${hash.digest("hex")}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
