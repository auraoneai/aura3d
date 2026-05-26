import { ValidationError } from "@aura3d/core";
import { type ComponentSchema } from "../Component.js";

export interface SerializedActiveComponent {
  readonly activeSelf: boolean;
}

export class ActiveComponent {
  activeSelf: boolean;
  activeInHierarchy: boolean;

  constructor(active = true) {
    if (typeof active !== "boolean") throw new ValidationError("ACTIVE_COMPONENT", "ActiveComponent expects a boolean active state.");
    this.activeSelf = active;
    this.activeInHierarchy = active;
  }

  get isActive(): boolean {
    return this.activeSelf;
  }

  get isActiveInHierarchy(): boolean {
    return this.activeInHierarchy;
  }

  setActive(active: boolean): void {
    if (typeof active !== "boolean") throw new ValidationError("ACTIVE_COMPONENT", "Active state must be boolean.");
    this.activeSelf = active;
  }

  toggle(): void {
    this.activeSelf = !this.activeSelf;
  }

  toJSON(): SerializedActiveComponent {
    return { activeSelf: this.activeSelf };
  }

  static readonly schema: ComponentSchema = {
    version: 1,
    serialize(component: object): SerializedActiveComponent {
      const active = component as ActiveComponent;
      return { activeSelf: active.activeSelf };
    },
    deserialize(data: unknown): ActiveComponent {
      if (!isRecord(data) || typeof data.activeSelf !== "boolean") {
        throw new ValidationError("ACTIVE_COMPONENT_DESERIALIZE", "ActiveComponent data requires activeSelf boolean.");
      }
      return new ActiveComponent(data.activeSelf);
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
