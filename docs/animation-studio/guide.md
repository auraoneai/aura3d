# Aura3D Animation Studio — Product Reference

This document describes the **implemented** Animation Studio that ships in the
`animation-studio` template (`packages/create-aura3d/templates/animation-studio/`).
Every feature below maps to real code; nothing here is aspirational.

---

## Overview

The Animation Studio turns a **text prompt** into a renderable 3D cartoon scene and
exports it as a silent video with timed dialogue/caption data.

The key architectural idea: **the studio has no LLM of its own.** The creator is
already inside a signed-in coding agent (Claude Code, Codex, …) — *that* agent is the
director. It reads the creator's natural language and drives the scene by running CLI
commands. There is no separate model and no API key. Every command edits a persisted
`EpisodeDocument` through validated **scene tools**, so the agent gets scene-authoring
powers, not arbitrary-code powers (see the header of
`scripts/animation-scene.ts`).

**Honest scope.** This is *assisted authoring within a constrained genre*: **1–2
characters, dialogue-driven, on a single walkable set.** The deterministic director
reliably stages conversation (characters at conversation distance facing each other,
establishing → two-shot → medium framing, the speaker emphasised, props scattered, a
world-state ramp). It does **not** handle action, crowds, complex choreography, or
non-dialogue beats — those remain the directing agent's job and are unproven. A scene
is always produced *valid*; "valid" is not the same as "well-directed" (see the scope
note in `src/director/director-heuristics.ts`).

Core source files:

- `scripts/animation-scene.ts` — the agent-native scene-tool CLI.
- `src/episode-document.ts` — the `EpisodeDocument` schema + deterministic sampling.
- `src/director/prompt-to-scene.ts`, `src/director/director-heuristics.ts` — prompt → scene.
- `src/animation-performance.ts` — the shared standard clip library + motion-source policy.
- `scripts/render-live.ts`, `src/render-modes.ts` — the headless render pipeline.
- `scripts/author-office-scene.ts` — the authored-dialogue pattern.

---

## Quickstart

The studio runs from the **monorepo root**. Inside the template the CLI is wired as the
`scene` npm script (`package.json`: `"scene": "tsx scripts/animation-scene.ts"`).
The examples below call `scripts/animation-scene.ts` directly.

A `new --prompt` scene with no `--full` is a **skeleton**: it picks a set, lays out
shots and a timeline, but the cast is **empty** — you author the cast, dialogue and
performance, then render.

```sh
# 1. Start a working scene from a prompt (skeleton: set + shots + timeline, EMPTY cast).
tsx scripts/animation-scene.ts new --prompt "two office workers argue about a deadline"

# 2. Resolve real characters from the catalog (the CLI suggests ids you can paste).
tsx scripts/animation-scene.ts cast add --id worker-1 --query "office worker in a shirt"
tsx scripts/animation-scene.ts cast add --id worker-2 --query "office worker with glasses"

# 3. Author the real dialogue (one line per command; --end is optional, see below).
tsx scripts/animation-scene.ts dialogue --line l0 --speaker worker-1 --text "We are not shipping on Friday." --start 0.4
tsx scripts/animation-scene.ts dialogue --line l1 --speaker worker-2 --text "Yes we are. The login feature is done." --start 4

# 4. (optional) Stage performance per beat: blocking, gestures, camera.
tsx scripts/animation-scene.ts block   --character worker-1 --shot shot-1 --to -1,0 --clip talk
tsx scripts/animation-scene.ts gesture --character worker-2 --shot shot-2 --clip point
tsx scripts/animation-scene.ts camera  --shot shot-3 --preset close-up

# 5. Check coherence, then render.
tsx scripts/animation-scene.ts validate
tsx scripts/animation-scene.ts render
```

If you want a **complete scene in one step** (cast + dialogue + per-beat actions all
derived from the prompt), add `--full`:

```sh
tsx scripts/animation-scene.ts new --prompt "a chef teaches a child to bake" --full
tsx scripts/animation-scene.ts render
```

A `--full` scene binds each prompt-derived character to a curated A-grade humanoid rig
so it renders immediately; you can swap any slot for a catalog or uploaded rig with
`cast add` afterward.

State is persisted between commands in `dist/scene/`:

- `dist/scene/working.document.json` — the current `EpisodeDocument`.
- `dist/scene/working.history.json` — the last 50 documents (powers `undo`).

---

## CLI command reference

All commands operate on the single working document in `dist/scene/`. Every edit is
**validated before it is committed**: the new document must pass
`validateEpisodeDocument` (including a clip-existence guardrail that checks scheduled
clips against each character's resolved clip list). A failing edit is **rejected** and
the working document is left unchanged.

### `new`

Start a working scene. A prompt is **required** (there is no default scene); the only
other path is cloning an explicit document with `--from`.

| Flag | Meaning |
|---|---|
| `--prompt "<scene>"` | Build a scene from text. Without `--full` this is an **empty-cast skeleton** (set + shots + timeline). |
| `--full` | Generate a **complete** scene (cast + dialogue + per-beat actions) via `generateSceneFromPrompt`. |
| `--characters a,b` | Override the suggested cast ids (skeleton path only). |
| `--from <doc.json>` | Clone an existing working document instead of generating one. |

The skeleton picks its **set from the prompt** (see *Set templates* below), generates a
3-beat storyboard and shots, but writes **no placeholder dialogue and no default cast** —
the directing agent resolves real characters with `cast add` first. After a skeleton or a
`--full` generation the command prints ready-to-run `cast add` / `dialogue` / `render`
commands.

### `show`

Print a one-line-per-fact summary of the working document (`summarizeDocument`):
id/duration, cast ids, shots with their time windows + camera presets, prop count, and
walkable bounds.

### `cast add`

Resolve a character and register it under `--id` (adds, or swaps an existing id).

```
cast add --id <id> (--query "..." | --file <path.glb>) [--scale s]
```

- `--query` — resolve from the hosted **catalog**; the member is recorded as
  `catalog-resolved`.
- `--file` — upload a local rigged **GLB**; recorded as `user-uploaded`.

Either source goes through the same resolver (grade + render-probe). The GLB's real clip
list is stored on the asset (`availableClips`) so later edits can verify scheduled clips
exist. Scale auto-fits to ~1.6m height unless `--scale` overrides it. A `fidelityGrade`
(A/B/C/D) is recorded when the resolver reports one.

### `prop add`

Resolve a prop from the catalog and register it under `--id`.

```
prop add --id <id> --query "..."
```

### `set`

Swap the set (and its walkable bounds) for a named template or a prompt-picked one.

```
set <studio|garage|office|kitchen|moon-garden|space-station|meadow>
set --query "..."
```

### `dress` / `clear-props`

Place and remove prop instances on the set.

```
dress --prop <id> --at x,z [--scale s] [--feet f]   # default scale 0.12, feet 2.8
clear-props [--prop <id>]                            # clear all, or just one prop id
```

### `block`

Set a character's mark (and optional facing/clip) for a shot.

```
block --character <id> --shot <id> --to x,z [--yaw r] [--clip name]
```

Writes a single waypoint at the given position; `--clip` must be one of the standard
performance intents (see *Motion system*).

### `gesture`

Assign a performance clip to a character within a shot.

```
gesture --character <id> --shot <id> --clip <name>
```

### `camera`

Set the camera for a shot.

```
camera --shot <id> [--preset establishing|two-shot|close-up] [--subject x,y,z]
```

### `scale`

Re-scale a character uniformly.

```
scale --character <id> --to <s>
```

### `shot add | remove | retime`

Manage shots. The timeline must stay contiguous from t=0 (the validator enforces it).

```
shot add    --id <id> [--preset p] [--duration s] [--subject x,y,z]   # default preset two-shot, duration 12
shot remove --id <id>
shot retime --id <id> --duration s
```

### `dialogue` / `retime`

Author or remove dialogue lines.

```
dialogue --line <id> --speaker <id> --text "..." --start s [--end s]
dialogue --remove --line <id>
retime
```

`--end` is **optional**: when omitted, the line's end time is auto-computed from the
speech duration of its text (see *Dialogue & subtitle timing*). `retime` re-sequences
**all** dialogue lines back-to-back from t=0 using the same speech-duration model.

### `undo`

Revert to the previous document from history.

### `validate`

Run the coherence validator and print `coherence: PASS|FAIL` with errors/warnings. Exit
code is non-zero on failure.

### `render`

Render the working document. Delegates to `scripts/render-live.ts` with
`AURA_DOCUMENT` pointed at the working document and output going to
`dist/episodes/scene/`.

```
render [--range a-b]      # e.g. --range 0-12 renders only the first 12 seconds
```

---

## EpisodeDocument schema

`src/episode-document.ts` defines the `EpisodeDocument` — the **data-driven contract**
that makes the renderer generic. Every scene-specific decision (blocking, camera, the
clip per shot, prop layout, world-state, even the primitive set + lights) is *data* in
this document. A generic player (`src/scene-player.ts`) reads the document and renders
it; the director generates documents from a prompt, and the same player plays them.

Top-level shape:

```ts
interface EpisodeDocument {
  id: string;
  duration: number;                 // seconds; must be > 0
  assets: { characters: CharacterAsset[]; props: PropAsset[] };
  set: SetSpec;
  walkableBounds?: { min: Vec3; max: Vec3 };
  shots: ShotSpec[];
  blocking: CharacterBlocking[];
  setDressing: PropPlacement[];
  worldState: WorldStateTrack;
  dialogue?: DialogueTrack;
}
```

### `assets`

- **`characters`** (`CharacterAsset`): `id`, GLB `url`, uniform `scale`, a `defaultClip`,
  an optional `availableClips` list (the GLB's real clips, used by the clip-existence
  guardrail), an optional `mouthMorphIndex` (the morph that drives mouth-open, `-1` when
  the GLB has no face morph), a `source` provenance tag
  (`catalog-resolved` / `user-uploaded` / `authored-default`), and an optional
  `fidelityGrade` (A/B/C/D). All members also carry CC-BY provenance
  (`attribution` / `license` / `sourceUrl` / `hash`).
- **`props`** (`PropAsset`): `id` and an *optional* `url`. A prompt-derived object with no
  catalog match is still recorded (so the prompt provably influenced the document) but its
  `url` is omitted; the renderer **skips** it rather than 404-ing on a fictional GLB
  (procedural dressing covers the space).

### `set`

`SetSpec` describes the stage as data: a `clearColor`, a studio-lighting scale,
an `environment` (ambient + a procedural sky/horizon/ground map, with an optional baked
equirectangular **HDRI** for real image-based lighting in PBR mode), an array of
primitive **`pieces`** (`cube`/`sphere`/`cylinder` with color/metallic/roughness/emissive,
an optional dim→full `glow`, etc.), and an array of point **`lights`**. Two opt-in
high-fidelity toggles exist and default **off**: `inShaderCel` (use the engine's real
GPU toon material on non-glow pieces) and `realShadows` (shadow maps instead of cheap
contact-shadow blobs).

### `shots`

`ShotSpec[]`: each shot has a `shotId`, a `presetId` (camera preset), a `startTime`/
`endTime` window, and a `cameraSubject` world point to frame. The validator requires
shots to start at t=0 and tile the timeline contiguously (no gaps/overlaps).

### `blocking`

`CharacterBlocking[]` — per character, per shot. Each `ShotBlocking` names the `clip` to
play for that beat and carries one or more `BlockingWaypoint`s (`time` / `position` /
`yaw`). The player lerps position and yaw across the waypoints within the shot window;
a single waypoint holds a static mark.

### `setDressing`

`PropPlacement[]` — instances of registered props placed on the set, each with a
`position`, `scale`, and a `feetOffset` (so the prop sits on the ground at y=0).

### `worldState`

`WorldStateTrack` — currently a single `glowSpanSeconds`, the time over which glow pieces
ramp dim→full (the "dim→sparkle" world-state arc), eased with a smoothstep.

### `dialogue`

`DialogueTrack` — the script, and the **AuraVoice contract**, carried *inside* the
document so a generated/edited scene owns its own captions and lip-sync. Each
`DialogueLine` has a `lineId`, `speakerId`, `text`, and a `startTime`/`endTime` window.

### Deterministic sampling

The document exposes pure sampling functions the player calls: `shotAtTime`,
`sampleBlocking` (position/yaw/clip, with **velocity-gated** `moving` — see below),
`sampleWorldStateGlow`, `sampleCaption`, and `sampleVisemeOpenness` (an engine-side
mouth-open driver for rigs with a morph; the full per-phoneme viseme track is
AuraVoice's). Because all sampling is deterministic, the same document always yields the
same frames.

---

## How a prompt becomes a scene (the director)

The director is **deterministic** — no LLM, no randomness beyond a seeded prop scatter.
Two layers turn a prompt into a document:

### Set selection — `pickSetForPrompt`

The set is chosen by keyword overlap against the templates in `src/set-templates.ts`:

| Template | Example keywords |
|---|---|
| `studio` *(neutral fallback)* | indoor, interior, room, studio, lab, warehouse, house |
| `garage` | garage, workshop, car, mechanic, tools, repair |
| `office` | office, desk, cubicle, meeting, computer, monitor |
| `kitchen` | kitchen, cook, diner, cafe, chef, stove |
| `moon-garden` | moon, garden, night, bedtime, glow |
| `space-station` | space, station, spaceship, astronaut, orbit |
| `meadow` | meadow, field, sunny, grass, park, forest |

When nothing matches, the fallback is the **neutral studio** — never the Moon Garden.
Moon Garden only wins when the prompt explicitly mentions moon/garden/night/etc.

### Cast parsing — `parseCast`

1. **Proper names** win: `"Miko and Luma argue"` → `miko`, `luma`.
2. Else **nouns introduced by an article or "and"** (`"a fox and a bear"` → `fox`,
   `bear`), excluding **location words** (the set keywords plus generic place words like
   forest/room/floor) so a location is never parsed as a character.
3. Else a **plural acting noun** (`"two robots argue"` → `robot-1`, `robot-2`).
4. Else a singular noun, else a single generic `hero`.

Up to 3 cast ids are returned. (`scripts/animation-scene.ts` has its own lighter
`suggestCastIds` for the skeleton path, which only *suggests* `cast add` targets.)

### Dialogue: synthesized vs authored

- **Synthesized** (`--full` / `generateSceneFromPrompt`): `inferIntent` reads the prompt
  verbs into one of `argument` / `question` / `teaching` / `task` / `greeting`, then
  `synthesizeDialogue` produces ~6 alternating lines woven around the prompt's topic
  noun. These lines are deliberately written to exercise the acting rules (a question, an
  emphatic line, a negation, a movement verb). They are **functional placeholders that
  prove the generation contract** — not "watchable" dialogue.
- **Authored** (the intended production path): the AI harness writes a coherent exchange
  and the CLI/director stages it. `scripts/author-office-scene.ts` is the worked example —
  it takes a `generateSceneFromPrompt` base for cast/set/shots, **replaces** the
  dialogue with a hand-written argument about a release deadline, then **re-directs** so
  the acting matches the authored lines. This is the pattern an agent follows with
  `dialogue` commands.

### Director acting rules (per beat)

`directBeats` turns each dialogue line into an inspectable `DirectorBeat` (speaker,
listener, intent, camera, duration). The intent rules:

- **Movement verb** (walk/go/run/cross/come/move/…) → `walk` (or `run` for run/running);
  locomotion wins — you can't argue mid-stride.
- **Emphasis** (a `!` or an ALL-CAPS word) → a rotated gesture (`gesture` → `point` → `nod`).
- **Question** (`?`) → the speaker `talk`s; the **listener** `nod`s.
- **Disagreement** (negation words) or emphasis → the listener `react`s.
- **Plain lines** → mostly `talk`, but every 3rd plain beat is upgraded to a rotated
  gesture so a speaker is never all-talk; the listener alternates nod ↔ react so a
  non-speaker is never frozen.

`directScene` then stages the geometry: cast on marks at conversation distance facing
center, cameras cycling **establishing → medium → medium** (the tight close-up is
deliberately avoided for face-offs because its fixed offset can frame a character's
side/back), a seeded prop scatter over the walkable bounds, and `glowSpanSeconds` set to
the scene duration.

### Velocity-gated locomotion

Walking is gated by **speed, not displacement**. In both `directScene` and
`sampleBlocking`, a character only plays a walk cycle when it actually translates at
≥ ~0.35 m/s. A small drift over a long shot (e.g. 0.7m across 8s ≈ 0.09 m/s) reads as
standing, so the character **holds its mark and performs** instead of "walking in place
while standing still." `resolveIntent` in `animation-performance.ts` enforces the same
rule at playback: a `walk`/`run` clip name is ignored once the character has stopped.

### Rig-grade-aware intents — `gradeAwareIntent`

When a per-character rig grade is supplied, the director honestly downgrades intents the
rig can't physically perform:

- **A / B** (full body) — no restriction.
- **C** (mascot / sparse: head + torso, no real limbs) — limb gestures (`gesture`/`point`)
  become `nod`; locomotion (`walk`/`run`) becomes a hold; head/torso intents pass through.
- **D** (no usable skeleton) — talk-only/minimal; any body-acting intent collapses to a
  static hold.

With no grade supplied this is a no-op, so an ungraded pipeline is unaffected.

### The acting gate — `validateDirectedActing`

This gate is **enforced inside `generateSceneFromPrompt`** (not just unit-tested). A
directed scene is **blocked at generation time** if it is degenerate:

- `ALL_LOW_MOTION` — every beat is only idle/talk.
- `STATIC_CHARACTER` — a character never gets a non-idle intent.
- `NO_GESTURE` — no speaker ever gestures/points/nods.
- `NO_REACTION` — no listener ever reacts.

For a **solo cast** the `NO_REACTION` and `STATIC_CHARACTER` codes are dropped (there is
no second party to react to), but the real degeneracy checks (`ALL_LOW_MOTION` /
`NO_GESTURE`) still apply to every scene. A genuinely dead scene throws rather than
silently producing a frozen document.

---

## Motion system

`src/animation-performance.ts` drives every character GLB from a **shared, rig-neutral
standard clip library** (`@aura3d/animation`). There are **8 standard performance
intents**:

```
idle · talk · gesture · point · nod · walk · run · react
```

(`gesture` / `point` / `nod` / `react` are one-shots that auto-return to idle; the rest
loop.) The director only ever writes one of these intents into a beat's `clip`, never a
fictional asset-specific name.

For each character the rig is **inferred from its GLB node names** and a humanoid
**retargeting map** is built from the standard library rig onto it. Each frame:

```
beat intent → performance state graph → sample standard library clip (rig-neutral pose)
            → retargetHumanoidPose(pose, map) → actor.applyRetargetedPose(pose)
```

A GLB that ships **two or more distinct non-idle embedded clips** is treated as "rich"
and its embedded clip is preferred for matching intents; sparse rigs always get
retargeted library motion.

### Motion-source policy — procedural is the default

This is documented honestly because it is a real engineering constraint. The library can
load **extracted catalog mocap** clips (`public/clip-library/<intent>.json`), but the
**default is the procedural baseline**, controlled by `AURA_EXTRACTED`:

- `AURA_EXTRACTED=off` *(default)* — pure procedural standard clips. Render-verified
  clean: natural standing, normal arm length, intact legs.
- `AURA_EXTRACTED=upper-body` — extracted upper body + stripped legs. **Validation only.**
- `AURA_EXTRACTED=full` — keep leg tracks too. **Validation only.**

The reason procedural is the default: the extracted mocap **distorts the real 21-joint
character rig** — with legs it collapses them; even upper-body-only it stretches the arms
to the floor and compresses the lower body. Both failures were caught only in a real
render (FK overlays + numeric checks passed). So procedural — proven to render clean — is
the shipped default, and extracted is opt-in for future per-rig validation. Even when
extracted is enabled, locomotion (`walk`/`run`) keeps its procedural leg cycle, and a
sanity gate rejects any extracted clip with un-normalized root motion or a baked rest
offset, falling back to procedural for that intent.

The render emits a per-character/per-beat **clip-decision log** (which intent, which clip
id, the motion source, how many body bones moved, max rotation/translation amplitude,
whether the pose reached the real GLB skeleton) into `render-live-summary.json`, so a
downstream gate can prove the body actually moves (independent of the mouth morph).

---

## Dialogue & subtitle timing

Captions show **only while a line would actually be spoken** — there are no fixed caption
windows. The duration is **estimated from the text** by `estimateSpeechDuration`
(`src/episode-document.ts`):

```
seconds = words / 165 wpm (→ seconds)
        + 0.25s per soft pause  (, ; :)
        + 0.40s per hard pause  (. ! ?)
        clamped to [0.9s floor, 22s cap]
```

`SPEECH_WPM = 165` is a natural mid conversational pace. The model is deterministic and
monotonic in word count (more words never shortens the estimate). It drives three things
consistently:

1. **Caption windows** — `dialogue --line ... --start s` with no `--end` auto-computes the
   end from the spoken duration of the text.
2. **Document retiming** — `retime` re-sequences all lines back-to-back from t=0 using the
   same model.
3. **Viseme cadence** — the mouth-open driver pulses while a line is on screen.

The director shares the same model (`DirectorSceneInput.durationEstimator`), so beat
durations and caption windows agree.

---

## Rendering

Rendering is performed by `scripts/render-live.ts`: it serves the live 3D route in a real
Vite dev server, drives it with Playwright (Chromium / WebGL2), seeks the timeline frame
by frame (posing the skinned GLB skeletons), reads the canvas back as real RGBA pixels,
applies the toon treatment, burns in captions, and encodes a real `episode-3d.webm`
(VP9). Every stage touches real bytes.

### Quality tiers — `AURA_QUALITY`

| Tier | Resolution | FPS | Notes |
|---|---|---|---|
| `preview` *(default)* | 480×270 | 8 | low-fi, cheaper CPU post-pass, 1:1 capture — fast iteration |
| `final` | 1920×1080 | 24 | full post-pass, 2× device-scale supersampling for anti-aliasing |

`AURA_LOW_FIDELITY=1` is a back-compat alias that forces the `preview` tier.

### Render styles & modes

- **`AURA_RENDER_STYLE`** (`src/render-modes.ts`): `toon` *(default)* — cel look — or
  `pbr` — realistic shading. The cel treatment (both the GPU in-shader toon material and
  the CPU toon post-pass) only applies in **toon mode + toon style**.
- **`AURA_RENDER_MODE`**: `toon` *(default)* / `wireframe` / `storyboard`. The requested
  mode is **verified** — an unknown/typo'd value throws rather than silently rendering
  the wrong view (no dead flags). **Caveat:** the `wireframe` *render mode* is validated
  but the geometry wireframe is **not drawn** by this pipeline — the studio's Wireframe
  view is a preview filter, not a render-time wireframe.

Two distinct cel mechanisms are deliberately kept separate (documented verbatim by
`renderModeNotes`): the **GPU in-shader cel** (the engine's `AnimationToonMaterial`,
banded N·L + Fresnel rim on non-glow set pieces, applied before pixel read-back) and the
**CPU toon post-pass** (`applyToonTreatment` — luma quantize + Sobel ink + grade on the
captured pixels). They are never described as the same thing.

### Environment variables

| Var | Effect |
|---|---|
| `AURA_QUALITY` | `preview` (default) / `final` |
| `AURA_LOW_FIDELITY=1` | alias forcing `preview` |
| `AURA_RENDER_STYLE` | `toon` (default) / `pbr` |
| `AURA_RENDER_MODE` | `toon` (default) / `wireframe` / `storyboard` |
| `AURA_DOCUMENT` | path to the `EpisodeDocument` to render (else an empty placeholder) |
| `AURA_OUTPUT_DIR` | output directory (the `render` command sets `dist/episodes/scene`) |
| `AURA_PREVIEW_RANGE` | render only a time window, e.g. `0-12` (set by `render --range`) |
| `AURA_EXTRACTED` | motion source: `off` (default) / `upper-body` / `full` |
| `AURA_DEBUG_OVERLAY=1` | paint a per-character clip/intent overlay into the proof DOM (surfaced to the route as `VITE_AURA_DEBUG_OVERLAY`) |

Outputs land in the output dir: the 4 named fidelity stills
(`frames/first.png`, `dialogue.png`, `action.png`, `final.png`), an isolated lip-sync A/B
pair (`mouth-open.png` / `mouth-closed.png`), per-character skeleton-overlay strips, the
`episode-3d.webm` video, and `render-live-summary.json`.

### Determinism

The same document renders to **byte-identical frames** every time: all document sampling
is deterministic, the prop scatter is seeded by scene id, HMR is disabled during capture,
and the frame times are fixed fractions of the episode duration. (`scripts/determinism-check.ts`
exercises this; the `scene:determinism` npm script runs it.)

### The AuraVoice boundary — silent by design

**Aura3D never does TTS.** The rendered video is **silent on purpose**. Aura3D owns no
audio: no narration, no ambient bed, no audio mux. Instead it emits the **timed
dialogue/caption/viseme track** — the synchronization contract — for **AuraVoice** to
consume. AuraVoice generates the voice *after the fact*, locked to this same timeline,
and muxes the audio onto the video. The render summary records this handoff explicitly
(`audioOwnedBy: "auravoice"`, `engineTts: false`, plus the dialogue line / caption cue
counts and the bridge-package pointer). The animation and lip-sync timing are derived
from the **same** dialogue track, so the later-generated voice lines up.
