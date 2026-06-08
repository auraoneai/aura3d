# Aura3D Animation Studio — Web App

A dev-only, local **3-pane NLE control surface** for an Aura3D animation episode.
The studio hydrates from the **same working `EpisodeDocument` the Scene-Tool CLI
generates**, lets you run **real** Scene-Tool commands and **real** renders against
it, and shows the resulting low-fi preview in a video viewport.

Package: `@aura3d/animation-studio-web` (`apps/animation-studio-web/`). Vite +
React 18 + TypeScript.

> This is a **local studio control surface**, not the director. Your own coding
> agent (Claude Code / Codex) remains the director that authors the scene. The
> studio is a way to *see* and *poke at* the document the agent is building.

---

## Overview

The app is the production NLE shell from PRD §7. There is **no seed / mock /
fixture data** — when no document has been authored yet, every panel renders an
honest empty state ("No render yet", "Nothing selected", etc.). Everything it
shows comes from real, on-disk artifacts produced by the Aura3D animation
template's Scene-Tool CLI and render pipeline.

What it gives you:

- A live read-only view of the working `EpisodeDocument` (cast, sets, props, shots,
  beats, camera, gestures, FX, scene/character fidelity grades).
- A Stage viewport that plays the **real rendered preview** (`episode-3d.webm`)
  with transport, scrubbing, captions, title-safe guides, and fullscreen.
- A Director Console that runs **real** Scene-Tool commands (Command mode) or echoes
  directing intent for your agent (Prompt mode), and triggers **real** renders.
- A command palette (⌘K) to jump around the scene and fire commands.

---

## Launch

```sh
pnpm --filter @aura3d/animation-studio-web dev
# equivalently, from the app dir:
#   cd apps/animation-studio-web && pnpm exec vite
```

Then open:

> http://127.0.0.1:5188/

The host/port are pinned in `vite.config.ts` (`server: { host: "127.0.0.1",
port: 5188 }`), so `pnpm dev` always opens the same URL.

Other scripts: `pnpm --filter @aura3d/animation-studio-web build` (production
build → `dist/`), `... typecheck` (`tsc --noEmit`).

> The backend wiring described below is a **dev-server middleware** and runs only
> under `vite` (the middleware is `apply: "serve"`). A production `build` is a
> static shell with no live backend.

---

## Architecture

The React app is a pure view layer over a small dev-only Vite middleware
(`auraBackend()` in `vite.config.ts`). The middleware is the bridge between the
browser UI and the real Aura3D tooling on disk.

### It reads the same working document the CLI writes

The middleware is anchored to the **animation-studio template** in the monorepo:

- Working document: `packages/create-aura3d/templates/animation-studio/dist/scene/working.document.json`
- Command history: `.../dist/scene/working.history.json`
- Render output dir: `.../dist/episodes/scene/` (`frames/` + `episode-3d.webm`)

`GET /api/document` serves that `working.document.json` verbatim (or
`{ exists: false }` when it has not been authored yet). The UI hydrates from it on
mount and re-hydrates after every committed mutation and every render, so the
panels always reflect the live on-disk document.

### Real CLI-backed mutations

`POST /api/scene { command }` tokenizes the command line and shells the **real
agent-native Scene-Tool CLI**:

```
pnpm exec tsx --tsconfig tsconfig.base.json \
  packages/create-aura3d/templates/animation-studio/scripts/animation-scene.ts <args…>
```

run from the monorepo root (so it can import workspace packages). The CLI is a
**validated mutation**: on success it commits to `working.document.json` and prints
`ok` / diff lines; on a validator rejection it prints `REJECTED — …`. The response
returns `{ ok, output, rejected, ms, hash }`, where `hash` is a short content hash
of the resulting document (the "doc @ xxx" revision shown on a committed card).
Rejections surface in the Console as red "rejected" cards with the validator's
reasons.

### Real renders

`POST /api/render { lowFi?, range? }` shells the same CLI's `render` command
(low-fi by default — `AURA_LOW_FIDELITY=1` — with an optional `--range`). It
returns the produced `episode-3d.webm` + first-frame poster as `/preview/*` URLs.
`GET /api/render` returns the **existing** render (if any) without re-rendering, so
an already-rendered scene appears on the Stage immediately on page load instead of
"No render yet". `GET /preview/*` streams the rendered frames/webm from the render
output dir (with path-traversal protection).

---

## The five panels

The shell is composed in `src/App.tsx`: a Topbar across the top, then three columns
— Outliner + Inspector (left), Stage + Timeline (center), Director Console (right) —
plus the ⌘K command Palette overlay.

**Topbar** (`Topbar.tsx`) — brand, the scene title breadcrumb, a save-status dot
("All changes saved" / "Saving…" while a render is in flight), a view-mode toggle
(**Render / Wireframe / Storyboard**), and the **Render** button (renders the full
sequence). Dead decoration (history button, fake collaborator avatars, share) has
been removed; only wired controls remain.

### 1. Outliner (`Outliner.tsx`)

Collapsible **Shots / Cast / Sets / Props** groups with counts, per-row visibility
toggles, and selection. At the top, a scene-fidelity badge (A/B/C; grade-C is
labeled "Previz — preview-quality, not a finished render"). Cast rows carry a
provenance badge (fallback / catalog / uploaded) and a per-character fidelity tier.
The search box is a click target that opens the ⌘K palette. The Cast group's **"+"**
runs a **real** `cast add <name>` command (a unique default name, executed through
the same validated `/api/scene` path), which mutates the document and appends a
committed/rejected card.

### 2. Stage (`Stage.tsx`)

The viewport. In **Render** view it plays the real rendered `episode-3d.webm`; the
`<video>` element is the playback clock (its `onTimeUpdate` drives the playhead, and
scrub / shot-selection seeks the element). Includes a transport bar (prev/next
shot, play/pause, time readout, a scrub rail with per-shot marks, and a **CC**
caption toggle), title-safe **Guides**, and **Fullscreen**. HUD chips show the LIVE
"low-fi preview" tag, current shot index, camera/lens, and 1920×1080·24fps.

The system caption sits **below** the video frame (not over it) so it never overlaps
captions already burned into the rendered clip; it shows the live speaker + beat
progress. While a render runs, a progress-ring overlay is shown (eased toward ~92%,
since renders are not streamed, then snapped to 100% on completion).

- **Storyboard** view: a contact-sheet grid of all shot frames.
- **Wireframe** view: a CSS filter applied to the preview — see Honest notes.

### 3. Inspector (`Inspector.tsx`)

Read-only context for the current selection:

- **Shot**: hero frame, duration, lens, in/out, framing, cast-in-shot chips, and the
  **director beat plan** — each dialogue beat's line plus camera framing, speaker
  intent, and listener reaction.
- **Character**: avatar, kind, line count, shot appearances, accent color.
- **Set / Prop**: icon, type/meta.

It edits nothing — mutations happen through the Console / CLI.

### 4. Timeline (`Timeline.tsx`)

A multi-track timeline derived from the document: **Shots / Dialogue / Gestures /
Camera / FX**. Click a clip to seek (and select, for shot clips); a playhead tracks
the clock; zoom in/out (1×–4×) and a time ruler. Dialogue/camera/FX clips are tinted
by their character/accent color.

### 5. Director Console (`Console.tsx`)

The hero panel — a transcript plus a command composer with two modes:

- **Prompt** mode (plain English): does **not** mutate. It echoes your directing
  intent; your own coding agent reads it and runs the concrete Scene-Tool commands.
- **Command** mode (raw scene-tool): runs the command against the real CLI via
  `/api/scene` and renders a **committed** (with diff lines, run time, and the
  resulting `doc @ <hash>`) or **rejected** (with the validator's reasons) card.

The composer offers autocomplete from a Scene-Tool verb catalog (`set`, `cast add`,
`cast remove`, `shot add`, `shot retime`, `cam`, `light add`, `fx add`, `render`)
and quick suggestion chips. A `render` command (or the "Render shot" button)
short-circuits to the real render pipeline. The transcript also shows render cards
sourced from the real command/result history (`/api/history`).

### Command Palette (`Palette.tsx`)

⌘K opens a fuzzy command palette: jump to a shot/cast member, switch view mode,
render the full sequence or current shot, or run one of the canned Scene-Tool
commands (executed as real commands via the Console's `run(..., forceCommand)`).
Arrow keys navigate, Enter runs, Esc closes.

---

## API endpoints reference

All routes are served by the dev-server middleware (`vite.config.ts`) and exist only
under `vite` (dev), not in a production build.

| Method | Route             | Behavior |
| ------ | ----------------- | -------- |
| GET    | `/api/document`   | The working `EpisodeDocument` (`working.document.json`); `{ exists: false }` if none. |
| GET    | `/api/history`    | The command/result history array (`working.history.json`); `[]` if none. |
| POST   | `/api/scene`      | Runs the real Scene-Tool CLI as a validated mutation. Body `{ command }`. Returns `{ ok, output, rejected, ms, hash }`. |
| GET    | `/api/render`     | Returns the **existing** render without re-rendering: `{ ok, exists, video, poster, hash }`. |
| POST   | `/api/render`     | Renders the working doc (low-fi by default). Body `{ lowFi?, range? }`. Returns `{ ok, output, ms, video, poster, hash }`. |
| GET    | `/preview/*`      | Streams rendered frames + `episode-3d.webm` from the render output dir. |

---

## Honest notes

- **Dev-only control surface.** The backend is a Vite dev middleware (`apply:
  "serve"`); it does not exist in a production build, and the studio is not the
  director. Your coding agent authors the scene; the studio shows and pokes at the
  document it builds. Prompt mode deliberately does not mutate — it only echoes
  intent for the agent to act on.
- **Low-fi previews by default.** The Render button and `render` commands produce
  low-fidelity previews (`AURA_LOW_FIDELITY=1`) for a fast iteration loop. Render
  progress is **eased**, not measured — renders aren't streamed, so the ring
  approaches ~92% over time and snaps to 100% when the server returns.
- **Silent.** Aura3D renders carry **no audio** — AuraVoice owns voice. The Stage's
  `<video>` is muted; "captions" are the document's dialogue beats, not sound.
- **Wireframe is a preview filter, not real wireframe.** The "Wireframe" view mode
  applies a CSS color/contrast/invert filter to the rendered preview. It is **not** a
  true geometry wireframe — real wireframe rendering needs engine work.
- **The Inspector is read-only.** All scene changes go through the Console / Scene-Tool
  CLI (or the Outliner Cast "+", which runs a real `cast add`); selecting an entity
  never edits it.
