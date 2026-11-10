# three.js bridge report: showroom

Generator `recipes/showroom.mjs` (sha256 9cc9269d5a90), seed 1, params `{"paint":"#c4001d"}`, three r185.
GLB `.aura3d/three-bridge/showroom.glb` (1515824 bytes, sha256 d02f3b874866).

Supported 10, approximated 0, unsupported 0. Nothing is silently substituted: unsupported constructs are not reproduced, and each row says what the Aura3D output shows instead (hidden node, detached texture, or the unpatched base material).

## supported (10)

| construct | subject | note | native route |
|---|---|---|---|
| MeshPhysicalMaterial | `paint` | exported as glTF PBR with KHR_materials_* extensions (clearcoat, transmission, sheen, iridescence, ior, specular) |  |
| material.normalMap | `paint` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshPhysicalMaterial | `glass` | exported as glTF PBR with KHR_materials_* extensions (clearcoat, transmission, sheen, iridescence, ior, specular) |  |
| MeshStandardMaterial | `chrome` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `rubber` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `rim` | exported as glTF metallic-roughness PBR |  |
| MeshPhysicalMaterial | `floor` | exported as glTF PBR with KHR_materials_* extensions (clearcoat, transmission, sheen, iridescence, ior, specular) |  |
| MeshStandardMaterial | `platformEdge` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `ringLight` | exported as glTF metallic-roughness PBR |  |
| WebGLRenderer.toneMapping | `output` | emitted as createAuraApp({ output: { toneMapping: "aces", exposure } }) |  |
