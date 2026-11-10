// Static stage for the tower game: a plinth under the base slab and tall pillars that give the rising camera parallax.
export const params = { plinth: "#2b3040", pillar: "#3a4560", band: "#e8b04a", pillars: 7, radius: 11, height: 70 };

export default function createScene({ THREE, params: p }) {
  const scene = new THREE.Scene();

  const plinthMat = new THREE.MeshStandardMaterial({ color: p.plinth, roughness: 0.8, metalness: 0.1 });
  plinthMat.name = "plinth";
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.6, 1.2, 48), plinthMat);
  plinth.name = "plinth";
  plinth.position.set(0, -0.6, 0);
  scene.add(plinth);

  const pillarMat = new THREE.MeshStandardMaterial({ color: p.pillar, roughness: 0.7, metalness: 0.2 });
  pillarMat.name = "pillar";
  const bandMat = new THREE.MeshStandardMaterial({ color: p.band, roughness: 0.4, metalness: 0.5 });
  bandMat.name = "band";

  for (let i = 0; i < p.pillars; i += 1) {
    // back arc only, so the camera (front, +z) never sits inside a pillar
    const a = 0.15 * Math.PI + (i / (p.pillars - 1)) * 0.7 * Math.PI;
    const r = p.radius + (i % 2) * 4;
    const group = new THREE.Group();
    group.name = `pillar-${i}`;
    group.position.set(Math.cos(a) * r * 1.3, 0, -Math.sin(a) * r - 3);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, p.height, 16), pillarMat);
    shaft.name = `shaft-${i}`;
    shaft.position.y = p.height / 2 - 1.2;
    group.add(shaft);
    for (let b = 0; b < 12; b += 1) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.25, 16), bandMat);
      band.name = `band-${i}-${b}`;
      band.position.y = 2 + b * 5.5 + (i % 3);
      group.add(band);
    }
    scene.add(group);
  }

  return { scene };
}
