import React, { Suspense, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import {
  camera,
  createAuraApp,
  defineAuraAssets,
  environments,
  lights,
  material,
  model,
  primitives,
  scene
} from "@aura3d/engine";

const ASSET = {
  id: "showcaseHeadphones",
  url: "/aura-assets/showcaseHeadphones.40b1fdf7.glb",
  sha256: "40b1fdf7e0afdf0e5f950040f42608d3655561e61f32b9ad59690476abb15833",
  bounds: [936.934, 960.48, 382.415]
} as const;
const VIEWPORT = { width: 1440, height: 900, dpr: 1 } as const;
const TARGET_MAX_DIMENSION = 1.6;
const CAMERA = { position: [0, 0.58, 2.72] as const, target: [0, 0.55, 0] as const, fov: 38 };
const CONFIGURATIONS = {
  studio: {
    id: "copper-gloss-studio",
    variant: "copper",
    finish: "gloss",
    environment: "studio",
    color: "#d4764c",
    roughness: 0.09,
    metalness: 0.03,
    clearcoat: 0.96,
    clearcoatRoughness: 0.018,
    background: "#050607",
    auraEnvironmentIntensity: 1.42,
    threeEnvironmentIntensity: 0.42,
    ambient: { intensity: 0.42, color: "#f4efe6" },
    key: { position: [-3, 4, 4] as const, intensity: 2.35, color: "#fff8ee" },
    rim: { position: [3, 2, 1] as const, intensity: 0.82, color: "#b9e7ff" }
  },
  inspection: {
    id: "ceramic-titanium-inspection",
    variant: "ceramic",
    finish: "titanium",
    environment: "inspection",
    color: "#d8d7d0",
    roughness: 0.27,
    metalness: 0.86,
    clearcoat: 0.18,
    clearcoatRoughness: 0.12,
    background: "#10141b",
    auraEnvironmentIntensity: 1.48,
    threeEnvironmentIntensity: 0.56,
    ambient: { intensity: 0.68, color: "#dcecff" },
    key: { position: [3, 4, 3] as const, intensity: 3.1, color: "#e8f4ff" },
    rim: { position: [-3, 2, 1] as const, intensity: 1.14, color: "#ffd9ae" }
  }
} as const;
type ConfigurationId = keyof typeof CONFIGURATIONS;

const assets = defineAuraAssets({
  showcaseHeadphones: {
    type: "model",
    format: "glb",
    url: ASSET.url,
    hash: `sha256-${ASSET.sha256}`,
    bounds: ASSET.bounds,
    sizeBytes: 1_589_596,
    metadata: { license: "CC-BY-4.0" }
  }
});

declare global {
  interface Window {
    __AURA_THREE_HEAD_TO_HEAD_PRODUCT_CONFIGURATOR__?: any;
    __AURA_THREE_HEAD_TO_HEAD_PRODUCT_CONFIGURATOR_ERROR__?: string;
  }
}

const runtime: Record<string, any> = {
  ready: false,
  workload: "product-configurator",
  asset: ASSET,
  viewport: VIEWPORT,
  contract: {
    targetMaxDimension: TARGET_MAX_DIMENSION,
    camera: CAMERA,
    configurations: CONFIGURATIONS,
    interaction: "copper/gloss/studio to ceramic/titanium/inspection"
  },
  aura: null,
  three: null,
  auraStage: "starting",
  threeStage: "starting",
  interaction: { applied: false }
};
const publish = () => {
  runtime.ready = Boolean(runtime.aura && runtime.three);
  window.__AURA_THREE_HEAD_TO_HEAD_PRODUCT_CONFIGURATOR__ = structuredClone(runtime);
};
publish();

function buildAuraScene(configurationId: ConfigurationId) {
  const configuration = CONFIGURATIONS[configurationId];
  const builder = scene()
    .background(configuration.background);
  builder.add(configurationId === "studio"
    ? environments.productHero({ intensity: configuration.auraEnvironmentIntensity, color: "#fff4e6" })
    : environments.materialLab({ intensity: configuration.auraEnvironmentIntensity, color: "#f4f8ff" }));
  return builder
    .add(primitives.cylinder({
      name: "product stage",
      radius: 0.82,
      height: 0.08,
      material: material.pbr({ color: "#1d2025", roughness: 0.48, metallic: 0.08 })
    }).position(0, 0.02, 0).scale([1, 0.18, 1]))
    .add(model(assets.showcaseHeadphones, {
      name: "configured typed headphones",
      scaleMode: "fit",
      targetMaxDimension: TARGET_MAX_DIMENSION,
      material: material.clearcoatPaint({
        color: configuration.color,
        roughness: configuration.roughness,
        metallic: configuration.metalness,
        clearcoat: configuration.clearcoat,
        clearcoatRoughness: configuration.clearcoatRoughness
      })
    }).position(0, 0.1, 0))
    .add(lights.ambient(configuration.ambient))
    .add(lights.point(configuration.key))
    .add(lights.point(configuration.rim))
    .camera(camera.perspective(CAMERA));
}

async function startAura(): Promise<(configurationId: ConfigurationId) => Promise<void>> {
  const canvas = document.getElementById("aura");
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Aura canvas missing");
  const app = createAuraApp(canvas, {
    autoStart: false,
    pixelRatio: 1,
    resize: false,
    diagnostics: { overlay: false, assetPanel: false, performancePanel: false },
    scene: buildAuraScene("studio")
  });
  return async (configurationId: ConfigurationId) => {
    runtime.auraStage = `mounting-${configurationId}`;
    publish();
    if (configurationId !== "studio") app.setScene(buildAuraScene(configurationId));
    await app.ready();
    app.step(1 / 60);
    await nextPaint();
    const diagnostics = app.diagnostics();
    if (diagnostics.errors.length > 0) throw new Error(`Aura renderer failed: ${diagnostics.errors.join(" | ")}`);
    const configuration = CONFIGURATIONS[configurationId];
    runtime.aura = {
      publicPackageOnly: true,
      publicApi: "createAuraApp + typed model material override + public lights/camera",
      backend: app.backend,
      drawCalls: diagnostics.drawCalls,
      assetState: diagnostics.assets.find((asset) => asset.id === ASSET.id),
      configuration: configuration.id,
      material: pickMaterial(configuration),
      environment: configuration.environment,
      environmentIntensity: configuration.auraEnvironmentIntensity,
      backgroundPixel: readBackgroundPixel(canvas),
      pixelHash: hashString(canvas.toDataURL("image/png"))
    };
    runtime.auraStage = `rendered-${configurationId}`;
    publish();
  };
}

function Product({ configurationId }: { configurationId: ConfigurationId }) {
  runtime.threeStage = "loading-gltf";
  publish();
  const gltf = useGLTF(ASSET.url);
  const configuration = CONFIGURATIONS[configurationId];
  const object = useMemo(() => {
    const clone = gltf.scene.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const scale = TARGET_MAX_DIMENSION / Math.max(size.x, size.y, size.z);
    clone.scale.setScalar(scale);
    clone.position.set(-center.x * scale, 0.1 - box.min.y * scale, -center.z * scale);
    clone.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.material = new THREE.MeshPhysicalMaterial({
        color: configuration.color,
        roughness: configuration.roughness,
        metalness: configuration.metalness,
        clearcoat: configuration.clearcoat,
        clearcoatRoughness: configuration.clearcoatRoughness
      });
    });
    return clone;
  }, [configuration, gltf.scene]);
  useEffect(() => () => {
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((entry) => entry.dispose());
    });
  }, [object]);
  runtime.threeStage = "gltf-loaded";
  publish();
  return <>
    <Evidence object={object} configurationId={configurationId}/>
    <primitive object={object}/>
  </>;
}

function Evidence({ object, configurationId }: { object: THREE.Object3D; configurationId: ConfigurationId }) {
  const { camera: threeCamera, gl, invalidate, scene: threeScene } = useThree();
  useEffect(() => {
    const configuration = CONFIGURATIONS[configurationId];
    const generator = new THREE.PMREMGenerator(gl);
    const environment = generator.fromScene(new RoomEnvironment(), 0.04);
    threeScene.environment = environment.texture;
    threeScene.environmentIntensity = configuration.threeEnvironmentIntensity;
    threeCamera.position.set(...CAMERA.position);
    threeCamera.lookAt(...CAMERA.target);
    if (threeCamera instanceof THREE.PerspectiveCamera) {
      threeCamera.fov = CAMERA.fov;
      threeCamera.near = 0.1;
      threeCamera.far = 100;
      threeCamera.updateProjectionMatrix();
    }
    invalidate();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const context = gl.getContext();
      const pixels = new Uint8Array(VIEWPORT.width * VIEWPORT.height * 4);
      context.readPixels(0, 0, VIEWPORT.width, VIEWPORT.height, context.RGBA, context.UNSIGNED_BYTE, pixels);
      runtime.three = {
        revision: THREE.REVISION,
        actualR3F: true,
        actualDrei: true,
        actualRenderer: gl instanceof THREE.WebGLRenderer,
        actualGLTFLoader: true,
        drawCalls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        nodeCount: countNodes(object),
        configuration: configuration.id,
        material: pickMaterial(configuration),
        environment: configuration.environment,
        environmentIntensity: configuration.threeEnvironmentIntensity,
        backgroundPixel: [pixels[0]!, pixels[1]!, pixels[2]!, pixels[3]!],
        pixelHash: hash(pixels)
      };
      runtime.threeStage = `rendered-${configurationId}`;
      publish();
    }));
    return () => {
      threeScene.environment = null;
      environment.dispose();
      generator.dispose();
    };
  }, [configurationId, gl, invalidate, object, threeCamera, threeScene]);
  return null;
}

function App() {
  const [configurationId, setConfigurationId] = useState<ConfigurationId>("studio");
  const configuration = CONFIGURATIONS[configurationId];
  useEffect(() => {
    const button = document.getElementById("change-configuration");
    const change = () => {
      runtime.interaction = { applied: true, from: CONFIGURATIONS.studio.id, to: CONFIGURATIONS.inspection.id };
      setConfigurationId("inspection");
      void auraRender?.("inspection").catch(reportError);
    };
    button?.addEventListener("click", change);
    return () => button?.removeEventListener("click", change);
  }, []);
  return <Canvas
    frameloop="demand"
    dpr={1}
    gl={{ antialias: true, preserveDrawingBuffer: true }}
    camera={{ fov: CAMERA.fov, near: 0.1, far: 100 }}
    onCreated={({ gl }) => {
      gl.outputColorSpace = THREE.SRGBColorSpace;
      gl.toneMapping = THREE.ACESFilmicToneMapping;
      gl.toneMappingExposure = 1;
    }}
    style={{ width: 1440, height: 900 }}
  >
    <color attach="background" args={[configuration.background]}/>
    <ambientLight intensity={configuration.ambient.intensity} color={configuration.ambient.color}/>
    <pointLight position={configuration.key.position} intensity={configuration.key.intensity} color={configuration.key.color}/>
    <pointLight position={configuration.rim.position} intensity={configuration.rim.intensity} color={configuration.rim.color}/>
    <mesh position={[0, 0.02, 0]} scale={[1, 0.18, 1]}>
      <cylinderGeometry args={[0.82, 0.82, 0.08, 64]}/>
      <meshStandardMaterial color="#1d2025" roughness={0.48} metalness={0.08}/>
    </mesh>
    <Suspense fallback={null}><Product configurationId={configurationId}/></Suspense>
    <OrbitControls makeDefault enableDamping={false} target={CAMERA.target}/>
  </Canvas>;
}

let auraRender: ((configurationId: ConfigurationId) => Promise<void>) | undefined;
createRoot(document.getElementById("root")!).render(<App/>);
startAura().then(async (render) => { auraRender = render; await render("studio"); }).catch(reportError);

function pickMaterial(configuration: typeof CONFIGURATIONS[ConfigurationId]) {
  return {
    color: configuration.color,
    roughness: configuration.roughness,
    metalness: configuration.metalness,
    clearcoat: configuration.clearcoat,
    clearcoatRoughness: configuration.clearcoatRoughness
  };
}
function reportError(error: unknown): void {
  window.__AURA_THREE_HEAD_TO_HEAD_PRODUCT_CONFIGURATOR_ERROR__ = error instanceof Error ? error.stack ?? error.message : String(error);
}
function nextPaint(): Promise<void> { return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); }
function hash(pixels: Uint8Array): string { let value = 2166136261; for (let index = 0; index < pixels.length; index += 97) { value ^= pixels[index]!; value = Math.imul(value, 16777619); } return (value >>> 0).toString(16).padStart(8, "0"); }
function hashString(value: string): string { let result = 2166136261; for (let index = 0; index < value.length; index += 17) { result ^= value.charCodeAt(index); result = Math.imul(result, 16777619); } return (result >>> 0).toString(16).padStart(8, "0"); }
function countNodes(root: THREE.Object3D): number { let count = 0; root.traverse(() => count++); return count; }
function readBackgroundPixel(canvas: HTMLCanvasElement): readonly [number, number, number, number] { const gl = canvas.getContext("webgl2"); if (!gl) throw new Error("Aura background proof requires WebGL2"); const pixel = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel); return [pixel[0]!, pixel[1]!, pixel[2]!, pixel[3]!]; }
