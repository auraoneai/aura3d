import { ValidationError } from "@galileo3d/core";
import { type ComponentSchema } from "../Component.js";
import { entityKey, sameEntity, type Entity } from "../Entity.js";

export interface SerializedHierarchyComponent {
  readonly parent: Entity | null;
  readonly children: readonly Entity[];
  readonly previousSibling: Entity | null;
  readonly nextSibling: Entity | null;
  readonly depth: number;
}

export class HierarchyComponent {
  parent: Entity | null;
  previousSibling: Entity | null = null;
  nextSibling: Entity | null = null;
  depth = 0;
  private readonly childEntities: Entity[] = [];

  constructor(parent: Entity | null = null) {
    this.parent = parent;
  }

  get children(): readonly Entity[] {
    return this.childEntities;
  }

  get childCount(): number {
    return this.childEntities.length;
  }

  get firstChild(): Entity | null {
    return this.childEntities[0] ?? null;
  }

  get lastChild(): Entity | null {
    return this.childEntities[this.childEntities.length - 1] ?? null;
  }

  hasParent(): boolean {
    return this.parent !== null;
  }

  hasChildren(): boolean {
    return this.childEntities.length > 0;
  }

  includesChild(entity: Entity): boolean {
    return this.childEntities.some((child) => sameEntity(child, entity));
  }

  forEachChild(callback: (child: Entity) => void): void {
    for (const child of this.childEntities) callback(child);
  }

  getSiblingIndex(entity?: Entity): number {
    if (!entity) return this.parent ? 0 : -1;
    return this.childEntities.findIndex((child) => sameEntity(child, entity));
  }

  _setParent(parent: Entity | null): void {
    this.parent = parent;
  }

  _addChild(child: Entity): void {
    if (!this.includesChild(child)) this.childEntities.push(child);
  }

  _removeChild(child: Entity): boolean {
    const index = this.childEntities.findIndex((entry) => sameEntity(entry, child));
    if (index < 0) return false;
    this.childEntities.splice(index, 1);
    return true;
  }

  _clearChildren(): void {
    this.childEntities.length = 0;
  }

  _moveChild(child: Entity, index: number): void {
    const current = this.childEntities.findIndex((entry) => sameEntity(entry, child));
    if (current < 0) throw new ValidationError("ECS_HIERARCHY_CHILD", `Entity is not a child: ${entityKey(child)}`);
    const [entry] = this.childEntities.splice(current, 1);
    this.childEntities.splice(Math.max(0, Math.min(index, this.childEntities.length)), 0, entry);
  }

  toJSON(): SerializedHierarchyComponent {
    return {
      parent: this.parent ? { ...this.parent } : null,
      children: this.childEntities.map((child) => ({ ...child })),
      previousSibling: this.previousSibling ? { ...this.previousSibling } : null,
      nextSibling: this.nextSibling ? { ...this.nextSibling } : null,
      depth: this.depth
    };
  }

  static readonly schema: ComponentSchema = {
    version: 1,
    serialize(component: object): SerializedHierarchyComponent {
      return (component as HierarchyComponent).toJSON();
    },
    deserialize(data: unknown): HierarchyComponent {
      if (!isRecord(data) || !Array.isArray(data.children)) {
        throw new ValidationError("HIERARCHY_COMPONENT_DESERIALIZE", "HierarchyComponent data requires children array.");
      }
      const hierarchy = new HierarchyComponent(isEntity(data.parent) ? data.parent : null);
      for (const child of data.children) {
        if (isEntity(child)) hierarchy._addChild(child);
      }
      hierarchy.previousSibling = isEntity(data.previousSibling) ? data.previousSibling : null;
      hierarchy.nextSibling = isEntity(data.nextSibling) ? data.nextSibling : null;
      hierarchy.depth = typeof data.depth === "number" && Number.isFinite(data.depth) ? Math.max(0, Math.floor(data.depth)) : 0;
      return hierarchy;
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isEntity(value: unknown): value is Entity {
  return isRecord(value) && Number.isSafeInteger(value.id) && Number.isSafeInteger(value.generation);
}
