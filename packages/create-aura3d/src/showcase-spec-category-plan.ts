import type { ShowcaseCategoryPlan, ShowcaseCategoryPlanKind, ShowcaseSpec } from "./showcase-spec-types.js";

interface CategoryCameraSpec {
  readonly position: string;
  readonly target: string;
  readonly fov: number;
  readonly targetMaxDimension: number;
  readonly evidenceMargin: number;
  readonly y: number;
  readonly z: number;
}

export function compileCategoryPlanBlockers(spec: ShowcaseSpec): readonly string[] {
  const plan = spec.categoryPlan;
  if (!plan) return [];
  const blockers: string[] = [];
  if (!spec.primaryAssets.some((asset) => asset.id === plan.primaryAsset)) blockers.push(`category:${plan.kind}:primary-missing:${plan.primaryAsset}`);
  if (plan.primaryAsset !== spec.layout.heroAsset) blockers.push(`category:${plan.kind}:hero-mismatch`);
  if (!plan.layoutConstraints.keepHeroReadable) blockers.push(`category:${plan.kind}:hero-readability-not-required`);
  if (!plan.layoutConstraints.uiAvoidsEvidenceArea) blockers.push(`category:${plan.kind}:ui-can-occlude-evidence`);
  if (plan.kind === "particle-diagnostic" && hasUnsupportedCapability(spec, "native-webgpu")) {
    blockers.push("diagnostic:native-webgpu-unproven");
  }
  return blockers;
}

export function isSupportedCategoryPlanKind(value: string): value is ShowcaseCategoryPlanKind {
  return value === "architecture-environment" ||
    value === "industrial-digital-twin" ||
    value === "particle-diagnostic" ||
    value === "data-diagnostic";
}

export function cameraForCategoryPlan(plan: ShowcaseCategoryPlan): CategoryCameraSpec {
  switch (plan.cameraIntent) {
    case "architecture-hero":
      return { position: "[0, 1.55, 5.8]", target: "[0, 0.9, -0.6]", fov: 30, targetMaxDimension: 2.2, evidenceMargin: 0.18, y: 0.2, z: -0.6 };
    case "industrial-overview":
      return { position: "[2.25, 2.1, 4.9]", target: "[-0.25, 0.82, -0.45]", fov: 35, targetMaxDimension: 1.6, evidenceMargin: 0.16, y: 0.12, z: -0.45 };
    case "diagnostic-core":
      return { position: "[0, 1.12, 4.8]", target: "[0, 0.52, -0.72]", fov: 30, targetMaxDimension: 1.45, evidenceMargin: 0.2, y: 0.2, z: -0.72 };
    case "data-observatory":
      return { position: "[0.16, 1.22, 4.75]", target: "[0, 0.54, -0.2]", fov: 32, targetMaxDimension: 1.55, evidenceMargin: 0.22, y: 0.18, z: -0.2 };
    default:
      return assertNever(plan.cameraIntent);
  }
}

function hasUnsupportedCapability(spec: ShowcaseSpec, name: string): boolean {
  return spec.capabilities.some((capability) => capability.name === name && capability.status === "unsupported");
}

function assertNever(value: never): never {
  throw new Error(`unsupported category camera intent ${value}`);
}
