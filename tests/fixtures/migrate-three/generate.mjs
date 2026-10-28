// Regenerates goldens.json by running cases.mjs against real three.js.
// three is NOT a repo dependency (Aura3D ships no three), so install the pinned
// version into a scratch directory and point THREE_DIR at it:
//
//   mkdir /tmp/three-golden && cd /tmp/three-golden && npm init -y && npm install --save-exact three@0.185.1
//   THREE_DIR=/tmp/three-golden node tests/fixtures/migrate-three/generate.mjs
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { cases } from "./cases.mjs";
import { extraCases } from "./cases.extra.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const threeDir = process.env.THREE_DIR;
if (!threeDir) throw new Error("set THREE_DIR to a directory with three@0.185.1 installed");
const require = createRequire(resolve(threeDir, "package.json"));
const pkg = JSON.parse(readFileSync(resolve(threeDir, "node_modules/three/package.json"), "utf8"));
const THREE = await import(pathToFileURL(require.resolve("three")).href);

const addonUrl = (rel) => pathToFileURL(resolve(threeDir, "node_modules/three/examples/jsm", rel)).href;
const { Octree } = await import(addonUrl("math/Octree.js"));
const { Capsule } = await import(addonUrl("math/Capsule.js"));
const { RoundedBoxGeometry } = await import(addonUrl("geometries/RoundedBoxGeometry.js"));
// The same module object is used for core classes and the addon classes the cases reach through `L`.
const L = { ...THREE, Octree, Capsule };

// Public prototype methods per class, so the test can require full method coverage for `exact` class rows.
const METHOD_CLASSES = ["CatmullRomCurve3", "CubicBezierCurve3", "CubicBezierCurve", "QuadraticBezierCurve3", "QuadraticBezierCurve", "LineCurve3", "LineCurve", "SplineCurve", "EllipseCurve", "ArcCurve", "CurvePath", "Path", "Shape", "Ray", "Spherical", "Cylindrical", "Line3", "Triangle", "SphericalHarmonics3", "Box3", "Sphere", "Plane", "Frustum", "Euler", "Matrix3", "Matrix4", "Quaternion", "Vector2", "Vector3", "Vector4", "Color", "Clock"];
const IGNORED = new Set(["constructor", "fromBufferAttribute", "toArray", "fromArray", "random", "setFromBufferAttribute", "getComponent", "setComponent", "toJSON", "fromJSON", "_onChange", "_onChangeCallback"]);
const methods = {};
for (const name of [...METHOD_CLASSES, "Octree"]) {
  const proto = (name === "Octree" ? Octree : THREE[name]).prototype;
  methods[name] = Object.getOwnPropertyNames(proto).filter((k) => typeof Object.getOwnPropertyDescriptor(proto, k)?.value === "function" && !k.startsWith("is") && !IGNORED.has(k));
}

// Every prototype method and accessor (nothing excluded) of the classes the mutable math layer mirrors, plus their
// static members, so the compat parity test can require a method-level case for each.
const MATH_CLASSES = ["Vector2", "Vector3", "Vector4", "Matrix3", "Matrix4", "Quaternion", "Euler", "Color", "Box3", "Sphere", "Plane", "Ray", "Frustum", "Triangle"];
const mathMembers = {};
for (const name of MATH_CLASSES) {
  const ctor = THREE[name];
  const proto = ctor.prototype;
  const instance = Object.getOwnPropertyNames(proto).filter((k) => k !== "constructor" && !k.startsWith("is"));
  const statics = Object.getOwnPropertyNames(ctor).filter((k) => !["length", "name", "prototype"].includes(k));
  mathMembers[name] = { instance, statics };
}

const goldens = { three: pkg.version, generatedBy: "tests/fixtures/migrate-three/generate.mjs", methods, mathMembers, values: {} };
for (const [name, run] of Object.entries(cases)) {
  goldens.values[name] = run(L);
}
for (const [name, def] of Object.entries(extraCases)) {
  goldens.values[name] = await def.three({ THREE: L, addons: { RoundedBoxGeometry } });
}
writeFileSync(resolve(here, "goldens.json"), `${JSON.stringify(goldens)}\n`);
console.log(`wrote ${Object.keys(goldens.values).length} goldens from three ${pkg.version}`);
