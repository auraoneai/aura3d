import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  AmbientLightCompat,
  AxesHelperCompat,
  DirectionalLightCompat,
  GridHelperCompat,
  GroupCompat,
  MeshCompat,
  OrthographicCameraCompat,
  PerspectiveCameraCompat,
  PointLightCompat,
  RaycasterCompat,
  RectAreaLightCompat,
  SceneCompat,
  SpotLightCompat,
  Vector3Compat
} from "../../packages/three-compat/src";

interface ThreeCompatCoreCompatCheck {
  readonly name: string;
  readonly pass: boolean;
  readonly detail: string;
}

const requiredFiles = [
  "packages/three-compat/src/core/Object3DCompat.ts",
  "packages/three-compat/src/core/SceneCompat.ts",
  "packages/three-compat/src/core/RaycasterCompat.ts",
  "packages/three-compat/src/math/index.ts",
  "packages/three-compat/src/cameras/index.ts",
  "packages/three-compat/src/lights/index.ts",
  "packages/three-compat/src/helpers/index.ts",
  "tests/unit/three-compat/three-compat-core-compat.test.ts",
  "tests/browser/three-compat-core-compat.spec.ts"
] as const;

function check(name: string, pass: boolean, detail: string): ThreeCompatCoreCompatCheck {
  return { name, pass, detail };
}

const scene = new SceneCompat();
const group = new GroupCompat();
const mesh = new MeshCompat({ type: "BoxGeometry" }, { type: "MeshStandardMaterial" });
mesh.position.set(0, 0, -4);
group.add(mesh);
scene.add(
  new PerspectiveCameraCompat(),
  new OrthographicCameraCompat(),
  new AmbientLightCompat(),
  new DirectionalLightCompat(),
  new PointLightCompat(),
  new SpotLightCompat(),
  new RectAreaLightCompat(),
  new AxesHelperCompat(),
  new GridHelperCompat(),
  group
);
const visited: string[] = [];
scene.traverse((object) => visited.push(object.type));
const raycaster = new RaycasterCompat();
raycaster.set(new Vector3Compat(0, 0, 0), new Vector3Compat(0, 0, -1));
const intersections = raycaster.intersectObject(scene, true);
const checks: ThreeCompatCoreCompatCheck[] = [
  check(
    "required-files-present",
    requiredFiles.every((file) => existsSync(resolve(file))),
    requiredFiles.filter((file) => !existsSync(resolve(file))).join(", ") || "all Three.js core compat files exist"
  ),
  check(
    "scene-graph",
    visited.includes("Scene") && visited.includes("Group") && visited.includes("Mesh"),
    visited.join(", ")
  ),
  check(
    "camera-compat",
    visited.includes("PerspectiveCamera") && visited.includes("OrthographicCamera"),
    visited.join(", ")
  ),
  check(
    "light-compat",
    ["AmbientLight", "DirectionalLight", "PointLight", "SpotLight", "RectAreaLight"].every((type) => visited.includes(type)),
    visited.join(", ")
  ),
  check(
    "helper-compat",
    visited.includes("AxesHelper") && visited.includes("GridHelper"),
    visited.join(", ")
  ),
  check(
    "math-and-raycaster",
    intersections.length === 1 && intersections[0]?.object === mesh && new Vector3Compat(3, 4, 0).length() === 5,
    `${intersections.length} intersections`
  )
];

const pass = checks.every((item) => item.pass);
const report = {
  schema: "a3d-three-compat-core-compat-readiness",
  generatedAt: new Date().toISOString(),
  pass,
  visitedTypes: visited,
  intersectionCount: intersections.length,
  checks
};

const reportPath = resolve("tests/reports/three-compat-core-compat-readiness.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (!pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(`Three.js compatibility core compat readiness passed: ${visited.length} traversed objects, ${intersections.length} intersections.`);
