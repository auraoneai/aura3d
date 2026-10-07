/**
 * PRD-04 three.js r185 translator: Prd04SceneSpec -> idiomatic three.
 * Lane-local (prd12's shared/common.ts only knows the 18 legacy scenes and the
 * shared asset table; Q-04-3 requests registry discovery + asset serving).
 */
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { hdriAssets } from "../../../shared/assets";
import type { CapabilityEntry, CapabilityStatus, ReadyPayload } from "../../../shared/types";
import { prd04ModelAssets, prd04TextureAssets } from "../../../scenes/prd04/assets";
import type { Prd04ModelSpec, Prd04SceneSpec } from "../../../scenes/prd04/spec";

const EULER_ORDER: THREE.EulerOrder = "ZYX";

class CapabilityLog {
  readonly entries: CapabilityEntry[] = [];
  add(feature: string, status: CapabilityStatus, detail: string): void {
    this.entries.push({ feature, status, detail });
  }
}

/** Serve the same bytes the canonical /qr-assets/ URL will serve. */
function assetUrl(repoPath: string): string {
  return `/${repoPath}`;
}

function applyModelTint(root: THREE.Object3D, color: string, log: CapabilityLog): void {
  const tint = new THREE.Color(color);
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      const standard = material as THREE.MeshStandardMaterial;
      if (standard.color) standard.color.set(tint);
    }
  });
  log.add("model-tint", "supported", "material.color.set() applied to every mesh material (three reference for S3)");
}

async function applyVariant(gltf: GLTF, root: THREE.Object3D, variantName: string, log: CapabilityLog): Promise<void> {
  const parser = gltf.parser;
  const extensionDef = parser.json.extensions?.KHR_materials_variants as
    | { variants?: { name: string }[] }
    | undefined;
  const variants = extensionDef?.variants ?? [];
  const variantIndex = variants.findIndex((variant) => variant.name === variantName);
  if (variantIndex < 0) {
    log.add("variant", "missing", `variant "${variantName}" not in glTF (${variants.map((v) => v.name).join(", ")})`);
    return;
  }
  const swaps: Promise<void>[] = [];
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || mesh.userData.gltfExtensions?.KHR_materials_variants === undefined) return;
    const mappings = mesh.userData.gltfExtensions.KHR_materials_variants.mappings as {
      material: number;
      variants?: number[];
    }[];
    const mapping = mappings.find((entry) => entry.variants?.includes(variantIndex));
    if (!mapping) return;
    swaps.push(
      parser.getDependency("material", mapping.material).then((material) => {
        mesh.material = material as THREE.Material;
      })
    );
  });
  await Promise.all(swaps);
  log.add("variant", "supported", `KHR_materials_variants "${variantName}" applied on ${swaps.length} mesh(es)`);
}

export async function runPrd04ThreeScene(spec: Prd04SceneSpec, host: HTMLElement): Promise<ReadyPayload> {
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
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    spec.camera.fov,
    spec.resolution.width / spec.resolution.height,
    spec.camera.near,
    spec.camera.far
  );
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
      const hdr = await new RGBELoader().loadAsync(assetUrl(hdriEntry.repoPath));
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
    } else if (light.kind === "point") {
      const point = new THREE.PointLight(new THREE.Color(light.color), light.intensity, light.range);
      point.position.set(...light.position);
      scene.add(point);
    } else {
      const spot = new THREE.SpotLight(new THREE.Color(light.color), light.intensity, light.range, light.angle, light.penumbra);
      spot.position.set(...light.position);
      spot.castShadow = light.castShadow;
      scene.add(spot);
      scene.add(spot.target);
      spot.target.position.set(...light.target);
    }
  }

  const textureLoader = new THREE.TextureLoader();
  const gltfLoader = new GLTFLoader();
  const ktx2 = new KTX2Loader()
    .setTranscoderPath("/node_modules/three/examples/jsm/libs/basis/")
    .detectSupport(renderer);
  gltfLoader.setKTX2Loader(ktx2);

  const gltfCache = new Map<string, Promise<GLTF>>();
  const loadGltf = (url: string): Promise<GLTF> => {
    let pending = gltfCache.get(url);
    if (!pending) {
      pending = gltfLoader.loadAsync(url);
      gltfCache.set(url, pending);
    }
    return pending;
  };

  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  for (const object of spec.objects) {
    if (object.kind === "primitive") {
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(object.material.color),
        roughness: object.material.roughness,
        metalness: object.material.metalness
      });
      const maps = object.textureMaps;
      if (maps) {
        const set = prd04TextureAssets[maps.textureSet];
        const aniso = maps.anisotropy === "tier" ? 8 : maps.anisotropy;
        const anisoClamped = Math.min(aniso, maxAniso);
        const bind = (url: string, srgb: boolean) => {
          const texture = textureLoader.load(url);
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(maps.repeat, maps.repeat);
          texture.anisotropy = anisoClamped;
          texture.generateMipmaps = true;
          texture.minFilter = THREE.LinearMipmapLinearFilter;
          if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
          return texture;
        };
        material.map = bind(assetUrl(set.maps.color.repoPath), true);
        material.normalMap = bind(assetUrl(set.maps.normal.repoPath), false);
        material.roughnessMap = bind(assetUrl(set.maps.roughness.repoPath), false);
        material.metalnessMap = bind(assetUrl(set.maps.metalness.repoPath), false);
        log.add(
          "texture-maps",
          "supported",
          `${maps.textureSet} repeat=${maps.repeat} aniso=${anisoClamped} (requested ${aniso}) trilinear mipmaps`
        );
      }
      const geometry = new THREE.PlaneGeometry(object.size[0], object.size[2], 1, 1);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = object.name;
      mesh.rotation.order = EULER_ORDER;
      mesh.position.set(...object.position);
      if (object.rotation) mesh.rotation.set(...object.rotation);
      mesh.rotation.x += -Math.PI / 2; // shared plane faces +Y
      mesh.castShadow = object.castShadow;
      mesh.receiveShadow = object.receiveShadow;
      scene.add(mesh);
    } else if (object.kind === "model") {
      const entry = prd04ModelAssets[object.asset];
      try {
        const gltf = await loadGltf(assetUrl(entry.repoPath));
        const root = gltf.scene.clone(true);
        root.name = object.name;
        root.position.set(...object.position);
        if (object.rotation) {
          root.rotation.order = EULER_ORDER;
          root.rotation.set(...object.rotation);
        }
        if (object.scale !== undefined) {
          if (typeof object.scale === "number") root.scale.setScalar(object.scale);
          else root.scale.set(...object.scale);
        }
        root.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.castShadow = object.castShadow;
            mesh.receiveShadow = object.receiveShadow;
          }
        });
        if (object.tint) applyModelTint(root, object.tint.color, log);
        if (object.variant) await applyVariant(gltf, root, object.variant, log);
        scene.add(root);
      } catch (error) {
        errors.push(`${object.asset}: ${error instanceof Error ? error.message : String(error)}`);
        log.add(`asset:${object.asset}`, "missing", `load failed`);
      }
    }
  }

  const renderFrame = () => {
    renderer.render(scene, camera);
  };
  // settle frames: rAF-paced like the shared runner
  for (let frame = 0; frame < spec.settleFrames; frame += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    renderFrame();
  }

  return {
    engine: "three",
    scene: spec.id,
    engineVersion: THREE.REVISION,
    capabilityLog: log.entries,
    warnings: [],
    errors,
    loadMs: Math.round(performance.now() - started),
    extra: {
      maxAnisotropy: maxAniso,
      ktx2LoaderAttached: true
    }
  };
}
