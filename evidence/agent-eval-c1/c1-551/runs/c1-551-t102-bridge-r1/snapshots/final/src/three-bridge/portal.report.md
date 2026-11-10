# three.js bridge report: portal

Generator `recipes/portal.mjs` (sha256 9f335d0abed5), seed 1, params `{"blocks":18,"ringRadius":2.3}`, three r185.
GLB `.aura3d/three-bridge/portal.glb` (463272 bytes, sha256 bcd42a43a3e6).

Supported 15, approximated 0, unsupported 0. Nothing is silently substituted: unsupported constructs are not reproduced, and each row says what the Aura3D output shows instead (hidden node, detached texture, or the unpatched base material).

## supported (15)

| construct | subject | note | native route |
|---|---|---|---|
| MeshStandardMaterial | `ground` | exported as glTF metallic-roughness PBR |  |
| material.map | `ground` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `platform` | exported as glTF metallic-roughness PBR |  |
| material.map | `platform` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `rune_violet` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `rune_cyan` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `stone` | exported as glTF metallic-roughness PBR |  |
| material.map | `stone` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `stone_dark` | exported as glTF metallic-roughness PBR |  |
| material.map | `stone_dark` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `stone_moss` | exported as glTF metallic-roughness PBR |  |
| material.map | `stone_moss` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `runic_metal` | exported as glTF metallic-roughness PBR |  |
| PerspectiveCamera | `camera` | emitted as camera.perspective (position, look-at target, vertical fov, near, far) |  |
| WebGLRenderer.toneMapping | `output` | emitted as createAuraApp({ output: { toneMapping: "aces", exposure } }) |  |
