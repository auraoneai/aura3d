# Task 6: complete small mobile-friendly arcade game

Build a complete small arcade game with {{LIBRARY}}: "Dodge": the player slides left/right on a lane floor and avoids falling hazards, collecting pickups for score.

Requirements:
1. A 3D scene (player, hazards, pickups, floor), a fixed 1/60 s simulation step, seeded RNG, three lives, score and a game-over state.
2. A DOM HUD (outside the canvas): score, lives, best score.
3. Controls: keyboard (arrows or A/D) and touch (on-screen left/right buttons that work with pointer events, large hit targets), and a visible pause button (also `P`).
4. Sound: procedural WebAudio beeps for pickup, hit and game over, started after the first user gesture, with a mute toggle.
5. Pause and restart (`R`), with an overlay for pause and game over.
6. Responsive: the layout works on a 390x844 phone viewport as well as 640x360 (the canvas stays 640x360 CSS pixels on desktop; on narrow screens it may scale down with CSS).
7. Deterministic replay hook: `window.__EVAL__ = { state, step, input, record, replay, reset }`:
   - `state()` returns `{ score, lives, status: "playing" | "paused" | "over", frame: number }`;
   - `reset(seed: number)` restarts with that seed;
   - `input(action: "left" | "right", down: boolean)` sets the input state;
   - `step(frames)` advances the simulation that many fixed steps;
   - `record()` returns the input log `{ frame, action, down }[]` since the last reset;
   - `replay(log)` resets with the same seed and re-simulates the log, then returns a string hash of the final state.

The rendering contract in the next section applies.
