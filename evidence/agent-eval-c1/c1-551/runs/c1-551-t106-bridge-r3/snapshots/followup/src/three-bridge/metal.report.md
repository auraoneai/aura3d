# three.js bridge report: metal

Generator `recipes/studio.mjs` (sha256 f69b219f76bb), seed 1, params `{"radius":0.8,"spacing":2.2,"part":"metal"}`, three r185.
GLB `.aura3d/three-bridge/metal.glb` (275840 bytes, sha256 a43cef30de29).

Supported 2, approximated 0, unsupported 0. Nothing is silently substituted: unsupported constructs are not reproduced, and each row says what the Aura3D output shows instead (hidden node, detached texture, or the unpatched base material).

## supported (2)

| construct | subject | note | native route |
|---|---|---|---|
| MeshPhysicalMaterial | `metal` | exported as glTF PBR with KHR_materials_* extensions (clearcoat, transmission, sheen, iridescence, ior, specular) |  |
| WebGLRenderer.toneMapping | `output` | emitted as createAuraApp({ output: { toneMapping: "none", exposure } }) |  |
