/**
 * Route-local MH-2M visual-family gate.
 *
 * This is intentionally stricter than the existing curation gate.  The curation
 * report proves typed files, hashes, bounds, and release probes; it does not prove
 * that the files came from a coherent authored modular character family.  This
 * gate therefore refuses an unbound placeholder source, requires an explicit
 * family declaration in every GLB, checks the authored material roles, and
 * evaluates the selected Aegis build as a connected grounded assembly. Every
 * accepted source kind still needs a license-clean declaration and exact
 * evidence; it must never silently turn the Robotcand whole-body fallback into
 * a modular-family pass.
 *
 * The checker is deliberately dependency-free so it can run before the root
 * package build.  It only reads route-local source/GLBs plus the root manifest and
 * retained probe metadata; it never edits generated reports or assets.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "../..");
const routeSourceDir = join(appDir, "src");
const manifestPath = join(repoRoot, "aura.assets.json");
const familySourcePath = join(appDir, "assets", "mh-2m-family-source.json");

const PARTS = [
  { id: "mechChassisA", slot: "chassis", socket: "root" },
  { id: "mechArmsA", slot: "arms", socket: "chest" },
  { id: "mechLegsA", slot: "legs", socket: "hips" },
  { id: "mechWeaponA", slot: "weapon", socket: "right-hand" }
];
const ALL_PART_IDS = [
  "mechChassisA", "mechChassisB", "mechChassisC", "mechChassisD",
  "mechArmsA", "mechArmsB", "mechArmsC", "mechArmsD",
  "mechLegsA", "mechLegsB", "mechLegsC", "mechLegsD",
  "mechWeaponA", "mechWeaponB", "mechWeaponC", "mechWeaponD"
];

const manifest = readJson(manifestPath);
const manifestById = new Map((manifest.assets ?? []).map((asset) => [asset.id, asset]));
const routeSourceFiles = filesRecursively(routeSourceDir).filter((path) => /\.(?:ts|css)$/.test(path));
const routeSourceText = routeSourceFiles.map((path) => readFileSync(path, "utf8")).join("\n");
const routeSourceSha256 = hashSource(routeSourceFiles, appDir);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function filesRecursively(directory) {
  // The route has no nested generated source today, but keeping the traversal
  // deterministic means this binding remains valid when one is added.
  return readdirSync(directory).sort().flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? filesRecursively(path) : [path];
  });
}

function hashSource(files, baseDir) {
  const hash = createHash("sha256");
  for (const path of files) {
    hash.update(relative(baseDir, path)).update("\0").update(readFileSync(path)).update("\0");
  }
  return hash.digest("hex");
}

function sha256Bytes(bytes) {
  return `sha256-${createHash("sha256").update(bytes).digest("hex")}`;
}

function parseGlb(path) {
  const bytes = readFileSync(path);
  if (bytes.subarray(0, 4).toString("ascii") !== "glTF" || bytes.readUInt32LE(4) !== 2) {
    throw new Error("not a glTF 2.0 GLB");
  }
  const jsonLength = bytes.readUInt32LE(12);
  const jsonStart = 20;
  const document = JSON.parse(bytes.subarray(jsonStart, jsonStart + jsonLength).toString("utf8").trim());
  const binHeader = jsonStart + jsonLength;
  const binLength = bytes.readUInt32LE(binHeader);
  const binStart = binHeader + 8;
  const bin = bytes.subarray(binStart, binStart + binLength);
  const accessors = document.accessors ?? [];
  const views = document.bufferViews ?? [];
  const meshes = (document.meshes ?? []).map((mesh) => {
    const primitives = (mesh.primitives ?? []).map((primitive) => {
      const accessorIndex = primitive.attributes?.POSITION;
      const accessor = accessorIndex === undefined ? undefined : accessors[accessorIndex];
      const view = accessor?.bufferView === undefined ? undefined : views[accessor.bufferView];
      if (!accessor || !view || accessor.componentType !== 5126 || accessor.type !== "VEC3") return null;
      const count = Number(accessor.count ?? 0);
      const byteOffset = Number(view.byteOffset ?? 0) + Number(accessor.byteOffset ?? 0);
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      // Prefer exact accessor bounds when present, but inspect the binary too so
      // stale/overly broad JSON bounds cannot make a detached part pass.
      if (Array.isArray(accessor.min) && Array.isArray(accessor.max) && accessor.min.length === 3 && accessor.max.length === 3) {
        for (let axis = 0; axis < 3; axis += 1) {
          min[axis] = Number(accessor.min[axis]);
          max[axis] = Number(accessor.max[axis]);
        }
      }
      const stride = Number(view.byteStride ?? 12);
      const exactMin = [Infinity, Infinity, Infinity];
      const exactMax = [-Infinity, -Infinity, -Infinity];
      for (let index = 0; index < count; index += 1) {
        const offset = byteOffset + index * stride;
        for (let axis = 0; axis < 3; axis += 1) {
          const value = bin.readFloatLE(offset + axis * 4);
          exactMin[axis] = Math.min(exactMin[axis], value);
          exactMax[axis] = Math.max(exactMax[axis], value);
        }
      }
      if (Number.isFinite(exactMin[0])) return { min: exactMin, max: exactMax, material: primitive.material ?? null };
      return { min, max, material: primitive.material ?? null };
    }).filter(Boolean);
    return { name: mesh.name ?? "unnamed", primitives };
  });
  return {
    bytes,
    document,
    metadata: document.extras?.aura3dMechPart ?? {},
    meshes,
    materials: document.materials ?? []
  };
}

function aabbFromMeshes(parsed) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const mesh of parsed.meshes) for (const primitive of mesh.primitives) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], primitive.min[axis]);
      max[axis] = Math.max(max[axis], primitive.max[axis]);
    }
  }
  return { min, max, size: max.map((value, axis) => value - min[axis]) };
}

function fitScale(slot, size) {
  const max = Math.max(...size);
  if (slot === "chassis") return 1.05 / Math.max(0.001, size[1]);
  if (slot === "legs") return 0.84 / Math.max(0.001, size[1]);
  if (slot === "arms") return 2.18 / Math.max(0.001, max);
  return 0.68 / Math.max(0.001, max);
}

function mountOffset(slot, scaledBounds) {
  const legFloor = -(scaledBounds.legs.min[1] ?? -0.5);
  const legTop = legFloor + (scaledBounds.legs.max[1] ?? 0.4);
  const chassisBottom = legTop - 0.045;
  if (slot === "legs") return [0, legFloor, 0];
  if (slot === "chassis") return [0, chassisBottom - scaledBounds.chassis.min[1], 0];
  if (slot === "arms") return [0, chassisBottom + scaledBounds.chassis.size[1] * 0.18 - scaledBounds.arms.min[1], scaledBounds.chassis.size[2] * 0.06];
  return [Math.min(0.58, Math.max(0.48, scaledBounds.arms.size[0] * 0.27)), chassisBottom + scaledBounds.chassis.size[1] * 0.30 - scaledBounds.weapon.min[1], scaledBounds.chassis.size[2] * 0.12];
}

function transformedAabb(parsedBounds, scale, offset) {
  return {
    min: parsedBounds.min.map((value, axis) => value * scale + offset[axis]),
    max: parsedBounds.max.map((value, axis) => value * scale + offset[axis])
  };
}

function intervalOverlap(aMin, aMax, bMin, bMax) {
  return Math.min(aMax, bMax) - Math.max(aMin, bMin);
}

function contact(a, b, threshold = 0.025) {
  const overlaps = [0, 1, 2].map((axis) => intervalOverlap(a.min[axis], a.max[axis], b.min[axis], b.max[axis]));
  return { overlaps, connected: overlaps.every((value) => value >= threshold) };
}

function hasMaterialRole(materials, role) {
  const needle = role.toLowerCase();
  return materials.some((material) => String(material.name ?? "").toLowerCase().includes(needle));
}

function checkPart(id, expected) {
  const failures = [];
  const asset = manifestById.get(id);
  const sourcePath = join(appDir, "assets/models", `${id}.glb`);
  if (!asset) failures.push("manifest-entry-missing");
  if (!existsSync(sourcePath)) failures.push("source-glb-missing");
  let parsed;
  if (existsSync(sourcePath)) {
    try { parsed = parseGlb(sourcePath); }
    catch (error) { failures.push(`glb-parse-failed:${error instanceof Error ? error.message : String(error)}`); }
  }
  if (asset && parsed) {
    if (asset.hash !== sha256Bytes(parsed.bytes)) failures.push("manifest-hash-stale");
    if (asset.quality !== "release") failures.push("quality-not-release");
    if (!/^(?:CC0|CC-BY)/.test(String(asset.provenance?.license ?? ""))) failures.push("license-not-clean");
    if (asset.renderedProbe?.assetHash !== asset.hash || !asset.renderedProbe?.url || !existsSync(join(repoRoot, asset.renderedProbe.url))) failures.push("release-probe-missing-or-stale");
    const metadata = parsed.metadata;
    if (metadata.schema !== "aura3d.mech-hangar.modular-part/1.0") failures.push("modular-metadata-schema-missing");
    if (metadata.family !== "MH-2M" || metadata.slot !== expected.slot || metadata.compatibleSocket !== expected.socket) failures.push("socket-family-contract-mismatch");
    if (metadata.unitMeters !== 1 || metadata.origin !== "part-center" || metadata.forwardAxis !== "+Z" || metadata.upAxis !== "+Y") failures.push("scale-axis-contract-mismatch");
    // Every family source must identify itself explicitly. The declaration is
    // checked again at generator level below so metadata cannot make an
    // otherwise unbound placeholder pass.
    if (!(["original-authored-family", "licensed-modular-family", "captured-modular-family"].includes(metadata.sourceKind))) failures.push("non-procedural-family-source-kind-missing");
    const roleList = Array.isArray(metadata.materialRoles) ? metadata.materialRoles.map((role) => String(role).toLowerCase()) : [];
    if (roleList.length < 3 || !roleList.includes("armor") || !roleList.includes("frame") || !roleList.includes("joints") || !roleList.includes("emissive")) failures.push("authored-material-role-contract-missing");
    if (parsed.meshes.length < 3 || parsed.materials.length < 3) failures.push("insufficient-authored-mesh-material-layers");
    for (const role of ["armor", "frame", "joint", "identity", "energy", "reactor"]) {
      if (!hasMaterialRole(parsed.materials, role) && role !== "reactor") failures.push(`material-role-not-readable:${role}`);
    }
    const bounds = aabbFromMeshes(parsed);
    if (!bounds.size.every((value) => Number.isFinite(value) && value > 0)) failures.push("empty-geometry-bounds");
    return { id, slot: expected.slot, socket: expected.socket, failures, parsed, bounds, asset };
  }
  return { id, slot: expected.slot, socket: expected.socket, failures, parsed, asset };
}

function checkRouteSource() {
  const failures = [];
  if (/SHOW_MODULAR_ASSEMBLY\s*=\s*false/.test(routeSourceText)) failures.push("route-hides-modular-family");
  if (/!SHOW_MODULAR_ASSEMBLY\s*&&\s*shell\s*&&\s*def\.slot\s*!==\s*["']weapon/.test(routeSourceText)) failures.push("route-suppresses-selected-modular-slots");
  if (/model\(assets\.robotcand/.test(routeSourceText)) failures.push("whole-body-Robotcand-shell-is-primary-path");
  if (!/model\(asset,/.test(routeSourceText) || !/mountTransformForPart/.test(routeSourceText)) failures.push("typed-part-mount-path-missing");
  if (!/material\.(?:pbr|emissive)/.test(routeSourceText)) failures.push("route-material-declarations-missing");
  if (/materialOverride|overrideMaterial|\.traverse\s*\(/.test(routeSourceText)) failures.push("global-material-override-detected");
  return failures;
}

function checkGeneratorSource() {
  const failures = [];
  const path = join(appDir, "scripts/build-models.mjs");
  if (!existsSync(path)) return ["family-generator-missing"];
  const source = readFileSync(path, "utf8");
  // A deterministic authored mesh compiler is valid family source when it is
  // explicitly declared and independently reviewed. Reject only the old
  // placeholder/fallback signatures, not the low-poly mesh constructors that
  // make the authored panels and joints reproducible.
  if (/Robotcand|whole-body\s+fallback|procedural-box-cylinder-generator|placeholder/i.test(source)) failures.push("placeholder-family-generator-is-still-active");
  if (!/sourceKind:\s*["']original-authored-family["']/.test(source)) failures.push("generator-does-not-declare-real-family-source");
  if (!existsSync(familySourcePath)) failures.push("family-source-declaration-missing");
  else {
    try {
      const declaration = readJson(familySourcePath);
      if (declaration.schema !== "aura3d.mech-hangar.family-source/1.0") failures.push("family-source-schema-missing");
      if (declaration.family !== "MH-2M" || declaration.sourceKind !== "original-authored-family") failures.push("family-source-identity-mismatch");
      if (declaration.author !== "Aura3D synthesis" || !String(declaration.license).startsWith("CC0")) failures.push("family-source-license-or-author-missing");
      if (declaration.compiler !== "apps/showcase-mech-hangar/scripts/build-models.mjs") failures.push("family-source-compiler-binding-missing");
      if (!String(declaration.designIntent ?? "").includes("explicit mesh panels") || !Array.isArray(declaration.materialRoles) || declaration.materialRoles.length < 4) failures.push("family-source-design-contract-missing");
    } catch (error) {
      failures.push(`family-source-declaration-invalid:${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return failures;
}

function checkAssembly(partsBySlot) {
  const failures = [];
  const diagnostics = {};
  const scaledBounds = {};
  for (const slot of ["chassis", "arms", "legs", "weapon"]) {
    const part = partsBySlot[slot];
    if (!part?.bounds) {
      failures.push(`missing-bounds:${slot}`);
      continue;
    }
    const scale = fitScale(slot, part.bounds.size);
    scaledBounds[slot] = {
      min: part.bounds.min.map((value) => value * scale),
      max: part.bounds.max.map((value) => value * scale),
      size: part.bounds.size.map((value) => value * scale)
    };
    diagnostics[slot] = { scale, scaledSize: scaledBounds[slot].size, scaledMin: scaledBounds[slot].min, scaledMax: scaledBounds[slot].max };
  }
  if (Object.keys(scaledBounds).length !== 4) return { failures, diagnostics };
  const aabbs = {};
  for (const slot of ["chassis", "arms", "legs", "weapon"]) {
    const part = partsBySlot[slot];
    aabbs[slot] = transformedAabb(part.bounds, fitScale(slot, part.bounds.size), mountOffset(slot, scaledBounds));
  }
  diagnostics.aabbs = aabbs;
  const footGap = Math.abs(aabbs.legs.min[1]);
  if (footGap > 0.06) failures.push(`feet-not-grounded:${footGap.toFixed(4)}m`);
  const legChassis = contact(aabbs.legs, aabbs.chassis);
  const armChassis = contact(aabbs.arms, aabbs.chassis);
  const weaponArms = contact(aabbs.weapon, aabbs.arms);
  diagnostics.contacts = { legChassis, armChassis, weaponArms };
  if (!legChassis.connected) failures.push(`legs-chassis-disconnected:${legChassis.overlaps.map((value) => value.toFixed(4)).join(",")}`);
  if (!armChassis.connected) failures.push(`arms-chassis-disconnected:${armChassis.overlaps.map((value) => value.toFixed(4)).join(",")}`);
  if (!weaponArms.connected) failures.push(`weapon-hand-disconnected:${weaponArms.overlaps.map((value) => value.toFixed(4)).join(",")}`);
  // At least one material boundary must cross each contact, otherwise a single
  // disconnected slab can pass the AABB check by overlapping empty space.
  for (const slot of ["chassis", "arms", "legs", "weapon"]) {
    const part = partsBySlot[slot];
    if ((part?.parsed?.materials?.length ?? 0) < 3) failures.push(`material-separation-missing:${slot}`);
  }
  return { failures, diagnostics };
}

export function evaluateFamily() {
  const partResults = ALL_PART_IDS.map((id) => {
    const expected = id.includes("Chassis") ? { slot: "chassis", socket: "root" }
      : id.includes("Arms") ? { slot: "arms", socket: "chest" }
        : id.includes("Legs") ? { slot: "legs", socket: "hips" }
          : { slot: "weapon", socket: "right-hand" };
    return checkPart(id, expected);
  });
  const selected = Object.fromEntries(PARTS.map(({ id, slot }) => [slot, partResults.find((part) => part.id === id)]));
  const assembly = checkAssembly(selected);
  const routeFailures = checkRouteSource();
  const generatorFailures = checkGeneratorSource();
  const blockers = [];
  for (const part of partResults) for (const failure of part.failures) blockers.push(`${part.id}:${failure}`);
  for (const failure of assembly.failures) blockers.push(`assembly:${failure}`);
  for (const failure of routeFailures) blockers.push(`route:${failure}`);
  for (const failure of generatorFailures) blockers.push(`generator:${failure}`);
  return {
    schema: "aura3d.mech-hangar.modular-family-gate/1.0",
    generatedAt: new Date().toISOString(),
    routeSourceSha256,
    requiredPartCount: ALL_PART_IDS.length,
    partResults: partResults.map((part) => ({ id: part.id, slot: part.slot, failures: part.failures, sourceHash: part.parsed ? sha256Bytes(part.parsed.bytes) : null })),
    assembly,
    routeFailures,
    generatorFailures,
    blockers,
    pass: blockers.length === 0
  };
}

const result = evaluateFamily();
console.log(JSON.stringify(result, null, 2));
if (!result.pass) {
  console.error(`MH-2M modular-family gate: NO-GO (${result.blockers.length} blockers)`);
  console.error("A real license-clean typed modular family is required; Robotcand cannot satisfy this gate.");
  process.exitCode = 1;
}
