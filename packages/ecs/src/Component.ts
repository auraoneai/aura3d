import { ValidationError } from "@aura3d/core";

export interface ComponentCtor<T = object> {
  readonly prototype: T;
  readonly name: string;
  readonly schema?: ComponentSchema;
}

export interface ComponentSchema {
  readonly version: number;
  serialize?(component: object): unknown;
  deserialize?(data: unknown): object;
}

export interface ComponentType<T = object> {
  readonly id: number;
  readonly name: string;
  readonly ctor: ComponentCtor<T>;
  readonly schema: ComponentSchema;
}

export function componentName(ctor: ComponentCtor): string {
  if (!ctor.name) throw new ValidationError("COMPONENT_NAME", "Component classes must have a stable name.");
  return ctor.name;
}
