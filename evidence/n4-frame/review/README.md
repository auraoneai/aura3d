# N4 independent review: rerun evidence

Real GPU (headless Chrome, ANGLE Metal, Apple M4 Max), 960x540, 2026-11-08.

- `rerun-auto-frame-clock.png`: examples/auto-frame-clock rebuilt by the reviewer (vite, `build.target: esnext`); measured fill 0.800 (requested 0.8); key shadow on wall and floor.
- `rerun-auto-frame-bird.png`: examples/auto-frame-bird rebuilt; measured fill 0.450 (requested 0.45); bird shadow on the ground.
- `pair-<slug>.png`: left = this branch (single-route marketing build), right = https://aura3d.auraone.ai/apps/<slug>/ . Five games not in the implementer's set (top-tennis, iron-crown, aura-hoops-3d, strange-orbit-port, roadster-rush): framing and look unchanged (hoops differs only by gameplay time).
