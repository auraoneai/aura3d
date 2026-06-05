import type { AuraAssetRef, AuraVec3 } from "./index.js";

export const gameAssetValidationContractVersion = "aura-game-asset-validation/1.0.5" as const;

export type GameAssetValidationContractVersion = typeof gameAssetValidationContractVersion;
export type GameAssetValidationSeverity = "info" | "warning" | "error";
export type GameAssetValidationStatus = "pass" | "warn" | "fail" | "missing";
export type GameAssetModelFormat = "glb" | "gltf";
export type GameAssetAxis = "x" | "y" | "z" | "-x" | "-y" | "-z";
export type GameAssetBoundsSource = "asset-metadata" | "inspector" | "manual" | "runtime";
export type GameAssetApprovalStatus = "draft" | "needs-review" | "approved" | "rejected";
export type GameAssetUsageKind = "fighter" | "npc" | "arena" | "prop" | "weapon" | "cartoon-character" | "product" | "environment";
export type GameAssetAnimationRole =
  | "idle"
  | "walk"
  | "walk-forward"
  | "walk-back"
  | "run"
  | "jump"
  | "land"
  | "dash"
  | "guard"
  | "light"
  | "heavy"
  | "special"
  | "super"
  | "hit"
  | "stun"
  | "knockdown"
  | "win"
  | "lose"
  | "speak"
  | "emote";

export interface GameAssetValidationIssue {
  readonly severity: GameAssetValidationSeverity;
  readonly code: string;
  readonly message: string;
  readonly assetId?: string | undefined;
  readonly path?: string | undefined;
  readonly hint?: string | undefined;
}

export interface GameAssetValidationCheck {
  readonly id: string;
  readonly status: GameAssetValidationStatus;
  readonly message: string;
  readonly assetId?: string | undefined;
  readonly metrics?: Record<string, number | string | boolean> | undefined;
}

export interface GameAssetBounds {
  readonly center: AuraVec3;
  readonly size: AuraVec3;
  readonly min?: AuraVec3 | undefined;
  readonly max?: AuraVec3 | undefined;
  readonly radius?: number | undefined;
  readonly source: GameAssetBoundsSource;
}

export interface GameAssetOrientation {
  readonly upAxis: GameAssetAxis;
  readonly forwardAxis: GameAssetAxis;
  readonly unitScale?: number | undefined;
  readonly pivot?: "center" | "feet" | "grounded" | "custom" | undefined;
  readonly origin?: AuraVec3 | undefined;
  readonly notes?: readonly string[] | undefined;
}

export interface GameAssetProvenance {
  readonly title?: string | undefined;
  readonly creator?: string | undefined;
  readonly sourceName?: string | undefined;
  readonly sourceUrl?: string | undefined;
  readonly license?: string | undefined;
  readonly licenseUrl?: string | undefined;
  readonly attribution?: string | undefined;
  readonly commercialUse?: boolean | undefined;
  readonly modifications?: readonly string[] | undefined;
  readonly fileHash?: string | undefined;
  readonly approvalStatus?: GameAssetApprovalStatus | undefined;
  readonly notes?: readonly string[] | undefined;
}

export interface GameAssetThumbnail {
  readonly url?: string | undefined;
  readonly path?: string | undefined;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  readonly hash?: string | undefined;
}

export interface GameAssetSkeletonReadiness {
  readonly present: boolean;
  readonly joints?: number | undefined;
  readonly rootJoint?: string | undefined;
  readonly humanoid?: boolean | undefined;
  readonly retargetable?: boolean | undefined;
  readonly missingRequiredBones?: readonly string[] | undefined;
  readonly notes?: readonly string[] | undefined;
}

export interface GameAssetAnimationEvent {
  readonly name: string;
  readonly time: number;
  readonly frame?: number | undefined;
}

export interface GameAssetAnimationClipReadiness {
  readonly name: string;
  readonly role?: GameAssetAnimationRole | undefined;
  readonly duration?: number | undefined;
  readonly tracks?: number | undefined;
  readonly frameRate?: number | undefined;
  readonly loop?: boolean | undefined;
  readonly retargetable?: boolean | undefined;
  readonly events?: readonly GameAssetAnimationEvent[] | undefined;
  readonly status?: GameAssetValidationStatus | undefined;
  readonly notes?: readonly string[] | undefined;
}

export interface GameAssetMaterialReadiness {
  readonly name: string;
  readonly visible?: boolean | undefined;
  readonly opacity?: number | undefined;
  readonly baseColor?: string | undefined;
  readonly emissive?: string | undefined;
  readonly metallic?: number | undefined;
  readonly roughness?: number | undefined;
  readonly doubleSided?: boolean | undefined;
  readonly textureSlots?: readonly string[] | undefined;
  readonly readable?: boolean | undefined;
  readonly notes?: readonly string[] | undefined;
}

export interface GameAssetTextureReadiness {
  readonly name: string;
  readonly uri?: string | undefined;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  readonly format?: string | undefined;
  readonly colorSpace?: "srgb" | "linear" | "unknown" | undefined;
  readonly bytes?: number | undefined;
  readonly embedded?: boolean | undefined;
}

export interface GameAssetIntendedUse {
  readonly kind: GameAssetUsageKind;
  readonly routes?: readonly string[] | undefined;
  readonly runtimeMutable?: boolean | undefined;
  readonly needsAnimations?: boolean | undefined;
  readonly targetHeightMeters?: number | undefined;
  readonly notes?: readonly string[] | undefined;
}

export interface GameAssetReadinessManifest<TAsset extends AuraAssetRef<"model"> = AuraAssetRef<"model">> {
  readonly kind: "aura-game-asset-readiness-manifest";
  readonly contractId: GameAssetValidationContractVersion | string;
  readonly asset: TAsset;
  readonly displayName?: string | undefined;
  readonly file: {
    readonly url: string;
    readonly format: GameAssetModelFormat | string;
    readonly sizeBytes?: number | undefined;
    readonly hash?: string | undefined;
  };
  readonly provenance?: GameAssetProvenance | undefined;
  readonly thumbnail?: GameAssetThumbnail | undefined;
  readonly bounds?: GameAssetBounds | undefined;
  readonly orientation?: GameAssetOrientation | undefined;
  readonly skeleton?: GameAssetSkeletonReadiness | undefined;
  readonly animations?: readonly GameAssetAnimationClipReadiness[] | undefined;
  readonly morphTargets?: readonly string[] | undefined;
  readonly materials?: readonly GameAssetMaterialReadiness[] | undefined;
  readonly textures?: readonly GameAssetTextureReadiness[] | undefined;
  readonly intendedUse?: GameAssetIntendedUse | undefined;
  readonly notes?: readonly string[] | undefined;
  readonly generatedAt?: string | undefined;
}

export interface CreateGameAssetReadinessManifestOptions {
  readonly displayName?: string | undefined;
  readonly file?: Partial<GameAssetReadinessManifest["file"]> | undefined;
  readonly provenance?: GameAssetProvenance | undefined;
  readonly thumbnail?: GameAssetThumbnail | undefined;
  readonly bounds?: GameAssetBounds | AuraVec3 | undefined;
  readonly orientation?: GameAssetOrientation | undefined;
  readonly skeleton?: GameAssetSkeletonReadiness | undefined;
  readonly animations?: readonly (GameAssetAnimationClipReadiness | string)[] | undefined;
  readonly morphTargets?: readonly string[] | undefined;
  readonly materials?: readonly (GameAssetMaterialReadiness | string)[] | undefined;
  readonly textures?: readonly (GameAssetTextureReadiness | string)[] | undefined;
  readonly intendedUse?: GameAssetIntendedUse | undefined;
  readonly notes?: readonly string[] | undefined;
  readonly generatedAt?: string | undefined;
}

export interface GameAssetBoundsPolicy {
  readonly minWidth?: number | undefined;
  readonly maxWidth?: number | undefined;
  readonly minHeight?: number | undefined;
  readonly maxHeight?: number | undefined;
  readonly minDepth?: number | undefined;
  readonly maxDepth?: number | undefined;
  readonly maxDimension?: number | undefined;
  readonly maxOriginOffset?: number | undefined;
  readonly requireGroundedPivot?: boolean | undefined;
  readonly groundTolerance?: number | undefined;
}

export interface GameAssetOrientationPolicy {
  readonly upAxis?: GameAssetAxis | undefined;
  readonly forwardAxis?: GameAssetAxis | readonly GameAssetAxis[] | undefined;
  readonly pivot?: GameAssetOrientation["pivot"] | readonly NonNullable<GameAssetOrientation["pivot"]>[] | undefined;
  readonly minUnitScale?: number | undefined;
  readonly maxUnitScale?: number | undefined;
}

export interface GameAssetClipRequirement {
  readonly role?: GameAssetAnimationRole | undefined;
  readonly name?: string | undefined;
  readonly minimumDuration?: number | undefined;
  readonly requireEvents?: readonly string[] | undefined;
}

export interface GameAssetAnimationPolicy {
  readonly requiredClips?: readonly (GameAssetAnimationRole | string | GameAssetClipRequirement)[] | undefined;
  readonly requireNonEmptyClips?: boolean | undefined;
  readonly minimumDuration?: number | undefined;
}

export interface GameAssetValidationPolicy {
  readonly maxFileSizeBytes?: number | undefined;
  readonly requireFileSize?: boolean | undefined;
  readonly requireBounds?: boolean | undefined;
  readonly requireOrientation?: boolean | undefined;
  readonly requireSkeleton?: boolean | undefined;
  readonly requireThumbnail?: boolean | undefined;
  readonly requireProvenance?: boolean | undefined;
  readonly requireIntendedUse?: boolean | undefined;
  readonly requireReadableMaterials?: boolean | undefined;
  readonly maxTextureDimension?: number | undefined;
  readonly bounds?: GameAssetBoundsPolicy | undefined;
  readonly orientation?: GameAssetOrientationPolicy | undefined;
  readonly animation?: GameAssetAnimationPolicy | undefined;
}

export interface GameAssetValidationReport<TAsset extends AuraAssetRef<"model"> = AuraAssetRef<"model">> {
  readonly kind: "aura-game-asset-validation-report";
  readonly contractId: GameAssetValidationContractVersion | string;
  readonly asset: TAsset;
  readonly assetId: TAsset["id"];
  readonly manifest: GameAssetReadinessManifest<TAsset>;
  readonly ready: boolean;
  readonly summary: {
    readonly status: GameAssetValidationStatus;
    readonly checks: number;
    readonly errors: number;
    readonly warnings: number;
    readonly animationClips: number;
    readonly materials: number;
    readonly textures: number;
  };
  readonly checks: readonly GameAssetValidationCheck[];
  readonly issues: readonly GameAssetValidationIssue[];
}

export const fightingGameAnimationRoles = [
  "idle",
  "walk-forward",
  "walk-back",
  "jump",
  "land",
  "dash",
  "guard",
  "light",
  "heavy",
  "special",
  "hit",
  "stun",
  "knockdown",
  "win",
  "lose"
] as const satisfies readonly GameAssetAnimationRole[];

export type QuaterniusGameReadyFighterSourceFamily = "quaternius";

export interface QuaterniusGameReadyFighterValidationContract {
  readonly kind: "aura3d-quaternius-game-ready-fighter-validation-contract";
  readonly contractId: GameAssetValidationContractVersion;
  readonly sourceFamily: QuaterniusGameReadyFighterSourceFamily;
  readonly intendedUse: "fighter";
  readonly requiredChecks: readonly string[];
  readonly requiredAnimationRoles: readonly GameAssetAnimationRole[];
  readonly evidenceBoundary: string;
}

export const quaterniusGameReadyFighterValidationContract = {
  kind: "aura3d-quaternius-game-ready-fighter-validation-contract",
  contractId: gameAssetValidationContractVersion,
  sourceFamily: "quaternius",
  intendedUse: "fighter",
  requiredChecks: [
    "typed Aura model asset reference",
    "Quaternius-derived provenance",
    "GLB or glTF model format",
    "browser-sized payload",
    "humanoid skeleton and retargetable rig metadata",
    "grounded pivot and fighting-game bounds",
    "forward-facing orientation before runtime mirroring",
    "readable visible materials",
    "texture dimension budget",
    "thumbnail or first-frame capture path",
    "named fighting animation clips with non-empty tracks",
    "clip events for attack active frames when events are required"
  ],
  requiredAnimationRoles: fightingGameAnimationRoles,
  evidenceBoundary:
    "This is a source validation contract. A Quaternius-derived fighter is not evidence-ready until validate-game output, typed asset metadata, and retained runtime/browser evidence are archived."
} as const satisfies QuaterniusGameReadyFighterValidationContract;

export function defineGameAssetReadinessManifest<const TManifest extends GameAssetReadinessManifest>(
  manifest: TManifest
): TManifest {
  return manifest;
}

export function createGameAssetReadinessManifest<TAsset extends AuraAssetRef<"model">>(
  asset: TAsset,
  options: CreateGameAssetReadinessManifestOptions = {}
): GameAssetReadinessManifest<TAsset> {
  const metadata = asset.metadata;
  const file = {
    url: options.file?.url ?? asset.url,
    format: options.file?.format ?? asset.format,
    sizeBytes: options.file?.sizeBytes ?? asset.sizeBytes,
    hash: options.file?.hash ?? asset.hash
  };
  const provenance = options.provenance ?? provenanceFromAsset(asset);
  const thumbnail = options.thumbnail ?? (metadata?.thumbnailUrl ? { url: metadata.thumbnailUrl } : undefined);
  return {
    kind: "aura-game-asset-readiness-manifest",
    contractId: gameAssetValidationContractVersion,
    asset,
    displayName: options.displayName,
    file,
    provenance,
    thumbnail,
    bounds: normalizeGameAssetBounds(options.bounds ?? asset.bounds, "asset-metadata"),
    orientation: options.orientation,
    skeleton: options.skeleton,
    animations: normalizeAnimationClips(options.animations ?? metadata?.animations),
    morphTargets: options.morphTargets,
    materials: normalizeMaterials(options.materials ?? metadata?.materials),
    textures: normalizeTextures(options.textures ?? metadata?.textures),
    intendedUse: options.intendedUse,
    notes: options.notes,
    generatedAt: options.generatedAt
  };
}

export function validateGameAssetReadiness<TAsset extends AuraAssetRef<"model">>(
  manifest: GameAssetReadinessManifest<TAsset>,
  policy: GameAssetValidationPolicy = {}
): GameAssetValidationReport<TAsset> {
  const checks: GameAssetValidationCheck[] = [];
  const issues: GameAssetValidationIssue[] = [];
  const assetId = manifest.asset.id;

  pushCheck(checkTypedAsset(manifest), checks, issues);
  pushCheck(checkModelFormat(manifest), checks, issues);
  pushCheck(checkFileSize(manifest, policy), checks, issues);
  for (const check of evaluateGameAssetBounds(manifest, policy.bounds, policy.requireBounds)) pushCheck(check, checks, issues);
  for (const check of evaluateGameAssetOrientation(manifest, policy.orientation, policy.requireOrientation)) {
    pushCheck(check, checks, issues);
  }
  for (const check of evaluateGameAssetAnimationClips(manifest, policy.animation)) pushCheck(check, checks, issues);
  pushCheck(checkSkeleton(manifest, policy.requireSkeleton), checks, issues);
  pushCheck(checkMaterials(manifest, policy.requireReadableMaterials), checks, issues);
  for (const check of checkTextures(manifest, policy.maxTextureDimension)) pushCheck(check, checks, issues);
  pushCheck(checkThumbnail(manifest, policy.requireThumbnail), checks, issues);
  pushCheck(checkProvenance(manifest, policy.requireProvenance), checks, issues);
  pushCheck(checkIntendedUse(manifest, policy.requireIntendedUse), checks, issues);

  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;
  return {
    kind: "aura-game-asset-validation-report",
    contractId: gameAssetValidationContractVersion,
    asset: manifest.asset,
    assetId,
    manifest,
    ready: errors === 0,
    summary: {
      status: errors > 0 ? "fail" : warnings > 0 ? "warn" : "pass",
      checks: checks.length,
      errors,
      warnings,
      animationClips: manifest.animations?.length ?? 0,
      materials: manifest.materials?.length ?? 0,
      textures: manifest.textures?.length ?? 0
    },
    checks,
    issues
  };
}

export function createQuaterniusGameReadyFighterValidationPolicy(
  overrides: GameAssetValidationPolicy = {}
): GameAssetValidationPolicy {
  return {
    maxFileSizeBytes: overrides.maxFileSizeBytes ?? 50 * 1024 * 1024,
    requireFileSize: overrides.requireFileSize ?? true,
    requireBounds: overrides.requireBounds ?? true,
    requireOrientation: overrides.requireOrientation ?? true,
    requireSkeleton: overrides.requireSkeleton ?? true,
    requireThumbnail: overrides.requireThumbnail ?? true,
    requireProvenance: overrides.requireProvenance ?? true,
    requireIntendedUse: overrides.requireIntendedUse ?? true,
    requireReadableMaterials: overrides.requireReadableMaterials ?? true,
    maxTextureDimension: overrides.maxTextureDimension ?? 4096,
    bounds: {
      minWidth: 0.2,
      maxWidth: 4,
      minHeight: 0.6,
      maxHeight: 4,
      minDepth: 0.1,
      maxDepth: 4,
      maxDimension: 4,
      maxOriginOffset: 0.5,
      requireGroundedPivot: true,
      groundTolerance: 0.08,
      ...overrides.bounds
    },
    orientation: {
      upAxis: "y",
      forwardAxis: "z",
      pivot: ["feet", "grounded"],
      minUnitScale: 0.001,
      maxUnitScale: 1000,
      ...overrides.orientation
    },
    animation: {
      requireNonEmptyClips: true,
      minimumDuration: 1 / 30,
      requiredClips: fightingGameAnimationRoles,
      ...overrides.animation
    }
  };
}

export function validateQuaterniusGameReadyFighterAsset<TAsset extends AuraAssetRef<"model">>(
  manifest: GameAssetReadinessManifest<TAsset>,
  policy: GameAssetValidationPolicy = {}
): GameAssetValidationReport<TAsset> {
  const base = validateGameAssetReadiness(manifest, createQuaterniusGameReadyFighterValidationPolicy(policy));
  const quaterniusCheck = checkQuaterniusProvenance(manifest);
  const checks = [...base.checks, quaterniusCheck];
  const issues = [...base.issues];
  if (quaterniusCheck.status === "fail") {
    issues.push(createGameAssetValidationIssue("error", quaterniusCheck.id, quaterniusCheck.message, { assetId: quaterniusCheck.assetId }));
  } else if (quaterniusCheck.status === "warn" || quaterniusCheck.status === "missing") {
    issues.push(createGameAssetValidationIssue("warning", quaterniusCheck.id, quaterniusCheck.message, { assetId: quaterniusCheck.assetId }));
  }

  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;
  return {
    ...base,
    ready: errors === 0,
    summary: {
      ...base.summary,
      status: errors > 0 ? "fail" : warnings > 0 ? "warn" : "pass",
      checks: checks.length,
      errors,
      warnings
    },
    checks,
    issues
  };
}

export function evaluateGameAssetBounds(
  manifest: GameAssetReadinessManifest,
  policy: GameAssetBoundsPolicy = {},
  required = false
): readonly GameAssetValidationCheck[] {
  const bounds = manifest.bounds;
  if (!bounds) {
    return [
      {
        id: "bounds",
        status: required ? "fail" : "missing",
        assetId: manifest.asset.id,
        message: required
          ? "Asset bounds are required for game readiness."
          : "Asset bounds are missing; scale, pivot, and camera framing cannot be proven."
      }
    ];
  }
  const checks: GameAssetValidationCheck[] = [];
  const [width, height, depth] = bounds.size;
  const maxDimension = Math.max(width, height, depth);
  const originOffset = Math.hypot(bounds.center[0], bounds.center[2]);
  const groundTolerance = policy.groundTolerance ?? 0.08;
  const minY = bounds.min?.[1];

  checks.push(rangeCheck("bounds.width", width, policy.minWidth, policy.maxWidth, manifest.asset.id, "width"));
  checks.push(rangeCheck("bounds.height", height, policy.minHeight, policy.maxHeight, manifest.asset.id, "height"));
  checks.push(rangeCheck("bounds.depth", depth, policy.minDepth, policy.maxDepth, manifest.asset.id, "depth"));
  if (policy.maxDimension !== undefined) {
    checks.push(
      maxCheck("bounds.max-dimension", maxDimension, policy.maxDimension, manifest.asset.id, "largest asset dimension")
    );
  }
  if (policy.maxOriginOffset !== undefined) {
    checks.push(maxCheck("bounds.origin-offset", originOffset, policy.maxOriginOffset, manifest.asset.id, "horizontal origin offset"));
  }
  if (policy.requireGroundedPivot) {
    checks.push({
      id: "bounds.grounded-pivot",
      status: minY === undefined ? "missing" : Math.abs(minY) <= groundTolerance ? "pass" : "fail",
      assetId: manifest.asset.id,
      message:
        minY === undefined
          ? "Bounds min.y is missing, so grounded pivot cannot be proven."
          : Math.abs(minY) <= groundTolerance
            ? "Asset pivot is close to the ground plane."
            : `Asset appears offset from the ground plane by ${round(minY)}m.`,
      metrics: minY === undefined ? undefined : { minY: round(minY), tolerance: groundTolerance }
    });
  }
  return checks;
}

export function evaluateGameAssetOrientation(
  manifest: GameAssetReadinessManifest,
  policy: GameAssetOrientationPolicy = {},
  required = false
): readonly GameAssetValidationCheck[] {
  const orientation = manifest.orientation;
  if (!orientation) {
    return [
      {
        id: "orientation",
        status: required ? "fail" : "missing",
        assetId: manifest.asset.id,
        message: required
          ? "Asset orientation is required for game readiness."
          : "Asset orientation is missing; facing direction and up axis cannot be proven."
      }
    ];
  }

  const checks: GameAssetValidationCheck[] = [];
  const expectedUp = policy.upAxis ?? "y";
  const expectedForward = toAxisList(policy.forwardAxis ?? ["z", "-z"]);
  const expectedPivots = toPivotList(policy.pivot ?? ["feet", "grounded", "center"]);
  checks.push({
    id: "orientation.up-axis",
    status: orientation.upAxis === expectedUp ? "pass" : "fail",
    assetId: manifest.asset.id,
    message:
      orientation.upAxis === expectedUp
        ? `Asset up axis is ${expectedUp}.`
        : `Asset up axis is ${orientation.upAxis}; expected ${expectedUp}.`
  });
  checks.push({
    id: "orientation.forward-axis",
    status: expectedForward.includes(orientation.forwardAxis) ? "pass" : "fail",
    assetId: manifest.asset.id,
    message: expectedForward.includes(orientation.forwardAxis)
      ? `Asset forward axis is ${orientation.forwardAxis}.`
      : `Asset forward axis is ${orientation.forwardAxis}; expected one of ${expectedForward.join(", ")}.`
  });
  if (orientation.pivot) {
    checks.push({
      id: "orientation.pivot",
      status: expectedPivots.includes(orientation.pivot) ? "pass" : "fail",
      assetId: manifest.asset.id,
      message: expectedPivots.includes(orientation.pivot)
        ? `Asset pivot is ${orientation.pivot}.`
        : `Asset pivot is ${orientation.pivot}; expected one of ${expectedPivots.join(", ")}.`
    });
  }
  if (orientation.unitScale !== undefined) {
    const minScale = policy.minUnitScale ?? 0.001;
    const maxScale = policy.maxUnitScale ?? 1000;
    checks.push(rangeCheck("orientation.unit-scale", orientation.unitScale, minScale, maxScale, manifest.asset.id, "unit scale"));
  }
  return checks;
}

export function evaluateGameAssetAnimationClips(
  manifest: GameAssetReadinessManifest,
  policy: GameAssetAnimationPolicy = {}
): readonly GameAssetValidationCheck[] {
  const clips = manifest.animations ?? [];
  const checks: GameAssetValidationCheck[] = [];
  const minimumDuration = policy.minimumDuration ?? 1 / 30;
  const requireNonEmpty = policy.requireNonEmptyClips ?? true;

  if (requireNonEmpty) {
    checks.push({
      id: "animation.clips-present",
      status: clips.length > 0 ? "pass" : "missing",
      assetId: manifest.asset.id,
      message: clips.length > 0 ? `Asset declares ${clips.length} animation clips.` : "Asset declares no animation clips."
    });
  }

  for (const clip of clips) {
    const duration = clip.duration ?? 0;
    checks.push({
      id: `animation.clip.${clip.name}.duration`,
      status: duration > 0 && duration >= minimumDuration ? "pass" : "fail",
      assetId: manifest.asset.id,
      message:
        duration > 0 && duration >= minimumDuration
          ? `Animation clip "${clip.name}" has duration ${round(duration)}s.`
          : `Animation clip "${clip.name}" is empty or shorter than ${round(minimumDuration)}s.`,
      metrics: { duration: round(duration), minimumDuration: round(minimumDuration) }
    });
  }

  for (const requirement of policy.requiredClips ?? []) {
    const required = normalizeClipRequirement(requirement);
    const clip = findClip(clips, required);
    const label = required.role ?? required.name ?? "clip";
    if (!clip) {
      checks.push({
        id: `animation.required.${label}`,
        status: "fail",
        assetId: manifest.asset.id,
        message: `Missing required animation clip "${label}".`
      });
      continue;
    }
    checks.push({
      id: `animation.required.${label}`,
      status: "pass",
      assetId: manifest.asset.id,
      message: `Required animation clip "${label}" is present as "${clip.name}".`
    });
    if (required.minimumDuration !== undefined) {
      const duration = clip.duration ?? 0;
      checks.push({
        id: `animation.required.${label}.duration`,
        status: duration >= required.minimumDuration ? "pass" : "fail",
        assetId: manifest.asset.id,
        message:
          duration >= required.minimumDuration
            ? `Required clip "${label}" meets duration policy.`
            : `Required clip "${label}" is ${round(duration)}s; expected at least ${round(required.minimumDuration)}s.`
      });
    }
    for (const eventName of required.requireEvents ?? []) {
      const hasEvent = Boolean(clip.events?.some((event) => event.name === eventName));
      checks.push({
        id: `animation.required.${label}.event.${eventName}`,
        status: hasEvent ? "pass" : "fail",
        assetId: manifest.asset.id,
        message: hasEvent
          ? `Required clip "${label}" has event "${eventName}".`
          : `Required clip "${label}" is missing event "${eventName}".`
      });
    }
  }

  return checks;
}

export function createGameAssetValidationIssue(
  severity: GameAssetValidationSeverity,
  code: string,
  message: string,
  details: Omit<GameAssetValidationIssue, "severity" | "code" | "message"> = {}
): GameAssetValidationIssue {
  return {
    severity,
    code,
    message,
    ...details
  };
}

export function isAuraGameModelAssetRef(value: unknown): value is AuraAssetRef<"model"> {
  const candidate = value as Partial<AuraAssetRef<"model">> | null;
  return Boolean(candidate && candidate.kind === "aura-asset-ref" && candidate.type === "model" && candidate.id);
}

export function gameAssetBoundsFromSize(size: AuraVec3, source: GameAssetBoundsSource = "manual"): GameAssetBounds {
  return normalizeGameAssetBounds(size, source) ?? {
    center: [0, 0, 0],
    size: [0, 0, 0],
    min: [0, 0, 0],
    max: [0, 0, 0],
    radius: 0,
    source
  };
}

function checkTypedAsset(manifest: GameAssetReadinessManifest): GameAssetValidationCheck {
  const asset = manifest.asset;
  const valid = isAuraGameModelAssetRef(asset);
  return {
    id: "asset.typed-ref",
    status: valid ? "pass" : "fail",
    assetId: asset.id,
    message: valid
      ? `Asset "${asset.id}" is a typed Aura model asset reference.`
      : "Asset must be a typed Aura model asset reference, for example model(assets.fighter)."
  };
}

function checkModelFormat(manifest: GameAssetReadinessManifest): GameAssetValidationCheck {
  const format = normalizeModelFormat(manifest.file.format);
  const supported = format === "glb" || format === "gltf";
  return {
    id: "asset.format",
    status: supported ? "pass" : "fail",
    assetId: manifest.asset.id,
    message: supported
      ? `Asset format "${format}" is supported.`
      : `Asset format "${manifest.file.format}" is not supported for game readiness; export GLB or glTF.`
  };
}

function checkFileSize(manifest: GameAssetReadinessManifest, policy: GameAssetValidationPolicy): GameAssetValidationCheck {
  const sizeBytes = manifest.file.sizeBytes;
  if (sizeBytes === undefined) {
    return {
      id: "asset.file-size",
      status: policy.requireFileSize ? "fail" : "missing",
      assetId: manifest.asset.id,
      message: policy.requireFileSize
        ? "Asset file size is required."
        : "Asset file size is missing; download budget cannot be proven."
    };
  }
  const maxFileSizeBytes = policy.maxFileSizeBytes;
  if (maxFileSizeBytes === undefined) {
    return {
      id: "asset.file-size",
      status: "pass",
      assetId: manifest.asset.id,
      message: `Asset file size is ${sizeBytes} bytes.`,
      metrics: { sizeBytes }
    };
  }
  return {
    id: "asset.file-size",
    status: sizeBytes <= maxFileSizeBytes ? "pass" : "fail",
    assetId: manifest.asset.id,
    message:
      sizeBytes <= maxFileSizeBytes
        ? `Asset file size is within budget (${sizeBytes}/${maxFileSizeBytes} bytes).`
        : `Asset file size exceeds budget (${sizeBytes}/${maxFileSizeBytes} bytes).`,
    metrics: { sizeBytes, maxFileSizeBytes }
  };
}

function checkSkeleton(manifest: GameAssetReadinessManifest, required = false): GameAssetValidationCheck {
  const skeleton = manifest.skeleton;
  if (!skeleton) {
    return {
      id: "skeleton",
      status: required ? "fail" : "missing",
      assetId: manifest.asset.id,
      message: required ? "Skeleton readiness is required." : "Skeleton readiness is not declared."
    };
  }
  const missingRequiredBones = skeleton.missingRequiredBones ?? [];
  return {
    id: "skeleton",
    status: skeleton.present && missingRequiredBones.length === 0 ? "pass" : "fail",
    assetId: manifest.asset.id,
    message:
      skeleton.present && missingRequiredBones.length === 0
        ? `Skeleton is present${skeleton.joints ? ` with ${skeleton.joints} joints` : ""}.`
        : `Skeleton is not ready${missingRequiredBones.length ? `; missing ${missingRequiredBones.join(", ")}` : ""}.`
  };
}

function checkMaterials(manifest: GameAssetReadinessManifest, requireReadable = false): GameAssetValidationCheck {
  const materials = manifest.materials ?? [];
  if (materials.length === 0) {
    return {
      id: "materials",
      status: requireReadable ? "fail" : "missing",
      assetId: manifest.asset.id,
      message: requireReadable ? "Material summary is required." : "Material summary is missing."
    };
  }
  const invisible = materials.filter((material) => material.visible === false || material.opacity === 0);
  const unreadable = materials.filter((material) => material.readable === false);
  return {
    id: "materials",
    status: invisible.length === 0 && unreadable.length === 0 ? "pass" : "fail",
    assetId: manifest.asset.id,
    message:
      invisible.length === 0 && unreadable.length === 0
        ? `Asset declares ${materials.length} readable materials.`
        : `Asset has material issues: ${[...invisible.map((material) => `${material.name} invisible`), ...unreadable.map((material) => `${material.name} unreadable`)].join(", ")}.`
  };
}

function checkTextures(
  manifest: GameAssetReadinessManifest,
  maxTextureDimension: number | undefined
): readonly GameAssetValidationCheck[] {
  const textures = manifest.textures ?? [];
  if (textures.length === 0) {
    return [
      {
        id: "textures",
        status: "missing",
        assetId: manifest.asset.id,
        message: "Texture summary is missing."
      }
    ];
  }
  const checks: GameAssetValidationCheck[] = [
    {
      id: "textures",
      status: "pass",
      assetId: manifest.asset.id,
      message: `Asset declares ${textures.length} textures.`
    }
  ];
  if (maxTextureDimension !== undefined) {
    for (const texture of textures) {
      const width = texture.width ?? 0;
      const height = texture.height ?? 0;
      const dimension = Math.max(width, height);
      checks.push({
        id: `textures.${texture.name}.dimension`,
        status: dimension === 0 ? "missing" : dimension <= maxTextureDimension ? "pass" : "fail",
        assetId: manifest.asset.id,
        message:
          dimension === 0
            ? `Texture "${texture.name}" dimensions are missing.`
            : dimension <= maxTextureDimension
              ? `Texture "${texture.name}" is within dimension budget.`
              : `Texture "${texture.name}" exceeds ${maxTextureDimension}px.`
      });
    }
  }
  return checks;
}

function checkThumbnail(manifest: GameAssetReadinessManifest, required = false): GameAssetValidationCheck {
  const thumbnail = manifest.thumbnail;
  return {
    id: "thumbnail",
    status: thumbnail?.url || thumbnail?.path ? "pass" : required ? "fail" : "missing",
    assetId: manifest.asset.id,
    message:
      thumbnail?.url || thumbnail?.path
        ? "Asset thumbnail is declared."
        : required
          ? "Asset thumbnail is required."
          : "Asset thumbnail is missing."
  };
}

function checkProvenance(manifest: GameAssetReadinessManifest, required = false): GameAssetValidationCheck {
  const provenance = manifest.provenance;
  const hasLicense = Boolean(provenance?.license || provenance?.licenseUrl);
  const approved = provenance?.approvalStatus === "approved";
  const ready = Boolean(provenance && hasLicense && provenance.commercialUse !== false && provenance.approvalStatus !== "rejected");
  return {
    id: "provenance",
    status: ready ? (approved ? "pass" : "warn") : required ? "fail" : "missing",
    assetId: manifest.asset.id,
    message: ready
      ? approved
        ? "Asset provenance is approved."
        : "Asset provenance is present but not marked approved."
      : required
        ? "Asset provenance, license, and commercial-use status are required."
        : "Asset provenance is missing or incomplete."
  };
}

function checkIntendedUse(manifest: GameAssetReadinessManifest, required = false): GameAssetValidationCheck {
  const intendedUse = manifest.intendedUse;
  return {
    id: "intended-use",
    status: intendedUse ? "pass" : required ? "fail" : "missing",
    assetId: manifest.asset.id,
    message: intendedUse ? `Asset intended use is "${intendedUse.kind}".` : "Asset intended route/game usage is missing."
  };
}

function checkQuaterniusProvenance(manifest: GameAssetReadinessManifest): GameAssetValidationCheck {
  const provenance = manifest.provenance;
  const source = [
    provenance?.title,
    provenance?.creator,
    provenance?.sourceName,
    provenance?.sourceUrl,
    provenance?.attribution,
    ...(provenance?.notes ?? [])
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  const quaternius = /quaternius/i.test(source);
  return {
    id: "quaternius.source-family",
    status: quaternius ? "pass" : "fail",
    assetId: manifest.asset.id,
    message: quaternius
      ? "Asset provenance identifies a Quaternius-derived source."
      : "Quaternius-derived fighter validation requires provenance that identifies Quaternius as the source family."
  };
}

function pushCheck(
  check: GameAssetValidationCheck,
  checks: GameAssetValidationCheck[],
  issues: GameAssetValidationIssue[]
): void {
  checks.push(check);
  if (check.status === "fail") {
    issues.push(createGameAssetValidationIssue("error", check.id, check.message, { assetId: check.assetId }));
  }
  if (check.status === "warn" || check.status === "missing") {
    issues.push(createGameAssetValidationIssue("warning", check.id, check.message, { assetId: check.assetId }));
  }
}

function normalizeGameAssetBounds(
  bounds: GameAssetBounds | AuraVec3 | undefined,
  source: GameAssetBoundsSource
): GameAssetBounds | undefined {
  if (!bounds) return undefined;
  if (Array.isArray(bounds)) {
    const size: AuraVec3 = [safeNumber(bounds[0]), safeNumber(bounds[1]), safeNumber(bounds[2])];
    const center: AuraVec3 = [0, size[1] / 2, 0];
    const half: AuraVec3 = [size[0] / 2, size[1] / 2, size[2] / 2];
    return {
      center,
      size,
      min: [-half[0], 0, -half[2]],
      max: [half[0], size[1], half[2]],
      radius: Math.hypot(half[0], half[1], half[2]),
      source
    };
  }
  return bounds as GameAssetBounds;
}

function provenanceFromAsset(asset: AuraAssetRef<"model">): GameAssetProvenance | undefined {
  if (!asset.metadata?.license && !asset.hash) return undefined;
  return {
    license: asset.metadata?.license,
    fileHash: asset.hash,
    approvalStatus: asset.optional ? "needs-review" : "draft"
  };
}

function normalizeAnimationClips(
  clips: readonly (GameAssetAnimationClipReadiness | string)[] | undefined
): readonly GameAssetAnimationClipReadiness[] | undefined {
  if (!clips) return undefined;
  return clips.map((clip) => (typeof clip === "string" ? { name: clip } : clip));
}

function normalizeMaterials(
  materials: readonly (GameAssetMaterialReadiness | string)[] | undefined
): readonly GameAssetMaterialReadiness[] | undefined {
  if (!materials) return undefined;
  return materials.map((material) => (typeof material === "string" ? { name: material, visible: true, readable: true } : material));
}

function normalizeTextures(
  textures: readonly (GameAssetTextureReadiness | string)[] | undefined
): readonly GameAssetTextureReadiness[] | undefined {
  if (!textures) return undefined;
  return textures.map((texture) => (typeof texture === "string" ? { name: texture } : texture));
}

function normalizeModelFormat(format: string): string {
  const normalized = format.toLowerCase().replace(/^\./, "");
  if (normalized.includes("gltf-binary")) return "glb";
  if (normalized.includes("gltf+json")) return "gltf";
  return normalized;
}

function rangeCheck(
  id: string,
  value: number,
  min: number | undefined,
  max: number | undefined,
  assetId: string,
  label: string
): GameAssetValidationCheck {
  const aboveMin = min === undefined || value >= min;
  const belowMax = max === undefined || value <= max;
  return {
    id,
    status: aboveMin && belowMax ? "pass" : "fail",
    assetId,
    message:
      aboveMin && belowMax
        ? `Asset ${label} is ${round(value)}m.`
        : `Asset ${label} is ${round(value)}m; expected ${min ?? "-inf"} to ${max ?? "+inf"}m.`,
    metrics: { value: round(value), ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) }
  };
}

function maxCheck(id: string, value: number, max: number, assetId: string, label: string): GameAssetValidationCheck {
  return {
    id,
    status: value <= max ? "pass" : "fail",
    assetId,
    message: value <= max ? `Asset ${label} is within budget.` : `Asset ${label} is ${round(value)}; expected at most ${max}.`,
    metrics: { value: round(value), max }
  };
}

function normalizeClipRequirement(requirement: GameAssetAnimationRole | string | GameAssetClipRequirement): GameAssetClipRequirement {
  if (typeof requirement !== "string") return requirement;
  return isAnimationRole(requirement) ? { role: requirement } : { name: requirement };
}

function findClip(
  clips: readonly GameAssetAnimationClipReadiness[],
  requirement: GameAssetClipRequirement
): GameAssetAnimationClipReadiness | undefined {
  const requiredRole = requirement.role;
  const requiredName = requirement.name?.toLowerCase();
  return clips.find((clip) => {
    if (requiredRole && clip.role === requiredRole) return true;
    if (requiredName && clip.name.toLowerCase() === requiredName) return true;
    if (requiredRole && clip.name.toLowerCase().includes(requiredRole)) return true;
    return false;
  });
}

function isAnimationRole(value: string): value is GameAssetAnimationRole {
  return [
    "idle",
    "walk",
    "walk-forward",
    "walk-back",
    "run",
    "jump",
    "land",
    "dash",
    "guard",
    "light",
    "heavy",
    "special",
    "super",
    "hit",
    "stun",
    "knockdown",
    "win",
    "lose",
    "speak",
    "emote"
  ].includes(value);
}

function toAxisList(axis: GameAssetAxis | readonly GameAssetAxis[]): readonly GameAssetAxis[] {
  return Array.isArray(axis) ? [...axis] : [axis as GameAssetAxis];
}

function toPivotList(
  pivot: NonNullable<GameAssetOrientation["pivot"]> | readonly NonNullable<GameAssetOrientation["pivot"]>[]
): readonly NonNullable<GameAssetOrientation["pivot"]>[] {
  return Array.isArray(pivot) ? [...pivot] : [pivot as NonNullable<GameAssetOrientation["pivot"]>];
}

function safeNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

export const gameAssetValidation = {
  contractVersion: gameAssetValidationContractVersion,
  defineManifest: defineGameAssetReadinessManifest,
  createManifest: createGameAssetReadinessManifest,
  validate: validateGameAssetReadiness,
  quaterniusGameReadyFighter: quaterniusGameReadyFighterValidationContract,
  createQuaterniusGameReadyFighterPolicy: createQuaterniusGameReadyFighterValidationPolicy,
  validateQuaterniusGameReadyFighter: validateQuaterniusGameReadyFighterAsset,
  evaluateBounds: evaluateGameAssetBounds,
  evaluateOrientation: evaluateGameAssetOrientation,
  evaluateAnimationClips: evaluateGameAssetAnimationClips,
  boundsFromSize: gameAssetBoundsFromSize,
  isModelAssetRef: isAuraGameModelAssetRef,
  fightingAnimationRoles: fightingGameAnimationRoles
} as const;
