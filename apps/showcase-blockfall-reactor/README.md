# Blockfall Reactor

Aura3D falling-block reactor well, rebuilt on the `falling-blocks-starter`
template scaffold. A single code path (`src/main.ts`) boots at every URL,
including `?scene=default`; the former legacy/v2 dispatcher is deleted.

- Gameplay: `game.fallingBlocks` kit (10 x 22 board, reactor gravity of one
  row per 150 kit frames, 24-frame lock delay) mounted through `createGame`
  from `@aura3d/engine/game`.
- Rendering: settled cells are one instanced mesh of the typed
  `quaterniusCubeCrate` GLB; the `quaterniusWallModular` panel frames the
  well. Typed assets live in `src/aura-assets.ts` / `aura.assets.json`, GLBs
  in `public/aura-assets/`.
- Controls: arrows/A-D move, W/Q rotate, Down soft-drop, Space hard-drop,
  C hold, R reset. Evidence is published as `window.__aura3dGameSnapshot`.

Run `npm run dev` (vite, port 5187), `npm run build`, or `npm run preview`.
Specs in `tests/` run against the app-local `playwright.config.ts`.
