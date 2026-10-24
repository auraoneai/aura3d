# Task 2: forest of 10,000 instances

Build a scene with {{LIBRARY}}.

Requirements:
1. A ground plane and exactly 10,000 scattered objects drawn with instancing (not 10,000 separate meshes): 8,000 trees (a trunk and a canopy, each instanced) and 2,000 rocks.
2. Placement is deterministic from a fixed seed (same forest every load), no overlaps needed.
3. Per-instance colour variation (canopies and rocks do not all share one colour).
4. One directional light that casts shadows, and exponential fog.
5. The camera slowly orbits the forest and the whole scene is visible.

The rendering contract in the next section applies.
