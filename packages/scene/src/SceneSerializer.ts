import { ValidationError } from "@aura3d/core";
import { DirectionalLight } from "./DirectionalLight.js";
import { OrthographicCamera } from "./OrthographicCamera.js";
import { PerspectiveCamera } from "./PerspectiveCamera.js";
import { PointLight } from "./PointLight.js";
import { Renderable } from "./Renderable.js";
import { Scene } from "./Scene.js";
import type { SerializedSceneMetadata } from "./SceneMetadata.js";
import { SceneNode } from "./SceneNode.js";
import { SpotLight } from "./SpotLight.js";

export interface SerializedSceneNode {
  id: string;
  name: string;
  visible: boolean;
  layerMask: number;
  kind: "node" | "perspectiveCamera" | "orthographicCamera" | "directionalLight" | "pointLight" | "spotLight";
  transform: {
    position: [number, number, number];
    rotation: [number, number, number, number];
    scale: [number, number, number];
  };
  renderable?: {
    geometry: string;
    material: string;
    layerMask: number;
    castShadow: boolean;
    receiveShadow: boolean;
    morphWeights?: readonly number[];
    instanceTransforms?: readonly number[];
    instanceColors?: readonly number[];
  };
  camera?: {
    fovYRadians?: number;
    aspect?: number;
    left?: number;
    right?: number;
    bottom?: number;
    top?: number;
    near: number;
    far: number;
    zoom?: number;
    resizeMode?: "fit-vertical" | "fit-horizontal" | "preserve-frustum";
    viewport: { x: number; y: number; width: number; height: number };
  };
  light?: {
    color: [number, number, number];
    intensity: number;
    castsShadow: boolean;
    range?: number;
    angle?: number;
    penumbra?: number;
  };
  children: SerializedSceneNode[];
}

export interface SerializedScene {
  version: 1;
  metadata?: SerializedSceneMetadata;
  root: SerializedSceneNode;
}

export function serializeScene(scene: Scene): SerializedScene {
  return {
    version: 1,
    ...(scene.metadata.isEmpty ? {} : { metadata: scene.metadata.toJSON() }),
    root: serializeNode(scene.root)
  };
}

export function deserializeScene(serialized: SerializedScene): Scene {
  if (serialized.version !== 1) throw new ValidationError("SCENE_VERSION", `Unsupported scene version: ${serialized.version}`);
  const scene = new Scene();
  if (serialized.metadata) scene.metadata.replace(serialized.metadata);
  for (const child of serialized.root.children) {
    const node = deserializeNode(child);
    scene.root.addChild(node);
    scene.registerSubtree(node);
  }
  return scene;
}

function serializeNode(node: SceneNode): SerializedSceneNode {
  const renderable = node.renderable;
  return {
    id: node.id,
    name: node.name,
    visible: node.visible,
    layerMask: node.layerMask,
    kind: node instanceof PerspectiveCamera ? "perspectiveCamera" : node instanceof OrthographicCamera ? "orthographicCamera" : node instanceof DirectionalLight ? "directionalLight" : node instanceof PointLight ? "pointLight" : node instanceof SpotLight ? "spotLight" : "node",
    transform: {
      position: [...node.transform.position],
      rotation: [...node.transform.rotation],
      scale: [...node.transform.scale]
    },
    renderable: renderable ? {
      geometry: renderable.geometry,
      material: renderable.material,
      layerMask: renderable.layerMask,
      castShadow: renderable.castShadow,
      receiveShadow: renderable.receiveShadow,
      ...(renderable.morphWeights.length > 0 ? { morphWeights: [...renderable.morphWeights] } : {}),
      ...(renderable.instanceTransforms ? { instanceTransforms: [...renderable.instanceTransforms] } : {}),
      ...(renderable.instanceColors ? { instanceColors: [...renderable.instanceColors] } : {})
    } : undefined,
    camera: serializeCamera(node),
    light: serializeLight(node),
    children: node.children.map(serializeNode)
  };
}

function deserializeNode(data: SerializedSceneNode): SceneNode {
  const node =
    data.kind === "perspectiveCamera" ? new PerspectiveCamera({ id: data.id, name: data.name, fovYRadians: data.camera?.fovYRadians, aspect: data.camera?.aspect, near: data.camera?.near, far: data.camera?.far }) :
    data.kind === "orthographicCamera" ? new OrthographicCamera({ id: data.id, name: data.name, left: data.camera?.left, right: data.camera?.right, bottom: data.camera?.bottom, top: data.camera?.top, near: data.camera?.near, far: data.camera?.far, zoom: data.camera?.zoom, resizeMode: data.camera?.resizeMode }) :
    data.kind === "directionalLight" ? new DirectionalLight(data.name, data.id) :
    data.kind === "pointLight" ? new PointLight(data.name, data.id) :
    data.kind === "spotLight" ? new SpotLight(data.name, data.id) :
    new SceneNode({ id: data.id, name: data.name });
  node.visible = data.visible;
  node.layerMask = data.layerMask;
  node.transform.setPosition(...data.transform.position);
  node.transform.setRotation(...data.transform.rotation);
  node.transform.setScale(...data.transform.scale);
  if (data.camera && (node instanceof PerspectiveCamera || node instanceof OrthographicCamera)) node.setViewport(data.camera.viewport);
  if (data.light && (node instanceof DirectionalLight || node instanceof PointLight || node instanceof SpotLight)) {
    node.color = [...data.light!.color];
    node.intensity = data.light!.intensity;
    node.castsShadow = data.light!.castsShadow;
  }
  if (data.light?.range !== undefined && (node instanceof PointLight || node instanceof SpotLight)) node.range = data.light.range;
  if (data.light?.angle !== undefined && node instanceof SpotLight) node.angle = data.light.angle;
  if (data.light?.penumbra !== undefined && node instanceof SpotLight) node.penumbra = data.light.penumbra;
  if (data.renderable) node.renderable = new Renderable(data.renderable);
  for (const child of data.children) node.addChild(deserializeNode(child));
  return node;
}

function serializeCamera(node: SceneNode): SerializedSceneNode["camera"] {
  if (node instanceof PerspectiveCamera) {
    return {
      fovYRadians: node.fovYRadians,
      aspect: node.aspect,
      near: node.near,
      far: node.far,
      viewport: { ...node.viewport }
    };
  }
  if (node instanceof OrthographicCamera) {
    return {
      left: node.left,
      right: node.right,
      bottom: node.bottom,
      top: node.top,
      near: node.near,
      far: node.far,
      zoom: node.zoom,
      resizeMode: node.resizeMode,
      viewport: { ...node.viewport }
    };
  }
  return undefined;
}

function serializeLight(node: SceneNode): SerializedSceneNode["light"] {
  if (node instanceof DirectionalLight || node instanceof PointLight || node instanceof SpotLight) {
    const color = Array.isArray(node.color) ? [...node.color] as [number, number, number] : [node.color.x, node.color.y, node.color.z] as [number, number, number];
    return {
      color,
      intensity: node.intensity,
      castsShadow: node.castsShadow,
      ...(node instanceof PointLight || node instanceof SpotLight ? { range: node.range } : {}),
      ...(node instanceof SpotLight ? { angle: node.angle, penumbra: node.penumbra } : {})
    };
  }
  return undefined;
}
