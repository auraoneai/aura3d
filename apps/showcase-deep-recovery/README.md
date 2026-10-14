# `@aura3d/showcase-deep-recovery`

Deep-sea salvage submersible route built on the single-path `createGame(...)` runtime (`@aura3d/engine/game`) with admitted GLB models (`deepRecoverySub`, `deepRecoveryWreckHull`, `deepRecoveryCrateStandard`, `deepRecoveryCrateHeavy`, `deepRecoveryBuoyBeacon`) and pure gameplay modules (`src/gameplay/{reef,oxygen,sonar,salvage}.ts`).

## Controls

| Input | Action |
| --- | --- |
| `W` / `S` or `ArrowUp` / `ArrowDown` | Forward / reverse thrust |
| `A` / `D` or `ArrowLeft` / `ArrowRight` | Steer yaw left / right |
| `Space` / `E` | Ascend toward surface buoy |
| `Shift` / `C` / `Q` | Descend into trench / abyss |
| `F` | Grapple nearby salvage crate (`<= 4.4 m`) |
| `G` | Release active spring tethers |
| `R` | Trigger active sonar ping (`Sonar`) |
| `X` | Patch hull breach |
| `P` / `Escape` | Pause / resume session |

## Pure Gameplay Modules

- `src/gameplay/reef.ts` (`src/reef.ts`) — depth zones (`Sunlit Reef`, `Twilight Trench`, `Abyssal Vent Zone`), wreck obstacle AABBs, surface buoy station (`y = 16`), and world bounds.
- `src/gameplay/oxygen.ts` (`src/oxygen.ts`) — depth-scaled oxygen drain, tow mass penalty, collision breach damage, breach patching, and surface buoy refuel/repair.
- `src/gameplay/sonar.ts` (`src/sonar.ts`) — expanding sonar wave, wreck-AABB ray occlusion, and timed contact markers.
- `src/gameplay/salvage.ts` (`src/salvage.ts`) — 6 salvage crates (4 standard, 2 heavy), Hooke-law spring tether physics, buoy banking, and 3 salvage contracts.

## Scripts

```bash
pnpm --filter @aura3d/showcase-deep-recovery dev
pnpm --filter @aura3d/showcase-deep-recovery typecheck
pnpm --filter @aura3d/showcase-deep-recovery build
```
