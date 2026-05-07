import type { SelectionId } from "./Selection";

export interface HierarchyLikeNode {
  readonly id?: SelectionId;
  readonly name?: string;
  readonly visible?: boolean;
  readonly children?: readonly HierarchyLikeNode[];
}

export interface HierarchyNodeDescriptor {
  readonly id: SelectionId;
  readonly name: string;
  readonly visible: boolean;
  readonly selected: boolean;
  readonly depth: number;
  readonly childCount: number;
  readonly children: readonly HierarchyNodeDescriptor[];
}

export class HierarchyModel {
  describe(root: HierarchyLikeNode, selectedIds: ReadonlySet<SelectionId> = new Set()): HierarchyNodeDescriptor {
    return describeNode(root, selectedIds, 0, "root");
  }

  flatten(root: HierarchyLikeNode, selectedIds: ReadonlySet<SelectionId> = new Set()): readonly HierarchyNodeDescriptor[] {
    const output: HierarchyNodeDescriptor[] = [];
    const visit = (node: HierarchyNodeDescriptor): void => {
      output.push(node);
      for (const child of node.children) {
        visit(child);
      }
    };
    visit(this.describe(root, selectedIds));
    return output;
  }
}

function describeNode(
  node: HierarchyLikeNode,
  selectedIds: ReadonlySet<SelectionId>,
  depth: number,
  fallbackId: SelectionId
): HierarchyNodeDescriptor {
  const id = node.id ?? fallbackId;
  const name = node.name ?? String(id);
  const visible = node.visible ?? true;
  const children = (node.children ?? []).map((child, index) => describeNode(child, selectedIds, depth + 1, `${id}:${index}`));
  return {
    id,
    name,
    visible,
    selected: selectedIds.has(id),
    depth,
    childCount: children.length,
    children
  };
}
