import {
  AnimationAction,
  type AnimationEvent,
  type AnimationMixerFinishedEvent,
  type AnimationMixerLoopEvent,
  type AnimationMixerOverflowEvent,
  type RootMotionSample
} from "@aura3d/animation";
import {
  type Scene,
  type SceneAssetProvenance,
  type SceneDeserializationOptions,
  type SceneNode,
  type SceneSerializationAdapter,
  type SceneSerializationDisposeScope,
  type SerializedSceneValue
} from "@aura3d/scene";
import { GLTFLoader, type GLTFAsset } from "./GLTFLoader.js";
import { LoadContext } from "./LoadContext.js";
import {
  GLTFSceneAnimationMixerBinding,
  type GLTFSceneAnimationMixerSerializedState
} from "./GLTFAnimationRuntime.js";

/** A trusted, durable manifest entry. Embedded data is covered by the document hash. */
export interface GLTFSceneAssetIdentity {
  readonly id: string;
  readonly uri: string;
  readonly digest: string;
  /** Every external buffer/image URI and its SHA-256. Relative keys are relative to uri. */
  readonly dependencies: Readonly<Record<string, string>>;
}

/**
 * A lease produced only after GLTFLoader has verified the document and every
 * external dependency. Its asset is borrowed by scene actors until disposal.
 */
export interface VerifiedGLTFSceneAsset {
  readonly identity: GLTFSceneAssetIdentity;
  readonly asset: GLTFAsset;
  dispose(): void;
}

export interface GLTFSceneSerializationActor {
  readonly root: SceneNode;
  readonly asset: VerifiedGLTFSceneAsset;
  readonly animation: GLTFSceneAnimationMixerBinding;
}

/** Callbacks are application-owned and are never copied from the source actor. */
export interface GLTFSceneAnimationCallbacks {
  readonly consumeRootMotion?: (sample: RootMotionSample) => void;
  readonly onEvent?: (event: AnimationEvent) => void;
  readonly onLoop?: (event: AnimationMixerLoopEvent) => void;
  readonly onFinished?: (event: AnimationMixerFinishedEvent) => void;
  readonly onOverflow?: (event: AnimationMixerOverflowEvent) => void;
}

export interface GLTFSceneCallbackRebindContext extends SceneSerializationDisposeScope {
  readonly scene: Scene;
  readonly root: SceneNode;
  readonly asset: VerifiedGLTFSceneAsset;
}

export interface GLTFSceneSerializationOptions {
  /** Omit on a restore-only adapter; actors are explicitly registered for capture. */
  readonly actors?: readonly GLTFSceneSerializationActor[];
  /** Called once per restored actor; register any acquired resources immediately. */
  readonly rebind?: (context: GLTFSceneCallbackRebindContext) => GLTFSceneAnimationCallbacks | undefined;
}

export interface RestoredGLTFSceneActor {
  readonly root: SceneNode;
  readonly asset: VerifiedGLTFSceneAsset;
  readonly animation: GLTFSceneAnimationMixerBinding;
}

export interface RestoredGLTFScene {
  readonly actors: readonly RestoredGLTFSceneActor[];
}

interface SkinSource {
  readonly nodeIndex: number;
  readonly meshIndex: number;
  readonly primitiveIndex: number;
  readonly skinIndex: number;
}

interface NodeLayout {
  readonly nodeIndex: number | null;
  readonly skin: SkinSource | null;
  readonly geometry: string | null;
  readonly material: string | null;
  readonly jointCount: number | null;
  readonly morphCount: number;
  readonly children: readonly NodeLayout[];
}

interface ClipSource {
  readonly index: number;
  readonly identity: string;
  readonly nodes: readonly number[];
}

interface SkinIdentity {
  readonly index: number;
  readonly joints: readonly number[];
  readonly inverseBindMatrices: readonly (readonly (number | "-0")[])[];
}

interface AssetProof {
  readonly identity: GLTFSceneAssetIdentity;
  readonly sourceLoadId: string;
  readonly layout: NodeLayout;
  readonly clips: readonly ClipSource[];
  readonly skins: readonly SkinIdentity[];
  readonly fingerprint: string;
  readonly toJSON: GLTFAsset["toJSON"];
  readonly createScene: GLTFAsset["createScene"];
  readonly nodeIndexForTrack: GLTFAsset["nodeIndexForTrack"];
  readonly skinBindingForNode: GLTFAsset["skinBindingForNode"];
}

interface ActorState {
  readonly rootId: string;
  readonly assetId: string;
  readonly identity: GLTFSceneAssetIdentity;
  /** This identifies the old in-memory actor only; it never authorizes a new load. */
  readonly sourceLoadId: string;
  readonly nodeIds: readonly string[];
  readonly clips: readonly ClipSource[];
  readonly skins: readonly SkinIdentity[];
  readonly animation: GLTFSceneAnimationMixerSerializedState;
}

const ADAPTER_ID = "aura3d.gltf-scene-animation";
const proofs = new WeakMap<VerifiedGLTFSceneAsset, AssetProof>();

/**
 * Load using the normal glTF loader's SHA-256 admission, including mandatory
 * hashes for external buffers and images. Do not wrap an already-loaded asset:
 * a URL, an opaque gltfAssetId, or a caller's assertion is not byte proof.
 */
export async function loadVerifiedGLTFSceneAsset(input: GLTFSceneAssetIdentity): Promise<VerifiedGLTFSceneAsset> {
  const identity = normalizeIdentity(input);
  const loader = new GLTFLoader();
  const asset = await loader.load({
    url: identity.uri,
    type: "gltf",
    integrity: { version: 1, digest: identity.digest, dependencies: identity.dependencies, requireDependencies: true }
  }, new LoadContext());
  try {
    if (!asset.gltfAssetId || !asset.nodeIndexForTrack || !asset.skinBindingForNode) {
      throw new Error("glTF scene serialization requires loader-backed animation or skin provenance.");
    }
    // Scene snapshots contain geometry/material handles, not renderer-owned
    // texture, material, light or camera resources. Do not pretend to restore
    // those resources until a separate resource adapter owns their lifecycle.
    if (asset.images.length || asset.textures.length || asset.materials.length || asset.lights.length || asset.cameras.length) {
      throw new Error("glTF scene serialization does not restore external material, texture, light or camera resources.");
    }
    const sourceScene = asset.createScene();
    let layout: NodeLayout;
    try {
      layout = readLayout(sourceScene.root, asset.gltfAssetId);
    } finally {
      sourceScene.dispose();
    }
    const clips = readClips(asset);
    const skins = readSkins(asset);
    const fingerprint = assetFingerprint(asset);
    const lease: VerifiedGLTFSceneAsset = Object.freeze({
      identity,
      asset,
      dispose: () => loader.dispose(asset)
    });
    proofs.set(lease, {
      identity, sourceLoadId: asset.gltfAssetId, layout, clips, skins, fingerprint,
      toJSON: asset.toJSON,
      createScene: asset.createScene,
      nodeIndexForTrack: asset.nodeIndexForTrack,
      skinBindingForNode: asset.skinBindingForNode
    });
    return lease;
  } catch (error) {
    loader.dispose(asset);
    throw error;
  }
}

/**
 * Supply a trusted manifest independently of the serialized scene. Each
 * referenced entry is matched to scene metadata before it is freshly loaded
 * with strict dependency integrity. Resolved leases participate in rollback.
 */
export function createGLTFSceneAssetResolver(
  entries: readonly GLTFSceneAssetIdentity[]
): NonNullable<SceneDeserializationOptions["resolveAsset"]> {
  const trusted = new Map<string, GLTFSceneAssetIdentity>();
  for (const entry of entries) {
    const identity = normalizeIdentity(entry);
    if (trusted.has(identity.id)) throw new Error(`Duplicate trusted glTF asset ID: ${identity.id}.`);
    trusted.set(identity.id, identity);
  }
  return async (metadata, scope) => {
    const identity = trusted.get(metadata.id);
    if (!identity || !metadataMatches(metadata, identity)) {
      throw new Error(`Scene asset ${metadata.id} does not match a trusted glTF manifest entry.`);
    }
    const lease = await loadVerifiedGLTFSceneAsset(identity);
    try {
      scope.deferDispose(() => lease.dispose());
    } catch (error) {
      lease.dispose();
      throw error;
    }
    return lease;
  };
}

/**
 * Opt-in adapter for default-scene glTF actors with ordinary node TRS/morph
 * tracks, loader-proven skins, and the core glTF mixer. The returned extension
 * is available under GLTF_SCENE_SERIALIZATION_ADAPTER_ID in RestoredScene.
 * The verified asset is returned for the application's separate render-resource
 * pipeline; this adapter does not claim to recreate GPU resources.
 */
export function createGLTFSceneSerializationAdapter(options: GLTFSceneSerializationOptions = {}): SceneSerializationAdapter {
  const sources = [...(options.actors ?? [])];
  return {
    id: ADAPTER_ID,
    version: 1,
    capture(context) {
      if (sources.length === 0) return undefined;
      const states: ActorState[] = [];
      const allNodes = new Set<string>();
      const allAssets = new Set<string>();
      const renderableOwners = countRenderableOwners(allSceneNodes(context.scene));
      for (const source of sources) {
        if (!(source.animation instanceof GLTFSceneAnimationMixerBinding) ||
            Object.getPrototypeOf(source.animation) !== GLTFSceneAnimationMixerBinding.prototype) {
          throw new Error("glTF scene serialization requires an ordinary glTF mixer binding.");
        }
        const proof = requireProof(source.asset);
        const asset = source.asset.asset;
        assertMetadata(context.scene, proof.identity);
        source.animation.runtime.assertSceneSerializationSource(context.scene, source.root, asset);
        const nodes = validateActor(context.scene, source.root, asset, proof.layout, asset.gltfAssetId!, renderableOwners);
        for (const node of nodes) {
          if (context.getNode(node.id) !== node || allNodes.has(node.id)) {
            throw new Error("glTF scene actors must have distinct serialized node identities.");
          }
          allNodes.add(node.id);
        }
        assertSame("glTF clip and track provenance", readClips(asset), proof.clips);
        assertSame("glTF skin and joint provenance", readSkins(asset), proof.skins);
        states.push({
          rootId: source.root.id,
          assetId: proof.identity.id,
          identity: { ...proof.identity, dependencies: { ...proof.identity.dependencies } },
          sourceLoadId: asset.gltfAssetId!,
          nodeIds: nodes.map((node) => node.id),
          clips: readClips(asset),
          skins: readSkins(asset),
          animation: source.animation.serialize()
        });
        allAssets.add(proof.identity.id);
      }
      return {
        nodeIds: [...allNodes],
        assetIds: [...allAssets],
        payload: { actors: states } as unknown as SerializedSceneValue
      };
    },
    restore(context, payload) {
      const actors = readActorStates(payload);
      const declaredNodes = new Set(context.nodeIds);
      const declaredAssets = new Set(context.assetIds);
      const usedNodes = new Set<string>();
      const usedAssets = new Set<string>();
      const renderableOwners = countRenderableOwners(allSceneNodes(context.scene));
      const plans = actors.map((state) => {
        const lease = context.getAsset(state.assetId) as VerifiedGLTFSceneAsset;
        const proof = requireProof(lease);
        assertSame("trusted glTF asset and dependency identity", state.identity, proof.identity);
        if (state.assetId !== proof.identity.id) throw new Error("glTF scene asset ID does not match its verified identity.");
        assertMetadata(context.scene, proof.identity);
        assertSame("glTF clip and track provenance", state.clips, proof.clips);
        assertSame("glTF skin and joint provenance", state.skins, proof.skins);
        const root = context.getNode(state.rootId);
        const nodes = validateActor(context.scene, root, lease.asset, proof.layout, state.sourceLoadId, renderableOwners);
        assertSame("glTF actor node identity", state.nodeIds, nodes.map((node) => node.id));
        for (const node of nodes) {
          if (!declaredNodes.has(node.id) || usedNodes.has(node.id)) throw new Error("glTF scene actors overlap or reference undeclared nodes.");
          usedNodes.add(node.id);
        }
        usedAssets.add(state.assetId);
        return { state, lease, root, nodes };
      });
      if (usedNodes.size !== declaredNodes.size || usedAssets.size !== declaredAssets.size ||
          [...usedAssets].some((id) => !declaredAssets.has(id))) {
        throw new Error("glTF scene extension contains undeclared or unused actor/asset references.");
      }

      const restored: RestoredGLTFSceneActor[] = [];
      for (const { state, lease, root, nodes } of plans) {
        // Remap only after trusted byte identity and the old actor's exact
        // provenance have both been verified. A load ID alone grants nothing.
        root.userData.gltfAssetId = lease.asset.gltfAssetId!;
        for (const node of nodes) {
          const binding = node.userData.gltfSkinBinding as Record<string, unknown> | undefined;
          if (binding) node.userData.gltfSkinBinding = { ...binding, assetId: lease.asset.gltfAssetId! };
        }
        const callbacks = options.rebind?.({
          scene: context.scene, root, asset: lease, deferDispose: context.deferDispose
        }) ?? {};
        // A rebinding callback must not replace the verified asset or alter
        // actor provenance while it acquires application-owned resources.
        const proof = requireProof(lease);
        const reboundNodes = validateActor(
          context.scene, root, lease.asset, proof.layout, lease.asset.gltfAssetId!,
          countRenderableOwners(allSceneNodes(context.scene))
        );
        assertSame("glTF actor node identity after callback rebind", state.nodeIds, reboundNodes.map((node) => node.id));
        const target = state.animation.mixer.state?.target;
        if (!target || target.consumeRootMotion !== (typeof callbacks.consumeRootMotion === "function")) {
          throw new Error("glTF root-motion callback must be explicitly rebound with matching capabilities.");
        }
        const mixerOptions = state.animation.mixer.state?.options;
        if (!mixerOptions) throw new Error("glTF scene requires versioned mixer options.");
        const savedPalettes = nodes.filter((node) => node.renderable?.skinning).map((node) =>
          Array.from(node.renderable!.skinning!.matrices)
        );
        const animation = new GLTFSceneAnimationMixerBinding({
          scene: context.scene,
          actorRoot: root,
          asset: lease.asset,
          clips: lease.asset.animations,
          autoPlay: false,
          mixer: mixerOptions,
          ...(callbacks.consumeRootMotion ? { consumeRootMotion: callbacks.consumeRootMotion } : {})
        });
        context.deferDispose(() => animation.dispose());
        animation.runtime.assertSceneSerializationSource(context.scene, root, lease.asset);
        animation.restore(state.animation);
        // Recreate independently owned palette keys/buffers without advancing
        // playback or emitting callbacks. Reject stale/inconsistent snapshots.
        const refreshed = animation.runtime.applyPose({ bones: {} });
        if (refreshed.missingTargets.length || refreshed.unsupportedTracks.length ||
            refreshed.skinningPalettesUpdated !== savedPalettes.length) {
          throw new Error("glTF scene skin or joint binding could not be restored.");
        }
        const actualPalettes = nodes.filter((node) => node.renderable?.skinning).map((node) =>
          Array.from(node.renderable!.skinning!.matrices)
        );
        assertPalettesMatch(savedPalettes, actualPalettes);
        if (callbacks.onEvent) animation.mixer.onEvent(callbacks.onEvent);
        if (callbacks.onLoop) animation.mixer.addEventListener("loop", callbacks.onLoop);
        if (callbacks.onFinished) animation.mixer.addEventListener("finished", callbacks.onFinished);
        if (callbacks.onOverflow) animation.mixer.addEventListener("overflow", callbacks.onOverflow);
        restored.push({ root, asset: lease, animation });
      }
      return { actors: restored } satisfies RestoredGLTFScene;
    }
  };
}

export const GLTF_SCENE_SERIALIZATION_ADAPTER_ID = ADAPTER_ID;

function normalizeIdentity(input: GLTFSceneAssetIdentity): GLTFSceneAssetIdentity {
  if (!input || typeof input !== "object" || typeof input.id !== "string" || !input.id.trim() || input.id !== input.id.trim() ||
      typeof input.uri !== "string" || !/^(https?:|data:)/i.test(input.uri) ||
      typeof input.digest !== "string" || !/^(?:sha256-)?[a-f\d]{64}$/i.test(input.digest) ||
      !input.dependencies || typeof input.dependencies !== "object" || Array.isArray(input.dependencies)) {
    throw new Error("A glTF asset requires a stable ID, absolute HTTP(S)/data URI, SHA-256 and dependency manifest.");
  }
  const dependencies: Record<string, string> = {};
  const resolved = new Set<string>();
  for (const [uri, digest] of Object.entries(input.dependencies).sort(([a], [b]) => a.localeCompare(b))) {
    if (!uri || typeof digest !== "string" || !/^(?:sha256-)?[a-f\d]{64}$/i.test(digest)) {
      throw new Error("Every glTF dependency must have a URI and SHA-256 digest.");
    }
    let absolute: string;
    try { absolute = new URL(uri, input.uri).href; } catch { throw new Error("glTF dependency URI cannot be resolved against the document."); }
    if (resolved.has(absolute)) throw new Error("glTF dependency manifest contains duplicate resolved URIs.");
    resolved.add(absolute);
    Object.defineProperty(dependencies, uri, { value: normalizeDigest(digest), enumerable: true });
  }
  return Object.freeze({
    id: input.id,
    uri: input.uri,
    digest: normalizeDigest(input.digest),
    dependencies: Object.freeze(dependencies)
  });
}

function normalizeDigest(digest: string): string {
  return `sha256-${digest.replace(/^sha256-/i, "").toLowerCase()}`;
}

function metadataMatches(metadata: SceneAssetProvenance, identity: GLTFSceneAssetIdentity): boolean {
  return metadata.id === identity.id && metadata.uri === identity.uri && typeof metadata.digest === "string" &&
    /^(?:sha256-)?[a-f\d]{64}$/i.test(metadata.digest) && normalizeDigest(metadata.digest) === identity.digest;
}

function assertMetadata(scene: Scene, identity: GLTFSceneAssetIdentity): void {
  const matches = scene.metadata.assets.filter((entry) => entry.id === identity.id);
  if (matches.length !== 1 || !metadataMatches(matches[0]!, identity)) {
    throw new Error(`Scene metadata does not match verified glTF asset ${identity.id}.`);
  }
}

function requireProof(lease: VerifiedGLTFSceneAsset): AssetProof {
  const proof = lease && typeof lease === "object" ? proofs.get(lease) : undefined;
  if (!proof || lease.asset.disposed || lease.asset.gltfAssetId !== proof.sourceLoadId || lease.asset.toJSON !== proof.toJSON ||
      lease.asset.createScene !== proof.createScene || lease.asset.nodeIndexForTrack !== proof.nodeIndexForTrack ||
      lease.asset.skinBindingForNode !== proof.skinBindingForNode || assetFingerprint(lease.asset) !== proof.fingerprint) {
    throw new Error("A live, unchanged byte-verified glTF asset lease is required.");
  }
  return proof;
}

function assetFingerprint(asset: GLTFAsset): string {
  return JSON.stringify({
    asset: asset.toJSON(),
    // toJSON closes over the loader's original arrays. Inspect the live public
    // fields as well so replacing an array cannot conceal mutated resources.
    meshes: asset.meshes,
    skins: asset.skins,
    clips: asset.animations.map((clip) => ({
      identity: new AnimationAction(clip).serialize().state?.clipIdentity,
      tracks: clip.tracks.map((track) => asset.nodeIndexForTrack?.(track) ?? null)
    }))
  }, (_key, value: unknown) => typeof value === "number" && Object.is(value, -0) ? { "$negativeZero": true } : value);
}

function readClips(asset: GLTFAsset): ClipSource[] {
  const names = new Set<string>();
  return asset.animations.map((clip, index) => {
    if (names.has(clip.name)) throw new Error("glTF scene serialization does not support duplicate clip names.");
    names.add(clip.name);
    const nodes = clip.tracks.map((track) => {
      const node = asset.nodeIndexForTrack?.(track);
      if (!Number.isSafeInteger(node) || node! < 0 || !/\.(translation|rotation|scale|weights)$/.test(track.target)) {
        throw new Error("glTF scene serialization supports only loader-identified node TRS and morph tracks.");
      }
      return node!;
    });
    const identity = new AnimationAction(clip).serialize().state?.clipIdentity;
    if (!identity) throw new Error("glTF clip has no restorable identity.");
    return { index, identity, nodes };
  });
}

function readSkins(asset: GLTFAsset): SkinIdentity[] {
  return asset.skins.map((skin, index) => ({
    index,
    joints: [...skin.joints],
    inverseBindMatrices: skin.inverseBindMatrices.map((matrix) =>
      matrix.map((value) => Object.is(value, -0) ? "-0" as const : value)
    )
  }));
}

function readLayout(node: SceneNode, sourceLoadId: string): NodeLayout {
  const hasIndex = Object.prototype.hasOwnProperty.call(node.userData, "gltfNodeIndex");
  const nodeIndex = hasIndex ? node.userData.gltfNodeIndex : null;
  if (hasIndex && (!Number.isSafeInteger(nodeIndex) || (nodeIndex as number) < 0)) {
    throw new Error("glTF actor has an invalid authored node index.");
  }
  const raw = node.userData.gltfSkinBinding;
  let skin: SkinSource | null = null;
  if (raw !== undefined) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("glTF actor has invalid skin provenance.");
    const data = raw as Record<string, unknown>;
    if (Object.keys(data).sort().join(",") !== "assetId,meshIndex,nodeIndex,primitiveIndex,skinIndex" ||
        data.assetId !== sourceLoadId ||
        !["nodeIndex", "meshIndex", "primitiveIndex", "skinIndex"].every((key) =>
          Number.isSafeInteger(data[key]) && (data[key] as number) >= 0)) {
      throw new Error("glTF actor skin provenance does not match its source load.");
    }
    skin = {
      nodeIndex: data.nodeIndex as number,
      meshIndex: data.meshIndex as number,
      primitiveIndex: data.primitiveIndex as number,
      skinIndex: data.skinIndex as number
    };
  }
  const renderable = node.renderable;
  if (renderable?.instanceTransforms || renderable?.instanceColors) {
    throw new Error("glTF scene serialization does not restore instanced render resources.");
  }
  if (!!skin !== !!renderable?.skinning) throw new Error("glTF skinned renderable lacks exact source provenance.");
  return {
    nodeIndex: nodeIndex as number | null,
    skin,
    geometry: renderable?.geometry ?? null,
    material: renderable?.material ?? null,
    jointCount: renderable?.skinning?.jointCount ?? null,
    morphCount: renderable?.morphWeights.length ?? 0,
    children: node.children.map((child) => readLayout(child, sourceLoadId))
  };
}

function countRenderableOwners(nodes: readonly SceneNode[]): Map<object, number> {
  const counts = new Map<object, number>();
  for (const node of nodes) {
    if (node.renderable) counts.set(node.renderable, (counts.get(node.renderable) ?? 0) + 1);
  }
  return counts;
}

function allSceneNodes(scene: Scene): SceneNode[] {
  const roots = new Set<SceneNode>();
  for (const registered of scene.getRegisteredNodes()) {
    let root = registered;
    while (root.parent) root = root.parent;
    roots.add(root);
  }
  const nodes = new Set<SceneNode>();
  for (const root of roots) root.traverse((node) => nodes.add(node));
  return [...nodes];
}

function validateActor(
  scene: Scene,
  root: SceneNode,
  asset: GLTFAsset,
  layout: NodeLayout,
  sourceLoadId: string,
  renderableOwners: ReadonlyMap<object, number>
): SceneNode[] {
  if (typeof sourceLoadId !== "string" || !sourceLoadId || root.userData.gltfSceneContainer !== true ||
      root.userData.gltfAssetId !== sourceLoadId) {
    throw new Error("glTF actor container does not match its source-load provenance.");
  }
  let ancestor: SceneNode | null = root;
  while (ancestor && ancestor !== scene.root) ancestor = ancestor.parent;
  if (!ancestor) throw new Error("glTF actor must be attached to the restored scene.");
  assertSame("glTF authored node and skin layout", readLayout(root, sourceLoadId), layout);
  const nodes: SceneNode[] = [];
  const indices = new Map<number, SceneNode>();
  root.traverse((node) => {
    if (node !== root && node.userData.gltfSceneContainer === true) throw new Error("Nested glTF actor containers are unsupported.");
    if (node.renderable && renderableOwners.get(node.renderable) !== 1) {
      throw new Error("glTF scene serialization cannot share actor renderables.");
    }
    const index = node.userData.gltfNodeIndex;
    if (typeof index === "number") {
      if (indices.has(index)) throw new Error("glTF actor has duplicate authored node indices.");
      indices.set(index, node);
    }
    nodes.push(node);
  });
  for (const clip of asset.animations) {
    for (const track of clip.tracks) {
      const index = asset.nodeIndexForTrack?.(track);
      if (index === undefined || !indices.has(index)) throw new Error("glTF animation track targets a missing actor node.");
    }
  }
  for (const node of nodes) {
    const binding = node.userData.gltfSkinBinding as Record<string, unknown> | undefined;
    if (!binding) continue;
    const ownerIndex = binding.nodeIndex as number;
    const owner = indices.get(ownerIndex);
    const canonical = asset.skinBindingForNode?.(ownerIndex);
    const skin = asset.skins[binding.skinIndex as number];
    const candidates = asset.meshes.filter((mesh) => mesh.sourceMeshIndex === binding.meshIndex && mesh.primitiveIndex === binding.primitiveIndex);
    if (!owner || (node !== owner && (node.parent !== owner || node.userData.gltfNodeIndex !== undefined)) ||
        canonical?.meshIndex !== binding.meshIndex || canonical?.skinIndex !== binding.skinIndex ||
        candidates.length !== 1 || candidates[0]!.name !== node.renderable?.geometry ||
        !skin || skin.joints.length !== node.renderable?.skinning?.jointCount ||
        skin.inverseBindMatrices.length !== skin.joints.length ||
        skin.joints.some((joint) => !indices.has(joint))) {
      throw new Error("glTF actor mesh, skin or joint provenance is missing or inconsistent.");
    }
  }
  return nodes;
}

function assertSame(label: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} does not match.`);
}

function assertPalettesMatch(expected: readonly number[][], actual: readonly number[][]): void {
  if (expected.length !== actual.length || expected.some((palette, index) =>
    palette.length !== actual[index]?.length || palette.some((value, slot) => !Object.is(value, actual[index]?.[slot])))) {
    throw new Error("glTF skin palette and restored pose do not match.");
  }
}

function readActorStates(payload: SerializedSceneValue): ActorState[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      Object.keys(payload).join(",") !== "actors" || !Array.isArray(payload.actors) || payload.actors.length === 0) {
    throw new Error("glTF scene extension requires a non-empty actor list.");
  }
  return payload.actors.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value) ||
        Object.keys(value).sort().join(",") !== "animation,assetId,clips,identity,nodeIds,rootId,skins,sourceLoadId" ||
        typeof value.rootId !== "string" || !value.rootId ||
        typeof value.assetId !== "string" || !value.assetId ||
        typeof value.sourceLoadId !== "string" || !value.sourceLoadId ||
        !Array.isArray(value.nodeIds) || !value.nodeIds.every((id) => typeof id === "string" && id.length > 0) ||
        !Array.isArray(value.clips) || !Array.isArray(value.skins) || !value.identity || !value.animation) {
      throw new Error("glTF scene extension contains an invalid actor record.");
    }
    return value as unknown as ActorState;
  });
}
