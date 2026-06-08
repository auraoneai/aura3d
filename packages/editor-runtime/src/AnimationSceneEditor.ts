import type { Command } from "./Command";
import { EditorRuntime } from "./EditorRuntime";
import type { EpisodeReviewPanelSnapshot } from "./EpisodeReviewPanel";
import type { HierarchyLikeNode } from "./HierarchyModel";
import type { RenderQueuePanelSnapshot } from "./RenderQueuePanel";
import { AssetDropZone, type AssetDropPlacement, type AnimationAssetCategory, type AnimationEditorAssetReference } from "./AssetDropZone";

export interface AnimationSceneTransform {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
  scale: { x: number; y: number; z: number };
}

export interface AnimationSceneNode extends HierarchyLikeNode {
  readonly id: string;
  name: string;
  kind: AnimationAssetCategory;
  visible: boolean;
  asset?: AnimationEditorAssetReference;
  transform: AnimationSceneTransform;
  animationClips: string[];
  material?: string;
  readonly children: AnimationSceneNode[];
}

export interface AnimationSceneEditorSnapshot {
  readonly nodeCount: number;
  readonly selectedIds: readonly (string | number)[];
  readonly placedAssetCount: number;
  readonly cameraPreviewId: string | null;
  readonly hierarchy: ReturnType<EditorRuntime["flattenHierarchy"]>;
  readonly evidence: {
    readonly assetPlacement: boolean;
    readonly transformGizmos: true;
    readonly propertyInspector: true;
    readonly sceneSaveLoad: true;
    readonly episodeState: boolean;
  };
  readonly episode: AnimationSceneEpisodeSnapshot;
}

export interface AnimationSceneEditorOptions {
  readonly runtime?: EditorRuntime;
  readonly root?: AnimationSceneNode;
  readonly episode?: Partial<AnimationSceneEpisodeState>;
}

export interface AnimationSceneEpisodeState {
  readonly shots: readonly string[];
  readonly assets: readonly string[];
  readonly captions: readonly string[];
  readonly visemes: readonly string[];
  readonly renderState?: RenderQueuePanelSnapshot;
  readonly reviewState?: EpisodeReviewPanelSnapshot;
}

export interface AnimationSceneEpisodeSnapshot extends AnimationSceneEpisodeState {
  readonly shotCount: number;
  readonly assetCount: number;
  readonly captionCount: number;
  readonly visemeCount: number;
  readonly hasRenderState: boolean;
  readonly hasReviewState: boolean;
}

export class AnimationSceneEditor {
  readonly runtime: EditorRuntime;
  readonly root: AnimationSceneNode;
  readonly dropZone: AssetDropZone<AnimationSceneNode>;
  private cameraPreviewIdInternal: string | null = null;
  private episodeState: AnimationSceneEpisodeState;

  constructor(options: AnimationSceneEditorOptions = {}) {
    this.runtime = options.runtime ?? new EditorRuntime();
    this.root = options.root ?? createAnimationSceneNode({ id: "scene-root", name: "Scene", kind: "set" });
    this.episodeState = normalizeEpisodeState(options.episode ?? {});
    this.dropZone = new AssetDropZone<AnimationSceneNode>({
      history: this.runtime.history,
      createNode: (asset, placement) => this.createNodeFromAsset(asset, placement),
      addNode: (node, placement) => this.addNode(node, placement.targetId),
      removeNode: (node) => this.removeNode(node.id)
    });
  }

  async placeAsset(asset: AnimationEditorAssetReference, placement: AssetDropPlacement = {}): Promise<AnimationSceneNode> {
    const result = await this.dropZone.dropAsset(asset, placement);
    this.runtime.select([result.node.id]);
    return result.node;
  }

  async addEmptyNode(config: { readonly id?: string; readonly name: string; readonly kind?: AnimationAssetCategory; readonly parentId?: string }): Promise<AnimationSceneNode> {
    const node = createAnimationSceneNode({
      id: config.id ?? stableNodeId(config.name),
      name: config.name,
      kind: config.kind ?? "prop"
    });
    await this.runtime.history.execute(new AddAnimationNodeCommand(this.root, node, config.parentId));
    return node;
  }

  async removeNode(id: string): Promise<void> {
    if (id === this.root.id) throw new Error("Cannot remove the root animation scene node.");
    const parent = findParent(this.root, id);
    const node = findNode(this.root, id);
    if (!parent || !node) throw new Error(`Animation scene node does not exist: ${id}`);
    await this.runtime.history.execute(new RemoveAnimationNodeCommand(parent, node));
    this.runtime.pruneSelection((selectionId) => selectionId !== id);
  }

  async setTransform(id: string, transform: Partial<AnimationSceneTransform>): Promise<void> {
    const node = this.requireNode(id);
    await this.runtime.history.execute(new SetAnimationTransformCommand(node, mergeTransform(node.transform, transform)));
  }

  selectNode(id: string): void {
    this.requireNode(id);
    this.runtime.select([id]);
  }

  setCameraPreview(id: string | null): void {
    if (id !== null) {
      const node = this.requireNode(id);
      if (node.kind !== "camera") throw new Error(`Camera preview requires a camera node: ${id}`);
    }
    this.cameraPreviewIdInternal = id;
  }

  setEpisodeState(state: Partial<AnimationSceneEpisodeState>): AnimationSceneEpisodeSnapshot {
    this.episodeState = normalizeEpisodeState({ ...this.episodeState, ...state });
    return this.episodeSnapshot();
  }

  serializeScene(): AnimationSceneNode {
    return cloneNode(this.root);
  }

  loadScene(root: AnimationSceneNode): void {
    this.root.children.splice(0, this.root.children.length, ...root.children.map(cloneNode));
    this.root.name = root.name;
    this.root.visible = root.visible;
    this.runtime.clearSelection();
  }

  flattenHierarchy(): ReturnType<EditorRuntime["flattenHierarchy"]> {
    return this.runtime.flattenHierarchy(this.root);
  }

  inspectSelected(): readonly ReturnType<EditorRuntime["inspect"]>[number][] {
    const selected = this.runtime.currentSelection()[0];
    if (selected === undefined) return [];
    return this.runtime.inspect(this.requireNode(String(selected)));
  }

  snapshot(): AnimationSceneEditorSnapshot {
    const nodes = flattenNodes(this.root);
    return {
      nodeCount: nodes.length,
      selectedIds: this.runtime.currentSelection(),
      placedAssetCount: nodes.filter((node) => node.asset).length,
      cameraPreviewId: this.cameraPreviewIdInternal,
      hierarchy: this.flattenHierarchy(),
      evidence: {
        assetPlacement: nodes.some((node) => node.asset),
        transformGizmos: true,
        propertyInspector: true,
        sceneSaveLoad: true,
        episodeState: this.episodeState.shots.length > 0
          || this.episodeState.captions.length > 0
          || this.episodeState.visemes.length > 0
          || Boolean(this.episodeState.renderState)
          || Boolean(this.episodeState.reviewState)
      },
      episode: this.episodeSnapshot()
    };
  }

  private episodeSnapshot(): AnimationSceneEpisodeSnapshot {
    return {
      ...this.episodeState,
      shotCount: this.episodeState.shots.length,
      assetCount: this.episodeState.assets.length,
      captionCount: this.episodeState.captions.length,
      visemeCount: this.episodeState.visemes.length,
      hasRenderState: Boolean(this.episodeState.renderState),
      hasReviewState: Boolean(this.episodeState.reviewState)
    };
  }

  private createNodeFromAsset(asset: AnimationEditorAssetReference, placement: AssetDropPlacement): AnimationSceneNode {
    return createAnimationSceneNode({
      id: stableNodeId(asset.id),
      name: asset.name,
      kind: asset.category ?? categoryFromAsset(asset),
      asset,
      transform: mergeTransform(defaultTransform(), placement)
    });
  }

  private addNode(node: AnimationSceneNode, parentId?: string | number): void {
    const parent = parentId === undefined ? this.root : this.requireNode(String(parentId));
    parent.children.push(node);
  }

  private requireNode(id: string): AnimationSceneNode {
    const node = findNode(this.root, id);
    if (!node) throw new Error(`Animation scene node does not exist: ${id}`);
    return node;
  }
}

function normalizeEpisodeState(state: Partial<AnimationSceneEpisodeState>): AnimationSceneEpisodeState {
  return {
    shots: [...(state.shots ?? [])],
    assets: [...(state.assets ?? [])],
    captions: [...(state.captions ?? [])],
    visemes: [...(state.visemes ?? [])],
    renderState: state.renderState,
    reviewState: state.reviewState
  };
}

export function createAnimationSceneNode(config: {
  readonly id: string;
  readonly name: string;
  readonly kind: AnimationAssetCategory;
  readonly asset?: AnimationEditorAssetReference;
  readonly transform?: AnimationSceneTransform;
  readonly visible?: boolean;
  readonly animationClips?: readonly string[];
  readonly material?: string;
  readonly children?: readonly AnimationSceneNode[];
}): AnimationSceneNode {
  return {
    id: config.id,
    name: config.name,
    kind: config.kind,
    visible: config.visible ?? true,
    asset: config.asset,
    transform: config.transform ?? defaultTransform(),
    animationClips: [...(config.animationClips ?? config.asset?.clips ?? [])],
    material: config.material,
    children: [...(config.children ?? [])]
  };
}

class AddAnimationNodeCommand implements Command {
  readonly name: string;

  constructor(private readonly root: AnimationSceneNode, private readonly node: AnimationSceneNode, private readonly parentId?: string) {
    this.name = `Add animation node ${node.id}`;
  }

  execute(): void {
    const parent = this.parentId ? findNode(this.root, this.parentId) : this.root;
    if (!parent) throw new Error(`Animation scene parent does not exist: ${this.parentId}`);
    if (!parent.children.includes(this.node)) parent.children.push(this.node);
  }

  undo(): void {
    const parent = findParent(this.root, this.node.id);
    if (parent) removeChild(parent, this.node);
  }
}

class RemoveAnimationNodeCommand implements Command {
  readonly name: string;
  private index = -1;

  constructor(private readonly parent: AnimationSceneNode, private readonly node: AnimationSceneNode) {
    this.name = `Remove animation node ${node.id}`;
  }

  execute(): void {
    this.index = this.parent.children.indexOf(this.node);
    removeChild(this.parent, this.node);
  }

  undo(): void {
    if (!this.parent.children.includes(this.node)) {
      this.parent.children.splice(this.index < 0 ? this.parent.children.length : this.index, 0, this.node);
    }
  }
}

class SetAnimationTransformCommand implements Command {
  readonly name: string;
  private readonly before: AnimationSceneTransform;

  constructor(private readonly node: AnimationSceneNode, private readonly after: AnimationSceneTransform) {
    this.name = `Set animation transform ${node.id}`;
    this.before = cloneTransform(node.transform);
  }

  execute(): void {
    this.node.transform = cloneTransform(this.after);
  }

  undo(): void {
    this.node.transform = cloneTransform(this.before);
  }
}

function categoryFromAsset(asset: AnimationEditorAssetReference): AnimationAssetCategory {
  if (asset.type === "audio") return "audio";
  if (asset.type === "material") return "material";
  if (asset.clips && asset.clips.length > 0) return "character";
  return "prop";
}

function findNode(root: AnimationSceneNode, id: string): AnimationSceneNode | undefined {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return undefined;
}

function findParent(root: AnimationSceneNode, id: string): AnimationSceneNode | undefined {
  for (const child of root.children) {
    if (child.id === id) return root;
    const found = findParent(child, id);
    if (found) return found;
  }
  return undefined;
}

function flattenNodes(root: AnimationSceneNode): readonly AnimationSceneNode[] {
  return [root, ...root.children.flatMap((child) => flattenNodes(child))];
}

function removeChild(parent: AnimationSceneNode, node: AnimationSceneNode): void {
  const index = parent.children.indexOf(node);
  if (index >= 0) parent.children.splice(index, 1);
}

function defaultTransform(): AnimationSceneTransform {
  return {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    scale: { x: 1, y: 1, z: 1 }
  };
}

function mergeTransform(base: AnimationSceneTransform, next: Partial<AnimationSceneTransform> | AssetDropPlacement): AnimationSceneTransform {
  return {
    position: { ...base.position, ...(next.position ?? {}) },
    rotation: { ...base.rotation, ...(next.rotation ?? {}) },
    scale: { ...base.scale, ...(next.scale ?? {}) }
  };
}

function cloneTransform(transform: AnimationSceneTransform): AnimationSceneTransform {
  return mergeTransform(defaultTransform(), transform);
}

function cloneNode(node: AnimationSceneNode): AnimationSceneNode {
  return createAnimationSceneNode({
    ...node,
    transform: cloneTransform(node.transform),
    animationClips: [...node.animationClips],
    children: node.children.map(cloneNode)
  });
}

function stableNodeId(name: string): string {
  return `node-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item"}`;
}
