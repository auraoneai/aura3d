# Pixel receipt: material-rim (GU47 E-D, PRD WP-4)

`material.pbr({ rim: { color, power, intensity } })` adds `color * intensity * (1 - N·V)^power` to the emitted light of
the forward PBR program (the PRD-04 `prd04.rim` ShaderFeature; a material without rim compiles to the byte-identical
program, see `tests/unit/gu47/ed/material-rim.test.ts`).

Written by `tests/browser/gu47/material-rim.spec.ts` (harness `tests/browser/gu47/material-rim-harness.ts`) on the
remote runner (software WebGL2, SwiftShader, 480x270, `qualityProfile: "production"`) in GU47 phase 2. Not run in phase 1.

Checks (all must pass before `<version>.json` and the two frames are written):

| check | threshold |
| --- | --- |
| clean runtime, both frames drew | no `diagnostics().errors`, `drawCalls > 0` |
| changed pixels | >= 1% |
| silhouette band (0.80..0.97 of the projected radius) mean luma | +6 or more |
| silhouette band warmth (mean r - b, orange rim) | +4 or more |
| centre disc (0..0.35 of the projected radius) mean luma | within +-2 |
