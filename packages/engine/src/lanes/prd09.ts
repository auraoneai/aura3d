/**
 * Lane prd09 barrel — owned by lane 09 (CONTRACTS.md §3.8). Registers the
 * lane's node-handle extensions behind `A3D_QR_GAME`.
 */
import { registerNodeHandleExtension } from "../contracts/runtimeNodes.js";
import { instanceTransformsExtension } from "../agent-api/nodes/game/instanceTransforms.js";

registerNodeHandleExtension(instanceTransformsExtension);
