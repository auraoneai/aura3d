import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  DragControls,
  FirstPersonControls,
  FlyControls,
  MapControls,
  MeshCompat,
  OrbitControls,
  Picking,
  PointerLockControls,
  SceneCompat,
  SelectionManager,
  TrackballControls,
  TransformControls,
  Vector3Compat
} from "../../packages/three-compat/src";

interface V5ControlsCheck {
  readonly name: string;
  readonly pass: boolean;
  readonly detail: string;
}

const requiredFiles = [
  "packages/controls/src/OrbitControls.ts",
  "packages/controls/src/TrackballControls.ts",
  "packages/controls/src/FlyControls.ts",
  "packages/controls/src/FirstPersonControls.ts",
  "packages/controls/src/MapControls.ts",
  "packages/controls/src/PointerLockControls.ts",
  "packages/controls/src/DragControls.ts",
  "packages/controls/src/TransformControls.ts",
  "packages/controls/src/SelectionManager.ts",
  "packages/controls/src/Picking.ts",
  "packages/three-compat/src/controls/index.ts",
  "tests/unit/controls/v5-controls.test.ts",
  "tests/browser/v5-controls.spec.ts",
  "docs/project/v5-roadmap-controls-guide.md"
] as const;

function check(name: string, pass: boolean, detail: string): V5ControlsCheck {
  return { name, pass, detail };
}

const scene = new SceneCompat();
const mesh = new MeshCompat();
mesh.position.set(0, 0, -3);
scene.add(mesh);
const orbit = new OrbitControls();
orbit.rotate(0.1, 0.2);
orbit.pan(1, 1);
orbit.dolly(0.75);
const trackball = new TrackballControls();
trackball.roll(0.5);
const fly = new FlyControls();
fly.moveForward(1);
const firstPerson = new FirstPersonControls();
firstPerson.look(0.1, 0.1);
const map = new MapControls();
map.truck(1, 1);
const pointerLock = new PointerLockControls();
pointerLock.lock();
const drag = new DragControls();
drag.start(mesh);
drag.drag(new Vector3Compat(1, 0, 0));
drag.end();
const transform = new TransformControls();
transform.attach(mesh);
transform.setMode("scale");
transform.apply(new Vector3Compat(1, 1, 1));
const hit = new Picking().pick(scene);
const selection = new SelectionManager();
if (hit) selection.select(hit.object);

const checks: V5ControlsCheck[] = [
  check("required-files-present", requiredFiles.every((file) => existsSync(resolve(file))), requiredFiles.filter((file) => !existsSync(resolve(file))).join(", ") || "all V5 controls files exist"),
  check("orbit-pan-zoom", orbit.state.rotation.x > 0 && orbit.state.target.x === 1 && orbit.state.position.z < 5, JSON.stringify(orbit.state)),
  check("trackball-fly-first-person-map", trackball.state.rotation.z > 0 && fly.state.position.z < 5 && firstPerson.state.rotation.x > 0 && map.state.target.z === 1, "trackball, fly, first-person, map controls passed"),
  check("pointer-lock", pointerLock.locked, "pointer lock state is active"),
  check("drag-transform", mesh.position.x === 1 && mesh.scale.x === 2, JSON.stringify({ position: mesh.position, scale: mesh.scale })),
  check("picking-selection", hit?.object === mesh && selection.selected.has(mesh), `${selection.selected.size} selected`),
  check("docs", existsSync(resolve("docs/project/v5-roadmap-controls-guide.md")), "controls guide exists")
];

const pass = checks.every((item) => item.pass);
const report = {
  schema: "g3d-v5-controls-readiness/v1",
  generatedAt: new Date().toISOString(),
  pass,
  modes: ["orbit", "pan", "zoom", "trackball", "fly", "first-person", "map", "pointer-lock", "drag", "translate", "rotate", "scale", "picking", "selection"],
  checks
};

const reportPath = resolve("tests/reports/v5-controls-readiness.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (!pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log("V5 controls readiness passed: controls, picking, transform, selection, and docs are wired.");
