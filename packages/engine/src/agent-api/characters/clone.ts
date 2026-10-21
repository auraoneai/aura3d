import { GLTFSharedTextureCache } from "@aura3d/assets";
import { createTypedGLBActor, type TypedGLBActor, type TypedGLBActorAsset, type TypedGLBActorOptions } from "../../production-runtime/TypedGLBActor.js";
import type { AuraAssetRef } from "../nodes/types.js";

/**
 * SA-04 (lane L8) — `cloneSkinned` / `characters.clone`, the
 * `SkeletonUtils.clone` analogue for the production GLB path.
 *
 * Each clone gets its own `TypedGLBActor`: an independent scene graph, skeleton
 * instance, animation runtime, and mixer state, so `playClip`/`applyPose` on
 * one clone never writes another clone's bones. What they share is what three
 * shares and what the parse cache already shares:
 *
 *  - the parsed `GLTFAsset` (reference-counted through
 *    `GLTFAssetParseCache`, which `loadProductionGLTFRenderPipeline` already
 *    uses — the GLB is fetched and decoded once);
 *  - the decoded+uploaded GPU `Texture`s, through a per-call
 *    `GLTFSharedTextureCache` lease passed to every clone's resource build.
 *    Texture bytes stay flat as clone count grows; the cache frees the
 *    textures only after the last clone disposes.
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
   * textures). Defaults to a fresh cache per call.
   */
  readonly sharedTextures?: GLTFSharedTextureCache;
  /** Per-clone id suffix builder; defaults to `-clone-${index}` (index 0-based). */
  readonly cloneId?: (index: number) => string;
}

export interface ClonedSkinnedModel {
  /** The clone actors, in creation order — each with an independent skeleton and animation runtime. */
  readonly actors: readonly TypedGLBActor[];
  /** The shared texture cache the clones lease from (inspect `size`/`refCount` for memory evidence). */
  readonly sharedTextures: GLTFSharedTextureCache;
  /** The source asset resolved from the input. */
  readonly asset: TypedGLBActorAsset;
  /** Disposes every clone; shared textures are freed when the last clone's lease releases. */
  dispose(): void;
}

/**
 * Remembers which shared-texture cache an actor leases, so a later
 * `cloneSkinned(existingClone)` joins the same cache and texture bytes stay
 * flat even across separate clone calls.
 */
const actorSharedTextures = new WeakMap<TypedGLBActor, GLTFSharedTextureCache>();

function resolveCloneAsset(model: CloneSkinnedModelInput): TypedGLBActorAsset {
  if (typeof model === "string") {
    return { url: model };
  }
  if ("kind" in model && model.kind === "aura-typed-glb-actor") {
    return model.asset;
  }
  const asset = model as TypedGLBActorAsset & Partial<AuraAssetRef<"model">>;
  if (typeof asset.url !== "string" || asset.url.length === 0) {
    throw new Error("cloneSkinned: model must be an AuraAssetRef, a TypedGLBActor, an asset with a url, or a url string.");
  }
  return {
    url: asset.url,
    ...(asset.type !== undefined ? { type: asset.type } : {}),
    ...(asset.format !== undefined ? { format: asset.format } : {}),
    ...(asset.hash !== undefined ? { hash: asset.hash } : {}),
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
  const sharedTextures = options.sharedTextures
    ?? (typeof model === "object" && "kind" in model && model.kind === "aura-typed-glb-actor" ? actorSharedTextures.get(model) : undefined)
    ?? new GLTFSharedTextureCache();
  const prefix = options.idPrefix ?? baseId(model, asset);
  const cloneId = options.cloneId ?? ((index: number) => `${prefix}-clone-${index}`);

  const actors: TypedGLBActor[] = [];
  try {
    for (let index = 0; index < count; index++) {
      const id = cloneId(index);
      const actor = await createTypedGLBActor({
        ...options,
        asset,
        id,
        name: id,
        width: options.width ?? 512,
        height: options.height ?? 512,
        sharedTextures
      });
      actorSharedTextures.set(actor, sharedTextures);
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
 * `characters.clone` — the namespace twin of {@link cloneSkinned}, kept in
 * three's `SkeletonUtils.clone(source, count)` argument order.
 */
export const characters = {
  clone: cloneSkinned
} as const;
