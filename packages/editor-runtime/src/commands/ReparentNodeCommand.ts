import type { Command } from "../Command";

interface ParentLike<TNode> {
  readonly children: TNode[];
  addChild(child: TNode): unknown;
  removeChild(child: TNode): boolean;
}

interface ChildLike<TNode> {
  parent: ParentLike<TNode> | null;
  markWorldDirty?(): void;
}

export class ReparentNodeCommand<TNode extends ChildLike<TNode>> implements Command {
  readonly name = "Reparent Node";
  private readonly oldParent: ParentLike<TNode> | null;
  private readonly oldIndex: number;
  private readonly newIndex: number;

  constructor(
    private readonly node: TNode,
    private readonly newParent: ParentLike<TNode>,
    newIndex?: number
  ) {
    this.oldParent = node.parent;
    this.oldIndex = this.oldParent?.children.indexOf(node) ?? -1;
    this.newIndex = newIndex ?? newParent.children.length;
  }

  execute(): void {
    this.move(this.newParent, this.newIndex);
  }

  undo(): void {
    if (!this.oldParent) {
      this.node.parent?.removeChild(this.node);
      return;
    }
    this.move(this.oldParent, this.oldIndex);
  }

  private move(parent: ParentLike<TNode>, index: number): void {
    if (this.node.parent !== parent) {
      this.node.parent?.removeChild(this.node);
      parent.addChild(this.node);
    }
    const currentIndex = parent.children.indexOf(this.node);
    const targetIndex = Math.max(0, Math.min(index, parent.children.length - 1));
    if (currentIndex >= 0 && currentIndex !== targetIndex) {
      parent.children.splice(currentIndex, 1);
      parent.children.splice(targetIndex, 0, this.node);
      this.node.markWorldDirty?.();
    }
  }
}
