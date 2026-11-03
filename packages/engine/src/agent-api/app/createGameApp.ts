// 4.x compatibility entry: its static bootstrap preserves synchronous physics.
import type { AuraApp, AuraAppTarget, AuraCreateGameAppOptions } from "../nodes/types.js";
import type { GameAppRuntime } from "../GameAppRuntime.js";
import { legacyPhysicsWorldAccess } from "../../public/legacy-physics-access.js";
import { createGameAppWithPhysicsWorldAccess } from "./createGameAppCore.js";

export { createGameAppWithPhysicsWorldAccess } from "./createGameAppCore.js";

export function createGameApp(target: AuraAppTarget, options: AuraCreateGameAppOptions): GameAppRuntime<AuraApp> {
  return createGameAppWithPhysicsWorldAccess(legacyPhysicsWorldAccess, target, options);
}
