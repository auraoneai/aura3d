# three.js bridge report: ruin

Generator `recipes/ruin.mjs` (sha256 368c73d51018), seed 1, params `{"ringRadius":2.55,"centerY":3.6}`, three r185.
GLB `.aura3d/three-bridge/ruin.glb` (310976 bytes, sha256 ca0c5713400e).

Supported 8, approximated 0, unsupported 0. Nothing is silently substituted: unsupported constructs are not reproduced, and each row says what the Aura3D output shows instead (hidden node, detached texture, or the unpatched base material).

## supported (8)

| construct | subject | note | native route |
|---|---|---|---|
| MeshStandardMaterial | `stone_dark` | exported as glTF metallic-roughness PBR |  |
| material.map | `stone_dark` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `stone` | exported as glTF metallic-roughness PBR |  |
| material.map | `stone` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `moss` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `runic_metal` | exported as glTF metallic-roughness PBR |  |
| PerspectiveCamera | `camera` | emitted as camera.perspective (position, look-at target, vertical fov, near, far) |  |
| WebGLRenderer.toneMapping | `output` | emitted as createAuraApp({ output: { toneMapping: "aces", exposure } }) |  |
