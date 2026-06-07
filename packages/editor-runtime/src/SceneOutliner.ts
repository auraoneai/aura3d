import { HierarchyModel, type HierarchyNodeDescriptor } from "./HierarchyModel";
import type { SelectionId } from "./Selection";
import type { CartoonSceneNode } from "./CartoonSceneEditor";

export interface SceneOutlinerItem extends HierarchyNodeDescriptor {
  readonly icon: string;
  readonly kind: string;
}

export interface SceneOutlinerOptions {
  readonly selectedIds?: ReadonlySet<SelectionId>;
  readonly onSelect?: (id: SelectionId) => void;
}

export class SceneOutliner {
  private readonly hierarchy = new HierarchyModel();
  private disposers: (() => void)[] = [];

  describe(root: CartoonSceneNode, selectedIds: ReadonlySet<SelectionId> = new Set()): readonly SceneOutlinerItem[] {
    return this.hierarchy.flatten(root, selectedIds).map((item) => {
      const node = findNode(root, String(item.id));
      const kind = node?.kind ?? "unknown";
      return {
        ...item,
        kind,
        icon: iconForKind(kind)
      };
    });
  }

  render(root: CartoonSceneNode, container: HTMLElement, options: SceneOutlinerOptions = {}): readonly SceneOutlinerItem[] {
    this.dispose();
    const items = this.describe(root, options.selectedIds);
    container.replaceChildren();
    const documentRef = container.ownerDocument;
    for (const item of items) {
      const row = documentRef.createElement("button");
      row.type = "button";
      row.className = "aura-scene-outliner__item";
      row.dataset.nodeId = String(item.id);
      row.dataset.kind = item.kind;
      row.dataset.selected = String(item.selected);
      row.style.paddingLeft = `${item.depth * 14}px`;
      row.textContent = `${item.icon} ${item.name}`;
      const click = (): void => options.onSelect?.(item.id);
      row.addEventListener("click", click);
      this.disposers.push(() => row.removeEventListener("click", click));
      container.append(row);
    }
    return items;
  }

  dispose(): void {
    for (const dispose of this.disposers.splice(0)) dispose();
  }
}

function iconForKind(kind: string): string {
  switch (kind) {
    case "character": return "[CHAR]";
    case "set": return "[SET]";
    case "prop": return "[PROP]";
    case "camera": return "[CAM]";
    case "light": return "[LIGHT]";
    case "audio": return "[AUD]";
    case "material": return "[MAT]";
    default: return "[NODE]";
  }
}

function findNode(root: CartoonSceneNode, id: string): CartoonSceneNode | undefined {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return undefined;
}
