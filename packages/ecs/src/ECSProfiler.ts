import { type World } from "./World.js";

export interface ECSProfileSnapshot {
  entities: number;
  components: { name: string; id: number; count: number }[];
  version: number;
}

export function profileWorld(world: World): ECSProfileSnapshot {
  return {
    entities: world.entities.size,
    components: world.registry.list().map((type) => ({
      name: type.name,
      id: type.id,
      count: world.components.entries(type.ctor).length
    })),
    version: world.getVersion()
  };
}
