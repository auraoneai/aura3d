# Serpentine Sky Run: sun shadows on

Remote software WebGL2 (`tests/browser/port-sun-shadows-serpentine-sky-run.spec.ts`, run `p1shadow-l-serpentine-sky-run`), 640x360, `?shadow=0` vs default. Not real-GPU evidence.

| | mean luma | draw calls |
|---|---|---|
| `?shadow=0` | 193.12 | 56 |
| sun shadow (1 cascade, 80 m) | 193.04 | 111 |
The road and solid figures are `material.custom` toon surfaces; a shadowed fragment drops to the lowest toon band (`gToonShadow`). The first runs timed out at ready only because the spec read `__AURA_SERPENTINE_SKY_RUN__`; `installQaHooks("saiyan-snake-way")` creates `__AURA_SAIYAN_SNAKE_WAY__` (the existing `tests/browser/saiyan-snake-way-*.spec.ts` still use the stale name).
