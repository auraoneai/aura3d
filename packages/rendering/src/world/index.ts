/**
 * PRD-10 world rendering barrel (`@aura3d/rendering/world`): lane modules the
 * engine/production runtime compose. Shader chunks stay registered through
 * `lanes/prd10`.
 */
export * from "./terrain/TerrainHeightTexture.js";
export * from "./terrain/TerrainCdlod.js";
export * from "./terrain/TerrainPatchGeometry.js";
export * from "./terrain/shaders/terrainCdlod.js";
export * from "./terrain/shaders/terrainSplat.js";
export * from "./terrain/shaders/terrain.vert.glsl.js";
