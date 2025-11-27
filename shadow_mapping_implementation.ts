/**
 * Shadow Mapping Implementation Fix
 *
 * This file contains the complete implementation of shadow mapping fixes
 * for the G3D engine. Copy and integrate these functions into Renderer.ts.
 */

import { Vector3 } from './math/Vector3';
import { Matrix4 } from './math/Matrix4';
import { Logger } from './core/Logger';

const logger = Logger.create('ShadowMapping');

/**
 * Calculates light space matrix for shadow mapping from a directional light.
 * Creates an orthographic projection that covers the scene bounds.
 *
 * ADD THIS TO RENDERER CLASS (after getRenderGraph() method)
 *
 * @param lightDirection - Direction of the light (normalized)
 * @param sceneBounds - Optional scene bounds, defaults to a standard area
 * @returns Light space view-projection matrix
 */
export function calculateLightSpaceMatrix(
  lightDirection: Vector3,
  sceneBounds?: { min: Vector3; max: Vector3 }
): Matrix4 {
  // Use default scene bounds if not provided (assume racing game scene near origin)
  const bounds = sceneBounds || {
    min: new Vector3(-200, -10, -200),
    max: new Vector3(200, 50, 200)
  };

  // Calculate scene center
  const center = new Vector3(
    (bounds.min.x + bounds.max.x) * 0.5,
    (bounds.min.y + bounds.max.y) * 0.5,
    (bounds.min.z + bounds.max.z) * 0.5
  );

  // Calculate scene extent and radius
  const extent = new Vector3(
    bounds.max.x - bounds.min.x,
    bounds.max.y - bounds.min.y,
    bounds.max.z - bounds.min.z
  );
  const radius = Math.sqrt(extent.x * extent.x + extent.y * extent.y + extent.z * extent.z) * 0.5;

  // Position light far enough to cover entire scene
  const lightDistance = radius * 2;
  const lightPosition = center.sub(lightDirection.scale(lightDistance));

  // Create view matrix looking from light position to scene center
  const lightView = Matrix4.lookAt(lightPosition, center, Vector3.up());

  // Create orthographic projection covering the scene
  const size = radius;
  const lightProjection = Matrix4.orthographic(-size, size, -size, size, 0.1, lightDistance * 2 + radius);

  // Combine into light space matrix
  return lightProjection.multiply(lightView);
}

/**
 * Registers a light with the renderer's light manager.
 * ADD THIS TO RENDERER CLASS (as public method)
 */
export function registerLight(lightManager: any, light: any): void {
  lightManager.addLight(light);
  logger.info(`Light registered: ${light.type} (id: ${light.id})`);
}

/**
 * Removes a light from the renderer's light manager.
 * ADD THIS TO RENDERER CLASS (as public method)
 */
export function removeLight(lightManager: any, light: any): void {
  lightManager.removeLight(light);
  logger.info(`Light removed: ${light.type} (id: ${light.id})`);
}

/**
 * Sets up shadow maps for visible lights.
 * REPLACE the shadow preparation section in render() method (around line 554-581)
 */
export function setupShadowMaps(
  shadowPass: any,
  lightManager: any,
  visibleLights: any[],
  camera: any,
  device: any,
  settings: any
): void {
  if (!shadowPass || settings.shadowQuality === 'off') {
    return;
  }

  // Calculate forward vector from view matrix
  const forward = new Vector3(
    -camera.viewMatrix.elements[8],
    -camera.viewMatrix.elements[9],
    -camera.viewMatrix.elements[10]
  ).normalize();

  const cameraInfoWithForward = {
    position: camera.transform.worldPosition,
    viewMatrix: camera.viewMatrix,
    projectionMatrix: camera.projectionMatrix,
    fov: camera.fov,
    aspect: camera.aspect,
    forward: forward,
  };

  // P0 FIX #29: Store the shadow data result
  const shadowData = lightManager.prepareShadows(visibleLights, cameraInfoWithForward);

  // P0 FIX #28: Execute shadow pass to render shadow maps
  if (shadowData && shadowData.length > 0 && device.getGL) {
    const gl = device.getGL() as WebGL2RenderingContext;

    // Clear existing shadow maps before adding new ones
    shadowPass.clearShadowMaps();

    // Add shadow maps for each light
    for (const data of shadowData) {
      const light = data.light as any;

      if (light.type === 'directional') {
        // Add directional light shadow map
        const direction = light.direction || new Vector3(0, -1, 0);

        // Use a simple camera wrapper for the shadow pass
        const simpleCam = {
          near: 0.1,
          far: 500,
          transform: camera.transform
        } as any;

        shadowPass.addDirectionalShadowMap(direction, simpleCam, false);
        logger.debug(`Added directional shadow map for light ${light.id}`);
      }
    }
  }
}

/**
 * Calculates and sets light space matrix for shaders.
 * REPLACE the light space matrix section in renderSceneMeshes() (around line 1465-1467)
 */
export function setupLightSpaceMatrix(
  gl: WebGL2RenderingContext,
  uniformLocation: WebGLUniformLocation | null,
  allLights: any[],
  calculateLightSpaceMatrixFn: (dir: Vector3) => Matrix4
): void {
  let lightSpaceMatrix: Matrix4;
  const directionalLights = allLights.filter((l: any) => l.type === 'directional');

  if (directionalLights.length > 0) {
    // Use first directional light for shadows
    const dirLight = directionalLights[0] as any;
    const lightDir = dirLight.direction || new Vector3(0, -1, 0);

    // Calculate proper light space matrix covering the scene
    lightSpaceMatrix = calculateLightSpaceMatrixFn(lightDir);
  } else {
    // No directional lights - use identity
    lightSpaceMatrix = Matrix4.identity();
  }

  gl.uniformMatrix4fv(uniformLocation, false, lightSpaceMatrix.elements);
}

/**
 * Binds shadow map texture to shader.
 * REPLACE the shadow map binding section in renderSceneMeshes() (around line 1516-1520)
 */
export function bindShadowMapTexture(
  gl: WebGL2RenderingContext,
  shadowPass: any,
  shadowMapper: any,
  getUniform: (name: string) => WebGLUniformLocation | null,
  frameCount: number
): number {
  let hasShadowMap = 0;

  if (shadowPass && shadowMapper) {
    // Get shadow maps from shadow pass
    const shadowMaps = shadowPass.getShadowMaps();

    if (shadowMaps.length > 0) {
      hasShadowMap = 1;

      // P0 FIX #3: Bind shadow map texture to texture unit 7
      const shadowMapTexture = shadowPass.getShadowMapTexture(0);
      if (shadowMapTexture) {
        const depthAttachment = shadowMapTexture as any;
        if (depthAttachment.texture) {
          gl.activeTexture(gl.TEXTURE7);
          gl.bindTexture(gl.TEXTURE_2D, depthAttachment.texture as WebGLTexture);
          gl.uniform1i(getUniform('u_shadowMap'), 7);

          // Log on first few frames to confirm binding
          if (frameCount <= 3) {
            logger.info('Shadow map texture bound to unit 7');
          }
        }
      }
    }
  }

  gl.uniform1i(getUniform('u_hasShadowMap'), hasShadowMap);
  gl.uniform1f(getUniform('u_shadowBias'), 0.001);
  gl.uniform1f(getUniform('u_shadowIntensity'), 0.7);

  return hasShadowMap;
}

/**
 * Example integration in racing game main.ts
 * ADD THIS after creating the directional light
 */
export function registerLightWithRenderer(engine: any, light: any): void {
  const renderer = engine.getRenderer();
  if (renderer && renderer.registerLight) {
    renderer.registerLight(light);
    console.log(`Directional light registered with renderer for shadow mapping`);
  } else {
    console.warn('Renderer does not support registerLight() - shadows may not work');
  }
}
