# three.js bridge report: studio

Generator `recipes/studio.mjs` (sha256 76dbf1d3892b), seed 1, params `{"radius":0.8,"spacing":2.1}`, three r185.
GLB `.aura3d/three-bridge/studio.glb` (862024 bytes, sha256 b65b61175f7d).

Supported 9, approximated 0, unsupported 0. Nothing is silently substituted: unsupported constructs are not reproduced, and each row says what the Aura3D output shows instead (hidden node, detached texture, or the unpatched base material).

## supported (9)

| construct | subject | note | native route |
|---|---|---|---|
| MeshStandardMaterial | `cyc` | exported as glTF metallic-roughness PBR |  |
| MeshPhysicalMaterial | `glass` | exported as glTF PBR with KHR_materials_* extensions (clearcoat, transmission, sheen, iridescence, ior, specular) |  |
| MeshPhysicalMaterial | `metal` | exported as glTF PBR with KHR_materials_* extensions (clearcoat, transmission, sheen, iridescence, ior, specular) |  |
| material.roughnessMap | `metal` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| material.metalnessMap | `metal` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshPhysicalMaterial | `fabric` | exported as glTF PBR with KHR_materials_* extensions (clearcoat, transmission, sheen, iridescence, ior, specular) |  |
| material.map | `fabric` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| PerspectiveCamera | `camera` | emitted as camera.perspective (position, look-at target, vertical fov, near, far) |  |
| WebGLRenderer.toneMapping | `output` | emitted as createAuraApp({ output: { toneMapping: "aces", exposure } }) |  |
