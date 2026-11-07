import type { Vec3 } from "./math.js";
import type { InternalLightHandle } from "../internal/secret.js";

export interface DirectionalLightOptions {
  position?: Vec3;
  /** Light intensity. @default 1.5 */
  intensity?: number;
  shadow?: boolean;
}

/** Light builders. Defaults: intensity 1.5, color #ffffff. */
export declare const lights: {
  directional(options?: DirectionalLightOptions): InternalLightHandle;
};
