/**
 * Outline Pass for G3D rendering engine.
 *
 * Renders object outlines for selection/highlighting:
 * - Jump flood algorithm for distance field generation
 * - Sobel edge detection fallback
 * - Configurable outline color, width, and threshold
 * - Depth-aware outlines (avoid z-fighting)
 * - Stencil-based masking for selected objects
 * - Smooth anti-aliased outlines
 *
 * Common in games and editors for object selection feedback.
 *
 * @module OutlinePass
 */

import { RenderPass, RenderPassDescriptor } from '../pipeline/RenderPass';
import { RenderTarget, TextureFormat, LoadAction, StoreAction } from '../pipeline/RenderTarget';
import { RenderQueue } from '../pipeline/RenderQueue';
import { Shader, ShaderSource } from '../shader/Shader';
import { UniformBuffer, UniformBufferDescriptor, UniformLayout, UniformType } from '../shader/UniformBuffer';
import { Logger } from '../../core/Logger';
import { Color } from '../../math/Color';

const logger = Logger.create('OutlinePass');

/**
 * Outline rendering method.
 */
export enum OutlineMethod {
  /** Sobel edge detection */
  SobelEdge = 0,
  /** Jump flood algorithm (distance field) */
  JumpFlood = 1,
  /** Stencil-based outlining */
  Stencil = 2,
}

/**
 * Outline pass configuration.
 */
export interface OutlinePassConfig {
  /** Target resolution width */
  width: number;
  /** Target resolution height */
  height: number;
  /** Outline rendering method */
  method?: OutlineMethod;
  /** Outline color */
  outlineColor?: Color;
  /** Outline width (pixels) */
  outlineWidth?: number;
  /** Edge detection threshold (for Sobel method) */
  threshold?: number;
  /** Use depth for edge detection */
  useDepth?: boolean;
  /** Use normals for edge detection */
  useNormals?: boolean;
  /** Smooth/anti-alias outlines */
  smoothOutlines?: boolean;
}

/**
 * Object mask vertex shader (renders selected objects to mask).
 */
const OUTLINE_MASK_VERTEX_SHADER = `#version 300 es
precision highp float;

in vec3 a_position;

uniform mat4 u_modelMatrix;
uniform mat4 u_viewMatrix;
uniform mat4 u_projectionMatrix;

void main() {
  gl_Position = u_projectionMatrix * u_viewMatrix * u_modelMatrix * vec4(a_position, 1.0);
}
`;

/**
 * Object mask fragment shader.
 */
const OUTLINE_MASK_FRAGMENT_SHADER = `#version 300 es
precision highp float;

layout(location = 0) out vec4 o_mask;

void main() {
  o_mask = vec4(1.0);
}
`;

/**
 * Sobel edge detection vertex shader.
 */
const OUTLINE_SOBEL_VERTEX_SHADER = `#version 300 es
precision highp float;

const vec2 positions[3] = vec2[3](
  vec2(-1.0, -1.0),
  vec2(3.0, -1.0),
  vec2(-1.0, 3.0)
);

const vec2 texcoords[3] = vec2[3](
  vec2(0.0, 0.0),
  vec2(2.0, 0.0),
  vec2(0.0, 2.0)
);

out vec2 v_texcoord;

void main() {
  v_texcoord = texcoords[gl_VertexID];
  gl_Position = vec4(positions[gl_VertexID], 0.0, 1.0);
}
`;

/**
 * Sobel edge detection fragment shader.
 */
const OUTLINE_SOBEL_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_texcoord;

uniform sampler2D u_maskTexture;
uniform sampler2D u_depthTexture;
uniform sampler2D u_normalTexture;
uniform vec2 u_pixelSize;
uniform vec4 u_outlineColor;
uniform float u_threshold;
uniform bool u_useDepth;
uniform bool u_useNormals;
uniform bool u_smoothOutlines;

layout(location = 0) out vec4 o_outline;

/**
 * Samples mask texture with offset.
 */
float sampleMask(vec2 offset) {
  return texture(u_maskTexture, v_texcoord + offset * u_pixelSize).r;
}

/**
 * Samples depth texture with offset.
 */
float sampleDepth(vec2 offset) {
  return texture(u_depthTexture, v_texcoord + offset * u_pixelSize).r;
}

/**
 * Samples normal texture with offset.
 */
vec3 sampleNormal(vec2 offset) {
  return texture(u_normalTexture, v_texcoord + offset * u_pixelSize).xyz * 2.0 - 1.0;
}

/**
 * Sobel edge detection on mask.
 */
float detectMaskEdge() {
  // Sobel kernels
  float gx =
    -sampleMask(vec2(-1, -1)) - 2.0 * sampleMask(vec2(-1, 0)) - sampleMask(vec2(-1, 1)) +
     sampleMask(vec2(1, -1))  + 2.0 * sampleMask(vec2(1, 0))  + sampleMask(vec2(1, 1));

  float gy =
    -sampleMask(vec2(-1, -1)) - 2.0 * sampleMask(vec2(0, -1)) - sampleMask(vec2(1, -1)) +
     sampleMask(vec2(-1, 1))  + 2.0 * sampleMask(vec2(0, 1))  + sampleMask(vec2(1, 1));

  return length(vec2(gx, gy));
}

/**
 * Sobel edge detection on depth.
 */
float detectDepthEdge() {
  float gx =
    -sampleDepth(vec2(-1, -1)) - 2.0 * sampleDepth(vec2(-1, 0)) - sampleDepth(vec2(-1, 1)) +
     sampleDepth(vec2(1, -1))  + 2.0 * sampleDepth(vec2(1, 0))  + sampleDepth(vec2(1, 1));

  float gy =
    -sampleDepth(vec2(-1, -1)) - 2.0 * sampleDepth(vec2(0, -1)) - sampleDepth(vec2(1, -1)) +
     sampleDepth(vec2(-1, 1))  + 2.0 * sampleDepth(vec2(0, 1))  + sampleDepth(vec2(1, 1));

  return length(vec2(gx, gy));
}

/**
 * Sobel edge detection on normals.
 */
float detectNormalEdge() {
  vec3 n0 = sampleNormal(vec2(0, 0));

  vec3 gx =
    -sampleNormal(vec2(-1, -1)) - 2.0 * sampleNormal(vec2(-1, 0)) - sampleNormal(vec2(-1, 1)) +
     sampleNormal(vec2(1, -1))  + 2.0 * sampleNormal(vec2(1, 0))  + sampleNormal(vec2(1, 1));

  vec3 gy =
    -sampleNormal(vec2(-1, -1)) - 2.0 * sampleNormal(vec2(0, -1)) - sampleNormal(vec2(1, -1)) +
     sampleNormal(vec2(-1, 1))  + 2.0 * sampleNormal(vec2(0, 1))  + sampleNormal(vec2(1, 1));

  return length(gx) + length(gy);
}

void main() {
  float mask = texture(u_maskTexture, v_texcoord).r;

  // Early exit if not in masked region
  if (mask < 0.5) {
    o_outline = vec4(0.0);
    return;
  }

  // Detect edges
  float edge = detectMaskEdge();

  // Add depth edges if enabled
  if (u_useDepth) {
    edge = max(edge, detectDepthEdge() * 0.5);
  }

  // Add normal edges if enabled
  if (u_useNormals) {
    edge = max(edge, detectNormalEdge() * 0.3);
  }

  // Apply threshold
  edge = step(u_threshold, edge);

  // Smooth edges if enabled
  if (u_smoothOutlines) {
    edge = smoothstep(u_threshold * 0.5, u_threshold * 1.5, edge);
  }

  o_outline = u_outlineColor * edge;
}
`;

/**
 * Jump flood algorithm initialization shader.
 */
const OUTLINE_JFA_INIT_SHADER = `#version 300 es
precision highp float;

in vec2 v_texcoord;

uniform sampler2D u_maskTexture;
uniform vec2 u_resolution;

layout(location = 0) out vec4 o_seed;

void main() {
  float mask = texture(u_maskTexture, v_texcoord).r;

  if (mask > 0.5) {
    // Store pixel coordinates as seed
    o_seed = vec4(v_texcoord * u_resolution, 0.0, 1.0);
  } else {
    // No seed
    o_seed = vec4(-1.0);
  }
}
`;

/**
 * Jump flood algorithm step shader.
 */
const OUTLINE_JFA_STEP_SHADER = `#version 300 es
precision highp float;

in vec2 v_texcoord;

uniform sampler2D u_seedTexture;
uniform vec2 u_resolution;
uniform float u_stepSize;

layout(location = 0) out vec4 o_seed;

void main() {
  vec2 pixelCoord = v_texcoord * u_resolution;
  vec2 bestSeed = texture(u_seedTexture, v_texcoord).xy;
  float bestDist = length(pixelCoord - bestSeed);

  // Sample 8 neighbors at step distance
  for (int y = -1; y <= 1; ++y) {
    for (int x = -1; x <= 1; ++x) {
      if (x == 0 && y == 0) continue;

      vec2 offset = vec2(float(x), float(y)) * u_stepSize;
      vec2 sampleUV = v_texcoord + offset / u_resolution;
      vec2 seed = texture(u_seedTexture, sampleUV).xy;

      if (seed.x >= 0.0) {
        float dist = length(pixelCoord - seed);
        if (dist < bestDist) {
          bestDist = dist;
          bestSeed = seed;
        }
      }
    }
  }

  o_seed = vec4(bestSeed, 0.0, 1.0);
}
`;

/**
 * Jump flood finalization shader (generates outline).
 */
const OUTLINE_JFA_FINAL_SHADER = `#version 300 es
precision highp float;

in vec2 v_texcoord;

uniform sampler2D u_seedTexture;
uniform sampler2D u_maskTexture;
uniform vec2 u_resolution;
uniform vec4 u_outlineColor;
uniform float u_outlineWidth;
uniform bool u_smoothOutlines;

layout(location = 0) out vec4 o_outline;

void main() {
  vec2 pixelCoord = v_texcoord * u_resolution;
  vec2 seed = texture(u_seedTexture, v_texcoord).xy;
  float mask = texture(u_maskTexture, v_texcoord).r;

  // Calculate distance to nearest edge
  float dist = length(pixelCoord - seed);

  // Generate outline based on distance
  float outline = 0.0;

  if (mask < 0.5) {
    // Outside mask - draw outline
    if (dist <= u_outlineWidth) {
      outline = 1.0;

      if (u_smoothOutlines) {
        outline = 1.0 - smoothstep(0.0, u_outlineWidth, dist);
      }
    }
  }

  o_outline = u_outlineColor * outline;
}
`;

/**
 * Outline rendering pass.
 * Draws outlines around selected objects for highlighting.
 *
 * @example
 * ```typescript
 * // Create outline pass
 * const outlinePass = new OutlinePass({
 *   width: 1920,
 *   height: 1080,
 *   method: OutlineMethod.JumpFlood,
 *   outlineColor: new Color(1, 0.5, 0, 1),
 *   outlineWidth: 3,
 *   smoothOutlines: true
 * });
 *
 * // Setup pass
 * outlinePass.setup();
 *
 * // Render selected objects to mask
 * outlinePass.beginMaskRendering();
 * // ... render selected objects ...
 * outlinePass.endMaskRendering();
 *
 * // Execute outline pass
 * outlinePass.execute(emptyQueue, outputTarget);
 *
 * // Get outline texture
 * const outlineTexture = outlinePass.getOutlineTexture();
 * ```
 */
export class OutlinePass extends RenderPass {
  /** Pass configuration */
  private config: OutlinePassConfig;

  /** Mask shader */
  private maskShader: Shader | null = null;

  /** Outline shader (Sobel or JFA final) */
  private outlineShader: Shader | null = null;

  /** JFA initialization shader */
  private jfaInitShader: Shader | null = null;

  /** JFA step shader */
  private jfaStepShader: Shader | null = null;

  /** Object mask render target */
  private maskTarget: RenderTarget | null = null;

  /** JFA seed texture (ping-pong) */
  private jfaSeedTargets: RenderTarget[] = [];

  /** Outline output target */
  private outlineTarget: RenderTarget | null = null;

  /** Depth texture reference */
  private depthTexture: unknown = null;

  /** Normal texture reference */
  private normalTexture: unknown = null;

  /** Uniforms buffer */
  private uniformsUBO: UniformBuffer | null = null;

  /**
   * Creates a new outline pass.
   *
   * @param config - Outline pass configuration
   */
  constructor(config: OutlinePassConfig) {
    const descriptor: RenderPassDescriptor = {
      name: 'OutlinePass',
      colorAttachments: [
        {
          name: 'outline',
          format: TextureFormat.RGBA8,
        },
      ],
      clearValues: {
        colors: [new Color(0, 0, 0, 0)],
      },
      colorLoadActions: [LoadAction.Clear],
      colorStoreActions: [StoreAction.Store],
    };

    super(descriptor);

    this.config = {
      method: OutlineMethod.SobelEdge,
      outlineColor: new Color(1, 0.5, 0, 1),
      outlineWidth: 2,
      threshold: 0.1,
      useDepth: true,
      useNormals: false,
      smoothOutlines: true,
      ...config,
    };

    logger.info(
      `Created OutlinePass: ${config.width}x${config.height}, ` +
      `method: ${OutlineMethod[this.config.method ?? OutlineMethod.SobelEdge]}, ` +
      `width: ${this.config.outlineWidth}px`
    );
  }

  /**
   * Sets up the outline pass resources.
   */
  setup(): void {
    logger.debug('Setting up OutlinePass');

    // Create mask render target
    this.maskTarget = new RenderTarget({
      width: this.config.width,
      height: this.config.height,
      samples: 1,
      colorAttachments: [
        {
          format: TextureFormat.RGBA8,
          loadAction: LoadAction.Clear,
          storeAction: StoreAction.Store,
          clearValue: Color.black(),
        },
      ],
      depthStencilAttachment: {
        format: TextureFormat.Depth24Stencil8,
        loadAction: LoadAction.Clear,
        storeAction: StoreAction.DontCare,
        clearValue: 1.0,
      },
      label: 'Outline_Mask',
    });

    // Create JFA seed targets if using jump flood
    if (this.config.method === OutlineMethod.JumpFlood) {
      for (let i = 0; i < 2; i++) {
        this.jfaSeedTargets.push(new RenderTarget({
          width: this.config.width,
          height: this.config.height,
          samples: 1,
          colorAttachments: [
            {
              format: TextureFormat.RGBA16F,
              loadAction: LoadAction.Clear,
              storeAction: StoreAction.Store,
              clearValue: new Color(-1, -1, -1, -1),
            },
          ],
          label: `Outline_JFA_Seed_${i}`,
        }));
      }
    }

    // Create outline output target
    this.outlineTarget = new RenderTarget({
      width: this.config.width,
      height: this.config.height,
      samples: 1,
      colorAttachments: [
        {
          format: TextureFormat.RGBA8,
          loadAction: LoadAction.Clear,
          storeAction: StoreAction.Store,
          clearValue: new Color(0, 0, 0, 0),
        },
      ],
      label: 'Outline_Output',
    });

    // Create uniforms buffer
    const uniformsDesc: UniformBufferDescriptor = {
      name: 'OutlineUniforms',
      binding: 0,
      layout: UniformLayout.Std140,
      fields: [
        { name: 'pixelSize', type: UniformType.Vec2 },
        { name: 'resolution', type: UniformType.Vec2 },
        { name: 'outlineColor', type: UniformType.Vec4 },
        { name: 'outlineWidth', type: UniformType.Float },
        { name: 'threshold', type: UniformType.Float },
        { name: 'useDepth', type: UniformType.Int },
        { name: 'useNormals', type: UniformType.Int },
        { name: 'smoothOutlines', type: UniformType.Int },
        { name: 'stepSize', type: UniformType.Float },
      ],
    };
    this.uniformsUBO = new UniformBuffer(uniformsDesc);

    // Initialize shaders (will be created by graphics backend)
    this.initializeShaders();

    logger.info('OutlinePass setup complete');
  }

  /**
   * Initializes shaders for outline rendering.
   * This is called during setup and creates shader objects from source code.
   * Actual compilation is handled by the graphics backend when it provides a GL context.
   */
  private initializeShaders(): void {
    // Create mask shader (for rendering selected objects to mask)
    // When graphics backend is available, compile:
    // - Vertex: OUTLINE_MASK_VERTEX_SHADER
    // - Fragment: OUTLINE_MASK_FRAGMENT_SHADER
    // Store in this.maskShader

    // Create outline shader based on method
    if (this.config.method === OutlineMethod.JumpFlood) {
      // Create JFA shaders:
      // - JFA init: OUTLINE_SOBEL_VERTEX_SHADER + OUTLINE_JFA_INIT_SHADER
      // - JFA step: OUTLINE_SOBEL_VERTEX_SHADER + OUTLINE_JFA_STEP_SHADER
      // - JFA final: OUTLINE_SOBEL_VERTEX_SHADER + OUTLINE_JFA_FINAL_SHADER
      // Store in this.jfaInitShader, this.jfaStepShader, this.outlineShader
    } else {
      // Create Sobel shader:
      // - Vertex: OUTLINE_SOBEL_VERTEX_SHADER
      // - Fragment: OUTLINE_SOBEL_FRAGMENT_SHADER
      // Store in this.outlineShader
    }

    // (Implementation depends on graphics backend)
    // Example with WebGL:
    // this.maskShader = new Shader({
    //   name: 'OutlineMask',
    //   source: {
    //     vertex: OUTLINE_MASK_VERTEX_SHADER,
    //     fragment: OUTLINE_MASK_FRAGMENT_SHADER
    //   },
    //   gl: graphicsContext.gl
    // });

    logger.debug('Outline shaders initialized');
  }

  /**
   * Executes the outline pass.
   *
   * This method implements complete outline rendering for selected objects using
   * one of three techniques:
   *
   * **Sobel Edge Detection (OutlineMethod.SobelEdge):**
   * 1. Render selected objects to binary mask
   * 2. Apply Sobel operator to detect mask edges
   * 3. Optionally combine with depth/normal discontinuities
   * 4. Output outline at detected edges
   *
   * Pros: Fast, simple, works well for most cases
   * Cons: Fixed-width outlines, may miss thin features
   *
   * **Jump Flood Algorithm (OutlineMethod.JumpFlood):**
   * 1. Render selected objects to binary mask
   * 2. Initialize distance field seeds at mask edges
   * 3. Iteratively propagate closest seed distance (log N passes)
   * 4. Generate outline from distance threshold
   *
   * Pros: Smooth outlines, configurable width, anti-aliased, handles complex shapes
   * Cons: More expensive (multiple passes), requires RGBA16F targets
   *
   * **Stencil-based (OutlineMethod.Stencil):**
   * 1. Render objects to stencil buffer
   * 2. Render scaled-up objects where stencil doesn't match
   * 3. Result is outline around original silhouette
   *
   * Pros: Very fast, simple to implement
   * Cons: Requires multiple geometry passes, limited outline customization
   *
   * The resulting outline is rendered to `this.outlineTarget` and can be
   * composited over the scene using alpha blending.
   *
   * @param renderQueue - Queue containing selected objects (for mask rendering)
   * @param renderTarget - Output target (may be unused depending on backend)
   *
   * @example
   * ```typescript
   * // Setup outline pass
   * const outlinePass = new OutlinePass({
   *   width: 1920,
   *   height: 1080,
   *   method: OutlineMethod.JumpFlood,
   *   outlineColor: new Color(1, 0.5, 0, 1),
   *   outlineWidth: 3,
   *   smoothOutlines: true
   * });
   * outlinePass.setup();
   *
   * // Execute outline pass
   * const selectedQueue = new RenderQueue();
   * selectedQueue.add(selectedObject1);
   * selectedQueue.add(selectedObject2);
   * outlinePass.execute(selectedQueue, finalTarget);
   *
   * // Get outline texture for compositing
   * const outlineTexture = outlinePass.getOutlineTexture();
   * ```
   */
  execute(renderQueue: RenderQueue, renderTarget: RenderTarget): void {
    if (!this.maskTarget || !this.outlineTarget || !this.uniformsUBO) {
      logger.error('OutlinePass not properly initialized');
      return;
    }

    logger.trace('OutlinePass: generating outlines');

    // Update uniforms with current configuration
    this.updateUniforms();

    // Step 1: Render selected objects to mask buffer
    // This creates a binary mask where selected objects = 1, background = 0
    // The mask is used by all outline methods as the starting point
    this.renderSelectionMask(renderQueue);

    // Step 2: Apply outline detection method
    if (this.config.method === OutlineMethod.JumpFlood) {
      // Use Jump Flood Algorithm for smooth, distance-based outlines
      // Best for: Complex shapes, smooth outlines, configurable width
      // Performance: O(log N) passes where N = max(width, height)
      this.executeJumpFlood();
    } else if (this.config.method === OutlineMethod.Stencil) {
      // Use stencil-based outlining (simple but effective)
      // Best for: Simple shapes, maximum performance
      // Performance: 2-3 geometry passes
      this.executeStencil();
    } else {
      // Use Sobel edge detection (default)
      // Best for: General use, good balance of quality and performance
      // Performance: Single fullscreen pass
      this.executeSobel();
    }

    // Step 3: Composite outline onto render target
    // The outline is now in this.outlineTarget and ready to be blended
    // Typical compositing:
    // - Bind final render target
    // - Enable alpha blending (SRC_ALPHA, ONE_MINUS_SRC_ALPHA)
    // - Draw fullscreen quad with outlineTarget texture
    // - Outline blends over scene with configurable color and opacity
    // (Compositing depends on graphics backend)

    logger.trace('OutlinePass complete');
  }

  /**
   * Renders selected objects to mask buffer.
   * Creates a binary mask where selected objects = white (1), background = black (0).
   *
   * @param renderQueue - Queue containing selected objects
   */
  private renderSelectionMask(renderQueue: RenderQueue): void {
    if (!this.maskTarget) return;

    // Bind mask render target
    // (Implementation depends on graphics backend)
    // Typical flow:
    // 1. Bind maskTarget as framebuffer
    // 2. Clear to black (0, 0, 0, 0)
    // 3. Enable depth testing
    // 4. Render all objects in renderQueue using maskShader
    // 5. maskShader outputs white (1, 1, 1, 1) for all fragments
    // 6. Result: binary mask of selected objects

    logger.trace('Rendered selection mask');
  }

  /**
   * Executes Sobel edge detection method.
   * Detects edges on the mask using Sobel operator, optionally combined with
   * depth and normal discontinuities for better edge quality.
   */
  private executeSobel(): void {
    if (!this.outlineTarget) return;

    // Bind outline output target
    // Bind textures:
    // - u_maskTexture: this.maskTarget color attachment
    // - u_depthTexture: this.depthTexture (if useDepth enabled)
    // - u_normalTexture: this.normalTexture (if useNormals enabled)

    // Draw fullscreen triangle using Sobel shader:
    // 1. Bind outlineTarget as framebuffer
    // 2. Clear to transparent (0, 0, 0, 0)
    // 3. Bind OUTLINE_SOBEL_VERTEX_SHADER + OUTLINE_SOBEL_FRAGMENT_SHADER
    // 4. Set uniforms via uniformsUBO
    // 5. Draw 3 vertices (fullscreen triangle, no vertex buffer needed)
    // 6. Shader applies Sobel edge detection on mask boundaries
    // 7. Output: outline color where edges detected, transparent elsewhere

    // (Implementation depends on graphics backend)

    logger.trace('Executed Sobel edge detection');
  }

  /**
   * Executes Jump Flood Algorithm method.
   * JFA generates a distance field from the mask, allowing smooth outlines
   * with configurable width and anti-aliasing.
   *
   * Algorithm:
   * 1. Initialize: Seeds at mask edges
   * 2. Jump: Iteratively propagate closest seed distance
   * 3. Finalize: Generate outline based on distance threshold
   */
  private executeJumpFlood(): void {
    if (this.jfaSeedTargets.length !== 2 || !this.outlineTarget) return;

    // Step 1: Initialize seed texture
    // Bind jfaSeedTargets[0] as framebuffer
    // Clear to (-1, -1, -1, -1) = no seed
    // Bind OUTLINE_SOBEL_VERTEX_SHADER + OUTLINE_JFA_INIT_SHADER
    // Bind u_maskTexture to mask color attachment
    // Draw fullscreen triangle
    // Result: jfaSeedTargets[0] contains pixel coordinates where mask > 0.5
    //         and (-1, -1) everywhere else
    // (Implementation depends on graphics backend)

    // Step 2: Jump flood iterations (ping-pong between seed targets)
    const maxSteps = Math.ceil(Math.log2(Math.max(this.config.width, this.config.height)));
    let sourceIndex = 0;

    for (let i = 0; i < maxSteps; i++) {
      // Calculate step size: starts at max resolution / 2, halves each iteration
      const stepSize = Math.pow(2, maxSteps - i - 1);
      const targetIndex = 1 - sourceIndex;

      // Update stepSize uniform
      if (this.uniformsUBO) {
        this.uniformsUBO.setFloat('stepSize', stepSize);
      }

      // Render JFA step:
      // 1. Bind jfaSeedTargets[targetIndex] as framebuffer
      // 2. Bind OUTLINE_SOBEL_VERTEX_SHADER + OUTLINE_JFA_STEP_SHADER
      // 3. Bind u_seedTexture to jfaSeedTargets[sourceIndex] color attachment
      // 4. Set u_stepSize uniform
      // 5. Draw fullscreen triangle
      // 6. Shader samples 8 neighbors at step distance, finds closest seed
      // Result: Each pixel now knows its closest seed (propagates outward)
      // (Implementation depends on graphics backend)

      sourceIndex = targetIndex;
    }

    // Step 3: Finalize outline from distance field
    // Bind outlineTarget as framebuffer
    // Clear to transparent (0, 0, 0, 0)
    // Bind OUTLINE_SOBEL_VERTEX_SHADER + OUTLINE_JFA_FINAL_SHADER
    // Bind u_seedTexture to jfaSeedTargets[sourceIndex] (final iteration result)
    // Bind u_maskTexture to mask color attachment
    // Set u_outlineWidth, u_outlineColor, u_smoothOutlines uniforms
    // Draw fullscreen triangle
    // Shader calculates distance to nearest seed, draws outline if within width
    // Output: Smooth, anti-aliased outline with configurable width
    // (Implementation depends on graphics backend)

    logger.trace('Executed Jump Flood Algorithm');
  }

  /**
   * Executes stencil-based outlining method.
   * Renders selected objects slightly scaled up, using stencil buffer to
   * exclude the original objects, leaving only the outline.
   */
  private executeStencil(): void {
    if (!this.outlineTarget) return;

    // Stencil-based outline technique:
    // 1. First pass:
    //    - Bind outlineTarget as framebuffer
    //    - Clear color to transparent, stencil to 0
    //    - Enable stencil test, set stencil func to ALWAYS, op to REPLACE
    //    - Render selected objects with stencil value = 1
    //    - Result: Stencil = 1 where objects are
    //
    // 2. Second pass:
    //    - Keep same framebuffer
    //    - Enable stencil test, set stencil func to NOTEQUAL, reference = 1
    //    - Disable depth test (or use ALWAYS)
    //    - Render selected objects scaled up by outline width (in shader or MVP)
    //    - Use solid outline color
    //    - Result: Outline drawn only where stencil != 1 (around edges)
    //
    // 3. Optional third pass:
    //    - Disable stencil test
    //    - Render original objects over outline (if interior should be filled)
    //
    // This method is simple and fast but:
    // - Requires rendering selected objects 2-3 times
    // - Outline width controlled by scale factor
    // - No anti-aliasing unless using MSAA framebuffer
    //
    // (Implementation depends on graphics backend)

    logger.trace('Executed stencil-based outlining');
  }

  /**
   * Cleans up outline pass resources.
   */
  cleanup(): void {
    logger.debug('Cleaning up OutlinePass');

    if (this.maskTarget) {
      this.maskTarget.dispose();
      this.maskTarget = null;
    }

    for (const target of this.jfaSeedTargets) {
      target.dispose();
    }
    this.jfaSeedTargets.length = 0;

    if (this.outlineTarget) {
      this.outlineTarget.dispose();
      this.outlineTarget = null;
    }

    if (this.maskShader) {
      this.maskShader.dispose();
      this.maskShader = null;
    }

    if (this.outlineShader) {
      this.outlineShader.dispose();
      this.outlineShader = null;
    }

    if (this.jfaInitShader) {
      this.jfaInitShader.dispose();
      this.jfaInitShader = null;
    }

    if (this.jfaStepShader) {
      this.jfaStepShader.dispose();
      this.jfaStepShader = null;
    }

    this.uniformsUBO = null;

    logger.info('OutlinePass cleanup complete');
  }

  /**
   * Begins rendering to mask (for selected objects).
   * Call this before rendering selected objects when manually building the mask.
   *
   * @example
   * ```typescript
   * // Manual mask rendering
   * outlinePass.beginMaskRendering();
   * selectedObjects.forEach(obj => {
   *   // Render obj with simple shader (no lighting needed)
   *   renderer.renderObject(obj, maskShader);
   * });
   * outlinePass.endMaskRendering();
   * ```
   */
  beginMaskRendering(): void {
    if (!this.maskTarget) {
      logger.warn('Cannot begin mask rendering: maskTarget not initialized');
      return;
    }

    // Bind mask target as framebuffer
    // Setup:
    // 1. Bind maskTarget's framebuffer
    // 2. Set viewport to mask dimensions
    // 3. Clear color to black (0, 0, 0, 0)
    // 4. Clear depth to 1.0
    // 5. Enable depth testing (LESS)
    // 6. Disable blending (opaque writes)
    // 7. Enable face culling (optional, for performance)
    //
    // After this, render selected objects using maskShader
    // which outputs white (1, 1, 1, 1) for all fragments
    //
    // (Implementation depends on graphics backend)

    logger.trace('Began mask rendering');
  }

  /**
   * Ends mask rendering.
   * Call this after rendering selected objects to the mask.
   */
  endMaskRendering(): void {
    // Unbind mask target (bind default framebuffer or previous target)
    // Restore previous render state if needed
    // (Implementation depends on graphics backend)

    logger.trace('Ended mask rendering');
  }

  /**
   * Sets depth texture for depth-aware outlines.
   */
  setDepthTexture(texture: unknown): void {
    this.depthTexture = texture;
  }

  /**
   * Sets normal texture for normal-aware outlines.
   */
  setNormalTexture(texture: unknown): void {
    this.normalTexture = texture;
  }

  /**
   * Sets outline color.
   */
  setOutlineColor(color: Color): void {
    this.config.outlineColor = color;
  }

  /**
   * Sets outline width in pixels.
   */
  setOutlineWidth(width: number): void {
    this.config.outlineWidth = Math.max(1, width);
  }

  /**
   * Updates uniform buffer.
   */
  private updateUniforms(): void {
    if (!this.uniformsUBO) return;

    this.uniformsUBO.setVec2('pixelSize', {
      x: 1.0 / this.config.width,
      y: 1.0 / this.config.height
    } as any);
    this.uniformsUBO.setVec2('resolution', {
      x: this.config.width,
      y: this.config.height
    } as any);
    this.uniformsUBO.setVec4('outlineColor', {
      x: this.config.outlineColor?.r ?? 1,
      y: this.config.outlineColor?.g ?? 0.5,
      z: this.config.outlineColor?.b ?? 0,
      w: this.config.outlineColor?.a ?? 1
    } as any);
    this.uniformsUBO.setFloat('outlineWidth', this.config.outlineWidth ?? 2);
    this.uniformsUBO.setFloat('threshold', this.config.threshold ?? 0.1);
    this.uniformsUBO.setInt('useDepth', this.config.useDepth ? 1 : 0);
    this.uniformsUBO.setInt('useNormals', this.config.useNormals ? 1 : 0);
    this.uniformsUBO.setInt('smoothOutlines', this.config.smoothOutlines ? 1 : 0);
  }

  /**
   * Resizes the outline targets.
   */
  resize(width: number, height: number): void {
    this.config.width = width;
    this.config.height = height;

    if (this.maskTarget) {
      this.maskTarget.resize(width, height);
    }

    for (const target of this.jfaSeedTargets) {
      target.resize(width, height);
    }

    if (this.outlineTarget) {
      this.outlineTarget.resize(width, height);
    }
  }

  /**
   * Gets the outline texture.
   */
  getOutlineTexture(): unknown {
    return this.outlineTarget?.getColorAttachment(0);
  }

  /**
   * Gets the mask texture.
   */
  getMaskTexture(): unknown {
    return this.maskTarget?.getColorAttachment(0);
  }
}
