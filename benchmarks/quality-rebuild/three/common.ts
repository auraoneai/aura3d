/**
 * three.js translator: SceneSpec -> three@0.185.1, using the idiomatic quality
 * settings documented by three.js:
 *  - WebGLRenderer({ antialias: true }), outputColorSpace = SRGBColorSpace
 *  - toneMapping = ACESFilmicToneMapping, toneMappingExposure = spec.exposure
 *  - physically based lights (r155+ default), PCFSoftShadowMap
 *  - HDRLoader + PMREMGenerator for IBL, scene.background for HDRI backgrounds
 *  - EffectComposer(RenderPass, UnrealBloomPass, OutputPass) only when bloom is requested
 *  - CSM addon when the spec requests cascaded shadows
 */
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { CSM } from "three/examples/jsm/csm/CSM.js";
import { hdriAssets, modelAssets, type HdriAssetId, type ModelAssetId } from "../shared/assets";
import { fetchOnce } from "../shared/fetch-once";
import { particlePositions } from "../shared/procedural";
import type { BrokenControlId } from "../shared/contracts";
import type { CapabilityEntry, CapabilityStatus, MaterialSpec, ReadyPayload, SceneSpec, TransformSpec } from "../shared/types";

/**
 * Per-run overrides from the page router (PRD-12 §7.1/§8.4):
 *  - `variant`: default frame, `aura3d-tuned`, or a broken-control id.
 *    On the three side every control is expressible and is rendered for
 *    calibration; on the Aura side inexpressible controls are not captured.
 *  - `dpr`: device pixel ratio override (&dpr=, scenes may declare `dprs`).
 *  - `qrFlags`: resolved `a3d-qr` flag list (C-30) recorded in the payload.
 */
export interface RunOptions {
  readonly variant?: "default" | "aura3d-tuned" | BrokenControlId;
  readonly dpr?: 1 | 2;
  readonly qrFlags?: readonly string[];
}

/** Graph stashed on the window so `three/lib/mask.ts` can render mask passes
 * in the same page load as the READY frame (PRD-12 §6.3). */
export interface ThreeGraph {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly lights: readonly THREE.Light[];
}

declare global {
  interface Window {
    __QR_THREE_GRAPH__?: ThreeGraph;
  }
}

// Variant machinery lives in three/lib/variants.ts (T2.5, §6.4).
import { applyVariantSpec, variantAntialias, variantDprScale, variantToneMapped } from "./lib/variants";

declare const __THREE_VERSION__: string;

const EULER_ORDER: THREE.EulerOrder = "ZYX";

class CapabilityLog {
  readonly entries: CapabilityEntry[] = [];
  add(feature: string, status: CapabilityStatus, detail: string): void {
    this.entries.push({ feature, status, detail });
  }
}

function applyTransform(object: THREE.Object3D, transform: TransformSpec): void {
  object.position.set(...transform.position);
  object.rotation.order = EULER_ORDER;
  if (transform.rotation) object.rotation.set(transform.rotation[0], transform.rotation[1], transform.rotation[2], EULER_ORDER);
  if (transform.scale !== undefined) {
    if (typeof transform.scale === "number") object.scale.setScalar(transform.scale);
    else object.scale.set(...transform.scale);
  }
}

function createMaterial(spec: MaterialSpec): THREE.MeshStandardMaterial {
  const physical = spec.clearcoat !== undefined || spec.sheen !== undefined || spec.transmission !== undefined || spec.ior !== undefined || spec.thickness !== undefined;
  const params: THREE.MeshStandardMaterialParameters = {
    color: new THREE.Color(spec.color),
    roughness: spec.roughness,
    metalness: spec.metalness,
    ...(spec.emissive !== undefined ? { emissive: new THREE.Color(spec.emissive) } : {}),
    ...(spec.emissiveIntensity !== undefined ? { emissiveIntensity: spec.emissiveIntensity } : {}),
    ...(spec.opacity !== undefined && spec.opacity < 1 ? { opacity: spec.opacity, transparent: true } : {}),
    ...(spec.envMapIntensity !== undefined ? { envMapIntensity: spec.envMapIntensity } : {})
  };
  if (!physical) return new THREE.MeshStandardMaterial(params);
  return new THREE.MeshPhysicalMaterial({
    ...params,
    ...(spec.clearcoat !== undefined ? { clearcoat: spec.clearcoat } : {}),
    ...(spec.clearcoatRoughness !== undefined ? { clearcoatRoughness: spec.clearcoatRoughness } : {}),
    ...(spec.sheen !== undefined ? { sheen: spec.sheen } : {}),
    ...(spec.sheenColor !== undefined ? { sheenColor: new THREE.Color(spec.sheenColor) } : {}),
    ...(spec.sheenRoughness !== undefined ? { sheenRoughness: spec.sheenRoughness } : {}),
    ...(spec.transmission !== undefined ? { transmission: spec.transmission } : {}),
    ...(spec.thickness !== undefined ? { thickness: spec.thickness } : {}),
    ...(spec.ior !== undefined ? { ior: spec.ior } : {})
  });
}

function createGeometry(shape: "box" | "sphere" | "plane" | "cylinder", size: readonly [number, number, number]): THREE.BufferGeometry {
  // Unit geometry, scaled by `size`, mirroring Aura3D's unit primitives
  // (box 1^3, sphere diameter 1, plane 1x1 on XZ facing +Y, cylinder d=1 h=1).
  let geometry: THREE.BufferGeometry;
  if (shape === "box") geometry = new THREE.BoxGeometry(1, 1, 1);
  else if (shape === "sphere") geometry = new THREE.SphereGeometry(0.5, 64, 32);
  else if (shape === "cylinder") geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 48);
  else geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  geometry.scale(size[0], size[1], size[2]);
  return geometry;
}

function createSpriteTexture(): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.35, "rgba(255,255,255,0.55)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

async function loadHdri(renderer: THREE.WebGLRenderer, id: HdriAssetId, cache: Map<HdriAssetId, { equirect: THREE.Texture; pmrem: THREE.Texture }>) {
  const cached = cache.get(id);
  if (cached) return cached;
  // fetchOnce dedupes GLB/HDR fetches (research 22 ERR_ABORTED fix, §9.2).
  const equirect = new HDRLoader().createDataTexture(await fetchOnce(hdriAssets[id].url));
  equirect.mapping = THREE.EquirectangularReflectionMapping;
  const generator = new THREE.PMREMGenerator(renderer);
  const pmrem = generator.fromEquirectangular(equirect).texture;
  generator.dispose();
  const entry = { equirect, pmrem };
  cache.set(id, entry);
  return entry;
}

async function nextFrame(): Promise<void> {
  await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
}

export async function runThreeScene(rawSpec: SceneSpec, host: HTMLElement, opts: RunOptions = {}): Promise<ReadyPayload> {
  const started = performance.now();
  const log = new CapabilityLog();
  const warnings: string[] = [];
  const errors: string[] = [];
  const variant = opts.variant ?? "default";
  const spec = applyVariantSpec(rawSpec, variant);
  if (variant === "aura3d-tuned") log.add("variant:aura3d-tuned", "not-applicable", "aura3d-tuned is an Aura-side preset; the three reference renders default.");
  else if (variant !== "default") log.add(`variant:${variant}`, "supported", "Broken-control variant applied to the three reference (calibration source).");

  if (THREE.REVISION !== "185") errors.push(`Expected three r185 (0.185.1); loaded r${THREE.REVISION}.`);

  const { width, height } = spec.resolution;
  const devicePixelRatio = variantDprScale(variant) * (opts.dpr ?? spec.resolution.devicePixelRatio);
  const renderer = new THREE.WebGLRenderer({ antialias: variantAntialias(variant), preserveDrawingBuffer: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(devicePixelRatio);
  renderer.setSize(width, height);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = variantToneMapped(variant) ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  renderer.toneMappingExposure = spec.exposure;
  renderer.shadowMap.enabled = Boolean(spec.shadows || spec.csm) && variant !== "no-shadows";
  // Explicit PCFShadowMap (not PCFSoft): removes the r185 deprecation remap (§9.2).
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.info.autoReset = false;
  host.appendChild(renderer.domElement);
  renderer.domElement.style.display = "block";

  log.add("tone-mapping:aces-filmic", "supported", "renderer.toneMapping = ACESFilmicToneMapping");
  log.add("tone-mapping:agx", "supported", "THREE.AgXToneMapping available (not used: spec requests ACES)");
  log.add("tone-mapping:neutral", "supported", "THREE.NeutralToneMapping available (not used: spec requests ACES)");
  log.add("exposure", "supported", `renderer.toneMappingExposure = ${spec.exposure}`);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(spec.camera.fov, width / height, spec.camera.near, spec.camera.far);
  camera.position.set(...spec.camera.position);
  camera.lookAt(new THREE.Vector3(...spec.camera.target));
  camera.updateMatrixWorld();

  const hdriCache = new Map<HdriAssetId, { equirect: THREE.Texture; pmrem: THREE.Texture }>();
  if (spec.environment) {
    const hdri = await loadHdri(renderer, spec.environment.hdri, hdriCache);
    scene.environment = hdri.pmrem;
    scene.environmentIntensity = spec.environment.intensity;
    scene.environmentRotation.set(0, spec.environment.rotation, 0);
    log.add("hdri-ibl", "supported", "HDRLoader + PMREMGenerator.fromEquirectangular");
  }
  if (spec.background.kind === "color") {
    scene.background = new THREE.Color(spec.background.color);
  } else {
    const hdri = await loadHdri(renderer, spec.background.hdri, hdriCache);
    scene.background = hdri.equirect;
    scene.backgroundIntensity = spec.background.intensity;
    if (spec.environment) scene.backgroundRotation.set(0, spec.environment.rotation, 0);
    log.add("hdri-background", "supported", "scene.background = equirectangular HDR texture");
  }
  if (spec.fog) {
    scene.fog = new THREE.FogExp2(new THREE.Color(spec.fog.color), spec.fog.density);
    log.add("fog", "supported", "THREE.FogExp2");
  }

  // Lights
  let csm: CSM | undefined;
  const shadowExtent = spec.shadows?.directionalExtent ?? 10;
  for (const light of spec.lights) {
    if (light.kind === "ambient") {
      scene.add(new THREE.AmbientLight(new THREE.Color(light.color), light.intensity));
    } else if (light.kind === "directional") {
      if (spec.csm && light.castShadow) {
        const direction = new THREE.Vector3(
          light.target[0] - light.position[0],
          light.target[1] - light.position[1],
          light.target[2] - light.position[2]
        ).normalize();
        csm = new CSM({
          camera,
          parent: scene,
          cascades: spec.csm.cascades,
          maxFar: spec.csm.maxFar,
          mode: spec.csm.mode,
          shadowMapSize: spec.shadows?.mapSize ?? 2048,
          shadowBias: spec.shadows?.bias ?? 0,
          lightDirection: direction,
          lightIntensity: light.intensity
        });
        for (const csmLight of csm.lights) {
          csmLight.color.set(light.color);
          csmLight.shadow.normalBias = spec.shadows?.normalBias ?? 0;
        }
        log.add("cascaded-shadow-maps", "supported", `CSM addon, ${spec.csm.cascades} cascades to ${spec.csm.maxFar}`);
        continue;
      }
      const directional = new THREE.DirectionalLight(new THREE.Color(light.color), light.intensity);
      directional.position.set(...light.position);
      directional.target.position.set(...light.target);
      scene.add(directional, directional.target);
      if (light.castShadow && spec.shadows) {
        directional.castShadow = true;
        directional.shadow.mapSize.set(spec.shadows.mapSize, spec.shadows.mapSize);
        const shadowCamera = directional.shadow.camera;
        shadowCamera.left = -shadowExtent;
        shadowCamera.right = shadowExtent;
        shadowCamera.top = shadowExtent;
        shadowCamera.bottom = -shadowExtent;
        shadowCamera.near = 0.1;
        shadowCamera.far = Math.hypot(...light.position) + shadowExtent * 2;
        directional.shadow.bias = spec.shadows.bias;
        directional.shadow.normalBias = spec.shadows.normalBias;
      }
    } else if (light.kind === "point") {
      const point = new THREE.PointLight(new THREE.Color(light.color), light.intensity, light.range, 2);
      point.position.set(...light.position);
      scene.add(point);
    } else {
      const spot = new THREE.SpotLight(new THREE.Color(light.color), light.intensity, light.range, light.angle, light.penumbra, 2);
      spot.position.set(...light.position);
      spot.target.position.set(...light.target);
      scene.add(spot, spot.target);
      if (light.castShadow && spec.shadows) {
        spot.castShadow = true;
        spot.shadow.mapSize.set(spec.shadows.mapSize, spec.shadows.mapSize);
        spot.shadow.bias = spec.shadows.bias;
        spot.shadow.normalBias = spec.shadows.normalBias;
        spot.shadow.camera.near = 0.1;
        spot.shadow.camera.far = light.range > 0 ? light.range : 50;
      }
    }
  }
  const shadowCasters = spec.lights.filter((light) => (light.kind === "directional" || light.kind === "spot") && light.castShadow);
  if (shadowCasters.length > 0) log.add("shadow-map", "supported", `${shadowCasters.length} shadow-casting light(s), PCFSoftShadowMap`);
  if (shadowCasters.length > 1) log.add("multiple-shadow-casters", "supported", shadowCasters.map((light) => light.name).join(", "));
  if (spec.shadows) log.add("shadow-map-config", "supported", `mapSize ${spec.shadows.mapSize}, bias ${spec.shadows.bias}, normalBias ${spec.shadows.normalBias}`);

  // Objects
  const gltfLoader = new GLTFLoader();
  const gltfCache = new Map<string, Promise<GLTF>>();
  const loadGltf = (url: string): Promise<GLTF> => {
    let pending = gltfCache.get(url);
    if (!pending) {
      pending = fetchOnce(url).then(
        (buffer) => new Promise<GLTF>((resolveGltf, rejectGltf) => gltfLoader.parse(buffer, "", resolveGltf, rejectGltf))
      );
      gltfCache.set(url, pending);
    }
    return pending;
  };
  const mixers: THREE.AnimationMixer[] = [];
  const csmMaterials: THREE.Material[] = [];
  const registerShadow = (root: THREE.Object3D, cast: boolean, receive: boolean): void => {
    root.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = cast;
        mesh.receiveShadow = receive;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        csmMaterials.push(...materials);
      }
    });
  };

  for (const object of spec.objects) {
    if (object.kind === "primitive") {
      const mesh = new THREE.Mesh(createGeometry(object.shape, object.size), createMaterial(object.material));
      mesh.name = object.name;
      applyTransform(mesh, object);
      registerShadow(mesh, object.castShadow, object.receiveShadow);
      scene.add(mesh);
    } else if (object.kind === "model") {
      const gltf = await loadGltf(modelAssets[object.asset].url);
      // Reused assets (crates, rocks) are static, so Object3D.clone is enough; skinned
      // actors (soldier, fox, CesiumMan) appear at most once per scene and use the original.
      const root = countUses(spec, object.asset) > 1 ? gltf.scene.clone(true) : gltf.scene;
      root.name = object.name;
      applyTransform(root, object);
      registerShadow(root, object.castShadow, object.receiveShadow);
      scene.add(root);
      if (object.animation) {
        const clip = gltf.animations.find((candidate) => candidate.name === object.animation!.clip);
        if (!clip) {
          errors.push(`Clip "${object.animation.clip}" not found on ${object.asset}`);
        } else {
          const mixer = new THREE.AnimationMixer(root);
          const action = mixer.clipAction(clip);
          action.play();
          mixer.setTime(object.animation.time);
          mixers.push(mixer);
          log.add(`animation:${object.name}`, "supported", `AnimationMixer.setTime(${object.animation.time}) on "${clip.name}"`);
        }
      }
    } else if (object.kind === "instanced") {
      const mesh = new THREE.InstancedMesh(createGeometry(object.shape, object.size), createMaterial(object.material), object.transforms.length);
      mesh.name = object.name;
      const dummy = new THREE.Object3D();
      const color = new THREE.Color();
      object.transforms.forEach((transform, index) => {
        dummy.position.set(0, 0, 0);
        dummy.rotation.set(0, 0, 0, EULER_ORDER);
        dummy.scale.set(1, 1, 1);
        applyTransform(dummy, transform);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
        if (object.colors) mesh.setColorAt(index, color.set(object.colors[index]!));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      registerShadow(mesh, object.castShadow, object.receiveShadow);
      scene.add(mesh);
      log.add("instancing", "supported", `InstancedMesh x${object.transforms.length}`);
    } else {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(particlePositions(object.count, object.seed, object.center, object.radius, object.height), 3));
      const points = new THREE.Points(geometry, new THREE.PointsMaterial({
        color: new THREE.Color(object.color),
        size: object.size,
        sizeAttenuation: true,
        map: createSpriteTexture(),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      }));
      points.name = object.name;
      scene.add(points);
      log.add("particles", "supported", `THREE.Points x${object.count}, seeded positions, additive sprite`);
    }
  }

  if (csm) for (const material of new Set(csmMaterials)) csm.setupMaterial(material);

  if (variant === "albedo-only") {
    // Unlit override that keeps the authored albedo (map + color) — §6.4 variant.
    scene.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      const swap = (material: THREE.Material): THREE.Material => {
        const standard = material as THREE.MeshStandardMaterial;
        return new THREE.MeshBasicMaterial({
          color: standard.color ? standard.color.clone() : new THREE.Color(0xffffff),
          map: standard.map ?? null,
          toneMapped: false
        });
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
    });
  }

  // Post-processing (only when requested)
  let composer: EffectComposer | undefined;
  if (spec.bloom) {
    const target = new THREE.WebGLRenderTarget(width * devicePixelRatio, height * devicePixelRatio, { type: THREE.HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, target);
    composer.setPixelRatio(devicePixelRatio);
    composer.setSize(width, height);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(width, height), spec.bloom.strength, spec.bloom.radius, spec.bloom.threshold));
    composer.addPass(new OutputPass());
    log.add("bloom", "supported", "EffectComposer(HalfFloat, 4x MSAA) + UnrealBloomPass + OutputPass");
  }

  const renderFrame = (): void => {
    renderer.info.reset();
    csm?.update();
    if (composer) composer.render();
    else renderer.render(scene, camera);
  };

  // Warm up shader compilation, then render settle frames at the fixed time.
  await renderer.compileAsync(scene, camera);
  for (const mixer of mixers) mixer.update(0);
  for (let frame = 0; frame < spec.settleFrames; frame += 1) {
    renderFrame();
    await nextFrame();
  }
  renderFrame();
  await nextFrame();

  const shadowLights = spec.lights.filter((light) => (light.kind === "directional" || light.kind === "spot") && light.castShadow);
  const assetHashes: Record<string, string> = {};
  for (const object of spec.objects) {
    if (object.kind === "model") assetHashes[object.asset] = modelAssets[object.asset as ModelAssetId].sha256;
  }
  if (spec.environment) assetHashes[spec.environment.hdri] = hdriAssets[spec.environment.hdri].sha256;
  if (spec.background.kind === "hdri") assetHashes[spec.background.hdri] = hdriAssets[spec.background.hdri].sha256;

  window.__QR_THREE_GRAPH__ = {
    scene,
    camera,
    renderer,
    lights: scene.children.filter((child) => (child as THREE.Light).isLight) as THREE.Light[]
  };

  return {
    engine: "three",
    scene: spec.id,
    engineVersion: __THREE_VERSION__,
    capabilityLog: log.entries,
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    warnings,
    errors,
    loadMs: Math.round(performance.now() - started),
    variant,
    dpr: opts.dpr ?? 1,
    appliedExposure: renderer.toneMappingExposure,
    appliedToneMapping: renderer.toneMapping === THREE.NoToneMapping ? "NoToneMapping" : "ACESFilmicToneMapping",
    lightUnits: "three-physical",
    shadows: {
      mapRendered: renderer.shadowMap.enabled && shadowLights.length > 0,
      mapSampled: renderer.shadowMap.enabled && shadowLights.length > 0,
      mapSize: spec.shadows?.mapSize ?? null,
      strength: null,
      casterName: shadowLights[0]?.name ?? null
    },
    fallbackLightsActive: false,
    assetHashes,
    qrFlags: opts.qrFlags ?? spec.qrFlags ?? [],
    extra: {
      revision: THREE.REVISION,
      programs: renderer.info.programs?.length ?? 0,
      maxAnisotropy: renderer.capabilities.getMaxAnisotropy()
    }
  };
}

function countUses(spec: SceneSpec, asset: string): number {
  return spec.objects.filter((object) => object.kind === "model" && object.asset === asset).length;
}
