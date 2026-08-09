import React, { Suspense, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import {
  camera,
  createAuraApp,
  defineAuraAssets,
  lights,
  model,
  scene
} from "@aura3d/engine";

const ASSET = {
  id: "showcaseSkylineCity",
  url: "/aura-assets/showcaseSkylineCity.2f6624cd.glb",
  sha256: "2f6624cdd44b88b4c9b612bf0b9062451c5ade91ed243e0c595672d79dd13338",
  bounds: [76.317, 62.152, 85.578]
} as const;
const VIEWPORT = { width: 1440, height: 900, dpr: 1 } as const;
const TARGET_MAX_DIMENSION = 1.58;
const CAMERA_TARGET = [0, 0, 0] as const;
const CAMERA_PATH = [
  { position: [1.55, 0.82, 2.45] as const, fov: 45 },
  { position: [-1.34, 0.64, 2.2] as const, fov: 45 }
] as const;

const assets = defineAuraAssets({
  showcaseSkylineCity: {
    type: "model",
    format: "glb",
    url: ASSET.url,
    hash: `sha256-${ASSET.sha256}`,
    bounds: ASSET.bounds,
    sizeBytes: 23_407_676,
    metadata: { license: "CC-BY-4.0" }
  }
});

declare global {
  interface Window {
    __AURA_THREE_HEAD_TO_HEAD_ARCHITECTURE__?: any;
    __AURA_THREE_HEAD_TO_HEAD_ARCHITECTURE_ERROR__?: string;
  }
}

const runtime: Record<string, any> = {
  ready: false,
  workload: "cinematic-architecture",
  asset: ASSET,
  viewport: VIEWPORT,
  conditions: {
    targetMaxDimension: TARGET_MAX_DIMENSION,
    cameraTarget: CAMERA_TARGET,
    cameraPath: CAMERA_PATH,
    background: "#080d19",
    ambientIntensity: 0.35,
    directional: { position: [8, 14, 10], intensity: 2.6, color: "#fff4e6" }
  },
  aura: null,
  three: null,
  auraStage: "starting",
  threeStage: "starting",
  interaction: { applied: false }
};
const publish = () => {
  runtime.ready = Boolean(runtime.aura && runtime.three);
  window.__AURA_THREE_HEAD_TO_HEAD_ARCHITECTURE__ = structuredClone(runtime);
};
publish();

function buildAuraScene(step: number) {
  const shot = CAMERA_PATH[step]!;
  return scene()
    .background("#080d19")
    .add(model(assets.showcaseSkylineCity, {
      name: "typed skyline city",
      scaleMode: "fit",
      targetMaxDimension: TARGET_MAX_DIMENSION
    }))
    .add(lights.ambient({ intensity: 0.35, color: "#ffffff" }))
    .add(lights.directional({ position: [8, 14, 10], intensity: 2.6, color: "#fff4e6" }))
    .camera(camera.perspective({ position: shot.position, target: CAMERA_TARGET, fov: shot.fov }));
}

async function startAura(): Promise<(step: number) => Promise<void>> {
  const canvas = document.getElementById("aura");
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Aura canvas missing");
  runtime.auraStage = "creating-public-app";
  publish();
  const app = createAuraApp(canvas, {
    autoStart: false,
    pixelRatio: 1,
    resize: false,
    diagnostics: { overlay: false, assetPanel: false, performancePanel: false },
    scene: buildAuraScene(0)
  });
  return async (step: number) => {
    runtime.auraStage = `mounting-step-${step}`;
    publish();
    if (step !== 0) app.setScene(buildAuraScene(step));
    await app.ready();
    app.step(1 / 60);
    await nextPaint();
    const diagnostics = app.diagnostics();
    if (diagnostics.errors.length > 0) {
      throw new Error(`Aura public renderer failed: ${diagnostics.errors.join(" | ")}`);
    }
    runtime.aura = {
      publicPackageOnly: true,
      publicApi: "createAuraApp + defineAuraAssets + model",
      backend: app.backend,
      drawCalls: diagnostics.drawCalls,
      assetState: diagnostics.assets.find((asset) => asset.id === ASSET.id),
      backgroundPixel: readBackgroundPixel(canvas),
      pixelHash: hashString(canvas.toDataURL("image/png")),
      pathStep: step
    };
    runtime.auraStage = `rendered-step-${step}`;
    publish();
  };
}

function Architecture({ step }: { step: number }) {
  runtime.threeStage = "loading-gltf";
  publish();
  const gltf = useGLTF(ASSET.url);
  runtime.threeStage = "gltf-loaded";
  publish();
  const model = useMemo(() => {
    const clone = gltf.scene.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const scale = TARGET_MAX_DIMENSION / Math.max(size.x, size.y, size.z);
    clone.scale.setScalar(scale);
    // Match Aura's documented fit transform: center X/Z and place the imported
    // asset floor at Y=0. Centering Y here would make the same camera target
    // describe a different shot in the two engines.
    clone.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
    return clone;
  }, [gltf.scene]);
  return <><CameraPath object={model} step={step}/><primitive object={model}/></>;
}

function CameraPath({ object, step }: { object: THREE.Object3D; step: number }) {
  const { camera, gl, invalidate } = useThree();
  useEffect(() => {
    const shot = CAMERA_PATH[step]!;
    camera.position.set(...shot.position);
    camera.lookAt(...CAMERA_TARGET);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = shot.fov;
      camera.near = 0.1;
      camera.far = 100;
      camera.updateProjectionMatrix();
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
        drawCalls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        backgroundPixel: [pixels[0]!, pixels[1]!, pixels[2]!, pixels[3]!],
        pixelHash: hash(pixels),
        pathStep: step,
        nodeCount: countNodes(object)
      };
      runtime.threeStage = `rendered-step-${step}`;
      publish();
    }));
  }, [camera, gl, invalidate, object, step]);
  return null;
}

function App() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const button = document.getElementById("advance-path");
    const advance = () => {
      setStep(1);
      runtime.interaction = { applied: true, from: 0, to: 1 };
      void auraRender?.(1).catch(reportError);
    };
    button?.addEventListener("click", advance);
    return () => button?.removeEventListener("click", advance);
  }, []);
  return <Canvas id="three" frameloop="demand" dpr={1} gl={{ antialias: true, preserveDrawingBuffer: true }} camera={{ fov: 45, near: 0.1, far: 100 }} style={{ width: 1440, height: 900 }}>
    <color attach="background" args={["#080d19"]}/>
    <ambientLight intensity={0.35}/>
    <directionalLight position={[8, 14, 10]} intensity={2.6} color="#fff4e6"/>
    <Suspense fallback={null}><Architecture step={step}/></Suspense>
    <OrbitControls makeDefault enableDamping={false}/>
  </Canvas>;
}

let auraRender: ((step: number) => Promise<void>) | undefined;
createRoot(document.getElementById("root")!).render(<App/>);
startAura()
  .then(async (render) => {
    auraRender = render;
    await render(0);
  })
  .catch(reportError);

function reportError(error: unknown): void {
  window.__AURA_THREE_HEAD_TO_HEAD_ARCHITECTURE_ERROR__ = error instanceof Error
    ? error.stack ?? error.message
    : String(error);
}
function nextPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}
function hash(pixels: Uint8Array): string {
  let value = 2166136261;
  for (let index = 0; index < pixels.length; index += 97) {
    value ^= pixels[index]!;
    value = Math.imul(value, 16777619);
  }
  return (value >>> 0).toString(16).padStart(8, "0");
}
function hashString(value: string): string {
  let hashValue = 2166136261;
  for (let index = 0; index < value.length; index += 17) {
    hashValue ^= value.charCodeAt(index);
    hashValue = Math.imul(hashValue, 16777619);
  }
  return (hashValue >>> 0).toString(16).padStart(8, "0");
}
function countNodes(root: THREE.Object3D): number {
  let count = 0;
  root.traverse(() => count++);
  return count;
}
function readBackgroundPixel(canvas: HTMLCanvasElement): readonly [number, number, number, number] {
  const gl = canvas.getContext("webgl2");
  if (!gl) throw new Error("Aura background proof requires the mounted WebGL2 context.");
  const pixel = new Uint8Array(4);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  return [pixel[0]!, pixel[1]!, pixel[2]!, pixel[3]!];
}
