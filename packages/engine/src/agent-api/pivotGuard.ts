import type { AuraSceneNode, AuraTransformSpec, AuraVec3 } from "./nodes/types.js";

/** Validate untyped scene input before it reaches a matrix or runtime state. */
export function assertValidPivot(value: unknown): asserts value is AuraVec3 | undefined {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length !== 3 ||
      !Array.from(value).every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))) {
    throw new RangeError("PIVOT_INVALID: pivot must be a finite vec3.");
  }
}

/** Call after validating an externally supplied pivot. */
export function hasNonzeroPivot(pivot: AuraVec3 | undefined): boolean {
  return pivot !== undefined && (pivot[0] !== 0 || pivot[1] !== 0 || pivot[2] !== 0);
}

/** Validate the entire authored tree before a flatten operation changes caches. */
export function assertValidPivotTree(nodes: readonly AuraSceneNode[]): void {
  for (const node of nodes) {
    if ("pivot" in node) assertValidPivot(node.pivot);
    if ("instances" in node && node.instances) {
      for (const transform of node.instances) assertValidPivot(transform.pivot);
    }
    if (node.kind === "group") assertValidPivotTree(node.children);
  }
}

/**
 * Legacy flattening adds TRS components instead of composing matrices. It
 * cannot retain a pivot through a hierarchy, so fail before lowering or firing
 * group-span callbacks. Capture/replay for the hierarchical path bypasses this
 * guard and applies its own full matrices.
 */
export function assertLegacyPivotHierarchySupported(
  nodes: readonly AuraSceneNode[],
  parentTransform: AuraTransformSpec = {}
): void {
  assertValidPivot(parentTransform.pivot);
  assertValidPivotTree(nodes);
  const inherited = Boolean(parentTransform.position || parentTransform.rotation || parentTransform.scale ||
    parentTransform.quaternion || parentTransform.lookAt || parentTransform.pivot);
  if (hasNonzeroPivot(parentTransform.pivot)) {
    throw new Error("PIVOT_UNSUPPORTED_LEGACY_HIERARCHY: legacy flattening cannot compose a parent pivot.");
  }
  const visit = (entries: readonly AuraSceneNode[], nested: boolean): void => {
    for (const node of entries) {
      const pivot = "pivot" in node ? node.pivot : undefined;
      assertValidPivot(pivot);
      if (hasNonzeroPivot(pivot) && (node.kind === "group" || nested)) {
        throw new Error("PIVOT_UNSUPPORTED_LEGACY_HIERARCHY: legacy flattening cannot compose a pivoted hierarchy.");
      }
      if ("instances" in node && node.instances) {
        for (const transform of node.instances) {
          assertValidPivot(transform.pivot);
          if (nested && hasNonzeroPivot(transform.pivot)) {
            throw new Error("PIVOT_UNSUPPORTED_LEGACY_HIERARCHY: legacy flattening cannot compose a pivoted instance hierarchy.");
          }
        }
      }
      if (node.kind === "group") visit(node.children, true);
    }
  };
  visit(nodes, inherited);
}
