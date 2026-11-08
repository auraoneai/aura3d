# three.js bridge report: stylized-car

Generator `recipes/stylized-car.mjs` (sha256 3631df89cf90), seed 1, params `{"paint":"#2a6fd2","wheelBase":2.4}`, three r185.
GLB `.aura3d/three-bridge/stylized-car.glb` (65772 bytes, sha256 ea5fb0acbcaf).

Supported 13, approximated 1, unsupported 0. Nothing is silently substituted: unsupported constructs are not reproduced, and each row says what the Aura3D output shows instead (hidden node, detached texture, or the unpatched base material).

## approximated (1)

| construct | subject | note | native route |
|---|---|---|---|
| RoomEnvironment | `scene` | image-based light emitted as environments.neutral (a generated room probe, not three's PMREM) | environments.neutral |

## supported (13)

| construct | subject | note | native route |
|---|---|---|---|
| MeshPhysicalMaterial | `paint` | exported as glTF PBR with KHR_materials_* extensions (clearcoat, transmission, sheen, iridescence, ior, specular) |  |
| MeshStandardMaterial | `glass` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `headlamp` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `taillamp` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `chrome` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `rubber` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `turntable` | exported as glTF metallic-roughness PBR |  |
| HemisphereLight | `hemispherelight` | emitted as native lights.hemisphere (world-space position/target; three intensity carried 1:1) |  |
| DirectionalLight | `key` | emitted as native lights.directional (world-space position/target; three intensity carried 1:1) |  |
| Scene.background | `scene` | emitted as scene({ background }) |  |
| AnimationClip | `wheel_spin` | exported explicitly through GLTFExporter({ animations }) |  |
| PerspectiveCamera | `camera` | emitted as camera.perspective (position, look-at target, vertical fov, near, far) |  |
| WebGLRenderer.toneMapping | `output` | emitted as createAuraApp({ output: { toneMapping: "aces", exposure } }) |  |
