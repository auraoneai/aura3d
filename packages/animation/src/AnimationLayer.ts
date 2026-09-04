import type { AnimationAction } from "./AnimationAction.js";

export type AnimationLayerSnapshot = {
  readonly name: string;
  readonly weight: number;
  readonly additive: boolean;
  readonly mask: readonly string[];
  readonly actions: readonly string[];
};

export type AnimationLayerOptions = {
  readonly weight?: number;
  readonly additive?: boolean;
  readonly mask?: readonly string[];
};

export class AnimationLayer {
  readonly name: string;
  weight: number;
  additive: boolean;
  readonly mask: readonly string[];
  readonly actions: AnimationAction[] = [];
  private readonly baseWeights = new WeakMap<AnimationAction, number>();

  constructor(name: string, weightOrOptions: number | AnimationLayerOptions = 1) {
    if (name.trim().length === 0) {
      throw new Error("AnimationLayer name cannot be empty.");
    }
    this.name = name;
    const options = typeof weightOrOptions === "number" ? { weight: weightOrOptions } : weightOrOptions;
    this.weight = options.weight ?? 1;
    this.additive = options.additive ?? false;
    this.mask = [...(options.mask ?? [])];
    if (!Number.isFinite(this.weight) || this.weight < 0) {
      throw new Error("AnimationLayer weight must be finite and non-negative.");
    }
    for (const entry of this.mask) {
      if (entry.trim().length === 0) {
        throw new Error("AnimationLayer mask entries cannot be empty.");
      }
    }
  }

  add(action: AnimationAction): void {
    if (!action || typeof (action as AnimationAction).setWeight !== "function") {
      throw new Error(`AnimationLayer.add: action must be an AnimationAction (layer "${this.name}").`);
    }
    if (this.actions.includes(action)) {
      console.warn(`AnimationLayer.add: action for clip "${action.clip.name}" is already on layer "${this.name}"; ignoring the duplicate.`);
      return;
    }
    this.actions.push(action);
    this.baseWeights.set(action, action.weight);
  }

  setWeight(weight: number): void {
    if (!Number.isFinite(weight) || weight < 0) {
      throw new Error("AnimationLayer.setWeight: weight must be finite and non-negative.");
    }
    this.weight = weight;
  }

  applyWeight(): void {
    if (!Number.isFinite(this.weight) || this.weight < 0) {
      throw new Error(`AnimationLayer.applyWeight: layer "${this.name}" weight is invalid; call AnimationLayer.setWeight with a finite non-negative value.`);
    }
    if (this.actions.length === 0) {
      console.warn(`AnimationLayer.applyWeight: layer "${this.name}" has no actions; nothing to weight.`);
      return;
    }
    for (const action of this.actions) {
      action.setWeight((this.baseWeights.get(action) ?? action.weight) * this.weight);
    }
  }

  capturesTarget(target: string): boolean {
    if (typeof target !== "string" || target.length === 0) {
      throw new Error("AnimationLayer.capturesTarget: target must be a non-empty string.");
    }
    if (this.mask.length === 0) {
      return true;
    }
    return this.mask.some((entry) => target === entry || target.startsWith(`${entry}.`));
  }

  snapshot(): AnimationLayerSnapshot {
    return {
      name: this.name,
      weight: this.weight,
      additive: this.additive,
      mask: [...this.mask],
      actions: this.actions.map((action) => action.clip.name)
    };
  }
}
