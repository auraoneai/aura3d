import { arriveSteering, type SteeringPoint, type SteeringVector } from "./Steering";

export type CrowdFormationType = "line" | "wedge" | "column" | "circle";

export interface CrowdAgentOptions {
  readonly id: string;
  readonly position: SteeringPoint;
  readonly velocity?: SteeringVector;
  readonly radius?: number;
  readonly maxSpeed?: number;
  readonly priority?: number;
}

export interface CrowdSimulationOptions {
  readonly neighborRadius?: number;
  readonly maxNeighbors?: number;
  readonly separationWeight?: number;
  readonly alignmentWeight?: number;
  readonly cohesionWeight?: number;
  readonly formationWeight?: number;
  readonly maxForce?: number;
}

export interface CrowdFormationOptions {
  readonly type: CrowdFormationType;
  readonly center: SteeringPoint;
  readonly forward?: SteeringVector;
  readonly spacing?: number;
}

export interface CrowdAgentSnapshot {
  readonly id: string;
  readonly position: SteeringPoint;
  readonly velocity: SteeringVector;
  readonly speed: number;
  readonly neighborCount: number;
  readonly formationSlot: SteeringPoint;
}

export interface CrowdSimulationSnapshot {
  readonly agentCount: number;
  readonly neighborPairs: number;
  readonly averageNeighbors: number;
  readonly averageSpeed: number;
  readonly maxSpeed: number;
  readonly formationType: CrowdFormationType | "none";
  readonly center: SteeringPoint;
  readonly agents: readonly CrowdAgentSnapshot[];
}

type CrowdAgentState = {
  readonly id: string;
  position: SteeringPoint;
  velocity: SteeringVector;
  readonly radius: number;
  readonly maxSpeed: number;
  readonly priority: number;
};

export class CrowdSimulation {
  private readonly agents: CrowdAgentState[] = [];
  private readonly neighborRadius: number;
  private readonly maxNeighbors: number;
  private readonly separationWeight: number;
  private readonly alignmentWeight: number;
  private readonly cohesionWeight: number;
  private readonly formationWeight: number;
  private readonly maxForce: number;
  private formation: CrowdFormationOptions | undefined;
  private lastNeighbors = new Map<string, readonly CrowdAgentState[]>();
  private lastSlots = new Map<string, SteeringPoint>();

  constructor(options: CrowdSimulationOptions = {}) {
    this.neighborRadius = positive(options.neighborRadius ?? 0.55, "neighborRadius");
    this.maxNeighbors = Math.max(1, Math.floor(options.maxNeighbors ?? 6));
    this.separationWeight = nonNegative(options.separationWeight ?? 1.8, "separationWeight");
    this.alignmentWeight = nonNegative(options.alignmentWeight ?? 0.55, "alignmentWeight");
    this.cohesionWeight = nonNegative(options.cohesionWeight ?? 0.42, "cohesionWeight");
    this.formationWeight = nonNegative(options.formationWeight ?? 0.85, "formationWeight");
    this.maxForce = positive(options.maxForce ?? 1.2, "maxForce");
  }

  addAgent(options: CrowdAgentOptions): void {
    if (this.agents.some((agent) => agent.id === options.id)) throw new Error(`Crowd agent already exists: ${options.id}`);
    this.agents.push({
      id: options.id,
      position: options.position,
      velocity: options.velocity ?? [0, 0],
      radius: positive(options.radius ?? 0.1, "radius"),
      maxSpeed: positive(options.maxSpeed ?? 0.65, "maxSpeed"),
      priority: nonNegative(options.priority ?? 50, "priority")
    });
  }

  removeAgent(id: string): boolean {
    const index = this.agents.findIndex((agent) => agent.id === id);
    if (index < 0) return false;
    this.agents.splice(index, 1);
    this.lastNeighbors.delete(id);
    this.lastSlots.delete(id);
    return true;
  }

  setFormation(options: CrowdFormationOptions | undefined): void {
    this.formation = options;
  }

  update(deltaSeconds: number): CrowdSimulationSnapshot {
    const dt = Math.max(0, deltaSeconds);
    const neighborsById = new Map(this.agents.map((agent) => [agent.id, this.neighborsFor(agent)]));
    const slots = formationSlots(this.agents.length, this.formation);
    this.lastNeighbors = neighborsById;
    this.lastSlots = new Map(this.agents.map((agent, index) => [agent.id, slots[index] ?? agent.position]));

    for (let index = 0; index < this.agents.length; index += 1) {
      const agent = this.agents[index]!;
      const neighbors = neighborsById.get(agent.id) ?? [];
      const slot = slots[index] ?? agent.position;
      const force = clampMagnitude(addMany([
        scale(separationForce(agent, neighbors), this.separationWeight),
        scale(alignmentForce(agent, neighbors), this.alignmentWeight),
        scale(cohesionForce(agent, neighbors), this.cohesionWeight),
        scale(formationForce(agent, slot), this.formationWeight)
      ]), this.maxForce);
      const priorityDamping = Math.max(0.35, Math.min(1, agent.priority / 100));
      const velocity = clampMagnitude([
        agent.velocity[0] + force[0] * dt * priorityDamping,
        agent.velocity[1] + force[1] * dt * priorityDamping
      ], agent.maxSpeed);
      agent.velocity = velocity;
      agent.position = [
        round3(agent.position[0] + velocity[0] * dt),
        round3(agent.position[1] + velocity[1] * dt)
      ];
    }

    return this.snapshot();
  }

  snapshot(): CrowdSimulationSnapshot {
    const agentSnapshots = this.agents.map((agent) => {
      const neighbors = this.lastNeighbors.get(agent.id) ?? [];
      return {
        id: agent.id,
        position: [round3(agent.position[0]), round3(agent.position[1])] as const,
        velocity: [round3(agent.velocity[0]), round3(agent.velocity[1])] as const,
        speed: round3(length(agent.velocity)),
        neighborCount: neighbors.length,
        formationSlot: this.lastSlots.get(agent.id) ?? agent.position
      };
    });
    const neighborPairs = agentSnapshots.reduce((sum, agent) => sum + agent.neighborCount, 0) / 2;
    const averageSpeed = agentSnapshots.length > 0
      ? agentSnapshots.reduce((sum, agent) => sum + agent.speed, 0) / agentSnapshots.length
      : 0;
    return {
      agentCount: agentSnapshots.length,
      neighborPairs: round3(neighborPairs),
      averageNeighbors: agentSnapshots.length > 0 ? round3((neighborPairs * 2) / agentSnapshots.length) : 0,
      averageSpeed: round3(averageSpeed),
      maxSpeed: round3(Math.max(0, ...agentSnapshots.map((agent) => agent.speed))),
      formationType: this.formation?.type ?? "none",
      center: centerOf(agentSnapshots.map((agent) => agent.position)),
      agents: agentSnapshots
    };
  }

  private neighborsFor(agent: CrowdAgentState): readonly CrowdAgentState[] {
    return this.agents
      .filter((candidate) => candidate !== agent && distance(agent.position, candidate.position) <= this.neighborRadius)
      .sort((left, right) => distance(agent.position, left.position) - distance(agent.position, right.position) || left.id.localeCompare(right.id))
      .slice(0, this.maxNeighbors);
  }
}

function separationForce(agent: CrowdAgentState, neighbors: readonly CrowdAgentState[]): SteeringVector {
  const contributions = neighbors.map((neighbor) => {
    const away = subtract(agent.position, neighbor.position);
    const gap = Math.max(0.001, length(away) - agent.radius - neighbor.radius);
    return scale(normalize(away), 1 / gap);
  });
  return normalize(addMany(contributions));
}

function alignmentForce(agent: CrowdAgentState, neighbors: readonly CrowdAgentState[]): SteeringVector {
  if (neighbors.length === 0) return [0, 0];
  const average = scale(addMany(neighbors.map((neighbor) => neighbor.velocity)), 1 / neighbors.length);
  return subtract(clampMagnitude(average, agent.maxSpeed), agent.velocity);
}

function cohesionForce(agent: CrowdAgentState, neighbors: readonly CrowdAgentState[]): SteeringVector {
  if (neighbors.length === 0) return [0, 0];
  const center = centerOf(neighbors.map((neighbor) => neighbor.position));
  return arriveSteering({ position: agent.position, velocity: agent.velocity, target: center, maxSpeed: agent.maxSpeed, slowingRadius: 0.45 }).force;
}

function formationForce(agent: CrowdAgentState, slot: SteeringPoint): SteeringVector {
  return arriveSteering({ position: agent.position, velocity: agent.velocity, target: slot, maxSpeed: agent.maxSpeed, slowingRadius: 0.35, tolerance: 0.025 }).force;
}

function formationSlots(count: number, formation: CrowdFormationOptions | undefined): readonly SteeringPoint[] {
  if (!formation) return [];
  const spacing = formation.spacing ?? 0.24;
  const forward = normalize(formation.forward ?? [1, 0]);
  const right: SteeringVector = [forward[1], -forward[0]];
  return Array.from({ length: count }, (_, index) => {
    switch (formation.type) {
      case "line":
        return offset(formation.center, right, (index - (count - 1) / 2) * spacing);
      case "column":
        return offset(formation.center, forward, -index * spacing);
      case "circle": {
        const angle = (Math.PI * 2 * index) / Math.max(1, count);
        return [round3(formation.center[0] + Math.cos(angle) * spacing), round3(formation.center[1] + Math.sin(angle) * spacing)];
      }
      case "wedge": {
        if (index === 0) return formation.center;
        const side = index % 2 === 0 ? 1 : -1;
        const row = Math.ceil(index / 2);
        return add(offset(formation.center, forward, -row * spacing), scale(right, side * row * spacing));
      }
    }
  });
}

function offset(origin: SteeringPoint, direction: SteeringVector, amount: number): SteeringPoint {
  return [round3(origin[0] + direction[0] * amount), round3(origin[1] + direction[1] * amount)];
}

function add(left: SteeringPoint, right: SteeringVector): SteeringPoint {
  return [round3(left[0] + right[0]), round3(left[1] + right[1])];
}

function subtract(left: SteeringPoint, right: SteeringPoint): SteeringVector {
  return [left[0] - right[0], left[1] - right[1]];
}

function scale(value: SteeringVector, scalar: number): SteeringVector {
  return [value[0] * scalar, value[1] * scalar];
}

function addMany(values: readonly SteeringVector[]): SteeringVector {
  return values.reduce<SteeringVector>((sum, value) => [sum[0] + value[0], sum[1] + value[1]], [0, 0]);
}

function distance(left: SteeringPoint, right: SteeringPoint): number {
  return length(subtract(left, right));
}

function length(value: SteeringVector): number {
  return Math.hypot(value[0], value[1]);
}

function normalize(value: SteeringVector): SteeringVector {
  const magnitude = length(value);
  return magnitude === 0 ? [0, 0] : [value[0] / magnitude, value[1] / magnitude];
}

function clampMagnitude(value: SteeringVector, maxMagnitude: number): SteeringVector {
  const magnitude = length(value);
  if (magnitude === 0 || magnitude <= maxMagnitude) return value;
  return scale(value, maxMagnitude / magnitude);
}

function centerOf(points: readonly SteeringPoint[]): SteeringPoint {
  if (points.length === 0) return [0, 0];
  const sum = points.reduce<SteeringVector>((total, point) => [total[0] + point[0], total[1] + point[1]], [0, 0]);
  return [round3(sum[0] / points.length), round3(sum[1] / points.length)];
}

function positive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`Crowd ${name} must be a finite positive number.`);
  return value;
}

function nonNegative(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`Crowd ${name} must be a finite non-negative number.`);
  return value;
}

function round3(value: number): number {
  return Number(value.toFixed(3));
}
