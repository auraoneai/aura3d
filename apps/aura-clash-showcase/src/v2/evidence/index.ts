// apps/aura-clash-showcase/src/v2/evidence/index.ts — T2.5 evidence.
// §7.2.1 sections for aura-clash-showcase under
// window.__AURA3D_GAME_EVIDENCE__["aura-clash-showcase"], lazily computed,
// no per-frame allocation > 1KB. `session` is shell-owned — the route
// publishes `playback` instead (spec reads paused via __AURA3D_GAME__.session).
import type {
  AuraApp, FightingGameSnapshot, GameSession
} from "@aura3d/engine";

export const AURA_CLASH_EVIDENCE_ID = "aura-clash-showcase";

export interface AuraClashEvidenceBindings {
  readonly game: {
    readonly session: GameSession;
    readonly fx: { readonly liveCount: number; readonly backend: string };
  };
  readonly app: () => AuraApp | undefined;
  readonly snapshot: () => FightingGameSnapshot;
  // T2.2-post: appliedLook is the C-31 runtime look manifest — a varying shape.
  readonly appliedLook: Record<string, unknown>;
  readonly audioCueLog: () => readonly string[];
  readonly hitStopActive: () => boolean;
  readonly roundInfo: () => { readonly round: number; readonly timeLeft: number };
  readonly bootedAtMs: number;
  readonly frameCount: () => number;
}

export function publishAuraClashEvidence(b: AuraClashEvidenceBindings): void {
  const w = window as unknown as Record<string, Record<string, unknown>>;
  w.__AURA3D_GAME_EVIDENCE__ ??= {};
  w.__AURA3D_GAME_EVIDENCE__[AURA_CLASH_EVIDENCE_ID] = {
    get playback() {
      return {
        state: b.game.session.state,
        paused: b.game.session.paused,
        simTime: b.game.session.simTime,
        timeScale: b.game.session.timeScale,
        frame: b.frameCount()
      };
    },
    get fx() {
      return { liveCount: b.game.fx.liveCount, backend: b.game.fx.backend };
    },
    get framing() {
      const ev = b.app()?.camera?.evidence?.();
      return {
        rig: ev?.rig ?? null,
        subjectScreenHeightFraction: ev?.subjectScreenHeightFraction ?? null,
        subjectHeightFraction: ev?.subjectScreenHeightFraction ?? null
      };
    },
    get render() {
      const d = b.app()?.diagnostics?.();
      return {
        backend: d?.backend ?? null,
        fps: d?.fps ?? null,
        drawCalls: d?.drawCalls ?? null,
        renderSize: d?.renderSize ?? null,
        errors: d?.errors ?? [],
        warnings: d?.warnings ?? []
      };
    },
    get appliedLook() {
      return { ...b.appliedLook };
    },
    get loading() {
      return { bootedAtMs: b.bootedAtMs };
    },
    // §7.2.1 combat section: backs `combat.hitStopActive === true &&
    // fx.liveCount > 0` on 04-action.
    get combat() {
      const snap = b.snapshot();
      const actors = snap.combat?.actors ?? [];
      const p1 = actors.find((a) => a.id === "p1");
      const p2 = actors.find((a) => a.id === "p2");
      const round = b.roundInfo();
      return {
        hitStopActive: b.hitStopActive(),
        roundLocked: snap.combat?.roundLocked ?? false,
        activeAttacks: (snap.combat?.activeAttacks ?? []).map((a) => a.moveId),
        states: snap.states,
        health: { p1: p1?.health ?? null, p2: p2?.health ?? null },
        meter: { p1: p1?.meter ?? null, p2: p2?.meter ?? null },
        round: round.round,
        timeLeft: round.timeLeft
      };
    },
    get audio() {
      return { cueLog: b.audioCueLog() };
    }
  };
}
