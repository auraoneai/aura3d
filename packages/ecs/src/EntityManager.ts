import { ValidationError } from "@galileo3d/core";
import { type Entity } from "./Entity.js";

export class EntityManager {
  private readonly generations: number[] = [];
  private readonly alive = new Set<number>();
  private readonly free: number[] = [];

  create(): Entity {
    const id = this.free.pop() ?? this.generations.length;
    this.generations[id] ??= 0;
    this.alive.add(id);
    return { id, generation: this.generations[id] };
  }

  destroy(entity: Entity): boolean {
    if (!this.isAlive(entity)) return false;
    this.alive.delete(entity.id);
    this.generations[entity.id] += 1;
    if (!Number.isSafeInteger(this.generations[entity.id])) throw new ValidationError("ENTITY_GENERATION_OVERFLOW", "Entity generation overflow.");
    this.free.push(entity.id);
    return true;
  }

  isAlive(entity: Entity): boolean {
    return this.alive.has(entity.id) && this.generations[entity.id] === entity.generation;
  }

  get size(): number {
    return this.alive.size;
  }

  entities(): Entity[] {
    return [...this.alive].sort((a, b) => a - b).map((id) => ({ id, generation: this.generations[id] }));
  }
}
