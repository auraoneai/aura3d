// B1 recipe 2: a city block. Exercises a baked procedural DataTexture (window grid), InstancedMesh street lamps,
// stable explicit ids (userData.auraId), and one simple ShaderMaterial sign the bridge carries as material.custom.
import * as THREE from "three";

export const params = { blocksX: 4, blocksZ: 3, lot: 3.2, street: 1.6 };

/** Static procedural pattern: lit/unlit windows on a facade, baked to RGBA pixels. */
function windowTexture(random, tint) {
  const w = 32, h = 64, data = new Uint8Array(w * h * 4);
  const base = new THREE.Color(tint);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const inWindow = x % 8 > 1 && x % 8 < 7 && y % 8 > 2 && y % 8 < 7;
      const cell = Math.floor(x / 8) * 31 + Math.floor(y / 8) * 17;
      const lit = inWindow && (Math.sin(cell * 12.9898) * 43758.5453 % 1 + 1) % 1 > 0.55;
      const c = inWindow ? (lit ? [255, 214, 140] : [52, 66, 84]) : [base.r * 255, base.g * 255, base.b * 255];
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  void random;
  return texture;
}

export default function createScene({ random, params: p }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#b9c7d6");
  const pitch = p.lot + p.street;
  const width = p.blocksX * pitch + p.street, depth = p.blocksZ * pitch + p.street;

  const asphalt = new THREE.Mesh(new THREE.BoxGeometry(width, 0.1, depth), new THREE.MeshStandardMaterial({ name: "asphalt", color: "#3a3d42", roughness: 0.95 }));
  asphalt.name = "street";
  asphalt.position.y = -0.05;
  asphalt.receiveShadow = true;
  scene.add(asphalt);

  const palette = ["#c9b79c", "#9fb3c8", "#d8d2c4", "#a4887a", "#b7c4a0"];
  const facades = palette.map((tint) => windowTexture(random, tint));
  const pavement = new THREE.MeshStandardMaterial({ name: "pavement", color: "#9a9a96", roughness: 0.9 });
  const roof = new THREE.MeshStandardMaterial({ name: "roof", color: "#55585e", roughness: 0.8 });
  const blocks = new THREE.Group();
  blocks.name = "blocks";
  scene.add(blocks);
  for (let bx = 0; bx < p.blocksX; bx += 1) {
    for (let bz = 0; bz < p.blocksZ; bz += 1) {
      const lot = new THREE.Group();
      lot.userData.auraId = `lot_${bx}_${bz}`; // explicit, generator-owned stable id
      const cx = -width / 2 + p.street + p.lot / 2 + bx * pitch, cz = -depth / 2 + p.street + p.lot / 2 + bz * pitch;
      lot.position.set(cx, 0, cz);
      const curb = new THREE.Mesh(new THREE.BoxGeometry(p.lot, 0.15, p.lot), pavement);
      curb.position.y = 0.075;
      curb.receiveShadow = true;
      lot.add(curb);
      const height = 1.5 + random() * 5.5;
      const k = Math.floor(random() * palette.length);
      const facade = facades[k].clone();
      facade.repeat.set(1, Math.max(1, Math.round(height / 1.6)));
      const tower = new THREE.Mesh(new THREE.BoxGeometry(p.lot * 0.8, height, p.lot * 0.8), [
        new THREE.MeshStandardMaterial({ name: `facade_${bx}_${bz}`, map: facades[k], color: "#ffffff", roughness: 0.7 }),
        new THREE.MeshStandardMaterial({ name: `facade_${bx}_${bz}`, map: facades[k], color: "#ffffff", roughness: 0.7 }),
        roof, roof,
        new THREE.MeshStandardMaterial({ name: `facade_${bx}_${bz}`, map: facades[k], color: "#ffffff", roughness: 0.7 }),
        new THREE.MeshStandardMaterial({ name: `facade_${bx}_${bz}`, map: facades[k], color: "#ffffff", roughness: 0.7 })
      ]);
      tower.name = "tower";
      tower.position.y = 0.15 + height / 2;
      tower.castShadow = true;
      tower.receiveShadow = true;
      lot.add(tower);
      blocks.add(lot);
    }
  }

  // Street lamps: one InstancedMesh (EXT_mesh_gpu_instancing in the GLB).
  const lampCount = (p.blocksX + 1) * 2;
  const lamps = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.07, 1.6, 8), new THREE.MeshStandardMaterial({ name: "lamp_post", color: "#2b2f36", metalness: 0.6, roughness: 0.4 }), lampCount);
  lamps.name = "lamps";
  const m = new THREE.Matrix4();
  for (let i = 0; i < lampCount; i += 1) {
    const x = -width / 2 + p.street / 2 + Math.floor(i / 2) * pitch, z = (i % 2 === 0 ? -1 : 1) * (depth / 2 - p.street / 2);
    lamps.setMatrixAt(i, m.makeTranslation(x, 0.8, z));
  }
  lamps.castShadow = true;
  scene.add(lamps);

  // A billboard with a custom shader: not exportable, reported as unsupported.
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.8), new THREE.ShaderMaterial({
    name: "neon_sign",
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: "varying vec2 vUv; void main(){ gl_FragColor = vec4(mix(vec3(1.0,0.2,0.6), vec3(0.2,0.8,1.0), vUv.x), 1.0); }"
  }));
  sign.name = "sign";
  sign.position.set(0, 4.2, depth / 2 + 0.2);
  scene.add(sign);

  scene.add(new THREE.AmbientLight("#ffffff", 0.6));
  const sun = new THREE.DirectionalLight("#ffffff", 2.4);
  sun.name = "sun";
  sun.position.set(-8, 14, 10);
  sun.castShadow = true;
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 300);
  camera.position.set(14, 12, 18);
  return { scene, camera, cameraTarget: [0, 1.5, 0], renderer: { toneMapping: "aces", exposure: 1 } };
}
