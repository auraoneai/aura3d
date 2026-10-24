# Task 3: skinned character with clip crossfade

Build a scene with {{LIBRARY}}.

The file `/assets/soldier.glb` is a skinned character with animation clips (including `Idle`, `Walk`, `Run`).

Requirements:
1. Load `/assets/soldier.glb`, scale/position it so the whole character stands on a ground plane and is framed by the camera.
2. It starts playing `Idle`.
3. Pressing `R` cross-fades to `Run` over 0.4 seconds; pressing `I` cross-fades back to `Idle` over 0.4 seconds.
4. One shadow-casting light, shadow on the ground.
5. Expose `window.__EVAL__ = { clip: () => string }` returning the name of the clip currently being played (the target clip once a fade starts).

The rendering contract in the next section applies. Set `window.__EVAL_READY__ = true` after the model has loaded and the first frame is drawn.
