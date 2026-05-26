import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  CubeTextureLoaderThreeCompat,
  ThreeCompatGLTFLoader,
  HDRLoaderThreeCompat,
  KTX2LoaderThreeCompat,
  MTLLoaderThreeCompat,
  OBJLoaderThreeCompat,
  TextureLoaderThreeCompat
} from "../../packages/assets/src";
import { GLTFLoaderCompat, OBJLoaderCompat, ThreeCompatTextureLoader } from "../../packages/three-compat/src";

interface ThreeCompatLoaderReadinessCheck {
  readonly name: string;
  readonly pass: boolean;
  readonly detail: string;
}

const requiredFiles = [
  "packages/assets/src/loaders/ThreeCompatGLTFLoader.ts",
  "packages/assets/src/loaders/OBJLoader.ts",
  "packages/assets/src/loaders/MTLLoader.ts",
  "packages/assets/src/loaders/HDRLoader.ts",
  "packages/assets/src/loaders/EXRLoader.ts",
  "packages/assets/src/loaders/KTX2Loader.ts",
  "packages/assets/src/loaders/TextureLoader.ts",
  "packages/assets/src/loaders/CubeTextureLoader.ts",
  "packages/assets/src/loaders/LoaderDiagnostics.ts",
  "packages/three-compat/src/loaders/index.ts",
  "tests/assets/three-compat-loader-corpus.test.ts",
  "tests/browser/three-compat-loader-corpus.spec.ts"
] as const;

function check(name: string, pass: boolean, detail: string): ThreeCompatLoaderReadinessCheck {
  return { name, pass, detail };
}

const gltf = new ThreeCompatGLTFLoader().load("fixtures/three-compat/assets/corpus/damaged-helmet.glb");
const obj = new OBJLoaderThreeCompat().load("fixtures/three-compat/loaders/sample.obj");
const mtl = new MTLLoaderThreeCompat().load("fixtures/three-compat/loaders/sample.mtl");
const hdr = new HDRLoaderThreeCompat().load("fixtures/three-compat/environments/hdri/studio_small_08_1k.hdr");
const ktx2 = new KTX2LoaderThreeCompat().load("tests/assets/corpus/ktx2/Rib_N.ktx2");
const texture = new TextureLoaderThreeCompat().load("tests/reports/external-parity-hdr-visual-parity/aura3d-hdr.png");
const cube = new CubeTextureLoaderThreeCompat().load(Array.from({ length: 6 }, () => "fixtures/three-compat/environments/hdri/studio_small_08_1k.hdr"));
const compat = [
  new GLTFLoaderCompat().load("fixtures/three-compat/assets/corpus/boom-box.glb").diagnostic,
  new OBJLoaderCompat().load("fixtures/three-compat/loaders/sample.obj").diagnostic,
  new ThreeCompatTextureLoader().load("tests/reports/external-parity-hdr-visual-parity/aura3d-hdr.png")
];
const loadedDiagnostics = [gltf.diagnostic, obj.diagnostic, mtl.diagnostic, hdr, ktx2, texture, ...cube, ...compat];
const checks: ThreeCompatLoaderReadinessCheck[] = [
  check("required-files-present", requiredFiles.every((file) => existsSync(resolve(file))), requiredFiles.filter((file) => !existsSync(resolve(file))).join(", ") || "all Three.js compatibility loader files exist"),
  check("gltf-capabilities", gltf.diagnostic.status === "loaded" && gltf.capabilities.includes("pbr") && gltf.capabilities.includes("extension-diagnostics"), gltf.capabilities.join(", ")),
  check("decoder-diagnostics", gltf.diagnostic.decoderNeeds.length >= 3 && ktx2.decoderNeeds.includes("basis-universal-transcoder"), [...gltf.diagnostic.decoderNeeds, ...ktx2.decoderNeeds].join(", ")),
  check("obj-mtl-real-sample", obj.vertices >= 5 && obj.faces >= 4 && obj.mtllibs.includes("sample.mtl") && mtl.materials.includes("sample_clearcoat"), `${obj.vertices} vertices, ${obj.faces} faces, ${mtl.materials.length} materials`),
  check("hdr-or-exr-proof", hdr.status === "loaded" && hdr.bytes > 1000000, `${hdr.bytes} HDR bytes`),
  check("texture-formats", texture.status === "loaded" && new TextureLoaderThreeCompat().supportedFormats.includes("png") && new TextureLoaderThreeCompat().supportedFormats.includes("webp"), new TextureLoaderThreeCompat().supportedFormats.join(", ")),
  check("cube-texture-loader", cube.length === 6 && cube.every((diagnostic) => diagnostic.status === "loaded"), `${cube.length} cube faces`),
  check("three-compat-loaders", compat.every((diagnostic) => diagnostic.status === "loaded"), compat.map((diagnostic) => diagnostic.loader).join(", "))
];

const pass = checks.every((item) => item.pass);
const report = {
  schema: "a3d-three-compat-loader-readiness",
  generatedAt: new Date().toISOString(),
  pass,
  diagnostics: loadedDiagnostics,
  checks
};

const reportPath = resolve("tests/reports/three-compat-loader-readiness.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (!pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(`Three.js compatibility loader readiness passed: ${loadedDiagnostics.length} diagnostics, ${obj.faces} OBJ faces.`);
