import { SetPropertyCommand } from "./commands/SetPropertyCommand";

export type InspectorEditableValue = number | string | boolean;

export interface InspectorProperty {
  readonly path: readonly string[];
  readonly type: "number" | "string" | "boolean" | "object";
  readonly value: unknown;
  readonly editable: boolean;
}

export class InspectorModel {
  describe(target: object): readonly InspectorProperty[] {
    return this.describeObject(target);
  }

  createSetPropertyCommand<T extends object>(
    target: T,
    path: readonly string[],
    value: InspectorEditableValue
  ): SetPropertyCommand<T> {
    const property = this.describe(target).find((descriptor) => samePath(descriptor.path, path));
    if (!property) {
      throw new Error(`Inspector property path does not exist: ${path.join(".")}`);
    }
    if (!property.editable) {
      throw new Error(`Inspector property is not editable: ${path.join(".")}`);
    }
    this.assertValueMatchesProperty(property, value);
    return new SetPropertyCommand(target, path, value);
  }

  private describeObject(target: object, prefix: readonly string[] = []): InspectorProperty[] {
    const properties: InspectorProperty[] = [];
    for (const [key, value] of Object.entries(target)) {
      const path = [...prefix, key];
      const type = this.propertyType(value);
      properties.push({
        path,
        type,
        value,
        editable: type !== "object"
      });
      if (type === "object" && value !== null && !Array.isArray(value)) {
        properties.push(...this.describeObject(value as object, path));
      }
    }
    return properties;
  }

  private propertyType(value: unknown): InspectorProperty["type"] {
    const valueType = typeof value;
    if (valueType === "number" || valueType === "string" || valueType === "boolean") {
      return valueType;
    }
    return "object";
  }

  private assertValueMatchesProperty(property: InspectorProperty, value: InspectorEditableValue): void {
    if (property.type === "number" && !Number.isFinite(value)) {
      throw new Error(`Inspector property ${property.path.join(".")} expected a finite number.`);
    }
    if (typeof value !== property.type) {
      throw new Error(`Inspector property ${property.path.join(".")} expected ${property.type}, got ${typeof value}.`);
    }
  }
}

function samePath(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((segment, index) => segment === right[index]);
}
