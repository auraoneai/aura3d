# G3D 3D Platformer Example

A complete, production-ready 3D platformer demonstration built with G3D 5.0. This example showcases advanced character control, camera systems, physics integration, and game state management.

## Features

### Character Controller
- **Movement System**
  - WASD/Arrow key movement with camera-relative controls
  - Walk and sprint modes
  - Smooth acceleration and deceleration
  - Air control for mid-air maneuverability

- **Jump Mechanics**
  - Single jump with configurable force
  - Double jump system
  - Wall jump mechanics
  - Coyote time (grace period after leaving ground)
  - Jump buffering (early jump input recognition)

- **Advanced Platforming**
  - Ground detection with raycast
  - Wall detection for wall jumps
  - Ledge grabbing capability
  - Velocity clamping to prevent excessive speeds
  - Animation state machine ready

### Camera System
- **Third-Person Camera**
  - Smooth orbital camera following
  - Mouse-controlled camera rotation
  - Zoom in/out with mouse wheel
  - Collision detection and avoidance
  - Camera shake effects
  - Vertical angle constraints

### Platform Types
1. **Static Platform** - Fixed platforms
2. **Moving Platform** - Moves along waypoint paths
3. **Rotating Platform** - Rotates around axis
4. **Falling Platform** - Falls after player steps on it
5. **Bouncy Platform** - Launches player upward
6. **Disappearing Platform** - Appears and disappears on timer

### Collectibles
- **Coin** - Standard collectible (100 points)
- **Gem** - Valuable collectible (500 points)
- **Power-Up** - Special item (1000 points)
- **Health Pack** - Restores health
- Rotating and bobbing animations
- Collection particle effects
- Fade-out animations

### Game Systems
- **Score System**
  - Points for collectibles
  - Checkpoint bonuses
  - Time bonuses
  - Perfect completion bonuses
  - Extra life every 10 coins

- **Lives System**
  - 3 starting lives
  - Maximum 5 lives
  - Respawn at last checkpoint
  - Game over on 0 lives

- **Checkpoint System**
  - Auto-save progress
  - Respawn location on death
  - Checkpoint bonuses

- **Statistics Tracking**
  - Total score
  - Coins collected
  - Deaths count
  - Jump statistics
  - Time elapsed
  - High score persistence

## Controls

| Input | Action |
|-------|--------|
| W/↑ | Move Forward |
| S/↓ | Move Backward |
| A/← | Move Left |
| D/→ | Move Right |
| Space | Jump |
| Space (in air) | Double Jump |
| Shift | Sprint |
| Mouse Move | Rotate Camera |
| Mouse Wheel | Zoom Camera |
| Q | Rotate Camera Left |
| E | Rotate Camera Right |

## File Structure

```
platformer/
├── index.html              # Game HTML container (95 lines)
├── package.json            # Project dependencies
├── src/
│   ├── main.ts             # Game entry point (280 lines)
│   ├── PlayerController.ts # Character controller (420 lines)
│   ├── ThirdPersonCamera.ts # Camera system (315 lines)
│   ├── Platform.ts         # Platform types (385 lines)
│   ├── Collectible.ts      # Collectible items (220 lines)
│   ├── LevelBuilder.ts     # Level construction (310 lines)
│   └── GameManager.ts      # Game state management (315 lines)
└── README.md               # This file
```

## Getting Started

### Installation

```bash
# Navigate to the platformer example directory
cd examples/platformer

# Install dependencies
pnpm install

# Start development server
pnpm dev
```

### Building for Production

```bash
pnpm build
```

### Preview Production Build

```bash
pnpm preview
```

## Code Examples

### Creating a Player Controller

```typescript
import { PlayerController } from './PlayerController';
import { PhysicsWorld, Vector3, Keyboard } from 'g3d';

const physicsWorld = new PhysicsWorld({
  gravity: new Vector3(0, -20, 0)
});

const keyboard = new Keyboard();
keyboard.attach(window);

const player = new PlayerController(
  physicsWorld,
  keyboard,
  new Vector3(0, 2, 0),
  {
    walkSpeed: 5.0,
    runSpeed: 8.0,
    jumpForce: 12.0,
    doubleJumpForce: 10.0,
    coyoteTime: 0.15,
    jumpBufferTime: 0.1
  }
);

// Set up callbacks
player.onJump = () => console.log('Jump!');
player.onLanded = () => console.log('Landed!');
player.onDeath = () => console.log('Player died!');

// Update loop
function update(dt: number) {
  player.update(dt);
}

function fixedUpdate(dt: number) {
  physicsWorld.step(dt);
  player.fixedUpdate(dt);
}
```

### Creating a Third-Person Camera

```typescript
import { ThirdPersonCamera } from './ThirdPersonCamera';
import { Mouse, Keyboard } from 'g3d';

const mouse = new Mouse();
const keyboard = new Keyboard();

mouse.attach(canvas);
keyboard.attach(window);

const camera = new ThirdPersonCamera(
  player,
  mouse,
  keyboard,
  {
    distance: 8.0,
    height: 2.0,
    followSpeed: 8.0,
    rotationSpeed: 3.0,
    minVerticalAngle: -0.8,
    maxVerticalAngle: 1.2
  }
);

// Update loop
function update(dt: number) {
  camera.update(dt);
}

// Trigger camera shake
camera.shake(0.5);
```

### Building a Level

```typescript
import { LevelBuilder } from './LevelBuilder';
import { PhysicsWorld } from 'g3d';

const physicsWorld = new PhysicsWorld();
const levelBuilder = new LevelBuilder(physicsWorld);

// Build level 1
const { platforms, collectibles, checkpoints } = levelBuilder.buildLevel1();

// Update platforms and collectibles
function update(dt: number) {
  platforms.forEach(platform => platform.update(dt));
  collectibles.forEach(collectible => collectible.update(dt));
}

// Check collectible collision
for (const collectible of collectibles) {
  if (collectible.checkCollision(player.position, 1.0)) {
    gameManager.collectCoin();
  }
}
```

### Managing Game State

```typescript
import { GameManager } from './GameManager';

const gameManager = new GameManager();

// Start game
gameManager.startGame();

// Set total coins in level
gameManager.setTotalCoins(10);

// Collect items
gameManager.collectCoin();  // +100 points
gameManager.collectGem();   // +500 points

// Set checkpoint
gameManager.setCheckpoint(new Vector3(20, 5, 0));

// Handle death
gameManager.loseLife();

// Check game state
if (gameManager.lives <= 0) {
  gameManager.gameOver();
}

// Get statistics
const stats = gameManager.getStats();
console.log(`Score: ${stats.totalScore}`);
console.log(`Coins: ${stats.coinsCollected}/${stats.totalCoins}`);
console.log(`Grade: ${gameManager.getGrade()}`);
```

## Architecture

### Player Controller Architecture

The `PlayerController` uses a multi-layered approach:

1. **Input Layer** - Reads keyboard input
2. **State Detection** - Checks grounded/wall states via raycasts
3. **Movement Logic** - Applies forces based on state
4. **Physics Integration** - Updates rigid body
5. **Animation State** - Determines current animation

### Camera System Architecture

The `ThirdPersonCamera` implements:

1. **Input Processing** - Mouse/keyboard camera controls
2. **Target Calculation** - Ideal camera position
3. **Smooth Following** - Spring-damped interpolation
4. **Collision Resolution** - Raycast-based collision avoidance
5. **Effect Application** - Camera shake and other effects

### Platform System Architecture

Each platform type extends the base `Platform` class and implements:

1. **Physics Body** - Rigid body with appropriate type (static/kinematic/dynamic)
2. **Update Logic** - Type-specific behavior (movement, rotation, etc.)
3. **State Management** - Internal state tracking
4. **Collision Handling** - Trigger detection for special platforms

## Performance Considerations

- **Physics Optimization**: Uses fixed timestep (1/60s) for deterministic simulation
- **Collision Detection**: Efficient raycasting for ground/wall detection
- **Memory Management**: Object pooling for particles and effects
- **Update Efficiency**: Separates variable and fixed update loops
- **State Caching**: Caches frequently accessed values

## Extending the Example

### Adding New Platform Types

```typescript
export class CustomPlatform extends Platform {
  constructor(physicsWorld: PhysicsWorld, position: Vector3, size: Vector3) {
    super(physicsWorld, position, size, PlatformType.Custom);
  }

  update(dt: number): void {
    // Custom platform logic
  }
}
```

### Adding New Collectible Types

```typescript
const customCollectible = new Collectible(
  position,
  {
    type: CollectibleType.Custom,
    value: 2000,
    rotationSpeed: 3.0,
    bobHeight: 0.5
  }
);
```

### Creating Custom Levels

```typescript
buildCustomLevel(): LevelData {
  const platforms: Platform[] = [];
  const collectibles: Collectible[] = [];

  // Add your platforms and collectibles

  return {
    platforms,
    collectibles,
    checkpoints: [],
    startPosition: new Vector3(0, 2, 0),
    goalPosition: new Vector3(100, 10, 0)
  };
}
```

## Known Limitations

- Camera collision detection uses simplified raycasting (full mesh collision not implemented)
- Wall jump currently uses simple raycast in 4 directions (could be enhanced with sphere cast)
- Physics world raycast is a stub (would integrate with full physics engine)
- No networked multiplayer (single-player only)
- Audio system integration pending

## License

MIT License - Part of G3D 5.0 Game Engine

## Support

For issues, questions, or contributions, please refer to the main G3D repository.
