import { ValidationError } from "./Errors.js";

export const SystemPhase = Object.freeze({
  Platform: "platform",
  Tasks: "tasks",
  Fixed: "fixed",
  Update: "update",
  Scene: "scene",
  Render: "render",
  Present: "present",
  Cleanup: "cleanup"
});

export type SystemPhase = (typeof SystemPhase)[keyof typeof SystemPhase];

export interface SchedulerContext {
  readonly phase: SystemPhase;
  readonly fixedStepIndex?: number;
}

export interface ScheduledTask {
  readonly id: string;
  readonly phase: SystemPhase;
  readonly dependsOn?: readonly string[];
  readonly enabled?: boolean;
  run(context: SchedulerContext): void | Promise<void>;
}

const phaseOrder = Object.values(SystemPhase);

export class Scheduler {
  private readonly tasks = new Map<string, ScheduledTask>();

  add(task: ScheduledTask): void {
    if (this.tasks.has(task.id)) throw new ValidationError("DUPLICATE_TASK", `Task ${task.id} already exists.`);
    this.tasks.set(task.id, task);
  }

  remove(id: string): void {
    this.tasks.delete(id);
  }

  getExecutionPlan(): readonly ScheduledTask[] {
    const ordered: ScheduledTask[] = [];
    const byPhase = new Map<SystemPhase, ScheduledTask[]>();
    for (const task of this.tasks.values()) {
      if (task.enabled === false) continue;
      const list = byPhase.get(task.phase) ?? [];
      list.push(task);
      byPhase.set(task.phase, list);
    }

    for (const phase of phaseOrder) {
      ordered.push(...this.sortPhase(byPhase.get(phase) ?? []));
    }
    return Object.freeze(ordered);
  }

  async runPhase(phase: SystemPhase, fixedStepIndex?: number): Promise<void> {
    for (const task of this.getExecutionPlan()) {
      if (task.phase === phase) {
        const context: SchedulerContext = fixedStepIndex === undefined ? { phase } : { phase, fixedStepIndex };
        await task.run(context);
      }
    }
  }

  private sortPhase(tasks: readonly ScheduledTask[]): ScheduledTask[] {
    const taskIds = new Set(tasks.map((task) => task.id));
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const output: ScheduledTask[] = [];
    const taskById = new Map(tasks.map((task) => [task.id, task]));

    const visit = (task: ScheduledTask): void => {
      if (visited.has(task.id)) return;
      if (visiting.has(task.id)) throw new ValidationError("TASK_CYCLE", `Scheduler cycle includes ${task.id}.`);
      visiting.add(task.id);
      for (const dependency of task.dependsOn ?? []) {
        const dep = this.tasks.get(dependency);
        if (!dep || dep.enabled === false) throw new ValidationError("MISSING_DEPENDENCY", `Task ${task.id} depends on missing task ${dependency}.`);
        if (dep.phase !== task.phase) throw new ValidationError("CROSS_PHASE_DEPENDENCY", `Task ${task.id} depends on ${dependency} in a different phase.`);
        if (!taskIds.has(dependency)) throw new ValidationError("MISSING_DEPENDENCY", `Task ${task.id} depends on missing phase peer ${dependency}.`);
        visit(taskById.get(dependency)!);
      }
      visiting.delete(task.id);
      visited.add(task.id);
      output.push(task);
    };

    for (const task of tasks) visit(task);
    return output;
  }
}
