# three.js bridge report: carpaint

Generator `recipes/carpaint.mjs` (sha256 ee08a877b4ec), seed 1, params `{"paint":"#9a000e","length":1.7}`, three r185.
GLB `.aura3d/three-bridge/carpaint.glb` (1319492 bytes, sha256 52fc2d19fb66).

Supported 9, approximated 0, unsupported 0. Nothing is silently substituted: unsupported constructs are not reproduced, and each row says what the Aura3D output shows instead (hidden node, detached texture, or the unpatched base material).

## supported (9)

| construct | subject | note | native route |
|---|---|---|---|
| MeshPhysicalMaterial | `platform` | exported as glTF PBR with KHR_materials_* extensions (clearcoat, transmission, sheen, iridescence, ior, specular) |  |
| MeshStandardMaterial | `chrome` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `ring_light` | exported as glTF metallic-roughness PBR |  |
| MeshPhysicalMaterial | `candy_paint` | exported as glTF PBR with KHR_materials_* extensions (clearcoat, transmission, sheen, iridescence, ior, specular) |  |
| material.normalMap | `candy_paint` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshPhysicalMaterial | `dark_glass` | exported as glTF PBR with KHR_materials_* extensions (clearcoat, transmission, sheen, iridescence, ior, specular) |  |
| MeshStandardMaterial | `rubber` | exported as glTF metallic-roughness PBR |  |
| PerspectiveCamera | `camera` | emitted as camera.perspective (position, look-at target, vertical fov, near, far) |  |
| WebGLRenderer.toneMapping | `output` | emitted as createAuraApp({ output: { toneMapping: "aces", exposure } }) |  |
