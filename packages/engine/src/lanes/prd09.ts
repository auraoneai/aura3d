/**
 * Lane prd09 barrel — owned by lane 09 (CONTRACTS.md §3.8). Registers the
 * lane's node-handle extensions behind `A3D_QR_GAME`.
 */
import { registerNodeHandleExtension } from "../contracts/runtimeNodes.js";
import { instanceTransformsExtension } from "../agent-api/nodes/game/instanceTransforms.js";
import { gameSoundSlot } from "../contracts/gameSound.js";
import { createGameSoundEngine } from "@aura3d/audio";
import { DIAGNOSTIC_ONLY_FIELDS as QR_DIAGNOSTIC_ONLY_FIELDS } from "../contracts/compiler.js";
import { PRD09_DIAGNOSTIC_ONLY_FIELDS } from "../agent-api/compiler/diagnosticOnly.prd09.js";

registerNodeHandleExtension(instanceTransformsExtension);

// C-25 (09-CONF): provide the real game-sound engine; `gameSoundSlot.get()`
// returns it only for A3D_QR_GAME-on apps — flag-off stays on the stub.
gameSoundSlot.provide(createGameSoundEngine);
Object.assign(QR_DIAGNOSTIC_ONLY_FIELDS as Record<string, { readonly reason: string; readonly ownerPrd: number }>, PRD09_DIAGNOSTIC_ONLY_FIELDS);
