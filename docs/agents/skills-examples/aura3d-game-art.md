# Worked example: aura3d-game-art

Skill: `packages/aura3d-cli/skills/aura3d-game-art/SKILL.md` (PRD P3).
Run on 2026-09-25 in the Aura3D monorepo. Lightweight commands only.

## Goal

Establish what the `flipbook-sprite` effect actually does today, validate the
bundled sheet checker, and confirm the HUD consumer in `mini-game`.

## Commands run and trimmed output

1. The effect builder and diagnostics (tsx one-liner against engine source):

   ```ts
   scene().add(effects.flipbook({ spriteColumns: 8, spriteRows: 4, frameRate: 24 })).toJSON();
   renderer.diagnostics(scene().add(effects.flipbook({ spriteColumns: 8, spriteRows: 4 }))).warnings;
   scene().add(effects.flipbook({ spriteColumns: 0 })).toJSON();
   ```

   ```text
   node: {"kind":"effect","effect":"flipbook-sprite","name":"flipbook explosion sprite",
          "intensity":1,"color":"#ffb347","spriteColumns":8,"spriteRows":4,"frameRate":24}
   warn: flipbook-sprite is recorded but withheld: root has no native sprite-sheet sampler yet, so no flipbook pass is submitted
   cols 0: Flipbook columns must be a positive integer.
   ```

   The effect node has no texture field, and no pixels are drawn. The skill
   therefore labels flipbook-dependent VFX `prototype`.

2. UV math (`packages/rendering/src/SpriteFlipbook.ts`):

   ```text
   resolveFlipbookUv(5, 4, 4)  -> uvRect [0.25, 0.5, 0.5, 0.75]
   resolveFlipbookUv(16, 4, 4) -> RangeError: Flipbook frame 16 exceeds sheet capacity 16.
   resolveFlipbookUv(0, 4.5, 4) -> RangeError: Flipbook columns must be a positive integer.
   ```

3. Sheet checker on two synthetic PNGs (generated in a temp directory) and a
   repo screenshot:

   ```sh
   node packages/aura3d-cli/skills/aura3d-game-art/references/sheet-check.mjs explosion-8x4.png --columns 8 --rows 4 --frames 30
   node packages/aura3d-cli/skills/aura3d-game-art/references/sheet-check.mjs bad-rgb.png --columns 8 --rows 4
   ```

   ```text
   512x256 RGBA:  ok true, cell [64, 64], frames 30, emptyCells 2, hasAlpha true (exit 0)
   500x256 RGB:   ok false, "width 500 is not divisible by 8 columns",
                  "PNG has no alpha channel; the background cannot be transparent" (exit 1)
   tests/fixtures/showcase-game-release-gates/racing-frame.png (1440x900): ok false
   ```

4. HUD consumer: `packages/create-aura3d/templates/mini-game/src/main.ts`
   builds a DOM `aside#mini-game-hud` with score, lives, and checkpoint text.
   `ui.html`, `ui.setText`, and `ui.scoreCounter` exist in the engine `ui`
   namespace. `assets add` accepts png, jpg, jpeg, webp, and ktx2 textures,
   not SVG.

## Evidence still owed (remote)

PRD Phase 4 proof: `mini-game` with flipbook VFX. Until the renderer ships a
sprite-sheet sampler, the remote capture can show the typed sheet asset, the
passing sheet check, the recorded effect node, and the withheld warning, but
no flipbook pixels. Desktop and mobile HUD screenshots through `npm run test`
on CI remain to be captured.
