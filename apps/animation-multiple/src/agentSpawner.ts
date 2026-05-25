export interface Agent {
  id: number;
  lane: number;
  offset: number;
  baseX: number;
  baseZ: number;
  colorSeed: number;
  scale: number;
}

export interface AgentSpawnerState {
  count: number;
  speed: number;
  spread: number;
  paused: boolean;
}

export interface AgentPose {
  agent: Agent;
  x: number;
  y: number;
  z: number;
  stride: number;
  armSwing: number;
  legSwing: number;
}

export function createAgentSpawnerState(): AgentSpawnerState {
  return {
    count: 3,
    speed: 1,
    spread: 1,
    paused: false
  };
}

export function spawnAgents(count: number): readonly Agent[] {
  const agents: Agent[] = [];
  for (let index = 0; index < count; index += 1) {
    const column = index - 1;
    agents.push({
      id: index + 1,
      lane: 0,
      offset: index * 0.17,
      baseX: column * 1.48,
      baseZ: 0,
      colorSeed: (index * 47) % 360,
      scale: 1
    });
  }
  return agents;
}

export function sampleAgentPoses(agents: readonly Agent[], state: AgentSpawnerState, timeSeconds: number): readonly AgentPose[] {
  const t = state.paused ? 0 : timeSeconds * state.speed;
  return agents.slice(0, state.count).map((agent) => {
    const phase = t * (1.35 + agent.lane * 0.08) + agent.offset;
    const stride = Math.sin(phase * Math.PI * 2);
    const bob = Math.max(0, Math.sin(phase * Math.PI * 4)) * 0.045;
    return {
      agent,
      x: agent.baseX * state.spread,
      y: bob,
      z: agent.baseZ * state.spread,
      stride,
      armSwing: -stride * 0.46,
      legSwing: stride * 0.52
    };
  });
}

export function agentColor(seed: number): readonly [number, number, number, number] {
  const hue = seed / 360;
  const [r, g, b] = hslToRgb(hue, 0.48, 0.54);
  return [r, g, b, 1];
}

function hslToRgb(h: number, s: number, l: number): readonly [number, number, number] {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hueToRgb(p, q, h + 1 / 3), hueToRgb(p, q, h), hueToRgb(p, q, h - 1 / 3)];
}

function hueToRgb(p: number, q: number, t: number): number {
  let value = t;
  if (value < 0) value += 1;
  if (value > 1) value -= 1;
  if (value < 1 / 6) return p + (q - p) * 6 * value;
  if (value < 1 / 2) return q;
  if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
  return p;
}
