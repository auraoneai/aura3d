import { ValidationError } from "@galileo3d/core";
import { Bitset } from "./Bitset.js";
import { type ComponentCtor } from "./Component.js";
import { type ComponentRegistry } from "./ComponentRegistry.js";
import { type ComponentStore } from "./ComponentStore.js";
import { type Entity } from "./Entity.js";
import { type EntityManager } from "./EntityManager.js";

export interface QueryOptions {
  include?: ComponentCtor[];
  exclude?: ComponentCtor[];
}

export class Query {
  private readonly includeMask: Bitset;
  private readonly excludeMask: Bitset;
  private readonly include: readonly ComponentCtor[];
  private readonly exclude: readonly ComponentCtor[];

  constructor(
    private readonly entities: EntityManager,
    private readonly store: ComponentStore,
    registry: ComponentRegistry,
    options: QueryOptions
  ) {
    this.include = options.include ?? [];
    this.exclude = options.exclude ?? [];
    this.includeMask = Bitset.from(this.include.map((ctor) => registry.require(ctor).id));
    this.excludeMask = Bitset.from(this.exclude.map((ctor) => registry.require(ctor).id));
  }

  matches(entity: Entity): boolean {
    const signature = this.store.signature(entity);
    return signature.containsAll(this.includeMask) && !signature.intersects(this.excludeMask);
  }

  toArray(): Entity[] {
    if (this.include.length === 1 && this.exclude.length === 0) {
      return this.store.entitiesWith(this.include[0]!);
    }
    return this.entities.entities().filter((entity) => this.matches(entity));
  }

  forEach(visitor: (entity: Entity) => void): void {
    for (const entity of this.toArray()) visitor(entity);
  }

  first(): Entity | undefined {
    return this.toArray()[0];
  }

  single(): Entity {
    const result = this.toArray();
    if (result.length !== 1) throw new ValidationError("QUERY_SINGLE", `Expected exactly one entity, found ${result.length}.`);
    return result[0];
  }
}
