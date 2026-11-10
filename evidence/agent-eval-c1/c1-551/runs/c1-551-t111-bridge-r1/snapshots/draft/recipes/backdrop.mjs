// Starfield backdrop: three merged meshes of tiny octahedra on a large sphere.
export const params = { stars: 900, radius: 260 };

export default function createScene({ THREE, random, params: p }) {
  const scene = new THREE.Scene();

  const tints = [
    { name: "stars_white", color: "#ffffff", share: 0.6 },
    { name: "stars_blue", color: "#a9c4ff", share: 0.25 },
    { name: "stars_warm", color: "#ffd9a0", share: 0.15 }
  ];
  // octahedron corners and faces
  const corners = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const faces = [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]];

  for (const tint of tints) {
    const count = Math.round(p.stars * tint.share);
    const positions = new Float32Array(count * faces.length * 9);
    let o = 0;
    for (let s = 0; s < count; s += 1) {
      // uniform direction on the sphere
      const u = random() * 2 - 1;
      const phi = random() * Math.PI * 2;
      const k = Math.sqrt(1 - u * u);
      const r = p.radius * (0.9 + random() * 0.2);
      const cx = Math.cos(phi) * k * r, cy = u * r, cz = Math.sin(phi) * k * r;
      const size = 0.35 + Math.pow(random(), 4) * 0.9;
      for (const f of faces) {
        for (const ci of f) {
          const c = corners[ci];
          positions[o++] = cx + c[0] * size;
          positions[o++] = cy + c[1] * size;
          positions[o++] = cz + c[2] * size;
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({ color: tint.color, side: THREE.DoubleSide });
    mat.name = tint.name + "_mat";
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = tint.name;
    scene.add(mesh);
  }

  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 1000);
  camera.position.set(0, 60, 60);
  return { scene, camera, cameraTarget: [0, 0, 0], renderer: { toneMapping: "none", exposure: 1 } };
}
