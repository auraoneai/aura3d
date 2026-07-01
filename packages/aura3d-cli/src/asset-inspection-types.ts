import type { AuraCliAssetProvenance } from "./asset-core-types.js";

export type AuraCliHumanoidStatus = "humanoid" | "non-humanoid" | "unknown";
export type AuraCliHumanoidConfidence = "high" | "medium" | "low";

export interface AuraCliAnimationInspection {
  readonly clipCount: number;
  readonly clips: readonly AuraCliAnimationClipInspection[];
  readonly messages: readonly string[];
}

export interface AuraCliAnimationClipInspection {
  readonly index: number;
  readonly name: string;
  readonly channelCount: number;
  readonly samplerCount: number;
  readonly targetPaths: readonly string[];
  readonly targetNodes: readonly string[];
}

export interface AuraCliSkeletonInspection {
  readonly skinCount: number;
  readonly jointCount: number;
  readonly skins: readonly AuraCliSkeletonSkinInspection[];
  readonly messages: readonly string[];
}

export interface AuraCliSkeletonSkinInspection {
  readonly index: number;
  readonly name: string;
  readonly jointCount: number;
  readonly joints: readonly string[];
  readonly skeleton?: string;
}

export interface AuraCliMorphTargetInspection {
  readonly targetCount: number;
  readonly targetNames: readonly string[];
  readonly meshes: readonly AuraCliMorphTargetMeshInspection[];
  readonly messages: readonly string[];
}

export interface AuraCliMorphTargetMeshInspection {
  readonly index: number;
  readonly name: string;
  readonly targetNames: readonly string[];
}

export interface AuraCliSceneHierarchyInspection {
  readonly nodeCount: number;
  readonly meshCount: number;
  readonly materialCount: number;
  readonly textureCount: number;
  readonly animationClipCount: number;
  readonly skinCount: number;
  readonly morphTargetCount: number;
  readonly rootNodeNames: readonly string[];
  readonly maxDepth: number;
  readonly messages: readonly string[];
}

export interface AuraCliAssetBoundsInspection {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly center: readonly [number, number, number];
  readonly maxDimension: number;
  readonly grounded: boolean;
}

export interface AuraCliMaterialInspection {
  readonly name: string;
  readonly visible: boolean;
  readonly readable: boolean;
  readonly opacity: number;
  readonly alphaMode?: string;
  readonly reasons: readonly string[];
}

export interface AuraCliOrientationRenderedProbeEvidence {
  readonly url?: string;
  readonly sha256?: string;
  readonly assetHash?: string;
  readonly checkedAt?: string;
  readonly route?: string;
}

export interface AuraCliOrientationInspection {
  readonly source: "gltf-extras" | "manifest-override" | "unknown";
  readonly forwardAxis?: string;
  readonly upAxis?: string;
  readonly view?: string;
  readonly assetHash?: string;
  readonly generatedBy?: string;
  readonly checkedAt?: string;
  readonly route?: string;
  readonly renderedProbe?: AuraCliOrientationRenderedProbeEvidence;
  readonly evidence?: readonly string[];
  readonly messages: readonly string[];
}

export interface AuraCliHumanoidInspection {
  readonly humanoid: boolean;
  readonly status: AuraCliHumanoidStatus;
  readonly confidence: AuraCliHumanoidConfidence;
  readonly skinCount: number;
  readonly jointCount: number;
  readonly matchedBones: readonly string[];
  readonly missingBones: readonly string[];
  readonly messages: readonly string[];
}

export interface AssetInspectionReport {
  readonly ok: boolean;
  readonly schema: "aura3d.asset-inspection/1.0";
  readonly file: string;
  readonly format: string;
  readonly sizeBytes: number;
  readonly bounds?: readonly [number, number, number];
  readonly boundsMetadata?: AuraCliAssetBoundsInspection;
  readonly materials: readonly string[];
  readonly materialMetadata?: readonly AuraCliMaterialInspection[];
  readonly animations: readonly string[];
  readonly animation?: AuraCliAnimationInspection;
  readonly humanoid?: AuraCliHumanoidInspection;
  readonly skeleton?: AuraCliSkeletonInspection;
  readonly morphTargets?: AuraCliMorphTargetInspection;
  readonly provenance?: Partial<AuraCliAssetProvenance>;
  readonly textures: readonly string[];
  readonly orientation?: AuraCliOrientationInspection;
  readonly nodeNames?: readonly string[];
  readonly dependencies: readonly string[];
  readonly warnings: readonly string[];
  readonly messages: readonly string[];
}

export interface InspectAssetOptions {
  readonly projectDir?: string;
  readonly file: string;
  readonly animation?: boolean;
  readonly humanoid?: boolean;
  readonly skeleton?: boolean;
  readonly morphs?: boolean;
  readonly license?: boolean;
}
