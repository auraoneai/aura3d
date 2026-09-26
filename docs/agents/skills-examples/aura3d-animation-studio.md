# Worked example: aura3d-animation-studio

Skill: `packages/aura3d-cli/skills/aura3d-animation-studio/SKILL.md` (PRD D3).
Run on 2026-09-25 in the Aura3D monorepo. Only lightweight, read-only commands
were run locally. No render, Playwright, or gate suite ran on this machine.

## Goal

Confirm the director loop the skill describes against the real Scene-Tool CLI:
the delegation path, the read-only verbs, the no-default-scene rule, and the
render environment contract, without mutating the template's working scene.

## Commands run and trimmed output

1. Delegation dry run, from `packages/create-aura3d/templates/animation-studio`:

   ```sh
   node ../../../aura3d-cli/dist/cli.js animation scene cast add --id hero --query "robot" --dry-run
   ```

   ```json
   { "ok": true, "command": "animation", "action": "scene", "delegatedScript": "scene",
     "forwardedArgs": ["cast", "add", "--id", "hero", "--query", "robot"],
     "runner": "npm", "dryRun": true }
   ```

   `aura3d animation scene` only forwards to the template's `scene` npm script
   from the current directory, which is why the skill says to run it from the
   project directory.

2. Read-only verbs on the existing working document, from the repo root
   (document sha1 `8b4eeaba056d43aebc67c4df42236d65a1b59ac4` before and after,
   so nothing was modified):

   ```sh
   pnpm exec tsx --tsconfig tsconfig.base.json packages/create-aura3d/templates/animation-studio/scripts/animation-scene.ts show
   pnpm exec tsx --tsconfig tsconfig.base.json packages/create-aura3d/templates/animation-studio/scripts/animation-scene.ts validate
   ```

   ```text
   id=scene-two-friends-cooking-dinner-and-g duration=24s
   cast: friend-1, friend-2
   shots: shot-1[0-8] establishing, shot-2[8-16] medium, shot-3[16-24] medium
   props placed: 0
   walkable: x[-3.6..3.6] z[-2..2]
   coherence: PASS
   ```

3. The no-default-scene rule (`new` without a prompt):

   ```text
   animation-scene new requires a prompt: animation-scene new --prompt "<your scene>"
     (or clone an existing document with --from <doc.json>). There is no default scene.
   ```

## Facts verified in source while writing the skill

- Verbs in `scripts/animation-scene.ts`: new, show, block, camera, gesture,
  dress, clear-props, set, cast, scale, shot, prop, dialogue, retime, undo,
  validate, render. `dialogue --end` is optional; `dialogue --remove --line`
  exists; `shot add|remove|retime`.
- `render` sets `AURA_DOCUMENT`, `AURA_OUTPUT_DIR=dist/episodes/scene`, and
  `AURA_PREVIEW_RANGE` (from `--range`), and runs `scripts/render-live.ts`
  from the monorepo root. `render-live.ts` resolves `MONOREPO_ROOT` four
  levels above the template, so `render` works only inside the monorepo.
- `AURA_QUALITY=final` gives 1920x1080 at 24 fps; the default is preview
  (480x270 at 8 fps). `AURA_RENDER_STYLE` is `toon` (default) or `pbr`.
- The render summary records `audioOwnedBy: "auravoice"` and `engineTts: false`.
- Captions are burned into exported video frames from the dialogue track
  (`seekAndReadPixels` burns by default); the fidelity stills and mouth pair
  pass `burnCaption: false`. There is no flag for a caption-free video master,
  so the skill reports that as a gap instead of claiming captions never
  reach pixels.

## Evidence still owed (remote)

Run on a remote worker or CI from the monorepo: `aura3d animation scene render`
with `AURA_QUALITY=final`, then `tools/animation-studio-gate-suite/index.ts`
against `dist/episodes/scene/render-live-summary.json`, then
`pnpm scene:determinism`. Capture `episode-3d.webm`, the four fidelity stills,
the mouth pair, the summary JSON, and the gate-suite report. PRD Phase 3 asks
for one episode through the gate suite with the render silent and the
AuraVoice track intact; that run has not happened in this log.
