// src/v2/evidence/index.ts — T2.5 evidence.
// §7.2.1 sections for showcase-orbital-defense under
// window.__AURA3D_GAME_EVIDENCE__["showcase-orbital-defense"], lazily
// computed, no per-frame allocation > 1KB. `session` is shell-owned — the
// route publishes `playback` (spec reads paused via __AURA3D_GAME__.session).
// `fx.explosionsLive` and `framing.dronesUnderHud` back the §7.2.1 rows.
import type { AuraApp, GameSession } from "@aura3d/engine";
import type { WaveState } from "../../gameplay/waves";
import { polar } from "../../gameplay/waves";

export const ORBITAL_EVIDENCE_ID = "showcase-orbital-defense";

export interface OrbitalEvidenceBindings {
  readonly game: {
    readonly session: GameSession;
    readonly fx: { readonly liveCount: number; readonly backend: string };
  };
  readonly app: () => AuraApp | undefined;
  readonly wave: () => WaveState;
  readonly appliedLook: {
    readonly preset: string;
    readonly toneMapping: string;
    readonly exposureEV: number;
  };
  readonly explosionsLive: () => number;
  readonly audioCueLog: () => readonly string[];
  readonly bootedAtMs: number;
  readonly frameCount: () => number;
}

/** Project world pos → NDC via the presented viewProjection (mat4). */
function ndc(m: readonly number[], p: readonly [number, number, number]): [number, number] | null {
  if (!m || m.length < 16) return null;
  const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
  const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
  const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
  if (w <= 1e-6) return null;
  return [x / w, y / w];
}

/** HUD band check matching games.json hudSelectors: widgets anchor the top
 * (~12%) and bottom (~15%) screen bands. */
function underHud(n: readonly [number, number]): boolean {
  return n[1] > 0.72 || n[1] < -0.7;
}

export function publishOrbitalEvidence(b: OrbitalEvidenceBindings): void {
  const w = window as unknown as Record<string, Record<string, unknown>>;
  w.__AURA3D_GAME_EVIDENCE__ ??= {};
  w.__AURA3D_GAME_EVIDENCE__[ORBITAL_EVIDENCE_ID] = {
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
      return {
        liveCount: b.game.fx.liveCount,
        backend: b.game.fx.backend,
        explosionsLive: b.explosionsLive()
      };
    },
    get framing() {
      const ev = b.app()?.camera?.evidence?.();
      const state = b.wave();
      let dronesUnderHud = 0;
      const vp = ev?.viewProjection;
      if (vp) {
        for (const e of state.enemies) {
          if (!e.active) continue;
          const n = ndc(vp, polar(e.angle, e.radius, 0));
          if (n && underHud(n)) dronesUnderHud += 1;
        }
      }
      return {
        rig: ev?.rig ?? null,
        subjectScreenHeightFraction: ev?.subjectScreenHeightFraction ?? null,
        dronesUnderHud
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
    get defense() {
      const s = b.wave();
      return {
        score: s.score,
        wave: s.wave,
        heat: s.player.heat,
        shieldCooldown: s.player.shieldCooldown,
        shieldPulses: s.player.shieldPulses.length,
        planetIntegrity: s.planetIntegrity,
        enemiesActive: s.enemies.filter((e) => e.active).length,
        projectilesActive: s.projectiles.filter((p) => p.active).length,
        playerAngle: s.player.angle
      };
    },
    get audio() {
      return { cueLog: b.audioCueLog() };
    }
  };
}
