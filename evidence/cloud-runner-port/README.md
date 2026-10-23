# Cloud Runner (Kid Goku port) art pass evidence

- `frames-before/`: the pre-art port (HEAD copy) at the reference course distances (remote run `cr-art-b1`, headed Chromium under Xvfb, 1280x720).
- `frames-after/`: the port after the pass (remote run `cr-art-a6`, same viewport and states). `*-hud` frames show the DOM interface.
- `compare-<state>.jpg`: before | after contact sheets (640x360 each). The original's frames are third-party and stay local (gitignored).
- `judge-results.json`: blind A/B judge (Kiro Prism, `claude-sonnet-5.5`, seeded balanced order, 12 passes x 4 states = 48 trials per label) plus
  structural metrics against the original. MODEL judgement, not a human one. Result: the judge identified the original in 48/48 trials both
  before and after, so the port is still clearly distinguishable; the structural distance fell (luma JSD 0.885 -> 0.217, edge-density ratio
  0.027 -> 0.623, palette distance 0.212 -> 0.130).
- Capture tools: `tools/crayon-capture/kid-goku-frames*.ts` (original, remote), `tests/browser/kid-goku-art-frames.spec.ts` (port, remote),
  `kid-goku-judge.ts`, `kid-goku-compare.ts`.
