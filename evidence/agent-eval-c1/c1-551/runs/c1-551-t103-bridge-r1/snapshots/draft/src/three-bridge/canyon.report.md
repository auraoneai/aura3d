# three.js bridge report: canyon

Generator `recipes/canyon.mjs` (sha256 859c2b537c1e), seed 1, params `{"period":300,"zNear":20,"zFar":-740}`, three r185.
GLB `.aura3d/three-bridge/canyon.glb` (13418836 bytes, sha256 a73b3f06977b).

Supported 5, approximated 0, unsupported 0. Nothing is silently substituted: unsupported constructs are not reproduced, and each row says what the Aura3D output shows instead (hidden node, detached texture, or the unpatched base material).

## supported (5)

| construct | subject | note | native route |
|---|---|---|---|
| MeshStandardMaterial | `sandstone` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `boulderStone` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `deadWood` | exported as glTF metallic-roughness PBR |  |
| PerspectiveCamera | `camera` | emitted as camera.perspective (position, look-at target, vertical fov, near, far) |  |
| WebGLRenderer.toneMapping | `output` | emitted as createAuraApp({ output: { toneMapping: "aces", exposure } }) |  |
