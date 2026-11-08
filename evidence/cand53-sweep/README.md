# exp/53f-candidate sweep at 278b003ec (2026-11-08)

Fresh `pnpm build` + `pnpm --dir marketing build` at 278b003ec, served locally, headless Chrome (ANGLE Metal, Apple GPU),
960x540, prefers-reduced-motion. Every game captured three times: default page, `?backend=webgl2`, and the live site
https://aura3d.auraone.ai/apps/<slug>/. Two screenshots 700 ms apart per capture give a static-pixel mask; `games.json`
holds the mean absolute difference over the full frame and over static pixels only.

- `sheet-30.png`: per game, default | live | `?backend=webgl2`.
- Backend: default page is WebGPU in chroma-roll, showcase-dot-dash-3d and cumulus-dash, WebGL2 in the other 27 (30/30
  as intended); `?backend=webgl2` gives WebGL2 in 30/30; live is WebGL2 everywhere.
- Errors: 0 app errors in all 90 captures. The only console error is Chrome blocking `navigator.vibrate` before a user
  tap in showcase-cross-hop, identical on live.
- Look: static-region difference vs live is at most 3.04 (slingshot-siege, camera intro timing; 0.38 under
  `?backend=webgl2`), under 2.1 for the other 29.
- `showcase-cross-hop-t.png`: the large full-frame difference in cross-hop is timing (the idle hawk ends the run about
  2 s earlier on live) plus the randomised lane layout: top = local 16 s | live 11 s, bottom = local 22 s | live 18 s.
- `starters-sheet.png`: the five create-aura3d starters (product, outdoor, interior, game, presentation), scaffolded
  with `createA3DProject` and built with their own Vite config against this branch's source; default | `?backend=webgl2`.
  All render, 0 errors, only 404 is favicon.
- `examples-sheet.png`: N1 color-input-css (stacker, forms), N2 materials-glass-steel, N3 plain-look (garden, spider),
  N4 auto-frame-clock and auto-frame-bird, each built with default Vite settings (`base: "./"`). All render, 0 errors.
