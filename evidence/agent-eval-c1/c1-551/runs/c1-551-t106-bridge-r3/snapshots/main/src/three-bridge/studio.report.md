# three.js bridge report: studio

Generator `recipes/studio.mjs` (sha256 9df120252e68), seed 1, params `{"radius":0.8,"spacing":2.2}`, three r185.
GLB `.aura3d/three-bridge/studio.glb` (2204528 bytes, sha256 d1a7aaaf7aa7).

Supported 7, approximated 0, unsupported 0. Nothing is silently substituted: unsupported constructs are not reproduced, and each row says what the Aura3D output shows instead (hidden node, detached texture, or the unpatched base material).

## supported (7)

| construct | subject | note | native route |
|---|---|---|---|
| MeshStandardMaterial | `cyclorama` | exported as glTF metallic-roughness PBR |  |
| MeshPhysicalMaterial | `glass` | exported as glTF PBR with KHR_materials_* extensions (clearcoat, transmission, sheen, iridescence, ior, specular) |  |
| MeshPhysicalMaterial | `metal` | exported as glTF PBR with KHR_materials_* extensions (clearcoat, transmission, sheen, iridescence, ior, specular) |  |
| MeshPhysicalMaterial | `fabric` | exported as glTF PBR with KHR_materials_* extensions (clearcoat, transmission, sheen, iridescence, ior, specular) |  |
| material.map | `fabric` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| material.normalMap | `fabric` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| WebGLRenderer.toneMapping | `output` | emitted as createAuraApp({ output: { toneMapping: "none", exposure } }) |  |
