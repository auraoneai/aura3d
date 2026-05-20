import { ValidationError } from "@galileo3d/core";

export type SceneMetadataSeed = string | number;
export type SceneMetadataPlanKind =
  | "animation"
  | "camera"
  | "environment"
  | "interaction"
  | "lighting"
  | "physics"
  | "postprocess"
  | "rendering";
export type SceneMetadataCapabilityStatus = "supported" | "unsupported" | "approximation" | "route-local";

export interface SceneAssetProvenance {
  readonly id: string;
  readonly uri?: string;
  readonly source?: string;
  readonly loader?: string;
  readonly version?: string;
  readonly digest?: string;
  readonly license?: string;
  readonly nodeIds?: readonly string[];
  readonly materialIds?: readonly string[];
  readonly notes?: string;
}

export interface SceneMaterialAssignment {
  readonly nodeId: string;
  readonly materialId: string;
  readonly slot?: string | number;
  readonly sourceMaterialId?: string;
  readonly fallback?: boolean;
  readonly unsupportedFeatures?: readonly string[];
}

export interface ScenePlanMetadata {
  readonly id: string;
  readonly kind: SceneMetadataPlanKind;
  readonly description: string;
  readonly owner?: string;
  readonly nodeIds?: readonly string[];
  readonly deterministicSeed?: SceneMetadataSeed;
  readonly unsupportedFeatures?: readonly string[];
  readonly evidence?: readonly string[];
}

export interface SceneCapabilityDisclosure {
  readonly feature: string;
  readonly status: SceneMetadataCapabilityStatus;
  readonly reason?: string;
  readonly owner?: string;
  readonly evidence?: readonly string[];
}

export interface SceneRevisionMetadata {
  readonly id?: string;
  readonly parentRevisionId?: string;
  readonly summary: string;
  readonly author?: string;
  readonly timestamp?: string;
  readonly deterministicSeed?: SceneMetadataSeed;
}

export type SceneRevisionRecord = Required<Pick<SceneRevisionMetadata, "id" | "summary">> & SceneRevisionMetadata;

export interface SceneMetadataOptions {
  readonly deterministicSeed?: SceneMetadataSeed;
  readonly assets?: readonly SceneAssetProvenance[];
  readonly materialAssignments?: readonly SceneMaterialAssignment[];
  readonly plans?: readonly ScenePlanMetadata[];
  readonly capabilities?: readonly SceneCapabilityDisclosure[];
  readonly revisions?: readonly SceneRevisionMetadata[];
}

export type SerializedSceneMetadata = SceneMetadataOptions;

export class SceneMetadata {
  deterministicSeed?: SceneMetadataSeed;
  readonly assets: SceneAssetProvenance[] = [];
  readonly materialAssignments: SceneMaterialAssignment[] = [];
  readonly plans: ScenePlanMetadata[] = [];
  readonly capabilities: SceneCapabilityDisclosure[] = [];
  readonly revisions: SceneRevisionRecord[] = [];

  constructor(options: SceneMetadataOptions = {}) {
    this.replace(options);
  }

  replace(options: SceneMetadataOptions | SceneMetadata): this {
    this.deterministicSeed = options.deterministicSeed;
    this.assets.length = 0;
    this.materialAssignments.length = 0;
    this.plans.length = 0;
    this.capabilities.length = 0;
    this.revisions.length = 0;
    for (const asset of options.assets ?? []) this.registerAsset(asset);
    for (const assignment of options.materialAssignments ?? []) this.assignMaterial(assignment);
    for (const plan of options.plans ?? []) this.addPlan(plan);
    for (const capability of options.capabilities ?? []) this.discloseCapability(capability);
    for (const revision of options.revisions ?? []) this.recordRevision(revision);
    return this;
  }

  clone(): SceneMetadata {
    return new SceneMetadata(this.toJSON());
  }

  get isEmpty(): boolean {
    return this.deterministicSeed === undefined
      && this.assets.length === 0
      && this.materialAssignments.length === 0
      && this.plans.length === 0
      && this.capabilities.length === 0
      && this.revisions.length === 0;
  }

  registerAsset(asset: SceneAssetProvenance): this {
    requireNonEmpty(asset.id, "asset id");
    upsertByKey(this.assets, cloneAsset(asset), (candidate) => candidate.id === asset.id);
    return this;
  }

  assignMaterial(assignment: SceneMaterialAssignment): this {
    requireNonEmpty(assignment.nodeId, "material assignment nodeId");
    requireNonEmpty(assignment.materialId, "material assignment materialId");
    const cloned = cloneMaterialAssignment(assignment);
    upsertByKey(
      this.materialAssignments,
      cloned,
      (candidate) => candidate.nodeId === cloned.nodeId && candidate.slot === cloned.slot
    );
    return this;
  }

  addPlan(plan: ScenePlanMetadata): this {
    requireNonEmpty(plan.id, "plan id");
    requireNonEmpty(plan.description, "plan description");
    upsertByKey(this.plans, clonePlan(plan), (candidate) => candidate.id === plan.id);
    return this;
  }

  discloseCapability(disclosure: SceneCapabilityDisclosure): this {
    requireNonEmpty(disclosure.feature, "capability feature");
    upsertByKey(this.capabilities, cloneCapability(disclosure), (candidate) => candidate.feature === disclosure.feature);
    return this;
  }

  discloseUnsupportedFeature(
    feature: string,
    reason: string,
    options: Omit<SceneCapabilityDisclosure, "feature" | "reason" | "status"> = {}
  ): this {
    return this.discloseCapability({ ...options, feature, reason, status: "unsupported" });
  }

  recordRevision(revision: SceneRevisionMetadata): this {
    requireNonEmpty(revision.summary, "revision summary");
    const id = revision.id ?? `revision-${this.revisions.length + 1}`;
    upsertByKey(this.revisions, cloneRevision({ ...revision, id }), (candidate) => candidate.id === id);
    return this;
  }

  unsupportedFeatures(): readonly SceneCapabilityDisclosure[] {
    return this.capabilities.filter((capability) => capability.status === "unsupported");
  }

  toJSON(): SerializedSceneMetadata {
    return {
      ...(this.deterministicSeed !== undefined ? { deterministicSeed: this.deterministicSeed } : {}),
      ...(this.assets.length > 0 ? { assets: this.assets.map(cloneAsset) } : {}),
      ...(this.materialAssignments.length > 0 ? { materialAssignments: this.materialAssignments.map(cloneMaterialAssignment) } : {}),
      ...(this.plans.length > 0 ? { plans: this.plans.map(clonePlan) } : {}),
      ...(this.capabilities.length > 0 ? { capabilities: this.capabilities.map(cloneCapability) } : {}),
      ...(this.revisions.length > 0 ? { revisions: this.revisions.map(cloneRevision) } : {})
    };
  }
}

function requireNonEmpty(value: string | undefined, label: string): void {
  if (!value || value.trim().length === 0) {
    throw new ValidationError("SCENE_METADATA", `Scene metadata ${label} must be a non-empty string.`);
  }
}

function upsertByKey<T>(items: T[], value: T, matches: (candidate: T) => boolean): void {
  const index = items.findIndex(matches);
  if (index >= 0) items[index] = value;
  else items.push(value);
}

function cloneAsset(asset: SceneAssetProvenance): SceneAssetProvenance {
  return {
    ...asset,
    ...(asset.nodeIds ? { nodeIds: [...asset.nodeIds] } : {}),
    ...(asset.materialIds ? { materialIds: [...asset.materialIds] } : {})
  };
}

function cloneMaterialAssignment(assignment: SceneMaterialAssignment): SceneMaterialAssignment {
  return {
    ...assignment,
    ...(assignment.unsupportedFeatures ? { unsupportedFeatures: [...assignment.unsupportedFeatures] } : {})
  };
}

function clonePlan(plan: ScenePlanMetadata): ScenePlanMetadata {
  return {
    ...plan,
    ...(plan.nodeIds ? { nodeIds: [...plan.nodeIds] } : {}),
    ...(plan.unsupportedFeatures ? { unsupportedFeatures: [...plan.unsupportedFeatures] } : {}),
    ...(plan.evidence ? { evidence: [...plan.evidence] } : {})
  };
}

function cloneCapability(capability: SceneCapabilityDisclosure): SceneCapabilityDisclosure {
  return {
    ...capability,
    ...(capability.evidence ? { evidence: [...capability.evidence] } : {})
  };
}

function cloneRevision(revision: SceneRevisionMetadata): SceneRevisionRecord {
  return { ...revision, id: revision.id ?? "revision-1" };
}
