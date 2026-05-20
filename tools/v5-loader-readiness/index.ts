import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  CubeTextureLoaderV5,
  GLTFLoaderV5,
  HDRLoaderV5,
  KTX2LoaderV5,
  MTLLoaderV5,
  OBJLoaderV5,
  TextureLoaderV5
} from "../../packages/assets/src";
import { GLTFLoaderCompat, OBJLoaderCompat, ThreeCompatTextureLoader } from "../../packages/three-compat/src";

interface V5LoaderReadinessCheck {
  readonly name: string;
  readonly pass: boolean;
  readonly detail: string;
}

const requiredFiles = [
  "packages/assets/src/loaders/GLTFLoaderV5.ts",
  "packages/assets/src/loaders/OBJLoader.ts",
  "packages/assets/src/loaders/MTLLoader.ts",
  "packages/assets/src/loaders/HDRLoader.ts",
  "packages/assets/src/loaders/EXRLoader.ts",
  "packages/assets/src/loaders/KTX2Loader.ts",
  "packages/assets/src/loaders/TextureLoader.ts",
  "packages/assets/src/loaders/CubeTextureLoader.ts",
  "packages/assets/src/loaders/LoaderDiagnostics.ts",
  "packages/three-compat/src/loaders/index.ts",
  "tests/assets/v5-loader-corpus.test.ts",
  "tests/browser/v5-loader-corpus.spec.ts"
] as const;

function check(name: string, pass: boolean, detail: string): V5LoaderReadinessCheck {
  return { name, pass, detail };
}

const gltf = new GLTFLoaderV5().load("fixtures/v5/assets/corpus/damaged-helmet.glb");
const obj = new OBJLoaderV5().load("fixtures/v5/loaders/sample.obj");
const mtl = new MTLLoaderV5().load("fixtures/v5/loaders/sample.mtl");
const hdr = new HDRLoaderV5().load("fixtures/v5/environments/hdri/studio_small_08_1k.hdr");
const ktx2 = new KTX2LoaderV5().load("tests/assets/corpus/ktx2/Rib_N.ktx2");
const texture = new TextureLoaderV5().load("tests/reports/v4-hdr-visual-parity/galileo-hdr.png");
const cube = new CubeTextureLoaderV5().load(Array.from({ length: 6 }, () => "fixtures/v5/environments/hdri/studio_small_08_1k.hdr"));
const compat = [
  new GLTFLoaderCompat().load("fixtures/v5/assets/corpus/boom-box.glb").diagnostic,
  new OBJLoaderCompat().load("fixtures/v5/loaders/sample.obj").diagnostic,
  new ThreeCompatTextureLoader().load("tests/reports/v4-hdr-visual-parity/galileo-hdr.png")
];
const loadedDiagnostics = [gltf.diagnostic, obj.diagnostic, mtl.diagnostic, hdr, ktx2, texture, ...cube, ...compat];
const checks: V5LoaderReadinessCheck[] = [
  check("required-files-present", requiredFiles.every((file) => existsSync(resolve(file))), requiredFiles.filter((file) => !existsSync(resolve(file))).join(", ") || "all V5 loader files exist"),
  check("gltf-capabilities", gltf.diagnostic.status === "loaded" && gltf.capabilities.includes("pbr") && gltf.capabilities.includes("extension-diagnostics"), gltf.capabilities.join(", ")),
  check("decoder-diagnostics", gltf.diagnostic.decoderNeeds.length >= 3 && ktx2.decoderNeeds.includes("basis-universal-transcoder"), [...gltf.diagnostic.decoderNeeds, ...ktx2.decoderNeeds].join(", ")),
  check("obj-mtl-real-sample", obj.vertices >= 5 && obj.faces >= 4 && obj.mtllibs.includes("sample.mtl") && mtl.materials.includes("sample_clearcoat"), `${obj.vertices} vertices, ${obj.faces} faces, ${mtl.materials.length} materials`),
  check("hdr-or-exr-proof", hdr.status === "loaded" && hdr.bytes > 1000000, `${hdr.bytes} HDR bytes`),
  check("texture-formats", texture.status === "loaded" && new TextureLoaderV5().supportedFormats.includes("png") && new TextureLoaderV5().supportedFormats.includes("webp"), new TextureLoaderV5().supportedFormats.join(", ")),
  check("cube-texture-loader", cube.length === 6 && cube.every((diagnostic) => diagnostic.status === "loaded"), `${cube.length} cube faces`),
  check("three-compat-loaders", compat.every((diagnostic) => diagnostic.status === "loaded"), compat.map((diagnostic) => diagnostic.loader).join(", "))
];

const pass = checks.every((item) => item.pass);
const report = {
  schema: "g3d-v5-loader-readiness/v1",
  generatedAt: new Date().toISOString(),
  pass,
  diagnostics: loadedDiagnostics,
  checks
};

const reportPath = resolve("tests/reports/v5-loader-readiness.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (!pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(`V5 loader readiness passed: ${loadedDiagnostics.length} diagnostics, ${obj.faces} OBJ faces.`);
