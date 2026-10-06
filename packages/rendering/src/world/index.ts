/**
 * PRD-10 world rendering barrel (`@aura3d/rendering/world`): lane modules the
 * engine/production runtime compose. Shader chunks stay registered through
 * `lanes/prd10`.
 */
export * from "./terrain/TerrainHeightTexture.js";
export * from "./terrain/TerrainCdlod.js";
export * from "./terrain/TerrainPatchGeometry.js";
export * from "./terrain/SplatBake.js";
export * from "./terrain/shaders/terrainCdlod.js";
export * from "./terrain/shaders/terrainSplat.js";
export * from "./terrain/shaders/terrain.vert.glsl.js";
export * from "./vegetation/InstanceChunkGrid.js";
export * from "./vegetation/WindField.js";
export * from "./vegetation/FoliageMaterial.js";
export * from "./vegetation/ImpostorMaterial.js";
export * from "./vegetation/GrassField.js";
export * from "./vegetation/shaders/wind.js";
export * from "./vegetation/shaders/foliage.js";
export * from "./vegetation/shaders/impostor.js";
export * from "./vegetation/shaders/grass.js";
export * from "./water/GerstnerWaves.js";
export * from "./water/WaterMaterial.js";
export * from "./water/SceneCopyFallback.js";
export * from "./water/ReflectionViewPass.js";
export * from "./water/UnderwaterState.js";
export * from "./water/shaders/gerstner.js";
export * from "./water/shaders/water.js";
export * from "./water/shaders/caustics.js";
