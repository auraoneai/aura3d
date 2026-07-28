import { ValidationError } from "@aura3d/core";
import { Light } from "./Light.js";

/**
 * A one-sided rectangular emitter whose local +X/+Y axes define the emitting
 * surface and whose local -Z axis defines its facing direction.
 */
export class RectAreaLight extends Light {
  private currentWidth = 1;
  private currentHeight = 1;
  private currentRange = 10;

  constructor(name = "RectAreaLight", id?: string) {
    super("rect-area", name, id);
  }

  get width(): number {
    return this.currentWidth;
  }

  set width(value: number) {
    if (!(value > 0) || !Number.isFinite(value)) {
      throw new ValidationError("RECT_AREA_LIGHT_WIDTH", "Rectangular area-light width must be positive.");
    }
    this.currentWidth = value;
  }

  get height(): number {
    return this.currentHeight;
  }

  set height(value: number) {
    if (!(value > 0) || !Number.isFinite(value)) {
      throw new ValidationError("RECT_AREA_LIGHT_HEIGHT", "Rectangular area-light height must be positive.");
    }
    this.currentHeight = value;
  }

  /**
   * Finite influence cutoff used by clustered culling and the forward shader.
   * The physical inverse-square response is unchanged inside this distance.
   */
  get range(): number {
    return this.currentRange;
  }

  set range(value: number) {
    if (!(value > 0) || !Number.isFinite(value)) {
      throw new ValidationError("RECT_AREA_LIGHT_RANGE", "Rectangular area-light range must be positive.");
    }
    this.currentRange = value;
  }
}
