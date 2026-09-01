/**
 * Mech Hangar assembly — characterAssembly plans become mounted runtime models.
 *
 * The pipeline the PRD pitches is player-visible here: selected catalog parts build a
 * typed character assembly plan, the engine validates it (validateCharacterAssemblyPlan),
 * and only a validated plan is allowed to mount. Parts are rigid attachments positioned
 * from authored socket rules plus each part's manifest bounds — no skinning, no fake
 * parenting: every part is its own typed GLB node driven by this module each frame.
 */
import {
  characterAssembly,
  type AuraAssetRef,
  type CharacterAssemblyPlan,
  type CharacterAssemblyValidationReport
} from "@aura3d/engine";
import { resolvePartAsset, selectedParts, type BuildSelection, type PartDef } from "./parts-catalog";

/**
 * MH-2M authored mount envelope (metres). The sixteen in-repo parts already
 * share this scale; the small fit correction only absorbs intentional variant
 * silhouette differences and never normalizes unrelated catalog models.
 */
const MOUNT_TARGETS = {
  chassis: { targetHeight: 1.05 },
  // Keep the largest arm variant inside the authored 2.2 m mech envelope;
  // the visual arena does not need an oversized attachment to read the hit.
  arms: { targetMaxDimension: 2.18 },
  legs: { targetHeight: 0.84 },
  weapon: { targetMaxDimension: 1.25 }
} as const;

export interface ScaledPartPlacement {
  readonly part: PartDef;
  /** Uniform scale applied by the model builder's fit mode. */
  readonly fitScale: number;
  readonly scaledSize: readonly [number, number, number];
}

export function scaledPlacement(part: PartDef): ScaledPartPlacement {
  const maxDim = Math.max(part.bounds[0], part.bounds[1], part.bounds[2]) || 1;
  if (part.slot === "chassis") {
    const fitScale = MOUNT_TARGETS.chassis.targetHeight / Math.max(0.001, part.bounds[1]);
    return { part, fitScale, scaledSize: scale3(part.bounds, fitScale) };
  }
  if (part.slot === "legs") {
    const fitScale = MOUNT_TARGETS.legs.targetHeight / Math.max(0.001, part.bounds[1]);
    return { part, fitScale, scaledSize: scale3(part.bounds, fitScale) };
  }
  const target = part.slot === "arms" ? MOUNT_TARGETS.arms.targetMaxDimension : MOUNT_TARGETS.weapon.targetMaxDimension;
  const fitScale = target / maxDim;
  return { part, fitScale, scaledSize: scale3(part.bounds, fitScale) };
}

function scale3(bounds: readonly number[], k: number): [number, number, number] {
  return [(bounds[0] ?? 1) * k, (bounds[1] ?? 1) * k, (bounds[2] ?? 1) * k];
}

/**
 * Build + validate a character assembly plan for the current selection.
 *
 * This is the gate: an invalid plan (missing attachment rule, bad scale, untyped ref)
 * reports ready=false and the route refuses to mount or lock in.
 */
export function buildMechAssemblyPlan(
  exportName: string,
  selection: BuildSelection,
  resolve: (assetKey: string) => AuraAssetRef<"model"> | undefined = resolvePartAsset
): { plan: CharacterAssemblyPlan; report: CharacterAssemblyValidationReport } | { error: string } {
  const [chassis, arms, legs, weapon] = selectedParts(selection);
  for (const part of [chassis, arms, legs, weapon]) {
    if (!resolve(part.assetKey)) return { error: "missing typed asset for " + part.assetKey };
  }
  const chassisAsset = resolve(chassis.assetKey)!;
  const plan = characterAssembly.createPlan({
    exportName,
    baseBody: {
      role: "base-body",
      asset: chassisAsset,
      name: chassis.assetKey,
      required: true
    },
    parts: [
      {
        role: arms.assemblyRole === "accessory" ? "accessory" : arms.assemblyRole,
        asset: resolve(arms.assetKey)!,
        name: arms.assetKey,
        attachment: { socket: arms.socket === "chest" ? "chest" : "chest" }
      },
      {
        role: legs.assemblyRole === "shoes" ? "shoes" : legs.assemblyRole,
        asset: resolve(legs.assetKey)!,
        name: legs.assetKey,
        attachment: { socket: legs.socket === "hips" ? "hips" : "hips" }
      },
      {
        role: "weapon",
        asset: resolve(weapon.assetKey)!,
        name: weapon.assetKey,
        attachment: { socket: weapon.socket === "right-hand" ? "right-hand" : "right-hand" }
      }
    ],
    orientation: { upAxis: "y", forwardAxis: "z", pivot: "feet" },
    gameplay: { collisionPreset: "fighter", animationProfile: "fighter", routeUsage: ["apps/showcase-mech-hangar"] },
    notes: ["Mech Hangar hangar-to-arena build; rigid socket attachments, no skeletal retarget."]
  });
  const report = characterAssembly.validatePlan(plan);
  return { plan, report };
}

/**
 * Authored socket placement (mech-local space, mech facing +x after yaw).
 *
 * The values derive from each part's manifest bounds via scaledPlacement, so swapping
 * a part moves the sockets with it instead of hardcoding pixels. Legs stand on y=0,
 * the hull rides on the leg tops, arms sit at chest height on the hull face, and the
 * weapon hangs off the right shoulder line.
 */
export function localOffsetForPart(scaled: ScaledPartPlacement, all: readonly ScaledPartPlacement[]): readonly [number, number, number] {
  const chassis = all.find((entry) => entry.part.slot === "chassis");
  const arms = all.find((entry) => entry.part.slot === "arms");
  const legs = all.find((entry) => entry.part.slot === "legs");
  const legTop = ((legs?.scaledSize[1] ?? 0.6) * 0.88);
  switch (scaled.part.slot) {
    case "chassis":
      return [0, legTop + (scaled.scaledSize[1] ?? 1) / 2, 0];
    case "legs":
      return [0, (scaled.scaledSize[1] ?? 0.6) / 2 - 0.02, 0];
    case "arms":
      return [0, legTop + (chassis?.scaledSize[1] ?? 1) * 0.58, (chassis?.scaledSize[2] ?? 1) * 0.06];
    case "weapon":
      return [
        (arms?.scaledSize[0] ?? 1.8) * 0.43,
        legTop + (chassis?.scaledSize[1] ?? 1) * 0.43,
        (chassis?.scaledSize[2] ?? 0.65) * 0.12
      ];
    default:
      return [0, 0, 0];
  }
}

/** Every MH-2M source is authored +Z-forward; the root yaw turns the whole mech. */
export const SLOT_YAW_OFFSET: Readonly<Record<PartDef["slot"], number>> = {
  chassis: 0,
  arms: 0,
  legs: 0,
  weapon: 0
};

export interface MountTransform {
  readonly position: readonly [number, number, number];
  readonly yaw: number;
}

/**
 * World transform for one mounted part given the mech root position/yaw.
 * Mech-local offsets rotate around Y so the whole build turns as one machine.
 */
export function mountTransformForPart(
  part: PartDef,
  selectionParts: readonly PartDef[],
  rootPosition: readonly [number, number, number],
  yaw: number
): MountTransform {
  const placements = selectionParts.map((entry) => scaledPlacement(entry));
  const scaled = placements.find((entry) => entry.part.slot === part.slot) ?? placements[0]!;
  const local = localOffsetForPart(scaled, placements);
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return {
    position: [
      rootPosition[0] + local[0] * cos + local[2] * sin,
      rootPosition[1] + local[1],
      rootPosition[2] - local[0] * sin + local[2] * cos
    ],
    yaw: yaw + SLOT_YAW_OFFSET[part.slot]
  };
}

/** Evidence-facing summary of a validation report. */
export function validationSummary(report: CharacterAssemblyValidationReport) {
  return {
    ready: report.ready,
    status: report.summary.status,
    totalParts: report.summary.totalParts,
    attachedParts: report.summary.attachedParts,
    errors: report.summary.errors,
    warnings: report.summary.warnings,
    failingChecks: report.issues.filter((issue) => issue.severity === "error").map((issue) => issue.code)
  };
}
