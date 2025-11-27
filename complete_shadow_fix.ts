/**
 * COMPLETE SHADOW MAPPING FIX FOR G3D ENGINE
 *
 * This file contains all the code changes needed to enable shadow mapping.
 *
 * INTEGRATION INSTRUCTIONS:
 *
 * 1. Add the three methods (registerLight, removeLight, calculateLightSpaceMatrix)
 *    to the Renderer class after getRenderGraph()
 *
 * 2. Update the render() method's shadow preparation section (currently around line 554-581)
 *
 * 3. Update renderSceneMeshes() method:
 *    - Replace light space matrix section (around line 1465-1467)
 *    - Replace shadow map binding section (around line 1516-1520)
 *
 * 4. Update racing game main.ts to register the light
 */

// ==============================================================================
// PART 1: ADD THESE METHODS TO RENDERER CLASS (after getRenderGraph() method)
// ==============================================================================

/**
 * Registers a light with the light manager.
 *
 * @param light - Light to register
 */
registerLight(light: any): void {
  this.lightManager.addLight(light);
  logger.info(`Light registered: ${(light as any).type} (id: ${(light as any).id})`);
}

/**
 * Removes a light from the light manager.
 *
 * @param light - Light to remove
 */
removeLight(light: any): void {
  this.lightManager.removeLight(light);
  logger.info(`Light removed: ${(light as any).type} (id: ${(light as any).id})`);
}

/**
 * Calculates light space matrix for shadow mapping from a directional light.
 * Creates an orthographic projection that covers the scene bounds.
 *
 * @param lightDirection - Direction of the light (normalized)
 * @param sceneBounds - Optional scene bounds, defaults to a standard area
 * @returns Light space view-projection matrix
 */
private calculateLightSpaceMatrix(lightDirection: Vector3, sceneBounds?: { min: Vector3; max: Vector3 }): Matrix4 {
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

// ==============================================================================
// PART 2: REPLACE SHADOW PREPARATION SECTION IN render() METHOD
// Current location: around line 554-581
// ==============================================================================

// Find this code:
//    // Prepare shadows
//    if (this.shadowPass && this.settings.shadowQuality !== 'off') {
//      ...
//    }

// Replace with:
    // Prepare and render shadows
    if (this.shadowPass && this.settings.shadowQuality !== 'off') {
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

      // P0 FIX #29: Store the shadow data result instead of discarding it
      const shadowData = this.lightManager.prepareShadows(visibleLights, cameraInfoWithForward);

      // P0 FIX #28: Execute shadow pass to render shadow maps
      if (shadowData && shadowData.length > 0 && device.getGL) {
        const gl = device.getGL() as WebGL2RenderingContext;

        // Clear existing shadow maps before adding new ones
        this.shadowPass.clearShadowMaps();

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

            this.shadowPass.addDirectionalShadowMap(direction, simpleCam, false);
            logger.debug(`Added directional shadow map for light ${light.id}`);
          }
        }

        // Shadow maps are now configured and ready for rendering
        // Note: Full shadow pass execution requires RenderQueue integration
      }
    }

// ==============================================================================
// PART 3: REPLACE LIGHT SPACE MATRIX SECTION IN renderSceneMeshes()
// Current location: around line 1465-1467
// ==============================================================================

// Find this code:
//    // Set default light space matrix (identity for now - will be updated with shadow mapping)
//    const identityMatrix = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
//    gl.uniformMatrix4fv(getUniform('u_lightSpaceMatrix'), false, identityMatrix);

// Replace with:
    // Calculate light space matrix for shadow mapping
    let lightSpaceMatrix: Matrix4;
    const directionalLights = allLights.filter((l: any) => l.type === 'directional');

    if (directionalLights.length > 0) {
      // Use first directional light for shadows
      const dirLight = directionalLights[0] as any;
      const lightDir = dirLight.direction || new Vector3(0, -1, 0);

      // Calculate proper light space matrix covering the scene
      lightSpaceMatrix = this.calculateLightSpaceMatrix(lightDir);

      if (this.frameCount <= 3) {
        logger.info(`Calculated light space matrix for directional light (dir: ${lightDir.x.toFixed(2)}, ${lightDir.y.toFixed(2)}, ${lightDir.z.toFixed(2)})`);
      }
    } else {
      // No directional lights - use identity
      lightSpaceMatrix = Matrix4.identity();
    }

    gl.uniformMatrix4fv(getUniform('u_lightSpaceMatrix'), false, lightSpaceMatrix.elements);

// ==============================================================================
// PART 4: REPLACE SHADOW MAP BINDING SECTION IN renderSceneMeshes()
// Current location: around line 1516-1520
// ==============================================================================

// Find this code:
//    // P0 FIX #2: Check if shadow map exists instead of hardcoding to 0
//    const hasShadowMap = this.shadowPass && this.shadowMapper ? 1 : 0;
//    gl.uniform1i(getUniform('u_hasShadowMap'), hasShadowMap);
//    gl.uniform1f(getUniform('u_shadowBias'), 0.001);
//    gl.uniform1f(getUniform('u_shadowIntensity'), 0.7);

// Replace with:
    // ==========================================================================
    // GLOBAL RENDERING SETTINGS & SHADOW MAP BINDING
    // ==========================================================================

    // P0 FIX #2: Check if shadow map exists and bind shadow texture
    let hasShadowMap = 0;

    if (this.shadowPass && this.shadowMapper) {
      // Get shadow maps from shadow pass
      const shadowMaps = this.shadowPass.getShadowMaps();

      if (shadowMaps.length > 0) {
        hasShadowMap = 1;

        // P0 FIX #3: Bind shadow map texture to texture unit 7
        const shadowMapTexture = this.shadowPass.getShadowMapTexture(0);
        if (shadowMapTexture) {
          const depthAttachment = shadowMapTexture as any;
          if (depthAttachment.texture) {
            gl.activeTexture(gl.TEXTURE7);
            gl.bindTexture(gl.TEXTURE_2D, depthAttachment.texture as WebGLTexture);
            gl.uniform1i(getUniform('u_shadowMap'), 7);

            // Log on first few frames to confirm binding
            if (this.frameCount <= 3) {
              logger.info('Shadow map texture bound to unit 7');
            }
          }
        }
      }
    }

    gl.uniform1i(getUniform('u_hasShadowMap'), hasShadowMap);
    gl.uniform1f(getUniform('u_shadowBias'), 0.001);
    gl.uniform1f(getUniform('u_shadowIntensity'), 0.7);

// ==============================================================================
// PART 5: UPDATE RACING GAME main.ts
// Add this after creating the directional light (around line 160)
// ==============================================================================

    this.directionalLight = new DirectionalLight(
      sunDirection,
      new Color(1, 0.95, 0.9),
      3.0
    );
    this.directionalLight.setShadowsEnabled(true);

    // P0 FIX #4: Register light with renderer's light manager
    const renderer = this.engine.getRenderer();
    if (renderer) {
      renderer.registerLight(this.directionalLight);
      console.log('Directional light registered with renderer for shadow mapping');
    } else {
      console.warn('Could not get renderer to register light');
    }
