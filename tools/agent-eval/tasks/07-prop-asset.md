# Task 7: place one 3D prop

Build a scene with {{LIBRARY}}.

The file `/assets/prop.glb` is a provided 3D model (a stylised robot). In the full study the Aura3D arm may generate a prop with the Meshy pipeline; in this version the model is provided to both arms.

Requirements:
1. Load `/assets/prop.glb` and place it standing on a round pedestal (a cylinder) in a lit scene, scaled to a sensible size and centred in the frame.
2. Soft lighting with a shadow on the ground and a fitting background colour.
3. The model slowly turns on the pedestal.
4. If the model fails to load, show a clear visible fallback (and log the error) instead of a black canvas.

The rendering contract in the next section applies. Set `window.__EVAL_READY__ = true` after the model is on screen.
