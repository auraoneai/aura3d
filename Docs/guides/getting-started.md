# Getting Started with G3D 5.0

Welcome to G3D 5.0! This guide will help you create your first 3D application using the G3D engine.

## Table of Contents

1. [Installation](#installation)
2. [Your First Application](#your-first-application)
3. [Understanding the Basics](#understanding-the-basics)
4. [Next Steps](#next-steps)

---

## Installation

### Prerequisites

- Node.js 18.0.0 or higher
- pnpm 8.0.0 or higher (or npm/yarn)
- A modern web browser (Chrome 56+, Firefox 51+, Safari 15+, Edge 79+)

### Install G3D

Using pnpm (recommended):
```bash
pnpm add g3d
```

Using npm:
```bash
npm install g3d
```

Using yarn:
```bash
yarn add g3d
```

### Project Setup

Create a basic HTML file:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My G3D App</title>
  <style>
    body {
      margin: 0;
      overflow: hidden;
    }
    canvas {
      display: block;
      width: 100vw;
      height: 100vh;
    }
  </style>
</head>
<body>
  <canvas id="canvas"></canvas>
  <script type="module" src="./main.ts"></script>
</body>
</html>
```

---

## Your First Application

Let's create a simple 3D scene with a rotating cube.

### Step 1: Create the Engine

```typescript
// main.ts
import { Engine } from 'g3d';

async function main() {
  // Get canvas element
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;

  // Create engine
  const engine = Engine.create({
    canvas,
    targetFPS: 60,
    enableProfiling: false
  });

  // Initialize engine
  await engine.init();

  console.log('Engine initialized!');
}

main().catch(console.error);
```

### Step 2: Add a Camera

```typescript
import { Engine, Camera, Vector3 } from 'g3d';

async function main() {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  const engine = Engine.create({ canvas });
  await engine.init();

  // Create camera
  const camera = new Camera();
  camera.setPerspective(
    75,                                    // Field of view
    canvas.width / canvas.height,          // Aspect ratio
    0.1,                                   // Near plane
    1000                                   // Far plane
  );
  camera.position.set(0, 0, 5);           // Move camera back

  console.log('Camera created!');
}

main().catch(console.error);
```

### Step 3: Create a Scene

```typescript
import {
  Engine,
  Camera,
  Scene,
  DirectionalLight,
  Color,
  Vector3
} from 'g3d';

async function main() {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  const engine = Engine.create({ canvas });
  await engine.init();

  // Create camera
  const camera = new Camera();
  camera.setPerspective(75, canvas.width / canvas.height, 0.1, 1000);
  camera.position.set(0, 0, 5);

  // Create scene
  const scene = new Scene('MainScene');
  scene.background = new Color(0.1, 0.1, 0.1);

  // Add light
  const sun = new DirectionalLight();
  sun.color = Color.WHITE;
  sun.intensity = 2.0;
  sun.direction = new Vector3(-1, -1, -1).normalize();
  scene.addLight(sun);

  console.log('Scene created!');
}

main().catch(console.error);
```

### Step 4: Create a Cube

```typescript
import {
  Engine,
  Camera,
  Scene,
  DirectionalLight,
  Color,
  Vector3,
  TransformComponent,
  MeshComponent,
  GeometryGenerator,
  PBRMaterial
} from 'g3d';

async function main() {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  const engine = Engine.create({ canvas });
  await engine.init();

  // Camera
  const camera = new Camera();
  camera.setPerspective(75, canvas.width / canvas.height, 0.1, 1000);
  camera.position.set(0, 0, 5);

  // Scene
  const scene = new Scene('MainScene');
  scene.background = new Color(0.1, 0.1, 0.1);

  // Light
  const sun = new DirectionalLight();
  sun.color = Color.WHITE;
  sun.intensity = 2.0;
  sun.direction = new Vector3(-1, -1, -1).normalize();
  scene.addLight(sun);

  // Create cube entity
  const cube = engine.world.createEntity();

  // Add transform
  engine.world.addComponent(cube, new TransformComponent({
    position: new Vector3(0, 0, 0),
    rotation: Quaternion.identity(),
    scale: Vector3.one()
  }));

  // Add mesh
  const geometry = GeometryGenerator.createBox(1, 1, 1);
  const material = new PBRMaterial({
    baseColor: new Color(1, 0, 0),  // Red
    metallic: 0.0,
    roughness: 0.5
  });

  engine.world.addComponent(cube, new MeshComponent({
    mesh: { geometry, material },
    castShadows: true,
    receiveShadows: true
  }));

  console.log('Cube created!');
}

main().catch(console.error);
```

### Step 5: Start the Game Loop

```typescript
import {
  Engine,
  Camera,
  Scene,
  DirectionalLight,
  Color,
  Vector3,
  Quaternion,
  TransformComponent,
  MeshComponent,
  GeometryGenerator,
  PBRMaterial
} from 'g3d';

async function main() {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  const engine = Engine.create({ canvas });
  await engine.init();

  // Camera
  const camera = new Camera();
  camera.setPerspective(75, canvas.width / canvas.height, 0.1, 1000);
  camera.position.set(0, 0, 5);

  // Scene
  const scene = new Scene('MainScene');
  scene.background = new Color(0.1, 0.1, 0.1);

  // Light
  const sun = new DirectionalLight();
  sun.color = Color.WHITE;
  sun.intensity = 2.0;
  sun.direction = new Vector3(-1, -1, -1).normalize();
  scene.addLight(sun);

  // Create cube
  const cube = engine.world.createEntity();
  engine.world.addComponent(cube, new TransformComponent({
    position: new Vector3(0, 0, 0),
    rotation: Quaternion.identity(),
    scale: Vector3.one()
  }));

  const geometry = GeometryGenerator.createBox(1, 1, 1);
  const material = new PBRMaterial({
    baseColor: new Color(1, 0, 0),
    metallic: 0.0,
    roughness: 0.5
  });
  engine.world.addComponent(cube, new MeshComponent({
    mesh: { geometry, material },
    castShadows: true,
    receiveShadows: true
  }));

  // Game loop
  engine.onUpdate = (deltaTime: number) => {
    // Rotate cube
    const transform = engine.world.getComponent(cube, TransformComponent);
    const rotation = Quaternion.fromAxisAngle(
      new Vector3(0, 1, 0),
      deltaTime
    );
    transform.rotation.multiply(rotation);

    // Render
    engine.renderer.render(scene, camera);
  };

  // Start engine
  engine.start();
  console.log('Engine started!');
}

main().catch(console.error);
```

### Complete Example

Here's the complete code for a rotating cube:

```typescript
import {
  Engine,
  Camera,
  Scene,
  DirectionalLight,
  Color,
  Vector3,
  Quaternion,
  TransformComponent,
  MeshComponent,
  GeometryGenerator,
  PBRMaterial
} from 'g3d';

async function main() {
  // Setup
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  const engine = Engine.create({ canvas, targetFPS: 60 });
  await engine.init();

  // Camera
  const camera = new Camera();
  camera.setPerspective(75, canvas.width / canvas.height, 0.1, 1000);
  camera.position.set(0, 0, 5);

  // Scene
  const scene = new Scene('MainScene');
  scene.background = new Color(0.1, 0.1, 0.1);

  // Light
  const sun = new DirectionalLight();
  sun.color = Color.WHITE;
  sun.intensity = 2.0;
  sun.direction = new Vector3(-1, -1, -1).normalize();
  scene.addLight(sun);

  // Cube
  const cube = engine.world.createEntity();
  engine.world.addComponent(cube, new TransformComponent({
    position: Vector3.zero(),
    rotation: Quaternion.identity(),
    scale: Vector3.one()
  }));

  const geometry = GeometryGenerator.createBox(1, 1, 1);
  const material = new PBRMaterial({
    baseColor: new Color(1, 0, 0),
    metallic: 0.0,
    roughness: 0.5
  });
  engine.world.addComponent(cube, new MeshComponent({
    mesh: { geometry, material },
    castShadows: true
  }));

  // Game loop
  engine.onUpdate = (deltaTime: number) => {
    const transform = engine.world.getComponent(cube, TransformComponent);
    const rotation = Quaternion.fromAxisAngle(Vector3.UP, deltaTime);
    transform.rotation.multiply(rotation);
    engine.renderer.render(scene, camera);
  };

  // Start
  engine.start();
}

main().catch(console.error);
```

---

## Understanding the Basics

### Entity Component System (ECS)

G3D uses an ECS architecture where:

- **Entities** are unique IDs representing game objects
- **Components** are data containers (Transform, Mesh, RigidBody, etc.)
- **Systems** process entities with specific components

Example:
```typescript
// Create entity
const entity = world.createEntity();

// Add components
world.addComponent(entity, new TransformComponent());
world.addComponent(entity, new MeshComponent());

// Query entities
const query = world.query([TransformComponent, MeshComponent]);
for (const entity of query) {
  const transform = world.getComponent(entity, TransformComponent);
  const mesh = world.getComponent(entity, MeshComponent);
  // Process entity
}
```

### The Rendering Pipeline

1. **Setup**: Create renderer, scene, camera
2. **Build Scene**: Add entities with MeshComponents
3. **Lighting**: Add lights to scene
4. **Render**: Call `renderer.render(scene, camera)`

### Transform Hierarchy

Entities can have parent-child relationships:

```typescript
// Parent
const parent = world.createEntity();
world.addComponent(parent, new TransformComponent());

// Child
const child = world.createEntity();
world.addComponent(child, new TransformComponent());
world.addComponent(child, new HierarchyComponent({ parent }));

// Child inherits parent's transform
```

### Materials and Textures

```typescript
// Load texture
const texture = await assetLoader.load('texture.png');

// Create material
const material = new PBRMaterial({
  baseColor: Color.WHITE,
  baseColorMap: texture,
  metallic: 0.5,
  roughness: 0.5,
  normalMap: await assetLoader.load('normal.png')
});
```

---

## Next Steps

### Add Physics

```typescript
import { PhysicsWorld, RigidBody, BoxShape } from 'g3d';

const physics = new PhysicsWorld({
  gravity: new Vector3(0, -9.81, 0)
});

const body = new RigidBody({
  type: 'dynamic',
  mass: 10,
  position: new Vector3(0, 5, 0)
});
body.addCollider({
  shape: new BoxShape(new Vector3(1, 1, 1))
});
physics.addRigidBody(body);

// In game loop
physics.step(deltaTime);
```

### Add Input

```typescript
import { InputManager } from 'g3d';

const input = new InputManager(canvas);
const gameplay = input.createContext({ name: 'gameplay' });

const move = gameplay.addAction({ name: 'move', valueType: 'axis2D' });
move.addCompositeBinding('2DAxis', {
  up: { deviceType: 'keyboard', path: 'W' },
  down: { deviceType: 'keyboard', path: 'S' },
  left: { deviceType: 'keyboard', path: 'A' },
  right: { deviceType: 'keyboard', path: 'D' }
});
gameplay.enable();

// In game loop
const moveInput = input.getAction('gameplay', 'move');
if (moveInput?.vector) {
  // Apply movement
}
```

### Add Animation

```typescript
import { Animation, AnimationMixer } from 'g3d';

const walkAnim = new Animation({
  name: 'Walk',
  duration: 1.0,
  loop: true
});

const mixer = new AnimationMixer();
mixer.play(walkAnim);

// In game loop
mixer.update(deltaTime);
```

### Add Audio

```typescript
import { AudioContext, AudioSource } from 'g3d';

const audio = new AudioContext();
await audio.init();

const clip = await audio.loadClip('sound.mp3');
const source = new AudioSource({ clip });
source.play();
```

### Load 3D Models

```typescript
import { GLTFLoader } from 'g3d';

const loader = new GLTFLoader();
const model = await loader.load('model.gltf');

// Add to scene
scene.add(model);
```

---

## Examples

Check out the [examples directory](../examples/) for more complete examples:

- **Basic**: Hello World, Rotating Cube
- **Rendering**: Materials, Lighting, Shadows, Post-processing
- **Physics**: Rigid bodies, Constraints, Raycasting
- **Animation**: Skeletal animation, State machines, Blending
- **Input**: Keyboard, Mouse, Gamepad, Touch
- **Audio**: 3D spatial audio, Music system
- **Networking**: Multiplayer, State sync
- **AI**: Navigation, Behavior trees, Pathfinding
- **Advanced**: Terrain, Voxels, Ocean, Weather

---

## Resources

- [Architecture Overview](./architecture.md)
- [API Quick Reference](./api-quick-reference.md)
- [Integration Report](../../INTEGRATION_REPORT.md)
- [GitHub Repository](https://github.com/g3d/g3d)
- [Discord Community](https://discord.gg/g3d)
- [Official Website](https://g3d.dev)

---

## Troubleshooting

### Canvas is blank

- Check browser console for errors
- Verify WebGL2/WebGPU support
- Ensure camera is positioned correctly
- Check that scene has lights

### Performance issues

- Enable profiling: `Engine.create({ enableProfiling: true })`
- Use frustum culling
- Implement LOD systems
- Batch draw calls
- Use object pooling

### Type errors

- Ensure TypeScript is configured correctly
- Check `tsconfig.json` includes G3D types
- Import types from 'g3d'

---

Happy coding with G3D 5.0!
