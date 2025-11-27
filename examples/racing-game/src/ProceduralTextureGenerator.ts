/**
 * ProceduralTextureGenerator.ts - Generate procedural textures for car materials
 *
 * Creates realistic car paint textures including:
 * - Metallic car paint with color variation
 * - Carbon fiber patterns
 * - Racing stripes and decals
 * - Normal maps for surface detail
 * - Roughness maps for material variation
 */

import { Texture, TextureFormat } from 'g3d';
import { Color } from 'g3d';

/**
 * Texture generation options
 */
export interface TextureGenOptions {
  /** Texture width in pixels */
  width?: number;
  /** Texture height in pixels */
  height?: number;
  /** Base color for the texture */
  baseColor?: Color;
  /** Variation amount (0-1) */
  variation?: number;
  /** Pattern type */
  pattern?: 'solid' | 'metallic' | 'carbon' | 'stripes' | 'racing';
}

/**
 * Generates procedural textures for racing game
 */
export class ProceduralTextureGenerator {
  /**
   * Create a metallic car paint texture with subtle color variation
   */
  static createMetallicPaint(options: TextureGenOptions = {}): Texture {
    const width = options.width || 512;
    const height = options.height || 512;
    const baseColor = options.baseColor || new Color(0.8, 0.1, 0.1);
    const variation = options.variation || 0.05;

    // Create canvas for texture generation
    const canvas = this.createCanvas(width, height);
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;

    // Generate metallic paint with subtle variation
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;

        // Add Perlin-like noise for metallic flakes
        const noise = this.noise2D(x * 0.1, y * 0.1) * variation;
        const flakeNoise = this.noise2D(x * 0.5, y * 0.5) * variation * 0.5;

        // Apply color with variation
        data[idx] = Math.floor((baseColor.r + noise + flakeNoise) * 255);
        data[idx + 1] = Math.floor((baseColor.g + noise + flakeNoise) * 255);
        data[idx + 2] = Math.floor((baseColor.b + noise + flakeNoise) * 255);
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);

    // Create texture from canvas
    return this.createTextureFromCanvas(canvas, 'MetallicPaint');
  }

  /**
   * Create a carbon fiber pattern texture
   */
  static createCarbonFiber(options: TextureGenOptions = {}): Texture {
    const width = options.width || 512;
    const height = options.height || 512;

    const canvas = this.createCanvas(width, height);
    const ctx = canvas.getContext('2d')!;

    // Draw carbon fiber weave pattern
    const tileSize = 32;

    for (let y = 0; y < height; y += tileSize) {
      for (let x = 0; x < width; x += tileSize) {
        // Alternating weave pattern
        const isOdd = ((x / tileSize) + (y / tileSize)) % 2 === 1;

        if (isOdd) {
          // Horizontal fibers
          ctx.fillStyle = '#1a1a1a';
          ctx.fillRect(x, y, tileSize, tileSize);
          ctx.fillStyle = '#0f0f0f';
          for (let i = 0; i < tileSize; i += 4) {
            ctx.fillRect(x, y + i, tileSize, 2);
          }
        } else {
          // Vertical fibers
          ctx.fillStyle = '#1a1a1a';
          ctx.fillRect(x, y, tileSize, tileSize);
          ctx.fillStyle = '#0f0f0f';
          for (let i = 0; i < tileSize; i += 4) {
            ctx.fillRect(x + i, y, 2, tileSize);
          }
        }
      }
    }

    return this.createTextureFromCanvas(canvas, 'CarbonFiber');
  }

  /**
   * Create racing stripes texture
   */
  static createRacingStripes(options: TextureGenOptions = {}): Texture {
    const width = options.width || 512;
    const height = options.height || 512;
    const baseColor = options.baseColor || new Color(1, 1, 1);

    const canvas = this.createCanvas(width, height);
    const ctx = canvas.getContext('2d')!;

    // Clear to transparent
    ctx.clearRect(0, 0, width, height);

    // Draw two parallel stripes
    const stripeWidth = width * 0.15;
    const stripeGap = width * 0.1;
    const centerX = width / 2;

    ctx.fillStyle = `rgb(${baseColor.r * 255}, ${baseColor.g * 255}, ${baseColor.b * 255})`;

    // Left stripe
    ctx.fillRect(centerX - stripeGap - stripeWidth, 0, stripeWidth, height);

    // Right stripe
    ctx.fillRect(centerX + stripeGap, 0, stripeWidth, height);

    return this.createTextureFromCanvas(canvas, 'RacingStripes');
  }

  /**
   * Create a normal map for car paint (subtle bumps)
   */
  static createPaintNormalMap(options: TextureGenOptions = {}): Texture {
    const width = options.width || 512;
    const height = options.height || 512;

    const canvas = this.createCanvas(width, height);
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;

    // Generate normal map (blue = flat, variations in R/G for surface bumps)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;

        // Very subtle surface variation
        const nx = 0.5 + this.noise2D(x * 0.2, y * 0.2) * 0.02;
        const ny = 0.5 + this.noise2D(x * 0.2 + 100, y * 0.2 + 100) * 0.02;
        const nz = 0.8; // Mostly pointing up

        // Encode as color (0.5, 0.5, 1.0) = flat surface
        data[idx] = Math.floor(nx * 255);
        data[idx + 1] = Math.floor(ny * 255);
        data[idx + 2] = Math.floor(nz * 255);
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);

    return this.createTextureFromCanvas(canvas, 'PaintNormalMap');
  }

  /**
   * Create a roughness map (variation in glossiness)
   */
  static createRoughnessMap(options: TextureGenOptions = {}): Texture {
    const width = options.width || 512;
    const height = options.height || 512;
    const baseRoughness = options.variation || 0.25;

    const canvas = this.createCanvas(width, height);
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;

    // Generate roughness variation
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;

        // Roughness with subtle variation
        const noise = this.noise2D(x * 0.05, y * 0.05) * 0.1;
        const roughness = Math.max(0, Math.min(1, baseRoughness + noise));

        const value = Math.floor(roughness * 255);
        data[idx] = value;
        data[idx + 1] = value;
        data[idx + 2] = value;
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);

    return this.createTextureFromCanvas(canvas, 'RoughnessMap');
  }

  /**
   * Create number decal texture
   */
  static createNumberDecal(number: number, color: Color = new Color(1, 1, 1)): Texture {
    const width = 256;
    const height = 256;

    const canvas = this.createCanvas(width, height);
    const ctx = canvas.getContext('2d')!;

    // Clear to transparent
    ctx.clearRect(0, 0, width, height);

    // Draw number
    ctx.fillStyle = `rgb(${color.r * 255}, ${color.g * 255}, ${color.b * 255})`;
    ctx.font = 'bold 180px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(number.toString(), width / 2, height / 2);

    // Add outline
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 8;
    ctx.strokeText(number.toString(), width / 2, height / 2);

    return this.createTextureFromCanvas(canvas, `NumberDecal_${number}`);
  }

  /**
   * Create tire tread pattern
   */
  static createTireTread(options: TextureGenOptions = {}): Texture {
    const width = options.width || 512;
    const height = options.height || 512;

    const canvas = this.createCanvas(width, height);
    const ctx = canvas.getContext('2d')!;

    // Dark rubber base
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);

    // Add tread pattern
    ctx.strokeStyle = '#0f0f0f';
    ctx.lineWidth = 8;

    // Horizontal grooves
    for (let y = 0; y < height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Diagonal cuts
    for (let x = -height; x < width; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 30, height);
      ctx.stroke();
    }

    return this.createTextureFromCanvas(canvas, 'TireTread');
  }

  /**
   * Create chrome/metallic rim texture
   */
  static createChromeRim(options: TextureGenOptions = {}): Texture {
    const width = options.width || 512;
    const height = options.height || 512;

    const canvas = this.createCanvas(width, height);
    const ctx = canvas.getContext('2d')!;

    // Create radial gradient for chrome effect
    const gradient = ctx.createRadialGradient(
      width / 2, height / 2, 0,
      width / 2, height / 2, width / 2
    );
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.5, '#cccccc');
    gradient.addColorStop(1, '#999999');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Add spoke lines
    ctx.strokeStyle = '#666666';
    ctx.lineWidth = 4;

    const centerX = width / 2;
    const centerY = height / 2;
    const numSpokes = 8;

    for (let i = 0; i < numSpokes; i++) {
      const angle = (i / numSpokes) * Math.PI * 2;
      const x = centerX + Math.cos(angle) * width * 0.4;
      const y = centerY + Math.sin(angle) * height * 0.4;

      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(x, y);
      ctx.stroke();
    }

    return this.createTextureFromCanvas(canvas, 'ChromeRim');
  }

  // ========================================================================
  // UTILITY METHODS
  // ========================================================================

  /**
   * Create an offscreen canvas
   */
  private static createCanvas(width: number, height: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  /**
   * Create G3D texture from canvas
   */
  private static createTextureFromCanvas(canvas: HTMLCanvasElement, label: string): Texture {
    const texture = new Texture({
      width: canvas.width,
      height: canvas.height,
      format: TextureFormat.RGBA8,
      label: label
    });

    // Set texture data from canvas
    texture.setData({ data: canvas });

    return texture;
  }

  /**
   * Simple 2D noise function (pseudo-random)
   */
  private static noise2D(x: number, y: number): number {
    const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return n - Math.floor(n);
  }

  /**
   * Smooth interpolation
   */
  private static smoothstep(edge0: number, edge1: number, x: number): number {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  /**
   * Linear interpolation
   */
  private static lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }
}

/**
 * Pre-configured car paint presets
 */
export class CarPaintPresets {
  /**
   * Create a glossy red car paint
   */
  static createGlossyRed(): Texture {
    return ProceduralTextureGenerator.createMetallicPaint({
      baseColor: new Color(0.9, 0.1, 0.1),
      variation: 0.03
    });
  }

  /**
   * Create a metallic blue car paint
   */
  static createMetallicBlue(): Texture {
    return ProceduralTextureGenerator.createMetallicPaint({
      baseColor: new Color(0.1, 0.4, 0.95),
      variation: 0.05
    });
  }

  /**
   * Create a metallic silver car paint
   */
  static createMetallicSilver(): Texture {
    return ProceduralTextureGenerator.createMetallicPaint({
      baseColor: new Color(0.8, 0.8, 0.85),
      variation: 0.04
    });
  }

  /**
   * Create a matte black car paint
   */
  static createMatteBlack(): Texture {
    return ProceduralTextureGenerator.createMetallicPaint({
      baseColor: new Color(0.05, 0.05, 0.05),
      variation: 0.01
    });
  }

  /**
   * Create a bright yellow racing car paint
   */
  static createRacingYellow(): Texture {
    return ProceduralTextureGenerator.createMetallicPaint({
      baseColor: new Color(0.95, 0.85, 0.1),
      variation: 0.02
    });
  }

  /**
   * Create an orange car paint
   */
  static createVividOrange(): Texture {
    return ProceduralTextureGenerator.createMetallicPaint({
      baseColor: new Color(1.0, 0.5, 0.1),
      variation: 0.03
    });
  }

  /**
   * Create a purple car paint
   */
  static createDeepPurple(): Texture {
    return ProceduralTextureGenerator.createMetallicPaint({
      baseColor: new Color(0.6, 0.15, 0.8),
      variation: 0.04
    });
  }

  /**
   * Create a teal/cyan car paint
   */
  static createElectricTeal(): Texture {
    return ProceduralTextureGenerator.createMetallicPaint({
      baseColor: new Color(0.1, 0.85, 0.7),
      variation: 0.03
    });
  }
}
