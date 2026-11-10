# three.js bridge report: canyon

Generator `recipes/canyon.mjs` (sha256 65e1de18f39e), seed 1, params `{"period":200,"cols":190,"spacing":1}`, three r185.
GLB `.aura3d/three-bridge/canyon.glb` (6417172 bytes, sha256 f4c1351a5728).

Supported 5, approximated 0, unsupported 0. Nothing is silently substituted: unsupported constructs are not reproduced, and each row says what the Aura3D output shows instead (hidden node, detached texture, or the unpatched base material).

## supported (5)

| construct | subject | note | native route |
|---|---|---|---|
| MeshStandardMaterial | `sandstone` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `boulder` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `deadwood` | exported as glTF metallic-roughness PBR |  |
| PerspectiveCamera | `camera` | emitted as camera.perspective (position, look-at target, vertical fov, near, far) |  |
| WebGLRenderer.toneMapping | `output` | emitted as createAuraApp({ output: { toneMapping: "aces", exposure } }) |  |
