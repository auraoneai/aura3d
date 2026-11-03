import { GLTFSharedTextureCache, mergeAssetRequestOptions, requestIdentityDetails } from "@aura3d/assets/browser";
import { createTypedGLBActor, type TypedGLBActor, type TypedGLBActorAsset, type TypedGLBActorOptions } from "../../production-runtime/TypedGLBActor.js";
import { valueToken } from "../../production-runtime/GlbResourceCache.js";
import { modelTextureShareKey } from "../../production-runtime/actor/ModelTextureShare.js";
import type { AuraAssetRef } from "../nodes/types.js";

/**
 * SA-04 (lane L8) — `cloneSkinned` / `characters.clone` for the production GLB path.
 *
 * Each clone gets its own `TypedGLBActor`: an independent scene graph, skeleton
 * instance, animation runtime, and mixer state, so `playClip`/`applyPose` on
 * one clone never writes another clone's bones. When the request identity is
 * reusable, the clones can share:
 *
 *  - the parsed `GLTFAsset` (reference-counted through
 *    `GLTFAssetParseCache`, which `loadProductionGLTFRenderPipeline` already
 *    uses — the GLB can be fetched and decoded once);
 *  - the decoded+uploaded GPU `Texture`s, through a per-call
 *    `GLTFSharedTextureCache` lease passed to every clone's resource build.
 *    Texture bytes stay flat as clone count grows; the cache frees the
 *    textures only after the last clone disposes. Requests without a reusable
 *    identity keep each actor's resources private.
 */

export type CloneSkinnedModelInput = AuraAssetRef<"model"> | TypedGLBActor | TypedGLBActorAsset | string;

export interface CloneSkinnedOptions extends Omit<TypedGLBActorOptions, "asset" | "id" | "name" | "sharedTextures" | "width" | "height"> {
  /** Renderer-input viewport forwarded to each clone's pipeline (defaults 512×512). */
  readonly width?: number;
  readonly height?: number;
  /** Clone id/name prefix; defaults to the model id or `model`. */
  readonly idPrefix?: string;
  /**
   * Shared texture cache override — for advanced callers cloning into an
   * existing cache (e.g. a second `cloneSkinned` batch against the same
   * textures). Requires a reusable request identity. Automatic sharing is
   * used only for requests with a reusable identity.
   */
  readonly sharedTextures?: GLTFSharedTextureCache;
  /** Per-clone id suffix builder; defaults to `-clone-${index}` (index 0-based). */
  readonly cloneId?: (index: number) => string;
}

export interface ClonedSkinnedModel {
  /** The clone actors, in creation order — each with an independent skeleton and animation runtime. */
  readonly actors: readonly TypedGLBActor[];
  /**
   * The shared cache for this batch. For private, non-reusable requests this
   * remains empty and the actors each own their textures independently.
   */
  readonly sharedTextures: GLTFSharedTextureCache;
  /** The source asset resolved from the input. */
  readonly asset: TypedGLBActorAsset;
  /** Disposes every clone; shared textures are freed when the last clone's lease releases. */
  dispose(): void;
}

/**
 * Remembers which shared-texture cache an actor leases, so a later
 * `cloneSkinned(existingClone)` can join the same still-live cache when the
 * request and texture configuration both match.
 */
interface CloneTextureContext {
  readonly cache: GLTFSharedTextureCache;
  readonly requestKey: string;
  readonly textureKey: string;
  readonly formatRegistry: TypedGLBActorOptions["formatRegistry"];
  readonly formatRegistryGeneration: number | undefined;
}

const actorSharedTextures = new WeakMap<TypedGLBActor, CloneTextureContext>();

function resolveCloneAsset(model: CloneSkinnedModelInput): TypedGLBActorAsset {
  if (typeof model === "string") {
    return { url: model };
  }
  const asset = ("kind" in model && model.kind === "aura-typed-glb-actor" ? model.asset : model) as TypedGLBActorAsset & Partial<AuraAssetRef<"model">>;
  if (typeof asset.url !== "string" || asset.url.length === 0) {
    throw new Error("cloneSkinned: model must be an AuraAssetRef, a TypedGLBActor, an asset with a url, or a url string.");
  }
  return {
    url: asset.url,
    ...(asset.type !== undefined ? { type: asset.type } : {}),
    ...(asset.format !== undefined ? { format: asset.format } : {}),
    ...(asset.formatMetadata !== undefined ? { formatMetadata: {
      ...asset.formatMetadata,
      ...(asset.formatMetadata.source === undefined ? {} : { source: { ...asset.formatMetadata.source } })
    } } : {}),
    ...(asset.hash !== undefined ? { hash: asset.hash } : {}),
    ...(asset.sha256 !== undefined ? { sha256: asset.sha256 } : {}),
    ...(asset.integrity !== undefined ? { integrity: {
      ...asset.integrity,
      ...(asset.integrity.dependencies === undefined ? {} : { dependencies: { ...asset.integrity.dependencies } })
    } } : {}),
    ...(asset.request !== undefined ? { request: mergeAssetRequestOptions({}, asset.request) } : {}),
    ...(asset.bounds !== undefined ? { bounds: [...asset.bounds] } : {}),
    ...(asset.sizeBytes !== undefined ? { sizeBytes: asset.sizeBytes } : {})
  };
}

function baseId(model: CloneSkinnedModelInput, asset: TypedGLBActorAsset): string {
  if (typeof model === "string") {
    return asset.url.split("/").pop() ?? "model";
  }
  if ("kind" in model && model.kind === "aura-typed-glb-actor") {
    return model.id;
  }
  return (model as Partial<AuraAssetRef<"model">>).id ?? "model";
}

export async function cloneSkinned(model: CloneSkinnedModelInput, count: number, options: CloneSkinnedOptions = {}): Promise<ClonedSkinnedModel> {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`cloneSkinned: count must be a positive integer, got ${count}.`);
  }
  const asset = resolveCloneAsset(model);
  // Capture transport policy before the identity digest yields. The actor and
  // every dependency must receive exactly the policy used to authorize sharing.
  const optionsSnapshot = {
    ...options,
    ...(options.decoders === undefined ? {} : { decoders: { ...options.decoders } }),
    ...(options.compressedTextureCapabilities === undefined ? {} : { compressedTextureCapabilities: { ...options.compressedTextureCapabilities } })
  };
  const request = { ...optionsSnapshot.request, ...mergeAssetRequestOptions(asset.request, optionsSnapshot.request) };
  if (request.signal?.aborted) throw request.signal.reason ?? new Error("Asset load aborted");
  const identity = await requestIdentityDetails(request, asset.url);
  if (request.signal?.aborted) throw request.signal.reason ?? new Error("Asset load aborted");
  if (optionsSnapshot.sharedTextures && !identity.reusable) {
    throw new Error("Shared glTF texture cache requires a reusable request identity; omit credentials or provide a security context");
  }

  const textureKey = `${modelTextureShareKey({ ...optionsSnapshot, asset: { url: "" } })}|format=${asset.format?.toLowerCase() ?? "auto"}|metadata=${valueToken(asset.formatMetadata)}|integrity=${valueToken({ hash: asset.hash, sha256: asset.sha256, integrity: asset.integrity })}`;
  const inherited = typeof model === "object" && "kind" in model && model.kind === "aura-typed-glb-actor"
    ? actorSharedTextures.get(model)
    : undefined;
  const reusableCache = identity.reusable && (optionsSnapshot.sharedTextures !== undefined || optionsSnapshot.shareTextures !== false);
  const inheritedCache = reusableCache && inherited?.cache.refCount && inherited.requestKey === identity.key &&
    inherited.textureKey === textureKey && inherited.formatRegistry === optionsSnapshot.formatRegistry &&
    inherited.formatRegistryGeneration === optionsSnapshot.formatRegistry?.generation
    ? inherited.cache : undefined;
  // Keep the established result shape even for private loads; the returned
  // empty cache is never handed to any non-reusable actor.
  const sharedTextures = optionsSnapshot.sharedTextures ?? inheritedCache ?? new GLTFSharedTextureCache();
  const context: CloneTextureContext | undefined = reusableCache ? {
    cache: sharedTextures,
    requestKey: identity.key,
    textureKey,
    formatRegistry: optionsSnapshot.formatRegistry,
    formatRegistryGeneration: optionsSnapshot.formatRegistry?.generation
  } : undefined;
  const prefix = optionsSnapshot.idPrefix ?? baseId(model, asset);
  const cloneId = optionsSnapshot.cloneId ?? ((index: number) => `${prefix}-clone-${index}`);

  const actors: TypedGLBActor[] = [];
  try {
    for (let index = 0; index < count; index++) {
      const id = cloneId(index);
      const actor = await createTypedGLBActor({
        ...optionsSnapshot,
        asset,
        id,
        name: id,
        width: optionsSnapshot.width ?? 512,
        height: optionsSnapshot.height ?? 512,
        request,
        ...(context ? { sharedTextures } : {})
      });
      if (context) actorSharedTextures.set(actor, context);
      actors.push(actor);
    }
  } catch (error) {
    for (const actor of actors) {
      try {
        actor.dispose();
      } catch {
        // keep disposing the rest; the last release frees shared textures
      }
    }
    throw error;
  }

  let disposed = false;
  return {
    actors,
    sharedTextures,
    asset,
    dispose: () => {
      if (disposed) {
        return;
      }
      disposed = true;
      for (const actor of actors) {
        actor.dispose();
      }
    }
  };
}

/**
 * `characters.clone` — the namespace twin of {@link cloneSkinned}.
 */
export const characters = {
  clone: cloneSkinned
} as const;
