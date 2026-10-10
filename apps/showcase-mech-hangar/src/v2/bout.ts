// Bout lifecycle, event dispatch, autorun — extracted from boot.ts for
// 14-LOC. Mode/bout state lives on `ctx`; same behavior and ordering.
import { createMechBout, type BoutEvent, type BoutInputs, type BoutSnapshot } from "../gameplay/arena/mech-fight";
import type { createHangarController } from "../legacy/hangar";
import type { BuildSelection } from "../gameplay/parts-catalog";
import { RIVAL_LOADOUTS } from "../gameplay/stats";
import { ARENA_CENTER_Z } from "./scene/world";
import type { createHangarAudio } from "../legacy/hangar-audio";
import type { wireMechFx } from "./scene/fx";

export interface MechBoutCtx {
  mode: "hangar" | "arena";
  bout: ReturnType<typeof createMechBout> | null;
  boutIndex: number;
  paused: boolean;
  lastHit: "none" | "light" | "heavy";
  autorunPhase: "lock" | "advance" | "strike" | "done";
  autorunActive: boolean;
  autorunClock: number;
}

export function createMechBoutCtx(): MechBoutCtx {
  return {
    mode: "hangar",
    bout: null,
    boutIndex: 0,
    paused: false,
    lastHit: "none",
    autorunPhase: "lock",
    autorunActive: false,
    autorunClock: 0,
  };
}

const RIVAL_FIXED_LOADOUT = RIVAL_LOADOUTS[1]!;

export function wireMechBout(ctx: MechBoutCtx, deps: {
  hangar: ReturnType<typeof createHangarController>;
  mountSide(side: "player" | "rival", selection: BuildSelection, rootPosition: readonly [number, number, number], yaw: number, familyBack?: number): void;
  hideSide(side: "player" | "rival"): void;
  remountPreview(): void;
  audio: ReturnType<typeof createHangarAudio>;
  fx: ReturnType<typeof wireMechFx>;
}) {
  const { hangar, mountSide, hideSide, remountPreview, audio, fx } = deps;

  function enterArena(): void {
    if (hangar.snapshot().locked === false) return;
    ctx.mode = "arena";
    ctx.paused = false;
    startBout();
  }

  function startBout(): void {
    ctx.bout = createMechBout({
      playerSelection: hangar.selection,
      rivalSelection: RIVAL_FIXED_LOADOUT.selection,
      presetIndex: ctx.boutIndex % 4,
      seed: 20260821 + ctx.boutIndex * 7919
    });
    ctx.lastHit = "none";
    mountSide("player", hangar.selection, [-1.9, 0, ARENA_CENTER_Z], Math.PI / 2);
    mountSide("rival", RIVAL_FIXED_LOADOUT.selection, [1.9, 0, ARENA_CENTER_Z], -Math.PI / 2);
  }

  function leaveToHangar(): void {
    ctx.mode = "hangar";
    ctx.paused = false;
    ctx.bout = null;
    hideSide("rival");
    hangar.unlockForRematchEdit();
    remountPreview();
  }

  function rematchBout(): void {
    ctx.boutIndex += 1;
    startBout();
  }

  function handleBoutEvent(event: BoutEvent): void {
    if (!ctx.bout) return;
    const at: [number, number, number] = [event.x, event.y + 0.95, ARENA_CENTER_Z];
    if (event.type === "hit") {
      ctx.lastHit = event.heavy ? "heavy" : "light";
      void audio.cue(event.heavy ? "mechHeavyHitSfx" : "mechLightHitSfx");
      if (event.heavy) fx.heavyHit(at);
      else fx.lightHit(at);
    } else if (event.type === "blocked") {
      void audio.cue("mechGuardBlockSfx");
      fx.blocked(at);
    } else if (event.type === "guardBreak") {
      void audio.cue("mechGuardBreakSfx");
      fx.guardBreak(at);
    } else if (event.type === "specialFire") {
      void audio.cue("mechSpecialFireSfx");
      fx.specialFire(at);
    } else if (event.type === "jump") {
      fx.jump([event.x, 0.1, ARENA_CENTER_Z]);
    } else if (event.type === "land") {
      fx.land([event.x, 0.1, ARENA_CENTER_Z]);
    } else if (event.type === "ko") {
      void audio.cue("mechKoStingSfx");
      fx.ko(at);
    }
  }

  function autorunInputs(snap: BoutSnapshot): BoutInputs | null {
    if (ctx.mode === "hangar") return null;
    if (snap.phase !== "fighting") return { moveX: 0, jump: false, light: false, heavy: false, special: false, guard: false };
    const gap = snap.rival.x - snap.player.x;
    if (gap > 2.1) {
      ctx.autorunPhase = "advance";
      return { moveX: 1, jump: false, light: false, heavy: false, special: false, guard: false };
    }
    ctx.autorunPhase = "strike";
    // Alternate light/heavy with a special once power is high; guard between.
    const frame = snap.frame % 90;
    const strike: Partial<BoutInputs> =
      frame < 12 ? { heavy: true }
      : frame < 24 ? { light: true }
      : frame < 30 && snap.player.power > 0.8 ? { special: true }
      : {};
    return { moveX: gap > 1.2 ? 0.4 : 0, jump: frame === 60, light: !!strike.light, heavy: !!strike.heavy, special: !!strike.special, guard: frame > 66 };
  }

  function startAutorun(): void {
    ctx.autorunActive = true;
    ctx.autorunPhase = "lock";
    ctx.autorunClock = 0;
  }

  return { enterArena, startBout, leaveToHangar, rematchBout, handleBoutEvent, autorunInputs, startAutorun };
}
