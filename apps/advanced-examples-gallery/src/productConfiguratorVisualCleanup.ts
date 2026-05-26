import type { RenderItem } from "@aura3d/rendering";
import type { Mat4 } from "@aura3d/scene";
import {
  focusPartForProductConfiguratorImportedLabel,
  isProductConfiguratorHotspotCandidateLabel,
  isProductConfiguratorProceduralArtifactLabel,
  type ProductConfiguratorFocusPart,
  type ProductConfiguratorHotspotTarget
} from "./productConfiguratorPolicy";

export {
  PRODUCT_CONFIGURATOR_AUTHORED_SYSTEMS,
  PRODUCT_CONFIGURATOR_DIAGNOSTIC_LABELS,
  PRODUCT_CONFIGURATOR_ROUTE_ID,
  PRODUCT_CONFIGURATOR_ROUTE_LIMITATIONS,
  PRODUCT_CONFIGURATOR_SCENEBUILDER_PATCH_POINTS,
  type ProductConfiguratorFocusPart,
  type ProductConfiguratorHotspotTarget
} from "./productConfiguratorPolicy";

interface ProductConfiguratorFrameLike {
  readonly items: readonly { readonly label?: string }[];
}

export function removeProductConfiguratorProceduralArtifacts<TFrame extends ProductConfiguratorFrameLike>(frame: TFrame): TFrame {
  return {
    ...frame,
    items: frame.items.filter((item) => {
      const label = typeof item.label === "string" ? item.label : "";
      return !isProductConfiguratorProceduralArtifactLabel(label);
    })
  } as TFrame;
}

export function collectProductConfiguratorHotspotTargets(
  items: readonly RenderItem[],
  viewProjectionMatrix: Mat4
): readonly ProductConfiguratorHotspotTarget[] {
  const targets: ProductConfiguratorHotspotTarget[] = [];
  const seen = new Set<ProductConfiguratorFocusPart>();
  for (const item of items) {
    const label = typeof item.label === "string" ? item.label : "";
    if (!isProductConfiguratorHotspotCandidateLabel(label)) continue;
    const focusPart = focusPartForProductConfiguratorImportedLabel(label);
    if (!focusPart || seen.has(focusPart)) continue;
    const modelMatrix = item.modelMatrix;
    if (!modelMatrix || modelMatrix.length < 16) continue;
    const projected = projectModelOrigin(modelMatrix, viewProjectionMatrix);
    if (!projected || projected.x < -0.08 || projected.x > 1.08 || projected.y < -0.08 || projected.y > 1.08) continue;
    seen.add(focusPart);
    targets.push({
      focusPart,
      label,
      x: projected.x,
      y: projected.y,
      depth: projected.depth
    });
  }
  return targets.sort((left, right) => left.depth - right.depth);
}

export function pickProductConfiguratorHotspotTarget(
  pointer: { readonly x: number; readonly y: number },
  targets: readonly ProductConfiguratorHotspotTarget[],
  maxDistance = 0.105
): ProductConfiguratorHotspotTarget | undefined {
  let best: { readonly target: ProductConfiguratorHotspotTarget; readonly distance: number } | undefined;
  for (const target of targets) {
    const distance = Math.hypot(target.x - pointer.x, target.y - pointer.y);
    if (distance > maxDistance) continue;
    if (!best || distance < best.distance) best = { target, distance };
  }
  return best?.target;
}

function projectModelOrigin(
  modelMatrix: Float32Array | readonly number[],
  viewProjectionMatrix: Mat4
): { readonly x: number; readonly y: number; readonly depth: number } | undefined {
  const x = Number(modelMatrix[12] ?? 0);
  const y = Number(modelMatrix[13] ?? 0);
  const z = Number(modelMatrix[14] ?? 0);
  const m = viewProjectionMatrix;
  const clipX = m[0] * x + m[4] * y + m[8] * z + m[12];
  const clipY = m[1] * x + m[5] * y + m[9] * z + m[13];
  const clipZ = m[2] * x + m[6] * y + m[10] * z + m[14];
  const clipW = m[3] * x + m[7] * y + m[11] * z + m[15];
  if (!Number.isFinite(clipW) || Math.abs(clipW) < 0.00001) return undefined;
  const ndcX = clipX / clipW;
  const ndcY = clipY / clipW;
  const ndcZ = clipZ / clipW;
  if (![ndcX, ndcY, ndcZ].every(Number.isFinite)) return undefined;
  return {
    x: ndcX * 0.5 + 0.5,
    y: 0.5 - ndcY * 0.5,
    depth: ndcZ
  };
}
