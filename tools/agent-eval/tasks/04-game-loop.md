# Task 4: coin dash game loop

Build a small game with {{LIBRARY}}.

Rules:
1. A player (a sphere or box) moves on a flat arena with the arrow keys or WASD. Coins (at least 8) sit in the arena; touching a coin collects it (+1 score) and a new coin appears elsewhere (seeded random, deterministic).
2. The simulation uses a fixed 1/60 second timestep (accumulator), independent of display refresh.
3. There is a 30 second round timer. At 30 seconds the status becomes `lost` unless the score reached 15 before that, in which case the status became `won` immediately.
4. `P` toggles pause (the simulation freezes while paused). `R` restarts the round (score 0, timer 0, status `playing`).
5. A DOM HUD (outside the canvas) shows score, remaining time and status, using elements with ids `score`, `time`, `status`.
6. Expose `window.__EVAL__ = { state, step }` where `state()` returns `{ score: number, status: "playing" | "paused" | "won" | "lost", time: number }` (time = elapsed simulated seconds) and `step(frames: number)` advances the simulation by that many fixed steps immediately (no rendering needed), using the current input state.

The rendering contract in the next section applies.
