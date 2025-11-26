# G3D Physics Sandbox

A comprehensive interactive physics sandbox demonstrating all physics features of the G3D 5.0 game engine.

## Overview

The Physics Sandbox is a full-featured demonstration of G3D's physics capabilities, including:

- **Rigid Body Dynamics**: Dynamic, kinematic, and static bodies
- **Collision Detection**: Multiple collider shapes and advanced collision handling
- **Constraints**: Hinges, sliders, springs, and fixed joints
- **Force Application**: Direct forces, impulses, and explosions
- **Advanced Simulations**: Cloth, soft bodies, fluids (SPH), and fracture
- **Interactive Tools**: Grab, push, slice, freeze, delete, and explode tools
- **Object Spawning**: Preset configurations like towers, pyramids, chains, and more

## Features

### Object Types

**Basic Shapes:**
- Box: Standard rectangular rigid body
- Sphere: Spherical collision shape
- Capsule: Pill-shaped collider
- Cylinder: Cylindrical body

**Compound Objects:**
- Tower: Stacked boxes demonstrating stability
- Pyramid: Multi-level structure
- Wall: Brick wall pattern
- Chain: Connected rigid bodies with constraints
- Newton's Cradle: Demonstrates energy conservation
- Dominoes: Chain reaction setup
- Wrecking Ball: Pendulum with heavy mass
- Vehicle: Multi-body vehicle with wheel constraints
- Ragdoll: Articulated character with joint limits

### Interactive Tools

1. **Grab Tool (1)**: Pick up and move objects with physics
2. **Push Tool (2)**: Apply directional forces to objects
3. **Slice Tool (3)**: Cut objects along a plane
4. **Freeze Tool (4)**: Toggle kinematic state (freeze/unfreeze)
5. **Delete Tool (5)**: Remove objects from the scene
6. **Explode Tool (6)**: Create radial force explosions

### Advanced Simulations

**Cloth Simulation:**
- Position-based dynamics (PBD)
- Verlet integration
- Distance constraints
- Wind and gravity effects
- Pinned vertices

**Soft Body Simulation:**
- Particle-based deformation
- Spring network
- Volume preservation
- Collision response

**Fluid Simulation (SPH):**
- Smoothed Particle Hydrodynamics
- Density-based pressure
- Viscosity forces
- Container boundaries
- Surface tension

**Fracture System:**
- Runtime mesh fragmentation
- Voronoi-based splitting
- Impact-based breaking
- Fragment physics

## Controls

### Mouse Controls
- **Left Click**: Use selected tool / Select object
- **Right Click + Drag**: Rotate camera around scene
- **Mouse Wheel**: Zoom in/out

### Keyboard Shortcuts
- **1-6**: Select tool (Grab, Push, Slice, Freeze, Delete, Explode)
- **Q**: Rotate spawn object counter-clockwise
- **E**: Rotate spawn object clockwise
- **Delete**: Remove selected object
- **R**: Reset entire scene
- **G**: Toggle gravity on/off
- **T**: Toggle slow motion (0.2x speed)
- **Space**: Pause/Resume simulation
- **H**: Toggle help overlay

## Physics Settings

The sandbox allows real-time manipulation of physics parameters:

- **Gravity**: Toggle or adjust gravity strength
- **Time Scale**: Normal or slow-motion (0.2x)
- **Substeps**: Number of physics substeps per frame
- **Solver Iterations**: Constraint solver iterations

## Performance Stats

The UI displays real-time performance metrics:

- **FPS**: Current frames per second
- **Bodies**: Total number of rigid bodies
- **Active Bodies**: Non-sleeping bodies being simulated
- **Constraints**: Total active constraints

## Installation

```bash
# Navigate to the example directory
cd examples/physics-sandbox

# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

## Usage Examples

### Spawning Objects

Click any object button in the left panel to spawn it at the default location (0, 10, 0).

### Using Tools

1. Select a tool using number keys 1-6 or by clicking the tool button
2. Click on objects or in empty space to use the tool
3. Each tool has unique interaction behavior

### Creating Simulations

Use the simulation buttons in the settings panel to create:
- **Cloth Demo**: Creates a suspended cloth mesh
- **Fluid Demo**: Spawns fluid particles in a container
- **Soft Body Demo**: Creates a deformable soft body

### Custom Scenarios

Combine objects and tools to create custom scenarios:

1. Build a tower using the Tower spawner
2. Use the Wrecking Ball to demolish it
3. Apply explosions for dramatic effects
4. Freeze falling objects mid-air
5. Chain reactions with dominoes

## Architecture

### File Structure

```
physics-sandbox/
├── src/
│   ├── main.ts              # Main application entry point
│   ├── PhysicsController.ts # Physics world controller
│   ├── Spawners.ts          # Object factory methods
│   ├── Simulations.ts       # Advanced simulation systems
│   ├── Tools.ts             # Interactive tool implementations
│   └── SandboxUI.ts         # User interface management
├── index.html               # HTML entry point
├── package.json             # Dependencies and scripts
└── README.md               # This file
```

### Key Classes

**PhysicsSandbox (main.ts)**
- Main application orchestrator
- Manages rendering loop
- Coordinates subsystems

**PhysicsController**
- Physics world management
- Object spawning
- Force application
- Raycasting and selection

**Spawners**
- Factory for creating physics objects
- Preset configurations
- Compound object assembly

**Simulations**
- Advanced simulation implementations
- Cloth, soft body, fluid systems
- Fracture and deformation

**Tools**
- Interactive manipulation tools
- Mouse and keyboard input handling
- Visual feedback rendering

**SandboxUI**
- UI panel management
- Object palette
- Tool selection
- Settings and stats display

## Technical Details

### Physics Integration

The sandbox uses G3D's physics system with:
- Fixed timestep integration (60 FPS)
- Verlet integration for cloth
- Sequential impulse solver for constraints
- Broad-phase collision detection with AABB
- Narrow-phase with SAT and GJK algorithms

### Rendering

Simplified 2D projection rendering for performance:
- Canvas 2D API for visualization
- Pseudo-3D perspective projection
- Real-time shadows and highlights
- Debug visualization for constraints

### Optimization

- Spatial partitioning for collision detection
- Sleeping bodies for static objects
- LOD system for complex simulations
- Object pooling for particles

## Examples and Demos

### Example 1: Building a Tower
```typescript
spawners.spawnTower(new Vector3(0, 0, 0), 15);
```

### Example 2: Creating a Chain
```typescript
spawners.spawnChain(
  new Vector3(-5, 10, 0),
  new Vector3(5, 10, 0),
  20
);
```

### Example 3: Explosion Effect
```typescript
controller.createExplosion(
  new Vector3(0, 5, 0),
  1000,  // force
  10     // radius
);
```

## Troubleshooting

**Low FPS**: Reduce number of active bodies or disable advanced simulations

**Objects falling through ground**: Increase physics substeps in settings

**Unstable constraints**: Adjust constraint solver iterations

**Slow simulation**: Toggle off cloth/fluid simulations

## Future Enhancements

Planned features for future versions:
- GPU-accelerated cloth and fluid simulations
- Hierarchical fracture with multiple levels
- Vehicle physics with suspension
- Rope and cable simulations
- Destructible environments

## License

MIT License - Part of the G3D 5.0 Game Engine

## Credits

Developed by the G3D Team to demonstrate the physics capabilities of the G3D engine.
