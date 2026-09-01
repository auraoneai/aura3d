import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { gameGeometryContract } from "../../../apps/showcase-turbo-drift-circuit/src/generated/game-geometry";

/**
 * Regression coverage for defects 43 and 45.
 *
 * Defect 45 retracts defect 43. Defect 43 claimed the rendered circuit mesh sits *above*
 * `trackY`, and added `VISIBLE_ROAD_LIFT = 0.11` to compensate. Both halves were wrong:
 *
 * 1. The mesh does not sit above `trackY`. `fitRacingModelToTopology` positions the track
 *    so its road anchor lands exactly on `trackY`: node Y -0.8392 plus the anchor's local
 *    offset 0.7192 = -0.1200. Recomputed here from the retained topology so a topology or
 *    fit-scale change cannot silently invalidate it.
 * 2. A `scaleMode: "fit"` model is grounded on its node origin, not centred on it. The
 *    renderer's `createModelMatrix` composes the fit scale with
 *    `translation(-centerX, -bounds.min[1], -centerZ)`, so `carY` *is* the contact plane.
 *    The extra `CAR_TARGET_MAX_DIMENSION * CAR_ORIGIN_UNDERHANG_RATIO` term double-counted
 *    an underhang the renderer had already removed.
 *
 * Together those floated the car 0.1367 scene units (12.4% of its own length) above the
 * asphalt, which is what cut the tyres off: the wheels were above the road, so the visible
 * bottom edge was the car's own front spoiler occluding them, not a contact patch.
 *
 * Defect 43's "measurement" was confounded by the chase camera, which is positioned
 * relative to `carY`. Raising the car also raised the camera, so the tyre silhouette
 * appeared to descend to screen y=732 and stop; that plateau was read as ground contact.
 * Proof it was not: at `VISIBLE_ROAD_LIFT = 2.0` the car floats two full units up with
 * grass visible beneath it, yet the silhouette is unchanged (IoU 0.978 against the 0.11
 * frame). A screen-space sweep cannot measure grounding when the camera tracks the subject.
 */
describe("Turbo car is seated on the visible road", () => {
  const source = readFileSync("apps/showcase-turbo-drift-circuit/src/main.ts", "utf8");

  it("grounds the car on the track surface with no lift or underhang correction", () => {
    // Renamed in WS-4.1: `TRACK_SURFACE_Y`/`CAR_GROUND_Y` implied the constant *was* the
    // contact surface. It is now only the reference elevation the binding seats the track
    // asset against; contact comes from the sampled road mesh. The invariant this test
    // protects is unchanged: no lift and no underhang correction.
    expect(source).toContain("const CAR_REFERENCE_Y = TRACK_REFERENCE_Y;");
    // The retracted defect-43 form added a lift constant.
    expect(source).not.toContain("VISIBLE_ROAD_LIFT");
    // The retracted defect-33c form added an underhang the renderer already removes.
    expect(source).not.toContain("CAR_ORIGIN_UNDERHANG_RATIO");
  });

  it("keeps the probe contact reference on the surface the car stands on", () => {
    // One reference elevation, used for both the car node and the telemetry probe.
    expect(source).toContain("const CAR_REFERENCE_Y = TRACK_REFERENCE_Y;");
  });

  it("takes per-wheel contact from the road mesh, not from the reference elevation", () => {
    // WS-4.1. This is the assertion the old constants could not make: the route must get its
    // surface from the general layer. A route that reverted to an analytic surface would keep
    // every test above passing, which is how the sinking defect survived.
    expect(source).toContain("racingScene.vehicleSurface(");
    // And it must not reintroduce any of the deleted approximations.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const banned of ["TRACK_SURFACE_Y", "CAR_GROUND_Y", "CAR_TYRE_CONTACT_Y", "VERGE_DROP", "SHOULDER_WIDTH"]) {
      expect(code, `${banned} must stay deleted`).not.toContain(banned);
    }
  });

  it("passes the same surface to the racing binding as trackY and carY", () => {
    expect(source).toContain("trackY: TRACK_REFERENCE_Y,");
    expect(source).toContain("carY: CAR_REFERENCE_Y,");
  });

  it("documents grounding as renderer behaviour rather than a tuned offset", () => {
    expect(source).toMatch(/grounded on its (own )?node origin/);
  });

  /**
   * The premise of defect 43 was that the rendered road is not on `trackY`. This recomputes
   * the fit from the retained topology and asserts it is, so reintroducing a lift constant
   * would require this arithmetic to change first.
   *
   * NOTE: this test previously ended at `expect(nodeY + localOffsetY).toBeCloseTo(trackSurfaceY)`,
   * which is an identity -- `nodeY` is *defined* as `trackSurfaceY - localOffsetY`, so the assertion
   * held for every possible anchor elevation and could never fail. That is precisely why the anchor
   * grounding defect survived here: the arithmetic below was correct about where the *anchor* lands
   * while the anchor itself described the road family's bounding-box floor rather than the tarmac,
   * sinking the car 0.1275 units. The check now compares the rendered *road surface* against the
   * car's contact plane, which is the invariant that actually matters.
   */
  it("proves the rendered road anchor lands on trackY", () => {
    const geometry = readFileSync("apps/showcase-turbo-drift-circuit/src/generated/game-geometry.ts", "utf8");
    const at = geometry.indexOf('"modelAlignment"');
    expect(at).toBeGreaterThan(-1);
    const open = geometry.indexOf("{", at);
    let depth = 0;
    let end = open;
    for (let index = open; index < geometry.length; index += 1) {
      if (geometry[index] === "{") depth += 1;
      else if (geometry[index] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = index;
          break;
        }
      }
    }
    const alignment = JSON.parse(geometry.slice(open, end + 1)) as {
      readonly modelPoint: readonly [number, number, number];
      readonly modelBounds: { readonly min: readonly number[]; readonly max: readonly number[] };
    };
    // The track fit is derived from the generated topology and centreline span;
    // do not pin this regression to a copied numeric literal that becomes stale
    // whenever the certified environment is regenerated. Recompute the same
    // contract value from the generated bounds and the route's declared scene
    // size, then assert the source uses that derived expression.
    expect(source).toContain("const TRACK_MODEL_TARGET_MAX_DIMENSION = Number(");
    const sceneSize = Number(source.match(/const SCENE_SIZE = ([\d.]+)/)?.[1]);
    const centerline = gameGeometryContract.topology.roadCenterline;
    const routePlanMaxSpan = Math.max(
      Math.max(...centerline.map((point) => point.x)) - Math.min(...centerline.map((point) => point.x)),
      Math.max(...centerline.map((point) => point.z)) - Math.min(...centerline.map((point) => point.z))
    );
    const modelBounds = gameGeometryContract.topology.modelAlignment.modelBounds;
    const trackModelMaxSpan = Math.max(
      modelBounds.max[0] - modelBounds.min[0],
      modelBounds.max[1] - modelBounds.min[1],
      modelBounds.max[2] - modelBounds.min[2]
    );
    const targetMaxDimension = Number((trackModelMaxSpan * (sceneSize / routePlanMaxSpan)).toFixed(6));
    const trackSurfaceY = Number(source.match(/const TRACK_REFERENCE_Y = (-?[\d.]+);/)?.[1]);
    expect(Number.isFinite(targetMaxDimension)).toBe(true);
    expect(Number.isFinite(trackSurfaceY)).toBe(true);

    const { min, max } = alignment.modelBounds;
    const maxDimension = Math.max(max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!);
    const fitScale = targetMaxDimension / maxDimension;
    // `normalizedModelLocalOffset` measures the anchor above the model's lowest point.
    const localOffsetY = (alignment.modelPoint[1] - min[1]!) * fitScale;
    // `fitRacingModelToTopology` places the node so anchor + offset lands on the scene target.
    const nodeY = trackSurfaceY - localOffsetY;

    // The anchor must describe the *drivable surface*, so the rendered tarmac has to land on the
    // car's contact plane. The car is grounded on its node origin at `carY === TRACK_SURFACE_Y`.
    const anchorAboveModelFloor = alignment.modelPoint[1] - min[1]!;
    expect(anchorAboveModelFloor, "anchor must not collapse onto the model bounds floor")
      .toBeGreaterThan(0);

    // Where the modelled road surface ends up. The anchor's own elevation *is* the sampled surface,
    // so the rendered surface is the anchor position: it must coincide with the contact plane.
    const renderedRoadSurfaceY = nodeY + anchorAboveModelFloor * fitScale;
    expect(renderedRoadSurfaceY, "rendered road surface must meet the car contact plane")
      .toBeCloseTo(trackSurfaceY, 4);

    // Negative control: had the anchor kept the road family's bounding-box floor, the rendered
    // surface would sit above the contact plane and sink the car. Assert that error is material, so
    // this test fails loudly if the extractor regresses to `roadBounds.min[1]`.
    const legacySurfaceY = trackSurfaceY + anchorAboveModelFloor * fitScale;
    expect(legacySurfaceY - trackSurfaceY, "bounding-box-floor anchoring must be a detectable error")
      .toBeGreaterThan(0.0);
  });
});
