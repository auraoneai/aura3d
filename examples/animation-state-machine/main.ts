import { AnimationStateMachine, type AnimationStateMachineGraphSnapshot } from "@galileo3d/animation";
import { createExample, drawGrid, installExampleStyles, type ExampleMetadata } from "../shared/exampleHarness.js";

interface AnimationStateMachineExampleState {
  readonly status: "ready" | "error";
  readonly currentState: string;
  readonly graph: AnimationStateMachineGraphSnapshot;
  readonly debugGraph: string;
  readonly visited: readonly string[];
  readonly transitionCount: number;
  readonly error?: string;
}

declare global {
  interface Window {
    __GALILEO3D_ANIMATION_STATE_MACHINE_EXAMPLE__?: AnimationStateMachineExampleState;
  }
}

const metadata: ExampleMetadata = {
  id: "animation-state-machine",
  title: "Animation State Machine",
  purpose: "Visualize AnimationStateMachine transitions and graph debug output.",
  acceptance: "Idle, walk, jump, and land states are reached through parameter-driven transitions.",
};

if (typeof document !== "undefined") {
  installExampleStyles();
  void createExample(metadata, () => {
    const machine = new AnimationStateMachine([
      {
        name: "idle",
        transitions: [{ to: "walk", label: "speed", condition: (parameters) => Number(parameters.speed ?? 0) > 0.25 }],
      },
      {
        name: "walk",
        transitions: [
          { to: "jump", label: "jump", priority: 20, condition: (parameters) => parameters.jump === true },
          { to: "idle", label: "stop", condition: (parameters) => Number(parameters.speed ?? 0) <= 0.25 },
        ],
      },
      {
        name: "jump",
        transitions: [{ to: "land", label: "exit 0.18", exitTime: 0.18, condition: () => true }],
      },
      {
        name: "land",
        transitions: [{ to: "walk", label: "grounded", exitTime: 0.12, condition: (parameters) => parameters.grounded === true }],
      },
    ], "idle");
    machine.setParameter("speed", 0);
    machine.setParameter("jump", false);
    machine.setParameter("grounded", true);

    const visited: string[] = [machine.currentState];
    let frame = 0;
    let latest = publishState(machine);

    return {
      metrics: () => ({
        state: latest.currentState,
        states: latest.graph.states.length,
        transitions: latest.transitionCount,
        visited: latest.visited.join(">"),
      }),
      draw(context, canvas) {
        frame += 1;
        const phase = frame % 180;
        machine.setParameter("speed", phase >= 20 && phase < 165 ? 1 : 0);
        machine.setParameter("jump", phase >= 58 && phase < 62);
        machine.setParameter("grounded", phase < 78 || phase > 90);
        const current = machine.update(1 / 60);
        if (visited[visited.length - 1] !== current) {
          visited.push(current);
        }
        latest = publishState(machine);

        drawGrid(context, canvas, 64);
        drawGraph(context, canvas, latest);
      },
    };

    function publishState(stateMachine: AnimationStateMachine): AnimationStateMachineExampleState {
      const graph = stateMachine.graphSnapshot();
      const state = {
        status: "ready" as const,
        currentState: graph.currentState,
        graph,
        debugGraph: stateMachine.debugGraph(),
        visited: [...visited],
        transitionCount: graph.transitions.length,
      };
      window.__GALILEO3D_ANIMATION_STATE_MACHINE_EXAMPLE__ = state;
      return state;
    }
  });
}

function drawGraph(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, state: AnimationStateMachineExampleState): void {
  const positions = new Map<string, { x: number; y: number }>([
    ["idle", { x: canvas.width * 0.25, y: canvas.height * 0.62 }],
    ["walk", { x: canvas.width * 0.5, y: canvas.height * 0.42 }],
    ["jump", { x: canvas.width * 0.74, y: canvas.height * 0.28 }],
    ["land", { x: canvas.width * 0.72, y: canvas.height * 0.66 }],
  ]);

  context.save();
  context.lineWidth = 4;
  context.strokeStyle = "#49606e";
  for (const transition of state.graph.transitions) {
    const from = positions.get(transition.from);
    const to = positions.get(transition.to);
    if (!from || !to) continue;
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  }

  for (const graphState of state.graph.states) {
    const position = positions.get(graphState.name);
    if (!position) continue;
    context.fillStyle = graphState.current ? "#ff8d63" : "#17222a";
    context.strokeStyle = graphState.current ? "#ffd0bd" : "#7e95a4";
    context.lineWidth = graphState.current ? 6 : 3;
    context.beginPath();
    context.roundRect(position.x - 70, position.y - 34, 140, 68, 8);
    context.fill();
    context.stroke();
    context.fillStyle = "#eef4f8";
    context.font = "18px ui-sans-serif, system-ui, sans-serif";
    context.textAlign = "center";
    context.fillText(graphState.name, position.x, position.y + 6);
  }

  context.textAlign = "left";
  context.fillStyle = "#d8e4ea";
  context.font = "15px ui-monospace, SFMono-Regular, Menlo, monospace";
  const lines = state.debugGraph.split("\n").slice(0, 8);
  lines.forEach((line, index) => context.fillText(line, 28, 38 + index * 22));
  context.restore();
}
