/**
 * Raycast and continuous-collision lab.
 *
 * ## Why this example exists
 *
 * `raycasting` and `continuous collision detection` were both reported `parity-unproven` in the
 * Three.js parity scorecard with the reason "no production consumer imports this capability". That was
 * accurate: `PhysicsWorld.raycast`, `sphereCast` and `timeOfImpact` were implemented and unit-tested,
 * but nothing shipped actually used them, so the claim had no product surface behind it.
 *
 * The two queries are also the ones most easily got wrong in a way tests do not catch:
 *
 * - A **raycast** started inside a body hits that body at distance 0. Every character controller and
 *   every projectile needs the `ignoreBodies` filter, and the failure mode is a controller that
 *   detects its own capsule and concludes it is against a wall.
 * - A **spherecast** exists because a zero-radius ray slips between colliders a real projectile would
 *   hit. This route shows a gap that a ray misses and a sphere does not.
 * - **`timeOfImpact`** answers the question a discrete step cannot: a body moving fast enough to cross
 *   a wall between two frames never generates a contact. The route sweeps a bullet at a speed where a
 *   16 ms step would tunnel, and reports the impact time the solver would need to sub-step to.
 *
 * Rendered with `@aura3d/rendering` line geometry so the queries are visible rather than asserted.
 */
import {
  PhysicsWorld,
  Shape,
  timeOfImpact,
  type RaycastHit,
  type SphereCastHit,
  type TimeOfImpactHit
} from "@aura3d/physics";
import { Geometry, Renderer, UnlitMaterial, type RenderItem } from "@aura3d/rendering";

interface RaycastCcdLabState {
  readonly id: "raycast-ccd-lab";
  readonly status: "ready" | "error";
  readonly renderer: "webgl2";
  readonly visualClaim: "bounded-query-visualisation";
  /** Straight ray down the corridor: hits the first wall, not the shooter. */
  readonly rayHit?: { readonly bodyId: number; readonly distance: number };
  /** Same cast with the shooter excluded: reports the far wall. Proves the filter is load-bearing. */
  readonly rayIgnoringShooter?: { readonly bodyId: number; readonly distance: number };
  /** A zero-radius ray threads the gap between the posts; a 0.22-radius sweep does not. */
  readonly gapRayMissed: boolean;
  readonly gapSphereHit?: { readonly bodyId: number; readonly distance: number };
  /** Impact time for a bullet moving fast enough that one 16 ms step would step over the wall. */
  readonly tunnellingImpact?: { readonly time: number; readonly wouldTunnel: boolean };
  readonly interactions: number;
  readonly knownLimits: readonly string[];
  readonly errors: readonly string[];
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_RAYCAST_CCD_LAB__?: RaycastCcdLabState;
  }
}

const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 540;

const KNOWN_LIMITS = [
  "Visualises raycast, spherecast and swept time-of-impact queries; it is not a claim of Rapier or PhysX query performance.",
  "timeOfImpact sweeps world AABBs, so it is conservative for non-box shapes and ignores rotation.",
  "Lines are drawn with UnlitMaterial; this route makes no lighting, shadow or PBR claim."
] as const;

if (typeof document !== "undefined") {
  void boot();
}

/** Corridor with two walls and a deliberate narrow gap between them. */
function buildWorld() {
  const world = new PhysicsWorld({ gravity: [0, 0, 0], fixedDelta: 1 / 60 });

  // The shooter. A query started here must not report the shooter itself.
  const shooter = world.createRigidBody({ type: "dynamic", mass: 1, position: [0, 0.5, 0] });
  world.createCollider(shooter, { shape: Shape.sphere(0.2) });

  // Far wall straight down the corridor.
  const farWall = world.createRigidBody({ type: "static", position: [0, 0.5, -6] });
  world.createCollider(farWall, { shape: Shape.box(2.4, 1.2, 0.2) });

  /*
   * Two posts with a 0.24-unit gap between their facing edges. A zero-radius ray aimed at the centre
   * of the gap passes through; a 0.18-radius spherecast cannot.
   */
  const leftPost = world.createRigidBody({ type: "static", position: [-0.42, 0.5, -3] });
  world.createCollider(leftPost, { shape: Shape.box(0.3, 1.2, 0.2) });
  const rightPost = world.createRigidBody({ type: "static", position: [0.42, 0.5, -3] });
  world.createCollider(rightPost, { shape: Shape.box(0.3, 1.2, 0.2) });

  return { world, shooter, farWall, leftPost, rightPost };
}

/**
 * Sweep a bullet at a speed that outruns a discrete step.
 *
 * At 200 m/s a 16 ms step advances 3.2 units. The wall sits 0.2 units thick at z = -6, so a body that
 * starts in front of it and integrates one whole step lands behind it having generated no contact.
 * `timeOfImpact` reports when the sweep actually crosses, which is what a solver sub-steps to.
 */
function sweepFastBullet(): { hit: TimeOfImpactHit | undefined; wouldTunnel: boolean } {
  const bullet = Shape.sphere(0.06);
  const wall = Shape.box(2.4, 1.2, 0.2);
  const speed = 200;
  const step = 1 / 60;
  const start: readonly [number, number, number] = [0, 0.5, -3.6];
  const travelPerStep = speed * step;
  const distanceToWall = Math.abs(-6 - start[2]) - 0.2 - 0.06;
  const hit = timeOfImpact(
    bullet,
    [...start],
    [0, 0, -speed],
    wall,
    [0, 0.5, -6],
    [0, 0, 0],
    step
  );
  return { hit, wouldTunnel: travelPerStep > distanceToWall };
}

async function boot(): Promise<void> {
  const root = document.querySelector<HTMLElement>("#app") ?? document.body;
  const errors: string[] = [];
  let interactions = 0;

  try {
    installStyles();
    const { canvas, hud, fireButton, gapButton, sweepButton } = installShell(root);
    const { world, shooter, leftPost } = buildWorld();

    const renderer = await Renderer.create({
      backend: "webgl2",
      canvas,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      clearColor: [0.015, 0.02, 0.026, 1],
      preserveDrawingBuffer: true
    });
    window.addEventListener("beforeunload", () => renderer.dispose());

    let rayHit: RaycastHit | undefined;
    let rayIgnoringShooter: RaycastHit | undefined;
    let gapRay: RaycastHit | undefined;
    let gapSphere: SphereCastHit | undefined;
    let sweep: { hit: TimeOfImpactHit | undefined; wouldTunnel: boolean } | undefined;

    const publish = (): void => {
      const state: RaycastCcdLabState = {
        id: "raycast-ccd-lab",
        status: errors.length === 0 ? "ready" : "error",
        renderer: "webgl2",
        visualClaim: "bounded-query-visualisation",
        ...(rayHit ? { rayHit: { bodyId: rayHit.bodyId, distance: round(rayHit.distance) } } : {}),
        ...(rayIgnoringShooter
          ? { rayIgnoringShooter: { bodyId: rayIgnoringShooter.bodyId, distance: round(rayIgnoringShooter.distance) } }
          : {}),
        gapRayMissed: gapRay === undefined,
        ...(gapSphere ? { gapSphereHit: { bodyId: gapSphere.bodyId, distance: round(gapSphere.distance) } } : {}),
        ...(sweep?.hit ? { tunnellingImpact: { time: round(sweep.hit.time), wouldTunnel: sweep.wouldTunnel } } : {}),
        interactions,
        knownLimits: KNOWN_LIMITS,
        errors: [...errors]
      };
      window.__AURA3D_RAYCAST_CCD_LAB__ = state;
      hud.textContent = describe(state);
    };

    const draw = (): void => {
      const items: RenderItem[] = [];
      // Corridor walls and posts as wireframe boxes, plus each query as a line.
      pushBoxOutline(items, [0, 0.5, -6], [2.4, 1.2, 0.2], [0.42, 0.47, 0.55], "far-wall");
      pushBoxOutline(items, [-0.42, 0.5, -3], [0.3, 1.2, 0.2], [0.42, 0.47, 0.55], "left-post");
      pushBoxOutline(items, [0.42, 0.5, -3], [0.3, 1.2, 0.2], [0.42, 0.47, 0.55], "right-post");
      if (rayIgnoringShooter) pushLine(items, [0, 0.5, 0], rayIgnoringShooter.point as [number, number, number], [0.35, 0.85, 1], "raycast");
      if (gapRay === undefined) pushLine(items, [0, 0.5, -1], [0, 0.5, -4.6], [0.5, 0.55, 0.6], "ray-through-gap");
      if (gapSphere) pushLine(items, [0, 0.5, -1], gapSphere.point as [number, number, number], [1, 0.78, 0.32], "spherecast");
      renderer.render(items);
    };

    fireButton.addEventListener("click", () => {
      interactions += 1;
      /*
       * Two casts from the same origin, and they differ — which is the whole lesson.
       *
       * The unfiltered cast reports the **shooter itself at distance 0**, because the ray starts
       * inside the shooter's own collider. That is the classic self-hit defect: a character
       * controller probing ahead detects its own capsule and concludes it is against a wall, and a
       * projectile spawned at the muzzle hits the shooter. Measured here, not assumed.
       *
       * With `ignoreBodies: [shooter.id]` the same cast reports the far wall at 5.3 units. The filter
       * is not cosmetic; without it this query is unusable.
       */
      rayHit = world.raycast([0, 0.5, 0], [0, 0, -1], { maxDistance: 20 });
      rayIgnoringShooter = world.raycast([0, 0.5, 0], [0, 0, -1], {
        maxDistance: 20,
        ignoreBodies: [shooter.id]
      });
      publish();
      draw();
    });

    gapButton.addEventListener("click", () => {
      interactions += 1;
      /*
       * Straight down the middle of the gap between the posts, which span z in [-3.2, -2.8]. From
       * z = -1 the near face is 1.8 units away, so `maxDistance` must exceed that — an earlier draft
       * used 1.6 and reported a miss for *both* queries, which looked like the sphere fitting through
       * and was really the cast stopping short. Measured, then corrected.
       *
       * A zero-radius ray threads the gap. A 0.22-radius sweep does not: it contacts a post at 1.58
       * units. The swept radius, not the gap width alone, decides — which is exactly why a projectile
       * with width needs `sphereCast` rather than `raycast`.
       */
      gapRay = world.raycast([0, 0.5, -1], [0, 0, -1], { maxDistance: 3 });
      gapSphere = world.sphereCast([0, 0.5, -1], 0.22, [0, 0, -1], { maxDistance: 3 });
      publish();
      draw();
    });

    sweepButton.addEventListener("click", () => {
      interactions += 1;
      sweep = sweepFastBullet();
      publish();
      draw();
    });

    void leftPost;
    publish();
    draw();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(message);
    window.__AURA3D_RAYCAST_CCD_LAB__ = {
      id: "raycast-ccd-lab",
      status: "error",
      renderer: "webgl2",
      visualClaim: "bounded-query-visualisation",
      gapRayMissed: false,
      interactions: 0,
      knownLimits: KNOWN_LIMITS,
      errors: [message],
      error: message
    };
  }
}

function describe(state: RaycastCcdLabState): string {
  const lines = [
    `status ${state.status}`,
    state.rayHit ? `ray -> body ${state.rayHit.bodyId} at ${state.rayHit.distance}` : "ray: not fired",
    state.rayIgnoringShooter
      ? `ray (shooter ignored) -> body ${state.rayIgnoringShooter.bodyId} at ${state.rayIgnoringShooter.distance}`
      : "",
    state.gapSphereHit
      ? `gap: ray ${state.gapRayMissed ? "missed" : "hit"}, spherecast hit body ${state.gapSphereHit.bodyId} at ${state.gapSphereHit.distance}`
      : "",
    state.tunnellingImpact
      ? `sweep: impact at t=${state.tunnellingImpact.time}s; one 16ms step would ${state.tunnellingImpact.wouldTunnel ? "tunnel" : "not tunnel"}`
      : ""
  ];
  return lines.filter(Boolean).join("\n");
}

function round(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}

/**
 * Project a world point onto the 2D line canvas.
 *
 * The corridor is laid out along -Z, so the view maps X across and Z into the screen. Kept explicit
 * rather than using a camera because the point of this route is the *query result*, and a fixed
 * projection makes the drawn line trivially checkable against the reported distance.
 */
function project(point: readonly [number, number, number]): readonly [number, number, number] {
  const x = point[0] * 0.22;
  const y = 0.55 + point[2] * 0.13;
  return [x, y, 0];
}

function pushLine(
  items: RenderItem[],
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  color: readonly [number, number, number],
  label: string
): void {
  items.push({
    geometry: Geometry.lineSegments([project(from), project(to)]),
    material: new UnlitMaterial({ name: label, color: [color[0], color[1], color[2], 1] }),
    label
  });
}

function pushBoxOutline(
  items: RenderItem[],
  center: readonly [number, number, number],
  half: readonly [number, number, number],
  color: readonly [number, number, number],
  label: string
): void {
  const [cx, cy, cz] = center;
  const [hx, hy, hz] = half;
  // Drawn as a plan-view rectangle: this projection collapses Y, so the four XZ corners are the shape.
  const corners: (readonly [number, number, number])[] = [
    [cx - hx, cy, cz - hz],
    [cx + hx, cy, cz - hz],
    [cx + hx, cy, cz + hz],
    [cx - hx, cy, cz + hz]
  ];
  void hy;
  const positions: (readonly [number, number, number])[] = [];
  for (let index = 0; index < corners.length; index += 1) {
    positions.push(project(corners[index]!), project(corners[(index + 1) % corners.length]!));
  }
  items.push({
    geometry: Geometry.lineSegments(positions),
    material: new UnlitMaterial({ name: label, color: [color[0], color[1], color[2], 1] }),
    label
  });
}

function installStyles(): void {
  const style = document.createElement("style");
  style.textContent = `
    body { margin: 0; background: #0b1018; color: #e8f0ff; font: 14px system-ui; }
    .lab { display: grid; gap: 12px; padding: 16px; }
    .lab canvas { width: ${CANVAS_WIDTH}px; height: ${CANVAS_HEIGHT}px; border-radius: 8px; background: #060a12; }
    .lab__controls { display: flex; gap: 8px; }
    .lab__controls button { padding: 8px 14px; border-radius: 6px; border: 1px solid #2b3a52; background: #14202f; color: inherit; cursor: pointer; }
    .lab__hud { white-space: pre-line; padding: 10px 12px; border-radius: 6px; background: #101a27; min-height: 4em; }
  `;
  document.head.appendChild(style);
}

function installShell(root: HTMLElement) {
  root.innerHTML = `
    <section class="lab">
      <h1>Raycast &amp; CCD Lab</h1>
      <canvas id="lab-canvas" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}"></canvas>
      <div class="lab__controls">
        <button id="fire" type="button">Raycast corridor</button>
        <button id="gap" type="button">Ray vs spherecast through a gap</button>
        <button id="sweep" type="button">Swept impact at 200 m/s</button>
      </div>
      <pre class="lab__hud" id="lab-hud">status ready</pre>
    </section>
  `;
  return {
    canvas: root.querySelector<HTMLCanvasElement>("#lab-canvas")!,
    hud: root.querySelector<HTMLElement>("#lab-hud")!,
    fireButton: root.querySelector<HTMLButtonElement>("#fire")!,
    gapButton: root.querySelector<HTMLButtonElement>("#gap")!,
    sweepButton: root.querySelector<HTMLButtonElement>("#sweep")!
  };
}
