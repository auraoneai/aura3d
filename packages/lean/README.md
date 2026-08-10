# `@aura3d/lean`

The dependency-isolated Aura3D browser runtime for new 2.0 applications.

- `@aura3d/lean` renders primitive scenes through the production WebGL2 runtime.
- `@aura3d/lean/product` adds typed GLB/glTF product loading.
- `@aura3d/lean/game` adds deterministic arcade input and platform motion while retaining the typed model path.

Physical simulation is not included. Install `@aura3d/physics-rapier` explicitly
when a workload requires rigid bodies, a physical character controller, or a
physical vehicle. Navigation, editor, and Node media packages are likewise
separate opt-ins.

The compatibility aliases under `@aura3d/engine/lean*` remain available for
migration, but new scaffolds import this package so installing a lean starter
does not install the compatibility root or its physical-simulation dependency.

Use the core entry for primitive scenes, `/product` for typed GLB/glTF product
work, and `/game` for solver-free deterministic arcade input and motion.
