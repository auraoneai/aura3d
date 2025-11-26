# G3D Racing Game - Complete Vehicle Physics Demo

A fully-featured arcade racing game built with G3D 5.0, demonstrating advanced vehicle physics, AI opponents, and complete race management systems.

## Features

### Vehicle Physics
- **Arcade-style handling** with realistic suspension simulation
- **Tire grip model** with slip calculation for drifting
- **Steering dynamics** that respond to speed and surface
- **Nitro boost system** for speed bursts
- **Damage model** tracking vehicle health
- **Wheel simulation** with individual ground contact detection
- **Aerodynamic drag** for realistic speed limits

### Race Track
- **Spline-based track generation** with smooth curves
- **Elevation changes** including hills and dips
- **Checkpoint system** for lap detection
- **Track boundaries** with physical barriers
- **Environment props**: trees, grandstands, pit buildings, tire barriers
- **Racing line visualization** for AI guidance

### AI Racing
- **Competitive AI opponents** (5 AI drivers)
- **Three difficulty levels**: Easy, Medium, Hard
- **Path following** along optimal racing line
- **Overtaking logic** with collision avoidance
- **Rubber-banding** to keep races competitive
- **Dynamic speed adjustment** based on track curvature

### Race Management
- **Countdown start sequence** (3-2-1-GO!)
- **Live position tracking** for all racers
- **Lap timing** with split times
- **Best lap tracking** for each racer
- **Race finish detection** with results screen
- **Leaderboard** updated in real-time

### Visual Effects
- **Tire smoke particles** when drifting or spinning
- **Nitro flame effects** during boost
- **Skid marks** on track surfaces
- **Dynamic camera modes**: Chase, Hood, Bumper, Orbit
- **Professional HUD** with all racing metrics

### Audio System
- **Engine sounds** with RPM-based pitch modulation
- **Tire skid sounds** during drifts
- **3D spatial audio** for immersive experience
- **Volume control** based on throttle input

### User Interface
- **Analog speedometer** with needle indicator
- **Tachometer** with redline warning
- **Digital speed display** in km/h
- **Lap counter** showing current/total laps
- **Position indicator** with 1st/2nd/3rd highlighting
- **Lap time display** with best lap tracking
- **Minimap** showing all racer positions
- **Nitro meter** with visual feedback
- **Countdown overlay** for race start
- **Leaderboard** panel with live updates
- **Race results screen** with final standings

## Controls

| Key | Action |
|-----|--------|
| **W** or **Up Arrow** | Accelerate |
| **S** or **Down Arrow** | Brake/Reverse |
| **A** or **Left Arrow** | Steer Left |
| **D** or **Right Arrow** | Steer Right |
| **Space** | Handbrake (Drift) |
| **Shift** | Nitro Boost |
| **C** | Change Camera Mode |
| **R** | Reset Vehicle |

## Installation

```bash
# Navigate to the racing game example directory
cd examples/racing-game

# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build
```

## Architecture

### Vehicle System (`Vehicle.ts`)
The `Vehicle` class implements a complete arcade physics model:

- **Suspension Forces**: Spring-damper system for each wheel
- **Ground Detection**: Raycasting for wheel contact
- **Engine Force**: Speed-dependent acceleration with nitro boost
- **Steering**: Lateral forces with drift/grip balance
- **Braking**: Progressive braking with handbrake override
- **Aerodynamic Drag**: Quadratic drag model
- **Particle Systems**: Tire smoke and nitro effects
- **Audio Integration**: RPM-based engine sounds

```typescript
const vehicle = new Vehicle({
  mass: 1200,
  maxSpeed: 250,
  acceleration: 2500,
  brakeForce: 3000,
  steerSpeed: 5.0,
  maxSteerAngle: 0.5,
  driftFactor: 0.3,
  gripFactor: 0.8,
  suspensionStiffness: 800,
  suspensionDamping: 50,
  position: new Vector3(0, 1, 0)
}, physics);
```

### Track System (`Track.ts`)
The `Track` class generates race tracks procedurally:

- **Spline-Based Centerline**: Catmull-Rom spline for smooth curves
- **Track Mesh Generation**: Quad-based surface with proper UVs
- **Boundary Walls**: Physical barriers along track edges
- **Checkpoints**: Invisible triggers for lap detection
- **Racing Line**: Optimal path calculation for AI
- **Environment**: Trees, buildings, and decorative elements

```typescript
const track = new Track({
  name: 'Grand Prix Circuit',
  lapCount: 3,
  checkpointCount: 8,
  trackWidth: 12,
  terrainSize: new Vector3(500, 50, 500)
});
```

### AI System (`AIDriver.ts`)
The `AIDriver` class provides competitive AI racing:

- **Path Following**: Uses racing line with lookahead
- **Steering Control**: PID-like control for smooth steering
- **Speed Management**: Adjusts speed based on track curvature
- **Overtaking**: Detects obstacles and plans overtakes
- **Rubber-banding**: Keeps AI competitive with player
- **Difficulty Scaling**: Easy/Medium/Hard presets

```typescript
const aiDriver = new AIDriver(vehicle, track, AIDifficulty.Hard);
aiDriver.setRubberbandTarget(playerVehicle);
aiDriver.update(deltaTime, allVehicles);
```

### Race Manager (`RaceManager.ts`)
The `RaceManager` class handles race logic:

- **State Machine**: Waiting → Countdown → Racing → Finished
- **Checkpoint Tracking**: Monitors progress through checkpoints
- **Lap Timing**: Tracks individual and total lap times
- **Position Calculation**: Sorts racers by progress
- **Event System**: Callbacks for state changes and completions

```typescript
const raceManager = new RaceManager(track);
raceManager.addRacer(playerVehicle, 'Player', true);
raceManager.on('lapComplete', (racer) => {
  console.log(`${racer.name} completed a lap!`);
});
raceManager.startRace();
```

### HUD System (`RacingHUD.ts`)
The `RacingHUD` class provides comprehensive UI:

- **Canvas-Based Gauges**: Speedometer and tachometer with needles
- **HTML Overlays**: Position, laps, times, leaderboard
- **Minimap Rendering**: 2D track overview with racer dots
- **Dynamic Updates**: Real-time data from race manager
- **Results Screen**: Modal overlay with final standings

```typescript
const hud = new RacingHUD('hud-overlay', raceManager, playerVehicle);
hud.update(deltaTime);
```

## Technical Details

### Physics Configuration
- **Fixed Timestep**: 1/60 second (16.67ms)
- **Gravity**: -20 m/s² (slightly exaggerated for arcade feel)
- **Vehicle Mass**: 1200 kg
- **Max Speed**: 250 km/h
- **Suspension Frequency**: ~10 Hz

### Performance Optimizations
- **Frustum Culling**: Only render visible objects
- **LOD System**: Reduce detail for distant objects
- **Particle Pooling**: Reuse particle instances
- **Physics Sleeping**: Disable updates for stationary bodies
- **Batch Rendering**: Combine similar materials

### Camera Modes

#### Chase Camera
Third-person view behind the vehicle with smooth following.

#### Hood Camera
First-person view from driver's perspective.

#### Bumper Camera
Low angle first-person from front bumper.

#### Orbit Camera
Cinematic rotating view around the vehicle.

## Customization

### Tuning Vehicle Handling

Edit vehicle parameters in `src/main.ts`:

```typescript
const vehicleConfig: VehicleConfig = {
  mass: 1200,              // Heavier = more stable, less responsive
  maxSpeed: 250,           // Top speed in km/h
  acceleration: 2500,      // Engine power
  brakeForce: 3000,        // Braking power
  steerSpeed: 5.0,         // How fast steering responds
  maxSteerAngle: 0.5,      // Maximum turn angle (radians)
  driftFactor: 0.3,        // Drift grip (lower = more drift)
  gripFactor: 0.8,         // Normal grip (higher = more grip)
  suspensionStiffness: 800,// Spring stiffness
  suspensionDamping: 50    // Damping coefficient
};
```

### Creating Custom Tracks

Modify the `createTrackControlPoints()` method in `Track.ts`:

```typescript
private createTrackControlPoints(): Vector3[] {
  const points: Vector3[] = [];

  // Add your control points
  points.push(new Vector3(0, 0, 0));
  points.push(new Vector3(50, 5, 20));
  points.push(new Vector3(100, 0, 0));
  // ... more points

  return points;
}
```

### Adjusting AI Difficulty

Modify difficulty settings in `AIDriver.ts`:

```typescript
case AIDifficulty.Custom:
  return {
    targetSpeedFactor: 0.9,      // % of max speed
    steerSmoothing: 0.6,         // Higher = smoother
    reactionTime: 0.1,           // Seconds delay
    aggressiveness: 0.7,         // Overtake chance
    rubberbandStrength: 0.2      // Lower = less catchup
  };
```

## Known Issues & Future Improvements

### Current Limitations
- Simplified collision detection (box colliders only)
- Basic particle effects (no GPU particles yet)
- Synthetic audio (no actual sound files)
- Simple AI opponents (no personality variation)

### Planned Features
- **Advanced Physics**: Tire deformation, weight transfer
- **Weather System**: Rain, snow affecting grip
- **Multiplayer**: Network racing with other players
- **Track Editor**: Visual track creation tool
- **More Vehicles**: Different car types with unique handling
- **Power-ups**: Speed boosts, shields, weapons
- **Career Mode**: Championship progression
- **Replays**: Race recording and playback

## Performance Tips

### For Best Performance
1. Lower shadow map resolution in scene setup
2. Reduce AI opponent count for slower systems
3. Disable particles on low-end hardware
4. Use simpler camera modes (hood/bumper)
5. Reduce track detail in Track generation

### Debugging
Enable profiling to see performance metrics:

```typescript
const config: EngineConfig = {
  enableProfiling: true,  // Shows FPS and timing
  // ... other config
};
```

## Learning Resources

This example demonstrates:
- **Physics Integration**: RigidBody, Colliders, Raycasting
- **Input Handling**: Keyboard/Gamepad with action mapping
- **Scene Management**: Lights, materials, meshes
- **Particle Systems**: Emitters and visual effects
- **Audio**: 3D spatial sound with Web Audio API
- **UI/HUD**: Canvas rendering and HTML overlays
- **Game State**: State machines and event systems
- **AI Programming**: Path following and behavior

## Credits

Built with **G3D 5.0** - High-performance TypeScript 3D Game Engine

Example created to showcase:
- Complete game architecture
- Production-ready code patterns
- Real-world physics implementation
- Professional UI/UX design
- Scalable system design

## License

MIT License - Free to use and modify

---

**Enjoy racing! 🏎️💨**
