// apps/showcase-mech-hangar/src/v2/evidence/index.ts — lazy evidence sections the
// capture + browser specs read. loading.sceneId reports the logical room
// ("hangar" before lock-in, "pit" after) while loading.sceneSwaps stays 0 —
// both sets live in one union scene.
export interface MechEvidenceBindings {
  sceneId(): "hangar" | "pit";
  combat(): {
    phase: string;
    boutIndex: number;
    preset: string;
    lastHit: "none" | "light" | "heavy";
    playerX: number;
    rivalX: number;
    playerHp: number;
    rivalHp: number;
    playerGuard: number;
    playerPower: number;
  };
  hangar(): {
    locked: boolean;
    activeSlot: string;
    selection: { chassis: number; arms: number; legs: number; weapon: number };
    orbitYaw: number;
  };
  fx(): { liveCount: number; backend: string };
  audio(): { lastCue: string | null; cueLog: readonly string[] };
  run(): { paused: boolean; touchEngaged: boolean; replayActive: boolean };
  appliedLook(): Record<string, unknown>;
  rig(): Record<string, unknown>;
  scenario(): string | null;
  render(): { frame: number; firstFrameAt: number | null };
}

export function publishMechEvidence(bindings: MechEvidenceBindings) {
  const evidence = {
    get player() {
      const c = bindings.combat();
      return { x: c.playerX, hp: c.playerHp, guard: c.playerGuard, power: c.playerPower };
    },
    get combat() {
      return bindings.combat();
    },
    get hangar() {
      return bindings.hangar();
    },
    get loading() {
      return {
        sceneId: bindings.sceneId(),
        sceneSwaps: 0,
        lazyLoadedCount: 0,
        fetchCount: { mechHeroDecimated: 1 }
      };
    },
    get fx() {
      return bindings.fx();
    },
    get audio() {
      return bindings.audio();
    },
    get run() {
      return bindings.run();
    },
    get render() {
      return bindings.render();
    },
    get appliedLook() {
      return bindings.appliedLook();
    },
    get rig() {
      return bindings.rig();
    },
    get scenario() {
      return bindings.scenario();
    }
  };
  (window as unknown as { __AURA3D_GAME_EVIDENCE__?: Record<string, unknown> }).__AURA3D_GAME_EVIDENCE__ = {
    ...((window as unknown as { __AURA3D_GAME_EVIDENCE__?: Record<string, unknown> }).__AURA3D_GAME_EVIDENCE__ ?? {}),
    "showcase-mech-hangar": evidence
  };
  return evidence;
}
