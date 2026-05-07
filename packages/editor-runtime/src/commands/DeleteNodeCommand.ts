import type { Command } from "../Command";
import type { NodeContainer } from "./CreateNodeCommand";

interface SceneNodeLike {
  readonly children: SceneNodeLike[];
  parent: SceneNodeLike | null;
  addChild(child: SceneNodeLike): unknown;
  removeChild(child: SceneNodeLike): boolean;
  removeFromParent(): boolean;
  markWorldDirty?(): void;
}

export class DeleteNodeCommand<TNode> implements Command {
  readonly name = "Delete Node";
  private sceneParent: SceneNodeLike | null = null;
  private sceneIndex = -1;

  constructor(
    private readonly container: NodeContainer<TNode>,
    private readonly node: TNode
  ) {}

  execute(): void {
    const sceneNode = asSceneNode(this.node);
    if (sceneNode) {
      this.sceneParent = sceneNode.parent;
      this.sceneIndex = this.sceneParent?.children.indexOf(sceneNode) ?? -1;
      if (this.sceneParent && sceneNode.removeFromParent()) {
        return;
      }
      this.sceneParent = null;
      this.sceneIndex = -1;
    }

    this.container.remove(this.node);
  }

  undo(): void {
    const sceneNode = asSceneNode(this.node);
    if (sceneNode && this.sceneParent) {
      this.sceneParent.addChild(sceneNode);
      if (this.sceneIndex >= 0) {
        const currentIndex = this.sceneParent.children.indexOf(sceneNode);
        if (currentIndex >= 0 && currentIndex !== this.sceneIndex) {
          this.sceneParent.children.splice(currentIndex, 1);
          this.sceneParent.children.splice(Math.min(this.sceneIndex, this.sceneParent.children.length), 0, sceneNode);
          sceneNode.markWorldDirty?.();
        }
      }
      return;
    }

    this.container.add(this.node);
  }
}

function asSceneNode(value: unknown): SceneNodeLike | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as Partial<SceneNodeLike>;
  if (
    Array.isArray(candidate.children) &&
    "parent" in candidate &&
    typeof candidate.addChild === "function" &&
    typeof candidate.removeChild === "function" &&
    typeof candidate.removeFromParent === "function"
  ) {
    return candidate as SceneNodeLike;
  }

  return undefined;
}
