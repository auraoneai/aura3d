# evidence/crayon-probes/

Runtime probe evidence for the ten Crayon Arcade candidates, one JSON per
game, produced **on the remote runner only** by
[`tools/crayon-probe/index.ts`](../../tools/crayon-probe/index.ts):

```bash
pnpm exec tsx --tsconfig tsconfig.base.json tools/crayon-probe/index.ts \
  --manifest tools/crayon-probe/games.json
```

Each file records P-1..P-4 from
[`docs/workflows/threejs-parity-gaps.md`](../../docs/workflows/threejs-parity-gaps.md)
§9 — node-material usage (P-1), `isBatchedMesh` instances (P-2),
EffectComposer vs the r186 node pipeline (P-3), and
`isShaderMaterial`/`isRawShaderMaterial` counts (P-4) — plus which evidence
strategy fired (importmap → heap snapshot → DOM/global) and a per-probe
verdict of `yes` / `no` / `inconclusive`. An `inconclusive` or missing file
keeps the parity gate red; nothing here is fabricated.
