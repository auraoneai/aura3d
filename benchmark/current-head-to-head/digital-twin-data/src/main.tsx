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
  material,
  model,
  primitives,
  scene
} from "@aura3d/engine";

const ASSET = {
  id: "showcaseRoboticWeldingWorkcell",
  url: "/aura-assets/showcaseRoboticWeldingWorkcell.cb604e0c.glb",
  sha256: "cb604e0cce4f624672f88fc81d9f35374e43847e37b436e2048699416b1f6387",
  bounds: [6.6, 2.699, 4.5]
} as const;
const VIEWPORT = { width: 1440, height: 900, dpr: 1 } as const;
const TARGET_MAX_DIMENSION = 1.6;
const CAMERA = { position: [2.2, 1.4, 2.8] as const, target: [0, 0.45, 0] as const, fov: 45 };
const ZONE = { position: [0.34, 0.045, 0.18] as const, scale: [0.38, 0.018, 0.3] as const };
const BEACON = { position: [-0.55, 0.61, 0.35] as const, scale: 0.035 };
const NORMAL = { mode: "normal", temperature: 31.5, incidents: 0, load: 64 } as const;
const INCIDENT = { mode: "incident", temperature: 37, incidents: 1, load: 72 } as const;

const assets = defineAuraAssets({
  showcaseRoboticWeldingWorkcell: {
    type: "model",
    format: "glb",
    url: ASSET.url,
    hash: `sha256-${ASSET.sha256}`,
    bounds: ASSET.bounds,
    sizeBytes: 21_324_208,
    metadata: { license: "CC-BY-4.0" }
  }
});

declare global {
  interface Window {
    __AURA_THREE_HEAD_TO_HEAD_DIGITAL_TWIN__?: any;
    __AURA_THREE_HEAD_TO_HEAD_DIGITAL_TWIN_ERROR__?: string;
  }
}

const runtime: Record<string, any> = {
  ready: false,
  workload: "digital-twin-data",
  asset: ASSET,
  viewport: VIEWPORT,
  conditions: {
    targetMaxDimension: TARGET_MAX_DIMENSION,
    camera: CAMERA,
    zone: ZONE,
    beacon: BEACON,
    background: "#061012",
    lighting: { ambientIntensity: 0.48, directionalPosition: [2.1, 3.2, 2.4], directionalIntensity: 1.28 }
  },
  aura: null,
  three: null,
  auraStage: "starting",
  threeStage: "starting",
  interaction: { applied: false }
};
const publish = () => {
  runtime.ready = Boolean(runtime.aura && runtime.three);
  window.__AURA_THREE_HEAD_TO_HEAD_DIGITAL_TWIN__ = structuredClone(runtime);
};
publish();

function telemetry(incident: boolean) {
  return incident ? INCIDENT : NORMAL;
}

function buildAuraScene(incident: boolean) {
  const data = telemetry(incident);
  const builder = scene()
    .background("#061012")
    .add(model(assets.showcaseRoboticWeldingWorkcell, {
      name: "typed robotic welding workcell",
      scaleMode: "fit",
      targetMaxDimension: TARGET_MAX_DIMENSION
    }))
    .add(primitives.box({
      name: "data-linked assembly zone",
      material: material.neon({
        color: incident ? "#f2715c" : "#7ee8c4",
        emissive: incident ? "#f2715c" : "#7ee8c4",
        emissiveIntensity: incident ? 1 : 0.42,
        opacity: 0.55
      })
    }).position(...ZONE.position).scale([...ZONE.scale]))
    .add(lights.ambient({ intensity: 0.48, color: "#dff6f0" }))
    .add(lights.directional({ position: [2.1, 3.2, 2.4], intensity: 1.28, color: "#fff4df" }))
    .camera(camera.perspective({ position: CAMERA.position, target: CAMERA.target, fov: CAMERA.fov }));
  if (incident) {
    builder.add(primitives.sphere({
      name: "data-linked incident beacon",
      material: material.neon({ color: "#f2715c", emissive: "#f2715c", emissiveIntensity: 1.2 })
    }).position(...BEACON.position).scale(BEACON.scale));
  }
  return { builder, data };
}

async function startAura(): Promise<(incident: boolean) => Promise<void>> {
  const canvas = document.getElementById("aura");
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Aura canvas missing");
  const initial = buildAuraScene(false);
  runtime.auraStage = "creating-public-app";
  publish();
  const app = createAuraApp(canvas, {
    autoStart: false,
    pixelRatio: 1,
    resize: false,
    diagnostics: { overlay: false, assetPanel: false, performancePanel: false },
    scene: initial.builder
  });
  return async (incident: boolean) => {
    runtime.auraStage = incident ? "mounting-incident" : "mounting-normal";
    publish();
    if (incident) app.setScene(buildAuraScene(true).builder);
    await app.ready();
    app.step(1 / 60);
    await nextPaint();
    const diagnostics = app.diagnostics();
    if (diagnostics.errors.length > 0) throw new Error(`Aura public renderer failed: ${diagnostics.errors.join(" | ")}`);
    runtime.aura = {
      publicPackageOnly: true,
      publicApi: "createAuraApp + typed asset + scene data binding",
      backend: app.backend,
      drawCalls: diagnostics.drawCalls,
      assetState: diagnostics.assets.find((asset) => asset.id === ASSET.id),
      telemetry: telemetry(incident),
      visibleDataBinding: incident ? "red-zone-and-beacon" : "green-zone",
      backgroundPixel: readBackgroundPixel(canvas),
      pixelHash: hashString(canvas.toDataURL("image/png"))
    };
    runtime.auraStage = incident ? "rendered-incident" : "rendered-normal";
    publish();
  };
}

function Workcell({ incident }: { incident: boolean }) {
  runtime.threeStage = "loading-gltf";
  publish();
  const gltf = useGLTF(ASSET.url);
  const object = useMemo(() => {
    const clone = gltf.scene.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const scale = TARGET_MAX_DIMENSION / Math.max(size.x, size.y, size.z);
    clone.scale.setScalar(scale);
    clone.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
    return clone;
  }, [gltf.scene]);
  runtime.threeStage = "gltf-loaded";
  publish();
  return <>
    <CameraAndEvidence object={object} incident={incident}/>
    <primitive object={object}/>
    <mesh position={ZONE.position} scale={ZONE.scale}>
      <boxGeometry/>
      <meshStandardMaterial color={incident ? "#f2715c" : "#7ee8c4"} emissive={incident ? "#f2715c" : "#7ee8c4"} emissiveIntensity={incident ? 1 : 0.42} transparent opacity={0.55}/>
    </mesh>
    {incident && <mesh position={BEACON.position} scale={BEACON.scale}>
      <sphereGeometry args={[0.5, 24, 16]}/>
      <meshStandardMaterial color="#f2715c" emissive="#f2715c" emissiveIntensity={1.2}/>
    </mesh>}
  </>;
}

function CameraAndEvidence({ object, incident }: { object: THREE.Object3D; incident: boolean }) {
  const { camera, gl, invalidate } = useThree();
  useEffect(() => {
    camera.position.set(...CAMERA.position);
    camera.lookAt(...CAMERA.target);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = CAMERA.fov;
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
        nodeCount: countNodes(object),
        telemetry: telemetry(incident),
        visibleDataBinding: incident ? "red-zone-and-beacon" : "green-zone",
        backgroundPixel: [pixels[0]!, pixels[1]!, pixels[2]!, pixels[3]!],
        pixelHash: hash(pixels)
      };
      runtime.threeStage = incident ? "rendered-incident" : "rendered-normal";
      publish();
    }));
  }, [camera, gl, incident, invalidate, object]);
  return null;
}

function App() {
  const [incident, setIncident] = useState(false);
  useEffect(() => {
    const button = document.getElementById("inject-alert");
    const output = document.getElementById("telemetry");
    const inject = () => {
      setIncident(true);
      runtime.interaction = { applied: true, action: "inject-alert", from: NORMAL, to: INCIDENT };
      if (output) output.textContent = "incident · 37.0 C · 1 incident";
      void auraRender?.(true).catch(reportError);
    };
    button?.addEventListener("click", inject);
    return () => button?.removeEventListener("click", inject);
  }, []);
  return <Canvas frameloop="demand" dpr={1} gl={{ antialias: true, preserveDrawingBuffer: true }} camera={{ fov: 45, near: 0.1, far: 100 }} style={{ width: 1440, height: 900 }}>
    <color attach="background" args={["#061012"]}/>
    <ambientLight intensity={0.48} color="#dff6f0"/>
    <directionalLight position={[2.1, 3.2, 2.4]} intensity={1.28} color="#fff4df"/>
    <Suspense fallback={null}><Workcell incident={incident}/></Suspense>
    <OrbitControls makeDefault enableDamping={false}/>
  </Canvas>;
}

let auraRender: ((incident: boolean) => Promise<void>) | undefined;
createRoot(document.getElementById("root")!).render(<App/>);
startAura().then(async (render) => { auraRender = render; await render(false); }).catch(reportError);

function reportError(error: unknown): void { window.__AURA_THREE_HEAD_TO_HEAD_DIGITAL_TWIN_ERROR__ = error instanceof Error ? error.stack ?? error.message : String(error); }
function nextPaint(): Promise<void> { return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); }
function hash(pixels: Uint8Array): string { let value = 2166136261; for (let index = 0; index < pixels.length; index += 97) { value ^= pixels[index]!; value = Math.imul(value, 16777619); } return (value >>> 0).toString(16).padStart(8, "0"); }
function hashString(value: string): string { let result = 2166136261; for (let index = 0; index < value.length; index += 17) { result ^= value.charCodeAt(index); result = Math.imul(result, 16777619); } return (result >>> 0).toString(16).padStart(8, "0"); }
function countNodes(root: THREE.Object3D): number { let count = 0; root.traverse(() => count++); return count; }
function readBackgroundPixel(canvas: HTMLCanvasElement): readonly [number, number, number, number] { const gl = canvas.getContext("webgl2"); if (!gl) throw new Error("Aura background proof requires the mounted WebGL2 context."); const pixel = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel); return [pixel[0]!, pixel[1]!, pixel[2]!, pixel[3]!]; }
