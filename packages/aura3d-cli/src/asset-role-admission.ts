/**
 * Role-aware asset fitness admission.
 *
 * ## Why this exists, and why one boolean is not enough
 *
 * Three hero-vehicle assets shipped into Turbo Drift Circuit and every one of them was visually wrong
 * in a *different* way that every existing gate accepted:
 *
 * | Asset | Parts | Triangles | Actual failure |
 * | --- | --- | --- | --- |
 * | `showcaseTexturedSportsCar` | 7 | 33,700 | tyres attached through detached stalk-like geometry |
 * | `showcaseCityVehicle` | 1 | 792 | a distant low-poly body shell with no wheels modelled at all |
 * | `turboHeroCar` | 483 | 71,426 | closed-wheel Le Mans body encloses the wheels; not readable |
 *
 * Nothing caught them because every upstream check measured the *frame*, not the *model*: probe
 * thresholds measure subject pixel size, readability rules measure foreground bounds, composition
 * checks measure coverage ratios. A wheelless car is a large, well-lit, correctly-framed subject and
 * passes all of them.
 *
 * The second lesson is that fitness is **not global**. `showcaseCityVehicle` is a perfectly good
 * background traffic prop and a bad hero. `turboHeroCar` is a structurally valid vehicle and a bad
 * choice when the requested style needs exposed tyres. Collapsing that into one pass/fail either
 * rejects usable assets or admits unusable ones. So admission is evaluated **against a requested role
 * and its visual requirements**, and every check is reported individually with its own verdict so a
 * rejection is machine-readable and explains itself.
 *
 * ## Deliberate boundary
 *
 * This module is structural only. It consumes geometry and provenance facts and never claims rendered
 * visibility: `wheelsVisibleInSilhouette` is a *geometric prediction* that wheels reach the body
 * silhouette, not proof a viewer saw them. Rendered proof is a separate input
 * (`renderedWheelVisibility`) supplied by a browser probe, because the repository rule is that no
 * visual claim may rest on mesh statistics. When rendered evidence is absent for a role that requires
 * it, admission reports `unproven` rather than `pass`.
 */

/** Roles admission can be requested for. Vehicle is fully specified; the rest are extensible. */
export type AssetAdmissionRole =
  | "hero-vehicle"
  | "background-vehicle"
  | "playable-character"
  | "environment"
  | "track"
  | "platform"
  | "building"
  | "prop"
  | "collectible"
  | "weapon"
  | "ui-hero-object";

export type AssetAdmissionVerdict = "pass" | "fail" | "unproven" | "not-applicable";

/** One named check, reported individually so a rejection explains itself. */
export interface AssetAdmissionCheck {
  readonly id: string;
  readonly verdict: AssetAdmissionVerdict;
  /** Human-readable reason. Always populated for `fail` and `unproven`. */
  readonly detail: string;
  /** Measured value the verdict was derived from, when there is one. */
  readonly measured?: number | string | boolean | undefined;
}

/** Geometry facts, as produced by the vehicle geometry auditor. */
export interface AssetGeometryFacts {
  readonly partCount: number;
  readonly triangles: number;
  /** Axis-aligned world size, `[x, y, z]`. */
  readonly bounds: readonly [number, number, number];
  readonly materialCount?: number | undefined;
  readonly textureCount?: number | undefined;
  /** Roughly-circular, low-mounted parts found. */
  readonly wheelCandidates?: number | undefined;
  /** Distinct outboard corners carrying such a part. */
  readonly distinctWheelCorners?: number | undefined;
  /** True when at least one wheel reaches the body silhouette in plan view. */
  readonly wheelsVisibleInSilhouette?: boolean | undefined;
  /** Largest |half-width| reached by a wheel candidate. */
  readonly wheelHalfWidth?: number | undefined;
  /** Largest |half-width| of the whole body. */
  readonly bodyHalfWidth?: number | undefined;
  /** Parts detached from the main body shell, which produced the "tyres on stalks" failure. */
  readonly detachedPartCount?: number | undefined;
  /** Lowest Y of the asset in its own units, used for grounding confidence. */
  readonly minY?: number | undefined;
  /**
   * Declared forward axis from the asset's own manifest, if it states one.
   *
   * `undefined` means *not declared*, which admission reports as `unproven` rather than guessing. A vehicle
   * placed backwards on a track is a visible defect that geometry cannot rule out: a symmetric body has no
   * intrinsic front, so this has to come from manifest evidence or an explicit override.
   */
  readonly forwardAxis?: readonly [number, number, number] | undefined;
  /**
   * Whether the front and rear of the asset are distinguishable from geometry, e.g. a longer overhang or an
   * asymmetric wheelbase. Separate from `forwardAxis`: this says the inference is *possible*, not which way.
   */
  readonly frontRearDistinguishable?: boolean | undefined;
  /** Horizontal distance from the asset origin to its bounds centre, as a fraction of its longest axis. */
  readonly pivotOffsetRatio?: number | undefined;
  /** Mesh parts carrying no material assignment. A part with no material has no shader to draw with. */
  readonly partsWithoutMaterial?: number | undefined;
}

/** Rendered evidence, supplied by a browser probe. Never inferred from geometry. */
export interface AssetRenderedFacts {
  /** Path to the retained screenshot the verdict is bound to. */
  readonly screenshotPath?: string | undefined;
  /** Whether a retained render shows readable wheels. `undefined` means not measured. */
  readonly renderedWheelVisibility?: boolean | undefined;
  /** Camera azimuths the render covered, in radians. A single head-on angle proves little. */
  readonly renderedAzimuths?: readonly number[] | undefined;
}

export interface AssetProvenanceFacts {
  readonly license?: string | undefined;
  readonly author?: string | undefined;
  readonly sourcePage?: string | undefined;
  readonly provider?: string | undefined;
}

/** What the caller needs from the asset, expressed as intent rather than thresholds. */
export interface AssetRoleRequirement {
  readonly role: AssetAdmissionRole;
  /** Require exposed, visually readable wheels. Meaningless for a closed-wheel prototype. */
  readonly requireReadableWheels?: boolean | undefined;
  /** Require textures rather than flat colour. */
  readonly requireTextured?: boolean | undefined;
  /** Maximum triangle budget for the role. */
  readonly maxTriangles?: number | undefined;
  /** Minimum triangle count, used to reject distant-prop shells from hero use. */
  readonly minTriangles?: number | undefined;
  /** Require complete license/author provenance. */
  readonly requireProvenance?: boolean | undefined;
  /**
   * Require orientation evidence rather than accepting an unoriented asset.
   *
   * The brief is explicit that a route must be able to "reject if required orientation evidence is absent".
   * Off by default because a rock or a tree has no meaningful forward axis; a vehicle or character does.
   */
  readonly requireOrientationEvidence?: boolean | undefined;
}

export interface AssetAdmissionInput {
  readonly assetId: string;
  readonly requirement: AssetRoleRequirement;
  readonly geometry: AssetGeometryFacts;
  readonly rendered?: AssetRenderedFacts | undefined;
  readonly provenance?: AssetProvenanceFacts | undefined;
}

export interface AssetAdmissionReport {
  readonly schema: "aura3d-asset-role-admission/1.0";
  readonly assetId: string;
  readonly role: AssetAdmissionRole;
  readonly checks: readonly AssetAdmissionCheck[];
  /** `true` only when no check failed **and** no required check is unproven. */
  readonly admitted: boolean;
  /** Machine-readable rejection reasons, `<check-id>:<detail>`. Empty when admitted. */
  readonly blockers: readonly string[];
  /** Checks that could not be decided. A non-empty list forbids `admitted: true`. */
  readonly unproven: readonly string[];
  /** Roles this asset would satisfy instead, so a rejection is actionable. */
  readonly suitableAlternativeRoles: readonly AssetAdmissionRole[];
}

/** Minimum distinct outboard corners for a vehicle to count as wheeled. */
export const MIN_VEHICLE_WHEEL_CORNERS = 3;
/** Below this triangle count an asset is a distant prop, not a hero subject. */
export const HERO_MIN_TRIANGLES = 3_000;
/**
 * A hero render must cover at least this many distinct azimuths.
 *
 * One angle is not evidence: the `turboRaceCar` release probe rendered a dead-on front view (camera
 * azimuth and node rotation cancelled exactly), which is the single angle where a car's own bodywork
 * hides its wheels. That frame was read as "the renderer is dropping the wheel primitives" when in
 * fact all five primitives were drawing. Requiring multiple angles makes that mistake impossible.
 */
export const HERO_MIN_RENDERED_AZIMUTHS = 2;

/**
 * Evaluate an asset against a requested role.
 *
 * Returns every check individually. Callers must not reduce this to a boolean without also surfacing
 * `blockers` and `unproven`, or the "asset loads, therefore asset is fine" failure returns.
 */
export function admitAssetForRole(input: AssetAdmissionInput): AssetAdmissionReport {
  const { requirement: requirement, geometry, rendered, provenance } = input;
  const checks: AssetAdmissionCheck[] = [];
  const isVehicle = requirement.role === "hero-vehicle" || requirement.role === "background-vehicle";
  const isHero = requirement.role === "hero-vehicle" || requirement.role === "playable-character" || requirement.role === "ui-hero-object";

  checks.push({
    id: "part-count",
    verdict: geometry.partCount > 0 ? "pass" : "fail",
    detail: geometry.partCount > 0 ? `${geometry.partCount} mesh part(s)` : "no mesh parts with readable bounds",
    measured: geometry.partCount
  });

  /*
   * The hero triangle floor applies only when a triangle count was actually measured.
   *
   * Callers that read structural facts from a manifest have no triangle count available. Defaulting a
   * missing count to `0` and then failing the floor reports "distant-prop shell" for *absent metadata*,
   * which is a false accusation: it fired on correctly-certified release fixtures. A floor can only be
   * enforced against a real measurement, so `triangles === 0` disables the implied hero floor while an
   * explicitly requested `minTriangles` is still honoured.
   */
  const minTriangles = requirement.minTriangles ?? (isHero && geometry.triangles > 0 ? HERO_MIN_TRIANGLES : undefined);
  if (minTriangles !== undefined) {
    const ok = geometry.triangles >= minTriangles;
    checks.push({
      id: "triangle-floor",
      verdict: ok ? "pass" : "fail",
      detail: ok
        ? `${geometry.triangles} triangles meets the ${minTriangles} floor for ${requirement.role}`
        : `${geometry.triangles} triangles is below the ${minTriangles} floor for ${requirement.role}; this is a distant-prop shell, not a hero subject`,
      measured: geometry.triangles
    });
  }
  if (requirement.maxTriangles !== undefined) {
    const ok = geometry.triangles <= requirement.maxTriangles;
    checks.push({
      id: "triangle-budget",
      verdict: ok ? "pass" : "fail",
      detail: ok
        ? `${geometry.triangles} triangles within the ${requirement.maxTriangles} budget`
        : `${geometry.triangles} triangles exceeds the ${requirement.maxTriangles} budget`,
      measured: geometry.triangles
    });
  }

  if (requirement.requireTextured) {
    const textures = geometry.textureCount ?? 0;
    checks.push({
      id: "textured",
      verdict: textures > 0 ? "pass" : "fail",
      detail: textures > 0 ? `${textures} texture(s)` : "no textures; the role requires textured materials rather than flat colour",
      measured: textures
    });
  }

  if (isVehicle) {
    const corners = geometry.distinctWheelCorners ?? 0;
    const candidates = geometry.wheelCandidates ?? 0;
    const wheeled = corners >= MIN_VEHICLE_WHEEL_CORNERS;
    /*
     * Distinguish "measured and absent" from "never measured".
     *
     * Wheel-part detection requires reading the mesh; a caller working from manifest metadata cannot
     * supply it. Reporting `fail` in that case accused correctly-certified assets of having no wheels.
     * `unproven` is the honest verdict when neither field was provided, and it still blocks admission --
     * it simply does not claim the asset is wheelless.
     */
    const wheelGeometryMeasured = geometry.wheelCandidates !== undefined || geometry.distinctWheelCorners !== undefined;
    checks.push({
      id: "wheel-geometry-present",
      verdict: wheeled ? "pass" : wheelGeometryMeasured ? "fail" : "unproven",
      detail: wheeled
        ? `${candidates} wheel-like part(s) across ${corners} corner(s)`
        : !wheelGeometryMeasured
          ? "wheel geometry was not measured; supply wheelCandidates/distinctWheelCorners from a mesh audit"
          : candidates === 0
            ? "no roughly-circular low-mounted parts: this is a body shell with no wheels modelled"
            : `wheel-like parts at only ${corners} corner(s); a vehicle needs ${MIN_VEHICLE_WHEEL_CORNERS}+`,
      measured: corners
    });

    // Deliberately separate from the check above: existence is not readability.
    if (requirement.requireReadableWheels) {
      const silhouette = geometry.wheelsVisibleInSilhouette;
      checks.push({
        id: "wheels-outside-body-silhouette",
        verdict: silhouette === undefined ? "unproven" : silhouette ? "pass" : "fail",
        detail: silhouette === undefined
          ? "wheel/body silhouette relationship was not measured"
          : silhouette
            ? `wheels reach the body silhouette (wheel half-width ${fmt(geometry.wheelHalfWidth)} vs body ${fmt(geometry.bodyHalfWidth)})`
            : `wheels are enclosed inside the bodywork (wheel half-width ${fmt(geometry.wheelHalfWidth)} vs body ${fmt(geometry.bodyHalfWidth)}); they exist but cannot be seen, so this reads as a closed-wheel prototype`,
        measured: silhouette
      });

      // Structural prediction is never accepted as rendered proof.
      const renderedVisible = rendered?.renderedWheelVisibility;
      const azimuths = rendered?.renderedAzimuths?.length ?? 0;
      if (renderedVisible === undefined) {
        checks.push({
          id: "rendered-wheel-visibility",
          verdict: "unproven",
          detail: "no retained render measures wheel visibility; geometry alone cannot prove a viewer sees the tyres",
          measured: false
        });
      } else if (!renderedVisible) {
        checks.push({
          id: "rendered-wheel-visibility",
          verdict: "fail",
          detail: `retained render${rendered?.screenshotPath ? ` ${rendered.screenshotPath}` : ""} does not show readable wheels`,
          measured: false
        });
      } else if (azimuths < HERO_MIN_RENDERED_AZIMUTHS) {
        checks.push({
          id: "rendered-wheel-visibility",
          verdict: "unproven",
          detail: `wheels read at only ${azimuths} camera angle(s); ${HERO_MIN_RENDERED_AZIMUTHS}+ are required because a single head-on view is the one angle where bodywork hides its own wheels`,
          measured: azimuths
        });
      } else {
        checks.push({
          id: "rendered-wheel-visibility",
          verdict: "pass",
          detail: `wheels read across ${azimuths} camera angles in ${rendered?.screenshotPath ?? "the retained render"}`,
          measured: azimuths
        });
      }
    }

    if (geometry.detachedPartCount !== undefined && geometry.detachedPartCount > 0) {
      checks.push({
        id: "detached-geometry",
        verdict: "fail",
        detail: `${geometry.detachedPartCount} part(s) are detached from the body shell, which reads as components floating on stalks`,
        measured: geometry.detachedPartCount
      });
    }
  }

  // Grounding confidence: an asset whose lowest point is far from its origin needs the normalization
  // path to be exercised, and a caller should know that before trusting a placement.
  if (geometry.minY !== undefined) {
    const height = geometry.bounds[1];
    const offsetRatio = height > 0 ? Math.abs(geometry.minY) / height : 0;
    checks.push({
      id: "grounding-offset",
      verdict: "pass",
      detail: offsetRatio <= 0.02
        ? "lowest point sits effectively on the asset origin"
        : `lowest point sits ${(offsetRatio * 100).toFixed(1)}% of asset height from the origin; placement must use the normalization path rather than the raw origin`,
      measured: Number(offsetRatio.toFixed(4))
    });
  }

  /*
   * Normalization requirement, recorded as its own check rather than folded into grounding.
   *
   * These are different questions and were previously conflated in one message. Grounding asks "how far is the
   * lowest point from the origin"; normalization asks "must a caller scale this asset to a target size, or are
   * its units already scene-appropriate". `turboRaceCar` measures 186 x 176 x 378 units against a 1.1-unit
   * target -- a 344x fit -- and a route that skipped the normalization path would place a car the size of the
   * circuit. Reporting it separately means a caller can see the requirement without parsing prose.
   */
  {
    const longest = Math.max(...geometry.bounds);
    // Anything outside roughly scene-scale needs an explicit fit; 12 units is generous for a single subject.
    const needsNormalization = longest > 12 || longest < 0.08;
    checks.push({
      id: "normalization-required",
      verdict: "pass",
      detail: needsNormalization
        ? `longest axis is ${longest.toFixed(2)} units; placement must fit to a target size rather than use raw asset units`
        : `longest axis is ${longest.toFixed(2)} units, already scene-scale`,
      measured: Number(longest.toFixed(4))
    });
  }

  /*
   * Orientation evidence. Never inferred: a symmetric body has no intrinsic front, so a guess here becomes a car
   * driving backwards down the track. Absent evidence is `unproven` unless the role demands it, in which case it
   * is a `fail` -- the brief's "reject if required orientation evidence is absent".
   */
  {
    const declared = geometry.forwardAxis;
    const hasEvidence = Array.isArray(declared) && declared.some((component) => Math.abs(component) > 1e-6);
    /*
     * `not-applicable` when the role did not ask for orientation, not `unproven`.
     *
     * `unproven` forbids admission by design -- it is how "nobody measured whether the tyres are visible" stops
     * being mistaken for "the tyres are visible". Reporting absent-but-unrequested orientation as `unproven`
     * would therefore make *every* asset unadmissible, including a rock that has no meaningful forward axis. The
     * distinction that matters is: the role asked and we cannot answer (`fail`), versus the role never asked
     * (`not-applicable`). Both are recorded, so a reader sees the fact either way.
     */
    checks.push({
      id: "orientation-evidence",
      verdict: hasEvidence ? "pass" : requirement.requireOrientationEvidence ? "fail" : "not-applicable",
      detail: hasEvidence
        ? `manifest declares forward axis [${declared!.join(", ")}]`
        : requirement.requireOrientationEvidence
          ? "no manifest forward axis; orientation cannot be inferred from geometry and must not be guessed"
          : "no manifest forward axis; this role does not require one",
      measured: hasEvidence ? declared!.join(",") : false
    });
  }

  /*
   * Front/rear inference, kept distinct from orientation evidence.
   *
   * Orientation says *which way* the asset faces; this says whether front and rear are even distinguishable
   * from its geometry. A perfectly symmetric shell can carry a declared forward axis and still read ambiguously
   * to a viewer, which is a visual-fitness fact a hero role should surface.
   */
  if (geometry.frontRearDistinguishable !== undefined) {
    checks.push({
      id: "front-rear-inference",
      // A reported visual-fitness fact, not a gate: `unproven` would block admission (see orientation above).
      verdict: geometry.frontRearDistinguishable ? "pass" : "not-applicable",
      detail: geometry.frontRearDistinguishable
        ? "front and rear are geometrically distinguishable"
        : "front and rear are not geometrically distinguishable; a viewer may not read the facing direction",
      measured: geometry.frontRearDistinguishable
    });
  }

  /*
   * Origin/pivot sanity. An asset whose origin sits far from its bounds centre rotates around a point outside
   * itself, so a route that spins it appears to swing it on a boom. Distinct from grounding, which is only
   * about the vertical axis.
   */
  if (geometry.pivotOffsetRatio !== undefined) {
    const sane = geometry.pivotOffsetRatio <= 0.35;
    checks.push({
      id: "origin-pivot-sanity",
      verdict: sane ? "pass" : "fail",
      detail: sane
        ? `origin sits ${(geometry.pivotOffsetRatio * 100).toFixed(1)}% of the longest axis from the bounds centre`
        : `origin sits ${(geometry.pivotOffsetRatio * 100).toFixed(1)}% of the longest axis from the bounds centre; rotation will swing the asset around a point outside itself`,
      measured: Number(geometry.pivotOffsetRatio.toFixed(4))
    });
  }

  /*
   * Material completeness, distinct from the `textured` check.
   *
   * `textured` asks whether the asset uses textures at all. This asks whether every mesh part has a material
   * assigned: a part with none has no shader to draw with and renders as an untextured default or not at all,
   * which is one of the ways a "loads successfully" asset can still be visually broken.
   */
  if (geometry.partsWithoutMaterial !== undefined) {
    const complete = geometry.partsWithoutMaterial === 0;
    checks.push({
      id: "material-completeness",
      verdict: complete ? "pass" : "fail",
      detail: complete
        ? "every mesh part carries a material assignment"
        : `${geometry.partsWithoutMaterial} mesh part(s) carry no material assignment and have no shader to draw with`,
      measured: geometry.partsWithoutMaterial
    });
  }

  if (requirement.requireProvenance) {
    const complete = Boolean(provenance?.license && provenance?.author);
    checks.push({
      id: "provenance-complete",
      verdict: complete ? "pass" : "fail",
      detail: complete
        ? `${provenance?.license} by ${provenance?.author}`
        : `incomplete provenance (license: ${provenance?.license ?? "missing"}, author: ${provenance?.author ?? "missing"})`,
      measured: complete
    });
  }

  const blockers = checks
    .filter((check) => check.verdict === "fail")
    .map((check) => `${check.id}:${check.detail}`);
  const unproven = checks
    .filter((check) => check.verdict === "unproven")
    .map((check) => `${check.id}:${check.detail}`);

  return {
    schema: "aura3d-asset-role-admission/1.0",
    assetId: input.assetId,
    role: requirement.role,
    checks,
    admitted: blockers.length === 0 && unproven.length === 0,
    blockers,
    unproven,
    suitableAlternativeRoles: suggestAlternativeRoles(input, blockers.length > 0 || unproven.length > 0)
  };
}

/**
 * Suggest roles the asset would satisfy instead.
 *
 * This is what makes role-aware admission useful rather than merely stricter: rejecting
 * `showcaseCityVehicle` as a hero is correct, but it is still a good background traffic prop, and a
 * pipeline that only says "rejected" throws away that information.
 */
function suggestAlternativeRoles(input: AssetAdmissionInput, rejected: boolean): readonly AssetAdmissionRole[] {
  if (!rejected) return [];
  const roles: AssetAdmissionRole[] = [];
  const { geometry, requirement } = input;
  const isVehicleRequest = requirement.role === "hero-vehicle" || requirement.role === "background-vehicle";
  if (isVehicleRequest && requirement.role === "hero-vehicle" && geometry.partCount > 0) {
    // A shell or an enclosed-wheel body still reads correctly at distance.
    roles.push("background-vehicle");
  }
  if (geometry.partCount > 0 && geometry.triangles < HERO_MIN_TRIANGLES) roles.push("prop");
  return roles;
}

/**
 * Rank candidates for a role, best first.
 *
 * Admitted candidates always outrank rejected ones; within each group, fewer blockers then fewer
 * unproven checks then more triangles wins. Rejected candidates are **retained**, with their reasons,
 * because a screening loop needs to report why every candidate failed rather than silently discarding
 * them.
 */
export function rankAssetCandidatesForRole(inputs: readonly AssetAdmissionInput[]): readonly AssetAdmissionReport[] {
  return inputs
    .map((input) => admitAssetForRole(input))
    .sort((a, b) => {
      if (a.admitted !== b.admitted) return a.admitted ? -1 : 1;
      if (a.blockers.length !== b.blockers.length) return a.blockers.length - b.blockers.length;
      if (a.unproven.length !== b.unproven.length) return a.unproven.length - b.unproven.length;
      const aTriangles = inputs.find((input) => input.assetId === a.assetId)?.geometry.triangles ?? 0;
      const bTriangles = inputs.find((input) => input.assetId === b.assetId)?.geometry.triangles ?? 0;
      return bTriangles - aTriangles;
    });
}

function fmt(value: number | undefined): string {
  return value === undefined ? "unknown" : value.toFixed(2);
}
