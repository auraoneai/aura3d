# three.js bridge report: shader-kiosk

Generator `recipes/shader-kiosk.mjs` (sha256 e079d161a0ad), seed 1, params `{"glow":"#38d9ff","bands":9,"top":"#1b2440","bottom":"#4a2a5e"}`, three r185.
GLB `.aura3d/three-bridge/shader-kiosk.glb` (111912 bytes, sha256 33a5298bfc52).

Supported 8, approximated 3, unsupported 2. Nothing is silently substituted: unsupported constructs are not reproduced, and each row says what the Aura3D output shows instead (hidden node, detached texture, or the unpatched base material).

## unsupported (2)

| construct | subject | note | native route |
|---|---|---|---|
| ShaderMaterial | `sign_chunks` | not carried as material.custom: uses three shader chunks (#include); the custom path has no three chunk library. Meshes using it are hidden in the Aura3D output (port the shader by hand) | material.custom |
| Mesh | `sign` | uses a material the bridge cannot carry; hidden in the Aura3D output rather than shown with a substitute |  |

## approximated (3)

| construct | subject | note | native route |
|---|---|---|---|
| RawShaderMaterial | `backdrop_gradient` | carried as material.custom (GLSL pass-through; three built-ins map to the Aura3D prelude aliases) on a placeholder slot of the same name; uniform values are the export-time values (top, bottom); drive them at runtime with the node's setUniform; output is sRGB-decoded so Aura3D's output encode shows the values three wrote to the canvas; under a tone-mapped output Aura3D also tone-maps it (three does not tone-map a ShaderMaterial without its tonemapping chunk) | material.custom |
| ShaderMaterial | `orb_glow` | carried as material.custom (GLSL pass-through; three built-ins map to the Aura3D prelude aliases) on a placeholder slot of the same name; uniform "time" is driven by the Aura3D clock (uTime, seconds since mount) instead of the three.js loop; uniform values are the export-time values (glow, bands); drive them at runtime with the node's setUniform; output is sRGB-decoded so Aura3D's output encode shows the values three wrote to the canvas; under a tone-mapped output Aura3D also tone-maps it (three does not tone-map a ShaderMaterial without its tonemapping chunk) | material.custom |
| GLTFExporter | `export` | GLTFExporter: THREE.ShaderMaterial not supported. |  |

## supported (8)

| construct | subject | note | native route |
|---|---|---|---|
| MeshStandardMaterial | `floor` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `plinth` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `trim` | exported as glTF metallic-roughness PBR |  |
| HemisphereLight | `hemispherelight` | emitted as native lights.hemisphere (world-space position/target; three intensity carried 1:1) |  |
| DirectionalLight | `key` | emitted as native lights.directional (world-space position/target; three intensity carried 1:1) |  |
| Scene.background | `scene` | emitted as scene({ background }) |  |
| PerspectiveCamera | `camera` | emitted as camera.perspective (position, look-at target, vertical fov, near, far) |  |
| WebGLRenderer.toneMapping | `output` | emitted as createAuraApp({ output: { toneMapping: "none", exposure } }) |  |
