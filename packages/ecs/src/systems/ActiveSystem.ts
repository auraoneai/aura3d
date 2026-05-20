import { type Entity } from "../Entity.js";
import { type System, type SystemContext } from "../System.js";
import { type World } from "../World.js";
import { ActiveComponent } from "../components/ActiveComponent.js";
import { HierarchyComponent } from "../components/HierarchyComponent.js";

export class ActiveSystem implements System {
  readonly name = "ActiveSystem";
  readonly phase = "update";
  readonly priority = -90;
  onActiveChanged?: (entity: Entity, activeInHierarchy: boolean) => void;

  update(world: World, _context: SystemContext): void {
    const memo = new Map<string, boolean>();
    const entities = world.query({ include: [ActiveComponent] }).toArray().sort((left, right) => {
      return (world.get(left, HierarchyComponent)?.depth ?? 0) - (world.get(right, HierarchyComponent)?.depth ?? 0);
    });
    for (const entity of entities) {
      const component = world.get(entity, ActiveComponent);
      if (!component) continue;
      const previous = component.activeInHierarchy;
      component.activeInHierarchy = computeActiveInHierarchy(world, entity, memo);
      if (previous !== component.activeInHierarchy) this.onActiveChanged?.(entity, component.activeInHierarchy);
    }
  }

  setActive(world: World, entity: Entity, active: boolean): void {
    let component = world.get(entity, ActiveComponent);
    if (!component) {
      component = new ActiveComponent(active);
      world.add(entity, ActiveComponent, component);
    } else {
      component.setActive(active);
    }
    this.update(world, { deltaTime: 0, elapsedTime: 0, frame: 0 });
  }

  isActive(world: World, entity: Entity): boolean {
    return world.get(entity, ActiveComponent)?.activeSelf ?? true;
  }

  isActiveInHierarchy(world: World, entity: Entity): boolean {
    return world.get(entity, ActiveComponent)?.activeInHierarchy ?? true;
  }

  getActiveEntities(world: World): Entity[] {
    return world.query({ include: [ActiveComponent] }).toArray().filter((entity) => this.isActiveInHierarchy(world, entity));
  }

  getInactiveEntities(world: World): Entity[] {
    return world.query({ include: [ActiveComponent] }).toArray().filter((entity) => !this.isActiveInHierarchy(world, entity));
  }
}

function computeActiveInHierarchy(world: World, entity: Entity, memo: Map<string, boolean>): boolean {
  const key = `${entity.id}:${entity.generation}`;
  const cached = memo.get(key);
  if (cached !== undefined) return cached;
  const activeSelf = world.get(entity, ActiveComponent)?.activeSelf ?? true;
  const parent = world.get(entity, HierarchyComponent)?.parent ?? null;
  const active = activeSelf && (parent ? computeActiveInHierarchy(world, parent, memo) : true);
  memo.set(key, active);
  return active;
}
