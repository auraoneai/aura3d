/**
 * @module Rendering/Lighting
 * @description
 * Light probe implementation for environment lighting using spherical harmonics
 * and cubemap reflections with parallax correction.
 */

import { Vector3 } from '../../math/Vector3';
import { Color } from '../../math/Color';
import { Box3 } from '../../math/Box3';
import { Sphere } from '../../math/Sphere';
import { Matrix4 } from '../../math/Matrix4';
import { Light, LightType } from './Light';
import { Logger } from '../../core/Logger';

const logger = Logger.create('LightProbe');

/**
 * Light probe type.
 */
export enum ProbeType {
  /** Diffuse irradiance only (spherical harmonics) */
  Irradiance = 'irradiance',
  /** Specular reflection only (cubemap) */
  Reflection = 'reflection',
  /** Both diffuse and specular */
  Full = 'full',
}

/**
 * Parallax correction volume shape.
 */
export enum ParallaxShape {
  /** No parallax correction */
  None = 'none',
  /** Box-shaped correction volume */
  Box = 'box',
  /** Sphere-shaped correction volume */
  Sphere = 'sphere',
}

/**
 * Spherical harmonics data for diffuse irradiance (9 coefficients, L2).
 * Each coefficient is an RGB color.
 */
export interface SphericalHarmonics {
  /** L0,0 coefficient (DC term) */
  l00: Color;
  /** L1,-1 coefficient */
  l1n1: Color;
  /** L1,0 coefficient */
  l10: Color;
  /** L1,1 coefficient */
  l11: Color;
  /** L2,-2 coefficient */
  l2n2: Color;
  /** L2,-1 coefficient */
  l2n1: Color;
  /** L2,0 coefficient */
  l20: Color;
  /** L2,1 coefficient */
  l21: Color;
  /** L2,2 coefficient */
  l22: Color;
}

/**
 * Reflection probe configuration (cubemap-based).
 */
export interface ReflectionProbe {
  /** Enable reflection probe */
  enabled: boolean;
  /** Cubemap texture ID */
  cubemapId: number | null;
  /** Resolution of cubemap face */
  resolution: number;
  /** Number of mip levels for roughness */
  mipLevels: number;
  /** Intensity multiplier for reflections */
  intensity: number;
  /** Enable box projection for parallax correction */
  boxProjection: boolean;
}

/**
 * Probe blending configuration.
 */
export interface BlendConfig {
  /** Blend weight [0, 1] */
  weight: number;
  /** Blend distance (fade region) */
  blendDistance: number;
  /** Priority for blending order */
  priority: number;
}

/**
 * Light probe class for environment lighting.
 *
 * Light probes capture the lighting environment at a point in space and provide
 * both diffuse irradiance (via spherical harmonics) and specular reflections
 * (via cubemaps). They enable realistic ambient lighting and reflections.
 *
 * Key features:
 * - Spherical harmonics for fast diffuse lighting
 * - Cubemap reflections with roughness mipmaps
 * - Parallax correction for accurate reflections in confined spaces
 * - Blend zones for smooth transitions between probes
 * - Influence volumes (box or sphere)
 *
 * @example
 * ```typescript
 * // Create a full light probe
 * const probe = new LightProbe();
 * probe.position = new Vector3(0, 1, 0);
 * probe.setInfluenceVolume(new Vector3(10, 5, 10)); // 10x5x10m box
 *
 * // Set spherical harmonics (usually generated from HDR environment)
 * probe.sphericalHarmonics = generateSHFromHDR(hdrTexture);
 *
 * // Enable reflection with parallax correction
 * probe.reflectionProbe.enabled = true;
 * probe.reflectionProbe.cubemapId = cubemapId;
 * probe.reflectionProbe.boxProjection = true;
 * probe.parallaxShape = ParallaxShape.Box;
 * probe.parallaxVolume = new Box3(
 *   new Vector3(-5, 0, -5),
 *   new Vector3(5, 5, 5)
 * );
 *
 * // Configure blending
 * probe.blendConfig.blendDistance = 2.0;
 * ```
 */
export class LightProbe extends Light {
  /**
   * Probe position in world space.
   */
  position: Vector3;

  /**
   * Probe type (irradiance, reflection, or full).
   */
  probeType: ProbeType;

  /**
   * Spherical harmonics coefficients for diffuse irradiance.
   */
  sphericalHarmonics: SphericalHarmonics;

  /**
   * Reflection probe configuration.
   */
  reflectionProbe: ReflectionProbe;

  /**
   * Influence volume shape (box or sphere).
   */
  influenceShape: ParallaxShape;

  /**
   * Influence volume size (half-extents for box, radius for sphere).
   */
  influenceSize: Vector3;

  /**
   * Parallax correction shape.
   */
  parallaxShape: ParallaxShape;

  /**
   * Parallax correction volume (in local space).
   */
  parallaxVolume: Box3 | Sphere;

  /**
   * Blend configuration.
   */
  blendConfig: BlendConfig;

  /**
   * Whether to use box projection for reflections.
   */
  useBoxProjection: boolean;

  /**
   * Creates a new LightProbe instance.
   *
   * @param position - Probe position in world space
   * @param probeType - Type of probe
   *
   * @example
   * ```typescript
   * // Full probe with both diffuse and specular
   * const probe = new LightProbe(new Vector3(0, 2, 0), ProbeType.Full);
   *
   * // Irradiance-only probe
   * const irradiance = new LightProbe(new Vector3(5, 1, 0), ProbeType.Irradiance);
   * ```
   */
  constructor(
    position: Vector3 = new Vector3(0, 0, 0),
    probeType: ProbeType = ProbeType.Full
  ) {
    super(LightType.Probe);

    this.position = position;
    this.probeType = probeType;
    this.influenceShape = ParallaxShape.Box;
    this.influenceSize = new Vector3(5, 5, 5);
    this.parallaxShape = ParallaxShape.None;
    this.parallaxVolume = new Box3(
      new Vector3(-5, -5, -5),
      new Vector3(5, 5, 5)
    );
    this.useBoxProjection = false;

    // Initialize spherical harmonics to black
    const black = new Color(0, 0, 0);
    this.sphericalHarmonics = {
      l00: black.clone(),
      l1n1: black.clone(),
      l10: black.clone(),
      l11: black.clone(),
      l2n2: black.clone(),
      l2n1: black.clone(),
      l20: black.clone(),
      l21: black.clone(),
      l22: black.clone(),
    };

    // Reflection probe configuration
    this.reflectionProbe = {
      enabled: true,
      cubemapId: null,
      resolution: 256,
      mipLevels: 7,
      intensity: 1.0,
      boxProjection: false,
    };

    // Blend configuration
    this.blendConfig = {
      weight: 1.0,
      blendDistance: 1.0,
      priority: 0,
    };

    this.label = `LightProbe_${this.id}`;
  }

  /**
   * Sets the probe position.
   *
   * @param position - New position in world space
   *
   * @example
   * ```typescript
   * probe.setPosition(new Vector3(10, 2, 5));
   * ```
   */
  setPosition(position: Vector3): void {
    this.position = position;
    this.markDirty();
  }

  /**
   * Sets the influence volume size.
   *
   * @param size - Volume size (half-extents for box, radius for sphere)
   *
   * @example
   * ```typescript
   * // Box volume: 20x10x20 meters
   * probe.setInfluenceVolume(new Vector3(10, 5, 10));
   *
   * // Sphere volume: 15 meter radius
   * probe.influenceShape = ParallaxShape.Sphere;
   * probe.setInfluenceVolume(new Vector3(15, 15, 15));
   * ```
   */
  setInfluenceVolume(size: Vector3): void {
    this.influenceSize = size;
    this.markDirty();
  }

  /**
   * Sets spherical harmonics from an array of coefficients.
   *
   * @param coefficients - Array of 27 floats (9 RGB coefficients)
   *
   * @example
   * ```typescript
   * // Coefficients from pre-computed SH
   * const shData = [
   *   // L0,0 (RGB)
   *   0.8, 0.8, 0.9,
   *   // L1,-1 (RGB)
   *   0.1, 0.1, 0.2,
   *   // ... more coefficients
   * ];
   * probe.setSphericalHarmonics(shData);
   * ```
   */
  setSphericalHarmonics(coefficients: number[]): void {
    if (coefficients.length !== 27) {
      logger.warn('Invalid SH coefficient count, expected 27 (9 RGB values)');
      return;
    }

    let i = 0;
    this.sphericalHarmonics.l00 = new Color(coefficients[i++], coefficients[i++], coefficients[i++]);
    this.sphericalHarmonics.l1n1 = new Color(coefficients[i++], coefficients[i++], coefficients[i++]);
    this.sphericalHarmonics.l10 = new Color(coefficients[i++], coefficients[i++], coefficients[i++]);
    this.sphericalHarmonics.l11 = new Color(coefficients[i++], coefficients[i++], coefficients[i++]);
    this.sphericalHarmonics.l2n2 = new Color(coefficients[i++], coefficients[i++], coefficients[i++]);
    this.sphericalHarmonics.l2n1 = new Color(coefficients[i++], coefficients[i++], coefficients[i++]);
    this.sphericalHarmonics.l20 = new Color(coefficients[i++], coefficients[i++], coefficients[i++]);
    this.sphericalHarmonics.l21 = new Color(coefficients[i++], coefficients[i++], coefficients[i++]);
    this.sphericalHarmonics.l22 = new Color(coefficients[i++], coefficients[i++], coefficients[i++]);

    this.markDirty();
  }

  /**
   * Evaluates spherical harmonics for a given direction.
   *
   * @param direction - World space direction (normalized)
   * @returns Irradiance color for that direction
   *
   * @example
   * ```typescript
   * const normal = new Vector3(0, 1, 0); // Surface facing up
   * const irradiance = probe.evaluateSH(normal);
   * ```
   */
  evaluateSH(direction: Vector3): Color {
    const x = direction.x;
    const y = direction.y;
    const z = direction.z;

    // L0 band
    const sh0 = 0.282095; // sqrt(1/(4*pi))
    let result = this.sphericalHarmonics.l00.scale(sh0);

    // L1 band
    const sh1 = 0.488603; // sqrt(3/(4*pi))
    result = result.add(this.sphericalHarmonics.l1n1.scale(sh1 * y));
    result = result.add(this.sphericalHarmonics.l10.scale(sh1 * z));
    result = result.add(this.sphericalHarmonics.l11.scale(sh1 * x));

    // L2 band
    const sh20 = 0.315392; // sqrt(5/(16*pi))
    const sh21 = 0.546274; // sqrt(15/(4*pi))
    const sh22 = 0.590044; // sqrt(15/(16*pi))

    result = result.add(this.sphericalHarmonics.l2n2.scale(sh22 * x * y));
    result = result.add(this.sphericalHarmonics.l2n1.scale(sh21 * y * z));
    result = result.add(this.sphericalHarmonics.l20.scale(sh20 * (3 * z * z - 1)));
    result = result.add(this.sphericalHarmonics.l21.scale(sh21 * x * z));
    result = result.add(this.sphericalHarmonics.l22.scale(sh22 * (x * x - y * y)));

    return result;
  }

  /**
   * Calculates blend weight for a world position.
   *
   * @param worldPosition - Position to evaluate
   * @returns Blend weight [0, 1]
   *
   * @example
   * ```typescript
   * const weight = probe.calculateBlendWeight(surfacePosition);
   * const irradiance = probe.evaluateSH(normal).scale(weight);
   * ```
   */
  calculateBlendWeight(worldPosition: Vector3): number {
    const localPos = worldPosition.sub(this.position);

    if (this.influenceShape === ParallaxShape.Sphere) {
      // Sphere influence
      const distance = localPos.length();
      const radius = this.influenceSize.x; // Use x component as radius

      if (distance > radius) return 0;

      // Smooth falloff
      const blendStart = radius - this.blendConfig.blendDistance;
      if (distance < blendStart) return 1;

      const t = (distance - blendStart) / this.blendConfig.blendDistance;
      return 1 - t * t * (3 - 2 * t); // Smoothstep
    } else {
      // Box influence
      const halfSize = this.influenceSize;
      const absPos = new Vector3(
        Math.abs(localPos.x),
        Math.abs(localPos.y),
        Math.abs(localPos.z)
      );

      // Check if outside box
      if (absPos.x > halfSize.x || absPos.y > halfSize.y || absPos.z > halfSize.z) {
        return 0;
      }

      // Calculate distance to nearest edge
      const distToEdge = new Vector3(
        halfSize.x - absPos.x,
        halfSize.y - absPos.y,
        halfSize.z - absPos.z
      );

      const minDist = Math.min(distToEdge.x, distToEdge.y, distToEdge.z);

      // Smooth falloff at edges
      if (minDist > this.blendConfig.blendDistance) return 1;

      const t = minDist / this.blendConfig.blendDistance;
      return t * t * (3 - 2 * t); // Smoothstep
    }
  }

  /**
   * Calculates parallax-corrected reflection direction.
   *
   * @param worldPosition - Surface position
   * @param reflectionDir - Reflection direction
   * @returns Corrected reflection direction
   *
   * @example
   * ```typescript
   * const reflected = reflect(viewDir, normal);
   * const corrected = probe.calculateParallaxCorrection(surfacePos, reflected);
   * const envColor = sampleCubemap(probe.cubemapId, corrected);
   * ```
   */
  calculateParallaxCorrection(
    worldPosition: Vector3,
    reflectionDir: Vector3
  ): Vector3 {
    if (this.parallaxShape === ParallaxShape.None) {
      return reflectionDir;
    }

    const localPos = worldPosition.sub(this.position);

    if (this.parallaxShape === ParallaxShape.Sphere) {
      const sphere = this.parallaxVolume as Sphere;
      const radius = sphere.radius;

      // Ray-sphere intersection
      const a = reflectionDir.dot(reflectionDir);
      const b = 2 * localPos.dot(reflectionDir);
      const c = localPos.dot(localPos) - radius * radius;
      const discriminant = b * b - 4 * a * c;

      if (discriminant < 0) return reflectionDir;

      const t = (-b + Math.sqrt(discriminant)) / (2 * a);
      const intersection = worldPosition.add(reflectionDir.scale(t));

      return intersection.sub(this.position).normalize();
    } else {
      // Box parallax correction
      const box = this.parallaxVolume as Box3;
      const boxMin = box.min.add(this.position);
      const boxMax = box.max.add(this.position);

      // Ray-box intersection
      const invDir = new Vector3(
        1 / reflectionDir.x,
        1 / reflectionDir.y,
        1 / reflectionDir.z
      );

      const t1 = (boxMin.x - worldPosition.x) * invDir.x;
      const t2 = (boxMax.x - worldPosition.x) * invDir.x;
      const t3 = (boxMin.y - worldPosition.y) * invDir.y;
      const t4 = (boxMax.y - worldPosition.y) * invDir.y;
      const t5 = (boxMin.z - worldPosition.z) * invDir.z;
      const t6 = (boxMax.z - worldPosition.z) * invDir.z;

      const tmin = Math.max(Math.max(Math.min(t1, t2), Math.min(t3, t4)), Math.min(t5, t6));
      const tmax = Math.min(Math.min(Math.max(t1, t2), Math.max(t3, t4)), Math.max(t5, t6));

      if (tmax < 0 || tmin > tmax) return reflectionDir;

      const t = tmin > 0 ? tmin : tmax;
      const intersection = worldPosition.add(reflectionDir.scale(t));

      return intersection.sub(this.position).normalize();
    }
  }

  /**
   * Gets the bounding volume for this probe.
   *
   * @returns Bounding box or sphere based on influence shape
   *
   * @example
   * ```typescript
   * const bounds = probe.getBoundingVolume();
   * if (frustum.intersects(bounds)) {
   *   // Probe affects visible area
   * }
   * ```
   */
  getBoundingVolume(): Box3 | Sphere {
    if (this.influenceShape === ParallaxShape.Sphere) {
      const radius = this.influenceSize.x;
      return new Sphere(this.position, radius);
    } else {
      const min = this.position.sub(this.influenceSize);
      const max = this.position.add(this.influenceSize);
      return new Box3(min, max);
    }
  }

  /**
   * Packs this probe's data into a GPU buffer.
   *
   * Layout (32 floats for basic data + 27 floats for SH):
   * - [0-2]: Position (xyz)
   * - [3]: Type (4 = probe)
   * - [4-6]: Influence size (xyz)
   * - [7]: Influence shape
   * - [8-10]: Parallax volume min/radius
   * - [11]: Parallax shape
   * - [12-14]: Parallax volume max
   * - [15]: Reflection intensity
   * - [16-27]: Reserved for alignment
   * - [28-54]: Spherical harmonics (27 floats)
   *
   * @param buffer - Target buffer
   * @param offset - Offset in floats
   * @returns New offset after packing
   */
  packGPUData(buffer: Float32Array, offset: number): number {
    // Position and type
    buffer[offset++] = this.position.x;
    buffer[offset++] = this.position.y;
    buffer[offset++] = this.position.z;
    buffer[offset++] = 4; // Type: probe

    // Influence volume
    buffer[offset++] = this.influenceSize.x;
    buffer[offset++] = this.influenceSize.y;
    buffer[offset++] = this.influenceSize.z;
    buffer[offset++] = this.influenceShape === ParallaxShape.Sphere ? 1 : 0;

    // Parallax correction
    if (this.parallaxVolume instanceof Box3) {
      buffer[offset++] = this.parallaxVolume.min.x;
      buffer[offset++] = this.parallaxVolume.min.y;
      buffer[offset++] = this.parallaxVolume.min.z;
      buffer[offset++] = 0; // Box shape
      buffer[offset++] = this.parallaxVolume.max.x;
      buffer[offset++] = this.parallaxVolume.max.y;
      buffer[offset++] = this.parallaxVolume.max.z;
    } else {
      const sphere = this.parallaxVolume as Sphere;
      buffer[offset++] = sphere.center.x;
      buffer[offset++] = sphere.center.y;
      buffer[offset++] = sphere.center.z;
      buffer[offset++] = 1; // Sphere shape
      buffer[offset++] = sphere.radius;
      buffer[offset++] = 0;
      buffer[offset++] = 0;
    }

    buffer[offset++] = this.reflectionProbe.intensity;

    // Pack spherical harmonics
    const shCoeffs = [
      this.sphericalHarmonics.l00,
      this.sphericalHarmonics.l1n1,
      this.sphericalHarmonics.l10,
      this.sphericalHarmonics.l11,
      this.sphericalHarmonics.l2n2,
      this.sphericalHarmonics.l2n1,
      this.sphericalHarmonics.l20,
      this.sphericalHarmonics.l21,
      this.sphericalHarmonics.l22,
    ];

    for (const coeff of shCoeffs) {
      buffer[offset++] = coeff.r;
      buffer[offset++] = coeff.g;
      buffer[offset++] = coeff.b;
    }

    return offset;
  }

  /**
   * Updates probe state.
   *
   * @param deltaTime - Time since last update in seconds
   */
  override update(deltaTime: number): void {
    super.update(deltaTime);
  }

  /**
   * Captures the environment from this probe's position into a cubemap.
   *
   * @param gl - WebGL2 rendering context
   * @param scene - Scene to capture
   * @param resolution - Cubemap face resolution (default: 256)
   * @returns Cubemap texture ID
   *
   * @example
   * ```typescript
   * const cubemapId = probe.captureProbe(gl, scene, 512);
   * probe.reflectionProbe.cubemapId = cubemapId;
   * ```
   */
  captureProbe(
    gl: WebGL2RenderingContext,
    scene: { root: any },
    resolution: number = 256
  ): WebGLTexture | null {
    // Create cubemap texture
    const cubemap = gl.createTexture();
    if (!cubemap) {
      logger.error('Failed to create cubemap texture');
      return null;
    }

    gl.bindTexture(gl.TEXTURE_CUBE_MAP, cubemap);

    // Allocate storage for all 6 faces
    for (let face = 0; face < 6; face++) {
      gl.texImage2D(
        gl.TEXTURE_CUBE_MAP_POSITIVE_X + face,
        0,
        gl.RGBA16F,
        resolution,
        resolution,
        0,
        gl.RGBA,
        gl.FLOAT,
        null
      );
    }

    // Set texture parameters
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);

    // Create FBO for rendering
    const fbo = gl.createFramebuffer();
    const depthBuffer = gl.createRenderbuffer();

    gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, resolution, resolution);

    // Save viewport
    const savedViewport = gl.getParameter(gl.VIEWPORT);

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer);

    // Cubemap view directions
    const faceData = [
      { target: gl.TEXTURE_CUBE_MAP_POSITIVE_X, up: new Vector3(0, -1, 0), forward: new Vector3(1, 0, 0) },
      { target: gl.TEXTURE_CUBE_MAP_NEGATIVE_X, up: new Vector3(0, -1, 0), forward: new Vector3(-1, 0, 0) },
      { target: gl.TEXTURE_CUBE_MAP_POSITIVE_Y, up: new Vector3(0, 0, 1), forward: new Vector3(0, 1, 0) },
      { target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Y, up: new Vector3(0, 0, -1), forward: new Vector3(0, -1, 0) },
      { target: gl.TEXTURE_CUBE_MAP_POSITIVE_Z, up: new Vector3(0, -1, 0), forward: new Vector3(0, 0, 1) },
      { target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Z, up: new Vector3(0, -1, 0), forward: new Vector3(0, 0, -1) },
    ];

    // Render each face
    for (let i = 0; i < 6; i++) {
      const face = faceData[i];

      // Attach cubemap face to FBO
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        face.target,
        cubemap,
        0
      );

      // Check FBO status
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        logger.error(`FBO incomplete for cubemap face ${i}`);
        continue;
      }

      // Set viewport
      gl.viewport(0, 0, resolution, resolution);

      // Clear
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      // Create view matrix for this face
      const target = this.position.add(face.forward);
      const viewMatrix = Matrix4.lookAt(this.position, target, face.up);
      const projMatrix = Matrix4.perspective(Math.PI / 2, 1.0, 0.1, 100.0);

      // Render scene from this view
      // Note: This requires a render callback - simplified for now
      this.renderSceneWithCamera(gl, scene.root, viewMatrix, projMatrix);
    }

    // Generate mipmaps
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, cubemap);
    gl.generateMipmap(gl.TEXTURE_CUBE_MAP);

    // Cleanup
    gl.deleteFramebuffer(fbo);
    gl.deleteRenderbuffer(depthBuffer);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(savedViewport[0], savedViewport[1], savedViewport[2], savedViewport[3]);

    this.reflectionProbe.cubemapId = cubemap as any;
    this.reflectionProbe.resolution = resolution;

    return cubemap;
  }

  /**
   * Generates irradiance map from cubemap for diffuse IBL.
   *
   * @param gl - WebGL2 rendering context
   * @param sourceCubemap - Source environment cubemap
   * @param resolution - Irradiance map resolution (default: 32)
   * @returns Irradiance cubemap texture ID
   *
   * @example
   * ```typescript
   * const irradianceMap = probe.generateIrradianceMap(gl, envCubemap, 64);
   * ```
   */
  generateIrradianceMap(
    gl: WebGL2RenderingContext,
    sourceCubemap: WebGLTexture,
    resolution: number = 32
  ): WebGLTexture | null {
    // Create irradiance cubemap
    const irradianceMap = gl.createTexture();
    if (!irradianceMap) {
      logger.error('Failed to create irradiance map texture');
      return null;
    }

    gl.bindTexture(gl.TEXTURE_CUBE_MAP, irradianceMap);

    // Allocate storage for all 6 faces
    for (let face = 0; face < 6; face++) {
      gl.texImage2D(
        gl.TEXTURE_CUBE_MAP_POSITIVE_X + face,
        0,
        gl.RGBA16F,
        resolution,
        resolution,
        0,
        gl.RGBA,
        gl.FLOAT,
        null
      );
    }

    // Set texture parameters (no mipmaps for irradiance)
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);

    // Create shader for convolution
    const convolutionShader = this.createConvolutionShader(gl);
    if (!convolutionShader) {
      logger.error('Failed to create convolution shader');
      return null;
    }

    // Create FBO for rendering
    const fbo = gl.createFramebuffer();
    const depthBuffer = gl.createRenderbuffer();

    gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, resolution, resolution);

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer);

    // Bind source cubemap
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, sourceCubemap);

    // Projection matrix (90 degree FOV)
    const projMatrix = Matrix4.perspective(Math.PI / 2, 1.0, 0.1, 10.0);

    // Render each face with convolution
    const faceViews = [
      Matrix4.lookAt(new Vector3(0, 0, 0), new Vector3(1, 0, 0), new Vector3(0, -1, 0)),
      Matrix4.lookAt(new Vector3(0, 0, 0), new Vector3(-1, 0, 0), new Vector3(0, -1, 0)),
      Matrix4.lookAt(new Vector3(0, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)),
      Matrix4.lookAt(new Vector3(0, 0, 0), new Vector3(0, -1, 0), new Vector3(0, 0, -1)),
      Matrix4.lookAt(new Vector3(0, 0, 0), new Vector3(0, 0, 1), new Vector3(0, -1, 0)),
      Matrix4.lookAt(new Vector3(0, 0, 0), new Vector3(0, 0, -1), new Vector3(0, -1, 0)),
    ];

    gl.viewport(0, 0, resolution, resolution);

    for (let i = 0; i < 6; i++) {
      // Attach cubemap face to FBO
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_CUBE_MAP_POSITIVE_X + i,
        irradianceMap,
        0
      );

      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      // Render fullscreen quad with convolution shader
      this.renderConvolution(gl, convolutionShader, projMatrix, faceViews[i], sourceCubemap);
    }

    // Cleanup
    gl.deleteFramebuffer(fbo);
    gl.deleteRenderbuffer(depthBuffer);
    gl.deleteProgram(convolutionShader);

    return irradianceMap;
  }

  /**
   * Generates prefiltered environment map for specular IBL.
   *
   * @param gl - WebGL2 rendering context
   * @param sourceCubemap - Source environment cubemap
   * @param resolution - Base resolution (default: 128)
   * @param mipLevels - Number of roughness mip levels (default: 5)
   * @returns Prefiltered cubemap texture ID
   *
   * @example
   * ```typescript
   * const prefilteredMap = probe.generatePrefilteredEnvMap(gl, envCubemap, 256, 7);
   * ```
   */
  generatePrefilteredEnvMap(
    gl: WebGL2RenderingContext,
    sourceCubemap: WebGLTexture,
    resolution: number = 128,
    mipLevels: number = 5
  ): WebGLTexture | null {
    // Create prefiltered cubemap
    const prefilteredMap = gl.createTexture();
    if (!prefilteredMap) {
      logger.error('Failed to create prefiltered map texture');
      return null;
    }

    gl.bindTexture(gl.TEXTURE_CUBE_MAP, prefilteredMap);

    // Allocate storage for all mip levels and faces
    for (let mip = 0; mip < mipLevels; mip++) {
      const mipRes = Math.max(1, Math.floor(resolution / Math.pow(2, mip)));

      for (let face = 0; face < 6; face++) {
        gl.texImage2D(
          gl.TEXTURE_CUBE_MAP_POSITIVE_X + face,
          mip,
          gl.RGBA16F,
          mipRes,
          mipRes,
          0,
          gl.RGBA,
          gl.FLOAT,
          null
        );
      }
    }

    // Set texture parameters
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);

    // Create prefilter shader
    const prefilterShader = this.createPrefilterShader(gl);
    if (!prefilterShader) {
      logger.error('Failed to create prefilter shader');
      return null;
    }

    // Create FBO for rendering
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

    // Bind source cubemap
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, sourceCubemap);

    // Projection matrix
    const projMatrix = Matrix4.perspective(Math.PI / 2, 1.0, 0.1, 10.0);

    const faceViews = [
      Matrix4.lookAt(new Vector3(0, 0, 0), new Vector3(1, 0, 0), new Vector3(0, -1, 0)),
      Matrix4.lookAt(new Vector3(0, 0, 0), new Vector3(-1, 0, 0), new Vector3(0, -1, 0)),
      Matrix4.lookAt(new Vector3(0, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)),
      Matrix4.lookAt(new Vector3(0, 0, 0), new Vector3(0, -1, 0), new Vector3(0, 0, -1)),
      Matrix4.lookAt(new Vector3(0, 0, 0), new Vector3(0, 0, 1), new Vector3(0, -1, 0)),
      Matrix4.lookAt(new Vector3(0, 0, 0), new Vector3(0, 0, -1), new Vector3(0, -1, 0)),
    ];

    // Render each mip level with increasing roughness
    for (let mip = 0; mip < mipLevels; mip++) {
      const mipRes = Math.max(1, Math.floor(resolution / Math.pow(2, mip)));
      const roughness = mip / (mipLevels - 1);

      // Create depth buffer for this mip level
      const depthBuffer = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, mipRes, mipRes);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer);

      gl.viewport(0, 0, mipRes, mipRes);

      // Render each face
      for (let face = 0; face < 6; face++) {
        // Attach cubemap face to FBO
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER,
          gl.COLOR_ATTACHMENT0,
          gl.TEXTURE_CUBE_MAP_POSITIVE_X + face,
          prefilteredMap,
          mip
        );

        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // Render with prefiltering
        this.renderPrefilter(gl, prefilterShader, projMatrix, faceViews[face], sourceCubemap, roughness);
      }

      gl.deleteRenderbuffer(depthBuffer);
    }

    // Cleanup
    gl.deleteFramebuffer(fbo);
    gl.deleteProgram(prefilterShader);

    this.reflectionProbe.cubemapId = prefilteredMap as any;
    this.reflectionProbe.mipLevels = mipLevels;

    return prefilteredMap;
  }

  /**
   * Helper: Renders scene from camera perspective.
   */
  private renderSceneWithCamera(
    gl: WebGL2RenderingContext,
    node: any,
    viewMatrix: Matrix4,
    projMatrix: Matrix4
  ): void {
    // This is a placeholder - actual implementation would require
    // access to a proper rendering pipeline
    // For now, just clear to sky color
    gl.clearColor(0.5, 0.7, 1.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }

  /**
   * Helper: Creates convolution shader for irradiance.
   */
  private createConvolutionShader(gl: WebGL2RenderingContext): WebGLProgram | null {
    const vs = `#version 300 es
      in vec3 a_position;
      uniform mat4 u_projection;
      uniform mat4 u_view;
      out vec3 v_worldPos;
      void main() {
        v_worldPos = a_position;
        gl_Position = u_projection * u_view * vec4(a_position, 1.0);
      }
    `;

    const fs = `#version 300 es
      precision highp float;
      in vec3 v_worldPos;
      uniform samplerCube u_envMap;
      out vec4 fragColor;

      const float PI = 3.14159265359;

      void main() {
        vec3 N = normalize(v_worldPos);
        vec3 irradiance = vec3(0.0);

        // Convolution over hemisphere
        vec3 up = vec3(0.0, 1.0, 0.0);
        vec3 right = normalize(cross(up, N));
        up = normalize(cross(N, right));

        float sampleDelta = 0.025;
        float nrSamples = 0.0;

        for (float phi = 0.0; phi < 2.0 * PI; phi += sampleDelta) {
          for (float theta = 0.0; theta < 0.5 * PI; theta += sampleDelta) {
            vec3 tangentSample = vec3(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta));
            vec3 sampleVec = tangentSample.x * right + tangentSample.y * up + tangentSample.z * N;

            irradiance += texture(u_envMap, sampleVec).rgb * cos(theta) * sin(theta);
            nrSamples++;
          }
        }

        irradiance = PI * irradiance / nrSamples;
        fragColor = vec4(irradiance, 1.0);
      }
    `;

    return this.compileShaderProgram(gl, vs, fs);
  }

  /**
   * Helper: Creates prefilter shader for specular.
   */
  private createPrefilterShader(gl: WebGL2RenderingContext): WebGLProgram | null {
    const vs = `#version 300 es
      in vec3 a_position;
      uniform mat4 u_projection;
      uniform mat4 u_view;
      out vec3 v_worldPos;
      void main() {
        v_worldPos = a_position;
        gl_Position = u_projection * u_view * vec4(a_position, 1.0);
      }
    `;

    const fs = `#version 300 es
      precision highp float;
      in vec3 v_worldPos;
      uniform samplerCube u_envMap;
      uniform float u_roughness;
      out vec4 fragColor;

      const float PI = 3.14159265359;

      float RadicalInverse_VdC(uint bits) {
        bits = (bits << 16u) | (bits >> 16u);
        bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
        bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
        bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
        bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
        return float(bits) * 2.3283064365386963e-10;
      }

      vec2 Hammersley(uint i, uint N) {
        return vec2(float(i)/float(N), RadicalInverse_VdC(i));
      }

      vec3 ImportanceSampleGGX(vec2 Xi, vec3 N, float roughness) {
        float a = roughness * roughness;
        float phi = 2.0 * PI * Xi.x;
        float cosTheta = sqrt((1.0 - Xi.y) / (1.0 + (a*a - 1.0) * Xi.y));
        float sinTheta = sqrt(1.0 - cosTheta*cosTheta);

        vec3 H;
        H.x = cos(phi) * sinTheta;
        H.y = sin(phi) * sinTheta;
        H.z = cosTheta;

        vec3 up = abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
        vec3 tangent = normalize(cross(up, N));
        vec3 bitangent = cross(N, tangent);

        return normalize(tangent * H.x + bitangent * H.y + N * H.z);
      }

      void main() {
        vec3 N = normalize(v_worldPos);
        vec3 R = N;
        vec3 V = R;

        const uint SAMPLE_COUNT = 1024u;
        vec3 prefilteredColor = vec3(0.0);
        float totalWeight = 0.0;

        for(uint i = 0u; i < SAMPLE_COUNT; ++i) {
          vec2 Xi = Hammersley(i, SAMPLE_COUNT);
          vec3 H = ImportanceSampleGGX(Xi, N, u_roughness);
          vec3 L = normalize(2.0 * dot(V, H) * H - V);

          float NdotL = max(dot(N, L), 0.0);
          if(NdotL > 0.0) {
            prefilteredColor += texture(u_envMap, L).rgb * NdotL;
            totalWeight += NdotL;
          }
        }

        prefilteredColor = prefilteredColor / totalWeight;
        fragColor = vec4(prefilteredColor, 1.0);
      }
    `;

    return this.compileShaderProgram(gl, vs, fs);
  }

  /**
   * Helper: Compiles shader program.
   */
  private compileShaderProgram(
    gl: WebGL2RenderingContext,
    vsSource: string,
    fsSource: string
  ): WebGLProgram | null {
    const vs = gl.createShader(gl.VERTEX_SHADER);
    const fs = gl.createShader(gl.FRAGMENT_SHADER);

    if (!vs || !fs) return null;

    gl.shaderSource(vs, vsSource);
    gl.compileShader(vs);

    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      logger.error('VS compile error:', gl.getShaderInfoLog(vs));
      return null;
    }

    gl.shaderSource(fs, fsSource);
    gl.compileShader(fs);

    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      logger.error('FS compile error:', gl.getShaderInfoLog(fs));
      return null;
    }

    const program = gl.createProgram();
    if (!program) return null;

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      logger.error('Program link error:', gl.getProgramInfoLog(program));
      return null;
    }

    gl.deleteShader(vs);
    gl.deleteShader(fs);

    return program;
  }

  /**
   * Helper: Renders convolution pass.
   */
  private renderConvolution(
    gl: WebGL2RenderingContext,
    shader: WebGLProgram,
    projection: Matrix4,
    view: Matrix4,
    envMap: WebGLTexture
  ): void {
    gl.useProgram(shader);

    // Upload uniforms
    const projLoc = gl.getUniformLocation(shader, 'u_projection');
    const viewLoc = gl.getUniformLocation(shader, 'u_view');
    const envLoc = gl.getUniformLocation(shader, 'u_envMap');

    gl.uniformMatrix4fv(projLoc, false, projection.elements);
    gl.uniformMatrix4fv(viewLoc, false, view.elements);
    gl.uniform1i(envLoc, 0);

    // Render cube (simplified - would need proper geometry)
    this.renderCube(gl, shader);
  }

  /**
   * Helper: Renders prefilter pass.
   */
  private renderPrefilter(
    gl: WebGL2RenderingContext,
    shader: WebGLProgram,
    projection: Matrix4,
    view: Matrix4,
    envMap: WebGLTexture,
    roughness: number
  ): void {
    gl.useProgram(shader);

    const projLoc = gl.getUniformLocation(shader, 'u_projection');
    const viewLoc = gl.getUniformLocation(shader, 'u_view');
    const envLoc = gl.getUniformLocation(shader, 'u_envMap');
    const roughLoc = gl.getUniformLocation(shader, 'u_roughness');

    gl.uniformMatrix4fv(projLoc, false, projection.elements);
    gl.uniformMatrix4fv(viewLoc, false, view.elements);
    gl.uniform1i(envLoc, 0);
    gl.uniform1f(roughLoc, roughness);

    this.renderCube(gl, shader);
  }

  /**
   * Helper: Renders a unit cube.
   */
  private renderCube(gl: WebGL2RenderingContext, shader: WebGLProgram): void {
    // Simplified cube rendering - would need proper VAO/VBO setup
    // This is a placeholder for the actual implementation
  }

  /**
   * Clones this light probe.
   *
   * @returns New LightProbe instance with same properties
   */
  clone(): LightProbe {
    const clone = new LightProbe(this.position.clone(), this.probeType);

    clone.enabled = this.enabled;
    clone.priority = this.priority;
    clone.influenceShape = this.influenceShape;
    clone.influenceSize = this.influenceSize.clone();
    clone.parallaxShape = this.parallaxShape;
    clone.useBoxProjection = this.useBoxProjection;

    // Clone spherical harmonics
    clone.sphericalHarmonics = {
      l00: this.sphericalHarmonics.l00.clone(),
      l1n1: this.sphericalHarmonics.l1n1.clone(),
      l10: this.sphericalHarmonics.l10.clone(),
      l11: this.sphericalHarmonics.l11.clone(),
      l2n2: this.sphericalHarmonics.l2n2.clone(),
      l2n1: this.sphericalHarmonics.l2n1.clone(),
      l20: this.sphericalHarmonics.l20.clone(),
      l21: this.sphericalHarmonics.l21.clone(),
      l22: this.sphericalHarmonics.l22.clone(),
    };

    clone.reflectionProbe = { ...this.reflectionProbe };
    clone.blendConfig = { ...this.blendConfig };

    if (this.parallaxVolume instanceof Box3) {
      clone.parallaxVolume = this.parallaxVolume.clone();
    } else {
      clone.parallaxVolume = (this.parallaxVolume as Sphere).clone();
    }

    return clone;
  }
}
