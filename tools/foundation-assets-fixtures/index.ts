import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

const root = process.cwd();
const sourceRoot = join(root, "fixtures/product-studio/products");
const targetRoot = join(root, "fixtures/workflow-assets/assets");

const fixtures = [
  { id: "product-camera", source: "camera-kit", description: "V3 product camera fixture with data URI buffers and textures." },
  { id: "material-spheres", source: "watch", description: "V3 material-rich fixture with metal, glass, emissive, and strap materials." },
  { id: "animated-character", source: "speaker", description: "V3 animation placeholder fixture used to validate loader summaries and warnings." },
  { id: "variant-product", source: "camera-kit", description: "V3 product variant fixture used for material variant readiness tracking." },
  { id: "compressed-product", source: "speaker", description: "V3 compression placeholder fixture used for compression warning coverage." }
] as const;

async function main(): Promise<void> {
  for (const fixture of fixtures) {
    const sourceGltfPath = join(sourceRoot, fixture.source, `${fixture.source}.gltf`);
    const sourceManifestPath = join(sourceRoot, fixture.source, "manifest.json");
    const sourceGltf = JSON.parse(await readFile(sourceGltfPath, "utf8"));
    const sourceManifest = JSON.parse(await readFile(sourceManifestPath, "utf8"));
    const directory = join(targetRoot, fixture.id);
    await mkdir(directory, { recursive: true });
    const gltfPath = join(directory, `${fixture.id}.gltf`);
    const glbPath = join(directory, `${fixture.id}.glb`);
    const externalGltfPath = join(directory, `${fixture.id}-external.gltf`);
    const manifestPath = join(directory, "manifest.json");

    await writeFile(gltfPath, `${JSON.stringify(renameAsset(sourceGltf, fixture.id), null, 2)}\n`);
    await writeFile(glbPath, createJsonOnlyGlb(renameAsset(sourceGltf, `${fixture.id}-glb`)));
    await writeExternalFixture(renameAsset(sourceGltf, `${fixture.id}-external`), externalGltfPath);
    await writeFile(manifestPath, `${JSON.stringify({
      schema: "a3d-v3-asset-fixture/v1",
      id: fixture.id,
      source: fixture.source,
      description: fixture.description,
      gltf: basename(gltfPath),
      glb: basename(glbPath),
      externalGltf: basename(externalGltfPath),
      partCount: sourceManifest.parts?.length ?? sourceGltf.meshes?.length ?? 0,
      materialCount: sourceManifest.materials?.length ?? sourceGltf.materials?.length ?? 0,
      textureCount: sourceGltf.textures?.length ?? 0,
      expectedWarnings: expectedWarningsFor(fixture.id),
      coverage: ["gltf", "glb", "data-uri", "external-buffer", "external-image", "materials", "textures", "bounds"]
    }, null, 2)}\n`);
  }
}

function renameAsset(gltf: any, id: string): any {
  return {
    ...gltf,
    asset: {
      ...(gltf.asset ?? {}),
      generator: `A3D V3 asset fixture generator (${id})`
    },
    scenes: (gltf.scenes ?? []).map((scene: any, index: number) => ({
      ...scene,
      name: `${id}-scene-${index}`
    }))
  };
}

async function writeExternalFixture(gltf: any, targetPath: string): Promise<void> {
  const directory = dirname(targetPath);
  const external = structuredClone(gltf);
  for (const [index, buffer] of (external.buffers ?? []).entries()) {
    if (typeof buffer.uri === "string" && buffer.uri.startsWith("data:")) {
      const bytes = decodeDataUri(buffer.uri);
      const file = `buffer-${index}.bin`;
      await writeFile(join(directory, file), bytes);
      buffer.uri = file;
      buffer.byteLength = bytes.byteLength;
    }
  }
  for (const [index, image] of (external.images ?? []).entries()) {
    if (typeof image.uri === "string" && image.uri.startsWith("data:")) {
      const bytes = decodeDataUri(image.uri);
      const file = `image-${index}.png`;
      await writeFile(join(directory, file), bytes);
      image.uri = file;
      image.mimeType = "image/png";
    }
  }
  await writeFile(targetPath, `${JSON.stringify(external, null, 2)}\n`);
}

function createJsonOnlyGlb(gltf: any): Buffer {
  const json = Buffer.from(JSON.stringify(gltf), "utf8");
  const paddedJsonLength = align4(json.byteLength);
  const totalLength = 12 + 8 + paddedJsonLength;
  const output = Buffer.alloc(totalLength);
  output.writeUInt32LE(0x46546c67, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(totalLength, 8);
  output.writeUInt32LE(paddedJsonLength, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  json.copy(output, 20);
  for (let offset = 20 + json.byteLength; offset < 20 + paddedJsonLength; offset += 1) {
    output[offset] = 0x20;
  }
  return output;
}

function decodeDataUri(uri: string): Buffer {
  const comma = uri.indexOf(",");
  if (comma < 0) {
    throw new Error("Data URI missing comma separator.");
  }
  const metadata = uri.slice(0, comma);
  const payload = uri.slice(comma + 1);
  return metadata.endsWith(";base64")
    ? Buffer.from(payload, "base64")
    : Buffer.from(decodeURIComponent(payload), "utf8");
}

function align4(value: number): number {
  return value + ((4 - (value % 4)) % 4);
}

function expectedWarningsFor(id: string): readonly string[] {
  if (id === "animated-character") return ["animation coverage fixture does not include skinned motion yet"];
  if (id === "compressed-product") return ["compression fixture records compression readiness without requiring decoder-specific payloads yet"];
  if (id === "variant-product") return ["material variant fixture records variant readiness before full variant switching workflow"];
  return [];
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
