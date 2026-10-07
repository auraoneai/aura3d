# three.js lighting stack → Aura3D look

The single largest visual change in a migration: a hand-assembled renderer,
lighting and post stack collapses into one look preset. Map by intent, not by
constant.

| three.js source pattern | Replaced by | Watch for |
| --- | --- | --- |
| `scene.environment` + PMREM + env map | the look's IBL | do not re-add a second environment — lint `look/no-ibl`/`double-aa` guards |
| `AmbientLight` (any intensity) | drop — the look fills ambient | re-adding it flattens the grade (`look/ambient-kills-ibl`) |
| `DirectionalLight` key + `castShadow` | the look's key (elevation/azimuth baked per genre) | a second DirectionalLight doubles the shadow read |
| `toneMapping`, `toneMappingExposure` | the look's `output.preset` | exposure moves inside the preset, not the renderer |
| `scene.fog = new Fog(...)` | the look's fog/atmosphere | recipe rows give per-genre density |
| `scene.background = color` | the look's backdrop | a solid color is `look/solid-void` unless declared |
| `EffectComposer` bloom/vignette | the look's post stack | do not stack `antiAlias`/post twice (`look/double-aa`) |
| `setPixelRatio` | `looks.appOptions(<id>)` DPR cap | `look/low-dpr` catches manual low ratios |
| `HemisphereLight` | the look fill (or `lights.hemisphere` when you must override) | hemisphere + IBL flattens (`look/ambient-flattens`) |

## Procedure tie-in

1. Delete the lighting/renderer block entirely, apply `looks.preset(<genre>)` +
   `looks.appOptions(<genre>)`.
2. Recapture: the migrated scene's palette, shadow density and background come
   from the look; the ledger records *intent deltas* (e.g. "original had a
   cooler fill"), not constant deltas.
3. `aura3d look lint` catches the leftovers the ledger cannot: orphaned
   fog nodes, double AA, ambient that kills the IBL.
