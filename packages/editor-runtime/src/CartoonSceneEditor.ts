import type { Command } from "./Command";
import { EditorRuntime } from "./EditorRuntime";
import type { EpisodeReviewPanelSnapshot } from "./EpisodeReviewPanel";
import type { HierarchyLikeNode } from "./HierarchyModel";
import type { RenderQueuePanelSnapshot } from "./RenderQueuePanel";
import { AssetDropZone, type AssetDropPlacement, type CartoonAssetCategory, type CartoonEditorAssetReference } from "./AssetDropZone";

export interface CartoonSceneTransform {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
  scale: { x: number; y: number; z: number };
}

export interface CartoonSceneNode extends HierarchyLikeNode {
  readonly id: string;
  name: string;
  kind: CartoonAssetCategory;
  visible: boolean;
  asset?: CartoonEditorAssetReference;
  transform: CartoonSceneTransform;
  animationClips: string[];
  material?: string;
  readonly children: CartoonSceneNode[];
}

export interface CartoonSceneEditorSnapshot {
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
  readonly episode: CartoonSceneEpisodeSnapshot;
}

export interface CartoonSceneEditorOptions {
  readonly runtime?: EditorRuntime;
  readonly root?: CartoonSceneNode;
  readonly episode?: Partial<CartoonSceneEpisodeState>;
}

export interface CartoonSceneEpisodeState {
  readonly shots: readonly string[];
  readonly assets: readonly string[];
  readonly captions: readonly string[];
  readonly visemes: readonly string[];
  readonly renderState?: RenderQueuePanelSnapshot;
  readonly reviewState?: EpisodeReviewPanelSnapshot;
}

export interface CartoonSceneEpisodeSnapshot extends CartoonSceneEpisodeState {
  readonly shotCount: number;
  readonly assetCount: number;
  readonly captionCount: number;
  readonly visemeCount: number;
  readonly hasRenderState: boolean;
  readonly hasReviewState: boolean;
}

export class CartoonSceneEditor {
  readonly runtime: EditorRuntime;
  readonly root: CartoonSceneNode;
  readonly dropZone: AssetDropZone<CartoonSceneNode>;
  private cameraPreviewIdInternal: string | null = null;
  private episodeState: CartoonSceneEpisodeState;

  constructor(options: CartoonSceneEditorOptions = {}) {
    this.runtime = options.runtime ?? new EditorRuntime();
    this.root = options.root ?? createCartoonSceneNode({ id: "scene-root", name: "Scene", kind: "set" });
    this.episodeState = normalizeEpisodeState(options.episode ?? {});
    this.dropZone = new AssetDropZone<CartoonSceneNode>({
      history: this.runtime.history,
      createNode: (asset, placement) => this.createNodeFromAsset(asset, placement),
      addNode: (node, placement) => this.addNode(node, placement.targetId),
      removeNode: (node) => this.removeNode(node.id)
    });
  }

  async placeAsset(asset: CartoonEditorAssetReference, placement: AssetDropPlacement = {}): Promise<CartoonSceneNode> {
    const result = await this.dropZone.dropAsset(asset, placement);
    this.runtime.select([result.node.id]);
    return result.node;
  }

  async addEmptyNode(config: { readonly id?: string; readonly name: string; readonly kind?: CartoonAssetCategory; readonly parentId?: string }): Promise<CartoonSceneNode> {
    const node = createCartoonSceneNode({
      id: config.id ?? stableNodeId(config.name),
      name: config.name,
      kind: config.kind ?? "prop"
    });
    await this.runtime.history.execute(new AddCartoonNodeCommand(this.root, node, config.parentId));
    return node;
  }

  async removeNode(id: string): Promise<void> {
    if (id === this.root.id) throw new Error("Cannot remove the root cartoon scene node.");
    const parent = findParent(this.root, id);
    const node = findNode(this.root, id);
    if (!parent || !node) throw new Error(`Cartoon scene node does not exist: ${id}`);
    await this.runtime.history.execute(new RemoveCartoonNodeCommand(parent, node));
    this.runtime.pruneSelection((selectionId) => selectionId !== id);
  }

  async setTransform(id: string, transform: Partial<CartoonSceneTransform>): Promise<void> {
    const node = this.requireNode(id);
    await this.runtime.history.execute(new SetCartoonTransformCommand(node, mergeTransform(node.transform, transform)));
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

  setEpisodeState(state: Partial<CartoonSceneEpisodeState>): CartoonSceneEpisodeSnapshot {
    this.episodeState = normalizeEpisodeState({ ...this.episodeState, ...state });
    return this.episodeSnapshot();
  }

  serializeScene(): CartoonSceneNode {
    return cloneNode(this.root);
  }

  loadScene(root: CartoonSceneNode): void {
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

  snapshot(): CartoonSceneEditorSnapshot {
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

  private episodeSnapshot(): CartoonSceneEpisodeSnapshot {
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

  private createNodeFromAsset(asset: CartoonEditorAssetReference, placement: AssetDropPlacement): CartoonSceneNode {
    return createCartoonSceneNode({
      id: stableNodeId(asset.id),
      name: asset.name,
      kind: asset.category ?? categoryFromAsset(asset),
      asset,
      transform: mergeTransform(defaultTransform(), placement)
    });
  }

  private addNode(node: CartoonSceneNode, parentId?: string | number): void {
    const parent = parentId === undefined ? this.root : this.requireNode(String(parentId));
    parent.children.push(node);
  }

  private requireNode(id: string): CartoonSceneNode {
    const node = findNode(this.root, id);
    if (!node) throw new Error(`Cartoon scene node does not exist: ${id}`);
    return node;
  }
}

function normalizeEpisodeState(state: Partial<CartoonSceneEpisodeState>): CartoonSceneEpisodeState {
  return {
    shots: [...(state.shots ?? [])],
    assets: [...(state.assets ?? [])],
    captions: [...(state.captions ?? [])],
    visemes: [...(state.visemes ?? [])],
    renderState: state.renderState,
    reviewState: state.reviewState
  };
}

export function createCartoonSceneNode(config: {
  readonly id: string;
  readonly name: string;
  readonly kind: CartoonAssetCategory;
  readonly asset?: CartoonEditorAssetReference;
  readonly transform?: CartoonSceneTransform;
  readonly visible?: boolean;
  readonly animationClips?: readonly string[];
  readonly material?: string;
  readonly children?: readonly CartoonSceneNode[];
}): CartoonSceneNode {
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

class AddCartoonNodeCommand implements Command {
  readonly name: string;

  constructor(private readonly root: CartoonSceneNode, private readonly node: CartoonSceneNode, private readonly parentId?: string) {
    this.name = `Add cartoon node ${node.id}`;
  }

  execute(): void {
    const parent = this.parentId ? findNode(this.root, this.parentId) : this.root;
    if (!parent) throw new Error(`Cartoon scene parent does not exist: ${this.parentId}`);
    if (!parent.children.includes(this.node)) parent.children.push(this.node);
  }

  undo(): void {
    const parent = findParent(this.root, this.node.id);
    if (parent) removeChild(parent, this.node);
  }
}

class RemoveCartoonNodeCommand implements Command {
  readonly name: string;
  private index = -1;

  constructor(private readonly parent: CartoonSceneNode, private readonly node: CartoonSceneNode) {
    this.name = `Remove cartoon node ${node.id}`;
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

class SetCartoonTransformCommand implements Command {
  readonly name: string;
  private readonly before: CartoonSceneTransform;

  constructor(private readonly node: CartoonSceneNode, private readonly after: CartoonSceneTransform) {
    this.name = `Set cartoon transform ${node.id}`;
    this.before = cloneTransform(node.transform);
  }

  execute(): void {
    this.node.transform = cloneTransform(this.after);
  }

  undo(): void {
    this.node.transform = cloneTransform(this.before);
  }
}

function categoryFromAsset(asset: CartoonEditorAssetReference): CartoonAssetCategory {
  if (asset.type === "audio") return "audio";
  if (asset.type === "material") return "material";
  if (asset.clips && asset.clips.length > 0) return "character";
  return "prop";
}

function findNode(root: CartoonSceneNode, id: string): CartoonSceneNode | undefined {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return undefined;
}

function findParent(root: CartoonSceneNode, id: string): CartoonSceneNode | undefined {
  for (const child of root.children) {
    if (child.id === id) return root;
    const found = findParent(child, id);
    if (found) return found;
  }
  return undefined;
}

function flattenNodes(root: CartoonSceneNode): readonly CartoonSceneNode[] {
  return [root, ...root.children.flatMap((child) => flattenNodes(child))];
}

function removeChild(parent: CartoonSceneNode, node: CartoonSceneNode): void {
  const index = parent.children.indexOf(node);
  if (index >= 0) parent.children.splice(index, 1);
}

function defaultTransform(): CartoonSceneTransform {
  return {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    scale: { x: 1, y: 1, z: 1 }
  };
}

function mergeTransform(base: CartoonSceneTransform, next: Partial<CartoonSceneTransform> | AssetDropPlacement): CartoonSceneTransform {
  return {
    position: { ...base.position, ...(next.position ?? {}) },
    rotation: { ...base.rotation, ...(next.rotation ?? {}) },
    scale: { ...base.scale, ...(next.scale ?? {}) }
  };
}

function cloneTransform(transform: CartoonSceneTransform): CartoonSceneTransform {
  return mergeTransform(defaultTransform(), transform);
}

function cloneNode(node: CartoonSceneNode): CartoonSceneNode {
  return createCartoonSceneNode({
    ...node,
    transform: cloneTransform(node.transform),
    animationClips: [...node.animationClips],
    children: node.children.map(cloneNode)
  });
}

function stableNodeId(name: string): string {
  return `node-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item"}`;
}
