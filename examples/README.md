# G3D 5.0 Examples

Interactive demonstrations showcasing the capabilities of the G3D 5.0 game engine.

## Overview

This directory contains complete, production-ready examples that demonstrate various features of the G3D engine:

- **Games**: Fully playable game examples (FPS, Racing, Platformer, Space Shooter)
- **Simulations**: Physics and voxel-based simulations
- **Visualization**: Architectural visualization and rendering techniques

## Running Examples

### Development Mode

Start the development server with hot reload:

```bash
npm run examples:dev
```

Then open [http://localhost:5173](http://localhost:5173) in your browser to see the examples gallery.

### Building for Production

Build all examples for deployment:

```bash
npm run examples:build
```

The built files will be in the `dist-examples/` directory.

### Running Individual Examples

Each example can be run individually by navigating to its directory:

```bash
cd examples/fps-game
npm run dev
```

## Example Categories

### Games

#### FPS Game (`fps-game/`)
A complete first-person shooter featuring:
- Physics-based weapons and projectiles
- Enemy AI with behavior trees
- Multiplayer networking support
- 3D spatial audio
- Dynamic lighting and shadows

**Controls:**
- WASD - Move
- Mouse - Look around
- Left Click - Shoot
- R - Reload
- Space - Jump

#### Racing Game (`racing-game/`)
High-speed racing simulation with:
- Realistic vehicle physics
- Multiple tracks with checkpoints
- Time trial mode
- Particle effects (exhaust, dust)
- Post-processing effects (motion blur)

**Controls:**
- W/S - Accelerate/Brake
- A/D - Steer
- Space - Handbrake
- C - Change camera

#### 3D Platformer (`platformer/`)
Character-based platformer featuring:
- Smooth character animation
- Physics-based movement
- Collectible items
- Dynamic camera system
- Checkpoint system

**Controls:**
- WASD - Move
- Space - Jump
- Shift - Sprint
- Mouse - Rotate camera

#### Space Shooter (`space-shooter/`)
Arcade-style space combat with:
- Procedurally generated asteroids
- Multiple weapon systems
- Enemy wave spawning
- Particle effects
- Score tracking

**Controls:**
- Arrow Keys - Move ship
- Space - Shoot
- Q/E - Rotate

### Simulations

#### Physics Sandbox (`physics-sandbox/`)
Interactive physics playground featuring:
- Rigid body dynamics
- Collision detection and response
- Constraints (hinges, springs)
- Real-time manipulation
- Debug visualization

**Controls:**
- Click and drag - Move objects
- Scroll - Zoom
- Right-click + drag - Rotate view

#### Voxel World (`voxel-world/`)
Minecraft-style voxel engine with:
- Infinite terrain generation
- Chunk streaming and LOD
- Greedy meshing optimization
- Block placement/destruction
- Ambient occlusion

**Controls:**
- WASD - Move
- Mouse - Look
- Left Click - Destroy block
- Right Click - Place block
- Space - Jump

### Visualization

#### Architectural Visualization (`arch-viz/`)
Photorealistic architectural walkthrough featuring:
- PBR materials and lighting
- Section plane cutting
- Interactive camera paths
- High-quality shadows
- Post-processing (bloom, tone mapping)

**Controls:**
- Click and drag - Rotate view
- Scroll - Zoom
- Arrow keys - Fly through scene
- 1-5 - Predefined camera views

## Creating New Examples

To create a new example:

1. **Create directory structure:**
```bash
mkdir examples/my-example
cd examples/my-example
```

2. **Create `index.html`:**
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Example - G3D 5.0</title>
  <link rel="stylesheet" href="../shared/styles.css">
</head>
<body>
  <div id="canvas-container"></div>
  <div id="loading-screen"></div>
  <div id="stats-panel"></div>
  <script type="module" src="./main.ts"></script>
</body>
</html>
```

3. **Create `main.ts`:**
```typescript
import { Engine } from 'g3d';
import {
  CanvasUtils,
  LoadingScreen,
  Stats,
  DebugUI,
  OrbitControls
} from '../shared';

async function main() {
  // Create loading screen
  const loading = new LoadingScreen({ logoText: 'My Example' });
  loading.setProgress(0.1, 'Initializing...');

  // Create canvas
  const canvas = CanvasUtils.createFullscreenCanvas();

  // Initialize engine
  const engine = Engine.create({ canvas });
  await engine.init();
  loading.setProgress(0.5, 'Loading assets...');

  // Setup scene
  // ... your scene setup code ...

  loading.setProgress(1.0, 'Complete!');
  await loading.complete();

  // Setup stats and debug UI
  const stats = new Stats();
  const debugUI = new DebugUI();

  // Game loop
  function update(deltaTime: number) {
    // ... your update logic ...
    stats.update();
    stats.render();
  }

  engine.start();
}

main().catch(console.error);
```

4. **Add to examples gallery** by updating `examples/index.html`

## Shared Utilities

All examples can use the shared utilities from `examples/shared/`:

### CanvasUtils
```typescript
import { CanvasUtils } from '../shared';

const canvas = CanvasUtils.createFullscreenCanvas();
const aspectRatio = CanvasUtils.getAspectRatio(canvas);
```

### Stats
```typescript
import { Stats } from '../shared';

const stats = new Stats();
stats.update();
stats.setRenderStats(drawCalls, triangles);
stats.render('stats-panel');
```

### LoadingScreen
```typescript
import { LoadingScreen } from '../shared';

const loading = new LoadingScreen();
loading.setProgress(0.5, 'Loading textures...');
await loading.complete();
```

### DebugUI
```typescript
import { DebugUI } from '../shared';

const debug = new DebugUI({ position: 'top-left' });
debug.addSection('rendering', {
  title: 'Rendering',
  controls: [
    { type: 'toggle', label: 'Show Wireframe', value: false, onChange: (v) => {} },
    { type: 'slider', label: 'FOV', value: 75, min: 30, max: 120, step: 1, onChange: (v) => {} }
  ]
});
debug.updateStats({ fps: 60, memoryUsage: 45.2 });
```

### OrbitControls
```typescript
import { OrbitControls } from '../shared';

const controls = new OrbitControls({ canvas, distance: 10 });
controls.update();
const position = controls.getPosition();
```

### FirstPersonControls
```typescript
import { FirstPersonControls } from '../shared';

const controls = new FirstPersonControls({ canvas, moveSpeed: 5 });
controls.update(deltaTime);
const position = controls.getPosition();
```

### GridHelper
```typescript
import { GridHelper } from '../shared';

const grid = new GridHelper({ size: 20, divisions: 20 });
const vertices = grid.getVertices();
const colors = grid.getColors();
```

## Browser Compatibility

All examples are tested on:
- Chrome 113+ (WebGL2 & WebGPU)
- Firefox 51+ (WebGL2)
- Safari 15+ (WebGL2)
- Edge 113+ (WebGL2 & WebGPU)

## Performance Tips

1. **Use GPU Instancing** - For repeated objects
2. **Enable Frustum Culling** - Reduce draw calls
3. **Use LOD Systems** - For distant objects
4. **Batch Draw Calls** - Share materials where possible
5. **Enable Object Pooling** - For frequently created/destroyed objects

## Troubleshooting

### Low FPS
- Check GPU tier with DeviceDetection.getGPUTier()
- Reduce shadow quality in debug panel
- Disable post-processing effects
- Lower resolution scale

### Memory Issues
- Monitor memory usage in stats panel
- Check for memory leaks in console
- Dispose unused resources
- Enable asset cache limits

### Input Not Working
- Check browser console for errors
- Verify pointer lock is enabled (FPS controls)
- Check that event listeners are attached

## Contributing

When adding new examples:
1. Follow the existing code structure
2. Include comprehensive comments
3. Add controls documentation
4. Test on multiple browsers
5. Update this README

## License

All examples are MIT licensed and can be used as reference for your own projects.

## Resources

- [G3D Documentation](https://g3d.dev/docs)
- [API Reference](https://g3d.dev/api)
- [GitHub Repository](https://github.com/g3d/g3d)
- [Community Discord](https://discord.gg/g3d)
