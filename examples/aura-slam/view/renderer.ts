import { createAuraApp, material, type AuraApp, type AuraRuntimeNodeHandle } from "@aura3d/engine";
import { installSafetyNet, type SafetyNet, type SafetySettings } from "@aura3d/debug";
import type { AthletePose, SceneRenderer } from "../contract/modules";
import type { ActorState, BallState, MatchState } from "../contract/sim";
import type { Vec3 } from "../contract/units";
import { resolveBallHandles, updateBall, type BallHandles } from "./ball";
import { slamQaCrops, type QaCrop } from "./qaCrops";
import { createBroadcastDirector, createLetterbox, introParam, type BroadcastDirector, type DirectorFrame, type Letterbox } from "./intro";
import { BROADCAST_DOF, CAMERA_FAR, CAMERA_NEAR, CUT_DOF_FSTOP, acePunchOffset, nextPunchT, cameraFovForAspect, cameraRigFor, dampPan, panGoal, panLimitFor, panPose, projectWorldPoint, type CameraPose } from "./camera";
import { COURT_X, COURT_Y, COURT_Z, HIDDEN_SCALE, SERVICE_Z, SINGLES_X, SPECTATOR_COUNT, clamp } from "./constants";
import { POST_EFFECT, QUALITY_REBUILD } from "./lighting";
import { resolveAppearance } from "./appearance";
import { createPoseRig } from "./poseRig";
import type { AthleteRigPort } from "./rigPort";
import { cachedMediaQuery } from "../ui/dom";
import { createParticleUpdater } from "./particles";
import { STATIC_RUNTIME_IDS, buildTennisScene } from "./scene";
import { createSpectatorUpdater } from "./spectators";
import { VENUE_PALETTES, isMoonVenue, venueKey } from "./venues";
import { lookMode, venueLook } from "./look";
import { applyVenueRuntime, optionalNode, venueRuntimePlan, type VenueRuntimeApp, type VenueRuntimePlan } from "./venueRuntime";
import { createSlamVfx, registerSlamVfx, type SlamVfxController } from "./vfx";
import { CROWD_SEAT_COUNT, createWorldTourCrowd, type WorldTourCrowd } from "./crowd";
import { GRASS_STRIPE_NODE_IDS, rigMaterialRole, surfaceMaterial, upgradeRigMaterial, type RigMaterialRole } from "./surfaces";
import { BOARD_IDS, createBoardsController, standLineText, type BoardsController } from "./boards";

/** TT-M2: forwards every write to the real handle, upgrading the materials the rig sets (kit fabric, racket clearcoat). */
function materialUpgradeHandle(real: AuraRuntimeNodeHandle, role: Exclude<RigMaterialRole, null>): AuraRuntimeNodeHandle {
  const wrapped = new Map<PropertyKey, unknown>();
  const self: AuraRuntimeNodeHandle = new Proxy(real, {
    get(target, prop) {
      const cached = wrapped.get(prop);
      if (cached !== undefined) return cached;
      const value = Reflect.get(target, prop) as unknown;
      if (typeof value !== "function") return value;
      const fn = prop === "setMaterial"
        ? (spec: unknown) => { target.setMaterial(upgradeRigMaterial(role, spec as never) as never); return self; }
        : (...args: unknown[]) => { const out = (value as (...a: unknown[]) => unknown).apply(target, args); return out === target ? self : out; };
      wrapped.set(prop, fn);
      return fn;
    }
  });
  return self;
}

/** Rig parts the World Tour look removes from the frame (TT-L2: contact shadows and the key's shadow replace the discs). */
export const SHADOW_DISC_IDS = ["player-shadow", "rival-shadow"] as const;

/** A handle that ignores every write: the rig keeps driving its disc, which stays hidden (rig code and parity unchanged). */
function inertHandle(real: AuraRuntimeNodeHandle): AuraRuntimeNodeHandle {
  const inert: Record<string, unknown> = {};
  const noop = (): unknown => self;
  const self = new Proxy(inert, {
    get(_target, prop) {
      if (prop === "visible") return false;
      if (prop === "id") return real.id;
      const value = (real as unknown as Record<string | symbol, unknown>)[prop];
      return typeof value === "function" ? noop : value;
    }
  });
  return self as unknown as AuraRuntimeNodeHandle;
}

/** Active post tier for the venue plan (volumetric fog at High+ only); "high" when the build reports none. */
function activeTier(app: AuraApp): string {
  try {
    const tier = (app.diagnostics() as { post?: { tier?: string } }).post?.tier;
    return typeof tier === "string" ? tier : "high";
  } catch {
    return "high";
  }
}

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
  // TT-C1: the broadcast camera (v2 in the World Tour look; `?cam=classic` / `?look=original` keep the 4.6.1 camera) and its
  // damped sideways pan (eye and aim move together, at most CAMERA_PAN_LIMIT; none under reduced motion).
  const cameraRig = cameraRigFor(options.search ?? (typeof location !== "undefined" ? location.search : ""));
  let cameraFov = cameraRig.fovDeg;
  let pan = 0;
  let posedPan = 0;
  let cameraPose: CameraPose = panPose(cameraRig, 0);
  // TT-V2: seconds since the last ace's lens punch (Infinity = none running); the drawn FOV is cameraFov minus the punch.
  let punchT = Number.POSITIVE_INFINITY;
  let punchSent = 0;
  let acesPunched = 0;
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
  // GU47 WP-11: the World Tour look (default) or today's look (`?look=original`). The boot venue comes from `?venue=` so the
  // authored scene already carries its HDRI, fog, key and grade (only the active HDRI is fetched).
  const pageSearch = options.search ?? (typeof location !== "undefined" ? location.search : "");
  const look = lookMode(pageSearch);
  const worldTour = look === "world-tour";
  const bootVenue = venueKey(new URLSearchParams(pageSearch).get("venue"));
  let venuePlan: VenueRuntimePlan | null = null;
  let venueChanges = 0;
  let vfx: SlamVfxController | null = null;
  // TT-AN1: the World Tour crowd (heads follow the ball); `?look=original` keeps the 24 capsule spectators.
  const crowd: WorldTourCrowd | null = worldTour ? createWorldTourCrowd() : null;
  let spectatorHeads: AuraRuntimeNodeHandle | null = null;
  let crowdDraws = 0;
  // TT-H2 / TT-A2: the stand's live venue + score line and the LED ribbon pulse on aces.
  let boards: BoardsController | null = null;
  let standText: AuraRuntimeNodeHandle | null = null;
  let acesSeen = 0;
  // TT-C2: the director's cut-aways (match intro, changeover) with letterbox bars; `?intro=0` off, `?intro=1` at boot.
  const introMode = introParam(pageSearch);
  const director: BroadcastDirector | null = worldTour && introMode !== "off" ? createBroadcastDirector() : null;
  let cutFrame: DirectorFrame | null = null;
  let letterbox: Letterbox | null = null;
  let removeSkipListeners: (() => void) | null = null;
  /** The crowd kit's update target: the app's node store (`nodes.get`, else a guarded `nodes.require` on test doubles). */
  const crowdTarget = { nodes: { get: (id: string) => (app ? optionalNode(app as unknown as VenueRuntimeApp, id) : undefined) } };

  function applyVenue(venue: string): void {
    const key = venueKey(venue);
    if (currentVenueKey === key) return;
    const first = currentVenueKey === "";
    currentVenueKey = key;
    if (worldTour && app) {
      venuePlan = applyVenueRuntime(app as unknown as VenueRuntimeApp, venueRuntimePlan(venueLook(key), activeTier(app)), { initial: first && key === bootVenue });
      if (!first) venueChanges += 1;
      vfx?.clearMarks();
    }
    const pal = VENUE_PALETTES[key]!;
    if (worldTour) {
      // TT-M1: the venue's surface family (acrylic clearcoat, turf sheen, clay 0.95, regolith) in the palette colours.
      h.ground!.setMaterial(surfaceMaterial(key, "ground"));
      h.apron!.setMaterial(surfaceMaterial(key, "apron"));
      h.doubles!.setMaterial(surfaceMaterial(key, "alley"));
      h.singles!.setMaterial(surfaceMaterial(key, "court"));
    } else {
      h.ground!.setMaterial(material.pbr({ color: pal.ground, roughness: 0.94 }));
      h.apron!.setMaterial(material.pbr({ color: pal.apron, roughness: 0.88 }));
      h.doubles!.setMaterial(material.pbr({ color: pal.alley, roughness: 0.82 }));
      h.singles!.setMaterial(material.pbr({ color: pal.court, roughness: 0.78 }));
    }
    const isGrass = key === "grass";
    for (const stripe of grassStripes) stripe.setScale(isGrass ? [1, 1, 1] : HIDDEN_SCALE).setVisible(isGrass);
    // C7: the rest of the venue palette, and no crowd or grandstand on the Moon.
    h.backdrop?.setMaterial(material.pbr({ color: pal.background, roughness: 1, unlit: true }));
    h.bleachers?.setMaterial(material.pbr({ color: pal.seat, roughness: 0.85 }));
    h.sponsorTrim?.setMaterial(material.pbr({ color: pal.trim, roughness: 0.55 }));
    audienceVisible = !isMoonVenue(key);
    spectators?.setVisible(audienceVisible);
    spectatorHeads?.setVisible(audienceVisible);
    standText?.setVisible(audienceVisible);
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

  /** The FOV the frame uses: the aspect-aware rig FOV, narrowed while an ace punch runs. */
  function drawnFov(): number {
    // A cut keeps the aspect compensation of the rig (portrait canvases widen it by the same ratio).
    if (cutFrame) return Math.min(90, cutFrame.fov * (cameraFov / cameraRig.fovDeg));
    return cameraFov - acePunchOffset(punchT);
  }

  /** TT-C2: ends a running cut now and hands the frame back to the broadcast camera (key, pointer or touch). */
  function skipCut(): void {
    if (!director?.active && !cutFrame) return;
    director?.skip();
    cutFrame = null;
    letterbox?.show(false);
    pushCameraPose();
    syncCutDof();
  }

  let lastDirectorMs = Number.NaN;
  /** TT-C2: advances the director; the pose is re-sent every frame of a cut and once when it ends. */
  function stepDirector(state: Readonly<MatchState>, dt: number | undefined): void {
    if (!director) return;
    const was = cutFrame;
    const nowMs = typeof performance !== "undefined" ? performance.now() : Number.NaN;
    const wallSeconds = Number.isFinite(lastDirectorMs) && Number.isFinite(nowMs) ? (nowMs - lastDirectorMs) / 1000 : undefined;
    lastDirectorMs = nowMs;
    cutFrame = director.step(state as never, Number.isFinite(dt) ? dt! : 1 / 60, reducedMotion(), wallSeconds);
    letterbox?.show(cutFrame !== null);
    if (cutFrame || was) pushCameraPose();
    syncCutDof();
  }

  /** TT-P2: cut-aways focus at CUT_DOF_FSTOP on the shot's target; the broadcast DOF returns when the cut ends. */
  let dofShot: string | null = null;
  function syncCutDof(): void {
    const shot = cutFrame?.shot ?? null;
    if (shot === dofShot) return;
    dofShot = shot;
    const post = (app as unknown as VenueRuntimeApp | null)?.post;
    const patch = cutFrame
      ? { focusDistance: Math.hypot(cutFrame.pose.target[0] - cutFrame.pose.eye[0], cutFrame.pose.target[1] - cutFrame.pose.eye[1], cutFrame.pose.target[2] - cutFrame.pose.eye[2]), fStop: CUT_DOF_FSTOP, focalLength: BROADCAST_DOF.focalLength }
      : { ...BROADCAST_DOF };
    try { post?.setEffect?.(POST_EFFECT.depthOfField, patch); } catch { /* post surface optional */ }
  }

  /** TT-V2: starts a punch on a new ace (World Tour only, never under reduced motion) and advances a running one. */
  function stepAcePunch(aces: number, dt: number | undefined): void {
    punchT = nextPunchT(punchT, aces, acesPunched, dt, worldTour, reducedMotion());
    acesPunched = aces;
    const offset = acePunchOffset(punchT);
    if (Math.abs(offset - punchSent) > 1e-4) { punchSent = offset; pushCameraPose(); }
  }

  let lastCrops: QaCrop[] = [];
  /** GU47 (E-I crop contract): projects the probe boxes through the live pose and publishes them. */
  function publishQaCrops(state: Readonly<MatchState>): void {
    const fov = drawnFov();
    lastCrops = slamQaCrops({
      width: viewportWidth, height: viewportHeight,
      project: (x, y, z) => projectWorldPoint(viewportWidth, viewportHeight, x, y, z, fov, cameraPose),
      player: { x: Number(state.player?.x ?? 0), y: Number(state.player?.y ?? 0) },
      rival: { x: Number(state.ai?.x ?? 0), y: Number(state.ai?.y ?? 0) },
      ball: lastBallWorld
    });
    const host = globalThis as { __AURA_QA__?: Record<string, unknown> };
    if (typeof window !== "undefined") host.__AURA_QA__ = { ...(host.__AURA_QA__ ?? {}), crops: lastCrops };
  }

  /** Pushes the live pose (rig + pan) and FOV to the camera controller. */
  function pushCameraPose(): void {
    cameraPose = cutFrame ? cutFrame.pose : panPose(cameraRig, pan);
    posedPan = pan;
    try {
      app?.camera?.setPose({ position: [...cameraPose.eye], target: [...cameraPose.target], fov: drawnFov() }, { cut: true });
    } catch { /* camera controller is optional */ }
  }

  /** C2: aspect-aware FOV, pushed to the live camera whenever the canvas aspect changes. */
  function applyCameraFov(): void {
    const fov = cameraFovForAspect(viewportWidth / Math.max(1, viewportHeight), cameraRig);
    if (Math.abs(fov - cameraFov) < 1e-6) return;
    cameraFov = fov;
    pushCameraPose();
  }

  /** TT-C1: the damped pan toward play; the pose is re-sent only when it moved by more than a millimetre. */
  function stepCameraPan(ballX: number, dt: number | undefined): void {
    if (cameraRig.id !== "v2") return;
    pan = dampPan(pan, panGoal(ballX, panLimitFor(viewportWidth / Math.max(1, viewportHeight), cameraRig)), Number.isFinite(dt) ? dt! : 1 / 60, reducedMotion());
    if (Math.abs(pan - posedPan) > 1e-3) pushCameraPose();
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
        scene: buildTennisScene(rig, { venue: bootVenue, look, camera: cameraRig, ...(crowd ? { crowd } : {}) }),
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
      // TT-L2: in the World Tour look the athletes' cylinder shadow discs leave the frame (hidden once; the rig writes to an inert
      // handle), so the PCSS key shadow and the contact-shadow pass ground the athletes instead. TT-M2: kit and racket parts
      // get their fabric / clearcoat materials where the rig sets them. The rig code (and its parity) is unchanged.
      const rigReq = worldTour
        ? (id: string): AuraRuntimeNodeHandle => {
            const handle = req(id);
            if ((SHADOW_DISC_IDS as readonly string[]).includes(id)) {
              handle.setScale(HIDDEN_SCALE).setVisible(false);
              return inertHandle(handle);
            }
            const role = rigMaterialRole(id);
            return role ? materialUpgradeHandle(handle, role) : handle;
          }
        : req;
      const resolver = options.wrapHandle || worldTour ? ({ nodes: { require: rigReq } } as unknown as AuraApp) : app;
      rigs = { player: rig.resolve(resolver, "player"), rival: rig.resolve(resolver, "rival") };
      ball = resolveBallHandles(req, { trail: !worldTour, marks: !worldTour });
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
      grassStripes = worldTour ? GRASS_STRIPE_NODE_IDS.map((id) => req(id)) : Array.from({ length: 8 }, (_, i) => req(`grass-stripe-${i}`));
      spectators = req(crowd ? crowd.bodies.nodeIds[0]! : "spectators");
      if (crowd) spectatorHeads = req(crowd.heads.nodeIds[0]!);
      particles = req("hit-particles");
      particles.setVisible(false);
      // TT-E1: the backdrop wall exists in `?look=original` only (the venue HDRI shows there in the World Tour look).
      const backdrop = worldTour ? undefined : req("stadium-backdrop");
      if (backdrop) h.backdrop = backdrop;
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
      if (worldTour) {
        // GU47 TT-V1 / TT-V2: the registered bounce bursts, the decal marks and the ball's trail ribbon.
        const effects = (app as { effects?: Parameters<typeof createSlamVfx>[0] & Parameters<typeof registerSlamVfx>[0] }).effects;
        registerSlamVfx(effects);
        vfx = createSlamVfx(effects, { reducedMotion });
        vfx.startTrail("tennis-ball");
        standText = optionalNode(app as unknown as VenueRuntimeApp, BOARD_IDS.stand) ?? null;
        boards = createBoardsController(standText ?? undefined, h.sponsorTrim, standLineText(venueLook(bootVenue).city, null));
        // GU47: the boot venue's light visibility, grade and output apply before the first presented frame.
        applyVenue(bootVenue);
      }
      // Hand layout back to the stylesheet (the mount froze the CSS size in px) and track the CSS box from now on.
      if (target.style) { target.style.width = ""; target.style.height = ""; }
      syncBacking();
      if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(() => syncBacking());
        resizeObserver.observe(target);
      }
      cameraFov = cameraRig.fovDeg;
      applyCameraFov();
      if (director) {
        letterbox = createLetterbox(target.parentElement, reducedMotion);
        if (typeof window !== "undefined") {
          const onSkip = (): void => skipCut();
          for (const type of ["keydown", "pointerdown", "touchstart"]) window.addEventListener(type, onSkip, { passive: true });
          removeSkipListeners = () => { for (const type of ["keydown", "pointerdown", "touchstart"]) window.removeEventListener(type, onSkip); };
        }
        if (introMode === "boot") director.start("intro");
      }
    },

    setVenue(venueId: string): void {
      if (ready) applyVenue(venueId);
    },

    render(state: Readonly<MatchState>, dt?: number, serveCue?: ServeCue): void {
      if (!state || !app || !ready || !ball || !rigs) {
        if (canvas) delete canvas.dataset.ready;
        return;
      }
      frames += 1;
      const s = state as LooseState;
      const venue = s.venue || "hard";
      const isMoon = isMoonVenue(venue);
      applyVenue(venue);

      lastBallWorld = updateBall(ball, state, { shadowDisc: !worldTour });
      const [bx, by, bz] = lastBallWorld;
      const b = state.ball;
      stepCameraPan(bx, dt);
      stepDirector(state, dt);

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
      if (crowd) {
        // TT-AN1: heads follow the ball with a per-seat lag; the crowd stands on a cheer (no rise under reduced motion).
        if (audienceVisible && app) {
          crowd.follow(bx, bz, Number.isFinite(dt) ? dt! : 1 / 60, cheering, reducedMotion());
          crowdDraws = crowd.update(crowdTarget, t);
        }
      } else if (spectators && audienceVisible) spectatorUpdater.update(spectators, t, cheering);
      if (particles) particlesDrawn = particleUpdater.update(particles, s.particles as never);
      vfx?.update(s as never, venueLook(currentVenueKey));
      stepAcePunch(vfx?.events.aces ?? 0, dt);
      if (boards) {
        boards.setStandText(standLineText(venueLook(currentVenueKey).city, state.score));
        const aces = vfx?.events.aces ?? 0;
        if (aces > acesSeen) boards.pulse(reducedMotion());
        acesSeen = aces;
        boards.step(Number.isFinite(dt) ? dt! : 1 / 60, VENUE_PALETTES[currentVenueKey]?.trim ?? "#d8ff3e");
      }

      // C13: the sim's screen shake drives a small camera trauma, skipped under reduced motion.
      const shake = Number(s.screenShake ?? 0);
      if (shake > lastShake + 1e-4 && !reducedMotion()) {
        try { app.camera?.shake.add(Math.min(1, shake * SHAKE_TRAUMA_PER_UNIT)); } catch { /* optional */ }
      }
      lastShake = shake;

      // GU47: named QA crops for the remote luma capture (window.__AURA_QA__.crops), refreshed every 6 frames.
      if (worldTour && frames % 6 === 0) publishQaCrops(state);

      const pPose = options.pose.pose(state.player, state);
      const aiPose = options.pose.pose(state.ai, state);
      lastPlayerPose = pPose;
      rig.update(rigs.player, state.player as Readonly<ActorState>, pPose, { isPlayer: true, isMoon });
      rig.update(rigs.rival, state.ai as Readonly<ActorState>, aiPose, { isPlayer: false, isMoon });

      // C8: a lost context presents black frames by definition; sampling them made the safety net reload the page mid-match.
      if (!app.deviceLost?.()) net?.sample(frames);
    },

    project(world: Vec3): { x: number; y: number; visible: boolean } {
      const p = projectWorldPoint(viewportWidth, viewportHeight, world[0] * COURT_X, Math.max(0.04, world[2] * COURT_Y), world[1] * COURT_Z, drawnFov(), cameraPose);
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
      removeSkipListeners?.();
      letterbox?.dispose();
      vfx?.dispose();
      vfx = null;
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
        camera: { rig: cameraRig.id, position: [...cameraPose.eye], target: [...cameraPose.target], pan, fov: drawnFov(), baseFov: cameraFov, acePunch: acePunchOffset(punchT), cut: director ? { active: director.active, shot: cutFrame?.shot ?? null, time: director.time, ...director.played } : null, near: CAMERA_NEAR, far: CAMERA_FAR, aspect: viewportWidth / Math.max(1, viewportHeight) },
        viewport: { width: viewportWidth, height: viewportHeight, bottom: 0, pixelRatio },
        audience: {
          visible: spectators ? spectators.visible !== false : audienceVisible,
          count: crowd ? CROWD_SEAT_COUNT : SPECTATOR_COUNT,
          ...(crowd ? { draws: crowdDraws, meanHeadYawDeg: (crowd.meanHeadYaw() * 180) / Math.PI, standing: crowd.standing() } : {})
        },
        environment: { venue: currentVenueKey || "hard", background: VENUE_PALETTES[currentVenueKey || "hard"]?.background ?? null },
        look: {
          mode: look,
          bootVenue,
          venueChanges,
          hdri: venuePlan?.environment.hdri ?? null,
          preset: venuePlan?.output.preset ?? null,
          toneMapping: venuePlan?.output.toneMapping ?? null,
          exposure: venuePlan?.output.exposure ?? null,
          fog: venuePlan?.fog ?? null,
          volumetricFog: venuePlan?.volumetricFog ?? false,
          floodlights: venuePlan ? venuePlan.floods.filter((f) => f.visible).length : 0
        },
        particles: { drawn: particlesDrawn },
        vfx: vfx ? { ...vfx.events } : null,
        scoreboard: boards ? { text: boards.standText, ledPulse: boards.pulsing } : null,
        umpire: { visible: true },
        netPostLights: { active: lastFaultActive },
        outfits: { player: currentVenueKey === "moon" ? "apollo" : "tennis", rival: currentVenueKey === "moon" ? "apollo" : "tennis" },
        playerPose: lastPlayerPose ? { mode: lastPlayerPose.mode, legs: lastPlayerPose.legs, rightHand: lastPlayerPose.right, leftHand: lastPlayerPose.left } : null
      };
    }
  };
  return self;
}
