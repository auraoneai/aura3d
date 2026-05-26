export interface ResourceBudget {
  readonly textureBudgetBytes: number;
  readonly geometryBudgetBytes: number;
  readonly drawCallBudget: number;
}

export interface ResourceBudgetUsage {
  readonly textureBytes: number;
  readonly geometryBytes: number;
  readonly drawCalls: number;
}

export interface ResourceBudgetReport {
  readonly withinBudget: boolean;
  readonly texturePercent: number;
  readonly geometryPercent: number;
  readonly drawCallPercent: number;
  readonly warnings: readonly string[];
}

export function evaluateResourceBudget(
  budget: ResourceBudget,
  usage: ResourceBudgetUsage
): ResourceBudgetReport {
  const texturePercent = ratio(usage.textureBytes, budget.textureBudgetBytes);
  const geometryPercent = ratio(usage.geometryBytes, budget.geometryBudgetBytes);
  const drawCallPercent = ratio(usage.drawCalls, budget.drawCallBudget);
  const warnings = [
    ...(texturePercent > 1 ? ["texture-budget-exceeded"] : texturePercent > 0.8 ? ["texture-budget-near-limit"] : []),
    ...(geometryPercent > 1 ? ["geometry-budget-exceeded"] : geometryPercent > 0.8 ? ["geometry-budget-near-limit"] : []),
    ...(drawCallPercent > 1 ? ["draw-call-budget-exceeded"] : drawCallPercent > 0.8 ? ["draw-call-budget-near-limit"] : [])
  ];
  return {
    withinBudget: warnings.every((warning) => !warning.endsWith("exceeded")),
    texturePercent,
    geometryPercent,
    drawCallPercent,
    warnings
  };
}

function ratio(value: number, budget: number): number {
  return budget <= 0 ? Number.POSITIVE_INFINITY : Math.max(0, value) / budget;
}
