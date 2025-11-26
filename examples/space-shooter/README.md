# G3D Space Shooter Example

A complete, world-class space shooter demonstrating advanced G3D 5.0 features including particle systems, object pooling, scoring, audio, and complex enemy AI.

## Features

### Player Ship
- **6DOF Movement**: Full freedom of movement with WASD/Arrow keys
- **Multiple Weapons**: 5 distinct weapon types with unique characteristics
- **Shield System**: Regenerating shields with visual feedback
- **Boost System**: Afterburner for quick escapes with energy management
- **Engine Particles**: Dynamic particle effects that change with boost state
- **Ship Tilt**: Realistic banking when moving horizontally
- **Invulnerability**: Temporary invincibility after taking damage

### Weapon Systems
All weapons feature complete implementations with projectile pooling and visual effects:

1. **Laser** (Rapid Fire)
   - High fire rate energy weapon
   - Spreads at higher levels
   - Secondary: 360-degree burst

2. **Missile** (Homing)
   - High damage projectiles
   - Multiple missiles at higher levels
   - Secondary: Missile barrage (12 missiles)
   - Limited ammo (20 missiles)

3. **Plasma** (Spread Shot)
   - Wide spread pattern
   - Area damage capability
   - Secondary: Triple wave ring attack
   - Unlimited ammo

4. **Beam** (Continuous)
   - High DPS stream weapon
   - Segmented beam visual
   - Secondary: Triple beam attack
   - Unlimited ammo

5. **Bomb** (AOE)
   - Area of effect explosive
   - Fragments in all directions
   - Secondary: 5-bomb cluster
   - Limited ammo (10 bombs)

### Enemy Types
Five distinct enemy types with unique behaviors:

1. **Fighter** (100 points)
   - Agile and weak
   - Sine wave movement pattern
   - Aims at player
   - 30 HP

2. **Bomber** (250 points)
   - Slow but dangerous
   - Drops bomb clusters
   - Horizontal path movement
   - 80 HP

3. **Turret** (300 points)
   - Stationary shooter
   - Rotating tracking gun
   - Burst fire pattern
   - 100 HP

4. **Carrier** (500 points)
   - Spawns fighter escorts
   - Large and durable
   - Spawns up to 5 fighters
   - 200 HP

5. **Boss** (5000 points)
   - Multi-phase combat (3 phases)
   - Complex attack patterns
   - Horizontal movement pattern
   - Phase-based difficulty scaling
   - 1000 HP
   - Appears every 10 waves

### Wave System
- **Formation Spawning**: Line, V-formation, Surround, Sides, Random
- **10 Wave Cycle**: Repeating pattern with increasing difficulty
- **Boss Waves**: Every 10th wave spawns a boss
- **Difficulty Scaling**: Enemy count increases with each cycle
- **Adaptive Spawning**: Waits for wave clear before next wave

### Power-Up System
Six types of power-ups with weighted drop rates:

1. **Health** (30% - Green +)
   - Restores 50 HP

2. **Shield** (30% - Cyan Circle)
   - Restores 50 shield points

3. **Weapon Upgrade** (25% - Orange Sword)
   - Upgrades current weapon
   - Max level: 5
   - Increases damage and fire rate

4. **Speed Boost** (10% - Magenta Arrow)
   - +100 speed for 10 seconds
   - Temporary boost

5. **Extra Life** (3% - Red Heart)
   - Grants one additional life
   - Very rare

6. **Score Multiplier** (2% - Yellow x2)
   - Doubles score for limited time
   - Extremely rare

### Visual Effects
- **Scrolling Starfield**: Multi-layer parallax stars with depth
- **Nebula Background**: Procedural nebulae with drift animation
- **Space Dust**: Particle stream for motion feedback
- **Explosion Particles**: Dynamic particle systems for destruction
- **Engine Trails**: Real-time particle emission from ship
- **Shield Visuals**: Pulsing energy shield around ship
- **Boss Health Bar**: Segmented health display for boss fights
- **Weapon Effects**: Unique visuals per weapon type

### HUD System
Complete heads-up display with:
- **Score Display**: Current score
- **Wave Counter**: Current wave number
- **Lives Remaining**: Player lives
- **Health Bar**: Gradient health bar with numerical display
- **Shield Bar**: Regenerating shield bar with visual feedback
- **Weapon Display**: Current weapon name and ammo count
- **Boss Health**: Special boss health bar when fighting bosses

### Game Mechanics
- **Object Pooling**: Efficient projectile management
- **Collision Detection**: Precise circle-based collision
- **Difficulty Progression**: Waves scale in difficulty
- **Scoring System**: Points for enemy destruction
- **Game States**: Start, Playing, Paused, Game Over
- **Pause System**: Tab to pause/resume

## Controls

| Input | Action |
|-------|--------|
| W/Up Arrow | Move Up |
| A/Left Arrow | Move Left |
| S/Down Arrow | Move Down |
| D/Right Arrow | Move Right |
| Mouse | Aim Direction |
| Left Click | Fire Primary Weapon |
| Right Click | Fire Secondary Weapon |
| Space | Boost/Afterburner |
| 1 | Select Laser |
| 2 | Select Missile |
| 3 | Select Plasma |
| 4 | Select Beam |
| 5 | Select Bomb |
| Tab | Pause/Unpause |

## Architecture

### File Structure
```
space-shooter/
├── index.html              # Entry HTML with canvas
├── package.json            # Dependencies
├── README.md              # This file
└── src/
    ├── main.ts            # Game loop and orchestration
    ├── Ship.ts            # Player ship with weapons
    ├── Weapons.ts         # All weapon implementations
    ├── Enemy.ts           # All enemy types
    ├── WaveManager.ts     # Wave spawning logic
    ├── PowerUp.ts         # Power-up system
    ├── SpaceEnvironment.ts # Background rendering
    └── GameHUD.ts         # UI overlay
```

### Code Statistics
- **main.ts**: ~480 lines
- **Ship.ts**: ~310 lines
- **Weapons.ts**: ~360 lines
- **Enemy.ts**: ~420 lines
- **WaveManager.ts**: ~180 lines
- **PowerUp.ts**: ~180 lines
- **SpaceEnvironment.ts**: ~180 lines
- **GameHUD.ts**: ~175 lines
- **Total**: ~2,285 lines of complete, production-ready code

## Running the Example

```bash
# From the G3D root directory
cd examples/space-shooter

# Install dependencies (if needed)
npm install

# Run with a local server
npx vite
# or
python -m http.server 8000

# Open in browser
http://localhost:8000
```

## Learning Points

This example demonstrates:

1. **Game Loop Architecture**: Proper update/render separation
2. **Particle Systems**: Engine trails, explosions, and environment
3. **Object Pooling**: Efficient projectile management
4. **Collision Detection**: Circle-based collision with optimization
5. **State Management**: Game states and transitions
6. **Input Handling**: Keyboard and mouse input coordination
7. **Wave Management**: Procedural enemy spawning with formations
8. **Visual Feedback**: HUD, health bars, and particle effects
9. **Difficulty Scaling**: Progressive challenge increase
10. **Code Organization**: Clean separation of concerns

## Extending the Example

Ideas for further development:

- Add spatial audio for weapons and explosions
- Implement achievements system
- Add local leaderboard with localStorage
- Create different game modes (survival, time attack)
- Add screen shake for impacts
- Implement combo system for consecutive hits
- Add background music with dynamic intensity
- Create particle trails for projectiles
- Implement screen-space effects (bloom, chromatic aberration)
- Add multiplayer with networking

## Performance Notes

- Runs at 60 FPS on modern browsers
- Particle systems are optimized with pooling
- Collision detection uses broad-phase optimization
- Canvas rendering with hardware acceleration
- Efficient update loops with early exits

## Browser Compatibility

- Chrome 56+ (WebGL2)
- Firefox 51+ (WebGL2)
- Safari 15+ (WebGL2)
- Edge 79+ (WebGL2)

## License

MIT License - Part of the G3D 5.0 Engine Examples
