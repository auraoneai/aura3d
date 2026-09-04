import assert from "node:assert/strict";
import { describe, test } from "vitest";
import * as compatIndex from "../../../packages/three-compat/src/index.js";
import {
  APPROXIMATION_LEDGER,
  ArcballControls,
  assertLedgerCovers,
  getApproximationLedgerRow,
  listApproximationShims,
  MeshLambertMaterialCompat,
  MeshPhongMaterialCompat
} from "../../../packages/three-compat/src/index.js";
import {
  CubeTextureLoaderCompat,
  EXRLoaderCompat,
  GLTFLoaderCompat,
  HDRLoaderCompat,
  KTX2LoaderCompat,
  MTLLoaderCompat,
  OBJLoaderCompat,
  ThreeCompatTextureLoader
} from "../../../packages/three-compat/src/index.js";

/**
 * P1 zero-silent-approximation scan: every exported `*Compat` class plus the
 * `Picking`/`SelectionManager` interaction utilities must resolve to a ledger
 * row. A new shim shipped without a row fails this test closed.
 */
function exportedShimNames(): string[] {
  // `*Controls` shims carry no `Compat` suffix but are migration surface all the same.
  const names = Object.keys(compatIndex).filter((name) => name.endsWith("Compat") || name.endsWith("Controls"));
  for (const extra of ["Picking", "SelectionManager"]) {
    if (extra in compatIndex && !names.includes(extra)) names.push(extra);
  }
  return names.sort();
}

describe("P1 approximation ledger", () => {
  test("zero silent approximation: every exported shim names its gap", () => {
    const shims = exportedShimNames();
    assert.ok(shims.length >= 70, `expected the full compat surface, got ${shims.length}`);
    const uncovered = assertLedgerCovers(shims);
    assert.deepEqual(uncovered, []);
    // The ledger must not claim coverage for shims that do not exist.
    for (const listed of listApproximationShims()) {
      assert.ok(
        (compatIndex as Record<string, unknown>)[listed] !== undefined,
        `ledger lists a shim with no export: ${listed}`
      );
    }
  });

  test("every row carries behavior, delta, and upgrade path", () => {
    assert.ok(APPROXIMATION_LEDGER.length > 0);
    for (const row of APPROXIMATION_LEDGER) {
      assert.ok(row.behavior.length > 0, row.shim);
      assert.ok(row.deltaVsR185.length > 0, row.shim);
      assert.ok(row.upgradePath.length > 0, row.shim);
      assert.ok(["faithful", "approximation", "diagnostic-only"].includes(row.fidelity), row.shim);
    }
  });

  test("Lambert/Phong rows match the literal approximation markers", () => {
    const lambert = new MeshLambertMaterialCompat();
    const phong = new MeshPhongMaterialCompat();
    assert.match(lambert.approximation, /diffuse lighting approximation/);
    assert.match(phong.approximation, /specular lighting approximation/);
    assert.equal(getApproximationLedgerRow("MeshLambertMaterialCompat")?.fidelity, "approximation");
    assert.equal(getApproximationLedgerRow("MeshPhongMaterialCompat")?.fidelity, "approximation");
  });

  test("Arcball compat alias renders and disposes through the N2 implementation", () => {
    const camera = { position: { x: 0, y: 0, z: 5 } };
    const controls = new ArcballControls(camera, { minDistance: 1, maxDistance: 10 });
    controls.rotate(Math.PI / 8, 0);
    controls.update(1 / 60);
    assert.ok(Number.isFinite(camera.position.x));
    controls.dispose();
    controls.dispose();
  });

  test("loaders stay diagnostic-first in migration reports", () => {
    const row = getApproximationLedgerRow("GLTFLoaderCompat");
    assert.equal(row?.fidelity, "diagnostic-only");
    assert.match(row?.behavior ?? "", /decoderNeeds|diagnostic/);
  });

  test("loader diagnostics never silently drop decoderNeeds/unsupportedExtensions/memoryEstimateBytes", () => {
    const gltf = new GLTFLoaderCompat().load("scene.glb");
    assert.deepEqual(gltf.diagnostic.decoderNeeds, [
      "draco-if-extension-present",
      "meshopt-if-extension-present",
      "ktx2-if-extension-present"
    ]);
    const diagnostics = [
      gltf.diagnostic,
      new OBJLoaderCompat().load("mesh.obj").diagnostic,
      new MTLLoaderCompat().load("mesh.mtl").diagnostic,
      new HDRLoaderCompat().load("studio.hdr"),
      new EXRLoaderCompat().load("studio.exr"),
      new KTX2LoaderCompat().load("albedo.ktx2"),
      new ThreeCompatTextureLoader().load("albedo.png"),
      ...new CubeTextureLoaderCompat().load(["px.png", "nx.png", "py.png", "ny.png", "pz.png", "nz.png"])
    ];
    for (const diagnostic of diagnostics) {
      assert.ok(Array.isArray(diagnostic.decoderNeeds), diagnostic.loader);
      assert.ok(Array.isArray(diagnostic.unsupportedExtensions), diagnostic.loader);
      assert.ok(
        Number.isFinite(diagnostic.memoryEstimateBytes) && diagnostic.memoryEstimateBytes > 0,
        diagnostic.loader
      );
    }
    const exr = new EXRLoaderCompat().load("studio.exr");
    assert.equal(exr.status, "diagnostic-only");
    assert.ok(exr.warnings.length > 0);
    const ktx2 = new KTX2LoaderCompat().load("albedo.ktx2");
    assert.ok(ktx2.decoderNeeds.includes("basis-universal-transcoder"));
  });

  test("geometry row discloses the UV2/morph errata: no generated attributes", () => {
    const row = getApproximationLedgerRow("BoxGeometryCompat");
    assert.equal(row?.fidelity, "approximation");
    assert.match(row?.behavior ?? "", /no UV2|UV2/);
    assert.match(row?.behavior ?? "", /morph/i);
  });
});
