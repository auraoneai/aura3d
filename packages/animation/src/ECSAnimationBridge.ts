import type { AnimationValue } from "./Keyframe.js";

export type ECSAnimationComponent = Record<string, AnimationValue | undefined>;

export class ECSAnimationBridge {
  private readonly components = new Map<string, ECSAnimationComponent>();

  register(entityName: string, component: ECSAnimationComponent): void {
    if (entityName.trim().length === 0) {
      throw new Error("ECS animation target name cannot be empty.");
    }
    this.components.set(entityName, component);
  }

  unregister(entityName: string): void {
    this.components.delete(entityName);
  }

  setAnimationValue(target: string, value: AnimationValue): void {
    const [entityName, property] = target.split(".");
    if (!entityName || !property) {
      throw new Error(`Invalid ECS animation target ${target}.`);
    }
    const component = this.components.get(entityName);
    if (!component) {
      throw new Error(`Missing ECS animation target ${entityName}.`);
    }
    component[property] = Array.isArray(value) ? ([...value] as unknown as AnimationValue) : value;
  }
}
