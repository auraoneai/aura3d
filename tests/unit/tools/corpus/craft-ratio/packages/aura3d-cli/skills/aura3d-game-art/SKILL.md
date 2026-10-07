---
name: aura3d-game-art
description: Produces 2D game art that a real Aura3D consumer uses: flipbook VFX sprite sheets for `effects.flipbook` (the `flipbook-sprite` effect with `spriteColumns` / `spriteRows`) and HUD icons or UI sprites for DOM overlays, each admitted as a typed texture asset. Use when a game template (`mini-game`, `racing-starter`, `falling-blocks-starter`, `fighting-game`) needs explosion, muzzle-flash, or hit VFX sheets, HUD icons, score or health sprites, or a style-consistent batch of UI art.
---

# Aura3D game art (flipbook VFX and HUD sprites)

Only two consumers exist, so only two kinds of art are produced: flipbook
sheets for the `flipbook-sprite` effect and icons for the DOM HUD. Tilesets
are out of scope: no 2D tile runtime consumes them, so 3D levels come from
`aura3d-browser-game` and `aura3d-assets`. Shared rules (claim labels, typed
assets, CSS/DOM is UI only, benchmark mode) are in
[../aura3d-core/references/boundaries.md](../aura3d-core/references/boundaries.md).

## Establish the contract

1. Run `npx @aura3d/cli@latest --help` and read the `assets add` line.
2. Read `src/aura-assets.ts` and `aura.assets.json`, and find the consumer
   first: the `effects.flipbook(...)` call, or the HUD element in `src/main.ts`
   (the `mini-game` HUD is a DOM `aside`). No consumer means no art.
3. Know the flipbook state. `effects.flipbook` records validated sheet
   geometry (`spriteColumns`, `spriteRows`, `frameRate`) but the root renderer
   has no sprite-sheet sampler yet and submits no flipbook pass.
   `renderer.diagnostics(scene)` reports the warning "flipbook-sprite is
   recorded but withheld". Any route relying on it is `prototype` for that
   effect.
4. Benchmark mode: `npm install && npm run build`, then stop.

## Procedure

Flipbook VFX sheets:

1. Fix the grid before producing art: columns, rows, frame count, and cell
   size (for example 8 x 4 at 64 px per cell makes a 512 x 256 sheet with up
   to 32 frames). Frames run left to right, top row first; that is the order
   `resolveFlipbookUv(frame, columns, rows)` in `@aura3d/rendering` maps to
   UVs.
2. Author every frame in its own cell with the effect centered, a
   transparent background, and no bleed across cell edges. Keep a frame
   inventory (index to description) next to the file.
3. Pre-flight the file with the bundled checker:

   ```sh
   node .agents/skills/aura3d-game-art/references/sheet-check.mjs ./art/explosion.png --columns 8 --rows 4 --frames 30
   ```

   (Adjust the path to wherever your agent client installed this skill.) It
   fails when the width or height does not divide by the grid, when the frame
   count exceeds the grid, or when the PNG has no alpha channel. It does not
   inspect pixels, so review the transparent background and edges visually.
4. Admit it as a typed texture with provenance:

   ```sh
   npx @aura3d/cli@latest assets add ./art/explosion.png --name explosionSheet --type texture --license CC0-1.0 --author "<author>" --quality candidate
   npx @aura3d/cli@latest assets typegen
   ```

5. Declare the effect with the same grid:
   `effects.flipbook({ spriteColumns: 8, spriteRows: 4, frameRate: 24 })`.
   Mismatched or non-integer values throw a `RangeError` (fail loud); never
   catch and ignore it. The effect has no texture slot today, so the sheet is
   ready for the sampler but not yet drawn.

HUD icons and UI sprites:

6. Produce PNG or WebP icons (SVG is not an accepted asset format) at 1x and
   2x, on a transparent background, sized to the HUD slot.
7. Admit each with `assets add ... --type texture`, then reference the
   typed URL in DOM markup, for example an `<img>` whose `src` is
   `assets.hudHeart.url`, mounted with `ui.html(...)` or the template's HUD
   element. Give every icon a text alternative (`alt`, or `aria-label` on the
   control).
8. DOM and CSS are allowed for UI only. Never use them for particles,
   explosions, hit sparks, or anything claimed as rendered 3D VFX.

Style-consistent batches:

9. Write one style sheet before the batch: palette (hex values), outline
   weight, light direction, and cell or icon size. Produce every item against
   it, then review the batch side by side and redo outliers instead of
   shipping a mixed set.
10. Generated images (from an image skill outside Aura3D) are candidates:
    keep them under `artifacts/`, admit them with `--quality candidate`, and
    run the same checks.
11. Normal mode: capture the HUD on desktop and mobile through `npm run test`
    on CI or a remote worker, then hand claim wording to
    `aura3d-evidence-review`.

## Stop and report

- The sheet fails `sheet-check.mjs`, or frames bleed across cells: fix the
  sheet; do not change the grid in code to paper over it.
- The route's VFX depends on flipbook pixels: label that effect `prototype`
  and quote the withheld warning. Do not fake it with CSS, a DOM overlay, or
  an animated `<img>` on top of the canvas.
- Someone asks for a tileset: decline it and route level work to
  `aura3d-browser-game`.
- A file has no license or author: do not admit it.

## References

- [Flipbook UV math (`@aura3d/rendering`)](https://github.com/auraoneai/aura3d/blob/main/packages/rendering/src/SpriteFlipbook.ts)
- [Flipbook and beam root builder test](https://github.com/auraoneai/aura3d/blob/main/tests/unit/engine/phase2-root-bridge.test.ts)
- [Flipbook browser harness](https://github.com/auraoneai/aura3d/blob/main/tests/browser/d4-flipbook-beam-harness.ts)
- [Mini-game template HUD](https://github.com/auraoneai/aura3d/blob/main/packages/create-aura3d/templates/mini-game/src/main.ts)
- [Build a browser game guide](https://github.com/auraoneai/aura3d/blob/main/docs/guides/build-a-browser-game.md)
- [Sheet checker](references/sheet-check.mjs)
