# G3D FPS Game Example

A complete, production-ready first-person shooter game built with G3D 5.0, demonstrating advanced game development techniques including physics-based movement, AI behavior trees, weapon systems, and procedural level generation.

## Features

### Player Controller
- **First-person camera** with smooth mouse look (pitch/yaw control)
- **Physics-based movement** with WASD controls
- **Advanced mechanics**:
  - Sprint with stamina system
  - Crouch with smooth height interpolation
  - Jump with realistic gravity
  - Head bob animation for immersion
  - Footstep sounds that adapt to movement speed
- **Health system** with regeneration after 5 seconds without damage
- **Collision detection** with level geometry

### Weapon System
Three fully functional weapons with unique characteristics:

#### M1911 Pistol
- Damage: 25
- Fire Rate: 300 RPM
- Magazine: 12 rounds
- Range: 50m
- Firing Mode: Semi-automatic

#### M4A1 Rifle
- Damage: 30
- Fire Rate: 700 RPM
- Magazine: 30 rounds
- Range: 100m
- Firing Mode: Full-auto

#### Pump Shotgun
- Damage: 15 per pellet (8 pellets)
- Fire Rate: 80 RPM
- Magazine: 8 shells
- Range: 30m
- Firing Mode: Pump-action

**Weapon Features**:
- Realistic recoil with recovery
- Bullet spread simulation
- Reload mechanics with timing
- Muzzle flash effects
- Shell ejection particles
- Hit detection via raycasting
- Audio feedback for all actions

### Enemy AI
Intelligent enemies with advanced behavior:

- **Behavior Tree AI** with multiple states:
  - **Idle**: Resting between patrol routes
  - **Patrol**: Following waypoints around the level
  - **Investigate**: Checking out suspicious sounds
  - **Chase**: Pursuing the player when spotted
  - **Attack**: Engaging the player in combat
  - **Flee**: Retreating when health is low
  - **Take Cover**: Finding and using cover points

- **Perception System**:
  - Sight: 20m range with 120° field of view
  - Hearing: 15m range for sound detection
  - Line-of-sight checking
  - Memory of last known player position

- **Navigation**:
  - NavMesh pathfinding
  - Dynamic path updates
  - Cover point detection
  - Obstacle avoidance

- **Combat**:
  - Attack patterns with cooldowns
  - Tactical cover usage
  - Health-based behavior changes
  - Ragdoll physics on death

### Level Generation
Procedurally generated levels featuring:

- **Structure**:
  - 8 interconnected rooms of varying sizes (6-12 units)
  - Corridor network connecting all rooms
  - Non-overlapping room placement

- **Features**:
  - Obstacles and cover points
  - Player spawn point
  - Multiple enemy spawn locations
  - Health and ammo pickup positions
  - Dynamic lighting for each room

- **AI Support**:
  - Baked NavMesh for pathfinding
  - Patrol waypoints in each room
  - Cover point database
  - Collision geometry

### Heads-Up Display (HUD)
Complete UI system with:

- **Health Bar**: Visual indicator with color-coded status (green/yellow/red)
- **Ammo Counter**: Magazine and reserve ammunition display
- **Score Display**: Real-time score tracking
- **Wave Counter**: Current wave and enemies remaining
- **Crosshair**: Dynamic crosshair with hit feedback
- **Damage Overlay**: Screen flash on damage
- **Kill Feed**: Recent kills with 5-second display
- **Message System**: Wave notifications and objectives
- **Minimap**: Player position and orientation

## Controls

| Input | Action |
|-------|--------|
| **W** | Move Forward |
| **A** | Move Left |
| **S** | Move Backward |
| **D** | Move Right |
| **Mouse** | Look Around |
| **Left Click** | Fire Weapon |
| **Right Click** | Aim Down Sights (planned) |
| **R** | Reload |
| **Space** | Jump |
| **Shift** | Sprint |
| **Ctrl** | Crouch |
| **1** | Switch to Pistol |
| **2** | Switch to Rifle |
| **3** | Switch to Shotgun |
| **ESC** | Release Mouse Lock |

## Getting Started

### Prerequisites
- Node.js 18+ and pnpm 8+
- Modern browser with WebGL2 or WebGPU support
- G3D 5.0 installed

### Installation

1. Navigate to the example directory:
```bash
cd examples/fps-game
```

2. Install dependencies:
```bash
pnpm install
```

3. Run the development server:
```bash
pnpm dev
```

4. Open your browser to `http://localhost:5173`

### Building for Production

```bash
pnpm build
```

The built files will be in the `dist/` directory.

## Game Mechanics

### Wave System
- Start with 3 enemies in Wave 1
- Each wave adds 2 more enemies
- 3-second delay between waves
- Enemies spawn at random spawn points

### Scoring
- 100 points per enemy killed
- Score carries across waves
- Track high scores locally

### Health System
- Player starts with 100 health
- No health regeneration during combat
- 5-second delay before regeneration begins
- Regenerates at 10 HP/second

### Stamina System
- 100 stamina maximum
- Sprinting drains 25 stamina/second
- Regenerates at 20 stamina/second when not sprinting
- Cannot sprint when stamina depleted

## Architecture

### File Structure
```
fps-game/
├── index.html          # Entry point with loading screen
├── src/
│   ├── main.ts         # Game loop and initialization
│   ├── Player.ts       # First-person controller
│   ├── Weapon.ts       # Weapon system
│   ├── Enemy.ts        # AI enemy with behavior tree
│   ├── Level.ts        # Procedural level generator
│   └── HUD.ts          # User interface
├── package.json
└── README.md
```

### Key Systems

#### Physics Integration
- Character controller with capsule collision
- Gravity and ground detection
- Collision response for level geometry
- Obstacle avoidance

#### Audio System
- 3D spatial audio for enemies
- Positional footsteps
- Weapon sound effects
- Audio listener follows player camera

#### Rendering
- Deferred rendering pipeline
- Dynamic shadows
- Muzzle flash particles
- Shell ejection effects
- Blood splatter on hits

## Performance

Optimized for smooth 60 FPS gameplay:

- Efficient behavior tree execution
- Spatial partitioning for AI updates
- Frustum culling
- LOD system for distant objects
- Object pooling for particles
- NavMesh caching

## Future Enhancements

Potential additions for learning:

- [ ] Aim down sights (ADS) system
- [ ] Grenade throwing
- [ ] Multiplayer support
- [ ] More weapon types
- [ ] Boss enemies
- [ ] Achievements system
- [ ] Save/load game state
- [ ] Settings menu
- [ ] Audio mixing options
- [ ] Graphics quality settings

## Code Highlights

### Behavior Tree Implementation
The enemy AI uses a complete behavior tree with:
- State machine transitions
- Perception queries
- Pathfinding integration
- Cover evaluation
- Dynamic decision making

### Weapon System
Demonstrates:
- Weapon switching
- Different firing modes
- Recoil simulation
- Hit detection
- Audio/visual feedback

### Procedural Generation
Shows:
- Room placement algorithm
- Corridor generation
- NavMesh baking
- Spawn point distribution
- Lighting placement

## Learning Resources

This example demonstrates:

1. **Game Architecture**: ECS patterns, system organization
2. **AI Programming**: Behavior trees, pathfinding, perception
3. **Physics**: Character controllers, collision detection
4. **Rendering**: Scene management, effects, UI
5. **Audio**: 3D spatial sound, sound management
6. **Input**: Action mapping, mouse lock, keyboard handling
7. **Procedural Generation**: Level creation, NavMesh baking

## License

MIT License - See G3D main repository for details

## Credits

Built with G3D 5.0 - High-performance TypeScript game engine

## Support

For questions or issues:
- Check G3D documentation
- Review source code comments
- Open an issue on GitHub
