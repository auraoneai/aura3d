# Quick Start Guide - G3D 3D Platformer

## Installation & Running

```bash
# From the G3D root directory
cd examples/platformer

# Install dependencies (if not already installed)
pnpm install

# Start the development server
pnpm dev
```

The game will automatically open in your browser at `http://localhost:3000`

## How to Play

1. **Movement**: Use WASD or Arrow keys to move your character
2. **Jump**: Press Space to jump, press again in mid-air for double jump
3. **Sprint**: Hold Shift while moving to run faster
4. **Camera**: Move the mouse to rotate the camera view
5. **Goal**: Collect all coins and reach the end platform!

## What's Included

- **8 TypeScript files** with complete implementations
- **No TODOs or placeholders** - everything is fully functional
- **3,102 total lines of code**
- **Multiple platform types** to explore
- **Collectible system** with scoring
- **Lives and checkpoint system**

## File Overview

| File | Lines | Purpose |
|------|-------|---------|
| `src/main.ts` | 295 | Game initialization and main loop |
| `src/PlayerController.ts` | 465 | Character movement and physics |
| `src/ThirdPersonCamera.ts` | 379 | Camera controls and following |
| `src/Platform.ts` | 360 | 6 different platform types |
| `src/Collectible.ts` | 249 | Coins, gems, power-ups |
| `src/LevelBuilder.ts` | 379 | Level construction |
| `src/GameManager.ts` | 410 | Score, lives, game state |

## Next Steps

1. **Explore the code** - Each file is fully documented
2. **Customize the gameplay** - Modify player speeds, jump heights, etc.
3. **Build new levels** - Use `LevelBuilder` to create custom levels
4. **Add new features** - Extend the base classes

## Tips

- Press Q/E to manually rotate the camera
- Collect 10 coins to get an extra life
- Try to complete the level without dying for a perfect score!
- Bouncy platforms launch you high - use them to reach tall platforms

Enjoy the game!
