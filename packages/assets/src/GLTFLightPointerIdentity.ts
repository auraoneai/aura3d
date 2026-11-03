/**
 * Private, in-memory identities for imported punctual lights and their tracks.
 *
 * Public animation targets retain their readable names, but names are not
 * unique scene identities. The owner is the source asset's light-definition
 * array, shared by its clips and scene instances. Weak references keep this
 * association from retaining a disposed asset or scene.
 *
 * These identities do not survive serialization, cloning, or reconstruction.
 * Recreate scenes and tracks from the loaded asset to retain scoped binding.
 * A reconstructed name track is indistinguishable from an authored name track
 * and may name-match another scene; an unscoped index target cannot bind.
 */

export type GLTFLightPointerLeaf = "intensity" | "color" | "range";

export interface GLTFLightSceneIdentity {
  readonly owner: object;
  readonly definitionIndex: number;
  readonly definitionName: string;
}

export interface GLTFLightTrackIdentity extends GLTFLightSceneIdentity {
  readonly leaf: GLTFLightPointerLeaf;
  readonly publicTarget: string;
  /** Internal blend key; deliberately distinct from any public target name. */
  readonly sampleTarget: string;
}

const sceneIdentities = new WeakMap<object, GLTFLightSceneIdentity>();
const trackIdentities = new WeakMap<object, GLTFLightTrackIdentity>();
const sampleTargetsByOwner = new WeakMap<object, Map<string, string>>();
let nextSampleTarget = 0;

export function registerGLTFLightSceneInstance(
  light: object,
  owner: object,
  definitionIndex: number,
  definitionName: string
): void {
  sceneIdentities.set(light, { owner, definitionIndex, definitionName });
}

export function getGLTFLightSceneIdentity(light: object): GLTFLightSceneIdentity | undefined {
  return sceneIdentities.get(light);
}

export function registerGLTFLightAnimationTrack(
  track: object,
  owner: object,
  definitionIndex: number,
  definitionName: string,
  leaf: GLTFLightPointerLeaf,
  publicTarget: string
): void {
  let sampleTargets = sampleTargetsByOwner.get(owner);
  if (sampleTargets === undefined) {
    sampleTargets = new Map();
    sampleTargetsByOwner.set(owner, sampleTargets);
  }
  const key = `${definitionIndex}:${leaf}`;
  let sampleTarget = sampleTargets.get(key);
  if (sampleTarget === undefined) {
    // The NUL prefix cannot collide with the supported public target grammar.
    sampleTarget = `\0gltf-light:${nextSampleTarget++}`;
    sampleTargets.set(key, sampleTarget);
  }
  trackIdentities.set(track, { owner, definitionIndex, definitionName, leaf, publicTarget, sampleTarget });
}

export function getGLTFLightAnimationTrackIdentity(track: object): GLTFLightTrackIdentity | undefined {
  return trackIdentities.get(track);
}
