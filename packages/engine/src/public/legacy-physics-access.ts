import * as worldModule from "@aura3d/physics/world";
import { createLegacyPhysicsWorldAccess } from "../agent-api/physics/PhysicsWorldProvider.js";

/**
 * The 4.x entry's synchronous world access. The narrow world module is a
 * static dependency, so its default top-level initialization has completed
 * before this access is published. The no-TLA condition retains its existing
 * constructor-time readiness behavior.
 *
 * This access owns its own preload state and never publishes readiness to an
 * isolated entry's provider, even though both can load the same world module.
 * @internal
 */
export const legacyPhysicsWorldAccess = createLegacyPhysicsWorldAccess(worldModule);
