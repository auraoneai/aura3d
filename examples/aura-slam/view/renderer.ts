import { createAuraApp, material, type AuraApp, type AuraRuntimeNodeHandle } from "@aura3d/engine";
import { installSafetyNet, type SafetyNet, type SafetySettings } from "@aura3d/debug";
import type { AthletePose, SceneRenderer } from "../contract/modules";
import type { ActorState, BallState, MatchState } from "../contract/sim";
import type { Vec3 } from "../contract/units";
import { resolveBallHandles, updateBall, type BallHandles } from "./ball";
import { CAMERA_EYE, CAMERA_FAR, CAMERA_FOV_DEG, CAMERA_NEAR, CAMERA_TARGET, cameraFovForAspect, projectWorldPoint } from "./camera";
import { COURT_X, COURT_Y, COURT_Z, HIDDEN_SCALE, SERVICE_Z, SINGLES_X, SPECTATOR_COUNT, clamp } from "./constants";
import { QUALITY_REBUILD } from "./lighting";
import { resolveAppearance } from "./appearance";
import { createPoseRig } from "./poseRig";
import type { AthleteRigPort } from "./rigPort";
import { cachedMediaQuery } from "../ui/dom";
import { createParticleUpdater } from "./particles";
import { STATIC_RUNTIME_IDS, buildTennisScene } from "./scene";
import { createSpectatorUpdater } from "./spectators";
import { VENUE_PALETTES, isMoonVenue, venueKey } from "./venues";

/** Serve cue the HUD publishes (the renderer only needs the fault flash). */
export interface ServeCue { visible?: boolean; kind?: string }

export interface SceneRendererOptions {
  /** Pose provider (M-POSE `AthletePose`). */
  pose: AthletePose;
  /** Rig implementation; defaults to the M-POSE rig (pixel-identical to the live adapter's rig). */
  rig?: AthleteRigPort<unknown>;
  /** Predicted landing for the beginner landing ring (PhysicsKit.landing). */
  landing?: (ball: BallState) => { x: number; y: number } | null | undefined;
  /** Safety net settings; on by default so `?diag=1` and the black-frame self-heal work. */
  safety?: boolean | SafetySettings;
  /** Debug: wrap every runtime node handle (used by the harness to trace non-finite transforms). */
  wrapHandle?: (id: string, handle: AuraRuntimeNodeHandle) => AuraRuntimeNodeHandle;
  /** Page search string for the safety switches (defaults to `location.search`). */
  search?: string;
  /** Reduced-motion probe for the hit shake (defaults to a cached `prefers-reduced-motion` media query). */
  reducedMotion?: () => boolean;
}

/** Camera shake per unit of sim `screenShake` (the sim sets 0.15 on a serve fault and 0.07 on a player hit). */
export const SHAKE_TRAUMA_PER_UNIT = 2.4;

export interface SceneRendererHandle extends SceneRenderer {
  readonly app: AuraApp | null;
  isReady(): boolean;
  framesRendered(): number;
  render(state: Readonly<MatchState>, dt?: number, serveCue?: ServeCue): void;
  debug(): Record<string, unknown>;
  safety(): SafetyNet | null;
}

type LooseState = MatchState & { serveSide?: string; outFeedback: (Record<string, unknown> & { remaining?: number }) | null };

/** Mount the Aura Slam court on a canvas. Rendering is presentation only: it never mutates the sim state. */
export function createSceneRenderer(options: SceneRendererOptions): SceneRendererHandle {
  const rig = options.rig ?? (createPoseRig({ resolveAppearance }) as AthleteRigPort<unknown>);
  let app: AuraApp | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let net: SafetyNet | null = null;
  let ready = false;
  let rigs: { player: unknown; rival: unknown } | null = null;
  let ball: BallHandles | null = null;
  const h: Record<string, AuraRuntimeNodeHandle> = {};
  let grassStripes: AuraRuntimeNodeHandle[] = [];
  let spectators: AuraRuntimeNodeHandle | null = null;
  let particles: AuraRuntimeNodeHandle | null = null;
  const spectatorUpdater = createSpectatorUpdater();
  const particleUpdater = createParticleUpdater();
  const reducedMotionQuery = options.reducedMotion ? null : cachedMediaQuery("(prefers-reduced-motion: reduce)");
  const reducedMotion = options.reducedMotion ?? (() => reducedMotionQuery!.matches());
  let audienceVisible = true;
  let cameraFov = CAMERA_FOV_DEG;
  let lastShake = 0;
  let particlesDrawn = 0;
  let resizeObserver: ResizeObserver | null = null;

  let viewportWidth = 1280;
  let viewportHeight = 800;
  let pixelRatio = 1;
  let currentVenueKey = "";
  let lastFaultActive = false;
  let lastBallWorld: Vec3 = [0, 0.8, 6.4];
  let lastPlayerPose: ReturnType<AthletePose["pose"]> | null = null;
  let frames = 0;

  function applyVenue(venue: string): void {
    const key = venueKey(venue);
    if (currentVenueKey === key) return;
    currentVenueKey = key;
    const pal = VENUE_PALETTES[key]!;
    h.ground!.setMaterial(material.pbr({ color: pal.ground, roughness: 0.94 }));
    h.apron!.setMaterial(material.pbr({ color: pal.apron, roughness: 0.88 }));
    h.doubles!.setMaterial(material.pbr({ color: pal.alley, roughness: 0.82 }));
    h.singles!.setMaterial(material.pbr({ color: pal.court, roughness: 0.78 }));
    const isGrass = key === "grass";
    for (const stripe of grassStripes) stripe.setScale(isGrass ? [1, 1, 1] : HIDDEN_SCALE).setVisible(isGrass);
    // C7: the rest of the venue palette, and no crowd or grandstand on the Moon.
    h.backdrop?.setMaterial(material.pbr({ color: pal.background, roughness: 1, unlit: true }));
    h.bleachers?.setMaterial(material.pbr({ color: pal.seat, roughness: 0.85 }));
    h.sponsorTrim?.setMaterial(material.pbr({ color: pal.trim, roughness: 0.55 }));
    audienceVisible = !isMoonVenue(key);
    spectators?.setVisible(audienceVisible);
    h.grandstand?.setVisible(audienceVisible);
    h.bleachers?.setVisible(audienceVisible);
  }

  /** Backing store = CSS box x device pixel ratio (capped at 2), never below the engine minimum. */
  function syncBacking(): void {
    if (!canvas) return;
    const w = Number(canvas.clientWidth) || 0, h = Number(canvas.clientHeight) || 0;
    if (w < 1 || h < 1) return;
    const ratio = Math.min(2, (typeof window !== "undefined" ? window.devicePixelRatio : 1) || 1);
    const bw = Math.max(320, Math.round(w * ratio)), bh = Math.max(220, Math.round(h * ratio));
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    viewportWidth = w; viewportHeight = h;
    if (ready) applyCameraFov();
  }

  /** C2: aspect-aware FOV, pushed to the live camera whenever the canvas aspect changes. */
  function applyCameraFov(): void {
    const fov = cameraFovForAspect(viewportWidth / Math.max(1, viewportHeight));
    if (Math.abs(fov - cameraFov) < 1e-6) return;
    cameraFov = fov;
    try {
      app?.camera?.setPose({ position: [...CAMERA_EYE], target: [...CAMERA_TARGET], fov }, { cut: true });
    } catch { /* camera controller is optional */ }
  }

  const self: SceneRendererHandle = {
    get app() {
      return app;
    },
    isReady: () => ready,
    framesRendered: () => frames,
    safety: () => net,

    async mount(target: HTMLCanvasElement): Promise<void> {
      canvas = target;
      app = createAuraApp(target, {
        scene: buildTennisScene(rig),
        // C11: a governed tier ("auto") instead of the old string, which resolveMountQuality ignored; coarse-pointer devices get "medium".
        renderer: { quality: { tier: "auto" } },
        qualityRebuild: QUALITY_REBUILD,
        // C2: the page sizes the canvas (portrait phones put it between the score band and the control band). The engine's own
        // resize fits the canvas to its parent, which ignored that layout: on a 390 x 844 phone the canvas stayed 844 px tall,
        // pushed 196 px down, so its bottom (the near athlete) was below the screen. The renderer owns the backing size instead.
        resize: false
      });
      await app.ready();
      const req = (id: string): AuraRuntimeNodeHandle => (options.wrapHandle ? options.wrapHandle(id, app!.nodes.require(id)) : app!.nodes.require(id));
      const resolver = options.wrapHandle ? ({ nodes: { require: req } } as unknown as AuraApp) : app;
      rigs = { player: rig.resolve(resolver, "player"), rival: rig.resolve(resolver, "rival") };
      ball = resolveBallHandles(req);
      h.ground = req("stadium-outer-ground");
      h.apron = req("court-apron");
      h.doubles = req("court-doubles-surface");
      h.singles = req("court-singles-surface");
      h.serviceBox = req("service-box-highlight");
      h.aimRing = req("serve-aim-ring");
      h.tossRing = req("serve-toss-ring");
      h.landingRing = req("landing-indicator-ring");
      h.umpireHead = req("umpire-head");
      h.faultLeft = req("net-fault-left");
      h.faultRight = req("net-fault-right");
      grassStripes = Array.from({ length: 8 }, (_, i) => req(`grass-stripe-${i}`));
      spectators = req("spectators");
      particles = req("hit-particles");
      particles.setVisible(false);
      h.backdrop = req("stadium-backdrop");
      h.bleachers = req(STATIC_RUNTIME_IDS.bleachers);
      h.sponsorTrim = req(STATIC_RUNTIME_IDS.sponsorTrim);
      h.grandstand = req("stadium-grandstand-rear");
      try { app.camera?.shake.configure({ maxOffset: 0.18, maxAngleDeg: 0.35, frequency: 18, decayPerSecond: 2.6 }); } catch { /* optional */ }
      net = installSafetyNet({
        safety: options.safety ?? true,
        canvas: target,
        app: app as unknown as Parameters<typeof installSafetyNet>[0]["app"],
        ...(options.search !== undefined ? { search: options.search } : {})
      });
      ready = true;
      // Hand layout back to the stylesheet (the mount froze the CSS size in px) and track the CSS box from now on.
      if (target.style) { target.style.width = ""; target.style.height = ""; }
      syncBacking();
      if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(() => syncBacking());
        resizeObserver.observe(target);
      }
      cameraFov = CAMERA_FOV_DEG;
      applyCameraFov();
    },

    setVenue(venueId: string): void {
      if (ready) applyVenue(venueId);
    },

    render(state: Readonly<MatchState>, _dt?: number, serveCue?: ServeCue): void {
      if (!state || !app || !ready || !ball || !rigs) {
        if (canvas) delete canvas.dataset.ready;
        return;
      }
      frames += 1;
      const s = state as LooseState;
      const venue = s.venue || "hard";
      const isMoon = isMoonVenue(venue);
      applyVenue(venue);

      lastBallWorld = updateBall(ball, state);
      const [bx, by, bz] = lastBallWorld;
      const b = state.ball;

      const isPlayerServing = state.mode === "playing" && state.server === "player" && (state.phase === "serve" || state.phase === "serveToss");
      const serveAim = state.serveAttempt?.lockedAim || state.serveAttempt?.aim;
      if (isPlayerServing && serveAim) {
        const boxSignX = (s.serveCourt ?? s.serveSide) === "deuce" ? -1 : 1;
        h.serviceBox!.setPosition(boxSignX * SINGLES_X * 0.5, 0.011, -SERVICE_Z * 0.5).setScale([1, 1, 1]).setVisible(true);
        h.aimRing!.setPosition(serveAim.x * COURT_X, 0.022, serveAim.y * COURT_Z).setScale([1, 1, 1]).setVisible(true);
      } else {
        h.serviceBox!.setScale(HIDDEN_SCALE).setVisible(false);
        h.aimRing!.setScale(HIDDEN_SCALE).setVisible(false);
      }

      if (state.mode === "playing" && state.server === "player" && state.phase === "serveToss" && b.z >= 0.75 && b.z <= 1.08) {
        h.tossRing!.setPosition(bx, by, bz).setRotation(0, (state.time ?? 0) * 4, 0).setScale([1.15, 1.15, 1.15]).setVisible(true);
      } else {
        h.tossRing!.setScale(HIDDEN_SCALE).setVisible(false);
      }

      const land = options.landing && state.mode === "playing" && state.phase === "rally" && b.active && b.vy > 0 && b.bounceCount === 0 ? options.landing(b) : null;
      if (land && Number.isFinite(land.x) && Number.isFinite(land.y)) {
        h.landingRing!.setPosition(land.x * COURT_X, 0.02, land.y * COURT_Z).setScale([1, 1, 1]).setVisible(true);
      } else {
        h.landingRing!.setScale(HIDDEN_SCALE).setVisible(false);
      }

      const faultOn = Boolean((serveCue?.visible && serveCue?.kind === "fault") || (s.outFeedback && (s.outFeedback.remaining ?? 0) > 0));
      if (faultOn !== lastFaultActive) {
        lastFaultActive = faultOn;
        const mat = faultOn
          ? material.emissive({ color: "#ff3b30", emissive: "#ff3b30", emissiveIntensity: 1.45 })
          : material.emissive({ color: "#3d1c1a", emissive: "#3d1c1a", emissiveIntensity: 0.15 });
        h.faultLeft!.setMaterial(mat);
        h.faultRight!.setMaterial(mat);
      }

      const umpireYaw = clamp(-bx * 0.055, -0.42, 0.42);
      h.umpireHead!.setPosition(-6.68, 2.62, 0).setRotation(0, Math.PI * 0.5 + umpireYaw, 0);

      const t = Number(state.time ?? 0);
      const cheering = (state.phase as string) === "pointOver" || state.mode === "gameover";
      if (spectators && audienceVisible) spectatorUpdater.update(spectators, t, cheering);
      if (particles) particlesDrawn = particleUpdater.update(particles, s.particles as never);

      // C13: the sim's screen shake drives a small camera trauma, skipped under reduced motion.
      const shake = Number(s.screenShake ?? 0);
      if (shake > lastShake + 1e-4 && !reducedMotion()) {
        try { app.camera?.shake.add(Math.min(1, shake * SHAKE_TRAUMA_PER_UNIT)); } catch { /* optional */ }
      }
      lastShake = shake;

      const pPose = options.pose.pose(state.player, state);
      const aiPose = options.pose.pose(state.ai, state);
      lastPlayerPose = pPose;
      rig.update(rigs.player, state.player as Readonly<ActorState>, pPose, { isPlayer: true, isMoon });
      rig.update(rigs.rival, state.ai as Readonly<ActorState>, aiPose, { isPlayer: false, isMoon });

      // C8: a lost context presents black frames by definition; sampling them made the safety net reload the page mid-match.
      if (!app.deviceLost?.()) net?.sample(frames);
    },

    project(world: Vec3): { x: number; y: number; visible: boolean } {
      const p = projectWorldPoint(viewportWidth, viewportHeight, world[0] * COURT_X, Math.max(0.04, world[2] * COURT_Y), world[1] * COURT_Z, cameraFov);
      return { x: p.x, y: p.y, visible: p.visible };
    },

    resize(width: number, height: number, ratio: number): void {
      viewportWidth = Math.max(1, width);
      viewportHeight = Math.max(1, height);
      pixelRatio = ratio || 1;
      syncBacking();
      if (ready) applyCameraFov();
    },

    dispose(): void {
      net?.dispose();
      net = null;
      ready = false;
      reducedMotionQuery?.dispose();
      resizeObserver?.disconnect();
      resizeObserver = null;
      try { app?.dispose(); } catch { /* already gone */ }
      app = null;
    },

    debug(): Record<string, unknown> {
      return {
        type: "aura3d-smooth-players",
        engine: "@aura3d/engine",
        playerStyle: "3d",
        displayBall: [...lastBallWorld],
        camera: { position: [...CAMERA_EYE], target: [...CAMERA_TARGET], fov: cameraFov, near: CAMERA_NEAR, far: CAMERA_FAR, aspect: viewportWidth / Math.max(1, viewportHeight) },
        viewport: { width: viewportWidth, height: viewportHeight, bottom: 0, pixelRatio },
        audience: { visible: spectators ? spectators.visible !== false : audienceVisible, count: SPECTATOR_COUNT },
        environment: { venue: currentVenueKey || "hard", background: VENUE_PALETTES[currentVenueKey || "hard"]?.background ?? null },
        particles: { drawn: particlesDrawn },
        umpire: { visible: true },
        netPostLights: { active: lastFaultActive },
        outfits: { player: currentVenueKey === "moon" ? "apollo" : "tennis", rival: currentVenueKey === "moon" ? "apollo" : "tennis" },
        playerPose: lastPlayerPose ? { mode: lastPlayerPose.mode, legs: lastPlayerPose.legs, rightHand: lastPlayerPose.right, leftHand: lastPlayerPose.left } : null
      };
    }
  };
  return self;
}
