#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, "..");
const stagedRoot = join(appRoot, "assets/quaternius-source/selected");
const outputRoot = join(appRoot, "assets/source/fighters");

const fighterBuilds = [
  {
    id: "auraClashPlayerRig",
    body: join(stagedRoot, "characters/ranger/mara/Female_Ranger.gltf"),
    textureRoot: join(appRoot, "assets/derived/fighter-textures/mara"),
    animation: join(stagedRoot, "animations/UAL1_Standard.glb"),
    animationNames: new Set([
      "Idle_Loop", "Walk_Loop", "Sprint_Loop", "Jump_Loop", "Crouch_Idle_Loop",
      "Punch_Jab", "Punch_Cross", "Sword_Attack", "Hit_Chest", "Hit_Head", "Death01"
    ]),
    guardAnimation: join(stagedRoot, "animations/UAL2_Standard.glb"),
    output: join(outputRoot, "aura-clash-player-rig.glb"),
    label: "Mara Volt",
    openHead: {
      base: join(stagedRoot, "characters/base/Superhero_Female_FullBody.gltf"),
      bodyMesh: "Superhero_Female",
      detailMeshes: new Set(["Eyebrows", "Eyes"]),
      hair: join(stagedRoot, "characters/hair/Hair_Buns.gltf"),
      minimumY: 1.49
    }
  },
  {
    id: "auraClashRivalRig",
    body: join(stagedRoot, "characters/ranger/rook/Male_Ranger.gltf"),
    textureRoot: join(appRoot, "assets/derived/fighter-textures/rook"),
    animation: join(stagedRoot, "animations/UAL2_Standard.glb"),
    animationNames: new Set([
      "Idle_FoldArms_Loop", "Zombie_Walk_Fwd_Loop", "Shield_Dash_RM", "NinjaJump_Idle_Loop",
      "Sword_Block", "Melee_Hook", "Sword_Regular_A", "Sword_Regular_Combo", "Hit_Knockback", "LayToIdle"
    ]),
    output: join(outputRoot, "aura-clash-rival-rig.glb"),
    label: "Rook Atlas"
  }
];

const align4 = (value) => (value + 3) & ~3;
const clone = (value) => JSON.parse(JSON.stringify(value));

function readGlb(path) {
  const bytes = readFileSync(path);
  if (bytes.toString("ascii", 0, 4) !== "glTF") throw new Error(`${path} is not a GLB`);
  const length = bytes.readUInt32LE(8);
  let offset = 12;
  let json;
  let binary = Buffer.alloc(0);
  while (offset < length) {
    const chunkLength = bytes.readUInt32LE(offset);
    const chunkType = bytes.readUInt32LE(offset + 4);
    const chunk = bytes.subarray(offset + 8, offset + 8 + chunkLength);
    if (chunkType === 0x4e4f534a) json = JSON.parse(chunk.toString("utf8"));
    if (chunkType === 0x004e4942) binary = Buffer.from(chunk);
    offset += 8 + chunkLength;
  }
  if (!json) throw new Error(`${path} has no JSON chunk`);
  return { json, binary };
}

function appendChunk(chunks, bytes) {
  const currentLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const alignedLength = align4(currentLength);
  if (alignedLength > currentLength) chunks.push(Buffer.alloc(alignedLength - currentLength));
  const byteOffset = alignedLength;
  chunks.push(Buffer.from(bytes));
  return byteOffset;
}

const accessorComponents = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16
};

const componentReaders = {
  5120: { bytes: 1, read: (view, offset) => view.getInt8(offset) },
  5121: { bytes: 1, read: (view, offset) => view.getUint8(offset) },
  5122: { bytes: 2, read: (view, offset) => view.getInt16(offset, true) },
  5123: { bytes: 2, read: (view, offset) => view.getUint16(offset, true) },
  5125: { bytes: 4, read: (view, offset) => view.getUint32(offset, true) },
  5126: { bytes: 4, read: (view, offset) => view.getFloat32(offset, true) }
};

function readAccessor(document, binary, accessorIndex) {
  const accessor = document.accessors[accessorIndex];
  const bufferView = document.bufferViews[accessor.bufferView];
  const component = componentReaders[accessor.componentType];
  const componentCount = accessorComponents[accessor.type];
  if (!component || !componentCount || accessor.sparse) {
    throw new Error(`Unsupported composite accessor ${accessorIndex}`);
  }
  const stride = bufferView.byteStride ?? component.bytes * componentCount;
  const start = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const view = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  return Array.from({ length: accessor.count }, (_, row) => {
    const values = Array.from({ length: componentCount }, (_, column) =>
      component.read(view, start + row * stride + column * component.bytes));
    return componentCount === 1 ? values[0] : values;
  });
}

function readGltf(path) {
  const document = JSON.parse(readFileSync(path, "utf8"));
  const bufferUri = document.buffers?.[0]?.uri;
  if (!bufferUri) throw new Error(`${path} does not contain an external glTF buffer`);
  return { document, binary: readFileSync(join(dirname(path), decodeURIComponent(bufferUri))) };
}

function remapTextureReferences(value, textureMap) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (key.endsWith("Texture") && child && typeof child === "object" && Number.isInteger(child.index)) {
      const targetIndex = textureMap.get(child.index);
      if (targetIndex === undefined) throw new Error(`Missing imported texture ${child.index}`);
      child.index = targetIndex;
    } else {
      remapTextureReferences(child, textureMap);
    }
  }
}

function collectTextureReferences(value, output = new Set()) {
  if (!value || typeof value !== "object") return output;
  for (const [key, child] of Object.entries(value)) {
    if (key.endsWith("Texture") && child && typeof child === "object" && Number.isInteger(child.index)) {
      output.add(child.index);
    } else {
      collectTextureReferences(child, output);
    }
  }
  return output;
}

/**
 * Import selected skinned meshes from another Quaternius modular-character document.
 *
 * All selected sources use the same ordered 65-joint skeleton. Reusing the target skin preserves the
 * fighter's proven combat clips while allowing Mara to have an exposed face and rigged hair instead of
 * shipping two near-identical hooded silhouettes. The full superhero body is intentionally not imported:
 * only triangles weighted to the head/neck joints survive, so the Ranger outfit remains the costume.
 */
function importCompatibleMeshes(target, chunks, sourcePath, options) {
  const { document: source, binary } = readGltf(sourcePath);
  const targetJointNames = target.skins[0].joints.map((index) => target.nodes[index]?.name);
  const sourceJointNames = source.skins[0].joints.map((index) => source.nodes[index]?.name);
  if (targetJointNames.join("\n") !== sourceJointNames.join("\n")) {
    throw new Error(`${sourcePath} does not share the target fighter skeleton`);
  }

  const selectedMeshes = (source.meshes ?? []).filter((mesh) =>
    mesh.name === options.filteredHeadMesh || options.meshNames.has(mesh.name));
  const requiredAccessorIndices = new Set();
  for (const mesh of selectedMeshes) {
    const filtered = mesh.name === options.filteredHeadMesh;
    for (const primitive of mesh.primitives) {
      Object.values(primitive.attributes).forEach((index) => requiredAccessorIndices.add(index));
      if (!filtered && primitive.indices !== undefined) requiredAccessorIndices.add(primitive.indices);
    }
  }
  const requiredViewIndices = new Set();
  for (const accessorIndex of requiredAccessorIndices) {
    const accessor = source.accessors[accessorIndex];
    if (accessor.bufferView !== undefined) requiredViewIndices.add(accessor.bufferView);
    if (accessor.sparse?.indices?.bufferView !== undefined) requiredViewIndices.add(accessor.sparse.indices.bufferView);
    if (accessor.sparse?.values?.bufferView !== undefined) requiredViewIndices.add(accessor.sparse.values.bufferView);
  }
  const viewMap = new Map();
  for (const sourceViewIndex of requiredViewIndices) {
    const sourceView = source.bufferViews[sourceViewIndex];
    const sourceStart = sourceView.byteOffset ?? 0;
    const bytes = binary.subarray(sourceStart, sourceStart + sourceView.byteLength);
    const byteOffset = appendChunk(chunks, bytes);
    const targetViewIndex = target.bufferViews.length;
    target.bufferViews.push({ ...clone(sourceView), buffer: 0, byteOffset });
    viewMap.set(sourceViewIndex, targetViewIndex);
  }
  const accessorMap = new Map();
  for (const sourceAccessorIndex of requiredAccessorIndices) {
    const accessor = clone(source.accessors[sourceAccessorIndex]);
    if (accessor.bufferView !== undefined) accessor.bufferView = viewMap.get(accessor.bufferView);
    if (accessor.sparse?.indices?.bufferView !== undefined) accessor.sparse.indices.bufferView = viewMap.get(accessor.sparse.indices.bufferView);
    if (accessor.sparse?.values?.bufferView !== undefined) accessor.sparse.values.bufferView = viewMap.get(accessor.sparse.values.bufferView);
    accessorMap.set(sourceAccessorIndex, target.accessors.length);
    target.accessors.push(accessor);
  }

  target.samplers ??= [];
  target.images ??= [];
  target.textures ??= [];
  target.materials ??= [];
  const selectedMaterialIndices = new Set(selectedMeshes.flatMap((mesh) =>
    mesh.primitives.flatMap((primitive) => primitive.material === undefined ? [] : [primitive.material])));
  const materialMap = new Map();
  const pendingMaterials = [];
  const requiredTextureIndices = new Set();
  for (const sourceMaterialIndex of selectedMaterialIndices) {
    const sourceMaterial = source.materials[sourceMaterialIndex];
    const existingIndex = options.reuseMaterialNames
      ? target.materials.findIndex((material) => material.name === sourceMaterial.name)
      : -1;
    if (existingIndex >= 0) {
      materialMap.set(sourceMaterialIndex, existingIndex);
      continue;
    }
    const material = clone(sourceMaterial);
    if (options.baseColorOnly) {
      delete material.normalTexture;
      delete material.occlusionTexture;
      delete material.emissiveTexture;
      if (material.pbrMetallicRoughness) {
        delete material.pbrMetallicRoughness.metallicRoughnessTexture;
        material.pbrMetallicRoughness.metallicFactor = 0.04;
        material.pbrMetallicRoughness.roughnessFactor = 0.4;
      }
    }
    if (options.solidHair && material.name === "MI_Hair_2") {
      delete material.pbrMetallicRoughness?.baseColorTexture;
      material.pbrMetallicRoughness ??= {};
      material.pbrMetallicRoughness.baseColorFactor = [0.68, 0.78, 0.84, 1];
      material.pbrMetallicRoughness.metallicFactor = 0.08;
      material.pbrMetallicRoughness.roughnessFactor = 0.36;
    }
    collectTextureReferences(material, requiredTextureIndices);
    pendingMaterials.push([sourceMaterialIndex, material]);
  }
  const requiredImageIndices = new Set([...requiredTextureIndices].flatMap((index) => {
    const sourceIndex = source.textures[index]?.source;
    return sourceIndex === undefined ? [] : [sourceIndex];
  }));
  const imageMap = new Map();
  for (const sourceImageIndex of requiredImageIndices) {
    const sourceImage = source.images[sourceImageIndex];
    const image = clone(sourceImage);
    if (image.uri) {
      const imageName = decodeURIComponent(image.uri);
      const localImagePath = join(dirname(sourcePath), imageName);
      const sharedImagePath = join(dirname(dirname(sourcePath)), "base", imageName);
      const imagePath = existsSync(localImagePath) ? localImagePath : sharedImagePath;
      const imageBytes = readFileSync(imagePath);
      const byteOffset = appendChunk(chunks, imageBytes);
      const bufferView = target.bufferViews.length;
      target.bufferViews.push({ buffer: 0, byteOffset, byteLength: imageBytes.length });
      image.bufferView = bufferView;
      image.mimeType ??= image.uri.toLowerCase().endsWith(".jpg") || image.uri.toLowerCase().endsWith(".jpeg")
        ? "image/jpeg"
        : "image/png";
      delete image.uri;
    } else if (image.bufferView !== undefined) {
      const sourceView = source.bufferViews[image.bufferView];
      const sourceStart = sourceView.byteOffset ?? 0;
      const imageBytes = binary.subarray(sourceStart, sourceStart + sourceView.byteLength);
      const byteOffset = appendChunk(chunks, imageBytes);
      image.bufferView = target.bufferViews.length;
      target.bufferViews.push({ buffer: 0, byteOffset, byteLength: imageBytes.length });
    }
    imageMap.set(sourceImageIndex, target.images.length);
    target.images.push(image);
  }
  const requiredSamplerIndices = new Set([...requiredTextureIndices].flatMap((index) => {
    const sampler = source.textures[index]?.sampler;
    return sampler === undefined ? [] : [sampler];
  }));
  const samplerMap = new Map();
  for (const sourceSamplerIndex of requiredSamplerIndices) {
    samplerMap.set(sourceSamplerIndex, target.samplers.length);
    target.samplers.push(clone(source.samplers[sourceSamplerIndex]));
  }
  const textureMap = new Map();
  for (const sourceTextureIndex of requiredTextureIndices) {
    const sourceTexture = source.textures[sourceTextureIndex];
    const texture = clone(sourceTexture);
    if (texture.sampler !== undefined) texture.sampler = samplerMap.get(texture.sampler);
    if (texture.source !== undefined) texture.source = imageMap.get(texture.source);
    textureMap.set(sourceTextureIndex, target.textures.length);
    target.textures.push(texture);
  }
  for (const [sourceMaterialIndex, material] of pendingMaterials) {
    remapTextureReferences(material, textureMap);
    materialMap.set(sourceMaterialIndex, target.materials.length);
    target.materials.push(material);
  }

  const rootNode = target.nodes[target.scenes[0].nodes[0]];
  for (const sourceMesh of selectedMeshes) {
    const isFilteredHead = sourceMesh.name === options.filteredHeadMesh;
    const mesh = clone(sourceMesh);
    mesh.name = `${options.namePrefix}_${sourceMesh.name}`;
    for (let primitiveIndex = 0; primitiveIndex < mesh.primitives.length; primitiveIndex += 1) {
      const primitive = mesh.primitives[primitiveIndex];
      const sourcePrimitive = sourceMesh.primitives[primitiveIndex];
      primitive.attributes = Object.fromEntries(Object.entries(primitive.attributes)
        .map(([semantic, accessor]) => [semantic, accessorMap.get(accessor)]));
      if (primitive.material !== undefined) primitive.material = materialMap.get(primitive.material);
      if (!isFilteredHead) {
        if (primitive.indices !== undefined) primitive.indices = accessorMap.get(primitive.indices);
        continue;
      }
      const positions = readAccessor(source, binary, sourcePrimitive.attributes.POSITION);
      const joints = readAccessor(source, binary, sourcePrimitive.attributes.JOINTS_0);
      const weights = readAccessor(source, binary, sourcePrimitive.attributes.WEIGHTS_0);
      const indices = readAccessor(source, binary, sourcePrimitive.indices);
      const selected = [];
      for (let index = 0; index < indices.length; index += 3) {
        const triangle = indices.slice(index, index + 3);
        const belongsToHead = triangle.every((vertexIndex) => {
          const headWeight = joints[vertexIndex].reduce((sum, joint, component) =>
            sum + ((joint === 5 || joint === 6) ? weights[vertexIndex][component] : 0), 0);
          return positions[vertexIndex][1] >= options.minimumY && headWeight >= 0.5;
        });
        if (belongsToHead) selected.push(...triangle);
      }
      if (selected.length === 0) throw new Error(`${sourceMesh.name} produced no head triangles`);
      const indexBytes = Buffer.from(new Uint32Array(selected).buffer);
      const byteOffset = appendChunk(chunks, indexBytes);
      const indexView = target.bufferViews.length;
      target.bufferViews.push({ buffer: 0, byteOffset, byteLength: indexBytes.length, target: 34963 });
      primitive.indices = target.accessors.length;
      target.accessors.push({
        bufferView: indexView,
        componentType: 5125,
        count: selected.length,
        type: "SCALAR",
        min: [Math.min(...selected)],
        max: [Math.max(...selected)]
      });
      console.log(`[aura-clash animated fighters] ${options.namePrefix}: retained ${selected.length / 3} exposed-head triangles`);
    }
    const targetMesh = target.meshes.length;
    target.meshes.push(mesh);
    const targetNode = target.nodes.length;
    target.nodes.push({ name: mesh.name, mesh: targetMesh, skin: 0 });
    rootNode.children.push(targetNode);
  }
}

function replaceHoodWithOpenHead(document, chunks, build) {
  if (!build.openHead) return;
  const hoodNode = document.nodes.find((node) => node.name?.includes("Head_Hood"));
  if (!hoodNode) throw new Error(`${build.id} does not contain a removable hood node`);
  delete hoodNode.mesh;
  delete hoodNode.skin;
  importCompatibleMeshes(document, chunks, build.openHead.base, {
    namePrefix: `${build.id}_open-head`,
    filteredHeadMesh: build.openHead.bodyMesh,
    meshNames: build.openHead.detailMeshes,
    minimumY: build.openHead.minimumY,
    baseColorOnly: true,
    reuseMaterialNames: false,
    solidHair: true
  });
  const hairDocument = JSON.parse(readFileSync(build.openHead.hair, "utf8"));
  importCompatibleMeshes(document, chunks, build.openHead.hair, {
    namePrefix: `${build.id}_hair`,
    filteredHeadMesh: null,
    meshNames: new Set((hairDocument.meshes ?? []).map((mesh) => mesh.name)),
    minimumY: 0,
    baseColorOnly: true,
    reuseMaterialNames: true,
    solidHair: true
  });
}

function embedBodyImages(document, bodyPath, textureRoot, chunks) {
  const bodyDir = dirname(bodyPath);
  for (const image of document.images ?? []) {
    if (!image.uri) continue;
    const sourceName = decodeURIComponent(image.uri);
    const derivedPath = join(textureRoot, sourceName);
    if (!existsSync(derivedPath)) throw new Error(`Missing derived fighter texture ${derivedPath}`);
    const imageBytes = readFileSync(derivedPath);
    const byteOffset = appendChunk(chunks, imageBytes);
    const bufferView = document.bufferViews.length;
    document.bufferViews.push({ buffer: 0, byteOffset, byteLength: imageBytes.length });
    image.bufferView = bufferView;
    image.mimeType ??= image.uri.toLowerCase().endsWith(".jpg") || image.uri.toLowerCase().endsWith(".jpeg")
      ? "image/jpeg"
      : "image/png";
    delete image.uri;
  }
}

function appendAnimations(document, animationDocument, animationBinary, chunks, includeNames = null) {
  const bodyNodeByName = new Map(document.nodes.map((node, index) => [node.name, index]));
  const selectedAnimations = (animationDocument.animations ?? [])
    .filter((sourceAnimation) => includeNames === null || includeNames.has(sourceAnimation.name));
  const requiredAccessorIndices = new Set(selectedAnimations.flatMap((animation) =>
    animation.samplers.flatMap((sampler) => [sampler.input, sampler.output])));
  const requiredViewIndices = new Set();
  for (const accessorIndex of requiredAccessorIndices) {
    const accessor = animationDocument.accessors?.[accessorIndex];
    if (!accessor) throw new Error(`Animation references missing accessor ${accessorIndex}`);
    if (accessor.bufferView !== undefined) requiredViewIndices.add(accessor.bufferView);
    if (accessor.sparse?.indices?.bufferView !== undefined) requiredViewIndices.add(accessor.sparse.indices.bufferView);
    if (accessor.sparse?.values?.bufferView !== undefined) requiredViewIndices.add(accessor.sparse.values.bufferView);
  }

  const viewMap = new Map();
  for (const sourceViewIndex of requiredViewIndices) {
    const sourceView = animationDocument.bufferViews?.[sourceViewIndex];
    if (!sourceView) throw new Error(`Animation accessor references missing buffer view ${sourceViewIndex}`);
    const sourceStart = sourceView.byteOffset ?? 0;
    const bytes = animationBinary.subarray(sourceStart, sourceStart + sourceView.byteLength);
    const byteOffset = appendChunk(chunks, bytes);
    const targetViewIndex = document.bufferViews.length;
    const targetView = clone(sourceView);
    targetView.buffer = 0;
    targetView.byteOffset = byteOffset;
    document.bufferViews.push(targetView);
    viewMap.set(sourceViewIndex, targetViewIndex);
  }

  const accessorMap = new Map();
  for (const sourceAccessorIndex of requiredAccessorIndices) {
    const accessor = clone(animationDocument.accessors[sourceAccessorIndex]);
    if (accessor.bufferView !== undefined) accessor.bufferView = viewMap.get(accessor.bufferView);
    if (accessor.sparse?.indices?.bufferView !== undefined) accessor.sparse.indices.bufferView = viewMap.get(accessor.sparse.indices.bufferView);
    if (accessor.sparse?.values?.bufferView !== undefined) accessor.sparse.values.bufferView = viewMap.get(accessor.sparse.values.bufferView);
    accessorMap.set(sourceAccessorIndex, document.accessors.length);
    document.accessors.push(accessor);
  }

  const animations = selectedAnimations
    .map((sourceAnimation) => {
    const animation = clone(sourceAnimation);
    for (const sampler of animation.samplers) {
      sampler.input = accessorMap.get(sampler.input);
      sampler.output = accessorMap.get(sampler.output);
    }
    for (const channel of animation.channels) {
      const sourceNode = animationDocument.nodes[channel.target.node];
      const targetNode = bodyNodeByName.get(sourceNode?.name);
      if (targetNode === undefined) {
        throw new Error(`Animation ${animation.name ?? "unnamed"} targets missing body bone ${sourceNode?.name ?? channel.target.node}`);
      }
      channel.target.node = targetNode;
    }
    return animation;
  });
  document.animations = [...(document.animations ?? []), ...animations];
}

function writeGlb(path, document, binary) {
  const jsonBytes = Buffer.from(JSON.stringify(document));
  const jsonLength = align4(jsonBytes.length);
  const binaryLength = align4(binary.length);
  const totalLength = 12 + 8 + jsonLength + 8 + binaryLength;
  const output = Buffer.alloc(totalLength);
  output.write("glTF", 0, "ascii");
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(totalLength, 8);
  output.writeUInt32LE(jsonLength, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  jsonBytes.copy(output, 20);
  output.fill(0x20, 20 + jsonBytes.length, 20 + jsonLength);
  const binaryHeader = 20 + jsonLength;
  output.writeUInt32LE(binaryLength, binaryHeader);
  output.writeUInt32LE(0x004e4942, binaryHeader + 4);
  binary.copy(output, binaryHeader + 8);
  writeFileSync(path, output);
}

for (const build of fighterBuilds) {
  const document = JSON.parse(readFileSync(build.body, "utf8"));
  const bodyBuffer = readFileSync(join(dirname(build.body), document.buffers[0].uri));
  const animation = readGlb(build.animation);
  const bodyJoints = (document.skins?.[0]?.joints ?? []).map((index) => document.nodes[index]?.name);
  const animationJoints = (animation.json.skins?.[0]?.joints ?? []).map((index) => animation.json.nodes[index]?.name);
  if (bodyJoints.join("\n") !== animationJoints.join("\n")) {
    throw new Error(`${build.id} body and animation skeletons do not have identical ordered joints`);
  }

  const chunks = [Buffer.from(bodyBuffer)];
  document.buffers = [{ byteLength: 0 }];
  document.bufferViews ??= [];
  document.accessors ??= [];
  embedBodyImages(document, build.body, build.textureRoot, chunks);
  replaceHoodWithOpenHead(document, chunks, build);
  appendAnimations(document, animation.json, animation.binary, chunks, build.animationNames);
  if (build.guardAnimation) {
    const guardAnimation = readGlb(build.guardAnimation);
    const guardAnimationJoints = (guardAnimation.json.skins?.[0]?.joints ?? []).map((index) => guardAnimation.json.nodes[index]?.name);
    if (bodyJoints.join("\n") !== guardAnimationJoints.join("\n")) {
      throw new Error(`${build.id} body and guard animation skeletons do not have identical ordered joints`);
    }
    appendAnimations(document, guardAnimation.json, guardAnimation.binary, chunks, new Set(["Sword_Block"]));
  }
  const binary = Buffer.concat(chunks);
  document.buffers[0].byteLength = binary.length;
  document.asset.extras = {
    ...(document.asset.extras ?? {}),
    aura3d: {
      id: build.id,
      displayName: build.label,
      role: "character",
      sourceFamily: "Quaternius Modular Character Outfits - Fantasy + Universal Animation Library",
      license: "CC0-1.0",
      sourceArchiveSha256: "c3468b18871cc8c8f05ab14df7712baf22cb9f389cbd870babf130e595187f70",
      fusedSkeleton: true,
      visibleMeshSource: build.body.slice(appRoot.length + 1),
      textureSource: build.textureRoot.slice(appRoot.length + 1),
      animationSource: build.animation.slice(appRoot.length + 1),
      guardAnimationSource: build.guardAnimation?.slice(appRoot.length + 1) ?? null,
      openHeadSource: build.openHead?.base.slice(appRoot.length + 1) ?? null,
      hairSource: build.openHead?.hair.slice(appRoot.length + 1) ?? null
    }
  };
  writeGlb(build.output, document, binary);
  console.log(`[aura-clash animated fighters] ${build.id}: ${document.meshes.length} meshes, ${document.materials.length} materials, ${document.animations.length} clips -> ${build.output}`);
}
