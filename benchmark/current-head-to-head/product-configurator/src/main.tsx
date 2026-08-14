import React, { Suspense, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { loadProductionGLTFRenderPipeline } from "@aura3d/assets";
import { A3DRenderer, DirectionalLight } from "@aura3d/engine/advanced-runtime";
import { loadHdrEnvironment } from "@aura3d/engine/production-runtime";
import { PBRMaterial, computePerspectiveCameraFrame, type CollectedLight, type RenderSource } from "@aura3d/rendering";
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
const ENVIRONMENT = { id: "studio-small-08", url: "/fixtures/environment-corpus/hdri/studio_small_08_1k.hdr", intensity: 1, rotation: 0 } as const;
const FRAME = { paddingRatio: 0.14, fovYRadians: 38 * Math.PI / 180, yawRadians: 0, pitchRadians: 0, nearPadding: 0.1, farPadding: 2.2 } as const;
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
    auraEnvironmentIntensity: 0.7,
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
    background: "#050607",
    auraEnvironmentIntensity: 0.82,
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
  const pipeline = await loadProductionGLTFRenderPipeline({
    url: ASSET.url,
    assetId: ASSET.id,
    assetName: "Aura3D Configured Headphones",
    width: VIEWPORT.width,
    height: VIEWPORT.height,
    rendererInput: { qualityPreset: "studio-preview", cameraPolicy: "require", frame: FRAME, postprocess: false, frustumCulling: false }
  });
  const renderer = await A3DRenderer.create({ canvas, width: VIEWPORT.width, height: VIEWPORT.height, backend: "webgl2", preserveDrawingBuffer: true, antialias: true, clearColor: [5 / 255, 6 / 255, 7 / 255, 1] });
  const environment = await loadHdrEnvironment({ ...ENVIRONMENT, label: "Shared configurator studio", toneMapping: { operator: "aces", exposure: 1 } });
  const keySource = new DirectionalLight("shared-configurator-key");
  keySource.color = linearRgbNumber(0xe8f4ff);
  keySource.intensity = 3.1;
  const key: CollectedLight = { kind: "directional", color: keySource.color, intensity: keySource.intensity, position: [3, 4, 3], direction: normalize3([-3, -4, -3]), right: [1, 0, 0], up: [0, 1, 0], range: 0, width: 0, height: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: keySource };
  const baseInput = pipeline.resources.toRendererInput(VIEWPORT, {
    qualityPreset: "hdr-studio-preview",
    cameraPolicy: "require",
    frame: FRAME,
    environmentLighting: { ...environment.environmentLighting, color: [1, 1, 1], intensity: 0.35 },
    collectedLights: [key],
    postprocess: { toneMapping: { operator: "aces", exposure: 1, inputColorSpace: "linear", outputColorSpace: "srgb" } },
    frustumCulling: false
  });
  return async (configurationId: ConfigurationId) => {
    runtime.auraStage = `mounting-${configurationId}`;
    publish();
    const configuration = CONFIGURATIONS[configurationId];
    const configuredMaterial = new PBRMaterial({
      name: `configured-${configuration.id}`,
      baseColor: [...linearRgbHex(configuration.color), 1],
      roughness: configuration.roughness,
      metallic: configuration.metalness,
      clearcoatFactor: configuration.clearcoat,
      clearcoatRoughnessFactor: configuration.clearcoatRoughness
    });
    const source = baseInput.source as RenderSource;
    const materialLibrary = new Map([...pipeline.resources.materialLibrary.keys()].map((key) => [key, configuredMaterial] as const));
    const diagnostics = renderer.render({ ...source, materialLibrary, postprocess: false }, baseInput.camera);
    await nextPaint();
    runtime.aura = {
      publicPackageOnly: true,
      publicApi: "@aura3d/assets production GLB pipeline + public advanced renderer + HDR environment",
      backend: "webgl2",
      drawCalls: diagnostics.drawCalls,
      assetState: { id: ASSET.id, status: "ready", provenance: { source: "typed-aura-assets-manifest" } },
      configuration: configuration.id,
      material: pickMaterial(configuration),
      environment: configuration.environment,
      environmentIntensity: configuration.auraEnvironmentIntensity,
      backgroundPixel: readBackgroundPixel(canvas),
      pixelHash: hashString(canvas.toDataURL("image/png"))
    };
    configuredMaterial.dispose();
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
    let disposed = false;
    let environment: THREE.WebGLRenderTarget | undefined;
    let hdr: THREE.DataTexture | undefined;
    void new RGBELoader().loadAsync(ENVIRONMENT.url).then((loadedHdr) => {
      if (disposed) { loadedHdr.dispose(); return; }
      hdr = loadedHdr;
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      environment = generator.fromEquirectangular(hdr);
      threeScene.environment = environment.texture;
      threeScene.environmentIntensity = ENVIRONMENT.intensity;
      const frame = computePerspectiveCameraFrame({ min: [-ASSET.bounds[0] / 2, -ASSET.bounds[1] / 2, -ASSET.bounds[2] / 2], max: [ASSET.bounds[0] / 2, ASSET.bounds[1] / 2, ASSET.bounds[2] / 2] }, VIEWPORT, FRAME);
      threeCamera.position.set(...frame.cameraPosition);
      threeCamera.lookAt(...frame.center);
      if (threeCamera instanceof THREE.PerspectiveCamera) {
        threeCamera.fov = frame.fovYRadians * 180 / Math.PI;
        threeCamera.near = frame.near;
        threeCamera.far = frame.far;
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
    }).catch(reportError);
    return () => {
      disposed = true;
      threeScene.environment = null;
      environment?.dispose();
      hdr?.dispose();
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
    <ambientLight intensity={0.35} color="#ffffff"/>
    <directionalLight position={[3, 4, 3]} intensity={3.1} color="#e8f4ff"/>
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
function linearRgbHex(hex: string): [number, number, number] { return linearRgbNumber(Number.parseInt(hex.slice(1), 16)); }
function linearRgbNumber(hex: number): [number, number, number] { return [16, 8, 0].map((shift) => { const value = ((hex >> shift) & 0xff) / 255; return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4; }) as [number, number, number]; }
function normalize3(value: readonly [number, number, number]): [number, number, number] { const length = Math.hypot(...value); return [value[0] / length, value[1] / length, value[2] / length]; }
