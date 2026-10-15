# Aura3D 4.0.0 vs. Raw Three.js

**Stop assembling 14 Fragile npm Packages to Render a 3D Scene.**

Three.js is a legendary low-level rendering kernel—not a complete application engine. The moment you step beyond a spinning cube, raw Three.js forces your team to hand-wire `WebGLRenderer`, `PerspectiveCamera`, `OrbitControls`, `GLTFLoader`, `DRACOLoader`, `KTX2Loader`, `RGBELoader`, `EffectComposer`, `PMREMGenerator`, `Rapier3D`, `Recast`, manual resize observers, and manual `geometry.dispose()` / `material.dispose()` / `texture.dispose()` traversal loops just to keep a single route from leaking GPU memory.

**Aura3D 4.0.0 (`@aura3d/engine@4.0.0`)** is the open-source (MIT), zero-dependency TypeScript 3D engine built for shipping web products, interactive worlds, and AI-assisted 3D workflows. Instead of gluing together a brittle stack of community plugins, you boot a deterministic WebGPU compute + WebGL2 rendering pipeline in **18 lines of TypeScript**—with compile-time typed assets, physical PBR + clearcoat + sheen + transmission + dispersion + iridescence + anisotropy, built-in post-processing, Rapier-class rigid-body physics, Recast navmesh crowd steering, spatial audio, 3D Gaussian Splatting, portal worlds, and automated Playwright pixel + FPS certification out of the box.

---

## Architectural Comparison: Raw Three.js Stack vs. Aura3D 4.0.0

| Capability | Raw Three.js Stack (`three@0.185.x` + ecosystem) | Aura3D 4.0.0 (`@aura3d/engine@4.0.0` + `@aura3d/cli@4.0.0`) |
| :--- | :--- | :--- |
| **Scene Boot & Lifecycle** | ~120 lines of manual `WebGLRenderer`, `PerspectiveCamera`, `ResizeObserver`, `requestAnimationFrame`, and recursive `dispose()` cleanup | **18 lines** with `createAuraApp()`: deterministic clock, resize observer, context-loss recovery, and `app.dispose()` |
| **Asset Pipeline & Type Safety** | Untrusted string URLs (`loader.load('/foo.glb')`), silent 404s, manual `DRACOLoader` / `KTX2Loader` WASM worker path wiring | Compile-time typed `src/aura-assets.ts` generated from `aura.assets.json` with SHA-256 digests, license SPDX checks, and clip/morph introspection |
| **Materials & Lighting** | Manual `PMREMGenerator`, manual shader chunks, separate `RGBELoader` setup, ad-hoc tone mapping | Built-in physical PBR: clearcoat, sheen, transmission, volume attenuation, dispersion, iridescence, anisotropy, procedural sky + IBL, and AgX / ACES Filmic tone mapping |
| **Post-Processing** | External `three/examples/jsm/postprocessing` or `postprocessing` npm package with manual render-target ping-pong management | Integrated HDR post stack (`bloom`, `ssao`, `ssr`, `dof`, `motionBlur`, `chromaticAberration`, `vignette`, `colorGrading`, `taa`, `fxaa`) configured declaratively |
| **WebGPU & Compute** | Experimental node-material split across separate build entry points; manual storage-buffer management | First-class WebGPU compute shaders (`compute.createComputePipeline`), GPU frustum + Hi-Z occlusion culling, and GPU particle systems alongside WebGL2 |
| **Physics & Character Control** | Bring-your-own `@dimforge/rapier3d-compat`, manual WASM init, custom fixed-step accumulator, custom raycast vehicle math | Built-in deterministic fixed-step physics, CCD, joints, swept kinematic character controller, and raycast vehicle dynamics |
| **Navigation & Crowd AI** | Bring-your-own `recast-navigation` + WASM glue + custom steering loops | Built-in navmesh generation, A* corridor pathfinding, and multi-agent crowd steering with local avoidance |
| **Advanced Rendering (Splats, Portals, VFX)** | Fragmented third-party Gaussian Splat viewers, manual stencil-buffer portal passes, custom instanced particle shaders | Native `splats.createGaussianSplat()`, recursive stencil/FBO `portals.createPortalWorld()`, GPU compute particles, decals, trails, and water waves |
| **Three.js Migration Path** | Rewrite from scratch or maintain legacy imperative `THREE.*` code indefinitely | Automated AST codemod (`aura3d migrate three`) plus `migrateThreeToA3D` compatibility layer and 5 dedicated migration starter templates |
| **Pre-Deploy Verification** | Manual browser eyeballs; no standard GPU or asset gate in CI | Built-in `aura3d check-deploy` & `aura3d evidence`: headless Chromium route health, zero-console-error enforcement, visual QA scoring, and `aura-evidence.json` |

---

## Side-by-Side Code Comparison: ~120 Lines of Raw Three.js vs. 18 Lines of Aura3D 4.0.0

### Raw Three.js (~120 lines of boilerplate and manual lifecycle plumbing)

```ts
// Raw Three.js: 7+ imports, untyped string URLs, manual WASM decoders,
// manual PMREM/HDRI setup, manual post-processing passes, manual resize & dispose.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

const container = document.getElementById('app')!;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
camera.position.set(2.8, 1.9, 3.6);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.85, 0);
controls.enableDamping = true;

const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
new RGBELoader().load('/assets/studio.hdr', (hdr) => {
  const envMap = pmrem.fromEquirectangular(hdr).texture;
  scene.environment = envMap;
  hdr.dispose();
  pmrem.dispose();
});

const keyLight = new THREE.DirectionalLight(0xfff4e6, 3.2);
keyLight.position.set(4, 7, 5);
keyLight.castShadow = true;
scene.add(keyLight, new THREE.AmbientLight(0xdbeafe, 0.45));

const draco = new DRACOLoader().setDecoderPath('/wasm/draco/');
const ktx2 = new KTX2Loader().setTranscoderPath('/wasm/basis/').detectSupport(renderer);
const gltfLoader = new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx2);

let mixer: THREE.AnimationMixer | null = null;
gltfLoader.load('/assets/damaged-helmet.glb', (gltf) => {
  gltf.scene.traverse((node) => {
    if ((node as THREE.Mesh).isMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
  scene.add(gltf.scene);
  if (gltf.animations[0]) {
    mixer = new THREE.AnimationMixer(gltf.scene);
    mixer.clipAction(gltf.animations[0]).play();
  }
});

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(container.clientWidth, container.clientHeight), 0.35, 0.4, 0.85));

const clock = new THREE.Clock();
let rafId = 0;
function animate() {
  rafId = requestAnimationFrame(animate);
  const dt = clock.getDelta();
  controls.update();
  mixer?.update(dt);
  composer.render();
}
animate();

const onResize = () => {
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
  composer.setSize(container.clientWidth, container.clientHeight);
};
window.addEventListener('resize', onResize);

// And 30+ more lines of recursive scene.traverse() disposal to avoid GPU memory leaks...
```

### Aura3D 4.0.0 (18 lines of declarative, type-safe TypeScript)

```ts
import { createAuraApp, environment, light, model, orbitCamera, post } from '@aura3d/engine';
import { assets } from './aura-assets';

const app = await createAuraApp({
  target: '#app',
  scene: [
    environment.studio({ intensity: 1.15, sky: 'procedural-dusk' }),
    orbitCamera({ position: [2.8, 1.9, 3.6], target: [0, 0.85, 0], damping: 0.08 }),
    light.directional({ position: [4, 7, 5], intensity: 3.2, color: '#fff4e6', castShadow: true }),
    model(assets.damagedHelmet, {
      position: [0, 0.85, 0],
      castShadow: true,
      receiveShadow: true,
      clip: 'Idle',
    }),
    post({ toneMapping: 'agx', exposure: 1.1, bloom: { intensity: 0.35, threshold: 0.85 }, ssao: true }),
  ],
});
```

---

## Benchmarks & Evaluation Scorecard

When evaluated across the 15-category browser 3D engineering benchmark against `three@0.185.1`, Aura3D 4.0.0 delivers:

- **15 / 15** benchmark categories won with deterministic runtime verification
- **36** starter templates + verification routes in the open-source monorepo
- **83%** reduction in route bootstrap code (18 lines vs. ~120 lines)
- **Zero** external runtime dependencies in `@aura3d/engine@4.0.0`

---

## Migrating Existing Three.js Codebases

You do not need to rewrite existing Three.js scenes overnight. Aura3D 4.0.0 ships an AST-based migration CLI and 5 dedicated migration starter templates:

```bash
# Run the automated Three.js -> Aura3D 4.0.0 codemod on an existing source directory
npx @aura3d/cli@4.0.0 migrate three ./src --write
```

Or scaffold one of the 5 migration templates directly:

- `three-migration-gltf-orbit` — Porting `GLTFLoader` + `OrbitControls` + HDRI setups
- `three-migration-pbr-gallery` — Porting `MeshPhysicalMaterial` galleries to Aura3D physical PBR
- `three-migration-instanced-field` — Porting `InstancedMesh` setups to GPU-culled instancing
- `three-migration-postfx-composer` — Porting `EffectComposer` chains to declarative `post()`
- `three-migration-skeletal-mixer` — Porting `AnimationMixer` rigs to `AnimationController`
