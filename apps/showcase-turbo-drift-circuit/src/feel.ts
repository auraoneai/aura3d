export type RaceHudStatus = "Lights" | "Racing" | "Finished" | "Paused";

export interface StartLightsState {
  /** Seconds elapsed in the current light step. */
  stepElapsed: number;
  /** 3 → 2 → 1 → 0 (GO). */
  step: 3 | 2 | 1 | 0;
  complete: boolean;
  jumpedLights: boolean;
  penaltySeconds: number;
}

export interface RaceSessionState {
  startLights: StartLightsState;
  paused: boolean;
  raceStarted: boolean;
  finishCameraBlend: number;
  nitroSeconds: number;
  lastHairpinDriftProgress: number | null;
  raceStartTime: number;
  displayedRaceTime: number;
}

export const START_LIGHT_STEP_SECONDS = 1;
export const START_LIGHT_JUMP_PENALTY = 0.15;
export const NITRO_DURATION_SECONDS = 1.4;
export const NITRO_SPEED_MULTIPLIER = 1.22;
export const FINISH_CAMERA_BLEND_RATE = 0.85;

export function createRaceSessionState(): RaceSessionState {
  return {
    startLights: createStartLightsState(),
    paused: false,
    raceStarted: false,
    finishCameraBlend: 0,
    nitroSeconds: 0,
    lastHairpinDriftProgress: null,
    raceStartTime: 0,
    displayedRaceTime: 0
  };
}

export function createStartLightsState(): StartLightsState {
  return {
    stepElapsed: 0,
    step: 3,
    complete: false,
    jumpedLights: false,
    penaltySeconds: 0
  };
}

export function advanceStartLights(
  state: StartLightsState,
  dt: number,
  throttleOrDriftHeldBeforeGo: boolean
): StartLightsState {
  if (state.complete) return state;
  if (!state.jumpedLights && throttleOrDriftHeldBeforeGo && state.step > 0) {
    return {
      ...state,
      jumpedLights: true,
      penaltySeconds: START_LIGHT_JUMP_PENALTY
    };
  }
  let stepElapsed = state.stepElapsed + Math.max(0, dt);
  let step = state.step;
  while (stepElapsed >= START_LIGHT_STEP_SECONDS && step > 0) {
    stepElapsed -= START_LIGHT_STEP_SECONDS;
    step = (step - 1) as 3 | 2 | 1 | 0;
  }
  if (step === 0 && stepElapsed >= START_LIGHT_STEP_SECONDS * 0.55) {
    return { ...state, step: 0, stepElapsed: 0, complete: true };
  }
  return { ...state, step, stepElapsed };
}

export function startLightsLabel(state: StartLightsState): string {
  if (state.complete) return "GO";
  if (state.step === 3) return "3";
  if (state.step === 2) return "2";
  return "1";
}

export function canSimulateRace(session: RaceSessionState, raceFinished: boolean): boolean {
  if (session.paused || raceFinished) return false;
  return session.startLights.complete;
}

export function resolveRaceHudStatus(
  session: RaceSessionState,
  raceFinished: boolean
): RaceHudStatus {
  if (session.paused) return "Paused";
  if (raceFinished) return "Finished";
  if (!session.startLights.complete) return "Lights";
  return "Racing";
}

export function wrappedProgressGap(playerProgress: number, opponentProgress: number): number {
  let gap = playerProgress - opponentProgress;
  while (gap > 0.5) gap -= 1;
  while (gap < -0.5) gap += 1;
  return gap;
}

export function formatGapToRival(gapProgress: number, routeLength: number, referenceSpeed: number): string {
  const seconds = (gapProgress * routeLength) / Math.max(referenceSpeed, 0.001);
  const sign = seconds >= 0 ? "+" : "-";
  return `${sign}${Math.abs(seconds).toFixed(2)}s`;
}

export function resolveRacePosition(gapProgress: number): "P1" | "P2" {
  return gapProgress >= 0 ? "P1" : "P2";
}

export function formatLapClock(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return "--:--.--";
  const whole = Math.floor(seconds);
  const millis = Math.floor((seconds - whole) * 100);
  const minutes = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${minutes}:${String(secs).padStart(2, "0")}.${String(millis).padStart(2, "0")}`;
}

export function updateRaceSessionTiming(
  session: RaceSessionState,
  dt: number,
  raceFinished: boolean,
  raceTime: number
): RaceSessionState {
  if (session.paused || !session.startLights.complete) return session;
  const penalty = session.startLights.complete && !session.raceStarted
    ? session.startLights.penaltySeconds
    : 0;
  const raceStarted = session.raceStarted || session.startLights.complete;
  const displayedRaceTime = raceFinished
    ? session.displayedRaceTime || raceTime + penalty
    : raceTime + penalty;
  return {
    ...session,
    raceStarted,
    raceStartTime: raceStarted && session.raceStartTime === 0 ? displayedRaceTime : session.raceStartTime,
    displayedRaceTime
  };
}

export function updateFinishCameraBlend(session: RaceSessionState, dt: number, raceFinished: boolean): RaceSessionState {
  const target = raceFinished ? 1 : 0;
  const blend = session.finishCameraBlend;
  if (Math.abs(blend - target) < 0.001) {
    return blend === target ? session : { ...session, finishCameraBlend: target };
  }
  const next = blend + (target - blend) * Math.min(1, FINISH_CAMERA_BLEND_RATE * Math.max(0, dt));
  return { ...session, finishCameraBlend: next };
}

export function updateNitro(session: RaceSessionState, dt: number): RaceSessionState {
  if (session.nitroSeconds <= 0) return session;
  return { ...session, nitroSeconds: Math.max(0, session.nitroSeconds - dt) };
}

/**
 * Awards a short nitro burst after a clean hairpin drift on asphalt.
 * Hairpin is detected by high curvature near progress 0.72 on Tsukuba.
 */
export function maybeAwardHairpinNitro(input: {
  readonly session: RaceSessionState;
  readonly driftVisible: boolean;
  readonly onAsphalt: boolean;
  readonly progress: number;
  readonly curvature: number;
}): RaceSessionState {
  if (!input.driftVisible || !input.onAsphalt || input.session.nitroSeconds > 0) return input.session;
  const hairpin = Math.abs(input.curvature) > 0.9 && input.progress > 0.68 && input.progress < 0.78;
  if (!hairpin) return input.session;
  if (input.session.lastHairpinDriftProgress !== null
    && Math.abs(input.progress - input.session.lastHairpinDriftProgress) < 0.04) {
    return input.session;
  }
  return {
    ...input.session,
    nitroSeconds: NITRO_DURATION_SECONDS,
    lastHairpinDriftProgress: input.progress
  };
}

export function nitroSpeedMultiplier(session: RaceSessionState): number {
  return session.nitroSeconds > 0 ? NITRO_SPEED_MULTIPLIER : 1;
}

export function resetRaceSession(session: RaceSessionState): RaceSessionState {
  return createRaceSessionState();
}

export function togglePause(session: RaceSessionState): RaceSessionState {
  return { ...session, paused: !session.paused };
}
