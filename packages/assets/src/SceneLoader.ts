import { AnimationClip, type SerializedAnimationClip } from "@galileo3d/animation";
import { Renderable, Scene } from "@galileo3d/scene";
import type { AssetLoadRequest, AssetLoader } from "./AssetLoader";
import type { LoadContext } from "./LoadContext";

export interface NativeSceneNodeDescriptor {
  readonly name?: string;
  readonly translation?: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number, number];
  readonly scale?: readonly [number, number, number];
  readonly renderable?: {
    readonly geometry: string;
    readonly material: string;
    readonly morphWeights?: readonly number[];
  };
  readonly children?: readonly NativeSceneNodeDescriptor[];
}

export interface NativeSceneAsset {
  readonly url: string;
  readonly scene: Scene;
  readonly animations: readonly AnimationClip[];
}

export class SceneLoader implements AssetLoader<NativeSceneAsset> {
  readonly type = "scene";

  canLoad(request: AssetLoadRequest): boolean {
    return /\.scene\.json(?:\?.*)?$/i.test(request.url);
  }

  async load(request: AssetLoadRequest, context: LoadContext): Promise<NativeSceneAsset> {
    context.throwIfAborted(request.url);
    if (typeof fetch !== "function") {
      throw new Error("SceneLoader requires fetch");
    }
    const response = await fetch(request.url, { signal: request.signal });
    if (!response.ok) {
      throw new Error(`Scene request failed with ${response.status}`);
    }
    const descriptor = (await response.json()) as {
      readonly nodes?: readonly NativeSceneNodeDescriptor[];
      readonly animations?: readonly SerializedAnimationClip[];
    };
    const scene = new Scene();
    for (const node of descriptor.nodes ?? []) {
      scene.root.addChild(createNode(scene, node));
    }
    const animations = (descriptor.animations ?? []).map((animation) => AnimationClip.fromJSON(animation));
    return { url: request.url, scene, animations };
  }
}

function createNode(scene: Scene, descriptor: NativeSceneNodeDescriptor) {
  const node = scene.createNode(descriptor.name);
  if (descriptor.translation) node.transform.setPosition(descriptor.translation[0], descriptor.translation[1], descriptor.translation[2]);
  if (descriptor.rotation) node.transform.setRotation(descriptor.rotation[0], descriptor.rotation[1], descriptor.rotation[2], descriptor.rotation[3]);
  if (descriptor.scale) node.transform.setScale(descriptor.scale[0], descriptor.scale[1], descriptor.scale[2]);
  if (descriptor.renderable) scene.addRenderable(node, new Renderable(descriptor.renderable));
  for (const child of descriptor.children ?? []) node.addChild(createNode(scene, child));
  return node;
}
