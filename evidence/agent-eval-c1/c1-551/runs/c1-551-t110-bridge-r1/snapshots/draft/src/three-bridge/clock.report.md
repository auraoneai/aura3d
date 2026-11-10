# three.js bridge report: clock

Generator `recipes/clock.mjs` (sha256 1732a0ce2ef0), seed 1, params `{}`, three r185.
GLB `.aura3d/three-bridge/clock.glb` (136588 bytes, sha256 20e9042b2fc4).

Supported 18, approximated 0, unsupported 0. Nothing is silently substituted: unsupported constructs are not reproduced, and each row says what the Aura3D output shows instead (hidden node, detached texture, or the unpatched base material).

## supported (18)

| construct | subject | note | native route |
|---|---|---|---|
| MeshStandardMaterial | `clock_meshstandard_0` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `clock_meshstandard_1` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `clock_meshstandard_2` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `clock_meshstandard_3` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `clock_meshstandard_4` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `clock_meshstandard_5` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `clock_meshstandard_6` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `clock_meshstandard_7` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `clock_meshstandard_8` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `clock_meshstandard_9` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `clock_meshstandard_10` | exported as glTF metallic-roughness PBR |  |
| PointLight | `interior_lamp` | emitted as native lights.point (world-space position/target; three intensity carried 1:1) |  |
| PointLight | `room_lamp` | emitted as native lights.point (world-space position/target; three intensity carried 1:1) |  |
| PointLight | `fill_lamp` | emitted as native lights.point (world-space position/target; three intensity carried 1:1) |  |
| Scene.background | `scene` | emitted as scene({ background }) |  |
| AnimationClip | `pendulum_swing` | exported explicitly through GLTFExporter({ animations }) |  |
| PerspectiveCamera | `camera` | emitted as camera.perspective (position, look-at target, vertical fov, near, far) |  |
| WebGLRenderer.toneMapping | `output` | emitted as createAuraApp({ output: { toneMapping: "aces", exposure } }) |  |
