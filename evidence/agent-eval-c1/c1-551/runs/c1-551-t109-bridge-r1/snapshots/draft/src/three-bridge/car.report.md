# three.js bridge report: car

Generator `recipes/car.mjs` (sha256 12314bd65b11), seed 1, params `{"paint":"#a30a1c","length":1.95,"width":0.86,"height":0.46}`, three r185.
GLB `.aura3d/three-bridge/car.glb` (1136396 bytes, sha256 90db962cc41c).

Supported 11, approximated 0, unsupported 0. Nothing is silently substituted: unsupported constructs are not reproduced, and each row says what the Aura3D output shows instead (hidden node, detached texture, or the unpatched base material).

## supported (11)

| construct | subject | note | native route |
|---|---|---|---|
| MeshPhysicalMaterial | `candy_paint` | exported as glTF PBR with KHR_materials_* extensions (clearcoat, transmission, sheen, iridescence, ior, specular) |  |
| material.map | `candy_paint` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| material.roughnessMap | `candy_paint` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| material.metalnessMap | `candy_paint` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshPhysicalMaterial | `cabin_glass` | exported as glTF PBR with KHR_materials_* extensions (clearcoat, transmission, sheen, iridescence, ior, specular) |  |
| MeshStandardMaterial | `chrome` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `headlamp` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `taillamp` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `rubber` | exported as glTF metallic-roughness PBR |  |
| PerspectiveCamera | `camera` | emitted as camera.perspective (position, look-at target, vertical fov, near, far) |  |
| WebGLRenderer.toneMapping | `output` | emitted as createAuraApp({ output: { toneMapping: "aces", exposure } }) |  |
