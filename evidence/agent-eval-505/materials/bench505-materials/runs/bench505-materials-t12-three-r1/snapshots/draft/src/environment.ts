import * as THREE from 'three';

function emissive(r: number, g: number, b: number): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial();
  m.color.setRGB(r, g, b);
  m.side = THREE.DoubleSide;
  return m;
}

/** A window with a 2-column mullion grid, facing the room centre. */
function addWindow(
  parent: THREE.Object3D,
  pos: THREE.Vector3,
  w: number,
  h: number,
  cols: number,
  rows: number,
  color: [number, number, number],
): void {
  const g = new THREE.Group();
  const gap = 0.12;
  const pw = (w - gap * (cols - 1)) / cols;
  const ph = (h - gap * (rows - 1)) / rows;
  const mat = emissive(...color);
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), mat);
      m.position.set(-w / 2 + pw / 2 + i * (pw + gap), -h / 2 + ph / 2 + j * (ph + gap), 0);
      g.add(m);
    }
  }
  g.position.copy(pos);
  g.lookAt(0, pos.y, 0);
  parent.add(g);
}

function addLamp(parent: THREE.Object3D, pos: THREE.Vector3, r: number, color: [number, number, number]): void {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), emissive(...color));
  m.position.copy(pos);
  parent.add(m);
}

/** Procedural dark gallery with a few bright windows and lamps, prefiltered for PBR reflections. */
export function createEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const s = new THREE.Scene();

  const room = new THREE.Mesh(
    new THREE.BoxGeometry(24, 14, 24),
    new THREE.MeshBasicMaterial({ color: 0x1a1009, side: THREE.BackSide }),
  );
  room.position.y = 6;
  s.add(room);

  // dim warm floor glow / darker floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 24),
    new THREE.MeshBasicMaterial({ color: 0x0b0705, side: THREE.DoubleSide }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.99;
  s.add(floor);

  // back wall windows (warm daylight)
  addWindow(s, new THREE.Vector3(-4.5, 4, -11.8), 2.6, 6, 2, 3, [7, 5.6, 3.8]);
  addWindow(s, new THREE.Vector3(4.5, 4, -11.8), 2.6, 6, 2, 3, [7, 5.6, 3.8]);
  // left wall: cool window
  addWindow(s, new THREE.Vector3(-11.8, 4, 1), 3.4, 5.5, 2, 3, [2.6, 3.6, 6.5]);
  // right wall: tall warm window
  addWindow(s, new THREE.Vector3(11.8, 3.5, -3), 2.2, 6, 1, 3, [8, 5.5, 3]);
  // front wall (behind camera): wide window and lamp
  addWindow(s, new THREE.Vector3(3, 4, 11.8), 4, 4.5, 3, 2, [6, 4.6, 3]);
  addWindow(s, new THREE.Vector3(-6, 3, 11.8), 1.6, 5, 1, 2, [3, 3.5, 5]);

  // ceiling strip lights
  for (const x of [-3, 3]) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 14), emissive(9, 6.2, 3.4));
    strip.rotation.x = Math.PI / 2;
    strip.position.set(x, 12.9, 0);
    s.add(strip);
  }

  // lamps
  addLamp(s, new THREE.Vector3(-8, 2.5, 7), 0.5, [18, 11, 4.5]);
  addLamp(s, new THREE.Vector3(8.5, 3, 6), 0.45, [16, 10, 4]);
  addLamp(s, new THREE.Vector3(-7, 5, -6), 0.35, [14, 9, 4]);
  addLamp(s, new THREE.Vector3(7, 1.8, -8), 0.4, [12, 8, 3.5]);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(s, 0.015);
  pmrem.dispose();
  return rt.texture;
}
