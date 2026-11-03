import { ValidationError } from "@aura3d/core";
import type { ProjectionOptions } from "@aura3d/math";
import { Bounds3 } from "./Bounds.js";
import { validateCameraViewOffset, type CameraViewOffset } from "./Camera.js";
import { DirectionalLight } from "./DirectionalLight.js";
import { normalizeQuat, type Mat4, type Quat, type Vec3 } from "./MathTypes.js";
import { Group, InstancedMesh, Mesh, Object3D, SkinnedMesh } from "./Object3D.js";
import { OrthographicCamera } from "./OrthographicCamera.js";
import { PerspectiveCamera } from "./PerspectiveCamera.js";
import { PointLight } from "./PointLight.js";
import { MAX_RENDERABLE_SKINNING_JOINTS, Renderable } from "./Renderable.js";
import { RectAreaLight } from "./RectAreaLight.js";
import { Scene } from "./Scene.js";
import type { SceneAssetProvenance, SerializedSceneMetadata } from "./SceneMetadata.js";
import { SceneNode } from "./SceneNode.js";
import { SpotLight } from "./SpotLight.js";

export type SerializedSceneValue = null | boolean | number | string | SerializedSceneValue[] | { [key: string]: SerializedSceneValue };
type SerializedBoundsCoordinate = number | "Infinity" | "-Infinity" | "-0";

export interface SerializedSceneNode {
  id: string;
  name: string;
  visible: boolean;
  layerMask: number;
  kind: "node" | "perspectiveCamera" | "orthographicCamera" | "directionalLight" | "pointLight" | "spotLight" | "rectAreaLight";
  objectType?: "object3D" | "group" | "mesh" | "skinnedMesh" | "instancedMesh";
  userData?: { [key: string]: SerializedSceneValue };
  renderOrder?: number;
  frustumCulled?: boolean;
  localBounds?: {
    min: [SerializedBoundsCoordinate, SerializedBoundsCoordinate, SerializedBoundsCoordinate];
    max: [SerializedBoundsCoordinate, SerializedBoundsCoordinate, SerializedBoundsCoordinate];
  };
  transform: {
    position: [number, number, number];
    rotation: [number, number, number, number];
    scale: [number, number, number];
    /** Absent in older version-1 documents; defaults to the origin. */
    pivot?: [number, number, number];
    /** Linear remainder retained after decomposing a sheared local matrix. */
    linearResidual?: [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number];
    /** Explicit local matrix for nodes with automatic recomposition disabled. */
    localMatrix?: [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number];
    exactRotation?: true;
    negativeZero?: {
      position?: readonly number[];
      rotation?: readonly number[];
      scale?: readonly number[];
      pivot?: readonly number[];
      linearResidual?: readonly number[];
      localMatrix?: readonly number[];
    };
  };
  renderable?: {
    geometry: string;
    material: string;
    layerMask: number;
    castShadow: boolean;
    receiveShadow: boolean;
    sharedId?: string;
    skinning?: {
      jointCount: number;
      matrices: readonly number[];
      negativeZero?: readonly number[];
    };
    morphWeights?: readonly number[];
    instanceTransforms?: readonly number[];
    instanceColors?: readonly number[];
    negativeZero?: {
      morphWeights?: readonly number[];
      instanceTransforms?: readonly number[];
      instanceColors?: readonly number[];
    };
  };
  camera?: {
    fovYRadians?: number;
    /** Explicit FOV retained beneath a perspective physical-lens override. */
    authoredFovYRadians?: number;
    aspect?: number;
    focalLength?: number;
    filmGauge?: number;
    filmOffset?: number;
    viewOffset?: CameraViewOffset;
    depth?: ProjectionOptions;
    left?: number;
    right?: number;
    bottom?: number;
    top?: number;
    near: number;
    /** An infinite perspective far plane is encoded as -1 with `infiniteFar: true`. */
    far: number;
    /** Version-1 JSON-safe marker for an infinite perspective far plane. */
    infiniteFar?: true;
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
    width?: number;
    height?: number;
    twoSided?: boolean;
  };
  children: SerializedSceneNode[];
}

export interface SerializedScene {
  version: 1 | 2 | 3;
  metadata?: SerializedSceneMetadata;
  root: SerializedSceneNode;
  detached?: SerializedSceneNode[];
  registeredNodeIds?: string[];
  /** Version 3 only. Each payload requires the exact caller-provided adapter. */
  extensions?: SerializedSceneExtension[];
}

/** An adapter owns the meaning and schema of its JSON payload. */
export interface SerializedSceneExtension {
  id: string;
  version: number;
  nodeIds: string[];
  assetIds: string[];
  payload: SerializedSceneValue;
}

export interface SceneSerializationCapture {
  /** Every node referenced by the payload, including the root for scene-wide state. */
  readonly nodeIds: readonly string[];
  /** Every external asset referenced by the payload, registered in scene metadata. */
  readonly assetIds?: readonly string[];
  readonly payload: SerializedSceneValue;
}

export interface SceneSerializationCaptureContext {
  readonly scene: Scene;
  /** Includes serialized, unregistered nodes in detached hierarchies. */
  readonly nodeIds: readonly string[];
  readonly assetIds: readonly string[];
  getNode(id: string): SceneNode;
}

export type SceneSerializationDisposer = () => void | Promise<void>;

/**
 * Register ownership immediately after allocation, before any operation that
 * can throw or await. Registered functions run once, in reverse order, on
 * rollback or on the returned owner's dispose. Registration is only valid
 * until the callback which received this scope settles.
 */
export interface SceneSerializationDisposeScope {
  deferDispose(dispose: SceneSerializationDisposer): void;
}

export interface SceneSerializationRestoreContext extends SceneSerializationDisposeScope {
  readonly scene: Scene;
  readonly nodeIds: readonly string[];
  readonly assetIds: readonly string[];
  /** Only IDs declared by this extension may be requested. */
  getNode(id: string): SceneNode;
  /** Assets are borrowed unless the resolver registers their disposal. */
  getAsset(id: string): unknown;
}

/**
 * Adapters are supplied by the runtime owner, not imported or auto-discovered
 * by @aura3d/scene. IDs must be unique, versions positive safe integers, and
 * capture is synchronous, read-only and must not acquire resources. Returning
 * undefined omits an extension; mutations by a capture are not rolled back.
 * Runtime state must live outside scene-owned objects; adapters do not bypass
 * the serializer's checks for unsupported scene/node/renderable properties.
 */
export interface SceneSerializationAdapter {
  readonly id: string;
  readonly version: number;
  capture(context: SceneSerializationCaptureContext): SceneSerializationCapture | undefined;
  restore(context: SceneSerializationRestoreContext, payload: SerializedSceneValue): unknown | Promise<unknown>;
}

export interface SceneSerializationOptions {
  readonly adapters?: readonly SceneSerializationAdapter[];
}

export interface SceneDeserializationOptions extends SceneSerializationOptions {
  /**
   * Resolves each referenced metadata asset once, in first-reference order.
   * Return a non-null value or throw; validate the domain-specific asset in
   * the resolver/adapter. Leases remain borrowed unless deferDispose is used.
   */
  readonly resolveAsset?: (
    asset: SceneAssetProvenance,
    scope: SceneSerializationDisposeScope
  ) => unknown | Promise<unknown>;
}

/**
 * The caller owns this handle and must await dispose rather than dispose the
 * scene directly. It releases adapters/assets first, then the entire restored
 * forest, including unregistered detached nodes (the root follows Scene.dispose).
 */
export interface RestoredScene {
  readonly scene: Scene;
  /** Runtime values returned by handlers, keyed by adapter ID. */
  readonly extensions: ReadonlyMap<string, unknown>;
  dispose(): Promise<void>;
}

/**
 * Snapshot scene-owned state, not external asset, animation-runtime or mixer
 * ownership. JSON-safe node userData is preserved verbatim as metadata; it
 * does not cause a skeleton, clip or mixer to be reconstructed on load.
 * Opt-in adapters capture separate, versioned data without relaxing that
 * boundary. A capture must not mutate the scene.
 */
export function serializeScene(scene: Scene, options?: SceneSerializationOptions): SerializedScene {
  const adapters = readAdapters(readSerializationOptions(options).adapters);
  const { serialized, context } = serializeSceneBase(scene);
  if (adapters.size === 0) return serialized;

  const nodes = new Map([...context.nodes].map((node) => [node.id, node]));
  const assets = readAssetReferences(serialized.metadata);
  const captureContext: SceneSerializationCaptureContext = {
    scene,
    nodeIds: Object.freeze([...nodes.keys()]),
    assetIds: Object.freeze([...assets.keys()]),
    getNode(id) {
      const node = nodes.get(id);
      if (!node) throw new ValidationError("SCENE_ADAPTER_NODE", `Unknown scene node ID: ${String(id)}.`);
      return node;
    }
  };
  const extensions: SerializedSceneExtension[] = [];
  for (const adapter of adapters.values()) {
    let captured: unknown;
    try {
      captured = adapter.capture.call(adapter.owner, captureContext);
    } catch (cause) {
      throw new ValidationError("SCENE_ADAPTER_CAPTURE", `Scene adapter ${adapter.id} capture failed.`, { cause });
    }
    if (captured === undefined) continue;
    // Async capture is not supported. Consume an accidentally rejected native
    // promise so that reporting this contract violation is not an unhandled rejection.
    if (captured instanceof Promise) {
      void captured.catch(() => undefined);
      throw new ValidationError("SCENE_ADAPTER_CAPTURE", `Scene adapter ${adapter.id} capture must be synchronous.`);
    }
    extensions.push(readCapturedExtension(adapter, captured, nodes, assets));
  }

  // Adapters observe a complete snapshot; a callback cannot silently change
  // scene-owned state between that snapshot and its extension payload.
  let after: { serialized: SerializedScene; context: SerializationContext };
  try {
    after = serializeSceneBase(scene);
  } catch (cause) {
    throw new ValidationError("SCENE_ADAPTER_MUTATION", "Scene changed during adapter capture.", { cause });
  }
  const originalNodes = [...context.nodes];
  const resultingNodes = [...after.context.nodes];
  if (JSON.stringify(after.serialized) !== JSON.stringify(serialized) || originalNodes.length !== resultingNodes.length ||
      originalNodes.some((node, index) => node !== resultingNodes[index])) {
    throw new ValidationError("SCENE_ADAPTER_MUTATION", "Scene changed during adapter capture.");
  }
  if (extensions.length === 0) return serialized;
  return {
    ...serialized,
    version: 3,
    detached: serialized.detached ?? [],
    registeredNodeIds: serialized.registeredNodeIds ?? scene.getRegisteredNodes().map((node) => node.id),
    extensions
  };
}

function serializeSceneBase(scene: Scene): { serialized: SerializedScene; context: SerializationContext } {
  assertNoBindingState(scene);
  assertKnownProperties(scene, SCENE_PROPERTIES, "scene", "SCENE_STATE");
  const metadata = scene.metadata.isEmpty ? undefined : scene.metadata.toJSON();
  if (metadata) validateMetadataNumbers(metadata);
  const registered = scene.getRegisteredNodes();
  const rootNode = scene.root;
  const context: SerializationContext = {
    userData: new Set(), renderables: new Map(), nextRenderableId: 1,
    nodes: new Set(), ids: new Set(), hierarchy: new Map()
  };
  const root = serializeNode(rootNode, context, null);
  const detached: SerializedSceneNode[] = [];
  for (const node of registered) {
    if (context.nodes.has(node)) continue;
    let ancestor = node;
    const chain = new Set<SceneNode>();
    while (ancestor.parent !== null) {
      if (chain.has(ancestor)) {
        throw new ValidationError("SCENE_HIERARCHY", "Scene detached hierarchy contains a cycle.");
      }
      chain.add(ancestor);
      const parent = ancestor.parent;
      if (!(parent instanceof SceneNode) || !Array.isArray(parent.children) ||
          parent.children.filter((child) => child === ancestor).length !== 1 || context.nodes.has(parent)) {
        throw new ValidationError("SCENE_HIERARCHY", "Scene detached hierarchy contains an inconsistent parent link.");
      }
      ancestor = parent;
    }
    detached.push(serializeNode(ancestor, context, null));
    if (!context.nodes.has(node)) {
      throw new ValidationError("SCENE_HIERARCHY", "Scene detached hierarchy does not contain its registered node.");
    }
  }
  for (const [node, snapshot] of context.hierarchy) {
    if (node.disposed || node.id !== snapshot.id || node.parent !== snapshot.parent || !Array.isArray(node.children) ||
        node.children.length !== snapshot.children.length || snapshot.children.some((child, index) => node.children[index] !== child)) {
      throw new ValidationError("SCENE_HIERARCHY", "Scene hierarchy changed during serialization.");
    }
  }
  const after = scene.getRegisteredNodes();
  if (scene.root !== rootNode || registered.length !== after.length || registered.some((node, index) => node !== after[index])) {
    throw new ValidationError("SCENE_REGISTRY", "Scene registry changed during serialization.");
  }
  const traversed = [...context.nodes];
  const legacy = detached.length === 0 && registered.length === traversed.length &&
    registered.every((node, index) => node === traversed[index]);
  const serialized: SerializedScene = legacy
    ? { version: 1, ...(metadata ? { metadata } : {}), root }
    : { version: 2, ...(metadata ? { metadata } : {}), root, detached, registeredNodeIds: registered.map((node) => node.id) };
  return { serialized, context };
}

export function deserializeScene(serialized: SerializedScene): Scene {
  if (serialized?.version === 3) {
    throw new ValidationError("SCENE_ADAPTER", "Version-3 scenes require deserializeSceneAsync and their matching adapters.");
  }
  return deserializeSceneBase(serialized).scene;
}

/**
 * Restore the complete base hierarchy first, resolve referenced assets once,
 * then invoke matching handlers sequentially in snapshot order. A failed
 * resolution or handler rolls back registered disposers in reverse order and
 * disposes the newly created scene. Version 1/2 documents need no adapters.
 */
export async function deserializeSceneAsync(
  serialized: SerializedScene,
  options?: SceneDeserializationOptions
): Promise<RestoredScene> {
  const parsedOptions = readDeserializationOptions(options);
  const adapters = readAdapters(parsedOptions.adapters);
  if (!serialized || typeof serialized !== "object" || Array.isArray(serialized) || serialized.version !== 3) {
    const { scene, instances } = deserializeSceneBase(serialized);
    return createRestoredScene(scene, instances, [], new Map());
  }

  assertNoBindingState(serialized);
  assertKnownProperties(serialized, SERIALIZED_EXTENDED_SCENE_PROPERTIES, "scene", "SCENE_STATE");
  const descriptor = Object.getOwnPropertyDescriptor(serialized, "extensions");
  if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
    throw new ValidationError("SCENE_ADAPTER", "Version-3 scenes require a data property containing extensions.");
  }
  const extensions = readSerializedExtensions(descriptor.value);
  const assets = readAssetReferences(serialized.metadata);
  for (const extension of extensions) {
    const adapter = adapters.get(extension.id);
    if (!adapter || adapter.version !== extension.version) {
      throw new ValidationError(
        "SCENE_ADAPTER",
        `Scene extension ${extension.id}@${extension.version} requires exactly one matching adapter.`
      );
    }
    for (const id of extension.assetIds) {
      if (!assets.has(id)) throw new ValidationError("SCENE_ASSET", `Scene extension ${extension.id} references unknown asset ID: ${id}.`);
    }
  }
  const assetOrder = [...new Set(extensions.flatMap((extension) => extension.assetIds))];
  if (assetOrder.length > 0 && !parsedOptions.resolveAsset) {
    throw new ValidationError("SCENE_ASSET", "A resolver is required for scene extension assets.");
  }

  // Version 3 uses the version-2 forest/registry representation. Constructing
  // a fresh envelope avoids passing extension state to the legacy reader.
  const base: SerializedScene = {
    version: 2,
    ...(serialized.metadata !== undefined ? { metadata: serialized.metadata } : {}),
    root: serialized.root,
    detached: serialized.detached,
    registeredNodeIds: serialized.registeredNodeIds
  };
  const { scene, instances } = deserializeSceneBase(base);
  const disposers: SceneSerializationDisposer[] = [];
  try {
    for (const extension of extensions) {
      for (const id of extension.nodeIds) {
        if (!instances.has(id)) throw new ValidationError("SCENE_ADAPTER_NODE", `Scene extension ${extension.id} references unknown node ID: ${id}.`);
      }
    }
    const resolvedAssets = new Map<string, unknown>();
    for (const id of assetOrder) {
      const scope = createDisposeScope(disposers);
      let resolved: unknown;
      try {
        resolved = await parsedOptions.resolveAsset!(assets.get(id)!, scope);
      } catch (cause) {
        throw new ValidationError("SCENE_ASSET", `Scene asset ${id} resolution failed.`, { cause });
      } finally {
        scope.close();
      }
      if (resolved === undefined || resolved === null) {
        throw new ValidationError("SCENE_ASSET", `Scene asset ${id} was not resolved.`);
      }
      resolvedAssets.set(id, resolved);
    }

    const values = new Map<string, unknown>();
    for (const extension of extensions) {
      const adapter = adapters.get(extension.id)!;
      const nodesForExtension = new Set(extension.nodeIds);
      const assetsForExtension = new Set(extension.assetIds);
      const scope = createDisposeScope(disposers);
      const context: SceneSerializationRestoreContext = {
        scene,
        nodeIds: Object.freeze([...extension.nodeIds]),
        assetIds: Object.freeze([...extension.assetIds]),
        deferDispose: scope.deferDispose,
        getNode(id) {
          const node = nodesForExtension.has(id) ? instances.get(id) : undefined;
          if (!node) throw new ValidationError("SCENE_ADAPTER_NODE", `Scene extension ${extension.id} did not declare node ID: ${String(id)}.`);
          return node;
        },
        getAsset(id) {
          if (!assetsForExtension.has(id) || !resolvedAssets.has(id)) {
            throw new ValidationError("SCENE_ASSET", `Scene extension ${extension.id} did not declare asset ID: ${String(id)}.`);
          }
          return resolvedAssets.get(id);
        }
      };
      try {
        values.set(extension.id, await adapter.restore.call(adapter.owner, context, extension.payload));
      } catch (cause) {
        throw new ValidationError("SCENE_ADAPTER_RESTORE", `Scene adapter ${extension.id} restore failed.`, { cause });
      } finally {
        scope.close();
      }
    }
    return createRestoredScene(scene, instances, disposers, values);
  } catch (error) {
    const cleanupErrors = await disposeRestoredScene(scene, instances, disposers);
    if (cleanupErrors.length) {
      throw new AggregateError([error, ...cleanupErrors], "Scene restoration failed and cleanup reported errors.", { cause: error });
    }
    throw error;
  }
}

function deserializeSceneBase(serialized: SerializedScene): { scene: Scene; instances: Map<string, SceneNode> } {
  if (!serialized || typeof serialized !== "object" || Array.isArray(serialized) ||
      (serialized.version !== 1 && serialized.version !== 2)) {
    throw new ValidationError("SCENE_VERSION", `Unsupported scene version: ${serialized?.version}`);
  }
  assertNoBindingState(serialized);
  assertKnownProperties(serialized, SERIALIZED_SCENE_PROPERTIES, "scene", "SCENE_STATE");
  if (serialized.version === 1 && (serialized.detached !== undefined || serialized.registeredNodeIds !== undefined)) {
    throw new ValidationError("SCENE_VERSION", "Version-1 scenes cannot contain detached hierarchies or an explicit registry.");
  }
  if (serialized.version === 2 && !Array.isArray(serialized.detached)) {
    throw new ValidationError("SCENE_HIERARCHY", "Version-2 scenes must contain a detached hierarchy array.");
  }
  if (serialized.version === 2 && !Array.isArray(serialized.registeredNodeIds)) {
    throw new ValidationError("SCENE_REGISTRY", "Version-2 scenes must contain a registered node ID array.");
  }
  const scene = new Scene();
  const context: DeserializationContext = {
    userData: new Set(), renderables: new Map(), nodes: new Set(), ids: new Set(), instances: new Map()
  };
  context.instances.set(scene.root.id, scene.root);
  try {
    if (serialized.metadata) {
      validateMetadataNumbers(serialized.metadata);
      scene.metadata.replace(serialized.metadata);
    }
    if (!serialized.root || serialized.root.id !== scene.root.id || serialized.root.kind !== "node" || serialized.root.objectType !== undefined) {
      throw new ValidationError("SCENE_ROOT", "Serialized scene root must be the ordinary root node with id root.");
    }
    registerSerializedNode(serialized.root, context);
    applyNodeState(scene.root, serialized.root, context);
    for (const child of serialized.root.children) {
      const node = deserializeNode(child, context);
      scene.root.addChild(node);
    }
    if (serialized.version === 1) {
      for (const child of scene.root.children) scene.registerSubtree(child);
      return { scene, instances: context.instances };
    }
    const detached = Array.from(serialized.detached!, (node) => deserializeNode(node, context));
    const registry = serialized.registeredNodeIds!;
    if (registry[0] !== scene.root.id) {
      throw new ValidationError("SCENE_REGISTRY", "Scene registry must begin with the root node ID.");
    }
    const registeredIds = new Set<string>();
    for (const id of registry) {
      if (typeof id !== "string" || registeredIds.has(id) || !context.instances.has(id)) {
        throw new ValidationError("SCENE_REGISTRY", "Scene registry contains a repeated or unknown registered node ID.");
      }
      registeredIds.add(id);
    }
    for (const root of detached) {
      const pending = [root];
      let registered = false;
      while (pending.length) {
        const node = pending.pop()!;
        if (registeredIds.has(node.id)) {
          registered = true;
          break;
        }
        pending.push(...node.children);
      }
      if (!registered) {
        throw new ValidationError("SCENE_REGISTRY", "Each detached hierarchy must contain a registered node.");
      }
    }
    for (const id of registry.slice(1)) scene.registerNode(context.instances.get(id)!);
    return { scene, instances: context.instances };
  } catch (error) {
    const cleanupErrors = disposeSceneInstances(scene, context.instances);
    if (cleanupErrors.length) {
      throw new AggregateError([error, ...cleanupErrors], "Scene deserialization failed and cleanup reported errors.", { cause: error });
    }
    throw error;
  }
}

type SerializedRenderable = NonNullable<SerializedSceneNode["renderable"]>;

interface SerializationContext {
  userData: Set<object>;
  renderables: Map<Renderable, { payload: SerializedRenderable; sharedId?: string }>;
  nextRenderableId: number;
  nodes: Set<SceneNode>;
  ids: Set<string>;
  hierarchy: Map<SceneNode, { id: string; parent: SceneNode | null; children: readonly SceneNode[] }>;
}

interface DeserializationContext {
  userData: Set<object>;
  renderables: Map<string, Renderable>;
  nodes: Set<object>;
  ids: Set<string>;
  instances: Map<string, SceneNode>;
}

interface RegisteredSceneAdapter {
  id: string;
  version: number;
  owner: object;
  capture: SceneSerializationAdapter["capture"];
  restore: SceneSerializationAdapter["restore"];
}

function readOption(options: unknown, name: string): unknown {
  if (options === undefined) return undefined;
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new ValidationError("SCENE_ADAPTER", "Scene serialization options must be an object.");
  }
  const descriptor = Object.getOwnPropertyDescriptor(options, name);
  if (!descriptor) return undefined;
  if (!("value" in descriptor)) throw new ValidationError("SCENE_ADAPTER", `Scene option ${name} must be a data property.`);
  return descriptor.value;
}

function readSerializationOptions(options: unknown): { adapters: unknown } {
  return { adapters: readOption(options, "adapters") };
}

function readDeserializationOptions(options: unknown): {
  adapters: unknown;
  resolveAsset?: NonNullable<SceneDeserializationOptions["resolveAsset"]>;
} {
  const adapters = readOption(options, "adapters");
  const resolveAsset = readOption(options, "resolveAsset");
  if (resolveAsset !== undefined && typeof resolveAsset !== "function") {
    throw new ValidationError("SCENE_ASSET", "Scene resolveAsset must be a function.");
  }
  return { adapters, ...(resolveAsset !== undefined ? { resolveAsset: resolveAsset as NonNullable<SceneDeserializationOptions["resolveAsset"]> } : {}) };
}

/** Accept ordinary object methods or class methods, but never invoke adapter getters. */
function readAdapterMember(adapter: object, name: string): unknown {
  let current: object | null = adapter;
  while (current && current !== Object.prototype) {
    const descriptor = Object.getOwnPropertyDescriptor(current, name);
    if (descriptor) {
      if (!("value" in descriptor)) throw new ValidationError("SCENE_ADAPTER", `Scene adapter ${name} must be a data property.`);
      return descriptor.value;
    }
    current = Object.getPrototypeOf(current) as object | null;
  }
  return undefined;
}

function validAdapterId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

function validAdapterVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function readAdapters(value: unknown): Map<string, RegisteredSceneAdapter> {
  const adapters = new Map<string, RegisteredSceneAdapter>();
  if (value === undefined) return adapters;
  if (!Array.isArray(value)) throw new ValidationError("SCENE_ADAPTER", "Scene adapters must be an array.");
  if (Object.getOwnPropertySymbols(value).length > 0 || Object.getOwnPropertyNames(value).length !== value.length + 1) {
    throw new ValidationError("SCENE_ADAPTER", "Scene adapters must be a dense array without extra properties.");
  }
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw new ValidationError("SCENE_ADAPTER", `Scene adapter at index ${index} must be a data property.`);
    }
    const owner: unknown = descriptor.value;
    if (owner === null || typeof owner !== "object" || Array.isArray(owner)) {
      throw new ValidationError("SCENE_ADAPTER", `Scene adapter at index ${index} must be an object.`);
    }
    const id = readAdapterMember(owner, "id");
    const version = readAdapterMember(owner, "version");
    const capture = readAdapterMember(owner, "capture");
    const restore = readAdapterMember(owner, "restore");
    if (!validAdapterId(id) || !validAdapterVersion(version) || typeof capture !== "function" || typeof restore !== "function") {
      throw new ValidationError("SCENE_ADAPTER", `Scene adapter at index ${index} needs a non-empty ID, positive integer version, capture and restore functions.`);
    }
    if (adapters.has(id)) throw new ValidationError("SCENE_ADAPTER", `Duplicate scene adapter ID: ${id}.`);
    adapters.set(id, {
      id, version, owner,
      capture: capture as SceneSerializationAdapter["capture"],
      restore: restore as SceneSerializationAdapter["restore"]
    });
  }
  return adapters;
}

function isJsonRecord(value: SerializedSceneValue): value is { [key: string]: SerializedSceneValue } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireJsonKeys(value: { [key: string]: SerializedSceneValue }, allowed: readonly string[], label: string, code: string): void {
  for (const name of Object.keys(value)) {
    if (!allowed.includes(name)) throw new ValidationError(code, `${label} contains unsupported property ${name}.`);
  }
}

function readIdList(value: SerializedSceneValue | undefined, label: string, code: string, nonEmpty = false): string[] {
  if (!Array.isArray(value) || (nonEmpty && value.length === 0)) {
    throw new ValidationError(code, `${label} must be ${nonEmpty ? "a non-empty" : "an"} array of unique non-empty IDs.`);
  }
  const result: string[] = [];
  const seen = new Set<string>();
  for (const id of value) {
    if (typeof id !== "string" || id.trim().length === 0 || seen.has(id)) {
      throw new ValidationError(code, `${label} must contain unique non-empty string IDs.`);
    }
    seen.add(id);
    result.push(id);
  }
  return result;
}

function readAssetReferences(metadata: SerializedSceneMetadata | undefined): Map<string, SceneAssetProvenance> {
  const assets = new Map<string, SceneAssetProvenance>();
  if (metadata === undefined) return assets;
  if (metadata === null || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new ValidationError("SCENE_ASSET", "Scene metadata must be an object.");
  }
  const descriptor = Object.getOwnPropertyDescriptor(metadata, "assets");
  if (!descriptor || ("value" in descriptor && descriptor.value === undefined)) return assets;
  if (!("value" in descriptor)) throw new ValidationError("SCENE_ASSET", "Scene metadata assets must be a data property.");
  const list = copyJsonValue(descriptor.value, "metadata assets", new Set(), "SCENE_ASSET");
  if (!Array.isArray(list)) throw new ValidationError("SCENE_ASSET", "Scene metadata assets must be an array.");
  const fields = ["id", "uri", "source", "loader", "version", "digest", "license", "nodeIds", "materialIds", "notes"];
  for (const asset of list) {
    if (!isJsonRecord(asset)) throw new ValidationError("SCENE_ASSET", "Scene asset reference must be an object.");
    requireJsonKeys(asset, fields, "Scene asset reference", "SCENE_ASSET");
    if (typeof asset.id !== "string" || asset.id.trim().length === 0 || assets.has(asset.id)) {
      throw new ValidationError("SCENE_ASSET", "Scene asset references require unique non-empty IDs.");
    }
    for (const field of ["uri", "source", "loader", "version", "digest", "license", "notes"]) {
      if (asset[field] !== undefined && typeof asset[field] !== "string") {
        throw new ValidationError("SCENE_ASSET", `Scene asset ${asset.id} ${field} must be a string.`);
      }
    }
    for (const field of ["nodeIds", "materialIds"]) {
      if (asset[field] !== undefined) readIdList(asset[field], `Scene asset ${asset.id} ${field}`, "SCENE_ASSET");
    }
    assets.set(asset.id, asset as unknown as SceneAssetProvenance);
  }
  return assets;
}

function readCapturedExtension(
  adapter: RegisteredSceneAdapter,
  value: unknown,
  nodes: ReadonlyMap<string, SceneNode>,
  assets: ReadonlyMap<string, SceneAssetProvenance>
): SerializedSceneExtension {
  const captured = copyJsonValue(value, `adapter ${adapter.id} capture`, new Set(), "SCENE_ADAPTER");
  if (!isJsonRecord(captured)) throw new ValidationError("SCENE_ADAPTER", `Scene adapter ${adapter.id} capture must be an object.`);
  requireJsonKeys(captured, ["nodeIds", "assetIds", "payload"], `Scene adapter ${adapter.id} capture`, "SCENE_ADAPTER");
  if (!Object.prototype.hasOwnProperty.call(captured, "payload")) {
    throw new ValidationError("SCENE_ADAPTER", `Scene adapter ${adapter.id} capture must include a payload.`);
  }
  const nodeIds = readIdList(captured.nodeIds, `Scene adapter ${adapter.id} nodeIds`, "SCENE_ADAPTER", true);
  const assetIds = captured.assetIds === undefined ? [] : readIdList(captured.assetIds, `Scene adapter ${adapter.id} assetIds`, "SCENE_ADAPTER");
  for (const id of nodeIds) {
    if (!nodes.has(id)) throw new ValidationError("SCENE_ADAPTER_NODE", `Scene adapter ${adapter.id} references unknown node ID: ${id}.`);
  }
  for (const id of assetIds) {
    if (!assets.has(id)) throw new ValidationError("SCENE_ASSET", `Scene adapter ${adapter.id} references unknown asset ID: ${id}.`);
  }
  return { id: adapter.id, version: adapter.version, nodeIds, assetIds, payload: captured.payload! };
}

function readSerializedExtensions(value: unknown): SerializedSceneExtension[] {
  const data = copyJsonValue(value, "extensions", new Set(), "SCENE_ADAPTER");
  if (!Array.isArray(data) || data.length === 0) {
    throw new ValidationError("SCENE_ADAPTER", "Version-3 scenes require a non-empty extensions array.");
  }
  const seen = new Set<string>();
  return data.map((extension) => {
    if (!isJsonRecord(extension)) throw new ValidationError("SCENE_ADAPTER", "Scene extension must be an object.");
    requireJsonKeys(extension, ["id", "version", "nodeIds", "assetIds", "payload"], "Scene extension", "SCENE_ADAPTER");
    const { id, version } = extension;
    if (!validAdapterId(id) || !validAdapterVersion(version) || seen.has(id) || !Object.prototype.hasOwnProperty.call(extension, "payload")) {
      throw new ValidationError("SCENE_ADAPTER", "Scene extensions need unique IDs, positive integer versions and payloads.");
    }
    seen.add(id);
    return {
      id, version,
      nodeIds: readIdList(extension.nodeIds, `Scene extension ${id} nodeIds`, "SCENE_ADAPTER", true),
      assetIds: readIdList(extension.assetIds, `Scene extension ${id} assetIds`, "SCENE_ADAPTER"),
      payload: extension.payload!
    };
  });
}

function createDisposeScope(disposers: SceneSerializationDisposer[]): SceneSerializationDisposeScope & { close(): void } {
  let open = true;
  return {
    deferDispose(dispose) {
      if (!open || typeof dispose !== "function") {
        throw new ValidationError("SCENE_ADAPTER_DISPOSE", "A disposal function must be registered while its callback is active.");
      }
      disposers.push(dispose);
    },
    close() { open = false; }
  };
}

function disposeSceneInstances(scene: Scene, instances: ReadonlyMap<string, SceneNode>): unknown[] {
  const errors: unknown[] = [];
  try {
    scene.dispose();
  } catch (error) {
    errors.push(error);
  }
  // Scene.dispose owns the registered forest. Also release detached,
  // unregistered ancestors/siblings and nodes created before a parse failed.
  for (const node of [...instances.values()].reverse()) {
    if (node === scene.root || node.disposed) continue;
    try {
      node.dispose({ recursive: false });
    } catch (error) {
      errors.push(error);
    }
  }
  return errors;
}

async function disposeRestoredScene(
  scene: Scene,
  instances: ReadonlyMap<string, SceneNode>,
  disposers: SceneSerializationDisposer[]
): Promise<unknown[]> {
  const errors: unknown[] = [];
  while (disposers.length > 0) {
    const dispose = disposers.pop()!;
    try {
      await dispose();
    } catch (error) {
      errors.push(error);
    }
  }
  return errors.concat(disposeSceneInstances(scene, instances));
}

function createRestoredScene(
  scene: Scene,
  instances: ReadonlyMap<string, SceneNode>,
  disposers: SceneSerializationDisposer[],
  extensions: Map<string, unknown>
): RestoredScene {
  let disposal: Promise<void> | undefined;
  return {
    scene,
    extensions,
    dispose() {
      if (!disposal) {
        // Publish the in-flight promise before invoking user disposers, so a
        // synchronous reentrant dispose cannot start a second cleanup.
        disposal = Promise.resolve().then(async () => {
          const errors = await disposeRestoredScene(scene, instances, disposers);
          extensions.clear();
          if (errors.length) throw new AggregateError(errors, "One or more restored scene resources could not be disposed.");
        });
      }
      return disposal;
    }
  };
}

function serializeNode(node: SceneNode, context: SerializationContext, parent: SceneNode | null): SerializedSceneNode {
  if (!(node instanceof SceneNode) || context.nodes.has(node) || node.parent !== parent ||
      typeof node.id !== "string" || !Array.isArray(node.children)) {
    throw new ValidationError("SCENE_HIERARCHY", "Scene hierarchy contains a cycle, repeated node, or inconsistent parent link.");
  }
  if (node.disposed) throw new ValidationError("SCENE_DISPOSED", "Disposed scene nodes cannot be serialized.");
  if (context.ids.has(node.id)) throw new ValidationError("DUPLICATE_SCENE_NODE", `Duplicate scene node id: ${node.id}`);
  context.nodes.add(node);
  context.ids.add(node.id);
  const children = [...node.children];
  context.hierarchy.set(node, { id: node.id, parent, children });
  assertSerializableNodeType(node);
  assertNoBindingState(node);
  assertKnownNodeProperties(node);
  if (node.onBeforeRender !== undefined) {
    throw new ValidationError("SCENE_CALLBACK", "Scene node onBeforeRender callbacks cannot be serialized.");
  }
  const renderable = node.renderable;
  const objectType = serializeObjectType(node);
  const userData = copyUserData(node.userData, context.userData);
  if (!Number.isFinite(node.renderOrder)) throw new ValidationError("SCENE_RENDER_ORDER", "Scene node renderOrder must be finite.");
  if (typeof node.frustumCulled !== "boolean") throw new ValidationError("SCENE_FRUSTUM_CULLED", "Scene node frustumCulled must be a boolean.");
  return {
    id: node.id,
    name: node.name,
    visible: node.visible,
    layerMask: node.layerMask,
    kind: node instanceof PerspectiveCamera ? "perspectiveCamera" : node instanceof OrthographicCamera ? "orthographicCamera" : node instanceof DirectionalLight ? "directionalLight" : node instanceof PointLight ? "pointLight" : node instanceof SpotLight ? "spotLight" : node instanceof RectAreaLight ? "rectAreaLight" : "node",
    ...(objectType ? { objectType } : {}),
    ...(Object.keys(userData).length ? { userData } : {}),
    ...(node.renderOrder !== 0 ? { renderOrder: node.renderOrder } : {}),
    ...(!node.frustumCulled ? { frustumCulled: false } : {}),
    ...(node.localBounds ? { localBounds: serializeBounds(node.localBounds) } : {}),
    transform: serializeTransform(node),
    renderable: renderable ? serializeRenderable(renderable, context) : undefined,
    camera: serializeCamera(node),
    light: serializeLight(node),
    children: children.map((child) => serializeNode(child, context, node))
  };
}

function deserializeNode(data: SerializedSceneNode, context: DeserializationContext): SceneNode {
  registerSerializedNode(data, context);
  if (!["node", "perspectiveCamera", "orthographicCamera", "directionalLight", "pointLight", "spotLight", "rectAreaLight"].includes(data.kind)) {
    throw new ValidationError("SCENE_NODE_TYPE", `Unsupported scene node kind: ${String(data.kind)}.`);
  }
  if (data.objectType !== undefined && (data.kind !== "node" ||
      !["object3D", "group", "mesh", "skinnedMesh", "instancedMesh"].includes(data.objectType))) {
    throw new ValidationError("SCENE_NODE_TYPE", `Unsupported scene object type: ${String(data.objectType)}.`);
  }
  const projection = data.kind === "perspectiveCamera" || data.kind === "orthographicCamera"
    ? readCameraProjectionFields(data.camera, data.kind === "perspectiveCamera")
    : undefined;
  const far = data.kind === "perspectiveCamera" || data.kind === "orthographicCamera"
    ? readCameraFar(data.camera, data.kind === "perspectiveCamera", projection?.depth)
    : undefined;
  const node =
    data.kind === "perspectiveCamera" ? new PerspectiveCamera({
      id: data.id, name: data.name, fovYRadians: projection?.authoredFovYRadians ?? data.camera?.fovYRadians,
      aspect: data.camera?.aspect, near: data.camera?.near, far,
      focalLength: projection?.focalLength, filmGauge: projection?.filmGauge, filmOffset: projection?.filmOffset,
      viewOffset: projection?.viewOffset, depth: projection?.depth
    }) :
    data.kind === "orthographicCamera" ? new OrthographicCamera({
      id: data.id, name: data.name, left: data.camera?.left, right: data.camera?.right,
      bottom: data.camera?.bottom, top: data.camera?.top, near: data.camera?.near, far,
      zoom: data.camera?.zoom, resizeMode: data.camera?.resizeMode,
      viewOffset: projection?.viewOffset, depth: projection?.depth
    }) :
    data.kind === "directionalLight" ? new DirectionalLight(data.name, data.id) :
    data.kind === "pointLight" ? new PointLight(data.name, data.id) :
    data.kind === "spotLight" ? new SpotLight(data.name, data.id) :
    data.kind === "rectAreaLight" ? new RectAreaLight(data.name, data.id) :
    data.objectType === "object3D" ? new Object3D({ id: data.id, name: data.name }) :
    data.objectType === "group" ? new Group({ id: data.id, name: data.name }) :
    data.objectType === "mesh" ? new Mesh({ id: data.id, name: data.name }) :
    data.objectType === "skinnedMesh" ? new SkinnedMesh({ id: data.id, name: data.name }) :
    data.objectType === "instancedMesh" ? new InstancedMesh({ id: data.id, name: data.name }) :
    new SceneNode({ id: data.id, name: data.name });
  context.instances.set(node.id, node);
  applyNodeState(node, data, context);
  if (data.camera && (node instanceof PerspectiveCamera || node instanceof OrthographicCamera)) node.setViewport(data.camera.viewport);
  if (data.light && (node instanceof DirectionalLight || node instanceof PointLight || node instanceof SpotLight || node instanceof RectAreaLight)) {
    node.color = [...data.light!.color];
    node.intensity = data.light!.intensity;
    node.castsShadow = data.light!.castsShadow;
  }
  if (data.light?.range !== undefined && (node instanceof PointLight || node instanceof SpotLight || node instanceof RectAreaLight)) node.range = data.light.range;
  if (data.light?.angle !== undefined && node instanceof SpotLight) node.angle = data.light.angle;
  if (data.light?.penumbra !== undefined && node instanceof SpotLight) node.penumbra = data.light.penumbra;
  if (data.light?.width !== undefined && node instanceof RectAreaLight) node.width = data.light.width;
  if (data.light?.height !== undefined && node instanceof RectAreaLight) node.height = data.light.height;
  if (data.light?.twoSided !== undefined && node instanceof RectAreaLight) node.twoSided = data.light.twoSided;
  for (const child of data.children) node.addChild(deserializeNode(child, context));
  return node;
}

function registerSerializedNode(data: SerializedSceneNode, context: DeserializationContext): void {
  if (data === null || typeof data !== "object" || Array.isArray(data) || typeof data.id !== "string" || !Array.isArray(data.children)) {
    throw new ValidationError("SCENE_HIERARCHY", "Serialized scene hierarchy must contain nodes with string IDs and children arrays.");
  }
  assertNoBindingState(data);
  assertKnownProperties(data, SERIALIZED_NODE_PROPERTIES, "node", "SCENE_STATE");
  if (context.nodes.has(data)) throw new ValidationError("SCENE_HIERARCHY", "Serialized scene hierarchy contains a cyclic or repeated node.");
  if (context.ids.has(data.id)) throw new ValidationError("DUPLICATE_SCENE_NODE", `Duplicate scene node id: ${data.id}`);
  context.nodes.add(data);
  context.ids.add(data.id);
}

function assertNoBindingState(value: object): void {
  for (const name of [
    "skeleton", "skeletonBinding", "skeletonBindings", "skinBinding", "skinningBinding", "skinningBindings",
    "jointNodeIds", "jointNodeIndices", "inverseBindMatrices",
    "animation", "animations", "animationBinding", "animationMixer", "mixerState", "animationState",
    "clipIds", "clipNames", "clips"
  ]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (descriptor && (!("value" in descriptor) || descriptor.value !== undefined)) {
      throw new ValidationError("SCENE_BINDING", `Scene ${name} state cannot be serialized or restored; external runtime bindings require an owner-provided adapter.`);
    }
  }
}

// These inventories include built-in bookkeeping that the scene reconstructs
// itself. New owned fields must be serialized or explicitly classified here;
// otherwise their presence fails rather than disappearing from a snapshot.
const SCENE_PROPERTIES: ReadonlySet<PropertyKey> = new Set([
  "root", "metadata", "nodesById", "pendingDisposal", "disposing", Symbol.for("@aura3d/scene/clone-owner")
]);
const SERIALIZED_SCENE_PROPERTIES: ReadonlySet<PropertyKey> = new Set([
  "version", "metadata", "root", "detached", "registeredNodeIds"
]);
const SERIALIZED_EXTENDED_SCENE_PROPERTIES: ReadonlySet<PropertyKey> = new Set([
  ...SERIALIZED_SCENE_PROPERTIES, "extensions"
]);
const SERIALIZED_NODE_PROPERTIES: ReadonlySet<PropertyKey> = new Set([
  "id", "name", "visible", "layerMask", "kind", "objectType", "userData", "renderOrder",
  "frustumCulled", "localBounds", "transform", "renderable", "camera", "light", "children"
]);
const NODE_PROPERTIES = [
  "id", "name", "visible", "layers", "renderOrder", "frustumCulled", "onBeforeRender", "disposed",
  "userData", "renderable", "transform", "propagateTransformDirty", "localBounds", "worldBounds", "children", "parent"
];
const RENDERABLE_PROPERTIES: ReadonlySet<PropertyKey> = new Set([
  "geometry", "material", "layerMask", "castShadow", "receiveShadow", "skinning", "morphWeights",
  "instanceTransforms", "instanceColors"
]);
const SERIALIZED_RENDERABLE_PROPERTIES: ReadonlySet<PropertyKey> = new Set([
  ...RENDERABLE_PROPERTIES, "sharedId", "negativeZero"
]);
const SKINNING_PROPERTIES: ReadonlySet<PropertyKey> = new Set(["jointCount", "matrices", "paletteKey"]);
const SERIALIZED_SKINNING_PROPERTIES: ReadonlySet<PropertyKey> = new Set(["jointCount", "matrices", "negativeZero"]);

/** Reject extra state, including non-enumerable/accessor state, without invoking getters. */
function assertKnownProperties(value: object, allowed: ReadonlySet<PropertyKey>, path: string, code: string): void {
  for (const name of Reflect.ownKeys(value)) {
    if (allowed.has(name)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (descriptor && ("value" in descriptor) && descriptor.value === undefined) continue;
    throw new ValidationError(code, `Scene ${path}.${String(name)} is unsupported; inert metadata belongs in JSON-safe node userData, and full runtime restoration requires a separate adapter.`);
  }
}

function assertKnownNodeProperties(node: SceneNode): void {
  const allowed = new Set<PropertyKey>(NODE_PROPERTIES);
  if (node instanceof Object3D) allowed.add("isObject3D");
  if (node instanceof Group) allowed.add("isGroup");
  if (node instanceof Mesh) allowed.add("isMesh");
  if (node instanceof SkinnedMesh) allowed.add("isSkinnedMesh");
  if (node instanceof InstancedMesh) allowed.add("isInstancedMesh");
  if (node instanceof PerspectiveCamera || node instanceof OrthographicCamera) {
    for (const name of [
      "viewport", "frustumPlanes", "frustum", "projectionMatrix", "projectionMatrixInverse", "viewMatrix",
      "viewProjectionMatrix", "depth", "viewOffset", "projectionMetadata", "near", "far"
    ]) allowed.add(name);
  }
  if (node instanceof PerspectiveCamera) {
    for (const name of ["authoredFovYRadians", "aspect", "focalLength", "filmGauge", "filmOffset"]) allowed.add(name);
  }
  if (node instanceof OrthographicCamera) {
    for (const name of ["left", "right", "bottom", "top", "zoom", "resizeMode"]) allowed.add(name);
  }
  if (node instanceof DirectionalLight || node instanceof PointLight || node instanceof SpotLight || node instanceof RectAreaLight) {
    for (const name of ["kind", "color", "castsShadow", "currentIntensity"]) allowed.add(name);
  }
  if (node instanceof PointLight || node instanceof SpotLight || node instanceof RectAreaLight) allowed.add("currentRange");
  if (node instanceof SpotLight) {
    allowed.add("currentAngle");
    allowed.add("currentPenumbra");
  }
  if (node instanceof RectAreaLight) {
    allowed.add("currentWidth");
    allowed.add("currentHeight");
    allowed.add("currentTwoSided");
  }
  assertKnownProperties(node, allowed, "node", "SCENE_STATE");
}

function assertSerializableNodeType(node: SceneNode): void {
  const prototype = Object.getPrototypeOf(node);
  const supported = [
    SceneNode.prototype, Object3D.prototype, Group.prototype, Mesh.prototype, SkinnedMesh.prototype, InstancedMesh.prototype,
    PerspectiveCamera.prototype, OrthographicCamera.prototype, DirectionalLight.prototype, PointLight.prototype,
    SpotLight.prototype, RectAreaLight.prototype
  ];
  if (!supported.includes(prototype)) {
    throw new ValidationError("SCENE_NODE_TYPE", `Custom scene node ${node.name} cannot be serialized as a built-in node type.`);
  }
}

function serializeObjectType(node: SceneNode): SerializedSceneNode["objectType"] {
  const prototype = Object.getPrototypeOf(node);
  if (prototype === SkinnedMesh.prototype) return "skinnedMesh";
  if (prototype === InstancedMesh.prototype) return "instancedMesh";
  if (prototype === Mesh.prototype) return "mesh";
  if (prototype === Group.prototype) return "group";
  if (prototype === Object3D.prototype) return "object3D";
  return undefined;
}

function applyNodeState(node: SceneNode, data: SerializedSceneNode, context: DeserializationContext): void {
  node.name = data.name;
  node.visible = data.visible;
  node.layerMask = data.layerMask;
  if (data.renderOrder !== undefined) {
    if (typeof data.renderOrder !== "number" || !Number.isFinite(data.renderOrder)) {
      throw new ValidationError("SCENE_RENDER_ORDER", "Scene node renderOrder must be finite.");
    }
    node.renderOrder = data.renderOrder;
  }
  if (data.frustumCulled !== undefined) {
    if (typeof data.frustumCulled !== "boolean") throw new ValidationError("SCENE_FRUSTUM_CULLED", "Scene node frustumCulled must be a boolean.");
    node.frustumCulled = data.frustumCulled;
  }
  if (data.userData !== undefined) node.userData = copyUserData(data.userData, context.userData);
  if (data.localBounds !== undefined) node.setLocalBounds(deserializeBounds(data.localBounds));
  applyTransform(node, data.transform);
  if (data.renderable) node.renderable = deserializeRenderable(data.renderable, context);
}

type SerializedTransform = SerializedSceneNode["transform"];
type TransformField = "position" | "rotation" | "scale" | "pivot" | "linearResidual" | "localMatrix";

function transformValues(value: unknown, length: number, name: TransformField): number[] {
  if (!Array.isArray(value) || value.length !== length) {
    throw new ValidationError("SCENE_TRANSFORM", `Scene transform ${name} must have ${length} finite coordinates.`);
  }
  const values = Array.from(value);
  if (!values.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))) {
    throw new ValidationError("SCENE_TRANSFORM", `Scene transform ${name} must have ${length} finite coordinates.`);
  }
  return values as number[];
}

function serializeTransform(node: SceneNode): SerializedTransform {
  const position = transformValues(node.transform.position, 3, "position") as Vec3;
  const rotation = transformValues(node.transform.rotation, 4, "rotation") as Quat;
  const scale = transformValues(node.transform.scale, 3, "scale") as Vec3;
  const pivot = transformValues(node.transform.pivot, 3, "pivot") as Vec3;
  const residualValue = node.transform.getLinearResidual();
  const linearResidual = residualValue ? transformValues(residualValue, 16, "linearResidual") as Mat4 : undefined;
  const localMatrix = node.transform.matrixAutoUpdate ? undefined : transformValues(node.transform.localMatrix, 16, "localMatrix") as Mat4;
  const includePivot = pivot.some((coordinate) => coordinate !== 0 || Object.is(coordinate, -0));
  const normalized = normalizeQuat(rotation);
  const exactRotation = rotation.some((coordinate, index) => !Object.is(coordinate, normalized[index]));
  const negativeZero: NonNullable<SerializedTransform["negativeZero"]> = {};
  const vectors: Array<[TransformField, readonly number[] | undefined]> = [
    ["position", position], ["rotation", rotation], ["scale", scale], ["pivot", includePivot ? pivot : undefined],
    ["linearResidual", linearResidual], ["localMatrix", localMatrix]
  ];
  for (const [name, values] of vectors) {
    const indices = values?.flatMap((coordinate, index) => Object.is(coordinate, -0) ? [index] : []) ?? [];
    if (indices.length) negativeZero[name] = indices;
  }
  return {
    position, rotation, scale,
    ...(includePivot ? { pivot } : {}),
    ...(linearResidual ? { linearResidual } : {}),
    ...(localMatrix ? { localMatrix } : {}),
    ...(exactRotation ? { exactRotation: true } : {}),
    ...(Object.keys(negativeZero).length ? { negativeZero } : {})
  };
}

function applyTransform(node: SceneNode, transform: SerializedTransform): void {
  if (!transform || typeof transform !== "object" || Array.isArray(transform)) {
    throw new ValidationError("SCENE_TRANSFORM", "Scene transform must be an object.");
  }
  const signs = transform.negativeZero;
  if (signs !== undefined && (signs === null || typeof signs !== "object" || Array.isArray(signs))) {
    throw new ValidationError("SCENE_TRANSFORM", "Scene transform negativeZero must be an object.");
  }
  const restore = (value: unknown, length: number, name: TransformField, required: boolean): number[] | undefined => {
    const indices = signs?.[name];
    if (value === undefined && !required && indices === undefined) return undefined;
    const result = transformValues(value, length, name);
    if (indices !== undefined) {
      if (!Array.isArray(indices)) throw new ValidationError("SCENE_TRANSFORM", `Scene transform ${name} negativeZero indices must be an array.`);
      const used = new Set<number>();
      for (const index of indices) {
        if (!Number.isInteger(index) || index < 0 || index >= result.length || result[index] !== 0 || used.has(index)) {
          throw new ValidationError("SCENE_TRANSFORM", `Scene transform ${name} has an invalid negativeZero index.`);
        }
        used.add(index);
        result[index] = -0;
      }
    }
    return result;
  };
  if (transform.exactRotation !== undefined && transform.exactRotation !== true) {
    throw new ValidationError("SCENE_TRANSFORM", "Scene transform exactRotation must be true when present.");
  }
  const position = restore(transform.position, 3, "position", true) as Vec3;
  const rotation = restore(transform.rotation, 4, "rotation", true) as Quat;
  const scale = restore(transform.scale, 3, "scale", true) as Vec3;
  const pivot = restore(transform.pivot, 3, "pivot", false) as Vec3 | undefined;
  const linearResidual = restore(transform.linearResidual, 16, "linearResidual", false) as Mat4 | undefined;
  const localMatrix = restore(transform.localMatrix, 16, "localMatrix", false) as Mat4 | undefined;
  node.transform.setPosition(...position);
  node.transform.setRotation(...rotation);
  if (transform.exactRotation) {
    for (let index = 0; index < rotation.length; index += 1) node.transform.rotation[index] = rotation[index]!;
    node.transform.markDirty();
  }
  node.transform.setScale(...scale);
  if (pivot) node.transform.setPivot(...pivot);
  if (linearResidual) node.transform.setLinearResidual(linearResidual);
  if (localMatrix) node.transform.setLocalMatrix(localMatrix, { decompose: false });
}

function validateMetadataNumbers(metadata: SerializedSceneMetadata): void {
  const validate = (value: unknown, name: string): void => {
    if (value === undefined || typeof value === "string") return;
    if (typeof value === "number" && Number.isFinite(value) && !Object.is(value, -0)) return;
    throw new ValidationError("SCENE_METADATA", `Scene metadata ${name} must be a JSON-safe string or number.`);
  };
  validate(metadata.deterministicSeed, "deterministicSeed");
  for (const plan of metadata.plans ?? []) validate(plan.deterministicSeed, "plan deterministicSeed");
  for (const revision of metadata.revisions ?? []) validate(revision.deterministicSeed, "revision deterministicSeed");
  for (const assignment of metadata.materialAssignments ?? []) validate(assignment.slot, "material slot");
}

function serializeRenderable(renderable: Renderable, context: SerializationContext): SerializedRenderable {
  const payload = serializeRenderableData(renderable);
  const previous = context.renderables.get(renderable);
  if (previous) {
    const sharedId = previous.sharedId ?? `renderable-${context.nextRenderableId++}`;
    previous.sharedId = sharedId;
    previous.payload.sharedId = sharedId;
    payload.sharedId = sharedId;
  } else {
    context.renderables.set(renderable, { payload });
  }
  return payload;
}

function serializeRenderableData(renderable: Renderable): SerializedRenderable {
  assertNoBindingState(renderable);
  assertKnownProperties(renderable, RENDERABLE_PROPERTIES, "renderable", "SCENE_RENDERABLE");
  const readValues = (value: unknown, name: string): number[] => {
    if (!Array.isArray(value) && !(value instanceof Float32Array)) {
      throw new ValidationError("SCENE_RENDERABLE", `Scene renderable ${name} must be an array.`);
    }
    const values = Array.from(value);
    if (!values.every((entry) => typeof entry === "number" && Number.isFinite(entry))) {
      throw new ValidationError("SCENE_RENDERABLE", `Scene renderable ${name} must contain finite numbers.`);
    }
    return values as number[];
  };
  const morphWeights = readValues(renderable.morphWeights, "morphWeights");
  const instanceTransforms = renderable.instanceTransforms === undefined ? undefined : readValues(renderable.instanceTransforms, "instanceTransforms");
  const instanceColors = renderable.instanceColors === undefined ? undefined : readValues(renderable.instanceColors, "instanceColors");
  if (instanceTransforms && (instanceTransforms.length === 0 || instanceTransforms.length % 16 !== 0)) {
    throw new ValidationError("SCENE_RENDERABLE", "Scene renderable instanceTransforms must contain complete matrices.");
  }
  if (instanceColors && (instanceColors.length === 0 || instanceColors.length % 4 !== 0 ||
      (instanceTransforms && instanceColors.length / 4 !== instanceTransforms.length / 16))) {
    throw new ValidationError("SCENE_RENDERABLE", "Scene renderable instanceColors must contain matching vec4 values.");
  }
  const negativeIndices = (values: readonly number[] | undefined): number[] =>
    values ? values.flatMap((entry, index) => Object.is(entry, -0) ? [index] : []) : [];
  const morphZeros = negativeIndices(morphWeights);
  const transformZeros = negativeIndices(instanceTransforms);
  const colorZeros = negativeIndices(instanceColors);
  return {
    geometry: renderable.geometry,
    material: renderable.material,
    layerMask: renderable.layerMask,
    castShadow: renderable.castShadow,
    receiveShadow: renderable.receiveShadow,
    ...(renderable.skinning !== undefined ? { skinning: serializeSkinning(renderable.skinning) } : {}),
    ...(morphWeights.length > 0 ? { morphWeights } : {}),
    ...(instanceTransforms ? { instanceTransforms } : {}),
    ...(instanceColors ? { instanceColors } : {}),
    ...(morphZeros.length || transformZeros.length || colorZeros.length ? {
      negativeZero: {
        ...(morphZeros.length ? { morphWeights: morphZeros } : {}),
        ...(transformZeros.length ? { instanceTransforms: transformZeros } : {}),
        ...(colorZeros.length ? { instanceColors: colorZeros } : {})
      }
    } : {})
  };
}

function deserializeRenderable(data: SerializedRenderable, context: DeserializationContext): Renderable {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new ValidationError("SCENE_RENDERABLE", "Scene renderable must be an object.");
  }
  assertNoBindingState(data);
  assertKnownProperties(data, SERIALIZED_RENDERABLE_PROPERTIES, "renderable", "SCENE_RENDERABLE");
  const { skinning, sharedId, negativeZero, ...descriptor } = data;
  if (sharedId !== undefined && (typeof sharedId !== "string" || sharedId.length === 0)) {
    throw new ValidationError("SCENE_RENDERABLE", "Scene renderable sharedId must be a non-empty string.");
  }
  if (negativeZero !== undefined && (negativeZero === null || typeof negativeZero !== "object" || Array.isArray(negativeZero))) {
    throw new ValidationError("SCENE_RENDERABLE", "Scene renderable negativeZero must be an object.");
  }
  const restoreZeros = (values: readonly number[] | undefined, indices: readonly number[] | undefined, name: string): number[] | undefined => {
    if (values === undefined && indices === undefined) return undefined;
    if (!Array.isArray(values)) throw new ValidationError("SCENE_RENDERABLE", `Scene renderable ${name} must be an array.`);
    const result = Array.from(values);
    if (indices !== undefined) {
      if (!Array.isArray(indices)) throw new ValidationError("SCENE_RENDERABLE", `Scene renderable ${name} negativeZero indices must be an array.`);
      const used = new Set<number>();
      for (const index of indices) {
        if (!Number.isInteger(index) || index < 0 || index >= result.length || result[index] !== 0 || used.has(index)) {
          throw new ValidationError("SCENE_RENDERABLE", `Scene renderable ${name} has an invalid negativeZero index.`);
        }
        used.add(index);
        result[index] = -0;
      }
    }
    return result;
  };
  const morphWeights = restoreZeros(descriptor.morphWeights, negativeZero?.morphWeights, "morphWeights");
  const instanceTransforms = restoreZeros(descriptor.instanceTransforms, negativeZero?.instanceTransforms, "instanceTransforms");
  const instanceColors = restoreZeros(descriptor.instanceColors, negativeZero?.instanceColors, "instanceColors");
  const renderable = new Renderable({
    ...descriptor,
    ...(morphWeights !== undefined ? { morphWeights } : {}),
    ...(instanceTransforms !== undefined ? { instanceTransforms } : {}),
    ...(instanceColors !== undefined ? { instanceColors } : {}),
    ...(skinning !== undefined ? { skinning: deserializeSkinning(skinning) } : {})
  });
  const snapshot = serializeRenderableData(renderable);
  if (sharedId === undefined) return renderable;
  const previous = context.renderables.get(sharedId);
  if (previous) {
    if (JSON.stringify(serializeRenderableData(previous)) !== JSON.stringify(snapshot)) {
      throw new ValidationError("SCENE_RENDERABLE", `Scene renderable sharedId ${sharedId} has conflicting payloads.`);
    }
    return previous;
  }
  context.renderables.set(sharedId, renderable);
  return renderable;
}

function copyUserData(value: unknown, seen: Set<object>): { [key: string]: SerializedSceneValue } {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError("SCENE_USER_DATA", "Scene userData must be a JSON object.");
  }
  return copyJsonValue(value, "userData", seen) as { [key: string]: SerializedSceneValue };
}

function copyJsonValue(value: unknown, path: string, seen: Set<object>, code = "SCENE_USER_DATA"): SerializedSceneValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value) && !Object.is(value, -0)) return value;
  if (typeof value !== "object" || value === null) {
    throw new ValidationError(code, `Scene ${path} contains a value that cannot round-trip through JSON.`);
  }
  const prototype = Object.getPrototypeOf(value);
  const array = Array.isArray(value);
  if ((array && prototype !== Array.prototype) || (!array && prototype !== Object.prototype && prototype !== null)) {
    throw new ValidationError(code, `Scene ${path} contains an unsupported object type.`);
  }
  if (seen.has(value)) {
    throw new ValidationError(code, `Scene ${path} contains a cyclic or shared object reference.`);
  }
  seen.add(value);
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new ValidationError(code, `Scene ${path} contains symbol properties that JSON cannot preserve.`);
  }
  const names = Object.getOwnPropertyNames(value);
  if (array) {
    if (names.length !== value.length + 1) {
      throw new ValidationError(code, `Scene ${path} contains a sparse array or extra array properties.`);
    }
    const result: SerializedSceneValue[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        throw new ValidationError(code, `Scene ${path}[${index}] is not a JSON data property.`);
      }
      result.push(copyJsonValue(descriptor.value, `${path}[${index}]`, seen, code));
    }
    return result;
  }
  const result: { [key: string]: SerializedSceneValue } = {};
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw new ValidationError(code, `Scene ${path}.${name} is not a JSON data property.`);
    }
    Object.defineProperty(result, name, {
      value: copyJsonValue(descriptor.value, `${path}.${name}`, seen, code),
      enumerable: true,
      configurable: true,
      writable: true
    });
  }
  return result;
}

type SerializedLocalBounds = NonNullable<SerializedSceneNode["localBounds"]>;

function serializeBounds(bounds: Bounds3): SerializedLocalBounds {
  const vector = (value: unknown): SerializedLocalBounds["min"] => {
    if (!Array.isArray(value) || value.length !== 3) {
      throw new ValidationError("SCENE_BOUNDS", "Scene local bounds must have three coordinates per endpoint.");
    }
    return Array.from(value, (coordinate: unknown) => {
      if (coordinate === Infinity) return "Infinity";
      if (coordinate === -Infinity) return "-Infinity";
      if (typeof coordinate === "number" && Number.isFinite(coordinate)) return Object.is(coordinate, -0) ? "-0" : coordinate;
      throw new ValidationError("SCENE_BOUNDS", "Scene local bounds must contain numbers other than NaN.");
    }) as SerializedLocalBounds["min"];
  };
  return { min: vector(bounds.min), max: vector(bounds.max) };
}

function deserializeBounds(value: unknown): Bounds3 {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError("SCENE_BOUNDS", "Scene local bounds must be an object.");
  }
  const vector = (coordinates: unknown): [number, number, number] => {
    if (!Array.isArray(coordinates) || coordinates.length !== 3) {
      throw new ValidationError("SCENE_BOUNDS", "Scene local bounds must have three coordinates per endpoint.");
    }
    return Array.from(coordinates, (coordinate: unknown) => {
      if (coordinate === "Infinity") return Infinity;
      if (coordinate === "-Infinity") return -Infinity;
      if (coordinate === "-0") return -0;
      if (typeof coordinate === "number" && Number.isFinite(coordinate)) return coordinate;
      throw new ValidationError("SCENE_BOUNDS", "Scene local bounds contain an invalid coordinate.");
    }) as [number, number, number];
  };
  const bounds = value as { min?: unknown; max?: unknown };
  return new Bounds3(vector(bounds.min), vector(bounds.max));
}

type SerializedSkinning = NonNullable<NonNullable<SerializedSceneNode["renderable"]>["skinning"]>;

function serializeSkinning(value: NonNullable<Renderable["skinning"]>): SerializedSkinning {
  const skinning = deserializeSkinning(value, true);
  const matrices = Array.from(skinning.matrices);
  const negativeZero = matrices.flatMap((entry, index) => Object.is(entry, -0) ? [index] : []);
  return { jointCount: skinning.jointCount, matrices, ...(negativeZero.length ? { negativeZero } : {}) };
}

function deserializeSkinning(value: unknown, runtime = false): NonNullable<Renderable["skinning"]> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError("SCENE_SKINNING", "Scene skinning must contain a joint count and matrix palette.");
  }
  assertNoBindingState(value);
  assertKnownProperties(value, runtime ? SKINNING_PROPERTIES : SERIALIZED_SKINNING_PROPERTIES, "renderable.skinning", "SCENE_SKINNING");
  if (runtime) {
    // The glTF runtime stamps a cyclic, lifetime-scoped renderer cache key.
    // Copy the palette values only: the external runtime owns and regenerates
    // this identity, and no source runtime or GPU resource belongs to the copy.
    const key = Object.getOwnPropertyDescriptor(value, "paletteKey");
    if (key && (!("value" in key) || (key.value !== undefined && (key.value === null || typeof key.value !== "object")))) {
      throw new ValidationError("SCENE_SKINNING", "Scene renderable.skinning.paletteKey must be an object cache identity.");
    }
  }
  const { jointCount, matrices, negativeZero } = value as { jointCount?: unknown; matrices?: unknown; negativeZero?: unknown };
  if (typeof jointCount !== "number" || !Number.isInteger(jointCount) || jointCount <= 0 || jointCount > MAX_RENDERABLE_SKINNING_JOINTS) {
    throw new ValidationError("SCENE_SKINNING", `Scene skinning jointCount must be an integer in [1, ${MAX_RENDERABLE_SKINNING_JOINTS}].`);
  }
  if ((!Array.isArray(matrices) && !(matrices instanceof Float32Array)) || matrices.length !== jointCount * 16) {
    throw new ValidationError("SCENE_SKINNING", "Scene skinning matrices must contain one finite mat4 per joint.");
  }
  const values: unknown[] = Array.from(matrices);
  if (!values.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))) {
    throw new ValidationError("SCENE_SKINNING", "Scene skinning matrices must contain one finite mat4 per joint.");
  }
  if (negativeZero !== undefined) {
    if (!Array.isArray(negativeZero)) throw new ValidationError("SCENE_SKINNING", "Scene skinning negativeZero indices must be an array.");
    const used = new Set<number>();
    for (const index of negativeZero) {
      if (!Number.isInteger(index) || index < 0 || index >= values.length || values[index] !== 0 || used.has(index)) {
        throw new ValidationError("SCENE_SKINNING", "Scene skinning has an invalid negativeZero index.");
      }
      used.add(index);
      values[index] = -0;
    }
  }
  const palette = new Float32Array(values as number[]);
  if (!palette.every(Number.isFinite)) {
    throw new ValidationError("SCENE_SKINNING", "Scene skinning matrices must be representable as finite float32 values.");
  }
  return { jointCount, matrices: palette };
}

function serializeCamera(node: SceneNode): SerializedSceneNode["camera"] {
  if (node instanceof PerspectiveCamera) {
    const projection = readCameraProjectionFields({
      viewOffset: node.viewOffset, depth: node.depth, focalLength: node.focalLength,
      filmGauge: node.filmGauge, filmOffset: node.filmOffset,
      ...(node.focalLength !== undefined ? { authoredFovYRadians: node.getAuthoredFieldOfView() } : {})
    }, true);
    return {
      fovYRadians: node.fovYRadians,
      aspect: node.aspect,
      near: node.near,
      ...serializeCameraFar(node, projection.depth),
      ...serializedCameraProjectionFields(projection),
      viewport: { ...node.viewport }
    };
  }
  if (node instanceof OrthographicCamera) {
    const projection = readCameraProjectionFields({ viewOffset: node.viewOffset, depth: node.depth }, false);
    return {
      left: node.left,
      right: node.right,
      bottom: node.bottom,
      top: node.top,
      near: node.near,
      ...serializeCameraFar(node, projection.depth),
      zoom: node.zoom,
      resizeMode: node.resizeMode,
      ...serializedCameraProjectionFields(projection),
      viewport: { ...node.viewport }
    };
  }
  return undefined;
}

type SerializedCamera = NonNullable<SerializedSceneNode["camera"]>;

/** Infinity is not JSON-representable; -1 cannot be a valid perspective far plane. */
function serializeCameraFar(node: PerspectiveCamera | OrthographicCamera, depth?: ProjectionOptions): Pick<SerializedCamera, "far" | "infiniteFar"> {
  const perspective = node instanceof PerspectiveCamera;
  if (!Number.isFinite(node.near) || ((perspective || depth?.mode === "logarithmic") && node.near <= 0)) {
    throw new ValidationError("SCENE_CAMERA_FAR", "Camera near must be finite and positive for perspective or logarithmic depth.");
  }
  if (node.far === Infinity) {
    if (!perspective || depth?.mode === "logarithmic") {
      throw new ValidationError("SCENE_CAMERA_FAR", "Infinite far requires non-logarithmic perspective projection.");
    }
    return { far: -1, infiniteFar: true };
  }
  if (!Number.isFinite(node.far) || node.far <= node.near) {
    throw new ValidationError("SCENE_CAMERA_FAR", "Camera far must be finite and greater than near, or a supported infinite perspective far plane.");
  }
  return { far: node.far };
}

function readCameraFar(camera: SerializedCamera | undefined, perspective: boolean, depth?: ProjectionOptions): number | undefined {
  // Camera payloads and far values were optional in older version-1 inputs.
  if (camera === undefined || camera === null) return undefined;
  const far: unknown = camera.far;
  const marker: unknown = camera.infiniteFar;
  if (marker !== undefined) {
    if (marker !== true || !perspective || far !== -1 || depth?.mode === "logarithmic") {
      throw new ValidationError("SCENE_CAMERA_FAR", "Camera infiniteFar requires perspective, non-logarithmic depth, and far: -1.");
    }
    return Infinity;
  }
  if (far === undefined) return undefined;
  if (far === Infinity && perspective && depth?.mode !== "logarithmic") return Infinity;
  if (typeof far !== "number" || !Number.isFinite(far)) {
    throw new ValidationError("SCENE_CAMERA_FAR", "Camera far must be finite, or use far: -1 with infiniteFar: true for perspective.");
  }
  return far;
}

type CameraProjectionFields = Pick<NonNullable<SerializedSceneNode["camera"]>,
  "viewOffset" | "depth" | "focalLength" | "filmGauge" | "filmOffset" | "authoredFovYRadians">;

/** Validate new fields independently of legacy optional camera fields. */
function readCameraProjectionFields(camera: Partial<CameraProjectionFields> | undefined, perspective: boolean): CameraProjectionFields {
  // Older version-1 scenes may omit the camera payload entirely.
  if (camera === undefined || camera === null) return {};
  if (typeof camera !== "object" || Array.isArray(camera)) {
    throw new ValidationError("SCENE_CAMERA_PROJECTION", "Camera projection options must be an object.");
  }
  const optionalNumber = (name: string, value: unknown, requirement: string, valid: (number: number) => boolean): number | undefined => {
    if (value === undefined) return undefined;
    if (typeof value !== "number" || !Number.isFinite(value) || !valid(value)) {
      throw new ValidationError("SCENE_CAMERA_PROJECTION", `Camera ${name} must be ${requirement}.`);
    }
    return value;
  };
  const focalLength = optionalNumber("focalLength", camera.focalLength, "a positive finite number", (value) => value > 0);
  const filmGauge = optionalNumber("filmGauge", camera.filmGauge, "a positive finite number", (value) => value > 0);
  const filmOffset = optionalNumber("filmOffset", camera.filmOffset, "a finite number", () => true);
  // A focal length overrides the authored FOV. Retain even an out-of-range
  // finite inactive FOV, just as the camera constructor does; it becomes
  // subject to FOV validation if the lens override is later removed.
  const authoredFovYRadians = optionalNumber("authoredFovYRadians", camera.authoredFovYRadians, "a finite number", () => true);
  if (authoredFovYRadians !== undefined && focalLength === undefined && (authoredFovYRadians <= 0 || authoredFovYRadians >= Math.PI)) {
    throw new ValidationError("SCENE_CAMERA_PROJECTION", "Camera authoredFovYRadians must be in (0, PI) without a focal length.");
  }
  if (!perspective && (focalLength !== undefined || filmGauge !== undefined || filmOffset !== undefined || authoredFovYRadians !== undefined)) {
    throw new ValidationError("SCENE_CAMERA_PROJECTION", "Physical lens options require a perspective camera.");
  }

  let viewOffset: CameraViewOffset | undefined;
  if (camera.viewOffset !== undefined) {
    const value: unknown = camera.viewOffset;
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new ValidationError("SCENE_CAMERA_PROJECTION", "Camera viewOffset must be a rectangle object.");
    }
    viewOffset = validateCameraViewOffset(value as CameraViewOffset);
  }

  let depth: ProjectionOptions | undefined;
  if (camera.depth !== undefined) {
    const value: unknown = camera.depth;
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new ValidationError("SCENE_CAMERA_PROJECTION", "Camera depth must be an options object.");
    }
    const { mode, clipRange } = value as { mode?: unknown; clipRange?: unknown };
    if (mode !== undefined && mode !== "standard" && mode !== "reversed" && mode !== "logarithmic") {
      throw new ValidationError("SCENE_CAMERA_PROJECTION", "Camera depth mode must be standard, reversed, or logarithmic.");
    }
    if (clipRange !== undefined && clipRange !== "minus-one-to-one" && clipRange !== "zero-to-one") {
      throw new ValidationError("SCENE_CAMERA_PROJECTION", "Camera depth clipRange must be minus-one-to-one or zero-to-one.");
    }
    depth = { ...(mode !== undefined ? { mode } : {}), ...(clipRange !== undefined ? { clipRange } : {}) };
  }
  return {
    ...(viewOffset !== undefined ? { viewOffset } : {}), ...(depth !== undefined ? { depth } : {}),
    ...(focalLength !== undefined ? { focalLength } : {}), ...(filmGauge !== undefined ? { filmGauge } : {}),
    ...(filmOffset !== undefined ? { filmOffset } : {}), ...(authoredFovYRadians !== undefined ? { authoredFovYRadians } : {})
  };
}

/** Omit ordinary defaults so existing version-1 output stays unchanged. */
function serializedCameraProjectionFields(fields: CameraProjectionFields): CameraProjectionFields {
  const depth = fields.depth;
  const nonDefaultDepth = depth && ((depth.mode ?? "standard") !== "standard" || (depth.clipRange ?? "minus-one-to-one") !== "minus-one-to-one");
  return {
    ...(fields.viewOffset !== undefined ? { viewOffset: fields.viewOffset } : {}),
    ...(nonDefaultDepth ? { depth } : {}),
    ...(fields.focalLength !== undefined ? { focalLength: fields.focalLength } : {}),
    ...(fields.authoredFovYRadians !== undefined ? { authoredFovYRadians: fields.authoredFovYRadians } : {}),
    ...(fields.filmGauge !== undefined && fields.filmGauge !== 35 ? { filmGauge: fields.filmGauge } : {}),
    ...(fields.filmOffset !== undefined && fields.filmOffset !== 0 ? { filmOffset: fields.filmOffset } : {})
  };
}

function serializeLight(node: SceneNode): SerializedSceneNode["light"] {
  if (node instanceof DirectionalLight || node instanceof PointLight || node instanceof SpotLight || node instanceof RectAreaLight) {
    const color = Array.isArray(node.color) ? [...node.color] as [number, number, number] : [node.color.x, node.color.y, node.color.z] as [number, number, number];
    return {
      color,
      intensity: node.intensity,
      castsShadow: node.castsShadow,
      ...(node instanceof PointLight || node instanceof SpotLight || node instanceof RectAreaLight ? { range: node.range } : {}),
      ...(node instanceof SpotLight ? { angle: node.angle, penumbra: node.penumbra } : {}),
      ...(node instanceof RectAreaLight ? { width: node.width, height: node.height, ...(node.twoSided ? { twoSided: true } : {}) } : {})
    };
  }
  return undefined;
}
