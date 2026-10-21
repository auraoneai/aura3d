import type { AnimationValue } from "./Keyframe.js";

/**
 * SA-03 — three-compatible `PropertyBinding` (`three@0.185.x
 * src/animation/PropertyBinding.js`) adapted to Aura's value-oriented track
 * API: `getValue()`/`setValue()` exchange `AnimationValue`s directly instead of
 * writing into a flat buffer at an offset. The track-name grammar, node lookup
 * (`findNode`), and `sanitizeNodeName` are exact ports, so paths like
 * `nodeName.property[index]`, `.morphTargetInfluences[name]`,
 * `uuid.materials[0].opacity`, `parent/child.position`, and
 * `.bones[Armature.DEF_cog].position` resolve exactly as they do upstream.
 */

// Characters `[].:/` are reserved for track binding syntax.
const RESERVED_CHARS_RE = "\\[\\]\\.:\\/";
const RESERVED_RE = new RegExp("[" + RESERVED_CHARS_RE + "]", "g");

// Attempts to allow node names from any language: match everything except the
// reserved characters (three deliberately avoids `\w`).
const WORD_CHAR = "[^" + RESERVED_CHARS_RE + "]";
const WORD_CHAR_OR_DOT = "[^" + RESERVED_CHARS_RE.replace("\\.", "") + "]";

// Parent directories, delimited by '/' or ':'. Currently unused, but must be
// matched to parse the rest of the track name.
const DIRECTORY_RE = /((?:WC+[\/:])*)/.source.replace(/WC/g, WORD_CHAR);

// Target node. May contain word characters and '.' (e.g. 'foo.bar.baz').
const NODE_RE = /(WCOD+)?/.source.replace(/WCOD/g, WORD_CHAR_OR_DOT);

// Object on target node, and accessor (`materials[0]`).
const OBJECT_RE = /(?:\.(WC+)(?:\[(.+)\])?)?/.source.replace(/WC/g, WORD_CHAR);

// Property and accessor (`morphTargetInfluences[run]`, `position[x]`).
const PROPERTY_RE = /\.(WC+)(?:\[(.+)\])?/.source.replace(/WC/g, WORD_CHAR);

const TRACK_RE = new RegExp("^" + DIRECTORY_RE + NODE_RE + OBJECT_RE + PROPERTY_RE + "$");

const SUPPORTED_OBJECT_NAMES = ["material", "materials", "bones", "map"];

export interface ParsedTrackName {
  /** Directory prefix (`parent/child/` or `scene:name:`) — parsed but unused, matching three. */
  readonly directoryName?: string;
  readonly nodeName?: string;
  readonly objectName?: string;
  readonly objectIndex?: string;
  readonly propertyName: string;
  readonly propertyIndex?: string;
}

/**
 * Node shape `PropertyBinding` can bind to — structurally compatible with
 * `SceneAnimationNode`, `SceneNode`, and three-style duck-typed objects.
 */
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
}

export interface PropertyBindingLike {
  bind(): void;
  unbind(): void;
  getValue(): AnimationValue | undefined;
  setValue(value: AnimationValue): void;
}

export function parseTrackName(trackName: string): ParsedTrackName {
  const matches = TRACK_RE.exec(trackName);
  if (matches === null) {
    throw new Error(`PropertyBinding: Cannot parse trackName: ${trackName}`);
  }
  const results = {
    directoryName: matches[1],
    nodeName: matches[2],
    objectName: matches[3],
    objectIndex: matches[4],
    propertyName: matches[5],
    propertyIndex: matches[6]
  } as {
    directoryName?: string;
    nodeName?: string;
    objectName?: string;
    objectIndex?: string;
    propertyName: string;
    propertyIndex?: string;
  };

  const lastDot = results.nodeName?.lastIndexOf(".");
  if (lastDot !== undefined && lastDot !== -1) {
    const objectName = results.nodeName!.substring(lastDot + 1);
    // Object names must be checked against an allowlist. Otherwise there is no
    // way to parse 'foo.bar.baz': 'baz' must be a property, but 'bar' could be
    // the objectName, or part of a nodeName (which can include '.' characters).
    if (SUPPORTED_OBJECT_NAMES.indexOf(objectName) !== -1) {
      results.nodeName = results.nodeName!.substring(0, lastDot);
      results.objectName = objectName;
    }
  }

  if (results.propertyName === null || results.propertyName === undefined || results.propertyName.length === 0) {
    throw new Error(`PropertyBinding: can not parse propertyName from trackName: ${trackName}`);
  }

  return results;
}

export function sanitizeNodeName(name: string): string {
  return name.replace(/\s/g, "_").replace(RESERVED_RE, "");
}

export function findNode(root: PropertyBindingNode, nodeName: string | number | undefined): PropertyBindingNode | null {
  if (nodeName === undefined || nodeName === "" || nodeName === "." || nodeName === -1 || nodeName === root.name || nodeName === root.uuid) {
    return root;
  }

  // search into skeleton bones.
  if (root.skeleton) {
    const bone = root.skeleton.getBoneByName?.(String(nodeName));
    if (bone !== undefined) {
      return bone;
    }
    if (root.skeleton.bones) {
      const named = root.skeleton.bones.find((candidate) => candidate.name === nodeName || candidate.uuid === nodeName);
      if (named) {
        return named;
      }
    }
  }

  // search into node subtree.
  if (root.children) {
    const subTreeNode = searchNodeSubtree(root.children, nodeName);
    if (subTreeNode) {
      return subTreeNode;
    }
  }

  return null;
}

function searchNodeSubtree(children: readonly PropertyBindingNode[], nodeName: string | number): PropertyBindingNode | null {
  for (const childNode of children) {
    if (childNode.name === nodeName || childNode.uuid === nodeName) {
      return childNode;
    }
    if (childNode.children) {
      const result = searchNodeSubtree(childNode.children, nodeName);
      if (result) {
        return result;
      }
    }
  }
  return null;
}

enum BindingType {
  Direct = 0,
  EntireArray = 1,
  ArrayElement = 2,
  HasFromToArray = 3
}

enum Versioning {
  None = 0,
  NeedsUpdate = 1,
  MatrixWorldNeedsUpdate = 2
}

/**
 * Binds a parsed track path to a concrete property on a node resolved from
 * `rootNode`. `getValue`/`setValue` read and write `AnimationValue`s; on
 * failure to bind they become no-ops (three's unbound state).
 */
export class PropertyBinding {
  static parseTrackName = parseTrackName;
  static sanitizeNodeName = sanitizeNodeName;
  static findNode = findNode;
  /** three's `PropertyBinding.Composite` (lazy so the class can be declared below). */
  static get Composite(): typeof PropertyBindingComposite {
    return PropertyBindingComposite;
  }

  readonly path: string;
  readonly parsedPath: ParsedTrackName;
  readonly rootNode: PropertyBindingNode;
  node: PropertyBindingNode | null;
  targetObject: PropertyBindingNode | undefined;
  resolvedProperty: unknown;
  propertyName: string | undefined;
  propertyIndex: string | number | undefined;
  private bound = false;

  constructor(rootNode: PropertyBindingNode, path: string, parsedPath?: ParsedTrackName) {
    this.path = path;
    this.parsedPath = parsedPath ?? parseTrackName(path);
    this.rootNode = rootNode;
    this.node = findNode(rootNode, this.parsedPath.nodeName);
  }

  /**
   * Factory matching three's `PropertyBinding.create`: a root marked
   * `isAnimationObjectGroup` produces a composite binding shared across the
   * group's objects.
   */
  static create(root: PropertyBindingNode | AnimationObjectGroupLike, path: string, parsedPath?: ParsedTrackName): PropertyBindingLike {
    if (!("isAnimationObjectGroup" in root && root.isAnimationObjectGroup)) {
      return new PropertyBinding(root as PropertyBindingNode, path, parsedPath);
    }
    return new PropertyBindingComposite(root as AnimationObjectGroupLike, path, parsedPath);
  }

  bind(): void {
    let targetObject = this.node;
    const parsedPath = this.parsedPath;
    const objectName = parsedPath.objectName;
    const propertyName = parsedPath.propertyName;
    let propertyIndex: string | number | undefined = parsedPath.propertyIndex;

    if (!targetObject) {
      targetObject = findNode(this.rootNode, parsedPath.nodeName);
      this.node = targetObject;
    }

    this.bound = false;

    if (!targetObject) {
      console.warn(`PropertyBinding: No target node found for track: ${this.path}.`);
      return;
    }

    if (objectName) {
      let objectIndex: string | number | undefined = parsedPath.objectIndex;
      switch (objectName) {
        case "materials": {
          const material = targetObject.material as { materials?: PropertyBindingNode[] } | undefined;
          if (!material) {
            console.error("PropertyBinding: Can not bind to material as node does not have a material.", this);
            return;
          }
          if (!material.materials) {
            console.error("PropertyBinding: Can not bind to material.materials as node.material does not have a materials array.", this);
            return;
          }
          targetObject = material.materials as unknown as PropertyBindingNode;
          break;
        }
        case "bones": {
          if (!targetObject.skeleton) {
            console.error("PropertyBinding: Can not bind to bones as node does not have a skeleton.", this);
            return;
          }
          const bones = (targetObject.skeleton.bones ?? []) as PropertyBindingNode[];
          targetObject = bones as unknown as PropertyBindingNode;
          // support resolving bone names into indices.
          for (let i = 0; i < bones.length; i++) {
            if (bones[i]!.name === objectIndex) {
              objectIndex = i;
              break;
            }
          }
          break;
        }
        case "map": {
          if ("map" in targetObject) {
            targetObject = targetObject.map as PropertyBindingNode;
            break;
          }
          const material = targetObject.material as { map?: PropertyBindingNode } | undefined;
          if (!material) {
            console.error("PropertyBinding: Can not bind to material as node does not have a material.", this);
            return;
          }
          if (!material.map) {
            console.error("PropertyBinding: Can not bind to material.map as node.material does not have a map.", this);
            return;
          }
          targetObject = material.map;
          break;
        }
        default: {
          if (targetObject[objectName] === undefined) {
            console.error("PropertyBinding: Can not bind to objectName of node undefined.", this);
            return;
          }
          targetObject = targetObject[objectName] as PropertyBindingNode;
        }
      }

      if (objectIndex !== undefined) {
        const indexed = (targetObject as unknown as Record<string | number, unknown>)[objectIndex];
        if (indexed === undefined) {
          console.error("PropertyBinding: Trying to bind to objectIndex of objectName, but is undefined.", this, targetObject);
          return;
        }
        targetObject = indexed as PropertyBindingNode;
      }
    }

    // resolve property
    const nodeProperty = targetObject[propertyName];
    if (nodeProperty === undefined) {
      console.error(`PropertyBinding: Trying to update property for track: ${parsedPath.nodeName}.${propertyName} but it wasn't found.`, targetObject);
      return;
    }

    this.targetObject = targetObject;

    if (propertyIndex !== undefined) {
      // access a sub element of the property array (only primitives are supported right now)
      if (propertyName === "morphTargetInfluences") {
        // support resolving morphTarget names into indices.
        const dictionary = typeof targetObject.morphTargetDictionary === "function"
          ? targetObject.morphTargetDictionary()
          : targetObject.morphTargetDictionary;
        if (dictionary === undefined) {
          console.error("PropertyBinding: Can not bind to morphTargetInfluences because node does not have a morphTargetDictionary.", this);
          return;
        }
        if (dictionary[propertyIndex] !== undefined) {
          propertyIndex = dictionary[propertyIndex];
        } else if (!Number.isInteger(Number(propertyIndex))) {
          console.error(`PropertyBinding: Can not bind to morphTargetInfluences[${String(propertyIndex)}] because it is not a known morph target.`, this);
          return;
        } else {
          propertyIndex = Number(propertyIndex);
        }
      }
      // Other properties keep the accessor verbatim: `[0]` and `[x]` both
      // index `resolvedProperty` (three supports named components).
      this.resolvedProperty = nodeProperty;
      this.propertyIndex = propertyIndex;
      this.bindingType = BindingType.ArrayElement;
    } else if (isFromToArrayCapable(nodeProperty)) {
      this.resolvedProperty = nodeProperty;
      this.bindingType = BindingType.HasFromToArray;
      this.propertyName = undefined;
    } else if (Array.isArray(nodeProperty)) {
      this.resolvedProperty = nodeProperty;
      this.bindingType = BindingType.EntireArray;
      this.propertyName = undefined;
    } else {
      this.propertyName = propertyName;
      this.bindingType = BindingType.Direct;
    }

    this.versioning = (targetObject as { isMaterial?: boolean }).isMaterial === true
      ? Versioning.NeedsUpdate
      : (targetObject as { isObject3D?: boolean }).isObject3D === true
        ? Versioning.MatrixWorldNeedsUpdate
        : Versioning.None;

    this.bound = true;
  }

  unbind(): void {
    this.node = null;
    this.bound = false;
  }

  getValue(): AnimationValue | undefined {
    if (!this.bound) {
      this.bind();
      if (!this.bound) {
        return undefined;
      }
    }
    const target = this.targetObject!;
    switch (this.bindingType) {
      case BindingType.ArrayElement:
        return (this.resolvedProperty as Record<string | number, AnimationValue>)[this.propertyIndex as string | number];
      case BindingType.EntireArray:
        return [...(this.resolvedProperty as readonly number[])];
      case BindingType.HasFromToArray: {
        const source = (this.resolvedProperty as { toArray(): ArrayLike<number> }).toArray();
        return Array.from(source as ArrayLike<number>);
      }
      default:
        return target[this.propertyName!] as AnimationValue;
    }
  }

  setValue(value: AnimationValue): void {
    if (!this.bound) {
      this.bind();
      if (!this.bound) {
        return;
      }
    }
    const target = this.targetObject!;
    switch (this.bindingType) {
      case BindingType.ArrayElement:
        (this.resolvedProperty as Record<string | number, unknown>)[this.propertyIndex as string | number] = value;
        break;
      case BindingType.EntireArray: {
        const dest = this.resolvedProperty as number[];
        const source = value as readonly number[];
        for (let i = 0, n = dest.length; i !== n && i < source.length; i++) {
          dest[i] = source[i]!;
        }
        break;
      }
      case BindingType.HasFromToArray:
        (this.resolvedProperty as { fromArray(values: ArrayLike<number>): void }).fromArray(value as readonly number[]);
        break;
      default:
        target[this.propertyName!] = value;
    }
    if (this.versioning === Versioning.NeedsUpdate) {
      target.needsUpdate = true;
    } else if (this.versioning === Versioning.MatrixWorldNeedsUpdate) {
      target.matrixWorldNeedsUpdate = true;
    }
  }

  private bindingType: BindingType = BindingType.Direct;
  private versioning: Versioning = Versioning.None;
}

function isFromToArrayCapable(value: unknown): value is { fromArray(values: ArrayLike<number>): void; toArray(): ArrayLike<number> } {
  const candidate = value as { fromArray?: unknown; toArray?: unknown } | null;
  return typeof candidate?.fromArray === "function" && typeof candidate?.toArray === "function";
}

/**
 * three's `PropertyBinding.Composite`: fans a single track path out over every
 * object in an {@link AnimationObjectGroup}-compatible group. `getValue` reads
 * the first valid object; `setValue` writes all valid objects.
 */
export class PropertyBindingComposite implements PropertyBindingLike {
  private readonly targetGroup: AnimationObjectGroupLike;
  private readonly bindings: readonly PropertyBindingLike[];

  constructor(targetGroup: AnimationObjectGroupLike, path: string, optionalParsedPath?: ParsedTrackName) {
    const parsedPath = optionalParsedPath ?? parseTrackName(path);
    this.targetGroup = targetGroup;
    this.bindings = targetGroup.subscribe_(path, parsedPath);
  }

  getValue(): AnimationValue | undefined {
    this.bind();
    const firstValidIndex = this.targetGroup.nCachedObjects_;
    const binding = this.bindings[firstValidIndex];
    return binding?.getValue();
  }

  setValue(value: AnimationValue): void {
    const bindings = this.bindings;
    for (let i = this.targetGroup.nCachedObjects_, n = bindings.length; i !== n; ++i) {
      bindings[i]!.setValue(value);
    }
  }

  bind(): void {
    const bindings = this.bindings;
    for (let i = this.targetGroup.nCachedObjects_, n = bindings.length; i !== n; ++i) {
      bindings[i]!.bind();
    }
  }

  unbind(): void {
    const bindings = this.bindings;
    for (let i = this.targetGroup.nCachedObjects_, n = bindings.length; i !== n; ++i) {
      bindings[i]!.unbind();
    }
  }
}
