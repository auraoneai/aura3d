/**
 * Scenario registry — the names the browser specs pass to
 * `window.__AURA3D_PRD08_HARNESS__.run(name, opts)` and the unit mirror calls
 * directly.
 */
import { feelAccounting, hitStopGlobal, hitStopScoped, shakeImpulse, type ScenarioContext } from "./scenarios-feel";
import { chaseFraming, driftScript, orbitWall, railLap } from "./scenarios-motion";

export type { ScenarioContext };

// Each scenario validates its own opts shape.
type Scenario = (ctx: ScenarioContext, opts: any) => unknown;

export const SCENARIOS: Readonly<Record<string, Scenario>> = {
  "hit-stop-global": hitStopGlobal,
  "hit-stop-scoped": hitStopScoped,
  "shake-impulse": shakeImpulse,
  "feel-accounting": feelAccounting,
  "chase-framing": chaseFraming,
  "orbit-wall": orbitWall,
  "rail-lap": railLap,
  "drift-script": driftScript
};

export function runScenario(ctx: ScenarioContext, name: string, opts: unknown): unknown {
  const scenario = SCENARIOS[name];
  if (!scenario) throw new Error(`unknown prd08 scenario ${name}`);
  return scenario(ctx, opts ?? {});
}
