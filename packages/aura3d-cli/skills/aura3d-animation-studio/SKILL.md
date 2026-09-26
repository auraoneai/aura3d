---
name: aura3d-animation-studio
description: Directs an Animation Studio episode end to end: previs, prompt-to-EpisodeDocument, cast and set binding, blocking, camera, timed dialogue, validation, and a silent render handed to AuraVoice. Use when working in the `animation-studio` template, running `aura3d animation scene <verb>` or `pnpm scene`, editing `dist/scene/working.document.json`, or producing, rendering, or publishing an animated episode.
---

# Aura3D Animation Studio (director loop)

You are the director. There is no separate model or API key: every Scene-Tool
verb edits one `EpisodeDocument` at `dist/scene/working.document.json` through
validated scene tools and is rejected if it would break the scene. Shared rules
(claim labels, forbidden patterns, typed assets, benchmark mode) are in
[../aura3d-core/references/boundaries.md](../aura3d-core/references/boundaries.md).

## Establish the contract

1. Run `npx @aura3d/cli@latest --help` and confirm the `animation scene` line.
   `aura3d animation scene <verb> ...` only forwards to the template's `scene`
   npm script, so run it from the `animation-studio` project directory. Inside
   the monorepo, `pnpm scene <verb>` in the template directory is equivalent.
2. Run `npx @aura3d/cli@latest animation scene show --dry-run` to see the
   delegated script, runner, and cwd before editing anything.
3. Read `src/aura-assets.ts` and `aura.assets.json`. Cast and prop GLBs you
   bring yourself must be typed assets first (load `aura3d-assets`).
4. Know where rendering works. The live renderer needs the Aura3D monorepo root
   (it resolves the source build and runs headless Chromium plus ffmpeg).
   Authoring and `validate` work in any scaffold; `render` does not.
5. Benchmark mode: `npm install && npm run build`, then stop. No `render`, no
   gate suite, no screenshots.

## Procedure

Previs (before any blocking):

1. Write four one-line directions (A/B/C/D) that differ in tone, set, or
   staging. Pick one and record why.
2. Write a one-line beat sheet: one beat per planned shot, each with who acts
   and what changes on screen.
3. Lock the cast: a stable id per character (for example `worker-1`) that
   every later command reuses. Do not rename ids after blocking starts.

Author the document:

4. Start from the prompt. `aura3d animation scene new --prompt "..." --full`
   produces a complete draft (cast, dialogue, camera, per-beat actions). Omit
   `--full` for an empty-cast skeleton you populate. `new` with no prompt is an
   error; there is no default scene. Clone with `new --from <doc.json>`.
5. Bind the cast. `--full` binds the curated A-grade humanoid cast, never the
   Moon Garden characters. Override a slot from the catalog or a local rig,
   and adjust size:

   ```sh
   aura3d animation scene cast add --id worker-1 --query "office worker in a shirt"
   aura3d animation scene cast add --id worker-2 --file ./assets/hero.glb
   aura3d animation scene scale --character worker-2 --to 1.1
   ```
6. Pick the set. The prompt routes through `pickSetForPrompt`; override with
   `set <studio|garage|office|kitchen|moon-garden|space-station|meadow>` or
   `set --query "..."`. Moon Garden is never the fallback; the neutral
   `studio` is. Dress it with `dress --prop <id> --at x,z`, swap a prop for a
   real GLB with `prop add --id <id> --query "..."`, and use `clear-props`.
7. Stage each beat, then add or change shots. Every character needs its own
   motion per beat; a lone lip flap is not a performance.

   ```sh
   aura3d animation scene block --character worker-1 --shot shot-1 --to -1,0 --yaw 0.4 --clip talk
   aura3d animation scene gesture --character worker-2 --shot shot-2 --clip point
   aura3d animation scene camera --shot shot-3 --preset close-up
   aura3d animation scene shot add --id shot-4 --preset two-shot --duration 6
   ```

   Camera presets are `establishing`, `two-shot`, and `close-up`.
8. Write dialogue yourself, one line per command:
   `aura3d animation scene dialogue --line l0 --speaker worker-1 --text "We ship Friday." --start 0.4`.
   `--end` is optional and computed from speech duration. Remove a line with
   `dialogue --remove --line <id>`. Run `retime` to re-sequence all lines
   back to back. This single track is the subtitles and the AuraVoice
   lip-sync contract.
9. `show` to read the summary, `undo` to step back (50 documents of history),
   then `validate`. It must print `coherence: PASS` before you render.

Render and hand off:

10. From the monorepo template directory, preview a window, then render final
    (`AURA_RENDER_STYLE=pbr` for realistic shading):

    ```sh
    aura3d animation scene render --range 0-12
    AURA_QUALITY=final AURA_RENDER_STYLE=toon aura3d animation scene render
    ```

    Run final renders on a remote worker or CI where possible; they launch
    Chromium and encode VP9.
11. Outputs land in `dist/episodes/scene/`: `episode-3d.webm`, the stills
    `frames/first.png`, `dialogue.png`, `action.png`, `final.png`, the
    `mouth-open.png` / `mouth-closed.png` pair, skeleton-overlay strips, and
    `render-live-summary.json`.
12. The video is silent by design. Aura3D never runs TTS or muxes audio.
    Confirm the summary records `audioOwnedBy: "auravoice"`, `engineTts: false`,
    and non-zero dialogue line and caption cue counts. AuraVoice generates the
    voice from the same dialogue track afterward.
13. Captions: author them only as dialogue lines. Never add caption text as
    scene geometry, labels, or DOM. The renderer derives burned-in captions
    for the exported video from the dialogue track; the fidelity stills and
    mouth pair are captured without captions.
14. Run the gate suite against this render from the monorepo root:

    ```sh
    pnpm exec tsx --tsconfig tsconfig.base.json tools/animation-studio-gate-suite/index.ts \
      --summary packages/create-aura3d/templates/animation-studio/dist/episodes/scene/render-live-summary.json \
      --out tests/reports/animation-studio/gate-suite.json
    ```

    It is the AND of body-motion, lip-sync timing, subtitle timing, prompt
    specificity, motion and visual quality, performance budget, readiness,
    and no-fake-proof gates. Also run `pnpm scene:determinism`.
15. Publish checklist, every item with an artifact: real route playback,
    independently moving characters, visible mouth motion during dialogue,
    exported captions from the dialogue track, a passing gate suite, and
    review artifacts. Hand the claim label decision to
    `aura3d-evidence-review`.

## Stop and report

- `validate` fails and a scene-tool edit cannot fix it: stop and report the
  errors verbatim. Do not hand-edit `working.document.json` to force a pass.
- No A-grade or catalog rig binds for a cast slot: report the slot and the
  rejected candidates. Do not substitute the Moon Garden cast, a still image,
  or a primitive stand-in.
- You are outside the monorepo, or no remote worker is available, so `render`
  cannot run: stop after `validate`, label the episode `prototype`, and list
  the render and gate commands still owed.
- Any gate in the suite fails, or evidence is missing (the suite fails
  closed): label the episode `prototype` and name the failing gate.
- Someone needs a caption-free video master: there is no render flag for it
  today. Report it as a gap.
- Never present a still with CSS pan, zoom, or subtitles, a `sourceOnly: true`
  plan, or an `image-puppet` route as animation. Never claim voice, TTS, or
  audio from Aura3D.

## References

- [Animation Studio guide (commands, schema, rendering)](https://github.com/auraoneai/aura3d/blob/main/docs/animation-studio/guide.md)
- [Episode production workflow](https://github.com/auraoneai/aura3d/blob/main/docs/workflows/animation-episode-production.md)
- [Quality gates and limitations](https://github.com/auraoneai/aura3d/blob/main/docs/animation-studio/quality-and-limitations.md)
- [AuraVoice bridge contract](https://github.com/auraoneai/aura3d/blob/main/docs/api/auravoice-bridge.md)
- [Scene-Tool CLI source](https://github.com/auraoneai/aura3d/blob/main/packages/create-aura3d/templates/animation-studio/scripts/animation-scene.ts)
- Rig inspection, clip maps, visemes: load `aura3d-character-animation`.
