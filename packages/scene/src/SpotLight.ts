import { ValidationError } from "@aura3d/core";
import { Light } from "./Light.js";

export class SpotLight extends Light {
  private currentAngle = Math.PI / 4;
  private currentPenumbra = 0;
  private currentRange = 10;

  constructor(name = "SpotLight", id?: string) {
    super("spot", name, id);
  }

  get angle(): number {
    return this.currentAngle;
  }

  set angle(value: number) {
    if (!(value > 0 && value < Math.PI / 2)) throw new ValidationError("SPOT_LIGHT_ANGLE", "Spot light angle must be within (0, PI / 2).");
    this.currentAngle = value;
  }

  get penumbra(): number {
    return this.currentPenumbra;
  }

  set penumbra(value: number) {
    if (!(value >= 0 && value <= 1)) throw new ValidationError("SPOT_LIGHT_PENUMBRA", "Spot light penumbra must be within [0, 1].");
    this.currentPenumbra = value;
  }

  get range(): number {
    return this.currentRange;
  }

  set range(value: number) {
    if (!(value > 0) || !Number.isFinite(value)) throw new ValidationError("SPOT_LIGHT_RANGE", "Spot light range must be positive.");
    this.currentRange = value;
  }
}
