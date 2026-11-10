# three.js bridge report: clock

Generator `recipes/clock.mjs` (sha256 10730c8e59ad), seed 1, params `{"wood":"#6b3d1e","face":"#efe3c4","brass":"#c9a24a","includeMoving":false}`, three r185.
GLB `.aura3d/three-bridge/clock.glb` (103736 bytes, sha256 ff6298804c2e).

Supported 16, approximated 0, unsupported 0. Nothing is silently substituted: unsupported constructs are not reproduced, and each row says what the Aura3D output shows instead (hidden node, detached texture, or the unpatched base material).

## supported (16)

| construct | subject | note | native route |
|---|---|---|---|
| MeshStandardMaterial | `floor` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `wall` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `dark_wood` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `wood` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `interior` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `glass` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `brass` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `face` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `ink` | exported as glTF metallic-roughness PBR |  |
| PointLight | `clock__inner_glow` | emitted as native lights.point (world-space position/target; three intensity carried 1:1) |  |
| HemisphereLight | `hemi` | emitted as native lights.hemisphere (world-space position/target; three intensity carried 1:1) |  |
| PointLight | `lamp` | emitted as native lights.point (world-space position/target; three intensity carried 1:1) |  |
| DirectionalLight | `key` | emitted as native lights.directional (world-space position/target; three intensity carried 1:1) |  |
| Scene.background | `scene` | emitted as scene({ background }) |  |
| PerspectiveCamera | `camera` | emitted as camera.perspective (position, look-at target, vertical fov, near, far) |  |
| WebGLRenderer.toneMapping | `output` | emitted as createAuraApp({ output: { toneMapping: "aces", exposure } }) |  |
