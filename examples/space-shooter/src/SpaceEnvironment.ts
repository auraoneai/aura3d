/**
 * Space Environment
 * Scrolling starfield, nebula backgrounds, and space dust particles
 */

import { ProceduralTextures } from 'g3d';

interface Star {
  x: number;
  y: number;
  z: number;
  size: number;
  speed: number;
}

interface Nebula {
  x: number;
  y: number;
  radius: number;
  color: string;
  alpha: number;
  drift: number;
}

interface DustParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
}

export class SpaceEnvironment {
  private canvasWidth: number;
  private canvasHeight: number;

  private stars: Star[] = [];
  private nebulae: Nebula[] = [];
  private dustParticles: DustParticle[] = [];

  private nebulaOffset: number = 0;
  
  // High-quality background layers
  private bgLayer1: HTMLCanvasElement | null = null;
  private bgLayer2: HTMLCanvasElement | null = null;
  private bgOffset1: number = 0;
  private bgOffset2: number = 0;

  constructor(canvasWidth: number, canvasHeight: number) {
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;

    this.initBackgroundLayers();
    this.initStars();
    this.initNebulae();
    this.initDust();
  }

  private initBackgroundLayers(): void {
    // Generate high-quality starfield textures
    // Layer 1: Distant stars and nebulae (slow)
    const tex1 = ProceduralTextures.createStarfieldFace(1024, 0);
    this.bgLayer1 = tex1.data;

    // Layer 2: Brighter, closer stars (medium speed)
    const tex2 = ProceduralTextures.createStarfieldFace(1024, 1);
    this.bgLayer2 = tex2.data;
  }

  private initStars(): void {
    // Reduced count since we have background layers now
    for (let i = 0; i < 50; i++) {
      this.stars.push({
        x: Math.random() * this.canvasWidth,
        y: Math.random() * this.canvasHeight,
        z: Math.random(),
        size: 1 + Math.random() * 2,
        speed: 20 + Math.random() * 80
      });
    }
  }

  private initNebulae(): void {
    const colors = [
      'rgba(100, 50, 150, 0.3)',
      'rgba(50, 100, 200, 0.3)',
      'rgba(150, 50, 100, 0.3)',
      'rgba(100, 150, 200, 0.3)',
      'rgba(200, 100, 150, 0.3)'
    ];

    for (let i = 0; i < 5; i++) {
      this.nebulae.push({
        x: Math.random() * this.canvasWidth,
        y: Math.random() * this.canvasHeight,
        radius: 200 + Math.random() * 300,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 0.2 + Math.random() * 0.3,
        drift: (Math.random() - 0.5) * 10
      });
    }
  }

  private initDust(): void {
    for (let i = 0; i < 100; i++) {
      this.dustParticles.push({
        x: Math.random() * this.canvasWidth,
        y: Math.random() * this.canvasHeight,
        vx: (Math.random() - 0.5) * 20,
        vy: 30 + Math.random() * 50,
        size: 0.5 + Math.random() * 1.5,
        alpha: 0.3 + Math.random() * 0.4
      });
    }
  }

  public update(deltaTime: number): void {
    // Scroll background layers
    this.bgOffset1 += deltaTime * 10; // Slow scroll
    this.bgOffset2 += deltaTime * 25; // Medium scroll

    // Wrap offsets
    if (this.bgLayer1) this.bgOffset1 %= this.bgLayer1.height;
    if (this.bgLayer2) this.bgOffset2 %= this.bgLayer2.height;

    for (const star of this.stars) {
      star.y += star.speed * deltaTime;

      if (star.y > this.canvasHeight) {
        star.y = 0;
        star.x = Math.random() * this.canvasWidth;
      }
    }

    this.nebulaOffset += deltaTime * 5;

    for (const nebula of this.nebulae) {
      nebula.y += nebula.drift * deltaTime;

      if (nebula.y > this.canvasHeight + nebula.radius) {
        nebula.y = -nebula.radius;
        nebula.x = Math.random() * this.canvasWidth;
      } else if (nebula.y < -nebula.radius) {
        nebula.y = this.canvasHeight + nebula.radius;
        nebula.x = Math.random() * this.canvasWidth;
      }
    }

    for (const particle of this.dustParticles) {
      particle.x += particle.vx * deltaTime;
      particle.y += particle.vy * deltaTime;

      if (particle.y > this.canvasHeight) {
        particle.y = 0;
        particle.x = Math.random() * this.canvasWidth;
      }

      if (particle.x < 0) {
        particle.x = this.canvasWidth;
      } else if (particle.x > this.canvasWidth) {
        particle.x = 0;
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);

    // Render high-quality background layers (tiled)
    if (this.bgLayer1) {
      this.renderTiledLayer(ctx, this.bgLayer1, this.bgOffset1, 0.5);
    }
    if (this.bgLayer2) {
      this.renderTiledLayer(ctx, this.bgLayer2, this.bgOffset2, 0.8); // Brighter
    }

    for (const nebula of this.nebulae) {
      const gradient = ctx.createRadialGradient(
        nebula.x,
        nebula.y,
        0,
        nebula.x,
        nebula.y,
        nebula.radius
      );

      gradient.addColorStop(0, nebula.color);
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = gradient;
      ctx.globalAlpha = nebula.alpha * (0.8 + Math.sin(this.nebulaOffset + nebula.x) * 0.2);
      ctx.fillRect(
        nebula.x - nebula.radius,
        nebula.y - nebula.radius,
        nebula.radius * 2,
        nebula.radius * 2
      );
    }

    ctx.globalAlpha = 1;

    // Render remaining individual stars (foreground)
    for (const star of this.stars) {
      const brightness = 0.5 + star.z * 0.5;
      ctx.fillStyle = `rgba(255, 255, 255, ${brightness})`;

      const twinkle = 0.8 + Math.sin(Date.now() * 0.001 * star.speed + star.x) * 0.2;
      const size = star.size * twinkle;

      ctx.fillRect(star.x - size / 2, star.y - size / 2, size, size);

      if (star.z > 0.7) {
        ctx.shadowBlur = 3;
        ctx.shadowColor = '#ffffff';
        ctx.fillRect(star.x - size / 2, star.y - size / 2, size, size);
        ctx.shadowBlur = 0;
      }
    }

    for (const particle of this.dustParticles) {
      ctx.fillStyle = `rgba(200, 200, 255, ${particle.alpha})`;
      ctx.fillRect(
        particle.x - particle.size / 2,
        particle.y - particle.size / 2,
        particle.size,
        particle.size
      );
    }
  }

  private renderTiledLayer(ctx: CanvasRenderingContext2D, image: HTMLCanvasElement, scrollY: number, opacity: number) {
    ctx.globalAlpha = opacity;
    
    const cols = Math.ceil(this.canvasWidth / image.width) + 1;
    const rows = Math.ceil(this.canvasHeight / image.height) + 1;
    
    // Calculate starting Y to handle smooth scrolling wrap
    const startY = scrollY % image.height;

    for (let col = 0; col < cols; col++) {
      for (let row = -1; row < rows; row++) {
        const x = col * image.width;
        const y = (row * image.height) + startY;
        
        // Optimization: only draw if visible
        if (y + image.height > 0 && y < this.canvasHeight) {
           ctx.drawImage(image, x, y);
        }
      }
    }
    ctx.globalAlpha = 1.0;
  }
}
