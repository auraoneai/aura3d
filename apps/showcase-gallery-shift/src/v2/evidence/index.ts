// apps/showcase-gallery-shift/src/v2/evidence/index.ts — lazy evidence sections
// the capture + browser specs read. loading.sceneId reports the logical floor
// ("floor-1"/"floor-2") while loading.sceneSwaps stays 0 — both floor sets
// live in one union scene.

import type { Game } from "@aura3d/game";

export interface GalleryEvidenceBindings {
  sceneId(): "floor-1" | "floor-2";
  mission(): {
    floor: number;
    phase: string;
    lifted: number;
    totalLifted: number;
    score: number;
    ghost: boolean;
    alarmActive: boolean;
  };
  thief(): {
    x: number;
    z: number;
    gait: string;
    clip: string;
    carrying: boolean;
    facingYaw: number;
    yawErrorDeg: number;
  };
  guard(): {
    /** Highest-severity state across the patrol: alert > investigate > idle. */
    state: string;
    states: readonly { id: string; state: string; x: number; z: number }[];
  };
  characters(): {
    thiefTracksApplied: number;
    thiefYawErrorDeg: number;
    thiefClip: string | null;
    guardClips: readonly (string | null)[];
  };
  fx(): { conesVisible: number; liveCount: number; backend: string };
  detection(): { value: number; seen: boolean; lastSeen: { x: number; z: number } | null };
  audio(): { lastCue: string | null; cueLog: readonly string[] };
  run(): { paused: boolean; touchEngaged: boolean; replayActive: boolean };
  appliedLook(): Record<string, unknown>;
  readonly game: Game;
  rig(): Record<string, unknown>;
  scenario(): string | null;
  render(): { frame: number; firstFrameAt: number | null };
}

export function publishGalleryEvidence(bindings: GalleryEvidenceBindings) {
  const evidence = {
    get loading() {
      return {
        sceneId: bindings.sceneId(),
        sceneSwaps: 0,
        lazyLoadedCount: 0,
        fetchCount: { galleryShiftCutawayMuseumWorld: 1 }
      };
    },
    get mission() {
      return bindings.mission();
    },
    get thief() {
      return bindings.thief();
    },
    get guard() {
      return bindings.guard();
    },
    get characters() {
      return bindings.characters();
    },
    get fx() {
      return bindings.fx();
    },
    get detection() {
      return bindings.detection();
    },
    get audio() {
      return bindings.audio();
    },
    get run() {
      return bindings.run();
    },

    get framing() {
      const ev = bindings.game.app.camera?.evidence?.();
      return {
        rig: ev?.rig ?? "gallery-shift.chase",
        subjectScreenHeightFraction: ev?.subjectScreenHeightFraction ?? null,
        pose: ev?.pose ?? null
      };
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
    "showcase-gallery-shift": evidence
  };
  return evidence;
}
