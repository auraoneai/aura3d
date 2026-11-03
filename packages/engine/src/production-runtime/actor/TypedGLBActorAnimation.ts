// PR 0b-3 carve-out (CONTRACTS.md §3.6) — verbatim move from TypedGLBActor.ts; 0 changed logic lines.
// File: packages/engine/src/production-runtime/actor/TypedGLBActorAnimation.ts — owner lane 06.
//
// Contents: the lastApply collection (the five animation methods plus the morph apply), the
// evidence builder (:357-390 on the map), and the material/morph key handling helpers.
// `createTypedGLBActorAnimationTrack` is the seam factory: the method bodies are verbatim,
// with the `animation`/`actor` free variables turned into parameters.

import { isTextureBinding, type Material, type RenderItem, type Texture, type TextureBinding } from "@aura3d/rendering";
import { parseGLTFRuntimeMaterialKey } from "@aura3d/assets/gltf-runtime";
import type {
  GLTFSceneAnimationApplyResult,
  GLTFSceneAnimationMaterialSink,
  GLTFSceneAnimationRuntime,
  GLTFScenePose,
  ProductionGLTFRenderPipeline
} from "@aura3d/assets/gltf-runtime";
import type { TypedGLBActor, TypedGLBActorEvidence, TypedGLBActorMorphApplyResult } from "../TypedGLBActor";

type AnimatedTextureSlot = "baseColor" | "metallicRoughness" | "normal" | "occlusion" | "emissive";
const ANIMATED_TEXTURE_SLOTS: readonly AnimatedTextureSlot[] = ["baseColor", "metallicRoughness", "normal", "occlusion", "emissive"];
type TextureSnapshot = { readonly binding: TextureBinding; readonly texture: Texture | null };
interface TextureAnimationSnapshotState {
  readonly bindings: Map<Material, Map<AnimatedTextureSlot, TextureSnapshot | undefined>>;
  readonly sourceTextures: Map<string, Map<AnimatedTextureSlot, Set<Texture>>>;
}
interface TextureAnimationRegistry {
  readonly owners: WeakMap<Material, WeakRef<object>[]>;
  readonly snapshots: WeakMap<object, TextureAnimationSnapshotState>;
}

// The same mutable Material in two actor libraries cannot be animated safely. Weak
// owners do not keep retired actor libraries alive. Repeated resolvers for one library
// count as a single owner and share their original snapshots. The global symbol also
// handles applications that have loaded multiple copies of the engine package.
const textureAnimationRegistryKey = Symbol.for("@aura3d/engine/texture-animation-registry/v1");
const textureAnimationGlobal = globalThis as unknown as Record<symbol, unknown>;
const textureAnimationRegistry = (textureAnimationGlobal[textureAnimationRegistryKey] ??= {
  owners: new WeakMap(), snapshots: new WeakMap()
}) as TextureAnimationRegistry;

function registerTextureAnimationOwner(material: Material, owner: object): boolean {
  const owners = (textureAnimationRegistry.owners.get(material) ?? []).filter((entry) => entry.deref() !== undefined);
  if (!owners.some((entry) => entry.deref() === owner)) owners.push(new WeakRef(owner));
  textureAnimationRegistry.owners.set(material, owners);
  return owners.some((entry) => entry.deref() !== owner);
}

function textureTransformParameter(parameter: string): { slot: AnimatedTextureSlot; component: "Offset" | "Scale" | "Rotation" } | undefined {
  const match = /^u_(baseColor|metallicRoughness|normal|occlusion|emissive)Texture(Offset|Scale|Rotation)$/.exec(parameter);
  return match ? { slot: match[1] as AnimatedTextureSlot, component: match[2] as "Offset" | "Scale" | "Rotation" } : undefined;
}

function textureAnimationValueMatches(actual: unknown, expected: number | readonly [number, number]): boolean {
  if (typeof expected === "number") return typeof actual === "number" && Math.fround(actual) === Math.fround(expected);
  return (Array.isArray(actual) || actual instanceof Float32Array) && actual.length === 2
    && actual.every((component, i) => Math.fround(component) === Math.fround(expected[i]!));
}

/**
 * Builds an actor-local adapter for animation-pointer tracks. Resource keys carry the source
 * material identity and a rendering-contract suffix; the material object's name alone is not
 * sufficient when one source material has several skinned or instanced runtime contracts.
 * Resolve current bindings on every operation so variants and disposal cannot leave stale sinks.
 */
export function createGLBActorAnimationMaterialResolver(
  resources: {
    readonly materialLibrary?: ReadonlyMap<string, Material> | undefined;
    readonly loadIssues?: readonly { readonly code: string; readonly textureIndex?: number; readonly imageIndex?: number }[] | undefined;
  },
  asset?: { readonly materials: readonly {
    readonly name: string; readonly baseColorTexture?: unknown; readonly metallicRoughnessTexture?: unknown;
    readonly normalTexture?: unknown; readonly occlusionTexture?: unknown; readonly emissiveTexture?: unknown;
    readonly unlit?: boolean; readonly pbrSpecularGlossiness?: unknown;
    readonly specular?: unknown; readonly sheen?: unknown; readonly iridescence?: unknown;
  }[] },
  options?: {
    readonly importedMaterialOverridden?: boolean;
    /** Native resource creation has settled all initial decodes, unlike a foreign adapter. */
    readonly textureLoadFailuresFinal?: boolean;
  }
): (name: string) => GLTFSceneAnimationMaterialSink | undefined {
  type Failure = "missing-map" | "changed-map" | "disposed" | "ambiguous" | "unsupported";
  const owner = resources.materialLibrary ?? resources;
  const previousSnapshots = textureAnimationRegistry.snapshots.get(owner);
  const snapshots = previousSnapshots ?? { bindings: new Map(), sourceTextures: new Map() };
  const capturedBindings = snapshots.bindings;
  const sourceTextures = snapshots.sourceTextures;
  if (!previousSnapshots) textureAnimationRegistry.snapshots.set(owner, snapshots);
  const rememberSourceTexture = (name: string, slot: AnimatedTextureSlot, texture: Texture): void => {
    let slots = sourceTextures.get(name);
    if (!slots) sourceTextures.set(name, slots = new Map());
    let textures = slots.get(slot);
    if (!textures) slots.set(slot, textures = new Set());
    textures.add(texture);
  };
  // Record the imported bindings before returning a handle to the actor. A later
  // replacement, even with a live texture, must not silently become an animation target.
  for (const [key, material] of previousSnapshots ? [] : resources.materialLibrary?.entries() ?? []) {
    registerTextureAnimationOwner(material, owner);
    if (material.disposed) continue;
    let captured = capturedBindings.get(material);
    if (!captured) {
      captured = new Map();
      for (const slot of ANIMATED_TEXTURE_SLOTS) {
        const binding = material.getParameter(`u_${slot}Texture`);
        captured.set(slot, isTextureBinding(binding) ? { binding, texture: binding.texture } : undefined);
      }
      capturedBindings.set(material, captured);
    }
    const name = parseGLTFRuntimeMaterialKey(key).material;
    for (const slot of ANIMATED_TEXTURE_SLOTS) {
      const binding = captured.get(slot)?.binding;
      if (!binding?.texture || !binding.ready || binding.texture.disposed) continue;
      rememberSourceTexture(name, slot, binding.texture);
    }
  }
  const boundMaterials = (name: string): Material[] => {
    const entries = [...(resources.materialLibrary?.entries() ?? [])];
    const keyed = entries.filter(([key]) => parseGLTFRuntimeMaterialKey(key).material === name).map(([, material]) => material);
    // The public helper previously also accepted name-only ad hoc libraries.
    // Do not use that fallback when source definitions are available: doing so
    // could silently select a different source material after deduplication.
    return [...new Set(keyed.length || asset ? keyed : entries.map(([, material]) => material).filter((material) => material.name === name))];
  };

  const inspect = (name: string, parameter: string):
    | { readonly status: "available"; readonly materials: readonly Material[] }
    | { readonly status: Failure } => {
    const transform = textureTransformParameter(parameter);
    const slot = parameter === "u_normalScale" ? "normalTexture"
      : parameter === "u_occlusionStrength" ? "occlusionTexture" : undefined;
    const physical = parameter === "u_specularFactor" ? "specular"
      : parameter === "u_sheenRoughnessFactor" ? "sheen"
      : parameter === "u_iridescenceFactor" || parameter === "u_iridescenceIor" ? "iridescence" : undefined;
    if ((!slot && !physical && !transform) || !asset || options?.importedMaterialOverridden) return { status: "unsupported" };
    const definitions = asset.materials.filter((material) => material.name === name);
    if (definitions.length > 1) return { status: "ambiguous" };
    const definition = definitions[0];
    if (!definition) return { status: "unsupported" };
    if (slot && !definition[slot]) return { status: "missing-map" };
    if (physical && (!definition[physical] || definition.unlit || definition.pbrSpecularGlossiness)) return { status: "unsupported" };
    const transformSlot = transform ? `${transform.slot}Texture` as const : undefined;
    if (transformSlot && !definition[transformSlot]) return { status: "missing-map" };
    const textureInfo = transformSlot ? definition[transformSlot] : undefined;
    if (textureInfo && typeof textureInfo === "object") {
      const info = textureInfo as { readonly texture?: number; readonly image?: number };
      // A failed decode can leave a ready, live 1px fallback bound. Its UVs do
      // not prove an authored texture is present, including shared-image aliases.
      if (resources.loadIssues?.some((issue) => issue.code === "texture-load-failed"
        && ((info.texture !== undefined && issue.textureIndex === info.texture)
          || (info.image !== undefined && issue.imageIndex === info.image)))) return { status: "missing-map" };
    }
    if (transform && ((definition.unlit && transform.slot !== "baseColor")
      || (definition.pbrSpecularGlossiness && (transform.slot === "baseColor" || transform.slot === "metallicRoughness")))) return { status: "unsupported" };

    const materials = boundMaterials(name);
    if (materials.length === 0) return { status: "unsupported" };
    const selected = new Set(materials);
    // Deduplication can alias different source definitions to the same runtime object.
    // Mutating that object would animate an unrelated source material as well.
    for (const [key, material] of resources.materialLibrary?.entries() ?? []) {
      if (selected.has(material) && parseGLTFRuntimeMaterialKey(key).material !== name) {
        return { status: "ambiguous" };
      }
    }
    const textureParameter = slot === "normalTexture" ? "u_normalTexture" : "u_occlusionTexture";
    for (const material of materials) {
      if (material.disposed) return { status: "disposed" };
      const sharedOwner = registerTextureAnimationOwner(material, owner);
      if (transform) {
        if (sharedOwner) return { status: "ambiguous" };
        const supportedShader = material.shaderKey === "aura3d/pbr-textured"
          || (transform.slot === "baseColor" && ["aura3d/textured-unlit", "aura3d/skinned-lit", "aura3d/skinned-lit-8"].includes(material.shaderKey));
        if (!supportedShader) return { status: "unsupported" };
        const kind = transform.component === "Rotation" ? "float" : "vec2";
        const current = material.getParameter(parameter);
        if (!material.uniformSchema.some((uniform) => uniform.name === parameter && uniform.kind === kind)
          || (kind === "float" ? typeof current !== "number" || !Number.isFinite(current)
            : !(Array.isArray(current) || current instanceof Float32Array) || current.length !== 2 || !Array.from(current).every(Number.isFinite))) return { status: "unsupported" };
        const textureName = `u_${transform.slot}Texture`;
        const binding = material.getParameter(textureName);
        if (!isTextureBinding(binding)) return { status: "unsupported" };
        if (binding.texture?.disposed) return { status: "disposed" };
        const enabled = material.getParameter(`${textureName}Enabled`);
        if (!binding.texture || !binding.ready || (enabled !== undefined && enabled !== 1)) return { status: "missing-map" };
        // Textured-unlit always samples the map and has no Enabled uniform.
        if (enabled === undefined && material.shaderKey !== "aura3d/textured-unlit") return { status: "unsupported" };
        let captured = capturedBindings.get(material);
        if (!captured) {
          // Lazily-created variants are admissible only if they use the same
          // imported texture as an already captured contract of this source.
          if (!sourceTextures.get(name)?.get(transform.slot)?.has(binding.texture)) return { status: "changed-map" };
          captured = new Map([[transform.slot, { binding, texture: binding.texture }]]);
          capturedBindings.set(material, captured);
        } else if (!captured.has(transform.slot)) {
          if (!sourceTextures.get(name)?.get(transform.slot)?.has(binding.texture)) return { status: "changed-map" };
          captured.set(transform.slot, { binding, texture: binding.texture });
        } else {
          const original = captured.get(transform.slot);
          if (original?.binding !== binding || original?.texture !== binding.texture) {
            // A lazy provider may replace an unready binding with a ready
            // wrapper for the *same* source texture and sampler. Do not
            // mistake this completion for an unrelated map replacement.
            if (!original || original.binding.ready || !original.texture ||
                original.texture !== binding.texture || original.binding.sampler !== binding.sampler) return { status: "changed-map" };
            captured.set(transform.slot, { binding, texture: binding.texture });
            rememberSourceTexture(name, transform.slot, binding.texture);
          }
        }
        continue;
      }
      if (physical && !["aura3d/pbr-direct", "aura3d/pbr-textured", "aura3d/skinned-lit", "aura3d/skinned-lit-8"].includes(material.shaderKey)) return { status: "unsupported" };
      if (!material.uniformSchema.some((uniform) => uniform.name === parameter && uniform.kind === "float")
        || typeof material.getParameter(parameter) !== "number") return { status: "unsupported" };
      if (!slot) continue;
      const binding = material.getParameter(textureParameter);
      if (!isTextureBinding(binding)) return { status: "unsupported" };
      if (binding.texture?.disposed) return { status: "disposed" };
      if (!binding.texture || !binding.ready || material.getParameter(`${textureParameter}Enabled`) !== 1) {
        return { status: "missing-map" };
      }
    }
    return { status: "available", materials };
  };

  // This is deliberately narrower than the existing missing-map diagnostic.
  // A null, disabled or not-yet-ready map can be supplied later; only an
  // authored source failure or an irreversible current resource contract is
  // evidence for rejecting startup. Older/foreign sinks make no such claim.
  const availability = (name: string, parameter: string): NonNullable<ReturnType<NonNullable<GLTFSceneAnimationMaterialSink["animationParameterAvailability"]>>> => {
    if (options?.importedMaterialOverridden) return { status: "unavailable", reason: "imported-material-overridden" };
    if (!asset) return { status: "unknown", reason: "missing-source-material" };
    const definitions = asset.materials.filter((material) => material.name === name);
    if (definitions.length !== 1) return { status: "unknown", reason: "ambiguous-source-material" };
    const definition = definitions[0]!;
    const transform = textureTransformParameter(parameter);
    const slot = parameter === "u_normalScale" ? "normalTexture"
      : parameter === "u_occlusionStrength" ? "occlusionTexture"
      : transform ? `${transform.slot}Texture` as const : undefined;
    const physical = ["u_specularFactor", "u_sheenRoughnessFactor", "u_iridescenceFactor", "u_iridescenceIor"].includes(parameter);
    const materials = boundMaterials(name);
    let failedTexture = false;
    if (slot) {
      const info = definition[slot];
      if (!info) return { status: "unavailable", reason: "missing-source-map" };
      if (typeof info === "object") {
        const source = info as { readonly texture?: number; readonly image?: number };
        failedTexture = resources.loadIssues?.some((issue) => issue.code === "texture-load-failed"
          && ((source.texture !== undefined && issue.textureIndex === source.texture)
            || (source.image !== undefined && issue.imageIndex === source.image))) === true;
      }
    }
    if (materials.length === 0) return { status: "unknown", reason: "missing-material" };
    // A provider may replace a disposed material in the library later.
    if (materials.some((material) => material.disposed)) return { status: "unknown", reason: "disposed" };
    if (failedTexture) {
      // A historical load issue alone does not prove a current or final
      // failure: an adapter or extension can replace the fallback lazily.
      const textureSlot = transform?.slot ?? (slot === "normalTexture" ? "normal" : "occlusion");
      const textureName = `u_${textureSlot}Texture`;
      for (const material of materials) {
        const current = material.getParameter(textureName);
        if (isTextureBinding(current) && !current.ready) return { status: "pending", reason: "missing-map" };
        const enabled = material.getParameter(`${textureName}Enabled`);
        if (enabled !== undefined && enabled !== 1) return { status: "unknown", reason: "missing-map" };
        const captured = capturedBindings.get(material)?.get(textureSlot);
        if (!isTextureBinding(current) || !captured || captured.binding !== current || captured.texture !== current.texture) {
          return { status: "unknown", reason: "texture-load-failed" };
        }
      }
      return options?.textureLoadFailuresFinal
        ? { status: "unavailable", reason: "texture-load-failed" }
        : { status: "unknown", reason: "texture-load-failed" };
    }
    if (transform) {
      const textureName = `u_${transform.slot}Texture`;
      // An explicitly unready map is pending even if its wrapper differs
      // from the captured binding; only a ready replacement can be judged.
      if (materials.some((material) => {
        const texture = material.getParameter(textureName);
        return isTextureBinding(texture) && !texture.ready;
      })) return { status: "pending", reason: "missing-map" };

      const info = definition[`${transform.slot}Texture` as const] as { readonly texCoord?: number } | undefined;
      const usesOtherCoreMaps = Boolean(definition.normalTexture || definition.metallicRoughnessTexture ||
        definition.occlusionTexture || definition.emissiveTexture);
      const incompatibleBuiltin = materials.some((material) => {
        const skinned = material.shaderKey === "aura3d/skinned-lit" || material.shaderKey === "aura3d/skinned-lit-8";
        const unlit = material.shaderKey === "aura3d/textured-unlit";
        // These shaders transform UV0 in the vertex stage. Skinned non-base
        // maps lack individual uniforms and share that transformed UV, so a
        // base-color animation would also move any other present core maps.
        return (skinned || unlit) && (transform.slot !== "baseColor" || (info?.texCoord ?? 0) !== 0 ||
          (skinned && usesOtherCoreMaps));
      });
      if (incompatibleBuiltin) return { status: "unavailable", reason: "unsupported" };
    }
    // Legacy material leaves still use the existing setter contract. The
    // adapter cannot prove a shader consumes every such uniform.
    if (!slot && !physical && !transform) return { status: "unknown", reason: "legacy-material-contract" };
    const binding = inspect(name, parameter);
    if (binding.status === "available") return { status: "available" };
    // A disposed texture may still be replaced by an asynchronous provider.
    if (binding.status === "disposed") return { status: "unknown", reason: "disposed" };
    if (binding.status === "missing-map") {
      const textureName = transform ? `u_${transform.slot}Texture`
        : slot === "normalTexture" ? "u_normalTexture" : "u_occlusionTexture";
      const pending = materials.some((material) => {
        const texture = material.getParameter(textureName);
        return isTextureBinding(texture) && !texture.ready;
      });
      return { status: pending ? "pending" : "unknown", reason: binding.status };
    }
    if (transform && (binding.status === "ambiguous" || binding.status === "changed-map")) {
      return { status: "unavailable", reason: binding.status };
    }
    // An unsupported shader/schema, changed map or shared material may be
    // replaced by a lazy provider. There is no completion contract for it.
    return { status: "unknown", reason: binding.status };
  };

  return (name: string) => {
    if (!asset?.materials.some((material) => material.name === name) && boundMaterials(name).length === 0) return undefined;
    return {
      name,
      // Preserve the legacy sink for existing leaves. A distinct runtime material
      // receives one write even if it appears under multiple aliases.
      setAnimationParameter: (parameter, value) => {
        for (const material of boundMaterials(name)) material.setParameter(parameter, value);
      },
      animationParameterStatus: (parameter) => inspect(name, parameter).status,
      animationParameterAvailability: (parameter) => availability(name, parameter),
      applyAnimationParameter: (parameter, value) => {
        if (!Number.isFinite(value) || !Number.isFinite(Math.fround(value))
          || (parameter === "u_normalScale" && value < 0)
          || (["u_occlusionStrength", "u_specularFactor", "u_sheenRoughnessFactor", "u_iridescenceFactor"].includes(parameter) && (value < 0 || value > 1))
          || (parameter === "u_iridescenceIor" && value < 1)) return "unsupported";
        const result = inspect(name, parameter);
        if (result.status !== "available") return result.status;
        // Snapshot all live variants before writing. Standard Material setters
        // are synchronous, but a caller-supplied subclass may throw; restore
        // touched variants instead of leaving a partially applied animation.
        const previous = result.materials.map((material) => material.getParameter(parameter)!);
        let touched = 0;
        try {
          for (const material of result.materials) { touched += 1; material.setParameter(parameter, value); }
        } catch (error) {
          const failures: unknown[] = [];
          for (let i = touched - 1; i >= 0; i -= 1) {
            try { result.materials[i]!.setParameter(parameter, previous[i]!); } catch (rollbackError) { failures.push(rollbackError); }
          }
          if (failures.length) throw new AggregateError([error, ...failures], "Material animation write and rollback failed.");
          throw error;
        }
        return "applied";
      },
      applyAnimationTextureTransform: (parameter, value) => {
        const transform = textureTransformParameter(parameter);
        if (!transform) return "unsupported";
        const validNumber = (entry: unknown): entry is number =>
          typeof entry === "number" && Number.isFinite(entry) && Number.isFinite(Math.fround(entry));
        if (transform.component === "Rotation" ? !validNumber(value)
          : !Array.isArray(value) || value.length !== 2 || !value.every(validNumber)) return "unsupported";
        const result = inspect(name, parameter);
        if (result.status !== "available") return result.status;
        const previous = result.materials.map((material) => material.getParameter(parameter)!);
        let touched = 0;
        const rollback = () => {
          const failures: unknown[] = [];
          for (let i = touched - 1; i >= 0; i -= 1) {
            try { result.materials[i]!.setParameter(parameter, previous[i]!); } catch (error) { failures.push(error); }
          }
          return failures;
        };
        const liveFailure = (): Failure | undefined => {
          const live = inspect(name, parameter);
          if (live.status !== "available") return live.status;
          return live.materials.length !== result.materials.length || live.materials.some((entry, i) => entry !== result.materials[i]) ? "changed-map" : undefined;
        };
        const abort = (failure: Failure): Failure => {
          const failures = rollback();
          touched = 0;
          if (failures.length) throw new AggregateError(failures, "Texture animation rollback failed.");
          return failure;
        };
        try {
          for (const material of result.materials) {
            // A custom setter may alter the library, binding, or another variant
            // synchronously. Recheck before each write and roll back on change.
            const failure = liveFailure();
            if (failure) return abort(failure);
            touched += 1;
            material.setParameter(parameter, typeof value === "number" ? value : [value[0], value[1]]);
          }
          const failure = liveFailure();
          if (failure) return abort(failure);
          // A custom material may accept a setter call while dropping or
          // overwriting the value. Count a write only when all variants retain it.
          if (result.materials.some((material) => !textureAnimationValueMatches(material.getParameter(parameter), value))) return abort("unsupported");
        } catch (error) {
          const failures = rollback();
          if (failures.length) throw new AggregateError([error, ...failures], "Texture animation write and rollback failed.");
          throw error;
        }
        return "applied";
      }
    };
  };
}

export interface TypedGLBActorAnimationTrack {
  readonly lastApply: GLTFSceneAnimationApplyResult | null;
  readonly lastMorphApply: TypedGLBActorMorphApplyResult | undefined;
  playClip(name: string, time: number): GLTFSceneAnimationApplyResult;
  playRootMotionClip(
    name: string,
    options: Parameters<GLTFSceneAnimationRuntime["applyRootMotionClip"]>[1]
  ): ReturnType<GLTFSceneAnimationRuntime["applyRootMotionClip"]>;
  playRootMotionClips(
    samples: Parameters<GLTFSceneAnimationRuntime["applyRootMotionClips"]>[0],
    options: Parameters<GLTFSceneAnimationRuntime["applyRootMotionClips"]>[1]
  ): ReturnType<GLTFSceneAnimationRuntime["applyRootMotionClips"]>;
  applyRetargetedPose(pose: GLTFScenePose, time?: number): GLTFSceneAnimationApplyResult;
  playRetargetedClip(pose: GLTFScenePose, time?: number): GLTFSceneAnimationApplyResult;
  applyMorphTargets(weights: Readonly<Record<string, number>>, options?: TypedGLBActorMorphApplyOptions): TypedGLBActorMorphApplyResult;
}

/** SA-05: `clampWeights: false` passes finite out-of-range influences through (opt-in). */
export interface TypedGLBActorMorphApplyOptions {
  readonly clampWeights?: boolean;
}

/** lastApply collection — the animation-driving methods, verbatim from the actor literal. */
export function createTypedGLBActorAnimationTrack(
  animation: GLTFSceneAnimationRuntime,
  actor: TypedGLBActor
): TypedGLBActorAnimationTrack {
  let lastApply: GLTFSceneAnimationApplyResult | null = null;
  let lastMorphApply: TypedGLBActorMorphApplyResult | undefined;
  return {
    get lastApply() { return lastApply; },
    get lastMorphApply() { return lastMorphApply; },
    playClip(name, time) {
      lastApply = animation.applyClipByName(name, time);
      return lastApply;
    },
    playRootMotionClip(name, motionOptions) {
      const result = animation.applyRootMotionClip(name, motionOptions);
      lastApply = result.applyResult;
      return result;
    },
    playRootMotionClips(samples, motionOptions) {
      const result = animation.applyRootMotionClips(samples, motionOptions);
      lastApply = result.applyResult;
      return result;
    },
    applyRetargetedPose(pose, time = 0) {
      lastApply = animation.applyPose(pose, "retargeted-pose", time);
      return lastApply;
    },
    playRetargetedClip(pose, time = 0) {
      lastApply = animation.applyPose(pose, "retargeted-clip", time);
      return lastApply;
    },
    applyMorphTargets(weights, options) {
      lastMorphApply = applyTypedGLBActorMorphTargets(actor, weights, options?.clampWeights !== false);
      return lastMorphApply;
    }
  };
}

export function createTypedGLBActorEvidence(
  actor: TypedGLBActor,
  lastApply: GLTFSceneAnimationApplyResult | null = null,
  lastMorphApply?: TypedGLBActorMorphApplyResult
): TypedGLBActorEvidence {
  const snapshot = actor.animation.snapshot();
  const renderItems = actor.collectRenderItems();
  const morphTargetCount = actor.pipeline.asset.meshes.reduce((total, mesh) => total + mesh.morphTargets.length, 0);
  return {
    kind: "aura-typed-glb-actor-evidence",
    id: actor.id,
    name: actor.name,
    url: actor.asset.url,
    ...(actor.asset.hash ? { assetHash: actor.asset.hash } : {}),
    ...(typeof actor.asset.sizeBytes === "number" ? { assetSizeBytes: actor.asset.sizeBytes } : {}),
    ...(actor.asset.bounds ? { bounds: actor.asset.bounds } : {}),
    clips: snapshot.clips,
    skinningBindingCount: snapshot.skinningBindingCount,
    morphTargetCount,
    renderItemCount: renderItems.length,
    skinnedRenderItemCount: renderItems.filter((item) => item.skinning).length,
    morphRenderItemCount: renderItems.filter((item) => item.morphTargets && item.morphTargets.length > 0).length,
    lastClip: lastApply?.clipName ?? null,
    lastTracksApplied: lastApply?.tracksApplied ?? 0,
    lastTransformTracksApplied: lastApply?.transformTracksApplied ?? 0,
    lastMaterialTracksApplied: lastApply?.materialTracksApplied ?? 0,
    lastLightTracksApplied: lastApply?.lightTracksApplied ?? 0,
    lastFootPlantingGroundedFeet: lastApply?.footPlanting?.groundedFeet ?? 0,
    lastFootPlantingTargetError: lastApply?.footPlanting?.averageTargetError ?? 0,
    lastFootPlantingHipOffset: lastApply?.footPlanting?.hipOffset ?? 0,
    lastFootPlantingMissingLegs: lastApply?.footPlanting ? [...lastApply.footPlanting.missingLegNodes] : [],
    lastFootPlantingFeet: lastApply?.footPlanting?.feet,
    lastFootPlantingSurfaces: lastApply?.footPlanting?.surfaces,
    lastFootPlantingDeformation: lastApply?.footPlanting?.legDeformation,
    footPlantingConfigured: lastApply?.footPlanting !== undefined,
    lastSkinningPalettesUpdated: lastApply?.skinningPalettesUpdated ?? 0,
    ...(lastMorphApply ? { lastMorphApply } : {}),
    missingTargets: lastApply?.missingTargets ?? [],
    warnings: [
      ...(snapshot.skinningBindingCount < 1 ? ["No skinning bindings were detected for this typed GLB actor."] : []),
      ...(snapshot.clips.length < 1 ? ["No animation clips were detected for this typed GLB actor."] : []),
      ...(morphTargetCount < 1 ? ["No morph targets were detected for this typed GLB actor."] : [])
    ],
    ...(actor.staticConsolidation ? { staticConsolidation: actor.staticConsolidation } : {})
  };
}

function applyTypedGLBActorMorphTargets(
  actor: TypedGLBActor,
  weights: Readonly<Record<string, number>>,
  clampWeights = true
): TypedGLBActorMorphApplyResult {
  const requested = normalizeTypedGLBActorMorphWeights(weights, clampWeights);
  const requestedTargets = [...requested.keys()];
  const appliedTargets = new Set<string>();
  const activeWeights: Record<string, number> = {};
  const missingTargets = new Set<string>();
  let affectedRenderableCount = 0;
  let appliedWeightCount = 0;

  const meshesByName = new Map(actor.pipeline.asset.meshes.map((mesh) => [mesh.name, mesh]));
  for (const { renderable } of actor.pipeline.resources.scene.collectRenderables()) {
    const mesh = meshesByName.get(renderable.geometry);
    if (!mesh || mesh.morphTargets.length === 0) continue;
    const nextWeights = mesh.morphTargets.map((target, index) => {
      const aliases = typedGLBActorMorphTargetAliases(mesh.name, target.name, index);
      for (const alias of aliases) {
        const weight = requested.get(alias);
        if (weight !== undefined) {
          appliedTargets.add(alias);
          activeWeights[alias] = weight;
          return weight;
        }
      }
      return 0;
    });
    renderable.morphWeights = nextWeights;
    affectedRenderableCount += 1;
    appliedWeightCount += nextWeights.filter((weight) => Math.abs(weight) > 0.000001).length;
  }

  for (const target of requestedTargets) {
    if (!appliedTargets.has(target)) missingTargets.add(target);
  }

  return {
    requestedTargets,
    appliedTargets: [...appliedTargets],
    missingTargets: [...missingTargets],
    activeWeights,
    affectedRenderableCount,
    appliedWeightCount
  };
}

function normalizeTypedGLBActorMorphWeights(weights: Readonly<Record<string, number>>, clampWeights = true): Map<string, number> {
  const normalized = new Map<string, number>();
  for (const [name, weight] of Object.entries(weights)) {
    const target = name.trim();
    if (!target) continue;
    normalized.set(target, clampWeights ? clampTypedGLBActorMorphWeight(weight) : sanitizeTypedGLBActorMorphWeightUnclamped(weight));
  }
  return normalized;
}

/** SA-05 opt-in: finite values pass through (negative and >1 influences allowed). */
function sanitizeTypedGLBActorMorphWeightUnclamped(weight: number): number {
  return Number.isFinite(weight) ? weight : 0;
}

function clampTypedGLBActorMorphWeight(weight: number): number {
  if (!Number.isFinite(weight)) return 0;
  return Math.min(1, Math.max(0, weight));
}

function typedGLBActorMorphTargetAliases(
  meshName: string,
  targetName: string | undefined,
  targetIndex: number
): readonly string[] {
  const fallback = `target-${targetIndex}`;
  const numberedFallback = `${meshName}-morph-${targetIndex + 1}`;
  const aliases = new Set<string>([fallback, numberedFallback, `${meshName}.${fallback}`, `${meshName}:${fallback}`]);
  if (targetName && targetName.trim().length > 0) {
    const trimmed = targetName.trim();
    aliases.add(trimmed);
    aliases.add(`${meshName}.${trimmed}`);
    aliases.add(`${meshName}:${trimmed}`);
  }
  return [...aliases];
}

/* ------------------------------------------------------------ T2.8 §9.7 */

/**
 * Shader warm-up (PRD-06 §9.7). The `prd06.animation` extension's `onLoad`
 * starts compiling the forward + depth (+ velocity) programs for every
 * skinned/morph render item and keeps them out of `collectRenderItems` until
 * the compile resolves — the first visible frame never pays a program-link
 * hitch (research/09's depth-recompile stall).
 *
 * The actor layer has no device, so the compile itself runs through a seam:
 * whoever owns the device installs a {@link Prd06ShaderWarmupCompiler} —
 * `installPrd06ShaderWarmup(device, flags)` in `lanes/prd06.ts` routes through
 * C-02 `ProgramCacheLike.precompile` (which is the C-28 stub semantics:
 * resolves after a synchronous compile; `device.compileAsync` real parallel
 * compile is the GPU/tiers lane's). With no compiler installed the warm-up is
 * a no-op and nothing is withheld.
 */

export type Prd06ShaderWarmupCompiler = (items: readonly RenderItem[]) => Promise<void> | void;

let activeShaderWarmupCompiler: Prd06ShaderWarmupCompiler | null = null;

export function setPrd06ShaderWarmupCompiler(compiler: Prd06ShaderWarmupCompiler | null): void {
  activeShaderWarmupCompiler = compiler;
}

export function prd06ShaderWarmupCompiler(): Prd06ShaderWarmupCompiler | null {
  return activeShaderWarmupCompiler;
}

interface Prd06ShaderWarmupState {
  pending: Promise<void>;
  ready: boolean;
}

const shaderWarmupByActor = new WeakMap<TypedGLBActor, Prd06ShaderWarmupState>();

/** Items whose programs the warm-up covers — the skinned/morph set. */
function prd06WarmupItem(item: RenderItem): boolean {
  return item.skinning !== undefined || item.morphWeights !== undefined;
}

/** Warm-up compile rejections, counted so "no warm-up" degradations stay observable. */
let warmupRejectionCount = 0;
const warmupRejectionReasons = new Set<string>();

/** Degradation surface: how many warm-up compiles rejected, and why. */
export function prd06ShaderWarmupRejections(): { readonly count: number; readonly reasons: readonly string[] } {
  return { count: warmupRejectionCount, reasons: [...warmupRejectionReasons] };
}

/**
 * Begin the warm-up for `actor` over `items` (the load-time collect; the
 * extension resolves them through `collectTypedGLBActorRenderItems` so the
 * list is the raw set, not extension-transformed).
 */
export function beginPrd06ShaderWarmup(actor: TypedGLBActor, items: readonly RenderItem[]): void {
  // 06-S12: actor load is the flag-on entry — start the lazy solver chunk here
  // so constraint/spring evaluation resolves on the same settle window as the
  // warm-up itself rather than mid-scene.
  ensureAnimationLane();
  const compiler = activeShaderWarmupCompiler;
  const warm = items.filter(prd06WarmupItem);
  const state: Prd06ShaderWarmupState = { pending: Promise.resolve(), ready: true };
  if (compiler && warm.length > 0) {
    state.ready = false;
    try {
      state.pending = Promise.resolve(compiler(warm)).then(() => {
        state.ready = true;
      }).catch((error: unknown) => {
        // A rejected compile degrades to "no warm-up" — without this the
        // actor's skinned/morph items are withheld forever (character never
        // draws) and the rejection escapes as an unhandledrejection mid-frame.
        state.ready = true;
        warmupRejectionCount += 1;
        warmupRejectionReasons.add(error instanceof Error ? error.message : String(error));
      });
    } catch (error) {
      // A synchronously-throwing compiler degrades to "no warm-up" rather than
      // withholding the actor's items forever — the next collect draws them.
      state.ready = true;
      warmupRejectionCount += 1;
      warmupRejectionReasons.add(error instanceof Error ? error.message : String(error));
    }
  }
  shaderWarmupByActor.set(actor, state);
}

/**
 * Withhold the actor's skinned/morph items while the warm-up is unresolved.
 * Static items pass through immediately; when every compile has resolved (or
 * no compiler is installed) the actor's full set is returned as-is. A
 * synchronous-compile stub resolves on the first microtask, so at most one
 * presented frame is withheld.
 */
export function filterPrd06ShaderWarmupItems(actor: TypedGLBActor, items: readonly RenderItem[]): RenderItem[] {
  const state = shaderWarmupByActor.get(actor);
  if (!state || state.ready) return items as RenderItem[];
  return items.filter((item) => !prd06WarmupItem(item));
}

export function disposePrd06ShaderWarmup(actor: TypedGLBActor): void {
  shaderWarmupByActor.delete(actor);
}

/* -------------------------------------------------------------- T3.5 §7.1 */

import type { GLTFPoseConstraint } from "@aura3d/assets/gltf-runtime";
import type {
  CcdIkConstraintSpec,
  FootIkConstraintSpec,
  LookAtConstraintSpec,
  TwoBoneIkConstraintSpec
} from "@aura3d/animation/lanes";
import type { SkeletonBinding } from "@aura3d/animation/lanes";

// 06-S12 lazy edge: the pose-constraint solver tree (IK/look-at/spring) stays
// off the "." critical path. `@aura3d/animation` is sideEffects-free but the
// static edge would still pull the whole solver set into the eager bundle;
// behind the flag the actor's frame path degrades one evaluate until the chunk
// resolves instead.
type AnimationLaneModule = typeof import("@aura3d/animation/lanes");
// Named-symbol slot, not the module namespace — destructuring in .then keeps
// the lazy import statically analyzable so the chunk still tree-shakes.
type AnimationLaneSolvers = Pick<
  AnimationLaneModule,
  | "solveTwoBoneIkRotations"
  | "solveFootIkConstraint"
  | "createLookAtConstraint"
  | "solveCcdIk"
  | "createSpringChain"
  | "createSpringChainFromPreset"
  | "bindSpringChainToSkeleton"
>;
let animationLane: AnimationLaneSolvers | undefined;
let animationLaneLoading: Promise<unknown> | undefined;
const ensureAnimationLane = (): void => {
  animationLaneLoading ??= import("@aura3d/animation/lanes").then(
    ({
      solveTwoBoneIkRotations,
      solveFootIkConstraint,
      createLookAtConstraint,
      solveCcdIk,
      createSpringChain,
      createSpringChainFromPreset,
      bindSpringChainToSkeleton
    }) => {
      animationLane = {
        solveTwoBoneIkRotations,
        solveFootIkConstraint,
        createLookAtConstraint,
        solveCcdIk,
        createSpringChain,
        createSpringChainFromPreset,
        bindSpringChainToSkeleton
      };
    }
  );
};

/**
 * Resolves once the lazy solver lane is loaded (or immediately when it already
 * is). Frame-path callers degrade without it; synchronous consumers — unit
 * tests, tooling — await this before evaluating a solver-backed constraint.
 */
export function prd06ConstraintLaneReady(): Promise<unknown> {
  ensureAnimationLane();
  return animationLaneLoading ?? Promise.resolve();
}

type Vec3 = readonly [number, number, number];

/**
 * T3.5 — lane-internal `AuraConstraintSpec` (CCR-06-4 still pending, so the
 * C-19 `ik.add(spec)` handle carries `unknown`; this is the typed lane shape).
 * World-space `target` accepts a literal vector, a runtime node id/name, or a
 * `{ socket: bone }` ref resolved per frame by the registering context.
 */
export type Prd06ConstraintSpec =
  | ({ readonly kind: "two-bone" } & TwoBoneIkConstraintSpec & { readonly target: Vec3 | string | { readonly socket: string } })
  | ({ readonly kind: "foot-ik" } & FootIkConstraintSpec)
  | ({ readonly kind: "look-at" } & LookAtConstraintSpec & { readonly target: Vec3 | string | { readonly socket: string } })
  | ({ readonly kind: "ccd" } & CcdIkConstraintSpec & { readonly target: Vec3 | string | { readonly socket: string } });

export interface Prd06PoseConstraintContext {
  readonly binding: SkeletonBinding;
  /**
   * Per-frame world-position resolver for non-literal targets — node id/name
   * or `{ socket: bone }`. Returns null when unresolvable (constraint skipped
   * for the frame, never faked).
   */
  readonly resolveTarget?: (ref: string | { readonly socket: string }) => Vec3 | null;
}

/** True when the spec's total applied weight is 0 — bitwise no-op guarantee. */
function constraintInert(spec: Prd06ConstraintSpec): boolean {
  switch (spec.kind) {
    case "two-bone":
      return (spec.weight ?? 1) <= 0;
    case "ccd":
      return (spec.weight ?? 1) <= 0;
    case "look-at":
      return spec.bones.every((bone) => bone.weight <= 0);
    case "foot-ik":
      return spec.legs.every((leg) => (leg.weight ?? 1) <= 0);
  }
}

function resolveJointIndex(binding: SkeletonBinding, name: string): number {
  const indices = binding.jointIndicesByName.get(name);
  if (indices === undefined || indices.length === 0) {
    throw new Error(`PRD06_CONSTRAINT_UNKNOWN_BONE:${name}`);
  }
  return indices[0]!;
}

/**
 * T3.5 — build the runtime-side {@link GLTFPoseConstraint} for a lane spec:
 * per-kind bone union (so the runtime emits sampled targets for the bones even
 * when no clip covers them), the target resolver, and the per-kind evaluator.
 */
export function createPrd06PoseConstraint(
  spec: Prd06ConstraintSpec,
  context: Prd06PoseConstraintContext
): GLTFPoseConstraint {
  const binding = context.binding;
  const targetResolver = (target: Vec3 | string | { readonly socket: string } | undefined): Vec3 | null => {
    if (target === undefined) return null;
    // Literal vectors arrive as a readonly [x,y,z] tuple — `Array.isArray`
    // does not narrow readonly tuples, so check the object ref shape instead.
    if (typeof target !== "string" && !("socket" in target)) return target;
    return context.resolveTarget?.(target) ?? null;
  };

  switch (spec.kind) {
    case "two-bone": {
      const bones = [resolveJointIndex(binding, spec.root), resolveJointIndex(binding, spec.mid), resolveJointIndex(binding, spec.tip)];
      if (spec.twistBone !== undefined) bones.push(resolveJointIndex(binding, spec.twistBone));
      return {
        bones,
        evaluate: (pose, bound, modelMatrix) => {
          const target = targetResolver(spec.target);
          if (target === null) return;
          animationLane?.solveTwoBoneIkRotations(pose, bound, modelMatrix, spec, target);
        }
      };
    }
    case "foot-ik": {
      const bones: number[] = [];
      for (const leg of spec.legs) {
        bones.push(resolveJointIndex(binding, leg.root), resolveJointIndex(binding, leg.mid), resolveJointIndex(binding, leg.tip));
        if (leg.twistBone !== undefined) bones.push(resolveJointIndex(binding, leg.twistBone));
      }
      if (spec.pelvis !== undefined) bones.push(resolveJointIndex(binding, spec.pelvis));
      return {
        bones,
        evaluate: (pose, bound, modelMatrix) => {
          animationLane?.solveFootIkConstraint(pose, bound, modelMatrix, spec);
        }
      };
    }
    case "look-at": {
      const bones = spec.bones.map((bone) => resolveJointIndex(binding, bone.bone));
      for (const eye of spec.eyes ?? []) bones.push(resolveJointIndex(binding, eye));
      let lookAt = animationLane?.createLookAtConstraint(spec);
      return {
        bones,
        evaluate: (pose, bound, modelMatrix, ctx) => {
          const target = targetResolver(spec.target);
          if (target === null) return;
          lookAt ??= animationLane?.createLookAtConstraint(spec);
          lookAt?.apply(pose, bound, modelMatrix, target, ctx.dt);
        }
      };
    }
    case "ccd": {
      const bones = spec.chain.map((bone) => resolveJointIndex(binding, bone));
      return {
        bones,
        evaluate: (pose, bound, modelMatrix) => {
          const target = targetResolver(spec.target);
          if (target === null) return;
          animationLane?.solveCcdIk(pose, bound, modelMatrix, spec, target);
        }
      };
    }
  }
}

/**
 * T3.5 — `ik.add(spec)` on the node handle resolves through this: validates the
 * spec, instantiates the constraint against the runtime's skeleton binding and
 * registers it. Weight-0 specs are stored but inert — their evaluate returns
 * without writes, keeping the emitted pose bitwise equal to the pure clip.
 */
export function addPrd06ActorConstraint(
  actor: TypedGLBActor,
  spec: Prd06ConstraintSpec,
  resolveTarget?: Prd06PoseConstraintContext["resolveTarget"]
): () => void {
  const runtime = actor.animation;
  if (runtime === undefined || typeof runtime.skeletons !== "function") {
    throw new Error("PRD06_CONSTRAINT_RUNTIME_UNAVAILABLE");
  }
  const binding = runtime.skeletons()[0];
  if (binding === undefined) {
    throw new Error("PRD06_CONSTRAINT_NO_SKELETON");
  }
  ensureAnimationLane();
  const constraint = createPrd06PoseConstraint(spec, { binding, resolveTarget });
  const inert = constraintInert(spec);
  return runtime.addPoseConstraint({
    bones: constraint.bones,
    evaluate: inert
      ? () => { /* bitwise no-op — weight 0 equals the pure clip */ }
      : constraint.evaluate
  });
}

/** T3.5 — `ik.clear()` on the node handle. */
export function clearPrd06ActorConstraints(actor: TypedGLBActor): void {
  const runtime = actor.animation;
  if (runtime === undefined || typeof runtime.clearPoseConstraints !== "function") return;
  runtime.clearPoseConstraints();
}

/* -------------------------------------------------------------- T4.1 §7.1 */

import type {
  BoundSpringChain,
  SpringBonePreset,
  SpringCollider
} from "@aura3d/animation/lanes";

/**
 * T4.1 — lane shape for `springBones.add(spec)` (CCR-06-4 pending, so the C-19
 * handle carries `unknown`). One spec = one or more named chains; each chain
 * is root-first bone names plus dynamics tuning (preset or explicit fields).
 */
export interface Prd06SpringChainSpec {
  readonly name?: string;
  /** Chain bones, kinematic anchor (root) first, simulated bones after. */
  readonly bones: readonly string[];
  /** Named dynamics preset — explicit fields below win over it. */
  readonly preset?: SpringBonePreset["name"];
  readonly stiffness?: number;
  readonly damping?: number;
  /** Gravity scale on the default [0,-9.81,0] — ignored when `gravity` is set. */
  readonly gravityScale?: number;
  readonly gravity?: Vec3;
  /** Integration substeps per `integrate` call (stiffness stability). */
  readonly substeps?: number;
  /** Fixed-step accumulator rate in Hz (default 60). */
  readonly substepHz?: number;
  /**
   * Velocity damping toward the parent particle (lane default 12). Without it
   * a 2+ particle chain can sustain a limit cycle the absolute damping never
   * kills — the §7.1 settle bar (<1° oscillation in 0.6 s) is unreachable.
   */
  readonly relativeDamping?: number;
  readonly colliders?: readonly SpringCollider[];
}

export interface Prd06SpringBonesSpec {
  readonly chains: readonly Prd06SpringChainSpec[];
}

/** Active spring registrations per actor so `springBones.clear()` only removes springs. */
const springChainDisposers = new WeakMap<TypedGLBActor, (() => void)[]>();

/**
 * T4.1 — compile a spring spec into a pose constraint: each chain seeds its
 * particles from rest-pose world bone positions, binds to the skeleton, and
 * steps on the constraint's `dt`. Chains register AFTER previously added
 * constraints (foot-ik / two-bone / look-at), so springs see the post-IK pose
 * and their rotations ride the same write-back into the palette build.
 */
export function createPrd06SpringConstraint(
  spec: Prd06SpringBonesSpec,
  context: { readonly binding: SkeletonBinding }
): GLTFPoseConstraint {
  const binding = context.binding;
  const bones = new Set<number>();
  for (const chainSpec of spec.chains) {
    if (chainSpec.bones.length < 2) {
      throw new Error("PRD06_SPRING_CHAIN_TOO_SHORT");
    }
    for (const name of chainSpec.bones) bones.add(resolveJointIndex(binding, name));
  }
  // 06-S12: chains build on first evaluate once the lazy solver module has
  // resolved (creating them eagerly would strand springs unbound forever).
  let bounds: BoundSpringChain[] | undefined;
  const ensureBounds = (): readonly BoundSpringChain[] => {
    if (bounds || !animationLane) return bounds ?? [];
    const built: BoundSpringChain[] = [];
    for (const chainSpec of spec.chains) {
      const indices = chainSpec.bones.map((name) => resolveJointIndex(binding, name));
      const restWorld = indices.map((joint) => fkWorldPosition(binding.restPose, binding, joint));
      const options = {
        bones: restWorld,
        ...(chainSpec.name !== undefined ? { name: chainSpec.name } : {}),
        ...(chainSpec.stiffness !== undefined ? { stiffness: chainSpec.stiffness } : {}),
        ...(chainSpec.damping !== undefined ? { damping: chainSpec.damping } : {}),
        ...(chainSpec.gravity !== undefined ? { gravity: chainSpec.gravity } : {}),
        ...(chainSpec.colliders !== undefined ? { colliders: chainSpec.colliders } : {}),
        ...(chainSpec.substeps !== undefined ? { substeps: chainSpec.substeps } : {}),
        relativeDamping: chainSpec.relativeDamping ?? 12
      };
      const chain = chainSpec.preset !== undefined
        ? animationLane.createSpringChainFromPreset(chainSpec.preset, {
            ...options,
            ...(chainSpec.gravityScale !== undefined ? { gravityScale: chainSpec.gravityScale } : {})
          })
        : animationLane.createSpringChain(options);
      built.push(
        animationLane.bindSpringChainToSkeleton(chain, binding, chainSpec.bones, {
          ...(chainSpec.substepHz !== undefined ? { substepHz: chainSpec.substepHz } : {})
        })
      );
    }
    bounds = built;
    return bounds;
  };
  return {
    kind: "springs",
    bones: [...bones],
    evaluate: (pose, _bound, _modelMatrix, ctx) => {
      for (const bound of ensureBounds()) bound.step(pose, ctx.dt);
    }
  };
}

/** FK world position of a joint in a pose buffer (position + scale composed). */
function fkWorldPosition(pose: { readonly positions: Float32Array; readonly rotations: Float32Array; readonly scales: Float32Array }, binding: SkeletonBinding, joint: number): Vec3 {
  const pos: Vec3 = [pose.positions[joint * 3]!, pose.positions[joint * 3 + 1]!, pose.positions[joint * 3 + 2]!];
  const rot = [pose.rotations[joint * 4]!, pose.rotations[joint * 4 + 1]!, pose.rotations[joint * 4 + 2]!, pose.rotations[joint * 4 + 3]!] as const;
  const scl = [pose.scales[joint * 3]!, pose.scales[joint * 3 + 1]!, pose.scales[joint * 3 + 2]!] as const;
  const parent = binding.parentIndices[joint] ?? -1;
  if (parent < 0 || parent >= binding.boneCount || parent === joint) return pos;
  const pp = fkWorldPosition(pose, binding, parent);
  const pr = [
    pose.rotations[parent * 4]!,
    pose.rotations[parent * 4 + 1]!,
    pose.rotations[parent * 4 + 2]!,
    pose.rotations[parent * 4 + 3]!
  ] as const;
  const ps = [
    pose.scales[parent * 3]!,
    pose.scales[parent * 3 + 1]!,
    pose.scales[parent * 3 + 2]!
  ] as const;
  const scaled: Vec3 = [pos[0] * ps[0], pos[1] * ps[1], pos[2] * ps[2]];
  const rotated = rotateVec3Engine(pr, scaled);
  return [pp[0] + rotated[0], pp[1] + rotated[1], pp[2] + rotated[2]];
}

function rotateVec3Engine(q: readonly [number, number, number, number], v: Vec3): Vec3 {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}

/**
 * T4.1 — `springBones.add(spec)` on the node handle resolves through this.
 * Returns a disposer removing exactly this spec's chains.
 */
export function addPrd06ActorSpringBones(actor: TypedGLBActor, spec: Prd06SpringBonesSpec): () => void {
  const runtime = actor.animation;
  if (runtime === undefined || typeof runtime.skeletons !== "function") {
    throw new Error("PRD06_SPRING_RUNTIME_UNAVAILABLE");
  }
  const binding = runtime.skeletons()[0];
  if (binding === undefined) {
    throw new Error("PRD06_SPRING_NO_SKELETON");
  }
  ensureAnimationLane();
  const constraint = createPrd06SpringConstraint(spec, { binding });
  const dispose = runtime.addPoseConstraint(constraint);
  const list = springChainDisposers.get(actor) ?? [];
  list.push(dispose);
  springChainDisposers.set(actor, list);
  return dispose;
}

/** T4.1 — `springBones.clear()` removes only this actor's spring registrations. */
export function clearPrd06ActorSpringBones(actor: TypedGLBActor): void {
  const list = springChainDisposers.get(actor);
  if (list === undefined) return;
  for (const dispose of list) dispose();
  springChainDisposers.delete(actor);
}
