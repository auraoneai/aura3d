import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  auditPrimitiveSubmission,
  formatPrimitiveSubmissionAudit
} from "../../../packages/rendering/src/PrimitiveSubmissionAudit";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { IndexBuffer } from "../../../packages/rendering/src/IndexBuffer";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { Material } from "../../../packages/rendering/src/Material";
import { MaterialInstance } from "../../../packages/rendering/src/MaterialInstance";
import { GLTFLoader } from "../../../packages/assets/src/GLTFLoader";
import type { RenderItem } from "../../../packages/rendering/src/ForwardPass";

/**
 * Per-primitive submission diagnostics.
 *
 * ## Why an aggregate count was insufficient
 *
 * `drawCalls: 10` for a 5-primitive asset is what finally disproved the "renderer drops secondary glTF
 * primitives" diagnosis -- but reaching that conclusion required reading a probe JSON and knowing the pipeline
 * runs two passes. A count cannot say *which* primitive is missing, whether a transform is degenerate, or whether
 * an index range overflows. Each of those was hypothesised by hand during the false diagnosis; these tests turn
 * them into measurements.
 *
 * The failure modes below are the ones that produce a missing part with **no GL error at all**, which is precisely
 * why they were hard to find the first time.
 */

/** A minimal triangle with an explicit material, standing in for one submitted primitive. */
function triangleItem(label: string, overrides: Partial<RenderItem> = {}): RenderItem {
  const vertices = new VertexBuffer(VertexFormat.P3, 3);
  vertices.setAttribute(0, "position", [-0.5, -0.5, 0]);
  vertices.setAttribute(1, "position", [0.5, -0.5, 0]);
  vertices.setAttribute(2, "position", [0, 0.5, 0]);
  return {
    label,
    geometry: new Geometry(vertices, new IndexBuffer([0, 1, 2], 3)),
    material: new Material({ name: `${label}-material`, shaderKey: "audit-test" }),
    ...overrides
  };
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;

async function fixtureRenderItems(): Promise<readonly RenderItem[]> {
  const base64 = readFileSync("tests/fixtures/gltf-multipart/body-and-four-wheels.glb").toString("base64");
  const asset = await new GLTFLoader().load(
    { url: `data:model/gltf-binary;base64,${base64}` },
    { throwIfAborted: () => undefined } as never
  );
  const scene = asset.createScene();
  scene.updateWorldTransforms();
  return scene.collectRenderables().map(({ node, renderable }) => {
    const mesh = asset.meshes.find((entry) => entry.name === renderable.geometry);
    if (!mesh) throw new Error(`no mesh for ${renderable.geometry}`);
    /*
     * A glTF mesh's `geometry` field is a metadata summary (`vertexCount`/`indexCount`/`bounds`), not a
     * rendering `Geometry`. Build a real one from the parsed vertex data so the audit measures the same
     * structures the forward pass consumes rather than a descriptor that merely looks similar.
     */
    const vertices = new VertexBuffer(VertexFormat.P3, mesh.positions.length);
    mesh.positions.forEach((position, index) => {
      vertices.setAttribute(index, "position", [position[0] ?? 0, position[1] ?? 0, position[2] ?? 0]);
    });
    const indices = Array.from(mesh.indices ?? []);
    return {
      label: node.name,
      geometry: new Geometry(vertices, indices.length > 0 ? new IndexBuffer(indices, mesh.positions.length) : null),
      material: new Material({ name: renderable.material, shaderKey: "audit-test" }),
      modelMatrix: Array.from(node.transform.worldMatrix)
    } satisfies RenderItem;
  });
}


describe("a coherent primitive set audits clean", () => {
  it("counts every submitted primitive and reports no blockers", () => {
    const audit = auditPrimitiveSubmission([triangleItem("body"), triangleItem("wheel")]);
    expect(audit.records).toHaveLength(2);
    expect(audit.submittable).toBe(2);
    expect(audit.blocked).toBe(0);
    expect(audit.blockedLabels).toEqual([]);
  });

  it("makes the pass multiplier explicit instead of leaving it to be inferred", () => {
    /*
     * Reading `drawCalls: 10` and knowing it meant "5 primitives x 2 passes" required prior pipeline knowledge.
     * Encoding the multiplier is what turns that number into evidence a reader can check.
     */
    const audit = auditPrimitiveSubmission(Array.from({ length: 5 }, (_unused, index) => triangleItem(`part-${index}`)));
    expect(audit.expectedDrawCalls(1)).toBe(5);
    expect(audit.expectedDrawCalls(2)).toBe(10);
    // Blocked primitives are excluded, since they never reach the GPU.
    const withBlocked = auditPrimitiveSubmission([
      triangleItem("ok"),
      triangleItem("broken", { modelMatrix: [...IDENTITY.slice(0, 15), Number.NaN] })
    ]);
    expect(withBlocked.expectedDrawCalls(2)).toBe(2);
  });

  it("synthesises a label when none is supplied, so no primitive is anonymous", () => {
    const anonymous = triangleItem("x");
    const audit = auditPrimitiveSubmission([{ ...anonymous, label: undefined }]);
    expect(audit.records[0]?.label).toBe("primitive-0");
  });

  it("resolves name and blend state through a MaterialInstance wrapper", () => {
    // Only `Material` carries `name`/`renderState`; an instance wraps a base. Reporting `<none>` for an instanced
    // material would make batching and transparency diagnostics wrong for exactly the assets that use them.
    const base = new Material({ name: "wrapped", shaderKey: "audit-test", renderState: { blend: true, depthWrite: false } });
    const audit = auditPrimitiveSubmission([triangleItem("inst", { material: new MaterialInstance(base) })]);
    expect(audit.records[0]?.materialName).toBe("wrapped");
    expect(audit.records[0]?.blended).toBe(true);
  });

  it("counts distinct materials, which bounds achievable batching", () => {
    const shared = new Material({ name: "shared", shaderKey: "audit-test" });
    const audit = auditPrimitiveSubmission([
      triangleItem("a", { material: shared }),
      triangleItem("b", { material: shared }),
      triangleItem("c")
    ]);
    expect(audit.distinctMaterials).toBe(2);
  });
});

describe("failure modes that produce a missing part with no GL error", () => {
  it("flags a non-finite transform", () => {
    // A NaN in a model matrix removes the primitive silently: no GL error, no warning, nothing drawn.
    const audit = auditPrimitiveSubmission([
      triangleItem("nan", { modelMatrix: [...IDENTITY.slice(0, 15), Number.NaN] })
    ]);
    expect(audit.records[0]?.blockers).toContain("non-finite-transform");
    expect(audit.blockedLabels).toEqual(["nan"]);
  });

  it("flags a transform that collapses the primitive to zero volume", () => {
    /*
     * A zero-scale matrix is how a route hides a node (Aura Clash and Turbo both scale subjects to 0.0001 for
     * suppressed-subject captures). Legitimate there, catastrophic if unintended -- and indistinguishable from
     * "the renderer dropped it" without this check.
     */
    const zeroScale = [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const audit = auditPrimitiveSubmission([triangleItem("flat", { modelMatrix: zeroScale })]);
    expect(audit.records[0]?.blockers).toContain("degenerate-transform");
    expect(audit.records[0]?.transformScale).toBe(0);
  });

  it("flags an index range that reaches beyond the available indices", () => {
    // Truncates or reads adjacent memory rather than failing loudly.
    const audit = auditPrimitiveSubmission([
      triangleItem("overflow", { drawRange: { start: 2, count: 6 } })
    ]);
    expect(audit.records[0]?.blockers).toContain("index-range-overflow");
  });

  it("flags an index value that exceeds the vertex count", () => {
    const vertices = new VertexBuffer(VertexFormat.P3, 3);
    vertices.setAttribute(0, "position", [0, 0, 0]);
    vertices.setAttribute(1, "position", [1, 0, 0]);
    vertices.setAttribute(2, "position", [0, 1, 0]);
    // `IndexBuffer` accepts this without a declared vertexCount; the audit is what catches it.
    const audit = auditPrimitiveSubmission([{
      label: "oob",
      geometry: new Geometry(vertices, new IndexBuffer([0, 1, 9])),
      material: new Material({ name: "m", shaderKey: "audit-test" })
    }]);
    expect(audit.records[0]?.blockers).toContain("index-out-of-vertex-range");
  });

  it("flags a missing material, which leaves the pass with no shader", () => {
    const item = triangleItem("no-mat");
    const audit = auditPrimitiveSubmission([{ ...item, material: undefined }]);
    expect(audit.records[0]?.blockers).toContain("missing-material");
  });

  it("surfaces real GL errors when a caller supplies them, and invents none otherwise", () => {
    /*
     * The audit never calls `gl.getError()` itself: that requires a device, and `WebGL2Device`'s `strict` mode
     * already owns it (profiling attributed ~93% of Aura Clash frame time to `getError`, so it is opt-in). A
     * caller passes real results in; absent that, the field stays undefined rather than implying a clean device.
     */
    const withError = auditPrimitiveSubmission([triangleItem("wheel")], {
      glErrorsByLabel: { wheel: "INVALID_OPERATION" }
    });
    expect(withError.records[0]?.glError).toBe("INVALID_OPERATION");
    const withoutError = auditPrimitiveSubmission([triangleItem("wheel")]);
    expect(withoutError.records[0]?.glError).toBeUndefined();
  });

  it("reports several blockers on one primitive rather than stopping at the first", () => {
    const vertices = new VertexBuffer(VertexFormat.P3, 3);
    vertices.setAttribute(0, "position", [0, 0, 0]);
    vertices.setAttribute(1, "position", [1, 0, 0]);
    vertices.setAttribute(2, "position", [0, 1, 0]);
    const audit = auditPrimitiveSubmission([{
      label: "multi",
      geometry: new Geometry(vertices, new IndexBuffer([0, 1, 9])),
      modelMatrix: [...IDENTITY.slice(0, 15), Number.NaN]
    }]);
    const blockers = audit.records[0]?.blockers ?? [];
    expect(blockers).toContain("missing-material");
    expect(blockers).toContain("index-out-of-vertex-range");
    expect(blockers).toContain("non-finite-transform");
  });
});

describe("the real multi-part fixture accounts for all five primitives", () => {
  /**
   * End-to-end tie-back: the fixture built to reproduce the suspected renderer defect, audited through the
   * submission path. Every part must be individually accounted for by label -- which is what the original
   * investigation could not do, and why it reached the wrong conclusion.
   */
  const FIXTURE = "tests/fixtures/gltf-multipart/body-and-four-wheels.glb";


  it("audits five submittable primitives with zero blockers", async () => {
    const audit = auditPrimitiveSubmission(await fixtureRenderItems());
    expect(audit.records).toHaveLength(5);
    expect(audit.blocked).toBe(0);
    expect(audit.submittable).toBe(5);
    // Ten draw calls across two passes -- the exact number that disproved the false diagnosis.
    expect(audit.expectedDrawCalls(2)).toBe(10);
  });

  it("accounts for the body and all four wheels by label", async () => {
    const audit = auditPrimitiveSubmission(await fixtureRenderItems());
    const labels = audit.records.map((record) => record.label);
    for (const part of ["body", "wheelFrontL", "wheelFrontR", "wheelBackL", "wheelBackR"]) {
      expect(labels.some((label) => label.includes(part)), `${part} must be accounted for`).toBe(true);
    }
  });

  it("names the missing part when one is dropped", async () => {
    /*
     * The question the original investigation needed answered and could not: if a primitive goes missing, which
     * one? Removing a wheel must produce a report that names it rather than a count that shrinks.
     */
    const items = await fixtureRenderItems();
    const withoutWheel = items.filter((item) => !item.label?.includes("wheelFrontL"));
    const audit = auditPrimitiveSubmission(withoutWheel);
    expect(audit.records).toHaveLength(4);
    expect(audit.records.map((record) => record.label).some((label) => label.includes("wheelFrontL"))).toBe(false);
    expect(audit.expectedDrawCalls(2)).toBe(8);
  });

  it("detects a suppressed wheel that would otherwise look like a renderer defect", async () => {
    // Scaling a part to zero is exactly what "the renderer dropped my wheel" looks like from a screenshot.
    const items = await fixtureRenderItems();
    const suppressed = items.map((item) => item.label?.includes("wheelBackR")
      ? { ...item, modelMatrix: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1] }
      : item);
    const audit = auditPrimitiveSubmission(suppressed);
    expect(audit.blocked).toBe(1);
    expect(audit.blockedLabels[0]).toContain("wheelBackR");
    expect(audit.records.find((record) => record.label.includes("wheelBackR"))?.blockers)
      .toContain("degenerate-transform");
  });

  it("formats a report that names each primitive and its blockers", async () => {
    const items = await fixtureRenderItems();
    const text = formatPrimitiveSubmissionAudit(auditPrimitiveSubmission(items)).join("\n");
    expect(text).toContain("primitives=5 submittable=5 blocked=0");
    expect(text).toContain("wheelFrontL");
  });
});

describe("per-primitive frustum verdict disambiguates culled from broken", () => {
  /**
   * The ambiguity this closes: in the live per-draw GL proof, a primitive reporting `writtenPixels: 0` with a null
   * pixel bounding box could equally be culled before submission, submitted but drawn off-screen, or genuinely
   * broken. Those demand different responses -- expected behaviour, a camera-framing bug, and a renderer bug --
   * and conflating them is how "the renderer drops wheel primitives" became a plausible diagnosis.
   *
   * The renderer already counts `culledObjects` in aggregate; a count cannot name which primitive was culled.
   */

  /** Orthographic-ish clip matrix covering roughly [-2, 2] on x/y and [-10, 10] on z. */
  function clipMatrix(): readonly number[] {
    return [
      0.5, 0, 0, 0,
      0, 0.5, 0, 0,
      0, 0, 0.1, 0,
      0, 0, 0, 1
    ];
  }

  function at(label: string, x: number): RenderItem {
    return triangleItem(label, {
      modelMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, 0, 1]
    });
  }

  it("reports no-camera when no view-projection matrix is supplied", () => {
    // The question was not asked, so it must not be answered. Defaulting to `inside` would fabricate a test.
    const audit = auditPrimitiveSubmission([triangleItem("a")]);
    expect(audit.records[0]?.frustum).toBe("no-camera");
    expect(audit.records[0]?.worldBounds).toBeUndefined();
    expect(audit.culled).toBe(0);
  });

  it("classifies an on-screen primitive as inside and an off-screen one as culled", () => {
    const audit = auditPrimitiveSubmission(
      [at("centre", 0), at("far-right", 40)],
      { viewProjectionMatrix: clipMatrix() }
    );
    expect(audit.records[0]?.frustum).toBe("inside");
    expect(audit.records[1]?.frustum).toBe("culled");
    expect(audit.culled).toBe(1);
    // The load-bearing part: the culled primitive is named, not just counted.
    expect(audit.culledLabels).toEqual(["far-right"]);
  });

  it("returns the world bounds the test used, so an unexpected verdict is diagnosable", () => {
    /*
     * A wrong model matrix and a wrong camera produce the same "culled" verdict but need different fixes. Reporting
     * where the renderer thought the primitive was is what tells them apart.
     */
    const audit = auditPrimitiveSubmission([at("shifted", 10)], { viewProjectionMatrix: clipMatrix() });
    const bounds = audit.records[0]?.worldBounds;
    expect(bounds).toBeTruthy();
    // The triangle spans x in [-0.5, 0.5] locally, translated by +10.
    expect(bounds!.min[0]).toBeCloseTo(9.5, 4);
    expect(bounds!.max[0]).toBeCloseTo(10.5, 4);
  });

  it("marks culling-exempt primitives as not-tested rather than inside", () => {
    /*
     * Mirrors the renderer's own exemption rule: a draw range or morph targets make static bounds an unreliable
     * proxy, so those items are never culled. Calling them `inside` would claim a test that never ran.
     */
    const withRange = auditPrimitiveSubmission(
      [triangleItem("ranged", { drawRange: { start: 0, count: 3 } })],
      { viewProjectionMatrix: clipMatrix() }
    );
    expect(withRange.records[0]?.frustum).toBe("not-tested");

    const withMorph = auditPrimitiveSubmission(
      [triangleItem("morphed", { morphTargets: [], morphWeights: [0.5] })],
      { viewProjectionMatrix: clipMatrix() }
    );
    expect(withMorph.records[0]?.frustum).toBe("not-tested");
    // Exempt primitives are not counted as culled.
    expect(withMorph.culled).toBe(0);
  });

  it("treats a malformed camera matrix as no-camera instead of silently culling everything", () => {
    // A NaN in the matrix would make every plane test fail, reporting the whole scene as culled -- a false alarm
    // far worse than admitting the matrix was unusable.
    const audit = auditPrimitiveSubmission([at("centre", 0)], {
      viewProjectionMatrix: [...clipMatrix().slice(0, 15), Number.NaN]
    });
    expect(audit.records[0]?.frustum).toBe("no-camera");
    expect(audit.culled).toBe(0);
  });

  it("keeps a straddling primitive visible rather than culling it", () => {
    /*
     * A box crossing a frustum plane must stay visible: culling it is a false negative that hides geometry, which
     * is precisely the class of bug that would look like "the renderer dropped my part".
     */
    const straddling = triangleItem("edge", {
      modelMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 0, 0, 1]
    });
    const audit = auditPrimitiveSubmission([straddling], { viewProjectionMatrix: clipMatrix() });
    expect(audit.records[0]?.frustum).toBe("inside");
  });

  it("surfaces the verdict and culled count in the formatted report", () => {
    const audit = auditPrimitiveSubmission(
      [at("centre", 0), at("far-right", 40)],
      { viewProjectionMatrix: clipMatrix() }
    );
    const text = formatPrimitiveSubmissionAudit(audit).join("\n");
    expect(text).toContain("culled=1");
    expect(text).toContain("frustum=inside");
    expect(text).toContain("frustum=culled");
  });

  it("classifies all five fixture primitives as inside under a framing camera", async () => {
    /*
     * End-to-end tie-back: with a camera that frames the whole asset, no part may be reported culled. If one were,
     * the live GL proof's `writtenPixels: 0` for that part would be expected behaviour rather than a defect -- and
     * that is exactly the distinction the aggregate count could not make.
     */
    const items = await fixtureRenderItems();
    // A wide orthographic clip volume that comfortably contains the fixture.
    const wide = [0.2, 0, 0, 0, 0, 0.2, 0, 0, 0, 0, 0.05, 0, 0, 0, 0, 1];
    const audit = auditPrimitiveSubmission(items, { viewProjectionMatrix: wide });
    expect(audit.culled).toBe(0);
    expect(audit.culledLabels).toEqual([]);
    for (const record of audit.records) {
      expect(record.frustum, `${record.label} must be inside the framing frustum`).toBe("inside");
      expect(record.worldBounds, `${record.label} must report world bounds`).toBeTruthy();
    }
  });
});

describe("the eight per-primitive fields WS1 names that the audit previously omitted", () => {
  /**
   * The brief's WS1 instrumentation list names **18 fields per primitive**. An item-by-item audit found eight
   * absent: asset ID, mesh index, primitive index, index type, material alpha mode, alpha cutoff, effective
   * opacity, and texture readiness.
   *
   * Those eight are not incidental -- they are the ones that would have shortened the original missing-wheel
   * investigation. It burned time on "is the index type being downcast", "did the wheels inherit a transparent
   * material", and "are the textures ready", each of which had to be answered by hand because the audit did not
   * record them. And correlating "wheelBackL did not draw" back to a glTF primitive was manual for the same reason.
   */
  it("reports the index component type from the buffer rather than assuming one", () => {
    /*
     * A uint32 index buffer silently narrowed to uint16 draws garbage past vertex 65535 -- one of the original
     * hypotheses. `IndexBuffer` already tracks its own type, so this is read, not inferred.
     */
    const audit = auditPrimitiveSubmission([triangleItem("tri")]);
    expect(audit.records[0]!.indexType).toBe("uint16");

    // A buffer whose max index exceeds 65535 must report uint32.
    const vertices = new VertexBuffer(VertexFormat.P3, 70_000);
    for (let index = 0; index < 70_000; index += 1) vertices.setAttribute(index, "position", [0, 0, 0]);
    const wide = auditPrimitiveSubmission([{
      label: "wide",
      geometry: new Geometry(vertices, new IndexBuffer([0, 1, 69_999], 70_000)),
      material: new Material({ name: "wide-material", shaderKey: "audit-test" })
    }]);
    expect(wide.records[0]!.indexType).toBe("uint32");
  });

  it("classifies alpha mode as OPAQUE, MASK or BLEND from the state the renderer uses", () => {
    /*
     * There is no glTF-style `alphaMode` on `RenderState`; the equivalent facts are `blend` plus a nonzero cutoff.
     * Mapping them into glTF's vocabulary keeps a record readable next to its source asset.
     */
    const opaque = auditPrimitiveSubmission([triangleItem("opaque")]);
    expect(opaque.records[0]!.alphaMode).toBe("OPAQUE");
    expect(opaque.records[0]!.alphaCutoff).toBeUndefined();

    const masked = new Material({ name: "masked", shaderKey: "audit-test" });
    masked.setParameter("u_alphaCutoff", 0.5);
    const maskedAudit = auditPrimitiveSubmission([triangleItem("masked", { material: masked })]);
    expect(maskedAudit.records[0]!.alphaMode).toBe("MASK");
    expect(maskedAudit.records[0]!.alphaCutoff).toBe(0.5);

    /*
     * `depthWrite: false` is required, not incidental: `validateRenderState` throws on a blended material that
     * still writes depth. Worth stating because the engine enforcing that invariant is *why* a transparent
     * material cannot silently occlude an opaque tyre behind it.
     */
    const blended = new Material({
      name: "blended", shaderKey: "audit-test", renderState: { blend: true, depthWrite: false }
    });
    const blendedAudit = auditPrimitiveSubmission([triangleItem("blended", { material: blended })]);
    expect(blendedAudit.records[0]!.alphaMode).toBe("BLEND");
  });

  it("reports effective opacity, defaulting to 1 when the material states none", () => {
    /*
     * The default matters: reporting an unstated opacity as 0 would invent a discard reason the renderer never
     * applied, and send a future investigation down exactly the wrong path.
     */
    const unstated = auditPrimitiveSubmission([triangleItem("unstated")]);
    expect(unstated.records[0]!.effectiveOpacity).toBe(1);

    const translucent = new Material({ name: "translucent", shaderKey: "audit-test" });
    translucent.setParameter("u_baseColorFactor", [1, 1, 1, 0.25]);
    const audit = auditPrimitiveSubmission([triangleItem("translucent", { material: translucent })]);
    expect(audit.records[0]!.effectiveOpacity).toBe(0.25);
  });

  it("clamps a nonsensical opacity instead of propagating it", () => {
    const material = new Material({ name: "bad-alpha", shaderKey: "audit-test" });
    material.setParameter("u_baseColorFactor", [1, 1, 1, 4]);
    const audit = auditPrimitiveSubmission([triangleItem("bad-alpha", { material })]);
    expect(audit.records[0]!.effectiveOpacity).toBe(1);
  });

  it("carries glTF provenance so a missing part is addressable, not just named", () => {
    /*
     * "wheelBackL did not draw" becomes "mesh 3 primitive 0 of turboRaceCar did not draw". Optional, because a
     * procedurally-built primitive has no glTF provenance -- but `submissionIndex` is always present, so every
     * record is addressable regardless.
     */
    const audit = auditPrimitiveSubmission([triangleItem("wheelBackL")], {
      provenanceByLabel: { wheelBackL: { assetId: "turboRaceCar", meshIndex: 3, primitiveIndex: 0 } }
    });
    const record = audit.records[0]!;
    expect(record.assetId).toBe("turboRaceCar");
    expect(record.meshIndex).toBe(3);
    expect(record.primitiveIndex).toBe(0);
    expect(record.submissionIndex).toBe(0);
  });

  it("leaves provenance undefined rather than inventing it, and still indexes the record", () => {
    const audit = auditPrimitiveSubmission([triangleItem("a"), triangleItem("b")]);
    expect(audit.records.map((record) => record.assetId)).toEqual([undefined, undefined]);
    expect(audit.records.map((record) => record.submissionIndex)).toEqual([0, 1]);
  });

  it("reports texture readiness only when the caller measured it", () => {
    /*
     * A primitive drawing with an unready texture is a *distinct* failure from one that never drew. Conflating
     * them is what sent the original investigation toward the renderer instead of toward grounding.
     */
    const unmeasured = auditPrimitiveSubmission([triangleItem("tri")]);
    expect(unmeasured.records[0]!.texturesReady, "unmeasured must be undefined, not false").toBeUndefined();

    const measured = auditPrimitiveSubmission([triangleItem("tri")], { texturesReadyByLabel: { tri: false } });
    expect(measured.records[0]!.texturesReady).toBe(false);
  });

  it("records all 18 of the brief's named per-primitive fields", () => {
    /*
     * The audit encoded. A future edit that drops a field fails here rather than passing quietly, which is how
     * eight of them went missing in the first place.
     */
    const material = new Material({ name: "full", shaderKey: "audit-test" });
    material.setParameter("u_alphaCutoff", 0.25);
    material.setParameter("u_baseColorFactor", [1, 1, 1, 0.9]);
    const audit = auditPrimitiveSubmission(
      [triangleItem("full", { material, modelMatrix: Float32Array.from(IDENTITY) })],
      {
        viewProjectionMatrix: IDENTITY,
        provenanceByLabel: { full: { assetId: "asset", meshIndex: 1, primitiveIndex: 2 } },
        texturesReadyByLabel: { full: true },
        glErrorsByLabel: {}
      }
    );
    const record = audit.records[0]! as unknown as Record<string, unknown>;
    for (const field of [
      "assetId", "meshIndex", "primitiveIndex", "submissionIndex", "label", "materialName",
      "vertexCount", "indexCount", "topology", "indexType", "hasModelMatrix", "transformScale",
      "frustum", "alphaMode", "alphaCutoff", "effectiveOpacity", "texturesReady", "localBounds"
    ]) {
      expect(record, `missing field: ${field}`).toHaveProperty(field);
    }
    // `glError` is present-but-undefined when no device error was reported, which is meaningful, not missing.
    expect("glError" in record).toBe(true);
  });
});
