/**
 * PRD-05 three.js r185 translator: mounts `Prd05SceneSpec` objects whose GLBs
 * are §6.3 outputs requiring EXT_meshopt_compression + KHR_mesh_quantization
 * + KHR_texture_basisu — loaded via GLTFLoader + MeshoptDecoder + KTX2Loader
 * (the honest three-side decode path for the same bytes).
 */
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { hdriAssets } from "../../../shared/assets";
import type { CapabilityEntry, CapabilityStatus, ReadyPayload } from "../../../shared/types";
import { prd05Assets } from "../../../scenes/prd05/assets";
import type { Prd05SceneSpec } from "../../../scenes/prd05/spec";

const EULER_ORDER: THREE.EulerOrder = "ZYX";

class CapabilityLog {
  readonly entries: CapabilityEntry[] = [];
  add(feature: string, status: CapabilityStatus, detail: string): void {
    this.entries.push({ feature, status, detail });
  }
}

// Served URLs (dist `/qr-assets/`), never repo paths: capture.mjs serves only the built dist.
const assetUrl = (entry: { url: string }): string => entry.url;
/** three's Basis transcoder, copied into dist by the benchmark build (#857). */
export const THREE_BASIS_TRANSCODER_PATH = "/qr-assets/basis/";

export interface Prd05ThreeSceneOptions {
  readonly qrFlags?: readonly string[];
}

export async function runPrd05ThreeScene(spec: Prd05SceneSpec, host: HTMLElement, _options: Prd05ThreeSceneOptions = {}): Promise<ReadyPayload> {
  const started = performance.now();
  const log = new CapabilityLog();
  const errors: string[] = [];

  host.style.width = `${spec.resolution.width}px`;
  host.style.height = `${spec.resolution.height}px`;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(spec.resolution.devicePixelRatio);
  renderer.setSize(spec.resolution.width, spec.resolution.height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = spec.exposure;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(spec.camera.fov, spec.resolution.width / spec.resolution.height, spec.camera.near, spec.camera.far);
  camera.position.set(...spec.camera.position);
  camera.lookAt(...spec.camera.target);

  if (spec.background.kind === "color") {
    scene.background = new THREE.Color(spec.background.color);
  }
  if (spec.environment || spec.background.kind === "hdri") {
    const hdriId = (spec.environment?.hdri ?? (spec.background as { hdri?: string }).hdri)!;
    const hdriEntry = hdriAssets[hdriId as keyof typeof hdriAssets];
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    try {
      const hdr = await new RGBELoader().loadAsync(assetUrl(hdriEntry));
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      const envRt = pmrem.fromEquirectangular(hdr);
      scene.environment = envRt.texture;
      scene.environmentIntensity = spec.environment?.intensity ?? 1;
      scene.environmentRotation.y = spec.environment?.rotation ?? 0;
      if (spec.background.kind === "hdri") {
        scene.background = hdr;
        scene.backgroundIntensity = spec.background.intensity;
      }
      log.add("hdri-ibl", "supported", `RGBELoader + PMREMGenerator on ${hdriEntry.repoPath}`);
    } catch (error) {
      errors.push(`HDRI load failed: ${error instanceof Error ? error.message : String(error)}`);
      if (spec.background.kind === "hdri") scene.background = new THREE.Color(spec.background.fallbackColor);
      log.add("hdri-ibl", "missing", "HDRI failed to load; fallback applied");
    }
    pmrem.dispose();
  }

  for (const light of spec.lights) {
    if (light.kind === "ambient") {
      scene.add(new THREE.AmbientLight(new THREE.Color(light.color), light.intensity));
    } else if (light.kind === "directional") {
      const directional = new THREE.DirectionalLight(new THREE.Color(light.color), light.intensity);
      directional.position.set(...light.position);
      directional.castShadow = light.castShadow;
      scene.add(directional);
      scene.add(directional.target);
      directional.target.position.set(...light.target);
    } else {
      log.add(`light:${light.kind}`, "missing", `${light.name}: kind not translated`);
    }
  }

  const gltfLoader = new GLTFLoader();
  gltfLoader.setMeshoptDecoder(MeshoptDecoder);
  const ktx2 = new KTX2Loader()
    .setTranscoderPath(THREE_BASIS_TRANSCODER_PATH)
    .detectSupport(renderer);
  gltfLoader.setKTX2Loader(ktx2);
  log.add("optimized-decoders", "supported", "GLTFLoader + MeshoptDecoder + KTX2Loader(basis transcoder)");

  const loaded: string[] = [];
  for (const object of spec.objects) {
    if (object.kind === "primitive") {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(object.size[0], object.size[2], 1, 1),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(object.material.color),
          roughness: object.material.roughness,
          metalness: object.material.metalness
        })
      );
      mesh.name = object.name;
      mesh.rotation.order = EULER_ORDER;
      mesh.rotation.x += -Math.PI / 2;
      mesh.position.set(...object.position);
      mesh.castShadow = object.castShadow;
      mesh.receiveShadow = object.receiveShadow;
      scene.add(mesh);
      continue;
    }
    const entry = prd05Assets[object.asset];
    try {
      const gltf = await gltfLoader.loadAsync(assetUrl(entry));
      const root = gltf.scene;
      root.name = object.name;
      root.position.set(...object.position);
      if (object.rotation) {
        root.rotation.order = EULER_ORDER;
        root.rotation.set(...object.rotation);
      }
      if (typeof object.scale === "number") root.scale.setScalar(object.scale);
      else if (object.scale !== undefined) root.scale.set(...object.scale);
      root.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = object.castShadow;
        mesh.receiveShadow = object.receiveShadow;
      });
      scene.add(root);
      loaded.push(entry.id);
      // Animation clips survive optimization; play the first when present so
      // skinned scenes exercise skinning, not just bind pose.
      if (gltf.animations.length > 0) {
        const mixer = new THREE.AnimationMixer(root);
        mixer.clipAction(gltf.animations[0]!).play();
        mixer.update(spec.time);
        log.add(`animation:${object.name}`, "supported", `clip "${gltf.animations[0]!.name}" sampled at t=${spec.time}`);
      }
    } catch (error) {
      errors.push(`${entry.id}: ${error instanceof Error ? error.message : String(error)}`);
      log.add("optimized-glb-load", "missing", `${entry.id} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (loaded.length) {
    log.add("optimized-glb-load", "supported", `decoded ${loaded.length} optimized GLB(s): ${loaded.join(", ")}`);
  }

  for (let frame = 0; frame < spec.settleFrames; frame += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    renderer.render(scene, camera);
  }

  let triangles = 0;
  scene.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry;
    triangles += geometry.index ? geometry.index.count / 3 : (geometry.attributes.position?.count ?? 0) / 3;
  });

  return {
    engine: "three",
    scene: spec.id,
    engineVersion: THREE.REVISION,
    capabilityLog: log.entries,
    triangles: Math.round(triangles),
    warnings: [],
    errors,
    loadMs: Math.round(performance.now() - started),
    qrFlags: [...(spec.qrFlags ?? [])],
    extra: {
      decoders: ["meshopt", "ktx2/basis"],
      optimizedAssets: loaded.map((id) => ({ id, sha256: prd05Assets[id as keyof typeof prd05Assets].sha256, profile: prd05Assets[id as keyof typeof prd05Assets].profile }))
    }
  };
}
