import { AnimationClip, type SerializedAnimationClip } from "@aura3d/animation";
import { Renderable, Scene } from "@aura3d/scene";
import { mergeAssetRequestOptions, redactAssetMessage, redactAssetUrl, type AssetLoadRequest, type AssetLoader } from "./AssetLoader";
import type { LoadContext } from "./LoadContext";
import { fetchBytes } from "./LoaderFetch";

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
    const url = context.resolve(request.url);
    const signal = context.signalFor(request.signal);
    const policy = mergeAssetRequestOptions(context.requestOptionsFor(url), request);
    // Progress belongs to the requesting owner and stops once it aborts.
    const bytes = await fetchBytes(url, signal, request.onProgress
      ? ({ loaded, total }) => { if (!signal?.aborted) request.onProgress!({ url, phase: "document", loadedBytes: loaded, ...(total !== undefined ? { totalBytes: total } : {}) }); }
      : undefined, { ...policy, maxBytes: policy.maxBytes ?? 64 * 1024 * 1024 });
    if (signal?.aborted) throw signal.reason ?? new DOMException("Scene load aborted", "AbortError");
    const safeUrl = redactAssetUrl(url);
    let parsed: unknown;
    try { parsed = JSON.parse(new TextDecoder().decode(bytes)); }
    catch (error) {
      // Parser messages can quote document content; keep only a redacted summary.
      const detail = error instanceof Error ? error.name : "Error";
      throw new Error(`Invalid scene JSON for ${safeUrl}`, { cause: new Error(redactAssetMessage(detail, url)) });
    }
    try { validateScene(parsed); }
    catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`${redactAssetMessage(detail, url)} (${safeUrl})`);
    }
    const descriptor = parsed as {
      readonly nodes?: readonly NativeSceneNodeDescriptor[];
      readonly animations?: readonly SerializedAnimationClip[];
    };
    const scene = new Scene();
    try {
      for (const node of descriptor.nodes ?? []) {
        scene.root.addChild(createNode(scene, node));
      }
      const animations = (descriptor.animations ?? []).map((animation) => AnimationClip.fromJSON(animation));
      if (signal?.aborted) throw signal.reason ?? new DOMException("Scene load aborted", "AbortError");
      request.onProgress?.({ url, phase: "complete", loadedBytes: bytes.byteLength, totalBytes: bytes.byteLength });
      return { url, scene, animations };
    } catch (error) {
      scene.dispose();
      throw error;
    }
  }

  dispose(asset: NativeSceneAsset): void { asset.scene.dispose(); }
}

function validateScene(value: unknown): void {
  if (!isRecord(value)) throw new Error("Scene document must be an object");
  rejectUnknown(value, ["nodes", "animations"], "scene");
  if (value.nodes !== undefined && !Array.isArray(value.nodes)) throw new Error("Scene nodes must be an array");
  if (value.animations !== undefined && !Array.isArray(value.animations)) throw new Error("Scene animations must be an array");
  for (const node of (value.nodes ?? []) as unknown[]) validateNode(node, 0);
}

function validateNode(value: unknown, depth: number): void {
  if (depth > 256) throw new Error("Scene node depth exceeds 256");
  if (!isRecord(value)) throw new Error("Scene node must be an object");
  rejectUnknown(value, ["name", "translation", "rotation", "scale", "renderable", "children"], "scene node");
  if (value.name !== undefined && typeof value.name !== "string") throw new Error("Scene node name must be a string");
  for (const [name, length] of [["translation", 3], ["rotation", 4], ["scale", 3]] as const) {
    const vector = value[name];
    if (vector !== undefined && (!Array.isArray(vector) || vector.length !== length || vector.some((component) => typeof component !== "number" || !Number.isFinite(component)))) {
      throw new Error(`Scene node ${name} must have ${length} finite components`);
    }
  }
  if (value.renderable !== undefined) {
    if (!isRecord(value.renderable)) throw new Error("Scene renderable must be an object");
    rejectUnknown(value.renderable, ["geometry", "material", "morphWeights"], "scene renderable");
    if (typeof value.renderable.geometry !== "string" || typeof value.renderable.material !== "string") throw new Error("Scene renderable geometry and material must be identifiers");
    if (value.renderable.morphWeights !== undefined && (!Array.isArray(value.renderable.morphWeights) || value.renderable.morphWeights.some((weight) => typeof weight !== "number" || !Number.isFinite(weight)))) {
      throw new Error("Scene morph weights must be finite numbers");
    }
  }
  if (value.children !== undefined && !Array.isArray(value.children)) throw new Error("Scene node children must be an array");
  for (const child of (value.children ?? []) as unknown[]) validateNode(child, depth + 1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rejectUnknown(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown) throw new Error(`Unsupported ${label} field: ${unknown}`);
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
