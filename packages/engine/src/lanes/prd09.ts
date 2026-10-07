/**
 * Lane prd09 barrel — owned by lane 09 (CONTRACTS.md §3.8). `provide()` calls
 * for that lane's real implementations live here.
 *
 * Day-0 (PRD-09): registers the `setInstanceTransforms` C-37 node-handle
 * extension under `A3D_QR_GAME`; the C-24 `createGame` slot is defined and
 * provided inside `@aura3d/game` (no C-24 slot exists in contracts/game.ts).
 */

import { registerPrd09InstanceTransforms } from "../agent-api/nodes/game/instanceTransforms";

export const PRD09_INSTANCE_TRANSFORMS_DISPOSE: () => void = registerPrd09InstanceTransforms();
