# Rooftop Buckets

Aura3D five-heat rooftop shooting session, ported onto the salvaged
deterministic core in `src/gameplay/` (court spots, Rapier `hoop-sim`, rim
hoop modes, the pure five-heat `scoring` loop, solver-driven `shot` flight).
A single code path (`src/main.ts`) boots at every URL, including
`?scene=default`; the former legacy/v2 dispatcher is deleted. No basketball
kit is used or claimed.

- Gameplay: salvaged modules own every rule — `calculateLaunchVelocity`
  solves the arc from spot/power/pitch, Rapier owns flight, rim/board/
  defender contacts and the downward score sensor, and `recordShotOutcome`
  / `updateClocks` / `advanceHeat` run the five heats (open, three-spot,
  pressure, fire, gold-ball finale) with win/lose + reset.
- Rendering: `createGame` from `@aura3d/engine/game` with the golden-hour
  look; court, backboard, rim, ball, shooter and defender are the six typed
  assets in `src/aura-assets.ts` / `aura.assets.json`. The aim guide is the
  salvaged solver's own `predictFirstFlight`, dotted with the ball GLB.
- Controls: A/D change spot, W/S adjust arc, hold/release Space to charge
  and shoot, P pause, R reset. Evidence is published as
  `window.__aura3dGameSnapshot`.

Run `npm run dev` (vite, port 5189), `npm run build`, or `npm run preview`.
Specs in `tests/` run against the app-local `playwright.config.ts`. The
route stays a prototype: no public-showcase or visual-approval claim.
