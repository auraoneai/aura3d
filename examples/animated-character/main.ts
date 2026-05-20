import {
  AnimationClip,
  AnimationLayer,
  AnimationMixer,
  AnimationStateMachine,
  AnimationTrack,
  Bone,
  Skeleton,
  buildSkinningPalette,
  type AnimationStateMachineGraphSnapshot,
  type AnimationValue,
} from "@galileo3d/animation";
import { createExample, drawGrid, installExampleStyles, type ExampleMetadata } from "../shared/exampleHarness.js";

interface AnimatedCharacterExampleState {
  readonly status: "ready" | "error";
  readonly clipNames: readonly string[];
  readonly currentState: string;
  readonly stateTime: number;
  readonly hipPosition: readonly [number, number, number];
  readonly handOffset: readonly [number, number, number];
  readonly paletteJointCount: number;
  readonly paletteHandTranslation: readonly [number, number, number];
  readonly mixerActionCount: number;
  readonly graph: AnimationStateMachineGraphSnapshot;
  readonly blendTreeWeight: number;
  readonly debugStateMode: "auto" | "idle" | "walk" | "wave";
  readonly eventLog: readonly string[];
  readonly latestEvent?: string;
  readonly error?: string;
}

declare global {
  interface Window {
    __GALILEO3D_ANIMATED_CHARACTER_EXAMPLE__?: AnimatedCharacterExampleState;
  }
}

const metadata: ExampleMetadata = {
  id: "animated-character",
  title: "Animated Character",
  purpose: "Drive a procedural character rig with AnimationMixer layers and a state machine.",
  acceptance: "Hip and hand animation samples update every frame, and a two-joint skinning palette is produced.",
};

if (typeof document !== "undefined") {
  installExampleStyles();
  void createExample(metadata, ({ canvas }) => {
    const values = new Map<string, AnimationValue>();
    const mixer = new AnimationMixer({ setAnimationValue: (target, value) => values.set(target, value) });
    const locomotionClip = createLocomotionClip();
    const waveClip = createWaveClip();
    const locomotion = mixer.play(locomotionClip);
    const wave = mixer.play(waveClip);
    const upperBody = new AnimationLayer("upper-body-wave", { additive: true, weight: 0.65, mask: ["character.hand"] });
    upperBody.add(wave);
    mixer.addLayer(upperBody);
    let blendTreeWeight = 0.65;
    let debugStateMode: "auto" | "idle" | "walk" | "wave" = "auto";
    const eventLog: string[] = [];
    mixer.onEvent((event) => {
      const label = `${event.clipName}:${event.name}`;
      eventLog.push(label);
      if (eventLog.length > 8) eventLog.shift();
      const log = document.querySelector<HTMLElement>("[data-testid='animation-event-log']");
      if (log) log.textContent = eventLog.join("\n");
    });
    installAnimationControls(canvas, {
      onBlendWeight: (value) => {
        blendTreeWeight = value;
        upperBody.weight = value;
      },
      onDebugState: (value) => {
        debugStateMode = value;
      }
    });

    const skeleton = new Skeleton([
      new Bone({ name: "hips", parentIndex: -1, translation: [0, 0, 0] }),
      new Bone({ name: "hand", parentIndex: 0, translation: [0.45, 0.58, 0] }),
    ]);
    const palette = buildSkinningPalette(skeleton);
    const handTranslation: [number, number, number] = [palette.matrices[16 + 12] ?? 0, palette.matrices[16 + 13] ?? 0, palette.matrices[16 + 14] ?? 0];

    const machine = new AnimationStateMachine([
      {
        name: "idle",
        transitions: [{ to: "walk", label: "speed > 0.2", condition: (parameters) => Number(parameters.speed ?? 0) > 0.2 }],
      },
      {
        name: "walk",
        transitions: [
          { to: "wave", label: "wave requested", priority: 10, condition: (parameters) => parameters.wave === true },
          { to: "idle", label: "speed <= 0.2", condition: (parameters) => Number(parameters.speed ?? 0) <= 0.2 },
        ],
      },
      {
        name: "wave",
        transitions: [{ to: "walk", label: "wave released", exitTime: 0.25, condition: (parameters) => parameters.wave === false }],
      },
    ], "idle");
    machine.setParameter("speed", 1);
    machine.setParameter("wave", false);
    machine.update(0.016);

    let frame = 0;
    let latest = publishState("walk");

    return {
      metrics: () => ({
        state: latest.currentState,
        actions: latest.mixerActionCount,
        joints: latest.paletteJointCount,
        hipX: Number(latest.hipPosition[0].toFixed(3)),
        handY: Number(latest.handOffset[1].toFixed(3)),
      }),
      draw(context, canvas) {
        frame += 1;
        const phase = frame % 180;
        if (debugStateMode === "auto") {
          machine.setParameter("speed", phase < 150 ? 1 : 0);
          machine.setParameter("wave", phase >= 45 && phase < 105);
        } else {
          machine.setParameter("speed", debugStateMode === "idle" ? 0 : 1);
          machine.setParameter("wave", debugStateMode === "wave");
        }
        const stateName = machine.update(1 / 60);
        locomotion.setWeight(stateName === "idle" ? 0.2 : 1);
        wave.setWeight(stateName === "wave" ? blendTreeWeight : 0.15);
        mixer.update(1 / 60);
        latest = publishState(stateName);

        drawGrid(context, canvas, 60);
        drawCharacter(context, canvas, latest);
      },
    };

    function publishState(currentState: string): AnimatedCharacterExampleState {
      const hip = readVec3(values.get("character.hips.position"));
      const hand = readVec3(values.get("character.hand.offset"));
      const snapshot = mixer.snapshot();
      const state = {
        status: "ready" as const,
        clipNames: [locomotionClip.name, waveClip.name],
        currentState,
        stateTime: Number(machine.stateTime.toFixed(6)),
        hipPosition: hip,
        handOffset: hand,
        paletteJointCount: palette.jointCount,
        paletteHandTranslation: handTranslation,
        mixerActionCount: snapshot.actionCount,
        graph: machine.graphSnapshot(),
        blendTreeWeight: Number(blendTreeWeight.toFixed(3)),
        debugStateMode,
        eventLog: [...eventLog],
        latestEvent: eventLog[eventLog.length - 1],
      };
      window.__GALILEO3D_ANIMATED_CHARACTER_EXAMPLE__ = state;
      return state;
    }
  });
}

function createLocomotionClip(): AnimationClip {
  return new AnimationClip({
    name: "procedural-walk",
    duration: 1,
    tracks: [
      new AnimationTrack({
        target: "character.hips.position",
        valueType: "vector3",
        keyframes: [
          { time: 0, value: [-0.5, 0, 0] },
          { time: 0.5, value: [0.5, 0.08, 0] },
          { time: 1, value: [-0.5, 0, 0] },
        ],
      }),
    ],
    events: [{ name: "footstep", time: 0.5, payload: { foot: "left" } }],
  });
}

function createWaveClip(): AnimationClip {
  return new AnimationClip({
    name: "additive-hand-wave",
    duration: 0.75,
    tracks: [
      new AnimationTrack({
        target: "character.hand.offset",
        valueType: "vector3",
        keyframes: [
          { time: 0, value: [0.1, 0.12, 0] },
          { time: 0.25, value: [0.2, 0.34, 0] },
          { time: 0.5, value: [-0.06, 0.25, 0] },
          { time: 0.75, value: [0.1, 0.12, 0] },
        ],
      }),
    ],
    events: [{ name: "wave-apex", time: 0.25 }],
  });
}

function installAnimationControls(
  canvas: HTMLCanvasElement,
  handlers: {
    readonly onBlendWeight: (value: number) => void;
    readonly onDebugState: (value: "auto" | "idle" | "walk" | "wave") => void;
  }
): void {
  const panel = canvas.parentElement?.querySelector<HTMLElement>(".example-panel");
  if (!panel || panel.querySelector("[data-testid='animation-debug-controls']")) return;
  const controls = document.createElement("section");
  controls.dataset.testid = "animation-debug-controls";
  controls.innerHTML = `
    <label>
      <span>Blend</span>
      <input data-testid="blend-tree-weight" type="range" min="0" max="1" step="0.05" value="0.65" />
    </label>
    <label>
      <span>State</span>
      <select data-testid="state-debug-mode">
        <option value="auto">Auto</option>
        <option value="idle">Idle</option>
        <option value="walk">Walk</option>
        <option value="wave">Wave</option>
      </select>
    </label>
    <pre data-testid="animation-event-log">waiting for animation events</pre>
  `;
  controls.querySelector<HTMLInputElement>("[data-testid='blend-tree-weight']")?.addEventListener("input", (event) => {
    handlers.onBlendWeight(Number((event.currentTarget as HTMLInputElement).value));
  });
  controls.querySelector<HTMLSelectElement>("[data-testid='state-debug-mode']")?.addEventListener("change", (event) => {
    handlers.onDebugState((event.currentTarget as HTMLSelectElement).value as "auto" | "idle" | "walk" | "wave");
  });
  panel.append(controls);
}

function drawCharacter(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, state: AnimatedCharacterExampleState): void {
  const x = canvas.width * 0.5 + state.hipPosition[0] * 260;
  const y = canvas.height * 0.62 - state.hipPosition[1] * 220;
  const handX = x + 82 + state.handOffset[0] * 180;
  const handY = y - 138 - state.handOffset[1] * 170;

  context.save();
  context.lineCap = "round";
  context.lineWidth = 16;
  context.strokeStyle = "#56d6b1";
  context.beginPath();
  context.moveTo(x, y - 78);
  context.lineTo(handX, handY);
  context.stroke();

  context.lineWidth = 22;
  context.strokeStyle = "#d6e2e8";
  context.beginPath();
  context.moveTo(x, y - 32);
  context.lineTo(x, y - 112);
  context.stroke();

  context.fillStyle = "#f5c84b";
  context.beginPath();
  context.arc(x, y - 148, 34, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = state.currentState === "wave" ? "#ff8d63" : "#8bb5ff";
  context.lineWidth = 7;
  context.strokeRect(x - 54, y - 128, 108, 128);
  context.fillStyle = "#eaf2f7";
  context.font = "16px ui-sans-serif, system-ui, sans-serif";
  context.fillText(state.currentState, x - 28, y + 34);
  context.font = "14px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.fillText(`blend ${state.blendTreeWeight.toFixed(2)}`, x - 70, y + 58);
  if (state.latestEvent) {
    context.fillText(`event ${state.latestEvent}`, x - 110, y + 82);
  }
  context.restore();
}

function readVec3(value: AnimationValue | undefined): readonly [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) {
    return [0, 0, 0];
  }
  return [value[0] as number, value[1] as number, value[2] as number];
}
