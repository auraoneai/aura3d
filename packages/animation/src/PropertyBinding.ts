/**
 * Track-path resolution for animation property bindings.
 *
 * Provenance (reviewed 2026-11-02, WP-11/WP-29): this module replaced an
 * earlier explicitly attributed port (revision 3fbf87c45). The parser is a
 * single-pass character scanner with escapes and quoted accessors instead of
 * the earlier regular-expression grammar; node lookup is an iterative,
 * cycle-guarded depth-first search with UUID precedence; binding resolution
 * uses prototype-safe own/accessor lookup with kind-tagged dispatch. Retained
 * on purpose as the documented 4.x compatibility contract: the public names
 * (`parseTrackName`, `sanitizeNodeName`, `findNode`, `Composite`,
 * `nCachedObjects_`, `subscribe_`), the `node.object[index].property[index]`
 * path shape and the reserved delimiter set `[ ] . : /`. Review evidence and
 * the digest-bound record: docs/prds/aura3d-native-provenance-record.json.
 */
import type { AnimationValue } from "./Keyframe.js";

/** A track's optional hierarchy prefix, node, object and property selectors. */
export interface ParsedTrackName {
  readonly directoryName?: string;
  readonly nodeName?: string;
  readonly objectName?: string;
  readonly objectIndex?: string;
  readonly propertyName: string;
  readonly propertyIndex?: string;
}

export interface PropertyBindingNode {
  name?: string;
  uuid?: string;
  children?: readonly PropertyBindingNode[];
  skeleton?: {
    bones?: readonly PropertyBindingNode[];
    getBoneByName?: (name: string) => PropertyBindingNode | undefined;
  };
  material?: unknown;
  map?: unknown;
  morphTargetDictionary?: Record<string, number> | (() => Record<string, number>);
  morphTargetInfluences?: number[];
  needsUpdate?: boolean;
  matrixWorldNeedsUpdate?: boolean;
  [key: string]: unknown;
}

export interface AnimationObjectGroupLike {
  readonly isAnimationObjectGroup: true;
  readonly nCachedObjects_: number;
  subscribe_: (path: string, parsedPath?: ParsedTrackName) => readonly PropertyBindingLike[];
  /** Optional constant-time membership check for an existing subscription. */
  isBindingActive_?: (path: string, binding: PropertyBindingLike) => boolean;
}

export interface PropertyBindingLike {
  bind(): void;
  unbind(): void;
  getValue(): AnimationValue | undefined;
  setValue(value: AnimationValue): void;
}

const OBJECT_SEGMENTS = new Set(["material", "materials", "bones", "map"]);
const UNSAFE_KEYS = new Set(["__proto__", "prototype", "constructor"]);

/**
 * Parses `node.property[index]` and `node.object[index].property` paths.
 * Unescaped `.` separates selectors; `/` and `:` delimit a hierarchy prefix.
 * Escape any delimiter, bracket, quote or backslash with `\\`. Accessors may
 * also be quoted, e.g. `.weights["smile.right"]`. Names are Unicode strings.
 * The prefix is retained for callers; legacy lookup uses its leaf node name.
 */
export function parseTrackName(trackName: string): ParsedTrackName {
  const { dots, directories } = scanPath(trackName);
  const directoryEnd = directories.length ? directories[directories.length - 1]! + 1 : 0;
  const propertyDot = dots[dots.length - 1];
  if (propertyDot === undefined || propertyDot < directoryEnd) throw invalidPath(trackName);

  const property = parseSegment(trackName.slice(propertyDot + 1), trackName);
  const prefix = trackName.slice(directoryEnd, propertyDot);
  const precedingDot = dots.filter((position) => position >= directoryEnd && position < propertyDot).pop();
  let node = prefix;
  let object: Segment | undefined;
  if (precedingDot !== undefined) {
    const candidate = parseSegment(trackName.slice(precedingDot + 1, propertyDot), trackName);
    if (candidate.index !== undefined || OBJECT_SEGMENTS.has(candidate.name)) {
      object = candidate;
      node = trackName.slice(directoryEnd, precedingDot);
    }
  }
  // No brackets may appear in the remaining node selector; literal brackets
  // in a name must be escaped so a malformed object selector cannot be ignored.
  if (hasUnescapedBracket(node)) throw invalidPath(trackName);
  const result: ParsedTrackName = {
    directoryName: decodeEscapes(trackName.slice(0, directoryEnd), trackName),
    nodeName: node ? decodeEscapes(node, trackName) : undefined,
    objectName: object?.name,
    objectIndex: object?.index,
    propertyName: property.name,
    propertyIndex: property.index
  };
  assertSafePath(result, trackName);
  return result;
}

interface Segment { readonly name: string; readonly index?: string }

function invalidPath(path: string): Error {
  return new Error(`PropertyBinding: Cannot parse trackName: ${path}`);
}

function scanPath(path: string): { dots: number[]; directories: number[] } {
  if (!path) throw invalidPath(path);
  const dots: number[] = [];
  const directories: number[] = [];
  let bracket = -1;
  let quote: string | undefined;
  let quoteClosed = false;
  let afterBracket = false;
  for (let i = 0; i < path.length; i++) {
    const char = path[i]!;
    if (afterBracket && char !== ".") throw invalidPath(path);
    if (char === "\\") {
      if (++i >= path.length) throw invalidPath(path);
      continue;
    }
    if (bracket >= 0) {
      if (quote) {
        if (char === quote) { quote = undefined; quoteClosed = true; }
      } else if (i === bracket + 1 && (char === '"' || char === "'")) {
        quote = char;
      } else if (char === "]") {
        bracket = -1;
        quoteClosed = false;
        afterBracket = true;
      } else if (char === "[" || quoteClosed) {
        throw invalidPath(path);
      }
      continue;
    }
    if (char === "[") bracket = i;
    else if (char === "]") throw invalidPath(path);
    else if (char === ".") { dots.push(i); afterBracket = false; }
    else if (char === "/" || char === ":") directories.push(i);
  }
  if (bracket >= 0 || quote) throw invalidPath(path);
  return { dots, directories };
}

function decodeEscapes(text: string, path: string): string {
  let result = "";
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\\") {
      if (++i >= text.length) throw invalidPath(path);
    }
    result += text[i];
  }
  return result;
}

function hasUnescapedBracket(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\\") { i++; continue; }
    if (text[i] === "[" || text[i] === "]") return true;
  }
  return false;
}

function parseSegment(raw: string, path: string): Segment {
  if (!raw) throw invalidPath(path);
  let open = -1;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === "\\") { i++; continue; }
    if (raw[i] === "[") { open = i; break; }
  }
  if (open < 0) return { name: decodeEscapes(raw, path) };
  if (open === 0 || raw[raw.length - 1] !== "]") throw invalidPath(path);
  const name = decodeEscapes(raw.slice(0, open), path);
  let index = raw.slice(open + 1, -1);
  if (!index) throw invalidPath(path);
  if (index[0] === '"' || index[0] === "'") {
    if (index.length < 2 || index[index.length - 1] !== index[0]) throw invalidPath(path);
    index = index.slice(1, -1);
  }
  index = decodeEscapes(index, path);
  if (!index) throw invalidPath(path);
  return { name, index };
}

function assertSafePath(path: ParsedTrackName, source: string): void {
  const keys = [path.objectName, path.objectIndex, path.propertyName, path.propertyIndex];
  if (!path.propertyName || keys.some((key) => key !== undefined && UNSAFE_KEYS.has(String(key)))) {
    throw new Error(`PropertyBinding: Unsafe property path: ${source}`);
  }
}

export function sanitizeNodeName(name: string): string {
  return name.replace(/\s/g, "_").replace(/[\[\].:/]/g, "").replace(/\\/g, "");
}

/** UUIDs take precedence; duplicate names resolve in depth-first child order. */
export function findNode(root: PropertyBindingNode, nodeName: string | number | undefined): PropertyBindingNode | null {
  if (nodeName === undefined || nodeName === "" || nodeName === "." || nodeName === -1 || nodeName === root.uuid) return root;
  const bones = root.skeleton?.bones ?? [];
  const nodes: PropertyBindingNode[] = [];
  const pending = [...(root.children ?? [])].reverse();
  const visited = new Set<PropertyBindingNode>([root]);
  while (pending.length) {
    const candidate = pending.pop()!;
    if (visited.has(candidate)) continue;
    visited.add(candidate);
    nodes.push(candidate);
    if (candidate.children) {
      for (let i = candidate.children.length - 1; i >= 0; i--) pending.push(candidate.children[i]!);
    }
  }
  const byUuid = [...bones, ...nodes].find((candidate) => candidate.uuid === nodeName);
  if (byUuid) return byUuid;
  if (nodeName === root.name) return root;
  const bone = root.skeleton?.getBoneByName?.(String(nodeName));
  return bone ?? bones.find((candidate) => candidate.name === nodeName)
    ?? nodes.find((candidate) => candidate.name === nodeName) ?? null;
}

type RecordLike = Record<string | number, unknown>;
type Lookup = { found: true; value: unknown } | { found: false };

function isObject(value: unknown): value is RecordLike {
  return value !== null && (typeof value === "object" || typeof value === "function");
}

/** Own properties and declared class accessors are permitted; prototype data is not. */
function lookup(object: unknown, key: string | number): Lookup {
  if (!isObject(object) || UNSAFE_KEYS.has(String(key))) return { found: false };
  const own = Object.getOwnPropertyDescriptor(object, key);
  if (own) return { found: true, value: Reflect.get(object, key) };
  let prototype = Object.getPrototypeOf(object) as object | null;
  while (prototype && prototype !== Object.prototype && prototype !== Array.prototype) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, key);
    if (descriptor) {
      const constructor = Object.getOwnPropertyDescriptor(prototype, "constructor")?.value as { prototype?: unknown } | undefined;
      return (descriptor.get || descriptor.set) && typeof constructor === "function" && constructor.prototype === prototype
        ? { found: true, value: Reflect.get(object, key) }
        : { found: false };
    }
    prototype = Object.getPrototypeOf(prototype) as object | null;
  }
  return { found: false };
}

function numericIndex(key: string): number | undefined {
  if (!/^(0|[1-9]\d*)$/.test(key)) return undefined;
  const value = Number(key);
  return Number.isSafeInteger(value) ? value : undefined;
}

function isNumericArray(value: unknown): value is number[] | Float32Array | Float64Array {
  return Array.isArray(value) || (ArrayBuffer.isView(value) && !(value instanceof DataView)
    && !(value instanceof BigInt64Array) && !(value instanceof BigUint64Array));
}

function isArrayConvertible(value: unknown): value is { fromArray(values: ArrayLike<number>): void; toArray(): ArrayLike<number> } {
  const candidate = value as { fromArray?: unknown; toArray?: unknown } | null;
  return typeof candidate?.fromArray === "function" && typeof candidate?.toArray === "function";
}

type BindingKind = "direct" | "element" | "array" | "convertible";

// The group can revalidate membership after a lazy bind invokes a user getter.
// These operations stay internal to the module; the public binding methods
// retain their original signatures.
const readForGroup = Symbol("readForGroup");
const writeForGroup = Symbol("writeForGroup");

/** Resolves a track to an existing property; missing paths remain unbound. */
export class PropertyBinding implements PropertyBindingLike {
  static parseTrackName = parseTrackName;
  static sanitizeNodeName = sanitizeNodeName;
  static findNode = findNode;
  static get Composite(): typeof PropertyBindingComposite { return PropertyBindingComposite; }

  readonly path: string;
  readonly parsedPath: ParsedTrackName;
  readonly rootNode: PropertyBindingNode;
  node: PropertyBindingNode | null;
  targetObject: PropertyBindingNode | undefined;
  resolvedProperty: unknown;
  propertyName: string | undefined;
  propertyIndex: string | number | undefined;
  private kind: BindingKind = "direct";
  private bound = false;

  constructor(rootNode: PropertyBindingNode, path: string, parsedPath?: ParsedTrackName) {
    this.path = path;
    // Copy caller-owned descriptors so later mutation cannot redirect a binding.
    this.parsedPath = parsedPath ? { ...parsedPath } : parseTrackName(path);
    assertSafePath(this.parsedPath, path);
    this.rootNode = rootNode;
    this.node = findNode(rootNode, this.parsedPath.nodeName);
  }

  static create(root: PropertyBindingNode | AnimationObjectGroupLike, path: string, parsedPath?: ParsedTrackName): PropertyBindingLike {
    if ("isAnimationObjectGroup" in root && root.isAnimationObjectGroup) return new PropertyBindingComposite(root as AnimationObjectGroupLike, path, parsedPath);
    return new PropertyBinding(root as PropertyBindingNode, path, parsedPath);
  }

  bind(): void {
    this.bound = false;
    this.targetObject = undefined;
    this.resolvedProperty = undefined;
    this.propertyName = undefined;
    this.propertyIndex = undefined;
    assertSafePath(this.parsedPath, this.path);
    const node = this.node ?? findNode(this.rootNode, this.parsedPath.nodeName);
    this.node = node;
    if (!node) return;
    let target: unknown = node;
    const { objectName, propertyName } = this.parsedPath;
    let objectIndex = this.parsedPath.objectIndex;
    let propertyIndex: string | number | undefined = this.parsedPath.propertyIndex;
    if (objectName) {
      if (objectName === "materials") {
        const material = lookup(node, "material");
        const materials = material.found ? lookup(material.value, "materials") : { found: false as const };
        target = material.found && Array.isArray(material.value) ? material.value : materials.found ? materials.value : undefined;
      } else if (objectName === "bones") {
        const skeleton = lookup(node, "skeleton");
        const bones = skeleton.found ? lookup(skeleton.value, "bones") : { found: false as const };
        target = bones.found ? bones.value : undefined;
        if (Array.isArray(target) && objectIndex !== undefined) {
          let index = target.findIndex((bone: PropertyBindingNode) => bone?.uuid === objectIndex);
          if (index < 0) index = target.findIndex((bone: PropertyBindingNode) => bone?.name === objectIndex);
          if (index >= 0) objectIndex = String(index);
        }
      } else if (objectName === "map") {
        const direct = lookup(node, "map");
        const material = lookup(node, "material");
        const fallback = material.found ? lookup(material.value, "map") : { found: false as const };
        target = direct.found && direct.value !== undefined ? direct.value : fallback.found ? fallback.value : undefined;
      } else {
        const object = lookup(node, objectName);
        target = object.found ? object.value : undefined;
      }
      if (objectIndex !== undefined) {
        const entry = lookup(target, objectIndex);
        target = entry.found ? entry.value : undefined;
      }
    }
    if (!isObject(target)) return;
    const property = lookup(target, propertyName);
    if (!property.found || property.value === undefined) return;
    if (propertyIndex !== undefined) {
      if (propertyName === "morphTargetInfluences") {
        // This is a fixed API hook, not a user-selected property path; class
        // implementations may provide it as a prototype method.
        const dictionarySource = (target as PropertyBindingNode).morphTargetDictionary;
        const dictionary = typeof dictionarySource === "function" ? dictionarySource.call(target) : dictionarySource;
        const named = lookup(dictionary, propertyIndex);
        if (named.found && typeof named.value === "number" && Number.isSafeInteger(named.value) && named.value >= 0) propertyIndex = named.value;
        else {
          const index = numericIndex(propertyIndex);
          if (index === undefined) return;
          propertyIndex = index;
        }
      } else if (typeof propertyIndex === "string" && isNumericArray(property.value)) {
        const components: Record<string, number> = { x: 0, y: 1, z: 2, w: 3 };
        const index = Object.hasOwn(components, propertyIndex) ? components[propertyIndex] : numericIndex(propertyIndex);
        if (index === undefined) return;
        propertyIndex = index;
      }
      const entry = lookup(property.value, propertyIndex);
      if (!entry.found || entry.value === undefined) return;
      this.kind = "element";
      this.resolvedProperty = property.value;
      this.propertyIndex = propertyIndex;
    } else if (isArrayConvertible(property.value)) {
      this.kind = "convertible";
      this.resolvedProperty = property.value;
    } else if (isNumericArray(property.value)) {
      this.kind = "array";
      this.resolvedProperty = property.value;
    } else {
      this.kind = "direct";
      this.propertyName = propertyName;
    }
    this.targetObject = target as PropertyBindingNode;
    this.bound = true;
  }

  unbind(): void {
    this.node = null;
    this.targetObject = undefined;
    this.resolvedProperty = undefined;
    this.propertyName = undefined;
    this.propertyIndex = undefined;
    this.bound = false;
  }

  getValue(): AnimationValue | undefined {
    return this[readForGroup]();
  }

  [readForGroup](isActive?: () => boolean): AnimationValue | undefined {
    if (!this.bound) this.bind();
    if (!this.bound || (isActive && !isActive())) return undefined;
    if (this.kind === "element") return (this.resolvedProperty as RecordLike)[this.propertyIndex!] as AnimationValue;
    if (this.kind === "array") return Array.from(this.resolvedProperty as ArrayLike<number>);
    if (this.kind === "convertible") return Array.from((this.resolvedProperty as { toArray(): ArrayLike<number> }).toArray());
    return this.targetObject![this.propertyName!] as AnimationValue;
  }

  setValue(value: AnimationValue): void {
    this[writeForGroup](value);
  }

  [writeForGroup](value: AnimationValue, isActive?: () => boolean): void {
    if (!this.bound) this.bind();
    if (!this.bound || (isActive && !isActive())) return;
    // A setter can uncache or dispose its own group, which unbinds this
    // binding while the assignment is in progress. Keep the actual target
    // that received the write so invalidation remains safe and accurate.
    const target = this.targetObject!;
    if (this.kind === "element") (this.resolvedProperty as RecordLike)[this.propertyIndex!] = value;
    else if (this.kind === "array") {
      if (!Array.isArray(value)) throw new Error(`PropertyBinding: Expected an array for ${this.path}.`);
      const destination = this.resolvedProperty as number[];
      for (let i = 0; i < Math.min(destination.length, value.length); i++) destination[i] = value[i]!;
    } else if (this.kind === "convertible") {
      if (!Array.isArray(value)) throw new Error(`PropertyBinding: Expected an array for ${this.path}.`);
      (this.resolvedProperty as { fromArray(values: ArrayLike<number>): void }).fromArray(value);
    } else target[this.propertyName!] = value;
    if (target.isMaterial === true) target.needsUpdate = true;
    else if (target.isObject3D === true) {
      target.matrixWorldNeedsUpdate = true;
      // Aura3D scene nodes cache transforms separately from their object fields.
      // Updating a vector in place must invalidate that cache as well.
      const transform = target.transform as { markDirty?: () => unknown } | undefined;
      transform?.markDirty?.();
    }
  }
}

// Capture the original dispatch methods once so a consumer's later prototype
// override continues to receive composite calls through its public method.
const defaultGetValue = PropertyBinding.prototype.getValue;
const defaultSetValue = PropertyBinding.prototype.setValue;

/**
 * Fans a path out over active group members. Each operation snapshots the
 * active binding identities at its start. New members wait for the next
 * operation; members removed, uncached, unsubscribed or disposed before their
 * turn are skipped. A member removed and reactivated before its turn remains
 * eligible if it still has the same binding. Nested calls take new snapshots.
 */
export class PropertyBindingComposite implements PropertyBindingLike {
  private readonly targetGroup: AnimationObjectGroupLike;
  private readonly bindings: readonly PropertyBindingLike[];
  private readonly path: string;

  constructor(targetGroup: AnimationObjectGroupLike, path: string, optionalParsedPath?: ParsedTrackName) {
    const parsedPath = optionalParsedPath ?? parseTrackName(path);
    assertSafePath(parsedPath, path);
    this.targetGroup = targetGroup;
    this.path = path;
    this.bindings = targetGroup.subscribe_(path, parsedPath);
  }

  private activeSnapshot(): PropertyBindingLike[] {
    return [...new Set(this.bindings.slice(this.targetGroup.nCachedObjects_).filter((binding) => binding != null))];
  }

  private isActive(binding: PropertyBindingLike): boolean {
    const check = this.targetGroup.isBindingActive_;
    if (typeof check === "function") return check.call(this.targetGroup, this.path, binding);
    // Support custom group-like implementations that predate the optional
    // membership method, using their live array and cached boundary.
    return this.bindings.indexOf(binding, this.targetGroup.nCachedObjects_) !== -1;
  }

  getValue(): AnimationValue | undefined {
    for (const binding of this.activeSnapshot()) {
      if (!this.isActive(binding)) continue;
      const value = binding instanceof PropertyBinding && binding.getValue === defaultGetValue
        ? binding[readForGroup](() => this.isActive(binding))
        : binding.getValue();
      if (value !== undefined && this.isActive(binding)) return value;
    }
    return undefined;
  }

  setValue(value: AnimationValue): void {
    for (const binding of this.activeSnapshot()) {
      if (!this.isActive(binding)) continue;
      if (binding instanceof PropertyBinding && binding.setValue === defaultSetValue) {
        binding[writeForGroup](value, () => this.isActive(binding));
      } else {
        binding.setValue(value);
      }
    }
  }

  bind(): void {
    for (const binding of this.activeSnapshot()) if (this.isActive(binding)) binding.bind();
  }

  unbind(): void {
    for (const binding of this.activeSnapshot()) if (this.isActive(binding)) binding.unbind();
  }
}
