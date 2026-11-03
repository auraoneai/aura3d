import {
  findUnsupportedExportProperties,
  readAttributeNormalized,
  transformNormal,
  transformPosition,
  traverseScene,
  type AuraExportAttribute,
  type AuraExportResult,
  type AuraExportScene,
  type AuraExportWarning
} from "./ExportContext";

/** Limits are applied to the expanded, transformed scene, rather than to source meshes. */
export interface OBJExportOptions {
  readonly signal?: AbortSignal;
  readonly materialLibraryName?: string;
  readonly maxVertices?: number;
  readonly maxOutputBytes?: number;
  readonly maxDependencyBytes?: number;
}

const encoder = new TextEncoder();

/**
 * Write Wavefront OBJ plus an MTL dependency. Geometry is expanded per scene
 * instance and placed in world coordinates. OBJ has no scene graph, animation,
 * skins, morphs or cameras; the returned warnings enumerate those losses.
 * When a reachable primitive supplies COLOR_0, vertex RGB values are written
 * using the common, nonstandard `v x y z r g b` extension. Missing colors
 * default to white, and vertex alpha is reported as a loss.
 */
export function exportOBJ(scene: AuraExportScene, options: OBJExportOptions = {}): AuraExportResult {
  const maxVertices = checkedLimit(options.maxVertices, 1_000_000, "maxVertices");
  const maxOutputBytes = checkedLimit(options.maxOutputBytes, 128 * 1024 * 1024, "maxOutputBytes");
  const maxDependencyBytes = checkedLimit(options.maxDependencyBytes, 256 * 1024 * 1024, "maxDependencyBytes");
  const libraryName = options.materialLibraryName ?? "materials.mtl";
  if (!safeRelativePath(libraryName) || libraryName.includes("/")) throw new Error("OBJ materialLibraryName must be a safe file name");
  checkAbort(options.signal);

  const warnings: AuraExportWarning[] = [...(scene.sourceWarnings ?? [])];
  const warn = (code: string, path: string | undefined, message: string): void => {
    warnings.push(path === undefined ? { code, message } : { code, path, message });
  };
  const lines: string[] = ["# Aura3D Wavefront OBJ", `mtllib ${libraryName}`];
  let outputBytes = lines.reduce((sum, line) => sum + line.length + 1, 0);
  if (outputBytes > maxOutputBytes) throw new Error("OBJ output exceeds maxOutputBytes");
  const append = (line: string): void => {
    outputBytes += line.length + 1;
    if (outputBytes > maxOutputBytes) throw new Error("OBJ output exceeds maxOutputBytes");
    lines.push(line);
  };

  if (scene.metadata && Object.keys(scene.metadata).length) {
    const encoded = encodeMetadata(scene.metadata);
    if (encoded === undefined) warn("METADATA_LOST", "metadata", "Scene metadata is not JSON-compatible and could not be written as an OBJ comment");
    else {
      append(`# aura3d-scene-metadata ${encoded}`);
      warn("METADATA_NONSTANDARD", "metadata", "Scene metadata is retained in an Aura3D JSON comment that ordinary OBJ readers may ignore");
    }
  }
  warn("SCENE_CONVENTIONS_LOST", "scene", `OBJ does not declare units, up axis or texture coordinate origin; coordinates are written unchanged (metersPerUnit: ${scene.metersPerUnit ?? "unknown"}, upAxis: ${scene.upAxis ?? "unknown"}, uvOrigin: ${scene.uvOrigin ?? "unknown"})`);
  if (scene.cameras?.length) warn("CAMERAS_LOST", "cameras", "OBJ does not represent cameras");
  if (scene.lights?.length) warn("LIGHTS_LOST", "lights", "OBJ does not represent lights");
  if (scene.skins?.length) warn("SKINS_LOST", "skins", "OBJ exports the supplied geometry without skin deformation");
  if (scene.animations?.length) warn("ANIMATIONS_LOST", "animations", "OBJ does not represent animation");
  if (scene.nodes.some((node) => node.children?.length)) warn("HIERARCHY_FLATTENED", "nodes", "OBJ stores world-space geometry rather than node hierarchy");

  const materialNames: string[] = [];
  const usedMaterialNames = new Set(["aura_default"]);
  const mtlLines: string[] = ["# Aura3D Wavefront material library"];
  let mtlBytes = mtlLines[0].length + 1;
  const appendMtl = (...items: string[]): void => {
    for (const item of items) {
      mtlBytes += item.length + 1;
      if (mtlBytes > maxDependencyBytes) throw new Error("OBJ material library exceeds maxDependencyBytes");
      mtlLines.push(item);
    }
  };
  const dependencies: { name: string; data: Uint8Array }[] = [];
  const sourceDependencies = new Map<string, Uint8Array>();
  let dependencyBytes = 0;
  for (const dep of scene.dependencies ?? []) {
    if (sourceDependencies.has(dep.name)) throw new Error(`Duplicate OBJ dependency name: ${dep.name}`);
    if (!(dep.data instanceof Uint8Array)) throw new Error(`OBJ dependency ${dep.name} must be bytes`);
    sourceDependencies.set(dep.name, dep.data);
  }
  const emittedDependencies = new Map<string, string>();
  const usedNames = new Set([libraryName]);
  function addTexture(sourceName: string, path: string): string | undefined {
    const previous = emittedDependencies.get(sourceName);
    if (previous) return previous;
    const data = sourceDependencies.get(sourceName);
    if (!data) {
      warn("MISSING_DEPENDENCY", path, `Texture dependency ${sourceName} was not supplied`);
      return undefined;
    }
    let outputName = sourceName;
    if (!safeRelativePath(outputName) || pathCollides(outputName, usedNames)) {
      const extension = /\.([A-Za-z0-9]{1,8})$/.exec(sourceName)?.[1];
      let index = emittedDependencies.size + 1;
      do { outputName = `texture_${index++}${extension ? `.${extension}` : ""}`; } while (pathCollides(outputName, usedNames));
      warn("DEPENDENCY_RENAMED", path, `Texture dependency was renamed to ${outputName} for a safe relative path`);
    }
    dependencyBytes += data.byteLength;
    if (dependencyBytes + mtlBytes > maxDependencyBytes) throw new Error("OBJ dependencies exceed maxDependencyBytes");
    usedNames.add(outputName);
    emittedDependencies.set(sourceName, outputName);
    dependencies.push({ name: outputName, data: data.slice() });
    return outputName;
  }

  if ((scene.materials?.length ?? 0) > 1_000_000) throw new Error("OBJ scene exceeds material count limit");
  for (let i = 0; i < (scene.materials?.length ?? 0); i++) {
    checkAbort(options.signal);
    const material = scene.materials![i];
    const originalName = material.name ?? `material_${i}`;
    const name = uniqueLabel(originalName, usedMaterialNames);
    materialNames.push(name);
    if (material.name !== undefined && name !== material.name) warn("NAME_CHANGED", `materials[${i}].name`, "OBJ material name was sanitized or made unique");
    appendMtl(`newmtl ${name}`);
    const color = material.baseColor ?? [1, 1, 1, 1];
    assertVector(color, 4, `materials[${i}].baseColor`);
    appendMtl(`Kd ${format(color[0])} ${format(color[1])} ${format(color[2])}`, `d ${format(color[3])}`);
    if (material.emissive) {
      assertVector(material.emissive, 3, `materials[${i}].emissive`);
      appendMtl(`Ke ${material.emissive.map(format).join(" ")}`);
    }
    if (material.baseColorTexture) {
      const textureName = addTexture(material.baseColorTexture, `materials[${i}].baseColorTexture`);
      if (textureName) appendMtl(`map_Kd ${textureName}`);
    }
    if (material.emissiveTexture) {
      const textureName = addTexture(material.emissiveTexture, `materials[${i}].emissiveTexture`);
      if (textureName) {
        appendMtl(`map_Ke ${textureName}`);
        warn("MATERIAL_EXTENSION", `materials[${i}].emissiveTexture`, "Emissive texture uses the MTL map_Ke extension; some readers may ignore it");
      }
    }
    if (material.normalTexture) {
      const textureName = addTexture(material.normalTexture, `materials[${i}].normalTexture`);
      if (textureName) {
        appendMtl(`norm ${textureName}`);
        warn("MATERIAL_EXTENSION", `materials[${i}].normalTexture`, "Normal texture uses the MTL norm extension; some readers may ignore it");
      }
    }
    if (material.metallicRoughnessTexture !== undefined) warn("MATERIAL_TEXTURE_LOST", `materials[${i}].metallicRoughnessTexture`, "Standard MTL does not preserve a packed metallic-roughness texture");
    if (material.normalTextureScale !== undefined) warn("MATERIAL_PROPERTY_LOST", `materials[${i}].normalTextureScale`, "MTL does not preserve the tangent-space normal texture scale");
    if (material.occlusionTexture !== undefined) warn("MATERIAL_TEXTURE_LOST", `materials[${i}].occlusionTexture`, "Standard MTL does not preserve an occlusion texture");
    if (material.occlusionStrength !== undefined) warn("MATERIAL_PROPERTY_LOST", `materials[${i}].occlusionStrength`, "Standard MTL does not preserve occlusion strength");
    if (material.unlit !== undefined) warn("MATERIAL_PROPERTY_LOST", `materials[${i}].unlit`, "MTL does not preserve the unlit shading flag");
    if (material.metallic !== undefined || material.roughness !== undefined) warn("MATERIAL_PROPERTIES_LOST", `materials[${i}]`, "Standard MTL does not preserve metallic and roughness factors");
    if (material.alphaMode !== undefined || material.alphaCutoff !== undefined || material.doubleSided !== undefined) warn("MATERIAL_PROPERTIES_LOST", `materials[${i}]`, "MTL does not preserve alpha mode, alpha cutoff or double-sided state");
    if (material.metadata && Object.keys(material.metadata).length) {
      const encoded = encodeMetadata(material.metadata);
      if (encoded === undefined) warn("METADATA_LOST", `materials[${i}].metadata`, "Material metadata is not JSON-compatible and could not be written as an MTL comment");
      else {
        appendMtl(`# aura3d-material-metadata ${encoded}`);
        warn("METADATA_NONSTANDARD", `materials[${i}].metadata`, "Material metadata is retained in an Aura3D JSON comment that ordinary MTL readers may ignore");
      }
    }
    appendMtl("");
  }
  appendMtl("newmtl aura_default", "Kd 1 1 1", "d 1", "");

  let vertexOffset = 0;
  let normalOffset = 0;
  let uvOffset = 0;
  const reached = new Set<number>();
  const reachedMeshes = new Set<number>();
  const objectNames = new Set<string>();
  const groupNames = new Set<string>();
  const meshes = scene.meshes ?? [];
  let visitCount = 0;
  let primitiveCount = 0;
  let writesVertexColors = false;
  const pendingUncoloredVertices: number[] = [];
  const pendingUncoloredPrimitives: string[] = [];

  // A uniform vertex layout is needed by readers that decide whether the file
  // has colors from its first vertex. Earlier uncolored vertices are patched
  // only if a later reachable primitive actually supplies a color attribute.
  const beginVertexColors = (): void => {
    if (writesVertexColors) return;
    const extraBytes = pendingUncoloredVertices.length * " 1 1 1".length;
    if (outputBytes + extraBytes > maxOutputBytes) throw new Error("OBJ output exceeds maxOutputBytes");
    for (const index of pendingUncoloredVertices) lines[index] += " 1 1 1";
    outputBytes += extraBytes;
    pendingUncoloredVertices.length = 0;
    writesVertexColors = true;
    warn("VERTEX_COLOR_EXTENSION", "meshes", "Vertex RGB values use a nonstandard OBJ extension; reader support and color-space interpretation vary");
    for (const path of pendingUncoloredPrimitives) warn("VERTEX_COLOR_DEFAULTED", `${path}.attributes.COLOR_0`, "Missing vertex colors were written as white to share one vertex layout");
    pendingUncoloredPrimitives.length = 0;
  };

  traverseScene(scene, (node, nodeIndex, world) => {
    checkAbort(options.signal);
    if (++visitCount > 1_000_000) throw new Error("OBJ scene traversal exceeds its instance limit");
    reached.add(nodeIndex);
    const path = `nodes[${nodeIndex}]`;
    if (hasTransform(node)) warn("TRANSFORM_BAKED", path, "Node transform was baked into OBJ vertex coordinates");
    if (node.metadata && Object.keys(node.metadata).length) {
      const encoded = encodeMetadata(node.metadata);
      if (encoded === undefined) warn("METADATA_LOST", `${path}.metadata`, "Node metadata is not JSON-compatible and could not be written as an OBJ comment");
      else {
        append(`# aura3d-node-metadata ${nodeIndex} ${encoded}`);
        warn("METADATA_NONSTANDARD", `${path}.metadata`, "Node metadata is retained in an Aura3D JSON comment that ordinary OBJ readers may ignore");
      }
    }
    if (node.rotation && Math.abs(Math.hypot(...node.rotation) - 1) > 1e-6) warn("ROTATION_NORMALIZED", `${path}.rotation`, "Non-unit quaternion was normalized before transforming geometry");
    if (node.camera !== undefined) {
      if (!Number.isInteger(node.camera) || node.camera < 0 || node.camera >= (scene.cameras?.length ?? 0)) throw new Error(`Invalid camera reference at ${path}.camera`);
      warn("CAMERA_BINDING_LOST", `${path}.camera`, "OBJ does not preserve node camera bindings");
    }
    if (node.light !== undefined) {
      if (!Number.isInteger(node.light) || node.light < 0 || node.light >= (scene.lights?.length ?? 0)) throw new Error(`Invalid light reference at ${path}.light`);
      warn("LIGHT_BINDING_LOST", `${path}.light`, "OBJ does not preserve node light bindings");
    }
    if (node.skin !== undefined) {
      if (!Number.isInteger(node.skin) || node.skin < 0 || node.skin >= (scene.skins?.length ?? 0)) throw new Error(`Invalid skin reference at ${path}.skin`);
      warn("SKIN_BINDING_LOST", `${path}.skin`, "OBJ does not preserve node skin bindings");
    }
    if (node.weights?.length) warn("MORPH_WEIGHTS_LOST", `${path}.weights`, "OBJ does not preserve node morph weights");
    if (node.mesh === undefined) warn("EMPTY_NODE_LOST", path, "OBJ does not preserve nodes without geometry");
    if (node.mesh !== undefined) {
      if (!Number.isInteger(node.mesh) || node.mesh < 0 || node.mesh >= meshes.length) throw new Error(`Invalid mesh reference at ${path}.mesh`);
      const mesh = meshes[node.mesh];
      reachedMeshes.add(node.mesh);
      if (mesh.name !== undefined && safeLabel(mesh.name) !== mesh.name) warn("NAME_CHANGED", `meshes[${node.mesh}].name`, "OBJ group name was sanitized");
      if (mesh.weights?.length) warn("MORPH_WEIGHTS_LOST", `meshes[${node.mesh}].weights`, "OBJ does not preserve mesh morph weights");
      const label = node.name ?? mesh.name ?? `node_${nodeIndex}`;
      const objectName = uniqueLabel(label, objectNames);
      if (label !== objectName) warn("NAME_CHANGED", `${path}.name`, "OBJ object name was sanitized or made unique");
      append(`o ${objectName}`);
      for (let primitiveIndex = 0; primitiveIndex < mesh.primitives.length; primitiveIndex++) {
        checkAbort(options.signal);
        if (++primitiveCount > 1_000_000) throw new Error("OBJ scene exceeds primitive count limit");
        const primitive = mesh.primitives[primitiveIndex];
        const primitivePath = `meshes[${node.mesh}].primitives[${primitiveIndex}]`;
        const position = primitive.attributes.POSITION;
        if (!position || position.itemSize !== 3 || position.values.length % 3) throw new Error(`${primitivePath} requires a VEC3 POSITION attribute`);
        const vertexCount = position.values.length / 3;
        if (vertexOffset + vertexCount > maxVertices) throw new Error("OBJ scene exceeds maxVertices");
        const suppliedNormal = primitive.attributes.NORMAL;
        const suppliedUv = primitive.attributes.TEXCOORD_0;
        const color = primitive.attributes.COLOR_0;
        checkAttribute(suppliedNormal, 3, vertexCount, `${primitivePath}.NORMAL`);
        checkAttribute(suppliedUv, 2, vertexCount, `${primitivePath}.TEXCOORD_0`);
        if (color && color.itemSize !== 3 && color.itemSize !== 4) throw new Error(`${primitivePath}.COLOR_0 must contain RGB or RGBA values`);
        if (color) checkAttribute(color, color.itemSize, vertexCount, `${primitivePath}.COLOR_0`);
        const mode = primitive.mode ?? "triangles";
        if (mode !== "triangles" && mode !== "lines" && mode !== "points") throw new Error(`Unsupported OBJ primitive mode at ${primitivePath}`);
        const normal = mode === "triangles" ? suppliedNormal : undefined;
        const uv = mode === "points" ? undefined : suppliedUv;
        const indexCount = primitive.indices?.length ?? vertexCount;
        if (indexCount > Math.floor(maxOutputBytes / 2)) throw new Error("OBJ index data exceeds maxOutputBytes");
        const indexAt = (index: number): number => primitive.indices ? primitive.indices[index] : index;
        const arity = mode === "triangles" ? 3 : mode === "lines" ? 2 : 1;
        if (indexCount % arity) throw new Error(`${primitivePath} has an incomplete ${mode} primitive`);
        for (let i = 0; i < indexCount; i++) {
          if ((i & 4095) === 0) checkAbort(options.signal);
          const index = indexAt(i);
          if (!Number.isInteger(index) || index < 0 || index >= vertexCount) throw new Error(`${primitivePath} index out of range`);
        }
        if (primitive.material !== undefined && (!Number.isInteger(primitive.material) || primitive.material < 0 || primitive.material >= materialNames.length)) throw new Error(`Invalid material reference at ${primitivePath}`);
        if (primitive.targets?.length) warn("MORPH_TARGETS_LOST", `${primitivePath}.targets`, "OBJ does not preserve morph targets");
        for (const key of Object.keys(primitive.attributes)) {
          if (key !== "POSITION" && key !== "NORMAL" && key !== "TEXCOORD_0" && key !== "COLOR_0") warn("ATTRIBUTE_LOST", `${primitivePath}.attributes.${key}`, "This vertex attribute has no supported OBJ representation");
        }
        for (const [key, attribute] of [["POSITION", position], ["NORMAL", normal], ["TEXCOORD_0", uv], ["COLOR_0", color]] as const) {
          if (attribute && !Array.isArray(attribute.values) && !(attribute.values instanceof Float32Array)) warn("ATTRIBUTE_REENCODED", `${primitivePath}.attributes.${key}`, "Integer vertex data was converted to decimal values in OBJ");
        }
        if (vertexCount && color) {
          beginVertexColors();
          if (color.itemSize === 4) warn("VERTEX_ALPHA_LOST", `${primitivePath}.attributes.COLOR_0`, "The RGB vertex-color extension does not retain vertex alpha");
        } else if (vertexCount) {
          if (writesVertexColors) warn("VERTEX_COLOR_DEFAULTED", `${primitivePath}.attributes.COLOR_0`, "Missing vertex colors were written as white to share one vertex layout");
          else pendingUncoloredPrimitives.push(primitivePath);
        }
        if (mode !== "triangles" && suppliedNormal) warn("ATTRIBUTE_LOST", `${primitivePath}.NORMAL`, "OBJ line and point records do not reference normals");
        if (mode === "points" && suppliedUv) warn("ATTRIBUTE_LOST", `${primitivePath}.TEXCOORD_0`, "OBJ point records do not reference texture coordinates");
        // OBJ group names are global in many readers, even across `o` records.
        // Keep repeated mesh instances and colliding sanitized names distinct.
        const requestedGroup = `${safeLabel(mesh.name ?? "mesh")}_${primitiveIndex}`;
        const groupName = uniqueLabel(requestedGroup, groupNames);
        if (groupName !== requestedGroup) warn("GROUP_NAME_CHANGED", primitivePath, "OBJ group name was shortened or made unique");
        append(`g ${groupName}`);
        append(`usemtl ${primitive.material === undefined ? "aura_default" : materialNames[primitive.material]}`);
        let warnedColorRange = false;
        for (let index = 0; index < vertexCount; index++) {
          if ((index & 4095) === 0) checkAbort(options.signal);
          const p = transformPosition(world, readAttributeNormalized(position, index));
          let vertexLine = `v ${p.map(format).join(" ")}`;
          if (color) {
            const components = readAttributeNormalized(color, index).slice(0, 3);
            if (!warnedColorRange && components.some((component) => component < 0 || component > 1)) {
              warn("VERTEX_COLOR_RANGE", `${primitivePath}.attributes.COLOR_0`, "Values outside 0..1 are preserved; readers may clamp or reject them");
              warnedColorRange = true;
            }
            vertexLine += ` ${components.map(format).join(" ")}`;
          } else if (writesVertexColors) vertexLine += " 1 1 1";
          else pendingUncoloredVertices.push(lines.length);
          append(vertexLine);
        }
        if (uv) for (let index = 0; index < vertexCount; index++) {
          if ((index & 4095) === 0) checkAbort(options.signal);
          append(`vt ${readAttributeNormalized(uv, index).map(format).join(" ")}`);
        }
        if (normal) for (let index = 0; index < vertexCount; index++) {
          if ((index & 4095) === 0) checkAbort(options.signal);
          const sourceNormal = readAttributeNormalized(normal, index);
          if (!Math.hypot(...sourceNormal)) throw new Error("OBJ normal must not be zero");
          append(`vn ${transformNormal(world, sourceNormal).map(format).join(" ")}`);
        }
        const reflected = determinant3(world) < 0;
        const ref = (index: number): string => {
          const v = vertexOffset + index + 1;
          const t = uv ? uvOffset + index + 1 : undefined;
          const n = normal ? normalOffset + index + 1 : undefined;
          if (mode === "points") return `${v}`;
          if (mode === "lines") return t === undefined ? `${v}` : `${v}/${t}`;
          return n === undefined ? (t === undefined ? `${v}` : `${v}/${t}`) : `${v}/${t ?? ""}/${n}`;
        };
        for (let i = 0; i < indexCount; i += arity) {
          if ((i & 4095) === 0) checkAbort(options.signal);
          const part = Array.from({ length: arity }, (_, offset) => indexAt(i + offset));
          if (reflected && mode === "triangles") [part[1], part[2]] = [part[2], part[1]];
          append(`${mode === "triangles" ? "f" : mode === "lines" ? "l" : "p"} ${part.map(ref).join(" ")}`);
        }
        vertexOffset += vertexCount;
        if (uv) uvOffset += vertexCount;
        if (normal) normalOffset += vertexCount;
      }
    }
  }, options.signal);
  for (const warning of findUnsupportedExportProperties(scene)) warnings.push(warning);
  for (let i = 0; i < scene.nodes.length; i++) if (!reached.has(i)) warn("UNREACHABLE_NODE_LOST", `nodes[${i}]`, "Node is not reachable from any scene root");
  for (let i = 0; i < meshes.length; i++) if (!reachedMeshes.has(i)) warn("UNREACHABLE_MESH_LOST", `meshes[${i}]`, "Mesh is not referenced by a reachable node");
  for (const name of sourceDependencies.keys()) if (!emittedDependencies.has(name)) warn("DEPENDENCY_LOST", `dependencies.${name}`, "Dependency is not referenced by an exported material");
  const mtl = encoder.encode(`${mtlLines.join("\n")}\n`);
  if (dependencyBytes + mtl.byteLength > maxDependencyBytes) throw new Error("OBJ dependencies exceed maxDependencyBytes");
  dependencies.unshift({ name: libraryName, data: mtl });
  checkAbort(options.signal);
  return { data: encoder.encode(`${lines.join("\n")}\n`), mimeType: "model/obj", warnings, dependencies };
}

function checkedLimit(value: number | undefined, fallback: number, label: string): number {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result <= 0) throw new Error(`${label} must be a positive safe integer`);
  return result;
}
function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("OBJ export aborted", "AbortError");
}
function safeRelativePath(name: string): boolean {
  return !!name && name.length <= 1024 && !name.startsWith("/") && !name.startsWith("-") && /^[A-Za-z0-9_./-]+$/.test(name) && name.split("/").every((segment) =>
    segment !== "" && segment !== "." && segment !== ".." && !segment.endsWith(".") && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment)
  );
}
function pathCollides(name: string, used: Set<string>): boolean {
  const target = name.toLowerCase();
  for (const item of used) {
    const existing = item.toLowerCase();
    if (existing === target || existing.startsWith(`${target}/`) || target.startsWith(`${existing}/`)) return true;
  }
  return false;
}
function safeLabel(name: string): string { return name.slice(0, 128).replace(/[^A-Za-z0-9_.-]+/g, "_") || "unnamed"; }
function encodeMetadata(value: Readonly<Record<string, unknown>>): string | undefined {
  try {
    const result = JSON.stringify(value, (_key, entry: unknown) => {
      if (entry === undefined || typeof entry === "function" || typeof entry === "symbol" || typeof entry === "bigint" || (typeof entry === "number" && !Number.isFinite(entry))) throw new Error("Not JSON-compatible");
      return entry;
    });
    return result?.replace(/[\u007f-\uffff]/g, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
  } catch {
    return undefined;
  }
}
function uniqueLabel(name: string, used: Set<string>): string {
  const base = safeLabel(name);
  let label = base;
  let suffix = 2;
  while (used.has(label)) label = `${base}_${suffix++}`;
  used.add(label);
  return label;
}
function assertVector(value: readonly number[], width: number, path: string): void {
  if (value.length !== width || value.some((number) => !Number.isFinite(number))) throw new Error(`${path} must contain ${width} finite numbers`);
}
function checkAttribute(attribute: AuraExportAttribute | undefined, width: number, count: number, path: string): void {
  if (attribute && (attribute.itemSize !== width || attribute.values.length !== count * width)) throw new Error(`${path} must contain one VEC${width} per vertex`);
}
function format(value: number): string {
  if (!Number.isFinite(value)) throw new Error("OBJ output values must be finite");
  return Object.is(value, -0) ? "0" : String(value);
}
function hasTransform(node: AuraExportScene["nodes"][number]): boolean {
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  if (node.matrix) return node.matrix.some((value, index) => value !== identity[index]);
  return Boolean(node.translation?.some((value) => value !== 0) || node.rotation?.some((value, index) => value !== (index === 3 ? 1 : 0)) || node.scale?.some((value) => value !== 1));
}
function determinant3(m: readonly number[]): number {
  // Only the sign is needed. Pivoting avoids multiplying tiny but nonzero
  // pivots together, which can underflow even after scaling the rows.
  const rows = [[m[0], m[4], m[8]], [m[1], m[5], m[9]], [m[2], m[6], m[10]]];
  for (const row of rows) {
    const scale = Math.max(...row.map(Math.abs));
    if (scale === 0) return 0;
    for (let column = 0; column < 3; column++) row[column] /= scale;
  }
  let sign = 1;
  for (let column = 0; column < 3; column++) {
    let pivot = column;
    for (let row = column + 1; row < 3; row++) if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    if (rows[pivot][column] === 0) return 0;
    if (pivot !== column) { [rows[pivot], rows[column]] = [rows[column], rows[pivot]]; sign = -sign; }
    const value = rows[column][column];
    if (value < 0) sign = -sign;
    for (let row = column + 1; row < 3; row++) {
      const factor = rows[row][column] / value;
      for (let next = column + 1; next < 3; next++) rows[row][next] -= factor * rows[column][next];
    }
  }
  return sign;
}
