import { Bitset } from "./Bitset.js";
import { type Entity } from "./Entity.js";

export class Archetype {
  readonly signature: Bitset;
  private readonly members = new Map<number, Entity>();

  constructor(signature: Bitset) {
    this.signature = signature.clone();
  }

  add(entity: Entity): void {
    this.members.set(entity.id, entity);
  }

  delete(entity: Entity): boolean {
    return this.members.delete(entity.id);
  }

  entities(): Entity[] {
    return [...this.members.values()].sort((a, b) => a.id - b.id);
  }
}
