import type { Blackboard } from "./BehaviorTree";

export type UtilityCurve = "linear" | "inverse" | "quadratic" | "cubic" | "boolean" | "logistic";
export type UtilityScoring = "multiply" | "average" | "min" | "max" | "sum";

export interface UtilityContext {
  readonly blackboard?: Blackboard;
  readonly values?: Record<string, number | boolean | string | undefined>;
}

export interface UtilityConsiderationOptions {
  readonly name: string;
  readonly input: (context: UtilityContext) => number | boolean;
  readonly curve?: UtilityCurve;
  readonly weight?: number;
  readonly threshold?: number;
  readonly slope?: number;
}

export interface UtilityActionOptions {
  readonly name: string;
  readonly considerations: readonly UtilityConsideration[];
  readonly scoring?: UtilityScoring;
  readonly baseScore?: number;
  readonly enabled?: boolean;
}

export interface UtilityActionScore {
  readonly action: string;
  readonly score: number;
  readonly considerationScores: Record<string, number>;
}

export class UtilityConsideration {
  readonly name: string;
  readonly curve: UtilityCurve;
  readonly weight: number;
  readonly threshold: number;
  readonly slope: number;
  private readonly input: (context: UtilityContext) => number | boolean;

  constructor(options: UtilityConsiderationOptions) {
    this.name = options.name;
    this.input = options.input;
    this.curve = options.curve ?? "linear";
    this.weight = options.weight ?? 1;
    this.threshold = options.threshold ?? 0.5;
    this.slope = options.slope ?? 10;
  }

  evaluate(context: UtilityContext): number {
    const raw = this.input(context);
    const value = typeof raw === "boolean" ? (raw ? 1 : 0) : clamp01(raw);
    return round3(clamp01(applyCurve(value, this.curve, this.threshold, this.slope) * this.weight));
  }
}

export class UtilityAction {
  readonly name: string;
  readonly considerations: readonly UtilityConsideration[];
  readonly scoring: UtilityScoring;
  readonly baseScore: number;
  enabled: boolean;

  constructor(options: UtilityActionOptions) {
    this.name = options.name;
    this.considerations = options.considerations;
    this.scoring = options.scoring ?? "multiply";
    this.baseScore = options.baseScore ?? 0;
    this.enabled = options.enabled ?? true;
  }

  score(context: UtilityContext): UtilityActionScore {
    const considerationScores = Object.fromEntries(this.considerations.map((consideration) => [consideration.name, consideration.evaluate(context)]));
    const values = Object.values(considerationScores);
    const combined = values.length === 0 ? 0 : combineScores(values, this.scoring);
    return {
      action: this.name,
      score: round3(clamp01(combined + this.baseScore)),
      considerationScores
    };
  }
}

export class UtilityAI {
  private readonly actions: UtilityAction[] = [];

  addAction(action: UtilityAction): void {
    if (this.actions.some((entry) => entry.name === action.name)) {
      throw new Error(`Utility action already registered: ${action.name}`);
    }
    this.actions.push(action);
  }

  removeAction(name: string): boolean {
    const index = this.actions.findIndex((action) => action.name === name);
    if (index < 0) return false;
    this.actions.splice(index, 1);
    return true;
  }

  setActionEnabled(name: string, enabled: boolean): void {
    const action = this.actions.find((entry) => entry.name === name);
    if (!action) throw new Error(`Utility action is not registered: ${name}`);
    action.enabled = enabled;
  }

  evaluate(context: UtilityContext): readonly UtilityActionScore[] {
    return this.actions
      .filter((action) => action.enabled)
      .map((action) => action.score(context))
      .sort((left, right) => right.score - left.score || left.action.localeCompare(right.action));
  }

  select(context: UtilityContext): UtilityActionScore | undefined {
    return this.evaluate(context)[0];
  }
}

function combineScores(values: readonly number[], scoring: UtilityScoring): number {
  switch (scoring) {
    case "average":
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    case "min":
      return Math.min(...values);
    case "max":
      return Math.max(...values);
    case "sum":
      return Math.min(1, values.reduce((sum, value) => sum + value, 0));
    case "multiply":
      return values.reduce((product, value) => product * value, 1);
  }
}

function applyCurve(value: number, curve: UtilityCurve, threshold: number, slope: number): number {
  switch (curve) {
    case "inverse":
      return 1 - value;
    case "quadratic":
      return value * value;
    case "cubic":
      return value * value * value;
    case "boolean":
      return value >= threshold ? 1 : 0;
    case "logistic":
      return 1 / (1 + Math.exp(-slope * (value - threshold)));
    case "linear":
      return value;
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function round3(value: number): number {
  return Number(value.toFixed(3));
}
