import { ValidationError } from "@galileo3d/core";
import { componentName, type ComponentCtor, type ComponentSchema, type ComponentType } from "./Component.js";

export class ComponentRegistry {
  private nextId = 0;
  private readonly byCtor = new Map<ComponentCtor, ComponentType>();
  private readonly byName = new Map<string, ComponentType>();

  register<T extends object>(ctor: ComponentCtor<T>, schema?: ComponentSchema): ComponentType<T> {
    const name = componentName(ctor);
    const existingByCtor = this.byCtor.get(ctor);
    if (existingByCtor) return existingByCtor as ComponentType<T>;
    if (this.byName.has(name)) throw new ValidationError("DUPLICATE_COMPONENT", `Duplicate component name: ${name}`);
    const type: ComponentType<T> = { id: this.nextId, name, ctor, schema: schema ?? ctor.schema ?? { version: 1 } };
    this.nextId += 1;
    this.byCtor.set(ctor, type as ComponentType);
    this.byName.set(name, type as ComponentType);
    return type;
  }

  get<T extends object>(ctor: ComponentCtor<T>): ComponentType<T> | undefined {
    return this.byCtor.get(ctor) as ComponentType<T> | undefined;
  }

  require<T extends object>(ctor: ComponentCtor<T>): ComponentType<T> {
    const type = this.get(ctor);
    if (!type) throw new ValidationError("UNREGISTERED_COMPONENT", `Component is not registered: ${componentName(ctor)}`);
    return type;
  }

  getByName(name: string): ComponentType | undefined {
    return this.byName.get(name);
  }

  list(): ComponentType[] {
    return [...this.byCtor.values()].sort((a, b) => a.id - b.id);
  }
}
