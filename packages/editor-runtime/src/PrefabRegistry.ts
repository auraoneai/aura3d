export type EditorPrefabSchemaVersion = "galileo3d-prefab-v1";

export interface EditorPrefabNodeBase {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
}

export interface EditorPrefab<TNode extends EditorPrefabNodeBase = EditorPrefabNodeBase> {
  readonly schemaVersion: EditorPrefabSchemaVersion;
  readonly id: string;
  readonly name: string;
  readonly rootNodeId: string;
  readonly sourceNodeId?: string;
  readonly createdAt: string;
  readonly nodes: readonly TNode[];
}

export interface CreatePrefabOptions<TNode extends EditorPrefabNodeBase> {
  readonly id: string;
  readonly name: string;
  readonly rootNodeId: string;
  readonly sourceNodeId?: string;
  readonly createdAt?: string;
  readonly nodes: readonly TNode[];
}

export interface InstantiatePrefabOptions {
  readonly idPrefix: string;
  readonly rootParentId?: string | null;
  readonly nameSuffix?: string;
}

export class PrefabRegistry<TNode extends EditorPrefabNodeBase = EditorPrefabNodeBase> {
  private readonly prefabsById = new Map<string, EditorPrefab<TNode>>();

  create(options: CreatePrefabOptions<TNode>): EditorPrefab<TNode> {
    const prefab: EditorPrefab<TNode> = {
      schemaVersion: "galileo3d-prefab-v1",
      id: normalizeId(options.id, "prefab id"),
      name: normalizeName(options.name, "prefab name"),
      rootNodeId: normalizeId(options.rootNodeId, "prefab rootNodeId"),
      ...(options.sourceNodeId ? { sourceNodeId: normalizeId(options.sourceNodeId, "prefab sourceNodeId") } : {}),
      createdAt: options.createdAt ?? new Date().toISOString(),
      nodes: options.nodes.map((node) => cloneNode(node))
    };
    validatePrefab(prefab);
    return prefab;
  }

  register(prefab: EditorPrefab<TNode>): EditorPrefab<TNode> {
    validatePrefab(prefab);
    if (this.prefabsById.has(prefab.id)) {
      throw new Error(`Prefab already registered: ${prefab.id}`);
    }
    const cloned = clonePrefab(prefab);
    this.prefabsById.set(cloned.id, cloned);
    return cloned;
  }

  upsert(prefab: EditorPrefab<TNode>): EditorPrefab<TNode> {
    validatePrefab(prefab);
    const cloned = clonePrefab(prefab);
    this.prefabsById.set(cloned.id, cloned);
    return cloned;
  }

  get(id: string): EditorPrefab<TNode> | undefined {
    const prefab = this.prefabsById.get(id);
    return prefab ? clonePrefab(prefab) : undefined;
  }

  list(): readonly EditorPrefab<TNode>[] {
    return [...this.prefabsById.values()].map((prefab) => clonePrefab(prefab));
  }

  remove(id: string): boolean {
    return this.prefabsById.delete(id);
  }

  clear(): void {
    this.prefabsById.clear();
  }

  instantiate(prefabOrId: EditorPrefab<TNode> | string, options: InstantiatePrefabOptions): readonly TNode[] {
    const prefab = typeof prefabOrId === "string" ? this.get(prefabOrId) : clonePrefab(prefabOrId);
    if (!prefab) {
      throw new Error(`Unknown prefab: ${prefabOrId}`);
    }
    validatePrefab(prefab);
    const idPrefix = normalizeId(options.idPrefix, "prefab instance idPrefix");
    const idMap = new Map(prefab.nodes.map((node) => [node.id, `${idPrefix}-${node.id}`]));
    const rootParentId = options.rootParentId ?? null;
    const nameSuffix = options.nameSuffix ?? " Instance";
    return prefab.nodes.map((node) => {
      const cloned = cloneNode(node);
      const remappedParent = node.id === prefab.rootNodeId
        ? rootParentId
        : node.parentId ? idMap.get(node.parentId) ?? null : null;
      return {
        ...cloned,
        id: idMap.get(node.id)!,
        name: `${node.name}${nameSuffix}`,
        parentId: remappedParent
      };
    });
  }
}

export function validatePrefab<TNode extends EditorPrefabNodeBase>(prefab: EditorPrefab<TNode>): void {
  if (prefab.schemaVersion !== "galileo3d-prefab-v1") {
    throw new Error(`Unsupported prefab schemaVersion: ${String(prefab.schemaVersion)}`);
  }
  normalizeId(prefab.id, "prefab id");
  normalizeName(prefab.name, "prefab name");
  normalizeId(prefab.rootNodeId, "prefab rootNodeId");
  if (prefab.nodes.length === 0) {
    throw new Error("Prefab must contain at least one node.");
  }
  const ids = new Set<string>();
  for (const node of prefab.nodes) {
    normalizeId(node.id, "prefab node id");
    normalizeName(node.name, "prefab node name");
    if (ids.has(node.id)) {
      throw new Error(`Prefab node id is duplicated: ${node.id}`);
    }
    ids.add(node.id);
  }
  if (!ids.has(prefab.rootNodeId)) {
    throw new Error(`Prefab rootNodeId ${prefab.rootNodeId} is not present in nodes.`);
  }
  for (const node of prefab.nodes) {
    if (node.parentId !== null && !ids.has(node.parentId)) {
      throw new Error(`Prefab node ${node.id} references external parent ${node.parentId}`);
    }
  }
}

function clonePrefab<TNode extends EditorPrefabNodeBase>(prefab: EditorPrefab<TNode>): EditorPrefab<TNode> {
  return {
    ...prefab,
    nodes: prefab.nodes.map((node) => cloneNode(node))
  };
}

function cloneNode<TNode extends EditorPrefabNodeBase>(node: TNode): TNode {
  return JSON.parse(JSON.stringify(node)) as TNode;
}

function normalizeId(value: string, label: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(normalized)) {
    throw new Error(`${label} must be a non-empty stable id.`);
  }
  return normalized;
}

function normalizeName(value: string, label: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`${label} cannot be empty.`);
  }
  return normalized;
}
