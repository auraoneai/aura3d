# Aura3D Animation Studio

Describe a scene in natural language → get a deterministic, rendered animated short. The Animation
Studio turns a text prompt into a data-driven **EpisodeDocument** (cast, set, dialogue, blocking,
camera) and renders it with a generic player — no per-scene code, no separate LLM, no API key.

It ships as the `animation-studio` starter template
(`npx create-aura3d@latest my-app --template animation-studio`) plus a web studio app
(`apps/animation-studio-web`).

---

## The core idea: the agent IS the director

Scene "intelligence" lives in a generated, validated **EpisodeDocument**, and the renderer is a
generic **player** of it (`scene-player.ts` has zero scene-specific constants). That single artifact
has two producers:

- **Generalization** — a deterministic **Director** (heuristics) generates the document from a prompt.
- **Authoring** — an **agent** (your own coding agent: Claude Code, Codex, Cursor, …) edits it through
  a validated **Scene-Tool CLI** (`animation-scene`).

There is **no bundled model and no API key**. The creator is already in a frontier coding agent —
*that agent is the director*. The studio's job is to give it a safe, validated tool surface + fast
previews, not to ship its own LLM. For coherent dialogue and staging, the agent writes the lines and
drives the commands (see the authored-scene pattern in `scripts/author-office-scene.ts`); the
heuristic Director produces a valid first draft the agent refines.

> **Aura3D never does text-to-speech.** Renders are **silent by design**. The pipeline emits a timed
> dialogue / caption / viseme track — the contract that **AuraVoice** consumes to generate and mux the
> voice. See [`docs/api/auravoice-bridge.md`](../api/auravoice-bridge.md).

---

## Quickstart

```bash
# scaffold
npx create-aura3d@latest my-studio --template animation-studio
cd my-studio && pnpm install

# generate a scene from a prompt (the AI harness / CLI is the director — no LLM key)
pnpm scene new --prompt "two office workers arguing about a deadline" --full

# render it (preview = 480p/8fps fast; final = 1080p/24fps)
AURA_QUALITY=final pnpm episode:render-3d
# → dist/episodes/live-3d/episode-3d.webm  (SILENT — AuraVoice owns the voice track)
```

A prompt drives every part of the document: cast (parsed from the prompt nouns, bound to the curated
A-grade humanoid rigs), set (keyword-routed — `garage`/`office`/`kitchen` → distinct interiors,
`forest` → meadow, `space` → station, `moon`/`garden` → moon garden, else a neutral studio; **never a
moon-garden default**), dialogue (synthesized or, better, agent-authored), camera, and blocking.

---

## Documentation

| Doc | What's in it |
|---|---|
| **[quickstart.md](./quickstart.md)** | **Start here** — go from prompt → rendered clip → a small edit in ~5 minutes (CLI or the web Studio). |
| **[guide.md](./guide.md)** | The full reference — `animation-scene` CLI commands, the EpisodeDocument schema, how a prompt becomes a scene (the Director), the motion system, dialogue/subtitle timing, and rendering (quality tiers, styles, env vars, determinism). |
| **[studio-app.md](./studio-app.md)** | The web studio app — the 3-pane NLE shell (Outliner / Stage / Inspector / Timeline / Director Console), how it reads the working document and runs real Scene-Tool commands, and the dev API endpoints. |
| **[quality-and-limitations.md](./quality-and-limitations.md)** | The 10-gate quality suite (what each gate measures and when it fails), fidelity tiering (A/B/C), the no-fake-proof principle, and the **honest ceiling**. |

Related: [`docs/api/prompt-animation.md`](../api/prompt-animation.md) (prompt → animation playback),
[`docs/api/auravoice-bridge.md`](../api/auravoice-bridge.md) (the voice/timing handoff),
[`docs/api/assets.md`](../api/assets.md) (the character catalog reality).

---

## What it does today

**Real, render-verified:**
- Prompt → EpisodeDocument → rendered `.webm`, deterministically (same document → byte-identical frame).
- Prompt-specific cast/set/dialogue with no moon-garden default; distinct interiors per indoor prompt.
- A shared standard motion library (idle/talk/gesture/point/nod/walk/run/react) retargeted per
  character, with **velocity-gated locomotion** (legs cycle only while actually moving — no walking in
  place) and director acting rules (questions → react/nod, emphasis → gesture, movement → walk).
- Speech-duration-based caption timing (≈165 wpm + punctuation pauses) — no fixed-window subtitles.
- A 10-gate quality suite that fails on stiff/lip-only motion, lingering captions, moon fallback, mock
  UI, and hard-coded proof; plus a determinism gate and a clean-room packaging check.
- A working web studio whose Director Console runs real validated Scene-Tool commands and real renders.

**Scope & fidelity:**
- A clean, **stylized look** out of the box — the default cast are Aura3D-authored procedural humanoids
  (~37k tris, hands, face, textured), ideal for storyboards and animatics. For **photoreal characters**,
  bring your own rigged GLB with `cast add --file` and the pipeline renders, grades, and drives it.
- The **standard procedural motion library** is the stable default for every rig; richer catalog mocap is
  opt-in per rig (`AURA_EXTRACTED`) once it's validated against that rig.
- The director reliably stages a 1–2-character dialogue genre into a **valid, deterministic** scene; the
  most expressive results come when **you (or your coding agent) author the dialogue** — that's the design.

For the full engineering detail on the quality gates, fidelity grades, and trade-offs, see
[quality-and-limitations.md](./quality-and-limitations.md).
