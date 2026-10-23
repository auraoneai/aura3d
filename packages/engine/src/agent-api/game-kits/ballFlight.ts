/**
 * Exact event-time ball flight for racket sports (extracted from the Aura Slam 3D tennis simulation).
 *
 * Axis convention (differs from the simple `stepBallPhysics` model, which uses y as up): x is lateral, y runs along
 * the court (the net sits at y = 0, ends are +y / -y) and z is height. Positions and velocities are in
 * "court units"; `units` gives the metres per unit on each axis so gravity, speeds and radii stay physical.
 * Integration is closed-form between events (linear drag + gravity) and impacts are resolved at their exact time,
 * so results do not depend on the frame rate. Pure functions: no clocks, no DOM, no randomness.
 */

export interface BallFlightBall {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  active?: boolean;
  settling?: boolean;
  rolling?: boolean;
  crossedNet?: boolean;
  netTouched?: boolean;
  bounceCount?: number;
  dead?: boolean;
  /** Free-form spin/shot marker read by `reboundShaping`. */
  shotType?: string;
  /** Free-form touch amount read by `reboundShaping` (0..1). */
  proDrop?: number;
}

export interface BallFlightSurface {
  /** Fraction of vertical speed kept after a bounce. */
  readonly rebound: number;
  /** Fraction of horizontal speed kept after a bounce. */
  readonly retention: number;
  /** Rolling resistance in m/s^2 once the ball stops bouncing (default 1.4). */
  readonly rollingResistance?: number;
}

export interface BallFlightBoard {
  /** Centre of the board face in render units. */
  readonly x: number;
  readonly y: number;
  readonly halfWidth: number;
  /** Board height in metres. */
  readonly height: number;
  /** Rotation of the face normal in radians. */
  readonly angle: number;
}

export interface BallFlightConfig {
  /** Metres per court unit on each axis (default 1, 1, 1). */
  readonly units?: { readonly x: number; readonly y: number; readonly z: number };
  /** Gravity in m/s^2 (default 9.81). */
  readonly gravity?: number;
  /** Linear drag coefficient per second (default 0). */
  readonly drag?: number;
  /** Ball radius in metres (default 0.0335). */
  readonly ballRadius?: number;
  readonly net?: {
    /** Net height at the centre and at the posts, in metres. */
    readonly centerHeight: number;
    readonly postHeight: number;
    /** Half width of the net in court x units. */
    readonly halfWidth: number;
    /** Height window, in court z units, within which a crossing counts as a tape touch (default 0.012). */
    readonly tapeBand?: number;
    /** Lateral margin, in court x units, beyond the net where it still counts (default 0.007). */
    readonly postMargin?: number;
  };
  /** Named surfaces; the first key (or `defaultSurface`) is the fallback for unknown names. */
  readonly surfaces: Readonly<Record<string, BallFlightSurface>>;
  readonly defaultSurface?: string;
  /** Rear boards / walls the loose ball can hit, with the render scale used by their coordinates. */
  readonly boards?: {
    readonly renderScale: { readonly x: number; readonly y: number };
    /** Ball radius in render units used for the board contact test (default 0.072). */
    readonly contactRadius?: number;
    /** Energy factor applied along the normal on impact (default 1.55: restitution 0.55). */
    readonly impulse?: number;
    readonly list: readonly BallFlightBoard[];
  };
  /** Highest arc a serve may use, in metres above the contact point (default 0.5). */
  readonly serveMaxRiseMetres?: number;
  /** Optional shot-dependent bounce shaping (slice, topspin, touch) applied on top of the surface. */
  readonly reboundShaping?: (ball: BallFlightBall) => {
    readonly vertical?: number;
    readonly horizontal?: number;
    readonly after?: (ball: BallFlightBall) => void;
  };
}

export type BallFlightEventType = "bounce" | "net" | "tape" | "board";

export interface BallFlightSample { x: number; y: number; z: number; vx: number; vy: number; vz: number }

export interface BallFlightKit {
  readonly gravity: number;
  readonly radius: number;
  readonly netHeightCenter: number;
  readonly netHeightPost: number;
  readonly netHalfWidth: number;
  readonly serveMaxRiseMetres: number;
  readonly surfaces: Readonly<Record<string, BallFlightSurface>>;
  netHeight(x: number): number;
  sample(ball: BallFlightBall, t: number): BallFlightSample;
  timeToGround(ball: Pick<BallFlightBall, "z" | "vz">): number;
  /** Time until the ball reaches court coordinate `y`, or Infinity. */
  timeToY(ball: BallFlightBall, y: number): number;
  landing(ball: BallFlightBall): BallFlightSample & { time: number };
  speedKph(ball: BallFlightBall): number;
  /** Launch velocities that hit (targetX, targetY) in about `desiredTime`, lengthening the arc until it clears the net. Throws if none exists. */
  solveShot<T extends BallFlightBall>(ball: T, targetX: number, targetY: number, desiredTime: number, clearance?: number): T & { flightTime: number };
  serveTrajectory(ball: BallFlightBall, targetX: number, targetY: number, requestedKph: number, clearanceMetres?: number, errorXMetres?: number, errorYMetres?: number):
    { vx: number; vy: number; vz: number; flightTime: number; targetX: number; targetY: number; netRisk: boolean; paceLimited: boolean };
  serveTargetNetRisk(ball: BallFlightBall, targetX: number, targetY: number, clearanceMetres?: number): boolean;
  rebound(ball: BallFlightBall, surface?: string): void;
  deflectNet(ball: BallFlightBall): void;
  releaseBall(ball: BallFlightBall): void;
  /** Integrates one frame with exact event times; mutates `ball`. */
  advance<B extends BallFlightBall>(ball: B, dt: number, surface: string, onEvent: (type: BallFlightEventType, ball: B) => void): void;
  /** Integrates a dead ball (bounces, rolls, hits net/boards) until it settles. */
  advanceLoose<B extends BallFlightBall>(ball: B, dt: number, surface: string, onBounce?: (ball: B) => void): void;
}

export function createBallFlight(config: BallFlightConfig): BallFlightKit {
  const units = config.units ?? { x: 1, y: 1, z: 1 };
  const GRAVITY = (config.gravity ?? 9.81) / units.z;
  const RADIUS = (config.ballRadius ?? 0.0335) / units.z;
  const DRAG = config.drag ?? 0;
  const surfaceNames = Object.keys(config.surfaces);
  const fallbackName = config.defaultSurface ?? surfaceNames[0]!;
  const fallbackSurface = config.surfaces[fallbackName]!;
  const surfaceOf = (name: string): BallFlightSurface => config.surfaces[name] ?? fallbackSurface;
  const rollingOf = (name: string): number => surfaceOf(name).rollingResistance ?? 1.4;

  const netConfig = config.net ?? { centerHeight: 0.914, postHeight: 1.07, halfWidth: 1.08 };
  const NET_HEIGHT = netConfig.centerHeight / units.z;
  const NET_POST = netConfig.postHeight / units.z;
  const NET_X = netConfig.halfWidth;
  const TAPE_BAND = netConfig.tapeBand ?? 0.012;
  const POST_MARGIN = netConfig.postMargin ?? 0.007;
  const SERVE_RISE = config.serveMaxRiseMetres ?? 0.5;

  const boardScale = config.boards?.renderScale ?? { x: 1, y: 1 };
  const boardRadius = config.boards?.contactRadius ?? 0.072;
  const boardImpulse = config.boards?.impulse ?? 1.55;
  const boards = config.boards?.list ?? [];

  const netHeight = (x: number): number => NET_HEIGHT + (NET_POST - NET_HEIGHT) * Math.min(1, (x / NET_X) ** 2);
  const travelFactor = (t: number): number => DRAG === 0 ? t : -Math.expm1(-DRAG * t) / DRAG;
  const decayOf = (t: number): number => Math.exp(-DRAG * t);
  const timeFromQ = (q: number): number => {
    if (DRAG === 0) return q >= 0 ? q : Infinity;
    return q >= 0 && q * DRAG < 1 ? -Math.log1p(-q * DRAG) / DRAG : Infinity;
  };

  function sample(ball: BallFlightBall, t: number): BallFlightSample {
    const factor = travelFactor(t);
    const decay = decayOf(t);
    return {
      x: ball.x + ball.vx * factor, y: ball.y + ball.vy * factor,
      z: ball.z + ball.vz * t - GRAVITY * t * t / 2,
      vx: ball.vx * decay, vy: ball.vy * decay, vz: ball.vz - GRAVITY * t
    };
  }

  function timeToGround(ball: Pick<BallFlightBall, "z" | "vz">): number {
    return Math.max(0, (ball.vz + Math.sqrt(ball.vz ** 2 + 2 * GRAVITY * Math.max(0, ball.z - RADIUS))) / GRAVITY);
  }

  function timeToY(ball: BallFlightBall, y: number): number {
    if (Math.abs(ball.vy) < 1e-9) return Infinity;
    return timeFromQ((y - ball.y) / ball.vy);
  }

  function landing(ball: BallFlightBall): BallFlightSample & { time: number } {
    const time = timeToGround(ball);
    return { ...sample(ball, time), z: RADIUS, time };
  }

  const metresSpeed = (vx: number, vy: number, vz: number): number => Math.hypot(vx * units.x, vy * units.y, vz * units.z);
  const speedKph = (ball: BallFlightBall): number => Math.round(metresSpeed(ball.vx, ball.vy, ball.vz) * 3.6);

  function solveShot<T extends BallFlightBall>(ball: T, targetX: number, targetY: number, desiredTime: number, clearance = 0.065): T & { flightTime: number } {
    let time = Math.max(0.28, desiredTime);
    for (let i = 0; i < 140; i++, time += 0.025) {
      const solution = {
        ...ball, vx: (targetX - ball.x) / travelFactor(time),
        vy: (targetY - ball.y) / travelFactor(time),
        vz: (RADIUS - ball.z + GRAVITY * time * time / 2) / time
      };
      const crossingTime = timeToY(solution, 0);
      if (crossingTime >= time) return { ...solution, flightTime: time };
      const crossing = sample(solution, crossingTime);
      if (crossing.z - RADIUS >= netHeight(crossing.x) + clearance) return { ...solution, flightTime: time };
    }
    throw new Error("Unable to construct a playable trajectory");
  }

  function serveFlight(ball: BallFlightBall, targetX: number, targetY: number, time: number): { vx: number; vy: number; vz: number; flightTime: number } {
    return {
      vx: (targetX - ball.x) / travelFactor(time), vy: (targetY - ball.y) / travelFactor(time),
      vz: (RADIUS - ball.z + GRAVITY * time * time / 2) / time, flightTime: time
    };
  }

  function serveFlightLimit(ball: Pick<BallFlightBall, "z">): number {
    return timeToGround({ z: ball.z, vz: Math.sqrt(2 * GRAVITY * SERVE_RISE / units.z) });
  }

  function serveClearance(ball: BallFlightBall, targetX: number, targetY: number, time: number): number {
    const shot = { ...ball, ...serveFlight(ball, targetX, targetY, time) };
    const crossingTime = timeToY(shot, 0);
    if (!Number.isFinite(crossingTime) || crossingTime >= time - 1e-9) return -Infinity;
    const crossing = sample(shot, crossingTime);
    return (crossing.z - RADIUS - netHeight(crossing.x)) * units.z;
  }

  const serveTargetNetRisk = (ball: BallFlightBall, targetX: number, targetY: number, clearanceMetres = 0.08): boolean =>
    serveClearance(ball, targetX, targetY, serveFlightLimit(ball)) < clearanceMetres;

  function serveTrajectory(
    ball: BallFlightBall, targetX: number, targetY: number, requestedKph: number,
    clearanceMetres = 0.08, errorXMetres = 0, errorYMetres = 0
  ): { vx: number; vy: number; vz: number; flightTime: number; targetX: number; targetY: number; netRisk: boolean; paceLimited: boolean } {
    const at = (time: number) => serveFlight(ball, targetX, targetY, time);
    const speed = (shot: { vx: number; vy: number; vz: number }) => metresSpeed(shot.vx, shot.vy, shot.vz) * 3.6;
    const maximumTime = serveFlightLimit(ball);
    let low = 0.08, high = Math.min(1.2, maximumTime);
    for (let i = 0; i < 36; i++) { const t = (low + high) / 2; if (speed(at(t)) > requestedKph) low = t; else high = t; }
    const requestedTime = high;
    const clearance = (time: number) => serveClearance(ball, targetX, targetY, time);
    let time = requestedTime, netRisk = false;
    if (clearance(time) < clearanceMetres) {
      // As a target approaches the net, settle on the bounded arc instead of a fast net fault or a very high lob.
      if (clearance(maximumTime) < clearanceMetres) { time = maximumTime; netRisk = true; }
      else {
        low = time; high = maximumTime;
        for (let i = 0; i < 36; i++) { const t = (low + high) / 2; if (clearance(t) < clearanceMetres) low = t; else high = t; }
        time = high;
      }
    }
    const shot = at(time);
    // Timing changes the trajectory after the safe base arc is chosen; flight time is kept.
    targetX += errorXMetres / units.x; targetY += errorYMetres / units.y;
    shot.vx = (targetX - ball.x) / travelFactor(time); shot.vy = (targetY - ball.y) / travelFactor(time);
    return { ...shot, targetX, targetY, netRisk, paceLimited: speed(shot) < requestedKph - 1 };
  }

  function rebound(ball: BallFlightBall, surface?: string): void {
    const material = surface === undefined ? fallbackSurface : surfaceOf(surface);
    const shaping = config.reboundShaping?.(ball);
    const vertical = shaping?.vertical ?? 1, horizontal = shaping?.horizontal ?? 1;
    ball.z = RADIUS;
    ball.vz = Math.abs(ball.vz) * material.rebound * vertical;
    ball.vx *= material.retention * horizontal;
    ball.vy *= material.retention * horizontal;
    shaping?.after?.(ball);
    ball.bounceCount = (ball.bounceCount ?? 0) + 1;
  }

  function releaseBall(ball: BallFlightBall): void {
    ball.active = false;
    ball.dead = true;
    ball.settling = true;
    ball.rolling = false;
  }

  function deflectNet(ball: BallFlightBall): void {
    const incoming = Math.sign(ball.vy) || (ball.y > 0 ? -1 : 1);
    ball.y = -incoming * 0.01;
    ball.vx *= 0.35;
    ball.vy = -incoming * Math.min(0.45, Math.abs(ball.vy) * 0.16);
    ball.vz = Math.min(0, ball.vz * 0.25);
    ball.netTouched = true;
  }

  interface BoardHit { time: number; nx?: number; ny?: number }
  function boardImpact(ball: BallFlightBall, timeFromFactor: (q: number) => number = timeFromQ): BoardHit {
    let hit: BoardHit = { time: Infinity };
    for (const board of boards) {
      const nx = Math.sin(board.angle), ny = Math.cos(board.angle);
      const distance = (ball.x * boardScale.x - board.x) * nx + (ball.y * boardScale.y - board.y) * ny - boardRadius;
      const velocity = ball.vx * boardScale.x * nx + ball.vy * boardScale.y * ny;
      if (distance < -1e-7 || velocity >= -1e-9) continue;
      const q = Math.max(0, -distance / velocity), time = timeFromFactor(q);
      if (!Number.isFinite(time) || time >= hit.time) continue;
      const x = ball.x * boardScale.x + ball.vx * boardScale.x * q - board.x, y = ball.y * boardScale.y + ball.vy * boardScale.y * q - board.y;
      const z = ball.rolling ? RADIUS : ball.z + ball.vz * time - GRAVITY * time * time / 2;
      if (Math.abs(x * ny - y * nx) > board.halfWidth + boardRadius || z * units.z < -boardRadius || z * units.z > board.height + boardRadius) continue;
      hit = { time, nx, ny };
    }
    return hit;
  }

  function deflectBoard(ball: BallFlightBall, hit: BoardHit): void {
    let vx = ball.vx * boardScale.x, vy = ball.vy * boardScale.y;
    const normal = vx * hit.nx! + vy * hit.ny!;
    vx -= boardImpulse * normal * hit.nx!; vy -= boardImpulse * normal * hit.ny!;
    ball.vx = vx / boardScale.x; ball.vy = vy / boardScale.y;
    ball.x += hit.nx! * 1e-6 / boardScale.x; ball.y += hit.ny! * 1e-6 / boardScale.y;
  }

  function advanceLoose(ball: BallFlightBall, dt: number, surface: string, onBounce: (ball: BallFlightBall) => void = () => {}): void {
    let remaining = dt;
    const material = surfaceOf(surface);
    while (ball.settling && remaining > 1e-9) {
      if (ball.rolling) {
        // Constant rolling resistance in metres (not differently scaled court units); exact stopping time.
        const speed = Math.hypot(ball.vx * units.x, ball.vy * units.y);
        const resistance = rollingOf(surface);
        const distanceToNet = Math.abs(ball.vy) > 1e-9 ? -ball.y / ball.vy * speed : -1;
        const netTime = distanceToNet > 0 && distanceToNet <= speed * speed / (2 * resistance)
          ? (speed - Math.sqrt(Math.max(0, speed * speed - 2 * resistance * distanceToNet))) / resistance : Infinity;
        const board = boardImpact(ball, (q) => q * speed <= speed * speed / (2 * resistance)
          ? (speed - Math.sqrt(Math.max(0, speed * speed - 2 * resistance * q * speed))) / resistance : Infinity);
        const time = Math.min(remaining, speed / resistance, netTime, board.time);
        const distanceFactor = speed > 1e-9 ? time - resistance * time * time / (2 * speed) : 0;
        ball.x += ball.vx * distanceFactor; ball.y += ball.vy * distanceFactor;
        const fraction = speed > 1e-9 ? Math.max(0, 1 - resistance * time / speed) : 0;
        ball.vx *= fraction; ball.vy *= fraction; ball.z = RADIUS; ball.vz = 0;
        remaining -= time;
        if (fraction < 1e-9) { ball.vx = 0; ball.vy = 0; ball.settling = false; }
        if (board.time <= time + 1e-9 && ball.settling) { deflectBoard(ball, board); continue; }
        if (netTime <= time + 1e-9 && ball.settling) {
          if (Math.abs(ball.x) <= NET_X) deflectNet(ball);
          else ball.y = Math.sign(ball.vy) * 1e-8;
          continue;
        }
        return;
      }
      const ground = timeToGround(ball);
      const net = Math.abs(ball.y) > 1e-8 ? timeToY(ball, 0) : Infinity;
      const board = boardImpact(ball);
      const elapsed = Math.min(remaining, ground, net, board.time);
      Object.assign(ball, sample(ball, elapsed)); remaining -= elapsed;
      if (board.time <= elapsed + 1e-9) { deflectBoard(ball, board); }
      else if (net <= ground + 1e-9 && net <= elapsed + 1e-9) {
        if (Math.abs(ball.x) <= NET_X && ball.z - RADIUS <= netHeight(ball.x)) deflectNet(ball);
        else ball.y = Math.sign(ball.vy) * 1e-8;
      } else if (ground <= elapsed + 1e-9) {
        const impact = Math.abs(ball.vz);
        ball.z = RADIUS; ball.vz = impact * material.rebound;
        ball.vx *= material.retention; ball.vy *= material.retention;
        if (impact > 0.35) onBounce(ball);
        if (ball.vz < 0.22) { ball.vz = 0; ball.rolling = true; }
      }
    }
  }

  function advance(ball: BallFlightBall, dt: number, surface: string, onEvent: (type: BallFlightEventType, ball: BallFlightBall) => void): void {
    let remaining = dt;
    for (let events = 0; ball.active && remaining > 1e-9 && events < 8; events++) {
      const ground = timeToGround(ball);
      const net = ball.crossedNet ? Infinity : timeToY(ball, 0);
      const board = boardImpact(ball);
      const elapsed = Math.min(remaining, ground, net, board.time);
      Object.assign(ball, sample(ball, elapsed));
      remaining -= elapsed;
      if (board.time <= elapsed + 1e-9) { deflectBoard(ball, board); onEvent("board", ball); }
      else if (net <= ground + 1e-9 && net <= elapsed + 1e-9) {
        ball.crossedNet = true;
        if (Math.abs(ball.x) <= NET_X + POST_MARGIN) {
          const clearance = ball.z - RADIUS - netHeight(ball.x);
          if (clearance < -TAPE_BAND) { onEvent("net", ball); }
          else if (clearance <= TAPE_BAND) {
            ball.netTouched = true;
            ball.vx *= 0.92;
            ball.vy *= 0.92;
            ball.vz = Math.max(0.13, ball.vz * 0.75);
            onEvent("tape", ball);
          }
        }
      } else if (ground <= elapsed + 1e-9) {
        rebound(ball, surface);
        onEvent("bounce", ball);
      }
    }
    if (!ball.active && ball.settling && remaining > 1e-9) advanceLoose(ball, remaining, surface);
  }

  return {
    gravity: GRAVITY, radius: RADIUS, netHeightCenter: NET_HEIGHT, netHeightPost: NET_POST, netHalfWidth: NET_X,
    serveMaxRiseMetres: SERVE_RISE, surfaces: config.surfaces,
    netHeight, sample, timeToGround, timeToY, landing, speedKph, solveShot, serveTrajectory, serveTargetNetRisk,
    rebound, deflectNet, releaseBall, advance, advanceLoose
  } as BallFlightKit;
}

