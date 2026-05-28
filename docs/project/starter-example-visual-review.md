# Starter Example Visual Review

Generated: 2026-05-28

This review covers the active public example routes that `pnpm run
check:examples` verifies and that the root example registry exposes:

- `/apps/hello-world-typed-asset/`
- `/apps/material-lighting/`
- `/apps/camera-path/`

It is intentionally separate from historical report PNGs under
`tests/reports/production-runtime-examples/`. Those older report artifacts are
not accepted release-facing example evidence until they are regenerated and
reviewed against their route names.

## Reviewed Artifacts

| Example | Screenshot | Verdict | Notes |
|---|---|---|---|
| `hello-world-typed-asset` | `tests/reports/agent-examples/screenshots/hello-world-typed-asset.png` | pass with caveat | Renders the typed GLB robot asset on a lit stage with a visible pedestal, imported-asset diagnostics, and distinct cyan/warm lighting. It is a compact typed-asset demo, not a product-marketing render. |
| `material-lighting` | `tests/reports/agent-examples/screenshots/material-lighting.png` | pass | Renders a material-study shelf with matte, metal, magenta emissive, cyan emissive, and warm swatches. The screenshot now reads as a material and lighting comparison rather than three generic labeled spheres. |
| `camera-path` | `tests/reports/agent-examples/screenshots/camera-path.png` | pass | Renders a composed camera-path scene with a recognizable stylized camera product, cyan start gate, warm finish gate, rail path, waypoints, dolly-camera diagnostics, and distinct cyan/warm lighting. It is still a compact example, but it now reads as the intended camera-path prompt instead of a clipped placeholder asset. |

## Current Automated Proof

- `pnpm run check:examples` writes the three PNGs above.
- `tests/reports/agent-examples-playwright.json` records route health, draw
  calls, screenshot hashes, screenshot byte sizes, and scene-specific pixel
  profiles.
- The browser test rejects identical screenshot hashes and rejects the old
  generic primitive output by requiring route-specific visual signals:
  - `hello-world-typed-asset`: typed robot colors, cyan light, warm light, and
    center object pixels.
  - `material-lighting`: cyan, warm, magenta, neutral material swatches, and
    center object pixels.
- `camera-path`: cyan start gate, warm finish gate, dark camera-body detail,
  rail/waypoint lighting, and center object pixels.

## Remaining Visual Caveats

The active examples are now prompt-aligned and distinct, but they are still
small starter examples. Do not market `hello-world-typed-asset` or
`camera-path` as photoreal demos. The stronger release-facing visual proof is
the starter-template set, especially `cinematic-scene` and `mini-game`.
