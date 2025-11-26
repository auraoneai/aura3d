# Particle System Usage Examples

Complete examples for common particle effects using the G3D 5.0 particle system.

## Basic Setup

```typescript
import {
  ParticleSystem,
  EmissionShape,
  VelocityModule,
  ColorModule,
  SizeModule,
  ForceModule,
  ParticleRenderer,
  ParticleRenderMode,
} from './particles';
import { Color, Vector3 } from '../math';
```

## 1. Fire Effect

```typescript
function createFire(): ParticleSystem {
  const fire = new ParticleSystem({
    maxParticles: 500,
    lifetime: 1.5,
    lifetimeRandomness: 0.3,
    size: 0.3,
    sizeRandomness: 0.2,
    autoStart: true,
    loop: true,
  });

  // Circle emitter at base
  fire.emitter.shape = EmissionShape.Circle;
  fire.emitter.circleParams.radius = 0.5;
  fire.emitter.rate = 200;

  // Upward velocity with randomness
  fire.addModule(new VelocityModule({
    mode: VelocityMode.Linear,
    direction: new Vector3(0, 1, 0),
    speed: 3,
    speedRandomness: 0.5,
    directionRandomness: 0.3,
  }));

  // Fire color gradient (yellow -> orange -> red -> fade)
  fire.addModule(new ColorModule({
    gradient: [
      { time: 0, color: new Color(1, 1, 0, 1) },     // Yellow
      { time: 0.3, color: new Color(1, 0.5, 0, 1) }, // Orange
      { time: 0.7, color: new Color(1, 0, 0, 1) },   // Red
      { time: 1, color: new Color(0.5, 0, 0, 0) },   // Dark red fade
    ],
  }));

  // Size grows then shrinks
  fire.addModule(new SizeModule({
    sizeCurve: [
      { time: 0, value: 0.5 },
      { time: 0.3, value: 1.2 },
      { time: 1, value: 0 },
    ],
  }));

  // Upward wind with turbulence
  fire.addModule(new ForceModule({
    wind: new Vector3(0, 2, 0),
    windRandomness: 0.3,
    turbulence: true,
    turbulenceStrength: 2,
    turbulenceFrequency: 1.5,
    drag: 0.5,
  }));

  return fire;
}
```

## 2. Explosion Effect

```typescript
function createExplosion(position: Vector3): ParticleSystem {
  const explosion = new ParticleSystem({
    maxParticles: 1000,
    lifetime: 2.0,
    lifetimeRandomness: 0.3,
    size: 0.2,
    sizeRandomness: 0.5,
    loop: false, // One-shot effect
  });

  // Position at explosion point
  explosion.emitter.setPosition(position.x, position.y, position.z);

  // Burst emission
  explosion.emitter.addBurst({
    time: 0,
    count: 500,
    cycles: 1,
    interval: 0,
    probability: 1.0,
  });

  // Random outward velocity
  explosion.addModule(new VelocityModule({
    mode: VelocityMode.Random,
    speed: 10,
    speedRandomness: 0.5,
  }));

  // Explosion color (white -> orange -> red -> black)
  explosion.addModule(new ColorModule({
    gradient: [
      { time: 0, color: new Color(1, 1, 1, 1) },     // White flash
      { time: 0.1, color: new Color(1, 0.8, 0, 1) }, // Bright orange
      { time: 0.5, color: new Color(1, 0.3, 0, 1) }, // Orange
      { time: 0.8, color: new Color(0.5, 0, 0, 1) }, // Dark red
      { time: 1, color: new Color(0.1, 0.1, 0.1, 0) }, // Smoke fade
    ],
  }));

  // Size pulse
  explosion.addModule(new SizeModule({
    sizeCurve: [
      { time: 0, value: 0 },
      { time: 0.2, value: 1.5 },
      { time: 0.5, value: 1 },
      { time: 1, value: 0.3 },
    ],
  }));

  // Gravity and drag
  explosion.addModule(new ForceModule({
    gravity: 9.8,
    gravityDirection: new Vector3(0, -1, 0),
    drag: 1.0,
  }));

  // Start immediately
  explosion.play();

  return explosion;
}
```

## 3. Smoke Trail

```typescript
function createSmokeTrail(): ParticleSystem {
  const smoke = new ParticleSystem({
    maxParticles: 200,
    lifetime: 3.0,
    lifetimeRandomness: 0.5,
    color: new Color(0.7, 0.7, 0.7, 0.5),
    size: 0.5,
    sizeRandomness: 0.3,
    autoStart: true,
    loop: true,
  });

  // Point emitter
  smoke.emitter.shape = EmissionShape.Point;
  smoke.emitter.rate = 50;

  // Slow upward velocity
  smoke.addModule(new VelocityModule({
    mode: VelocityMode.Linear,
    direction: new Vector3(0, 1, 0),
    speed: 2,
    speedRandomness: 0.5,
    directionRandomness: 0.2,
  }));

  // Fade in and out
  smoke.addModule(new ColorModule({
    fadeIn: true,
    fadeInDuration: 0.2,
    fadeOut: true,
    fadeOutStart: 0.6,
  }));

  // Grow over time
  smoke.addModule(new SizeModule({
    sizeCurve: [
      { time: 0, value: 0.3 },
      { time: 1, value: 2 },
    ],
  }));

  // Slow rotation
  smoke.addModule(new RotationModule({
    initialRotationMin: 0,
    initialRotationMax: Math.PI * 2,
    angularVelocityMin: -0.5,
    angularVelocityMax: 0.5,
  }));

  // Wind and turbulence
  smoke.addModule(new ForceModule({
    wind: new Vector3(1, 1, 0),
    windRandomness: 0.5,
    turbulence: true,
    turbulenceStrength: 1,
    drag: 0.3,
  }));

  return smoke;
}
```

## 4. Fountain

```typescript
function createFountain(): ParticleSystem {
  const fountain = new ParticleSystem({
    maxParticles: 1000,
    lifetime: 5.0,
    lifetimeRandomness: 0.2,
    color: new Color(0.3, 0.6, 1.0, 0.8),
    size: 0.1,
    autoStart: true,
    loop: true,
  });

  // Cone emitter pointing up
  fountain.emitter.shape = EmissionShape.Cone;
  fountain.emitter.coneParams.angle = 15;
  fountain.emitter.coneParams.radius = 0.2;
  fountain.emitter.coneParams.length = 0.1;
  fountain.emitter.rate = 200;

  // Upward velocity
  fountain.addModule(new VelocityModule({
    mode: VelocityMode.Linear,
    direction: new Vector3(0, 1, 0),
    speed: 8,
    speedRandomness: 0.2,
  }));

  // Gravity
  fountain.addModule(new ForceModule({
    gravity: 9.8,
    gravityDirection: new Vector3(0, -1, 0),
  }));

  // Ground collision
  fountain.addModule(new CollisionModule({
    mode: CollisionMode.Planes,
    response: CollisionResponse.Bounce,
    bounce: 0.3,
    friction: 0.5,
    lifetimeLoss: 0.2,
    planes: [
      { normal: new Vector3(0, 1, 0), distance: 0 },
    ],
  }));

  return fountain;
}
```

## 5. Magic Sparkles

```typescript
function createSparkles(): ParticleSystem {
  const sparkles = new ParticleSystem({
    maxParticles: 500,
    lifetime: 1.0,
    lifetimeRandomness: 0.5,
    size: 0.1,
    sizeRandomness: 0.5,
    autoStart: true,
    loop: true,
  });

  // Sphere emission
  sparkles.emitter.shape = EmissionShape.SphereVolume;
  sparkles.emitter.sphereParams.radius = 2.0;
  sparkles.emitter.rate = 100;

  // Slow random movement
  sparkles.addModule(new VelocityModule({
    mode: VelocityMode.Random,
    speed: 1,
    speedRandomness: 0.5,
  }));

  // Rainbow colors
  sparkles.addModule(new ColorModule({
    randomBetweenColors: true,
    randomColorA: new Color(1, 0, 0.5, 1),
    randomColorB: new Color(0.5, 0, 1, 1),
    fadeOut: true,
    fadeOutStart: 0.7,
  }));

  // Twinkle size
  sparkles.addModule(new SizeModule({
    sizeCurve: [
      { time: 0, value: 0 },
      { time: 0.1, value: 1 },
      { time: 0.5, value: 1.5 },
      { time: 1, value: 0 },
    ],
  }));

  // Fast rotation
  sparkles.addModule(new RotationModule({
    angularVelocityMin: -10,
    angularVelocityMax: 10,
  }));

  return sparkles;
}
```

## 6. Vortex Effect

```typescript
function createVortex(): ParticleSystem {
  const vortex = new ParticleSystem({
    maxParticles: 2000,
    lifetime: 4.0,
    color: new Color(0.5, 0, 1, 0.7),
    size: 0.15,
    autoStart: true,
    loop: true,
  });

  // Circle emitter around vortex
  vortex.emitter.shape = EmissionShape.Circle;
  vortex.emitter.circleParams.radius = 3.0;
  vortex.emitter.rate = 300;

  // Inward velocity
  vortex.addModule(new VelocityModule({
    mode: VelocityMode.Radial,
    speed: 2,
    speedRandomness: 0.3,
  }));

  // Color shift
  vortex.addModule(new ColorModule({
    gradient: [
      { time: 0, color: new Color(0.5, 0, 1, 0.7) },
      { time: 0.5, color: new Color(1, 0, 1, 0.8) },
      { time: 1, color: new Color(1, 1, 1, 0) },
    ],
  }));

  // Vortex force
  vortex.addModule(new ForceModule({
    vortex: true,
    vortexCenter: new Vector3(0, 2, 0),
    vortexAxis: new Vector3(0, 1, 0),
    vortexStrength: 5,
    vortexRadius: 5,
  }));

  return vortex;
}
```

## 7. Rain

```typescript
function createRain(): ParticleSystem {
  const rain = new ParticleSystem({
    maxParticles: 5000,
    lifetime: 10.0,
    color: new Color(0.7, 0.8, 1, 0.5),
    size: new Vector3(0.05, 0.3, 0.05),
    autoStart: true,
    loop: true,
  });

  // Large box emitter above scene
  rain.emitter.shape = EmissionShape.Box;
  rain.emitter.boxParams.size = new Vector3(20, 0.1, 20);
  rain.emitter.setPosition(0, 15, 0);
  rain.emitter.rate = 500;

  // Downward velocity
  rain.addModule(new VelocityModule({
    mode: VelocityMode.Linear,
    direction: new Vector3(0, -1, 0),
    speed: 10,
    speedRandomness: 0.1,
  }));

  // Gravity
  rain.addModule(new ForceModule({
    gravity: 9.8,
    gravityDirection: new Vector3(0, -1, 0),
  }));

  // Ground collision (kill on impact)
  rain.addModule(new CollisionModule({
    mode: CollisionMode.Planes,
    response: CollisionResponse.Kill,
    planes: [
      { normal: new Vector3(0, 1, 0), distance: 0 },
    ],
  }));

  return rain;
}
```

## 8. GPU Particle System (1M particles)

```typescript
async function createGPUParticleSystem(device: GPUDevice): Promise<GPUParticles> {
  const gpuParticles = new GPUParticles(device, {
    maxParticles: 1000000,
    useComputeShader: true,
    useGPUSorting: true,
    emitter: {
      rate: 10000,
      position: new Vector3(0, 0, 0),
      velocity: new Vector3(0, 5, 0),
      velocityRandomness: 2,
      color: new Color(1, 0.5, 0, 1),
      size: 0.05,
      lifetime: 10,
      lifetimeRandomness: 0.3,
    },
    simulation: {
      gravity: new Vector3(0, -9.8, 0),
      drag: 0.1,
      turbulence: 0.5,
      timeScale: 1.0,
    },
  });

  await gpuParticles.initialize();
  return gpuParticles;
}

// Update loop
function updateGPUParticles(gpuParticles: GPUParticles, deltaTime: number, camera: Camera) {
  gpuParticles.update(deltaTime);
  gpuParticles.render(camera);
}
```

## Rendering Examples

```typescript
// Create renderer
const renderer = new ParticleRenderer({
  renderMode: ParticleRenderMode.Billboard,
  sortMode: ParticleSortMode.Distance,
  useInstancing: true,
  material: particleMaterial,
});

// Initialize
renderer.initialize(device);

// Render loop
function render() {
  // Update all systems
  fire.update(deltaTime);
  explosion.update(deltaTime);
  sparkles.update(deltaTime);

  // Render
  renderer.render(fire, camera, device);
  renderer.render(explosion, camera, device);
  renderer.render(sparkles, camera, device);
}
```

## Performance Tips

1. **Use LOD for distant effects:**
```typescript
system.lodLevel = ParticleLOD.Medium; // Reduce particle count
```

2. **Limit particle count:**
```typescript
system.maxParticles = 1000; // Balance quality vs performance
```

3. **Use GPU particles for massive systems:**
```typescript
const massive = new GPUParticles(device, { maxParticles: 1000000 });
```

4. **Enable instancing for rendering:**
```typescript
renderer.useInstancing = true;
```

5. **Disable sorting when not needed:**
```typescript
renderer.sortMode = ParticleSortMode.None;
```
