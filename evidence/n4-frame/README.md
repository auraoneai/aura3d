# N4 framing and shadows by default: evidence

Real GPU (headless Chrome, ANGLE Metal, Apple M4 Max), 960x540, captured 2026-11-08 on branch exp/54-n4-frame.

- `auto-frame-clock.png` / `.json`: `examples/auto-frame-clock` (benchmark 505 animation-2). No camera position in the source; `camera.auto({ subject: "clock", angle: "front", fill: 0.8 })` measures fill 0.800 on the canvas aspect. `lights.key` shadow on wall and floor.
- `auto-frame-bird.png` / `.json`: `examples/auto-frame-bird` (benchmark 505 animation-3). Per-frame `camera.framePose` chase; measured fill 0.450 (requested 0.45); bird shadow on the ground.
- `clock-key-without-shadow.png`: the same scene with an unshadowed directional key (what a bare `lights.directional` gives).
- `clock-shadow-bias0-acne.png`: `lights.directional({ shadow: true })` (depth bias 0): acne on the wall. `lights.key` uses bias 0.002.
- `template-*-before|after.png`: custom-scene and procedural-scene templates, hand-placed camera (before) vs `camera.auto` (after). The sky colour differs between captures because of HDRI load timing, not the camera.
- `first-screen-block{1,2,4}.png`: the edited first-screen blocks built from source (no HDRI served, so looks are flatter than with the published package).
- `games/pair-<slug>.png`: left = this branch (single-route marketing build), right = https://aura3d.auraone.ai/apps/<slug>/ . Five games, framing and look unchanged (games author their own cameras; only scenes with no camera or `camera.auto` change).
