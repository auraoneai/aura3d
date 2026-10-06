/**
 * Lane prd04 barrel — owned by lane 04 (CONTRACTS.md §3.8). `provide()` calls
 * and `register*` registrations for that lane's real implementations live
 * here.
 *
 * PR A (P1-1): registers the fifteen `a3d_prd04_*` shader chunks. This runs
 * at import time (the package index re-exports `lanes/index.js`); chunk
 * registration is registry state only — `A3D_QR_MATERIALS` and friends decide
 * whether any chunk is ever selected into a program.
 */
import { registerPrd04ShaderChunks } from "../shaders/physical/index.js";

registerPrd04ShaderChunks();

export { registerPrd04ShaderChunks };
