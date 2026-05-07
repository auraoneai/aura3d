import { ValidationError } from "@galileo3d/core";
import { type ComponentCtor } from "./Component.js";
import { entityKey, type Entity } from "./Entity.js";
import { type World } from "./World.js";

export type EntityRef = Entity | { readonly tempId: number };

type Command =
  | { kind: "create"; tempId: number }
  | { kind: "destroy"; entity: EntityRef }
  | { kind: "add"; entity: EntityRef; ctor: ComponentCtor; component: object }
  | { kind: "remove"; entity: EntityRef; ctor: ComponentCtor };

export class CommandBuffer {
  private nextTempId = 1;
  private readonly commands: Command[] = [];

  createEntity(): EntityRef {
    const ref = { tempId: this.nextTempId };
    this.nextTempId += 1;
    this.commands.push({ kind: "create", tempId: ref.tempId });
    return ref;
  }

  destroyEntity(entity: EntityRef): void {
    this.commands.push({ kind: "destroy", entity });
  }

  add<T extends object>(entity: EntityRef, ctor: ComponentCtor<T>, component: T): void {
    this.commands.push({ kind: "add", entity, ctor, component });
  }

  remove<T extends object>(entity: EntityRef, ctor: ComponentCtor<T>): void {
    this.commands.push({ kind: "remove", entity, ctor });
  }

  flush(world: World): Entity[] {
    validateCommands(world, this.commands);
    const tempEntities = new Map<number, Entity>();
    const created: Entity[] = [];
    const commands = this.commands.splice(0, this.commands.length);
    for (const command of commands) {
      if (command.kind === "create") {
        const entity = world.createEntity();
        tempEntities.set(command.tempId, entity);
        created.push(entity);
        continue;
      }
      const entity = resolve(command.entity, tempEntities);
      if (command.kind === "destroy") world.destroyEntity(entity);
      if (command.kind === "add") world.add(entity, command.ctor, command.component);
      if (command.kind === "remove") world.remove(entity, command.ctor);
    }
    return created;
  }
}

function validateCommands(world: World, commands: readonly Command[]): void {
  const tempAlive = new Set<number>();
  const deadEntities = new Set<string>();

  for (const command of commands) {
    if (command.kind === "create") {
      tempAlive.add(command.tempId);
      continue;
    }

    validateEntityRef(world, command.entity, tempAlive, deadEntities);
    if (command.kind === "remove") world.registry.require(command.ctor);
    if (command.kind === "destroy") {
      if ("tempId" in command.entity) {
        tempAlive.delete(command.entity.tempId);
      } else {
        deadEntities.add(entityKey(command.entity));
      }
    }
  }
}

function validateEntityRef(world: World, ref: EntityRef, tempAlive: Set<number>, deadEntities: Set<string>): void {
  if ("tempId" in ref) {
    if (!tempAlive.has(ref.tempId)) throw new ValidationError("TEMP_ENTITY", `Temporary entity is not alive: ${ref.tempId}`);
    return;
  }

  world.assertAlive(ref);
  if (deadEntities.has(entityKey(ref))) throw new ValidationError("ENTITY_NOT_ALIVE", `Entity was already destroyed by this command buffer: ${entityKey(ref)}`);
}

function resolve(ref: EntityRef, tempEntities: Map<number, Entity>): Entity {
  if ("tempId" in ref) {
    const entity = tempEntities.get(ref.tempId);
    if (!entity) throw new ValidationError("TEMP_ENTITY", `Temporary entity was not created: ${ref.tempId}`);
    return entity;
  }
  return ref;
}
