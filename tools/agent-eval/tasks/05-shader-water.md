# Task 5: custom shader water

Build a scene with {{LIBRARY}}.

Requirements:
1. A water surface made with a custom GLSL shader (not a stock material): vertex displacement by animated waves (the surface must be a subdivided grid so the waves are geometry, not just colour), a fresnel term (more sky reflection at grazing angles), a procedural noise-based ripple detail and a sun specular glint.
2. A sky: a gradient sky dome or background that the water reflects (a colour gradient is fine; no external textures).
3. The water animates over time (time uniform), the camera sits above the water looking toward the horizon.
4. Tone mapping and colour output must be correct (not washed out or black).

The rendering contract in the next section applies.
