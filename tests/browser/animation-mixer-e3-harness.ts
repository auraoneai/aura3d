import {
  assignActionToAnimationLayer,
  attachAnimationLayer,
  createAnimationAction,
  createAnimationClip,
  createAnimationDebugOverlay,
  createAnimationEventMarker,
  createAnimationLayer,
  createAnimationMixer,
  createAnimationTrack,
  crossFadeAnimations,
  setAnimationTimeScale,
  subscribeAnimationEvents
} from "@aura3d/engine";

interface MixerE3Evidence {
  readonly status: "ready" | "error";
  readonly imports: readonly string[];
  readonly reachability: {
    readonly mixer: boolean;
    readonly action: boolean;
    readonly track: boolean;
    readonly event: boolean;
    readonly timeScale: boolean;
    readonly crossfade: boolean;
    readonly layers: boolean;
    readonly overlay: boolean;
  };
  readonly idleWeightBefore: number;
  readonly runWeightBefore: number;
  readonly idleWeightAfter: number;
  readonly runWeightAfter: number;
  readonly heroPosition: readonly [number, number, number] | null;
  readonly armRotation: readonly [number, number, number] | null;
  readonly eventsFired: readonly string[];
  readonly mixerTimeScale: number;
  readonly overlayFrame: number;
  readonly overlayPhaseOneHtml: string;
  readonly overlayHtml: string;
  readonly overlayLiveChanged: boolean;
  readonly stateNames: readonly string[];
  readonly layerNames: readonly string[];
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_ANIMATION_MIXER_E3__?: MixerE3Evidence;
  }
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  const idleClip = createAnimationClip({
    name: "idle",
    tracks: [
      createAnimationTrack({
        target: "hero.position",
        valueType: "vector3",
        keyframes: [
          { time: 0, value: [0, 0, 0] },
          { time: 1, value: [0, 0, 0] }
        ]
      })
    ],
    events: [createAnimationEventMarker({ name: "footstep", time: 0.5 })]
  });
  const runClip = createAnimationClip({
    name: "run",
    tracks: [
      createAnimationTrack({
        target: "hero.position",
        valueType: "vector3",
        keyframes: [
          { time: 0, value: [0, 0, 0] },
          { time: 1, value: [2, 0, 0] }
        ]
      })
    ],
    events: [createAnimationEventMarker({ name: "stride", time: 0.25 })]
  });
  const armClip = createAnimationClip({
    name: "wave",
    tracks: [
      createAnimationTrack({
        target: "hero.arm.rotation",
        valueType: "vector3",
        keyframes: [
          { time: 0, value: [0, 0, 0] },
          { time: 1, value: [0, 0, 1] }
        ]
      })
    ]
  });

  const mixer = createAnimationMixer({ timeScale: 1 });
  const idle = createAnimationAction(idleClip, { loop: "repeat" });
  const run = createAnimationAction(runClip, { loop: "repeat", weight: 0 });
  const arm = createAnimationAction(armClip, { loop: "repeat" });
  mixer.addAction(idle);
  mixer.addAction(run);
  mixer.addAction(arm);
  const layer = attachAnimationLayer(mixer, createAnimationLayer("upper-body", { mask: ["hero.arm"] }));
  assignActionToAnimationLayer(layer, arm);

  const eventsFired: string[] = [];
  subscribeAnimationEvents(mixer, (event) => {
    eventsFired.push(`${event.clipName}:${event.name}`);
  });
  setAnimationTimeScale(mixer, 1);

  const overlay = createAnimationDebugOverlay({ mixer });
  const mount = document.getElementById("overlay");
  if (!mount) {
    throw new Error("overlay mount element is missing.");
  }
  overlay.mount(mount);

  for (let step = 0; step < 5; step += 1) {
    overlay.update(0.1);
  }
  const idleWeightBefore = idle.weight;
  const runWeightBefore = run.weight;
  const overlayPhaseOneHtml = mount.innerHTML;

  await delay(400);

  crossFadeAnimations(mixer, idle, run, 0.4);
  for (let step = 0; step < 6; step += 1) {
    overlay.update(0.1);
  }

  const snapshot = overlay.snapshot();
  const position = mixer.getValue("hero.position") as readonly [number, number, number] | undefined;
  const rotation = mixer.getValue("hero.arm.rotation") as readonly [number, number, number] | undefined;
  const overlayHtml = mount.innerHTML;

  window.__AURA3D_ANIMATION_MIXER_E3__ = {
    status: "ready",
    imports: ["@aura3d/engine"],
    reachability: {
      mixer: true,
      action: true,
      track: true,
      event: eventsFired.length > 0,
      timeScale: snapshot.mixerTimeScale === 1,
      crossfade: run.weight > idle.weight,
      layers: snapshot.layers.length === 1,
      overlay: overlayHtml.includes("animation-debug")
    },
    idleWeightBefore,
    runWeightBefore,
    idleWeightAfter: idle.weight,
    runWeightAfter: run.weight,
    heroPosition: position ? [position[0], position[1], position[2]] : null,
    armRotation: rotation ? [rotation[0], rotation[1], rotation[2]] : null,
    eventsFired,
    mixerTimeScale: snapshot.mixerTimeScale,
    overlayFrame: snapshot.frame,
    overlayPhaseOneHtml,
    overlayHtml,
    overlayLiveChanged: overlayPhaseOneHtml !== overlayHtml,
    stateNames: snapshot.states.map((state) => state.clipName),
    layerNames: snapshot.layers.map((entry) => entry.name)
  };
}

main().catch((error: unknown) => {
  window.__AURA3D_ANIMATION_MIXER_E3__ = {
    status: "error",
    imports: ["@aura3d/engine"],
    reachability: {
      mixer: false,
      action: false,
      track: false,
      event: false,
      timeScale: false,
      crossfade: false,
      layers: false,
      overlay: false
    },
    idleWeightBefore: 0,
    runWeightBefore: 0,
    idleWeightAfter: 0,
    runWeightAfter: 0,
    heroPosition: null,
    armRotation: null,
    eventsFired: [],
    mixerTimeScale: 0,
    overlayFrame: 0,
    overlayPhaseOneHtml: "",
    overlayHtml: "",
    overlayLiveChanged: false,
    stateNames: [],
    layerNames: [],
    error: error instanceof Error ? error.message : String(error)
  };
});
