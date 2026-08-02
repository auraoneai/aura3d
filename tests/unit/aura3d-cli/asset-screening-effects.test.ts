import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRetainedRenderProbe, inspectGlbGeometry } from "../../../packages/aura3d-cli/src/asset-screening-effects";
import { admitAssetForRole } from "../../../packages/aura3d-cli/src/asset-role-admission";
import { admissionRequirementForIntent, type AssetIntent } from "../../../packages/aura3d-cli/src/asset-intent";

/**
 * The screening pipeline was fully tested against *injected* effects before these bindings existed, which
 * meant the orchestration was proven and the thing was still unrunnable. These tests cover the real
 * measurement path: geometry read directly from a GLB, in the vocabulary admission consumes.
 *
 * The load-bearing cases are the four real assets whose geometry was established independently during this
 * investigation. If `inspectGlbGeometry` and the standalone auditor ever disagree about one of them, one of
 * the two is wrong -- and a screening pipeline that disagrees with the auditor is worse than neither.
 */

/** Locate a registered asset by id prefix, since filenames carry a content hash. */
function registeredAsset(idPrefix: string): string | undefined {
  const dir = "public/aura-assets";
  if (!existsSync(dir)) return undefined;
  const hit = readdirSync(dir).find((file) => file.startsWith(`${idPrefix}.`) && file.endsWith(".glb"));
  return hit ? join(dir, hit) : undefined;
}

describe("inspectGlbGeometry measures the same facts as the standalone auditor", () => {
  it("reads the accepted hero vehicle as 5 parts with four visible wheel corners", () => {
    const path = registeredAsset("turboRaceCar");
    expect(path, "turboRaceCar must be registered").toBeTruthy();
    const geometry = inspectGlbGeometry(path!);
    // Independently established: 5 meshes, 11,344 triangles, 4 named wheel meshes at four corners.
    expect(geometry.partCount).toBe(5);
    expect(geometry.triangles).toBe(11_344);
    expect(geometry.wheelCandidates).toBe(4);
    expect(geometry.distinctWheelCorners).toBe(4);
    expect(geometry.wheelsVisibleInSilhouette).toBe(true);
    expect(geometry.textureCount).toBe(6);
  });

  it("reads the wheelless body shell as a single part with no wheel geometry", () => {
    const path = registeredAsset("showcaseCityVehicle");
    expect(path, "showcaseCityVehicle must be registered").toBeTruthy();
    const geometry = inspectGlbGeometry(path!);
    // The 792-triangle traffic prop that once shipped as a hero.
    expect(geometry.partCount).toBe(1);
    expect(geometry.triangles).toBe(792);
    expect(geometry.wheelCandidates).toBe(0);
    expect(geometry.wheelsVisibleInSilhouette).toBe(false);
  });

  it("distinguishes per-instance draw cost between two visually similar tree assets", () => {
    /*
     * This is the axis a triangle budget misses. Both trees render correctly in isolation, but the heavy
     * cluster drove a route to 840 draw calls and a blank capture while the cheap one did not.
     */
    const cheap = registeredAsset("propConifer");
    const heavy = registeredAsset("propPineTree");
    expect(cheap, "propConifer must be registered").toBeTruthy();
    expect(heavy, "propPineTree must be registered").toBeTruthy();
    const cheapGeometry = inspectGlbGeometry(cheap!);
    const heavyGeometry = inspectGlbGeometry(heavy!);
    expect(heavyGeometry.drawCallsPerInstance ?? 0).toBeGreaterThan((cheapGeometry.drawCallsPerInstance ?? 0) * 3);
    expect(heavyGeometry.triangles).toBeGreaterThan(cheapGeometry.triangles);
  });

  it("reports a per-instance draw-call count, not just triangles", () => {
    const path = registeredAsset("turboRaceCar");
    const geometry = inspectGlbGeometry(path!);
    // 5 primitives -> 5 draw calls per instance before multi-pass expansion.
    expect(geometry.drawCallsPerInstance).toBe(5);
  });

  it("throws a clear error for a file that is not a GLB", () => {
    const dir = mkdtempSync(join(tmpdir(), "aura3d-inspect-"));
    try {
      const path = join(dir, "not-a-glb.glb");
      writeFileSync(path, "this is plain text, not a binary GLB container");
      expect(() => inspectGlbGeometry(path)).toThrow(/is not a binary GLB/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns zeroed facts rather than throwing for a GLB with no mesh nodes", () => {
    // A structurally valid but empty GLB must be *rejected by admission*, not crash the screen.
    const dir = mkdtempSync(join(tmpdir(), "aura3d-inspect-empty-"));
    try {
      const json = Buffer.from(JSON.stringify({ asset: { version: "2.0" }, nodes: [], meshes: [] }), "utf8");
      const padded = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
      const header = Buffer.alloc(12);
      header.write("glTF", 0, "utf8");
      header.writeUInt32LE(2, 4);
      header.writeUInt32LE(12 + 8 + padded.length, 8);
      const chunk = Buffer.alloc(8);
      chunk.writeUInt32LE(padded.length, 0);
      chunk.write("JSON", 4, "utf8");
      const path = join(dir, "empty.glb");
      writeFileSync(path, Buffer.concat([header, chunk, padded]));
      const geometry = inspectGlbGeometry(path);
      expect(geometry.partCount).toBe(0);
      expect(geometry.triangles).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is deterministic for the same file", () => {
    const path = registeredAsset("turboRaceCar");
    expect(inspectGlbGeometry(path!)).toEqual(inspectGlbGeometry(path!));
  });
});

describe("search lines expose what an automated screening loop needs", () => {
  it("declares downloadUrl and author on the candidate line type", () => {
    /*
     * A search line previously carried only `sourcePage` -- a human-facing landing page, not a file -- and
     * no author. Running the real pipeline rejected every candidate with "candidate has no download URL",
     * then with "provenance-complete: author missing", for information the provider had already supplied.
     * Both fields are now surfaced, which is what makes `assets search --json` sufficient for a screening
     * loop rather than requiring a second resolve.
     */
    const source = readFileSync("packages/aura3d-cli/src/pull-bridge/search.ts", "utf8");
    expect(source).toContain("readonly downloadUrl?: string;");
    expect(source).toContain("readonly author?: string;");
    expect(source).toContain("asset.downloadUrl ?? asset.url");
    expect(source).toContain("asset.author ?? asset.attribution");
  });
});

describe("the retained render probe supplies real rendered proof, never a synthesised one", () => {
  const probe = createRetainedRenderProbe({ projectDir: process.cwd() });

  it("reads readable azimuths from the retained multi-angle report", async () => {
    const rendered = await probe({ id: "turboRaceCar" } as never, { localPath: "unused" } as never);
    expect(rendered.renderedWheelVisibility).toBe(true);
    // 1.1 and 1.5708 are the angles where the wheels were visually confirmed; the dead-on 0 is excluded.
    expect(rendered.renderedAzimuths).toEqual([1.1, 1.5708]);
    expect(rendered.renderedAzimuths?.every((azimuth) => Math.abs(azimuth) > 0.2)).toBe(true);
  });

  it("accepts a provider-qualified candidate id", async () => {
    const rendered = await probe({ id: "objaverse:turboRaceCar" } as never, { localPath: "unused" } as never);
    expect(rendered.renderedAzimuths).toEqual([1.1, 1.5708]);
  });

  it("returns no verdict at all for an asset that was never probed", async () => {
    /*
     * The load-bearing distinction: "no evidence" is not "evidence of absence". Returning an empty result
     * makes admission report `unproven`; returning `renderedWheelVisibility: false` would assert the wheels
     * are invisible, which is what made a correctly-drawing asset look broken.
     */
    const rendered = await probe({ id: "neverProbedAsset" } as never, { localPath: "unused" } as never);
    expect(rendered).toEqual({});
    expect(rendered.renderedWheelVisibility).toBeUndefined();
  });

  it("excludes a dead-on angle whose band mass is centre-only", async () => {
    // Centre-only band mass is bodywork seen head-on, which is exactly the misleading probe geometry.
    const report = JSON.parse(
      readFileSync("tests/reports/vehicle-wheel-visibility/turboRaceCar.json", "utf8")
    ) as { readonly angles: readonly { readonly azimuth: number }[] };
    const rendered = await probe({ id: "turboRaceCar" } as never, { localPath: "unused" } as never);
    // The report contains a 0-azimuth angle, and it must not appear in the evidence set.
    expect(report.angles.some((angle) => angle.azimuth === 0)).toBe(true);
    expect(rendered.renderedAzimuths).not.toContain(0);
  });
});

describe("intent + geometry + retained render proof admits the real hero vehicle", () => {
  it("closes the whole chain for turboRaceCar", async () => {
    /*
     * End-to-end proof that the pieces compose: the authored intent, geometry read from the actual GLB, and
     * the retained multi-angle render together clear hero-vehicle admission. Before this chain existed the
     * same asset was reported as "wheels not rendering" and a renderer defect was diagnosed.
     */
    const intent = JSON.parse(
      readFileSync("tools/asset-screening/intents/hero-vehicle.json", "utf8")
    ) as AssetIntent;
    const path = registeredAsset("turboRaceCar");
    expect(path).toBeTruthy();
    const rendered = await createRetainedRenderProbe({ projectDir: process.cwd() })(
      { id: "turboRaceCar" } as never,
      { localPath: path! } as never
    );
    const admission = admitAssetForRole({
      assetId: "turboRaceCar",
      requirement: admissionRequirementForIntent(intent),
      geometry: inspectGlbGeometry(path!),
      rendered,
      provenance: { license: "CC-BY-4.0", author: "DJMaesen" }
    });
    expect(admission.blockers).toEqual([]);
    expect(admission.unproven).toEqual([]);
    expect(admission.admitted).toBe(true);
  });

  it("still refuses the same intent when the rendered proof is withheld", async () => {
    // Removing only the rendered evidence must flip the verdict, or the chain is not actually load-bearing.
    const intent = JSON.parse(
      readFileSync("tools/asset-screening/intents/hero-vehicle.json", "utf8")
    ) as AssetIntent;
    const path = registeredAsset("turboRaceCar");
    const admission = admitAssetForRole({
      assetId: "turboRaceCar",
      requirement: admissionRequirementForIntent(intent),
      geometry: inspectGlbGeometry(path!),
      provenance: { license: "CC-BY-4.0", author: "DJMaesen" }
    });
    expect(admission.admitted).toBe(false);
    expect(admission.unproven.join(" ")).toContain("rendered-wheel-visibility");
  });
});
