# three.js bridge report: glass

Generator `recipes/studio.mjs` (sha256 f69b219f76bb), seed 1, params `{"radius":0.8,"spacing":2.2,"part":"glass"}`, three r185.
GLB `.aura3d/three-bridge/glass.glb` (275728 bytes, sha256 fef647eb6716).

Supported 2, approximated 0, unsupported 0. Nothing is silently substituted: unsupported constructs are not reproduced, and each row says what the Aura3D output shows instead (hidden node, detached texture, or the unpatched base material).

## supported (2)

| construct | subject | note | native route |
|---|---|---|---|
| MeshPhysicalMaterial | `glass` | exported as glTF PBR with KHR_materials_* extensions (clearcoat, transmission, sheen, iridescence, ior, specular) |  |
| WebGLRenderer.toneMapping | `output` | emitted as createAuraApp({ output: { toneMapping: "none", exposure } }) |  |
