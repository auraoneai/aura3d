# G3D 5.0 Particle System

Complete, production-ready particle system implementation for the G3D 5.0 engine.

## Features

- **100k+ particle support** with efficient pooling
- **Module-based architecture** for extensible behaviors
- **GPU acceleration** for million-particle simulations
- **Multiple emission shapes** (point, sphere, cone, box, circle, mesh)
- **Advanced rendering modes** (billboards, stretched, mesh, trails)
- **LOD support** for performance scaling
- **Sub-emitters** for complex effects chains
- **Full TypeScript** with strict types and JSDoc

## File Structure

```
particles/
├── Particle.ts                    (~450 lines) - Core particle data structure
├── ParticleSystem.ts              (~660 lines) - Main system manager
├── ParticleEmitter.ts             (~700 lines) - Emission control
├── ParticleRenderer.ts            (~635 lines) - Rendering system
├── GPUParticles.ts                (~630 lines) - GPU-accelerated particles
├── modules/
│   ├── VelocityModule.ts          (~385 lines) - Velocity control
│   ├── ColorModule.ts             (~325 lines) - Color over lifetime
│   ├── SizeModule.ts              (~345 lines) - Size control
│   ├── RotationModule.ts          (~350 lines) - Rotation control
│   ├── ForceModule.ts             (~415 lines) - Forces & physics
│   └── CollisionModule.ts         (~560 lines) - World collision
└── index.ts                       (~210 lines) - Barrel exports

Total: ~5,660 lines of production code
```

## Quick Start

```typescript
import {
  ParticleSystem,
  EmissionShape,
  VelocityModule,
  ColorModule,
  ForceModule,
} from './particles';

// Create system
const system = new ParticleSystem({
  maxParticles: 1000,
  lifetime: 2.0,
  color: new Color(1, 0.5, 0),
  autoStart: true,
});

// Configure emitter
system.emitter.shape = EmissionShape.Cone;
system.emitter.rate = 100;

// Add modules
system.addModule(new VelocityModule({ speed: 5 }));
system.addModule(new ColorModule({ 
  gradient: [
    { time: 0, color: new Color(1, 1, 0, 1) },
    { time: 1, color: new Color(1, 0, 0, 0) },
  ],
}));
system.addModule(new ForceModule({ gravity: 9.8 }));

// Update loop
system.update(deltaTime);
```

## Architecture

### Core Components

1. **Particle** - Individual particle with position, velocity, color, size, rotation, lifetime
2. **ParticleSystem** - Manages particle lifecycle, pooling, and module execution
3. **ParticleEmitter** - Controls emission patterns, shapes, and rates
4. **ParticleRenderer** - Handles rendering with various modes
5. **GPUParticles** - GPU compute shader simulation

### Module System

Modules implement `IParticleModule` interface with:
- `initializeParticle()` - Called when particle is emitted
- `updateParticle()` - Called each frame per particle
- `preUpdate()` / `postUpdate()` - System-level updates
- Priority system for execution order

### Performance

- Object pooling for zero-allocation updates
- LOD-based quality scaling (High/Medium/Low/Off)
- GPU instancing for efficient rendering
- Compute shader simulation for 1M+ particles
- Configurable particle limits

## Examples

### Fire Effect
```typescript
const fire = new ParticleSystem({
  maxParticles: 500,
  lifetime: 1.5,
  size: 0.3,
});

fire.emitter.shape = EmissionShape.Circle;
fire.emitter.rate = 200;

fire.addModule(new VelocityModule({
  mode: VelocityMode.Radial,
  speed: 3,
  speedRandomness: 0.5,
}));

fire.addModule(new ColorModule({
  gradient: [
    { time: 0, color: new Color(1, 1, 0, 1) },   // Yellow
    { time: 0.3, color: new Color(1, 0.5, 0, 1) }, // Orange
    { time: 1, color: new Color(0.5, 0, 0, 0) },   // Red fade
  ],
}));

fire.addModule(new ForceModule({
  wind: new Vector3(0, 2, 0),
  turbulence: true,
  turbulenceStrength: 2,
}));
```

### Explosion
```typescript
const explosion = new ParticleSystem({
  maxParticles: 1000,
  lifetime: 2.0,
  loop: false,
});

explosion.emitter.addBurst({
  time: 0,
  count: 500,
  cycles: 1,
  interval: 0,
  probability: 1,
});

explosion.addModule(new VelocityModule({
  mode: VelocityMode.Random,
  speed: 10,
  speedRandomness: 0.5,
}));

explosion.addModule(new ForceModule({
  gravity: 9.8,
  drag: 1.0,
}));

explosion.addModule(new SizeModule({
  sizeCurve: [
    { time: 0, value: 0 },
    { time: 0.2, value: 1 },
    { time: 1, value: 0 },
  ],
}));
```

### GPU Particles (Million Particles)
```typescript
const gpuSystem = new GPUParticles(device, {
  maxParticles: 1000000,
  useComputeShader: true,
  useGPUSorting: true,
  emitter: {
    rate: 10000,
    position: new Vector3(0, 0, 0),
  },
  simulation: {
    gravity: new Vector3(0, -9.8, 0),
    turbulence: 1.0,
  },
});

await gpuSystem.initialize();
gpuSystem.update(deltaTime);
gpuSystem.render(camera);
```

## Module Reference

### VelocityModule
- Linear, orbital, radial, random velocity modes
- Velocity over lifetime curves
- Velocity limits and damping
- Emitter velocity inheritance

### ColorModule
- Color gradients over lifetime
- Color by speed mapping
- Random color ranges
- Alpha fade in/out

### SizeModule
- Size over lifetime curves
- Size by speed
- Separate X/Y/Z axis curves
- Random size ranges

### RotationModule
- 2D and 3D rotation
- Random initial rotation
- Angular velocity
- Rotation over lifetime curves

### ForceModule
- Gravity with custom direction
- Wind with randomness
- Air drag
- Turbulence/noise forces
- Vortex forces

### CollisionModule
- Plane, sphere, box collision shapes
- Bounce, stick, kill responses
- Friction and lifetime loss
- Sub-emitter triggers

## License

Part of G3D 5.0 Engine
