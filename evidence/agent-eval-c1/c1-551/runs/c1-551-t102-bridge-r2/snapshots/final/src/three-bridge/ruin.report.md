# three.js bridge report: ruin

Generator `recipes/ruin.mjs` (sha256 5901520c1415), seed 1, params `{"ringRadius":2.55,"centerY":3.6}`, three r185.
GLB `.aura3d/three-bridge/ruin.glb` (311200 bytes, sha256 258528bb9549).

Supported 10, approximated 0, unsupported 0. Nothing is silently substituted: unsupported constructs are not reproduced, and each row says what the Aura3D output shows instead (hidden node, detached texture, or the unpatched base material).

## supported (10)

| construct | subject | note | native route |
|---|---|---|---|
| MeshStandardMaterial | `ground_stone` | exported as glTF metallic-roughness PBR |  |
| material.map | `ground_stone` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `stone_dark` | exported as glTF metallic-roughness PBR |  |
| material.map | `stone_dark` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `stone` | exported as glTF metallic-roughness PBR |  |
| material.map | `stone` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `moss` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `runic_metal` | exported as glTF metallic-roughness PBR |  |
| PerspectiveCamera | `camera` | emitted as camera.perspective (position, look-at target, vertical fov, near, far) |  |
| WebGLRenderer.toneMapping | `output` | emitted as createAuraApp({ output: { toneMapping: "aces", exposure } }) |  |
