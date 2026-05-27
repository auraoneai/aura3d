import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const WEBGPU_ROUTE_HEALTH_REPORT = "tests/reports/webgpu-route-health.json";
const CURRENT_ROUTE_HEALTH_REPORT = "tests/reports/current-routes-route-health.json";

export interface WebGPURouteHealthReport {
  readonly schema: "a3d-webgpu-route-health";
  readonly generatedAt: string;
  readonly pass: boolean;
  readonly sourceReport: string;
  readonly routeCount: number;
  readonly routes: readonly unknown[];
  readonly failures: readonly string[];
}

export function createWebGPURouteHealthReport(): WebGPURouteHealthReport {
  const failures: string[] = [];
  if (!existsSync(resolve(CURRENT_ROUTE_HEALTH_REPORT))) {
    failures.push(`Missing ${CURRENT_ROUTE_HEALTH_REPORT}; run current route health first.`);
    return report([], failures);
  }
  const current = JSON.parse(readFileSync(resolve(CURRENT_ROUTE_HEALTH_REPORT), "utf8")) as {
    readonly routes?: readonly Record<string, unknown>[];
  };
  const routes = (current.routes ?? []).filter((route) => typeof route.path === "string" && route.path.startsWith("/apps/wow-webgpu-"));
  if (routes.length < 4) failures.push(`Expected at least four WebGPU routes, found ${routes.length}.`);
  for (const route of routes) {
    const path = String(route.path);
    const status = route.status;
    if (status !== "ready" && status !== "unsupported") {
      failures.push(`${path} reported ${String(status)} instead of ready or unsupported.`);
    }
    if (status === "ready" && Number(route.drawCalls ?? 0) <= 0) {
      failures.push(`${path} reported ready without draw calls.`);
    }
    if (Array.isArray(route.failures) && route.failures.length > 0) {
      failures.push(`${path} has route-health failures: ${route.failures.join("; ")}`);
    }
  }
  return report(routes, failures);
}

export function writeWebGPURouteHealthReport(reportValue = createWebGPURouteHealthReport()): void {
  mkdirSync(dirname(resolve(WEBGPU_ROUTE_HEALTH_REPORT)), { recursive: true });
  writeFileSync(resolve(WEBGPU_ROUTE_HEALTH_REPORT), `${JSON.stringify(reportValue, null, 2)}\n`);
}

function report(routes: readonly unknown[], failures: readonly string[]): WebGPURouteHealthReport {
  return {
    schema: "a3d-webgpu-route-health",
    generatedAt: new Date().toISOString(),
    pass: failures.length === 0,
    sourceReport: CURRENT_ROUTE_HEALTH_REPORT,
    routeCount: routes.length,
    routes,
    failures
  };
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const reportValue = createWebGPURouteHealthReport();
  writeWebGPURouteHealthReport(reportValue);
  if (!reportValue.pass) {
    throw new Error(`WebGPU route health failed:\n${reportValue.failures.join("\n")}`);
  }
  console.log(`WebGPU route health passed. Report: ${WEBGPU_ROUTE_HEALTH_REPORT}`);
}
