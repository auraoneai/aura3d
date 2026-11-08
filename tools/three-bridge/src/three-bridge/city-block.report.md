# three.js bridge report: city-block

Generator `recipes/city-block.mjs` (sha256 b337373c300d), seed 1, params `{"blocksX":4,"blocksZ":3,"lot":3.2,"street":1.6}`, three r185.
GLB `.aura3d/three-bridge/city-block.glb` (77048 bytes, sha256 8f9f5c55e491).

Supported 106, approximated 1, unsupported 2. Nothing is silently substituted: unsupported constructs are not reproduced, and each row says what the Aura3D output shows instead (hidden node, detached texture, or the unpatched base material).

## unsupported (2)

| construct | subject | note | native route |
|---|---|---|---|
| ShaderMaterial | `neon_sign` | custom shaders are not exported; GLTFExporter would write a default material, so meshes using it are hidden in the Aura3D output (port the shader by hand) | material.custom |
| Mesh | `sign` | uses a material the bridge cannot carry; hidden in the Aura3D output rather than shown with a substitute |  |

## approximated (1)

| construct | subject | note | native route |
|---|---|---|---|
| GLTFExporter | `export` | GLTFExporter: THREE.ShaderMaterial not supported. |  |

## supported (106)

| construct | subject | note | native route |
|---|---|---|---|
| MeshStandardMaterial | `asphalt` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `pavement` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `facade_0_0` | exported as glTF metallic-roughness PBR |  |
| material.map | `facade_0_0` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `facade_0_0` | exported as glTF metallic-roughness PBR |  |
| material.map | `facade_0_0` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `roof` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `facade_0_0` | exported as glTF metallic-roughness PBR |  |
| material.map | `facade_0_0` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `facade_0_0` | exported as glTF metallic-roughness PBR |  |
| material.map | `facade_0_0` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `facade_0_1` | exported as glTF metallic-roughness PBR |  |
| material.map | `facade_0_1` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `facade_0_1` | exported as glTF metallic-roughness PBR |  |
| material.map | `facade_0_1` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `facade_0_1` | exported as glTF metallic-roughness PBR |  |
| material.map | `facade_0_1` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `facade_0_1` | exported as glTF metallic-roughness PBR |  |
| material.map | `facade_0_1` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `facade_0_2` | exported as glTF metallic-roughness PBR |  |
| material.map | `facade_0_2` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `facade_0_2` | exported as glTF metallic-roughness PBR |  |
| material.map | `facade_0_2` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `facade_0_2` | exported as glTF metallic-roughness PBR |  |
| material.map | `facade_0_2` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `facade_0_2` | exported as glTF metallic-roughness PBR |  |
| material.map | `facade_0_2` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `facade_1_0` | exported as glTF metallic-roughness PBR |  |
| material.map | `facade_1_0` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `facade_1_0` | exported as glTF metallic-roughness PBR |  |
| material.map | `facade_1_0` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `facade_1_0` | exported as glTF metallic-roughness PBR |  |
| material.map | `facade_1_0` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `facade_1_0` | exported as glTF metallic-roughness PBR |  |
| material.map | `facade_1_0` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `facade_1_1` | exported as glTF metallic-roughness PBR |  |
| material.map | `facade_1_1` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `facade_1_1` | exported as glTF metallic-roughness PBR |  |
| material.map | `facade_1_1` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `facade_1_1` | exported as glTF metallic-roughness PBR |  |
| material.map | `facade_1_1` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `facade_1_1` | exported as glTF metallic-roughness PBR |  |
| material.map | `facade_1_1` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `facade_1_2` | exported as glTF metallic-roughness PBR |  |
| material.map | `facade_1_2` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `facade_1_2` | exported as glTF metallic-roughness PBR |  |
| material.map | `facade_1_2` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `facade_1_2` | exported as glTF metallic-roughness PBR |  |
| material.map | `facade_1_2` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `facade_1_2` | exported as glTF metallic-roughness PBR |  |
| material.map | `facade_1_2` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `facade_2_0` | exported as glTF metallic-roughness PBR |  |
| material.map | `facade_2_0` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `facade_2_0` | exported as glTF metallic-roughness PBR |  |
| material.map | `facade_2_0` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `facade_2_0` | exported as glTF metallic-roughness PBR |  |
| material.map | `facade_2_0` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `facade_2_0` | exported as glTF metallic-roughness PBR |  |
| material.map | `facade_2_0` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `facade_2_1` | exported as glTF metallic-roughness PBR |  |
| material.map | `facade_2_1` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `facade_2_1` | exported as glTF metallic-roughness PBR |  |
| material.map | `facade_2_1` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `facade_2_1` | exported as glTF metallic-roughness PBR |  |
| material.map | `facade_2_1` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `facade_2_1` | exported as glTF metallic-roughness PBR |  |
| material.map | `facade_2_1` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `facade_2_2` | exported as glTF metallic-roughness PBR |  |
| material.map | `facade_2_2` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `facade_2_2` | exported as glTF metallic-roughness PBR |  |
| material.map | `facade_2_2` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `facade_2_2` | exported as glTF metallic-roughness PBR |  |
| material.map | `facade_2_2` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `facade_2_2` | exported as glTF metallic-roughness PBR |  |
| material.map | `facade_2_2` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `facade_3_0` | exported as glTF metallic-roughness PBR |  |
| material.map | `facade_3_0` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `facade_3_0` | exported as glTF metallic-roughness PBR |  |
| material.map | `facade_3_0` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `facade_3_0` | exported as glTF metallic-roughness PBR |  |
| material.map | `facade_3_0` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `facade_3_0` | exported as glTF metallic-roughness PBR |  |
| material.map | `facade_3_0` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `facade_3_1` | exported as glTF metallic-roughness PBR |  |
| material.map | `facade_3_1` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `facade_3_1` | exported as glTF metallic-roughness PBR |  |
| material.map | `facade_3_1` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `facade_3_1` | exported as glTF metallic-roughness PBR |  |
| material.map | `facade_3_1` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `facade_3_1` | exported as glTF metallic-roughness PBR |  |
| material.map | `facade_3_1` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `facade_3_2` | exported as glTF metallic-roughness PBR |  |
| material.map | `facade_3_2` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `facade_3_2` | exported as glTF metallic-roughness PBR |  |
| material.map | `facade_3_2` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `facade_3_2` | exported as glTF metallic-roughness PBR |  |
| material.map | `facade_3_2` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| MeshStandardMaterial | `facade_3_2` | exported as glTF metallic-roughness PBR |  |
| material.map | `facade_3_2` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| InstancedMesh | `lamps` | exported through EXT_mesh_gpu_instancing |  |
| MeshStandardMaterial | `lamp_post` | exported as glTF metallic-roughness PBR |  |
| AmbientLight | `ambientlight` | emitted as native lights.ambient (world-space position/target; three intensity carried 1:1) |  |
| DirectionalLight | `sun` | emitted as native lights.directional (world-space position/target; three intensity carried 1:1) |  |
| Scene.background | `scene` | emitted as scene({ background }) |  |
| PerspectiveCamera | `camera` | emitted as camera.perspective (position, look-at target, vertical fov, near, far) |  |
| WebGLRenderer.toneMapping | `output` | emitted as createAuraApp({ output: { toneMapping: "aces", exposure } }) |  |
