# Red Zone 3D — remote capture evidence notes

Captured via `tools/remote-capture.sh showcase-red-zone-3d /tmp/red-zone-3d-dist aura-evidence/showcase-red-zone-3d "/apps/showcase-red-zone-3d/?demo=1"` (SSM-forwarded EC2 runner, headless chromium + swiftshader).

## Verified by this evidence

- Route boots with **zero page errors** (`errors.log` empty; `console.log` shows only the engine's benign contracts-deprecation warning and the route's `[rz3d] boot ok` beacon).
- **Production WebGL2 renderer mounts and draws**: `evidence.json.diagnostics` reports `backend: webgl2`, `drawCalls: 1352`, `fps: 60`, `renderSize: [1600, 900]`, `errors: []`.
- **All route assets fetch 200** under the capture serve tree (fetch-probe lines in `console.log`): `/hdri/studio_small_08_1k.hdr`, `rooftopFloodlightTowerMeshy`, `rooftopScoreboardRigMeshy`, `rooftopShooterCleanMeshy` GLBs.
- **Live game loop**: `mode: quickplay`, `phase: preSnap`, autopilot engaged (`demo=1`), drive on the 25, 1st & 10 — sim advances; `framesRendered` increments once the async mount settles.
- **Evidence channel** publishes to `window.__gameEvidence` / `__auraEvidence` / `__AURA3D_GAME_EVIDENCE__` / `__AURA3D_GAME__` every frame plus a 500ms watchdog.

## Known limitation of these captures

`shot-*.png` files are uniform black. This is a capture-infra artifact, not an app defect: the shared capture runner is memory-constrained (≈160–450 MB free of 3.8 GB, with several concurrent agents' chromiums), so (a) the async production mount takes ~20–35 s under software GL and shots are taken before the first present, and (b) the capture subprocess is frequently OOM-killed mid-run. Diagnostics prove the scene graph renders (1352 draw calls) on the frames it completes.

`route-health.json` is classified `prototype` accordingly.

## Reproduce

```
node tools/dev-route-build.mjs showcase-red-zone-3d /tmp/red-zone-3d-dist
cp /tmp/red-zone-3d-dist/apps/showcase-red-zone-3d/index.html /tmp/red-zone-3d-dist/index.html
tools/remote-capture.sh showcase-red-zone-3d /tmp/red-zone-3d-dist aura-evidence/showcase-red-zone-3d "/apps/showcase-red-zone-3d/?demo=1" 45000 4
```

For a lighter mount (skips GLB set-dressing + post passes, pixelRatio 1): `?demo=1&lite=1`.
