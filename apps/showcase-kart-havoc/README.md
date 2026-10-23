# Kart Havoc — Desert Canyon Item Racing (`@aura3d/engine` 4.0.8)

Mario Kart-inspired desert canyon item karting game built on the public `@aura3d/engine` 4.0.8 and `@aura3d/engine/game` APIs.

Status: source-level playable prototype (`prototype` claim label) under the `golden-hour` look preset.

## Admitted Meshy 3D Assets (12/12)

All 12 models are defined in [`src/aura-assets.ts`](./src/aura-assets.ts) and placed at normalized real-world scale in [`src/main.ts`](./src/main.ts) with zero primitive stand-ins:

- `assets.heroKart` — Player-controlled red/orange hero go-kart with helmeted driver
- `assets.rivalKart` — Blue Viper AI rival go-kart
- `assets.purpleKart` — Phantom Apex AI rival go-kart
- `assets.yellowKart` — Solar Wasp AI rival go-kart
- `assets.canyonTrack` — Desert canyon asphalt circuit world
- `assets.checkpointArch` — 6 race gate arches along the 3-lap circuit
- `assets.itemCrate` — 6 rotating/bobbing mystery item boxes
- `assets.tireStack` — 6 red/white chicane & apex tire barrier stacks
- `assets.oilBarrel` — Trackside hairpin oil hazards & deployable oil-slick traps
- `assets.boostCanister` — Trackside nitro canisters & launched homing projectiles
- `assets.desertMesa` — Monumental red rock mesas framing the canyon horizon
- `assets.canyonCactus` — Stylized desert saguaro cacti lining the trackside

## Gameplay & Controls

- **Throttle / Brake:** `W` / `S` or `ArrowUp` / `ArrowDown`
- **Steer:** `A` / `D` or `ArrowLeft` / `ArrowRight`
- **Drift & Mini-Turbo:** Hold `Space` through corners to build drift charge (`0–100%`), then release for a mini-turbo exit boost
- **Mario Kart Item System (`E` / `Enter` or `Shift`):**
  - **Turbo Canister:** Instant canyon speed surge + boost juice
  - **Homing Canister:** Launches a visible `boostCanister` 3D projectile that homes in on the nearest rival ahead and spins them out
  - **Oil Barrel Trap:** Drops a visible `oilBarrel` hazard on the racing line behind the player that spins out rival karts
- **Reset (`R`):** Restores lap, checkpoints, standings, item inventory, active projectiles, AI progress, and events to baseline

## Typography & Dense Telemetry UI

- Self-hosted AuraOne font stack in `/fonts/fonts.css` (`Whitney` 400/500/600, `DIN Pro` 400/500 with `tabular-nums`, `Monument Grotesk Mono` 400).
- Styled in the **Aurora Noir / Midnight Slate** dense telemetry theme (`13px` body, `12px` small-caps metadata floor, `17px` Semibold title only, zero bold `700` weights).
