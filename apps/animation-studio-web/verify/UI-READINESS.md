# Animation Studio — UI Readiness Report (Phase G)

Generated against the **running production shell** (no seed) at
`http://127.0.0.1:5188/` — launched with
`pnpm exec vite --port 5188 --host 127.0.0.1`.
Screenshots: chromium, 1440×900, deviceScaleFactor 2 (`verify/shoot.cjs`).

Reference design: `docs/design/animation-studio/screenshots/`.

> **Honest framing.** The studio *chrome* (layout, panels, typography, controls,
> palette, console) matches the design 1:1. The *content* differs from the design
> mocks on purpose: the design screenshots were captured against the old seeded
> "Two Robots Argue" scene. The production shell now hydrates from the REAL working
> document, which is currently a skeleton (3 shots, 1 set, 1 prop, **0 cast / 0
> dialogue** — see `/api/document` below). So empty Cast / Dialogue / render-frame
> regions are *correct* real-data states, not UI regressions.

## G1 — Per-surface comparison

| Surface           | Screenshot                  | Matches design? | Delta (honest) |
| ----------------- | --------------------------- | --------------- | -------------- |
| Full shell        | `full-shell.png`            | Yes (chrome)    | Identical 3-pane NLE layout, topbar (Render/Wireframe/Storyboard, Share, Render), avatars. Content reflects the real skeleton doc ("Scene", 3 shots, 0 cast, 1 set, 1 prop) vs the design's authored seed scene → real-data difference, not a layout delta. |
| Stage viewport    | `stage-viewport.png`        | Yes             | Real empty state: "No render yet — Hit Render to preview this shot, or run `new --prompt`". Real shot HUD (SHOT 1/3 Establishing · establishing · 1920×1080 24fps) + transport with real shot markers. Design showed a rendered frame because the seed had a poster; no leaked frame here (correct). |
| Outliner          | `outliner.png`              | Yes             | Search box + Shots(3: Establishing/Two-shot/Medium) + Cast(0, with add affordance) + Sets(1: Scene — Set) + Props(1: Crystal). All from the real doc. Cast empty = real state. |
| Inspector         | `inspector.png`             | Yes             | Selected shot's real fields: SHOT 01 · Establishing · DURATION 20s · LENS establishing · IN 0:00 / OUT 0:20 · Framing. Matches design inspector layout. |
| Timeline          | `timeline.png`              | Yes             | Real tracks: Shots (Establishing/Two-shot/Medium) + Camera (per-shot spans) populated; Dialogue + FX empty because the real doc has none. Ruler, playhead, zoom (1.0×) all present. |
| Director console  | `director-console.png`      | Yes             | Header (aura-agent · scene-tool v8 · live), suggestion chips, Prompt/Command toggle, composer with tools + Render shot/send. Transcript empty because real history is empty (no commands run yet) — correct. |
| Command palette   | `command-palette.png`       | Yes             | ⌘K overlay with Actions (Render full sequence / current shot, View Render/Wireframe/Storyboard) + "Go to shot" listing the real shot ids (Establishing 0:00, Two-shot 0:20). Matches design palette. |

**G1 conclusion:** all 7 surfaces match the design *chrome*. The only deltas are
real-data states (empty cast/dialogue, empty console transcript, no-render stage)
that are the expected, honest consequence of removing the seed.

## G2 — Real-wiring evidence

All commands issued against the live dev server on :5188.

**1. No `window.STUDIO` / seed in production source**
```
$ grep -rniE "window\.STUDIO|import.*seed|from .*seed|moonGarden|fixture|mock" src/
src/state/mapDocument.ts: * There is NO seed / fixture: the only source of truth ...
src/state/types.ts:       * There is no seed / fixture — when no document exists ...
```
Only doc-comments stating there is none. No `seed.ts` file exists.

**2. `/api/document` returns a real EpisodeDocument** (excerpt — full payload is a
real runtime doc with set/environment/pieces, not a fixture):
```json
{
 "id": "scene",
 "duration": 60,
 "assets": {
  "characters": [],
  "props": [{ "id": "crystal", "url": "/aura-assets/crystal.catalog.glb", "attribution": "placeholder: glowing crystal" }]
 },
 "set": { "clearColor": [0.01,0.012,0.03,1], "studioLightingScale": 0.35, "environment": { ... }, "pieces": [ ... ] },
 "shots": [
  { "shotId": "shot-1", "presetId": "establishing", "startTime": 0,  "endTime": 20 },
  { "shotId": "shot-2", "presetId": "two-shot",      "startTime": 20, "endTime": 40 },
  { "shotId": "shot-3", "presetId": "medium",        "startTime": 40, "endTime": 60 }
 ],
 "dialogue": { ... }
}
```

**3. A committed command changes the doc hash + writes a card**
```
POST /api/scene { "command": "show" }                              → ok:true  rejected:false  hash: d2a  (read-only, no mutation)
POST /api/scene { "command": "camera --shot shot-1 --preset close-up" }
                                                                   → ok:true  rejected:false  hash: 995  output: "ok (warnings: 1)"
GET  /api/document → shots[shot-1].presetId == "close-up"          (mutation persisted to the real doc)
GET  /api/history  → 1 entry                                       (committed card recorded)
```
Hash moved `d2a → 995` only on the mutating command; the read-only `show` left it
unchanged — proving the hash tracks the real document content.

**4. A rejected command → red card**
```
POST /api/scene { "command": "camera" }
  → ok:false  rejected:true  output: "usage: camera --shot <id> [--preset p] [--subject x,y,z]"
```
`parseCliResult` maps this to delete/error (`!`) diffs → the console renders it as a
red "rejected" card. The CLI exits non-zero before persisting, so the doc + history
are untouched (only committed mutations are recorded).

> The baseline doc was restored afterward (`animation-scene undo`) so the committed
> screenshots show the canonical skeleton (shot-1 back to `establishing`,
> history = 0). The mutation/rejection above were re-verified live.

**5. Render calls `/api/render`**
- `App.doRender` → `runRender()` → `POST /api/render { lowFi, range }`
  (`src/state/backend.ts`), wired from both the topbar Render button and the
  console `render` verb (`src/components/Console.tsx`). The dev middleware shells
  `animation-scene render` (`render-live.ts`) and serves output under `/preview/*`.

**6. Wiring unit tests** — `verify/wiring.test.cjs` (run against the REAL source
modules, transpiled with esbuild — no copies):
```
$ node --test verify/wiring.test.cjs
# tests 6  # pass 6  # fail 0
```
Covers: `parseCliResult` committed → `~` modify diffs; committed "ok"-only →
command fallback; rejected → `!` error diffs; multi-line REJECTED block → one diff
per reason; `mapDocument` sample EpisodeDocument → UI model (title/DUR/shots/who/
cast/props-dedupe/sets/beats/camera); empty doc → empty collections + derived DUR.

## G3 — Old-UI removal / clean launch

- No stale single-page scaffold: only the production `index.html` entry exists.
- No `src/state/seed.ts`; no mock state anywhere in `src/`.
- Stale mock-era screenshots removed from `verify/` (`build-*.png`, `studio-live.png`)
  and the superseded one-shot `production.cjs`. `verify/` now holds only the 7
  production surface PNGs + `shoot.cjs` + `wiring.test.cjs` + this report.
- Port aligned: `vite.config.ts` → `port: 5188`, so `pnpm dev` opens the same UI as
  the documented launch command. README created at `apps/animation-studio-web/README.md`.
- Committed screenshots present in `verify/`.

## Verify gates

```
npx tsc --noEmit      → no "error TS" lines (clean)
npx vite build        → ✓ built in ~340ms (dist/index.html + assets)
verify/*.png          → 7 surfaces present
node --test verify/wiring.test.cjs → 6/6 pass
GET /api/document     → real EpisodeDocument (above)
```
