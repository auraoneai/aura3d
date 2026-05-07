import { Bitset } from "./Bitset.js";
import { type ComponentCtor, type ComponentType } from "./Component.js";
import { ComponentRegistry } from "./ComponentRegistry.js";
import { type Entity } from "./Entity.js";
import { SparseSet } from "./SparseSet.js";

export class ComponentStore {
  private readonly stores = new Map<number, SparseSet<object>>();
  private readonly signatures = new Map<number, Bitset>();

  constructor(private readonly registry: ComponentRegistry) {}

  add<T extends object>(entity: Entity, ctor: ComponentCtor<T>, component: T): void {
    const type = this.registry.require(ctor);
    this.storeFor(type).add(entity, component);
    this.signatureFor(entity).add(type.id);
  }

  remove<T extends object>(entity: Entity, ctor: ComponentCtor<T>): boolean {
    const type = this.registry.require(ctor);
    const removed = this.storeFor(type).delete(entity);
    if (removed) this.signatureFor(entity).delete(type.id);
    return removed;
  }

  get<T extends object>(entity: Entity, ctor: ComponentCtor<T>): T | undefined {
    const type = this.registry.require(ctor);
    return this.storeFor(type).get(entity) as T | undefined;
  }

  has<T extends object>(entity: Entity, ctor: ComponentCtor<T>): boolean {
    const type = this.registry.require(ctor);
    return this.storeFor(type).has(entity);
  }

  deleteEntity(entity: Entity): void {
    for (const store of this.stores.values()) store.delete(entity);
    this.signatures.delete(entity.id);
  }

  signature(entity: Entity): Bitset {
    return this.signatures.get(entity.id)?.clone() ?? new Bitset();
  }

  entries<T extends object>(ctor: ComponentCtor<T>): [Entity, T][] {
    const type = this.registry.require(ctor);
    return this.storeFor(type).entries() as [Entity, T][];
  }

  entitiesWith<T extends object>(ctor: ComponentCtor<T>): Entity[] {
    const type = this.registry.require(ctor);
    return this.storeFor(type).entities();
  }

  private storeFor(type: ComponentType): SparseSet<object> {
    let store = this.stores.get(type.id);
    if (!store) {
      store = new SparseSet<object>();
      this.stores.set(type.id, store);
    }
    return store;
  }

  private signatureFor(entity: Entity): Bitset {
    let signature = this.signatures.get(entity.id);
    if (!signature) {
      signature = new Bitset();
      this.signatures.set(entity.id, signature);
    }
    return signature;
  }
}
