import { ValidationError } from "@galileo3d/core";
import { type System, type SystemContext, type SystemPhase } from "./System.js";
import { type World } from "./World.js";

const phaseOrder: SystemPhase[] = ["fixed", "update", "late"];

export class SystemScheduler {
  private readonly systems = new Map<string, System>();

  add(system: System, world?: World): void {
    if (this.systems.has(system.name)) throw new ValidationError("DUPLICATE_SYSTEM", `Duplicate system name: ${system.name}`);
    this.systems.set(system.name, system);
    system.onAdd?.(world as World);
  }

  remove(name: string, world?: World): boolean {
    const system = this.systems.get(name);
    if (!system) return false;
    system.onRemove?.(world as World);
    return this.systems.delete(name);
  }

  order(phase?: SystemPhase): System[] {
    const systems = [...this.systems.values()].filter((system) => (system.phase ?? "update") === (phase ?? system.phase ?? "update"));
    return sortSystems(systems);
  }

  update(world: World, context: SystemContext): void {
    for (const phase of phaseOrder) {
      for (const system of this.order(phase)) system.update(world, context);
    }
  }
}

function sortSystems(systems: System[]): System[] {
  const byName = new Map(systems.map((system) => [system.name, system]));
  const graph = new Map<string, Set<string>>();
  const indegree = new Map<string, number>();
  const insertion = new Map(systems.map((system, index) => [system.name, index]));
  for (const system of systems) {
    graph.set(system.name, new Set());
    indegree.set(system.name, 0);
  }
  for (const system of systems) {
    for (const dependency of system.after ?? []) addEdge(dependency, system.name);
    for (const dependent of system.before ?? []) addEdge(system.name, dependent);
  }
  const ready = systems
    .filter((system) => indegree.get(system.name) === 0)
    .sort(compareSystems);
  const result: System[] = [];
  while (ready.length > 0) {
    const system = ready.shift() as System;
    result.push(system);
    for (const dependent of graph.get(system.name) ?? []) {
      indegree.set(dependent, (indegree.get(dependent) ?? 0) - 1);
      if (indegree.get(dependent) === 0) {
        ready.push(byName.get(dependent) as System);
        ready.sort(compareSystems);
      }
    }
  }
  if (result.length !== systems.length) throw new ValidationError("ECS_SYSTEM_CYCLE", "ECS system dependency cycle rejected.");
  return result;

  function addEdge(from: string, to: string): void {
    if (!byName.has(from)) throw new ValidationError("MISSING_ECS_SYSTEM_DEPENDENCY", `Missing ECS system dependency: ${from}`);
    if (!byName.has(to)) throw new ValidationError("MISSING_ECS_SYSTEM_DEPENDENCY", `Missing ECS system dependency: ${to}`);
    const edges = graph.get(from) as Set<string>;
    if (!edges.has(to)) {
      edges.add(to);
      indegree.set(to, (indegree.get(to) ?? 0) + 1);
    }
  }

  function compareSystems(a: System, b: System): number {
    return (a.priority ?? 0) - (b.priority ?? 0) || (insertion.get(a.name) ?? 0) - (insertion.get(b.name) ?? 0);
  }
}
