# Orbital Defense

Aura3D ring-defense arena shooter, rebuilt on the `arena-shooter`
template scaffold. A single code path (`src/main.ts`) boots at every URL;
the former legacy/v2 dispatcher is deleted.

- Gameplay: the interceptor rides a station ring around the defense-core
  planet and fires radially outward. Drones spawn in finite waves
  (3 waves) and converge on the core; each leak costs 10 of 100 core
  integrity. Integrity 0 loses, clearing the final wave wins, `R`
  resets. Mounted through `createGame` from `@aura3d/engine/game` with
  live HUD widgets (score, wave, core-integrity meter, objective).
- Rendering: typed Kenney Space Kit GLBs (CC0) — `ship` interceptor,
  `drone` enemy pool, `planet` core — in `src/aura-assets.ts` /
  `aura.assets.json`, GLBs in `public/aura-assets/`. Bolts, deck, ring
  ticks and starfield stay procedural, as in the template.
- Controls: A/D or arrows rotate on the ring, Space fires, Esc/P
  pauses, R resets. Deterministic openings for scripted play:
  `?scenario=low-integrity` (core at one leak from loss) and
  `?scenario=final-wave` (final wave, one drone). Evidence is published
  as `window.__aura3dGameSnapshot`.

Run `npm run dev` (vite, port 5189), `npm run build`, or `npm run preview`.
Specs in `tests/` run against the app-local `playwright.config.ts`.
