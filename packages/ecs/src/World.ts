import { ValidationError } from "@galileo3d/core";
import { type ComponentCtor, type ComponentSchema } from "./Component.js";
import { ComponentRegistry } from "./ComponentRegistry.js";
import { ComponentStore } from "./ComponentStore.js";
import { type Entity } from "./Entity.js";
import { EntityManager } from "./EntityManager.js";
import { Query, type QueryOptions } from "./Query.js";
import { SystemScheduler } from "./SystemScheduler.js";
import { type SystemContext } from "./System.js";

export class World {
  readonly entities = new EntityManager();
  readonly registry = new ComponentRegistry();
  readonly components = new ComponentStore(this.registry);
  readonly systems = new SystemScheduler();
  private version = 0;

  registerComponent<T extends object>(ctor: ComponentCtor<T>, schema?: ComponentSchema): void {
    this.registry.register(ctor, schema);
  }

  createEntity(): Entity {
    this.version += 1;
    return this.entities.create();
  }

  destroyEntity(entity: Entity): boolean {
    this.assertAlive(entity);
    const destroyed = this.entities.destroy(entity);
    if (destroyed) {
      this.components.deleteEntity(entity);
      this.version += 1;
    }
    return destroyed;
  }

  add<T extends object>(entity: Entity, ctor: ComponentCtor<T>, component: T): void {
    this.assertAlive(entity);
    if (!this.registry.get(ctor)) this.registry.register(ctor);
    this.components.add(entity, ctor, component);
    this.version += 1;
  }

  remove<T extends object>(entity: Entity, ctor: ComponentCtor<T>): boolean {
    this.assertAlive(entity);
    const removed = this.components.remove(entity, ctor);
    if (removed) this.version += 1;
    return removed;
  }

  get<T extends object>(entity: Entity, ctor: ComponentCtor<T>): T | undefined {
    this.assertAlive(entity);
    return this.components.get(entity, ctor);
  }

  has<T extends object>(entity: Entity, ctor: ComponentCtor<T>): boolean {
    this.assertAlive(entity);
    return this.components.has(entity, ctor);
  }

  query(options: QueryOptions): Query {
    return new Query(this.entities, this.components, this.registry, options);
  }

  update(context: SystemContext): void {
    this.systems.update(this, context);
  }

  getVersion(): number {
    return this.version;
  }

  assertAlive(entity: Entity): void {
    if (!this.entities.isAlive(entity)) throw new ValidationError("ENTITY_NOT_ALIVE", `Entity is not alive: ${entity.id}:${entity.generation}`);
  }
}
