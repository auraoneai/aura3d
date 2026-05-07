import { ValidationError } from "@galileo3d/core";
import { type ComponentCtor } from "./Component.js";
import { type Entity } from "./Entity.js";
import { World } from "./World.js";

export interface SerializedEntity {
  id: number;
  generation: number;
  components: Record<string, unknown>;
}

export interface SerializedWorld {
  version: 1;
  entities: SerializedEntity[];
}

export function serializeWorld(world: World): SerializedWorld {
  const entities: SerializedEntity[] = world.entities.entities().map((entity) => {
    const components: Record<string, unknown> = {};
    for (const type of world.registry.list()) {
      const value = world.components.get(entity, type.ctor as ComponentCtor);
      if (value) components[type.name] = type.schema.serialize ? type.schema.serialize(value) : structuredClone(value);
    }
    return { id: entity.id, generation: entity.generation, components };
  });
  return { version: 1, entities };
}

export function deserializeWorld(serialized: SerializedWorld, componentTypes: ComponentCtor[]): { world: World; remap: Map<string, Entity> } {
  if (serialized.version !== 1) throw new ValidationError("ECS_VERSION", `Unsupported ECS version: ${serialized.version}`);
  const world = new World();
  for (const type of componentTypes) world.registerComponent(type);
  const remap = new Map<string, Entity>();
  for (const serializedEntity of serialized.entities) {
    const entity = world.createEntity();
    remap.set(`${serializedEntity.id}:${serializedEntity.generation}`, entity);
    for (const [name, data] of Object.entries(serializedEntity.components)) {
      const type = world.registry.getByName(name);
      if (!type) throw new ValidationError("ECS_DESERIALIZE_COMPONENT", `Missing component type during ECS deserialize: ${name}`);
      const component = type.schema.deserialize ? type.schema.deserialize(data) : data;
      world.add(entity, type.ctor as ComponentCtor, component as object);
    }
  }
  return { world, remap };
}
