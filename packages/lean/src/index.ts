import { LeanProductionRenderer } from "@aura3d/rendering/lean-runtime";
import {
  createAuraAppWithRenderer,
  type AuraLeanApp,
  type AuraLeanAppTarget,
  type AuraLeanCreateAppOptions
} from "./base.js";

export * from "./base.js";

export function createAuraApp(target: AuraLeanAppTarget, options: AuraLeanCreateAppOptions): AuraLeanApp {
  return createAuraAppWithRenderer(target, {
    ...options,
    rendererFactory: LeanProductionRenderer
  });
}
