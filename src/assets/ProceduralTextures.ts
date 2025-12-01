/**
 * Procedural Textures
 * 
 * A centralized collection of procedural texture generators
 * to provide high-quality assets without external dependencies.
 */

import { Color } from '../math/Color';

// Interface for texture data compatible with G3D texture creation
export interface TextureData {
  width: number;
  height: number;
  data: HTMLCanvasElement;
  label: string;
}

/**
 * Procedural Texture Generator
 * Generates high-quality PBR textures (Albedo, Normal, Roughness, Metalness)
 */
export class ProceduralTextures {
  
  // --- UTILITIES ---

  private static createCanvas(width: number, height: number): HTMLCanvasElement {
    if (typeof document === 'undefined') {
        // Handle headless/test environments if necessary, or throw
        throw new Error("ProceduralTextures requires a DOM environment (document).");
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  private static createTexture(canvas: HTMLCanvasElement, label: string): TextureData {
    return { width: canvas.width, height: canvas.height, data: canvas, label };
  }

  private static noise(x: number, y: number): number {
    // Simple pseudo-random noise
    const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return n - Math.floor(n);
  }

  private static fbm(x: number, y: number, octaves: number = 4): number {
    let value = 0;
    let amplitude = 0.5;
    for (let i = 0; i < octaves; i++) {
      value += amplitude * this.noise(x, y);
      x *= 2;
      y *= 2;
      amplitude *= 0.5;
    }
    return value;
  }

  // --- MATERIALS ---

  /**
   * Wood Planks (Albedo)
   */
  static createWoodAlbedo(width = 512, height = 512): TextureData {
    const canvas = this.createCanvas(width, height);
    const ctx = canvas.getContext('2d')!;
    
    // Base wood color
    ctx.fillStyle = '#8B5A2B';
    ctx.fillRect(0, 0, width, height);

    const plankHeight = height / 8;
    
    for (let y = 0; y < height; y++) {
      const plankY = Math.floor(y / plankHeight);
      // Shift x noise for each plank
      const xShift = plankY * 123.45; 

      for (let x = 0; x < width; x++) {
        // Wood grain
        const grain = this.fbm((x + xShift) * 0.02, y * 0.005 + x * 0.002, 4);
        const grainColor = 0.5 + 0.5 * Math.sin(grain * 20); // Rings
        
        // Plank gaps
        let gap = 1.0;
        if (y % Math.floor(plankHeight) === 0 || y % Math.floor(plankHeight) === Math.floor(plankHeight) - 1) gap = 0.2;

        // Compose color
        const r = Math.floor(139 * grainColor * gap);
        const g = Math.floor(90 * grainColor * gap);
        const b = Math.floor(43 * grainColor * gap);
        
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    return this.createTexture(canvas, 'WoodAlbedo');
  }

  /**
   * Concrete/Asphalt (Albedo)
   */
  static createConcreteAlbedo(width = 512, height = 512): TextureData {
    const canvas = this.createCanvas(width, height);
    const ctx = canvas.getContext('2d')!;
    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
      const x = (i / 4) % width;
      const y = Math.floor((i / 4) / width);
      
      const n = this.fbm(x * 0.1, y * 0.1, 3);
      const val = 100 + n * 50; // Grey scale 100-150
      
      data[i] = val;     // R
      data[i + 1] = val; // G
      data[i + 2] = val; // B
      data[i + 3] = 255; // A
    }
    ctx.putImageData(imgData, 0, 0);
    return this.createTexture(canvas, 'ConcreteAlbedo');
  }

  /**
   * Normal Map from Height (Simple Sobel-like)
   * Note: Requires heightMap data, simulated here for demo
   */
  static createNormalFromHeight(heightMap: Float32Array | null, width: number, height: number): TextureData {
    const canvas = this.createCanvas(width, height);
    const ctx = canvas.getContext('2d')!;
    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;

    // Generate a dummy heightmap if null
    const map = heightMap || new Float32Array(width * height);
    if (!heightMap) {
        for(let i=0; i<map.length; i++) map[i] = Math.random();
    }

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        
        // Neighbors (clamped)
        const x1 = Math.min(x + 1, width - 1);
        const x0 = Math.max(x - 1, 0);
        const y1 = Math.min(y + 1, height - 1);
        const y0 = Math.max(y - 1, 0);

        const dx = (map[y * width + x1] - map[y * width + x0]) * 2.0; // Scale bump
        const dy = (map[y1 * width + x] - map[y0 * width + x]) * 2.0;
        const dz = 1.0;

        // Normalize
        const len = Math.sqrt(dx*dx + dy*dy + dz*dz);
        const nx = dx / len;
        const ny = dy / len;
        const nz = dz / len;

        // Pack to RGB [0, 255]
        const i4 = idx * 4;
        data[i4] = Math.floor((nx * 0.5 + 0.5) * 255);
        data[i4+1] = Math.floor((ny * 0.5 + 0.5) * 255);
        data[i4+2] = Math.floor((nz * 0.5 + 0.5) * 255);
        data[i4+3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    return this.createTexture(canvas, 'NormalMap');
  }

  /**
   * Tile/Marble Pattern
   */
  static createMarbleAlbedo(width = 512, height = 512): TextureData {
    const canvas = this.createCanvas(width, height);
    const ctx = canvas.getContext('2d')!;
    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
      const x = (i / 4) % width;
      const y = Math.floor((i / 4) / width);
      
      const n = this.fbm(x * 0.01, y * 0.01, 5);
      const vein = Math.abs(Math.sin(x * 0.05 + n * 5.0)); // Veins
      
      const val = 200 + vein * 55; 
      
      data[i] = val; 
      data[i + 1] = val * 0.95; // Slightly yellow
      data[i + 2] = val * 0.9; 
      data[i + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
    return this.createTexture(canvas, 'MarbleAlbedo');
  }

  /**
   * Sci-Fi Panel (Albedo)
   */
  static createSciFiPanel(width = 512, height = 512): TextureData {
    const canvas = this.createCanvas(width, height);
    const ctx = canvas.getContext('2d')!;
    
    // Base Metal
    ctx.fillStyle = '#303035';
    ctx.fillRect(0, 0, width, height);

    // Grid lines
    ctx.strokeStyle = '#151518';
    ctx.lineWidth = 4;
    
    const gridSize = 64;
    for(let x = 0; x <= width; x+=gridSize) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
    for(let y = 0; y <= height; y+=gridSize) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }

    // Random tech details
    for(let i=0; i<20; i++) {
      const rx = Math.floor(Math.random() * (width/gridSize)) * gridSize;
      const ry = Math.floor(Math.random() * (height/gridSize)) * gridSize;
      
      // Access hatch
      ctx.fillStyle = '#404045';
      ctx.fillRect(rx+5, ry+5, gridSize-10, gridSize-10);
      
      // Emissive Light? (Use separate map usually, but baking into albedo for demo)
      if(Math.random() > 0.7) {
        ctx.fillStyle = '#00FFFF';
        ctx.fillRect(rx+20, ry+20, 24, 8);
      }
    }

    return this.createTexture(canvas, 'SciFiPanel');
  }
  
  // --- SKYBOXES ---

  /**
   * Procedural Starfield Skybox Face
   * @param faceIndex 0-5 (PX, NX, PY, NY, PZ, NZ)
   */
  static createStarfieldFace(width: number, faceIndex: number): TextureData {
    const canvas = this.createCanvas(width, width);
    const ctx = canvas.getContext('2d')!;
    
    // Black void
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, width);

    // Stars
    const starCount = 500;
    for(let i=0; i<starCount; i++) {
      const x = Math.random() * width;
      const y = Math.random() * width;
      const size = Math.random() * 1.5;
      const brightness = Math.random();
      
      ctx.fillStyle = `rgba(255, 255, 255, ${brightness})`;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Nebula cloud (Perlin noise simulation via transparent layers)
    ctx.globalCompositeOperation = 'lighter';
    for(let i=0; i<5; i++) {
        const cx = Math.random() * width;
        const cy = Math.random() * width;
        const rad = width * (0.2 + Math.random() * 0.3);
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
        grad.addColorStop(0, `rgba(${Math.floor(Math.random()*100)}, 0, ${Math.floor(Math.random()*200 + 55)}, 0.1)`); // Purple/Blue
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.fill();
    }

    return this.createTexture(canvas, `Starfield_${faceIndex}`);
  }
}
