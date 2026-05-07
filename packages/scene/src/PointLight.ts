import { ValidationError } from "@galileo3d/core";
import { Bounds3 } from "./Bounds.js";
import { Light } from "./Light.js";

export class PointLight extends Light {
  private currentRange = 10;

  constructor(name = "PointLight", id?: string) {
    super("point", name, id);
  }

  get range(): number {
    return this.currentRange;
  }

  set range(value: number) {
    if (!(value > 0) || !Number.isFinite(value)) throw new ValidationError("POINT_LIGHT_RANGE", "Point light range must be positive.");
    this.currentRange = value;
  }

  getWorldBounds(): Bounds3 {
    const p = this.transform.worldMatrix;
    return Bounds3.fromCenterSize([p[12], p[13], p[14]], [this.range * 2, this.range * 2, this.range * 2]);
  }
}
