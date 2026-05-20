import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import type { AnimationMixerV5 } from "./AnimationMixer";
import type { MorphTargetMixerV5 } from "./MorphTargetMixer";
import type { SkinnedMeshV5 } from "./SkinnedMesh";

export interface V5AnimatedAssetDiagnostic {
  readonly id: string;
  readonly path: string;
  readonly loaded: boolean;
  readonly bytes: number;
  readonly capabilities: readonly string[];
}

export const V5_ANIMATED_GLTF_ASSETS = [
  { id: "cesium-man", path: "fixtures/v5/assets/corpus/cesium-man.glb", capabilities: ["skinning", "animation"] },
  { id: "animated-colors-cube", path: "fixtures/v5/assets/corpus/animated-colors-cube.glb", capabilities: ["animation"] },
  { id: "animated-morph-cube", path: "fixtures/v5/assets/corpus/animated-morph-cube.glb", capabilities: ["morph-target", "animation"] },
  { id: "box-animated", path: "fixtures/v5/assets/corpus/box-animated.glb", capabilities: ["animation"] },
  { id: "fox", path: "tests/assets/corpus/khronos/Fox/Fox.glb", capabilities: ["skinning", "animation"] }
] as const;

export function inspectV5AnimatedAssets(): readonly V5AnimatedAssetDiagnostic[] {
  return V5_ANIMATED_GLTF_ASSETS.map((asset) => {
    const path = resolve(asset.path);
    const loaded = existsSync(path);
    return { ...asset, loaded, bytes: loaded ? statSync(path).size : 0 };
  });
}

export function createV5AnimationDiagnostics(mixer: AnimationMixerV5, skinnedMesh: SkinnedMeshV5, morphs: MorphTargetMixerV5) {
  const assets = inspectV5AnimatedAssets();
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
