/**
 * G3D 5.0 Multi-Resolution Renderer
 *
 * Multi-resolution foveated rendering that renders different screen regions
 * at different resolutions and composites them seamlessly.
 *
 * @example
 * ```typescript
 * const multiRes = new MultiResolutionRenderer({
 *   regions: [
 *     { radius: 0.3, resolution: 1.0 },
 *     { radius: 0.6, resolution: 0.5 },
 *     { radius: 1.0, resolution: 0.25 }
 *   ]
 * });
 *
 * multiRes.setup(canvas, gl);
 *
 * // In render loop
 * multiRes.setGazePoint(gazePosition);
 * multiRes.render((region) => {
 *   // Render scene for this region
 *   renderScene(region.viewport);
 * });
 * ```
 */

/**
 * Resolution region configuration
 */
export interface ResolutionRegion {
  /** Radius from center (0-1) */
  radius: number;

  /** Resolution scale (0-1) */
  resolution: number;
}

/**
 * Multi-resolution renderer options
 */
export interface MultiResolutionOptions {
  /** Resolution regions (inner to outer) */
  regions?: ResolutionRegion[];

  /** Blending width between regions */
  blendWidth?: number;

  /** Enable bilinear filtering */
  filtering?: boolean;

  /** Memory optimization mode */
  memoryOptimized?: boolean;

  /** Debug visualization */
  debug?: boolean;
}

/**
 * Render region with framebuffer
 */
interface RenderRegion {
  /** Region configuration */
  config: ResolutionRegion;

  /** Framebuffer */
  framebuffer: WebGLFramebuffer;

  /** Color texture */
  texture: WebGLTexture;

  /** Depth renderbuffer */
  depthBuffer: WebGLRenderbuffer;

  /** Width in pixels */
  width: number;

  /** Height in pixels */
  height: number;

  /** Viewport configuration */
  viewport: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * Multi-Resolution Renderer
 *
 * Implements multi-resolution foveated rendering with seamless compositing.
 */
export class MultiResolutionRenderer {
  private options: Required<MultiResolutionOptions>;

  private gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  private canvas: HTMLCanvasElement | null = null;

  private regions: RenderRegion[] = [];
  private gazePosition: { x: number; y: number } = { x: 0.5, y: 0.5 };

  private compositeProgram: WebGLProgram | null = null;
  private quadVAO: WebGLVertexArrayObject | null = null;

  private isSetup: boolean = false;
  private canvasWidth: number = 0;
  private canvasHeight: number = 0;

  /**
   * Creates a new Multi-Resolution Renderer
   *
   * @param options - Renderer options
   */
  constructor(options: MultiResolutionOptions = {}) {
    this.options = {
      regions: options.regions || [
        { radius: 0.25, resolution: 1.0 },
        { radius: 0.5, resolution: 0.7 },
        { radius: 0.75, resolution: 0.4 },
        { radius: 1.0, resolution: 0.25 }
      ],
      blendWidth: options.blendWidth ?? 0.1,
      filtering: options.filtering ?? true,
      memoryOptimized: options.memoryOptimized ?? true,
      debug: options.debug ?? false
    };

    // Sort regions by radius
    this.options.regions.sort((a, b) => a.radius - b.radius);
  }

  /**
   * Sets up the renderer
   *
   * @param canvas - Canvas element
   * @param gl - WebGL context
   */
  setup(canvas: HTMLCanvasElement, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.canvas = canvas;
    this.gl = gl;
    this.canvasWidth = canvas.width;
    this.canvasHeight = canvas.height;

    // Create render regions
    this.createRenderRegions();

    // Create composite shader
    this.createCompositeShader();

    // Create quad
    this.createQuad();

    this.isSetup = true;

    console.log(`Multi-resolution renderer setup with ${this.regions.length} regions`);
  }

  /**
   * Creates render regions with framebuffers
   */
  private createRenderRegions(): void {
    if (!this.gl) return;

    const gl = this.gl;

    this.regions = this.options.regions.map(config => {
      const width = Math.max(16, Math.floor(this.canvasWidth * config.resolution));
      const height = Math.max(16, Math.floor(this.canvasHeight * config.resolution));

      // Create framebuffer
      const framebuffer = gl.createFramebuffer()!;

      // Create color texture
      const texture = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        width,
        height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null
      );

      const filter = this.options.filtering ? gl.LINEAR : gl.NEAREST;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      // Create depth buffer
      const depthBuffer = gl.createRenderbuffer()!;
      gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);

      // Attach to framebuffer
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        texture,
        0
      );
      gl.framebufferRenderbuffer(
        gl.FRAMEBUFFER,
        gl.DEPTH_ATTACHMENT,
        gl.RENDERBUFFER,
        depthBuffer
      );

      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        console.error('Framebuffer incomplete');
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      return {
        config,
        framebuffer,
        texture,
        depthBuffer,
        width,
        height,
        viewport: { x: 0, y: 0, width, height }
      };
    });
  }

  /**
   * Creates composite shader
   */
  private createCompositeShader(): void {
    if (!this.gl) return;

    const gl = this.gl;

    const vertexShader = this.compileShader(
      gl.VERTEX_SHADER,
      `
      attribute vec2 position;
      varying vec2 vUv;

      void main() {
        vUv = position * 0.5 + 0.5;
        gl_Position = vec4(position, 0.0, 1.0);
      }
      `
    );

    const numRegions = this.options.regions.length;

    const fragmentShader = this.compileShader(
      gl.FRAGMENT_SHADER,
      `
      precision highp float;

      varying vec2 vUv;
      uniform sampler2D uRegions[${numRegions}];
      uniform vec2 uGazePoint;
      uniform float uRadii[${numRegions}];
      uniform float uBlendWidth;
      uniform bool uDebug;

      void main() {
        vec2 toGaze = vUv - uGazePoint;
        float distance = length(toGaze);

        vec4 color = vec4(0.0);
        float totalWeight = 0.0;

        for (int i = 0; i < ${numRegions}; i++) {
          float innerRadius = i > 0 ? uRadii[i - 1] : 0.0;
          float outerRadius = uRadii[i];

          // Calculate blend weights
          float weight = 0.0;

          if (distance < innerRadius) {
            weight = i == 0 ? 1.0 : 0.0;
          } else if (distance > outerRadius) {
            weight = 0.0;
          } else if (distance >= innerRadius && distance <= outerRadius) {
            // Within this region
            float t = (distance - innerRadius) / (outerRadius - innerRadius);

            // Apply blending
            if (t < uBlendWidth && i > 0) {
              // Blend with inner region
              weight = smoothstep(0.0, uBlendWidth, t);
            } else if (t > 1.0 - uBlendWidth && i < ${numRegions - 1}) {
              // Blend with outer region
              weight = 1.0 - smoothstep(1.0 - uBlendWidth, 1.0, t);
            } else {
              weight = 1.0;
            }
          }

          if (weight > 0.001) {
            color += texture2D(uRegions[i], vUv) * weight;
            totalWeight += weight;
          }
        }

        if (totalWeight > 0.0) {
          color /= totalWeight;
        }

        if (uDebug) {
          // Visualize regions
          for (int i = 0; i < ${numRegions}; i++) {
            if (abs(distance - uRadii[i]) < 0.01) {
              color.rgb = vec3(1.0, 0.0, 0.0);
            }
          }

          // Mark gaze point
          if (distance < 0.02) {
            color.rgb = vec3(0.0, 1.0, 0.0);
          }
        }

        gl_FragColor = color;
      }
      `
    );

    if (!vertexShader || !fragmentShader) {
      console.error('Failed to compile shaders');
      return;
    }

    this.compositeProgram = gl.createProgram()!;
    gl.attachShader(this.compositeProgram, vertexShader);
    gl.attachShader(this.compositeProgram, fragmentShader);
    gl.linkProgram(this.compositeProgram);

    if (!gl.getProgramParameter(this.compositeProgram, gl.LINK_STATUS)) {
      console.error('Shader link error:', gl.getProgramInfoLog(this.compositeProgram));
    }
  }

  /**
   * Compiles a shader
   *
   * @param type - Shader type
   * @param source - Shader source
   * @returns Compiled shader
   */
  private compileShader(type: number, source: string): WebGLShader | null {
    if (!this.gl) return null;

    const gl = this.gl;
    const shader = gl.createShader(type);
    if (!shader) return null;

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
      return null;
    }

    return shader;
  }

  /**
   * Creates fullscreen quad
   */
  private createQuad(): void {
    if (!this.gl) return;

    const gl = this.gl;

    const positions = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
       1,  1
    ]);

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    if (gl instanceof WebGL2RenderingContext) {
      this.quadVAO = gl.createVertexArray();
      gl.bindVertexArray(this.quadVAO);

      const posLoc = gl.getAttribLocation(this.compositeProgram!, 'position');
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

      gl.bindVertexArray(null);
    }
  }

  /**
   * Sets gaze point for rendering
   *
   * @param gaze - Gaze position (0-1)
   */
  setGazePoint(gaze: { x: number; y: number }): void {
    this.gazePosition = { ...gaze };
  }

  /**
   * Renders with multi-resolution
   *
   * @param renderCallback - Callback to render each region
   */
  render(renderCallback: (region: RenderRegion, index: number) => void): void {
    if (!this.isSetup || !this.gl) return;

    const gl = this.gl;

    // Render each region
    this.regions.forEach((region, index) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, region.framebuffer);
      gl.viewport(0, 0, region.width, region.height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      renderCallback(region, index);
    });

    // Composite to screen
    this.composite();
  }

  /**
   * Composites regions to screen
   */
  private composite(): void {
    if (!this.gl || !this.compositeProgram) return;

    const gl = this.gl;

    // Bind default framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvasWidth, this.canvasHeight);

    // Use shader
    gl.useProgram(this.compositeProgram);

    // Bind region textures
    this.regions.forEach((region, index) => {
      gl.activeTexture(gl.TEXTURE0 + index);
      gl.bindTexture(gl.TEXTURE_2D, region.texture);
      gl.uniform1i(gl.getUniformLocation(this.compositeProgram!, `uRegions[${index}]`), index);
    });

    // Set uniforms
    gl.uniform2f(
      gl.getUniformLocation(this.compositeProgram, 'uGazePoint'),
      this.gazePosition.x,
      this.gazePosition.y
    );

    const radii = this.options.regions.map(r => r.radius);
    gl.uniform1fv(gl.getUniformLocation(this.compositeProgram, 'uRadii'), radii);
    gl.uniform1f(gl.getUniformLocation(this.compositeProgram, 'uBlendWidth'), this.options.blendWidth);
    gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'uDebug'), this.options.debug ? 1 : 0);

    // Draw quad
    if (this.quadVAO && gl instanceof WebGL2RenderingContext) {
      gl.bindVertexArray(this.quadVAO);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
    }
  }

  /**
   * Gets render region for distance from gaze
   *
   * @param distance - Distance from gaze (0-1)
   * @returns Region index
   */
  getRegionForDistance(distance: number): number {
    for (let i = 0; i < this.options.regions.length; i++) {
      if (distance <= this.options.regions[i].radius) {
        return i;
      }
    }
    return this.options.regions.length - 1;
  }

  /**
   * Estimates memory usage
   *
   * @returns Memory usage in bytes
   */
  estimateMemoryUsage(): number {
    let total = 0;

    this.regions.forEach(region => {
      // Color texture: RGBA * width * height
      total += 4 * region.width * region.height;

      // Depth buffer: 2 bytes per pixel (DEPTH_COMPONENT16)
      total += 2 * region.width * region.height;
    });

    return total;
  }

  /**
   * Estimates performance gain
   *
   * @returns Pixel reduction percentage
   */
  estimatePerformanceGain(): number {
    const fullResPixels = this.canvasWidth * this.canvasHeight;
    let actualPixels = 0;

    const samples = 100;
    for (let y = 0; y < samples; y++) {
      for (let x = 0; x < samples; x++) {
        const nx = x / samples;
        const ny = y / samples;

        const dx = nx - this.gazePosition.x;
        const dy = ny - this.gazePosition.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        const regionIndex = this.getRegionForDistance(distance);
        const resolution = this.options.regions[regionIndex].resolution;

        actualPixels += resolution * resolution;
      }
    }

    actualPixels = (actualPixels / (samples * samples)) * fullResPixels;

    return (1 - actualPixels / fullResPixels) * 100;
  }

  /**
   * Cleans up resources
   */
  dispose(): void {
    if (!this.gl) return;

    const gl = this.gl;

    this.regions.forEach(region => {
      gl.deleteFramebuffer(region.framebuffer);
      gl.deleteTexture(region.texture);
      gl.deleteRenderbuffer(region.depthBuffer);
    });

    if (this.compositeProgram) gl.deleteProgram(this.compositeProgram);

    if (this.quadVAO && gl instanceof WebGL2RenderingContext) {
      gl.deleteVertexArray(this.quadVAO);
    }

    this.regions = [];
    this.isSetup = false;
  }
}
