/**
 * PRD-05 LOD-transition scene (three r185 side). Mounts the optimized hero
 * vehicle ×3 at 5/25/80 m and drives the 120-frame dolly with a local
 * `MSFT_lod` GLTFLoader plugin — three.js has no built-in support for the
 * extension, so the lane ships one here per the PRD scene contract.
 *
 * The plugin materializes each `MSFT_lod` chain as a Group of level children
 * (level 0 = the node itself, then `extensions.MSFT_lod.nodeIds`) and
 * selects levels by the same projected-sphere coverage rule the engine's
 * `LodSelector` uses: `radius * proj[5] / viewDepth`, picking the finest
 * level whose `MSFT_screencoverage` threshold the coverage still meets.
 */
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { hdriAssets } from "../../../shared/assets";
import type { CapabilityEntry, CapabilityStatus, ReadyPayload } from "../../../shared/types";
import { prd05Assets } from "../../../scenes/prd05/assets";
import { prd05SceneSpecs } from "../../../scenes/prd05/index";

interface LodChain {
  readonly group: THREE.Group;
  readonly name: string;
  readonly coverage: readonly number[];
  readonly center: THREE.Vector3;
  readonly radius: number;
}

interface LodSwitch {
  readonly frame: number;
  readonly node: string;
  readonly level: number;
  readonly coverage: number;
}

const spec = prd05SceneSpecs["prd05-asset-lod-transition"];

class CapabilityLog {
  readonly entries: CapabilityEntry[] = [];
  add(feature: string, status: CapabilityStatus, detail: string): void {
    this.entries.push({ feature, status, detail });
  }
}

/** Pick the finest level whose threshold the coverage meets (no hysteresis —
 * the engine's LodSelector owns step/hysteresis; the scene records raw picks). */
const pickLevel = (coverage: number, thresholds: readonly number[]): number => {
  for (let i = 0; i < thresholds.length; i += 1) {
    if (coverage >= thresholds[i]!) return i;
  }
  return thresholds.length - 1;
};

export default async (host: HTMLElement, _opts?: { qrFlags?: readonly string[] }): Promise<ReadyPayload> => {
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

  if (spec.background.kind === "hdri") {
    const hdriEntry = hdriAssets[spec.background.hdri as keyof typeof hdriAssets];
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    try {
      const hdr = await new RGBELoader().loadAsync(`/${hdriEntry.repoPath}`);
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      scene.environment = pmrem.fromEquirectangular(hdr).texture;
      scene.environmentIntensity = spec.environment?.intensity ?? 1;
      scene.background = hdr;
      scene.backgroundIntensity = spec.background.intensity;
      log.add("hdri-ibl", "supported", `RGBELoader + PMREMGenerator on ${hdriEntry.repoPath}`);
    } catch (error) {
      errors.push(`HDRI load failed: ${error instanceof Error ? error.message : String(error)}`);
      scene.background = new THREE.Color(spec.background.fallbackColor);
      log.add("hdri-ibl", "missing", "HDRI failed to load; fallback applied");
    }
    pmrem.dispose();
  } else {
    scene.background = new THREE.Color(spec.background.color);
  }

  for (const light of spec.lights) {
    if (light.kind === "ambient") scene.add(new THREE.AmbientLight(new THREE.Color(light.color), light.intensity));
    else if (light.kind === "directional") {
      const directional = new THREE.DirectionalLight(new THREE.Color(light.color), light.intensity);
      directional.position.set(...light.position);
      directional.castShadow = light.castShadow;
      scene.add(directional);
      scene.add(directional.target);
      directional.target.position.set(...light.target);
    }
  }

  const lodChains: LodChain[] = [];

  // --- MSFT_lod GLTFLoader plugin ----------------------------------------
  // afterRoot: walk parser.associations (Object3D → {nodes: index}), and for
  // every node carrying extensions.MSFT_lod swap its Object3D for a Group
  // holding the base node plus the LOD nodes as siblings.
  const gltfLoader = new GLTFLoader();
  gltfLoader.register((parser) => ({
    name: "MSFT_lod",
    async afterRoot(result: GLTF) {
      const json = parser.json as {
        nodes?: Array<{ extensions?: { MSFT_lod?: { nodeIds?: number[] } }; extras?: { MSFT_screencoverage?: number[] } }>;
      };
      for (const [object, assoc] of parser.associations) {
        const nodeIndex = (assoc as { nodes?: number }).nodes;
        if (typeof nodeIndex !== "number" || !(object as THREE.Object3D).isObject3D) continue;
        const nodeDef = json.nodes?.[nodeIndex];
        const ext = nodeDef?.extensions?.MSFT_lod;
        if (!ext?.nodeIds?.length || !object.parent) continue;
        const parent = object.parent as THREE.Object3D;
        const childIndex = parent.children.indexOf(object);
        const group = new THREE.Group();
        group.name = `${object.name}#msftLod`;
        group.position.copy(object.position);
        group.quaternion.copy(object.quaternion);
        group.scale.copy(object.scale);
        object.position.set(0, 0, 0);
        object.quaternion.identity();
        object.scale.set(1, 1, 1);
        parent.remove(object);
        group.add(object);
        for (const lodIndex of ext.nodeIds) {
          const lodObject = await parser.getDependency("node", lodIndex);
          lodObject.position.set(0, 0, 0);
          lodObject.quaternion.identity();
          lodObject.scale.set(1, 1, 1);
          lodObject.visible = false;
          group.add(lodObject);
        }
        parent.children.splice(childIndex, 0, group);
        lodChains.push({
          group,
          name: object.name,
          coverage: nodeDef?.extras?.MSFT_screencoverage ?? [0.5, 0.25, 0.125, 0.0625],
          center: new THREE.Vector3(),
          radius: 0
        });
      }
      result.scene.userData.msftLodChains = lodChains.length;
    }
  }));
  gltfLoader.setMeshoptDecoder(MeshoptDecoder);
  const ktx2 = new KTX2Loader()
    .setTranscoderPath("/node_modules/three/examples/jsm/libs/basis/")
    .detectSupport(renderer);
  gltfLoader.setKTX2Loader(ktx2);
  log.add("optimized-decoders", "supported", "GLTFLoader + MeshoptDecoder + KTX2Loader + MSFT_lod plugin");

  const loaded: string[] = [];
  for (const object of spec.objects) {
    if (object.kind === "primitive") {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(object.size[0], object.size[2], 1, 1),
        new THREE.MeshStandardMaterial({ color: new THREE.Color(object.material.color), roughness: object.material.roughness, metalness: object.material.metalness })
      );
      mesh.name = object.name;
      mesh.rotation.x += -Math.PI / 2;
      mesh.position.set(...object.position);
      mesh.castShadow = object.castShadow;
      mesh.receiveShadow = object.receiveShadow;
      scene.add(mesh);
      continue;
    }
    const entry = prd05Assets[object.asset];
    try {
      const gltf = await gltfLoader.loadAsync(`/${entry.repoPath}`);
      const root = gltf.scene;
      root.name = object.name;
      root.position.set(...object.position);
      if (object.rotation) {
        root.rotation.order = "ZYX";
        root.rotation.set(...object.rotation);
      }
      scene.add(root);
      loaded.push(entry.id);
    } catch (error) {
      errors.push(`${entry.id}: ${error instanceof Error ? error.message : String(error)}`);
      log.add("optimized-glb-load", "missing", `${entry.id} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (loaded.length) log.add("optimized-glb-load", "supported", `decoded ${loaded.length} optimized GLB(s)`);
  log.add("msft-lod-chains", "supported", `${lodChains.length} MSFT_lod chain(s) materialized across ${loaded.length} copies`);

  // Bounding-sphere radius per chain (world space, level-0 only — matches the
  // engine's chain.radius), refreshed once now that transforms are final.
  scene.updateMatrixWorld(true);
  for (const chain of lodChains) {
    const box = new THREE.Box3().setFromObject(chain.group.children[0]!);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    chain.center.copy(sphere.center);
    chain.radius = sphere.radius;
    chain.group.children.forEach((level, i) => {
      level.visible = i === 0;
    });
  }

  const lodLog: LodSwitch[] = [];
  const activeLevels = new Map<LodChain, number>();
  const proj5 = Math.abs(camera.projectionMatrix.elements[5]);
  const view = new THREE.Vector3();
  const selectFrame = (frame: number): void => {
    camera.updateMatrixWorld(true);
    for (const chain of lodChains) {
      view.copy(chain.center).applyMatrix4(camera.matrixWorldInverse);
      const depth = Math.max(1e-3, -view.z);
      const coverage = (chain.radius * proj5) / depth;
      const next = pickLevel(coverage, chain.coverage);
      const prev = activeLevels.get(chain) ?? -1;
      if (next !== prev) {
        lodLog.push({ frame, node: chain.name, level: next, coverage: Number(coverage.toFixed(4)) });
        chain.group.children.forEach((level, i) => {
          level.visible = i === next;
        });
        activeLevels.set(chain, next);
      }
    }
  };

  const frames = spec.strip?.frames ?? spec.settleFrames;
  for (let frame = 0; frame < frames; frame += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    // Dolly: drift the camera between copies so coverage crosses thresholds.
    const t = frames > 1 ? frame / (frames - 1) : 0;
    camera.position.set(
      spec.camera.position[0] + Math.sin(t * Math.PI * 2) * 3,
      spec.camera.position[1],
      spec.camera.position[2] - t * 18
    );
    camera.lookAt(...spec.camera.target);
    selectFrame(frame);
    renderer.render(scene, camera);
  }

  let triangles = 0;
  scene.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
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
      msftLodChains: lodChains.length,
      lodSwitchCount: lodLog.length,
      lodLog,
      optimizedAssets: loaded.map((id) => ({ id, sha256: prd05Assets[id as keyof typeof prd05Assets].sha256, profile: prd05Assets[id as keyof typeof prd05Assets].profile }))
    }
  };
};
