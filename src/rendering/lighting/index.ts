/**
 * @module Rendering/Lighting
 * @description
 * Comprehensive lighting system for the G3D rendering engine.
 *
 * This module provides a complete lighting solution with support for:
 *
 * **Light Types:**
 * - DirectionalLight: Infinite distance lights (sun, moon) with cascaded shadow maps
 * - PointLight: Omnidirectional lights (bulbs, candles) with spherical attenuation
 * - SpotLight: Cone-shaped lights (flashlights, stage lights) with projective textures
 * - AreaLight: Surface-based lights (windows, panels) using LTC integration
 * - LightProbe: Environment lights with spherical harmonics and cubemap reflections
 *
 * **Shadow Mapping:**
 * - Cascaded shadow maps for directional lights
 * - Cubemap shadows for point lights
 * - Single shadow maps for spot lights
 * - Shadow atlas management with automatic allocation
 * - Multiple filtering techniques (PCF, PCSS, VSM, ESM)
 * - Temporal stabilization to reduce flickering
 *
 * **Light Management:**
 * - Frustum culling for efficient rendering
 * - Tiled and clustered light culling
 * - Light sorting by priority, distance, or contribution
 * - Performance budgets with automatic LOD
 * - GPU buffer packing for efficient rendering
 *
 * **Physical Units:**
 * - Lumens: Total luminous flux (point/area lights)
 * - Candela: Luminous intensity (spot lights)
 * - Lux: Illuminance (directional lights)
 * - Nits: Luminance (area lights)
 *
 * @example
 * ```typescript
 * import {
 *   LightManager,
 *   DirectionalLight,
 *   PointLight,
 *   SpotLight,
 *   LightUnit,
 *   ShadowQuality,
 *   CullingStrategy,
 * } from './rendering/lighting';
 *
 * // Create light manager
 * const lightManager = new LightManager({
 *   cullingStrategy: CullingStrategy.Clustered,
 *   budget: {
 *     maxDirectional: 4,
 *     maxPoint: 64,
 *     maxSpot: 32,
 *     maxShadowCasters: 8,
 *   },
 * });
 *
 * // Create sun
 * const sun = new DirectionalLight();
 * sun.direction = new Vector3(0.3, -1, 0.2).normalize();
 * sun.setIntensity(100000, LightUnit.Lux);
 * sun.setTemperature(5778);
 * sun.setShadowsEnabled(true);
 * sun.cascadeConfig.count = 4;
 * lightManager.addLight(sun);
 *
 * // Create point light
 * const bulb = new PointLight(new Vector3(0, 2, 0));
 * bulb.setIntensity(800, LightUnit.Lumens);
 * bulb.range = 10;
 * bulb.color = new Color(1, 0.9, 0.7);
 * lightManager.addLight(bulb);
 *
 * // Create spot light
 * const flashlight = new SpotLight();
 * flashlight.position = new Vector3(5, 1, 0);
 * flashlight.direction = new Vector3(-1, -0.5, 0).normalize();
 * flashlight.setAngles(15, 25);
 * flashlight.setIntensity(1000, LightUnit.Candela);
 * flashlight.setShadowsEnabled(true);
 * lightManager.addLight(flashlight);
 *
 * // Each frame
 * lightManager.update(deltaTime);
 * const visibleLights = lightManager.cullLights(camera);
 * const lightBuffer = lightManager.packLightData(visibleLights);
 * const shadowData = lightManager.prepareShadows(visibleLights, camera);
 *
 * // Render with lights
 * device.updateBuffer(lightBufferGPU, lightBuffer.data);
 * renderScene(visibleLights, shadowData);
 * ```
 *
 * **Key Features:**
 *
 * 1. **Physical Light Units**
 *    - Realistic lighting calculations using physical units
 *    - Automatic unit conversions for rendering
 *    - Color temperature support (Kelvin to RGB)
 *
 * 2. **Advanced Shadow Mapping**
 *    - Cascaded shadows for large scenes
 *    - Efficient atlas management
 *    - Multiple filtering techniques
 *    - Temporal stabilization
 *
 * 3. **Performance Optimization**
 *    - Efficient culling strategies
 *    - Light budgets and LOD
 *    - GPU-friendly data packing
 *    - Minimal CPU overhead
 *
 * 4. **Flexible Architecture**
 *    - Easy to extend with new light types
 *    - Support for forward and deferred rendering
 *    - Compatible with tiled/clustered rendering
 *    - Modular shadow system
 */

// Base light class and types
export {
  Light,
  LightType,
  LightUnit,
  ShadowMode,
  ShadowQuality,
  ShadowFilter,
} from './Light';

export type {
  CullingMask,
  ShadowConfig,
} from './Light';

// Light implementations
export {
  DirectionalLight,
  CascadeSplitScheme,
} from './DirectionalLight';

export { AmbientLight } from './AmbientLight';

export type {
  CascadeConfig,
  AtmosphericScattering,
} from './DirectionalLight';

export {
  PointLight,
  AttenuationModel,
} from './PointLight';

export {
  SpotLight,
  AngularFalloffModel,
} from './SpotLight';

export type {
  ProjectiveTexture,
} from './SpotLight';

export {
  AreaLight,
  AreaLightShape,
  EmissionMode,
} from './AreaLight';

export type {
  LTCConfig,
  EmissionTexture,
} from './AreaLight';

export {
  LightProbe,
  ProbeType,
  ParallaxShape,
} from './LightProbe';

export type {
  SphericalHarmonics,
  ReflectionProbe,
  BlendConfig,
} from './LightProbe';

// Shadow mapping
export {
  ShadowMapper,
} from './ShadowMapper';

export type {
  ShadowMapConfig,
  ShadowRenderData,
} from './ShadowMapper';

// Light management
export {
  LightManager,
  CullingStrategy,
  SortMode,
} from './LightManager';

export type {
  LightBudget,
  LightManagerConfig,
  VisibleLights,
  GPULightBuffer,
} from './LightManager';
