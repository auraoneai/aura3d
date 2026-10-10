/**
 * Lane prd09 barrel — owned by lane 09 (CONTRACTS.md §3.8). Registers the
 * lane's node-handle extensions behind `A3D_QR_GAME`.
 */
import { registerNodeHandleExtension } from "../contracts/runtimeNodes.js";
import { instanceTransformsExtension } from "../agent-api/nodes/game/instanceTransforms.js";
import { gameSoundSlot } from "../contracts/gameSound.js";
import { createGameSoundEngine } from "@aura3d/audio";

registerNodeHandleExtension(instanceTransformsExtension);

// C-25 (09-CONF): provide the real game-sound engine; `gameSoundSlot.get()`
// returns it only for A3D_QR_GAME-on apps — flag-off stays on the stub.
gameSoundSlot.provide(createGameSoundEngine);
