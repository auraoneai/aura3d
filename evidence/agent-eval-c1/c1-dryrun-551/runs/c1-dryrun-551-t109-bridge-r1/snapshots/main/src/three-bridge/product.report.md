# three.js bridge report: product

Generator `recipes/product.mjs` (sha256 068fb022f046), seed 7, params `{"paint":"#b0121b"}`, three r185.
GLB `.aura3d/three-bridge/product.glb` (137800 bytes, sha256 c407dd81c98e).

Supported 11, approximated 0, unsupported 0. Nothing is silently substituted: unsupported constructs are not reproduced, and each row says what the Aura3D output shows instead (hidden node, detached texture, or the unpatched base material).

## supported (11)

| construct | subject | note | native route |
|---|---|---|---|
| MeshPhysicalMaterial | `paint` | exported as glTF PBR with KHR_materials_* extensions (clearcoat, transmission, sheen, iridescence, ior, specular) |  |
| MeshPhysicalMaterial | `glass` | exported as glTF PBR with KHR_materials_* extensions (clearcoat, transmission, sheen, iridescence, ior, specular) |  |
| MeshStandardMaterial | `chrome` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `rubber` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `rubber` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `rubber` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `rubber` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `table` | exported as glTF metallic-roughness PBR |  |
| DirectionalLight | `key` | emitted as native lights.directional (world-space position/target; three intensity carried 1:1) |  |
| PerspectiveCamera | `camera` | emitted as camera.perspective (position, look-at target, vertical fov, near, far) |  |
| WebGLRenderer.toneMapping | `output` | emitted as createAuraApp({ output: { toneMapping: "aces", exposure } }) |  |
