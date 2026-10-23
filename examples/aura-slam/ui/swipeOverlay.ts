import type { PhysicsKit, RawSwipeGesture, SwipeShot } from "../contract";
import { maybeById } from "./dom";
import { clamp, lerp } from "./format";
import type { HudState, SlamEngine } from "./types";

/** The slice of mobile-swipe.js (`window.TennisSwipe`) the overlay uses; M-INPUT's swipe module implements it. */
export interface SwipeGestureTracker {
  begin(point: { pointerId: number; x: number; y: number; time: number; width: number; height: number }): boolean;
  move(point: { pointerId: number; x: number; y: number; time: number }): boolean;
  end(point: { pointerId: number; x: number; y: number; time: number }): SwipeShot | null;
  cancel(pointerId?: number): boolean;
  snapshot(): { active: boolean; pointerId: number | null; points: Array<{ x: number; y: number }>; [k: string]: unknown };
}
export interface SwipePort {
  createGesture(): SwipeGestureTracker;
  classifyGesture(gesture: RawSwipeGesture): SwipeShot | null;
  directionalTarget(shot: SwipeShot, geometry: { origin: { x: number; y: number }; left: { x: number; y: number }; right: { x: number; y: number }; minX: number; maxX: number }): number | null;
  getPreference(): "classic" | "swipe";
  setPreference(style: "classic" | "swipe"): { ok: boolean; saved: boolean };
  subscribe(listener: (change: { style: "classic" | "swipe"; saved: boolean }) => void): () => void;
}

export interface SwipeDeps {
  canvas: HTMLCanvasElement;
  swipe: SwipePort;
  engine: () => SlamEngine;
  state: () => HudState;
  physics: Pick<PhysicsKit, "solveShot" | "sample" | "timeToGround">;
  /** Court (normalised units) to canvas pixels; supplied by the renderer adapter. */
  projectCourt(x: number, y: number, z?: number): { x: number; y: number; visible: boolean };
  swipeActive(): boolean;
  touchPlayEnabled(): boolean;
  initAudio(): void;
  energyCost: number;
  /** Re-render after gesture progress (the shell's `render`). */
  rerender(): void;
  syncBoundary(): void;
  text(id: string, value: string | number): void;
}

export interface SwipeVisual { state: string; target: { x: number; y: number } | null; trajectoryPoints: number }
export interface SwipeOverlay {
  /** Active gesture snapshot for `render_game_to_text`. */
  gesture(): ReturnType<SwipeGestureTracker["snapshot"]>;
  visual(): SwipeVisual;
  render(touchEnabled: boolean): void;
  /** Drop an unfinished gesture; `cancelIntent` also cancels a locked shot. */
  clear(cancelIntent?: boolean): void;
  boundaryKey(): string;
  setBoundaryKey(key: string): void;
}

interface SwipeState {
  effectiveStyle?: string; pointEpoch?: unknown; attemptKey?: unknown; intent?: { strength?: number; targetX?: number; targetDepth?: number } | null;
  committed?: unknown; pendingStyle?: "classic" | "swipe" | null; previewFlight?: { origin: any; flightTime?: number } & Record<string, unknown> | null;
  previewTarget?: { x: number; y: number } | null; targetingOrigin?: { x: number; y: number; z?: number } | null; autoTarget?: { x: number; y: number; z?: number } | null;
}

/** Swipe overlay, gesture capture and trajectory preview (game.js `renderSwipeControls`, `beginSwipe`, `moveSwipe`, `finishSwipe`). */
export function createSwipeOverlay(deps: SwipeDeps): SwipeOverlay {
  const overlay = maybeById("swipe-controls");
  const pad = maybeById("swipe-pad");
  const tracker = deps.swipe.createGesture();
  let pointerTarget: Element | null = null;
  let boundary = "";
  let aimOrigin: { x: number; y: number; z: number } | null = null;
  let visual: SwipeVisual = { state: "idle", target: null, trajectoryPoints: 0 };
  let notice = "";
  let noticeUntil = 0;

  const swipeState = (): SwipeState => (deps.engine().getSwipeState() ?? {}) as SwipeState;
  const serving = (): boolean => { const s = deps.state(); return s.server === "player" && ["serve", "serveToss", "serveSwing"].includes(s.phase); };
  function origin(swipe: SwipeState = swipeState()): { x: number; y: number; z: number } {
    const s = deps.state();
    const point = swipe.targetingOrigin ?? swipe.autoTarget ?? s.player;
    return { x: point.x, y: point.y, z: (point as { z?: number }).z ?? (serving() ? 1.04 : (s.practice as { currentSmash?: unknown } | undefined)?.currentSmash ? 1 : 0.5) };
  }

  function clear(cancelIntent = true): void {
    const pointerId = tracker.snapshot().pointerId;
    tracker.cancel();
    aimOrigin = null;
    const target = pointerTarget; pointerTarget = null;
    if (pointerId != null && (target as Element & { hasPointerCapture?(id: number): boolean })?.hasPointerCapture?.(pointerId)) (target as Element).releasePointerCapture(pointerId);
    if (cancelIntent) deps.engine().cancelSwipeShot?.();
    notice = ""; noticeUntil = 0;
  }

  function resolveDirection(shot: SwipeShot | null): (SwipeShot & { targetX: number }) | null {
    if (!shot) return null;
    const isServing = serving();
    const geometry = isServing ? deps.engine().getServeGeometry?.("player") : null;
    const minX = isServing && geometry ? geometry.minX + 0.025 : -0.8;
    const maxX = isServing && geometry ? geometry.maxX - 0.025 : 0.8;
    const y = isServing ? -lerp(0.08, 0.5, (shot.targetDepth - 0.23) / 0.69) : -shot.targetDepth;
    const from = aimOrigin ?? origin();
    const x = deps.swipe.directionalTarget(shot, { origin: deps.projectCourt(from.x, from.y), left: deps.projectCourt(minX, y), right: deps.projectCourt(maxX, y), minX, maxX });
    if (x === null) return null;
    return { ...shot, targetX: isServing ? ((x - minX) / (maxX - minX)) * 1.6 - 0.8 : x };
  }

  const boxPoint = (event: PointerEvent): { pointerId: number; x: number; y: number; time: number; width: number; height: number } => {
    const box = document.querySelector(".game-shell")!.getBoundingClientRect();
    return { pointerId: event.pointerId, x: event.clientX - box.left, y: event.clientY - box.top, time: event.timeStamp, width: box.width, height: box.height };
  };

  function begin(event: PointerEvent): void {
    if (!deps.swipeActive() || !deps.touchPlayEnabled() || event.pointerType !== "touch" || event.button !== 0) return;
    event.preventDefault();
    deps.syncBoundary();
    const swipe = swipeState();
    const s = deps.state();
    if (swipe.intent || swipe.committed || !((s.phase === "serve" && s.server === "player") || (s.phase === "rally" && s.ball.active && s.ball.lastHit === "ai" && s.ball.vy > 0))) return;
    if (!tracker.begin(boxPoint(event))) return;
    aimOrigin = origin(swipe);
    pointerTarget = event.currentTarget as Element;
    try { (pointerTarget as HTMLElement).setPointerCapture?.(event.pointerId); } catch { /* synthetic pointers cannot be captured */ }
    deps.initAudio(); deps.rerender();
  }
  function move(event: PointerEvent): void {
    if (event.pointerId !== tracker.snapshot().pointerId) return;
    if (!deps.swipeActive() || !deps.touchPlayEnabled()) { clear(); return; }
    event.preventDefault(); tracker.move(boxPoint(event)); deps.rerender();
  }
  function finish(event: PointerEvent): void {
    if (event.pointerId !== tracker.snapshot().pointerId) return;
    event.preventDefault();
    const intent = resolveDirection(tracker.end(boxPoint(event)));
    aimOrigin = null;
    const target = pointerTarget; pointerTarget = null;
    if ((target as HTMLElement | null)?.hasPointerCapture?.(event.pointerId)) (target as HTMLElement).releasePointerCapture(event.pointerId);
    if (deps.swipeActive() && deps.touchPlayEnabled() && intent) {
      const accepted = (deps.engine().queueSwipeShot as (shot: unknown) => unknown)(intent);
      notice = accepted ? "Shot locked" : "Swipe as the ball approaches"; noticeUntil = deps.state().time + 1.2;
    }
    deps.rerender();
  }
  for (const surface of [deps.canvas, pad].filter(Boolean) as HTMLElement[]) {
    surface.addEventListener("pointerdown", begin, { passive: false });
    surface.addEventListener("pointermove", move, { passive: false });
    surface.addEventListener("pointerup", finish, { passive: false });
    for (const type of ["pointercancel", "lostpointercapture"] as const) {
      surface.addEventListener(type, (event) => { if ((event as PointerEvent).pointerId === tracker.snapshot().pointerId) { clear(); deps.rerender(); } });
    }
  }

  function render(touchEnabled: boolean): void {
    if (!overlay) return;
    const active = deps.swipeActive();
    document.querySelector<HTMLElement>(".game-shell")!.dataset.mobileStyle = active ? "swipe" : "classic";
    overlay.hidden = !active || !touchEnabled;
    if (!active || !touchEnabled) { visual = { state: "idle", target: null, trajectoryPoints: 0 }; return; }
    const s = deps.state();
    const swipe = swipeState();
    const gesture = tracker.snapshot() as ReturnType<SwipeGestureTracker["snapshot"]> & Partial<RawSwipeGesture> & { x?: number; y?: number; time?: number; active: boolean };
    const locked = swipe.committed || swipe.intent;
    const preview = !locked && gesture.active
      ? resolveDirection(deps.swipe.classifyGesture({ ...(gesture as unknown as RawSwipeGesture), endX: gesture.x as number, endY: gesture.y as number, endTime: gesture.time as number }))
      : null;
    const intent = (locked || preview) as { strength?: number; targetX?: number; targetDepth?: number } | null | undefined | true;
    const isServing = serving();
    let hint = isServing ? "Swipe toward your target to serve" : s.practice ? "Swipe as the high ball approaches" : "Swipe toward your target";
    if (s.phase === "point" || s.phase === "practiceResult") hint = s.practice ? String((s.practice as { lastResult?: string }).lastResult ?? "") : "Get ready for the next point";
    else if (locked) hint = isServing ? "Serve locked" : "Shot locked";
    else if (preview) hint = "Release to lock your shot";
    else if (swipe.previewFlight) hint = "Shot in flight";
    else if (s.time < noticeUntil) hint = notice;
    if (swipe.pendingStyle) hint += (s.practice ? " · Next feed: " : " · Next point: ") + (swipe.pendingStyle === "swipe" ? "Swipe" : "Classic");
    deps.text("swipe-hint", hint);
    const shotIntent = (typeof intent === "object" ? intent : null) as { strength?: number; targetX?: number; targetDepth?: number } | null;
    const strength = clamp(Number(shotIntent?.strength) || 0, 0, isServing ? 1 : Math.min(1, (s.energy ?? s.player.energy) / deps.energyCost));
    const fill = maybeById("swipe-strength");
    if (fill) fill.style.transform = `scaleX(${strength})`;
    const label = maybeById("swipe-strength-value");
    if (label) label.textContent = `${Math.round(strength * 100)}% boost`;
    const line = maybeById("swipe-trail-path");
    line?.setAttribute("points", !locked && gesture.active ? gesture.points.map((p) => `${p.x},${p.y}`).join(" ") : "");
    const marker = maybeById("swipe-target");
    if (!marker) return;
    let target: { x: number; y: number } | null = null;
    if (shotIntent && Number.isFinite(shotIntent.targetX) && Number.isFinite(shotIntent.targetDepth)) {
      target = { x: shotIntent.targetX as number, y: -(shotIntent.targetDepth as number) };
      if (isServing) {
        const g = deps.engine().getServeGeometry?.("player");
        if (g) target = { x: lerp(g.minX + 0.025, g.maxX - 0.025, ((shotIntent.targetX as number) + 0.8) / 1.6), y: -lerp(0.08, 0.5, ((shotIntent.targetDepth as number) - 0.23) / 0.69) };
      }
    }
    if (!preview && swipe.previewTarget) target = { ...swipe.previewTarget };
    const visualState = locked ? "locked" : preview ? "aiming" : swipe.previewFlight ? "flight" : "idle";
    overlay.dataset.shotState = visualState;
    const path = maybeById("swipe-trajectory-path");
    const shadow = maybeById("swipe-trajectory-ground");
    const points: string[] = [];
    if (target) {
      const from = (swipe.previewFlight?.origin as { x: number; y: number; z: number } | undefined) ?? aimOrigin ?? origin(swipe);
      const flight = swipe.previewFlight ?? { ...deps.physics.solveShot(from as never, target.x, target.y, isServing ? 0.65 : 0.82, 0.1), origin: from };
      const duration = (flight as { flightTime?: number }).flightTime ?? deps.physics.timeToGround({ ...from, ...(flight as object) } as never);
      for (let i = 0; i <= 32; i++) {
        const sample = deps.physics.sample({ ...from, ...(flight as object) } as never, (duration * i) / 32);
        const p = deps.projectCourt(sample.x, sample.y, sample.z);
        points.push(`${(deps.canvas.offsetLeft + p.x).toFixed(1)},${(deps.canvas.offsetTop + p.y).toFixed(1)}`);
      }
      const start = deps.projectCourt(from.x, from.y), end = deps.projectCourt(target.x, target.y);
      shadow?.setAttribute("points", `${deps.canvas.offsetLeft + start.x},${deps.canvas.offsetTop + start.y} ${deps.canvas.offsetLeft + end.x},${deps.canvas.offsetTop + end.y}`);
    } else shadow?.setAttribute("points", "");
    path?.setAttribute("points", points.join(" "));
    visual = { state: visualState, target, trajectoryPoints: points.length };
    const projected = target ? deps.projectCourt(target.x, target.y) : null;
    marker.hidden = !projected?.visible;
    if (projected?.visible) {
      marker.style.left = `${deps.canvas.offsetLeft + projected.x}px`;
      marker.style.top = `${deps.canvas.offsetTop + projected.y}px`;
    }
  }

  return { gesture: () => tracker.snapshot(), visual: () => visual, render, clear, boundaryKey: () => boundary, setBoundaryKey: (key) => { boundary = key; } };
}
