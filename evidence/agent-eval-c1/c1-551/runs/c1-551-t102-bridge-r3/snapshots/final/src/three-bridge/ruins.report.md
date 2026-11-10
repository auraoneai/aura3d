# three.js bridge report: ruins

Generator `recipes/ruins.mjs` (sha256 92556d2584ac), seed 1, params `{"ringRadius":2.6,"blocks":14}`, three r185.
GLB `.aura3d/three-bridge/ruins.glb` (452088 bytes, sha256 a92e93205f80).

Supported 11, approximated 0, unsupported 0. Nothing is silently substituted: unsupported constructs are not reproduced, and each row says what the Aura3D output shows instead (hidden node, detached texture, or the unpatched base material).

## supported (11)

| construct | subject | note | native route |
|---|---|---|---|
| MeshStandardMaterial | `ground` | exported as glTF metallic-roughness PBR |  |
| material.map | `ground` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `stone_dark` | exported as glTF metallic-roughness PBR |  |
| material.map | `stone_dark` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `stone` | exported as glTF metallic-roughness PBR |  |
| material.map | `stone` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `rune_metal` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `rune_glow` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `moss` | exported as glTF metallic-roughness PBR |  |
| PerspectiveCamera | `camera` | emitted as camera.perspective (position, look-at target, vertical fov, near, far) |  |
| WebGLRenderer.toneMapping | `output` | emitted as createAuraApp({ output: { toneMapping: "aces", exposure } }) |  |
