// B1 recipe 4: an animated windmill. Exercises exported AnimationClips on plain node hierarchies (no skin): the rotor
// spins on its hub axis, the weathervane swings and the flag bobs, all as keyframe tracks addressed by node name and
// retargeted to stable ids. Params change colours and proportions without changing the node structure, so ids (and
// native edits keyed by them) survive regeneration.
import * as THREE from "three";

export const params = { sail: "#efe6d2", tower: "#c9b48f", roof: "#8d3b2e", height: 4.2, rpm: 15 };

export default function createScene({ params: p }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#a9c4dc");

  const grass = new THREE.MeshStandardMaterial({ name: "grass", color: "#6f9a4a", roughness: 0.95 });
  const stone = new THREE.MeshStandardMaterial({ name: "tower", color: p.tower, roughness: 0.85 });
  const roof = new THREE.MeshStandardMaterial({ name: "roof", color: p.roof, roughness: 0.7 });
  const wood = new THREE.MeshStandardMaterial({ name: "wood", color: "#6b4a2f", roughness: 0.8 });
  const sail = new THREE.MeshStandardMaterial({ name: "sail", color: p.sail, roughness: 0.75, side: THREE.DoubleSide });
  const metal = new THREE.MeshStandardMaterial({ name: "metal", color: "#3b3f45", metalness: 0.6, roughness: 0.45 });
  const flagCloth = new THREE.MeshStandardMaterial({ name: "flag", color: "#d8443a", roughness: 0.8, side: THREE.DoubleSide });

  const ground = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 0.2, 48), grass);
  ground.name = "ground";
  ground.position.y = -0.1;
  ground.receiveShadow = true;
  scene.add(ground);

  const mill = new THREE.Group();
  mill.name = "windmill";
  scene.add(mill);
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.45, p.height, 8), stone);
  tower.name = "tower";
  tower.position.y = p.height / 2;
  tower.castShadow = true;
  tower.receiveShadow = true;
  mill.add(tower);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(1.3, 1.3, 8), roof);
  cap.name = "cap";
  cap.position.y = p.height + 0.65;
  cap.castShadow = true;
  mill.add(cap);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.0, 0.12), wood);
  door.name = "door";
  door.position.set(0, 0.5, 1.38);
  mill.add(door);

  // Rotor: hub at the front of the cap, four sails on arms. The clip spins `rotor` about its local z axis.
  const rotor = new THREE.Group();
  rotor.name = "rotor";
  rotor.position.set(0, p.height + 0.15, 1.2);
  mill.add(rotor);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.35, 16), metal);
  hub.name = "hub";
  hub.rotation.x = Math.PI / 2;
  hub.castShadow = true;
  rotor.add(hub);
  for (let i = 0; i < 4; i++) {
    const blade = new THREE.Group();
    blade.name = `blade_${i}`;
    blade.rotation.z = (i * Math.PI) / 2;
    rotor.add(blade);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.0, 0.08), wood);
    arm.name = "arm";
    arm.position.y = 1.6;
    arm.castShadow = true;
    blade.add(arm);
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.85, 2.3, 0.03), sail);
    cloth.name = "cloth";
    cloth.position.set(0.5, 1.85, 0.03);
    cloth.castShadow = true;
    blade.add(cloth);
  }

  // Weathervane on the cap tip, and a flag pole beside the mill.
  const vane = new THREE.Group();
  vane.name = "vane";
  vane.position.y = p.height + 1.35;
  mill.add(vane);
  const vaneRod = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.05), metal);
  vaneRod.name = "rod";
  vane.add(vaneRod);
  const vaneTail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.25, 0.02), metal);
  vaneTail.name = "tail";
  vaneTail.position.x = -0.45;
  vane.add(vaneTail);

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 8), metal);
  pole.name = "pole";
  pole.position.set(3.2, 1.6, 1.2);
  pole.castShadow = true;
  scene.add(pole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), flagCloth);
  flag.name = "flag";
  flag.position.set(3.65, 2.8, 1.2);
  flag.castShadow = true;
  scene.add(flag);

  // Native-edit targets: a barrel and a crate the Aura3D scene moves by stable id.
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.8, 16), wood);
  barrel.name = "barrel";
  barrel.position.set(-1.9, 0.4, 1.6);
  barrel.castShadow = true;
  scene.add(barrel);
  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), wood);
  crate.name = "crate";
  crate.position.set(-2.6, 0.35, 0.6);
  crate.rotation.y = 0.4;
  crate.castShadow = true;
  scene.add(crate);

  scene.add(new THREE.HemisphereLight("#dfeaff", "#5d6b3c", 1.1));
  const sun = new THREE.DirectionalLight("#fff4e0", 2.6);
  sun.name = "sun";
  sun.position.set(6, 10, 7);
  sun.castShadow = true;
  scene.add(sun);

  // Clips. Rotor: one turn every 60/rpm seconds, sampled at quarter turns (quaternion slerp follows the short arc).
  const period = 60 / p.rpm;
  const axis = new THREE.Vector3(0, 0, 1);
  const turn = [0, 1, 2, 3, 4].map((k) => new THREE.Quaternion().setFromAxisAngle(axis, (-k * Math.PI) / 2).toArray()).flat();
  const spin = new THREE.AnimationClip("rotor_spin", period, [
    new THREE.QuaternionKeyframeTrack("rotor.quaternion", [0, 0.25, 0.5, 0.75, 1].map((f) => f * period), turn)
  ]);
  const up = new THREE.Vector3(0, 1, 0);
  const swing = [0, 0.5, 0, -0.5, 0].map((a) => new THREE.Quaternion().setFromAxisAngle(up, a).toArray()).flat();
  const breeze = new THREE.AnimationClip("breeze", 4, [
    new THREE.QuaternionKeyframeTrack("vane.quaternion", [0, 1, 2, 3, 4], swing),
    new THREE.VectorKeyframeTrack("flag.position", [0, 1, 2, 3, 4], [3.65, 2.8, 1.2, 3.65, 2.9, 1.2, 3.65, 2.8, 1.2, 3.65, 2.7, 1.2, 3.65, 2.8, 1.2])
  ]);

  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 200);
  camera.position.set(7.5, 4.6, 11);
  return { scene, camera, cameraTarget: [0, 2.4, 0], clips: [spin, breeze], renderer: { toneMapping: "aces", exposure: 1 } };
}
