// Static backdrop for the solar system: a starfield shell and one thin orbit line per planet.
// Planets, the star, camera and behaviour are native Aura3D in src/.
export const params = {
  stars: 450,
  shell: 230,
  orbits: [5, 7.4, 9.8, 12.4, 17, 22, 26.5, 30.5],
  lineWidth: 0.1
};

export default function createScene({ THREE, random, params: p }) {
  const scene = new THREE.Scene();
  scene.name = "cosmos";

  // Starfield: tiny octahedra merged into a single mesh.
  const base = new THREE.OctahedronGeometry(1, 0);
  const basePos = base.getAttribute("position");
  const positions = [];
  const tmp = new THREE.Vector3();
  for (let i = 0; i < p.stars; i += 1) {
    const u = random() * 2 - 1;
    const a = random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const r = p.shell * (0.85 + random() * 0.25);
    const cx = Math.cos(a) * s * r;
    const cy = u * r;
    const cz = Math.sin(a) * s * r;
    const size = 0.22 + random() * random() * 0.7;
    for (let v = 0; v < basePos.count; v += 1) {
      tmp.fromBufferAttribute(basePos, v);
      positions.push(cx + tmp.x * size, cy + tmp.y * size, cz + tmp.z * size);
    }
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const stars = new THREE.Mesh(starGeo, new THREE.MeshBasicMaterial({ color: "#dfe8ff", side: THREE.DoubleSide }));
  stars.name = "stars";
  scene.add(stars);

  // Orbit lines: flat thin rings in the XZ plane.
  p.orbits.forEach((radius, i) => {
    const geo = new THREE.RingGeometry(radius - p.lineWidth / 2, radius + p.lineWidth / 2, 192, 1);
    geo.rotateX(-Math.PI / 2);
    const line = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: "#5d7aa8", side: THREE.DoubleSide }));
    line.name = `orbit${i}`;
    scene.add(line);
  });

  return { scene, camera: new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 1000) };
}
