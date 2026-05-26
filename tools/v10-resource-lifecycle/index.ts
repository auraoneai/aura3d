import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { DisposableStack, ResourceScope } from "../../packages/core/src/index.js";
import { ResourceTracker } from "../../packages/debug/src/index.js";

const outputPath = "tests/reports/v10/resource-lifecycle-100-reloads.json";

interface LifecycleReport {
  readonly schema: "a3d-v10-resource-lifecycle-100-reloads/v1";
  readonly generatedAt: string;
  readonly pass: boolean;
  readonly reloads: number;
  readonly trackedResources: number;
  readonly disposedResources: number;
  readonly leakedResources: number;
  readonly maxScopeResourceCountBeforeDispose: number;
  readonly assertions: {
    readonly resourceTrackerNoLeaks: boolean;
    readonly disposableStackDisposedOnce: boolean;
    readonly nestedScopesDisposed: boolean;
    readonly lateUseRejected: boolean;
  };
  readonly issues: readonly string[];
}

async function runLifecycleEvidence(reloads = 100): Promise<LifecycleReport> {
  const tracker = new ResourceTracker();
  let disposeCalls = 0;
  let lateUseRejected = false;
  let maxScopeResourceCountBeforeDispose = 0;

  for (let reload = 0; reload < reloads; reload += 1) {
    const stack = new DisposableStack();
    const scope = new ResourceScope(`reload-${reload}`);
    const child = scope.createChild("gpu-view");
    for (const type of ["buffer", "texture", "program", "render-target"]) {
      const id = `${type}:${reload}`;
      tracker.track(id, type);
      child.use({
        dispose: () => {
          disposeCalls += 1;
          tracker.dispose(id);
        }
      });
    }
    stack.use(scope);
    maxScopeResourceCountBeforeDispose = Math.max(maxScopeResourceCountBeforeDispose, scope.leakSnapshot().childScopes[0]?.resourceCount ?? 0);
    await stack.dispose();
    await stack.dispose();
    try {
      scope.use({ dispose: () => {} });
    } catch {
      lateUseRejected = true;
    }
  }

  const leakReport = tracker.report();
  const assertions = {
    resourceTrackerNoLeaks: leakReport.leaked === 0,
    disposableStackDisposedOnce: disposeCalls === reloads * 4,
    nestedScopesDisposed: maxScopeResourceCountBeforeDispose === 4,
    lateUseRejected
  };
  const issues = [
    ...(assertions.resourceTrackerNoLeaks ? [] : [`${leakReport.leaked} tracked resources leaked.`]),
    ...(assertions.disposableStackDisposedOnce ? [] : [`Expected ${reloads * 4} dispose calls, got ${disposeCalls}.`]),
    ...(assertions.nestedScopesDisposed ? [] : ["Nested scope resource accounting did not observe the expected resources."]),
    ...(assertions.lateUseRejected ? [] : ["Disposed scope accepted a late resource."])
  ];
  return {
    schema: "a3d-v10-resource-lifecycle-100-reloads/v1",
    generatedAt: new Date().toISOString(),
    pass: issues.length === 0,
    reloads,
    trackedResources: leakReport.total,
    disposedResources: leakReport.total - leakReport.leaked,
    leakedResources: leakReport.leaked,
    maxScopeResourceCountBeforeDispose,
    assertions,
    issues
  };
}

const report = await runLifecycleEvidence();
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  pass: report.pass,
  reloads: report.reloads,
  trackedResources: report.trackedResources,
  leakedResources: report.leakedResources,
  issues: report.issues
}, null, 2));
if (!report.pass) process.exitCode = 1;
