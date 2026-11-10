# three.js bridge report: spider

Generator `recipes/spider.mjs` (sha256 283dc286af8d), seed 1, params `{"period":2,"bodyColor":"#3a2f33","legColor":"#5a3d36","samples":40}`, three r185.
GLB `.aura3d/three-bridge/spider.glb` (444756 bytes, sha256 03088a8f79b3).

Supported 11, approximated 0, unsupported 0. Nothing is silently substituted: unsupported constructs are not reproduced, and each row says what the Aura3D output shows instead (hidden node, detached texture, or the unpatched base material).

## supported (11)

| construct | subject | note | native route |
|---|---|---|---|
| MeshStandardMaterial | `ground_mat` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `body_mat` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `joint_mat` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `eye_mat` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `leg_mat` | exported as glTF metallic-roughness PBR |  |
| HemisphereLight | `fill` | emitted as native lights.hemisphere (world-space position/target; three intensity carried 1:1) |  |
| DirectionalLight | `key` | emitted as native lights.directional (world-space position/target; three intensity carried 1:1) |  |
| Scene.background | `scene` | emitted as scene({ background }) |  |
| AnimationClip | `walk` | exported explicitly through GLTFExporter({ animations }) |  |
| PerspectiveCamera | `camera` | emitted as camera.perspective (position, look-at target, vertical fov, near, far) |  |
| WebGLRenderer.toneMapping | `output` | emitted as createAuraApp({ output: { toneMapping: "aces", exposure } }) |  |
