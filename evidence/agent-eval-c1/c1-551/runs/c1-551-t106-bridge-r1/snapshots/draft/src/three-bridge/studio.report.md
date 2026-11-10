# three.js bridge report: studio

Generator `recipes/studio.mjs` (sha256 e33976792acf), seed 1, params `{"radius":0.8,"spacing":2.1}`, three r185.
GLB `.aura3d/three-bridge/studio.glb` (861328 bytes, sha256 c5871b2866b3).

Supported 7, approximated 0, unsupported 0. Nothing is silently substituted: unsupported constructs are not reproduced, and each row says what the Aura3D output shows instead (hidden node, detached texture, or the unpatched base material).

## supported (7)

| construct | subject | note | native route |
|---|---|---|---|
| MeshStandardMaterial | `cyc` | exported as glTF metallic-roughness PBR |  |
| MeshPhysicalMaterial | `glass` | exported as glTF PBR with KHR_materials_* extensions (clearcoat, transmission, sheen, iridescence, ior, specular) |  |
| MeshPhysicalMaterial | `metal` | exported as glTF PBR with KHR_materials_* extensions (clearcoat, transmission, sheen, iridescence, ior, specular) |  |
| MeshPhysicalMaterial | `fabric` | exported as glTF PBR with KHR_materials_* extensions (clearcoat, transmission, sheen, iridescence, ior, specular) |  |
| material.map | `fabric` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| PerspectiveCamera | `camera` | emitted as camera.perspective (position, look-at target, vertical fov, near, far) |  |
| WebGLRenderer.toneMapping | `output` | emitted as createAuraApp({ output: { toneMapping: "aces", exposure } }) |  |
