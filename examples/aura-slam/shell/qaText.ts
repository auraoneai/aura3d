import { GRAVITY, METRES_PER_UNIT, NET_HEIGHT } from "../contract";
import { outFeedbackView, speedometerView } from "../ui/hud";
import { pointLabel } from "../ui/format";
import { scoreboardState } from "../ui/scoreboard";
import { serveAttemptOf, lastServeOf } from "../ui/serveFeedback";
import { summarizeMatch, type MatchResultsModel } from "../ui/results";
import { SHOT_DEFAULTS, type HudState, type ScoreboardNames, type ShotConstants, type SlamEngine } from "../ui/types";
import { themeFor } from "../ui/venues";
import { appearance } from "../sim/appearance";
import { DEFAULT_ROSTER } from "./matchSetup";

export const COORDINATE_SYSTEM =
  "World court coordinates: origin at net center; x increases right; y increases toward player/bottom; z is height. Court x=-1..1, y=-1..1.";

/** Everything `render_game_to_text` reads besides the state itself, so the function stays pure and testable. */
export interface QaTextInput {
  state: HudState;
  names: ScoreboardNames;
  menu: unknown;
  /** The model rendered on the results card, when it is visible. */
  shownResults: MatchResultsModel | null;
  selectedShot: string;
  strategic: boolean;
  modernServe: boolean;
  swipeActive: boolean;
  mobileControls: unknown;
  swipeState: unknown;
  swipeGesture: unknown;
  swipeVisual: unknown;
  bindings: { keyboard: unknown; controller: unknown; settingsOpen: boolean };
  touch: { active: boolean; dragging: boolean; x: number; y: number };
  placementDown: boolean;
  smashAvailable: boolean;
  graphics: unknown;
  engine: SlamEngine;
  serveFeedback: unknown;
  controlsHelp: string;
  shot?: Readonly<ShotConstants>;
}

const fixed = (n: number, digits = 3): number => +n.toFixed(digits);

/** game.js `renderGameToText` for Phase 1 (offline play): same keys and units so existing capture tools keep working. */
export function renderGameToText(input: QaTextInput): string {
  const { state, names } = input;
  const ball = state.ball;
  const shot = input.shot ?? SHOT_DEFAULTS;
  const p = state.player;
  const venue = themeFor(state.venue);
  const energy = state.energy ?? p.energy;
  const serveSide = state.server === "player" && ["serve", "serveToss"].includes(state.phase);
  const doc = {
    coordinateSystem: COORDINATE_SYSTEM,
    netHeight: NET_HEIGHT,
    mode: state.mode,
    matchResults: input.shownResults ?? (state.mode === "gameover" ? summarizeMatch(state, names) : null),
    menu: input.menu ?? null,
    tour: null,
    paused: state.paused,
    tiebreak: state.tiebreak,
    phase: state.phase,
    difficulty: state.difficulty,
    cpuTactics: (state.ai as { controller?: string; tactics?: unknown }).controller === "computer" ? (state.ai as { tactics?: unknown }).tactics ?? null : null,
    roster: {
      enabled: true, selection: { ...DEFAULT_ROSTER }, player: (state.player as { rosterId?: string }).rosterId || "classic", rival: (state.ai as { rosterId?: string }).rosterId || "classic",
      customRatings: { player: (state.player as { customRatings?: unknown }).customRatings || null, rival: (state.ai as { customRatings?: unknown }).customRatings || null }, chooserOpen: false
    },
    offlineBuild: null,
    multiplayerBuild: null,
    characters: { player: (state.player as { characterId?: string }).characterId || null, rival: (state.ai as { characterId?: string }).characterId || null },
    appearance: { selection: appearance.defaults("player"), player: (state.player as { appearance?: unknown }).appearance || null, rival: (state.ai as { appearance?: unknown }).appearance || null, chooserOpen: false },
    assistance: input.swipeActive,
    controlMode: input.swipeActive ? "swipe" : "manual",
    mobileControls: input.mobileControls,
    swipe: { ...((input.swipeState as object) ?? {}), gesture: input.swipeGesture ?? { active: false }, visual: input.swipeVisual },
    bindings: { keyboard: input.bindings.keyboard, controller: input.bindings.controller, settingsOpen: input.bindings.settingsOpen },
    touchInput: { active: input.touch.active, dragging: input.touch.dragging, x: fixed(input.touch.x), y: fixed(input.touch.y) },
    inputMode: input.modernServe && serveSide ? (serveAttemptOf(state)?.lockedAim ? "serve-locked" : "serve-aim") : p.aimRemaining > 1e-9 ? "aim" : "move",
    shotControl: {
      aimWindowMs: shot.aimWindow * 1000, doubleTapWindowMs: shot.doubleTapWindow * 1000,
      aimRemainingMs: Math.round(p.aimRemaining * 1000), contactOpensMs: shot.contactOpens * 1000,
      direction: { x: Math.round(p.queuedAim / 0.72), depth: p.queuedShot }, powerArmed: p.queuedPower,
      ...(input.strategic ? { aimMagnitude: fixed(Math.abs(p.queuedAim)), controlledPlacement: input.placementDown } : {}),
      canDoubleTap: state.phase === "rally" && p.swing > 0 && !p.strokeConnected && p.swingPressAt !== null && state.time - (p.swingPressAt as number) <= shot.doubleTapWindow
    },
    power: { energy: fixed(energy, 2), max: shot.energyMax, cost: shot.powerCost, recoveryPerSecond: shot.recoveryPerSecond, available: energy + 1e-9 >= shot.powerCost },
    graphics: input.graphics ?? { type: "headless-simulation" },
    rallyHits: state.rallyHits,
    stats: state.stats,
    practice: state.practice ? { ...state.practice } : null,
    preparedShot: input.selectedShot,
    shotReady: p.swing > 0 && !p.strokeConnected,
    smashAvailable: input.smashAvailable,
    venue: { id: state.venue, name: venue.name, surface: venue.surface, destination: Boolean(venue.destination), gravity: "Earth", gravityMps2: GRAVITY * METRES_PER_UNIT.z, outfit: state.venue === "moon" ? "apollo" : "tennis" },
    server: state.server,
    serve: {
      number: state.serveNumber, court: state.serveCourt,
      ...(input.modernServe ? {
        modern: true, windupMs: (input.engine.SERVE?.windup ?? 0.24) * 1000, doubleTapWindowMs: (input.engine.SERVE?.doubleTapWindow ?? 0.22) * 1000,
        feedback: state.server === "player" ? input.serveFeedback : null, last: lastServeOf(state) ?? null,
        statistics: { player: (state.player as { stats: { serve: unknown } }).stats.serve, ai: (state.ai as { stats: { serve: unknown } }).stats.serve }
      } : { modern: false })
    },
    message: state.messageTimer > 0 || state.phase === "serve" || state.phase === "serveToss" ? state.message : "",
    lastShotType: state.lastShotType,
    lastStroke: state.lastStroke,
    lastShotSpeedKph: state.lastShotSpeed,
    speedometer: (({ speedKph, lastShotSpeedKph, maxKph }) => ({ speedKph, lastShotSpeedKph, maxKph }))(speedometerView(state)),
    outFeedback: outFeedbackView(state),
    playerName: names.player,
    lastTiming: state.lastTiming,
    lastShotPower: state.lastShotPower,
    score: {
      games: { player: state.score.playerGames, rival: state.score.aiGames },
      points: {
        player: state.tiebreak ? String(state.score.playerPoints) : pointLabel(state.score.playerPoints, state.score.aiPoints),
        rival: state.tiebreak ? String(state.score.aiPoints) : pointLabel(state.score.aiPoints, state.score.playerPoints)
      }
    },
    scoreboard: scoreboardState(state, names),
    player: {
      x: fixed(p.x), y: fixed(p.y), vx: fixed(p.vx), vy: fixed(p.vy),
      locomotion: p.moveBlend > 0.55 ? "running" : p.moveBlend > 0.1 ? "shuffling" : "ready",
      swinging: p.swing > 0, stroke: p.stroke, contactHeight: fixed(p.strokeContactZ), contactAge: fixed(p.strokeContactAge)
    },
    rival: {
      x: fixed(state.ai.x), y: fixed(state.ai.y),
      locomotion: state.ai.moveBlend > 0.55 ? "running" : state.ai.moveBlend > 0.1 ? "shuffling" : "ready",
      swinging: state.ai.swing > 0, stroke: state.ai.stroke, contactHeight: fixed(state.ai.strokeContactZ)
    },
    ball: {
      x: fixed(ball.x), y: fixed(ball.y), z: fixed(ball.z), vx: fixed(ball.vx), vy: fixed(ball.vy), vz: fixed(ball.vz),
      speedKph: ball.speedKph, active: ball.active,
      motion: ball.active ? "flight" : ball.dead ? (ball.settling ? (ball.rolling ? "rolling" : "settling") : "resting") : "held",
      isServe: ball.isServe, defensiveLob: !!ball.defensiveLob, highDeepLob: !!ball.highDeepLob, shotType: ball.shotType,
      netTouched: ball.netTouched, lastHit: ball.lastHit, bounces: ball.bounceCount,
      intendedLanding: ball.targetY == null ? null : { x: fixed(ball.targetX as number), y: fixed(ball.targetY) }
    },
    retiringBall: state.retiringBall
      ? { x: fixed(state.retiringBall.x), y: fixed(state.retiringBall.y), z: fixed(state.retiringBall.z), opacity: +(state.retiringBall.fade / 0.7).toFixed(2) }
      : null,
    online: null,
    controls: input.controlsHelp
  };
  return JSON.stringify(doc);
}

