# Starter Example Visual Review

Generated: 2026-05-28

This review covers the active public example routes that `pnpm run
check:examples` verifies and that the root example registry exposes:

- `/apps/hello-world-typed-asset/`
- `/apps/material-lighting/`
- `/apps/camera-path/`

These examples are API and rendering proof. They are not product-quality proof
that a natural-language prompt can create a polished visual result.

## Reviewed Artifacts

| Example | Screenshot | Verdict | Notes |
|---|---|---|---|
| `hello-world-typed-asset` | `tests/reports/agent-examples/screenshots/hello-world-typed-asset.png` | technical render pass | Renders the typed GLB robot asset on a lit stage with a visible pedestal, imported-asset diagnostics, and distinct cyan/warm lighting. It proves typed asset rendering, not a polished demo. |
| `material-lighting` | `tests/reports/agent-examples/screenshots/material-lighting.png` | technical render pass | Renders a material-study shelf with matte, metal, magenta emissive, cyan emissive, and warm swatches. It proves material and light cues, not final visual quality. |
| `camera-path` | `tests/reports/agent-examples/screenshots/camera-path.png` | technical render pass | Renders a composed camera-path scene with a stylized camera object, cyan start gate, warm finish gate, rail path, waypoints, dolly-camera diagnostics, and distinct lighting. It is still a compact example, not a polished cinematic result. |

## Current Automated Proof

- `pnpm run check:examples` writes the three PNGs above.
- `tests/reports/agent-examples-playwright.json` records route health, draw
  calls, screenshot hashes, screenshot byte sizes, and scene-specific pixel
  profiles.
- The browser test rejects identical screenshot hashes and rejects route-generic
  output by requiring route-specific visual signals:
  - `hello-world-typed-asset`: typed robot colors, cyan light, warm light, and
    center object pixels.
  - `material-lighting`: cyan, warm, magenta, neutral material swatches, and
    center object pixels.
  - `camera-path`: cyan start gate, warm finish gate, dark camera-body detail,
    rail/waypoint lighting, and center object pixels.

## Aura3D advantage

These examples should not be marketed as prompt-to-visual demos. They prove that
the runtime can render distinct examples and capture screenshots. They do not
prove that agents can reliably convert prompts into visuals that users would
want.

Until the prompt-fidelity work in
`docs/project/prompt-visual-quality-gap.md` is complete, classify these examples
as render-plumbing evidence only.
