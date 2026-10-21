import type { AnimationValue } from "./Keyframe.js";
import { PropertyBinding, findNode, parseTrackName, sanitizeNodeName, type PropertyBindingNode } from "./PropertyBinding.js";

/**
 * Animation-writable node shape. Beyond the legacy transform/weight fields it
 * accepts the optional `PropertyBinding` node members (`uuid`, `children`,
 * `skeleton`, `material`, `morphTargetDictionary`, `morphTargetInfluences`) so
 * three-style track paths (`node.material.opacity`,
 * `.morphTargetInfluences[smile]`, `uuid.position[x]`) resolve through the
 * same grammar (SA-03).
 */
export type SceneAnimationNode = PropertyBindingNode & {
  name?: string;
  position?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
  weights?: number[];
  /** Opt-in per SA-05: when true, morph weight writes are not clamped to [0, 1]. */
  unclampedMorphWeights?: boolean;
  setPosition?: (value: readonly [number, number, number]) => void;
  setRotation?: (value: readonly [number, number, number, number]) => void;
  setScale?: (value: readonly [number, number, number]) => void;
  setWeights?: (value: readonly number[]) => void;
};

export class SceneAnimationBridge {
  private readonly nodes = new Map<string, SceneAnimationNode>();
  private root: SceneAnimationNode | undefined;

  register(name: string, node: SceneAnimationNode): void {
    if (name.trim().length === 0) {
      throw new Error("Scene animation target name cannot be empty.");
    }
    this.nodes.set(name, node);
  }

  /**
   * Sets the hierarchy root used for `PropertyBinding.findNode` lookups:
   * node names not registered directly are searched through `root.children`
   * and `root.skeleton`, and empty/`root`-named paths resolve to the root
   * itself (three's `PropertyBinding.findNode` contract).
   */
  setRoot(node: SceneAnimationNode): void {
    this.root = node;
  }

  setAnimationValue(target: string, value: AnimationValue): void {
    let parsed;
    try {
      parsed = parseTrackName(target);
    } catch {
      throw new Error(`Invalid scene animation target ${target}.`);
    }
    const node = this.resolveNode(parsed.nodeName);
    if (!node) {
      throw new Error(`Missing scene animation target ${parsed.nodeName ?? "root"}.`);
    }
    const property = parsed.propertyName;
    const propertyIndex = parsed.propertyIndex;
    if (parsed.objectName) {
      this.setObjectProperty(node, parsed, value);
      return;
    }
    if (property === "position" || property === "translation") {
      writeVec3OrElement(node, "position", "setPosition", propertyIndex, value);
    } else if (property === "rotation" || property === "quaternion") {
      writeQuatOrElement(node, propertyIndex, value);
    } else if (property === "scale") {
      writeVec3OrElement(node, "scale", "setScale", propertyIndex, value);
    } else if (property === "weights" || property === "morphTargetInfluences") {
      writeWeights(node, value, propertyIndex);
    } else if (property in node) {
      // Generic property path (three binds any existing property).
      if (propertyIndex !== undefined) {
        writeArrayElement(node, property, componentIndex(propertyIndex), value);
      } else {
        node[property] = value;
      }
    } else {
      throw new Error(`Unsupported scene animation property ${property}.`);
    }
  }

  private resolveNode(nodeName: string | undefined): SceneAnimationNode | undefined {
    if (nodeName !== undefined && this.nodes.has(nodeName)) {
      return this.nodes.get(nodeName);
    }
    if (this.root) {
      const found = findNode(this.root, nodeName);
      if (found) {
        return found as SceneAnimationNode;
      }
    }
    // Directory-prefixed paths strip to their leaf name before lookup.
    if (nodeName !== undefined) {
      const leaf = nodeName.split(/[\/:]/).pop()!;
      if (leaf !== nodeName) {
        return this.nodes.get(leaf) ?? (this.root ? (findNode(this.root, leaf) as SceneAnimationNode | null) ?? undefined : undefined);
      }
    }
    return undefined;
  }

  private setObjectProperty(node: SceneAnimationNode, parsed: ReturnType<typeof parseTrackName>, value: AnimationValue): void {
    // Route object-accessor paths (`.material.opacity`, `.materials[0].opacity`,
    // `.bones[name].position`, `.map.repeat`) through a PropertyBinding so the
    // resolution matches three exactly. The parsed path is re-rooted at the
    // already-resolved node.
    const binding = new PropertyBinding(
      node as PropertyBindingNode,
      `${parsed.objectName}${parsed.objectIndex !== undefined ? `[${parsed.objectIndex}]` : ""}.${parsed.propertyName}${parsed.propertyIndex !== undefined ? `[${parsed.propertyIndex}]` : ""}`,
      { ...parsed, nodeName: undefined }
    );
    binding.bind();
    if (!binding.targetObject) {
      throw new Error(`Unsupported scene animation object ${parsed.objectName} on node ${parsed.nodeName ?? node.name ?? "root"}.`);
    }
    binding.setValue(value);
  }
}

function writeWeights(node: SceneAnimationNode, value: AnimationValue, propertyIndex?: string): void {
  if (propertyIndex !== undefined) {
    // Single morph influence element (`morphTargetInfluences[0]` or `[name]`).
    const array = resolveMorphArray(node);
    const index = resolveMorphIndex(node, propertyIndex);
    const scalar = requireScalarWeight(value);
    array[index] = node.unclampedMorphWeights ? scalar : Math.max(0, Math.min(1, scalar));
    return;
  }
  if (!Array.isArray(value) || value.some((weight) => typeof weight !== "number" || !Number.isFinite(weight))) {
    throw new Error("weights animation value must be a finite number array.");
  }
  const weights = node.unclampedMorphWeights
    ? value.map((weight) => weight as number)
    : value.map((weight) => Math.max(0, Math.min(1, weight as number)));
  if (node.setWeights) {
    node.setWeights(weights);
  } else if (node.morphTargetInfluences) {
    for (let index = 0; index < weights.length && index < node.morphTargetInfluences.length; index++) {
      node.morphTargetInfluences[index] = weights[index]!;
    }
  } else {
    node.weights = weights;
  }
}

function resolveMorphArray(node: SceneAnimationNode): number[] {
  if (node.morphTargetInfluences) {
    return node.morphTargetInfluences;
  }
  if (!node.weights) {
    const count = morphDictionarySize(node);
    node.weights = new Array<number>(Math.max(1, count)).fill(0);
  }
  return node.weights;
}

function morphDictionarySize(node: SceneAnimationNode): number {
  const dictionary = typeof node.morphTargetDictionary === "function" ? node.morphTargetDictionary() : node.morphTargetDictionary;
  return dictionary ? Object.keys(dictionary).length : 0;
}

function resolveMorphIndex(node: SceneAnimationNode, propertyIndex: string): number {
  const dictionary = typeof node.morphTargetDictionary === "function" ? node.morphTargetDictionary() : node.morphTargetDictionary;
  if (dictionary && dictionary[propertyIndex] !== undefined) {
    return dictionary[propertyIndex]!;
  }
  const index = Number(propertyIndex);
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`Unknown morph target accessor "${propertyIndex}" on node ${node.name ?? "root"}.`);
  }
  return index;
}

function requireScalarWeight(value: AnimationValue): number {
  const scalar = Array.isArray(value) ? value[0] : value;
  if (typeof scalar !== "number" || !Number.isFinite(scalar)) {
    throw new Error("morphTargetInfluences element animation value must be a finite number.");
  }
  return scalar;
}

const COMPONENT_INDEX: Record<string, number> = { x: 0, y: 1, z: 2, w: 3 };

function componentIndex(propertyIndex: string): number {
  if (propertyIndex in COMPONENT_INDEX) {
    return COMPONENT_INDEX[propertyIndex]!;
  }
  const index = Number(propertyIndex);
  return Number.isInteger(index) ? index : -1;
}

function writeVec3OrElement(node: SceneAnimationNode, property: "position" | "scale", setter: "setPosition" | "setScale", propertyIndex: string | undefined, value: AnimationValue): void {
  if (propertyIndex !== undefined) {
    writeArrayElement(node, property, componentIndex(propertyIndex), value);
    return;
  }
  if (!Array.isArray(value) || value.length !== 3) {
    throw new Error(`${property} animation value must be a vec3.`);
  }
  if (node[setter]) {
    node[setter](value as [number, number, number]);
  } else {
    node[property] = [value[0], value[1], value[2]];
  }
}

function writeQuatOrElement(node: SceneAnimationNode, propertyIndex: string | undefined, value: AnimationValue): void {
  if (propertyIndex !== undefined) {
    writeArrayElement(node, "rotation", componentIndex(propertyIndex), value);
    return;
  }
  if (!Array.isArray(value) || value.length !== 4) {
    throw new Error("rotation animation value must be a quaternion.");
  }
  if (node.setRotation) {
    node.setRotation(value as [number, number, number, number]);
  } else {
    node.rotation = [value[0], value[1], value[2], value[3]];
  }
}

function writeArrayElement(node: SceneAnimationNode, property: string, index: number, value: AnimationValue): void {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`Invalid index "${index}" for scene animation property ${property}.`);
  }
  const current = node[property];
  if (!Array.isArray(current)) {
    throw new Error(`Scene animation property ${property} on node ${node.name ?? "root"} is not indexable.`);
  }
  const scalar = Array.isArray(value) ? value[0] : value;
  if (typeof scalar !== "number" || !Number.isFinite(scalar)) {
    throw new Error(`${property}[${index}] animation value must be a finite number.`);
  }
  (current as number[])[index] = scalar;
}

export { sanitizeNodeName };
