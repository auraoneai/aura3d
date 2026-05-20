import type { AnimationValue } from "./Keyframe.js";

export type SceneAnimationNode = {
  name?: string;
  position?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
  weights?: number[];
  setPosition?: (value: readonly [number, number, number]) => void;
  setRotation?: (value: readonly [number, number, number, number]) => void;
  setScale?: (value: readonly [number, number, number]) => void;
  setWeights?: (value: readonly number[]) => void;
};

export class SceneAnimationBridge {
  private readonly nodes = new Map<string, SceneAnimationNode>();

  register(name: string, node: SceneAnimationNode): void {
    if (name.trim().length === 0) {
      throw new Error("Scene animation target name cannot be empty.");
    }
    this.nodes.set(name, node);
  }

  setAnimationValue(target: string, value: AnimationValue): void {
    const [nodeName, property] = target.split(".");
    if (!nodeName || !property) {
      throw new Error(`Invalid scene animation target ${target}.`);
    }
    const node = this.nodes.get(nodeName);
    if (!node) {
      throw new Error(`Missing scene animation target ${nodeName}.`);
    }
    if (property === "position" || property === "translation") {
      writeVec3(node, "position", "setPosition", value);
    } else if (property === "rotation") {
      writeQuat(node, value);
    } else if (property === "scale") {
      writeVec3(node, "scale", "setScale", value);
    } else if (property === "weights") {
      writeWeights(node, value);
    } else {
      throw new Error(`Unsupported scene animation property ${property}.`);
    }
  }
}

function writeWeights(node: SceneAnimationNode, value: AnimationValue): void {
  if (!Array.isArray(value) || value.some((weight) => typeof weight !== "number" || !Number.isFinite(weight))) {
    throw new Error("weights animation value must be a finite number array.");
  }
  const weights = value.map((weight) => Math.max(0, Math.min(1, weight)));
  if (node.setWeights) {
    node.setWeights(weights);
  } else {
    node.weights = weights;
  }
}

function writeVec3(node: SceneAnimationNode, property: "position" | "scale", setter: "setPosition" | "setScale", value: AnimationValue): void {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new Error(`${property} animation value must be a vec3.`);
  }
  if (node[setter]) {
    node[setter](value as [number, number, number]);
  } else {
    node[property] = [value[0], value[1], value[2]];
  }
}

function writeQuat(node: SceneAnimationNode, value: AnimationValue): void {
  if (!Array.isArray(value) || value.length !== 4) {
    throw new Error("rotation animation value must be a quaternion.");
  }
  if (node.setRotation) {
    node.setRotation(value as [number, number, number, number]);
  } else {
    node.rotation = [value[0], value[1], value[2], value[3]];
  }
}
