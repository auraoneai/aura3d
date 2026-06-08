# Aura3D Animation Studio — Web Shell

The production 3-pane NLE web shell (PRD §7). Vite + React + TypeScript.

This is the **local studio control surface**. It hydrates from the REAL working
EpisodeDocument and drives the REAL agent-native Scene-Tool CLI + render pipeline
via a dev-only Vite middleware (see `vite.config.ts`). There is **no seed / mock /
fixture** — when no document has been authored the UI renders an honest empty state.

## Launch

```sh
cd apps/animation-studio-web
pnpm exec vite --port 5188 --host 127.0.0.1
```

`pnpm dev` is equivalent — the configured port is **5188** (`vite.config.ts`),
so `pnpm dev` and the command above open the same UI at:

> http://127.0.0.1:5188/

## Backend wiring (dev middleware → real systems)

| Route             | Method | Backs onto                                                        |
| ----------------- | ------ | ---------------------------------------------------------------- |
| `/api/document`   | GET    | the real working EpisodeDocument (`working.document.json`)       |
| `/api/history`    | GET    | the real command/result history (`working.history.json`)        |
| `/api/scene`      | POST   | runs the agent-native Scene-Tool CLI (`animation-scene.ts`)     |
| `/api/render`     | POST   | runs the render pipeline (`render-live.ts`); serves `/preview/*` |

Command mode in the Director Console runs raw scene-tool commands against the
working document; committed mutations bump the document revision hash, validator
rejections surface as red cards. The Render button calls `/api/render`.

## Verification (Phase G evidence)

Everything lives under `verify/`:

- `shoot.cjs` — screenshots all 7 surfaces (chromium, 1440×900) of the running app.
  Run with the dev server up: `node verify/shoot.cjs` (override with `URL=...`).
- `wiring.test.cjs` — tests the real `parseCliResult` (committed vs rejected) and
  `mapDocument` (sample EpisodeDocument → UI model). Run: `node --test verify/wiring.test.cjs`.
- `UI-READINESS.md` — per-surface design comparison + real-wiring evidence.
- `*.png` — the 7 committed surface screenshots.

## Build / typecheck

```sh
npx tsc --noEmit     # type check
npx vite build       # production build → dist/
```
