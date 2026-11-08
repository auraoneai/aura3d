// B1 recipe 1: a low-poly tree grove. Plain three.js; runs headless (aura3d import-three) and in the browser (three.html).
import * as THREE from "three";

export const params = { trees: 14, rocks: 9, radius: 7 };

const TRUNK = new THREE.MeshStandardMaterial({ name: "bark", color: "#7a4e2d", roughness: 0.9, flatShading: true });
const LEAVES = ["#3f8f3a", "#5aa837", "#2f7a45"].map((color, i) => new THREE.MeshStandardMaterial({ name: `leaves_${i}`, color, roughness: 0.8, flatShading: true }));
const ROCK = new THREE.MeshStandardMaterial({ name: "rock", color: "#8d8f94", roughness: 0.95, flatShading: true });
const GROUND = new THREE.MeshStandardMaterial({ name: "meadow", color: "#86b45a", roughness: 1, flatShading: true });

function tree(random, index) {
  const group = new THREE.Group();
  group.name = `tree_${index}`;
  const height = 1.2 + random() * 1.4;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, height, 6), TRUNK);
  trunk.name = "trunk";
  trunk.position.y = height / 2;
  trunk.castShadow = true;
  group.add(trunk);
  const layers = 2 + Math.floor(random() * 2);
  const leaves = LEAVES[Math.floor(random() * LEAVES.length)];
  for (let i = 0; i < layers; i += 1) {
    const r = 0.95 - i * 0.22;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, 1.1, 7), leaves);
    cone.name = `crown_${i}`;
    cone.position.y = height + i * 0.55;
    cone.rotation.y = random() * Math.PI;
    cone.castShadow = true;
    group.add(cone);
  }
  return group;
}

export default function createScene({ random, params: p }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#a9d4f0");
  const ground = new THREE.Mesh(new THREE.CylinderGeometry(p.radius + 1.5, p.radius + 1.8, 0.4, 24), GROUND);
  ground.name = "ground";
  ground.position.y = -0.2;
  ground.receiveShadow = true;
  scene.add(ground);

  const grove = new THREE.Group();
  grove.name = "grove";
  scene.add(grove);
  for (let i = 0; i < p.trees; i += 1) {
    const t = tree(random, i);
    const a = random() * Math.PI * 2, d = 1 + Math.sqrt(random()) * (p.radius - 1);
    t.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
    const s = 0.75 + random() * 0.5;
    t.scale.setScalar(s);
    grove.add(t);
  }
  for (let i = 0; i < p.rocks; i += 1) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.25 + random() * 0.35, 0), ROCK);
    rock.name = `rock_${i}`;
    const a = random() * Math.PI * 2, d = random() * p.radius;
    rock.position.set(Math.cos(a) * d, 0.1, Math.sin(a) * d);
    rock.rotation.set(random() * 3, random() * 3, random() * 3);
    rock.castShadow = true;
    rock.receiveShadow = true;
    grove.add(rock);
  }
  // A spare tree the generator keeps hidden (exported anyway; hidden again in Aura3D).
  const spare = tree(random, 99);
  spare.name = "spare_tree";
  spare.visible = false;
  scene.add(spare);

  scene.add(new THREE.HemisphereLight("#cfe8ff", "#5b4a33", 1.2));
  const sun = new THREE.DirectionalLight("#fff1d6", 2.6);
  sun.name = "sun";
  sun.position.set(6, 10, 4);
  sun.castShadow = true;
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 200);
  camera.position.set(11, 7.5, 13);
  return { scene, camera, cameraTarget: [0, 1, 0], renderer: { toneMapping: "aces", exposure: 1 } };
}
