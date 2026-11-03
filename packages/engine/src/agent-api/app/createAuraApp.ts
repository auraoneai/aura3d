// 4.x compatibility entry: its static bootstrap preserves synchronous physics.
import type { AuraApp, AuraAppTarget, AuraCreateAppOptions } from "../nodes/types.js";
import { legacyPhysicsWorldAccess } from "../../public/legacy-physics-access.js";
import { createAuraAppWithPhysicsWorldAccess } from "./createAuraAppCore.js";

export { createAuraAppWithPhysicsWorldAccess } from "./createAuraAppCore.js";

export function createAuraApp(target: AuraAppTarget, options: AuraCreateAppOptions): AuraApp {
  return createAuraAppWithPhysicsWorldAccess(legacyPhysicsWorldAccess, target, options);
}
