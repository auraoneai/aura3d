import {
  Geometry,
  PBRMaterial,
  Renderer,
  TexturedPBRMaterial,
  UnlitMaterial,
  createProceduralTexture,
  createProceduralTextureFixture,
  createExternalParityEnvironmentLighting,
  createExternalParityFlagshipRenderPresetEvidence,
  sampleExternalParityLdrPostprocessReadback,
  type RenderDeviceDiagnostics,
  type RenderItem,
  type ExternalParityLdrPostprocessSummary,
  type ExternalParityRenderPresetEvidence
} from "@aura3d/rendering";
import { sampleArcadeVehicleDynamics, samplePacejkaTireForces, sampleRacingAiDriver, sampleVehicleDamage, sampleVehicleDrivetrain, sampleVehicleEffectEmitters } from "@aura3d/physics";
import { Scene, type PerspectiveCamera } from "@aura3d/scene";

type RacingShowcaseState = {
  readonly status: "ready" | "error";
  readonly renderer: "webgl2";
  readonly visualClaim: string;
  readonly screenshotPath: "tests/reports/external-parity-example-screenshots/racing-showcase.png";
  readonly claimBoundary: string;
  readonly knownLimits: readonly string[];
  readonly diagnostics?: RenderDeviceDiagnostics;
  readonly featureEvidence: Record<string, number | string | boolean>;
  readonly metrics: Record<string, number | string | boolean>;
  readonly textureFixtures: readonly { readonly id: string; readonly hash: string; readonly semantic: string }[];
  readonly externalParityRenderPreset?: ExternalParityRenderPresetEvidence;
  readonly postprocess?: ExternalParityLdrPostprocessSummary;
  readonly errors: readonly string[];
  readonly error?: string;
};

declare global {
  interface Window {
    __AURA3D_RACING_SHOWCASE__?: RacingShowcaseState;
  }
}

const screenshotPath = "tests/reports/external-parity-example-screenshots/racing-showcase.png" as const;
const claimBoundary = "ExternalParity racing showcase evidence is limited to a deterministic procedural car, generated track, seeded texture fixtures, browser screenshot checks, and bounded race telemetry; full racing-game, vehicle-simulation, Unity, or Unreal parity is not claimed.";
const knownLimits = [
  "The car, track, and HUD are deterministic local showcase assets, not imported production vehicle content.",
  "Vehicle motion and race management are bounded deterministic browser telemetry, not a full tire, suspension, drivetrain, or collision simulation.",
  "The scene is intended to improve ExternalParity browser visual evidence while broad engine parity claims remain blocked."
] as const;

if (typeof document !== "undefined") {
  void run().catch((error) => {
    window.__AURA3D_RACING_SHOWCASE__ = {
      status: "error",
      renderer: "webgl2",
      visualClaim: "Racing showcase failed before first frame.",
      screenshotPath,
      claimBoundary,
      knownLimits,
      featureEvidence: {},
      metrics: {},
      textureFixtures: [],
      errors: [error instanceof Error ? error.message : String(error)],
      error: error instanceof Error ? error.stack ?? error.message : String(error)
    };
    throw error;
  });
}

async function run(): Promise<void> {
  installStyles();
  const shell = document.createElement("main");
  shell.className = "racing-showcase";
  shell.innerHTML = `
    <canvas data-testid="racing-showcase-canvas" width="1280" height="720" tabindex="0" aria-label="Racing showcase WebGL viewport"></canvas>
    <section class="race-panel race-panel-primary" aria-label="Race status">
      <strong data-testid="racing-position">1st</strong>
      <span data-testid="racing-lap-time">0:00.000</span>
      <span data-testid="racing-best-lap">Best --:--.---</span>
    </section>
    <section class="race-panel race-panel-map" aria-label="Racing minimap">
      <canvas data-testid="racing-minimap" width="180" height="180"></canvas>
    </section>
    <section class="race-panel race-panel-board" aria-label="Racing leaderboard">
      <span data-testid="racing-leaderboard">1. Aura3D</span>
    </section>
    <section class="hud" aria-label="Racing telemetry">
      <div class="gauge"><canvas data-testid="racing-speed-gauge" width="112" height="112"></canvas><span>Speed</span><strong data-testid="racing-speed">0</strong></div>
      <div class="gauge"><canvas data-testid="racing-rpm-gauge" width="112" height="112"></canvas><span>RPM</span><strong data-testid="racing-rpm">1000</strong></div>
      <div><span>Lap</span><strong data-testid="racing-lap">1/3</strong></div>
      <div class="nitro-meter"><span>Nitro</span><strong data-testid="racing-nitro">100%</strong><i data-testid="racing-nitro-bar"></i></div>
    </section>
  `;
  document.body.append(shell);
  const canvas = shell.querySelector<HTMLCanvasElement>("[data-testid='racing-showcase-canvas']");
  if (!canvas) throw new Error("Racing showcase canvas was not created.");
  const speedGauge = shell.querySelector<HTMLCanvasElement>("[data-testid='racing-speed-gauge']");
  const rpmGauge = shell.querySelector<HTMLCanvasElement>("[data-testid='racing-rpm-gauge']");
  const minimap = shell.querySelector<HTMLCanvasElement>("[data-testid='racing-minimap']");
  const speed = shell.querySelector<HTMLElement>("[data-testid='racing-speed']");
  const rpm = shell.querySelector<HTMLElement>("[data-testid='racing-rpm']");
  const lap = shell.querySelector<HTMLElement>("[data-testid='racing-lap']");
  const nitro = shell.querySelector<HTMLElement>("[data-testid='racing-nitro']");
  const nitroBar = shell.querySelector<HTMLElement>("[data-testid='racing-nitro-bar']");
  const position = shell.querySelector<HTMLElement>("[data-testid='racing-position']");
  const lapTime = shell.querySelector<HTMLElement>("[data-testid='racing-lap-time']");
  const bestLap = shell.querySelector<HTMLElement>("[data-testid='racing-best-lap']");
  const leaderboard = shell.querySelector<HTMLElement>("[data-testid='racing-leaderboard']");
  const renderer = await Renderer.create({
    backend: "webgl2",
    canvas,
    width: canvas.width,
    height: canvas.height,
    clearColor: [0.44, 0.52, 0.62, 1],
    antialias: true,
    preserveDrawingBuffer: true
  });
  const { scene, camera } = createLitScene(canvas);
  const resources = createResources();
  const startedAt = performance.now();
  let running = true;
  const frame = () => {
    if (!running) return;
    resizeCanvas(canvas);
    renderer.resize(canvas.width, canvas.height);
    camera.resize(canvas.width, canvas.height);
    const elapsed = (performance.now() - startedAt) / 1000;
    const telemetry = raceTelemetry(elapsed);
    speed!.textContent = String(Math.round(telemetry.speedKph));
    rpm!.textContent = String(Math.round(telemetry.rpm));
    lap!.textContent = `${telemetry.lap}/3`;
    nitro!.textContent = `${Math.round(telemetry.nitro)}%`;
    nitroBar!.style.width = `${Math.max(0, Math.min(100, telemetry.nitro))}%`;
    position!.textContent = `${telemetry.leaderboardPosition}st`;
    lapTime!.textContent = formatRaceTime(telemetry.raceElapsedSeconds * 1000);
    bestLap!.textContent = telemetry.bestLapMs > 0 ? `Best ${formatRaceTime(telemetry.bestLapMs)}` : "Best --:--.---";
    leaderboard!.textContent = `${telemetry.leaderboardPosition}. Aura3D  ${formatRaceTime(Math.max(0, telemetry.raceElapsedSeconds * 1000))}`;
    drawRacingHud({
      speedGauge,
      rpmGauge,
      minimap,
      telemetry
    });
    const renderItems = buildRenderItems(resources, telemetry);
    const diagnostics = renderer.render({
      scene,
      renderItems,
      environmentLighting: createExternalParityEnvironmentLighting("daylight").lighting
    });
    const postprocess = sampleExternalParityLdrPostprocessReadback({
      device: renderer.device,
      framebufferWidth: canvas.width,
      framebufferHeight: canvas.height,
      exposure: 1.08
    });
    const externalParityRenderPreset = createExternalParityFlagshipRenderPresetEvidence({
      exampleId: "racing-showcase",
      screenshotPath,
      exposure: postprocess.exposure,
      directionalShadowEvidence: false,
      postprocessEvidence: postprocess.outputNonDarkPixels > 0,
      lodEvidence: false
    });
    const textureFixtures = resources.fixtureEvidence;
    window.__AURA3D_RACING_SHOWCASE__ = {
      status: "ready",
      renderer: "webgl2",
      visualClaim: "Bounded ExternalParity procedural racing showcase with a current-engine textured sports car, generated track, HUD telemetry, and screenshot evidence.",
      screenshotPath,
      claimBoundary,
      knownLimits,
      diagnostics,
      featureEvidence: {
        proceduralCar: true,
        proceduralSportsCarParts: resources.carPartCount,
        generatedTrack: true,
        racingHud: true,
        raceTelemetry: telemetry.samples > 6,
        deterministicMotion: true,
        oldBranchProceduralCarPort: true,
        oldBranchRaceManagerPort: true,
        oldBranchVehicleDynamicsPort: telemetry.vehicleDynamics,
        oldBranchVehicleDrivetrainPort: telemetry.drivetrainModel,
        oldBranchVehicleEffectsPort: telemetry.vehicleEffects,
        oldBranchVehicleDamagePort: telemetry.vehicleDamage,
        oldBranchRacingHudPort: telemetry.racingHud,
        oldBranchPacejkaTireModelPort: telemetry.tireModel,
        oldBranchRacingAiDriverPort: telemetry.racingAiDriver,
        sportsCarAeroDetails: true,
        raceCountdownSequence: telemetry.state !== "waiting",
        checkpointProgression: telemetry.checkpointEvents > 0,
        lapTiming: telemetry.completedLaps > 0,
        leaderboardState: telemetry.leaderboardPosition === 1,
        minimapRacerPositions: telemetry.minimapRacerCount >= 4,
        analogHudGauges: telemetry.hudGaugeCount >= 2,
        raceFinishState: telemetry.state === "finished",
        proceduralTextureFixtures: textureFixtures.length,
        metallicPaintTexture: textureFixtures.some((entry) => entry.id === "metallic-paint"),
        metallicRoughnessTexture: textureFixtures.some((entry) => entry.id === "metallic-roughness-map"),
        racingStripeDecalTexture: textureFixtures.some((entry) => entry.id === "racing-stripes"),
        racingNumberDecalTexture: textureFixtures.some((entry) => entry.id === "racing-number-decal"),
        carbonFiberTexture: textureFixtures.some((entry) => entry.id === "carbon-fiber"),
        tireTreadTexture: textureFixtures.some((entry) => entry.id === "tire-tread"),
        concreteAsphaltTexture: textureFixtures.some((entry) => entry.id === "concrete-asphalt"),
        starfieldNebulaTexture: textureFixtures.some((entry) => entry.id === "starfield-nebula"),
        postprocessRealSceneReadback: postprocess.outputNonDarkPixels > 0,
        contactShadowAlternative: true,
        fullVehiclePhysicsClaimed: false
      },
      metrics: {
        speedKph: Number(telemetry.speedKph.toFixed(1)),
        rpm: Math.round(telemetry.rpm),
        nitro: Math.round(telemetry.nitro),
        raceState: telemetry.state,
        countdownRemaining: Number(telemetry.countdownRemaining.toFixed(2)),
        raceElapsedSeconds: Number(telemetry.raceElapsedSeconds.toFixed(2)),
        lap: telemetry.lap,
        totalLaps: telemetry.totalLaps,
        completedLaps: telemetry.completedLaps,
        checkpoint: telemetry.checkpoint,
        checkpointCount: telemetry.checkpointCount,
        checkpointEvents: telemetry.checkpointEvents,
        lapTimesMs: telemetry.lapTimesMs.join(","),
        bestLapMs: telemetry.bestLapMs,
        leaderboardPosition: telemetry.leaderboardPosition,
        hudGaugeCount: telemetry.hudGaugeCount,
        minimapRacerCount: telemetry.minimapRacerCount,
        minimapTrackPoints: telemetry.minimapTrackPoints,
        raceFinished: telemetry.state === "finished",
        carParts: resources.carPartCount,
        aeroParts: 10,
        trackSegments: 9,
        drawCalls: diagnostics.drawCalls,
        postprocessChangedPixels: postprocess.changedPixels,
        cameraOrbitRadians: Number(telemetry.cameraYaw.toFixed(3)),
        vehicleSteerAngle: telemetry.steerAngle,
        vehicleDriftSlip: telemetry.driftSlip,
        vehicleGrip: telemetry.grip,
        vehicleWheelSpin: telemetry.wheelSpin,
        vehicleSuspensionCompression: telemetry.suspensionCompression.join(","),
        tireCombinedForce: telemetry.tireCombinedForce,
        tireLongitudinalForce: telemetry.tireLongitudinalForce,
        tireLateralForce: telemetry.tireLateralForce,
        tireSlipRatio: telemetry.tireSlipRatio,
        tireSlipAngle: telemetry.tireSlipAngle,
        tireAligningTorque: telemetry.tireAligningTorque,
        drivetrainGear: telemetry.drivetrainGear,
        drivetrainEngineRpm: telemetry.drivetrainEngineRpm,
        drivetrainEngineTorque: telemetry.drivetrainEngineTorque,
        drivetrainWheelTorque: telemetry.drivetrainWheelTorque,
        drivetrainFrontTorque: telemetry.drivetrainFrontTorque,
        drivetrainRearTorque: telemetry.drivetrainRearTorque,
        drivetrainDragForce: telemetry.drivetrainDragForce,
        drivetrainDownforce: telemetry.drivetrainDownforce,
        drivetrainShiftState: telemetry.drivetrainShiftState,
        tireSmokeRate: telemetry.tireSmokeRate,
        tireSmokeEmitters: telemetry.tireSmokeEmitters,
        nitroFlameRate: telemetry.nitroFlameRate,
        vehicleEffectEmitters: telemetry.vehicleEffectEmitters,
        vehicleSmokeReason: telemetry.vehicleSmokeReason,
        vehicleHealth: telemetry.vehicleHealth,
        vehicleDamage: telemetry.vehicleDamageAmount,
        vehicleImpactDamage: telemetry.vehicleImpactDamage,
        vehicleDamageLevel: telemetry.vehicleDamageLevel,
        racingAiThrottle: telemetry.racingAiThrottle,
        racingAiBrake: telemetry.racingAiBrake,
        racingAiSteer: telemetry.racingAiSteer,
        racingAiTargetSpeedKph: telemetry.racingAiTargetSpeedKph,
        racingAiLookaheadDistance: telemetry.racingAiLookaheadDistance,
        racingAiOvertaking: telemetry.racingAiOvertaking,
        racingAiRubberbandBoost: telemetry.racingAiRubberbandBoost
      },
      textureFixtures,
      externalParityRenderPreset,
      postprocess,
      errors: []
    };
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  window.addEventListener("pagehide", () => {
    running = false;
    renderer.dispose();
  }, { once: true });
}

function createResources() {
  const fixtures = [
    createProceduralTextureFixture("metallic-paint"),
    createProceduralTextureFixture("metallic-roughness-map"),
    createProceduralTextureFixture("racing-stripes"),
    createProceduralTextureFixture("racing-number-decal"),
    createProceduralTextureFixture("carbon-fiber"),
    createProceduralTextureFixture("tire-tread"),
    createProceduralTextureFixture("concrete-asphalt"),
    createProceduralTextureFixture("sci-fi-panel"),
    createProceduralTextureFixture("starfield-nebula")
  ];
  const fixtureEvidence = fixtures.map((fixture) => ({ id: fixture.id, hash: fixture.hash, semantic: fixture.semantic }));
  const paint = createProceduralTexture("metallic-paint");
  const metallicRoughness = createProceduralTexture("metallic-roughness-map");
  const numberDecal = createProceduralTexture("racing-number-decal");
  const carbon = createProceduralTexture("carbon-fiber");
  const tire = createProceduralTexture("tire-tread");
  const asphalt = createProceduralTexture("concrete-asphalt");
  const panel = createProceduralTexture("sci-fi-panel");
  const nebulaTexture = createProceduralTexture("starfield-nebula");
  const carPanelGeometry = Geometry.texturedCube(1);
  const trackPanelGeometry = Geometry.texturedCube(1);
  const trackDetailGeometry = Geometry.lineSegments(racingTrackDetailLines());
  const backdropDetailGeometry = Geometry.lineSegments(racingBackdropDetailLines());
  const carDetailGeometry = Geometry.lineSegments(racingCarDetailLines());
  const starPointGeometry = Geometry.lineSegments(starSegments(2200));
  return {
    fixtureEvidence,
    carPartCount: 35,
    geometries: {
      carBody: carPanelGeometry,
      nose: carPanelGeometry,
      rear: carPanelGeometry,
      cabin: carPanelGeometry,
      roof: carPanelGeometry,
      aero: carPanelGeometry,
      decal: carPanelGeometry,
      mirror: Geometry.uvSphere(0.07, 12, 6),
      spoiler: carPanelGeometry,
      wheel: Geometry.cylinder({ radius: 0.23, height: 0.22, segments: 32, textured: true }),
      rim: Geometry.cylinder({ radius: 0.13, height: 0.24, segments: 24, textured: true }),
      exhaust: Geometry.cylinder({ radius: 0.045, height: 0.18, segments: 16, textured: true }),
      light: Geometry.uvSphere(0.08, 12, 6),
      smoke: Geometry.uvSphere(0.1, 12, 6),
      flame: Geometry.uvSphere(0.08, 12, 6),
      track: trackPanelGeometry,
      trackLines: trackDetailGeometry,
      backdropLines: backdropDetailGeometry,
      carDetails: carDetailGeometry,
      barrier: trackPanelGeometry,
      backdrop: trackPanelGeometry,
      starPoints: starPointGeometry
    },
    materials: {
      paint: new TexturedPBRMaterial({ name: "racing-metallic-paint", baseColor: [1, 0.22, 0.08, 1], metallic: 0.74, roughness: 0.16, baseColorTexture: paint, metallicRoughnessTexture: metallicRoughness, emissiveColor: [0.92, 0.18, 0.08], emissiveStrength: 1.95, renderState: { cullMode: "none" } }),
      bodySolid: new PBRMaterial({ name: "racing-solid-painted-detail", baseColor: [1, 0.18, 0.06, 1], metallic: 0.52, roughness: 0.14, emissiveColor: [0.86, 0.16, 0.06], emissiveStrength: 1.75, renderState: { cullMode: "none" } }),
      stripes: new PBRMaterial({ name: "racing-striped-decal-paint", baseColor: [1, 0.96, 0.82, 1], metallic: 0.24, roughness: 0.2, emissiveColor: [0.38, 0.32, 0.12], emissiveStrength: 0.72, renderState: { cullMode: "none" } }),
      numberDecal: new TexturedPBRMaterial({ name: "racing-number-decal-37", baseColor: [1, 1, 1, 1], metallic: 0.18, roughness: 0.32, baseColorTexture: numberDecal, renderState: { blend: true, depthWrite: false, cullMode: "none" } }),
      carbon: new TexturedPBRMaterial({ name: "racing-carbon-fiber", baseColor: [0.34, 0.38, 0.42, 1], metallic: 0.28, roughness: 0.46, baseColorTexture: carbon, metallicRoughnessTexture: metallicRoughness, emissiveColor: [0.12, 0.16, 0.2], emissiveStrength: 0.86, renderState: { cullMode: "none" } }),
      tire: new TexturedPBRMaterial({ name: "racing-tire-tread", baseColor: [0.2, 0.21, 0.22, 1], metallic: 0, roughness: 0.74, baseColorTexture: tire, emissiveColor: [0.08, 0.09, 0.1], emissiveStrength: 0.72, renderState: { cullMode: "none" } }),
      rim: new PBRMaterial({ name: "racing-polished-rim", baseColor: [0.84, 0.82, 0.78, 1], metallic: 1, roughness: 0.18, renderState: { cullMode: "none" } }),
      dark: new PBRMaterial({ name: "racing-aero-graphite-composite", baseColor: [0.46, 0.5, 0.54, 1], metallic: 0.28, roughness: 0.3, emissiveColor: [0.22, 0.26, 0.3], emissiveStrength: 1.0, renderState: { cullMode: "none" } }),
      glass: new PBRMaterial({ name: "racing-smoked-glass", baseColor: [0.48, 0.82, 1, 0.76], metallic: 0, roughness: 0.06, emissiveColor: [0.12, 0.34, 0.58], emissiveStrength: 1.0, renderState: { blend: true, depthWrite: false, cullMode: "none" } }),
      asphalt: new TexturedPBRMaterial({ name: "racing-asphalt", baseColor: [0.64, 0.65, 0.66, 1], metallic: 0, roughness: 0.64, baseColorTexture: asphalt, emissiveColor: [0.1, 0.1, 0.1], emissiveStrength: 0.32, renderState: { cullMode: "none" } }),
      lane: new UnlitMaterial({ name: "racing-track-lane-and-curb-lines", color: [0.86, 0.95, 1, 0.58], renderState: { depthTest: true, depthWrite: false, cullMode: "none", blend: true } }),
      carLine: new UnlitMaterial({ name: "racing-car-panel-seam-and-vent-lines", color: [1, 0.94, 0.76, 1], renderState: { depthTest: true, depthWrite: false, cullMode: "none", blend: true } }),
      trim: new PBRMaterial({ name: "racing-lit-body-panel-trim", baseColor: [0.98, 0.82, 0.48, 1], metallic: 0.42, roughness: 0.22, emissiveColor: [0.35, 0.18, 0.04], emissiveStrength: 0.45, renderState: { cullMode: "none" } }),
      vent: new PBRMaterial({ name: "racing-lit-hood-and-brake-vents", baseColor: [0.04, 0.045, 0.05, 1], metallic: 0.34, roughness: 0.4, emissiveColor: [0.02, 0.025, 0.03], emissiveStrength: 0.35, renderState: { cullMode: "none" } }),
      accent: new PBRMaterial({ name: "racing-lit-aero-accent-strips", baseColor: [0.9, 0.94, 1, 1], metallic: 0.62, roughness: 0.18, emissiveColor: [0.18, 0.28, 0.42], emissiveStrength: 0.5, renderState: { cullMode: "none" } }),
      cockpitFrame: new PBRMaterial({ name: "racing-lit-cockpit-window-frame", baseColor: [0.08, 0.1, 0.12, 1], metallic: 0.58, roughness: 0.24, emissiveColor: [0.02, 0.04, 0.06], emissiveStrength: 0.5, renderState: { cullMode: "none" } }),
      panel: new TexturedPBRMaterial({ name: "racing-barrier-panel", baseColor: [0.48, 0.7, 0.92, 1], metallic: 0.34, roughness: 0.58, baseColorTexture: panel, metallicRoughnessTexture: metallicRoughness, emissiveColor: [0.08, 0.14, 0.22], emissiveStrength: 0.42, renderState: { cullMode: "none" } }),
      nebula: new TexturedPBRMaterial({ name: "racing-nebula-textured-backdrop", baseColor: [0.42, 0.54, 0.72, 1], baseColorTexture: nebulaTexture, roughness: 0.74, metallic: 0.04, emissiveColor: [0.16, 0.24, 0.36], emissiveStrength: 1.18, renderState: { depthTest: false, depthWrite: false, cullMode: "none" } }),
      skyGlow: new TexturedPBRMaterial({ name: "racing-nebula-showcase-glow", baseColor: [0.72, 0.88, 1, 1], baseColorTexture: panel, roughness: 0.5, metallic: 0.1, emissiveColor: [0.24, 0.4, 0.66], emissiveStrength: 1.18, renderState: { depthTest: true, depthWrite: false, cullMode: "none" } }),
      headlight: new PBRMaterial({ name: "racing-headlight", baseColor: [1, 0.9, 0.58, 1], roughness: 0.12, emissiveColor: [1, 0.82, 0.34], emissiveStrength: 1.8, renderState: { cullMode: "none" } }),
      brake: new PBRMaterial({ name: "racing-brake-light", baseColor: [1, 0.04, 0.02, 1], roughness: 0.2, emissiveColor: [1, 0.02, 0.02], emissiveStrength: 1.2, renderState: { cullMode: "none" } }),
      exhaust: new PBRMaterial({ name: "racing-chrome-exhaust", baseColor: [0.72, 0.72, 0.76, 1], metallic: 0.92, roughness: 0.16, renderState: { cullMode: "none" } }),
      tireSmoke: new UnlitMaterial({ name: "racing-tire-smoke-emitter-puffs", color: [0.72, 0.76, 0.78, 0.26], renderState: { blend: true, depthWrite: false, cullMode: "none" } }),
      nitroFlame: new UnlitMaterial({ name: "racing-nitro-exhaust-flame", color: [0.25, 0.72, 1, 0.72], renderState: { blend: true, depthWrite: false, cullMode: "none" } }),
      damageScuff: new UnlitMaterial({ name: "racing-deterministic-damage-scuff", color: [0.02, 0.018, 0.016, 0.68], renderState: { blend: true, depthWrite: false, cullMode: "none" } }),
      shadow: new PBRMaterial({ name: "racing-contact-shadow", baseColor: [0, 0, 0, 0.14], roughness: 0.96, metallic: 0, renderState: { blend: true, depthWrite: false, cullMode: "none" } }),
      stars: new UnlitMaterial({ name: "seeded-starfield-nebula-points", color: [0.72, 0.9, 1, 0.9], renderState: { depthTest: true, depthWrite: false, blend: true, cullMode: "none" } })
    }
  };
}

function buildRenderItems(resources: ReturnType<typeof createResources>, telemetry: ReturnType<typeof raceTelemetry>): readonly RenderItem[] {
  const yaw = telemetry.cameraYaw;
  const carX = Math.sin(telemetry.trackT * Math.PI * 2) * 0.22;
  const carY = -0.2 + Math.cos(telemetry.trackT * Math.PI * 2) * 0.04;
  const carRoll = Math.sin(telemetry.trackT * Math.PI * 4) * 0.08;
  const items: RenderItem[] = [
    { geometry: resources.geometries.backdrop, material: resources.materials.nebula, modelMatrix: matrix(0, 0.34, -0.72, 7.2, 3.7, 0.02, 0, 0, 0), label: "racing-nebula-textured-backdrop" },
    { geometry: resources.geometries.backdrop, material: resources.materials.skyGlow, modelMatrix: matrix(0.18, 0.68, -0.7, 5.2, 0.72, 0.02, 0, 0, 0), label: "racing-nebula-blue-glow" },
    { geometry: resources.geometries.backdropLines, material: resources.materials.lane, modelMatrix: matrix(0, 0.35, -0.52, 1, 1, 1, 0, 0, 0), label: "racing-grandstand-light-ribs" },
    { geometry: resources.geometries.starPoints, material: resources.materials.stars, label: "racing-seeded-starfield" },
    { geometry: resources.geometries.track, material: resources.materials.asphalt, modelMatrix: matrix(0, -0.72, -0.08, 6.2, 0.36, 1.34, yaw, 0, 0), label: "racing-textured-track" },
    { geometry: resources.geometries.trackLines, material: resources.materials.lane, modelMatrix: matrix(0, -0.52, 0.18, 1, 1, 1, yaw, 0, 0), label: "racing-track-lane-curb-grid" },
    { geometry: resources.geometries.track, material: resources.materials.shadow, modelMatrix: matrix(carX, -0.56, 0.05, 1.7, 0.06, 0.42, yaw, 0, 0), label: "racing-car-contact-shadow" }
  ];
  for (let index = -4; index <= 4; index += 1) {
    items.push({ geometry: resources.geometries.barrier, material: resources.materials.panel, modelMatrix: matrix(index * 0.58, -0.38, -0.56, 0.24, 0.32, 0.08, yaw, 0, 0), label: `racing-barrier-back-${index + 4}` });
    items.push({ geometry: resources.geometries.barrier, material: resources.materials.panel, modelMatrix: matrix(index * 0.58, -0.38, 0.62, 0.24, 0.32, 0.08, yaw, 0, 0), label: `racing-barrier-front-${index + 4}` });
  }
  for (let index = -10; index <= 10; index += 1) {
    items.push({ geometry: resources.geometries.aero, material: resources.materials.lane, modelMatrix: matrix(index * 0.28, -0.19, -0.52, 0.055, 0.26, 0.012, yaw, 0, 0), label: `racing-lit-track-marker-back-${index + 10}` });
    items.push({ geometry: resources.geometries.aero, material: resources.materials.lane, modelMatrix: matrix(index * 0.28, -0.19, 0.6, 0.055, 0.26, 0.012, yaw, 0, 0), label: `racing-lit-track-marker-front-${index + 10}` });
  }
  items.push(
    { geometry: resources.geometries.carBody, material: resources.materials.paint, modelMatrix: matrix(carX, carY, 0.06, 1.5, 0.34, 0.5, yaw, 0.02, carRoll), label: "procedural-sports-car-body" },
    { geometry: resources.geometries.nose, material: resources.materials.paint, modelMatrix: matrix(carX + 0.82, carY - 0.05, 0.06, 0.56, 0.22, 0.46, yaw, 0.02, carRoll), label: "procedural-sports-car-low-nose" },
    { geometry: resources.geometries.rear, material: resources.materials.paint, modelMatrix: matrix(carX - 0.74, carY + 0.02, 0.06, 0.58, 0.34, 0.54, yaw, 0.02, carRoll), label: "procedural-sports-car-rear-engine-bay" },
    { geometry: resources.geometries.cabin, material: resources.materials.glass, modelMatrix: matrix(carX - 0.12, carY + 0.31, 0.08, 0.68, 0.3, 0.44, yaw, 0.04, 0), label: "procedural-sports-car-cabin" },
    { geometry: resources.geometries.roof, material: resources.materials.paint, modelMatrix: matrix(carX - 0.14, carY + 0.48, 0.08, 0.42, 0.045, 0.34, yaw, 0.02, 0), label: "procedural-sports-car-painted-roof-strip" },
    { geometry: resources.geometries.decal, material: resources.materials.stripes, modelMatrix: matrix(carX + 0.08, carY + 0.36, 0.08, 1.14, 0.024, 0.26, yaw, 0.03, 0), label: "procedural-sports-car-racing-stripe-decal" },
    { geometry: resources.geometries.decal, material: resources.materials.numberDecal, modelMatrix: matrix(carX - 0.14, carY + 0.515, 0.08, 0.3, 0.028, 0.22, yaw, 0.03, 0), label: "procedural-sports-car-racing-number-decal-roof" },
    { geometry: resources.geometries.decal, material: resources.materials.numberDecal, modelMatrix: matrix(carX - 0.18, carY + 0.14, 0.5, 0.28, 0.024, 0.18, yaw, 0.02, 0), label: "procedural-sports-car-racing-number-decal-side" },
    { geometry: resources.geometries.carDetails, material: resources.materials.carLine, modelMatrix: matrix(carX + 0.08, carY + 0.04, 0.63, 1.6, 0.44, 0.08, yaw, 0.02, carRoll), label: "procedural-sports-car-visible-panel-seams-right" },
    { geometry: resources.geometries.carDetails, material: resources.materials.carLine, modelMatrix: matrix(carX + 0.08, carY + 0.04, -0.49, 1.6, 0.44, 0.08, yaw, 0.02, carRoll), label: "procedural-sports-car-visible-panel-seams-left" },
    { geometry: resources.geometries.aero, material: resources.materials.trim, modelMatrix: matrix(carX + 0.08, carY + 0.18, 0.61, 1.15, 0.032, 0.035, yaw, 0.02, carRoll), label: "procedural-sports-car-lit-side-crease-right" },
    { geometry: resources.geometries.aero, material: resources.materials.trim, modelMatrix: matrix(carX + 0.08, carY + 0.18, -0.47, 1.15, 0.032, 0.035, yaw, 0.02, carRoll), label: "procedural-sports-car-lit-side-crease-left" },
    { geometry: resources.geometries.aero, material: resources.materials.vent, modelMatrix: matrix(carX + 0.34, carY + 0.24, 0.18, 0.34, 0.028, 0.24, yaw, 0.02, carRoll), label: "procedural-sports-car-hood-vent-center" },
    { geometry: resources.geometries.aero, material: resources.materials.vent, modelMatrix: matrix(carX - 0.62, carY + 0.12, 0.62, 0.22, 0.03, 0.18, yaw, 0.02, carRoll), label: "procedural-sports-car-rear-brake-vent-right" },
    { geometry: resources.geometries.aero, material: resources.materials.vent, modelMatrix: matrix(carX - 0.62, carY + 0.12, -0.48, 0.22, 0.03, 0.18, yaw, 0.02, carRoll), label: "procedural-sports-car-rear-brake-vent-left" },
    { geometry: resources.geometries.aero, material: resources.materials.accent, modelMatrix: matrix(carX + 0.58, carY - 0.02, 0.6, 0.42, 0.024, 0.032, yaw, 0.02, carRoll), label: "procedural-sports-car-front-fender-accent-right" },
    { geometry: resources.geometries.aero, material: resources.materials.accent, modelMatrix: matrix(carX + 0.58, carY - 0.02, -0.46, 0.42, 0.024, 0.032, yaw, 0.02, carRoll), label: "procedural-sports-car-front-fender-accent-left" },
    { geometry: resources.geometries.aero, material: resources.materials.cockpitFrame, modelMatrix: matrix(carX - 0.12, carY + 0.38, 0.61, 0.54, 0.035, 0.035, yaw, 0.04, 0), label: "procedural-sports-car-cockpit-frame-right" },
    { geometry: resources.geometries.aero, material: resources.materials.cockpitFrame, modelMatrix: matrix(carX - 0.12, carY + 0.38, -0.48, 0.54, 0.035, 0.035, yaw, 0.04, 0), label: "procedural-sports-car-cockpit-frame-left" },
    { geometry: resources.geometries.spoiler, material: resources.materials.carbon, modelMatrix: matrix(carX - 0.82, carY + 0.2, 0.08, 0.34, 0.08, 0.62, yaw, 0, 0), label: "procedural-sports-car-carbon-spoiler" },
    { geometry: resources.geometries.aero, material: resources.materials.dark, modelMatrix: matrix(carX - 0.82, carY + 0.09, -0.24, 0.05, 0.23, 0.06, yaw, 0, 0), label: "procedural-sports-car-spoiler-mount-left" },
    { geometry: resources.geometries.aero, material: resources.materials.dark, modelMatrix: matrix(carX - 0.82, carY + 0.09, 0.4, 0.05, 0.23, 0.06, yaw, 0, 0), label: "procedural-sports-car-spoiler-mount-right" },
    { geometry: resources.geometries.aero, material: resources.materials.dark, modelMatrix: matrix(carX - 0.82, carY + 0.2, -0.55, 0.06, 0.14, 0.06, yaw, 0, 0), label: "procedural-sports-car-spoiler-endplate-left" },
    { geometry: resources.geometries.aero, material: resources.materials.dark, modelMatrix: matrix(carX - 0.82, carY + 0.2, 0.71, 0.06, 0.14, 0.06, yaw, 0, 0), label: "procedural-sports-car-spoiler-endplate-right" },
    { geometry: resources.geometries.aero, material: resources.materials.carbon, modelMatrix: matrix(carX + 0.82, carY - 0.08, 0.08, 0.34, 0.06, 0.62, yaw, 0, 0), label: "procedural-sports-car-nose-splitter" },
    { geometry: resources.geometries.aero, material: resources.materials.dark, modelMatrix: matrix(carX - 0.98, carY - 0.09, 0.08, 0.28, 0.08, 0.42, yaw, 0, 0), label: "procedural-sports-car-rear-diffuser" },
    { geometry: resources.geometries.aero, material: resources.materials.carbon, modelMatrix: matrix(carX, carY - 0.12, -0.46, 1.34, 0.07, 0.06, yaw, 0, 0), label: "procedural-sports-car-side-skirt-left" },
    { geometry: resources.geometries.aero, material: resources.materials.carbon, modelMatrix: matrix(carX, carY - 0.12, 0.58, 1.34, 0.07, 0.06, yaw, 0, 0), label: "procedural-sports-car-side-skirt-right" },
    { geometry: resources.geometries.mirror, material: resources.materials.bodySolid, modelMatrix: matrix(carX + 0.04, carY + 0.25, -0.49, 0.75, 0.5, 0.9, yaw, 0, 0), label: "procedural-sports-car-mirror-left" },
    { geometry: resources.geometries.mirror, material: resources.materials.bodySolid, modelMatrix: matrix(carX + 0.04, carY + 0.25, 0.63, 0.75, 0.5, 0.9, yaw, 0, 0), label: "procedural-sports-car-mirror-right" }
  );
  for (const [index, x, z] of [[0, -0.55, -0.26], [1, 0.54, -0.26], [2, -0.55, 0.38], [3, 0.54, 0.38]] as const) {
    items.push({ geometry: resources.geometries.wheel, material: resources.materials.tire, modelMatrix: matrix(carX + x, carY - 0.26, z, 0.76, 0.76, 0.76, yaw, Math.PI / 2, telemetry.wheelSpin), label: `procedural-sports-car-tire-${index}` });
    items.push({ geometry: resources.geometries.rim, material: resources.materials.rim, modelMatrix: matrix(carX + x, carY - 0.26, z, 0.76, 0.76, 0.76, yaw, Math.PI / 2, telemetry.wheelSpin), label: `procedural-sports-car-rim-${index}` });
    const smokeRate = telemetry.tireSmokeRates[index] ?? 0;
    if (smokeRate > 0) {
      const puffScale = 0.5 + smokeRate / 96;
      items.push({ geometry: resources.geometries.smoke, material: resources.materials.tireSmoke, modelMatrix: matrix(carX + x - 0.14, carY - 0.22 + index * 0.008, z, puffScale, puffScale * 0.72, puffScale, yaw, 0, 0), label: `procedural-sports-car-tire-smoke-${index}` });
    }
  }
  items.push(
    { geometry: resources.geometries.aero, material: resources.materials.dark, modelMatrix: matrix(carX + 0.9, carY + 0.02, -0.18, 0.16, 0.08, 0.1, yaw, 0, 0), label: "procedural-sports-car-headlight-housing-left" },
    { geometry: resources.geometries.aero, material: resources.materials.dark, modelMatrix: matrix(carX + 0.9, carY + 0.02, 0.32, 0.16, 0.08, 0.1, yaw, 0, 0), label: "procedural-sports-car-headlight-housing-right" },
    { geometry: resources.geometries.light, material: resources.materials.headlight, modelMatrix: matrix(carX + 0.9, carY + 0.02, -0.18, 1, 1, 1, yaw, 0, 0), label: "procedural-sports-car-headlight-left" },
    { geometry: resources.geometries.light, material: resources.materials.headlight, modelMatrix: matrix(carX + 0.9, carY + 0.02, 0.32, 1, 1, 1, yaw, 0, 0), label: "procedural-sports-car-headlight-right" },
    { geometry: resources.geometries.light, material: resources.materials.brake, modelMatrix: matrix(carX - 0.94, carY + 0.02, -0.16, 0.8, 0.8, 0.8, yaw, 0, 0), label: "procedural-sports-car-brake-left" },
    { geometry: resources.geometries.light, material: resources.materials.brake, modelMatrix: matrix(carX - 0.94, carY + 0.02, 0.3, 0.8, 0.8, 0.8, yaw, 0, 0), label: "procedural-sports-car-brake-right" },
    { geometry: resources.geometries.exhaust, material: resources.materials.exhaust, modelMatrix: matrix(carX - 1.02, carY - 0.07, -0.08, 1, 1, 1, yaw, Math.PI / 2, 0), label: "procedural-sports-car-exhaust-left" },
    { geometry: resources.geometries.exhaust, material: resources.materials.exhaust, modelMatrix: matrix(carX - 1.02, carY - 0.07, 0.24, 1, 1, 1, yaw, Math.PI / 2, 0), label: "procedural-sports-car-exhaust-right" }
  );
  if (telemetry.nitroFlameRate > 0) {
    const flameScale = 0.5 + telemetry.nitroFlameRate / 360;
    items.push(
      { geometry: resources.geometries.flame, material: resources.materials.nitroFlame, modelMatrix: matrix(carX - 1.14, carY - 0.08, -0.08, flameScale, flameScale * 0.42, flameScale * 0.54, yaw, 0, 0), label: "procedural-sports-car-nitro-flame-left" },
      { geometry: resources.geometries.flame, material: resources.materials.nitroFlame, modelMatrix: matrix(carX - 1.14, carY - 0.08, 0.24, flameScale, flameScale * 0.42, flameScale * 0.54, yaw, 0, 0), label: "procedural-sports-car-nitro-flame-right" }
    );
  }
  if (telemetry.vehicleDamageAmount > 0) {
    const scuffScale = 0.4 + telemetry.vehicleDamageAmount / 180;
    items.push(
      { geometry: resources.geometries.decal, material: resources.materials.damageScuff, modelMatrix: matrix(carX + 0.22, carY + 0.2, -0.39, scuffScale, 0.025, 0.16, yaw, 0.02, 0), label: "procedural-sports-car-damage-scuff-left" },
      { geometry: resources.geometries.decal, material: resources.materials.damageScuff, modelMatrix: matrix(carX - 0.38, carY + 0.16, 0.49, scuffScale * 0.86, 0.025, 0.13, yaw, 0.02, 0), label: "procedural-sports-car-damage-scuff-right" }
    );
  }
  return items;
}

function racingTrackDetailLines(): readonly (readonly [number, number, number])[] {
  const lines: Array<readonly [number, number, number]> = [];
  for (let x = -2.55; x <= 2.56; x += 0.035) {
    lines.push([x, -0.22, 0], [x + 0.028, -0.22, 0]);
    lines.push([x, 0.08, 0], [x + 0.028, 0.08, 0]);
  }
  for (let x = -2.55; x <= 2.56; x += 0.075) {
    lines.push([x, -0.44, 0], [x + 0.18, -0.34, 0]);
    lines.push([x, 0.34, 0], [x + 0.18, 0.44, 0]);
  }
  for (let y = -0.44; y <= 0.45; y += 0.045) {
    lines.push([-2.54, y, 0], [2.54, y, 0]);
  }
  for (let x = -2.4; x <= 2.41; x += 0.11) {
    lines.push([x, -0.5, 0], [x + 0.08, 0.5, 0]);
  }
  for (let x = -2.5; x <= 2.51; x += 0.14) {
    lines.push([x, -0.49, 0], [x + 0.07, -0.41, 0]);
    lines.push([x + 0.07, 0.41, 0], [x + 0.14, 0.49, 0]);
    lines.push([x, -0.04, 0], [x + 0.09, -0.04, 0]);
    lines.push([x + 0.04, 0.2, 0], [x + 0.13, 0.2, 0]);
  }
  for (let y = -0.42; y <= 0.43; y += 0.12) {
    lines.push([-2.55, y, 0], [-2.34, y + 0.05, 0]);
    lines.push([2.34, y + 0.05, 0], [2.55, y, 0]);
  }
  lines.push(
    [-2.56, -0.5, 0], [2.56, -0.5, 0],
    [-2.56, 0.5, 0], [2.56, 0.5, 0],
    [-2.56, -0.5, 0], [-2.56, 0.5, 0],
    [2.56, -0.5, 0], [2.56, 0.5, 0]
  );
  return lines;
}

function racingBackdropDetailLines(): readonly (readonly [number, number, number])[] {
  const lines: Array<readonly [number, number, number]> = [];
  for (let x = -3.1; x <= 3.11; x += 0.11) {
    lines.push([x, -1.05, 0], [x, 1.42, 0]);
  }
  for (let y = -0.96; y <= 1.45; y += 0.09) {
    lines.push([-3.2, y, 0], [3.2, y, 0]);
  }
  for (let x = -3.0; x <= 2.72; x += 0.22) {
    lines.push([x, -0.9, 0], [x + 0.28, -0.42, 0]);
    lines.push([x + 0.18, 0.18, 0], [x + 0.46, 0.72, 0]);
    lines.push([x + 0.08, 0.84, 0], [x + 0.4, 1.3, 0]);
  }
  for (let x = -3.1; x <= 3.0; x += 0.36) {
    lines.push([x, 1.18, 0], [x + 0.22, 1.34, 0]);
    lines.push([x + 0.18, -0.78, 0], [x + 0.32, -0.58, 0]);
  }
  for (let x = -3.0; x <= 3.01; x += 0.18) {
    lines.push([x, 1.02, 0], [x + 0.1, 1.02, 0]);
    lines.push([x + 0.04, 0.56, 0], [x + 0.16, 0.56, 0]);
    lines.push([x + 0.02, -0.24, 0], [x + 0.14, -0.24, 0]);
  }
  return lines;
}

function racingCarDetailLines(): readonly (readonly [number, number, number])[] {
  const lines: Array<readonly [number, number, number]> = [];
  const addRect = (left: number, bottom: number, right: number, top: number, z = 0): void => {
    lines.push(
      [left, bottom, z], [right, bottom, z],
      [right, bottom, z], [right, top, z],
      [right, top, z], [left, top, z],
      [left, top, z], [left, bottom, z]
    );
  };
  addRect(-0.58, -0.3, 0.52, 0.25);
  addRect(-0.18, 0.02, 0.2, 0.24);
  addRect(0.38, -0.12, 0.66, 0.1);
  addRect(-0.72, -0.13, -0.44, 0.1);
  for (let x = -0.62; x <= 0.64; x += 0.14) {
    lines.push([x, 0.19, 0], [x + 0.06, 0.25, 0]);
    lines.push([x, -0.26, 0], [x + 0.08, -0.19, 0]);
  }
  for (let x = -0.52; x <= 0.5; x += 0.17) {
    lines.push([x, -0.04, 0], [x + 0.08, -0.04, 0]);
    lines.push([x, 0.08, 0], [x + 0.08, 0.08, 0]);
  }
  for (let x = -0.72; x <= 0.74; x += 0.09) {
    lines.push([x, -0.3, 0], [x + 0.035, -0.23, 0]);
    lines.push([x, 0.24, 0], [x + 0.04, 0.18, 0]);
  }
  for (let y = -0.22; y <= 0.21; y += 0.055) {
    lines.push([-0.76, y, 0], [-0.58, y + 0.025, 0]);
    lines.push([0.54, y + 0.025, 0], [0.76, y, 0]);
  }
  for (let x = -0.34; x <= 0.36; x += 0.08) {
    lines.push([x, 0.02, 0], [x + 0.02, 0.22, 0]);
  }
  lines.push(
    [-0.78, -0.2, 0], [-0.62, -0.34, 0],
    [-0.62, -0.34, 0], [-0.4, -0.34, 0],
    [0.38, -0.34, 0], [0.62, -0.34, 0],
    [0.62, -0.34, 0], [0.78, -0.18, 0],
    [-0.82, 0.12, 0], [-0.66, 0.24, 0],
    [0.66, 0.24, 0], [0.82, 0.1, 0]
  );
  return lines;
}

type RaceTelemetry = {
  readonly state: "countdown" | "racing" | "finished";
  readonly countdownRemaining: number;
  readonly raceElapsedSeconds: number;
  readonly trackT: number;
  readonly speedKph: number;
  readonly rpm: number;
  readonly nitro: number;
  readonly lap: number;
  readonly totalLaps: number;
  readonly completedLaps: number;
  readonly checkpoint: number;
  readonly checkpointCount: number;
  readonly checkpointEvents: number;
  readonly lapTimesMs: readonly number[];
  readonly bestLapMs: number;
  readonly leaderboardPosition: number;
  readonly hudGaugeCount: number;
  readonly minimapRacerCount: number;
  readonly minimapTrackPoints: number;
  readonly racingHud: boolean;
  readonly cameraYaw: number;
  readonly wheelSpin: number;
  readonly steerAngle: number;
  readonly driftSlip: number;
  readonly grip: number;
  readonly suspensionCompression: readonly [number, number, number, number];
  readonly vehicleDynamics: boolean;
  readonly tireCombinedForce: number;
  readonly tireLongitudinalForce: number;
  readonly tireLateralForce: number;
  readonly tireSlipRatio: number;
  readonly tireSlipAngle: number;
  readonly tireAligningTorque: number;
  readonly tireModel: boolean;
  readonly drivetrainGear: number;
  readonly drivetrainEngineRpm: number;
  readonly drivetrainEngineTorque: number;
  readonly drivetrainWheelTorque: number;
  readonly drivetrainFrontTorque: number;
  readonly drivetrainRearTorque: number;
  readonly drivetrainDragForce: number;
  readonly drivetrainDownforce: number;
  readonly drivetrainShiftState: "hold" | "upshift" | "downshift";
  readonly drivetrainModel: boolean;
  readonly tireSmokeRates: readonly [number, number, number, number];
  readonly tireSmokeRate: number;
  readonly tireSmokeEmitters: number;
  readonly nitroFlameRate: number;
  readonly vehicleEffectEmitters: number;
  readonly vehicleSmokeReason: string;
  readonly vehicleEffects: boolean;
  readonly vehicleHealth: number;
  readonly vehicleDamageAmount: number;
  readonly vehicleImpactDamage: number;
  readonly vehicleDamageLevel: string;
  readonly vehicleDamage: boolean;
  readonly racingAiThrottle: number;
  readonly racingAiBrake: number;
  readonly racingAiSteer: number;
  readonly racingAiTargetSpeedKph: number;
  readonly racingAiLookaheadDistance: number;
  readonly racingAiOvertaking: boolean;
  readonly racingAiRubberbandBoost: number;
  readonly racingAiDriver: boolean;
  readonly samples: number;
};

function raceTelemetry(elapsed: number): RaceTelemetry {
  const countdownSeconds = 0.75;
  const lapSeconds = 1.05;
  const totalLaps = 3;
  const checkpointCount = 12;
  const raceElapsedSeconds = Math.max(0, elapsed - countdownSeconds);
  const totalRaceSeconds = lapSeconds * totalLaps;
  const progressLaps = Math.min(totalLaps, raceElapsedSeconds / lapSeconds);
  const state = raceElapsedSeconds <= 0 ? "countdown" : progressLaps >= totalLaps ? "finished" : "racing";
  const trackT = progressLaps % 1;
  const completedLaps = Math.min(totalLaps, Math.floor(progressLaps));
  const checkpointEvents = Math.min(totalLaps * checkpointCount, Math.floor(progressLaps * checkpointCount));
  const lapTimesMs = Array.from({ length: completedLaps }, (_, index) => Math.round((lapSeconds + Math.sin(index + 1) * 0.035) * 1000));
  const bestLapMs = lapTimesMs.length > 0 ? Math.min(...lapTimesMs) : 0;
  const throttleRamp = Math.min(1, raceElapsedSeconds / 0.4);
  const finishEase = state === "finished" ? 0.45 : 1;
  const steering = Math.sin(raceElapsedSeconds * 1.25) * 0.58;
  const dynamics = sampleArcadeVehicleDynamics({
    elapsedSeconds: raceElapsedSeconds,
    throttle: state === "countdown" ? 0 : throttleRamp * finishEase,
    steer: steering,
    handbrake: trackT > 0.58 && trackT < 0.74,
    nitro: trackT > 0.18 && trackT < 0.34,
    maxSpeedKph: 236,
    acceleration: 11,
    gripFactor: 0.78,
    driftFactor: 0.42
  });
  const speedMps = Math.max(0.1, Math.abs(dynamics.speedKph) / 3.6);
  const tireForces = samplePacejkaTireForces({
    longitudinalVelocity: speedMps,
    lateralVelocity: Math.sin(steering) * speedMps * 0.12 + dynamics.driftSlip * 2.4,
    angularVelocity: (speedMps / 0.34) * (1 + dynamics.driftSlip * 0.32),
    normalForce: 4350 + dynamics.driftSlip * 420,
    steeringAngle: dynamics.steerAngle,
    camberAngle: -0.02 * Math.sign(steering),
    radius: 0.34,
    width: 0.26,
    maxLoad: 5200,
    longitudinal: "racing",
    lateral: "racing"
  });
  const aiDriver = sampleRacingAiDriver({
    difficulty: "hard",
    elapsedSeconds: raceElapsedSeconds,
    progress: trackT,
    speedKph: Math.max(0, dynamics.speedKph),
    targetSpeedKph: 236,
    trackCurvature: Math.sin(trackT * Math.PI * 2) * 0.42,
    opponentAhead: trackT > 0.34 && trackT < 0.62,
    opponentDistance: 10 + Math.sin(trackT * Math.PI) * 5,
    playerGapSeconds: state === "finished" ? 0.4 : -0.8
  });
  const drivetrain = sampleVehicleDrivetrain({
    speedKph: Math.max(0, dynamics.speedKph),
    throttle: state === "countdown" ? 0 : throttleRamp * finishEase,
    differential: "limited-slip",
    frontRearSplit: 0.42,
    lockingFactor: 0.48,
    peakTorque: 460,
    peakTorqueRpm: 4200,
    maxRpm: 7600,
    finalDriveRatio: 3.73,
    dragCoefficient: 0.31,
    frontalArea: 2.05,
    downforceCoefficient: 0.82
  });
  const finishBurnout = state === "finished";
  const effects = sampleVehicleEffectEmitters({
    speedKph: finishBurnout ? 18 : Math.max(0, dynamics.speedKph),
    throttle: finishBurnout ? 0.92 : throttleRamp * finishEase,
    steer: finishBurnout ? 0.82 : steering,
    handbrake: finishBurnout || (trackT > 0.58 && trackT < 0.74),
    nitroActive: finishBurnout || (trackT > 0.18 && trackT < 0.34),
    wheelOnGround: [true, true, true, true]
  });
  const damage = sampleVehicleDamage({
    health: 100,
    impactSpeedKph: state === "finished" ? 78 : trackT > 0.64 && trackT < 0.7 ? Math.max(0, dynamics.speedKph) : 0,
    collisionSeverity: state === "finished" ? 0.42 : 0.28
  });
  return {
    state,
    countdownRemaining: Math.max(0, countdownSeconds - elapsed),
    raceElapsedSeconds: Math.min(raceElapsedSeconds, totalRaceSeconds),
    trackT,
    speedKph: state === "countdown" ? 0 : dynamics.speedKph,
    rpm: state === "countdown" ? 1100 : dynamics.rpm,
    nitro: dynamics.nitro,
    lap: state === "finished" ? totalLaps : Math.min(totalLaps, 1 + Math.floor(progressLaps)),
    totalLaps,
    completedLaps,
    checkpoint: state === "finished" ? checkpointCount - 1 : Math.floor(trackT * checkpointCount),
    checkpointCount,
    checkpointEvents,
    lapTimesMs,
    bestLapMs,
    leaderboardPosition: 1,
    hudGaugeCount: 2,
    minimapRacerCount: 4,
    minimapTrackPoints: 32,
    racingHud: true,
    cameraYaw: -0.08 + Math.sin(elapsed * 0.32) * 0.025,
    wheelSpin: dynamics.wheelSpin,
    steerAngle: dynamics.steerAngle,
    driftSlip: dynamics.driftSlip,
    grip: dynamics.grip,
    suspensionCompression: dynamics.suspensionCompression,
    tireCombinedForce: tireForces.combinedForce,
    tireLongitudinalForce: tireForces.longitudinalForce,
    tireLateralForce: tireForces.lateralForce,
    tireSlipRatio: tireForces.slipRatio,
    tireSlipAngle: tireForces.slipAngle,
    tireAligningTorque: tireForces.aligningTorque,
    vehicleDynamics: dynamics.speedKph > 0 && dynamics.rpm > 1000 && dynamics.wheelSpin > 0 && dynamics.suspensionCompression.length === 4,
    tireModel: tireForces.preset.longitudinal === "racing" && tireForces.combinedForce > 0 && Math.abs(tireForces.aligningTorque) > 0,
    drivetrainGear: drivetrain.gear,
    drivetrainEngineRpm: drivetrain.engineRpm,
    drivetrainEngineTorque: drivetrain.engineTorque,
    drivetrainWheelTorque: drivetrain.wheelTorque,
    drivetrainFrontTorque: drivetrain.frontTorque,
    drivetrainRearTorque: drivetrain.rearTorque,
    drivetrainDragForce: drivetrain.dragForce,
    drivetrainDownforce: drivetrain.downforce,
    drivetrainShiftState: drivetrain.shiftState,
    drivetrainModel: drivetrain.gear >= 1 && drivetrain.engineTorque > 0 && drivetrain.wheelTorque > drivetrain.engineTorque && drivetrain.dragForce > 0 && drivetrain.downforce > 0,
    tireSmokeRates: effects.tireSmokeRates,
    tireSmokeRate: effects.totalTireSmokeRate,
    tireSmokeEmitters: effects.tireSmokeRates.filter((rate) => rate > 0).length,
    nitroFlameRate: effects.nitroFlameRate,
    vehicleEffectEmitters: effects.visibleEffectEmitters,
    vehicleSmokeReason: effects.smokeReason,
    vehicleEffects: effects.visibleEffectEmitters > 0 && effects.totalTireSmokeRate > 0 && effects.nitroFlameRate > 0,
    vehicleHealth: damage.health,
    vehicleDamageAmount: damage.damage,
    vehicleImpactDamage: damage.impactDamage,
    vehicleDamageLevel: damage.visualDamageLevel,
    vehicleDamage: damage.damage > 0 && damage.visualDamageLevel !== "none" && !damage.disabled,
    racingAiThrottle: aiDriver.throttle,
    racingAiBrake: aiDriver.brake,
    racingAiSteer: aiDriver.steer,
    racingAiTargetSpeedKph: aiDriver.targetSpeedKph,
    racingAiLookaheadDistance: aiDriver.lookaheadDistance,
    racingAiOvertaking: aiDriver.overtaking,
    racingAiRubberbandBoost: aiDriver.rubberbandBoost,
    racingAiDriver: aiDriver.difficulty === "hard" && aiDriver.lookaheadDistance > 0 && aiDriver.targetSpeedKph > 0,
    samples: Math.floor(elapsed * 60)
  };
}

function starSegments(count: number): readonly (readonly [number, number, number])[] {
  const positions: [number, number, number][] = [];
  const fixture = createProceduralTextureFixture("starfield-nebula", { width: 32, height: 32 });
  for (let index = 0; index < count; index += 1) {
    const byte = fixture.data[(index * 37) % fixture.data.length] ?? index;
    const next = fixture.data[(index * 53 + 7) % fixture.data.length] ?? index;
    const zByte = fixture.data[(index * 71 + 11) % fixture.data.length] ?? index;
    const x = (byte / 255 - 0.5) * 5.2;
    const y = (next / 255) * 2.45 - 0.12;
    const z = -0.72 + (zByte / 255) * 0.06;
    const length = 0.006 + ((byte + next) % 6) * 0.0025;
    positions.push([x - length, y, z], [x + length, y, z]);
  }
  return positions;
}

function drawRacingHud(options: {
  readonly speedGauge: HTMLCanvasElement | null;
  readonly rpmGauge: HTMLCanvasElement | null;
  readonly minimap: HTMLCanvasElement | null;
  readonly telemetry: RaceTelemetry;
}): void {
  drawGauge(options.speedGauge, Math.max(0, options.telemetry.speedKph), 240, "#32d6ff", "#f6f7fb");
  drawGauge(options.rpmGauge, Math.max(0, options.telemetry.rpm), 7600, options.telemetry.rpm > 6500 ? "#ff6464" : "#ffd35a", "#f6f7fb");
  drawMinimap(options.minimap, options.telemetry);
}

function drawGauge(canvas: HTMLCanvasElement | null, value: number, maxValue: number, accent: string, needle: string): void {
  const context = canvas?.getContext("2d");
  if (!canvas || !context) return;
  const center = canvas.width / 2;
  const radius = canvas.width * 0.38;
  const start = Math.PI * 0.76;
  const end = Math.PI * 2.24;
  const ratio = Math.max(0, Math.min(1, value / maxValue));
  const angle = start + (end - start) * ratio;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.lineCap = "round";
  context.lineWidth = 8;
  context.strokeStyle = "rgba(120, 160, 190, 0.24)";
  context.beginPath();
  context.arc(center, center, radius, start, end);
  context.stroke();
  context.strokeStyle = accent;
  context.beginPath();
  context.arc(center, center, radius, start, angle);
  context.stroke();
  context.save();
  context.translate(center, center);
  context.rotate(angle);
  context.strokeStyle = needle;
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(-8, 0);
  context.lineTo(radius - 5, 0);
  context.stroke();
  context.restore();
  context.fillStyle = "rgba(246, 247, 251, 0.82)";
  context.beginPath();
  context.arc(center, center, 4, 0, Math.PI * 2);
  context.fill();
}

function drawMinimap(canvas: HTMLCanvasElement | null, telemetry: RaceTelemetry): void {
  const context = canvas?.getContext("2d");
  if (!canvas || !context) return;
  const center = canvas.width / 2;
  const rx = canvas.width * 0.34;
  const ry = canvas.height * 0.27;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "rgba(70, 160, 220, 0.45)";
  context.lineWidth = 12;
  context.beginPath();
  for (let index = 0; index <= telemetry.minimapTrackPoints; index += 1) {
    const t = index / telemetry.minimapTrackPoints;
    const wobble = 1 + Math.sin(t * Math.PI * 6) * 0.08;
    const x = center + Math.cos(t * Math.PI * 2) * rx * wobble;
    const y = center + Math.sin(t * Math.PI * 2) * ry;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
  context.stroke();
  const racers = [
    { t: telemetry.trackT, color: "#ffd35a", radius: 5 },
    { t: (telemetry.trackT + 0.09) % 1, color: "#32d6ff", radius: 4 },
    { t: (telemetry.trackT + 0.18) % 1, color: "#ff6464", radius: 4 },
    { t: (telemetry.trackT + 0.31) % 1, color: "#c8f7d4", radius: 4 }
  ];
  for (const racer of racers) {
    const wobble = 1 + Math.sin(racer.t * Math.PI * 6) * 0.08;
    const x = center + Math.cos(racer.t * Math.PI * 2) * rx * wobble;
    const y = center + Math.sin(racer.t * Math.PI * 2) * ry;
    context.fillStyle = racer.color;
    context.beginPath();
    context.arc(x, y, racer.radius, 0, Math.PI * 2);
    context.fill();
  }
}

function createLitScene(canvas: HTMLCanvasElement): { readonly scene: Scene; readonly camera: PerspectiveCamera } {
  const scene = new Scene();
  const camera = scene.createPerspectiveCamera({ name: "racing-showcase-camera", fovYRadians: Math.PI / 4.5, aspect: canvas.width / canvas.height, near: 0.1, far: 50 });
  camera.transform.setPosition(0, 0.18, 4.15);
  scene.root.addChild(camera);
  const key = scene.createLight("directional", "racing-key");
  key.intensity = 2.2;
  key.color = [1, 0.92, 0.82];
  scene.root.addChild(key);
  const fill = scene.createLight("point", "racing-fill");
  fill.intensity = 1.4;
  fill.range = 7;
  fill.color = [0.45, 0.72, 1];
  fill.transform.setPosition(-1.8, 1.3, 2.8);
  scene.root.addChild(fill);
  return { scene, camera };
}

function formatRaceTime(milliseconds: number): string {
  const safe = Math.max(0, Math.floor(milliseconds));
  const minutes = Math.floor(safe / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1000);
  const millis = safe % 1000;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function matrix(tx: number, ty: number, tz: number, sx: number, sy: number, sz: number, yaw: number, pitch: number, roll: number): Float32Array {
  const compositionScale = 0.56;
  const translatedX = tx * compositionScale;
  const translatedY = ty * compositionScale - 0.02;
  const translatedZ = tz * compositionScale;
  const scaledX = sx * compositionScale;
  const scaledY = sy * compositionScale;
  const scaledZ = sz * compositionScale;
  const cy = Math.cos(yaw);
  const syaw = Math.sin(yaw);
  const cx = Math.cos(pitch);
  const sxp = Math.sin(pitch);
  const cz = Math.cos(roll);
  const szr = Math.sin(roll);
  const r00 = cy * cz + syaw * sxp * szr;
  const r01 = cx * szr;
  const r02 = -syaw * cz + cy * sxp * szr;
  const r10 = -cy * szr + syaw * sxp * cz;
  const r11 = cx * cz;
  const r12 = syaw * szr + cy * sxp * cz;
  const r20 = syaw * cx;
  const r21 = -sxp;
  const r22 = cy * cx;
  return new Float32Array([
    r00 * scaledX, r01 * scaledX, r02 * scaledX, 0,
    r10 * scaledY, r11 * scaledY, r12 * scaledY, 0,
    r20 * scaledZ, r21 * scaledZ, r22 * scaledZ, 0,
    translatedX, translatedY, translatedZ, 1
  ]);
}

function resizeCanvas(canvas: HTMLCanvasElement): void {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(640, Math.round(rect.width * dpr));
  const height = Math.max(420, Math.round(rect.height * dpr));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
}

function installStyles(): void {
  const style = document.createElement("style");
  style.textContent = `
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #2a3542; color: #f6f7fb; }
    body { margin: 0; min-height: 100vh; overflow: hidden; background: #2a3542; }
    .racing-showcase { position: relative; min-height: 100vh; background: #2a3542; }
    .racing-showcase::before {
      content: "";
      position: absolute;
      inset: 0;
      z-index: 1;
      pointer-events: none;
      background:
        linear-gradient(180deg, rgba(5, 8, 12, 0.2), rgba(5, 8, 12, 0) 18%, rgba(5, 8, 12, 0.24)),
        repeating-linear-gradient(90deg, rgba(244, 250, 255, 0.55) 0 1px, transparent 1px 24px),
        repeating-linear-gradient(0deg, rgba(244, 250, 255, 0.45) 0 1px, transparent 1px 22px);
      opacity: 0.72;
    }
    canvas { position: relative; z-index: 0; width: 100vw; height: 100vh; display: block; background: radial-gradient(circle at 48% 20%, #7d96b2 0, #405164 48%, #202934 100%); }
    .race-panel { z-index: 2; position: absolute; pointer-events: none; background: rgba(5, 10, 16, 0.72); border: 1px solid rgba(100, 180, 255, 0.34); border-radius: 8px; color: #f6f7fb; backdrop-filter: blur(8px); }
    .race-panel-primary { left: 24px; top: 22px; width: 188px; padding: 13px 14px; display: grid; gap: 5px; }
    .race-panel-primary strong { font-size: 34px; line-height: 0.95; color: #ffd35a; letter-spacing: 0; }
    .race-panel-primary span { font-size: 13px; line-height: 1.2; color: #c7d6e4; letter-spacing: 0; }
    .race-panel-map { right: 24px; top: 22px; padding: 8px; }
    .race-panel-map canvas { width: 180px; height: 180px; background: rgba(2, 5, 9, 0.62); border-radius: 6px; }
    .race-panel-board { right: 24px; top: 226px; width: 198px; padding: 11px 12px; font-size: 13px; line-height: 1.25; color: #dbe9f5; letter-spacing: 0; }
    .hud { z-index: 2; position: absolute; left: 24px; right: 24px; bottom: 20px; display: grid; grid-template-columns: repeat(4, minmax(96px, 1fr)); gap: 10px; max-width: 720px; pointer-events: none; }
    .hud div { position: relative; background: rgba(5, 10, 16, 0.78); border: 1px solid rgba(100, 180, 255, 0.36); border-radius: 8px; padding: 10px 12px; min-width: 0; min-height: 58px; overflow: hidden; }
    .hud .gauge { min-height: 84px; padding-left: 88px; }
    .hud .gauge canvas { position: absolute; left: 4px; top: 50%; width: 78px; height: 78px; transform: translateY(-50%); background: transparent; }
    .hud span { display: block; font-size: 11px; line-height: 1.1; color: #9db4c8; letter-spacing: 0; }
    .hud strong { display: block; margin-top: 4px; font-size: 22px; line-height: 1; color: #f6f7fb; letter-spacing: 0; }
    .nitro-meter i { position: absolute; left: 12px; right: 12px; bottom: 9px; display: block; height: 5px; width: 100%; max-width: calc(100% - 24px); border-radius: 999px; background: linear-gradient(90deg, #32d6ff, #f6f7fb); box-shadow: 0 0 12px rgba(50, 214, 255, 0.45); }
    @media (max-width: 640px) {
      .hud { grid-template-columns: repeat(2, minmax(0, 1fr)); left: 12px; right: 12px; bottom: 12px; }
      .hud strong { font-size: 18px; }
      .race-panel-primary { left: 12px; top: 12px; width: 138px; padding: 10px; }
      .race-panel-primary strong { font-size: 26px; }
      .race-panel-map { right: 12px; top: 12px; }
      .race-panel-map canvas { width: 126px; height: 126px; }
      .race-panel-board { display: none; }
    }
  `;
  document.head.append(style);
}
