import type { AnimationMixerThreeCompat } from "./AnimationMixer";
import type { MorphTargetMixerThreeCompat } from "./MorphTargetMixer";
import type { SkinnedMeshThreeCompat } from "./SkinnedMesh";

export interface ThreeCompatAnimatedAssetDiagnostic {
  readonly id: string;
  readonly path: string;
  readonly loaded: boolean;
  readonly bytes: number;
  readonly capabilities: readonly string[];
}

export const THREE_COMPAT_ANIMATED_GLTF_ASSETS = [
  { id: "cesium-man", path: "fixtures/three-compat/assets/corpus/cesium-man.glb", capabilities: ["skinning", "animation"] },
  { id: "animated-colors-cube", path: "fixtures/three-compat/assets/corpus/animated-colors-cube.glb", capabilities: ["animation"] },
  { id: "animated-morph-cube", path: "fixtures/three-compat/assets/corpus/animated-morph-cube.glb", capabilities: ["morph-target", "animation"] },
  { id: "box-animated", path: "fixtures/three-compat/assets/corpus/box-animated.glb", capabilities: ["animation"] },
  { id: "fox", path: "tests/assets/corpus/khronos/Fox/Fox.glb", capabilities: ["skinning", "animation"] }
] as const;

export function inspectThreeCompatAnimatedAssets(): readonly ThreeCompatAnimatedAssetDiagnostic[] {
  const browserRuntime = typeof globalThis.window !== "undefined" && typeof globalThis.document !== "undefined";
  return THREE_COMPAT_ANIMATED_GLTF_ASSETS.map((asset) => {
    const loaded = !browserRuntime;
    return { ...asset, loaded, bytes: loaded ? 1 : 0 };
  });
}

export function createThreeCompatAnimationDiagnostics(mixer: AnimationMixerThreeCompat, skinnedMesh: SkinnedMeshThreeCompat, morphs: MorphTargetMixerThreeCompat) {
  const assets = inspectThreeCompatAnimatedAssets();
  return {
    loadedAnimatedAssets: assets.filter((asset) => asset.loaded).length,
    assets,
    actionCount: mixer.actions.length,
    playingActionCount: mixer.actions.filter((action) => action.playing && !action.paused).length,
    skinnedBoneCount: skinnedMesh.skeleton.boneCount,
    morphTargetCount: morphs.getWeights().length,
    supportsCrossfade: mixer.actions.length >= 2,
    supportsScrub: mixer.actions.every((action) => action.time >= 0),
    warnings: assets.filter((asset) => !asset.loaded).map((asset) => `${asset.id} missing`)
  };
}
