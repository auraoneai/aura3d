import {
  ParticleRenderer,
  ParticleSystem,
  TrailModule,
  createParticle,
  createParticleEffectPreset,
  type ParticleRenderBatch,
  type TrailPoint
} from "@galileo3d/rendering";

interface ParticleBrowserResult {
  readonly status: "ready" | "error";
  readonly fireLive?: number;
  readonly fountainLive?: number;
  readonly collisionLive?: number;
  readonly sparkLive?: number;
  readonly trailPoints?: number;
  readonly firePixel?: readonly number[];
  readonly fountainPixel?: readonly number[];
  readonly collisionPixel?: readonly number[];
  readonly sparkPixel?: readonly number[];
  readonly trailPixel?: readonly number[];
  readonly stats?: {
    readonly fireUploads: number;
    readonly fountainUploads: number;
    readonly sparkUploads: number;
    readonly collisionKilled: number;
  };
  readonly error?: string;
}

declare global {
  interface Window {
    __GALILEO3D_PARTICLE_BROWSER_TEST__?: ParticleBrowserResult;
  }
}

try {
  const canvas = document.querySelector<HTMLCanvasElement>("#particles");
  const context = canvas?.getContext("2d");
  if (!canvas || !context) {
    throw new Error("Particle canvas is unavailable.");
  }

  const renderer = new ParticleRenderer();
  const fire = createFireSystem();
  const fountain = createFountainSystem();
  const collision = createCollisionSystem();
  const spark = createSparkSystem();
  const trail = createTrailSystem();

  for (let frame = 0; frame < 50; frame += 1) {
    fire.update(1 / 60);
    fountain.update(1 / 60);
    collision.update(1 / 60);
    trail.system.update(1 / 60);
  }
  for (let frame = 0; frame < 24; frame += 1) {
    spark.update(1 / 60);
  }

  context.fillStyle = "rgb(5, 8, 12)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  drawPanelLabels(context);
  const fireBatch = renderer.render(fire, canvasTarget(context, 62, 150, 58));
  const fountainBatch = renderer.render(fountain, canvasTarget(context, 178, 150, 58));
  const collisionBatch = renderer.render(collision, canvasTarget(context, 292, 150, 58));
  const sparkBatch = renderer.render(spark, canvasTarget(context, 410, 150, 58));
  drawCollisionGround(context);
  drawTrail(context, trail.particle.userData.trail as TrailPoint[], 178, 88, 58);

  window.__GALILEO3D_PARTICLE_BROWSER_TEST__ = {
    status: "ready",
    fireLive: fireBatch.liveCount,
    fountainLive: fountainBatch.liveCount,
    collisionLive: collisionBatch.liveCount,
    sparkLive: sparkBatch.liveCount,
    trailPoints: (trail.particle.userData.trail as TrailPoint[]).length,
    firePixel: findPixel(context, { x: 16, y: 42, width: 92, height: 108 }, (r, g, b) => r > 110 && g > 35 && b < 120),
    fountainPixel: findPixel(context, { x: 134, y: 34, width: 88, height: 118 }, (r, g, b) => r < 130 && g > 45 && b > 130),
    collisionPixel: findPixel(context, { x: 248, y: 74, width: 90, height: 78 }, (r, g, b) => r > 45 && g > 110 && b > 35),
    sparkPixel: findPixel(context, { x: 365, y: 42, width: 88, height: 110 }, (r, g, b) => r > 160 && g > 55 && b < 80),
    trailPixel: findPixel(context, { x: 150, y: 70, width: 60, height: 34 }, (r, g, b) => r > 160 && g < 120 && b > 130),
    stats: {
      fireUploads: fire.getStats().bufferUploads,
      fountainUploads: fountain.getStats().bufferUploads,
      sparkUploads: spark.getStats().bufferUploads,
      collisionKilled: collision.getStats().killedCount
    }
  };
} catch (error) {
  window.__GALILEO3D_PARTICLE_BROWSER_TEST__ = {
    status: "error",
    error: error instanceof Error ? error.stack ?? error.message : String(error)
  };
}

function createFireSystem(): ParticleSystem {
  return createParticleEffectPreset("fire", { seed: 101, maxParticles: 200 });
}

function createFountainSystem(): ParticleSystem {
  return createParticleEffectPreset("fountain", { seed: 202, maxParticles: 220 });
}

function createCollisionSystem(): ParticleSystem {
  return createParticleEffectPreset("collision-burst", { seed: 303, maxParticles: 64 });
}

function createSparkSystem(): ParticleSystem {
  return createParticleEffectPreset("spark-shower", { seed: 404, maxParticles: 160 });
}

function createTrailSystem(): { readonly system: ParticleSystem; readonly particle: ReturnType<typeof createParticle> } {
  const module = new TrailModule({ maxPoints: 12, minDistance: 0.02, lifetime: 1.5 });
  const particle = createParticle({
    id: 9001,
    lifetime: 5,
    position: { x: -0.35, y: 0.1, z: 0 },
    velocity: { x: 0.65, y: 0, z: 0 },
    size: 0.05,
    color: { r: 1, g: 0.3, b: 0.95, a: 1 }
  });
  module.onSpawn(particle, { deltaTime: 0, elapsedTime: 0, normalizedAge: 0, random: Math.random });
  const system = new ParticleSystem({ maxParticles: 4, modules: [module] });
  system.particles.push(particle);
  return { system, particle };
}

function canvasTarget(context: CanvasRenderingContext2D, originX: number, originY: number, scale: number): { drawParticles(batch: ParticleRenderBatch): void } {
  return {
    drawParticles(batch) {
      for (const sprite of batch.sprites) {
        const x = originX + sprite.position.x * scale;
        const y = originY - sprite.position.y * scale;
        const radius = Math.max(1.5, sprite.size * 42);
        context.fillStyle = `rgba(${Math.round(sprite.color.r * 255)}, ${Math.round(sprite.color.g * 255)}, ${Math.round(sprite.color.b * 255)}, ${sprite.color.a})`;
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
      }
    }
  };
}

function drawTrail(context: CanvasRenderingContext2D, trail: readonly TrailPoint[], originX: number, originY: number, scale: number): void {
  context.strokeStyle = "rgb(255, 76, 230)";
  context.lineWidth = 5;
  context.beginPath();
  trail.forEach((point, index) => {
    const x = originX + point.position.x * scale;
    const y = originY - point.position.y * scale;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();
}

function drawCollisionGround(context: CanvasRenderingContext2D): void {
  context.fillStyle = "rgb(90, 115, 95)";
  context.fillRect(252, 148, 82, 5);
}

function drawPanelLabels(context: CanvasRenderingContext2D): void {
  context.strokeStyle = "rgb(35, 45, 60)";
  context.lineWidth = 1;
  for (const x of [120, 240, 360]) {
    context.beginPath();
    context.moveTo(x, 14);
    context.lineTo(x, 166);
    context.stroke();
  }
}

function readPixel(context: CanvasRenderingContext2D, x: number, y: number): readonly number[] {
  return Array.from(context.getImageData(x, y, 1, 1).data);
}

function findPixel(
  context: CanvasRenderingContext2D,
  region: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  predicate: (r: number, g: number, b: number, a: number) => boolean
): readonly number[] {
  const pixels = context.getImageData(region.x, region.y, region.width, region.height).data;
  for (let index = 0; index < pixels.length; index += 4) {
    const r = pixels[index] ?? 0;
    const g = pixels[index + 1] ?? 0;
    const b = pixels[index + 2] ?? 0;
    const a = pixels[index + 3] ?? 0;
    if (predicate(r, g, b, a)) {
      return [r, g, b, a];
    }
  }
  return readPixel(context, region.x, region.y);
}
