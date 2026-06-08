import type { AuraAssetRef, AuraColor, AuraVec3 } from "./index.js";
import {
  createGameAssetValidationIssue,
  gameAssetValidationContractVersion,
  isAuraGameModelAssetRef,
  type GameAssetAxis,
  type GameAssetBounds,
  type GameAssetOrientation,
  type GameAssetReadinessManifest,
  type GameAssetValidationCheck,
  type GameAssetValidationIssue,
  type GameAssetValidationStatus
} from "./GameAssetValidation.js";

export type CharacterAssemblyPartRole =
  | "base-body"
  | "head"
  | "hair"
  | "face"
  | "top"
  | "bottom"
  | "full-outfit"
  | "shoes"
  | "gloves"
  | "cape"
  | "accessory"
  | "weapon"
  | "prop";

export type CharacterAssemblySocket =
  | "root"
  | "hips"
  | "spine"
  | "chest"
  | "neck"
  | "head"
  | "hairline"
  | "left-hand"
  | "right-hand"
  | "left-foot"
  | "right-foot"
  | "back"
  | "custom";

export interface CharacterAssemblyTransform {
  readonly position?: AuraVec3 | undefined;
  readonly rotation?: AuraVec3 | undefined;
  readonly scale?: number | AuraVec3 | undefined;
}

export interface CharacterAssemblyAttachmentRule {
  readonly socket: CharacterAssemblySocket;
  readonly parentRole?: CharacterAssemblyPartRole | undefined;
  readonly parentPartName?: string | undefined;
  readonly offset?: AuraVec3 | undefined;
  readonly rotation?: AuraVec3 | undefined;
  readonly scale?: number | AuraVec3 | undefined;
  readonly allowFloating?: boolean | undefined;
  readonly maxGap?: number | undefined;
  readonly notes?: readonly string[] | undefined;
}

export interface CharacterAssemblyMaterialOverride {
  readonly materialName?: string | undefined;
  readonly color?: AuraColor | undefined;
  readonly opacity?: number | undefined;
  readonly roughness?: number | undefined;
  readonly metallic?: number | undefined;
}

export interface CharacterAssemblyPalette {
  readonly skin?: AuraColor | undefined;
  readonly hair?: AuraColor | undefined;
  readonly primary?: AuraColor | undefined;
  readonly secondary?: AuraColor | undefined;
  readonly accent?: AuraColor | undefined;
  readonly emissive?: AuraColor | undefined;
}

export interface CharacterAssemblyPart<TAsset extends AuraAssetRef<"model"> = AuraAssetRef<"model">> {
  readonly role: CharacterAssemblyPartRole;
  readonly asset: TAsset;
  readonly name?: string | undefined;
  readonly required?: boolean | undefined;
  readonly transform?: CharacterAssemblyTransform | undefined;
  readonly attachment?: CharacterAssemblyAttachmentRule | undefined;
  readonly readiness?: GameAssetReadinessManifest<TAsset> | undefined;
  readonly bounds?: GameAssetBounds | undefined;
  readonly materials?: readonly CharacterAssemblyMaterialOverride[] | undefined;
  readonly tags?: readonly string[] | undefined;
}

export interface CharacterAssemblyGameplayIntent {
  readonly runtimeNodeId?: string | undefined;
  readonly collisionPreset?: "fighter" | "npc" | "animation-character" | "none" | undefined;
  readonly animationProfile?: "fighter" | "animation" | "ambient" | undefined;
  readonly routeUsage?: readonly string[] | undefined;
}

export interface CharacterAssemblyPlan<TBody extends AuraAssetRef<"model"> = AuraAssetRef<"model">> {
  readonly kind: "aura-character-assembly-plan";
  readonly contractId: string;
  readonly exportName: string;
  readonly baseBody: CharacterAssemblyPart<TBody>;
  readonly parts: readonly CharacterAssemblyPart[];
  readonly palette?: CharacterAssemblyPalette | undefined;
  readonly scale: number;
  readonly orientation: GameAssetOrientation;
  readonly attachmentRules: readonly CharacterAssemblyAttachmentRule[];
  readonly gameplay?: CharacterAssemblyGameplayIntent | undefined;
  readonly notes?: readonly string[] | undefined;
  readonly generatedAt?: string | undefined;
}

export interface CharacterAssemblyPartInput<TAsset extends AuraAssetRef<"model"> = AuraAssetRef<"model">>
  extends Omit<CharacterAssemblyPart<TAsset>, "role"> {
  readonly role?: CharacterAssemblyPartRole | undefined;
}

export interface CreateCharacterAssemblyPlanInput<TBody extends AuraAssetRef<"model"> = AuraAssetRef<"model">> {
  readonly exportName: string;
  readonly baseBody: TBody | CharacterAssemblyPart<TBody>;
  readonly hair?: readonly CharacterAssemblyPartInput[] | undefined;
  readonly clothing?: readonly CharacterAssemblyPartInput[] | undefined;
  readonly accessories?: readonly CharacterAssemblyPartInput[] | undefined;
  readonly parts?: readonly CharacterAssemblyPartInput[] | undefined;
  readonly palette?: CharacterAssemblyPalette | undefined;
  readonly scale?: number | undefined;
  readonly orientation?: Partial<GameAssetOrientation> | undefined;
  readonly attachmentRules?: readonly CharacterAssemblyAttachmentRule[] | undefined;
  readonly gameplay?: CharacterAssemblyGameplayIntent | undefined;
  readonly notes?: readonly string[] | undefined;
  readonly generatedAt?: string | undefined;
}

export interface CharacterAssemblyValidationPolicy {
  readonly minScale?: number | undefined;
  readonly maxScale?: number | undefined;
  readonly expectedUpAxis?: GameAssetAxis | undefined;
  readonly allowedForwardAxes?: readonly GameAssetAxis[] | undefined;
  readonly requireAttachmentForRoles?: readonly CharacterAssemblyPartRole[] | undefined;
  readonly requireBodyBounds?: boolean | undefined;
  readonly maxAccessoryGap?: number | undefined;
}

export interface CharacterAssemblyValidationReport<TBody extends AuraAssetRef<"model"> = AuraAssetRef<"model">> {
  readonly kind: "aura-character-assembly-validation-report";
  readonly contractId: string;
  readonly plan: CharacterAssemblyPlan<TBody>;
  readonly ready: boolean;
  readonly summary: {
    readonly status: GameAssetValidationStatus;
    readonly exportName: string;
    readonly typedAssets: number;
    readonly totalParts: number;
    readonly requiredParts: number;
    readonly attachedParts: number;
    readonly paletteColors: number;
    readonly errors: number;
    readonly warnings: number;
  };
  readonly checks: readonly GameAssetValidationCheck[];
  readonly issues: readonly GameAssetValidationIssue[];
}

const defaultAttachmentRoles: readonly CharacterAssemblyPartRole[] = [
  "hair",
  "face",
  "top",
  "bottom",
  "full-outfit",
  "shoes",
  "gloves",
  "cape",
  "accessory",
  "weapon"
];

export function defineCharacterAssemblyPlan<const TPlan extends CharacterAssemblyPlan>(plan: TPlan): TPlan {
  return plan;
}

export function characterAssemblyPart<TAsset extends AuraAssetRef<"model">>(
  asset: TAsset,
  role: CharacterAssemblyPartRole,
  options: Omit<CharacterAssemblyPart<TAsset>, "asset" | "role"> = {}
): CharacterAssemblyPart<TAsset> {
  return {
    ...options,
    asset,
    role
  };
}

export function createCharacterAssemblyPlan<TBody extends AuraAssetRef<"model">>(
  input: CreateCharacterAssemblyPlanInput<TBody>
): CharacterAssemblyPlan<TBody> {
  const baseBody = normalizeBaseBody(input.baseBody);
  const hair = (input.hair ?? []).map((part) => normalizePart(part, "hair"));
  const clothing = (input.clothing ?? []).map((part) => normalizePart(part, part.role ?? "top"));
  const accessories = (input.accessories ?? []).map((part) => normalizePart(part, part.role ?? "accessory"));
  const extraParts = (input.parts ?? []).map((part) => normalizePart(part, part.role ?? "prop"));
  const parts = [...hair, ...clothing, ...accessories, ...extraParts];
  return {
    kind: "aura-character-assembly-plan",
    contractId: gameAssetValidationContractVersion,
    exportName: input.exportName,
    baseBody,
    parts,
    palette: input.palette,
    scale: input.scale ?? 1,
    orientation: {
      upAxis: input.orientation?.upAxis ?? "y",
      forwardAxis: input.orientation?.forwardAxis ?? "z",
      unitScale: input.orientation?.unitScale ?? 1,
      pivot: input.orientation?.pivot ?? "feet",
      origin: input.orientation?.origin,
      notes: input.orientation?.notes
    },
    attachmentRules: input.attachmentRules ?? [],
    gameplay: input.gameplay,
    notes: input.notes,
    generatedAt: input.generatedAt
  };
}

export function validateCharacterAssemblyPlan<TBody extends AuraAssetRef<"model">>(
  plan: CharacterAssemblyPlan<TBody>,
  policy: CharacterAssemblyValidationPolicy = {}
): CharacterAssemblyValidationReport<TBody> {
  const checks: GameAssetValidationCheck[] = [];
  const issues: GameAssetValidationIssue[] = [];
  const parts = [plan.baseBody, ...plan.parts];
  const requireAttachmentForRoles = policy.requireAttachmentForRoles ?? defaultAttachmentRoles;

  addCheck(checkExportName(plan), checks, issues);
  addCheck(checkBody(plan), checks, issues);
  addCheck(checkAssemblyScale(plan, policy), checks, issues);
  addCheck(checkAssemblyOrientation(plan, policy), checks, issues);
  if (policy.requireBodyBounds) addCheck(checkBodyBounds(plan), checks, issues);

  for (const part of parts) {
    addCheck(checkTypedPart(part), checks, issues);
    if (part.required) addCheck(checkRequiredPart(part), checks, issues);
    if (part.readiness?.bounds || part.bounds) addCheck(checkPartBounds(part), checks, issues);
    if (part.readiness?.materials?.some((material) => material.visible === false || material.opacity === 0)) {
      addCheck(
        {
          id: `part.${partLabel(part)}.material-visible`,
          status: "fail",
          assetId: part.asset.id,
          message: `Character part "${partLabel(part)}" has invisible materials.`
        },
        checks,
        issues
      );
    }
  }

  for (const part of plan.parts) {
    if (!requireAttachmentForRoles.includes(part.role)) continue;
    addCheck(checkAttachment(plan, part, policy.maxAccessoryGap), checks, issues);
  }

  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;
  return {
    kind: "aura-character-assembly-validation-report",
    contractId: gameAssetValidationContractVersion,
    plan,
    ready: errors === 0,
    summary: {
      status: errors > 0 ? "fail" : warnings > 0 ? "warn" : "pass",
      exportName: plan.exportName,
      typedAssets: parts.filter((part) => isAuraGameModelAssetRef(part.asset)).length,
      totalParts: parts.length,
      requiredParts: parts.filter((part) => part.required).length,
      attachedParts: plan.parts.filter((part) => Boolean(part.attachment) || hasPlanAttachment(plan, part)).length,
      paletteColors: countPaletteColors(plan.palette),
      errors,
      warnings
    },
    checks,
    issues
  };
}

export function collectCharacterAssemblyAssets(plan: CharacterAssemblyPlan): readonly AuraAssetRef<"model">[] {
  return [plan.baseBody.asset, ...plan.parts.map((part) => part.asset)];
}

function normalizeBaseBody<TBody extends AuraAssetRef<"model">>(
  baseBody: TBody | CharacterAssemblyPart<TBody>
): CharacterAssemblyPart<TBody> {
  if (isAssemblyPart(baseBody)) {
    return {
      ...baseBody,
      role: "base-body",
      required: true
    };
  }
  return {
    role: "base-body",
    asset: baseBody,
    required: true
  };
}

function normalizePart(input: CharacterAssemblyPartInput, fallbackRole: CharacterAssemblyPartRole): CharacterAssemblyPart {
  return {
    ...input,
    role: input.role ?? fallbackRole
  };
}

function isAssemblyPart<TAsset extends AuraAssetRef<"model">>(
  value: TAsset | CharacterAssemblyPart<TAsset>
): value is CharacterAssemblyPart<TAsset> {
  return Boolean((value as CharacterAssemblyPart<TAsset>).asset);
}

function checkExportName(plan: CharacterAssemblyPlan): GameAssetValidationCheck {
  const valid = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(plan.exportName);
  return {
    id: "assembly.export-name",
    status: valid ? "pass" : "fail",
    message: valid
      ? `Character export name "${plan.exportName}" is valid.`
      : "Character export name must be stable and file-safe; use letters, numbers, dots, underscores, or dashes."
  };
}

function checkBody(plan: CharacterAssemblyPlan): GameAssetValidationCheck {
  const valid = isAuraGameModelAssetRef(plan.baseBody.asset);
  return {
    id: "assembly.base-body",
    status: valid ? "pass" : "fail",
    assetId: plan.baseBody.asset.id,
    message: valid
      ? "Character assembly has a typed base body asset."
      : "Character assembly is missing a typed base body asset."
  };
}

function checkAssemblyScale(plan: CharacterAssemblyPlan, policy: CharacterAssemblyValidationPolicy): GameAssetValidationCheck {
  const minScale = policy.minScale ?? 0.05;
  const maxScale = policy.maxScale ?? 20;
  const valid = Number.isFinite(plan.scale) && plan.scale >= minScale && plan.scale <= maxScale;
  return {
    id: "assembly.scale",
    status: valid ? "pass" : "fail",
    message: valid
      ? `Character assembly scale is ${plan.scale}.`
      : `Character assembly scale is ${plan.scale}; expected ${minScale} to ${maxScale}.`,
    metrics: { scale: plan.scale, minScale, maxScale }
  };
}

function checkAssemblyOrientation(plan: CharacterAssemblyPlan, policy: CharacterAssemblyValidationPolicy): GameAssetValidationCheck {
  const expectedUp = policy.expectedUpAxis ?? "y";
  const allowedForward = policy.allowedForwardAxes ?? ["z", "-z"];
  const valid = plan.orientation.upAxis === expectedUp && allowedForward.includes(plan.orientation.forwardAxis);
  return {
    id: "assembly.orientation",
    status: valid ? "pass" : "fail",
    message: valid
      ? `Character assembly orientation is ${plan.orientation.upAxis}-up and ${plan.orientation.forwardAxis}-forward.`
      : `Character assembly orientation is ${plan.orientation.upAxis}-up and ${plan.orientation.forwardAxis}-forward; expected ${expectedUp}-up and one of ${allowedForward.join(", ")}.`
  };
}

function checkBodyBounds(plan: CharacterAssemblyPlan): GameAssetValidationCheck {
  const bounds = plan.baseBody.bounds ?? plan.baseBody.readiness?.bounds;
  return {
    id: "assembly.base-body-bounds",
    status: bounds ? "pass" : "fail",
    assetId: plan.baseBody.asset.id,
    message: bounds ? "Base body bounds are available." : "Base body bounds are required for assembly validation."
  };
}

function checkTypedPart(part: CharacterAssemblyPart): GameAssetValidationCheck {
  const valid = isAuraGameModelAssetRef(part.asset);
  return {
    id: `part.${partLabel(part)}.typed-ref`,
    status: valid ? "pass" : "fail",
    assetId: part.asset.id,
    message: valid
      ? `Character part "${partLabel(part)}" uses a typed model asset.`
      : `Character part "${partLabel(part)}" must use a typed model asset.`
  };
}

function checkRequiredPart(part: CharacterAssemblyPart): GameAssetValidationCheck {
  return {
    id: `part.${partLabel(part)}.required`,
    status: part.asset ? "pass" : "fail",
    assetId: part.asset.id,
    message: part.asset ? `Required character part "${partLabel(part)}" is present.` : `Required character part "${partLabel(part)}" is missing.`
  };
}

function checkPartBounds(part: CharacterAssemblyPart): GameAssetValidationCheck {
  const bounds = part.bounds ?? part.readiness?.bounds;
  const size = bounds?.size ?? [0, 0, 0];
  const valid = size.every((value) => Number.isFinite(value) && value >= 0);
  return {
    id: `part.${partLabel(part)}.bounds`,
    status: valid ? "pass" : "fail",
    assetId: part.asset.id,
    message: valid ? `Character part "${partLabel(part)}" has valid bounds.` : `Character part "${partLabel(part)}" has invalid bounds.`
  };
}

function checkAttachment(
  plan: CharacterAssemblyPlan,
  part: CharacterAssemblyPart,
  maxAccessoryGap: number | undefined
): GameAssetValidationCheck {
  const attachment = part.attachment ?? findPlanAttachment(plan, part);
  if (!attachment) {
    return {
      id: `part.${partLabel(part)}.attachment`,
      status: "fail",
      assetId: part.asset.id,
      message: `Character part "${partLabel(part)}" has no attachment rule and may float.`
    };
  }
  if (attachment.allowFloating) {
    return {
      id: `part.${partLabel(part)}.attachment`,
      status: "warn",
      assetId: part.asset.id,
      message: `Character part "${partLabel(part)}" explicitly allows floating.`
    };
  }
  if (maxAccessoryGap !== undefined && attachment.maxGap !== undefined && attachment.maxGap > maxAccessoryGap) {
    return {
      id: `part.${partLabel(part)}.attachment-gap`,
      status: "fail",
      assetId: part.asset.id,
      message: `Character part "${partLabel(part)}" max gap ${attachment.maxGap} exceeds ${maxAccessoryGap}.`
    };
  }
  return {
    id: `part.${partLabel(part)}.attachment`,
    status: "pass",
    assetId: part.asset.id,
    message: `Character part "${partLabel(part)}" attaches to ${attachment.socket}.`
  };
}

function addCheck(
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

function partLabel(part: CharacterAssemblyPart): string {
  return part.name ?? `${part.role}:${part.asset.id}`;
}

function findPlanAttachment(plan: CharacterAssemblyPlan, part: CharacterAssemblyPart): CharacterAssemblyAttachmentRule | undefined {
  return plan.attachmentRules.find((rule) => rule.parentPartName === part.name || rule.parentRole === part.role);
}

function hasPlanAttachment(plan: CharacterAssemblyPlan, part: CharacterAssemblyPart): boolean {
  return Boolean(findPlanAttachment(plan, part));
}

function countPaletteColors(palette: CharacterAssemblyPalette | undefined): number {
  if (!palette) return 0;
  return Object.values(palette).filter(Boolean).length;
}

export const characterAssembly = {
  definePlan: defineCharacterAssemblyPlan,
  createPlan: createCharacterAssemblyPlan,
  part: characterAssemblyPart,
  validatePlan: validateCharacterAssemblyPlan,
  collectAssets: collectCharacterAssemblyAssets
} as const;
