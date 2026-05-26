import { ValidationError } from "@aura3d/core";
import { type Vector3 } from "@aura3d/math";
import { type Vec3 } from "./MathTypes.js";
import { SceneNode } from "./SceneNode.js";

export type LightKind = "directional" | "point" | "spot";

export abstract class Light extends SceneNode {
  readonly kind: LightKind;
  color: Vec3 | Vector3 = [1, 1, 1];
  castsShadow = false;
  private currentIntensity = 1;

  protected constructor(kind: LightKind, name: string, id?: string) {
    super({ id, name });
    this.kind = kind;
  }

  get intensity(): number {
    return this.currentIntensity;
  }

  set intensity(value: number) {
    if (!(value >= 0) || !Number.isFinite(value)) throw new ValidationError("LIGHT_INTENSITY", "Light intensity must be a finite non-negative number.");
    this.currentIntensity = value;
  }
}
