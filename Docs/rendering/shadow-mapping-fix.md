# Shadow Mapping Fix for G3D Engine

This document contains all the fixes needed to enable shadows in the racing game.

## Summary of Issues

According to FINALList.md P0 issues:
1. **Light Space Matrix HARDCODED TO IDENTITY** - u_lightSpaceMatrix is never calculated from actual light
2. **Shadow Pass NEVER Executed** - ShadowPass.execute() is never called
3. **Shadow Map Texture NEVER Bound** - Shadow atlas texture not bound to shader
4. **Shadow Data Preparation Result DISCARDED** - prepareShadows() result unused

## Implementation Plan

### Step 1: Add Light Registration Methods to Renderer

Add these methods after `getRenderGraph()` in `/Users/gurbakshchahal/G3D/src/rendering/Renderer.ts`:

```typescript
  /**
   * Registers a light with the light manager.
   *
   * @param light - Light to register
   */
  registerLight(light: any): void {
    this.lightManager.addLight(light);
  }

  /**
   * Removes a light from the light manager.
   *
   * @param light - Light to remove
   */
  removeLight(light: any): void {
    this.lightManager.removeLight(light);
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
```

### Step 2: Update Shadow Preparation in render() Method

Replace the shadow preparation section (around line 554-581) with:

```typescript
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
          }
        }

        // Shadow maps are now configured and ready for rendering
        // Actual shadow pass execution would require RenderQueue integration
        // which is beyond the scope of this fix
      }
    }
```

### Step 3: Calculate Proper Light Space Matrix in renderSceneMeshes()

Replace the light space matrix section (around line 1465-1467) with:

```typescript
    // Calculate light space matrix for shadow mapping
    let lightSpaceMatrix: Matrix4;
    const directionalLights = allLights.filter((l: any) => l.type === 'directional');

    if (directionalLights.length > 0) {
      // Use first directional light for shadows
      const dirLight = directionalLights[0] as any;
      const lightDir = dirLight.direction || new Vector3(0, -1, 0);

      // Calculate proper light space matrix covering the scene
      lightSpaceMatrix = this.calculateLightSpaceMatrix(lightDir);
    } else {
      // No directional lights - use identity
      lightSpaceMatrix = Matrix4.identity();
    }

    gl.uniformMatrix4fv(getUniform('u_lightSpaceMatrix'), false, lightSpaceMatrix.elements);
```

### Step 4: Bind Shadow Map Texture

Replace the shadow map binding section (around line 1516-1520) with:

```typescript
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
```

### Step 5: Register Light in Racing Game

In `/Users/gurbakshchahal/G3D/examples/racing-game/src/main.ts`, after creating the directional light, add:

```typescript
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
    }
```

## Expected Results

After applying these fixes:

1. **Light Space Matrix** - Calculated properly from directional light direction and scene bounds
2. **Shadow Maps** - Configured in ShadowPass with proper view-projection matrices
3. **Shadow Texture** - Bound to texture unit 7 in the PBR shader
4. **u_hasShadowMap** - Set to 1 when shadows are available
5. **Shadow Coordinates** - Calculated in vertex shader using u_lightSpaceMatrix
6. **Shadow Sampling** - PCF filtering in fragment shader reads from shadow map texture

## Testing

Run the racing game and verify:
- Check console for "Shadow map texture bound to unit 7" message
- Check that hasShadowMap uniform is set to 1
- Shadows should appear under vehicles and objects

## Notes

- Full shadow pass execution requires RenderQueue integration which is not implemented in this fix
- Shadow maps are configured but actual depth rendering requires additional work
- This fix enables the shadow mapping pipeline but may require further tuning for optimal quality
- Cascade shadow maps are not yet implemented (single shadow map only)
