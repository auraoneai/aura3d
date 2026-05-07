import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, platform, release, totalmem } from "node:os";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { createRequire } from "node:module";
import { PhysicsWorld, Shape } from "../../packages/physics/src/index.js";

type EngineStatus = "measured" | "unavailable";

interface PhysicsComparisonEntry {
  readonly engine: string;
  readonly status: EngineStatus;
  readonly version?: string;
  readonly scene: string;
  readonly bodies: number;
  readonly steps: number;
  readonly elapsedMs?: number;
  readonly averageStepMs?: number;
  readonly contacts?: number;
  readonly broadphasePairs?: number;
  readonly solverIterations?: number;
  readonly reason?: string;
}

interface PackageAvailability {
  readonly engine: string;
  readonly packageName: string;
  readonly status: EngineStatus;
  readonly reason?: string;
}

const scene = "500 boxes against static ground, 120 fixed steps";
const bodies = 501;
const steps = 120;
const fixedDelta = 1 / 60;
const require = createRequire(import.meta.url);

async function main(): Promise<void> {
  const galileo = measureGalileoPhysics();
  const cannon = await measureCannonPhysics();
  const external = await detectExternalEngines(cannon);
  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    releaseRunId: process.env.G3D_RELEASE_RUN_ID ?? "standalone-physics-comparison-run",
    suite: "physics-comparison-baseline",
    environment: {
      node: process.version,
      platform: platform(),
      osRelease: release(),
      arch: process.arch,
      cpuModel: cpus()[0]?.model ?? "unknown",
      cpuCount: cpus().length,
      totalMemoryBytes: totalmem()
    },
    claim: "No physics-engine superiority claim is enabled by this report.",
    limitations: [
      "External physics packages are measured only when pinned dependencies are installed in this workspace.",
      "The Cannon comparison uses the same scene shape, body count, fixed step count, gravity, and solver iteration count as the Galileo3D baseline, but does not prove feature parity or broad engine superiority.",
      "A true public physics-engine claim still requires more scenes, raw repeated samples, memory data, browser runs, and independent review."
    ],
    engines: [
      galileo,
      ...(cannon ? [cannon] : []),
      ...external.filter((entry) => entry.engine !== "cannon").map((entry): PhysicsComparisonEntry => ({
        engine: entry.engine,
        status: entry.status,
        scene,
        bodies,
        steps,
        reason: entry.reason
      }))
    ],
    externalAvailability: external
  };

  const reportPath = resolve("tests/reports/physics-comparison-baseline.json");
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

function measureGalileoPhysics(): PhysicsComparisonEntry {
  const solverIterations = 6;
  const world = new PhysicsWorld({ gravity: [0, -9.81, 0], fixedDelta, solverIterations });
  const ground = world.createRigidBody({ type: "static", position: [0, 0, 0] });
  world.createCollider(ground, { shape: Shape.plane([0, 1, 0], 0) });
  for (let index = 0; index < 500; index += 1) {
    const body = world.createRigidBody({
      position: [(index % 20) * 0.1, 1 + Math.floor(index / 20) * 0.15, 0],
      restitution: 0.05,
      friction: 0.8
    });
    world.createCollider(body, { shape: Shape.box(0.05, 0.05, 0.05), material: { friction: 0.8 } });
  }

  const start = performance.now();
  for (let step = 0; step < steps; step += 1) {
    world.step();
  }
  const elapsedMs = performance.now() - start;
  const stats = world.snapshot().stats;

  return {
    engine: "galileo3d-built-in",
    status: "measured",
    version: "0.0.0-rebuild",
    scene,
    bodies: stats.bodies,
    steps: stats.steps,
    elapsedMs: round(elapsedMs),
    averageStepMs: round(elapsedMs / steps, 5),
    contacts: stats.contacts,
    broadphasePairs: stats.broadphasePairs,
    solverIterations
  };
}

async function measureCannonPhysics(): Promise<PhysicsComparisonEntry | null> {
  if (!(await packageAvailable("cannon-es"))) return null;
  const cannon = await import("cannon-es") as typeof import("cannon-es");
  const solverIterations = 6;
  const world = new cannon.World({
    gravity: new cannon.Vec3(0, -9.81, 0)
  });
  (world.solver as unknown as { iterations: number }).iterations = solverIterations;
  const ground = new cannon.Body({ mass: 0 });
  ground.addShape(new cannon.Plane());
  world.addBody(ground);

  for (let index = 0; index < 500; index += 1) {
    const body = new cannon.Body({
      mass: 1,
      position: new cannon.Vec3((index % 20) * 0.1, 1 + Math.floor(index / 20) * 0.15, 0),
      material: new cannon.Material({ friction: 0.8, restitution: 0.05 })
    });
    body.addShape(new cannon.Box(new cannon.Vec3(0.05, 0.05, 0.05)));
    world.addBody(body);
  }

  const start = performance.now();
  for (let step = 0; step < steps; step += 1) {
    world.step(fixedDelta);
  }
  const elapsedMs = performance.now() - start;

  return {
    engine: "cannon-es",
    status: "measured",
    version: readPackageVersion("cannon-es"),
    scene,
    bodies: world.bodies.length,
    steps,
    elapsedMs: round(elapsedMs),
    averageStepMs: round(elapsedMs / steps, 5),
    contacts: world.contacts.length,
    solverIterations
  };
}

async function detectExternalEngines(cannon: PhysicsComparisonEntry | null): Promise<readonly PackageAvailability[]> {
  const candidates = [
    { engine: "rapier", packageName: "@dimforge/rapier3d-compat" },
    { engine: "cannon", packageName: "cannon-es" },
    { engine: "ammo", packageName: "ammo.js" }
  ] as const;

  const results: PackageAvailability[] = [];
  for (const candidate of candidates) {
    if (candidate.engine === "cannon" && cannon) {
      results.push({
        engine: candidate.engine,
        packageName: candidate.packageName,
        status: "measured"
      });
      continue;
    }
    const available = await packageAvailable(candidate.packageName);
    results.push({
      engine: candidate.engine,
      packageName: candidate.packageName,
      status: available ? "measured" : "unavailable",
      ...(available ? {} : { reason: `${candidate.packageName} is not installed in this workspace.` })
    });
  }
  return results;
}

async function packageAvailable(packageName: string): Promise<boolean> {
  try {
    const dynamicImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<unknown>;
    await dynamicImport(packageName);
    return true;
  } catch {
    return false;
  }
}

function readPackageVersion(packageName: string): string {
  try {
    const path = require.resolve(`${packageName}/package.json`);
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { readonly version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : "unknown";
  } catch {
    return "unknown";
  }
}

function round(value: number, places = 3): number {
  return Number(value.toFixed(places));
}

await main();
