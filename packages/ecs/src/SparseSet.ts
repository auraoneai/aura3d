import { entityKey, type Entity } from "./Entity.js";

export class SparseSet<T> {
  private readonly denseEntities: Entity[] = [];
  private readonly denseValues: T[] = [];
  private readonly sparse = new Map<string, number>();

  add(entity: Entity, value: T): void {
    const key = entityKey(entity);
    const existing = this.sparse.get(key);
    if (existing !== undefined) {
      this.denseValues[existing] = value;
      return;
    }
    this.sparse.set(key, this.denseEntities.length);
    this.denseEntities.push(entity);
    this.denseValues.push(value);
  }

  get(entity: Entity): T | undefined {
    const index = this.sparse.get(entityKey(entity));
    return index === undefined ? undefined : this.denseValues[index];
  }

  has(entity: Entity): boolean {
    return this.sparse.has(entityKey(entity));
  }

  delete(entity: Entity): boolean {
    const key = entityKey(entity);
    const index = this.sparse.get(key);
    if (index === undefined) return false;
    const lastIndex = this.denseEntities.length - 1;
    const lastEntity = this.denseEntities[lastIndex];
    const lastValue = this.denseValues[lastIndex];
    this.denseEntities[index] = lastEntity;
    this.denseValues[index] = lastValue;
    this.sparse.set(entityKey(lastEntity), index);
    this.denseEntities.pop();
    this.denseValues.pop();
    this.sparse.delete(key);
    return true;
  }

  entries(): [Entity, T][] {
    return this.denseEntities.map((entity, index) => [entity, this.denseValues[index]]);
  }

  entities(): Entity[] {
    return this.denseEntities.map((entity) => ({ ...entity }));
  }

  get size(): number {
    return this.denseEntities.length;
  }
}
