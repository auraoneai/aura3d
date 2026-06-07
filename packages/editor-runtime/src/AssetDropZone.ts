import type { Command } from "./Command";
import { CommandHistory } from "./CommandHistory";
import type { EditorProjectAssetDocument } from "./ProjectSerializer";

export type CartoonAssetCategory = "character" | "set" | "prop" | "camera" | "light" | "audio" | "material" | "unknown";

export interface CartoonEditorAssetReference extends EditorProjectAssetDocument {
  readonly kind?: "aura-asset-ref" | "editor-asset-ref";
  readonly category?: CartoonAssetCategory;
  readonly profile?: "cartoon-character" | "cartoon-set" | "cartoon-prop" | "cartoon-audio" | string;
  readonly style?: string;
  readonly rigType?: "humanoid" | "creature" | "prop" | "none";
  readonly lipSyncReady?: boolean;
}

export interface AssetDropPlacement {
  readonly targetId?: string | number;
  readonly position?: { readonly x: number; readonly y: number; readonly z: number };
  readonly rotation?: { readonly x: number; readonly y: number; readonly z: number; readonly w?: number };
  readonly scale?: { readonly x: number; readonly y: number; readonly z: number };
}

export interface AssetDropResult<TNode> {
  readonly asset: CartoonEditorAssetReference;
  readonly node: TNode;
  readonly placement: AssetDropPlacement;
}

export interface AssetDropZoneOptions<TNode> {
  readonly history?: CommandHistory;
  readonly createNode: (asset: CartoonEditorAssetReference, placement: AssetDropPlacement) => TNode;
  readonly addNode: (node: TNode, placement: AssetDropPlacement) => void;
  readonly removeNode: (node: TNode) => void;
  readonly onDrop?: (result: AssetDropResult<TNode>) => void;
}

export class AssetDropZone<TNode = unknown> {
  readonly history: CommandHistory;

  constructor(private readonly options: AssetDropZoneOptions<TNode>) {
    this.history = options.history ?? new CommandHistory();
  }

  async dropAsset(asset: CartoonEditorAssetReference, placement: AssetDropPlacement = {}): Promise<AssetDropResult<TNode>> {
    validateAssetReference(asset);
    validatePlacement(placement);
    const node = this.options.createNode(asset, placement);
    await this.history.execute(new DropAssetCommand(this.options, asset, node, placement));
    const result = { asset, node, placement };
    this.options.onDrop?.(result);
    return result;
  }

  bindElement(element: HTMLElement): () => void {
    const dragover = (event: DragEvent): void => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };
    const drop = (event: DragEvent): void => {
      event.preventDefault();
      const asset = readAssetFromDataTransfer(event.dataTransfer);
      if (!asset) return;
      void this.dropAsset(asset, {
        position: {
          x: Number(element.dataset.dropX ?? 0),
          y: Number(element.dataset.dropY ?? 0),
          z: Number(element.dataset.dropZ ?? 0)
        }
      });
    };
    element.addEventListener("dragover", dragover);
    element.addEventListener("drop", drop);
    return () => {
      element.removeEventListener("dragover", dragover);
      element.removeEventListener("drop", drop);
    };
  }
}

class DropAssetCommand<TNode> implements Command {
  readonly name: string;

  constructor(
    private readonly options: Pick<AssetDropZoneOptions<TNode>, "addNode" | "removeNode">,
    private readonly asset: CartoonEditorAssetReference,
    private readonly node: TNode,
    private readonly placement: AssetDropPlacement
  ) {
    this.name = `Drop asset ${asset.id}`;
  }

  execute(): void {
    this.options.addNode(this.node, this.placement);
  }

  undo(): void {
    this.options.removeNode(this.node);
  }
}

export function serializeAssetForDrag(asset: CartoonEditorAssetReference): string {
  validateAssetReference(asset);
  return JSON.stringify(asset);
}

export function readAssetFromDataTransfer(dataTransfer: DataTransfer | null): CartoonEditorAssetReference | undefined {
  if (!dataTransfer) return undefined;
  const encoded = dataTransfer.getData("application/x-aura3d-asset") || dataTransfer.getData("text/plain");
  if (!encoded.trim()) return undefined;
  const parsed = JSON.parse(encoded) as CartoonEditorAssetReference;
  validateAssetReference(parsed);
  return parsed;
}

function validateAssetReference(asset: CartoonEditorAssetReference): void {
  if (!asset.id?.trim()) throw new Error("Dropped Aura3D asset id is required.");
  if (!asset.name?.trim()) throw new Error(`Dropped Aura3D asset name is required: ${asset.id}`);
  if ((asset.uri && /^https?:\/\//i.test(asset.uri) || asset.source && /^https?:\/\//i.test(asset.source)) && asset.kind !== "aura-asset-ref") {
    throw new Error(`Dropped asset "${asset.id}" must be a typed Aura3D asset reference, not a raw URL.`);
  }
  if (asset.source !== undefined && !asset.source.trim()) throw new Error(`Dropped Aura3D asset source cannot be empty: ${asset.id}`);
  if (asset.license !== undefined && !asset.license.trim()) throw new Error(`Dropped Aura3D asset license cannot be empty: ${asset.id}`);
  if (asset.category === "character") {
    if (asset.rigType === "none") throw new Error(`Cartoon character asset "${asset.id}" must be rigged.`);
    if ((asset.clips?.length ?? 0) === 0) throw new Error(`Cartoon character asset "${asset.id}" requires animation clip metadata.`);
    if (!asset.lipSyncReady) throw new Error(`Cartoon character asset "${asset.id}" requires lip-sync readiness metadata.`);
  }
  if ((asset.category === "set" || asset.category === "audio") && !asset.license) {
    throw new Error(`Cartoon ${asset.category} asset "${asset.id}" requires license metadata.`);
  }
}

function validatePlacement(placement: AssetDropPlacement): void {
  validateVector(placement.position, "position");
  validateVector(placement.rotation, "rotation");
  validateVector(placement.scale, "scale");
}

function validateVector(vector: { readonly x: number; readonly y: number; readonly z: number } | undefined, label: string): void {
  if (!vector) return;
  if (!Number.isFinite(vector.x) || !Number.isFinite(vector.y) || !Number.isFinite(vector.z)) {
    throw new Error(`Asset drop ${label} must contain finite x/y/z values.`);
  }
}
