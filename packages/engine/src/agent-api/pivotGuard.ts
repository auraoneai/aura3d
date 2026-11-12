import type { AuraSceneNode, AuraTransformSpec, AuraVec3 } from "./nodes/types.js";

/** Validate untyped scene input before it reaches a matrix or runtime state. */
export function assertValidPivot(value: unknown): asserts value is AuraVec3 | undefined {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length !== 3 ||
      !(0 in value && 1 in value && 2 in value) ||
      typeof value[0] !== "number" || !Number.isFinite(value[0]) ||
      typeof value[1] !== "number" || !Number.isFinite(value[1]) ||
      typeof value[2] !== "number" || !Number.isFinite(value[2])) {
    throw new RangeError("PIVOT_INVALID: pivot must be a finite vec3.");
  }
}

/** Call after validating an externally supplied pivot. */
export function hasNonzeroPivot(pivot: AuraVec3 | undefined): boolean {
  return pivot !== undefined && (pivot[0] !== 0 || pivot[1] !== 0 || pivot[2] !== 0);
}

/** Validate the entire authored tree before a flatten operation changes caches. */
export function assertValidPivotTree(nodes: readonly AuraSceneNode[]): void {
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i]!;
    const pivot = (node as { readonly pivot?: unknown }).pivot;
    if (pivot !== undefined) assertValidPivot(pivot);
    const instances = (node as { readonly instances?: readonly AuraTransformSpec[] }).instances;
    if (instances) {
      for (let j = 0; j < instances.length; j += 1) {
        const instPivot = instances[j]!.pivot;
        if (instPivot !== undefined) assertValidPivot(instPivot);
      }
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
  // Validate the full tree first so any malformed pivot throws PIVOT_INVALID before hierarchy errors.
  assertValidPivotTree(nodes);
  const inherited = Boolean(parentTransform.position || parentTransform.rotation || parentTransform.scale ||
    parentTransform.quaternion || parentTransform.lookAt || parentTransform.pivot);
  if (hasNonzeroPivot(parentTransform.pivot)) {
    throw new Error("PIVOT_UNSUPPORTED_LEGACY_HIERARCHY: legacy flattening cannot compose a parent pivot.");
  }
  const visit = (entries: readonly AuraSceneNode[], nested: boolean): void => {
    for (let i = 0; i < entries.length; i += 1) {
      const node = entries[i]!;
      const pivot = (node as { readonly pivot?: AuraVec3 }).pivot;
      if (pivot !== undefined && hasNonzeroPivot(pivot) && (node.kind === "group" || nested)) {
        throw new Error("PIVOT_UNSUPPORTED_LEGACY_HIERARCHY: legacy flattening cannot compose a pivoted hierarchy.");
      }
      if (nested) {
        const instances = (node as { readonly instances?: readonly AuraTransformSpec[] }).instances;
        if (instances) {
          for (let j = 0; j < instances.length; j += 1) {
            if (hasNonzeroPivot(instances[j]!.pivot)) {
              throw new Error("PIVOT_UNSUPPORTED_LEGACY_HIERARCHY: legacy flattening cannot compose a pivoted instance hierarchy.");
            }
          }
        }
      }
      if (node.kind === "group") visit(node.children, true);
    }
  };
  visit(nodes, inherited);
}
