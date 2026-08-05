/** Scenario 2 — product viewer, Three.js: three + GLTFLoader + OrbitControls + PMREM. */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

const canvas = document.querySelector("canvas") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const sceneGraph = new THREE.Scene();
sceneGraph.background = new THREE.Color("#101720");
const cameraObject = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
cameraObject.position.set(2.0, 1.9, 2.4);
const controls = new OrbitControls(cameraObject, canvas);
controls.target.set(0, 0.6, 0);
const pmrem = new THREE.PMREMGenerator(renderer);
sceneGraph.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
sceneGraph.add(new THREE.DirectionalLight(0xffffff, 2.4));
sceneGraph.add(new THREE.Mesh(
  new THREE.SphereGeometry(0.6, 48, 32),
  new THREE.MeshPhysicalMaterial({ color: "#b3202f", clearcoat: 1, clearcoatRoughness: 0.04, roughness: 0.3 })
));
sceneGraph.add(new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshStandardMaterial({ color: "#2a3038", roughness: 0.8 })));
const loader = new GLTFLoader();
loader.load("/model.glb", (gltf) => sceneGraph.add(gltf.scene));
renderer.render(sceneGraph, cameraObject);
(globalThis as { __app?: unknown }).__app = renderer;
