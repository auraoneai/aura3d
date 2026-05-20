import { ValidationError } from "@galileo3d/core";
import { entityKey, sameEntity, type Entity } from "../Entity.js";
import { type System, type SystemContext } from "../System.js";
import { type World } from "../World.js";
import { HierarchyComponent } from "../components/HierarchyComponent.js";

export class HierarchySystem implements System {
  readonly name = "HierarchySystem";
  readonly phase = "update";
  readonly priority = -100;

  update(world: World, _context: SystemContext): void {
    for (const entity of world.query({ include: [HierarchyComponent] }).toArray()) {
      const hierarchy = world.get(entity, HierarchyComponent);
      if (!hierarchy) continue;
      if (hierarchy.parent && !world.entities.isAlive(hierarchy.parent)) {
        hierarchy._setParent(null);
        hierarchy.depth = 0;
      }
    }
    const cycles = this.detectCycles(world);
    if (cycles.length > 0) throw new ValidationError("ECS_HIERARCHY_CYCLE", `Hierarchy cycle detected: ${cycles.map(entityKey).join(", ")}`);
  }

  setParent(world: World, child: Entity, parent: Entity | null): void {
    world.assertAlive(child);
    if (parent) world.assertAlive(parent);
    if (parent && sameEntity(child, parent)) throw new ValidationError("ECS_HIERARCHY_SELF_PARENT", "Entity cannot be parented to itself.");
    const childHierarchy = ensureHierarchy(world, child);
    if (parent) ensureHierarchy(world, parent);
    if (parent && this.isAncestorOf(world, child, parent)) {
      throw new ValidationError("ECS_HIERARCHY_CYCLE", `Parenting ${entityKey(child)} to ${entityKey(parent)} would create a cycle.`);
    }

    const previousParent = childHierarchy.parent;
    if (sameOptionalEntity(childHierarchy.parent, parent)) return;
    if (previousParent) {
      world.get(previousParent, HierarchyComponent)?._removeChild(child);
      this.refreshChildSiblings(world, previousParent);
    }

    childHierarchy._setParent(parent ? { ...parent } : null);
    childHierarchy.previousSibling = null;
    childHierarchy.nextSibling = null;
    if (parent) {
      const parentHierarchy = ensureHierarchy(world, parent);
      parentHierarchy._addChild(child);
      this.refreshChildSiblings(world, parent);
      childHierarchy.depth = parentHierarchy.depth + 1;
    } else {
      childHierarchy.depth = 0;
    }
    this.updateDescendantDepths(world, child);
  }

  addChild(world: World, parent: Entity, child: Entity): void {
    this.setParent(world, child, parent);
  }

  removeFromParent(world: World, entity: Entity): void {
    this.setParent(world, entity, null);
  }

  getParent(world: World, entity: Entity): Entity | null {
    return world.get(entity, HierarchyComponent)?.parent ?? null;
  }

  getChildren(world: World, entity: Entity): readonly Entity[] {
    return world.get(entity, HierarchyComponent)?.children ?? [];
  }

  getDepth(world: World, entity: Entity): number {
    return world.get(entity, HierarchyComponent)?.depth ?? 0;
  }

  forEachDescendant(world: World, entity: Entity, callback: (descendant: Entity, depth: number) => void): void {
    const hierarchy = world.get(entity, HierarchyComponent);
    if (!hierarchy) return;
    for (const child of hierarchy.children) {
      const childHierarchy = world.get(child, HierarchyComponent);
      callback(child, childHierarchy?.depth ?? hierarchy.depth + 1);
      this.forEachDescendant(world, child, callback);
    }
  }

  isAncestorOf(world: World, ancestor: Entity, descendant: Entity): boolean {
    let cursor = world.get(descendant, HierarchyComponent)?.parent ?? null;
    const guard = new Set<string>();
    while (cursor) {
      if (sameEntity(cursor, ancestor)) return true;
      const key = entityKey(cursor);
      if (guard.has(key)) return false;
      guard.add(key);
      cursor = world.get(cursor, HierarchyComponent)?.parent ?? null;
    }
    return false;
  }

  isDescendantOf(world: World, descendant: Entity, ancestor: Entity): boolean {
    return this.isAncestorOf(world, ancestor, descendant);
  }

  setSiblingIndex(world: World, entity: Entity, index: number): void {
    const hierarchy = world.get(entity, HierarchyComponent);
    if (!hierarchy?.parent) return;
    world.get(hierarchy.parent, HierarchyComponent)?._moveChild(entity, index);
    this.refreshChildSiblings(world, hierarchy.parent);
  }

  detachChildren(world: World, entity: Entity): Entity[] {
    const children = [...this.getChildren(world, entity)];
    for (const child of children) this.setParent(world, child, null);
    return children;
  }

  validateHierarchy(world: World): boolean {
    return this.detectCycles(world).length === 0 && world.query({ include: [HierarchyComponent] }).toArray().every((entity) => {
      const hierarchy = world.get(entity, HierarchyComponent);
      if (!hierarchy?.parent) return true;
      const parent = world.get(hierarchy.parent, HierarchyComponent);
      return Boolean(parent?.includesChild(entity));
    });
  }

  detectCycles(world: World): Entity[] {
    const cycles: Entity[] = [];
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (entity: Entity): void => {
      const key = entityKey(entity);
      if (visiting.has(key)) {
        cycles.push(entity);
        return;
      }
      if (visited.has(key)) return;
      visiting.add(key);
      const parent = world.get(entity, HierarchyComponent)?.parent;
      if (parent) visit(parent);
      visiting.delete(key);
      visited.add(key);
    };
    for (const entity of world.query({ include: [HierarchyComponent] }).toArray()) visit(entity);
    return cycles;
  }

  private updateDescendantDepths(world: World, entity: Entity): void {
    const hierarchy = world.get(entity, HierarchyComponent);
    if (!hierarchy) return;
    for (const child of hierarchy.children) {
      const childHierarchy = world.get(child, HierarchyComponent);
      if (!childHierarchy) continue;
      childHierarchy.depth = hierarchy.depth + 1;
      this.updateDescendantDepths(world, child);
    }
  }

  private refreshChildSiblings(world: World, parent: Entity): void {
    const parentHierarchy = world.get(parent, HierarchyComponent);
    if (!parentHierarchy) return;
    const children = parentHierarchy.children;
    for (let index = 0; index < children.length; index += 1) {
      const child = children[index];
      const hierarchy = world.get(child, HierarchyComponent);
      if (!hierarchy) continue;
      hierarchy.previousSibling = children[index - 1] ? { ...children[index - 1] } : null;
      hierarchy.nextSibling = children[index + 1] ? { ...children[index + 1] } : null;
    }
  }
}

function ensureHierarchy(world: World, entity: Entity): HierarchyComponent {
  if (!world.registry.get(HierarchyComponent)) world.registerComponent(HierarchyComponent);
  const existing = world.get(entity, HierarchyComponent);
  if (existing) return existing;
  world.add(entity, HierarchyComponent, new HierarchyComponent());
  return world.get(entity, HierarchyComponent) as HierarchyComponent;
}

function sameOptionalEntity(left: Entity | null, right: Entity | null): boolean {
  if (!left || !right) return left === right;
  return sameEntity(left, right);
}
