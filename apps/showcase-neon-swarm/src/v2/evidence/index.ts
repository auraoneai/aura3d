// apps/showcase-neon-swarm/src/v2/evidence/index.ts — §7.2.1 evidence.
// Publishes `window.__AURA3D_GAME_EVIDENCE__["showcase-neon-swarm"]` with
// lazy section getters. The required conditions read `swarm.killsThisWave`
// and `fx.liveCount` here.
import type { Game } from "@aura3d/engine";
import type { PlayerState, PlayerUpgrades } from "../../gameplay/player";

export const SWARM_EVIDENCE_ID = "showcase-neon-swarm";

export interface SwarmEvidenceBindings {
  readonly game: Game;
  readonly run: () => {
    state: string;
    wave: number;
    stage: string;
    intermissionRemaining: number;
    score: number;
    combo: number;
    maxCombo: number;
    burstCharge: number;
    kills: number;
    killsThisWave: number;
    spawned: number;
    scheduled: number;
  };
  readonly swarm: () => { aliveGrunt: number; aliveElite: number };
  readonly player: () => PlayerState;
  readonly upgrades: () => PlayerUpgrades;
  readonly appliedLook: Record<string, unknown>;
  readonly frameCount: () => number;
  readonly bootedAtMs: number;
  readonly audioCueLog: () => readonly string[];
}

export function publishSwarmEvidence(b: SwarmEvidenceBindings): void {
  const w = window as unknown as Record<string, Record<string, unknown>>;
  w.__AURA3D_GAME_EVIDENCE__ ??= {};
  w.__AURA3D_GAME_EVIDENCE__[SWARM_EVIDENCE_ID] = {
    get playback() {
      return {
        state: b.game.session.state,
        paused: b.game.session.paused,
        simTime: b.game.session.simTime,
        timeScale: b.game.session.timeScale,
        frame: b.frameCount()
      };
    },
    get run() {
      return { ...b.run() };
    },
    get swarm() {
      const s = b.swarm();
      const r = b.run();
      return {
        aliveGrunt: s.aliveGrunt,
        aliveElite: s.aliveElite,
        alive: s.aliveGrunt + s.aliveElite,
        killsThisWave: r.killsThisWave,
        spawned: r.spawned,
        scheduled: r.scheduled
      };
    },
    get player() {
      const p = b.player();
      const u = b.upgrades();
      return {
        x: p.x,
        z: p.z,
        hp: p.hp,
        maxHp: p.maxHp,
        aimX: p.aimX,
        aimZ: p.aimZ,
        invulnerable: p.invulnerableRemaining > 0,
        dashReadyFraction: 1 - p.dashCooldownRemaining / 1.2,
        shieldCharges: u.shieldCharges
      };
    },
    get fx() {
      return { liveCount: b.game.fx.liveCount, backend: b.game.fx.backend };
    },
    get framing() {
      const ev = b.game.app.camera?.evidence?.();
      return {
        rig: ev?.rig ?? "neon-swarm.topdown",
        subjectScreenHeightFraction: ev?.subjectScreenHeightFraction ?? null,
        pose: ev?.pose ?? null
      };
    },
    get render() {
      const d = b.game.app.diagnostics();
      return {
        backend: d.backend,
        drawCalls: d.drawCalls,
        renderSize: d.renderSize,
        fps: d.fps,
        errors: d.errors,
        warnings: d.warnings
      };
    },
    // T2.6 parity: identical between the play URL and every ?scenario= URL.
    get appliedLook() {
      return b.appliedLook;
    },
    get audio() {
      return { cues: b.audioCueLog() };
    },
    get boot() {
      return { bootedAtMs: b.bootedAtMs, frame: b.frameCount() };
    }
  };
}
