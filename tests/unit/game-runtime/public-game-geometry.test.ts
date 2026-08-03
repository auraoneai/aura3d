import { describe, expect, it } from "vitest";
import { game, solvePlatformerMotion } from "../../../packages/engine/src";

describe("public game geometry certification", () => {
  it("certifies racing geometry only with real route structure, certified assets, and retained proof", () => {
    const base = createRacingContract();

    expect(game.certifyRacingGeometry({
      ...base,
      trackCertification: "candidate-needs-geometry",
      retainedProof: {
        ...base.retainedProof,
        visualReview: "fail",
        blockers: ["asset-pair:track-camera-composition-reads-as-proof-harness"]
      }
    })).toMatchObject({
      category: "racing",
      publicReady: false,
      blockers: expect.arrayContaining([
        "racing:track-certification:candidate-needs-geometry",
        "racing:retained-proof:visual-review-not-pass:fail",
        "racing:retained-proof:blocker:asset-pair:track-camera-composition-reads-as-proof-harness"
      ])
    });

    expect(game.certifyRacingGeometry(base)).toEqual({
      kind: "aura-public-game-geometry-certification",
      category: "racing",
      publicReady: true,
      blockers: [],
      certifications: {
        primary: "certified-generated-game-world",
        secondary: "certified-racing-vehicle"
      }
    });
  });

  it("builds public racing presentation helpers from certified route topology", () => {
    const { route, sceneBinding } = createRacingPresentationFixture();
    const roadMesh = game.racingRoadMesh({ sceneBinding, route, mode: "game-circuit" });
    const checkpointGate = game.racingCheckpointGate({ sceneBinding, route, progress: 0.25, index: 0 });
    const startFinish = game.racingStartFinish({ sceneBinding, route });
    const publicPresentation = game.publicRacingPresentation({
      sceneBinding,
      route,
      roadColor: "#343b3f",
      terrainColor: "#1f342e",
      curbColor: "#df3550",
      laneColor: "#d8f6ff"
    });

    expect(namesFor(roadMesh)).toEqual(expect.arrayContaining([
      "scene-bound racing terrain pad",
      "scene-bound racing road segment 1",
      "scene-bound racing center stripe 1",
      "scene-bound racing left curb 1"
    ]));
    expect(namesFor(checkpointGate)).toEqual(expect.arrayContaining([
      "scene-bound racing checkpoint gate 1 left post",
      "scene-bound racing checkpoint gate 1 overhead banner",
      "scene-bound racing checkpoint gate 1 left signal light",
      "scene-bound racing checkpoint gate 1 left cone marker"
    ]));
    expect(namesFor(startFinish)).toEqual(expect.arrayContaining([
      "scene-bound racing start finish checker 1",
      "scene-bound racing start finish gantry banner",
      "scene-bound racing start green light"
    ]));
    expect(publicPresentation.length).toBeGreaterThan(roadMesh.length + startFinish.length);
  });

  it("requires public presentation proof before certifying a racing route as presentation ready", () => {
    const base = createRacingContract();

    expect(game.certifyRacingPresentation({
      ...base,
      presentation: {
        roadMeshNodes: 18,
        checkpointGateNodes: base.checkpoints.length,
        startFinishNodes: 14,
        cameraMode: "follow",
        debugMarkerCount: 0
      }
    })).toMatchObject({
      category: "racing",
      publicReady: true,
      blockers: []
    });

    expect(game.certifyRacingPresentation({
      ...base,
      presentation: {
        roadMeshNodes: 3,
        checkpointGateNodes: 1,
        startFinishNodes: 1,
        cameraMode: "overview",
        debugMarkerCount: 2
      }
    })).toMatchObject({
      category: "racing",
      publicReady: false,
      blockers: expect.arrayContaining([
        "racing:presentation-road-mesh-too-small:3",
        "racing:presentation-checkpoint-gates-too-few:1",
        "racing:presentation-start-finish-too-small:1",
        "racing:presentation-camera-not-racing:overview",
        "racing:presentation-debug-markers:2"
      ])
    });
  });

  it("certifies platformer geometry only with playable surfaces, hazards, finish, and retained proof", () => {
    const base = createPlatformerContract();

    expect(game.certifyPlatformerGeometry({
      ...base,
      worldCertification: "not-game-ready",
      surfaces: base.surfaces.slice(0, 2),
      hazards: [],
      retainedProof: {
        ...base.retainedProof,
        routePrimaryScreenshotSha256: "missing"
      }
    })).toMatchObject({
      category: "platformer",
      publicReady: false,
      blockers: expect.arrayContaining([
        "platformer:world-certification:not-game-ready",
        "platformer:too-few-playable-surfaces:2",
        "platformer:missing-hazards",
        "platformer:retained-proof:screenshot-sha256-missing"
      ])
    });

    expect(game.certifyPlatformerGeometry(base)).toEqual({
      kind: "aura-public-game-geometry-certification",
      category: "platformer",
      publicReady: true,
      blockers: [],
      certifications: {
        primary: "certified-generated-game-world",
        secondary: "certified-platformer-character"
      }
    });
  });

  it("builds public platformer presentation helpers from certified playable surfaces", () => {
    const { level, sceneBinding } = createPlatformerPresentationFixture();
    const platforms = level.platforms ?? [];
    const hazards = level.hazards ?? [];
    const checkpoints = level.checkpoints ?? [];
    const ground = platforms[0];
    const platform = platforms[1];
    const hazard = hazards[0];
    const checkpoint = checkpoints[0];
    const finish = level.finish;
    if (!ground || !platform || !hazard || !checkpoint || !finish) throw new Error("platformer fixture is incomplete");

    const groundMesh = game.platformerGroundMesh({ sceneBinding, surface: ground });
    const platformMesh = game.platformerPlatformMesh({ sceneBinding, surface: platform });
    const hazardNodes = game.platformerHazard({ sceneBinding, hazard });
    const checkpointNodes = game.platformerCheckpoint({ sceneBinding, checkpoint });
    const finishNodes = game.platformerFinish({ sceneBinding, finish });
    const publicPresentation = game.publicPlatformerPresentation({
      sceneBinding,
      level,
      platformColor: "#526972",
      platformTrimColor: "#b7f3ff",
      hazardColor: "#ff6978",
      collectibleColor: "#fff1a8",
      finishColor: "#a6f7b2"
    });

    expect(namesFor(groundMesh)).toEqual(expect.arrayContaining([
      "scene-bound platformer ground mesh public-ground-01",
      "scene-bound platformer ground trim public-ground-01"
    ]));
    expect(namesFor(platformMesh)).toEqual(expect.arrayContaining([
      "scene-bound platformer platform mesh public-platform-02",
      "scene-bound platformer platform trim public-platform-02"
    ]));
    expect(namesFor(hazardNodes)).toContain("scene-bound platformer hazard public-hazard-01");
    expect(namesFor(checkpointNodes)).toContain("scene-bound platformer checkpoint public-cp-01");
    expect(namesFor(finishNodes)).toContain("scene-bound platformer finish marker");
    expect(namesFor(publicPresentation)).toEqual(expect.arrayContaining([
      "scene-bound platformer backdrop",
      "scene-bound platformer surface public-ground-01",
      "scene-bound platformer hazard public-hazard-01",
      "scene-bound platformer checkpoint public-cp-01",
      "scene-bound platformer finish marker"
    ]));
    expect(publicPresentation.length).toBeGreaterThan(platforms.length * 2);
  });

  it("requires public presentation proof before certifying a platformer route as presentation ready", () => {
    const base = createPlatformerContract();

    expect(game.certifyPlatformerPresentation({
      ...base,
      presentation: {
        groundMeshNodes: 2,
        platformMeshNodes: 8,
        hazardNodes: base.hazards.length,
        checkpointNodes: base.checkpoints.length,
        finishNodes: 1,
        cameraMode: "follow",
        debugMarkerCount: 0,
        characterGrounded: true
      }
    })).toMatchObject({
      category: "platformer",
      publicReady: true,
      blockers: []
    });

    expect(game.certifyPlatformerPresentation({
      ...base,
      presentation: {
        groundMeshNodes: 1,
        platformMeshNodes: 2,
        hazardNodes: 0,
        checkpointNodes: 1,
        finishNodes: 0,
        cameraMode: "establishing",
        debugMarkerCount: 2,
        characterGrounded: false
      }
    })).toMatchObject({
      category: "platformer",
      publicReady: false,
      blockers: expect.arrayContaining([
        "platformer:presentation-ground-mesh-too-small:1",
        "platformer:presentation-platform-mesh-too-small:2",
        "platformer:presentation-hazards-too-few:0",
        "platformer:presentation-checkpoints-too-few:1",
        "platformer:presentation-finish-missing:0",
        "platformer:presentation-camera-not-side-scroller:establishing",
        "platformer:presentation-debug-markers:2",
        "platformer:presentation-character-not-grounded"
      ])
    });
  });

  it("binds authored racing time to certified speed and certified road queries", () => {
    const { route } = createRacingPresentationFixture();
    expect(route.assetBinding.speedModel).toEqual({
      kind: "route-length-over-authored-lap-seconds",
      routeLength: route.assetBinding.routeLength,
      authoredLapSeconds: 34,
      certifiedSpeed: Number((route.assetBinding.routeLength / 34).toFixed(3)),
      units: "game-units-per-second"
    });

    const racing = game.racing({ route });
    expect(racing.surfaceQuery.certified).toBe(true);
    const { sceneBinding } = createRacingPresentationFixture();
    expect(sceneBinding.speedModel).toEqual({
      kind: "certified-route-to-scene-speed",
      routeLength: route.assetBinding.speedModel.routeLength,
      authoredLapSeconds: 34,
      gameUnitsPerSecond: route.assetBinding.speedModel.certifiedSpeed,
      sceneUnitsPerGameUnit: sceneBinding.transform.scale,
      sceneUnitsPerSecond: Number((route.assetBinding.speedModel.certifiedSpeed * sceneBinding.transform.scale).toFixed(6))
    });
    expect(racing.surfaceQuery.query(route.points[0] ?? { x: 0, y: 0 }).onTrack).toBe(true);
    expect(racing.surfaceQuery.query({ x: 100, y: 100 }).onTrack).toBe(false);
    expect(racing.maxSpeed).toBe(route.assetBinding.speedModel.certifiedSpeed);
    const arcadePace = game.racing({ route, paceMultiplier: 4 });
    expect(arcadePace.maxSpeed).toBeCloseTo(route.assetBinding.speedModel.certifiedSpeed * 4, 6);
    const initialHeading = racing.snapshot().heading;
    let driven = racing.snapshot();
    for (let frame = 0; frame < 120; frame += 1) {
      driven = racing.step(1 / 60, { throttle: true, steer: frame >= 54 ? 1 : 0 });
    }
    expect(driven.heading).not.toBe(initialHeading);
    expect(driven.trackOffset).toBeLessThanOrEqual(driven.kind === "aura-game-racing-kit" ? (route.width ?? 1.2) / 2 : 0);
    expect(racing.surfaceQuery.query(driven.position).onTrack).toBe(true);
    expect(() => game.racing({ route, maxSpeed: route.assetBinding.speedModel.certifiedSpeed + 1 })).toThrow(/conflicts with certified route speed/);
  });

  it("grounds safe-rendered platformer character origins on certified surface contact", () => {
    const { level, sceneBinding } = createPlatformerPresentationFixture();
    const player = game.platformer(level).snapshot().player;
    const pose = sceneBinding.toScenePlayer(player);
    const contact = sceneBinding.contactPointForPlayer(player);

    expect(pose.position[0]).toBe(contact[0]);
    expect(pose.position[1]).toBeCloseTo(contact[1] + 0.03, 6);
    expect(pose.position[2]).toBe(contact[2]);
    expect(sceneBinding.evidence.playerTargetHeight).toBe(0.78);
  });

  it("uses certified platformer surfaces for reusable ground-contact queries", () => {
    const { level } = createPlatformerPresentationFixture();
    const platformer = game.platformer(level);
    const surface = level.platforms?.[0];
    if (!surface) throw new Error("fixture requires a platform surface");
    const top = surface.y + surface.height;
    const contact = platformer.surfaceQuery.groundContact({
      previousPlayer: { x: surface.x + surface.width / 2, y: top + 0.1 },
      player: { x: surface.x + surface.width / 2, y: top, vy: -1 }
    });
    expect(platformer.surfaceQuery.certified).toBe(true);
    expect(contact).toEqual({ grounded: true, surfaceId: surface.id, surfaceTop: top });
  });

  it("selects chase and top-down racing rigs only from passing composition evidence", () => {
    const { route, sceneBinding } = createRacingPresentationFixture();
    const focus = game.racing({ route }).snapshot();
    const composition = {
      report: "tests/reports/showcase-spec-compiler/fixture/asset-pair-composition.json",
      verdict: "pass" as const,
      cameraReadabilityVerdict: "pass" as const,
      selectedMode: "chase" as "chase" | "top-down"
    };
    const chase = game.racingCameraRig({ sceneBinding, focus, mode: "chase", composition, targetNode: "car" });
    const topDown = game.racingCameraRig({
      sceneBinding,
      focus,
      mode: "top-down",
      composition: { ...composition, selectedMode: "top-down" },
      targetNode: "car",
      distance: 4.2,
      height: 3.2
    });
    expect(chase).toMatchObject({ mode: "follow", selectionEvidence: { selectedMode: "chase", verdict: "pass" } });
    expect(topDown).toMatchObject({
      mode: "follow",
      targetNode: "car",
      offsetMode: "scene",
      offset: [0, 3.2, 4.2],
      selectionEvidence: { selectedMode: "top-down", verdict: "pass" }
    });
    expect(() => game.racingCameraRig({
      sceneBinding,
      focus,
      mode: "chase",
      composition: { ...composition, cameraReadabilityVerdict: "fail" }
    })).toThrow(/requires passing asset-pair composition/);
    expect(() => game.racingCameraRig({
      sceneBinding,
      focus,
      mode: "top-down",
      composition
    })).toThrow(/conflicts with composition-selected mode chase/);
  });
});

function createRacingContract() {
  return {
    trackAsset: "showcaseRacingProofTrack",
    vehicleAsset: "showcaseTexturedSportsCar",
    trackCertification: "certified-generated-game-world",
    vehicleCertification: "certified-racing-vehicle",
    geometrySource: "compiler-authored-overlay-validated",
    roadWidth: 1.4,
    roadCenterline: [
      { x: -3, z: 0 },
      { x: -2, z: 1.4 },
      { x: -0.8, z: 1.8 },
      { x: 0.8, z: 1.4 },
      { x: 2.3, z: 0.2 },
      { x: 1.6, z: -1.4 },
      { x: 0, z: -2 },
      { x: -1.8, z: -1.4 },
      { x: -3, z: 0 }
    ],
    startPose: { x: -3, z: 0, heading: 0.68 },
    checkpoints: [
      { id: "cp-01", progress: 0.2, width: 1.4 },
      { id: "cp-02", progress: 0.4, width: 1.4 },
      { id: "cp-03", progress: 0.6, width: 1.4 },
      { id: "cp-04", progress: 0.8, width: 1.4 }
    ],
    lap: { finishProgress: 1, lapsToWin: 2, minLapSeconds: 30 },
    drivableBounds: { minX: -3.8, maxX: 2.8, minZ: -2.4, maxZ: 2.2 },
    cameraBounds: { minX: -4.2, maxX: 3.2, minZ: -2.8, maxZ: 2.6 },
    vehicleScale: { width: 0.56, length: 1.08 },
    retainedProof: retainedProof()
  } as const;
}

function createRacingPresentationFixture() {
  const routeWidth = 0.42;
  const checkpointProgress = [0.2, 0.4, 0.6, 0.8] as const;
  const roadCenterline = [
    { x: -3, z: 0, width: routeWidth },
    { x: -2, z: 1.4, width: routeWidth },
    { x: -0.8, z: 1.8, width: routeWidth },
    { x: 0.8, z: 1.4, width: routeWidth },
    { x: 2.3, z: 0.2, width: routeWidth },
    { x: 1.6, z: -1.4, width: routeWidth },
    { x: 0, z: -2, width: routeWidth },
    { x: -1.8, z: -1.4, width: routeWidth },
    { x: -3, z: 0, width: routeWidth }
  ] as const;
  const topology = {
    assetId: "showcaseRacingProofTrack",
    assetHash: "sha256-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    source: "compiler-authored-overlay-validated",
    roadCenterline,
    checkpoints: checkpointProgress.map((progress) => ({ progress, width: routeWidth })),
    lapLengthMeters: 8.2,
    estimatedLapSeconds: 34,
    confidence: 0.88,
    modelAlignment: {
      source: "compiler-authored-overlay-validated",
      modelBounds: { min: [-4, -0.2, -4], max: [4, 0.2, 4] },
      modelPoint: [0, 0, 0],
      gamePoint: { x: 0, z: 0 },
      anchorPairs: [
        { id: "start", modelPoint: [-3, 0, 0], gamePoint: { x: -3, z: 0 } },
        { id: "far", modelPoint: [2.3, 0, 0.2], gamePoint: { x: 2.3, z: 0.2 } }
      ],
      evidence: { routeOverlay: "tests/reports/showcase-route-primary-probes/showcase-racing-game-layer-proof.png", notes: "Fixture topology." }
    },
    evidence: {
      sourceAsset: "assets.showcaseRacingProofTrack",
      renderedProbe: "tests/reports/showcase-release-asset-probes/showcaseRacingProofTrack.png",
      routeOverlay: "tests/reports/showcase-route-primary-probes/showcase-racing-game-layer-proof.png",
      notes: "Fixture topology."
    }
  } as const;
  const route = game.assetBoundRacingRoute({
    vehicleAsset: "showcaseTexturedSportsCar",
    trackAsset: "showcaseRacingProofTrack",
    authoredLapSeconds: 34,
    minLapSeconds: 30,
    minCheckpoints: checkpointProgress.length,
    topology,
    route: {
      id: "public-racing-presentation-fixture",
      width: routeWidth,
      points: roadCenterline.map((point) => ({ x: point.x, y: point.z })),
      checkpoints: [...checkpointProgress]
    }
  });
  const sceneBinding = game.racingSceneBinding({
    topology,
    route,
    trackAsset: "showcaseRacingProofTrack",
    targetSceneSize: 5.4,
    trackModelTargetMaxDimension: 8,
    trackY: -0.12,
    carY: 0.24,
    requireOverlayEvidence: false
  });
  return { route, sceneBinding } as const;
}

function createPlatformerPresentationFixture() {
  const surfaces = [
    { id: "public-ground-01", x: 1.8, y: 0, width: 5.2, height: 0.4, kind: "ground" },
    { id: "public-platform-02", x: 6.8, y: 0.62, width: 3.6, height: 0.32, kind: "platform" },
    { id: "public-platform-03", x: 10.8, y: 1.04, width: 3.8, height: 0.32, kind: "platform" },
    { id: "public-platform-04", x: 15.1, y: 0.54, width: 4.2, height: 0.32, kind: "platform" },
    { id: "public-finish-run", x: 20, y: 0.86, width: 5.6, height: 0.32, kind: "platform" }
  ] as const;
  const hazards = [
    { id: "public-hazard-01", x: 7.9, y: 0.9, width: 0.55, height: 0.34, kind: "hazard" },
    { id: "public-hazard-02", x: 15.8, y: 0.79, width: 0.55, height: 0.34, kind: "hazard" }
  ] as const;
  const checkpoints = [
    { id: "public-cp-01", x: 4.4, y: 0.82, width: 1.1, height: 1.1, kind: "checkpoint" },
    { id: "public-cp-02", x: 10.9, y: 1.42, width: 1.1, height: 1.1, kind: "checkpoint" },
    { id: "public-cp-03", x: 16.7, y: 0.96, width: 1.1, height: 1.1, kind: "checkpoint" }
  ] as const;
  const playableSurfaceMap = {
    assetId: "showcaseSideScrollerWorld",
    assetHash: "sha256-68e115700a600bb3cfee70d0e0f75083c07cb6e38f29379aa935d871681a59b4",
    source: "compiler-authored-overlay-validated",
    surfaces: [...surfaces, ...hazards, ...checkpoints],
    levelLength: 23.2,
    estimatedCompletionSeconds: 34,
    characterScaleRatio: 0.38,
    confidence: 0.88,
    modelAlignment: {
      source: "compiler-authored-overlay-validated",
      modelBounds: { min: [-0.8, 0, -1], max: [22.8, 3.2, 1] },
      modelPoint: [1.8, 0, 0],
      gamePoint: { x: 1.8, y: 0 },
      anchorPairs: [
        { id: "public-start", modelPoint: [1.8, 0, 0], gamePoint: { x: 1.8, y: 0 } },
        { id: "public-finish", modelPoint: [20, 0.86, 0], gamePoint: { x: 20, y: 0.86 } }
      ],
      evidence: { routeOverlay: "tests/reports/showcase-route-primary-probes/showcase-platformer-game-layer-proof.png", notes: "Fixture platformer surface map." }
    },
    evidence: {
      sourceAsset: "assets.showcaseSideScrollerWorld",
      renderedProbe: "tests/reports/showcase-release-asset-probes/showcaseSideScrollerWorld.png",
      routeOverlay: "tests/reports/showcase-route-primary-probes/showcase-platformer-game-layer-proof.png",
      notes: "Fixture surface map."
    }
  } as const;
  const level = game.assetBoundPlatformerLevel({
    characterAsset: "showcaseWalkAnimatedGirl",
    worldAssetBindings: [{
      worldAsset: "showcaseSideScrollerWorld",
      worldAssetHash: playableSurfaceMap.assetHash,
      surfaceSource: playableSurfaceMap.source,
      confidence: playableSurfaceMap.confidence,
      surfaceIds: surfaces.map((surface) => surface.id)
    }],
    playableSurfaceMap,
    minPlayableSeconds: 30,
    /*
     * Authored duration must be stated once motion is derived.
     *
     * `authoredPlayableSeconds` defaults to raw traversal time (course length / move
     * speed). Deriving a move speed fast enough to clear the fixture's 0.6-unit gaps makes
     * that traversal shorter than the 30s floor, even though a real session -- jumping,
     * retrying, collecting -- lasts far longer. Traversal time is a lower bound on session
     * length, not an estimate of it, so the authored duration is stated explicitly.
     */
    authoredPlayableSeconds: 120,
    minCheckpoints: checkpoints.length,
    level: {
      id: "public-platformer-presentation-fixture",
      start: { x: 0.6, y: 0.4 },
      finish: { x: 21.8, y: 1.18 },
      /*
       * Motion derived from the fixture's own surfaces.
       *
       * The hardcoded `moveSpeed: 0.62, jumpVelocity: 7.4` was rejected by the new
       * motion validator for a real reason: a full jump reached 0.42 units against a
       * 0.6-unit gap, so the fixture level was not traversable. It passed before only
       * because nothing compared jump reach to gap width. Deriving the values makes the
       * fixture a playable level, which is what a presentation fixture should be.
       */
      ...(() => {
        const motion = solvePlatformerMotion(
          surfaces.map((surface) => ({ id: surface.id, x: surface.x - surface.width / 2, y: surface.y, width: surface.width, height: surface.height })),
          { riseSeconds: 0.28, targetSessionSeconds: 120 }
        );
        return { moveSpeed: motion.moveSpeed, jumpVelocity: motion.jumpVelocity, gravity: motion.gravity };
      })(),
      lowerBound: -1.5,
      platforms: surfaces.map((surface) => ({ id: surface.id, x: surface.x - surface.width / 2, y: surface.y, width: surface.width, height: surface.height })),
      hazards: hazards.map((hazard) => ({ id: hazard.id, x: hazard.x - hazard.width / 2, y: hazard.y, width: hazard.width, height: hazard.height, respawn: true })),
      checkpoints: checkpoints.map((checkpoint) => ({ id: checkpoint.id, x: checkpoint.x, y: checkpoint.y, radius: 0.85 }))
    }
  });
  const sceneBinding = game.platformerSceneBinding({
    surfaceMap: playableSurfaceMap,
    level,
    worldAsset: "showcaseSideScrollerWorld",
    targetSceneWidth: 5.8,
    worldModelTargetMaxDimension: 5.8,
    worldY: -0.74,
    worldZ: -0.52,
    playerZ: 0.48,
    playerTargetHeight: 0.78,
    playerYOffset: 0.03
  });
  return { level, sceneBinding } as const;
}

function namesFor(nodes: readonly unknown[]): readonly string[] {
  return nodes.map((node) => isNamedNode(node) ? node.name ?? "" : "");
}

function isNamedNode(node: unknown): node is { readonly name?: string } {
  return typeof node === "object" && node !== null && "name" in node;
}

function createPlatformerContract() {
  return {
    worldAssets: ["showcasePlatformerProofWorld"],
    characterAsset: "showcaseWalkAnimatedGirl",
    worldCertification: "certified-generated-game-world",
    characterCertification: "certified-platformer-character",
    geometrySource: "compiler-authored-overlay-validated",
    spawn: { x: 0, y: 1.1 },
    surfaces: [
      { id: "ground-01", x: 0, y: 0, width: 5, height: 0.4, kind: "ground" },
      { id: "platform-02", x: 5.8, y: 0.8, width: 3.6, height: 0.32, kind: "platform" },
      { id: "platform-03", x: 10.1, y: 1.2, width: 3.8, height: 0.32, kind: "platform" },
      { id: "platform-04", x: 14.7, y: 0.6, width: 4.2, height: 0.32, kind: "platform" },
      { id: "finish-run", x: 19.4, y: 0.9, width: 4.8, height: 0.32, kind: "finish" }
    ],
    hazards: [
      { id: "hazard-01", x: 8.8, y: 0.9, width: 0.55, height: 0.35, respawn: true }
    ],
    checkpoints: [
      { id: "cp-01", x: 5.2, y: 1.4, radius: 0.9 },
      { id: "cp-02", x: 13.2, y: 1.8, radius: 0.9 },
      { id: "finish-cp", x: 20.8, y: 1.4, radius: 0.9 }
    ],
    finish: { x: 21.5, y: 1.1 },
    worldBounds: { minX: -1, maxX: 23, minY: -2, maxY: 5 },
    cameraBounds: { minX: -1.5, maxX: 23.5, minY: -0.5, maxY: 5.5 },
    characterScale: { width: 0.48, height: 1.22 },
    retainedProof: retainedProof()
  } as const;
}

function retainedProof() {
  return {
    routePrimaryScreenshot: "tests/reports/showcase-route-primary-probes/showcase-game-layer-proof.png",
    routePrimaryScreenshotSha256: "sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    geometryReport: "tests/reports/showcase-spec-compiler/showcase-game-layer-proof/game-template/geometry.json",
    manifestHash: "sha256-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    visualReview: "pass",
    assetPairPass: true,
    blockers: []
  } as const;
}
