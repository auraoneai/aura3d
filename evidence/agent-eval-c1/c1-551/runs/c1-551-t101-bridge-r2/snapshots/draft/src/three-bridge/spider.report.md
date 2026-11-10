# three.js bridge report: spider

Generator `recipes/spider.mjs` (sha256 6e98eff79e29), seed 1, params `{"period":2,"body":"#3a2a24","leg":"#4a352c","joint":"#d9792b"}`, three r185.
GLB `.aura3d/three-bridge/spider.glb` (201072 bytes, sha256 b190696ef704).

Supported 8, approximated 0, unsupported 0. Nothing is silently substituted: unsupported constructs are not reproduced, and each row says what the Aura3D output shows instead (hidden node, detached texture, or the unpatched base material).

## supported (8)

| construct | subject | note | native route |
|---|---|---|---|
| MeshStandardMaterial | `spider_meshstandard_0` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `spider_meshstandard_1` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `spider_meshstandard_2` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `spider_meshstandard_3` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `spider_meshstandard_4` | exported as glTF metallic-roughness PBR |  |
| AnimationClip | `spider_walk` | exported explicitly through GLTFExporter({ animations }) |  |
| PerspectiveCamera | `camera` | emitted as camera.perspective (position, look-at target, vertical fov, near, far) |  |
| WebGLRenderer.toneMapping | `output` | emitted as createAuraApp({ output: { toneMapping: "none", exposure } }) |  |
