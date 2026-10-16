# Bean Brawl Race — Aura3D 4.0.0 Obstacle Course Game

A Fall Guys / Stumble Guys-style 3D obstacle course race built on `@aura3d/engine` 4.0.0, `@aura3d/animation` 4.0.0, and 11 custom Meshy 3D GLB assets. Race the pink/coral **Hero Bean** against 3 animated AI rival beans (**Blaze Bean**, **Frost Bean**, **Volt Bean**) across a 4-stage, 56-meter obstacle gauntlet to claim the floating **Winner Crown**.

## Controls

- **W / A / S / D** or **Arrow Keys** — Move across the obstacle course
- **Shift** — Sprint (`Run` skeletal clip + camera FOV punch)
- **Space** — Jump over spinning sweeper bars (`Jump` skeletal clip)
- **R** — Reset the race, timer, checkpoints, and all 4 beans to the starting grid
- **T** — Toggle performance governor telemetry in the HUD

## 4-Stage Obstacle Gauntlet

1. **Stage 1: Sweeper Alley** (`z = 0–22m`) — Two counter-rotating `rotatingSweeper` beams spinning at different angular velocities. Jump (`Space`) to clear the bars; getting clipped knocks the bean back and triggers the `"Fall"` recovery animation.
2. **Stage 2: Turntable Crossing** (`z = 22–39m`) — Two `spinningTurntable` platforms that apply tangential lateral drift velocity, flanked by three `bouncePad` bumpers that launch beans skyward and forward.
3. **Stage 3: Pendulum Gauntlet** (`z = 39–51m`) — Two overhead `swingingPendulum` hammers oscillating out of phase across the narrow bridge.
4. **Stage 4: Crown Summit** (`z = 51–56m`) — Checkered `finishArch` framing the bobbing, rotating `winnerCrown`. Reaching the crown triggers `"Celebrate"` skeletal animation, victory SFX + particle juice, and locks in final placement (`1st/4`–`4th/4`).

## Admitted 3D Assets (`src/aura-assets.ts`)

All 11 scene models are typed GLBs admitted in `aura.assets.json` and `src/aura-assets.ts` (zero primitive box placeholders):

- `assets.heroBean`, `assets.rivalBean`, `assets.blueBean`, `assets.yellowBean` — 24-joint humanoid skeletons with 6 embedded clips (`"Idle"`, `"Walk"`, `"Run"`, `"Jump"`, `"Fall"`, `"Celebrate"`)
- `assets.obstacleCourse` — Modular Fall Guys-style obstacle course world deck
- `assets.rotatingSweeper` — Spinning padded sweeper bar hazard
- `assets.bouncePad` — Springy bumper bounce pads
- `assets.spinningTurntable` — Rotating turntable disk platforms
- `assets.swingingPendulum` — Overhead swinging hammer pendulums
- `assets.finishArch` — Checkered festival finish arch
- `assets.winnerCrown` — Floating golden winner crown

## Commands

```bash
npm install
npm run typecheck
npm run build
npm run dev
```
