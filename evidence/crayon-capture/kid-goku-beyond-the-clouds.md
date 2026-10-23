# Kid Goku: Beyond the Clouds (game 11): capture notes

`kid-goku-beyond-the-clouds-reference.json` was recorded by `tools/crayon-capture/kid-goku-beyond-the-clouds.ts` (bundle with esbuild, run
in the Playwright image on serverless ACR exactly like the other games; `--obstacles-only` reads the original's obstacle layout at the title
screen). The game exposes `window.__CLOUD_RUNNER__.snapshot()`, so no custom state hook is needed: a pre-boot hook freezes
`requestAnimationFrame`/`performance.now` once the title screen is up, `Math.random` is seeded, and WebGL draw calls are suppressed (the
simulation does not depend on pixels; drawing made the first attempt too slow to finish). Session 1 is a closed-loop policy (jump once at
s >= 147), session 2 replays its recorded script open-loop in a fresh browser, session 3 runs the policy again. Assemble with
`tools/crayon-capture/kid-goku-beyond-the-clouds-assemble.ts <run.log>`; it also writes
`tests/browser/data/kid-goku-beyond-the-clouds-reference-replay.json` for the port's browser spec.

Measured repeatability (3 fresh sessions, 800 steps): worst spread 3.4e-14 on `speed`, 0 on everything else; derived tolerance: s 0.1
(the original rounds `s` to one decimal), lane/jump/speed 1e-6. Caveats: the run stops at step 800 (s ~ 190), before the first boulder; it
covers a clean log crash, rock passes, orbs, one gap jump and the first Dragon Ball.
