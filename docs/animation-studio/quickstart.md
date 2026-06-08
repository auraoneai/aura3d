# Animation Studio — 5-Minute Quickstart

Turn a text prompt into a rendered animated short: your coding agent (Claude Code, Codex, …) is the director — **no separate LLM, no API key** — and renders are **silent by design** (AuraVoice owns the voice track).

For the full reference, see [`guide.md`](./guide.md).

## Setup (3 lines)

```sh
npx create-aura3d@latest my-studio --template animation-studio
cd my-studio
pnpm install
```

All commands below run from the new `my-studio` directory.

---

## Path A — the CLI (fastest)

**1. Generate** a complete scene (cast + dialogue + per-beat actions) from a prompt:

```sh
pnpm scene new --prompt "two robots fixing a car in a garage" --full
```

**2. Render** it. Preview is fast and low-fi; final is 1080p:

```sh
AURA_QUALITY=preview pnpm episode:render-3d      # fast iteration (480×270)
# or
AURA_QUALITY=final   pnpm episode:render-3d      # 1080p
```

Output video: `dist/episodes/scene/episode-3d.webm` (plus stills + `render-live-summary.json` in the same folder).

**3. Make a small edit, then re-render.** Every command edits the same working document and is validated before it commits:

```sh
pnpm scene shot retime --id shot-2 --duration 6                                  # change a shot's length
pnpm scene dialogue --line l6 --speaker robot-1 --text "Hand me the wrench."     # add a line (--end auto-computed)
pnpm scene cast add --id robot-1 --query "boxy robot"                            # swap a slot for a catalog rig
pnpm scene render                                                                # re-render
```

Useful: `pnpm scene show` (summary), `pnpm scene validate` (coherence check), `pnpm scene undo` (revert the last edit).

---

## Path B — the Studio app (visual)

**1. Launch** the web studio (from the monorepo root):

```sh
pnpm --filter @aura3d/animation-studio-web dev
```

Open **http://127.0.0.1:5188**.

**2.** It hydrates from the scene you generated in Path A. Hit **Render** to preview the clip on the Stage, and scrub the **Timeline**.

**3. Use the Director Console** at the bottom:

- **Command mode** runs a raw scene-tool command against the working document, e.g. `shot retime --id shot-2 --duration 6`. Committed edits bump the document; rejected edits surface as red cards.
- **Prompt mode** records your intent as a note for your coding agent to execute.
- The **Outliner "+"** adds a cast member (runs a real `cast add`).

---

## Editing your scene (both paths share one working document)

- The Studio and the CLI edit the **same** `dist/scene/working.document.json`. A change in one shows up in the other — generate in the CLI, refine in the app, render from either.
- For a **coherent story, YOU (or your coding agent) author the dialogue** — the `--full` generator writes functional placeholder lines, not watchable ones. Write real lines and the director stages the acting around them:

  ```sh
  pnpm scene dialogue --line l0 --speaker robot-1 --text "We are not shipping on Friday." --start 0.4
  pnpm scene dialogue --line l1 --speaker robot-2 --text "Yes we are. The login feature is done."
  pnpm scene retime          # re-sequence all lines back-to-back from t=0
  pnpm scene render
  ```

  The worked example is [`scripts/author-office-scene.ts`](../../packages/create-aura3d/templates/animation-studio/scripts/author-office-scene.ts): it takes a generated base, **replaces** the dialogue with a hand-written argument, then **re-directs** so the acting matches. That is the pattern an agent follows.

---

## Tips

- **Quality:** `AURA_QUALITY=preview` (fast) | `final` (1080p). **Style:** `AURA_RENDER_STYLE=toon` (default cel look) | `pbr` (realistic).
- **Renders are silent on purpose** — Aura3D emits the timed dialogue/caption track and AuraVoice adds the voice afterward, locked to the same timeline.
- **Be honest about scope:** this is stylized previz — great for storyboards and animatics, best at 1–2 characters of dialogue on a single set. Swap in a higher-fidelity rig anytime with `pnpm scene cast add --id <id> --file <model.glb>`.
