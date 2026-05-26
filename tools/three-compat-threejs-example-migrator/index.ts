import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { migrateThreeToA3D } from "../../packages/three-compat/src";

const source = `
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
const renderer = new THREE.WebGLRenderer();
renderer.setSize(800, 600);
new OrbitControls();
new GLTFLoader();
`;
const result = migrateThreeToA3D(source);
const outputPath = resolve("tests/reports/three-compat-migrated-three-example.ts");
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, result.code);
console.log(JSON.stringify({ outputPath, rewrittenImports: result.rewrittenImports, warnings: result.warnings }, null, 2));
