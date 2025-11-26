# G3D 5.0 API Quick Reference

Quick reference guide for the most commonly used APIs in G3D 5.0.

## Table of Contents

1. [Core](#core)
2. [Math](#math)
3. [ECS](#ecs)
4. [Rendering](#rendering)
5. [Physics](#physics)
6. [Animation](#animation)
7. [Input](#input)
8. [Audio](#audio)
9. [Assets](#assets)
10. [UI](#ui)
11. [Networking](#networking)
12. [AI](#ai)

---

## Core

### Engine

```typescript
import { Engine } from 'g3d';

// Create engine
const engine = Engine.create({
  canvas: HTMLCanvasElement,
  targetFPS?: number,           // Default: 60
  enableProfiling?: boolean,    // Default: false
  backend?: 'webgl2' | 'webgpu' // Auto-detect by default
});

// Initialize
await engine.init();

// Start/stop
engine.start();
engine.pause();
engine.resume();
engine.stop();

// Properties
engine.world: World;
engine.renderer: Renderer;
engine.time: Time;
engine.deltaTime: number;
engine.fixedDeltaTime: number;
```

### Time

```typescript
import { Time } from 'g3d';

Time.deltaTime: number;        // Frame delta time
Time.fixedDeltaTime: number;   // Physics delta time
Time.elapsed: number;          // Total elapsed time
Time.frameCount: number;       // Frame counter
Time.fps: number;              // Current FPS
Time.scale: number;            // Time scale (for slow-mo)
```

### Logger

```typescript
import { Logger } from 'g3d';

const logger = new Logger('MyGame');
logger.debug('Debug message');
logger.info('Info message');
logger.warn('Warning message');
logger.error('Error message');

// Configure
Logger.setLevel('debug' | 'info' | 'warn' | 'error');
Logger.enableColors(true);
```

### EventBus

```typescript
import { EventBus } from 'g3d';

const eventBus = new EventBus();

// Subscribe
const unsubscribe = eventBus.on('eventName', (data) => {
  console.log(data);
});

// Emit
eventBus.emit('eventName', { foo: 'bar' });

// Unsubscribe
unsubscribe();
```

---

## Math

### Vector3

```typescript
import { Vector3 } from 'g3d';

// Construction
const v = new Vector3(x, y, z);
const v2 = Vector3.zero();
const v3 = Vector3.one();
const v4 = Vector3.UP;         // (0, 1, 0)
const v5 = Vector3.RIGHT;      // (1, 0, 0)
const v6 = Vector3.FORWARD;    // (0, 0, -1)

// Operations
v.add(other);
v.sub(other);
v.multiply(scalar);
v.divide(scalar);
v.dot(other);
v.cross(other);
v.length();
v.lengthSquared();
v.normalize();
v.distance(other);
v.lerp(other, t);

// Utilities
v.set(x, y, z);
v.copy(other);
v.clone();
v.equals(other);
v.toArray();
```

### Matrix4

```typescript
import { Matrix4 } from 'g3d';

// Construction
const m = new Matrix4();
const identity = Matrix4.identity();

// Transformations
Matrix4.translation(x, y, z);
Matrix4.rotation(axis, angle);
Matrix4.scale(x, y, z);
Matrix4.lookAt(eye, target, up);
Matrix4.perspective(fov, aspect, near, far);
Matrix4.orthographic(left, right, bottom, top, near, far);

// Operations
m.multiply(other);
m.invert();
m.transpose();
m.decompose();

// Get components
m.getTranslation();
m.getRotation();
m.getScale();
```

### Quaternion

```typescript
import { Quaternion } from 'g3d';

// Construction
const q = new Quaternion(x, y, z, w);
const identity = Quaternion.identity();

// From/To
Quaternion.fromEuler(x, y, z);
Quaternion.fromAxisAngle(axis, angle);
Quaternion.fromRotationMatrix(matrix);
q.toEuler();
q.toAxisAngle();

// Operations
q.multiply(other);
q.conjugate();
q.inverse();
q.normalize();
q.slerp(other, t);
```

### Color

```typescript
import { Color } from 'g3d';

// Construction
const c = new Color(r, g, b, a);
const red = Color.RED;
const green = Color.GREEN;
const blue = Color.BLUE;

// From/To
Color.fromHex('#ff0000');
Color.fromHSL(h, s, l);
c.toHex();
c.toHSL();

// Operations
c.lerp(other, t);
c.multiply(scalar);
c.add(other);
```

---

## ECS

### World

```typescript
import { World } from 'g3d';

const world = new World();

// Entities
const entity = world.createEntity();
world.destroyEntity(entity);
world.hasEntity(entity);

// Components
world.addComponent(entity, component);
world.removeComponent(entity, ComponentType);
world.getComponent(entity, ComponentType);
world.hasComponent(entity, ComponentType);

// Queries
const query = world.query([ComponentA, ComponentB]);
for (const entity of query) {
  const a = world.getComponent(entity, ComponentA);
  const b = world.getComponent(entity, ComponentB);
}

// Systems
world.addSystem(system, priority?);
world.removeSystem(system);
world.update(deltaTime);
```

### Component

```typescript
import { Component } from 'g3d';

class MyComponent extends Component {
  value: number = 0;

  constructor(value?: number) {
    super();
    if (value !== undefined) this.value = value;
  }

  clone(): MyComponent {
    return new MyComponent(this.value);
  }

  serialize(): any {
    return { value: this.value };
  }

  deserialize(data: any): void {
    this.value = data.value;
  }
}
```

### System

```typescript
import { System } from 'g3d';

class MySystem extends System {
  query = [TransformComponent, MyComponent];

  update(deltaTime: number): void {
    for (const entity of this.world.query(this.query)) {
      const transform = this.world.getComponent(entity, TransformComponent);
      const my = this.world.getComponent(entity, MyComponent);

      // Update logic
    }
  }
}
```

---

## Rendering

### Renderer

```typescript
import { Renderer } from 'g3d';

const renderer = await Renderer.create({
  canvas: HTMLCanvasElement,
  backend?: 'webgl2' | 'webgpu'
});

// Render
renderer.render(scene, camera);

// Configuration
renderer.setClearColor(color);
renderer.setSize(width, height);
renderer.setPixelRatio(ratio);

// Properties
renderer.backend: 'webgl2' | 'webgpu';
renderer.capabilities: Capabilities;
```

### Scene

```typescript
import { Scene } from 'g3d';

const scene = new Scene('MainScene');

// Lights
scene.addLight(light);
scene.removeLight(light);
scene.lights: Light[];

// Environment
scene.environment = texture;
scene.background = color | texture;
scene.fog = { color, near, far };
```

### Camera

```typescript
import { Camera } from 'g3d';

const camera = new Camera();

// Perspective
camera.setPerspective(
  fov: number,
  aspect: number,
  near: number,
  far: number
);

// Orthographic
camera.setOrthographic(
  left: number,
  right: number,
  bottom: number,
  top: number,
  near: number,
  far: number
);

// Transform
camera.position: Vector3;
camera.rotation: Quaternion;
camera.lookAt(target: Vector3);

// Matrices
camera.viewMatrix: Matrix4;
camera.projectionMatrix: Matrix4;
camera.updateMatrices();
```

### Material

```typescript
import { Material, PBRMaterial } from 'g3d';

// Standard PBR material
const material = new PBRMaterial({
  baseColor: Color.WHITE,
  metallic: 0.0,
  roughness: 0.5,
  emissive: Color.BLACK,
  emissiveIntensity: 0.0,
  normalMap?: Texture,
  metallicRoughnessMap?: Texture,
  aoMap?: Texture,
  emissiveMap?: Texture
});

// Properties
material.baseColor = new Color(1, 0, 0);
material.metallic = 0.5;
material.roughness = 0.3;
```

### Light

```typescript
import { DirectionalLight, PointLight, SpotLight } from 'g3d';

// Directional
const sun = new DirectionalLight();
sun.color = Color.WHITE;
sun.intensity = 3.0;
sun.direction = new Vector3(0, -1, 0);
sun.castShadows = true;

// Point
const lamp = new PointLight();
lamp.color = Color.WHITE;
lamp.intensity = 1.0;
lamp.position = new Vector3(0, 5, 0);
lamp.range = 10.0;

// Spot
const spotlight = new SpotLight();
spotlight.color = Color.WHITE;
spotlight.intensity = 1.0;
spotlight.position = new Vector3(0, 5, 0);
spotlight.direction = new Vector3(0, -1, 0);
spotlight.angle = Math.PI / 4;
spotlight.penumbra = 0.1;
```

---

## Physics

### PhysicsWorld

```typescript
import { PhysicsWorld } from 'g3d';

const physics = new PhysicsWorld({
  gravity: new Vector3(0, -9.81, 0)
});

// Update
physics.step(deltaTime);

// Bodies
physics.addRigidBody(body);
physics.removeRigidBody(body);

// Raycasting
const hit = physics.raycast(origin, direction, maxDistance);
if (hit) {
  console.log(hit.point, hit.normal, hit.entity);
}
```

### RigidBody

```typescript
import { RigidBody, BoxShape } from 'g3d';

const body = new RigidBody({
  type: 'dynamic' | 'static' | 'kinematic',
  mass: 10,
  position: new Vector3(0, 5, 0),
  rotation: Quaternion.identity()
});

// Collider
body.addCollider({
  shape: new BoxShape(new Vector3(1, 1, 1)),
  material: { friction: 0.5, restitution: 0.3 }
});

// Forces
body.applyForce(force: Vector3);
body.applyImpulse(impulse: Vector3);
body.applyTorque(torque: Vector3);

// Properties
body.velocity: Vector3;
body.angularVelocity: Vector3;
body.position: Vector3;
body.rotation: Quaternion;
```

---

## Animation

### Animation

```typescript
import { Animation, AnimationTrack } from 'g3d';

const anim = new Animation({
  name: 'Walk',
  duration: 1.0,
  loop: true
});

// Add tracks
const track = new AnimationTrack({
  target: 'bone.position',
  times: [0, 0.5, 1.0],
  values: [
    new Vector3(0, 0, 0),
    new Vector3(0, 1, 0),
    new Vector3(0, 0, 0)
  ],
  interpolation: 'linear'
});
anim.addTrack(track);
```

### AnimationMixer

```typescript
import { AnimationMixer } from 'g3d';

const mixer = new AnimationMixer();

// Play
const action = mixer.play(animation);
action.setWeight(1.0);
action.setTimeScale(1.0);

// Crossfade
mixer.crossfade(fromAnim, toAnim, duration);

// Update
mixer.update(deltaTime);
```

### Skeleton

```typescript
import { Skeleton, Bone } from 'g3d';

const skeleton = new Skeleton({
  name: 'Character',
  bones: [
    new Bone({ name: 'root', parent: -1 }),
    new Bone({ name: 'spine', parent: 0 }),
    new Bone({ name: 'head', parent: 1 })
  ]
});

// Update
skeleton.update();
skeleton.getBoneMatrices(); // For GPU skinning
```

---

## Input

### InputManager

```typescript
import { InputManager } from 'g3d';

const input = new InputManager(canvas);

// Create context
const gameplay = input.createContext({ name: 'gameplay' });

// Add action
const jump = gameplay.addAction({
  name: 'jump',
  valueType: 'button'
});

// Add binding
jump.addBinding({
  deviceType: 'keyboard',
  path: 'Space'
});

// Enable
gameplay.enable();

// Read input
const action = input.getAction('gameplay', 'jump');
if (action?.wasPressed) {
  player.jump();
}

// Update
input.update(deltaTime);
```

### Keyboard

```typescript
import { Keyboard } from 'g3d';

const keyboard = new Keyboard();

// Keys
keyboard.isKeyDown('W');
keyboard.isKeyPressed('Space');
keyboard.isKeyReleased('Escape');
```

### Mouse

```typescript
import { Mouse } from 'g3d';

const mouse = new Mouse(canvas);

// Buttons
mouse.isButtonDown(0); // Left
mouse.isButtonDown(1); // Middle
mouse.isButtonDown(2); // Right

// Position
mouse.position: Vector2;
mouse.delta: Vector2;

// Scroll
mouse.scroll: number;
```

---

## Audio

### AudioContext

```typescript
import { AudioContext } from 'g3d';

const audio = new AudioContext();
await audio.init();

// Load clip
const clip = await audio.loadClip('sound.mp3');

// Properties
audio.masterVolume = 0.8;
audio.suspend();
audio.resume();
```

### AudioSource

```typescript
import { AudioSource } from 'g3d';

const source = new AudioSource({
  clip: audioClip,
  volume: 1.0,
  pitch: 1.0,
  loop: false,
  autoPlay: false
});

// Playback
source.play();
source.pause();
source.stop();
source.seek(timeInSeconds);

// 3D spatial audio
source.setSpatial({
  position: new Vector3(10, 0, 0),
  maxDistance: 100,
  rolloffFactor: 1.0,
  refDistance: 1.0
});
```

---

## Assets

### AssetLoader

```typescript
import { AssetLoader } from 'g3d';

const loader = new AssetLoader();

// Load single asset
const texture = await loader.load('texture.png', {
  onProgress: (progress) => console.log(`${progress * 100}%`)
});

// Load multiple
const [model, texture, audio] = await loader.loadAll([
  'model.gltf',
  'texture.png',
  'sound.mp3'
]);

// Load bundle
const bundle = await loader.loadBundle('level1.json');
```

### AssetCache

```typescript
import { AssetCache } from 'g3d';

const cache = new AssetCache({
  maxSize: 512 * 1024 * 1024 // 512MB
});

// Add
cache.add('texture', textureData);

// Get
const texture = cache.get('texture');

// Remove
cache.remove('texture');

// Clear
cache.clear();
```

---

## UI

### UICanvas

```typescript
import { UICanvas } from 'g3d';

const canvas = new UICanvas(htmlCanvas);

// Add children
canvas.addChild(element);
canvas.removeChild(element);

// Update & render
canvas.update(deltaTime);
canvas.render();
```

### UIButton

```typescript
import { UIButton } from 'g3d';

const button = UIButton.createPrimary('Click Me');
button.onClick(() => {
  console.log('Clicked!');
});

// Properties
button.position = new Vector2(100, 100);
button.size = new Vector2(200, 50);
button.enabled = true;
button.visible = true;
```

### UIText

```typescript
import { UIText } from 'g3d';

const text = new UIText({
  text: 'Hello World',
  fontSize: 24,
  color: Color.WHITE,
  fontFamily: 'Arial',
  align: 'center'
});
```

---

## Networking

### NetworkManager

```typescript
import { NetworkManager, WebSocketTransport } from 'g3d';

const network = new NetworkManager({
  mode: 'client' | 'server',
  transport: new WebSocketTransport({
    url: 'ws://localhost:8080'
  })
});

// Connect
await network.connect();

// Send message
network.send('chatMessage', { text: 'Hello!' });

// Receive message
network.on('chatMessage', (data) => {
  console.log(data.text);
});

// Disconnect
network.disconnect();
```

### RPC System

```typescript
import { RPCSystem } from 'g3d';

const rpc = new RPCSystem(network);

// Register
rpc.register('getPlayerName', (playerId) => {
  return players[playerId].name;
});

// Call
const name = await rpc.call('getPlayerName', [playerId]);
```

---

## AI

### NavMesh

```typescript
import { NavMesh } from 'g3d';

const navMesh = new NavMesh();

// Bake
await navMesh.bake(geometry, {
  cellSize: 0.3,
  cellHeight: 0.2,
  agentRadius: 0.6,
  agentHeight: 2.0
});
```

### Pathfinder

```typescript
import { Pathfinder } from 'g3d';

const pathfinder = new Pathfinder(navMesh);

// Find path
const path = pathfinder.findPath(start, end);
if (path) {
  for (const point of path) {
    // Follow path
  }
}
```

### NavAgent

```typescript
import { NavAgent } from 'g3d';

const agent = new NavAgent({
  position: new Vector3(0, 0, 0),
  radius: 0.5,
  height: 2.0,
  maxSpeed: 5.0,
  maxAcceleration: 10.0
});

// Set destination
agent.setDestination(target, pathfinder, navMesh);

// Update
agent.update(deltaTime);

// Get position
console.log(agent.position);
```

### BehaviorTree

```typescript
import {
  BehaviorTree,
  SelectorNode,
  SequenceNode,
  ActionNode,
  ConditionNode
} from 'g3d';

const tree = new BehaviorTree(
  new SelectorNode('Root', [
    new SequenceNode('Attack', [
      new ConditionNode('EnemyInRange', checkEnemyInRange),
      new ActionNode('AttackEnemy', attackEnemy)
    ]),
    new ActionNode('Patrol', patrol)
  ])
);

// Tick
tree.tick(deltaTime);
```

---

## Common Patterns

### Creating a Simple Game

```typescript
import {
  Engine,
  Vector3,
  TransformComponent,
  MeshComponent,
  RigidBodyComponent,
  PhysicsWorld,
  InputManager
} from 'g3d';

async function main() {
  // Create engine
  const engine = Engine.create({
    canvas: document.querySelector('canvas')!
  });
  await engine.init();

  // Create entity
  const player = engine.world.createEntity();
  engine.world.addComponent(player, new TransformComponent({
    position: new Vector3(0, 5, 0)
  }));
  engine.world.addComponent(player, new MeshComponent({
    mesh: cubeMesh,
    material: standardMaterial
  }));
  engine.world.addComponent(player, new RigidBodyComponent({
    type: 'dynamic',
    mass: 10
  }));

  // Setup input
  const input = new InputManager(engine.canvas);
  const gameplay = input.createContext({ name: 'gameplay' });
  const move = gameplay.addAction({ name: 'move', valueType: 'axis2D' });
  move.addCompositeBinding('2DAxis', {
    up: { deviceType: 'keyboard', path: 'W' },
    down: { deviceType: 'keyboard', path: 'S' },
    left: { deviceType: 'keyboard', path: 'A' },
    right: { deviceType: 'keyboard', path: 'D' }
  });
  gameplay.enable();

  // Start
  engine.start();
}

main();
```

---

For complete API documentation, see the [TypeScript definitions](../src/index.ts) or visit [g3d.dev/docs](https://g3d.dev/docs).
