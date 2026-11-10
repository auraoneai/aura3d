# three.js bridge report: showroom

Generator `recipes/showroom.mjs` (sha256 ef5916ff4f71), seed 1, params `{"paint":"#7a0011"}`, three r185.
GLB `.aura3d/three-bridge/showroom.glb` (1621380 bytes, sha256 c7dcd51a8873).

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
