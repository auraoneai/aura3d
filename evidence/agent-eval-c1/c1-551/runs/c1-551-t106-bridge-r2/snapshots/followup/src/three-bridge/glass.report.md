# three.js bridge report: glass

Generator `recipes/studio.mjs` (sha256 fdb12e0b2d72), seed 1, params `{"radius":0.62,"spacing":1.65,"only":"glass"}`, three r185.
GLB `.aura3d/three-bridge/glass.glb` (275868 bytes, sha256 ac7f6ac19c11).

Supported 3, approximated 0, unsupported 0. Nothing is silently substituted: unsupported constructs are not reproduced, and each row says what the Aura3D output shows instead (hidden node, detached texture, or the unpatched base material).

## supported (3)

| construct | subject | note | native route |
|---|---|---|---|
| MeshPhysicalMaterial | `glass` | exported as glTF PBR with KHR_materials_* extensions (clearcoat, transmission, sheen, iridescence, ior, specular) |  |
| PerspectiveCamera | `camera` | emitted as camera.perspective (position, look-at target, vertical fov, near, far) |  |
| WebGLRenderer.toneMapping | `output` | emitted as createAuraApp({ output: { toneMapping: "aces", exposure } }) |  |
