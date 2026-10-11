/**
 * Lane prd10 barrel (CONTRACTS.md §3.8, PRD-10 §8.0): registers every
 * `a3d_prd10_*` C-02 ShaderChunk — GLSL ES 3.00 body + hand-written WGSL twin.
 * Chunk bodies live under `world/** /shaders/`; the list and the explicit
 * entry point live in `world/chunks.ts` (exported via `@aura3d/rendering/world`).
 */
import { registerPrd10Chunks } from "../world/chunks.js";

export { prd10ShaderChunks, registerPrd10Chunks } from "../world/chunks.js";

registerPrd10Chunks();
