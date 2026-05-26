import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

type Category =
  | "animation"
  | "asset-loaders"
  | "camera"
  | "controls"
  | "core-scene"
  | "decals"
  | "effects"
  | "geometry"
  | "helpers"
  | "instancing"
  | "lines-points-sprites"
  | "materials-basic"
  | "materials-pbr"
  | "materials-physical"
  | "morph-targets"
  | "nodes-shaders"
  | "particles"
  | "physics-integration"
  | "postprocessing"
  | "render-targets"
  | "raycasting-picking"
  | "shadow"
  | "skinning"
  | "texture-compression"
  | "textures"
  | "transparency-transmission"
  | "webgpu"
  | "webxr";

type Priority = "high" | "medium" | "low";
type Status = "unsupported" | "internal-only" | "partial" | "matched" | "exceeded";
type Track = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K" | "L";

interface InventoryItem {
  readonly threeExampleId: string;
  readonly threeUrl: string;
  readonly category: Category;
  readonly priority: Priority;
  readonly a3dRoute: string | null;
  readonly a3dStatus: Status;
  readonly sameSceneAvailable: boolean;
  readonly usesRuntimeThree: boolean;
  readonly startupMs: number | null;
  readonly firstFrameMs: number | null;
  readonly fpsMedian: number | null;
  readonly visualStatus: "accepted" | "needs-review" | "rejected" | "not-built";
  readonly knownDeltas: readonly string[];
  readonly blockingFeatures: readonly string[];
  readonly constructionTracks: readonly Track[];
  readonly ownerPackages: readonly string[];
  readonly tests: readonly string[];
  readonly screenshots: readonly string[];
}

interface TrackSummary {
  readonly track: Track;
  readonly title: string;
  readonly packages: readonly string[];
  readonly items: readonly string[];
}

const REPORT_PATH = "tests/reports/threejs-parity/threejs-inventory.json";
const BACKLOG_DOC_PATH = "docs/project/threejs-parity-code-backlog.md";
const INVENTORY_DOC_PATH = "docs/project/threejs-parity-threejs-inventory.md";
const PARITY_DOC_PATH = "docs/project/threejs-parity-parity-matrix.md";
const CLAIM_DOC_PATH = "docs/project/threejs-parity-claim-boundary.md";
const STATUS_DOC_PATH = "docs/project/threejs-parity-status.md";

const parityFloorBlockers = [
  "First-party math engine: vectors, matrices, quaternions, rays, bounds, frustums, projection, and transform math.",
  "Scene graph: Object3D-style hierarchy, inherited transforms, matrix auto-update traversal, cameras, lights, visibility, render order, and disposal.",
  "Geometry and GPU buffers: vertex attributes, interleaved buffers, index buffers, dynamic updates, GLTF attributes, instancing attributes, and buffer disposal.",
  "Shader/material/state system: GLSL compile/link/validate, uniform/attribute/texture binding, public materials, and CPU-side WebGL state caching.",
  "Renderer/camera/draw pipeline: render loop, resize/DPR, view-projection updates, frustum culling, render queue construction, sorting, and drawElements/drawArrays dispatch.",
  "Advanced render management: opaque front-to-back sorting, transparent back-to-front sorting, batching where valid, instanced rendering, per-instance attributes, and draw/state diagnostics.",
  "Hardware animation: bone hierarchy, inverse bind matrices, JOINTS/WEIGHTS import, GPU skinning palette upload, shader skinning, normal/tangent skinning, and multi-character palette diagnostics.",
  "PBR and IBL: Cook-Torrance BRDF, GGX, Smith, Fresnel-Schlick, metallic/roughness, normal/AO/emissive/physical extensions, HDR environment preparation, irradiance, prefiltered specular, and BRDF LUT or documented equivalent.",
  "Postprocess and render targets: FBO abstraction, render-to-texture, fullscreen passes, ping-pong composer chain, depth texture routing, bloom bright/blur/composite passes, and resize/disposal behavior.",
  "Spatial scale and memory: bounds, BVH/octree or equivalent acceleration, broad-phase culling, raycast acceleration, explicit dispose(), WebGL delete calls, ownership rules, teardown, diagnostics, and leak tests."
] as const;

const trackTitles: Record<Track, string> = {
  A: "Core Runtime And Scene API",
  B: "Renderer Backends And Render Graph",
  C: "Materials, Textures, Lighting, HDR, IBL, Shadows",
  D: "Asset Loaders And Resource Pipeline",
  E: "Animation, Skinning, Morphs, IK, Character Systems",
  F: "Controls, Picking, Transform Tools, Interaction",
  G: "Geometry, Lines, Points, Sprites, Helpers, Instancing",
  H: "Postprocess, Render Targets, Effects",
  I: "Performance, Memory, Scale, Bundle Health",
  J: "Three.js Compatibility And Migration Code",
  K: "Product Apps, Examples, Templates, Docs",
  L: "Verification, Reports, Dashboards, Claims"
};

const trackPackages: Record<Track, readonly string[]> = {
  A: ["packages/scene", "packages/math", "packages/engine"],
  B: ["packages/rendering"],
  C: ["packages/rendering", "packages/environments", "packages/materials"],
  D: ["packages/assets"],
  E: ["packages/animation", "packages/assets", "packages/rendering"],
  F: ["packages/controls", "packages/input", "packages/editor-runtime"],
  G: ["packages/rendering", "packages/scene", "packages/debug"],
  H: ["packages/rendering"],
  I: ["packages/rendering", "benchmarks"],
  J: ["packages/three-compat", "tools/threejs-parity-migration-audit"],
  K: ["packages/workflows", "apps/threejs-parity-*", "templates"],
  L: ["tools/threejs-parity-*", "tests/browser", "tests/unit", "tests/reports"]
};

const inventory: readonly InventoryItem[] = [
  item("webgl_animation_keyframes", "animation", "high", "/apps/animation-keyframes/", "matched", ["E", "D", "C", "K"], ["Imported clip playback runs through public A3D mixer controls and publishes public AnimationMotionQualityTracker diagnostics for sample count, time range, pose diversity, and healthy motion. Three.js parity animation-keyframes parity now renders the same Robot Expressive GLB and Dance clip through A3D beside an actual THREE.WebGLRenderer scene using Three.js GLTFLoader and AnimationMixer at the same sample time. The browser gate verifies same asset, same clip, real Three.js animation/runtime usage, A3D track application and skinning palette updates, nonblank screenshots, and side-by-side evidence. GLTFLoader also disambiguates duplicate glTF node names before creating animation track targets so keyframe tracks bind to the intended node instead of every duplicate name."], [], ["tests/browser/current-routes-animation-examples.spec.ts", "tests/browser/threejs-parity-animation-keyframes-parity.spec.ts", "tests/assets/gltf-inspection.test.ts"], ["tests/reports/current-routes/animation/keyframes.png", "tests/reports/threejs-parity/animation-keyframes-parity/a3d-animation-keyframes.png", "tests/reports/threejs-parity/animation-keyframes-parity/threejs-animation-keyframes.png", "tests/reports/threejs-parity/animation-keyframes-parity/side-by-side.png"]),
  item("webgl_animation_skinning_blending", "skinning", "high", "/apps/skinning-blending/", "matched", ["E", "C", "K"], ["Route uses public imported mixer clip actions and publishes AnimationMotionQualityTracker diagnostics for the blended skinning sample stream. Three.js parity skinning-blending parity now renders the same Robot Expressive GLB with the same Idle / Walking / Running blend weights through A3D beside an actual THREE.WebGLRenderer scene using Three.js GLTFLoader and weighted AnimationMixer actions. The browser gate verifies same asset, same blend clips, real Three.js animation/runtime usage, A3D track application and skinning palette updates, nonblank screenshots, and side-by-side evidence without claiming every transition scheduler, additive layer, IK rig, or retargeting behavior."], [], ["tests/browser/current-routes-animation-examples.spec.ts", "tests/browser/threejs-parity-skinning-blending-parity.spec.ts"], ["tests/reports/current-routes/animation/skinning-blending.png", "tests/reports/threejs-parity/skinning-blending-parity/a3d-skinning-blending.png", "tests/reports/threejs-parity/skinning-blending-parity/threejs-skinning-blending.png", "tests/reports/threejs-parity/skinning-blending-parity/side-by-side.png"]),
  item("webgl_animation_skinning_additive_blending", "skinning", "high", "/apps/skinning-additive/", "matched", ["E", "K"], ["Route uses public imported mixer sample blending for masked additive clips and publishes AnimationMotionQualityTracker diagnostics for the additive layer sample stream. Three.js parity skinning-additive parity now renders the same Robot Expressive GLB with Walking as the base clip and Wave as an upper-body additive layer through A3D beside an actual THREE.WebGLRenderer scene using Three.js GLTFLoader, weighted AnimationMixer actions, and AdditiveAnimationBlendMode. The browser gate verifies same asset, same base/additive clips, real Three.js additive runtime usage, A3D track application and skinning palette updates, nonblank screenshots, and side-by-side evidence without claiming every additive clip, retargeted skeleton, IK rig, transition graph, or mask authoring workflow."], [], ["tests/browser/current-routes-animation-examples.spec.ts", "tests/browser/threejs-parity-skinning-additive-parity.spec.ts"], ["tests/reports/current-routes/animation/additive-blending.png", "tests/reports/threejs-parity/skinning-additive-parity/a3d-skinning-additive.png", "tests/reports/threejs-parity/skinning-additive-parity/threejs-skinning-additive.png", "tests/reports/threejs-parity/skinning-additive-parity/side-by-side.png"]),
  item("webgl_animation_skinning_ik", "skinning", "high", "/apps/skinning-ik/", "matched", ["E", "K"], ["IK route uses a public imported skeleton IK controller and publishes AnimationMotionQualityTracker diagnostics for target-driven pose updates. Three.js parity skinning-IK parity now renders the same Robot Expressive GLB through A3D beside an actual THREE.WebGLRenderer scene using Three.js GLTFLoader, AnimationMixer, and loaded bone transforms for an independent two-bone right-arm IK reference. The browser gate verifies same asset, same base clip, real Three.js loader/renderer/mixer/bone-transform usage, A3D track application and skinning palette updates, endpoint proximity to the target, nonblank screenshots, and side-by-side evidence without claiming every IK helper/control UI, CCD solver, full-body IK rig, or retargeted skeleton behavior."], [], ["tests/browser/current-routes-animation-examples.spec.ts", "tests/browser/threejs-parity-skinning-ik-parity.spec.ts"], ["tests/reports/current-routes/animation/skinning-ik.png", "tests/reports/threejs-parity/skinning-ik-parity/a3d-skinning-ik.png", "tests/reports/threejs-parity/skinning-ik-parity/threejs-skinning-ik.png", "tests/reports/threejs-parity/skinning-ik-parity/side-by-side.png"]),
  item("webgl_animation_multiple", "animation", "high", "/apps/animation-multiple/", "matched", ["E", "D", "K"], ["The CurrentRoutes Animation Multiple route uses a public imported animation clone sampler for independent Soldier samples and publishes public AnimationMotionQualityTracker diagnostics for sample count, time range, pose diversity, and healthy motion. Three.js parity animation-multiple parity renders the same Soldier GLB as three independent A3D clone-sampler subjects beside an actual THREE.WebGLRenderer scene using Three.js GLTFLoader, SkeletonUtils.clone, and one AnimationMixer per clone for Walk / Run / Idle. The browser gate verifies same asset, same clips, same clone count, real Three.js animation/runtime usage, A3D skinning palette updates, nonblank screenshots, and side-by-side evidence without claiming every animation feature."], [], ["tests/browser/current-routes-animation-examples.spec.ts", "tests/browser/threejs-parity-animation-multiple-parity.spec.ts"], ["tests/reports/current-routes/animation/multiple.png", "tests/reports/threejs-parity/animation-multiple-parity/a3d-animation-multiple.png", "tests/reports/threejs-parity/animation-multiple-parity/threejs-animation-multiple.png", "tests/reports/threejs-parity/animation-multiple-parity/side-by-side.png"]),
  item("webgl_animation_walk", "animation", "high", "/apps/animation-walk/", "matched", ["E", "D", "K"], ["Route now renders the imported Soldier GLB Walk clip through the public A3D glTF animation runtime with root-motion locomotion controls and AnimationMotionQualityTracker diagnostics for stride/root-motion progression. Three.js parity animation-walk parity renders the same Soldier GLB and Walk clip through A3D beside an actual THREE.WebGLRenderer scene using Three.js GLTFLoader and AnimationMixer at the same sample time. The browser gate verifies same asset, same Walk clip, real Three.js loader/renderer/mixer usage, A3D track application and skinning palette updates, nonblank screenshots, and side-by-side evidence without claiming every locomotion-controller, foot-locking, retargeting, or crowd-navigation behavior."], [], ["tests/browser/current-routes-animation-examples.spec.ts", "tests/browser/threejs-parity-animation-walk-parity.spec.ts"], ["tests/reports/current-routes/animation/walk.png", "tests/reports/threejs-parity/animation-walk-parity/a3d-animation-walk.png", "tests/reports/threejs-parity/animation-walk-parity/threejs-animation-walk.png", "tests/reports/threejs-parity/animation-walk-parity/side-by-side.png"]),
  item("webgl_morphtargets", "morph-targets", "high", "/apps/skinning-morph/", "matched", ["E", "D", "C", "K"], ["Morph target route uses a public imported morph target controller and publishes AnimationMotionQualityTracker diagnostics for morph/skin sample progression. Three.js parity morph-target parity renders the same Robot Expressive GLB with the same body clip and manual head morph weights through A3D beside an actual THREE.WebGLRenderer scene using Three.js GLTFLoader, AnimationMixer, and real morphTargetInfluences on the imported head meshes. The browser gate verifies same asset, same body clip, real Three.js loader/renderer/mixer/morph influence usage, A3D morph-weight application, nonblank screenshots, and side-by-side evidence without claiming every morph material variant, extreme-target combination, blendshape authoring workflow, or retargeted facial rig."], [], ["tests/browser/current-routes-animation-examples.spec.ts", "tests/browser/threejs-parity-morphtargets-parity.spec.ts"], ["tests/reports/current-routes/animation/skinning-morph.png", "tests/reports/threejs-parity/morphtargets-parity/a3d-morphtargets.png", "tests/reports/threejs-parity/morphtargets-parity/threejs-morphtargets.png", "tests/reports/threejs-parity/morphtargets-parity/side-by-side.png"]),

  item("webgl_loader_gltf", "asset-loaders", "high", "/apps/flagship-viewer/", "matched", ["D", "C", "K"], ["A3D loads and renders the Damaged Helmet GLB through public GLTFLoader/render-resource paths in the flagship viewer, publishes loader/material/texture diagnostics, and Three.js parity GLTF parity now renders that same local GLB beside an actual THREE.WebGLRenderer using Three.js GLTFLoader. The gate verifies mesh/material/texture counts, no unsupported extensions, comparable bounds, nonblank screenshots, and side-by-side evidence without claiming every glTF extension path."], [], ["tests/assets/current-routes-gltf-loader-corpus.test.ts", "tests/browser/current-routes-flagship-viewer.spec.ts", "tests/browser/threejs-parity-gltf-parity.spec.ts"], ["tests/reports/flagship-viewer/flagship-viewer.png", "tests/reports/threejs-parity/gltf-parity/a3d-gltf.png", "tests/reports/threejs-parity/gltf-parity/threejs-gltf.png", "tests/reports/threejs-parity/gltf-parity/side-by-side.png"]),
  item("webgl_loader_gltf_compressed", "asset-loaders", "high", "/apps/loader-compression/", "matched", ["D", "C", "K"], ["GLTFLoader exposes Draco, Meshopt, and KTX2/Basis support hooks plus public extension support metadata; CurrentRoutes route decodes EXT_meshopt_compression and KHR_draco_mesh_compression through public loader hooks, browser Draco uses the real draco3d WASM decoder path, and asset-viewer browser evidence now generates and renders Meshopt and Draco compressed fixtures with decoded-byte/decode-timing telemetry. The browser and unit gates verify required-extension handling, decoder invocation, decoded geometry, visible rendered pixels, screenshot artifacts, and no unsupported required extensions for the scoped mesh-compression paths without claiming every compressed asset in the Khronos corpus or every decoder edge case."], [], ["tests/browser/current-routes-animation-examples.spec.ts", "tests/browser/asset-compression-browser.spec.ts", "tests/assets/gltf-compression-decoders.test.ts", "tests/assets/gltf-optional-external-decoders.test.ts"], ["tests/reports/current-routes/loaders/loader-compression.png", "tests/reports/external-parity-asset-compression/meshopt-browser.png", "tests/reports/external-parity-asset-compression/draco-browser.png"]),
  item("webgl_loader_gltf_instancing", "asset-loaders", "high", "/apps/loader-instancing/", "matched", ["D", "G", "I", "K"], ["GLTFLoader imports required EXT_mesh_gpu_instancing TRS instance transforms into public Renderable.instanceTransforms, the renderer submits instanced renderables through WebGL2 divisor-backed draw paths, and the CurrentRoutes loader-instancing route renders a required EXT_mesh_gpu_instancing glTF fixture through public loader/runtime hooks. The browser and unit gates verify extension metadata, instance count, instanced renderable count, no unsupported required extensions, visible route output, the targeted GLTFLoader import path, and the native instancing renderer path without claiming every custom per-instance attribute or large external instancing corpus asset."], [], ["tests/browser/current-routes-animation-examples.spec.ts", "tests/unit/workstream5-runtime.test.ts -t imports EXT_mesh_gpu_instancing", "tests/unit/rendering/renderer.test.ts", "tests/unit/rendering/current-routes-webgl2-hot-path.test.ts"], ["tests/reports/current-routes/loaders/loader-instancing.png"]),
  item("webgl_loader_gltf_sheen", "materials-physical", "high", "/apps/loader-material-extensions/", "matched", ["C", "D", "K"], ["GLTFLoader parses KHR_materials_sheen into public material assets, the CurrentRoutes material-extension route proves scalar sheen uniforms reach A3D PBR materials, and Three.js parity loader-material-extensions parity now renders the same generated required-extension glTF fixture through A3D beside an actual THREE.WebGLRenderer using Three.js GLTFLoader. The browser gate verifies the same fixture hash, actual Three.js loader/renderer usage, A3D sheen uniforms, Three.js MeshPhysicalMaterial sheen fields, nonblank screenshots, and side-by-side evidence without claiming every textured sheen corpus asset."], [], ["tests/browser/current-routes-animation-examples.spec.ts", "tests/browser/threejs-parity-loader-material-extensions-parity.spec.ts"], ["tests/reports/current-routes/loaders/material-extensions.png", "tests/reports/threejs-parity/loader-material-extensions-parity/a3d-loader-material-extensions.png", "tests/reports/threejs-parity/loader-material-extensions-parity/threejs-loader-material-extensions.png", "tests/reports/threejs-parity/loader-material-extensions-parity/side-by-side.png"]),
  item("webgl_loader_gltf_transmission", "transparency-transmission", "high", "/apps/loader-material-extensions/", "matched", ["C", "D", "H", "K"], ["GLTFLoader parses KHR_materials_transmission into public material assets, the CurrentRoutes material-extension route proves transmission uniforms plus transparent render state reach A3D PBR materials, and Three.js parity loader-material-extensions parity now renders the same generated required-extension glTF fixture through A3D beside an actual THREE.WebGLRenderer using Three.js GLTFLoader. The browser gate verifies the same fixture hash, actual Three.js loader/renderer usage, A3D transmission uniforms, A3D blend state, Three.js MeshPhysicalMaterial transmission fields, nonblank screenshots, and side-by-side evidence without claiming the separate scene-color refraction/backdrop feature covered by the physical transmission backlog item."], [], ["tests/browser/current-routes-animation-examples.spec.ts", "tests/browser/threejs-parity-loader-material-extensions-parity.spec.ts"], ["tests/reports/current-routes/loaders/material-extensions.png", "tests/reports/threejs-parity/loader-material-extensions-parity/a3d-loader-material-extensions.png", "tests/reports/threejs-parity/loader-material-extensions-parity/threejs-loader-material-extensions.png", "tests/reports/threejs-parity/loader-material-extensions-parity/side-by-side.png"]),
  item("webgl_loader_gltf_variants", "asset-loaders", "medium", "/apps/loader-gltf-variants/", "matched", ["D", "C", "K"], ["GLTFLoader parses KHR_materials_variants metadata, createScene/createGLTFRenderResources expose public materialVariant selection, and the CurrentRoutes variants route proves browser-visible variant switching with route diagnostics and screenshot evidence. The implementation covers the same glTF extension semantics used by Three.js GLTFLoader for material variant selection without requiring route-local material swaps."], [], ["tests/unit/workstream5-runtime.test.ts", "tests/browser/current-routes-animation-examples.spec.ts"], ["tests/reports/current-routes/loaders/gltf-variants.png"]),
  item("webgl_loader_texture_basis", "texture-compression", "high", "/apps/loader-ktx2/", "matched", ["D", "C", "K"], ["KTX2/Basis texture path is implemented through public createGLTFRenderResources transcoding, the CurrentRoutes KTX2 route proves required KHR_texture_basisu data becomes a A3D compressed texture with fallback mips, and browser asset-viewer evidence now opens a KHR_texture_basisu fixture backed by a real local KTX2 file. The browser and unit gates verify decoded texture dimensions, selected runtime compressed format, fallback byte length, mip levels, rendered pixels, screenshot artifacts, and the real transcodeKTX2BasisTexture path without claiming every GPU compression format on every device."], [], ["tests/browser/current-routes-animation-examples.spec.ts", "tests/browser/asset-compression-browser.spec.ts", "tests/assets/gltf-compression-decoders.test.ts"], ["tests/reports/current-routes/loaders/loader-ktx2.png", "tests/reports/external-parity-asset-compression/basisu-browser.png"]),
  item("webgl_loader_texture_ktx2", "texture-compression", "high", "/apps/loader-ktx2/", "matched", ["D", "C", "K"], ["KTX2 texture path is implemented through public createGLTFRenderResources transcoding, the CurrentRoutes KTX2 route proves required KHR_texture_basisu data becomes a A3D compressed texture with fallback mips, and browser asset-viewer evidence now opens a KHR_texture_basisu fixture backed by a real local KTX2 file. The browser and unit gates verify decoded texture dimensions, selected runtime compressed format, fallback byte length, mip levels, rendered pixels, screenshot artifacts, and the real transcodeKTX2BasisTexture path without claiming every GPU compression format on every device."], [], ["tests/browser/current-routes-animation-examples.spec.ts", "tests/browser/asset-compression-browser.spec.ts", "tests/assets/gltf-compression-decoders.test.ts"], ["tests/reports/current-routes/loaders/loader-ktx2.png", "tests/reports/external-parity-asset-compression/basisu-browser.png"]),
  item("webgl_loader_obj", "asset-loaders", "medium", "/apps/loader-obj/", "matched", ["D", "C", "K"], ["OBJLoader is exported to browser consumers and the CurrentRoutes OBJ route proves native OBJ parsing, quad triangulation, generated normals, UV preservation, and GLTF render-resource conversion through public A3D APIs. The loader now preserves mtllib/usemtl material groups, parses MTL diffuse color, alpha, and shininess into glTF PBR material primitives, supports inline and relative material libraries, and has regression coverage proving multi-material OBJ scenes create separate renderable primitives."], []),

  item("webgl_materials", "materials-basic", "high", "/apps/loader-material-extensions/", "matched", ["C", "K"], ["Material classes and material-extension route coverage exist through public A3D material assets and renderer bindings, and Three.js parity material-grid parity now renders a same-scene unlit/basic, matte, metallic, rough, emissive, clearcoat, and transparent material grid through A3D beside an actual THREE.WebGLRenderer using MeshBasicMaterial, MeshStandardMaterial, and MeshPhysicalMaterial. The browser gate verifies material coverage, nonblank and visually varied screenshots, bounded mean delta, and side-by-side PNG evidence without claiming every legacy Three.js material class or exact BRDF shader equality."], [], ["tests/browser/threejs-parity-material-grid-parity.spec.ts", "tests/browser/threejs-parity-loader-material-extensions-parity.spec.ts", "tests/browser/current-routes-animation-examples.spec.ts"], ["tests/reports/threejs-parity/material-grid-parity/a3d-material-grid.png", "tests/reports/threejs-parity/material-grid-parity/threejs-material-grid.png", "tests/reports/threejs-parity/material-grid-parity/side-by-side.png", "tests/reports/current-routes/loaders/material-extensions.png"]),
  item("webgl_materials_physical_clearcoat", "materials-physical", "high", "/apps/loader-material-extensions/", "matched", ["C", "D", "K"], ["GLTFLoader parses KHR_materials_clearcoat into public material assets, the CurrentRoutes material-extension route proves clearcoat uniforms reach A3D PBR materials, and Three.js parity loader-material-extensions parity now renders the same generated required-extension glTF fixture through A3D beside an actual THREE.WebGLRenderer using Three.js GLTFLoader. The browser gate verifies the same fixture hash, actual Three.js loader/renderer usage, A3D clearcoat uniforms, Three.js MeshPhysicalMaterial clearcoat fields, nonblank screenshots, and side-by-side evidence without claiming every clearcoat-normal texture asset or automotive material preset."], [], ["tests/browser/current-routes-animation-examples.spec.ts", "tests/browser/threejs-parity-loader-material-extensions-parity.spec.ts", "tests/unit/workstream5-runtime.test.ts"], ["tests/reports/current-routes/loaders/material-extensions.png", "tests/reports/threejs-parity/loader-material-extensions-parity/a3d-loader-material-extensions.png", "tests/reports/threejs-parity/loader-material-extensions-parity/threejs-loader-material-extensions.png", "tests/reports/threejs-parity/loader-material-extensions-parity/side-by-side.png"]),
  item("webgl_materials_physical_transmission", "transparency-transmission", "high", "/apps/materials-transmission/", "matched", ["C", "H", "K"], ["The CurrentRoutes materials transmission route renders PBRMaterial transmission, IOR, clearcoat, volume attenuation, tone mapping, and FXAA through the renderer, and the RuntimeParity PMREM parity harness now gates bounded cubemap transmission/refraction against an actual THREE.WebGLRenderer MeshPhysicalMaterial scene. The browser gate verifies A3D and Three.js transmission draw calls, nonblank/high-detail screenshots, average-luma bounds, bounded mean delta, textured transmission comparison, and side-by-side/diff artifacts without claiming parallax-corrected, screen-space, caustic, or broad multi-bounce refraction parity."], [], ["tests/browser/current-routes-animation-examples.spec.ts", "tests/browser/runtime-parity-pmrem-parity.spec.ts"], ["tests/reports/current-routes/materials/transmission.png", "tests/reports/runtime-parity/pmrem-parity/a3d-transmission-pmrem.png", "tests/reports/runtime-parity/pmrem-parity/threejs-transmission-pmrem.png", "tests/reports/runtime-parity/pmrem-parity/transmission-pmrem-diff.png", "tests/reports/runtime-parity/pmrem-parity/a3d-textured-parallax-disabled.png", "tests/reports/runtime-parity/pmrem-parity/threejs-transmission-pmrem.png"]),
  item("webgl_materials_texture_anisotropy", "textures", "medium", "/apps/texture-anisotropy/", "matched", ["C", "B", "K"], ["Sampler and TextureBinding expose maxAnisotropy, WebGL2Device uploads EXT_texture_filter_anisotropic state, and the CurrentRoutes anisotropy route proves the sampler path in-browser with diagnostics. This covers the renderer-level anisotropic filtering behavior required by the Three.js anisotropy example while retaining the same public texture binding model as other A3D materials."], [], ["tests/browser/current-routes-animation-examples.spec.ts", "tests/unit/rendering/material-binding.test.ts"], ["tests/reports/current-routes/textures/texture-anisotropy.png"]),
  item("webgl_materials_envmaps", "materials-pbr", "high", "/apps/flagship-viewer/", "matched", ["C", "D", "K"], ["Environment lighting exists for flagship, and the RuntimeParity PMREM parity harness now gates A3D equirectangular-to-cubemap GGX PMREM, HDR skybox response, cubemap mip/face atlas evidence, and bounded reflection deltas against an actual THREE.WebGLRenderer scene using Three.js PMREMGenerator. The browser gate verifies cubemap face size, mip count, shader sampling model, nonblank/high-detail A3D and Three.js screenshots, bounded luma delta, bounded mean delta, and side-by-side/diff artifacts without claiming every envmap example or every PMREM roughness edge case."], [], ["tests/browser/runtime-parity-pmrem-parity.spec.ts", "tests/unit/rendering/current-routes-pmrem.test.ts", "tests/browser/production-runtime-pbr-hdr-real-renderer.spec.ts"], ["tests/reports/runtime-parity/pmrem-parity/a3d-pmrem-spheres.png", "tests/reports/runtime-parity/pmrem-parity/threejs-pmrem-spheres.png", "tests/reports/runtime-parity/pmrem-parity/pmrem-diff.png", "tests/reports/runtime-parity/pmrem-parity/a3d-hdr-skybox.png", "tests/reports/runtime-parity/pmrem-parity/threejs-hdr-skybox.png", "tests/reports/runtime-parity/pmrem-parity/a3d-cubemap-pmrem-atlas.png"]),
  item("webgl_lights_physical", "materials-pbr", "high", "/apps/lights-spotlight/", "matched", ["C", "A", "K"], ["Lighting, local-light uniforms, and shadow requests are exercised in the CurrentRoutes spotlight route, and Three.js parity physical-lights parity now renders a same-scene point/spot range-attenuation workload through A3D beside an actual THREE.WebGLRenderer using PointLight and SpotLight with decay 2. The browser gate verifies point and spot light coverage, packed range/spot semantics, inverse-square attenuation samples, lit/varied screenshots, bounded mean delta, and side-by-side PNG evidence without claiming every physically correct light unit preset or photometric IES workflow."], [], ["tests/browser/current-routes-animation-examples.spec.ts", "tests/browser/threejs-parity-physical-lights-parity.spec.ts", "tests/unit/rendering/pbr-lighting.test.ts"], ["tests/reports/current-routes/lights/spotlight.png", "tests/reports/threejs-parity/physical-lights-parity/a3d-physical-lights.png", "tests/reports/threejs-parity/physical-lights-parity/threejs-physical-lights.png", "tests/reports/threejs-parity/physical-lights-parity/side-by-side.png"]),
  item("webgl_lights_spotlight", "shadow", "medium", "/apps/lights-spotlight/", "matched", ["C", "A", "B", "K"], ["Scene SpotLight, LightCollector, PBR local-light uniforms, and renderer-owned shadow requests are exercised by the CurrentRoutes spotlight route. Three.js parity physical-lights parity renders a same-scene point/spot attenuation workload through A3D beside actual Three.js PointLight and SpotLight, validating range/spot semantics, inverse-square attenuation, screenshots, and bounded visual deltas."], [], ["tests/browser/current-routes-animation-examples.spec.ts", "tests/browser/threejs-parity-physical-lights-parity.spec.ts", "tests/unit/rendering/pbr-lighting.test.ts"], ["tests/reports/current-routes/lights/spotlight.png", "tests/reports/threejs-parity/physical-lights-parity/side-by-side.png"]),
  item("webgl_shadowmap", "shadow", "high", "/apps/shadowmap-viewer/", "matched", ["C", "B", "K"], ["Shadow infrastructure and generated depth-texture diagnostics are exercised in the CurrentRoutes shadowmap viewer route, and Three.js parity shadowmap parity now renders a same-scene directional caster/receiver workload through A3D renderer-owned PCF shadows beside an actual THREE.WebGLRenderer using WebGLShadowMap with PCFSoftShadowMap. The browser gate verifies shadow-map request size, PCF coverage, caster/receiver counts, visible contact darkening, nonblank screenshots, bounded mean delta, and side-by-side PNG evidence without claiming cascaded shadows, point-light cube shadows, or every ShadowMapViewer overlay behavior."], [], ["tests/browser/current-routes-animation-examples.spec.ts", "tests/browser/threejs-parity-shadowmap-parity.spec.ts", "tests/browser/runtime-parity-pbr-shadow-map.spec.ts"], ["tests/reports/current-routes/shadow/shadowmap-viewer.png", "tests/reports/threejs-parity/shadowmap-parity/a3d-shadowmap.png", "tests/reports/threejs-parity/shadowmap-parity/threejs-shadowmap.png", "tests/reports/threejs-parity/shadowmap-parity/side-by-side.png"]),
  item("webgl_shadowmap_viewer", "shadow", "medium", "/apps/shadowmap-viewer/", "matched", ["C", "B", "K"], ["The CurrentRoutes shadowmap viewer route runs A3D ShadowPass, reads the generated sampleable depth texture, displays a depth preview, and reports PCF/filter/caster diagnostics. Three.js parity shadowmap parity renders the same directional caster/receiver scene beside actual Three.js WebGLShadowMap PCFSoftShadowMap output and records bounded shadow-delta side-by-side evidence."], [], ["tests/browser/current-routes-animation-examples.spec.ts", "tests/browser/threejs-parity-shadowmap-parity.spec.ts", "tests/browser/runtime-parity-pbr-shadow-map.spec.ts"], ["tests/reports/current-routes/shadow/shadowmap-viewer.png", "tests/reports/threejs-parity/shadowmap-parity/side-by-side.png"]),

  item("webgl_postprocessing", "postprocessing", "high", "/apps/postprocessing-bloom/", "matched", ["H", "B", "K"], ["Renderer-owned postprocess can run over real WebGL2 scene pixels, the CurrentRoutes bloom route proves bloom, tone mapping, and FXAA output, and the public PostProcessComposer now runs reusable ping-pong render targets, backbuffer presentation, resize/disposal, depth-aware SSAO/outline passes, and backend capability reporting. The browser and unit gates verify a live bloom route plus composer pass orchestration without claiming every Three.js postprocessing add-on pass."], [], ["tests/browser/current-routes-animation-examples.spec.ts", "tests/unit/rendering/postprocess-composer.test.ts", "tests/unit/rendering/three-compat-postprocess.test.ts"], ["tests/reports/current-routes/postprocessing/bloom.png"]),
  item("webgl_postprocessing_unreal_bloom", "postprocessing", "high", "/apps/postprocessing-bloom/", "matched", ["H", "K"], ["The CurrentRoutes bloom route runs A3D bloom over real rendered scene pixels, and Three.js parity Unreal Bloom parity now renders the same bright-triangle scene through A3D bloom/tone-mapping/FXAA beside an actual THREE.WebGLRenderer using EffectComposer, RenderPass, and UnrealBloomPass. The browser gate verifies threshold/radius/strength settings, bright and halo output, nonblank screenshots, bounded mean delta, and side-by-side PNG evidence without claiming every postprocessing add-on pass or exact shader-kernel equality."], [], ["tests/browser/current-routes-animation-examples.spec.ts", "tests/browser/threejs-parity-unreal-bloom-parity.spec.ts", "tests/unit/rendering/postprocess-composer.test.ts"], ["tests/reports/current-routes/postprocessing/bloom.png", "tests/reports/threejs-parity/unreal-bloom-parity/a3d-unreal-bloom.png", "tests/reports/threejs-parity/unreal-bloom-parity/threejs-unreal-bloom.png", "tests/reports/threejs-parity/unreal-bloom-parity/side-by-side.png"]),
  item("webgl_postprocessing_outline", "postprocessing", "medium", "/apps/postprocessing-depth-outline/", "matched", ["H", "K"], ["The CurrentRoutes depth-outline route runs renderer-owned outline over real WebGL2 scene pixels and records edge/color output metrics. PostProcessComposer and render-graph unit coverage validate reusable outline pass orchestration, changed pixels, outline counts, resize behavior, and render-target lifecycle."], [], ["tests/browser/current-routes-animation-examples.spec.ts", "tests/unit/rendering/postprocess-composer.test.ts", "tests/unit/rendering/render-graph.test.ts"], ["tests/reports/current-routes/postprocessing/depth-outline.png"]),
  item("webgl_postprocessing_dof", "postprocessing", "medium", "/apps/postprocessing-depth-outline/", "matched", ["H", "K"], ["The CurrentRoutes depth-outline route runs renderer-owned depth-of-field with backend depth texture injection. PostProcessComposer and render-graph unit coverage validate depth-aware blur behavior, pass chaining, changed pixels, resize behavior, and render-target lifecycle."], [], ["tests/browser/current-routes-animation-examples.spec.ts", "tests/unit/rendering/postprocess-composer.test.ts", "tests/unit/rendering/render-graph.test.ts"], ["tests/reports/current-routes/postprocessing/depth-outline.png"]),
  item("webgl_postprocessing_ssao", "postprocessing", "medium", "/apps/postprocessing-depth-outline/", "matched", ["H", "K"], ["The CurrentRoutes depth-outline route runs renderer-owned SSAO with backend depth texture injection. PostProcessComposer and render-graph unit coverage validate depth-aware occlusion, changed pixels, pass chaining, resize behavior, and render-target lifecycle."], [], ["tests/browser/current-routes-animation-examples.spec.ts", "tests/unit/rendering/postprocess-composer.test.ts", "tests/unit/rendering/render-graph.test.ts"], ["tests/reports/current-routes/postprocessing/depth-outline.png"]),
  item("webgl_effects_anaglyph", "effects", "medium", "/apps/stereo-effects/", "matched", ["H", "K"], ["The CurrentRoutes stereo effects route drives both eyes through public createStereoCameraRig and public createStereoEffectPlan, and @aura3d/rendering now exports createAnaglyphPixelComposite for renderer-owned red/cyan channel composition over real left/right RGBA frame buffers. Unit coverage verifies the public plan and pixel-composite path alongside the parallax-barrier compositor."], [], ["tests/unit/rendering/stereo-effects.test.ts", "tests/browser/current-routes-animation-examples.spec.ts"], ["tests/reports/current-routes/effects/stereo-effects.png"]),
  item("webgl_effects_parallaxbarrier", "effects", "high", "/apps/parallax-barrier/", "matched", ["H", "K"], ["The CurrentRoutes parallax-barrier route drives left/right views through public createStereoCameraRig, defaults to a clean single-view preview, and uses public createParallaxBarrierPixelComposite for renderer-owned row interleaving in ?mask=1 mode. Three.js parity parallax parity renders the same bounded scene in A3D and an actual THREE.WebGLRenderer using Three.js ParallaxBarrierEffect, verifies the reference shader's gl_FragCoord.y row cadence, gates 2px row pitch, and writes side-by-side evidence artifacts without claiming blanket visual equality."], [], ["tests/unit/rendering/stereo-effects.test.ts", "tests/browser/current-routes-animation-examples.spec.ts", "tests/browser/threejs-parity-parallax-parity.spec.ts"], ["tests/reports/current-routes/stereo/parallax-barrier.png", "tests/reports/threejs-parity/parallax-parity/a3d-parallax.png", "tests/reports/threejs-parity/parallax-parity/threejs-parallax.png", "tests/reports/threejs-parity/parallax-parity/side-by-side.png"]),
  item("webgl_effects_stereo", "effects", "high", "/apps/stereo-effects/", "matched", ["H", "K"], ["The CurrentRoutes stereo effects route drives both eyes through public createStereoCameraRig and public createStereoEffectPlan with browser diagnostics proving the public stereo rig/effect-plan path. Three.js parity stereo parity renders the same bounded scene through A3D side-by-side output and an actual THREE.WebGLRenderer using Three.js StereoEffect, verifies the reference scissor/half-viewport semantics, checks both halves are populated, and writes A3D/Three/stacked evidence artifacts without claiming blanket visual equality."], [], ["tests/unit/rendering/stereo-effects.test.ts", "tests/browser/current-routes-animation-examples.spec.ts", "tests/browser/threejs-parity-stereo-parity.spec.ts"], ["tests/reports/current-routes/stereo/stereo.png", "tests/reports/threejs-parity/stereo-parity/a3d-stereo.png", "tests/reports/threejs-parity/stereo-parity/threejs-stereo.png", "tests/reports/threejs-parity/stereo-parity/side-by-side.png"]),

  item("misc_controls_orbit", "controls", "high", "/apps/controls-orbit/", "matched", ["F", "K"], ["packages/input exposes scene-camera OrbitControls with target, distance, polar clamps, multiplicative wheel zoom, pan, save/reset, disposal, and matrix/frustum synchronization. The dedicated CurrentRoutes Orbit Controls route drives public OrbitControls over a real A3D WebGL2 scene, while Three.js parity unit parity compares the same pointer rotation and wheel dolly sequence against actual Three.js OrbitControls and browser coverage proves rotate, pan, and wheel interactions on the route."], [], ["tests/unit/input/orbit-controls-three-parity.test.ts", "tests/unit/input/camera-controls.test.ts", "tests/browser/threejs-parity-orbit-controls.spec.ts"], ["tests/reports/threejs-parity/orbit-controls/orbit-controls.png"]),
  item("misc_controls_trackball", "controls", "medium", "/apps/controls-trackball/", "matched", ["F", "K"], ["@aura3d/controls exports TrackballControls and the CurrentRoutes trackball route proves rotate, pan, dolly, and roll state driving a A3D-rendered camera example. TrackballControls now includes bounded damping plus keyboard pan, roll, and dolly handling through public control methods, with unit coverage for the damped update path and browser coverage proving the rendered interaction route stays live beyond a one-click smoke test."], [], ["tests/unit/controls/three-compat-controls.test.ts", "tests/browser/current-routes-animation-examples.spec.ts"], ["tests/reports/current-routes/controls/trackball.png"]),
  item("misc_controls_transform", "controls", "high", "/apps/controls-transform/", "matched", ["F", "K"], ["@aura3d/controls exports public TransformControls, the dedicated CurrentRoutes Transform Controls route applies translate/rotate/scale operations to a rendered A3D scene object through that public API, and unit parity compares the same translate/rotate/scale sequence against actual Three.js TransformControls object mutation semantics."], [], ["tests/unit/controls/transform-controls-three-parity.test.ts", "tests/unit/controls/three-compat-controls.test.ts", "tests/browser/threejs-parity-transform-controls.spec.ts"], ["tests/reports/threejs-parity/transform-controls/transform-controls.png"]),
  item("webgl_interactive_raycasting_points", "raycasting-picking", "medium", "/apps/interactive-picking/", "matched", ["F", "G", "K"], ["The CurrentRoutes interactive picking route uses public scene picking with a point-cloud threshold over real scene geometry, focused browser coverage proves point hits are reported, and Three.js parity unit parity compares A3D point-radius picking against actual Three.js Raycaster Points.threshold behavior for the same point cloud, hit rays, miss rays, and bounded distance deltas."], [], ["tests/unit/rendering/interactive-points-three-parity.test.ts", "tests/unit/rendering/renderer.test.ts", "tests/browser/current-routes-animation-examples.spec.ts"], ["tests/reports/current-routes/interactive/picking.png"]),
  item("webgl_interactive_cubes", "raycasting-picking", "high", "/apps/interactive-picking/", "matched", ["F", "K"], ["The CurrentRoutes interactive picking route uses public pickingRayFromCamera and scene renderable ray hits for transformed cubes, while focused browser coverage proves live pointer-hover cube hits. Three.js parity interactive-cubes parity compares the route's cube scene against Three.js Raycaster nearest-hit results for the same cube transforms and miss ray, with distance deltas bounded."], [], ["tests/unit/rendering/interactive-cubes-three-parity.test.ts", "tests/browser/current-routes-animation-examples.spec.ts", "tests/browser/threejs-parity-interactive-cubes.spec.ts"], ["tests/reports/current-routes/interactive/picking.png"]),
  item("webgl_decals", "decals", "high", "/apps/decals/", "matched", ["F", "G", "K"], ["ProjectedDecalGeometry is exported from @aura3d/rendering, unit-tested for box and ellipse clipping, and the CurrentRoutes decals route builds surface decals through createRaycastProjectedDecalGeometry with projected triangle/vertex diagnostics. Decal materials use transparent alpha blending, disabled depth writes, no culling, and polygon offset. Three.js parity decals parity now renders the same sphere/stage/placement set in A3D and an actual THREE.WebGLRenderer using Three.js DecalGeometry, gates same-scene screenshot artifacts, and verifies projector/pointer hit semantics against Three.js raycasting."], [], ["tests/unit/rendering/projected-decal-geometry.test.ts", "tests/browser/current-routes-animation-examples.spec.ts", "tests/browser/threejs-parity-decals-parity.spec.ts"], ["tests/reports/current-routes/decals/decals.png", "tests/reports/threejs-parity/decals-parity/a3d-decals.png", "tests/reports/threejs-parity/decals-parity/threejs-decals.png", "tests/reports/threejs-parity/decals-parity/side-by-side.png"]),

  item("webgl_instancing_dynamic", "instancing", "high", "/apps/instancing-performance/", "matched", ["G", "I", "B"], ["RenderDevice draw commands accept divisor-based per-instance vertex attributes, Scene Renderable now carries instance color attributes, and the CurrentRoutes instancing route updates 4096 public Scene.createInstancedMesh transforms through A3DRenderer every frame. Three.js parity instancing parity evidence gates dynamic one-draw route output and Three.js benchmark tie/win outcomes for this scoped workload."], [], ["tests/browser/current-routes-animation-examples.spec.ts", "tests/unit/scene/hierarchy-serialization.test.ts", "tests/unit/rendering/renderer.test.ts", "tools/threejs-parity-instancing-parity/index.ts"], ["tests/reports/current-routes/instancing/performance.png", "tests/reports/comparison-rendered-screenshots/aura3d-instancing.png", "tests/reports/comparison-rendered-screenshots/threejs-instancing.png", "tests/reports/comparison-diffs/threejs-instancing.png"]),
  item("webgl_instancing_performance", "instancing", "high", "/apps/instancing-performance/", "matched", ["G", "I", "B"], ["WebGL2Device binds per-instance attributes with vertexAttribDivisor, ForwardPass uses the public render queue sorter for opaque front-to-back and transparent back-to-front ordering, Scene.createInstancedMesh carries per-instance color data, and the CurrentRoutes route browser-gates 4096 public-scene instances in one indexed instanced draw through A3DRenderer. The instancing parity report verifies descriptor equivalence, one-draw route evidence, screenshot diff pass, draw-call tie, and frame-time tie against Three.js for this scoped instancing workload. Bundle bytes are reported as measured evidence, not as a scoped win claim."], [], ["tests/browser/current-routes-animation-examples.spec.ts", "tests/unit/scene/hierarchy-serialization.test.ts", "tests/unit/rendering/renderer.test.ts", "tools/threejs-parity-instancing-parity/index.ts"], ["tests/reports/current-routes/instancing/performance.png", "tests/reports/comparison-rendered-screenshots/aura3d-instancing.png", "tests/reports/comparison-rendered-screenshots/threejs-instancing.png", "tests/reports/comparison-diffs/threejs-instancing.png"]),
  item("webgl_buffergeometry_drawrange", "geometry", "medium", "/apps/geometry-drawrange/", "matched", ["G", "B", "C", "K"], ["RenderItem drawRange is honored by the WebGL2 forward and depth passes for indexed drawElements offsets and array drawArrays first/count routing. BufferGeometryCompat exposes setDrawRange(), getAttribute(), and deleteAttribute() mutation APIs, with unit coverage for drawRange state and attribute lifecycle plus a dedicated CurrentRoutes browser route for rendered evidence."], []),
  item("webgl_points_sprites", "lines-points-sprites", "medium", "/apps/interactive-picking/", "matched", ["G", "C", "K"], ["Geometry.points(), render-item point topology, point-radius picking, and WebGL/WebGPU point topology are covered by renderer tests and browser evidence. The Three.js compatibility layer now exposes PointsCompat, SpriteCompat, SpriteBatchCompat screen-aligned billboard instance data, PointsMaterialCompat.size/sizeAttenuation, and SpriteMaterialCompat.rotation/sizeAttenuation, with unit coverage. Three.js parity point-picking parity compares the same point cloud against actual Three.js Raycaster Points.threshold behavior."], [], ["tests/unit/three-compat/three-compat-material-geometry-compat.test.ts", "tests/unit/rendering/interactive-points-three-parity.test.ts", "tests/unit/rendering/renderer.test.ts", "tests/browser/three-compat-vfx.spec.ts", "tests/browser/current-routes-animation-examples.spec.ts"], ["tests/reports/current-routes/interactive/picking.png"]),
  item("webgl_lines_fat", "lines-points-sprites", "medium", "/apps/lines-helpers/", "matched", ["G", "K"], ["Geometry.lineSegments() and @aura3d/debug helper line builders have a browser route that renders line-segment helper geometry through WebGL2. Geometry.wideLineSegments() now expands arbitrary 3D line segments into indexed triangle quads with finite bounds and validation, giving A3D renderer-owned fat-line semantics without relying on implementation-defined WebGL lineWidth behavior."], [], ["tests/unit/rendering/geometry-primitives.test.ts", "tests/browser/current-routes-animation-examples.spec.ts"], ["tests/reports/current-routes/geometry/lines-helpers.png"]),
  item("misc_helpers", "lines-points-sprites", "medium", "/apps/lines-helpers/", "matched", ["G", "C", "K"], ["@aura3d/debug exports buildAxesHelper, buildGridHelper, buildBoundsHelper, buildCameraFrustumHelper, buildDirectionalLightHelper, and buildSkeletonHelper. The Three.js compatibility layer now exposes AxesHelperCompat, GridHelperCompat, BoxHelperCompat, CameraHelperCompat, DirectionalLightHelperCompat, and SkeletonHelperCompat as scene-addable HelperLineSegmentsCompat objects with BufferGeometryCompat line attributes and LineBasicMaterialCompat materials, with unit coverage and a browser route rendering the helper output as A3D line-segment geometry."], []),
  item("webgl_multiple_elements", "camera", "medium", "/apps/camera-multiple-views/", "matched", ["A", "B", "K"], ["The CurrentRoutes camera multiple views route renders one shared A3D scene definition into three independent WebGL-backed DOM canvas elements with per-view camera diagnostics, route-health coverage, and browser screenshot evidence. Resize and layout semantics are handled by each route canvas while preserving shared scene/render-item definitions."], [], ["tests/browser/current-routes-animation-examples.spec.ts"], ["tests/reports/current-routes/camera/multiple-views.png"]),
  item("webgl_multiple_views", "camera", "medium", "/apps/camera-multiple-views/", "matched", ["A", "B", "K"], ["The CurrentRoutes camera multiple views route renders hero, top, and detail camera perspectives from shared render items and reports distinct camera/view diagnostics; package scene code exposes Object3D, Group, Mesh, SkinnedMesh, InstancedMesh, and manual matrixAutoUpdate controls over the same transform tree."], [], ["tests/browser/current-routes-animation-examples.spec.ts", "tests/unit/scene/camera-frustum.test.ts"], ["tests/reports/current-routes/camera/multiple-views.png"]),

  item("webgpu_rtt", "webgpu", "medium", "/apps/webgpu-rtt/", "matched", ["B", "H", "K"], ["The CurrentRoutes WebGPU RTT route uses the public WebGPU render device and WebGPU render-to-texture proof helper to create an offscreen render target, draw into it, read it back, present it, and dispose resources. Hardware evidence now includes a real Chromium `navigator.gpu` adapter/device probe, and route evidence covers the scoped WebGPU RTT workflow without counting fallback rendering as native WebGPU proof."], [], ["tests/unit/rendering/webgpu-render-to-texture-proof.test.ts", "tests/browser/current-routes-animation-examples.spec.ts", "tests/browser/webgpu-real-device.spec.ts"], ["tests/reports/current-routes/webgpu/rtt.png", "tests/reports/webgpu-hardware-matrix.json"]),
  item("webgpu_compute", "webgpu", "medium", "/apps/webgpu-compute/", "matched", ["B", "K"], ["The CurrentRoutes WebGPU compute route uses public WebGPUParticleBackend with storage buffers, compute dispatch, readback buffers, and CPU reference parity for particle integration. The scoped compute example is backed by route screenshot evidence, WebGPU particle backend tests, and a real Chromium `navigator.gpu` adapter/device hardware probe."], [], ["tests/unit/rendering/gpu-particle-backend.test.ts", "tests/browser/gpu-particle-backend.spec.ts", "tests/browser/current-routes-animation-examples.spec.ts", "tests/browser/webgpu-real-device.spec.ts"], ["tests/reports/current-routes/webgpu/compute.png", "tests/reports/webgpu-hardware-matrix.json"]),
  item("webgpu_materials", "webgpu", "medium", "/apps/webgpu-materials/", "matched", ["B", "C", "K"], ["The CurrentRoutes WebGPU materials route renders public PBRMaterial and TexturedPBRMaterial through the WebGPU backend, reporting native PBR submissions, texture bindings, and non-dark/color-bucket output. The implementation covers the scoped WebGPU PBR/textured-material route with route screenshot evidence and real Chromium `navigator.gpu` adapter/device hardware evidence."], [], ["tests/unit/rendering/renderer.test.ts", "tests/unit/rendering/production-runtime-webgpu-renderer.test.ts", "tests/browser/current-routes-animation-examples.spec.ts", "tests/browser/webgpu-real-device.spec.ts"], ["tests/reports/current-routes/webgpu/materials.png", "tests/reports/webgpu-hardware-matrix.json"]),
  item("webgpu_instance_uniform", "webgpu", "medium", "/apps/webgpu-instance-uniform/", "matched", ["B", "G", "K"], ["The CurrentRoutes WebGPU instance-uniform route renders public InstancedPBRMaterial through one WebGPU instanced draw, uploads per-instance uniform matrices, and reports native instanced/PBR submissions with render-target readback. Route screenshot evidence plus the real Chromium `navigator.gpu` adapter/device probe cover this scoped WebGPU instance-uniform workflow."], [], ["tests/unit/rendering/renderer.test.ts", "tests/unit/rendering/current-routes-webgl2-hot-path.test.ts", "tests/browser/current-routes-animation-examples.spec.ts", "tests/browser/webgpu-real-device.spec.ts"], ["tests/reports/current-routes/webgpu/instance-uniform.png", "tests/reports/webgpu-hardware-matrix.json"]),

  item("webxr_vr_ballshooter", "webxr", "low", "/apps/webxr-interactions/", "matched", ["A", "F", "K"], ["@aura3d/input exports WebXRSessionController and the CurrentRoutes WebXR interactions route starts injected immersive-vr, samples controller trigger input, target-ray poses, grip poses, and haptic actuator availability, then maps trigger presses to ball-shooter actions. The scoped browser route and unit tests prove the public controller/session path without claiming untested headset hardware coverage."], [], ["tests/unit/input/webxr-session-controller.test.ts", "tests/browser/current-routes-animation-examples.spec.ts"], ["tests/reports/current-routes/webxr/interactions.png"]),
  item("webxr_vr_dragging", "webxr", "low", "/apps/webxr-interactions/", "matched", ["F", "K"], ["The WebXR interactions route samples squeeze/trigger controller state through WebXRSessionController, including target-ray and grip matrices, and maps squeeze state to dragged-object counts. Unit coverage verifies grip/target pose sampling and `pulseHaptics()` actuator dispatch, while browser evidence proves the rendered interaction route."], [], ["tests/unit/input/webxr-session-controller.test.ts", "tests/browser/current-routes-animation-examples.spec.ts"], ["tests/reports/current-routes/webxr/interactions.png"]),
  item("webxr_ar_cones", "webxr", "low", "/apps/webxr-interactions/", "matched", ["A", "K"], ["The WebXR interactions route starts injected immersive-ar, samples hit-test results through WebXRSessionController, and maps hit-test matrices to AR cone placements in the A3D rendered scene. Unit and browser coverage prove the scoped AR hit-test sample path and rendered evidence route without treating it as physical-device camera/light-estimation proof."], [], ["tests/unit/input/webxr-session-controller.test.ts", "tests/browser/current-routes-animation-examples.spec.ts"], ["tests/reports/current-routes/webxr/interactions.png"])
];

const tracks = summarizeTracks(inventory);
const highPriorityOpen = inventory.filter((entry) => entry.priority === "high" && (entry.a3dStatus === "unsupported" || entry.a3dStatus === "internal-only" || entry.a3dStatus === "partial"));
const statusCounts = countBy(inventory, (item) => item.a3dStatus);
const categoryCounts = countBy(inventory, (item) => item.category);

const report = {
  schema: "a3d-threejs-parity-threejs-inventory",
  generatedAt: new Date().toISOString(),
  pass: inventory.every((entry) => entry.constructionTracks.length > 0),
  claimBoundary: "This inventory creates a code backlog. It does not prove parity and must not be used as a completion signal.",
  totals: {
    examples: inventory.length,
    highPriority: inventory.filter((item) => item.priority === "high").length,
    highPriorityOpen: highPriorityOpen.length,
    byStatus: statusCounts,
    byCategory: categoryCounts
  },
  statuses: ["unsupported", "internal-only", "partial", "matched", "exceeded"] satisfies readonly Status[],
  tracks,
  items: inventory,
  nextImplementationTargets: highPriorityOpen.slice(0, 10).map((entry) => ({
    threeExampleId: entry.threeExampleId,
    category: entry.category,
    currentStatus: entry.a3dStatus,
    constructionTracks: entry.constructionTracks,
    blockingFeatures: entry.blockingFeatures
  }))
};

writeJson(REPORT_PATH, report);
writeText(BACKLOG_DOC_PATH, renderBacklogDoc(report));
writeText(INVENTORY_DOC_PATH, renderInventoryDoc(report));
writeText(PARITY_DOC_PATH, renderParityDoc(report));
writeText(CLAIM_DOC_PATH, renderClaimBoundaryDoc(report));
writeText(STATUS_DOC_PATH, renderStatusDoc(report));

if (!report.pass) {
  throw new Error(`Three.js parity inventory failed. Report: ${REPORT_PATH}`);
}

console.log(`Three.js parity Three.js inventory generated. Report: ${REPORT_PATH}`);
console.log(`Code backlog: ${BACKLOG_DOC_PATH}`);

function item(
  threeExampleId: string,
  category: Category,
  priority: Priority,
  a3dRoute: string | null,
  a3dStatus: Status,
  constructionTracks: readonly Track[],
  knownDeltas: readonly string[],
  blockingFeatures: readonly string[],
  tests: readonly string[] = [],
  screenshots: readonly string[] = []
): InventoryItem {
  return {
    threeExampleId,
    threeUrl: `https://threejs.org/examples/#${threeExampleId}`,
    category,
    priority,
    a3dRoute,
    a3dStatus,
    sameSceneAvailable: a3dRoute !== null && a3dStatus !== "unsupported",
    usesRuntimeThree: false,
    startupMs: null,
    firstFrameMs: null,
    fpsMedian: null,
    visualStatus:
      a3dStatus === "unsupported"
        ? "not-built"
        : a3dStatus === "matched" || a3dStatus === "exceeded"
          ? "accepted"
          : "needs-review",
    knownDeltas,
    blockingFeatures,
    constructionTracks,
    ownerPackages: Array.from(new Set(constructionTracks.flatMap((track) => trackPackages[track]))),
    tests,
    screenshots
  };
}

function summarizeTracks(items: readonly InventoryItem[]): readonly TrackSummary[] {
  return (Object.keys(trackTitles) as Track[]).map((track) => ({
    track,
    title: trackTitles[track],
    packages: trackPackages[track],
    items: items.filter((item) => item.constructionTracks.includes(track)).map((item) => item.threeExampleId)
  }));
}

function countBy<T extends string>(items: readonly InventoryItem[], select: (item: InventoryItem) => T): Record<T, number> {
  const counts = {} as Record<T, number>;
  for (const item of items) {
    const key = select(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(path: string, value: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
}

function renderBacklogDoc(input: typeof report): string {
  const lines = [
    "# Three.js parity Code Backlog",
    "",
    "This file is generated by `tools/threejs-parity-threejs-inventory/index.ts`.",
    "",
    "It is a construction backlog. It does not prove parity. Work items below must be closed by implementing package/runtime code before tests, screenshots, reports, or claim gates count.",
    "",
    "## Summary",
    "",
    `- Total inventoried examples: ${input.totals.examples}`,
    `- High-priority open examples: ${input.totals.highPriorityOpen}`,
    `- Status counts: ${formatCounts(input.totals.byStatus)}`,
    "",
    "## Next Implementation Targets",
    ""
  ];
  for (const target of input.nextImplementationTargets) {
    lines.push(`### ${target.threeExampleId}`, "");
    lines.push(`- Category: \`${target.category}\``);
    lines.push(`- Current status: \`${target.currentStatus}\``);
    lines.push(`- Construction tracks: ${target.constructionTracks.map((track) => `\`${track}: ${trackTitles[track]}\``).join(", ")}`);
    lines.push(`- Blocking features: ${target.blockingFeatures.map((feature) => `\`${feature}\``).join(", ")}`);
    lines.push("");
  }
  lines.push("## Backlog By Construction Track", "");
  for (const track of input.tracks) {
    lines.push(`### Track ${track.track}: ${track.title}`, "");
    lines.push(`- Packages: ${track.packages.map((pkg) => `\`${pkg}\``).join(", ")}`);
    lines.push(`- Inventory items: ${track.items.length}`);
    for (const id of track.items.slice(0, 30)) {
      lines.push(`  - ${id}`);
    }
    if (track.items.length > 30) lines.push(`  - ...${track.items.length - 30} more`);
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function renderInventoryDoc(input: typeof report): string {
  const lines = [
    "# Three.js parity Three.js Inventory",
    "",
    "Generated inventory for the first Three.js parity code backlog.",
    "",
    "| Three.js example | Category | Priority | A3D status | A3D route | Construction tracks |",
    "| --- | --- | --- | --- | --- | --- |"
  ];
  for (const entry of input.items) {
    lines.push(`| \`${entry.threeExampleId}\` | \`${entry.category}\` | \`${entry.priority}\` | \`${entry.a3dStatus}\` | ${entry.a3dRoute ? `\`${entry.a3dRoute}\`` : "none"} | ${entry.constructionTracks.map((track) => `\`${track}\``).join(" ")} |`);
  }
  return `${lines.join("\n")}\n`;
}

function renderParityDoc(input: typeof report): string {
  const lines = [
    "# Three.js parity Parity Matrix",
    "",
    "This matrix is generated from the current inventory. `partial` means some route or infrastructure exists, but the implementation is not yet accepted as full parity.",
    "",
    "| Category | Unsupported | Partial | Matched | Exceeded |",
    "| --- | ---: | ---: | ---: | ---: |"
  ];
  const categories = Array.from(new Set(input.items.map((item) => item.category))).sort();
  for (const category of categories) {
    const entries = input.items.filter((item) => item.category === category);
    lines.push(`| \`${category}\` | ${entries.filter((item) => item.a3dStatus === "unsupported").length} | ${entries.filter((item) => item.a3dStatus === "partial").length} | ${entries.filter((item) => item.a3dStatus === "matched").length} | ${entries.filter((item) => item.a3dStatus === "exceeded").length} |`);
  }
  return `${lines.join("\n")}\n`;
}

function renderClaimBoundaryDoc(input: typeof report): string {
  const lines = [
    "# Three.js parity Claim Boundary",
    "",
    "Generated from the Three.js parity Three.js inventory.",
    "",
    "## Current Claim",
    "",
    "A3D is not yet a full Three.js replacement. This inventory is a code backlog, not a parity proof.",
    "",
    "## Blocked Claims",
    "",
    "- Full Three.js parity.",
    "- Exceeds Three.js.",
    "- Exceeds Three.js in every sense.",
    "",
    "## Why",
    "",
    `- High-priority open examples: ${input.totals.highPriorityOpen}`,
    `- Unsupported examples: ${input.totals.byStatus.unsupported ?? 0}`,
    `- Partial examples: ${input.totals.byStatus.partial ?? 0}`,
    "",
    "Claims can advance only after construction tracks A through K produce real package/runtime code and Track L verification proves the result.",
    "",
    "## Binding Code Parity Floor",
    "",
    "The following systems are hard blockers for global parity and cannot be replaced by tests, screenshots, dashboards, or generated reports.",
    ""
  ];
  for (const blocker of parityFloorBlockers) {
    lines.push(`- ${blocker}`);
  }
  lines.push(
    "",
    "Any missing blocker forces a scoped claim that names the excluded system explicitly."
  );
  return `${lines.join("\n")}\n`;
}

function renderStatusDoc(input: typeof report): string {
  return [
    "# Three.js parity Status",
    "",
    "Status: code construction started.",
    "",
    "The next work remains code construction, not more claim machinery.",
    "",
    "## Current Evidence",
    "",
    `- Inventory report: \`${REPORT_PATH}\``,
    `- Code backlog: \`${BACKLOG_DOC_PATH}\``,
    `- Inventory doc: \`${INVENTORY_DOC_PATH}\``,
    `- Parity matrix: \`${PARITY_DOC_PATH}\``,
    `- Claim boundary: \`${CLAIM_DOC_PATH}\``,
    "- Public imported glTF mixer controls: `packages/assets/src/GLTFAnimationRuntime.ts`",
    "- Public animation motion-quality tracker: `packages/animation/src/MotionQuality.ts`",
    "- Animation route suite now requires canvas frame-difference motion evidence for animation/skinning routes: `tests/browser/current-routes-animation-examples.spec.ts`",
    "- Keyframes route now uses the public mixer path: `apps/animation-keyframes/src/scene.ts`",
    "- Keyframes route publishes motion samples, time range, pose diversity, and healthy-motion diagnostics: `apps/animation-keyframes/src/main.ts`",
    "- Skinning blend route now uses public mixer clip actions: `apps/skinning-blending/src/main.ts`",
    "- Skinning blend route publishes motion samples, time range, pose diversity, and healthy-motion diagnostics: `apps/skinning-blending/src/main.ts`",
    "- Hardware skinning now has a public bone hierarchy, inherited skeleton world-matrix update, inverse bind matrices, and matrix-palette generation: `packages/animation/src/Bone.ts`, `packages/animation/src/Skeleton.ts`, `packages/animation/src/Skinning.ts`",
    "- glTF `JOINTS_0` and `WEIGHTS_0` import into A3D vertex `joints` and `weights` attributes and the render-resource path builds skinned vertex formats for imported assets: `packages/assets/src/GLTFLoader.ts`, `packages/assets/src/GLTFRenderResources.ts`",
    "- glTF `JOINTS_1` / `WEIGHTS_1` are now reported as explicit unsupported skinning-extra-influence diagnostics instead of being silently counted as full skinning import: `packages/assets/src/GLTFLoader.ts`, `tests/assets/gltf-animation-corpus.test.ts`",
    "- glTF skins without authored inverse-bind matrices now report the identity fallback through `skinning-default-inverse-bind-matrices`: `packages/assets/src/GLTFLoader.ts`, `tests/assets/gltf-animation-corpus.test.ts`",
    "- ForwardPass now validates skinning geometry before GPU submission, including missing joint/weight attributes, four-influence layouts, finite integer joint indices, in-palette joint references, and normalized non-negative weights: `packages/rendering/src/ForwardPass.ts`, `tests/unit/rendering/renderer.test.ts`",
    "- ForwardPass now has a per-frame skinning palette upload manager and tests proving distinct palettes bind for multiple skinned characters in one frame: `packages/rendering/src/ForwardPass.ts`, `tests/unit/rendering/renderer.test.ts`",
    "- Imported renderables can share one glTF skin and animated joint tree while receiving refreshed per-renderable palettes: `packages/assets/src/GLTFAnimationRuntime.ts`, `tests/assets/gltf-animation-runtime.test.ts`",
    "- Skinned shader variants perform weighted joint-matrix vertex transforms and normal/tangent skinning through GPU uniforms: `packages/rendering/src/ShaderLibrary.ts`",
    "- Morph target and skinning composition is documented in the retained parity matrix and tested as morph-then-skin, including renderer draw submission, picking/culling bounds, and GLTF framing bounds: `packages/rendering/src/ForwardPass.ts`, `packages/rendering/src/SkinningBounds.ts`, `packages/assets/src/GLTFRenderResources.ts`, `tests/unit/rendering/renderer.test.ts`, `docs/project/threejs-parity-parity-matrix.md`",
    "- Hardware skinning limits are documented honestly in the retained claim boundary: current uniform-array palettes support 64 joints, over-limit glTF skins report `skinning-palette-limit-fallback`, data-texture skinning remains open, and extra influence sets are diagnostic-only: `docs/project/threejs-parity-claim-boundary.md`",
    "- Additive skinning route now uses public mixer sample blending: `apps/skinning-additive/src/main.ts`",
    "- Additive skinning route publishes motion samples, time range, pose diversity, and healthy-motion diagnostics: `apps/skinning-additive/src/main.ts`",
    "- IK route now uses the public imported skeleton IK controller: `apps/skinning-ik/src/main.ts`",
    "- IK route publishes motion samples, time range, pose diversity, and healthy-motion diagnostics: `apps/skinning-ik/src/main.ts`",
    "- Multiple-animation route now uses the public imported clone sampler: `apps/animation-multiple/src/main.ts`",
    "- Multiple-animation route publishes motion samples, time range, pose diversity, and healthy-motion diagnostics: `apps/animation-multiple/src/main.ts`",
    "- Walk route now uses public root-motion locomotion controls: `apps/animation-walk/src/main.ts`",
    "- Walk route publishes motion samples, time range, pose diversity, and healthy-motion diagnostics: `apps/animation-walk/src/main.ts`",
    "- Morph target route now uses the public imported morph target controller: `apps/skinning-morph/src/main.ts`",
    "- Morph target route publishes motion samples, time range, pose diversity, and healthy-motion diagnostics: `apps/skinning-morph/src/main.ts`",
    "- Math and scene foundation support is documented in the retained parity matrix and tested across first-party vectors, matrices, quaternions, Euler compatibility, projection, look-at, TRS decompose, frustum/ray/bounds math, Object3D-style hierarchy, matrix auto-update, manual local matrix mode, camera projection, and renderer transform uniforms: `docs/project/threejs-parity-parity-matrix.md`, `tests/unit/math/vector-matrix.test.ts`, `tests/unit/scene/hierarchy-serialization.test.ts`, `tests/unit/rendering/scene-transform-uniforms.test.ts`",
    "- Geometry and buffer management support is documented in the retained parity matrix and tested across public vertex descriptors, interleaved vertex buffers, finite attribute validation, typed index buffers, usage hints, dynamic dirty-range updates, geometry bounds, primitive builders, morph/skinning bounds, and explicit buffer disposal: `docs/project/threejs-parity-parity-matrix.md`, `tests/unit/rendering/geometry-primitives.test.ts`, `tests/unit/rendering/vertex-buffer.test.ts`, `tests/unit/rendering/index-buffer.test.ts`",
    "- Shader, material, and WebGL state foundations are documented in the retained parity matrix and tested across shader source variants, GLSL compile/link diagnostics, shader reflection, material schemas, material instances, uniform/attribute/texture binding diagnostics, render-state descriptors, WebGL2 state caching, and renderer draw-state leak coverage: `docs/project/threejs-parity-parity-matrix.md`, `tests/unit/rendering/material-binding.test.ts`, `tests/unit/rendering/shader-library.test.ts`, `tests/unit/rendering/webgl2-state-cache.test.ts`, `tests/unit/rendering/render-state-leaks.test.ts`, `tests/unit/rendering/renderer.test.ts`",
    "- Render loop, camera, culling, and draw-path foundations are documented in the retained parity matrix and tested across resize/DPR, animation loops, camera projection/view-projection, scene traversal, world-matrix updates before culling, frustum rejection, render-list construction, drawElements/drawArrays/instanced submissions, queue sorting, BVH broad-phase queries, and diagnostics: `docs/project/threejs-parity-parity-matrix.md`, `tests/unit/rendering/renderer.test.ts`, `tests/unit/rendering/camera-framing.test.ts`, `tests/unit/rendering/scene-optimization.test.ts`, `tests/unit/scene/camera-frustum.test.ts`, `tests/unit/rendering/render-queue-sorting.test.ts`",
    "- Advanced render management is documented in the retained parity matrix and tested across opaque front-to-back sorting, transparent back-to-front sorting, batch diagnostics, WebGL2 native instanced draws, per-instance matrix attributes, divisor binding/reset behavior, state-cache diagnostics, and instancing limits: `docs/project/threejs-parity-parity-matrix.md`, `tests/unit/rendering/render-queue-sorting.test.ts`, `tests/unit/rendering/current-routes-webgl2-hot-path.test.ts`, `tests/unit/rendering/scene-optimization.test.ts`, `tests/unit/rendering/render-state-leaks.test.ts`",
    "- PBR and IBL implementation boundaries are documented against concrete shader/resource files in the retained parity matrix, including Cook-Torrance BRDF, GGX/Smith/Fresnel, physical material lobes, HDR decode, diffuse irradiance, specular prefiltering, BRDF LUTs, environment rotation/intensity, and current approximation limits: `docs/project/threejs-parity-parity-matrix.md`",
    "- Postprocess pipeline support is documented against concrete render-target, renderer, WebGL2, composer, and pass code in the retained parity matrix, including FBO color/depth attachments, fullscreen presentation, renderer-owned ordered target chains, public reusable ping-pong composer targets, depth bindings, explicit bloom bright/horizontal/vertical/composite stages, per-backend unsupported-effect diagnostics, and remaining boundaries: `docs/project/threejs-parity-parity-matrix.md`",
    "- Asset loader pipeline support is tested across GLTF/GLB buffers, accessors, meshes, nodes, skins, animations, cameras, lights, material extensions, KTX2/Basis hooks, HDR/EXR/OBJ loaders, asset caches, render-resource conversion, auto-bounds/framing metadata, and public renderable-scene APIs: `packages/assets/src/GLTFLoader.ts`, `packages/assets/src/GLTFRenderResources.ts`, `packages/assets/src/loadRenderableAsset.ts`, `packages/assets/src/createRenderableScene.ts`, `tests/assets/current-routes-gltf-loader-corpus.test.ts`, `tests/assets/foundation-render-resources.test.ts`",
    "- GLTFLoader normalizes imported `WEIGHTS_0` rows before GPU skinning, matching Three.js-style loader behavior and preventing malformed-but-common GLB skin data from tripping the renderer contract: `packages/assets/src/GLTFLoader.ts`, `tests/assets/current-routes-gltf-loader-corpus.test.ts`",
    "- glTF loader extension support matrix is public package code: `packages/assets/src/GLTFExtensionSupport.ts`",
    "- Loader compression route decodes EXT_meshopt_compression and KHR_draco_mesh_compression through public loader hooks, including real browser draco3d WASM coverage: `apps/loader-compression/src/main.ts`",
    "- Opt-in Khronos compressed asset tests pass with real meshoptimizer and draco3d packages: `tests/assets/gltf-optional-external-decoders.test.ts`",
    "- Loader instancing route renders required EXT_mesh_gpu_instancing data through public loader/runtime hooks: `apps/loader-instancing/src/main.ts`",
    "- Loader material-extension route renders required clearcoat, sheen, and transmission glTF extensions through public loader/runtime hooks: `apps/loader-material-extensions/src/main.ts`",
    "- Loader GLTF variants route selects KHR_materials_variants through public GLTF render resources: `apps/loader-gltf-variants/src/main.ts`",
    "- Loader KTX2 route transcodes required KHR_texture_basisu data into A3D compressed texture resources with fallback mips: `apps/loader-ktx2/src/main.ts`",
    "- Loader OBJ route parses native OBJ geometry through public OBJLoader and renders the converted GLTF resources: `apps/loader-obj/src/main.ts`",
    "- Public render queue sorter drives ForwardPass opaque front-to-back and transparent back-to-front ordering with focused tests: `packages/rendering/src/performance/RenderItemSorting.ts`",
    "- Public render queue plans now report object count, estimated draw calls, total instances, batchable groups, largest batch, material switches, and pipeline transitions: `packages/rendering/src/performance/RenderItemSorting.ts`, `tests/unit/rendering/render-queue-sorting.test.ts`",
    "- Renderer scene collection now reports submitted, visible, culled, and frustum-tested object counts in RenderDeviceDiagnostics for sync and async render paths: `packages/rendering/src/Renderer.ts`, `tests/unit/rendering/renderer.test.ts`",
    "- Resource lifecycle support is documented in the retained parity matrix and tested across material disposal, render-target texture accounting, renderer/device disposal, WebGL delete calls, and repeated renderer load/unload cycles: `docs/project/threejs-parity-parity-matrix.md`, `tests/unit/rendering/resource-lifetime.test.ts`, `tests/unit/rendering/render-state-leaks.test.ts`",
    "- ForwardPass now routes oversized instanced render items through per-instance matrix vertex attributes while WebGL2Device issues native drawElementsInstanced/drawArraysInstanced calls with divisor-bound attributes and reports nativeInstancedSubmissions diagnostics: `packages/rendering/src/ForwardPass.ts`, `packages/rendering/src/ShaderLibrary.ts`, `packages/rendering/src/WebGL2Device.ts`, `tests/unit/rendering/renderer.test.ts`, `tests/unit/rendering/current-routes-webgl2-hot-path.test.ts`",
    "- WebGL2Device now uses the public WebGL2StateCache on the hot path for program, VAO, framebuffer, viewport, scissor, buffer, texture, sampler, depth, cull, blend, stencil, color-write, and polygon-offset state, caches VAO setup for repeated draws, caches WebGL sampler objects by public Sampler descriptors, deletes cached VAOs and samplers on device disposal, and publishes state-cache diagnostics through RenderDeviceDiagnostics: `packages/rendering/src/WebGL2StateCache.ts`, `packages/rendering/src/WebGL2Device.ts`",
    "- Renderer-owned postprocess now returns pass count, renderer-owned render-target count, texture count, and target dimensions in RenderDeviceDiagnostics: `packages/rendering/src/Renderer.ts`, `packages/rendering/src/RenderDevice.ts`, `tests/unit/rendering/renderer.test.ts`",
    "- SceneOptimization now exposes a public static bounds BVH with broad-phase branch rejection, rebuild-based dynamic updates, accelerated bounds raycasts, and traversal diagnostics for total, visible, culled, node, bounds-test, leaf-test, hit, and traversal-time counts: `packages/rendering/src/SceneOptimization.ts`, `tests/unit/rendering/scene-optimization.test.ts`",
    "- RenderDeviceDiagnostics now reports live buffer bytes and approximate GPU memory bytes alongside buffer, texture, shader/program, and render-target counts: `packages/rendering/src/RenderDevice.ts`, `packages/rendering/src/WebGL2Device.ts`, `packages/rendering/src/WebGPUDevice.ts`, `tests/unit/rendering/resource-lifetime.test.ts`",
    "- Instancing performance route renders thousands of dynamic public Scene.createInstancedMesh instances through A3DRenderer with per-instance matrix and color attributes: `apps/instancing-performance/src/main.ts`, `packages/scene/src/Renderable.ts`, `packages/rendering/src/Renderer.ts`",
    "- Texture anisotropy route proves WebGL anisotropic sampler uploads through public TextureBinding/Sampler code: `apps/texture-anisotropy/src/main.ts`",
    "- Interactive picking route proves public camera-ray, transformed cube, and point-cloud threshold scene picking: `apps/interactive-picking/src/main.ts`",
    "- Decals route now builds ellipse-clipped surface decals through public ProjectedDecalGeometry and createRaycastProjectedDecalGeometry instead of route-local cylinder/rectangle stand-ins, its decal PBR materials use alpha blending, disabled depth writes, no culling, and polygon offset with browser diagnostics, and `tests/browser/threejs-parity-decals-parity.spec.ts` compares the same scene against actual Three.js DecalGeometry projector output: `apps/decals/src/main.ts`",
    "- Trackball controls route proves public TrackballControls rotate/pan/dolly/roll state in a rendered browser example: `apps/controls-trackball/src/main.ts`",
    "- Geometry drawRange route proves indexed and array draw ranges through public RenderItem drawRange code: `apps/geometry-drawrange/src/main.ts`",
    "- Geometry, lines, points, sprites, and helper scope is explicit in the retained claim boundary: generated primitives, line/point topology, point-threshold parity, Three-compatible sprite/point objects, instancing, and debug helper line builders are supported, while fat-line parity remains scoped: `packages/rendering/src/Geometry.ts`, `packages/three-compat/src/core/Object3DCompat.ts`, `packages/debug/src/SceneHelpers.ts`, `docs/project/threejs-parity-claim-boundary.md`",
    "- Scene package exports Object3D, Group, Mesh, SkinnedMesh, InstancedMesh, and manual matrixAutoUpdate controls over the existing transform/renderable tree: `packages/scene/src/Object3D.ts`",
    "- Materials transmission route proves PBRMaterial transmission/IOR/volume uniforms through renderer-owned WebGL2 shading: `apps/materials-transmission/src/main.ts`",
    "- Spotlight route proves Scene SpotLight collection, local PBR lighting uniforms, and renderer-owned shadow request: `apps/lights-spotlight/src/main.ts`",
    "- Shadowmap viewer route proves ShadowPass depth texture readback and diagnostic preview: `apps/shadowmap-viewer/src/main.ts`",
    "- Camera multiple views route proves separate WebGL DOM elements and distinct cameras rendering one shared A3D scene definition: `apps/camera-multiple-views/src/main.ts`",
    "- Stereo and parallax routes now drive left/right views through public createStereoCameraRig and public stereo effect planning APIs with browser diagnostics proving the public paths: `packages/rendering/src/StereoEffects.ts`, `apps/stereo-effects/src/main.ts`, `apps/parallax-barrier/src/main.ts`",
    "- WebGPU RTT route proves public WebGPU render-target draw/readback/present/disposal behavior through package code: `apps/webgpu-rtt/src/main.ts`",
    "- WebGPU compute route proves public WebGPUParticleBackend storage-buffer compute dispatch and CPU-reference readback parity: `apps/webgpu-compute/src/main.ts`",
    "- WebGPU materials route proves public PBR and textured PBR material rendering through the A3D WebGPU backend: `apps/webgpu-materials/src/main.ts`",
    "- WebGPU instance-uniform route proves public InstancedPBRMaterial per-instance uniform matrices through one A3D WebGPU instanced draw: `apps/webgpu-instance-uniform/src/main.ts`",
    "- WebXR interactions route proves public WebXRSessionController session negotiation, controller input sampling, and AR hit-test sampling with injected XR evidence: `apps/webxr-interactions/src/main.ts`",
    "- Postprocessing bloom route runs renderer-owned bloom/tone-mapping/FXAA over real WebGL2 scene pixels: `apps/postprocessing-bloom/src/main.ts`",
    "- Depth postprocess route runs renderer-owned depth-of-field, SSAO, and outline over real WebGL2 scene pixels: `apps/postprocessing-depth-outline/src/main.ts`",
    "",
    "## Binding Code Parity Floor",
    "",
    "Three.js parity cannot claim full Three.js parity or that A3D exceeds Three.js in every sense until these systems exist as public package/runtime code:",
    "",
    ...parityFloorBlockers.map((blocker) => `- ${blocker}`),
    "",
    "## Next Action",
    "",
    "Continue down the high-priority backlog by moving remaining walk/morph/loader/material behavior out of route-local code and into package/runtime APIs."
  ].join("\n") + "\n";
}

function formatCounts(counts: Record<string, number>): string {
  return Object.entries(counts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
}
