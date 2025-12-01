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

import { Color } from 'g3d';

// Note: Using a compatible interface for texture creation
// The actual Texture class from G3D might have different properties
interface SimpleTexture {
  width: number;
  height: number;
  data?: HTMLCanvasElement | ImageData;
  label?: string;
}

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
  static createMetallicPaint(options: TextureGenOptions = {}): SimpleTexture {
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
  static createCarbonFiber(options: TextureGenOptions = {}): SimpleTexture {
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
  static createRacingStripes(options: TextureGenOptions = {}): SimpleTexture {
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
  static createPaintNormalMap(options: TextureGenOptions = {}): SimpleTexture {
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
  static createRoughnessMap(options: TextureGenOptions = {}): SimpleTexture {
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
  static createNumberDecal(number: number, color: Color = new Color(1, 1, 1)): SimpleTexture {
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
  static createTireTread(options: TextureGenOptions = {}): SimpleTexture {
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
  static createChromeRim(options: TextureGenOptions = {}): SimpleTexture {
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

  /**
   * Create asphalt albedo texture
   */
  static createAsphaltAlbedo(options: TextureGenOptions = {}): SimpleTexture {
    const width = options.width || 1024;
    const height = options.height || 1024;
    const baseColor = options.baseColor || new Color(0.15, 0.15, 0.15); // Dark grey

    const canvas = this.createCanvas(width, height);
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;

    // Generate asphalt noise
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;

        // High frequency noise for grain
        const noise = this.noise2D(x * 0.5, y * 0.5);
        const grain = (Math.random() - 0.5) * 0.15;
        
        // Low frequency noise for patches
        const patch = this.noise2D(x * 0.01, y * 0.01) * 0.1;

        const r = Math.min(1, Math.max(0, baseColor.r + grain + patch));
        const g = Math.min(1, Math.max(0, baseColor.g + grain + patch));
        const b = Math.min(1, Math.max(0, baseColor.b + grain + patch));

        data[idx] = Math.floor(r * 255);
        data[idx + 1] = Math.floor(g * 255);
        data[idx + 2] = Math.floor(b * 255);
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return this.createTextureFromCanvas(canvas, 'AsphaltAlbedo');
  }

  /**
   * Create asphalt normal map
   */
  static createAsphaltNormal(options: TextureGenOptions = {}): SimpleTexture {
    const width = options.width || 1024;
    const height = options.height || 1024;

    const canvas = this.createCanvas(width, height);
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;

        // Generate derivatives from noise
        // Simulating neighbor lookups analytically for speed
        const scale = 0.8; // Roughness scale
        const hL = this.noise2D((x - 1) * scale, y * scale);
        const hR = this.noise2D((x + 1) * scale, y * scale);
        const hU = this.noise2D(x * scale, (y - 1) * scale);
        const hD = this.noise2D(x * scale, (y + 1) * scale);

        const dx = (hL - hR) * 2.0; // Exaggerate bumps
        const dy = (hU - hD) * 2.0;
        const dz = 1.0 / 3.0; // Strength

        // Normalize
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const nx = dx / len;
        const ny = dy / len;
        const nz = dz / len;

        // Pack to [0, 255]
        data[idx] = Math.floor((nx * 0.5 + 0.5) * 255);
        data[idx + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
        data[idx + 2] = Math.floor((nz * 0.5 + 0.5) * 255);
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return this.createTextureFromCanvas(canvas, 'AsphaltNormal');
  }

  /**
   * Create high-quality procedural skybox texture (Equirectangular)
   * Creates a rich sunset/sunrise environment for IBL
   */
  static createProceduralSkybox(options: TextureGenOptions = {}): SimpleTexture {
    const width = options.width || 2048; // Higher res for reflections
    const height = options.height || 1024;
    
    const canvas = this.createCanvas(width, height);
    const ctx = canvas.getContext('2d')!;
    
    // 1. Sky Gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    // Zenith (Deep Blue)
    gradient.addColorStop(0.0, '#051030'); 
    // Mid Sky (Lighter Blue/Purple)
    gradient.addColorStop(0.4, '#1a2a50');
    // Horizon (Sunset Orange/Pink)
    gradient.addColorStop(0.5, '#fd7e4d');
    // Ground Haze (Purple)
    gradient.addColorStop(0.55, '#6b3fa0');
    // Ground (Dark)
    gradient.addColorStop(1.0, '#050505');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // 2. Sun (Bright directional light source)
    // Positioned to match the game's directional light if possible
    const sunX = width * 0.75;
    const sunY = height * 0.45;
    const sunRadius = height * 0.05;

    // Sun Glow
    const sunGlow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunRadius * 4);
    sunGlow.addColorStop(0, 'rgba(255, 200, 150, 0.6)');
    sunGlow.addColorStop(1, 'rgba(255, 100, 50, 0)');
    ctx.fillStyle = sunGlow;
    ctx.fillRect(0, 0, width, height);

    // Sun Core
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#fff5e6';
    ctx.fill();

    // 3. Clouds (Simple horizontal strips for reflection interest)
    ctx.fillStyle = 'rgba(255, 200, 200, 0.1)';
    for(let i=0; i<20; i++) {
        const cx = Math.random() * width;
        const cy = Math.random() * height * 0.4; // Upper sky only
        const cw = width * (0.1 + Math.random() * 0.2);
        const ch = height * 0.02;
        ctx.beginPath();
        ctx.ellipse(cx, cy, cw, ch, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // 4. Horizon City/Landscape Silhouette (for ground reflections)
    ctx.fillStyle = '#020202';
    ctx.beginPath();
    ctx.moveTo(0, height * 0.52);
    for(let x=0; x<=width; x+=10) {
        const h = this.noise2D(x * 0.02, 0) * height * 0.05;
        ctx.lineTo(x, height * 0.52 + h);
    }
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.fill();

    return this.createTextureFromCanvas(canvas, 'ProceduralSkybox');
  }

  /**
   * Create 6 faces for a cubemap skybox
   * Returns array of [PX, NX, PY, NY, PZ, NZ] canvases
   */
  static createSkyboxCubemapFaces(size: number = 512): SimpleTexture[] {
    const faces: SimpleTexture[] = [];
    const directions = [
      { name: 'PX', u: 'z', v: 'y', dir: [1, 0, 0] },  // Pos X
      { name: 'NX', u: '-z', v: 'y', dir: [-1, 0, 0] }, // Neg X
      { name: 'PY', u: 'x', v: '-z', dir: [0, 1, 0] },  // Pos Y (Top)
      { name: 'NY', u: 'x', v: 'z', dir: [0, -1, 0] },  // Neg Y (Bottom)
      { name: 'PZ', u: '-x', v: 'y', dir: [0, 0, 1] },  // Pos Z
      { name: 'NZ', u: 'x', v: 'y', dir: [0, 0, -1] },  // Neg Z
    ];

    const sunDir = new Color(0.2, 0.6, -0.8); // Approximate sun direction
    // Normalize sun dir manually
    const len = Math.sqrt(sunDir.r*sunDir.r + sunDir.g*sunDir.g + sunDir.b*sunDir.b);
    const sx = sunDir.r/len, sy = sunDir.g/len, sz = sunDir.b/len;

    for (let i = 0; i < 6; i++) {
      const canvas = this.createCanvas(size, size);
      const ctx = canvas.getContext('2d')!;
      const imageData = ctx.createImageData(size, size);
      const data = imageData.data;

      // Ray trace each pixel to sphere
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          // Normalized coordinates -1 to 1
          const u = (x / size) * 2 - 1;
          const v = (y / size) * 2 - 1; 
          // Flip v for canvas Y-down
          const vFlip = -v;

          let dx=0, dy=0, dz=0;
          
          // Map UV to direction vector based on face
          // This is a simplified mapping, assuming standard cubemap layout
          switch(i) {
            case 0: dx = 1; dy = vFlip; dz = -u; break; // PX
            case 1: dx = -1; dy = vFlip; dz = u; break; // NX
            case 2: dx = u; dy = 1; dz = vFlip; break; // PY (Top) - check orientation
            case 3: dx = u; dy = -1; dz = -vFlip; break; // NY (Bottom)
            case 4: dx = u; dy = vFlip; dz = 1; break; // PZ
            case 5: dx = -u; dy = vFlip; dz = -1; break; // NZ
          }

          // Normalize direction
          const dLen = Math.sqrt(dx*dx + dy*dy + dz*dz);
          const nx = dx/dLen, ny = dy/dLen, nz = dz/dLen;

          // --- SKY RENDERING LOGIC ---
          // 1. Vertical Gradient
          // ny goes from -1 (down) to 1 (up)
          const horizon = 0.0;
          
          let r=0, g=0, b=0;

          if (ny > 0) {
            // Sky
            const t = Math.pow(ny, 0.5); // Soften gradient
            // Zenith (Deep Blue) #051030 to Horizon (Orange) #fd7e4d
            r = this.lerp(0.99, 0.02, t);
            g = this.lerp(0.49, 0.06, t);
            b = this.lerp(0.30, 0.19, t);
          } else {
            // Ground
            const t = Math.pow(-ny, 0.3);
            // Horizon (Purple/Haze) #6b3fa0 to Ground #050505
            r = this.lerp(0.42, 0.02, t);
            g = this.lerp(0.25, 0.02, t);
            b = this.lerp(0.63, 0.02, t);
          }

          // 2. Sun
          const dot = nx*sx + ny*sy + nz*sz;
          if (dot > 0.99) {
             const sunT = (dot - 0.99) * 100.0; // 0 to 1
             r = Math.max(r, sunT);
             g = Math.max(g, sunT);
             b = Math.max(b, sunT);
          }
          // Sun glow
          if (dot > 0.9) {
             const glowT = (dot - 0.9) * 10.0;
             r += glowT * 0.5;
             g += glowT * 0.3;
             b += glowT * 0.1;
          }

          // Write pixel
          const idx = (y * size + x) * 4;
          data[idx] = Math.floor(Math.min(1, r) * 255);
          data[idx+1] = Math.floor(Math.min(1, g) * 255);
          data[idx+2] = Math.floor(Math.min(1, b) * 255);
          data[idx+3] = 255;
        }
      }
      
      ctx.putImageData(imageData, 0, 0);
      faces.push(this.createTextureFromCanvas(canvas, `SkyFace_${i}`));
    }
    return faces;
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
   * Create simple texture object from canvas
   */
  private static createTextureFromCanvas(canvas: HTMLCanvasElement, label: string): SimpleTexture {
    return {
      width: canvas.width,
      height: canvas.height,
      data: canvas,
      label: label
    };
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
  static createGlossyRed(): SimpleTexture {
    return ProceduralTextureGenerator.createMetallicPaint({
      baseColor: new Color(0.9, 0.1, 0.1),
      variation: 0.03
    });
  }

  /**
   * Create a metallic blue car paint
   */
  static createMetallicBlue(): SimpleTexture {
    return ProceduralTextureGenerator.createMetallicPaint({
      baseColor: new Color(0.1, 0.4, 0.95),
      variation: 0.05
    });
  }

  /**
   * Create a metallic silver car paint
   */
  static createMetallicSilver(): SimpleTexture {
    return ProceduralTextureGenerator.createMetallicPaint({
      baseColor: new Color(0.8, 0.8, 0.85),
      variation: 0.04
    });
  }

  /**
   * Create a matte black car paint
   */
  static createMatteBlack(): SimpleTexture {
    return ProceduralTextureGenerator.createMetallicPaint({
      baseColor: new Color(0.05, 0.05, 0.05),
      variation: 0.01
    });
  }

  /**
   * Create a bright yellow racing car paint
   */
  static createRacingYellow(): SimpleTexture {
    return ProceduralTextureGenerator.createMetallicPaint({
      baseColor: new Color(0.95, 0.85, 0.1),
      variation: 0.02
    });
  }

  /**
   * Create an orange car paint
   */
  static createVividOrange(): SimpleTexture {
    return ProceduralTextureGenerator.createMetallicPaint({
      baseColor: new Color(1.0, 0.5, 0.1),
      variation: 0.03
    });
  }

  /**
   * Create a purple car paint
   */
  static createDeepPurple(): SimpleTexture {
    return ProceduralTextureGenerator.createMetallicPaint({
      baseColor: new Color(0.6, 0.15, 0.8),
      variation: 0.04
    });
  }

  /**
   * Create a teal/cyan car paint
   */
  static createElectricTeal(): SimpleTexture {
    return ProceduralTextureGenerator.createMetallicPaint({
      baseColor: new Color(0.1, 0.85, 0.7),
      variation: 0.03
    });
  }
}
