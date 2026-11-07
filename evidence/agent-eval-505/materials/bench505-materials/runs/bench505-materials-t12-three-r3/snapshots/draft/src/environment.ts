import * as THREE from 'three';

function emissive(r: number, g: number, b: number, k: number): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  m.color.setRGB(r * k, g * k, b * k, THREE.LinearSRGBColorSpace);
  return m;
}

/** A framed window of bright panes, placed on a sphere around the origin and facing it. */
function addWindow(
  scene: THREE.Scene,
  pos: THREE.Vector3,
  w: number,
  h: number,
  cols: number,
  rows: number,
  mat: THREE.Material,
): void {
  const g = new THREE.Group();
  g.position.copy(pos);
  g.lookAt(0, pos.y * 0.3, 0);
  const gap = 0.25;
  const pw = (w - gap * (cols + 1)) / cols;
  const ph = (h - gap * (rows + 1)) / rows;
  const geo = new THREE.PlaneGeometry(pw, ph);
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const p = new THREE.Mesh(geo, mat);
      p.position.set(
        -w / 2 + gap + pw / 2 + i * (pw + gap),
        -h / 2 + gap + ph / 2 + j * (ph + gap),
        0,
      );
      g.add(p);
    }
  }
  scene.add(g);
}

/** Dark warm room with a few bright windows and lamps, baked into a PMREM environment. */
export function makeEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const scene = new THREE.Scene();

  const room = new THREE.Mesh(
    new THREE.BoxGeometry(44, 26, 44),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.035, 0.024, 0.016), side: THREE.BackSide }),
  );
  room.position.y = 8;
  scene.add(room);

  // floor slightly warmer so gold bottoms are not black
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(44, 44),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.034, 0.022) }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -4.9;
  scene.add(floor);

  const cool = emissive(0.85, 0.93, 1.0, 7);
  const warm = emissive(1.0, 0.68, 0.32, 10);
  const white = emissive(1.0, 0.92, 0.8, 5);

  // tall windows on the left wall
  addWindow(scene, new THREE.Vector3(-20, 7, -9), 4.5, 10, 2, 3, cool);
  addWindow(scene, new THREE.Vector3(-20, 7, 3), 4.5, 10, 2, 3, cool);
  addWindow(scene, new THREE.Vector3(-14, 7, 15), 4.5, 10, 2, 3, cool);

  // warm lamps on the right
  addWindow(scene, new THREE.Vector3(20, 5, -4), 2, 2, 1, 1, warm);
  addWindow(scene, new THREE.Vector3(20, 5, 8), 2, 2, 1, 1, warm);
  addWindow(scene, new THREE.Vector3(12, 8, -18), 2.5, 2.5, 1, 1, warm);

  // overhead softbox in front of the subject
  addWindow(scene, new THREE.Vector3(0, 19, 7), 10, 5, 3, 2, white);

  // dim warm strip on the back wall
  addWindow(scene, new THREE.Vector3(-4, 4, -21), 12, 1.5, 1, 1, emissive(1.0, 0.75, 0.45, 1.2));

  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(scene, 0.025);
  pmrem.dispose();
  return target.texture;
}
