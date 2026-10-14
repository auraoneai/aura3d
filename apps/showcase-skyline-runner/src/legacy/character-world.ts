import { game, physics, type AuraVec3, type GameKitRect } from "@aura3d/engine";

/**
 * Skyline Runner's physical character world.
 *
 * ## What lives here and why
 *
 * Mission section 7 says a Rapier-driven object has Rapier own its physical state and
 * rendering follow. For a platformer character that splits cleanly in two, and the split
 * is the kinematic-character-controller pattern rather than a compromise:
 *
 * - **Rapier owns**: where the capsule actually ends up, whether anything is under it,
 *   how far a requested move was allowed to go, and the answer to "is this ledge solid".
 * - **The route authors**: the *intent* — run speed, jump impulse, gravity, coyote time,
 *   jump buffering, dash distance. Intent is a desired displacement for the step; it is
 *   not a transform, and nothing here writes a position the solver did not allow.
 *
 * Before this module the route resolved the character against `game.platformer`'s own
 * analytic rectangle test and then mapped that answer into the scene. The collision world
 * and the visible level were then two descriptions of the same ledges, kept in agreement
 * only by nobody noticing when they weren't. Here the collider volumes come from
 * `platformerScene.surfaceToSceneRect(...)` — the *same* transform the renderer uses to
 * place the certified ledge geometry — so a collider cannot sit beside its own art.
 *
 * ## What stays authored, deliberately
 *
 * - The three lifts are scripted set pieces on a fixed sine path. Their collider bodies
 *   are kinematic and follow that path; Rapier still decides whether the character riding
 *   them is supported. Carrying the character with a lift is a gameplay rule, because
 *   Rapier's character controller inherits no platform velocity by design.
 * - Checkpoints, collectibles, sentry hazards, the finish line and the act gates stay
 *   authored rectangle/circle tests over game-space coordinates. They read the
 *   Rapier-owned position; they never write one.
 *
 * Classification: **hybrid authored gameplay + Rapier collision**.
 */

const FIXED_STEP_SECONDS = 1 / 60;
/**
 * A suspended tab must not be able to buy back time with one giant catch-up step.
 *
 * This bounds the substeps taken *within a single frame*. It is deliberately not a
 * lifetime budget: a character that stops responding five seconds after the route
 * mounts is a worse defect than the tab it protects against.
 */
const MAX_CATCH_UP_STEPS = 5;

/*
 * Deliberate contact properties, named instead of inlined so the values that decide
 * how the character feels are the values the evidence publishes.
 *
 * The tarmac is high-friction with no rebound because the player has to be able to
 * stand on a ledge they can see; a bouncy or icy surface makes the art and the feel
 * disagree. The character is lower-friction than the ground so walking is controlled
 * by the authored intent and not by how sticky the capsule happens to be, and it is
 * still a real number rather than zero, so a capsule brushing a wall decelerates.
 */
const SURFACE_FRICTION = 0.9;
const CHARACTER_FRICTION = 0.6;
/** Nothing in this level is meant to bounce, so nothing stores restitution. */
const RESTITUTION = 0;
/**
 * Mass used only when the capsule shoves a loose dynamic body.
 *
 * There are no dynamic bodies in this collider world, so the number is a declared
 * intent rather than an observed force; publishing it keeps the claim honest about
 * which mass the solver would use.
 */
const CHARACTER_MASS_KG = 78;

/**
 * How much wider the drawn ledge card is than the certified collision rectangle.
 *
 * The typed ice-ledge art is fitted to 120% of its surface rect, so a terrace of cards
 * visually bridges the seams between them. A collider that used the *narrow* rect would
 * be a hole in the floor the player cannot see — and this level has 61 seams wider than
 * the runner is broad, so the runner would fall through a floor that looks continuous.
 * The overhang is therefore one shared number used by the art *and* by the collider, in
 * this file, rather than a literal on each side of the boundary.
 */
export const SKYLINE_LEDGE_PRESENTATION_OVERHANG = 1.2;

/**
 * The minimum downward speed carried in every step's desired displacement.
 *
 * Rapier's kinematic character controller reports `grounded` from the contacts found
 * *during* the move it was handed. A runner standing still with a zero vertical intent is
 * handed a purely horizontal move, finds no floor contact in it, and comes back
 * `grounded: false` while visibly parked on a ledge — which then disables snap-to-ground
 * (it only applies to a character that was supported) and turns every small step off the
 * path into a fall. The probe is a fraction of the authored gravity, so it cannot be
 * mistaken for a second integration of it: standing on a ledge it is cancelled by the
 * contact it produces, and the published velocity reads zero again.
 */
const GROUND_PROBE_SPEED_RATIO = 0.05;

/** The same rect the renderer draws: centred, and overhung by the presentation factor. */
function presentationRect<T extends { readonly x: number; readonly y: number; readonly width: number; readonly height: number }>(
  rect: T
): Omit<T, "x" | "y" | "width" | "height"> & { x: number; y: number; width: number; height: number } {
  const grow = rect.width * (SKYLINE_LEDGE_PRESENTATION_OVERHANG - 1) / 2;
  // Carry the caller's own fields (notably `id`) through the grow, so the result still
  // satisfies the game-kit rect types that key contacts back to the surface they hit.
  return { ...rect, x: rect.x - grow, y: rect.y, width: rect.width + grow * 2, height: rect.height };
}

export interface SkylinePhysicalPlatform {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The authored position of a lift on its sine path at a given clock, in game units.
 *
 * This is deliberately the *kit's* formula: `game.platformer` places a moving surface at
 * `sin((time / period + phase) * 2π) * amplitude`, so `phase` is a fraction of a cycle, not
 * a radian count. Passing `phase` through as radians instead shifts lift 2 by 1.16 rad and
 * lift 3 by 2.32 rad, which puts the collider roughly half a travel amplitude away from the
 * card the player is watching land on. One expression, used by the collider author and the
 * reset pose alike, is what keeps the two from disagreeing.
 */
export function skylineLiftOffset(
  lift: Pick<SkylineLiftSpec, "amplitude" | "periodSeconds" | "phase">,
  elapsedSeconds: number
): number {
  const phase = (elapsedSeconds / Math.max(0.001, lift.periodSeconds) + lift.phase) * Math.PI * 2;
  return Math.sin(phase) * lift.amplitude;
}

export interface SkylineLiftSpec {
  readonly id: string;
  /** Game-space centre of the authored rest position. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly axis: "x" | "y";
  readonly amplitude: number;
  readonly periodSeconds: number;
  readonly phase: number;
}

export interface SkylineLiftPose {
  readonly id: string;
  /** Authored game-space rect for this clock: left and bottom edges, as every surface here. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SkylineCharacterStepResult {
  /** Rapier's answer, in game units. The route renders and scores from this. */
  readonly position: { readonly x: number; readonly y: number };
  readonly applied: AuraVec3;
  /**
   * The same answer expressed as game units per second, which is what a locomotion
   * state, a facing decision and the HUD all want. Derived from `applied` rather than
   * echoed from the request: if the solver stopped the capsule against a wall, the
   * effective velocity is zero, and a route that kept showing its own request would be
   * animating a character that is not moving.
   */
  readonly velocity: { readonly x: number; readonly y: number };
  readonly grounded: boolean;
  readonly collisions: number;
  /** Lift the character is being carried by this step, if any. */
  readonly ridingLiftId: string | null;
}

export interface SkylineCharacterWorld {
  readonly bodyId: number;
  /**
   * Put the character somewhere with a full physical state, not a mesh move.
   *
   * `authoredClockSeconds` is the route's own simulation clock. The scripted lifts are
   * level motion, not character state: a checkpoint respawn rewinds the *character* and
   * must leave the cards on the path the player can see them at, while a full reset
   * rewinds both. Passing the clock in keeps one number — the route's `state.time` —
   * the owner of where every lift card and every lift collider is.
   */
  place(position: { readonly x: number; readonly y: number }, authoredClockSeconds?: number): void;
  advance(
    dt: number,
    intent: { readonly vx: number; readonly vy: number }
  ): readonly SkylineCharacterStepResult[];
  /** The last Rapier-owned state, in game units. */
  position(): { readonly x: number; readonly y: number };
  grounded(): boolean;
  scenePosition(): AuraVec3;
  /**
   * The authored pose of every lift collider at the world's current clock.
   *
   * The route draws its lift cards from exactly this list, so a card and its collider
   * cannot be on different points of the same sine path. Reading it is also how a test
   * can assert the collider is where the art is.
   */
  liftPoses(): readonly SkylineLiftPose[];
  /** The world's own fixed-step clock in seconds; advances one step per solver tick. */
  elapsed(): number;
  evidence(): {
    readonly backend: string;
    readonly colliderCount: number;
    readonly platformColliderCount: number;
    readonly liftColliderCount: number;
    readonly liftCount: number;
    readonly fixedStepSeconds: number;
    readonly maxCatchUpSteps: number;
    readonly steps: number;
    readonly droppedSteps: number;
    readonly sceneUnitsPerGameUnit: number;
    readonly capsuleRadiusScene: number;
    readonly capsuleHalfHeightScene: number;
    readonly characterMassKg: number;
    readonly surfaceFriction: number;
    readonly characterFriction: number;
    readonly restitution: number;
    readonly autoStepHeightScene: number;
    readonly snapToGroundDistanceScene: number;
    readonly gravity: AuraVec3;
  };
  dispose(): void;
}

export function createSkylineCharacterWorld(options: {
  /** The route's platformer scene binding, which owns the game→scene transform. */
  scene: ReturnType<typeof game.platformerSceneBinding>;
  platforms: readonly SkylinePhysicalPlatform[];
  lifts: readonly SkylineLiftSpec[];
  /** The visible character's height and width in game units. */
  characterHeight: number;
  characterWidth: number;
  /**
   * The route's authored gravity, game units per second squared (negative for downward).
   *
   * Used only to size the ground probe as a fraction of the acceleration the route is
   * already integrating, so the probe can never be read as a second gravity term.
   */
  authoredGravity: number;
  /** Spawn point in game units. */
  spawn: { readonly x: number; readonly y: number };
}): SkylineCharacterWorld {
  const scale = options.scene.transform.scale;
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error("Skyline character world needs a positive scene scale from the binding.");
  }
  if (!Number.isFinite(options.authoredGravity)) {
    throw new Error("Skyline character world needs a finite authored gravity to size its ground probe.");
  }
  const groundProbeSpeed = Math.max(0.25, Math.abs(options.authoredGravity) * GROUND_PROBE_SPEED_RATIO);

  // Gravity is intentionally zero. The route's authored vertical velocity already carries
  // the jump arc and the fall, and it is handed over as this step's desired displacement.
  // Giving the solver its own gravity on top of that integrates the same acceleration twice
  // and produces a character that falls faster than the art it is standing on.
  const world = physics.world({ gravity: [0, 0, 0], fixedDelta: FIXED_STEP_SECONDS });

  // --- Colliders: the certified ledges, through the renderer's own transform ---------
  // One static body per surface so a contact names the ledge it happened on. The box is
  // the *presented* ledge footprint, not the narrow certified rect, because that is the
  // silhouette the player is shown.
  for (const platform of options.platforms) {
    const rect = options.scene.surfaceToSceneRect(presentationRect({
      id: platform.id,
      x: platform.x,
      y: platform.y,
      width: platform.width,
      height: platform.height
    } satisfies GameKitRect));
    const body = world.createBody({
      type: "static",
      position: [rect.center[0], rect.center[1], options.scene.worldZ]
    });
    world.createCollider(body, {
      shape: {
        kind: "box",
        halfExtents: [rect.size[0] / 2, rect.size[1] / 2, Math.max(0.02, rect.size[2] / 2)]
      },
      // Real tarmac, not ice: the surface the player can see is the surface they land on.
      material: { friction: SURFACE_FRICTION, restitution: RESTITUTION }
    });
  }

  /**
   * The authored game-space rect of a lift at a given offset along its travel axis.
   *
   * One function answers for the collider, the card the player sees, and the support
   * test in `ridingLift`, which is the whole reason those three cannot disagree.
   */
  function liftGameRect(lift: SkylineLiftSpec, offset: number): SkylineLiftPose {
    return {
      id: lift.id,
      x: lift.x + (lift.axis === "x" ? offset : 0),
      y: lift.y + (lift.axis === "y" ? offset : 0),
      width: lift.width,
      height: lift.height
    };
  }
  /**
   * The presented footprint of a lift — the card that gets drawn and the box that
   * supports, from one expression. `liftGameRect` is the narrow authored rect the route's
   * own art-fitting step uses.
   */
  function liftColliderRect(lift: SkylineLiftSpec, offset: number) {
    return presentationRect(liftGameRect(lift, offset));
  }

  // --- Scripted lifts: kinematic bodies on an authored path --------------------------
  const liftBodies = options.lifts.map((lift) => {
    // The card is created on its path at the world's opening clock, not at its rest
    // position. `elapsed` starts where the route's own simulation clock starts, and a
    // lift whose collider begins at rest while its art begins mid-path is a half-second
    // of invisible ledge the player can apparently stand on.
    const initialOffset = skylineLiftOffset(lift, 0);
    const rect = options.scene.surfaceToSceneRect(liftColliderRect(lift, initialOffset));
    const body = world.createBody({
      type: "kinematic",
      position: [rect.center[0], rect.center[1], options.scene.worldZ]
    });
    world.createCollider(body, {
      shape: { kind: "box", halfExtents: [rect.size[0] / 2, rect.size[1] / 2, Math.max(0.02, rect.size[2] / 2)] },
      material: { friction: SURFACE_FRICTION, restitution: RESTITUTION }
    });
    return {
      lift,
      body,
      /** Authored displacement from rest, game units. */
      offset: initialOffset,
      /** Scene-space step the card made last fixed tick — what a rider must be carried by. */
      delta: [0, 0, 0] as AuraVec3,
      /** Scene-space centre as last applied, so the carry delta is measured, not re-derived. */
      previous: [rect.center[0], rect.center[1], rect.center[2]] as AuraVec3
    };
  });

  /**
   * Re-places every lift collider at a specific point on its authored path.
   *
   * `measureCarry` is what separates a tick from a teleport: during play the card's step
   * is measured so a rider can be carried with it, while a reset puts the cards down
   * without handing the rider an accumulated jump.
   */
  function placeLifts(clockSeconds: number, measureCarry: boolean): void {
    for (const entry of liftBodies) {
      const offset = skylineLiftOffset(entry.lift, clockSeconds);
      const rect = options.scene.surfaceToSceneRect(liftColliderRect(entry.lift, offset));
      const next: AuraVec3 = [rect.center[0], rect.center[1], options.scene.worldZ];
      entry.delta = measureCarry
        ? [next[0] - entry.previous[0], next[1] - entry.previous[1], 0]
        : [0, 0, 0];
      entry.offset = offset;
      // A teleport would stop the card mid-air and re-place it; a kinematic body has to be
      // told where it is *going* so the solver moves it continuously and can support a
      // character standing on it.
      entry.body.setPosition(next);
      entry.previous = next;
    }
  }

  // --- The character -----------------------------------------------------------------
  const radiusScene = Math.max(0.01, (options.characterWidth / 2) * scale);
  const halfHeightScene = Math.max(radiusScene, (options.characterHeight / 2) * scale - radiusScene);
  const characterBody = world.createBody({
    type: "kinematic",
    position: sceneOfFeet(options.spawn.x, options.spawn.y)
  });
  world.createCollider(characterBody, {
    shape: { kind: "capsule", radius: radiusScene, halfHeight: halfHeightScene },
    material: { friction: CHARACTER_FRICTION, restitution: RESTITUTION }
  });
  const autoStepHeightScene = (options.characterHeight * 0.55) * scale;
  const snapToGroundDistanceScene = (options.characterHeight * 0.9) * scale;
  const character = world.createCharacterController(characterBody, {
    // Skin width scaled with the character, so the gap that keeps the capsule out of
    // geometry stays the same fraction of a body at any level scale.
    offset: Math.max(0.002, options.characterHeight * scale * 0.02),
    autoStepHeight: autoStepHeightScene,
    autoStepMinWidth: radiusScene * 0.8,
    autoStepIncludeDynamicBodies: false,
    // A verdant-platformer ledge is a flat card; anything steeper than this is scenery.
    maxSlopeClimbAngle: Math.PI / 3.2,
    minSlopeSlideAngle: Math.PI / 4.5,
    // Descending a ledge lip must not launch the character into a floaty drop; this is
    // the distance the solver is allowed to pull them down onto the ground behind it.
    snapToGroundDistance: snapToGroundDistanceScene,
    slideEnabled: true,
    characterMass: CHARACTER_MASS_KG,
    applyImpulsesToDynamicBodies: false
  });

  function sceneOfFeet(gameX: number, gameY: number): AuraVec3 {
    const feet = options.scene.toScenePoint({ x: gameX, y: gameY });
    // `toScenePoint` is the character's grounded origin, so the capsule centre sits half
    // a body above it. Getting this wrong by halfHeight is the classic "character waist-deep
    // in the platform" or "character hovering a body above it" screenshot.
    return [feet[0], feet[1] + halfHeightScene + radiusScene, options.scene.worldZ];
  }

  function gameOfScenePosition(scene: AuraVec3) {
    const feetGame = options.scene.toGamePoint(
      scene[0],
      scene[1] - halfHeightScene - radiusScene
    );
    return { x: feetGame.x, y: feetGame.y };
  }

  /**
   * Which scripted lift, if any, is carrying the character.
   *
   * Rapier's character controller deliberately inherits no platform velocity, so a
   * character standing on a moving card would be left behind unless someone adds the
   * card's own step to the desired displacement. The *support* decision stays Rapier's
   * (`grounded`); this only picks which authored lift to take motion from, by testing the
   * Rapier-owned feet against each lift's authored top face.
   */
  function ridingLift(feetGame: { readonly x: number; readonly y: number }, grounded: boolean) {
    if (!grounded) return null;
    for (const entry of liftBodies) {
      // The same authored rect the collider and the drawn card come from, so the
      // support test is against the surface the player can actually see.
      const rect = liftColliderRect(entry.lift, entry.offset);
      const withinX = feetGame.x >= rect.x && feetGame.x <= rect.x + rect.width;
      // A few millimetres of scene travel. A generous tolerance would let a lift that has
      // already passed below the character keep dragging it upward forever.
      if (withinX && Math.abs(feetGame.y - (rect.y + rect.height)) < 0.03) return entry;
    }
    return null;
  }

  let accumulator = 0;
  let elapsed = 0;
  let steps = 0;
  let droppedSteps = 0;
  let lastGrounded = false;
  let lastPosition = { x: options.spawn.x, y: options.spawn.y };

  return {
    bodyId: characterBody.id,
    place(position, authoredClockSeconds = 0) {
      if (!Number.isFinite(authoredClockSeconds) || authoredClockSeconds < 0) {
        throw new Error("The authored lift clock must be finite and non-negative.");
      }
      // A reset has to restore the whole physical state, not the drawn mesh: the lifts
      // return to the pose the route's clock says they are at, the queued kinematic step
      // is dropped, and the character is teleported under the solver rather than nudged.
      elapsed = authoredClockSeconds;
      accumulator = 0;
      placeLifts(authoredClockSeconds, false);
      const scene = sceneOfFeet(position.x, position.y);
      character.resetTo(scene);
      // Commit the re-placement to the solver now rather than on the next tick, so a reset
      // that is followed by a paused or capture frame still has its lift colliders under the
      // cards the player can see, and no queued pre-reset translation is left in flight.
      world.step(FIXED_STEP_SECONDS);
      // Read the pose back from the solver rather than echoing the request: after a reset
      // the route's `position()` must be where Rapier actually put the capsule.
      lastPosition = gameOfScenePosition(character.position());
      lastGrounded = false;
    },
    advance(dt, intent) {
      if (!Number.isFinite(dt) || dt < 0) throw new Error("dt must be finite and non-negative.");
      if (!Number.isFinite(intent.vx) || !Number.isFinite(intent.vy)) {
        throw new Error("Character intent velocity must be finite; a NaN velocity would be written to the solver.");
      }
      // A backgrounded tab reports one huge frame. Clamping the accumulated time bounds
      // the recovery to a bounded number of fixed steps instead of buying the character a
      // teleport through the level.
      accumulator += Math.min(dt, FIXED_STEP_SECONDS * MAX_CATCH_UP_STEPS);
      const results: SkylineCharacterStepResult[] = [];
      // The cap is per call, not lifetime: `steps` counts every tick the world has ever
      // taken and must never be able to silence the character mid-run.
      for (let frameStep = 0; frameStep < MAX_CATCH_UP_STEPS; frameStep += 1) {
        if (accumulator < FIXED_STEP_SECONDS) break;
        accumulator -= FIXED_STEP_SECONDS;
        steps += 1;
        elapsed += FIXED_STEP_SECONDS;
        placeLifts(elapsed, true);
        /*
         * Rapier commits a kinematic body's queued translation, and picks up a pose written
         * onto any other body, only inside `step()`. Skipping it looks like nothing is wrong
         * until you play: the lift cards never move in the solver's world, and the
         * character's own `setNextKinematicTranslation` is never committed, so every `move`
         * re-queries the geometry as it was at spawn and the runner walks on the spot above
         * a level it never actually enters.
         */
        world.step(FIXED_STEP_SECONDS);

        const carried = ridingLift(lastPosition, lastGrounded);
        const carry: AuraVec3 = carried ? carried.delta : [0, 0, 0];
        // The probe is folded into the *desired* displacement, never into a stored
        // velocity, so it is not a second gravity integration: the solver either blocks
        // it (a contact, which is the answer we wanted) or lets it fall at a speed that
        // is 5% of the route's own acceleration.
        const probedVy = Math.min(intent.vy, -groundProbeSpeed);
        const desired: AuraVec3 = [
          carry[0] + intent.vx * FIXED_STEP_SECONDS * scale,
          carry[1] + probedVy * FIXED_STEP_SECONDS * scale,
          0
        ];
        const movement = character.move(desired);
        const position = gameOfScenePosition(movement.position);
        lastPosition = position;
        lastGrounded = movement.grounded;
        results.push({
          position,
          applied: movement.applied,
          velocity: {
            x: movement.applied[0] / scale / FIXED_STEP_SECONDS,
            y: movement.applied[1] / scale / FIXED_STEP_SECONDS
          },
          grounded: movement.grounded,
          collisions: movement.collisions,
          ridingLiftId: carried ? carried.lift.id : null
        });
      }
      if (accumulator >= FIXED_STEP_SECONDS) {
        // Time is deliberately discarded rather than repaid.
        droppedSteps += 1;
        accumulator = 0;
      }
      return results;
    },
    position: () => lastPosition,
    grounded: () => lastGrounded,
    scenePosition: () => character.position(),
    liftPoses: () => liftBodies.map((entry) => liftGameRect(entry.lift, entry.offset)),
    elapsed: () => elapsed,
    evidence: () => ({
      backend: "rapier",
      colliderCount: options.platforms.length + options.lifts.length + 1,
      platformColliderCount: options.platforms.length,
      liftColliderCount: options.lifts.length,
      liftCount: options.lifts.length,
      fixedStepSeconds: FIXED_STEP_SECONDS,
      maxCatchUpSteps: MAX_CATCH_UP_STEPS,
      steps,
      droppedSteps,
      sceneUnitsPerGameUnit: scale,
      capsuleRadiusScene: radiusScene,
      capsuleHalfHeightScene: halfHeightScene,
      characterMassKg: CHARACTER_MASS_KG,
      surfaceFriction: SURFACE_FRICTION,
      characterFriction: CHARACTER_FRICTION,
      restitution: RESTITUTION,
      autoStepHeightScene,
      snapToGroundDistanceScene,
      // The capsule is kinematic, which is what Rapier's character controller requires:
      // the game hands over a desired displacement — including the gravity term it
      // integrated — and the solver decides how much of it the world allows. A solver
      // gravity here would integrate the same acceleration a second time and the
      // character would fall faster than the art it is standing on.
      gravity: [0, 0, 0]
    }),
    dispose: () => {
      character.dispose();
    }
  };
}
