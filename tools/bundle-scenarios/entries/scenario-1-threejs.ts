/** Scenario 1 — core primitive scene, Three.js. The equivalent stack a developer would assemble. */
import * as THREE from "three";

const canvas = document.querySelector("canvas") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const sceneGraph = new THREE.Scene();
sceneGraph.background = new THREE.Color("#0b0f16");
const cameraObject = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
cameraObject.position.set(2.4, 1.8, 3.2);
cameraObject.lookAt(0, 0, 0);
sceneGraph.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: "#c8d3e0", roughness: 0.4 })));
sceneGraph.add(new THREE.DirectionalLight(0xffffff, 2.5));
sceneGraph.add(new THREE.AmbientLight(0xffffff, 0.35));
renderer.render(sceneGraph, cameraObject);
(globalThis as { __app?: unknown }).__app = renderer;
