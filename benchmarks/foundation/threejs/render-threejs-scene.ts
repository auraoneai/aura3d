import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { V3ComparisonObject, V3ComparisonScene } from "../shared/scenes";

export interface ThreeComparisonResult {
  readonly engine: "threejs";
  readonly sceneId: string;
  readonly canvas: HTMLCanvasElement;
  readonly setupLines: number;
  readonly drawCalls: number;
  readonly itemCount: number;
  readonly gaps: readonly string[];
}

export async function renderThreeComparisonScene(sceneDescriptor: V3ComparisonScene, options: { readonly origin: string; readonly setupLines: number }): Promise<ThreeComparisonResult> {
  const canvas = createComparisonCanvas(`${sceneDescriptor.id}-threejs`);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(900, 620, false);
  renderer.setClearColor(0x07090a, 1);
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(4, 5, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x8fb8ff, 0.9);
  fill.position.set(-3, 2, 2);
  scene.add(fill);
  let itemCount = sceneDescriptor.objects.length;
  let gaps: readonly string[] = [];

  if (sceneDescriptor.id === "asset" && sceneDescriptor.assetUrl) {
    const gltf = await new GLTFLoader().loadAsync(`${options.origin}${sceneDescriptor.assetUrl}`);
    scene.add(gltf.scene);
    itemCount = countMeshes(gltf.scene);
    centerObject(gltf.scene);
    gaps = ["Three.js needs explicit loader, camera, lighting, object centering, and diagnostics wiring for this comparison."];
  } else {
    for (const object of sceneDescriptor.objects) {
      scene.add(toThreeMesh(object));
    }
    gaps = ["Procedural setup is explicit and flexible, but requires more app code for workflow-level diagnostics."];
  }

  const camera = new THREE.PerspectiveCamera(45, 900 / 620, 0.1, 100);
  camera.position.set(2.7, 1.7, 3.4);
  camera.lookAt(0, 0, 0);
  renderer.render(scene, camera);
  const drawCalls = renderer.info.render.calls;
  return {
    engine: "threejs",
    sceneId: sceneDescriptor.id,
    canvas,
    setupLines: options.setupLines,
    drawCalls,
    itemCount,
    gaps
  };
}

function toThreeMesh(object: V3ComparisonObject): THREE.Mesh {
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(object.color[0], object.color[1], object.color[2]),
    metalness: object.metallic,
    roughness: object.roughness
  });
  const mesh = new THREE.Mesh(toThreeGeometry(object), material);
  mesh.name = object.label;
  mesh.position.set(object.position[0], object.position[1], object.position[2]);
  mesh.scale.set(object.scale[0], object.scale[1], object.scale[2]);
  return mesh;
}

function toThreeGeometry(object: V3ComparisonObject): THREE.BufferGeometry {
  if (object.geometry === "sphere") return new THREE.SphereGeometry(1, 48, 24);
  if (object.geometry === "cylinder") return new THREE.CylinderGeometry(1, 1, 1, 48);
  return new THREE.BoxGeometry(1, 1, 1);
}

function centerObject(object: THREE.Object3D): void {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3()).length();
  object.position.sub(center);
  const scale = size > 0 ? 2.3 / size : 1;
  object.scale.setScalar(scale);
}

function countMeshes(object: THREE.Object3D): number {
  let count = 0;
  object.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) count += 1;
  });
  return count;
}

function createComparisonCanvas(testId: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.dataset.testid = testId;
  canvas.width = 900;
  canvas.height = 620;
  canvas.style.width = "900px";
  canvas.style.height = "620px";
  return canvas;
}
