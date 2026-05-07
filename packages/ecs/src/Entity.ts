import { ValidationError } from "@galileo3d/core";

export interface Entity {
  readonly id: number;
  readonly generation: number;
}

export function entityKey(entity: Entity): string {
  return `${entity.id}:${entity.generation}`;
}

export function sameEntity(a: Entity, b: Entity): boolean {
  return a.id === b.id && a.generation === b.generation;
}

export function assertEntity(entity: Entity): void {
  if (!Number.isSafeInteger(entity.id) || entity.id < 0) throw new ValidationError("ENTITY_ID", "Entity id must be a non-negative safe integer.");
  if (!Number.isSafeInteger(entity.generation) || entity.generation < 0) throw new ValidationError("ENTITY_GENERATION", "Entity generation must be a non-negative safe integer.");
}
